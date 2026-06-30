# Aperture — Portal Requirements (portal-first track)

**Status:** 🟠 Working — co-designed incrementally, one step at a time. Last updated 2026-06-25.

This document captures the **requirements for Aperture as a data portal**, under the
**portal-first, agent-aware** pivot (2026-06-25): the config-driven portal is the *product* and
the v1 deliverable; the AI-native explorer ([`vision.md`](./vision.md)) remains the north star but
its agentic stack is **deferred, not retired**. The typed/validatable substrate invariants are
kept deliberately so an agent layer can be added later without re-architecting.

Decisions here will be promoted to **ADRs** (status updates + new ADRs) once a cluster is stable —
the Decision Log in [`INDEX.md`](./INDEX.md) remains the source of truth for *what was decided*.
This doc is the working surface where requirements are drafted and locked step by step.

---

## Locked decisions (this track)

| # | Decision | Date | Becomes / touches |
|---|---|---|---|
| L1 | **Portal-first, agent-aware.** Portal is the product/v1 deliverable. Agentic ADRs (0018–0025) → *Deferred*; substrate invariants preserved so agents can be added later. `vision.md` stays as north star with a portal-first note. | 2026-06-25 | ADR status flips; `vision.md` note |
| L2 | **Pluggable single endpoint.** Source adapter is source-agnostic / capability-negotiated, but v1 talks to exactly **one active data-plane endpoint at a time** (Hippo now; Bridge or a future Cappella gateway later — a config swap, not a refactor). Cross-source **federation is deferred** and may never be needed if Cappella unifies upstream. | 2026-06-25 | Narrows ADR-0017 "N sources" → "one swappable source"; Layer D |
| L3 | **Portal is read *and* write.** Aperture provides schema-derived **data-entry / mutation** UIs, not just browse. Validation is enforced server-side by Hippo's three-tier pipeline (LinkML → CEL → Python plugin); every mutation is transactional with provenance. Aperture generates entry UI from schema + pre-validates client-side for fast feedback. | 2026-06-25 | Re-justifies component system (ADR-0009/0010/0011) for the portal track |
| L4 | **v1 write boundary = Tier 0 + one Tier 1.** v1 ships generated single-entity create/edit **forms** (Tier 0) **and one real guided multi-step workflow** (e.g. tissue banking/processing) as a proof of the component framework (Tier 1). Further workflow components ship in v1.x; agent-driven *runtime* mutation is Tier 2 (deferred). | 2026-06-25 | New keystone probe (see below) |
| L5 | **Embedded schema editing in v1.** Aperture is the home for an admin-gated **schema-editing app** (the `linkml-modeler` idea); the schema author is a first-class *in-app* persona, not just upstream. ⚠️ Depends on a **Hippo-side mechanism to accept/apply schema changes** (Hippo recipes v1 is file/recipe-based, no live schema-edit API) — cross-component requirement to pin down (Step 5). | 2026-06-25 | Re-activates actor #5; new Hippo dependency |
| L6 | **Agent-assisted component authoring in v1 (build-time only).** Tier 1 workflow components & custom views are authored with help from an **external MCP/API coding agent** (per ADR-0021's near-term surface), used by a developer/admin at **build time** — *not* a runtime surface for researchers/wet-lab staff. Re-activates the authoring substrate: typed component contract (ADR-0010/0011), dry-run validation + reversible attributed apply (ADR-0009 + handoff §6), agent-acts-with-user-authority (ADR-0018). Runtime agent (in-app chat, data-stories, conversations-as-provenance, per-user keys) stays deferred. Refines L1. | 2026-06-25 | ADR-0021 (already Accepted); narrows L1's deferral |
| L7 | **Faceting = capability-gated honest degrade.** v1 ships what the active backend advertises (on Hippo today: equality facets + FTS + offset pages). Facet **counts, range filters, sort, `totalCount`** are *declared capabilities* surfaced only when the backend supports them; **the UI never fakes a count** over a partial page. The Hippo aggregation enhancement (X1) is filed as the top cross-component ask to bring counts in v1.x. *(Recommended default; reversible.)* | 2026-06-25 | Layer D capability protocol; Hippo req X1 |
| L8 | **Export = client-side page-through (CSV + JSON).** v1 exports the current filtered result set by paging offset results client-side, to CSV and JSON, over the configured columns. No Hippo dependency. Server-side streamed bulk export (X2) deferred to v1.x if cohort sizes demand it. *(Recommended default; reversible.)* | 2026-06-25 | Hippo req X2 (deferred) |
| L9 | **Workflow atomicity = stage → whole-set dry-run validate → atomic commit** (supersedes the earlier saga-as-default, after the §Step 4 review). A workflow stages its entities in a draft buffer; nothing enters the domain graph until the **whole related set** is validated and then committed **all-or-nothing** via a Hippo batch unit-of-work. This needs a Hippo capability (**X4**, now a committed dependency — [BU-Neuromics/hippo#84](https://github.com/BU-Neuromics/hippo/issues/84)): whole-set dry-run validation + atomic multi-entity write with intra-batch reference resolution. Hippo's storage layer already has the atomic primitive (`staged_transaction()`), so this exposes existing machinery rather than building distributed transactions. **Saga/compensation (the prior L9) is retained only as the fallback** for steps with genuinely irreversible external side-effects (can't be staged). | 2026-06-25→**rev 2026-06-30** | Step 4 W4.6/W4.7; Hippo #84 / req X4 |
| L10 | **Resumable drafts are first-class; the draft is an *inert* control-plane buffer.** In-progress forms & workflow runs persist as **draft state** in the control plane (LinkML-on-Hippo, ADR-0017) — *not* committed domain entities. Because nothing is committed until the atomic pivot (L9), resume is "reload a draft document," with **no** entity-stamping / dual-write / query-before-run reconciliation against the domain graph (the saga-era complexity is gone). The draft **pins the workflow + schema version** it began under, so an admin schema edit (L5) between save and resume is detectable rather than silently breaking. | 2026-06-25→**rev 2026-06-30** | Step 4 W4.6/W4.8; ADR-0017; L5 |

---

## Step 1 — Scope & Framing  *(locked 2026-06-25)*

### What Aperture is (current track)
A generic, config-driven **data portal** over the BASS domain graph. Its first and primary
backend is **Hippo** (via GraphQL); **Bridge** provides auth/authorization when present. The
source endpoint is **pluggable** (one active at a time, L2). The portal supports both **reading**
(browse/search/detail) and **writing** (data entry / guided workflows), with validation enforced
ultimately by the LinkML schema in Hippo.

### What the portal does (the core loop)
- **Read loop:** *browse* the typed entities in a deployment → *search and facet* to narrow a set
  → open an *entity detail* view → *traverse cross-links* (relationships + external references) →
  *export* a result set. All **derived from the LinkML schema** (ADR-0002/0003) — no
  per-deployment hand-coding.
- **Write loop:** *create / edit* an entity via a schema-derived form → client-side pre-validate →
  submit GraphQL mutation → surface the server's `ValidationResult`; or *run a guided workflow*
  component that orchestrates several validated mutations (Tier 1).

### In scope (v1)
- Schema-derived **browse / faceted search / detail** views over the active GraphQL endpoint.
- **Data entry:** generated single-entity create/edit forms (Tier 0), server-validated,
  provenance-tracked.
- **One guided multi-step workflow** component (Tier 1) as a keystone proof.
- Config-driven tailoring of views (ADR-0003/0004/0005), runtime-reloaded behind headless
  validation (ADR-0006/0009).
- Cross-links: internal (resolved relationships) and external (`ExternalReference`) (ADR-0015).
- **Capability-negotiated source adapter** (Layer D) — UI gates features (faceting, full-text,
  pagination style, aggregation, **mutation support**) to what the active backend declares.
- Auth via the **capability-scoped client seam** — no-op full-access pass-through locally
  (incl. writes), Bridge's enforcing client when present (ADR-0008/0016).

### Deferred (agent-aware — substrate kept ready, not built now)
- In-app conversational/agent interaction (ADR-0021).
- Agent-editable config loop; per-user LLM keys; conversations-as-provenance (ADR-0018–0020).
- Data-stories / instruction-path execution (ADR-0022–0025).
- Cross-source **federation** (browsing multiple heterogeneous endpoints at once) (L2).
- **Tier 2** writes (agent-driven mutation, free-form components); **further Tier 1** workflow
  components beyond the v1 proof.

### Out of scope (other components' jobs)
- **Authorization logic** itself — lives in Bridge (PEP/PDP); Aperture stays auth-unaware
  (ADR-0016).
- **Data storage, schema authoring, server-side validation** — Hippo's job. Aperture *generates
  UI from* the schema and *pre-validates*, but the schema is the validation authority.
- **Workflow execution** (pipeline runs) — Cappella's job. Aperture's "workflows" here are
  **data-entry/mutation interfaces**, not compute pipelines.

### Non-goals (this track)
- Not a NotebookLM-style conversational explorer *in this track* (that's the deferred vision).
- Not domain-specific — **generic only** (ADR-0002); no brain-bank nouns in source. The tissue
  banking workflow is a *config/component instance*, not hard-coded.

### Reframed keystone (write track)
With writes in scope, the riskiest open question shifts from "can an LLM drive the view
vocabulary" to: **can a real wet-lab workflow (tissue banking/processing) be expressed as typed
components driving schema-validated mutations through the capability-scoped client?** The v1 Tier 1
workflow (L4) *is* this probe.

---

## Step 2 — Actors & core job-to-be-done  *(locked 2026-06-25)*

Recasts [`actors.md`](./actors.md) for the portal-first track: human operators come forward, the
runtime agent recedes, a **new write persona** is added, and the **schema author** + **build-time
coding agent** become first-class in-app/authoring actors (L5/L6).

### The cast (portal-first)

1. **Researcher (data consumer) — primary *read* user.** Domain expert, not a developer.
   Browses, faceted-searches, opens detail views, follows cross-links, exports cohorts, via the
   **rendered portal UI**. Authority = whatever Bridge grants; full access locally (ADR-0016).
   *(The "direct an agent at runtime" path → deferred.)*
2. **Wet-lab staff (data producer / operator) — primary *write* user. [NEW]** Domain expert, not
   a developer. Enters/updates records via **schema-derived forms** (Tier 0) and runs **guided
   multi-step workflows** (Tier 1, e.g. tissue banking/processing). Needs field-level validation
   feedback, step-by-step guidance, and guardrails (server-side LinkML/CEL validation +
   no-hard-delete). The reason the portal is read *and* write (L3/L4); absent from old `actors.md`.
3. **Admin / portal owner.** Governs a deployment: **endpoint selection** (single active source —
   Hippo now, Bridge/Cappella later, L2), deployment/registry config, component/view **promotion**
   & visibility (ADR-0007), and **schema editing access** (L5). Maps to Bridge `admin`.
4. **Component author — developer/admin, agent-assisted at build time (L6).** Authors Tier 1
   workflow components & custom views as typed validatable artifacts, *with an external MCP/API
   coding agent* (ADR-0021), then promotes (ADR-0007). Build-time role, not a runtime surface.
5. **Schema author / data modeler — first-class in-app (L5).** Authors/edits the LinkML domain
   schema everything derives from, via the **embedded admin-gated schema editor**. ⚠️ Gated on the
   Hippo schema-apply dependency (L5).
6. **(Boundary) Bridge / permissions owner — deferred.** Roles & enforcement live here, not
   Aperture (ADR-0008/0016). Local = max permissions.
7. **Coding agent — build-time actor (L6), not runtime.** Scaffolds components for authors via
   MCP/API. Acts with the invoking user's authority (ADR-0018). The runtime/in-app agent surface
   stays deferred (ADR-0021).

### Core jobs-to-be-done (the loops)

| Persona | Job | Loop |
|---|---|---|
| Researcher | "Find and extract the data I need" | browse → facet → detail → cross-link → export |
| Wet-lab staff | "Record what happened at the bench, correctly" | pick type/workflow → guided form(s) → pre-validate → submit → confirm |
| Admin | "Stand up and govern a deployment" | configure endpoint + views → validate → promote |
| Schema author | "Evolve the domain model" | edit schema → validate → apply (via Hippo, L5) |
| Component author | "Add a new view/workflow" | scaffold w/ agent → dry-run validate → promote |

Read and write are the two first-class **end-user** loops; the rest are supporting/build-time.

---

## Step 3 — Functional requirements: read loop  *(locked 2026-06-25)*

Grounded in [`prefab/core-loop.md`](./prefab/core-loop.md) and Hippo's GraphQL Query surface
(Hippo sec4 §4.7). Each requirement carries a **capability tag**: **(a)** works on Hippo today ·
**(b)** needs a Hippo enhancement (cross-component requirement, see X-table) · **(c)**
adapter-compensated client-side. Per L7, the capability-negotiated adapter (L2) **gates each
feature to what the active endpoint declares — the UI never fakes a capability** (no client-side
"facet counts" that silently describe only the loaded page).

| Req | Requirement | Tag |
|---|---|---|
| R3.1 | **Collection nav** — derive browsable collections from `hippoSchema`; admin config reorders/relabels/hides (derive-all + override). | (a) |
| R3.2 | **Collection table** — config-curated columns; cell renderers keyed by LinkML slot kind; loading/empty/error states. | (a) |
| R3.3 | **Filtering** — equality facets (enum→checklist, bool, ref-id) with AND/OR; FTS box. | (a) |
| R3.3r | **Range filters** (numeric/date facets). | (b) |
| R3.4 | **Facet counts** — counts beside facet values (the keystone gap; L7). | (b) |
| R3.5 | **Sort** — server `order_by`. Interim: client-sort current page only, clearly scoped. | (b)/(c) |
| R3.6 | **Pagination + count** — offset pages (a); `totalCount` (b); interim "page N, 25+/page" (c). | (a)/(b)/(c) |
| R3.7 | **Detail view** — single entity, typed renderers, history via `entityHistory`. | (a) |
| R3.8 | **Cross-links** — internal via resolved relationship fields; external via `ExternalID` + xref; relationship **pivot** (jump to related collection, filtered). | (a) |
| R3.9 | **Query state ⇄ URL** — serializable query-state object (collection+filters+sort+page) bound to the URL → shareable. Aperture-side; precursor to saved views & view-description-as-data (ADR-0009/0010). | (a) |
| R3.10 | **Export** — client-side page-through of the filtered set → CSV + JSON over configured columns (L8). | (a) |

**Degradation rules (from v0.1 Hippo adapter):** multivalued slots return `[]` (render as
"not available," not error); `isAvailable` always `true` on reads (availability columns/filters
moot for now); no relationship-count fields (`#samples` omitted until aggregation exists, X1).

---

## Step 4 — Functional requirements: write loop  *(locked 2026-06-25)*

Grounded in L3/L4 (read+write portal; v1 write boundary = Tier 0 forms + one Tier 1 workflow),
the implementation library survey ([`library-survey.md`](./library-survey.md)), and the
workflow-atomicity prior-art pass (saga/compensation, BPMN, durable engines — see the **Research
basis** note below). Capability tags as in Step 3: **(a)** Hippo today · **(b)** Hippo
enhancement · **(c)** Aperture-side.

### Tier 0 — generated single-entity forms

| Req | Requirement | Tag |
|---|---|---|
| W4.1 | **Form generation** — derive a create/edit form from a type's LinkML slots (mirror of the detail view): widget per slot kind (enum→select, bool→checkbox, ref→entity-picker, scalar→typed input, date→date-picker); `required`/`ifabsent` honored. Form definition is **serializable** (schema + UI-schema split, JSONForms-style — see survey). | (a) |
| W4.2 | **Client pre-validation** — fast feedback from the LinkML shape rules (required, pattern, range, enum) *before* submit; **server stays the validation authority** (Hippo LinkML→CEL→plugin). UI surfaces the server `ValidationResult` (field-attributed) on rejection. | (a) |
| W4.3 | **Submit** — `createX`/`updateX` mutation; `updateX` is partial-merge; provenance is server-tagged. | (a) |
| W4.4 | **Edit semantics** — no hard delete; availability transitions via `setXAvailability`; supersede via `supersedeX`. | (a) |
| W4.5 | **Relationship ref-pickers** — relationship slots resolved via a searchable picker reusing the read-loop search/facet. | (a) |
| W4.x | **Conditional/dependent fields** — show/require slots based on other field values (Formily-style reactive linkage is the survey reference). | (a)/(c) |

### Tier 1 — one guided multi-step workflow component (keystone proof)

| Req | Requirement | Tag |
|---|---|---|
| W4.6 | **Workflow component = staged unit-of-work (L9).** A typed component sequences several entity mutations as steps (e.g. register donor → accession sample → record processing) with cross-step state and per-step validation, **staging** entities in a draft buffer. Built as: **our serialized workflow config** (steps-as-data; CNCF Serverless Workflow is the model to steal) interpreted by an **engine** (XState is the reference runtime — engine, *not* the config format) rendering each step's form via the Tier-0 generator. Emits view-descriptions (ADR-0009); holds no authority (ADR-0008); authored build-time with agent assist (L6). | (a)+(c) |
| W4.7 | **Atomicity via stage→validate→commit (L9).** Continuous per-step dry-run for fast feedback; a **whole-set dry-run** over the staged graph before commit; then **one atomic multi-entity commit** (Hippo #84 / X4). Nothing enters the domain graph until the set is valid and complete → no partial run is ever visible (no semantic-lock juggling needed). Compensation is the **fallback** only for irreversible-side-effect steps. | (b: Hippo #84) |
| W4.8 | **Resumable drafts (L10).** Workflow runs (and long single forms) persist as an **inert** control-plane draft buffer (not committed entities); stop/resume = reload the draft. Draft pins workflow+schema version (L5 drift detection). No entity-stamping/idempotency-reconciliation needed (it was a saga-era cost, now removed). | (a)+(c) |
| W4.9 | **Cross-entity validation** — steps depending on prior entities; CEL/cross-entity rules enforced **server-side per mutation** (Aperture pre-checks for UX only). | (a) |

### Research basis — workflow atomicity (W4.6–W4.9)

Targeted prior-art pass (2026-06-25, web search; several primary pages returned HTTP 403 to
direct fetch — proxy behavior — so findings are synthesized from search-result extracts of those
same primary sources, as the prior survey did):

- **Saga is the standard answer** to a multi-step business transaction across stores **without** a
  distributed transaction: a sequence of local transactions, each with a **compensating
  transaction** that semantically undoes a prior step on failure (microservices.io; AWS
  Prescriptive Guidance; Temporal). **Orchestration** (central coordinator triggers compensations)
  is recommended **over choreography** for *complex workflows with rollback needs* — matching our
  guided-workflow shape. → **chooses option A+C over B.**
- **Compensation = inverse op, not delete.** Saga compensation is a *semantic* reversal; with a
  no-hard-delete store, that is exactly **supersede / mark-unavailable**. Hippo's existing
  availability-transition + supersede + provenance log are a clean, attributed compensation
  substrate. → **confirms C is cheap on Hippo as-is; no new Hippo capability needed.**
- **Durable engines as prior art:** definition form splits — **Temporal = code**, **Conductor =
  JSON DSL**, **Zeebe = BPMN**. Temporal's **event-sourced durable resume** (resume exactly where
  it left off, replay from any point) is the lesson behind **L10 drafts** (we persist step state,
  not arbitrary code replay). **BPMN** models human-in-the-loop **user tasks** and **compensation
  boundary events / handlers** — direct prior art for guided data-entry steps + per-step
  compensation (Flowable; Red Hat PAM; Camunda). → **steal the model; adopt none wholesale.**
- **Idempotency:** for at-least-once retries over a non-transactional backend, the **idempotency
  key wraps the saga run**, not only individual steps, else retries leave correct-but-partial
  state (idempotency literature). → **L10's run-scoped key.**
- **Honest verdict (original):** the saga *orchestration + compensation* logic would be
  **hand-rolled in our workflow interpreter** — no surveyed TS/JS saga library is
  load-bearing-grade; the engines that do it well (Temporal/Zeebe/Conductor) are heavyweight
  servers, out of scope. We steal their *models*, not their runtimes.

> **Revision (2026-06-30) — staging supersedes saga-as-default.** On review we confirmed Hippo
> *can* offer a clean **whole-set dry-run + atomic multi-entity write** (its storage layer already
> has `staged_transaction()`; the per-write boundary was a choice, not a limit). That makes
> **stage → validate-whole-set → commit-atomically** the default (L9 rev): nothing commits until
> the set is valid, so there is **no partial state to compensate or reconcile**, which deletes the
> hand-rolled saga, the semantic-lock, and the idempotency-reconciliation cost. Compensation
> survives only as the fallback for irreversible-side-effect steps. The capability is a committed
> Hippo dependency — [BU-Neuromics/hippo#84](https://github.com/BU-Neuromics/hippo/issues/84)
> (X4), filed issue-first, implemented increment-by-increment (increment 1 = whole-set dry-run).

---

## Cross-component requirements raised (tracker)

Requirements this portal track imposes on **Hippo** (or other components). Each must be
cross-referenced from the target component's spec/ADR when promoted (Step 6), per the CLAUDE.md
two-sided-dependency rule.

| ID | On | Requirement | Driven by | Priority |
|---|---|---|---|---|
| X1 | Hippo | **Aggregation primitive** — facet/group-by counts, `totalCount`, range filters, `order_by` on the GraphQL list surface. Enables real faceted browse (R3.3r–R3.6). | L7 | **High** — top ask; unblocks v1.x faceting |
| X2 | Hippo | **Server-side bulk/streamed export** — full-cohort export beyond client page-through. | L8 | Low — deferred to v1.x |
| X4 | Hippo | **Whole-set dry-run validation + atomic multi-entity write** — validate a proposed set of related entities (incl. intra-batch references) without writing, then commit the set all-or-nothing. Filed: [BU-Neuromics/hippo#84](https://github.com/BU-Neuromics/hippo/issues/84) (increment 1 = whole-set dry-run; increment 2 = atomic commit). | L9 | **High — committed dependency** for the write loop. Foundation (`staged_transaction()`) already in Hippo storage. |
| X3 | Hippo | **Schema-apply mechanism** — a path for Aperture's embedded editor to submit/apply LinkML schema changes (today recipes v1 is file-based; in-place class mutation disallowed). Needs migration/versioning semantics. | L5 | **High** — gates embedded schema editing |

---

## Next steps (queue)
- ~~Step 1 — Scope & framing~~ ✅ · ~~Step 2 — Actors & jobs~~ ✅ · ~~Step 3 — Read loop~~ ✅ ·
  ~~Step 4 — Write loop~~ ✅ (incl. W4.7 atomicity = saga, L9/L10)
- **Step 4b — Schema-editing requirements (L5):** embedded editor surface **and** the Hippo
  schema-apply dependency (cross-component requirement).
- **Step 5 — Non-functional / platform constraints:** capability negotiation, auth seam,
  pluggable-endpoint config, build-time agent authoring substrate (L6).
- **Step 6 — Promote to ADRs:** flip 0019/0020/0022–0025 → Deferred; keep 0018/0021 active for
  build-time authoring (L6); narrow ADR-0017 (L2); new ADR(s) for write capability +
  workflow-component contract + embedded schema editing + Hippo schema-apply dependency;
  `vision.md` portal-first note.
