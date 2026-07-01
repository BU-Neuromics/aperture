# Aperture — Claude Design export (skeleton UI reference)

**Status:** 🟢 Design reference (2026-07-01). The output of running
[`../claude-design-brief.md`](../claude-design-brief.md) in [Claude Design](https://claude.ai/design).
This is the **visual source of truth** for the Phase-0 walking-skeleton UI; the durable,
framework-neutral extraction lives in [`../design-tokens.md`](../design-tokens.md).

## Files

| File | What it is |
|---|---|
| `Aperture.dc.html` | The prototype, in Claude Design's own `.dc` templating DSL (`<x-dc>` / `<sc-for>` / `{{ }}` bindings). **Not plain HTML and not React** — it renders via `support.js` (the Design runtime). Treat as a reference, not a drop-in. |
| `support.js` | Claude Design's client runtime that renders the `.dc` file. |
| `thumbnail.webp` | Preview thumbnail from the export. |

## What it covers (faithful to the brief)

- **Layout library (ADR-0031) as a switcher:** `headerNavMain`, `masterDetail`, `dashboard` —
  all filling the same slot contract (`header` · `primaryNav` · `main` · `inspector?`).
- **All six collections** with per-type columns: Donors (External ID · Species · Biological sex ·
  Age at collection · Diagnosis · # Samples), Samples, Brain Samples, Datafiles, Datasets, Workflows.
- **Table states:** loaded, loading (shimmer), empty, error.
- **Inspector** region (record detail) in `masterDetail`.
- A "Prototype controls" bar (the Design sliders/switcher) — prototype-only chrome, not part of the app.

## How it feeds the build (Phase 0)

- The **design tokens + type/spacing/radius scales** are extracted to
  [`../design-tokens.md`](../design-tokens.md) → seed the `web/` theme (CSS custom properties).
- The **layout structure** is the visual target for the `headerNavMain` template + slot contract
  (implementation-plan step 0.1a) and the collection table (step 0.5).
- The `.dc` DSL is **hand-translated** into React + TanStack Table (ADR-0030) — not converted.

## Deltas for the real app (do NOT carry over verbatim)

- **Fonts:** the prototype loads IBM Plex Sans/Mono (+ Space Grotesk/JetBrains Mono) from
  `fonts.googleapis.com`. The real app must **self-host** these (offline/no-external-network — the
  component sandbox ADR-0011 and general robustness). Add the woff2 files under `web/` and drop the
  Google Fonts `<link>`.
- **Inline styles → tokenized theme:** the prototype inlines styles with `var(--token, fallback)`.
  In `web/`, define the tokens once (`:root`) and reference them; don't inline fallbacks.
- **Prototype controls bar** is not part of the product — omit it.
- **Mock data** (donors/samples rows) is illustrative — the real table binds to Hippo via the
  Layer-D adapter (implementation-plan 0.3/0.5).
