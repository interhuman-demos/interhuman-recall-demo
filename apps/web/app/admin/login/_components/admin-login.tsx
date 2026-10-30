"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { motion } from "motion/react";
import { LockIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { EASE_OUT } from "@/lib/motion";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [secret, setSecret] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Incorrect secret");
      }
      const from = params.get("from") ?? "/admin/bots";
      router.replace(from);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign-in failed");
      setLoading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE_OUT }}
      className="w-full max-w-sm"
    >
      <Card className="p-6">
        <div className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-lg">
          <LockIcon className="size-4" />
        </div>
        <h1 className="text-h2 mt-4">Admin access</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Enter the shared secret to manage bots.
        </p>
        <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
          <Input
            type="password"
            autoFocus
            placeholder="Shared secret"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            disabled={loading}
          />
          <Button
            type="submit"
            variant="gradient"
            disabled={loading || secret.length === 0}
          >
            {loading ? <Spinner size="sm" /> : null}
            Sign in
          </Button>
        </form>
      </Card>
    </motion.div>
  );
}

export function AdminLogin() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="fixed right-4 top-4 z-[var(--z-nav)]">
        <ThemeToggle />
      </div>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
