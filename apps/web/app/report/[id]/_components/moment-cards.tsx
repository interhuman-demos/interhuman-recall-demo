"use client";

import { motion } from "motion/react";
import type { SummaryMoment } from "@repo/shared";
import { Card } from "@/components/ui/card";
import { SignalBadge } from "@/components/ui/signal-badge";
import { fadeUp, inViewProps, spring, staggerContainer } from "@/lib/motion";
import { formatTime, signalTextVar } from "@/lib/signal-style";

export function MomentCards({
  title,
  moments,
  onJump,
}: {
  title: string;
  moments: SummaryMoment[];
  onJump: (startS: number) => void;
}) {
  if (moments.length === 0) {
    return (
      <section>
        <h2 className="text-label text-muted-foreground mb-3">{title}</h2>
        <p className="text-muted-foreground/70 text-sm">None detected.</p>
      </section>
    );
  }

  return (
    <motion.section variants={staggerContainer} {...inViewProps} className="flex flex-col">
      <h2 className="text-label text-muted-foreground mb-3">{title}</h2>
      <div className="flex flex-1 flex-col gap-3">
        {moments.map((m, i) => (
          <motion.button
            key={i}
            type="button"
            onClick={() => onJump(m.startS)}
            variants={fadeUp}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            transition={spring}
            className="flex flex-1 rounded-xl text-left outline-none focus-visible:[&>*]:ring-[3px] focus-visible:[&>*]:ring-ring/50"
          >
            <Card className="flex flex-1 flex-col p-4 transition-shadow duration-[var(--duration-normal)] hover:shadow-[var(--shadow-soft),0_0_0_1px_var(--color-brand)]">
              <div className="flex items-center justify-between gap-2">
                <SignalBadge type={m.signalType} />
                <span className="tabular text-muted-foreground text-xs">
                  {formatTime(m.startS)}
                </span>
              </div>
              <div className="mt-2 font-medium">{m.label}</div>
              <blockquote
                className="text-muted-foreground mt-2 border-l-2 pl-3 text-sm italic"
                style={{ borderColor: signalTextVar(m.signalType) }}
              >
                “{m.quote}”
              </blockquote>
              <p className="text-foreground/90 mt-2 text-sm text-pretty">
                {m.insight}
              </p>
            </Card>
          </motion.button>
        ))}
      </div>
    </motion.section>
  );
}
