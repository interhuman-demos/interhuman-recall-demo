"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DotPatternIcon,
  DotPatternIconSmall,
  GLYPHS,
  type GlyphName,
} from "@/components/ui/dot-pattern-icon";
import { FloatingNav } from "@/components/ui/floating-nav";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SignalBadge } from "@/components/ui/signal-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/utils";
import type { ControlValues, SandboxEntry } from "@/lib/sandbox/types";

/** Derive the defaults map from a controls record. */
function defaults(
  controls: SandboxEntry["controls"],
): SandboxEntry["defaults"] {
  return Object.fromEntries(
    Object.entries(controls).map(([key, ctrl]) => [key, ctrl.defaultValue]),
  );
}

/** Format a prop for the snippet: booleans, numbers, and strings — kept for future snippet helpers. */
function _p(value: string | number | boolean, key?: string): string {
  if (typeof value === "boolean") return value ? (key ?? "true") : "";
  if (typeof value === "number") return `{${value}}`;
  return `"${value}"`;
}
void _p;

const buttonControls: SandboxEntry["controls"] = {
  variant: {
    type: "select",
    label: "Variant",
    options: [
      "default",
      "gradient",
      "brand",
      "outline",
      "secondary",
      "ghost",
      "destructive",
      "link",
    ],
    defaultValue: "default",
  },
  size: {
    type: "select",
    label: "Size",
    options: ["xs", "sm", "default", "lg", "xl", "icon", "icon-sm"],
    defaultValue: "default",
  },
  pill: { type: "boolean", label: "Pill (rounded-full)", defaultValue: false },
  disabled: { type: "boolean", label: "Disabled", defaultValue: false },
  label: { type: "text", label: "Label", defaultValue: "Click me" },
};

const badgeControls: SandboxEntry["controls"] = {
  variant: {
    type: "select",
    label: "Variant",
    options: ["default", "secondary", "outline", "muted", "destructive"],
    defaultValue: "default",
  },
  label: { type: "text", label: "Label", defaultValue: "Badge" },
};

const inputControls: SandboxEntry["controls"] = {
  placeholder: {
    type: "text",
    label: "Placeholder",
    defaultValue: "Enter a value…",
  },
  disabled: { type: "boolean", label: "Disabled", defaultValue: false },
  invalid: { type: "boolean", label: "Invalid (aria-invalid)", defaultValue: false },
};

const selectControls: SandboxEntry["controls"] = {
  size: {
    type: "select",
    label: "Size",
    options: ["default", "sm"],
    defaultValue: "default",
  },
  disabled: { type: "boolean", label: "Disabled", defaultValue: false },
};

const cardControls: SandboxEntry["controls"] = {
  title: { type: "text", label: "Title", defaultValue: "Card title" },
  body: {
    type: "text",
    label: "Body text",
    defaultValue: "This is the card body.",
  },
  padding: {
    type: "select",
    label: "Padding",
    options: ["p-4", "p-6", "p-8"],
    defaultValue: "p-6",
  },
};

const signalBadgeControls: SandboxEntry["controls"] = {
  type: {
    type: "select",
    label: "Signal type",
    options: [
      "confidence",
      "interest",
      "agreement",
      "engagement",
      "confusion",
      "disagreement",
      "disengagement",
      "frustration",
      "hesitation",
      "skepticism",
      "stress",
      "uncertainty",
    ],
    defaultValue: "confidence",
  },
  reveal: {
    type: "boolean",
    label: "Reveal animation",
    defaultValue: false,
  },
};

const dotIconControls: SandboxEntry["controls"] = {
  glyph: {
    type: "select",
    label: "Glyph",
    options: Object.keys(GLYPHS),
    defaultValue: "wave",
  },
  size: {
    type: "number",
    label: "Size (px)",
    min: 18,
    max: 120,
    step: 2,
    defaultValue: 48,
  },
};

