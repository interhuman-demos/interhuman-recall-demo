import { EventEmitter } from "node:events";
import type WebSocket from "ws";
import type { InterhumanEvent, JobResult, Participant, PartialSummary, TranscriptSegment } from "@repo/shared";
import { InterhumanClient } from "./interhuman-client.js";
import { startLiveSegmenter, type LiveSegmenter } from "./segmenter-live.js";
import { startParticipantSegmenter, type ParticipantSegmenter } from "./segmenter-participant.js";
import { reconcileEvents } from "./reconcile.js";
import { generateSummary } from "./summarize.js";
import { createJob, mergeResult, setResult, setStatus } from "./job-store.js";
import type { Env } from "./env.js";

/**
 * Scan an H264 Annex-B buffer for the NAL unit types it contains. Recall's
 * `video_separate_h264` feed is Annex-B (start-code prefixed: 0x000001 or
 * 0x00000001). We only need to know whether a buffer carries the parameter
 * sets + an IDR slice, so we walk start codes and read each NAL header byte.
 *
 * Returns whether this buffer contains an SPS (type 7), a PPS (type 8), and an
 * IDR slice (type 5). ffmpeg's raw-h264 demuxer can only initialise its
 * decoder once it has seen SPS+PPS, and can only produce a first frame from an
 * IDR — so forwarding must begin on a buffer (or run of buffers) that provides
 * all three, otherwise every subsequent P-frame errors with
 * "non-existing PPS 0 referenced" / "no frame!".
 */
function scanH264Nals(buf: Buffer): { hasSps: boolean; hasPps: boolean; hasIdr: boolean } {
  let hasSps = false;
  let hasPps = false;
  let hasIdr = false;

  const len = buf.length;
  let i = 0;
  // Walk to each start code, then read the following NAL header byte.
  while (i + 3 < len) {
    // Match 0x000001 (3-byte) or 0x00000001 (4-byte) start codes.
    if (buf[i] === 0x00 && buf[i + 1] === 0x00 && buf[i + 2] === 0x01) {
      const nalByte = buf[i + 3];
      if (nalByte !== undefined) {
        const nalType = nalByte & 0x1f;
        if (nalType === 7) hasSps = true;
        else if (nalType === 8) hasPps = true;
        else if (nalType === 5) hasIdr = true;
      }
      i += 3;
    } else {
      i += 1;
    }
  }

  return { hasSps, hasPps, hasIdr };
}

export type LiveSessionStatus =
  | "created"
  | "bot_joining"
  | "streaming"
  | "ending"
  | "done"
  | "failed";

/**
 * Bridge message envelope sent over the per-session WebSocket to the Meet
 * add-on side panel. Kept as a plain union so the client side doesn't need to
 * import @repo/shared.
 */
export type BridgeMessage =
  | { type: "signal"; data: Record<string, unknown> }
  | { type: "engagement"; data: Record<string, unknown> }
  | { type: "conversation_quality"; data: Record<string, unknown> }
  | { type: "transcript"; text: string; speaker: string; startS: number; endS: number; windowIndex: number }
  | { type: "bot_status"; status: "joining" | "in_waiting_room" | "in_call" | "left" }
  | { type: "stream_status"; paused: boolean }
  | { type: "roster"; participants: { id: number | string; name: string }[] }
  | { type: "summary"; summary: unknown }
  | { type: "session_ended" }
  | { type: "error"; message: string };

/**
 * Manages the full lifecycle of one real-time bridge session.
 *
 * Primary path (per-participant):
 *   Recall WS media → pushVideo/pushAudio → ffmpeg mux → WebM segments → Inter-1
 *
 * Fallback path (mixed RTMP, used if focal participant stream not found in time):
 *   Recall RTMP stream → ffmpeg WebM segments → Inter-1
 *
 * Both paths share the InterhumanClient, reconcileEvents, and generateSummary.
 */
export class LiveSession extends EventEmitter {
  readonly id: string;
  readonly meetingUrl: string;
  private readonly env: Env;

  status: LiveSessionStatus = "created";
  botId: string | null = null;
  focalSpeaker = "Speaker";
  createdAt = Date.now();
  durationS = 0;

  private interhuman: InterhumanClient;

