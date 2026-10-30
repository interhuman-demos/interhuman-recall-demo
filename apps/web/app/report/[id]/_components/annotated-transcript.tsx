"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { AnalysisSignal, SignalType, TranscriptSegment } from "@repo/shared";
import { Card } from "@/components/ui/card";
import { signalSpring } from "@/lib/motion";
import { formatTime, signalTextVar } from "@/lib/signal-style";
import { cn } from "@/lib/utils";

const PROB_ORDER: Record<string, number> = { high: 3, medium: 2, low: 1 };

/**
 * Anchor a signal to a transcript line by time. Only searches within the
 * provided `candidates` slice (pre-filtered to the signal's speaker) so a
 * focal-speaker signal can never snap onto another speaker's line.
 * Matches by overlap first, then nearest by gap.
 */
function matchByTime(
  candidates: TranscriptSegment[],
  startS: number,
  endS: number | null,
): number | null {
  if (candidates.length === 0) return null;
  const sigEnd = endS ?? startS;

  // Overlap: the signal's [startS, sigEnd] span intersects the segment.
  for (const seg of candidates) {
    if (startS < seg.endS && sigEnd >= seg.startS) return seg.index;
  }

  // Otherwise snap to the closest segment by gap to its time range.
  let best: TranscriptSegment | null = null;
  let bestGap = Infinity;
  for (const seg of candidates) {
    const gap =
      startS < seg.startS ? seg.startS - startS : startS - seg.endS;
    if (gap < bestGap) {
      bestGap = gap;
      best = seg;
    }
  }
  return best ? best.index : null;
}

/** A transcript row synthesized at runtime (not from the server transcript). */
interface SyntheticSegment {
  synthetic: true;
  speaker: string;
  startS: number;
  endS: number;
  signals: AnalysisSignal[];
}

/**
 * Group orphaned signals (those that couldn't be anchored to any focal
 * transcript line) into synthetic focal rows, one per distinct time window,
 * so they still appear in the conversation at the right moment.
 */
function buildSyntheticRows(
  orphans: AnalysisSignal[],
  focalSpeaker: string,
): SyntheticSegment[] {
  // Bucket by windowIndex so signals from the same analysis window share a row.
  const byWindow = new Map<number, AnalysisSignal[]>();
  for (const s of orphans) {
    const list = byWindow.get(s.windowIndex) ?? [];
    list.push(s);
    byWindow.set(s.windowIndex, list);
  }
  return Array.from(byWindow.values()).map((group) => {
    const startS = Math.min(...group.map((s) => s.startS));
    const ends = group.map((s) => s.endS).filter((e): e is number => e !== null);
    const endS = ends.length > 0 ? Math.max(...ends) : startS + 5;
    return { synthetic: true, speaker: focalSpeaker, startS, endS, signals: group };
  });
}

