# Aperture Portal — Open Questions: Proposed Resolutions

**Status:** 🟡 **PROPOSED — not yet ratified.** Working notes from the 2026-06-13
design discussion. These are recommendations to pressure-test and confirm (or reject)
in the next working session, not settled decisions.

> **Carried into ADRs (2026-06-13):** these proposed resolutions are now the recommended
> *Decision* + rationale of the corresponding `Proposed` ADRs in [`decisions/`](./decisions/):
> Q2 → ADR-0010 (keystone), Q1 → ADR-0011, Q4 → ADR-0012, Q3 → ADR-0013. Ratify by flipping
> the ADR status to `Accepted`. This file is retained as the working notes / dependency-chain
> rationale.

---

## Keystone insight: the four questions are not independent

Resolve in dependency order — **Q2 → Q1 → Q4 → Q3**:

- **Q2** (view-description vocabulary) decides *where computation lives*, which
- determines **Q1** (runtime), and
- **Q3** (agent loop) and **Q4** (config layering) are then largely *forced* by
  invariants already settled in §2 of the handoff.

Through-line: **push computation into the query/binding layer, keep the view vocabulary
a noun-catalog, and runtime / loop / layering snap into place** — and the Type-B
component surface shrinks to "genuinely novel rendering," which is the rare case the
sandbox exists for.

---

## Q2 — Richness of the view-description vocabulary *(keystone; resolve first)*

**Proposed:** Make the vocabulary a **catalog of typed, parameterized view primitives**
(table, faceted-list, key-value detail, line/step, bar, scatter, KM-curve, heatmap…),
each a closed LinkML type per handoff §2.4. A view description is then *which primitive +
bound data + typed params*. Bounded yet growable.

**Calibration rule (enforceable against the §10 checklist):**

> Every addition to the vocabulary is a **noun** (a chart/layout type), never a **verb**
> (a transform/expression). Nouns go in the vocabulary; verbs live in the query/binding
> (GraphQL) or in a Type-B component.

- Escape hatch when a primitive is missing is **"compose primitives," not "raw render"** —
  preserves the §2.8 "serializable view description, no DOM" invariant and bounds blast
  radius to one slot.
- **Survival-curve probe (§9.2):** prediction is that KM-curve is a known chart type →
  add it as a primitive → "survival stratified by genotype" becomes *mostly Type-A
  config* (query with a stratification group-by + KM primitive), not a Type-B component.
  If that holds, most "novel views" are really "missing primitive + richer query."
  **This is the load-bearing bet to test.**

---

## Q1 — Component execution runtime *(falls out of Q2)*

**Proposed:** **Client-side, Web Worker, view-spec-emitting components** as the default
sandbox.

- If Q2 holds (heavy compute pushed into the hippo query/binding layer), a component is
  a thin pure function `(data, params) → viewDescription`. A Web Worker is then the
  strongest, simplest sandbox: no DOM, no ambient network, and the `postMessage` /
  structured-clone boundary *is* the injected capability-scoped client of §2.7.
- Consistent with §5.3 (render-check already runs in "Node / Web Worker") — headless
  validation and live runtime share one runtime.
- The "Python user base" objection (§9.1) weakens: users write declarative bindings +
  thin view-mappers, not in-component analysis.
- Two escape valves for genuine Python need:
  1. Real analysis (e.g. lifelines survival fit) belongs to a **Canon/Cappella-style
     computed result** whose output Aperture binds to — not the view layer.
  2. If §9.2's probe proves in-portal Python is genuinely needed: **Pyodide (WASM) inside
     the same Web Worker boundary.** Same threat model, gives Python, at a bundle/perf
     cost. *(User reaction 2026-06-13: liked the Pyodide approach.)*

---

## Q4 — Config layering *(mostly decided by §2–§3)*

**Proposed:** **Layered authoring resolving to one canonical validated instance** — and
the layers are the ones the design already implies, not a new four-tier invention:

1. **Schema-derived defaults** — *derived, not stored* (regenerated from the LinkML
   schema per §2.4). A derived layer can't drift, so it isn't "a place bugs hide."
2. **Deployment/admin config** — §3 registry config; stored, versioned, provenance-tagged.
3. **User state** — §3; high-churn, scoped to viewer.

- Single-document is already off the table: §3 commits to deployment-config vs user-state
  as *distinct LinkML classes*.
- Neutralize the "layers hide bugs" risk with two mechanisms already needed in §6:
  **(a) layer-attributed resolution** — `describe`/introspect returns the resolved value
  *and which layer produced it*; **(b) validate the resolved output** — dry-run validator
  runs against the resolved instance, catching bad layer combinations before apply.
- **Drop the proposed 4th layer** ("user-accessible subset") *as a layer*: per §2.6
  that's pure ACL/visibility over layers 2–3, not config precedence.

---

## Q3 — Local vs. remote agent loop *(forced by §2.2 / §2.4)*

**Proposed:** **One loop — the agent always talks to a running Aperture/hippo API.**

- Local = hippo on localhost, possibly no-op auth; remote = same API, authenticated. The
  capability-scoped client (§2.7) resolves "current viewer" identically in both.
- "Edit files in a repo" reintroduces a second source of truth that must sync with the
  canonical hippo instance — exactly the drift §2.4 forbids.
- Matches the kept `backends/` protocol (`MosaicSdkBackend` local / `MosaicRestBackend`
  remote behind one interface).
- **One honest carve-out:** Type-B **component source code** is code and wants VCS +
  review. Precise rule: *config (Levels 1 & 2) travels by API into hippo; component
  source (Level 3) travels by VCS, passes the three-layer headless validation (§5), then
  registers into hippo.* Not two agent loops — "config by API, code by VCS+validate+
  register" — which §5's hot-reload flow already implies.

---

## Net (all PROPOSED)

| Q | Proposed resolution |
|---|---|
| Q2 | Typed primitive catalog; nouns-only rule; compute in the query layer. *(keystone)* |
| Q1 | Client-side Web-Worker view-spec components; Pyodide as the Python escape hatch in the same boundary. |
| Q4 | Three layers (derived defaults → admin → user) → one validated instance; layer-attributed resolution + validate-the-resolved-output; "user subset" is ACL, not a layer. |
| Q3 | One API-based config loop; component *source* is the only file-based artifact. |

**Next session — first action:** pressure-test the Q2 survival-curve probe against the
noun-catalog claim. That bet validates or breaks the whole chain.
