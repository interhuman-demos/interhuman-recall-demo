import type { SignalType } from "@repo/shared";

const POSITIVE = new Set<SignalType>([
  "confidence",
  "interest",
  "agreement",
  "engagement",
]);

/**
 * The CSS custom property holding the base/fill tone for each social signal.
 * Bright, high-chroma (~0.72 L) — reads well as a solid fill on muted or dark
 * surfaces (timeline bars, swatches, progress fills).
 */
export function signalVar(type: SignalType): string {
  return `var(--signal-${type})`;
}

/**
 * The readable foreground tone for a signal — darkened in light mode for
 * legible text/borders on white, identical to the fill tone in dark mode.
 */
export function signalTextVar(type: SignalType): string {
  return `var(--signal-text-${type})`;
}

/**
 * Inline style for a signal badge: the readable signal tone drives the text,
 * a translucent fill, and the ring — so every one of the 12 signals reads
 * distinctly rather than collapsing into three valence buckets, in both themes.
 */
export function signalBadgeStyle(type: SignalType): React.CSSProperties {
  const color = signalTextVar(type);
  return {
    color,
    backgroundColor: `color-mix(in oklch, ${color} 12%, transparent)`,
    boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${color} 30%, transparent)`,
  };
}

/** Inline style for a solid swatch / progress fill in the signal fill tone. */
export function signalFillStyle(type: SignalType): React.CSSProperties {
  return { backgroundColor: signalVar(type) };
}

export function isPositiveSignal(type: SignalType): boolean {
  return POSITIVE.has(type);
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