const dotIconSmallControls: SandboxEntry["controls"] = {
  glyph: {
    type: "select",
    label: "Glyph",
    options: Object.keys(GLYPHS),
    defaultValue: "spark",
  },
  size: {
    type: "number",
    label: "Size (px)",
    min: 12,
    max: 48,
    step: 1,
    defaultValue: 18,
  },
};

const spinnerControls: SandboxEntry["controls"] = {
  size: {
    type: "select",
    label: "Size",
    options: ["sm", "md", "lg"],
    defaultValue: "md",
  },
};

const skeletonControls: SandboxEntry["controls"] = {
  width: { type: "text", label: "Width (Tailwind class)", defaultValue: "w-48" },
  height: {
    type: "text",
    label: "Height (Tailwind class)",
    defaultValue: "h-4",
  },
};

const clipPathTabsControls: SandboxEntry["controls"] = {
  tabs: {
    type: "text",
    label: "Tab labels (comma-separated)",
    defaultValue: "Summary,Transcript,For next time",
  },
  defaultTab: {
    type: "number",
    label: "Default active tab (0-based)",
    min: 0,
    max: 2,
    step: 1,
    defaultValue: 0,
  },
};

const participantSidebarControls: SandboxEntry["controls"] = {
  count: {
    type: "number",
    label: "Number of participants",
    min: 1,
    max: 6,
    step: 1,
    defaultValue: 3,
  },
  activeIndex: {
    type: "number",
    label: "Active participant (0-based)",
    min: 0,
    max: 5,
    step: 1,
    defaultValue: 0,
  },
};

/* ── Inline preview components ─────────────────────────────────────────── */

