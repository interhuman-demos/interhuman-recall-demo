"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRightIcon } from "lucide-react";
import { GLYPHS, DotPatternIconSmall } from "@/components/ui/dot-pattern-icon";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/utils";

type NavLink = {
  href: string;
  label: string;
  glyph: keyof typeof GLYPHS;
};

const LINKS: NavLink[] = [
  { href: "/", label: "Home", glyph: "house" },
  { href: "/demo", label: "Sample", glyph: "spark" },
];

export function FloatingNav() {
  const pathname = usePathname();
  const reduce = useReducedMotion();

  return (
    <motion.nav
      initial={reduce ? false : { opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", duration: 0.7, bounce: 0, delay: 0.3 }}
      className="fixed left-1/2 top-5 z-[var(--z-nav)] -translate-x-1/2"
    >
      <div className="flex items-center gap-1 rounded-[50px] bg-white px-2 py-1.5 shadow-float dark:bg-white/[0.06] dark:shadow-[var(--shadow-float)] dark:backdrop-blur-xl">
        {LINKS.map((link) => {
          const active =
            link.href === "/"
              ? pathname === "/"
              : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "group flex items-center rounded-full px-3.5 py-1.5 text-[15px] font-medium tracking-[-0.01em] transition-colors duration-150",
                active
                  ? "text-black dark:text-white"
                  : "text-black/70 hover:bg-black/[0.04] hover:text-black dark:text-white/60 dark:hover:bg-white/[0.06] dark:hover:text-white",
              )}
            >
              <span
                className={cn(
                  "inline-block w-0 overflow-hidden opacity-0 transition-all duration-150 motion-reduce:transition-none",
                  active
                    ? "w-[18px] opacity-100 mr-1.5"
                    : "[@media(hover:hover)_and_(pointer:fine)]:group-hover:w-[18px] [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100 [@media(hover:hover)_and_(pointer:fine)]:group-hover:mr-1.5",
                )}
                aria-hidden
              >
                <DotPatternIconSmall rows={GLYPHS[link.glyph]} />
              </span>
              {link.label}
            </Link>
          );
        })}


        <span className="mx-1 h-4 w-px bg-black/[0.06] dark:bg-white/[0.08]" />

        <ThemeToggle />
      </div>
    </motion.nav>
  );
}
