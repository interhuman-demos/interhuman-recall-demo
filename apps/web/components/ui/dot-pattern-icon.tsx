"use client";

import { motion } from "motion/react";

/**
 * Dot-matrix glyph — the signature identity element. A 9×9 grid of rounded
 * square cells driven by an array of 9 binary strings. "On" dots are near-
 * opaque, "off" dots are barely-there (the faint full grid must stay visible).
 *
 * Glyphs are hand-authored bitmaps — author new ones as 9-string arrays of 0/1.
 */

/** Hand-authored 9×9 bitmaps. */
export const GLYPHS = {
  // Sound wave / signal bars
  wave: [
    "000010000",
    "000010000",
    "001010100",
    "001010100",
    "101010101",
    "101010101",
    "101010101",
    "001010100",
    "000010000",
  ],
  // Speech bubble
  bubble: [
    "011111110",
    "100000010",
    "101101010",
    "100000010",
    "101101010",
    "100000010",
    "010000100",
    "001000000",
    "000100000",
  ],
  // Spark / pulse
  spark: [
    "000010000",
    "000111000",
    "001010100",
    "010010010",
    "111010111",
    "010010010",
    "001010100",
    "000111000",
    "000010000",
  ],
  // Person / face
  face: [
    "001111100",
    "010000010",
    "100100100",
    "100000100",
    "101000100",
    "100000100",
    "010111010",
    "001000100",
    "000111000",
  ],
  // House / home
  house: [
    "000010000",
    "000111000",
    "001111100",
    "011111110",
    "111111111",
    "110111011",
    "110111011",
    "110000011",
    "110000011",
  ],
  // Grid / matrix
  grid: [
    "101010101",
    "000000000",
    "101010101",
    "000000000",
    "101010101",
    "000000000",
    "101010101",
    "000000000",
    "101010101",
  ],
  // Bolt / power
  bolt: [
    "000111000",
    "000110000",
    "001110000",
    "011111110",
    "000011100",
    "000011000",
    "000110000",
    "001100000",
    "001000000",
  ],
} as const;

export type GlyphName = keyof typeof GLYPHS;

/**
 * Large white-on-dark glyph (~35px). On-opacity 0.92, off-opacity 0.09 — the
 * faint ghost grid is the whole charm.
 */
export function DotPatternIcon({
  rows,
  size = 35,
  className,
}: {
  rows: readonly string[];
  size?: number;
  className?: string;
}) {
  const cell = 3;
  const gap = 0.9;
  const pitch = cell + gap;
  const viewSize = rows.length * cell + (rows.length - 1) * gap;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${viewSize} ${viewSize}`}
      fill="none"
      aria-hidden
      className={className}
    >
      {rows.map((row, y) =>
        [...row].map((dot, x) => (
          <rect
            key={`${x}-${y}`}
            x={x * pitch}
            y={y * pitch}
            width={cell}
            height={cell}
            rx="0.9"
            fill="white"
            opacity={dot === "1" ? 0.92 : 0.09}
          />
        )),
      )}
    </svg>
  );
}

/**
 * Small currentColor glyph (~18px) for nav / inline use. On-opacity 0.8,
 * off-opacity 0.06 — same faint-grid identity, scaled down.
 */
export function DotPatternIconSmall({
  rows,
  size = 18,
  className,
}: {
  rows: readonly string[];
  size?: number;
  className?: string;
}) {
  const cell = 2.4;
  const gap = 0.7;
  const pitch = cell + gap;
  const viewSize = rows.length * cell + (rows.length - 1) * gap;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${viewSize} ${viewSize}`}
      fill="none"
      aria-hidden
      className={className}
    >
      {rows.map((row, y) =>
        [...row].map((dot, x) => (
          <rect
            key={`${x}-${y}`}
            x={x * pitch}
            y={y * pitch}
            width={cell}
            height={cell}
            rx="0.7"
            fill="currentColor"
            opacity={dot === "1" ? 0.8 : 0.06}
          />
        )),
      )}
    </svg>
  );
}

/**
 * Animated white-on-dark glyph. The "on" dots ripple outward from the center
 * on a loop — a living "signal" pulse. "Off" dots stay as the faint ghost grid.
 */
export function DotPatternIconAnimated({
  rows,
  size = 35,
  className,
  color = "white",
}: {
  rows: readonly string[];
  size?: number;
  className?: string;
  color?: string;
}) {
  const cell = 3;
  const gap = 0.9;
  const pitch = cell + gap;
  const viewSize = rows.length * cell + (rows.length - 1) * gap;
  const center = (rows.length - 1) / 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${viewSize} ${viewSize}`}
      fill="none"
      aria-hidden
      className={className}
    >
      {rows.map((row, y) =>
        [...row].map((dot, x) => {
          const on = dot === "1";
          if (!on) {
            return (
              <rect
                key={`${x}-${y}`}
                x={x * pitch}
                y={y * pitch}
                width={cell}
                height={cell}
                rx="0.9"
                fill={color}
                opacity={0.09}
              />
            );
          }

          const dist = Math.hypot(x - center, y - center);
          const delay = dist * 0.12;

          return (
            <motion.rect
              key={`${x}-${y}`}
              x={x * pitch}
              y={y * pitch}
              width={cell}
              height={cell}
              rx="0.9"
              fill={color}
              initial={{ opacity: 0.92 }}
              animate={{ opacity: [0.92, 0.32, 0.92] }}
              transition={{
                duration: 1.6,
                ease: "easeInOut",
                repeat: Infinity,
                repeatDelay: 0.6,
                delay,
              }}
            />
          );
        }),
      )}
    </svg>
  );
}
