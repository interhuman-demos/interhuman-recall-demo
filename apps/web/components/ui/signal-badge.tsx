"use client";

import { motion, useReducedMotion } from "motion/react";
import type { SignalType } from "@repo/shared";
import { signalSpring } from "@/lib/motion";
import { signalBadgeStyle } from "@/lib/signal-style";
import { cn } from "@/lib/utils";

type SignalBadgeProps = React.ComponentProps<typeof motion.span> & {
  type: SignalType;
  /** Play the scale + blur entrance. Off by default for static lists. */
  reveal?: boolean;
  /** Stagger offset (seconds) applied to the entrance delay. */
  index?: number;
};

/**
 * A pill badge colored by its specific social signal. The fill (12%), ring
 * (30%), and text are all derived from one tuned `--signal-text-*` token via
 * color-mix, so all 12 signals read distinctly in both themes.
 */
export function SignalBadge({
  type,
  className,
  children,
  reveal = false,
  index = 0,
  ...props
}: SignalBadgeProps) {
  const shouldReduceMotion = useReducedMotion();
  const animated = reveal && !shouldReduceMotion;

  return (
    <motion.span
      data-slot="signal-badge"
      data-signal={type}
      initial={animated ? { opacity: 0, scale: 0.25, filter: "blur(4px)" } : false}
      animate={animated ? { opacity: 1, scale: 1, filter: "blur(0px)" } : undefined}
      exit={animated ? { opacity: 0, scale: 0.8, filter: "blur(2px)" } : undefined}
      transition={animated ? { ...signalSpring, delay: index * 0.08 } : undefined}
      style={signalBadgeStyle(type)}
      className={cn(
        "text-badge inline-flex items-center gap-1 rounded-full px-2 py-0.5 leading-none whitespace-nowrap uppercase tracking-wide will-change-transform active:scale-[0.96]",
        className,
      )}
      {...props}
    >
      {children ?? type}
    </motion.span>
  );
}
