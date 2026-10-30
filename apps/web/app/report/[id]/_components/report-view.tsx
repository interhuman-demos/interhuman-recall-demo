"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRightIcon, CheckIcon, DotIcon } from "lucide-react";
import { toast } from "sonner";
import type { JobRecord, Participant, SummaryMoment } from "@repo/shared";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { FloatingNav } from "@/components/ui/floating-nav";
import { EASE_OUT, fadeUp } from "@/lib/motion";
import { formatTime } from "@/lib/signal-style";
import { cn } from "@/lib/utils";
import { AnnotatedTranscript } from "./annotated-transcript";
import { CqiPanel } from "./cqi-panel";
import { EngagementTimeline } from "./engagement-timeline";
import { JobProgress } from "./job-progress";
import { MomentCards } from "./moment-cards";

const ENTER = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
};

type MainTab = "summary" | "transcript" | "next";

/** Friendly meeting date, e.g. "Jun 3, 2026 · 3:59 PM". */
function formatMeetingDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const TABS: { id: MainTab; label: string }[] = [
  { id: "summary", label: "Summary" },

  { id: "transcript", label: "Transcript" },
  { id: "next", label: "Next steps" },
];

/** A streamed moment is only renderable once its grounding fields exist. */
function completeMoments(
  moments: Array<Partial<SummaryMoment>> | undefined,
): SummaryMoment[] {
  if (!Array.isArray(moments)) return [];
  return moments.filter(
    (m): m is SummaryMoment =>
      !!m &&
      typeof m.quote === "string" &&
      m.quote.length > 0 &&
      typeof m.startS === "number" &&
      typeof m.label === "string" &&
      typeof m.insight === "string" &&
      typeof m.signalType === "string",
  );
}

