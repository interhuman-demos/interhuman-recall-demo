import { EventEmitter } from "node:events";
import WebSocket from "ws";
import {
  type InterhumanEvent,
  type StreamConfig,
  parseInterhumanEvent,
} from "@repo/shared";
import { type Env, interhumanWsUrl } from "./env.js";

/**
 * Thin wrapper over the upstream Interhuman streaming WebSocket. Opens the
 * connection with the server-side API key, sends session config, exposes
 * `sendSegment` for binary frames, and emits parsed event envelopes.
 */
/** Reconnect tuning for unexpected socket closes (e.g. code 1006). */
const RECONNECT_BASE_DELAY_MS = 500;
const RECONNECT_MAX_DELAY_MS = 8_000;
const RECONNECT_MAX_ATTEMPTS = 8;

export class InterhumanClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private readonly env: Env;

  /** Config from the initial connect(), re-sent on every reconnect. */
  private config?: StreamConfig;
  /** Set when we deliberately close (end of session) so we don't reconnect. */
  private intentionalClose = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(env: Env) {
    super();
    this.env = env;
  }

  connect(config?: StreamConfig): Promise<void> {
    this.config = config;
    this.intentionalClose = false;
    if (!this.env.INTERHUMAN_API_KEY) {
      return Promise.reject(new Error("INTERHUMAN_API_KEY is not configured"));
    }
    // Only the initial connect rejects on error; reconnects are best-effort and
    // surface via the "error"/"reconnect_failed" events instead.
    return this.openSocket(true);
  }

  private openSocket(isInitial: boolean): Promise<void> {
    const url = interhumanWsUrl(this.env);
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url, {
        headers: { Authorization: `Bearer ${this.env.INTERHUMAN_API_KEY}` },
        perMessageDeflate: false,
      });
      this.ws = ws;
      let settled = false;

      ws.on("open", () => {
        if (this.config) ws.send(JSON.stringify(this.config));
        this.reconnectAttempts = 0;
        if (!isInitial) this.emit("reconnected");
        if (!settled) {
          settled = true;
          resolve();
        }
      });

      ws.on("message", (data) => {
        let raw: unknown;
        try {
          raw = JSON.parse(data.toString());
        } catch {
          return;
        }
        const event = parseInterhumanEvent(raw);
        if (event) this.emit("event", event satisfies InterhumanEvent);
        else this.emit("unknown", raw);
      });

      ws.on("error", (err) => {
        this.emit("error", err);
        if (!settled) {
          settled = true;
          reject(err);
        }
      });

      ws.on("close", (code, reason) => {
        // Deliberate close (session end) → surface once, no reconnect.
        if (this.intentionalClose) {
          this.emit("close", code, reason.toString());
          return;
        }
        this.emit("disconnected", code, reason.toString());
        this.scheduleReconnect(code, reason.toString());
      });
    });
  }

  private scheduleReconnect(code: number, reason: string): void {
    if (this.reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) {
      // Give up: emit the terminal "close" so the session logs it as fatal.
      this.emit("reconnect_failed", this.reconnectAttempts);
      this.emit("close", code, reason);
      return;
    }
    const attempt = ++this.reconnectAttempts;
    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * 2 ** (attempt - 1),
      RECONNECT_MAX_DELAY_MS,
    );
    this.emit("reconnecting", attempt, delay, code);
    this.reconnectTimer = setTimeout(() => {
      if (this.intentionalClose) return;
      this.openSocket(false).catch(() => {
        // openSocket already emitted "error"; the close handler will retry.
      });
    }, delay);
  }

  sendSegment(bytes: Buffer): boolean {
    // During a brief reconnect window the socket may not be open. Rather than
    // throwing (which previously killed the pipeline on the first drop), we
    // skip this segment and return false so the caller can account for it.
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    this.ws.send(bytes);
    return true;
  }

  close(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  on(event: "event", listener: (e: InterhumanEvent) => void): this;
  on(event: "unknown", listener: (raw: unknown) => void): this;
  on(event: "error", listener: (err: Error) => void): this;
  on(event: "close", listener: (code: number, reason: string) => void): this;
  on(event: "disconnected", listener: (code: number, reason: string) => void): this;
  on(event: "reconnecting", listener: (attempt: number, delayMs: number, code: number) => void): this;
  on(event: "reconnected", listener: () => void): this;
  on(event: "reconnect_failed", listener: (attempts: number) => void): this;
  on(event: string, listener: (...args: never[]) => void): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }
}
