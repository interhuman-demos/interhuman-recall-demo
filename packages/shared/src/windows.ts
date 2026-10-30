import { DEMO_WINDOW_SECONDS } from "./constants.js";

/**
 * Map an absolute (session-cumulative) start time in seconds to the analysis
 * window index it falls in. This is the key reconciliation primitive: a signal
 * that arrives late still lands on the correct transcript window.
 */
export function windowIndexForStart(
  startS: number,
  windowSeconds: number = DEMO_WINDOW_SECONDS,
): number {
  if (windowSeconds <= 0) return 0;
  return Math.max(0, Math.floor(startS / windowSeconds));
}

/** Inclusive [startS, endS) bounds for a given window index. */
export function windowBounds(
  index: number,
  windowSeconds: number = DEMO_WINDOW_SECONDS,
): { startS: number; endS: number } {
  return {
    startS: index * windowSeconds,
    endS: (index + 1) * windowSeconds,
  };
}
