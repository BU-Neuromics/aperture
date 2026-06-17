# Aperture — The Instruction-Path Model (the data-story substrate)

**Status:** 🟠 Working design (2026-06-17). The formal model **underneath**
[`prefab/data-stories.md`](./prefab/data-stories.md): what a "data story" *is* as a data
structure, independent of any particular UI. Where `data-stories.md` is the keystone MVP
(linear, conversational, Hippo-only), this doc is the general structure that MVP is a narrow
slice of. Companion to [`vision.md`](./vision.md) and the platform
[domain-graph model](../../platform/design/domain-graph.md).

## Why this exists

We considered five UI prototypes for the AI-native explorer (conversational notebook,
transcript + live artifact, steerable portal, spatial exploration graph, document/briefing
composer). They are not five apps — they are **five renderers over one underlying object.**
Naming that object precisely is what lets us build the model once and render it many ways, and
lets us ship a simple linear UI now without foreclosing the richer ones.

The object is an **instruction path**: a sequence (in general, a graph) of typed, first-class
instructions that deterministically produces a sequence of states and the artifacts rendered
from them.

## 1. The core model

Four types, one reduction:

```
state[n]  = apply(instruction[n], state[n-1])
artifacts = the renderings produced along the way
```

| Type | What it is |
|---|---|
| **`Instruction`** | A first-class, **source-tagged** event (a chat turn, a UI event, an agent action). Expands to one or more nested, sequential typed **ops** (think tool calls). The unit of rewind. |
| **`State`** | A typed **subgraph specification** — the selection/predicates that *denote* a subgraph of `Entity`/`Relationship` instances (see §2). Intensional, data-light, replayable. |
| **`Artifact`** | The **materialization** of work as-of the story's timestamp: an evaluated subgraph (entities + relationships) or a rendered view primitive (table, chart, summary). Immutable, provenance-stamped, cached. |
| **`DataStory`** | The persisted container: an ordered/linked set of `Instruction`s, a single as-of watermark, and the materialized `Artifact`s. Itself a LinkML artifact stored in Hippo (ADR-0003). |

This formalizes `data-stories.md`'s "a data story = a sequence of cohort-states + transforms,
narrated": the **transforms** are promoted to first-class typed `Instruction`s; the
**cohort-states** are generalized to `State` (§2).

## 2. State is a generic typed subgraph (not a "cohort")

`data-stories.md` framed the evolving selection as a *cohort*. We generalize: a **State is a
generic subgraph** — a collection of objects that inherit from `Entity`, plus the
`Relationship`s among them, following the semantics of the LinkML schema. This is the truest
expression of the platform's [domain-graph model](../../platform/design/domain-graph.md):
"every query returns a knowledge subgraph; metadata-vs-data is a query-relative *role*."

A **"cohort" is then a State viewed through a focal lens** — a focal entity type plus its
selected instances. Re-rooting / grain-pivot (subjects → samples) is *changing the lens*; the
underlying subgraph stays generic. The grain-agnostic, re-rootable property from
`data-stories.md` falls out for free.

**Intensional, not extensional (the load-bearing distinction).** A State is stored as the
**specification** that produces the subgraph (the predicates/selections over types and
relationships), *not* as the materialized objects. Evaluating that spec against Hippo as-of the
story's watermark (§5) yields the concrete subgraph, which is captured as an `Artifact`. Keeping
State intensional is what preserves reproducibility and the "re-runnable" property and keeps
stories small.

**Deferred — ops over heterogeneous entity types.** Because a State is a generic subgraph, an
op must know how to operate over *different* `Entity` types within it (filter subjects in the
same step it touches samples; a set-op whose operands span types). The minimal op set still
generalizes — each op is parameterized by the entity-type(s)/slot(s) it addresses, resolved
against the LinkML schema — but the full semantics of **multi-type ops** is hard and is
**deferred**. The v1 op catalog stays single-focal-type (the `data-stories.md` op set).

## 3. Instructions: source-tagged, expand to nested ops

The key unification: **chat turns and UI events are both `Instruction`s**, differing only in
*source* and in whether they need elaboration:

- A **UI event** (`click facet diagnosis=PTSD`, `pivot to samples`) is *born typed* — it is one
  op already.
- A **chat turn** (`"which genotypes do we have on these subjects?"`) is *raw intent*,
  elaborated by the LLM into one or more typed ops, then **dry-run-validated** (ADR-0009)
  before it can apply.

```
Instruction {
  id
  parents: [state_id]          # see §4; ≤1 in v1
  source:  chat | ui_event | agent | replay     # provenance, not behavior (ADR-0020)
  raw:     <NL utterance | UI gesture payload>   # what the user did — canonical & editable
  ops:     [Op]                # what it MEANS — derived, inspectable, disposable
  status:  valid | invalid | suspended
}
```

