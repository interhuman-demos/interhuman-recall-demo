"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { CheckIcon } from "lucide-react";
import { toast } from "sonner";
import type { JobRecord, JobStatus } from "@repo/shared";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { FloatingNav } from "@/components/ui/floating-nav";
import { EASE_OUT } from "@/lib/motion";

const STEPS: { status: JobStatus; label: string }[] = [
  { status: "queued", label: "Bot dispatched" },
  { status: "fetching", label: "Fetching recording & transcript" },
  { status: "segmenting", label: "Preparing video segments" },
  { status: "analyzing", label: "Detecting social signals" },
  { status: "summarizing", label: "Writing your report" },
];

const ORDER: JobStatus[] = [
  "queued",
  "fetching",
  "segmenting",
  "analyzing",
  "summarizing",
  "done",
];

export function JobProgress({ record }: { record: JobRecord }) {
  const status = record.status;
  const currentIdx = ORDER.indexOf(status);
  const botMayBeInCall =
    record.source === "recall" &&
    !!record.recallBotId &&
    (status === "queued" || status === "fetching");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <FloatingNav />

      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
        className="text-h2"
      >
        Analyzing the meeting…
      </motion.h1>
      <p className="text-muted-foreground mt-2 text-sm text-pretty">
        This runs after the call ends. Share this link with anyone you want to
        show the report to.
      </p>

      <div className="mt-8 flex flex-col gap-3">
        {STEPS.map((step, i) => {
          const idx = ORDER.indexOf(step.status);
          const done = idx < currentIdx;
          const active = idx === currentIdx;
          return (
            <motion.div
              key={step.status}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: i * 0.06 }}
              className="flex items-center gap-3"
            >
              {active ? (
                <span className="flex size-5 items-center justify-center">
                  <Spinner size="sm" className="text-brand" />
                </span>
              ) : (
                <span
                  className="flex size-5 items-center justify-center rounded-full text-xs transition-colors duration-[var(--duration-normal)]"
                  style={{
                    backgroundColor: done
                      ? "var(--signal-text-engagement)"
                      : "var(--muted)",
                    color: done ? "white" : "var(--muted-foreground)",
                  }}
                >
                  {done && <CheckIcon className="size-3" strokeWidth={3} />}
                </span>
              )}
              <span
                className={
                  active || done
                    ? "text-foreground"
                    : "text-muted-foreground/70"
                }
              >
                {step.label}
              </span>
            </motion.div>
          );
        })}
      </div>

      {botMayBeInCall ? <RemoveBot reportId={record.reportId} /> : null}
    </main>
  );
}

function RemoveBot({ reportId }: { reportId: string }) {
  const [state, setState] = useState<"idle" | "removing" | "removed">("idle");

  async function remove() {
    setState("removing");
    try {
      const res = await fetch(`/api/sessions/${reportId}/remove-bot`, {
        method: "POST",
      });
      if (res.ok) {
        setState("removed");
      } else {
        setState("idle");
        toast.error("Couldn’t remove the bot. It may have already left.");
      }
    } catch {
      setState("idle");
      toast.error("Couldn’t remove the bot. It may have already left.");
    }
  }

  if (state === "removed") {
    return (
      <p className="text-muted-foreground mt-8 p-4 bg-foreground/10 text-sm text-pretty">
        Bot removed. It will leave the call shortly — the report continues once
        the recording is ready.
      </p>
    );
  }

  return (
    <div className="border-border mt-8 border-t pt-6">
      <Button
        variant="outline"
        size="sm"
        onClick={remove}
        disabled={state === "removing"}
        className="hover:border-destructive/60 hover:text-destructive"
      >
        {state === "removing" ? (
          <>
            Removing bot…
          </>
        ) : (
          "Analyze meeting "
        )}
      </Button>
      <p className="text-muted-foreground/70 mt-2 text-xs text-pretty">
        Ends the bot’s participation now. Analysis still runs on whatever was
        recorded.
      </p>
    </div>
  );
}
