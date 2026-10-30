"use client";

import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRightIcon } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { DotPatternIcon, GLYPHS } from "@/components/ui/dot-pattern-icon";
import { FloatingNav } from "@/components/ui/floating-nav";
import { Spinner } from "@/components/ui/spinner";
import { EASE_OUT, spring } from "@/lib/motion";

const ENTER = {
  initial: { opacity: 0, y: 18, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
};

const FIXTURES = [
  {
    id: "sample-1on1",
    title: "Sample 1:1 conversation",
    description:
      "A short one-on-one with clear confidence and hesitation moments.",
  },
];

export default function DemoPage() {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function run(fixtureId: string) {
    setLoadingId(fixtureId);
    try {
      const res = await fetch("/api/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixtureId }),
      });
      const data = (await res.json()) as { reportUrl?: string; error?: unknown };
      if (!res.ok || !data.reportUrl) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Failed to start demo",
        );
      }
      router.push(data.reportUrl);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      setLoadingId(null);
    }
  }

  return (
    <div className="bg-background min-h-screen">
      <FloatingNav />

      <section className="relative isolate overflow-hidden px-5 pb-24 pt-36 lg:px-10 lg:pt-40">
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -left-20 -top-10 -z-10 h-96 w-96 rounded-full bg-[#F75B1E]/15 blur-3xl"
          animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        />

        <div className="mx-auto flex max-w-xl flex-col items-center text-center">
          <motion.div {...ENTER} transition={spring}>
            <DotPatternIcon rows={GLYPHS.spark} size={48} className="mx-auto" />
          </motion.div>

          <motion.p
            {...ENTER}
            transition={{ ...spring, delay: 0.05 }}
            className="text-label text-[#F75B1E] mt-6"
          >
            Sample call
          </motion.p>

          <motion.h1
            {...ENTER}
            transition={{ ...spring, delay: 0.1 }}
            className="text-display mt-4 text-gray-900 dark:text-white"
            style={{ textWrap: "balance" }}
          >
            Demo on a sample call
          </motion.h1>

          <motion.p
            {...ENTER}
            transition={{ ...spring, delay: 0.15 }}
            className="mt-5 max-w-md text-lg text-gray-500 dark:text-white/50"
            style={{ textWrap: "pretty" }}
          >
            Runs the full pipeline on a pre-recorded meeting — no live bot
            required.
          </motion.p>
        </div>

        <div className="mx-auto mt-12 flex max-w-xl flex-col gap-4">
          {FIXTURES.map((f, i) => {
            const isLoading = loadingId === f.id;
            return (
              <motion.button
                key={f.id}
                type="button"
                onClick={() => run(f.id)}
                disabled={loadingId !== null}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.6,
                  delay: 0.25 + i * 0.06,
                  ease: EASE_OUT,
                }}
                className="group text-left outline-none transition-transform duration-150 will-change-transform [@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-px active:scale-[0.99] disabled:opacity-60 motion-reduce:transition-none"
              >
                <Card className="p-6 transition-shadow duration-200 hover:shadow-[var(--shadow-border),0_8px_24px_-8px_rgba(0,0,0,0.12)]">
                  <h3 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">
                    {f.title}
                  </h3>
                  <p className="mt-1 text-base text-gray-500 dark:text-white/50">
                    {f.description}
                  </p>
                  <div className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-[#F75B1E]">
                    {isLoading ? (
                      <>
                        <Spinner size="sm" />
                        Analyzing…
                      </>
                    ) : (
                      <>
                        Run analysis
                        <ArrowRightIcon className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
                      </>
                    )}
                  </div>
                </Card>
              </motion.button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
