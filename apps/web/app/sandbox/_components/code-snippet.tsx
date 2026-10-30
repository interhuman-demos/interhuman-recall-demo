"use client";

import { motion, AnimatePresence } from "motion/react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { EASE_OUT } from "@/lib/motion";

type CodeSnippetProps = {
  code: string;
};

export function CodeSnippet({ code }: CodeSnippetProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="group relative">
      <pre className="overflow-x-auto rounded-2xl bg-black/[0.04] p-4 dark:bg-white/[0.04]">
        <code className="font-mono text-sm leading-relaxed text-foreground/80 dark:text-foreground/70 whitespace-pre">
          {code}
        </code>
      </pre>

      <button
        type="button"
        onClick={copy}
        aria-label="Copy code"
        className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-xl bg-white/80 shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-all duration-150 ease-out hover:bg-white active:scale-95 dark:bg-white/[0.08] dark:hover:bg-white/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring opacity-0 group-hover:opacity-100"
      >
        <AnimatePresence mode="wait" initial={false}>
          {copied ? (
            <motion.span
              key="check"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={{ duration: 0.15, ease: EASE_OUT }}
              className="flex items-center justify-center text-[var(--color-brand)]"
            >
              <CheckIcon className="size-4" />
            </motion.span>
          ) : (
            <motion.span
              key="copy"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={{ duration: 0.15, ease: EASE_OUT }}
              className="flex items-center justify-center text-foreground/60"
            >
              <CopyIcon className="size-4" />
            </motion.span>
          )}
        </AnimatePresence>
      </button>
    </div>
  );
}
