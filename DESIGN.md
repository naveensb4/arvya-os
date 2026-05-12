# Arvya OS Design System

Reference for building consistent UI across all surfaces. Not a component library — a set of constraints.

## Color Palette

| Token | Value | Usage |
|---|---|---|
| Background | `#f6f2ea` / `bg-[#f6f2ea]` | Page background (warm cream) |
| Foreground | `#1c1917` / `text-stone-950` | Primary text |
| Card | `bg-white` | All card surfaces |
| Secondary text | `text-stone-600` | Descriptions, metadata |
| Tertiary text | `text-stone-500` | Eyebrows, labels |
| Placeholder | `text-stone-400` | Input placeholders |
| Border | `border-stone-200` | Default card/input borders |
| Border hover | `border-stone-950` | Focus/hover states |
| Accent | `text-amber-700` | Eyebrow labels, tags |
| Accent bg | `bg-amber-50` / `border-amber-100` | Highlight areas |
| Accent border | `border-amber-600` | Blockquote left border |
| Button primary | `bg-stone-950` / `text-white` | Primary actions |
| Button hover | `bg-stone-800` | Primary button hover |
| Hover bg | `bg-stone-50` | Secondary button hover, row hover |
| Info bg | `bg-stone-100` | Badges, subtle backgrounds |

No blue, green, or red utility colors. Status is communicated through text and layout, not color coding.

## Typography

**Font:** Geist (sans) + Geist Mono (code). Loaded via `next/font/google`, injected as CSS variables.

| Scale | Class | Usage |
|---|---|---|
| Page title | `text-4xl font-semibold tracking-tight` | Main headings |
| Section title | `text-3xl font-semibold` | Card headings |
| Subsection | `text-lg font-semibold` | In-card section titles |
| Body | `text-sm` (default) | General content |
| Small | `text-xs` | Badges, metadata, timestamps |
| Eyebrow | `.eyebrow` | Section labels — `text-sm font-semibold uppercase tracking-[0.18em] text-stone-500` |
| Tag | `text-xs font-semibold uppercase tracking-widest text-amber-700` | Category markers |

## Spacing

| Pattern | Values |
|---|---|
| Page padding | `px-6 py-8` |
| Max width | `max-w-5xl mx-auto` |
| Card padding | `p-6` (outer cards), `p-4` (nested cards) |
| Section gap | `mt-6` between major sections |
| Element gap | `mt-2` label-to-content, `mt-3` between form fields |
| Grid gap | `gap-4` (card grids), `gap-3` (form fields) |

## Border Radius

| Element | Radius |
|---|---|
| Cards (outer) | `rounded-3xl` |
| Buttons, inputs, nested cards | `rounded-2xl` |
| Internal sections, nav links | `rounded-xl` |
| Badges | `rounded-full` |

## Component Classes (globals.css)

```css
.card      — rounded-3xl border border-stone-200 bg-white p-6 shadow-sm
.eyebrow   — text-sm font-semibold uppercase tracking-[0.18em] text-stone-500
.field     — w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-stone-400 focus:border-stone-950 focus:ring-2 focus:ring-stone-950/10
.button    — rounded-2xl bg-stone-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800
.button-secondary — inline-flex items-center justify-center rounded-2xl border border-stone-300 px-5 py-3 text-sm font-semibold transition hover:border-stone-950 hover:bg-stone-50
```

## Layout Patterns

**Page shell:** `min-h-screen bg-[#f6f2ea] px-6 py-8 text-stone-950` with `max-w-5xl mx-auto`.

**Two-column (authenticated):** `lg:grid-cols-[260px_1fr]` — left sidebar (BrainNav) + right content.

**Card grid:** `grid gap-4 md:grid-cols-2` for equal cards. Cards stack on mobile.

**Responsive:** `flex-col sm:flex-row` for inline groups. `md:grid-cols-2` for grids. `lg:` for sidebar layout.

## Interactive States

- **Card hover:** `hover:border-stone-950` on clickable cards
- **Button hover:** `hover:bg-stone-800` (primary), `hover:border-stone-950 hover:bg-stone-50` (secondary)
- **Input focus:** `focus:border-stone-950 focus:ring-2 focus:ring-stone-950/10`
- **Nav active:** `bg-stone-100` background on current page link
- **Touch targets:** minimum 44px height on interactive elements (py-3 on buttons/inputs)

## Connector Cards

Use real brand SVGs for connector logos (Google, Slack, etc). No emoji icons. No AI-generated imagery. Cards use the standard `.card` class with the connector name, a one-line description, and a connect/reconnect action.

## Tone

- Labels are terse, uppercase eyebrows
- Descriptions are one sentence, lowercase
- No exclamation marks, no emoji in UI text
- Error messages are direct: "Try again" not "Oops! Something went wrong"
- Loading states use text ("Connecting...") not spinners where possible

## What Not to Do

- No colored status badges (green/red/yellow). Use text labels.
- No icon libraries (Lucide, Heroicons). Use text or minimal inline SVG.
- No gradients, no shadows beyond `shadow-sm` on cards.
- No modal dialogs. Use inline expansion or page navigation.
- No toast notifications. Show status inline in the relevant section.
- No dark mode. Single warm-cream theme.
