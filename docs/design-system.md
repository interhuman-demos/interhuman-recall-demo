# Visual Language — "Premium Soft-Tech"

**Status:** Living reference for the app's look & feel
**Stack:** Next.js + Tailwind CSS (v4, `@theme inline`) + Framer Motion

A handoff spec to recreate the visual language of the app. Ignore any physical
device shell; this captures the surrounding design system.

> **How this maps to our code.** This doc states the *intent* in raw values.
> In the codebase those values live as design tokens, so prefer the token over
> the literal: `--color-brand` (hot orange), `shadow-float` (6-stop pill
> shadow), `var(--shadow-card)` (bento ring + drop), `--ease-out` =
> `cubic-bezier(0.2,0,0,1)`, and the `text-label` / `text-display` / `text-h1`
> typography utilities in `apps/web/app/globals.css`. The dot-matrix glyph lives
> at `apps/web/components/ui/dot-pattern-icon.tsx`; the nav at
> `apps/web/components/ui/floating-nav.tsx`.

---

## 1. Core Aesthetic

The look is "premium soft-tech" — a light, airy, almost Apple-like marketing
surface that drops into deep near-black "product" sections. Two worlds sharing
one grammar:

- **Light world** (hero, features): warm grey `#D0D5D4` / off-white `#f0f2f1`,
  white cards, ultra-soft layered shadows, no hard borders.
- **Dark world** (concept cards, footer): near-black `#0a0a0f` → `#080810`,
  frosted translucent surfaces (`white/[0.06]`), thin hairline borders
  (`white/[0.06]`).

The unifying motifs: a single hot-orange accent, 9×9 dot-matrix glyphs, mono
typography for labels/data, and soft spring motion on scroll.

## 2. Color Tokens

| Role | Value |
| --- | --- |
| Brand accent | `#F75B1E` (hot orange — the ONLY saturated brand color; use sparingly) |
| Light bg base | `#D0D5D4` (warm grey — hero, often behind a bg image) |
| Light section bg | `#f0f2f1` (near-white — feature/bento section) |
| Dark bg | `#0a0a0f` (concept section) |
| Dark bg deeper | `#080810` (footer carousel) |
| Foreground (dark) | `#f0f0ff` (very slightly cool white) |
| Near-black UI | gradient `linear(#27282f 0% → #0d0c0f 100%)` (buttons, "Power On") |

**Text opacity ladder** (this is critical to the feel — text is rarely pure):

- Light bg: headings `text-gray-900`, body `text-gray-500`, muted data `text-gray-400`.
- Dark bg: headings `text-white`, body `text-white/50`, hints `text-white/30`.
- Nav links: `text-black/70` → hover `text-black`.

**Accent palette for category cards** (each concept card gets ONE pastel tint at
low opacity over dark): `red-400`, `blue-400`, `#F75B1E`, `emerald-400`,
`amber-400`, `pink-400` — always paired as a `bg-gradient-to-br from-[color]/20
to-[color2]/10` with a matching `text-[color]` label and a tiny 1.5px solid dot.

## 3. Typography

Fonts loaded via `next/font` and exposed as CSS vars:

- `--font-geist-sans` (Geist) — default body/headings.
- `--font-geist-mono` (Geist Mono) — labels, stats, scores, ranks, eyebrows.
- `--font-silkscreen`, `--font-play-the-game` — pixel/display fonts (device-only, optional here).

Type rules:

- **Headings:** `font-semibold tracking-tight`, sizes `text-4xl sm:text-5xl`
  (section), `text-2xl` (card title). Always `text-balance`.
- **Body:** `text-lg` (section lede) / `text-base` (card body), `text-gray-500`
  or `text-white/50`, `text-pretty`.
- **Eyebrows / labels:** `font-mono text-sm font-semibold uppercase
  tracking-[0.2em]` — orange on dark, `white/30` for quieter ones.
- **Numeric data** (scores, ranks): `font-mono ... tabular-nums` — always
  tabular for alignment.
- Letter-spacing is tight on display (`tracking-tight`, `tracking-[-0.01em]`)
  and wide on mono labels (`tracking-[0.2em]`).

## 4. The Dot-Matrix Icon System (signature element)

