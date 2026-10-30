"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { EASE_OUT } from "@/lib/motion";

type StageBg = "light" | "dark" | "checker";
export type { StageBg };

type PreviewStageProps = {
  children: ReactNode;
  bg: StageBg;
  onBgChange: (bg: StageBg) => void;
};

const BG_OPTIONS: { value: StageBg; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "checker", label: "Grid" },
];

const BG_CLASSES: Record<StageBg, string> = {
  light: "bg-[#f0f2f1]",
  dark: "bg-[#0a0a0f]",
  checker:
    "bg-[length:24px_24px] bg-[position:0_0,12px_12px] [background-image:linear-gradient(45deg,oklch(0_0_0/4%)_25%,transparent_25%,transparent_75%,oklch(0_0_0/4%)_75%),linear-gradient(45deg,oklch(0_0_0/4%)_25%,transparent_25%,transparent_75%,oklch(0_0_0/4%)_75%)] dark:[background-image:linear-gradient(45deg,oklch(1_0_0/4%)_25%,transparent_25%,transparent_75%,oklch(1_0_0/4%)_75%),linear-gradient(45deg,oklch(1_0_0/4%)_25%,transparent_25%,transparent_75%,oklch(1_0_0/4%)_75%)] bg-background",
};

/** Wraps the live preview child in the chosen background surface. */
export function PreviewStage({ children, bg, onBgChange }: PreviewStageProps) {
  return (
    <div className="flex flex-col gap-3">
      {/* Bg toggle pill */}
      <div className="flex items-center gap-1 self-end rounded-full bg-black/[0.04] p-1 dark:bg-white/[0.06]">
        {BG_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onBgChange(opt.value)}
            className="relative rounded-full px-3 py-1 font-mono text-xs font-semibold uppercase tracking-[0.15em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{
              color:
                bg === opt.value
                  ? "white"
                  : "oklch(0 0 0 / 40%)",
            }}
          >
            {bg === opt.value && (
              <motion.span
                layoutId="stage-bg-pill"
                className="absolute inset-0 rounded-full bg-[var(--color-brand)]"
                transition={{ type: "spring", duration: 0.35, bounce: 0 }}
              />
            )}
            <span className="relative">{opt.label}</span>
          </button>
        ))}
      </div>

      {/* Stage surface */}
      <div
        className={`flex min-h-48 w-full items-center justify-center rounded-3xl p-10 transition-colors duration-300 ${BG_CLASSES[bg]}`}
      >
        <motion.div
          key={bg}
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.35, ease: EASE_OUT }}
        >
          {children}
        </motion.div>
      </div>
    </div>
  );
}