export function AnnotatedTranscript({
  transcript,
  signals,
  focalSpeaker,
}: {
  transcript: TranscriptSegment[];
  signals: AnalysisSignal[];
  focalSpeaker: string;
}) {
  const byIndex = new Map<number, AnalysisSignal[]>();
  const attach = (index: number, signal: AnalysisSignal) => {
    const list = byIndex.get(index) ?? [];
    list.push(signal);
    byIndex.set(index, list);
  };

  const orphans: AnalysisSignal[] = [];

  for (const s of signals) {
    // Only search within the signal's own speaker lines so focal signals
    // never accidentally snap onto another speaker's transcript row.
    const candidates = transcript.filter((seg) => seg.speaker === s.speaker);
    const index = s.transcriptIndex ?? matchByTime(candidates, s.startS, s.endS);
    if (index == null) {
      // No focal line to attach to — collect as orphan for a synthetic row.
      orphans.push(s);
    } else {
      attach(index, s);
    }
  }

  const syntheticRows = buildSyntheticRows(orphans, focalSpeaker);

  const hasContent =
    transcript.some((seg) => seg.text || (byIndex.get(seg.index)?.length ?? 0) > 0) ||
    syntheticRows.length > 0;

  // Merge transcript rows and synthetic rows into a single time-ordered list.
  type Row =
    | { kind: "real"; seg: TranscriptSegment }
    | { kind: "synthetic"; row: SyntheticSegment };

  const rows: Row[] = [
    ...transcript.map((seg): Row => ({ kind: "real", seg })),
    ...syntheticRows.map((row): Row => ({ kind: "synthetic", row })),
  ].sort((a, b) => {
    const aStart = a.kind === "real" ? a.seg.startS : a.row.startS;
    const bStart = b.kind === "real" ? b.seg.startS : b.row.startS;
    return aStart - bStart;
  });

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="border-border/60 bg-card shrink-0 border-b px-4 py-3">
        <p className="text-label text-muted-foreground">Transcript</p>
        {!hasContent && (
          <p className="text-muted-foreground text-body-sm mt-2">
            No transcript was captured for this call.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2.5 px-4 py-3">
        <AnimatePresence initial={false}>
          {rows.map((row) => {
            if (row.kind === "real") {
              const { seg } = row;
              if (!seg.text && (byIndex.get(seg.index)?.length ?? 0) === 0)
                return null;
              return (
                <TranscriptRow
                  key={`real-${seg.index}`}
                  speaker={seg.speaker}
                  startS={seg.startS}
                  endS={seg.endS}
                  text={seg.text}
                  signals={byIndex.get(seg.index) ?? []}
                  isFocal={seg.speaker === focalSpeaker}
                />
              );
            }
            // Synthetic focal row for orphaned signals.
            const { row: synthetic } = row;
            return (
              <TranscriptRow
                key={`synthetic-${synthetic.startS}`}
                speaker={synthetic.speaker}
                startS={synthetic.startS}
                endS={synthetic.endS}
                text=""
                signals={synthetic.signals}
                isFocal
              />
            );
          })}
        </AnimatePresence>
      </div>
    </Card>
  );
}

function TranscriptRow({
  speaker,
  startS,
  endS,
  text,
  signals,
  isFocal,
}: {
  speaker: string;
  startS: number;
  endS: number;
  text: string;
  signals: AnalysisSignal[];
  isFocal: boolean;
}) {
  const shouldReduceMotion = useReducedMotion();

  // Show signals in the order they were detected within this line's time span,
  // so the badge timestamps read left-to-right chronologically. A long merged
  // line can span a minute or more, so when each badge happened matters.
  const orderedSignals = [...signals].sort((a, b) => a.startS - b.startS);

  const topRationale = !text
    ? signals
        .filter((s) => s.rationale?.trim())
        .sort(
          (a, b) =>
            (PROB_ORDER[b.probability ?? ""] ?? 0) -
            (PROB_ORDER[a.probability ?? ""] ?? 0),
        )[0]
        ?.rationale?.trim()
    : undefined;

  return (
    <motion.div
      layout="position"
      id={`seg-${Math.floor(startS)}`}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={cn(
        "flex scroll-mt-24 flex-col gap-0.5 rounded-lg px-2 py-1.5 transition-colors",
        isFocal && "bg-accent/60",
      )}
    >
      <div className="text-muted-foreground/70 flex items-center gap-2">
        <span
          className={cn(
            "text-xs font-medium",
            isFocal && "text-brand",
          )}
        >
          {speaker}
        </span>
        <span className="text-muted-foreground/60 font-mono text-[10px] tabular-nums">
          {formatTime(startS)}–{formatTime(endS)}
        </span>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-1 gap-y-1">
        {text && (
          <p className="text-foreground/90 text-[15px] leading-relaxed text-pretty">
            {text}
          </p>
        )}
        {!text && topRationale && (
          <p className="text-body-sm text-muted-foreground w-full italic">
            {topRationale}
          </p>
        )}
        <AnimatePresence>
          {orderedSignals.map((signal, i) => (
            <InlineSignalBadge
              key={`${signal.type}-${signal.startS}-${i}`}
              type={signal.type}
              startS={signal.startS}
              endS={signal.endS}
              index={i}
            />
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function InlineSignalBadge({
  type,
  startS,
  endS,
  index,
}: {
  type: SignalType;
  startS: number;
  endS: number | null;
  index: number;
}) {
  const shouldReduceMotion = useReducedMotion();
  const color = signalTextVar(type);

  // Show when the signal fired within the line. If it spans more than a second,
  // show the interval; otherwise a single timestamp keeps the badge compact.
  const hasSpan = endS != null && endS - startS >= 1;
  const timing = hasSpan
    ? `${formatTime(startS)}–${formatTime(endS)}`
    : formatTime(startS);

  return (
    <motion.span
      initial={
        shouldReduceMotion
          ? false
          : { opacity: 0, scale: 0.25, filter: "blur(4px)" }
      }
      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
      exit={{ opacity: 0, scale: 0.8, filter: "blur(2px)" }}
      transition={{ ...signalSpring, delay: index * 0.08 }}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5",
        "font-mono text-[10px] leading-tight tracking-wide uppercase",
        "will-change-transform",
      )}
      style={{
        backgroundColor: `color-mix(in oklch, ${color} 10%, transparent)`,
        color,
        border: `1px solid color-mix(in oklch, ${color} 30%, transparent)`,
      }}
    >
      <motion.span
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden
        animate={{ scale: [1, 1.4, 1] }}
        transition={{
          duration: 0.4,
          delay: index * 0.08 + 0.15,
          ease: [0.25, 0.46, 0.45, 0.94],
        }}
      />
      {type}
      <span className="tabular-nums opacity-60">{timing}</span>
    </motion.span>
  );
}
