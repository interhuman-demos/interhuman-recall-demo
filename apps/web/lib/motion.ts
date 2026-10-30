import type { Transition, Variants } from "motion/react";

/**
 * Centralized motion language so every animation feels like it comes from the
 * same hand. Mirrors the duration/easing tokens in globals.css.
 */

/** House ease-out — used everywhere for reveals and color transitions. */
export const EASE_OUT = [0.2, 0, 0, 1] as const;
/** Alternate ease-out used for reveals and chips. */
export const EASE_REVEAL = [0.2, 0, 0, 1] as const;
/** Symmetric, natural for on-screen movement (matches --ease-in-out). */
export const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;

/** Entrance spring (hero elements) — smooth settle, no overshoot. */
export const spring: Transition = {
  type: "spring",
  duration: 0.7,
  bounce: 0,
};

/** Same hand, with a touch of personality for playful elements. */
export const springBouncy: Transition = {
  type: "spring",
  duration: 0.5,
  bounce: 0.15,
};

/** Signal-chip pop: scale + blur reveal, settles without overshoot. */
export const signalSpring: Transition = {
  type: "spring",
  duration: 0.4,
  bounce: 0,
};

/** Understated entrance: opacity + small lift. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: EASE_OUT },
  },
};

/** Parent that staggers its children into view, offset ~60ms each. */
export const staggerContainer: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.06 },
  },
};

/** Shared props for scroll-triggered section reveals (animate once). */
export const inViewProps = {
  initial: "hidden",
  whileInView: "show",
  viewport: { once: true, margin: "-80px" },
} as const;