function ClipPathTabsPreview({
  tabLabels,
  defaultIndex,
}: {
  tabLabels: string[];
  defaultIndex: number;
}) {
  const [active, setActive] = useState(
    Math.min(defaultIndex, tabLabels.length - 1),
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setActive(Math.min(defaultIndex, tabLabels.length - 1));
  }, [defaultIndex, tabLabels.length]);

  useEffect(() => {
    const container = containerRef.current;
    const activeEl = activeTabRef.current;
    if (!container || !activeEl) return;
    const { offsetLeft, offsetWidth } = activeEl;
    const clipLeft = (offsetLeft / container.offsetWidth) * 100;
    const clipRight =
      100 - ((offsetLeft + offsetWidth) / container.offsetWidth) * 100;
    container.style.clipPath = `inset(0 ${clipRight.toFixed()}% 0 ${clipLeft.toFixed()}% round 17px)`;
  }, [active, tabLabels]);

  return (
    <div className="relative flex w-full select-none">
      <ul className="relative flex w-full gap-1 rounded-[17px] bg-black/[0.04] p-1 dark:bg-white/[0.06]">
        {tabLabels.map((label, i) => (
          <li key={label} className="flex-1">
            <button
              type="button"
              ref={active === i ? activeTabRef : null}
              onClick={() => setActive(i)}
              className="flex h-8 w-full items-center justify-center rounded-[13px] px-4 text-sm font-medium text-black/70 transition-colors hover:text-black dark:text-white/60 dark:hover:text-white"
            >
              {label}
            </button>
          </li>
        ))}
      </ul>
      <div
        aria-hidden
        ref={containerRef}
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-[17px] transition-[clip-path] duration-[250ms] ease-[cubic-bezier(0.2,0,0,1)]"
        style={{ clipPath: "inset(0 66% 0 0% round 17px)" }}
      >
        <ul className="flex h-full w-full gap-1 rounded-[17px] bg-brand p-1">
          {tabLabels.map((label, i) => (
            <li key={label} className="flex-1">
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setActive(i)}
                className="pointer-events-auto flex h-8 w-full items-center justify-center rounded-[13px] px-4 text-sm font-medium text-white"
              >
                {label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const SAMPLE_PARTICIPANTS = [
  { name: "Alice Chen", talkTime: "8m 12s" },
  { name: "Bob Martin", talkTime: "5m 44s" },
  { name: "Caroline Wu", talkTime: "4m 03s" },
  { name: "David Park", talkTime: "2m 55s" },
  { name: "Emma Torres", talkTime: "1m 30s" },
  { name: "Frank Osei", talkTime: "0m 48s" },
];

function ParticipantSidebarPreview({
  count,
  activeIndex,
}: {
  count: number;
  activeIndex: number;
}) {
  const [active, setActive] = useState(Math.min(activeIndex, count - 1));
  const participants = SAMPLE_PARTICIPANTS.slice(0, count);

  useEffect(() => {
    setActive(Math.min(activeIndex, count - 1));
  }, [activeIndex, count]);

  return (
    <div className="w-56 overflow-hidden rounded-2xl border border-black/[0.06] bg-white/80 backdrop-blur-xl dark:border-white/[0.06] dark:bg-black/40">
      <div className="px-3 pb-3 pt-4">
        <p className="mb-2 px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-foreground/40">
          Participants
        </p>
        <ul className="flex flex-col gap-0.5">
          {participants.map((p, i) => {
            const isActive = i === active;
            return (
              <li key={p.name}>
                <button
                  type="button"
                  onClick={() => setActive(i)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors duration-150",
                    isActive
                      ? "bg-brand/[0.08] text-brand"
                      : "text-foreground/80 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold uppercase",
                      isActive
                        ? "bg-brand text-white"
                        : "bg-black/[0.06] text-foreground/60 dark:bg-white/[0.08] dark:text-white/60",
                    )}
                  >
                    {p.name.charAt(0)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div
                      className={cn(
                        "truncate text-sm font-medium",
                        isActive && "text-brand",
                      )}
                    >
                      {p.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {p.talkTime}
                    </div>
                  </div>
                  {isActive && (
                    <span className="size-1.5 shrink-0 rounded-full bg-brand" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export const SANDBOX_REGISTRY: SandboxEntry[] = [
  /* ------------------------------------------------------------------ */
  /* Inputs                                                               */
  /* ------------------------------------------------------------------ */
  {
    id: "button",
    name: "Button",
    group: "Inputs",
    controls: buttonControls,
    defaults: defaults(buttonControls),
    render(v: ControlValues) {
      const variant = v.variant as
        | "default"
        | "gradient"
        | "brand"
        | "outline"
        | "secondary"
        | "ghost"
        | "destructive"
        | "link";
      const size = v.size as
        | "default"
        | "xs"
        | "sm"
        | "lg"
        | "xl"
        | "icon"
        | "icon-sm";
      return (
        <Button
          variant={variant}
          size={size}
          pill={v.pill as boolean}
          disabled={v.disabled as boolean}
        >
          {String(v.label)}
        </Button>
      );
    },
    snippet(v: ControlValues) {
      const attrs: string[] = [];
      if (v.variant !== "default") attrs.push(`variant="${v.variant}"`);
      if (v.size !== "default") attrs.push(`size="${v.size}"`);
      if (v.pill) attrs.push("pill");
      if (v.disabled) attrs.push("disabled");
      const attrsStr = attrs.length ? " " + attrs.join(" ") : "";
      return `<Button${attrsStr}>\n  ${v.label}\n</Button>`;
    },
  },
  {
    id: "input",
    name: "Input",
    group: "Inputs",
    controls: inputControls,
    defaults: defaults(inputControls),
    render(v: ControlValues) {
      return (
        <Input
          placeholder={String(v.placeholder)}
          disabled={v.disabled as boolean}
          aria-invalid={v.invalid ? "true" : undefined}
          className="w-72"
        />
      );
    },
    snippet(v: ControlValues) {
      const attrs: string[] = [`placeholder="${v.placeholder}"`];
      if (v.disabled) attrs.push("disabled");
      if (v.invalid) attrs.push(`aria-invalid="true"`);
      return `<Input ${attrs.join(" ")} />`;
    },
  },
  {
    id: "select",
    name: "Select",
    group: "Inputs",
    controls: selectControls,
    defaults: defaults(selectControls),
    render(v: ControlValues) {
      const size = v.size as "default" | "sm";
      return (
        <Select>
          <SelectTrigger size={size} disabled={v.disabled as boolean}>
            <SelectValue>
              {(val: string | null) => val ?? "Pick an option…"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alpha">Alpha</SelectItem>
            <SelectItem value="beta">Beta</SelectItem>
            <SelectItem value="gamma">Gamma</SelectItem>
          </SelectContent>
        </Select>
      );
    },
    snippet(v: ControlValues) {
      const sizeAttr = v.size !== "default" ? ` size="${v.size}"` : "";
      const disabledAttr = v.disabled ? " disabled" : "";
      return `<Select>
  <SelectTrigger${sizeAttr}${disabledAttr}>
    <SelectValue placeholder="Pick an option…" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="alpha">Alpha</SelectItem>
    <SelectItem value="beta">Beta</SelectItem>
  </SelectContent>
</Select>`;
    },
  },
  {
    id: "clip-path-tabs",
    name: "ClipPathTabs",
    group: "Inputs",
    controls: clipPathTabsControls,
    defaults: defaults(clipPathTabsControls),
    render(v: ControlValues) {
      const labels = String(v.tabs)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      return (
        <div className="w-full max-w-md">
          <ClipPathTabsPreview
            tabLabels={labels}
            defaultIndex={v.defaultTab as number}
          />
        </div>
      );
    },
    snippet(v: ControlValues) {
      const labels = String(v.tabs)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const tabsConst = `const TABS = [${labels.map((l) => `"${l}"`).join(", ")}] as const;
type Tab = typeof TABS[number];`;
      return `${tabsConst}

function ClipPathTabs({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const el = activeTabRef.current;
    if (!container || !el) return;
    const l = (el.offsetLeft / container.offsetWidth) * 100;
    const r = 100 - ((el.offsetLeft + el.offsetWidth) / container.offsetWidth) * 100;
    container.style.clipPath = \`inset(0 \${r.toFixed()}% 0 \${l.toFixed()}% round 17px)\`;
  }, [active]);

  return (
    <div className="relative flex w-full select-none">
      <ul className="relative flex w-full gap-1 rounded-[17px] bg-black/[0.04] p-1 dark:bg-white/[0.06]">
        {TABS.map((tab) => (
          <li key={tab} className="flex-1">
            <button ref={active === tab ? activeTabRef : null}
              onClick={() => onChange(tab)}
              className="flex h-8 w-full items-center justify-center rounded-[13px] px-4 text-sm font-medium text-black/70 hover:text-black dark:text-white/60 dark:hover:text-white"
            >{tab}</button>
          </li>
        ))}
      </ul>
      <div aria-hidden ref={containerRef}
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-[17px] transition-[clip-path] duration-[250ms] ease-[cubic-bezier(0.2,0,0,1)]"
        style={{ clipPath: "inset(0 66% 0 0% round 17px)" }}
      >
        <ul className="flex h-full w-full gap-1 rounded-[17px] bg-brand p-1">
          {TABS.map((tab) => (
            <li key={tab} className="flex-1">
              <button tabIndex={-1} onClick={() => onChange(tab)}
                className="pointer-events-auto flex h-8 w-full items-center justify-center rounded-[13px] px-4 text-sm font-medium text-white"
              >{tab}</button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}`;
    },
  },

  /* ------------------------------------------------------------------ */
  /* Display                                                              */
  /* ------------------------------------------------------------------ */
  {
    id: "card",
    name: "Card",
    group: "Display",
    controls: cardControls,
    defaults: defaults(cardControls),
    render(v: ControlValues) {
      return (
        <Card className={`w-72 ${v.padding}`}>
          <CardHeader>
            <CardTitle>{String(v.title)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">{String(v.body)}</p>
          </CardContent>
        </Card>
      );
    },
    snippet(v: ControlValues) {
      const padAttr = v.padding !== "p-6" ? ` className="${v.padding}"` : "";
      return `<Card${padAttr}>
  <CardHeader>
    <CardTitle>${v.title}</CardTitle>
  </CardHeader>
  <CardContent>
    <p>${v.body}</p>
  </CardContent>
</Card>`;
    },
  },
  {
    id: "badge",
    name: "Badge",
    group: "Display",
    controls: badgeControls,
    defaults: defaults(badgeControls),
    render(v: ControlValues) {
      const variant = v.variant as
        | "default"
        | "secondary"
        | "outline"
        | "muted"
        | "destructive";
      return <Badge variant={variant}>{String(v.label)}</Badge>;
    },
    snippet(v: ControlValues) {
      const variantAttr =
        v.variant !== "default" ? ` variant="${v.variant}"` : "";
      return `<Badge${variantAttr}>${v.label}</Badge>`;
    },
  },
  {
    id: "signal-badge",
    name: "SignalBadge",
    group: "Display",
    controls: signalBadgeControls,
    defaults: defaults(signalBadgeControls),
    render(v: ControlValues) {
      return (
        <SignalBadge
          key={String(v.type) + String(v.reveal)}
          type={v.type as Parameters<typeof SignalBadge>[0]["type"]}
          reveal={v.reveal as boolean}
        />
      );
    },
    snippet(v: ControlValues) {
      const revealAttr = v.reveal ? " reveal" : "";
      return `<SignalBadge type="${v.type}"${revealAttr} />`;
    },
  },
  {
    id: "skeleton",
    name: "Skeleton",
    group: "Display",
    controls: skeletonControls,
    defaults: defaults(skeletonControls),
    render(v: ControlValues) {
      return (
        <div className="flex flex-col gap-3">
          <Skeleton className={`${v.width} ${v.height}`} />
          <Skeleton className={`${v.width} ${v.height} w-3/4`} />
          <Skeleton className={`${v.width} ${v.height} w-1/2`} />
        </div>
      );
    },
    snippet(v: ControlValues) {
      return `<Skeleton className="${v.width} ${v.height}" />`;
    },
  },

  /* ------------------------------------------------------------------ */
  /* Feedback                                                             */
  /* ------------------------------------------------------------------ */
  {
    id: "spinner",
    name: "Spinner",
    group: "Feedback",
    controls: spinnerControls,
    defaults: defaults(spinnerControls),
    render(v: ControlValues) {
      const size = v.size as "sm" | "md" | "lg";
      return <Spinner size={size} />;
    },
    snippet(v: ControlValues) {
      const sizeAttr = v.size !== "md" ? ` size="${v.size}"` : "";
      return `<Spinner${sizeAttr} />`;
    },
  },

  /* ------------------------------------------------------------------ */
  /* Identity                                                             */
  /* ------------------------------------------------------------------ */
  {
    id: "dot-pattern-icon",
    name: "DotPatternIcon",
    group: "Identity",
    controls: dotIconControls,
    defaults: defaults(dotIconControls),
    render(v: ControlValues) {
      const glyph = v.glyph as GlyphName;
      return (
        <div className="rounded-2xl bg-gray-900 p-4">
          <DotPatternIcon rows={GLYPHS[glyph]} size={v.size as number} />
        </div>
      );
    },
    snippet(v: ControlValues) {
      const sizeAttr = v.size !== 48 ? ` size={${v.size}}` : "";
      return `<DotPatternIcon rows={GLYPHS.${v.glyph}}${sizeAttr} />`;
    },
  },
  {
    id: "dot-pattern-icon-small",
    name: "DotPatternIconSmall",
    group: "Identity",
    controls: dotIconSmallControls,
    defaults: defaults(dotIconSmallControls),
    render(v: ControlValues) {
      const glyph = v.glyph as GlyphName;
      return (
        <DotPatternIconSmall rows={GLYPHS[glyph]} size={v.size as number} />
      );
    },
    snippet(v: ControlValues) {
      const sizeAttr = v.size !== 18 ? ` size={${v.size}}` : "";
      return `<DotPatternIconSmall rows={GLYPHS.${v.glyph}}${sizeAttr} />`;
    },
  },

  /* ------------------------------------------------------------------ */
  /* Composition — render-only                                           */
  /* ------------------------------------------------------------------ */
  {
    id: "theme-toggle",
    name: "ThemeToggle",
    group: "Composition",
    controls: {},
    defaults: {},
    render(_v: ControlValues) {
      return <ThemeToggle />;
    },
    snippet(_v: ControlValues) {
      return `<ThemeToggle />`;
    },
  },
  {
    id: "floating-nav",
    name: "FloatingNav",
    group: "Composition",
    controls: {},
    defaults: {},
    render(_v: ControlValues) {
      return (
        <div className="relative h-16 w-full overflow-hidden rounded-2xl bg-[#D0D5D4] dark:bg-[#0a0a0f]">
          <div className="absolute inset-x-0 top-4 flex justify-center">
            <FloatingNav />
          </div>
        </div>
      );
    },
    snippet(_v: ControlValues) {
      return `<FloatingNav />`;
    },
  },
  {
    id: "participant-sidebar",
    name: "ParticipantSidebar",
    group: "Composition",
    controls: participantSidebarControls,
    defaults: defaults(participantSidebarControls),
    render(v: ControlValues) {
      return (
        <ParticipantSidebarPreview
          count={v.count as number}
          activeIndex={v.activeIndex as number}
        />
      );
    },
    snippet(_v: ControlValues) {
      return `function ParticipantSidebar({ reportId, participants, focalSpeaker }) {
  const [busy, setBusy] = useState(false);
  const sorted = [...participants].sort((a, b) => b.talkTimeS - a.talkTimeS);

  async function refocus(id) {
    setBusy(true);
    await fetch(\`/api/sessions/\${reportId}/refocus\`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ focalParticipantId: id }),
    });
    window.location.reload();
  }

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col
      border-r border-black/[0.06] bg-white/80 backdrop-blur-xl
      dark:border-white/[0.06] dark:bg-black/40">
      <div className="flex-1 overflow-y-auto px-3 pb-4 pt-20">
        <p className="text-label text-muted-foreground mb-2 px-2">Participants</p>
        <ul className="flex flex-col gap-0.5">
          {sorted.map((p) => {
            const active = p.name === focalSpeaker;
            return (
              <li key={p.id}>
                <button disabled={busy || active}
                  onClick={() => !active && refocus(p.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2 py-2",
                    active ? "bg-brand/[0.08]" : "hover:bg-black/[0.04]",
                  )}>
                  <span className={cn("flex size-7 items-center justify-center rounded-full text-xs font-semibold uppercase",
                    active ? "bg-brand text-white" : "bg-black/[0.06] text-foreground/60")}>
                    {p.name.charAt(0)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className={cn("truncate text-sm font-medium", active && "text-brand")}>
                      {p.name}
                    </div>
                    <div className="text-muted-foreground text-xs">{formatTime(p.talkTimeS)}</div>
                  </div>
                  {active && <span className="size-1.5 rounded-full bg-brand" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}`;
    },
  },
];

/** Group the registry by their `group` field. */
export function groupedRegistry(): Map<string, SandboxEntry[]> {
  const map = new Map<string, SandboxEntry[]>();
  for (const entry of SANDBOX_REGISTRY) {
    const list = map.get(entry.group) ?? [];
    list.push(entry);
    map.set(entry.group, list);
  }
  return map;
}

/** Look up a single entry by id. */
export function getEntry(id: string): SandboxEntry | undefined {
  return SANDBOX_REGISTRY.find((e) => e.id === id);
}

// Suppress the `_p` helper warning (reserved for future snippet use).
void _p;
