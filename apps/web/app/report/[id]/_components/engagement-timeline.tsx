"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { AnalysisSignal, EngagementPoint } from "@repo/shared";
import { Card } from "@/components/ui/card";
import { SignalBadge } from "@/components/ui/signal-badge";
import { EASE_OUT, fadeUp, inViewProps, staggerContainer } from "@/lib/motion";
import { formatTime } from "@/lib/signal-style";

const STATE_COLOR = {
  engaged: "var(--signal-text-engagement)",
  neutral: "var(--muted-foreground)",
  disengaged: "var(--signal-text-disengagement)",
} as const;

function stateColor(state: string): string {
  return STATE_COLOR[state as keyof typeof STATE_COLOR] ?? STATE_COLOR.neutral;
}

export function EngagementTimeline({
  durationS,
  engagement,
  signals,
}: {
  durationS: number;
  engagement: EngagementPoint[];
  signals: AnalysisSignal[];
}) {
  const total = Math.max(durationS, 1);
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div variants={fadeUp} {...inViewProps}>
      <Card className="p-6">
        <div className="text-label text-muted-foreground">
          Engagement over time
        </div>

        <div className="bg-muted relative mt-5 h-10 w-full overflow-hidden rounded-lg">
          {engagement.map((pt, i) => {
            const left = (pt.startS / total) * 100;
            const end = pt.endS ?? durationS;
            const width = Math.max(0.5, ((end - pt.startS) / total) * 100);
            return (
              <motion.div
                key={i}
                className="absolute top-0 h-full"
                style={{
                  left: `${left}%`,
                  width: `${width}%`,
                  backgroundColor: `color-mix(in oklch, ${stateColor(pt.state)} 55%, transparent)`,
                }}
                initial={shouldReduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: i * 0.04, ease: EASE_OUT }}
                title={`${pt.state} @ ${formatTime(pt.startS)}`}
              />
            );
          })}
        </div>

        {/* Signal tick marks positioned by time — small dots so dense
            clusters never collapse into an unreadable clump. */}
        <motion.div
          className="relative mt-2 h-3 w-full"
          variants={staggerContainer}
          initial="hidden"
          animate="show"
        >
          {signals.map((s, i) => {
            const left = Math.min(99.5, Math.max(0.5, (s.startS / total) * 100));
            return (
              <motion.span
                key={`${s.type}-${s.startS}-${i}`}
                className="absolute top-0 size-2 -translate-x-1/2 rounded-full ring-2 ring-[var(--card)]"
                style={{
                  left: `${left}%`,
                  backgroundColor: `var(--signal-text-${s.type})`,
                }}
                initial={shouldReduceMotion ? false : { opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  duration: 0.25,
                  ease: EASE_OUT,
                  delay: Math.min(i, 30) * 0.03,
                }}
                title={`${s.type} @ ${formatTime(s.startS)}${
                  s.rationale ? ` — ${s.rationale}` : ""
                }`}
              />
            );
          })}
        </motion.div>

        {/* Readable signal badges in a wrapping list so they never overlap. */}
        {signals.length > 0 && (
          <motion.div
            className="mt-4 flex flex-wrap gap-1.5"
            variants={staggerContainer}
            initial="hidden"
            animate="show"
          >
            <AnimatePresence>
              {signals.map((s, i) => (
                <SignalBadge
                  key={`${s.type}-${s.startS}-${i}`}
                  type={s.type}
                  reveal
                  index={Math.min(i, 25)}
                  className="text-[10px]"
                  title={`${formatTime(s.startS)}${
                    s.rationale ? ` — ${s.rationale}` : ""
                  }`}
                >
                  <span className="tabular opacity-50">
                    {formatTime(s.startS)}
                  </span>
                  {s.type}
                </SignalBadge>
              ))}
            </AnimatePresence>
          </motion.div>
        )}

        <div className="text-muted-foreground mt-4 flex flex-wrap gap-4 text-xs">
          <Legend color={STATE_COLOR.engaged} label="engaged" />
          <Legend color={STATE_COLOR.neutral} label="neutral" />
          <Legend color={STATE_COLOR.disengaged} label="disengaged" />
        </div>
      </Card>
    </motion.div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="size-2.5 rounded-sm"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}
