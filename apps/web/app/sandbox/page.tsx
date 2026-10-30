"use client";

import { motion, AnimatePresence } from "motion/react";
import { RotateCcwIcon } from "lucide-react";
import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { FloatingNav } from "@/components/ui/floating-nav";
import { EASE_OUT, fadeUp } from "@/lib/motion";
import {
  SANDBOX_REGISTRY,
  groupedRegistry,
  getEntry,
} from "@/lib/sandbox/registry";
import type { ControlValues, SandboxGroup } from "@/lib/sandbox/types";
import { CodeSnippet } from "./_components/code-snippet";
import { ControlsPanel } from "./_components/controls-panel";
import {
  PreviewStage,
  type StageBg,
} from "./_components/preview-stage";

const GROUP_ORDER: SandboxGroup[] = [
  "Inputs",
  "Display",
  "Feedback",
  "Identity",
  "Composition",
];

export default function SandboxPage() {
  const [selectedId, setSelectedId] = useState(
    () => SANDBOX_REGISTRY[0]?.id ?? "",
  );
  const [allValues, setAllValues] = useState<Record<string, ControlValues>>(
    () =>
      Object.fromEntries(SANDBOX_REGISTRY.map((e) => [e.id, { ...e.defaults }])),
  );
  const [stageBg, setStageBg] = useState<StageBg>("light");

  const entry = getEntry(selectedId);
  const values: ControlValues = allValues[selectedId] ?? entry?.defaults ?? {};

  const handleChange = useCallback(
    (key: string, value: string | number | boolean) => {
      setAllValues((prev) => ({
        ...prev,
        [selectedId]: { ...prev[selectedId], [key]: value },
      }));
    },
    [selectedId],
  );

  const handleReset = useCallback(() => {
    if (!entry) return;
    setAllValues((prev) => ({
      ...prev,
      [selectedId]: { ...entry.defaults },
    }));
  }, [selectedId, entry]);

  const grouped = groupedRegistry();

  return (
    <div className="bg-background min-h-screen">
      <FloatingNav />

      <div className="flex pt-20">
        {/* Sidebar */}
        <aside className="sticky top-20 h-[calc(100vh-5rem)] w-56 shrink-0 overflow-y-auto border-r border-black/[0.06] px-3 py-6 dark:border-white/[0.06]">
          <p className="text-label mb-4 px-2 text-[#F75B1E]">Components</p>
          <nav className="flex flex-col gap-0.5">
            {GROUP_ORDER.map((group) => {
              const entries = grouped.get(group);
              if (!entries?.length) return null;
              return (
                <div key={group} className="mb-3">
                  <p className="mb-1 px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground/30">
                    {group}
                  </p>
                  {entries.map((e) => {
                    const active = e.id === selectedId;
                    return (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => setSelectedId(e.id)}
                        className={`relative w-full rounded-lg px-3 py-1.5 text-left text-sm font-medium transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          active
                            ? "text-foreground"
                            : "text-foreground/50 hover:bg-black/[0.04] hover:text-foreground/80 dark:hover:bg-white/[0.04]"
                        }`}
                      >
                        {active && (
                          <motion.span
                            layoutId="sidebar-active"
                            className="absolute inset-0 rounded-lg bg-black/[0.06] dark:bg-white/[0.06]"
                            transition={{
                              type: "spring",
                              duration: 0.3,
                              bounce: 0,
                            }}
                          />
                        )}
                        <span className="relative">{e.name}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </nav>
        </aside>

        {/* Main content */}
        <div className="min-w-0 flex-1 px-6 py-8 lg:px-10">
          <AnimatePresence mode="wait">
            {entry && (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: EASE_OUT }}
                className="flex flex-col gap-6"
              >
                {/* Header */}
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground/30">
                      {entry.group}
                    </p>
                    <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-foreground">
                      {entry.name}
                    </h1>
                  </div>
                  {Object.keys(entry.controls).length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleReset}
                      className="gap-1.5 text-foreground/50"
                    >
                      <RotateCcwIcon className="size-3.5" />
                      Reset
                    </Button>
                  )}
                </div>

                {/* Two-column layout: preview+snippet left/top, controls right */}
                <div className="grid gap-6 lg:grid-cols-[1fr_220px]">
                  {/* Left: stage + snippet */}
                  <div className="flex flex-col gap-4">
                    <PreviewStage bg={stageBg} onBgChange={setStageBg}>
                      {entry.render(values)}
                    </PreviewStage>

                    <motion.div variants={fadeUp}>
                      <p className="text-label mb-2 text-foreground/30">
                        Generated JSX
                      </p>
                      <CodeSnippet code={entry.snippet(values)} />
                    </motion.div>
                  </div>

                  {/* Right: controls */}
                  {Object.keys(entry.controls).length > 0 && (
                    <div className="flex flex-col gap-4">
                      <p className="text-label text-foreground/30">Controls</p>
                      <ControlsPanel
                        controls={entry.controls}
                        values={values}
                        onChange={handleChange}
                      />
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