A 9×9 grid of rounded squares driven by an array of 9 binary strings. "On" dots
are near-opaque, "off" dots are barely-there (this ghost grid is the whole
charm). Two sizes exist.

**Large** (`DotPatternIcon`, white-on-dark, 35px):

```tsx
export function DotPatternIcon({ rows }: { rows: string[] }) {
  const cell = 3;
  const gap = 0.9;
  const pitch = cell + gap;
  const size = rows.length * cell + (rows.length - 1) * gap;
  return (
    <svg width="35" height="35" viewBox={`0 0 ${size} ${size}`} fill="none" aria-hidden>
      {rows.map((row, y) =>
        [...row].map((dot, x) => (
          <rect
            key={`${x}-${y}`}
            x={x * pitch} y={y * pitch}
            width={cell} height={cell} rx="0.9"
            fill="white"
            opacity={dot === "1" ? 0.92 : 0.09}
          />
        ))
      )}
    </svg>
  );
}
```

**Small** (nav, `currentColor`, 18px): identical pattern but `cell=2.4`,
`gap=0.7`, `rx=0.7`, `fill="currentColor"`, on/off opacities `0.8` / `0.06`.

Key parameters to preserve: square cells (not circles) with tiny `rx` (~30% of
cell), a gap ≈ 30% of cell, on-opacity ~0.8–0.92, off-opacity ~0.06–0.09 (the
faint full grid must remain visible). Glyphs are hand-authored bitmaps — design
new ones as 9-string arrays of 0/1.

## 5. Shadows & Surfaces (the "soft" signature)

Never use plain `shadow-md`. Two recipes:

**Floating pill / nav** — a 6-stop, ultra-low-opacity stacked shadow (each
`rgba(0,0,0,0.02)`):

```css
box-shadow:
  rgba(0,0,0,0.02) 0px 0px 0px 1px,
  rgba(0,0,0,0.02) 0px 1px 1px 0.5px,
  rgba(0,0,0,0.02) 0px 3px 3px 1.5px,
  rgba(0,0,0,0.02) 0px 6px 6px -3px,
  rgba(0,0,0,0.02) 0px 12px 12px -6px,
  rgba(0,0,0,0.02) 0px 24px 24px -12px;
```

**Bento cards** — hairline ring + soft drop, no border:

```css
box-shadow:
  0 0 0 1px rgba(0,0,0,0.06),
  0 1px 2px -1px rgba(0,0,0,0.06),
  0 2px 4px 0 rgba(0,0,0,0.04);
```

**Inner chips** (signal tiles, leaderboard rows): `bg-white/80` (or `/70`) +
`shadow-[0_2px_8px_rgba(0,0,0,0.06)]` or a faint ring
`0_0_0_1px_rgba(0,0,0,0.03)`. The translucency over white creates subtle depth
layering.

On dark surfaces, "border" = `border border-white/[0.06]` (hairline) and depth =
translucency, not shadow.

**Radii:** pills `rounded-[50px]` / `rounded-full`; cards `rounded-3xl`; chips
`rounded-2xl` / `rounded-xl`; CTA buttons `rounded-[100px]`.

## 6. The Floating Navbar Pattern

- Fixed, centered: `fixed left-1/2 top-5 z-50 -translate-x-1/2`.
- White pill: `flex items-center gap-1 rounded-[50px] bg-white px-2 py-1.5` +
  the 6-stop shadow above.
- Sections separated by a hairline divider: `mx-1 h-4 w-px bg-black/[0.06]`.
- Links: `rounded-full px-3.5 py-1.5 text-[15px] font-medium tracking-[-0.01em]
  text-black/70 hover:bg-black/[0.04] hover:text-black transition-colors
  duration-150`.
- **Signature nav detail:** on hover (desktop only), a dot-matrix glyph
  slides/fades in to the left of the label via a width+opacity transition, gated
  to fine pointers and respecting reduced motion:

```
inline-block w-0 overflow-hidden opacity-0 transition-all duration-150
[@media(hover:hover)_and_(pointer:fine)]:group-hover:w-[18px]
[@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100
motion-reduce:transition-none
```

- **Primary nav CTA** ("Power On"): the near-black gradient button,
  `rounded-full px-4 py-1.5 text-white`, `active:scale-[0.96]`, with a small
  chevron SVG at `opacity-80`.

## 7. Buttons & Interaction Feel

