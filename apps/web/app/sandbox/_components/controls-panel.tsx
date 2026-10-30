"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Control, ControlValues } from "@/lib/sandbox/types";

type ControlsPanelProps = {
  controls: Record<string, Control>;
  values: ControlValues;
  onChange: (key: string, value: string | number | boolean) => void;
};

export function ControlsPanel({ controls, values, onChange }: ControlsPanelProps) {
  const entries = Object.entries(controls);
  if (entries.length === 0) {
    return (
      <p className="font-mono text-xs text-white/30 dark:text-white/30 text-foreground/30">
        No controls for this component.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {entries.map(([key, ctrl]) => (
        <div key={key} className="flex flex-col gap-1.5">
          <label className="font-mono text-xs font-semibold uppercase tracking-[0.15em] text-foreground/50">
            {ctrl.label}
          </label>

          {ctrl.type === "boolean" && (
            <button
              type="button"
              role="switch"
              aria-checked={values[key] as boolean}
              onClick={() => onChange(key, !(values[key] as boolean))}
              className="flex h-6 w-10 items-center rounded-full transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{
                backgroundColor: values[key]
                  ? "var(--color-brand)"
                  : "var(--muted)",
              }}
            >
              <span
                className="mx-0.5 size-5 rounded-full bg-white shadow-sm transition-transform duration-150"
                style={{
                  transform: values[key]
                    ? "translateX(16px)"
                    : "translateX(0)",
                }}
              />
            </button>
          )}

          {ctrl.type === "select" && (
            <Select
              value={String(values[key])}
              onValueChange={(v: string | null) => v !== null && onChange(key, v)}
            >
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ctrl.options.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {ctrl.type === "text" && (
            <Input
              value={String(values[key])}
              onChange={(e) => onChange(key, e.target.value)}
              className="h-8 text-sm"
            />
          )}

          {ctrl.type === "number" && (
            <div className="flex flex-col gap-1">
              <Input
                type="number"
                min={ctrl.min}
                max={ctrl.max}
                step={ctrl.step ?? 1}
                value={values[key] as number}
                onChange={(e) =>
                  onChange(key, Number(e.target.value))
                }
                className="h-8 text-sm"
              />
              {(ctrl.min !== undefined || ctrl.max !== undefined) && (
                <input
                  type="range"
                  min={ctrl.min}
                  max={ctrl.max}
                  step={ctrl.step ?? 1}
                  value={values[key] as number}
                  onChange={(e) => onChange(key, Number(e.target.value))}
                  className="accent-[var(--color-brand)] w-full cursor-pointer"
                />
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