export function ReportView({ initial }: { initial: JobRecord }) {
  const [record, setRecord] = useState<JobRecord>(initial);
  const [activeTab, setActiveTab] = useState<MainTab>("summary");
  // The meeting date is formatted with the viewer's local timezone, which
  // differs from the server's during SSR and causes a hydration text mismatch
  // (React #418). Only render it after mount so SSR and first client render
  // agree on empty output.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/sessions/${initial.reportId}`, {
        cache: "no-store",
      });
      if (res.ok) setRecord((await res.json()) as JobRecord);
    } catch {
      // Transient network/proxy hiccup — the next tick retries.
    }
  }, [initial.reportId]);

  // Polling is the source of truth. The server route merges the proxy's latest
  // snapshot into the persisted record on every call, so the report fills in
  // progressively (transcript first, then signals/CQI/summary). We poll fast
  // while in-progress and stop once the job reaches a terminal state. This is
  // reliable across Next dev and serverless, where streamed responses can be
  // buffered and the proxy's in-memory store can reset.
  useEffect(() => {
    if (
      record.status === "done" ||
      record.status === "failed" ||
      record.status === "awaiting_focal"
    ) {
      return;
    }

    // Tighter cadence near the end (summary phase) for a snappier reveal.
    const interval = record.status === "summarizing" ? 1_000 : 1_500;
    const t = setInterval(poll, interval);
    // Fire once immediately so a freshly loaded page doesn't wait a full tick.
    void poll();
    return () => clearInterval(t);
  }, [record.status, poll]);

  function jump(startS: number) {
    setActiveTab("summary");
    // Let the tab switch render first so the element is mounted.
    requestAnimationFrame(() => {
      document
        .getElementById(`seg-${Math.floor(startS)}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  if (record.status === "failed") {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
        <FloatingNav />
        <h1 className="text-h2">Analysis failed</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          {record.error ?? "Something went wrong."}
        </p>
        <Link
          href="/demo"
          className="text-brand mt-6 inline-flex items-center gap-1 font-medium hover:underline"
        >
          Try the sample demo instead
          <ArrowRightIcon className="size-3.5" />
        </Link>
      </main>
    );
  }

  const r = record.result;
  const summary = r?.summary;

  // Source resolved and participants known — let the user pick whose behavior
  // to analyze before the heavy Interhuman + GPT work runs.
  if (record.status === "awaiting_focal" && r?.participants) {
    return (
      <FocalPicker
        reportId={record.reportId}
        participants={r.participants}
        suggested={r.focalSpeaker}
      />
    );
  }

  // Transcript-first gate: render the full report shell as soon as we know
  // the focal speaker and have at least a raw transcript. Signals, engagement,
  // CQI, and the GPT summary stream in afterward with skeletons until present.
  const hasTranscript =
    !!r &&
    Array.isArray(r.transcript) &&
    r.transcript.length > 0 &&
    !!r.focalSpeaker;

  // Live bridge sessions can legitimately finish with an empty transcript (the
  // signals + summary come from the RTMP→Inter-1 path, while diarized
  // transcript depends on a separate Recall webhook that may not be enabled).
  // Once the job is done and we have a summary, show the report regardless of
  // transcript so it doesn't get stuck on the progress screen forever.
  const isComplete = record.status === "done" && !!summary;

  if (!hasTranscript && !isComplete) {
    return <JobProgress record={record} />;
  }

  const hasAnalysis = !!r.conversationQuality && Array.isArray(r.signals);
  const summaryStreaming = record.status !== "done";
  const participants = r.participants ?? [];

  return (
    <div className="flex min-h-screen">
      <FloatingNav />

      {/* ── Left sidebar ─────────────────────────────────────────── */}
      <ParticipantSidebar
        reportId={record.reportId}
        participants={participants}
        focalSpeaker={r.focalSpeaker ?? ""}
      />

      {/* ── Main content (offset by sidebar) ─────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col pl-64">
        <div className="mx-auto w-full max-w-3xl px-6 pb-12 pt-28 sm:px-10 lg:px-12">

          {/* Header */}
          <motion.header {...ENTER} transition={{ duration: 0.5, ease: EASE_OUT }}>
            <div className="flex items-center gap-2">
              <p className="text-label text-brand">Meeting report</p>
              <span className="text-muted-foreground/40" aria-hidden>
                ·
              </span>
              <p className="text-muted-foreground tabular font-mono text-xs">
                {mounted ? formatMeetingDate(record.createdAt) : ""}
              </p>
            </div>
            {summary?.headline ? (
              <h1 className="text-h1 mt-3 text-balance">{summary.headline}</h1>
            ) : (
              <div className="mt-3 flex flex-col gap-2">
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-8 w-1/2" />
              </div>
            )}
          </motion.header>

          {/* Full-width: segmented control + active pane */}
          <div className="mt-8 flex min-w-0 flex-col gap-6">
            <ClipPathTabs activeTab={activeTab} onTabChange={setActiveTab} />

            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25, ease: EASE_OUT }}
              >
               

                {activeTab === "transcript" && (
                  <AnnotatedTranscript
                    transcript={r.transcript ?? []}
                    signals={r.signals ?? []}
                    focalSpeaker={r.focalSpeaker ?? ""}
                  />
                )}

{activeTab === "summary" && (
                  <div className="flex flex-col gap-6">
                    {/* Overview card */}
                    <Card className="flex flex-col gap-6 p-7">
                      {summary?.conversationContext && (
                        <div className="flex flex-col gap-2">
                          <div className="text-label text-muted-foreground">
                            Context
                          </div>
                          <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
                            {summary.conversationContext}
                          </p>
                        </div>
                      )}

                      <div className="flex flex-col gap-2">
                        <div className="text-label text-muted-foreground">
                          Summary
                        </div>
                        {summary?.narrative ? (
                          <p className="text-foreground/90 leading-relaxed whitespace-pre-line">
                            {summary.narrative}
                          </p>
                        ) : (
                          <div className="flex flex-col gap-2">
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-2/3" />
                          </div>
                        )}
                      </div>

                      {((summary?.strengths?.length ?? 0) > 0 ||
                        (summary?.watchOuts?.length ?? 0) > 0) && (
                        <div className="grid gap-6 border-t border-black/[0.06] pt-6 sm:grid-cols-2 dark:border-white/[0.06]">
                          <Bullets
                            title="Strengths"
                            items={summary?.strengths ?? []}
                            tone="positive"
                          />
                          <Bullets
                            title="Watch-outs"
                            items={summary?.watchOuts ?? []}
                            tone="caution"
                          />
                        </div>
                      )}
                    </Card>

                    {/* One key moment + one dip — the single best good and bad */}
                    <div className="grid items-stretch gap-4 sm:grid-cols-2">
                      <MomentCards
                        title="Key moment"
                        moments={completeMoments(summary?.keyMoments)}
                        onJump={jump}
                      />
                      <MomentCards
                        title="Dip"
                        moments={completeMoments(summary?.dips)}
                        onJump={jump}
                      />
                    </div>
                  </div>
                )}

                {activeTab === "next" && (
                  <Card className="border-brand/30 p-6">
                    <div className="text-label text-brand mb-3">For next time</div>
                    {summary?.coaching && summary.coaching.length > 0 ? (
                      <ul className="text-foreground/90 flex flex-col gap-3 text-sm">
                        {summary.coaching.map((tip, i) => (
                          <motion.li
                            key={i}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, delay: i * 0.05 }}
                            className="flex gap-2"
                          >
                            <ArrowRightIcon
                              className="text-brand mt-0.5 size-4 shrink-0"
                              aria-hidden
                            />
                            <span className="text-pretty">{tip}</span>
                          </motion.li>
                        ))}
                      </ul>
                    ) : summaryStreaming ? (
                      <div className="flex flex-col gap-2">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-5/6" />
                        <Skeleton className="h-4 w-4/5" />
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-sm">No coaching tips available.</p>
                    )}
                  </Card>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Placeholder for individual bento cells while analysis is streaming in. */
function BentoAnalysisSkeleton({ variant }: { variant: "cqi" | "engagement" }) {
  if (variant === "engagement") {
    return (
      <Card className="p-6">
        <div className="text-label text-muted-foreground mb-5">Engagement over time</div>
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="mt-3 h-6 w-full" />
      </Card>
    );
  }
  return (
    <Card className="p-6">
      <div className="text-label text-muted-foreground mb-4">Conversation Quality</div>
      <div className="flex items-baseline gap-3">
        <Skeleton className="h-12 w-16" />
        <Skeleton className="h-5 w-28" />
      </div>
      <div className="mt-6 flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-4 w-20 shrink-0" />
            <Skeleton className="h-2 flex-1" />
            <Skeleton className="h-4 w-6" />
          </div>
        ))}
      </div>
    </Card>
  );
}

function Bullets({
  title,
  items,
  tone,
}: {
  title: string;
  items: Array<string | undefined>;
  tone: "positive" | "caution";
}) {
  const clean = items.filter((it): it is string => !!it && it.length > 0);
  if (clean.length === 0) return null;
  const Icon = tone === "positive" ? CheckIcon : DotIcon;
  const color =
    tone === "positive"
      ? "var(--signal-text-confidence)"
      : "var(--signal-text-hesitation)";
  return (
    <>
      <h2 className="text-label text-muted-foreground mb-3">{title}</h2>
      <ul className="text-foreground/90 flex flex-col gap-2 text-sm">
        {clean.map((it, i) => (
          <motion.li
            key={i}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.05 }}
            className="flex gap-2"
          >
            <Icon
              className="mt-0.5 size-4 shrink-0"
              style={{ color }}
              aria-hidden
            />
            <span className="text-pretty">{it}</span>
          </motion.li>
        ))}
      </ul>
    </>
  );
}

/** Animated clip-path segmented control for the three main content tabs. */
function ClipPathTabs({
  activeTab,
  onTabChange,
}: {
  activeTab: MainTab;
  onTabChange: (tab: MainTab) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const activeEl = activeTabRef.current;
    if (!container || !activeEl) return;
    const { offsetLeft, offsetWidth } = activeEl;
    const clipLeft = (offsetLeft / container.offsetWidth) * 100;
    const clipRight = 100 - ((offsetLeft + offsetWidth) / container.offsetWidth) * 100;
    container.style.clipPath = `inset(0 ${clipRight.toFixed()}% 0 ${clipLeft.toFixed()}% round 17px)`;
  }, [activeTab]);

  return (
    <div className="relative flex w-full select-none">
      {/* Base layer */}
      <ul className="relative flex w-full gap-1 rounded-[17px] bg-black/[0.04] p-1 dark:bg-white/[0.06]">
        {TABS.map((tab) => (
          <li key={tab.id} className="flex-1">
            <button
              type="button"
              ref={activeTab === tab.id ? activeTabRef : null}
              onClick={() => onTabChange(tab.id)}
              className="flex h-8 w-full items-center justify-center rounded-[13px] px-4 text-sm font-medium text-black/70 transition-colors hover:text-black dark:text-white/60 dark:hover:text-white"
            >
              {tab.label}
            </button>
          </li>
        ))}
      </ul>

      {/* Sliding overlay (clip-path animated via style) */}
      <div
        aria-hidden
        ref={containerRef}
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-[17px] transition-[clip-path] duration-[250ms] ease-[cubic-bezier(0.2,0,0,1)]"
        style={{ clipPath: "inset(0 66% 0 0% round 17px)" }}
      >
        <ul className="flex h-full w-full gap-1 rounded-[17px] bg-brand p-1">
          {TABS.map((tab) => (
            <li key={tab.id} className="flex-1">
              <button
                type="button"
                tabIndex={-1}
                onClick={() => onTabChange(tab.id)}
                className="pointer-events-auto flex h-8 w-full items-center justify-center rounded-[13px] px-4 text-sm font-medium text-white"
              >
                {tab.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Notion-style fixed left sidebar listing all participants. */
function ParticipantSidebar({
  reportId,
  participants,
  focalSpeaker,
}: {
  reportId: string;
  participants: Participant[];
  focalSpeaker: string;
}) {
  const [busy, setBusy] = useState(false);
  const sorted = [...participants].sort((a, b) => b.talkTimeS - a.talkTimeS);

  async function refocus(id: string) {
    setBusy(true);
    try {
      await fetch(`/api/sessions/${reportId}/refocus`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ focalParticipantId: id }),
      });
      window.location.reload();
    } catch {
      setBusy(false);
      toast.error("Couldn't switch speaker.");
    }
  }

  return (
    <motion.aside
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, ease: EASE_OUT, delay: 0.1 }}
      className="fixed left-0 top-0 z-[40] flex h-screen w-64 flex-col border-r border-black/[0.06] bg-white/80 backdrop-blur-xl dark:border-white/[0.06] dark:bg-black/40"
    >
      <div className="flex-1 overflow-y-auto px-3 pb-4 pt-20">
        <p className="text-label text-muted-foreground mb-2 px-2">Participants</p>
        <ul className="flex flex-col gap-0.5">
          {sorted.map((p) => {
            const active = p.name === focalSpeaker;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={busy || active}
                  onClick={() => !active && refocus(p.id)}
                  className={cn(
                    "group flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors duration-150",
                    active
                      ? "bg-brand/[0.08] text-brand"
                      : "text-foreground/80 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
                    busy && !active && "cursor-wait opacity-50",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold uppercase",
                      active
                        ? "bg-brand text-white"
                        : "bg-black/[0.06] text-foreground/60 dark:bg-white/[0.08] dark:text-white/60",
                    )}
                  >
                    {p.name.charAt(0)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className={cn("truncate text-sm font-medium", active && "text-brand")}>
                      {p.name}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {formatTime(p.talkTimeS)}
                    </div>
                  </div>
         
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </motion.aside>
  );
}

/**
 * Shown after the transcript is ready but before the behavioral analysis runs.
 * The user picks whose social signals to analyze; we then start a fresh job for
 * that speaker via the refocus route (the same path the in-report selector uses).
 */
function FocalPicker({
  reportId,
  participants,
  suggested,
}: {
  reportId: string;
  participants: Participant[];
  suggested?: string;
}) {
  const sorted = [...participants].sort((a, b) => b.talkTimeS - a.talkTimeS);
  const suggestedId =
    sorted.find((p) => p.name === suggested)?.id ?? sorted[0]?.id ?? "";
  const [selected, setSelected] = useState(suggestedId);
  const [busy, setBusy] = useState(false);

  async function analyze() {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/sessions/${reportId}/refocus`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ focalParticipantId: selected }),
      });
      if (!res.ok) throw new Error("Failed to start analysis");
      window.location.reload();
    } catch (err) {
      setBusy(false);
      toast.error(
        err instanceof Error ? err.message : "Couldn’t start the analysis.",
      );
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <FloatingNav />

      <motion.div {...ENTER} transition={{ duration: 0.5, ease: EASE_OUT }}>
        <p className="text-label text-brand">Meeting recorded</p>
        <h1 className="text-h2 mt-2 text-balance">Who should we analyze?</h1>
        <p className="text-muted-foreground mt-2 text-sm text-pretty">
          We found {participants.length} speakers in this call. Pick whose social
          signals you want the behavioral read for.
        </p>
      </motion.div>

      <div className="mt-6 flex flex-col gap-2">
        {sorted.map((p, i) => {
          const active = p.id === selected;
          return (
            <motion.button
              key={p.id}
              type="button"
              onClick={() => setSelected(p.id)}
              disabled={busy}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.05 + i * 0.05 }}
              whileTap={{ scale: 0.99 }}
              className="text-left outline-none disabled:opacity-60 focus-visible:[&>*]:ring-[3px] focus-visible:[&>*]:ring-ring/50"
              aria-pressed={active}
            >
              <Card
                className={`flex items-center justify-between gap-3 p-4 transition-shadow duration-[var(--duration-normal)] ${
                  active
                    ? "shadow-[var(--shadow-soft),0_0_0_1px_var(--color-brand)]"
                    : "hover:shadow-[var(--shadow-soft)]"
                }`}
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{p.name}</div>
                  <div className="text-muted-foreground text-xs">
                    {formatTime(p.talkTimeS)} talk time
                    {p.id === suggestedId ? " · most active" : ""}
                  </div>
                </div>
                <span
                  className="flex size-5 shrink-0 items-center justify-center rounded-full transition-colors duration-[var(--duration-normal)]"
                  style={{
                    backgroundColor: active
                      ? "var(--color-brand)"
                      : "var(--muted)",
                    color: active ? "white" : "transparent",
                  }}
                >
                  {active ? <CheckIcon className="size-3" strokeWidth={3} /> : null}
                </span>
              </Card>
            </motion.button>
          );
        })}
      </div>

      <Button
        onClick={analyze}
        disabled={busy || !selected}
        className="mt-6 w-full"
      >
        {busy ? (
          <>
            <Spinner size="sm" />
            Starting analysis…
          </>
        ) : (
          <>
            Analyze this speaker
            <ArrowRightIcon className="size-4" />
          </>
        )}
      </Button>
    </main>
  );
}
