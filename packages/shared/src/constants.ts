/**
 * Window timing and segment-size constants shared by the proxy pipeline and the
 * browser/report UI. Kept in one place so the timestamp/window-index math agrees
 * on both sides.
 */

export const DEMO_WINDOW_MS = 5_000;

export const DEMO_WINDOW_SECONDS = DEMO_WINDOW_MS / 1_000;

/** Interhuman requires at least 3 seconds of meaningful media per segment. */
export const DEMO_MIN_SEGMENT_DURATION_S = 3;

/** Reject obviously-empty segments before sending upstream. */
export const DEMO_MIN_SEGMENT_BYTES = 1_024;

/** Interhuman hard cap: 32 MB per segment. */
export const DEMO_MAX_SEGMENT_BYTES = 32 * 1_024 * 1_024;
