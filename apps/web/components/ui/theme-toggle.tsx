"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      pill
      aria-label="Toggle theme"
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {mounted ? (
        <span className="relative flex size-4 items-center justify-center">
          <SunIcon
            className="absolute size-4 transition-all duration-[var(--duration-normal)] ease-[var(--ease-out)]"
            style={{
              opacity: isDark ? 0 : 1,
              transform: isDark ? "scale(0.25) rotate(-90deg)" : "scale(1)",
              filter: isDark ? "blur(4px)" : "blur(0)",
            }}
          />
          <MoonIcon
            className="absolute size-4 transition-all duration-[var(--duration-normal)] ease-[var(--ease-out)]"
            style={{
              opacity: isDark ? 1 : 0,
              transform: isDark ? "scale(1)" : "scale(0.25) rotate(90deg)",
              filter: isDark ? "blur(0)" : "blur(4px)",
            }}
          />
        </span>
      ) : (
        <span className="size-4" />
      )}
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
