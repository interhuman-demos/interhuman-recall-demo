import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer } from "ws";
import NodeMediaServer from "node-media-server";
import { AnalyzeRequestSchema } from "@repo/shared";
import { getEnv } from "./env.js";
import { createJob, getJob, subscribeJob } from "./job-store.js";
import { runPipeline } from "./pipeline.js";
import { verifyToken, mintToken } from "./token.js";
import { LiveSession } from "./live-session.js";
import { createBot, removeBot } from "./recall-live.js";

const env = getEnv();

// ---------------------------------------------------------------------------
// Spotlight HTML page — served as the bot's camera tile via Output Media.
// Self-contained: polls GET /sessions/:id/focus on this same origin every
// second and renders the current focal speaker name in a branded 1280x720 view.
// ---------------------------------------------------------------------------

function buildSpotlightHtml(sessionId: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=1280">
<title>Interhuman Signals</title>
<link rel="preconnect" href="https://cdn.jsdelivr.net">
<style>
  @font-face{font-family:'Geist Variable';font-style:normal;font-display:swap;font-weight:100 900;src:url(https://cdn.jsdelivr.net/fontsource/fonts/geist:vf@latest/latin-wght-normal.woff2) format('woff2-variations')}
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:1280px;height:720px;overflow:hidden;background:#111;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;-webkit-font-smoothing:antialiased}
  #root{width:1280px;height:720px;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative}
  .content{display:flex;flex-direction:column;align-items:flex-start;gap:16px;position:relative;padding:0 80px;width:100%}
  .brand-row{display:flex;align-items:center;gap:14px}
  .dot-canvas{width:44px;height:44px;display:block}
  .analyzing-label{font-size:32px;font-weight:500;color:rgba(255,255,255,.55);letter-spacing:-.01em}
  .name{font-family:'Geist Variable',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:72px;font-weight:600;color:#fff;letter-spacing:-.02em;line-height:1.1;word-break:break-word;max-width:1100px;opacity:0;transform:translateY(10px);transition:opacity 250ms cubic-bezier(.165,.84,.44,1),transform 250ms cubic-bezier(.165,.84,.44,1)}
  .name.visible{opacity:1;transform:translateY(0)}
  .sub{font-size:36px;font-weight:500;color:rgba(255,255,255,.4);opacity:0;transform:translateY(8px);transition:opacity 200ms cubic-bezier(.165,.84,.44,1),transform 200ms cubic-bezier(.165,.84,.44,1)}
  .sub.visible{opacity:1;transform:translateY(0)}
  .idle-label{font-size:28px;font-weight:500;color:rgba(255,255,255,.25)}
</style>
</head>
<body>
<div id="root">
<div class="content">
    <div class="brand-row">
      <canvas id="dot-loader" class="dot-canvas" aria-hidden="true"></canvas>
      <span class="analyzing-label" id="label">Analyzing</span>
    </div>
    <div id="name-area"></div>
  </div>
</div>
<script>
(function(){
  var sid=${JSON.stringify(sessionId)};
  var nameArea=document.getElementById('name-area');
  var label=document.getElementById('label');
  var prevName='';

  // ── Dot Grid Loader (canvas) ──────────────────────────────────────────────
  (function initLoader(){
    var canvas=document.getElementById('dot-loader');
    var ctx=canvas.getContext('2d');
    var n=4,cell=10,dotScale=0.32,speed=8,snakeLen=4;
    var dpr=window.devicePixelRatio||1;
    var w=44,h=44;
    canvas.width=w*dpr;canvas.height=h*dpr;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    var maxR=cell*dotScale;
    var gridPx=(n-1)*cell;
    var ox=(w-gridPx)/2,oy=(h-gridPx)/2;

    var ring=[];
    for(var x=0;x<n-1;x++) ring.push([x,0]);
    for(var y=0;y<n-1;y++) ring.push([n-1,y]);
    for(var x2=n-1;x2>0;x2--) ring.push([x2,n-1]);
    for(var y2=n-1;y2>0;y2--) ring.push([0,y2]);
    var ringLen=ring.length;

    var head=snakeLen-1,lastStep=null;
    var stepMs=1000/speed;

    function paint(){
      ctx.clearRect(0,0,w,h);
      for(var r=0;r<n;r++)for(var c=0;c<n;c++){
        ctx.beginPath();ctx.arc(ox+c*cell,oy+r*cell,maxR*0.45,0,Math.PI*2);
        ctx.fillStyle='rgba(255,255,255,0.12)';ctx.fill();
      }
      for(var i=0;i<snakeLen;i++){
        var idx=((head-i)%ringLen+ringLen)%ringLen;
        var pos=ring[idx];
        var t=1-i/snakeLen;
        var alpha=0.25+0.75*t;
        var radius=maxR*(0.55+0.45*t);
        ctx.beginPath();ctx.arc(ox+pos[0]*cell,oy+pos[1]*cell,radius,0,Math.PI*2);
        ctx.fillStyle='rgba(255,255,255,'+alpha.toFixed(3)+')';ctx.fill();
      }
    }
    function loop(ts){
      if(lastStep===null)lastStep=ts;
      if(ts-lastStep>=stepMs){head=(head+1)%ringLen;lastStep=ts;}
      paint();requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  })();

  // ── State polling ─────────────────────────────────────────────────────────
  function render(data){
    var hasSelection=data&&!data.error&&data.selectedParticipantId!=null;
    var name=data&&data.focalSpeaker||'';
    var hasError=!data||data.error;

    if(hasSelection&&name){
      label.textContent='Analyzing';
      if(name!==prevName){
        nameArea.innerHTML='<div class="name">'+escHtml(name)+'</div>';
        var el=nameArea.querySelector('.name');
        void el.offsetWidth;
        el.classList.add('visible');
        prevName=name;
      }
    } else if(!hasError&&data){
      label.textContent='Waiting';
      if(prevName!=='__waiting'){
        nameArea.innerHTML='<div class="sub">Selecting focus\\u2026</div>';
        var s=nameArea.querySelector('.sub');
        void s.offsetWidth;
        s.classList.add('visible');
        prevName='__waiting';
      }
    } else {
      label.textContent='';
      nameArea.innerHTML='<span class="idle-label">Social Intelligence</span>';
      prevName='';
    }
  }
  function escHtml(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
  function poll(){
    fetch('/sessions/'+sid+'/focus',{cache:'no-store'})
      .then(function(r){return r.json()})
      .then(function(d){render(d)})
      .catch(function(){render(null)});
  }
  poll();setInterval(poll,1000);
})();
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Live sessions registry (real-time RTMP bridge)
// ---------------------------------------------------------------------------

const liveSessions = new Map<string, LiveSession>();

/**
 * Retain an ended session for a grace period before evicting it from memory.
 * During this window a panel that reconnects (e.g. the meeting ended and the
 * Meet iframe reloaded) can still open the events WebSocket and receive the
 * summary replay. After it elapses the session is dropped; the full report
 * lives on in the job-store and is openable at /report/<id>.
 */
const ENDED_SESSION_TTL_MS = 5 * 60 * 1000;
const cleanupTimers = new Map<string, NodeJS.Timeout>();

function scheduleSessionCleanup(sessionId: string): void {
  if (cleanupTimers.has(sessionId)) return;
  const timer = setTimeout(() => {
    liveSessions.delete(sessionId);
    cleanupTimers.delete(sessionId);
    console.log(`[live] Session ${sessionId}: evicted after grace period`);
  }, ENDED_SESSION_TTL_MS);
  timer.unref?.();
  cleanupTimers.set(sessionId, timer);
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(payload);
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { return {}; }
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://localhost`);

    // CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET,POST,DELETE",
      });
      res.end();
      return;
    }

    // -------------------------------------------------------------------------
    // Existing post-call endpoints (unchanged)
    // -------------------------------------------------------------------------

    if (req.method === "GET" && url.pathname === "/healthz") {
      return json(res, 200, { ok: true, liveSessions: liveSessions.size });
    }

    if (req.method === "POST" && url.pathname === "/v1/recall/analyze") {
      const body = (await readBody(req)) as Record<string, unknown>;
      const token = String(body.token ?? "");
      const verified = verifyToken(token, env.DEMO_STREAM_PROXY_TOKEN_SECRET);
      if (!verified.ok) {
        return json(res, 401, { error: `token: ${verified.reason}` });
      }

      const parsed = AnalyzeRequestSchema.safeParse(body);
      if (!parsed.success) {
        return json(res, 400, { error: parsed.error.flatten() });
      }
      const reqData = parsed.data;

      createJob(reqData.sessionId, {
        reportId: reqData.sessionId,
        source: reqData.fixtureId ? "fixture" : "recall",
        recallBotId: reqData.recallBotId ?? null,
        fixtureId: reqData.fixtureId ?? null,
        focalParticipantId: reqData.focalParticipantId ?? null,
      });

      void runPipeline(env, reqData);
      return json(res, 202, { sessionId: reqData.sessionId, status: "queued" });
    }

    const jobMatch = url.pathname.match(/^\/v1\/recall\/jobs\/([^/]+)$/);
    if (req.method === "GET" && jobMatch) {
      const job = getJob(decodeURIComponent(jobMatch[1]!));
      if (!job) return json(res, 404, { error: "not found" });
      return json(res, 200, job);
    }

    const streamMatch = url.pathname.match(/^\/v1\/recall\/jobs\/([^/]+)\/stream$/);
    if (req.method === "GET" && streamMatch) {
      const sessionId = decodeURIComponent(streamMatch[1]!);
      const job = getJob(sessionId);
      if (!job) return json(res, 404, { error: "not found" });

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);
      send(job);

      if (job.status === "done" || job.status === "failed") {
        res.end();
        return;
      }

      const ping = setInterval(() => res.write(": ping\n\n"), 15_000);
      const unsubscribe = subscribeJob(sessionId, (updated) => {
        send(updated);
        if (updated.status === "done" || updated.status === "failed") {
          unsubscribe();
          clearInterval(ping);
          res.end();
        }
      });
      req.on("close", () => { clearInterval(ping); unsubscribe(); });
      return;
    }

    // -------------------------------------------------------------------------
    // NEW: Real-time live session endpoints
    // -------------------------------------------------------------------------

    // POST /sessions/local — DEV ONLY: create a session WITHOUT a Recall bot.
    // Returns a localhost RTMP URL you can stream a sample clip into with your
    // own ffmpeg, to validate the segmenter → Inter-1 → side-panel pipeline
    // without needing a public tunnel or a real Meet call.
    if (req.method === "POST" && url.pathname === "/sessions/local") {
      const body = (await readBody(req)) as Record<string, unknown>;
      const sessionId = randomUUID();
      const session = new LiveSession(sessionId, "local://dev", env);
      if (typeof body.displayName === "string") {
        session.focalSpeaker = body.displayName.trim() || "Speaker";
      }
      liveSessions.set(sessionId, session);
      const rtmpUrl = `rtmp://127.0.0.1:${env.RTMP_PORT}/live/${sessionId}`;
      console.log(`[live] LOCAL session ${sessionId} — stream into ${rtmpUrl}`);
      return json(res, 201, { sessionId, rtmpUrl, mode: "local" });
    }

    // POST /sessions — create a live session and dispatch a Recall bot
    if (req.method === "POST" && url.pathname === "/sessions") {
      if (!env.PUBLIC_BASE_URL) {
        return json(res, 503, { error: "PUBLIC_BASE_URL is not set — live sessions require a public URL for Recall RTMP + webhooks" });
      }
      if (!env.RECALL_API_KEY) {
        return json(res, 503, { error: "RECALL_API_KEY is not configured" });
      }

      const body = (await readBody(req)) as Record<string, unknown>;
      const meetingUrl = typeof body.meetingUrl === "string" ? body.meetingUrl.trim() : "";
      if (!meetingUrl) return json(res, 400, { error: "meetingUrl is required" });

      const perSessionApiKey = typeof body.interhumanApiKey === "string" && body.interhumanApiKey.trim()
        ? body.interhumanApiKey.trim()
        : undefined;

      if (!perSessionApiKey && !env.INTERHUMAN_API_KEY) {
        return json(res, 400, { error: "Inter-1 API key is required. Pass interhumanApiKey in the request body." });
      }

      const sessionId = randomUUID();
      const session = new LiveSession(sessionId, meetingUrl, env, perSessionApiKey);
      if (typeof body.displayName === "string") {
        session.focalSpeaker = body.displayName.trim() || "Speaker";
      }
      liveSessions.set(sessionId, session);

      const rtmpBase = env.RTMP_PUBLIC_BASE ??
        `rtmp://${new URL(env.PUBLIC_BASE_URL).hostname}:${env.RTMP_PORT}`;
      const rtmpUrl = `${rtmpBase}/live/${sessionId}`;
      const webhookUrl = `${env.PUBLIC_BASE_URL}/sessions/${sessionId}/transcript`;
      // Recall connects TO us via WebSocket to stream per-participant video+audio.
      const publicHost = new URL(env.PUBLIC_BASE_URL).host;
      const mediaWsUrl = `wss://${publicHost}/sessions/${sessionId}/media`;

      session.status = "bot_joining";
      let botId: string;
      try {
        const bot = await createBot(env, { meetingUrl, rtmpUrl, webhookUrl, mediaWsUrl, sessionId });
        botId = bot.id;
        session.botId = botId;
        console.log(
          `[live] Session ${sessionId}: bot ${botId} joining ${meetingUrl} ` +
            `(focal="${session.focalSpeaker}", mediaWs=${mediaWsUrl})`,
        );
      } catch (err) {
        liveSessions.delete(sessionId);
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[live] createBot failed:", msg);
        return json(res, 502, { error: `Recall bot creation failed: ${msg}` });
      }

      // Build the shareable report link. Meet side-panel sessions are created
      // server-to-server, so the browser that later opens this link never got a
      // creator cookie from the web app. We attach a signed, session-scoped
      // token the web app verifies to grant access (and mint the cookie). TTL is
      // generous so the link stays openable well after the call ends.
      const reportUrl = env.WEB_APP_BASE_URL
        ? (() => {
            const base = env.WEB_APP_BASE_URL.replace(/\/$/, "");
            const token = mintToken(
              sessionId,
              env.DEMO_STREAM_PROXY_TOKEN_SECRET,
              60 * 60 * 24 * 30,
            );
            return `${base}/report/${sessionId}?t=${encodeURIComponent(token)}`;
          })()
        : null;
      return json(res, 201, { sessionId, botId, rtmpUrl, reportUrl });
    }

    // GET /sessions/:id/spotlight — self-contained HTML page served as the
    // bot's camera tile via Recall Output Media. Polls /sessions/:id/focus on
    // this same origin every second and renders who is being analyzed.
    const spotlightMatch = url.pathname.match(/^\/sessions\/([^/]+)\/spotlight$/);
    if (req.method === "GET" && spotlightMatch) {
      const sessionId = spotlightMatch[1]!;
      const session = liveSessions.get(sessionId);
      if (!session) { res.writeHead(404); res.end("Session not found"); return; }
      const html = buildSpotlightHtml(sessionId);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    // GET /sessions/:id/focus — lightweight endpoint for the bot spotlight page
    // to poll the current focal speaker name without a full WS connection.
    const focusMatch = url.pathname.match(/^\/sessions\/([^/]+)\/focus$/);
    if (req.method === "GET" && focusMatch) {
      const sessionId = focusMatch[1]!;
      const session = liveSessions.get(sessionId);
      if (!session) return json(res, 404, { error: "Session not found" });
      // Set permissive CORS so the bot's headless Chromium can fetch across origins.
      res.setHeader("Access-Control-Allow-Origin", "*");
      return json(res, 200, {
        sessionId,
        focalSpeaker: session.focalSpeaker,
        selectedParticipantId: session.selectedParticipantId,
      });
    }

    // GET /sessions/:id
    const sessionGetMatch = url.pathname.match(/^\/sessions\/([^/]+)$/);
    if (req.method === "GET" && sessionGetMatch) {
      const sessionId = sessionGetMatch[1]!;
      const session = liveSessions.get(sessionId);
      if (!session) return json(res, 404, { error: "Session not found" });
      return json(res, 200, { sessionId, status: session.status, botId: session.botId });
    }

    // DELETE /sessions/:id — end session (triggers summary)
    if (req.method === "DELETE" && sessionGetMatch) {
      const sessionId = sessionGetMatch[1]!;
      const session = liveSessions.get(sessionId);
      if (!session) return json(res, 404, { error: "Session not found" });
      await session.end();
      if (session.botId) {
        await removeBot(env, session.botId).catch((err: unknown) =>
          console.error("[live] removeBot error:", err),
        );
      }
      // Keep the ended session around briefly so a panel that reconnects after
      // the call (e.g. the iframe reloaded) can still pull the summary replay
      // from addPanelClient(). The job-store keeps the full report regardless.
      scheduleSessionCleanup(sessionId);
      return json(res, 200, { ok: true });
    }

    // POST /sessions/:id/transcript — Recall transcript.data webhook
    const transcriptMatch = url.pathname.match(/^\/sessions\/([^/]+)\/transcript$/);
    if (req.method === "POST" && transcriptMatch) {
      const sessionId = transcriptMatch[1]!;
      const session = liveSessions.get(sessionId);
      if (!session) { res.writeHead(404); res.end(); return; }

      const body = (await readBody(req)) as Record<string, unknown>;
      const outer = body.data as Record<string, unknown> | undefined;
      const inner = (outer?.data ?? outer) as Record<string, unknown> | undefined;
      const wordCount = Array.isArray(inner?.words) ? inner!.words.length : 0;
      console.log(
        `[live] transcript webhook for ${sessionId} (event=${String(body.event ?? "?")}, words=${wordCount})`,
      );
      handleTranscriptWebhook(session, body);
      res.writeHead(200); res.end();
      return;
    }

    return json(res, 404, { error: "not found" });
  } catch (err) {
    return json(res, 500, {
      error: err instanceof Error ? err.message : "internal error",
    });
  }
});

// ---------------------------------------------------------------------------
// WebSocket servers
// ---------------------------------------------------------------------------

const wss = new WebSocketServer({ noServer: true });

// Second WSS for inbound per-participant media from Recall.
const mediaWss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", "http://localhost");

  // /sessions/:id/events — side-panel clients (add-on → bridge)
  const eventsMatch = url.pathname.match(/^\/sessions\/([^/]+)\/events$/);
  if (eventsMatch) {
    const sessionId = eventsMatch[1]!;
    const session = liveSessions.get(sessionId);
    if (!session) { socket.destroy(); return; }

    wss.handleUpgrade(req, socket, head, (ws) => {
      session.addPanelClient(ws);
      console.log(`[live] Panel client connected: session ${sessionId}`);

      ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
          if (msg.type === "control") {
            if (msg.action === "pause") session.pause();
            else if (msg.action === "resume") session.resume();
            else if (msg.action === "select_participant") {
              const participantId = msg.participantId as number | string | undefined;
              const participantName = typeof msg.participantName === "string"
                ? msg.participantName
                : (session.getRosterName(participantId as number | string) ?? "Speaker");
              if (participantId !== undefined) {
                session.selectParticipant(participantId, participantName);
              }
            }
          }
        } catch { /* ignore malformed messages */ }
      });
    });
    return;
  }

  // /sessions/:id/media — Recall per-participant video+audio feed (Recall → bridge)
  const mediaMatch = url.pathname.match(/^\/sessions\/([^/]+)\/media$/);
  if (mediaMatch) {
    const sessionId = mediaMatch[1]!;
    const session = liveSessions.get(sessionId);
    if (!session) { socket.destroy(); return; }

    mediaWss.handleUpgrade(req, socket, head, (ws) => {
      console.log(`[live] Recall media WS connected: session ${sessionId}`);

      ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(
            Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw),
          ) as Record<string, unknown>;

          const event = String(msg.event ?? "");
          const data = msg.data as Record<string, unknown> | undefined;
          const inner = data?.data as Record<string, unknown> | undefined;
          if (!inner) return;

          const participant = inner.participant as
            | { id?: number | string; name?: string | null }
            | undefined;
          const participantId = participant?.id ?? null;
          const participantName = participant?.name ?? null;

          // Register every participant we see into the roster so the picker
          // can be populated even before a selection is made.
          if (participantId !== null && participantName !== null) {
            session.registerParticipant(participantId, participantName);
          }

          // Only forward frames for the selected participant.
          // selectedParticipantId is null until the user picks from the dropdown.
          if (
            session.selectedParticipantId === null ||
            participantId !== session.selectedParticipantId
          ) {
            return;
          }

          const bufferB64 = String(inner.buffer ?? "");
          if (!bufferB64) return;
          const buf = Buffer.from(bufferB64, "base64");

          if (event === "video_separate_h264.data") {
            session.pushVideo(buf, participantName);
          } else if (event === "audio_separate_raw.data") {
            session.pushAudio(buf);
          }
        } catch (err) {
          console.error(`[live] media WS parse error for ${sessionId}:`, err);
        }
      });

      ws.on("close", () => {
        console.log(`[live] Recall media WS closed: session ${sessionId}`);
      });
    });
    return;
  }

  socket.destroy();
});

