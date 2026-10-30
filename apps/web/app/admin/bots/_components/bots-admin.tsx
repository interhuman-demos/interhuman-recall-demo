"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { LoaderIcon, LogOutIcon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { EASE_OUT, fadeUp, staggerContainer } from "@/lib/motion";
import type { BotRow } from "@/lib/admin-schemas";
import { cn } from "@/lib/utils";

const POLL_MS = 15_000;

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function BotsAdmin() {
  const router = useRouter();
  const [bots, setBots] = useState<BotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [killing, setKilling] = useState<Record<string, boolean>>({});

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/admin/bots", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load bots");
      const data = (await res.json()) as { bots: BotRow[] };
      setBots(data.bots);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load bots");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(true), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const kill = useCallback(
    async (botId: string) => {
      setKilling((k) => ({ ...k, [botId]: true }));
      try {
        const res = await fetch(`/api/admin/bots/${botId}/kill`, {
          method: "POST",
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(data.error ?? "Failed to remove bot");
        }
        toast.success("Bot removed from call");
        await load(true);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to remove bot");
      } finally {
        setKilling((k) => ({ ...k, [botId]: false }));
      }
    },
    [load],
  );

  const activeCount = bots.filter((b) => b.active).length;

  const logout = useCallback(async () => {
    try {
      await fetch("/api/admin/login", { method: "DELETE" });
    } finally {
      router.replace("/admin/login");
      router.refresh();
    }
  }, [router]);

  return (
    <div className="flex flex-col gap-6">
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
        className="flex items-start justify-between gap-4"
      >
        <div>
          <p className="text-label text-brand">Ops</p>
          <h1 className="text-h1 mt-2">Bots</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Every dispatched bot and its live Recall status.{" "}
            {activeCount > 0 ? (
              <span className="text-destructive font-medium">
                {activeCount} still in a call — burning credits.
              </span>
            ) : (
              "None are active."
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCwIcon className={cn(loading && "animate-spin")} />
            Refresh
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void logout()}>
            <LogOutIcon />
            Sign out
          </Button>
        </div>
      </motion.header>

      {loading && bots.length === 0 ? (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Spinner /> Loading bots…
        </div>
      ) : bots.length === 0 ? (
        <Card className="p-6">
          <p className="text-muted-foreground text-sm">No bots found.</p>
        </Card>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="flex flex-col gap-3"
        >
          {bots.map((b) => (
            <motion.div key={b.botId} variants={fadeUp}>
              <Card
                className={cn(
                  "flex items-center justify-between gap-4 p-4",
                  b.active &&
                    "shadow-[var(--shadow-soft),0_0_0_1px_var(--color-destructive)]",
                )}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <StatusDot active={b.active} />
                    <span className="font-medium">
                      {b.liveStatus ?? "unknown"}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      · job {b.jobStatus} · {b.source}
                    </span>
                  </div>
                  <div className="text-muted-foreground mt-1 truncate text-xs">
                    {b.meetingUrl ?? "no meeting url"}
                  </div>
                  <div className="text-muted-foreground/70 mt-1 flex items-center gap-2 font-mono text-[11px]">
                    <span className="tabular">{relativeTime(b.createdAt)}</span>
                    <span className="truncate">{b.botId}</span>
                  </div>
                </div>
                <div className="shrink-0">
                  {b.active ? (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => void kill(b.botId)}
                      disabled={killing[b.botId]}
                    >
                      {killing[b.botId] ? <LoaderIcon className="animate-spin" /> : null}
                      Force remove
                    </Button>
                  ) : (
                    <span className="text-muted-foreground text-xs">idle</span>
                  )}
                </div>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}

function StatusDot({ active }: { active: boolean }) {
  if (!active) {
    return <span className="bg-muted-foreground/40 size-2.5 rounded-full" />;
  }
  return (
    <span className="relative flex size-2.5">
      <span
        className="absolute inline-flex size-full animate-ping rounded-full opacity-60"
        style={{ backgroundColor: "var(--color-destructive)" }}
      />
      <span
        className="relative inline-flex size-2.5 rounded-full"
        style={{ backgroundColor: "var(--color-destructive)" }}
      />
    </span>
  );
}