**Op catalog** (the closed vocabulary, from `data-stories.md`):
`filter · exists-related-filter · distinct-values · group-by+count · pivot-grain · set-op
(union/intersect/difference) · render-as-primitive`. Two kinds:
- **Transform ops** advance the subgraph → a new `State`.
- **Render ops** bind an `Artifact` to the current `State` without advancing it. (So "show as
  bar chart" then "show the same as a table" = two artifacts on one state.)

**Rewind grain = the `Instruction`.** A chat turn's nested ops are *inspectable* (the
debugging / dry-run-validation surface — "why did it return that?") but **not independently
rewindable**. To change a turn, the user edits the **prompt** and the turn re-elaborates; the
ops are a derived expansion, not addressable state. The "rollback bar" snaps to
turn/event boundaries.

## 4. Topology is a property of the data, not the engine

Each `Instruction` references its parent state(s). Topology is then entirely determined by
arity — there is one structure, three constraints:

| Topology | Constraint | Meaning |
|---|---|---|
| **Linear** | ≤1 parent, ≤1 child | A single narrated path. **This is v1.** |
| **Tree** | ≤1 parent, *many* children | Forking / alternative explorations. |
| **DAG** | *many* parents | Convergence via **set-op** instructions (union/intersect/difference). |

Linear is the degenerate case of the general model — so the core never needs rebuilding to grow
into the richer topologies.

**Convergence = grain-typed set-ops.** A multi-parent node is a set-op over its incoming States.
This is the natural home for **heterogeneous cohort assembly** — e.g. PTSD/MDD cases filtered by
one set of criteria and controls by another, then `union`ed. Constraint: set-ops are only
well-defined over **union-compatible** States (same grain). `union(Subject, Sample)` is
ill-typed; operands must share a grain or be pivoted to a common one first — enforced by the
dry-run validator (ADR-0009), which may reject or offer an auto-pivot.

**Forward-compatibility discipline (the v1 rule):** make the **data model general now, the
validator and UI narrow now.** Persist `parents` as a list of state-ids from day one; in v1 the
validator **enforces `len(parents) ≤ 1` and single-child.** v1 stories are physically linear but
already stored in the general schema — lighting up tree/DAG later is a *validator relaxation +
adding the set-op op type*, never a migration.

## 5. Reproducibility: one as-of watermark per story

**A data story run today must tell the same story whenever it is rerun** — unless the user
explicitly asks for new data. We get this from Hippo's existing provenance substrate:

- Hippo has **no hard deletes**; every change is an append-only provenance event with a
  `state_snapshot` and `previous_state_hash`; `client.state_at(entity_id, timestamp)` already
  reconstructs an entity as-of T; even `schema_version` is derived from the provenance log
  (`hippo/docs/data-model.md`). So **both the data and the type system are recoverable as-of T.**
- A `DataStory` carries **one as-of watermark** (a timestamp). Every query in the story resolves
  against the graph as it stood at that watermark. Replay is therefore identical regardless of
  when it runs.
- **"Pull in new data" is not a silent refresh.** It is an explicit instruction that produces a
  **new story-version at a new watermark** (replaying the path against the new T) and is itself a
  recorded, rewindable provenance event. One watermark per story-version — never a single story
  mixing data from multiple times.

**Content-addressed nodes → free memoized recompute.** A node's identity is
`hash(op, parent-hashes, watermark)`. Editing an instruction recomputes only the reachable
descendants whose hash changed; unchanged branches are reused. This is the same idea Hippo
already uses (`previous_state_hash`) — the instruction graph and the provenance graph are the
same shape for the same reason.

## 6. Rewind & edit

Two layers, mirroring the data-update discipline above:

- **Story content** — the instruction path, *mutable by replacement*: rewind to instruction *k*,
  edit it, and **recompute downstream** against the fixed watermark (deterministic, since replay
  re-evaluates typed ops as-of T). A downstream instruction whose op no longer validates against
  the changed upstream State is **suspended and flagged** (CAD-style "failed to regenerate") for
  the user to re-prompt — not silently dropped. (Edit *behavior* — recompute-vs-discard — is
  orthogonal to *topology*; we choose recompute-with-suspend.)