  // Per-participant muxer (primary path).
  private participantSegmenter: ParticipantSegmenter | null = null;
  // Whether the participant path is active (vs. RTMP fallback).
  private usingParticipantPath = false;
  // Keyframe gate: once a participant is selected, we drop video buffers until
  // we've seen SPS+PPS (parameter sets) and an IDR keyframe, so ffmpeg's raw
  // H264 demuxer can initialise its decoder. Without this, selecting mid-GOP
  // feeds ffmpeg a P-frame first → "non-existing PPS 0 referenced" / "no frame!"
  // and zero decoded output. Reset whenever the selection changes.
  private videoKeyframeSeen = false;
  // Whether the RTMP fallback has already been activated.
  private rtmpFallbackActive = false;
  // Retained RTMP URL for a potential manual fallback (picker flow no longer
  // auto-falls-back on a timer).
  private rtmpUrl: string | null = null;

  // Mixed RTMP segmenter (fallback path).
  private segmenter: LiveSegmenter | null = null;

  private panelClients = new Set<WebSocket>();

  // Roster: participants seen in media frames. Keyed by participant id.
  private roster = new Map<number | string, string>();
  // The id of the participant selected for analysis. null = not yet chosen.
  selectedParticipantId: number | string | null = null;

  /** Read-only roster snapshot for external consumers (e.g. panel WS handler). */
  getRosterName(id: number | string): string | undefined {
    return this.roster.get(id);
  }

  /**
   * When true, the segmenter's onSegment callback skips forwarding to Inter-1
   * and freezes the duration counters. The ffmpeg segmenter, RTMP stream, and
   * Inter-1 socket all stay up so resume is instant with no reconnect cost.
   */
  private paused = false;

  /** Accumulated for end-of-call reconcile + summary. */
  private collectedEvents: InterhumanEvent[] = [];
  private transcript: TranscriptSegment[] = [];
  private transcriptIndex = 0;
  private segmentOffsetS = 0;

  /**
   * Diagnostics for the "signals stop after ~2 min while CQI keeps moving" bug.
   */
  private diag = {
    connectedAt: 0,
    segmentsSent: 0,
    eventCounts: { signal: 0, engagement: 0, cqi: 0, other: 0 },
    lastSignalAt: 0,
    lastCqiAt: 0,
    socketClosed: false,
  };
  private signalWatchdog: ReturnType<typeof setInterval> | null = null;

  /**
   * The final summary message, kept so a panel client that connects (or
   * reconnects) after the session ended still receives it.
   */
  private lastSummary: BridgeMessage | null = null;

  constructor(id: string, meetingUrl: string, env: Env, interhumanApiKey?: string) {
    super();
    this.id = id;
    this.meetingUrl = meetingUrl;
    this.env = env;
    const effectiveEnv = interhumanApiKey
      ? { ...env, INTERHUMAN_API_KEY: interhumanApiKey }
      : env;
    this.interhuman = new InterhumanClient(effectiveEnv);

    createJob(id, {
      reportId: id,
      meetingUrl: meetingUrl === "local://dev" ? null : meetingUrl,
      source: "recall",
    });
  }

  // --------------------------------------------------------------------------
  // Side-panel client management
  // --------------------------------------------------------------------------

  addPanelClient(ws: WebSocket): void {
    this.panelClients.add(ws);
    console.log(`[live-session:${this.id}] panel client connected (total ${this.panelClients.size})`);
    ws.on("close", () => this.panelClients.delete(ws));

    if (this.lastSummary) {
      try { ws.send(JSON.stringify(this.lastSummary)); } catch { /* closed */ }
    }
    // Replay current roster so late-connecting panels get the picker populated.
    if (this.roster.size > 0) {
      const rosterMsg: BridgeMessage = {
        type: "roster",
        participants: [...this.roster.entries()].map(([id, name]) => ({ id, name })),
      };
      try { ws.send(JSON.stringify(rosterMsg)); } catch { /* closed */ }
    }
    if (this.status === "done") {
      try { ws.send(JSON.stringify({ type: "session_ended" } satisfies BridgeMessage)); } catch { /* closed */ }
    } else if (this.status === "streaming") {
      try { ws.send(JSON.stringify({ type: "bot_status", status: "in_call" } satisfies BridgeMessage)); } catch { /* closed */ }
      try { ws.send(JSON.stringify({ type: "stream_status", paused: this.paused } satisfies BridgeMessage)); } catch { /* closed */ }
      for (const seg of this.transcript) {
        const windowIndex = Math.floor(seg.startS / 5);
        try {
          ws.send(JSON.stringify({
            type: "transcript",
            text: seg.text,
            speaker: seg.speaker,
            startS: seg.startS,
            endS: seg.endS,
            windowIndex,
          } satisfies BridgeMessage));
        } catch { /* closed */ }
      }
    }
  }