- **Primary CTA:** near-black gradient `linear-gradient(rgb(39,40,47) 0%,
  rgb(13,12,15) 100%)`, `rounded-[100px]`, generous padding (`px-8 py-4`). (The
  orange `bg-[#F75B1E]` is also wired in — orange is the alt accent CTA.)
- **Press/hover physics** (apply consistently):
  - Hover (fine pointer only): `hover:scale-[1.02] hover:-translate-y-px`.
  - Active: `active:scale-[0.97] active:translate-y-0` (pills use `active:scale-[0.96]`).
  - `transition-transform duration-150 will-change-transform`.
  - Always add `motion-reduce:` resets so reduced-motion users get no scaling.

Buttons feel "physical": subtle lift on hover, firm press-down on active. Keep
durations short (120–150ms).

## 8. Motion Language (Framer Motion)

Two distinct curves, used consistently:

- **Entrance springs** (hero elements): `transition={{ type: "spring", duration:
  0.7, bounce: 0 }}` — no overshoot, just smooth settle. Initial `{ opacity: 0,
  y: 18, scale: 0.98 }`.
- **Scroll reveals** (every section + card): `initial={{ opacity:0, y:20-24 }}` →
  `whileInView={{ opacity:1, y:0 }}`, `viewport={{ once:true, margin:"-60px" to
  "-80px" }}`, `transition={{ duration:0.5-0.6, ease:[0.2,0,0,1] }}`.
- Custom easing `[0.2, 0, 0, 1]` is the house ease-out — use it everywhere for
  reveals and color transitions.
- **Stagger:** sibling cards delay by `i * 0.06` (or fixed `0.08, 0.12, 0.16`
  steps). Keep stagger small and snappy.
- **Ambient loops** (glows): `animate={{ scale:[1,1.15,1],
  opacity:[0.5,0.8,0.5] }}`, `transition={{ duration:5, repeat:Infinity,
  ease:"easeInOut" }}`.
- **Nav drops in from top:** `initial={{ opacity:0, y:-12 }}`, `delay:0.3`.

## 9. Layout & Sections

- Section container: `mx-auto max-w-5xl` (or `max-w-7xl` for hero), `px-5 py-24
  lg:px-10`.
- Section headers centered, `mb-16`, eyebrow → `text-4xl/5xl` heading →
  `max-w-xl/2xl` lede.
- Bento grid: `grid gap-4 sm:grid-cols-2 lg:grid-cols-3`; feature cards span
  (`lg:col-span-2 lg:row-span-2` for the hero card). Cards are white
  `rounded-3xl p-8` with the bento shadow.
- Ambient glows in hero: absolutely-positioned blurred circles, `h-96 w-96
  rounded-full bg-[#F75B1E]/15 blur-3xl` (orange top-left) + `bg-pink-500/10`
  (bottom-right). `pointer-events-none`, behind content.
- Sections alternate light → light → dark → deeper-dark for rhythm.

## 10. Recreation Checklist

- [ ] Set up fonts: Geist (sans) + Geist Mono via `next/font`, exposed as CSS
      vars; mono is for ALL labels/numbers.
- [ ] Define the color tokens above; restrict saturated color to `#F75B1E` plus
      the 6 pastel card tints.
- [ ] Build the `DotPatternIcon` (9×9, square cells, faint off-dots) — it's the
      identity element.
- [ ] Build the floating white nav pill with the 6-stop micro-shadow + hover
      dot-matrix reveal.
- [ ] Use the bento shadow recipe (ring + soft drop, no borders) for all light
      cards; translucency + hairline border for dark cards.
- [ ] Apply the motion language: spring `bounce:0` for entrances, `[0.2,0,0,1]`
      ease-out for scroll reveals, small staggers, `once:true` viewport.
- [ ] Give every interactive element the hover-lift / active-press physics with
      `motion-reduce` fallbacks.
- [ ] Keep text in the opacity ladder (`gray-500`/`white/50` body, never pure
      where it can be softened), with `text-balance`/`text-pretty`.

> The whole feel comes from restraint: one accent color, near-invisible shadows
> and grids, soft springs, and mono labels doing the "techy" talking. Don't add
> borders or hard shadows on the light surfaces, and never let the off-state
> dots disappear entirely.
