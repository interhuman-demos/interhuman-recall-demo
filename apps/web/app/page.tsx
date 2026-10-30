"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRightIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TextMorph } from "torph/react";
import { Card } from "@/components/ui/card";
import { DitherAnimation } from "@/components/ui/dither-animation";
import { DotPatternIcon, DotPatternIconAnimated, DotPatternIconSmall, GLYPHS } from "@/components/ui/dot-pattern-icon";
import { FloatingNav } from "@/components/ui/floating-nav";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { CUSTOMER_SERVICE_DITHER } from "@/components/dither-data";
import { EASE_OUT, fadeUp, inViewProps, spring, staggerContainer } from "@/lib/motion";

const ENTER = {
  initial: { opacity: 0, y: 18, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
};

const FEATURES = [
  {
    glyph: GLYPHS.wave,
    tint: "from-[#F75B1E]/20 to-amber-400/10",
    label: "text-[#F75B1E]",
    dot: "bg-[#F75B1E]",
    title: "Second-by-second signal",
    body: "Confidence, hesitation, engagement and more — detected continuously and grounded in the transcript.",
  },
  {
    glyph: GLYPHS.face,
    tint: "from-blue-400/20 to-blue-400/10",
    label: "text-blue-400",
    dot: "bg-blue-400",
    title: "Per-speaker read",
    body: "Pick whose behavior to analyze. Get a focused report on how they actually came across in the room.",
  },
  {
    glyph: GLYPHS.spark,
    tint: "from-emerald-400/20 to-emerald-400/10",
    label: "text-emerald-400",
    dot: "bg-emerald-400",
    title: "Conversation quality",
    body: "A single quality score with the dimensions behind it, plus the moments that moved the needle.",
  },
];

export default function HomePage() {
  const router = useRouter();
  const [meetingUrl, setMeetingUrl] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendBot(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/recall/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingUrl }),
      });
      const data = (await res.json()) as { reportUrl?: string; error?: unknown };
      if (!res.ok || !data.reportUrl) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Failed to send bot",
        );
      }
      router.push(data.reportUrl);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="bg-background min-h-screen">
      <FloatingNav />

      {/* Hero */}
      <section className="relative isolate overflow-hidden px-5 pb-24 pt-36 lg:px-10 lg:pt-40">
        {/* Ambient glows */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -left-20 -top-10 -z-10 h-96 w-96 rounded-full bg-[#F75B1E]/15 blur-3xl"
          animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 right-0 -z-10 h-96 w-96 rounded-full bg-pink-500/10 blur-3xl"
          animate={{ scale: [1, 1.12, 1], opacity: [0.4, 0.65, 0.4] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />

        <div className="mx-auto flex max-w-3xl flex-col items-start text-start">
          <motion.div {...ENTER} transition={spring}>
            <DotPatternIconAnimated
              rows={GLYPHS.wave}
              size={48}
              color="#F75B1E"
              className="mx-auto"
            />
          </motion.div>

          <motion.p
            {...ENTER}
            transition={{ ...spring, delay: 0.05 }}
            className="text-label text-[#F75B1E] mt-6"
          >
            Interhuman × Recall
          </motion.p>

          <motion.h1
            {...ENTER}
            transition={{ ...spring, delay: 0.1 }}
            className="text-display mt-4 text-gray-900 dark:text-white"
            style={{ textWrap: "balance" }}
          >
            See how the room actually felt.
          </motion.h1>

          <motion.p
            {...ENTER}
            transition={{ ...spring, delay: 0.15 }}
            className="mt-5  text-lg text-gray-500 dark:text-white/50"
            style={{ textWrap: "pretty" }}
          >
            Send a bot to your meeting. Afterwards, get a report on where a
            speaker was confident, hesitant, engaged, or losing the room —
            grounded in the transcript, second by second.
          </motion.p>

          <motion.form
            {...ENTER}
            transition={{ ...spring, delay: 0.2 }}
            onSubmit={sendBot}
            className="mt-9 flex w-full max-w-xl flex-col gap-3 sm:flex-row border-box-shadow p-2 rounded-full"
          >
            <Input
              type="url"
              required
              value={meetingUrl}
              onChange={(e) => setMeetingUrl(e.target.value)}
              placeholder="https://meet.google.com/… or Zoom / Teams link"
              className="h-12 flex-1 rounded-full px-5 text-base transition-[flex-grow] duration-300 ease-out motion-reduce:transition-none [@media(hover:hover)_and_(pointer:fine)]:hover:grow-[3]"
            />
            <Button
              type="submit"
              variant="gradient"
              size="lg"
              pill
              disabled={loading}
              className="group h-12 px-7"
            >
              <TextMorph>
                {loading ? "Sending bot…" : "Send bot to meeting"}
              </TextMorph>
            </Button>
          </motion.form>

          <motion.div
            {...ENTER}
            transition={{ ...spring, delay: 0.25 }}
            className="mt-5 text-sm text-gray-500 dark:text-white/50"
          >
            No meeting handy?{" "}
            <Link
              href="/demo"
              className="inline-flex items-center gap-1 font-medium text-[#F75B1E] transition-colors hover:text-[#F75B1E]/80"
            >
              Run the demo on a sample call
              <ArrowRightIcon className="size-3.5" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="px-5 py-24 lg:px-10">
        <div className="mx-auto max-w-5xl">
          <motion.div variants={fadeUp} {...inViewProps} className="mb-16 text-center">
            <p className="text-label text-gray-400 dark:text-white/30">
              What you get
            </p>
            <h2
              className="text-h1 mx-auto mt-4 max-w-2xl text-gray-900 dark:text-white"
              style={{ textWrap: "balance" }}
            >
              The transcript tells you what was said. We tell you how it landed.
            </h2>
          </motion.div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.6, delay: i * 0.06, ease: EASE_OUT }}
              >
                <Card className="h-full p-8">
                  <div
                    className={`relative flex size-14 items-center justify-center overflow-hidden rounded-2xl bg-gray-900 dark:bg-white/[0.04]`}
                  >
                    <span
                      className={`absolute inset-0 bg-gradient-to-br ${f.tint}`}
                    />
                    <DotPatternIcon
                      rows={f.glyph}
                      size={30}
                      className="relative"
                    />
                  </div>
    
                  <h3 className="mt-3 text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">
                    {f.title}
                  </h3>
                  <p
                    className="mt-2 text-base text-gray-500 dark:text-white/50"
                    style={{ textWrap: "pretty" }}
                  >
                    {f.body}
                  </p>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Build with Interhuman */}
      <section className="flex flex-col items-center bg-[#f26625] px-4 py-24">
        <motion.div
          variants={staggerContainer}
          {...inViewProps}
          className="flex max-w-xl flex-col items-center gap-4 text-center"
        >
          <DitherAnimation
            data={CUSTOMER_SERVICE_DITHER}
            playing
            color="white"
            className="mb-4 h-32 w-full max-w-xs"
          />
          <motion.h2
            variants={fadeUp}
            className="text-balance text-2xl font-medium text-white"
          >
            Build with Interhuman
          </motion.h2>
          <motion.p
            variants={fadeUp}
            className="text-pretty text-base leading-relaxed text-white/80"
          >
            Turn this example into your own product. This app is a starting
            point for building with Interhuman&apos;s behavioral intelligence
            APIs. Deploy your own copy in minutes, connect your API key, and
            experiment with confidence, clarity, and engagement signals in your
            own workflow.
          </motion.p>

          <motion.div
            variants={fadeUp}
            className="flex flex-wrap items-center justify-center gap-3 pt-2"
          >
            <a
              href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Finterhuman-ai%2Fyc-booth"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-black px-4 text-sm font-medium text-white transition-[transform,opacity] duration-150 hover:opacity-90 active:scale-[0.96]"
            >
              <svg className="size-4" viewBox="0 0 76 65" fill="currentColor">
                <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
              </svg>
              Deploy with Vercel
            </a>
            <a
              href="https://docs.interhuman.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-black px-4 text-sm font-medium text-black transition-[transform,background-color,border-color] duration-150 hover:border-white hover:bg-black/10 active:scale-[0.96]"
            >
              Read the Interhuman docs
            </a>
          </motion.div>
        </motion.div>
      </section>
    </div>
  );
}
