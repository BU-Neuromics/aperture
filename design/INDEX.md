# Aperture — AI-Native Data & Workflow Explorer
## Design Index

**Codename:** Aperture
**Component:** Interface Layer — AI-native data & workflow explorer over the BASS domain graph
(the config-driven portal is its substrate / MVP, not the product). See
[`vision.md`](vision.md).
**Version:** 0.1 — Portal substrate fresh start

---

This repository is a **fresh start** extracted from the `drylims` monorepo (2026-06).
It carries forward the reusable Hippo backend protocol (`src/aperture/backends/`) and the
config-driven **portal** design — now framed as the **substrate** for the AI-native explorer
([`vision.md`](vision.md)), not the product itself. The earlier CLI-first v0.1 specification
(`sec1`–`sec6`) and its implementation were intentionally left behind in `drylims` history and
are **not** reproduced here.

## Document Map

| File | Section | Status | Notes |
|---|---|---|---|
| `decisions/` | **Design decisions (ADRs)** | 🟢 Canonical | The source of truth for *what was decided and why*. See `decisions/README.md` for the system; the Decision Log below is the index. |
| `architecture.md` | Reference architecture (orientation) | 🟢 Orientation | The "how it all fits" map — layered model, data/control plane, source adapter, WASM roles, security/BFF. Ties the ADRs together; ADRs remain authoritative. |
| `actors.md` | Actors & personas (orientation) | 🟢 Orientation | The cast Aperture is designed for — researcher, coding agent, admin, schema author; the two-credentials model. Links each tension to its ADR. |
| `vision.md` | North-star vision (AI-native explorer) | 🔵 Vision | Reframes Aperture from config-driven portal → LLM-native interaction layer over Hippo/Cappella/Canon; the declarative substrate is what makes natural-language control safe. Answers the strategic review's crux #1; sets the agentic keystone probe. |
| `prior-art.md` | Prior-art survey (2026-06-16) | 🟢 Research | Verified buy-vs-build survey: greenfield verdict; Gen3 + Vega-Lite as prototype references; design lessons mapped to our decisions; the unproven differentiators (capability-scoped client, agent-editable config). |
| `gen3-comparison.md` | Gen3 deep comparison | 🟢 Research | Service-by-service map of Gen3 to the whole BASS platform (fence+arborist=Bridge, Peregrine=Hippo GraphQL, dictionary=LinkML); explorerConfig ≈ our core-loop config; the two-tier graph+index lesson that answers our aggregation gap. |
| `library-survey.md` | Implementation library survey (2026-06-25) | 🟢 Research | Package-level buy-vs-build for the complex components (vs. `prior-art.md`'s whole-product altitude). Leads: JSONForms (wizard-as-data), XState (engine, not config), Serverless Workflow DSL (steal the model), TanStack Table, nuqs, FINOS Perspective; runtime introspection-binding confirmed greenfield. Flags open angles: saga/W4.7, durable engines, admin/low-code, sandbox runtime. |
| `implementation-plan.md` | Implementation plan (working) | 🟠 Working | Sequenced MVP build plan grounded in the ADRs. Phasing: 0 walking-skeleton (current) → read loop → write loop → Tier-1 workflow → control plane. |
| `prefab/` | Prefab portal design (working) | 🟠 Working | Concrete brain-bank portal UX walkthrough (two-tier ladder; core-loop) that defines what the config engine must reproduce. |
| `instruction-path-model.md` | Instruction-path model (working) | 🟠 Working | The formal data structure under `prefab/data-stories.md`: a data story as a path of source-tagged typed instructions producing intensional subgraph **states** + materialized **artifacts**. Topology (linear/tree/DAG) as a data property; reproducibility via one as-of watermark; UI modes as topology slices. Open decisions D-1–D-5 (ADR-0022–0025 + a Hippo requirement). |
| `portal-vision-handoff.md` | Portal vision | 🟢 Historical vision / context | The original config-driven portal brainstorm: problem statement, settled decisions (§2), open questions (§9), invariants checklist (§10). Read for narrative context; **cite ADRs for decisions** — §2 is backfilled as ADR-0002–0009, §9 as Proposed ADR-0010–0013. |
| `portal-open-questions.md` | Portal §9 working notes | 🟡 Working notes | Proposed resolutions to the §9 open questions, carried into the corresponding Proposed ADRs as their recommended Decision + rationale. |

## How decisions are recorded

Every load-bearing choice is an **ADR** in [`decisions/`](./decisions/), indexed by the
Decision Log below. Open questions are `Proposed` ADRs (the decision queue); ratifying one is
a status flip to `Accepted`, not a new document. Decisions are never deleted — reversals
`Supersede` with a forward pointer. Full process: [`decisions/README.md`](./decisions/README.md).

## Decision Log

> Canonical index of ADRs. One row per decision; the entry point to `decisions/`.

| ADR | Decision | Status | Source |
|---|---|---|---|
| [0001](./decisions/ADR-0001-adopt-adrs.md) | Record design decisions as ADRs (this system) | ✅ Accepted | handoff §2 |
| [0002](./decisions/ADR-0002-generic-not-domain-specific.md) | Generic against any Hippo deployment; no domain nouns in source | ✅ Accepted | handoff §2.1 |
| [0003](./decisions/ADR-0003-config-is-linkml-in-hippo.md) | Config is a LinkML schema, stored in Hippo | ✅ Accepted | handoff §2.2, §3 |
| [0004](./decisions/ADR-0004-three-levels-of-configurability.md) | Three configurability levels; no middle scripting layer | ✅ Accepted | handoff §2.3 |
| [0005](./decisions/ADR-0005-config-accessible-to-humans-and-llms.md) | Config equally accessible to humans and LLMs; defaults in schema | ✅ Accepted | handoff §2.4 |
| [0006](./decisions/ADR-0006-components-runtime-reloaded.md) | Components runtime-reloaded behind headless validation | ✅ Accepted | handoff §2.5, §5 |
| [0007](./decisions/ADR-0007-user-and-system-components-same-artifact.md) | User/system components are one artifact; promotion is ACL-only | ✅ Accepted | handoff §2.6 |
| [0008](./decisions/ADR-0008-components-hold-no-authority.md) | Components hold no authority; injected capability-scoped client | ✅ Accepted | handoff §2.7 |
| [0009](./decisions/ADR-0009-components-emit-view-descriptions.md) | Components emit serializable view descriptions, never DOM | ✅ Accepted | handoff §2.8, §5 |
| [0010](./decisions/ADR-0010-view-description-vocabulary.md) | View vocabulary is a typed noun-catalog **(keystone)** | 🟡 Proposed | handoff §9.2 (Q2) |
| [0011](./decisions/ADR-0011-component-execution-runtime.md) | Component runtime/language: client-side Web Worker + Pyodide escape hatch | 🟡 Proposed | handoff §9.1 (Q1) + tech |
| [0012](./decisions/ADR-0012-config-layering.md) | Layered config → one validated instance; layer-attributed resolution | 🟡 Proposed | handoff §9.4 (Q4) |
| [0013](./decisions/ADR-0013-agent-loop-local-vs-remote.md) | One API-based agent loop; component source is the only file artifact | ⛔ Deferred (MVP) | handoff §9.3 (Q3) |
| [0014](./decisions/ADR-0014-application-architecture.md) | Application architecture: server-rendered vs client-side shell | ✅ Accepted | raised 2026-06-13 |
| [0015](./decisions/ADR-0015-composability-and-cross-links.md) | Composability + cross-links (hrefs) | 🟡 Proposed | raised 2026-06-13 |
| [0016](./decisions/ADR-0016-defer-bridge-build-aperture-first.md) | Defer Bridge impl; build/demo Aperture against Hippo via no-op capability-scoped client | ✅ Accepted | 2026-06-15 |
| [0017](./decisions/ADR-0017-data-plane-vs-control-plane.md) | Separate data plane (browsed sources) from control plane (config/state store) | ✅ Accepted (amended L2) | 2026-06-15 |
| [0018](./decisions/ADR-0018-agents-act-with-user-delegated-authority.md) | Agents act with the invoking user's delegated authority (not a separate principal) | ⛔ Deferred (MVP) | 2026-06-16 |
| [0019](./decisions/ADR-0019-per-user-llm-provider-keys.md) | Per-user LLM provider key management (config-as-LinkML; key refs, not secrets) | ⛔ Deferred (MVP) | 2026-06-16 |
| [0020](./decisions/ADR-0020-llm-conversations-are-provenance-events.md) | LLM conversations & agent actions are provenance events + observability | ⛔ Deferred (MVP) | 2026-06-16 |
| [0021](./decisions/ADR-0021-defer-in-app-chat-mcp-agent-first.md) | Defer in-app chat; coding agent (MCP/API) is the near-term agent surface | ⛔ Deferred (MVP) | 2026-06-16 |
| [0022](./decisions/ADR-0022-data-story-is-an-instruction-path.md) | A data story is an instruction path → typed subgraph states + artifacts | ⛔ Deferred (MVP) | instruction-path-model.md (D-1) |
| [0023](./decisions/ADR-0023-data-story-reproducibility-as-of-watermark.md) | Reproducibility: one as-of watermark per story-version; "pull new data" = recorded watermark-advance | ⛔ Deferred (MVP) | instruction-path-model.md (D-2) |
| [0024](./decisions/ADR-0024-instruction-path-linear-first-general-schema.md) | Topology: general `parents`-list schema now, linear-only validator in v1 | ⛔ Deferred (MVP) | instruction-path-model.md (D-3) |
| [0025](./decisions/ADR-0025-mid-path-edit-recompute-with-suspend.md) | Mid-path edits recompute downstream + suspend-on-invalid (not discard) | ⛔ Deferred (MVP) | instruction-path-model.md (D-5) |
| [0026](./decisions/ADR-0026-portal-first-mvp-defer-agentic-surfaces.md) | Portal-first MVP; defer agentic, agent-assist & schema-editing surfaces | ✅ Accepted | portal-requirements L1/L13/L14 |
| [0027](./decisions/ADR-0027-read-and-write-portal.md) | Read *and* write portal; v1 write boundary = Tier 0 forms + one Tier 1 workflow | ✅ Accepted | portal-requirements L3/L4 |
| [0028](./decisions/ADR-0028-workflow-atomicity-staged-batch.md) | Workflow atomicity: stage → whole-set dry-run validate → atomic commit (Hippo #84); saga fallback | ✅ Accepted | portal-requirements L9/L10 |
| [0029](./decisions/ADR-0029-capability-gated-honest-degradation.md) | Capability-gated UI, honest degradation (faceting/aggregation/export) | ✅ Accepted | portal-requirements L7/L8 |
| [0030](./decisions/ADR-0030-frontend-stack.md) | Frontend stack: TS SPA (React + Vite + urql; TanStack Table + nuqs), in-repo, talks to Hippo directly | ✅ Accepted | library-survey; N5.9 |
| [0031](./decisions/ADR-0031-app-shell-layout-library.md) | App shell = library of fixed layouts selected by config; typed named-slot contract | ✅ Accepted | layout design session |

## Decision Queue (open — resolve in dependency order)

Per `portal-open-questions.md`, resolve **ADR-0010 → 0011 → 0012 → 0013**; ADR-0014 follows
0011 (the runtime/Pyodide weight changes the SSR-vs-SPA tradeoff), and ADR-0015 follows
0010/0014. The keystone is **ADR-0010**: its survival-curve probe (can a KM-curve be
expressed as catalog primitives + a stratifying query, or does it need escape-hatch
rendering?) validates or breaks the whole chain.

**Next session — first action:** run the ADR-0010 survival-curve probe.

## Building against Hippo (current surface)

Aperture targets Hippo's autogenerated **GraphQL transport** (sec4 §4.7), rendered from the
shared `schema_typing` type model — same class set as the typed SDK. Design around today's
documented limits: offset-only pagination, equality filters only (no CEL over GraphQL yet),
multivalued slots don't persist in the v0.1 SQLite adapter (resolved lists return `[]`),
`isAvailable` always `true` on reads, and no schema-versioning of the GraphQL surface
(additive-only tolerance). Internal cross-links come from resolved relationship fields;
external hrefs from `ExternalReference` + `hippo_external_xref` reverse lookup (issue #48).

The kept `src/aperture/backends/` protocol has `HippoSdkBackend` (in-process) and
`HippoRestBackend` (REST); a **GraphQL backend is not yet implemented** and is the natural
next code artifact once the runtime/architecture ADRs settle.

## Security & Bridge (deferred — see ADR-0016)

Authorization lives in **Bridge** (PEP/PDP), not Aperture or Hippo — full model in the
platform spec (`drylims/platform/design/sec6_security_model.md`). Aperture is built and demoed
**directly against Hippo** for now (ADR-0016); Bridge implementation is deferred. The
capability-scoped client (ADR-0008) is the seam that makes this free: present from day one as
a no-op/full-access pass-through locally, swapped for Bridge's enforcing client later with no
change to Aperture behavior. Aperture stays auth-unaware; it never enforces access.

## Settled Invariants (review checklist)

Handoff §10 remains the per-change review checklist. The invariants it lists are now owned by
ADRs: domain-noun-free source (ADR-0002), config-as-LinkML-in-Hippo (ADR-0003), no middle
scripting layer (ADR-0004), defaults-in-schema (ADR-0005), universal sandbox + ACL-only
promotion (ADR-0007), no component authority (ADR-0008), view-descriptions-not-DOM and
headless-checkable contract (ADR-0009).

## How to Use This Spec

Sections feed the openplan pipeline:
```
ADRs + spec sections → openplan vision.yaml → roadmap → epics → features → OpenSpec
```
