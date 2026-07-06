# Aperture — Handoff / Start Here

**What it is:** the config-driven **data portal** MVP over a Hippo (LinkML + GraphQL) knowledge
graph — the substrate for an AI-native explorer (`design/vision.md`). Generic over any schema;
domain comes from config, not code (ADR-0002).

**Status (2026-07-06):** design **complete and ratified** (Steps 1–6, 31 ADRs). Implementation
**Phases 0–2 built** — the walking skeleton (issues [#3](https://github.com/BU-Neuromics/aperture/issues/3),
[#4](https://github.com/BU-Neuromics/aperture/issues/4), [#5](https://github.com/BU-Neuromics/aperture/issues/5)),
the **read loop** ([#6](https://github.com/BU-Neuromics/aperture/issues/6)): facets + FTS,
detail with cross-links/pivot/history, CSV+JSON export, query-state ⇄ URL; and the **Tier-0
write loop** ([#7](https://github.com/BU-Neuromics/aperture/issues/7)): mutation-derived
create/edit forms (serializable FormModel), client pre-validation with the server as
authority, partial-merge updates, relationship ref-pickers. Facet **counts**/sort stay
capability-gated off until Hippo X1 ([hippo#96](https://github.com/BU-Neuromics/hippo/issues/96)).
Next action: **Phase 3** (issue [#8](https://github.com/BU-Neuromics/aperture/issues/8)) —
the Tier-1 guided workflow over Hippo's batch unit-of-work (delivered, hippo#84).

---

## Start here (in order)

1. **`design/INDEX.md`** — the Decision Log (ADR index) + document map. The source of truth.
2. **`design/portal-requirements.md`** — the full requirements record: decisions **L1–L14**, the
   read/write-loop requirements, and the cross-component **X-tracker**.
3. **`design/implementation-plan.md`** — the phased build (0 skeleton → read → write → workflow →
   control plane). Phase 0 is detailed.
4. **`design/decisions/`** — 31 ADRs. Load-bearing for a newcomer: **0026** (portal-first MVP +
   what's deferred), **0027** (read+write portal), **0028** (workflow atomicity ↔ Hippo #84),
   **0029** (capability-gated degradation), **0030** (frontend stack), **0031** (app-shell layout
   library).
5. **`web/README.md`** — how to run the SPA (`cd web && npm install && npm run dev`).

## MVP scope

**In:** read loop (browse/search/detail/cross-link/export) + write loop (schema-derived forms +
one guided multi-step workflow), over a single pluggable Hippo endpoint, client-side SPA, auth as
a no-op pass-through (Bridge deferred), hand-authored components in a Worker sandbox.

**Deferred (tracked):** embedded schema editing ([#2](https://github.com/BU-Neuromics/aperture/issues/2));
agentic surfaces + build-time agent-assist (ADR-0026); faceting aggregation/counts (Hippo X1) and
server export (X2) → v1.x.

## Roadmap (GitHub issues, dependency-ordered)

| # | Phase | Depends on |
|---|---|---|
| [#3](https://github.com/BU-Neuromics/aperture/issues/3) | 0.1a — App shell: layout registry + slot contract (ADR-0031) | 0.1 (done) |
| [#4](https://github.com/BU-Neuromics/aperture/issues/4) | 0.2–0.4 — Layer-D urql adapter + capability negotiation | #3 |
| [#5](https://github.com/BU-Neuromics/aperture/issues/5) | 0.5–0.7 — schema-derived collection table + URL state *(completes walking skeleton)* | #3, #4 |
| [#6](https://github.com/BU-Neuromics/aperture/issues/6) | 1 — Read loop: facets, FTS, detail, cross-links, export | #5 |
| [#7](https://github.com/BU-Neuromics/aperture/issues/7) | 2 — Write loop: Tier 0 generated forms | #6 |
| [#8](https://github.com/BU-Neuromics/aperture/issues/8) | 3 — Tier 1 guided workflow (stage → validate → atomic commit) | #7 |
| [#9](https://github.com/BU-Neuromics/aperture/issues/9) | 4 — Control plane: saved views, drafts, config-as-data | #6–#8 |

## Cross-component (Hippo) dependencies

- **X4 — batch unit-of-work** (whole-set dry-run + atomic multi-entity write): **✅ delivered** —
  [BU-Neuromics/hippo#84](https://github.com/BU-Neuromics/hippo/issues/84), on Hippo `main`. Powers
  Phase 3 (ADR-0028).
- **X1 — aggregation** (facet counts, `totalCount`, sort, range filters): **open** —
  [BU-Neuromics/hippo#96](https://github.com/BU-Neuromics/hippo/issues/96). Gates facet *counts* in
  Phase 1 (ADR-0029); equality facets + FTS ship without it.
- **X2** (server bulk export), **X3a/X3b** (schema-apply transport + overlay mode): deferred; X3a/X3b
  tracked under [#2](https://github.com/BU-Neuromics/aperture/issues/2). See the X-tracker in
  `portal-requirements.md`.

## Repo layout

- `web/` — the **TypeScript SPA** (Vite + React + urql + TanStack Table + nuqs; ADR-0030). Talks to
  Hippo's GraphQL directly. This is the MVP product.
- `src/aperture/` — a **Python** client library (the `HippoBackend` protocol + config), carried from
  the CLI era. **Not** on the SPA data path; kept for programmatic use.
- `design/` — all design docs + `design-export/` (the Claude Design prototype) + `design-tokens.md`
  (seeded into `web/src/styles/tokens.css`).

## Conventions

- **ADR-first:** every load-bearing decision is an ADR in `design/decisions/`, indexed by
  `design/INDEX.md`. Decisions are never deleted — reversals supersede with a pointer (see ADR-0026's
  deferral pattern). When an ADR imposes a requirement on another component, cross-reference both
  sides (e.g. ADR-0028 ↔ Hippo #84 / `sec5`).
- **Two CI pipelines:** Python (`.github/workflows/tests.yml`) + Web (`.github/workflows/web.yml`,
  typecheck/lint/test/build on `web/**`).
- **Dev branch → `main`** by fast-forward once a unit is complete and green.

## Current state / immediate next action

Design branch and `main` are in sync. Build Phase **0.1a** ([#3](https://github.com/BU-Neuromics/aperture/issues/3)):
the `headerNavMain` layout + typed slot contract, translated from `design/design-export/` and styled
from the tokens.
