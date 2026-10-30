"use client";

import { motion, useReducedMotion } from "motion/react";
import {
  type ConversationQuality,
  cqiBand,
  ALL_CQI_DIMENSIONS,
} from "@repo/shared";
import { Card } from "@/components/ui/card";
import { EASE_OUT, fadeUp, inViewProps } from "@/lib/motion";

export function CqiPanel({ cq }: { cq: ConversationQuality }) {
  const reduce = useReducedMotion();
  const band = cqiBand(cq.cqi);

  return (
    <motion.div variants={fadeUp} {...inViewProps}>
      <Card className="p-6">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-label text-muted-foreground">
              Conversation Quality
            </div>
            <div className="mt-1 flex items-baseline gap-3">
              <span className="tabular text-5xl font-semibold tracking-tight">
                {Math.round(cq.cqi)}
              </span>
              <span className="text-muted-foreground text-lg">
                / 100 · {band}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3">
          {ALL_CQI_DIMENSIONS.map((dim, i) => {
            const value = cq.dimensions[dim] ?? 0;
            return (
              <div key={dim} className="flex items-center gap-3">
                <div className="text-muted-foreground w-24 shrink-0 text-sm capitalize">
                  {dim}
                </div>
                <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                  <motion.div
                    className="h-full w-full origin-left rounded-full"
                    style={{ backgroundColor: "var(--chart-3)" }}
                    initial={{ transform: `scaleX(${reduce ? value / 100 : 0})` }}
                    whileInView={{ transform: `scaleX(${value / 100})` }}
                    viewport={{ once: true, margin: "-80px" }}
                    transition={{
                      duration: 0.7,
                      delay: i * 0.06,
                      ease: EASE_OUT,
                    }}
                  />
                </div>
                <div className="tabular text-foreground/80 w-8 text-right text-sm">
                  {Math.round(value)}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </motion.div>
  );
}
