# ADR-0031: App shell is a library of fixed layouts selected by config (typed slot contract)

- **Status:** Accepted
- **Date:** 2026-06-30
- **Deciders:** labadorf, design session
- **Related:** ADR-0004 (three configurability levels — refines Level 1), ADR-0010 (view-description noun-catalog — same pattern one level up), ADR-0014 (SPA), ADR-0029 (capability-gated honest degradation), ADR-0030 (frontend stack); `prefab/core-loop.md`

## Context

The MVP needs a layout/shell model that is configurable without becoming a generic
drag-anything dashboard builder (the low-code bloat ADR-0004 rejects), yet is not so rigid that
one hard-coded screen must serve every portal (master-detail browse, a dashboard landing, a
full-bleed view). ADR-0004 says Level-1 *composition* is declarative but frames it at the
block/view level; it does not pin the **app chrome** (header, nav, content, inspector, footer).
This ADR sets the shell/content boundary.

## Decision

The app shell is a **closed, growable library of hard-coded layout templates**. Portal config
**selects one layout** from the library and **binds content to its slots** — it does not compose
arbitrary chrome.

- **Typed slot contract.** Every layout implements a shared, small **superset of named slots**
  — `header`, `primaryNav`, `main`, and optional `footer` / `inspector` / `aside` — and
  **declares which slots it supports**. Config binds content (nav list, view-composition,
  dashboard blocks) to slots by name.
- **Selection, not composition, of chrome.** Choosing a layout is picking a **noun** from the
  catalog (`headerNavMain`, `masterDetail`, `dashboard`, …). Adding a layout is a **code change**
  — a new hard-coded, tested template + a catalog entry — never user script. This keeps ADR-0004's
  no-middle-scripting invariant and mirrors ADR-0010's "every addition is a noun, not a verb."
- **Two tiers of composition.** *Coarse:* select the shell layout (this ADR). *Fine:* within the
  `main` slot, compose view-primitives via the bounded layout vocabulary (stack/split/tabs/grid;
  ADR-0010). They are separate catalogs at different granularities.
- **Honest degradation.** Config that targets a slot the chosen layout does not support degrades
  visibly (ADR-0029) — it is dropped/relocated per a defined rule, never a broken render.

**MVP:** ship **one** layout (`headerNavMain` — header + `primaryNav` + `main`, optional
`footer`), hard-coded; the layout **registry + slot contract** exist so the library can grow;
"selection" is trivial with a single entry. Hard-coded shell now, config selection layered in.

## Consequences

- The shell is a bounded, growable catalog — extensible by adding layouts, stable because each is
  hand-built and tested. Portability across layouts rests on the **slot contract**, so the slot
  vocabulary is kept **small and stable**; per-layout declared support + honest degrade preserve
  config portability.
- Establishes a layout-registry seam in the SPA from Phase 0 (even with one entry), so later
  layouts and config-driven selection drop in without a refactor.
- Theming and responsive behavior live **inside** templates, not in config.
- Refines ADR-0004 Level-1 composition: "which blocks appear, where" now spans two catalogs —
  shell-layout selection (coarse) and in-`main` view composition (fine).

## Alternatives considered

- **Single fixed shell (one hard-coded layout).** Simpler, but one screen can't serve
  master-detail browse, a dashboard landing, and full-bleed views without contortions. Rejected
  as too rigid once more than one portal shape is needed.
- **Fully config-driven chrome (configure whether/where regions exist; arbitrary panel grid).**
  Maximum flexibility but the generic-dashboard-builder bloat ADR-0004 explicitly rejects, and a
  much larger MVP. Rejected; a post-MVP enhancement only if a real need appears.
- **Per-instance free-form drag-and-drop of regions.** Same bloat risk plus state/persistence
  complexity; out of scope.
