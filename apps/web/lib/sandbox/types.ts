import type { ReactNode } from "react";

/** A boolean toggle control. */
export type BooleanControl = {
  type: "boolean";
  label: string;
  defaultValue: boolean;
};

/** A single-select control (renders as a <select> dropdown). */
export type SelectControl = {
  type: "select";
  label: string;
  options: string[];
  defaultValue: string;
};

/** A free-text input control. */
export type TextControl = {
  type: "text";
  label: string;
  defaultValue: string;
};

/** A numeric input control. */
export type NumberControl = {
  type: "number";
  label: string;
  min?: number;
  max?: number;
  step?: number;
  defaultValue: number;
};

export type Control =
  | BooleanControl
  | SelectControl
  | TextControl
  | NumberControl;

/** The resolved values for a component's controls keyed by control key. */
export type ControlValues = Record<string, string | number | boolean>;

/** A group label for the sidebar. */
export type SandboxGroup =
  | "Inputs"
  | "Display"
  | "Feedback"
  | "Identity"
  | "Composition";

/**
 * A single entry in the component sandbox registry.
 *
 * `controls` is a record mapping prop names → their control spec.
 * `defaults` is derived from `controls` automatically by the registry helper.
 * `render` receives the current ControlValues and returns the live preview node.
 * `snippet` receives the current ControlValues and returns a JSX string.
 */
export type SandboxEntry = {
  id: string;
  name: string;
  group: SandboxGroup;
  controls: Record<string, Control>;
  defaults: ControlValues;
  render: (values: ControlValues) => ReactNode;
  snippet: (values: ControlValues) => string;
};
