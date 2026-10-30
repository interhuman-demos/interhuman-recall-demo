import type { Metadata } from "next";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { BotsAdmin } from "./_components/bots-admin";

export const metadata: Metadata = {
  title: "Bots · Ops",
};

export default function AdminBotsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <div className="fixed right-4 top-4 z-[var(--z-nav)]">
        <ThemeToggle />
      </div>
      <BotsAdmin />
    </main>
  );
}
