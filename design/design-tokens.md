# Aperture — Design tokens (seed)

**Status:** 🟠 Working (2026-07-01). The framework-neutral design-system seed **extracted from the
Claude Design export** ([`design-export/`](./design-export/)). These become the `web/` theme (CSS
custom properties on `:root`) when Phase 0 scaffolds the app (ADR-0030/0031). Values are the
export's light-theme fallbacks; a dark theme is a follow-on token set.

## Color tokens (light)

| Token | Value | Role |
|---|---|---|
| `--bg-canvas` | `#f6f7f9` | app background |
| `--bg-surface` | `#ffffff` | cards, header, table surface |
| `--bg-subtle` | `#f1f3f6` | subtle fills (e.g. table header) |
| `--bg-hover` | `#eef1f5` | row/control hover |
| `--border` | `#e4e7ec` | default borders/dividers |
| `--border-strong` | `#d3d8e0` | emphasized borders |
| `--text-primary` | `#1b1f24` | primary text |
| `--text-secondary` | `#5a626d` | secondary text |
| `--text-tertiary` | `#949ba6` | muted/labels/placeholders |
| `--accent` | `#2f6df6` | accent (links, active nav, primary action) |
| `--accent-weak` | `#eaf1fe` | accent-tinted backgrounds (active row/chip) |
| `--error` | `#b23b3b` | error text |
| `--error-bg` | `#fbe9e9` | error surface |

*(Semantic success/warn were requested; the export shipped `error` only — add `success`/`warn`
tokens when a surface needs them.)*

## Typography

| Token | Value |
|---|---|
| `--font-ui` | `'IBM Plex Sans', system-ui, sans-serif` |
| `--font-mono` | `'IBM Plex Mono', monospace` |
| `--fs-body` | `13.5px` (base) |

- **Self-host** IBM Plex Sans (400/500/600/700) + IBM Plex Mono (400/500) as woff2 under `web/`
  (the export loads them from Google Fonts — do not carry that over). Space Grotesk / JetBrains
  Mono were preconnected but only Plex is tokenized; add others only if a surface needs them.
- **Type scale in use** (px, from the export — systematize as tokens in `web/`): 10.5 · 11 · 11.5 ·
  12 · 12.5 · 13 · 15 · 16 · 20. Weights: 500 / 600 / 700. Mono for IDs and numeric/data cells.

## Radius & spacing (from the export; to be tokenized)

- **Radius (px):** 4 · 5 · 6 · 7 (controls default) · 8 · 10 · 12 · 999 (pills/chips).
- **Spacing:** inline literals in the prototype (e.g. 8 / 16 / 18 px paddings); define a spacing
  scale (`--space-1…n`) in `web/` rather than copying literals. Density option
  (comfortable/compact) was requested — carry as a theme toggle.

## Usage note

In the export these are `var(--token, fallback)` inlined everywhere. In `web/`, define each token
once on `:root` (+ a `[data-theme="dark"]` block later) and reference `var(--token)` without
fallbacks. TanStack Table cells map to the type-keyed renderers (enum→chip, number→mono/right,
id→mono link, relationship→count badge) using these tokens.