- **Edit history** — an **append-only** provenance log of how the story itself was edited ("at
  14:03 user rewound to step 2 and replaced downstream"). Nothing is ever truly lost (audit log),
  yet the story stays a clean line (content).

**Deferred — rewind on a DAG.** Once a node has multiple downstream paths and multiple set-op
ancestors, "scrub to a point" is no longer well-defined. The *recompute* (re-evaluate the
reachable subgraph) stays well-defined; the *UI affordance* of scrubbing does not. Deferred with
the DAG explorer (§7).

## 7. UI modes as slices of the topology

With a topology-agnostic core, **a UI mode is defined by which slice it admits:**

> UI mode = (admitted topology) × (admitted instruction sources) × (state projection) × (deliverable slice)

The five prototypes are points in this space (e.g. the conversational notebook = linear ×
chat-primary × scrolling-history × the-conversation; the spatial explorer = full-DAG × all
sources × node-canvas × the-exploration). The build ladder:

1. **v1 — Linear, as-of, rewind.** The keystone MVP (`data-stories.md`). The mode that refuses
   multi-parent and multi-child.
2. **Rung 2 — Cohort-assembly mode** (a *constrained* DAG): exposes **only** set-op convergence
   ("combine these N independently-filtered cohorts") without freeform branching. Smallest
   surface that captures the PTSD/MDD-vs-controls case; high enough value to plausibly precede
   generic branching.
3. **Future — Full DAG story explorer.** The freeform spatial view — i.e. the renderer that
   admits the entire topology. Roadmap.

Rungs 2–3 are additive UI + validator relaxations, not rewrites.

## 8. LinkML sketch (illustrative)

Persists as config-in-Hippo (ADR-0003); this is a shape sketch, not the final schema.

```yaml
classes:
  DataStory:
    slots: [id, title, as_of_watermark, instructions, head_state, created_by]
  Instruction:
    slots: [id, parents, source, raw, ops, status, node_hash]
  Op:                       # nested within an Instruction; not independently addressable
    slots: [kind, params]   # kind ∈ {filter, exists_related_filter, distinct_values,
                            #         group_by_count, pivot_grain, set_op, render_as_primitive}
  State:                    # a typed subgraph SPECIFICATION (intensional)
    slots: [id, focal_type, predicates, grain]   # denotes a subgraph of Entity/Relationship
  Artifact:                 # materialization as-of the watermark (extensional, cached)
    slots: [id, of_state, kind, data_version, payload_ref]
slots:
  parents:   { range: State, multivalued: true }   # ≤1 enforced by validator in v1
  source:    { range: instruction_source_enum }     # chat | ui_event | agent | replay
```

`State` ranges over the deployment's LinkML domain schema — every domain object inherits from
`Entity`, every link is a `Relationship`. Aperture adds **no** domain nouns (ADR-0002).

## 9. New platform requirement this surfaces

Hippo today exposes as-of reconstruction **per entity** (`state_at`). A data story needs
**graph-level / query-spanning as-of**: "evaluate this whole subgraph query as the graph stood
at T," resolving every entity, relationship, *and* schema version to T transparently — and over
the transport Aperture uses (not yet on the GraphQL surface, which is equality-filter +
additive-only). The substrate exists (it is all in the provenance log); the query-spanning
**resolver** is the build. This extends the `vision.md` invariant: every domain Aperture drives
must expose a typed, introspectable, dry-run-validatable, provenance-tracked — **and
time-travelable** — declarative representation.

## 10. Open decisions (recorded as ADRs)

All four Aperture-side decisions are now `Proposed` ADRs in [`decisions/`](./decisions/), behind
the still-`Proposed` keystone ADR-0010 (ratify after the keystone probe runs):

- **D-1 → [ADR-0022](./decisions/ADR-0022-data-story-is-an-instruction-path.md)** — a data story
  is an instruction path → typed subgraph states + artifacts. The model in this doc.
- **D-2 → [ADR-0023](./decisions/ADR-0023-data-story-reproducibility-as-of-watermark.md)** —
  reproducibility via one as-of watermark per story-version; "pull new data" as a recorded
  watermark-advancing event. Depends on D-4.
- **D-3 → [ADR-0024](./decisions/ADR-0024-instruction-path-linear-first-general-schema.md)** —
  general `parents`-list schema now, linear-only validator in v1 (§4 discipline).
- **D-5 → [ADR-0025](./decisions/ADR-0025-mid-path-edit-recompute-with-suspend.md)** —
  recompute-with-suspend (not discard) on mid-path edit (§6).
- **D-4 — Hippo graph-level as-of query** (§9). → a **Hippo** requirement/spec item, not an
  Aperture ADR; referenced by ADR-0023, to be filed against Hippo.

## 11. Explicitly deferred

- Multi-type ops over heterogeneous subgraphs (§2).
- Tree/DAG topology in the UI; the cohort-assembly and full-explorer modes (§7).
- Rewind/scrub semantics on a DAG (§6).
- DAG merge beyond set-ops.
