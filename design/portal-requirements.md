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

## Next steps (queue)
- ~~Step 1 — Scope & framing~~ ✅ · ~~Step 2 — Actors & jobs~~ ✅
- **Step 3 — Functional requirements (read loop):** browse → facet → detail → cross-link →
  export, mapped to Hippo's documented GraphQL limits.
- **Step 4 — Functional requirements (write loop):** generated forms + the Tier 1 workflow
  component contract; client/server validation split.
- **Step 4b — Schema-editing requirements (L5):** embedded editor surface **and** the Hippo
  schema-apply dependency (cross-component requirement).
- **Step 5 — Non-functional / platform constraints:** capability negotiation, auth seam,
  pluggable-endpoint config, build-time agent authoring substrate (L6).
- **Step 6 — Promote to ADRs:** flip 0019/0020/0022–0025 → Deferred; keep 0018/0021 active for
  build-time authoring (L6); narrow ADR-0017 (L2); new ADR(s) for write capability +
  workflow-component contract + embedded schema editing + Hippo schema-apply dependency;
  `vision.md` portal-first note.