// ---------------------------------------------------------------------------
// RTMP server: Recall streams to rtmp://<host>:RTMP_PORT/live/<sessionId>
// ---------------------------------------------------------------------------

const nms = new NodeMediaServer({
  logType: 1,
  rtmp: {
    port: env.RTMP_PORT,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60,
  },
});

// node-media-server v4 emits a single session object (not id/path/args).
// session.streamPath looks like "/live/<sessionId>"; streamName is the id.
interface NmsSession {
  streamPath?: string;
  streamApp?: string;
  streamName?: string;
}

function sessionIdFromNms(s: NmsSession): string | null {
  if (s.streamName) return s.streamName;
  if (s.streamPath) return s.streamPath.replace(/^\/live\//, "").replace(/^\//, "");
  return null;
}

/**
 * node-media-server v4 emits a single session object to publish events, but its
 * bundled type defs still declare the legacy `(id, StreamPath, args)` signature.
 * Register through this wrapper so callers get the real (single-arg) shape
 * without a per-call cast.
 */
function onNms(event: "postPublish" | "donePublish", handler: (s: NmsSession) => void): void {
  (nms.on as (e: string, cb: (...args: unknown[]) => void) => void)(
    event,
    (s: unknown) => handler(s as NmsSession),
  );
}

onNms("postPublish", (s: NmsSession) => {
  const sessionId = sessionIdFromNms(s);
  if (!sessionId) {
    console.error(`[rtmp] postPublish with no stream path`, s);
    return;
  }
  const session = liveSessions.get(sessionId);
  if (!session) {
    console.error(`[rtmp] Unknown session for stream ${s.streamPath ?? sessionId}`);
    return;
  }
  const rtmpInputUrl = `rtmp://127.0.0.1:${env.RTMP_PORT}/live/${sessionId}`;
  console.log(`[rtmp] Session ${sessionId}: RTMP stream started`);
  void session.startStreaming(rtmpInputUrl);
});

onNms("donePublish", (s: NmsSession) => {
  const sessionId = sessionIdFromNms(s);
  if (!sessionId) return;
  const session = liveSessions.get(sessionId);
  if (session) {
    console.log(`[rtmp] Session ${sessionId}: RTMP stream ended`);
    void session.end();
    // Retain briefly so a reconnecting panel can still fetch the summary.
    scheduleSessionCleanup(sessionId);
  }
});

// ---------------------------------------------------------------------------
// Transcript webhook handler
// ---------------------------------------------------------------------------

/**
 * Parse a Recall transcript.data webhook and push the utterance into the session.
 *
 * Recall v1.11 streaming shape (real-time transcription via webhook):
 *   {
 *     event: "transcript.data",
 *     data: {
 *       data: {
 *         words: [{ text, start_timestamp: { relative }, end_timestamp: { relative } | null }],
 *         participant: { id, name, ... }
 *       }
 *     }
 *   }
 *
 * Each event is a single finalized utterance from one participant, so we join
 * its words into one transcript line rather than re-grouping by speaker.
 */
function handleTranscriptWebhook(
  session: LiveSession,
  body: Record<string, unknown>,
): void {
  try {
    // The transcript payload is double-nested: body.data.data.
    const outer = body.data as Record<string, unknown> | undefined;
    const data = (outer?.data ?? outer) as Record<string, unknown> | undefined;
    if (!data) return;

    const words = data.words as
      | Array<{
          text?: string;
          start_timestamp?: { relative?: number } | null;
          end_timestamp?: { relative?: number } | null;
        }>
      | undefined;
    if (!Array.isArray(words) || words.length === 0) return;

    const participant = data.participant as { name?: string | null } | undefined;
    const speaker = participant?.name?.trim() || "Speaker";

    const text = words
      .map((w) => w.text?.trim())
      .filter((t): t is string => !!t)
      .join(" ")
      .trim();
    if (!text) return;

    const startS = words[0]?.start_timestamp?.relative ?? 0;
    const lastEnd = words[words.length - 1]?.end_timestamp?.relative;
    const endS = lastEnd ?? words[words.length - 1]?.start_timestamp?.relative ?? startS;

    session.addTranscriptLine(speaker, text, startS, endS);
  } catch (err) {
    console.error("[live] transcript webhook parse error:", err);
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

server.listen(env.PORT, () => {
  console.log(`stream-proxy listening on :${env.PORT}`);
  if (env.PUBLIC_BASE_URL) {
    console.log(`[live] RTMP ingest on port ${env.RTMP_PORT}  (live sessions enabled)`);
  }
});

nms.run();
