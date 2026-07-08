# Aperture — Actors & Personas (orientation)

**Status:** 🟢 Orientation doc — the cast Aperture is designed for. Decisions that formalize
each tension live in `decisions/` (cited inline); this doc is the map, the ADRs are
authoritative. Last updated 2026-06-16.

Aperture's design is justified against these actors. They were implicit in the vision
handoff (§1 guiding intent, §7 request types) but never enumerated; this doc pins them down
and links each to the decision that resolves it.

## The cast

### 1. Researcher (data consumer) — the primary user
Domain expert, not a developer. Browses, faceted-searches, builds and saves views, makes
charts, exports cohorts, occasionally shares. Two ways to touch Aperture: (a) the rendered
portal UI; (b) **directing an agent in natural language** to change the app. Their authority
is whatever Bridge grants them (full access locally, ADR-0016). Near-term, path (b) means
driving an **external coding agent** (MCP/API); the in-app chat is deferred (ADR-0021).

### 2. Coding agent — a first-class non-human actor
An LLM-driven agent (Claude Code-style external client now; in-app chat later, ADR-0021).
Acts with the **invoking user's delegated authority — no more, no less (ADR-0018)**; never a
distinct principal, never a Bridge `service`. Does Type-A config edits and scaffolds Type-B
components (handoff §7). Needs introspect / dry-run-validate / reversible-attributed-apply
(handoff §6). Reasons on the LLM provider key (ADR-0019); *acts* on the user's session.

### 3. Admin / portal owner
Stands up and governs a deployment: deployment/registry config, the ACL/visibility
**promotion** decision (ADR-0007), **LLM provider-key assignment (ADR-0019)**, and schema
editing. Maps to Bridge's `admin` role.

### 4. Component author — not a separate persona
The Researcher **plus** access to the Type-B component capability. Same artifact at different
visibility (ADR-0007); the intent is that users **guide the coding agent** to author
components rather than hand-writing them.

### 5. Schema author / data modeler — in-scope for Aperture
Authors the LinkML domain schema everything derives from. Aperture is the home for an
**embedded `linkml-modeler-app`**, schema editing gated to admin (Bridge `admin`; schema
management is admin-only). Upstream of the data plane (ADR-0017) but a first-class Aperture
capability, not just a precondition.

### 6. (Boundary) Bridge / permissions owner
Where roles, user→role mapping, and enforcement live — **not** Aperture or Hippo (ADR-0008,
ADR-0016; platform `sec6_security_model.md`). Deferred (ADR-0016); local deployments give the
local user maximum permissions.

## Two credentials, never conflated

Every agent interaction involves **two distinct credentials** (ADR-0018, ADR-0019):

| Credential | Scope | Owner | Role |
|---|---|---|---|
| **DataHelix user session** | per-viewer, Bridge-enforced | the user | the agent's *hands* — every effect rides it |
| **LLM provider key** | deployment/admin config | admin-assigned (ADR-0019) | the agent's *brain* — reasoning only |

The agent reasons on the provider key and *acts* on the user session. The provider key
confers **no** DataHelix authority; it is never an enforcement backdoor.

## Decisions that formalize the actor tensions

| Tension | Resolved by |
|---|---|
| What authority does the agent hold? | **ADR-0018** — the invoking user's, exactly |
| Which LLM key does a user use? | **ADR-0019** — per-user/role key mapping, admin-assigned |
| How are agent interactions audited? | **ADR-0020** — conversations & actions are provenance events |
| In-app chat vs external agent, when? | **ADR-0021** — in-app deferred; MCP/API coding-agent first |
| Promotion / shared components safe? | ADR-0007, ADR-0008 |
| Where does enforcement live? | ADR-0008, ADR-0016; platform `sec6_security_model.md` |