  private broadcast(msg: BridgeMessage): void {
    const data = JSON.stringify(msg);
    if (msg.type === "signal" || msg.type === "engagement") {
      console.log(`[live-session:${this.id}] broadcast ${msg.type} → ${this.panelClients.size} client(s)`);
    } else if (msg.type === "bot_status") {
      console.log(`[live-session:${this.id}] broadcast bot_status=${msg.status} → ${this.panelClients.size} client(s)`);
    } else if (msg.type === "stream_status") {
      console.log(`[live-session:${this.id}] broadcast stream_status paused=${msg.paused} → ${this.panelClients.size} client(s)`);
    }
    for (const client of this.panelClients) {
      try { client.send(data); } catch { /* already closed */ }
    }
  }

  // --------------------------------------------------------------------------
  // Pause / resume Inter-1 analysis
  // --------------------------------------------------------------------------

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    console.log(`[live-session:${this.id}] Inter-1 stream paused`);
    this.broadcast({ type: "stream_status", paused: true });
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    console.log(`[live-session:${this.id}] Inter-1 stream resumed`);
    this.broadcast({ type: "stream_status", paused: false });
  }

  // --------------------------------------------------------------------------
  // Per-participant media push (primary path)
  // --------------------------------------------------------------------------

  /**
   * Register a participant seen in an incoming media frame into the roster.
   * Broadcasts a `roster` update if the participant is new. Called by the
   * media WS handler for every frame, regardless of selection.
   */
  registerParticipant(id: number | string, name: string): void {
    if (this.roster.has(id)) return;
    this.roster.set(id, name);
    console.log(
      `[live-session:${this.id}] roster update: added "${name}" (id=${String(id)}, ` +
        `total=${this.roster.size})`,
    );
    this.broadcast({
      type: "roster",
      participants: [...this.roster.entries()].map(([rid, rname]) => ({ id: rid, name: rname })),
    });
  }

  /**
   * Lock analysis onto a chosen participant. Idempotent once set.
   * Called by the panel WS control handler when the user picks from the dropdown.
   */
  selectParticipant(id: number | string, name: string): void {
    if (this.selectedParticipantId === id) return;
    this.selectedParticipantId = id;
    this.focalSpeaker = name;
    // Re-arm the keyframe gate so we wait for the newly-selected participant's
    // next IDR before forwarding (their GOP is independent of the previous
    // selection's).
    this.videoKeyframeSeen = false;
    console.log(
      `[live-session:${this.id}] participant selected: "${name}" (id=${String(id)})`,
    );
  }

  /**
   * Push a raw H264 Annex-B buffer from the focal participant's video stream.
   * Called by the /sessions/:id/media WebSocket receiver in index.ts once the
   * participant has been matched.
   */
  pushVideo(buf: Buffer, participantName: string | null): void {
    if (this.paused || this.rtmpFallbackActive) return;
    // Gate: only forward if a participant has been selected.
    if (this.selectedParticipantId === null) return;

    // Keyframe gate: until we've seen a buffer carrying SPS+PPS+IDR, drop
    // everything. Selecting a participant mid-GOP would otherwise feed ffmpeg
    // a P-frame first and it can never initialise the decoder.
    if (!this.videoKeyframeSeen) {
      const { hasSps, hasPps, hasIdr } = scanH264Nals(buf);
      if (!(hasSps && hasPps && hasIdr)) {
        return;
      }
      this.videoKeyframeSeen = true;
      this.usingParticipantPath = true;
      console.log(
        `[live-session:${this.id}] participant path ACTIVE — first keyframe ` +
          `(SPS+PPS+IDR) received (participant="${participantName ?? "?"}")`,
      );
    }

    this.participantSegmenter?.pushVideo(buf);
  }

  /**
   * Push a raw 16 kHz mono S16LE PCM buffer from the focal participant's audio
   * stream. Called alongside pushVideo from the same media WebSocket receiver.
   */
  pushAudio(buf: Buffer): void {
    if (this.paused || this.rtmpFallbackActive) return;
    // Gate: only forward if a participant has been selected.
    if (this.selectedParticipantId === null) return;
    this.participantSegmenter?.pushAudio(buf);
  }

  // --------------------------------------------------------------------------
  // Start streaming
  // --------------------------------------------------------------------------

  /**
   * Called when the Recall RTMP stream begins (postPublish event).
   * Initialises Inter-1, starts the participant muxer (primary), and arms the
   * fallback timer. If no participant frame arrives before the timer fires, the
   * session falls back to the mixed RTMP path.
   */
  async startStreaming(rtmpUrl: string): Promise<void> {
    if (this.status !== "bot_joining" && this.status !== "created") return;
    this.status = "streaming";
    setStatus(this.id, "analyzing");

    this.broadcast({ type: "bot_status", status: "in_call" });

    this.wireInterhumanEvents();

    try {
      await this.interhuman.connect({ include: ["conversation_quality_overall"] });
      this.diag.connectedAt = Date.now();
      console.log(`[live-session:${this.id}] Inter-1 connected`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.status = "failed";
      this.broadcast({ type: "error", message: `Inter-1 connect failed: ${msg}` });
      return;
    }

    this.startSignalWatchdog();

    // Start the participant muxer (primary path).
    try {
      this.participantSegmenter = await startParticipantSegmenter(
        (seg) => this.handleSegment(seg.bytes),
        (err) => {
          if (this.status === "streaming") {
            console.error(`[live-session:${this.id}] participant segmenter error:`, err.message);
            this.broadcast({ type: "error", message: `Segmenter: ${err.message}` });
          }
        },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.status = "failed";
      this.broadcast({ type: "error", message: `Participant segmenter start failed: ${msg}` });
      return;
    }

    // Picker flow: analysis is gated on an explicit participant selection.
    // We deliberately do NOT arm an auto-fallback timer here — a human needs
    // time to read the roster and pick, and once the mixed-RTMP fallback
    // activates a later selection can't take over. So we wait indefinitely
    // for `selectParticipant`; frames only start flowing once the user picks.
    // `rtmpUrl` is retained for a potential manual fallback path.
    this.rtmpUrl = rtmpUrl;
  }

  /**
   * Activate the mixed RTMP fallback path. No longer wired to an automatic
   * timer under the picker flow — retained for manual invocation only (e.g. a
   * future "analyze everyone" control). No-op if no RTMP URL was captured or
   * the participant path is already active.
   */
  private activateRtmpFallback(): void {
    if (this.rtmpFallbackActive || this.usingParticipantPath) return;
    const rtmpUrl = this.rtmpUrl;
    if (!rtmpUrl) return;
    this.rtmpFallbackActive = true;
    console.warn(
      `[live-session:${this.id}] Activating mixed RTMP fallback ` +
        `(selectedId=${String(this.selectedParticipantId)}).`,
    );

    startLiveSegmenter(
      rtmpUrl,
      (seg) => this.handleSegment(seg.bytes),
      (err) => {
        if (this.status === "streaming") {
          console.error(`[live-session:${this.id}] RTMP segmenter error:`, err.message);
          this.broadcast({ type: "error", message: `Segmenter: ${err.message}` });
        }
      },
    )
      .then((s) => {
        this.segmenter = s;
        console.log(`[live-session:${this.id}] RTMP fallback segmenter started`);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.status = "failed";
        this.broadcast({ type: "error", message: `RTMP segmenter start failed: ${msg}` });
      });
  }

  /** Common segment handler for both paths. */
  private handleSegment(bytes: Buffer): void {
    if (this.paused) return;
    this.segmentOffsetS += 5;
    this.durationS = this.segmentOffsetS;
    const sent = this.interhuman.sendSegment(bytes);
    if (sent) {
      this.diag.segmentsSent += 1;
    } else {
      console.warn(
        `[live-session:${this.id}] segment #${this.segmentOffsetS / 5} skipped ` +
          `(Inter-1 socket not open, socketClosed=${this.diag.socketClosed})`,
      );
    }
  }

  // --------------------------------------------------------------------------
  // Inter-1 event wiring
  // --------------------------------------------------------------------------

  private wireInterhumanEvents(): void {
    this.interhuman.on("event", (event: InterhumanEvent) => {
      this.collectedEvents.push(event);
      const nowS = ((Date.now() - (this.diag.connectedAt || Date.now())) / 1000).toFixed(1);
      console.log(`[live-session:${this.id}] Inter-1 event: ${event.type} (t+${nowS}s)`);
      if (event.type === "signal.detected") {
        this.diag.eventCounts.signal += 1;
        this.diag.lastSignalAt = Date.now();
        const data = event.data as Record<string, unknown>;
        const signals = Array.isArray(data.signals)
          ? (data.signals as Record<string, unknown>[])
          : [data];
        for (const sig of signals) {
          this.broadcast({ type: "signal", data: sig });
        }
      } else if (event.type === "engagement.updated") {
        this.diag.eventCounts.engagement += 1;
        this.broadcast({ type: "engagement", data: event.data as Record<string, unknown> });
      } else if (event.type === "conversation_quality.updated") {
        this.diag.eventCounts.cqi += 1;
        this.diag.lastCqiAt = Date.now();
        this.broadcast({ type: "conversation_quality", data: event.data as Record<string, unknown> });
      } else {
        this.diag.eventCounts.other += 1;
      }
    });

    this.interhuman.on("unknown", (raw: unknown) => {
      console.log(`[live-session:${this.id}] Inter-1 UNKNOWN message:`, JSON.stringify(raw).slice(0, 300));
    });

    this.interhuman.on("disconnected", (code: number, reason: string) => {
      this.diag.socketClosed = true;
      const upS = this.diag.connectedAt
        ? ((Date.now() - this.diag.connectedAt) / 1000).toFixed(1)
        : "?";
      console.warn(
        `[live-session:${this.id}] Inter-1 disconnected code=${code} reason="${reason}" ` +
          `after ${upS}s | segmentsSent=${this.diag.segmentsSent} — attempting reconnect...`,
      );
    });

    this.interhuman.on("reconnecting", (attempt: number, delayMs: number, code: number) => {
      console.warn(
        `[live-session:${this.id}] Inter-1 reconnect attempt ${attempt} in ${delayMs}ms (last close code=${code})`,
      );
    });

    this.interhuman.on("reconnected", () => {
      this.diag.socketClosed = false;
      console.log(`[live-session:${this.id}] *** Inter-1 RECONNECTED *** — segments resuming`);
    });

    this.interhuman.on("reconnect_failed", (attempts: number) => {
      console.error(
        `[live-session:${this.id}] Inter-1 reconnect gave up after ${attempts} attempts — analysis stopped for the rest of the session.`,
      );
      this.broadcast({ type: "error", message: "Signal analysis connection lost" });
    });

    this.interhuman.on("close", (code: number, reason: string) => {
      this.diag.socketClosed = true;
      const upS = this.diag.connectedAt
        ? ((Date.now() - this.diag.connectedAt) / 1000).toFixed(1)
        : "?";
      console.log(
        `[live-session:${this.id}] *** Inter-1 SOCKET CLOSED (final) *** code=${code} reason="${reason}" ` +
          `after ${upS}s | segmentsSent=${this.diag.segmentsSent} | ` +
          `events signal=${this.diag.eventCounts.signal} engagement=${this.diag.eventCounts.engagement} ` +
          `cqi=${this.diag.eventCounts.cqi} other=${this.diag.eventCounts.other}`,
      );
    });

    this.interhuman.on("error", (err: Error) => {
      console.error(`[live-session:${this.id}] Inter-1 error:`, err.message);
      this.broadcast({ type: "error", message: `Inter-1: ${err.message}` });
    });
  }

  private startSignalWatchdog(): void {
    const SIGNAL_IDLE_WARN_MS = 30_000;
    this.signalWatchdog = setInterval(() => {
      if (this.paused || this.diag.socketClosed) return;
      const now = Date.now();
      if (this.diag.eventCounts.signal === 0) return;
      const sinceSignal = now - this.diag.lastSignalAt;
      if (sinceSignal < SIGNAL_IDLE_WARN_MS) return;
      const sinceCqi = this.diag.lastCqiAt ? now - this.diag.lastCqiAt : Infinity;
      const cqiAlive = sinceCqi < SIGNAL_IDLE_WARN_MS;
      const upS = ((now - this.diag.connectedAt) / 1000).toFixed(1);
      console.warn(
        `[live-session:${this.id}] SIGNALS IDLE for ${(sinceSignal / 1000).toFixed(0)}s at t+${upS}s ` +
          `(socket ${this.diag.socketClosed ? "CLOSED" : "OPEN"}, CQI ${cqiAlive ? "ALIVE" : "also idle"}, ` +
          `segmentsSent=${this.diag.segmentsSent}, cqiEvents=${this.diag.eventCounts.cqi}). ` +
          (cqiAlive
            ? "→ Socket healthy + segments flowing: Inter-1 is not emitting signals."
            : "→ Both signals and CQI idle: check for a socket close above or a stalled segmenter."),
      );
    }, 10_000);
  }

  // --------------------------------------------------------------------------
  // Transcript (pushed from the Recall webhook handler in index.ts)
  // --------------------------------------------------------------------------

  addTranscriptLine(speaker: string, text: string, startS: number, endS: number): void {
    const windowIndex = Math.floor(startS / 5);
    this.transcript.push({ index: this.transcriptIndex++, speaker, text, startS, endS });
    this.broadcast({ type: "transcript", text, speaker, startS, endS, windowIndex });
    mergeResult(this.id, {
      sessionId: this.id,
      focalSpeaker: this.focalSpeaker,
      transcript: [...this.transcript],
      participants: this.deriveParticipants(),
    });
  }

  private deriveParticipants(): Participant[] {
    const byName = new Map<string, number>();
    for (const seg of this.transcript) {
      const dur = Math.max(0, seg.endS - seg.startS);
      byName.set(seg.speaker, (byName.get(seg.speaker) ?? 0) + dur);
    }
    return [...byName.entries()].map(([name, talkTimeS]) => ({
      id: name,
      name,
      talkTimeS,
    }));
  }

  // --------------------------------------------------------------------------
  // End session
  // --------------------------------------------------------------------------

  async end(): Promise<void> {
    if (this.status === "done" || this.status === "ending") return;
    this.status = "ending";

    if (this.signalWatchdog) {
      clearInterval(this.signalWatchdog);
      this.signalWatchdog = null;
    }

    // Stop whichever segmenter is active. stop() flushes the final segment.
    await this.participantSegmenter?.stop().catch(() => undefined);
    await this.segmenter?.stop().catch(() => undefined);
    this.interhuman.close();

    // When the participant path was used, the analyzed video was isolated to
    // the focal speaker — pass isolatedSubject=true so reconcile pins signals
    // only to that speaker's transcript lines rather than by time alone.
    const isolatedSubject = this.usingParticipantPath && !this.rtmpFallbackActive;

    try {
      const { signals, engagement, conversationQuality } = reconcileEvents(
        this.collectedEvents,
        this.transcript,
        this.focalSpeaker,
        isolatedSubject,
      );

      mergeResult(this.id, {
        sessionId: this.id,
        durationS: this.durationS,
        focalSpeaker: this.focalSpeaker,
        participants: this.deriveParticipants(),
        transcript: this.transcript,
        signals,
        engagement,
        conversationQuality,
      });
      setStatus(this.id, "summarizing");

      const summary = await generateSummary(
        this.env,
        {
          focalSpeaker: this.focalSpeaker,
          durationS: this.durationS,
          transcript: this.transcript,
          signals,
          engagement,
          conversationQuality,
        },
        (partial: PartialSummary) => {
          mergeResult(this.id, { sessionId: this.id, summary: partial });
        },
      );
      this.lastSummary = { type: "summary", summary };
      this.broadcast(this.lastSummary);

      const result: JobResult = {
        sessionId: this.id,
        durationS: this.durationS,
        focalSpeaker: this.focalSpeaker,
        participants: this.deriveParticipants(),
        transcript: this.transcript,
        signals,
        engagement,
        conversationQuality,
        summary,
      };
      setResult(this.id, result);
    } catch (err) {
      console.error(`[live-session:${this.id}] Summary generation failed:`, err);
    }

    this.broadcast({ type: "session_ended" });
    this.status = "done";
    this.emit("done", this.id);
  }
}
