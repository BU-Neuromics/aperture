# HANDOFF: Mosaic query-surface work (from Aperture cross-class-query exploration)

**Audience:** an agent with write access to `BU-Neuromics/mosaic`.
**Origin:** Aperture `design/cross-class-query.md` (Rev 2, on this branch) — read it first; this
file is the Mosaic-side work order distilled from it. All `file:line` cites below refer to the
**mosaic repo** at commit `502991c` (v0.12.1) unless prefixed `aperture:`.
**This branch is temporary** and not meant to merge into Aperture `main`; the exploration doc
itself lives on `claude/aperture-stale-branches-uhbye1`.

---

## Context in three sentences

Aperture is adding cross-class criteria queries ("donors over 60 having ≥1 sample of type X"),
a joined anchor-grain table with CSV export, and a graph exploration view — all derived from
GraphQL introspection per its ADRs (generic/no-enumeration, no scripting layer, capability-
honest). The exploration priced the Mosaic capabilities that make this fit naturally; the
governing principle is that **the introspected GraphQL schema itself becomes the query-
capability contract** (typed input objects, not CEL strings, on the wire). Your job is the
Mosaic side: doc-drift fixes, two ADRs, and OpenSpec change proposals — **design artifacts
first; do not implement M1–M5 unless separately instructed.**

## Deliverable 1 — doc-drift fixes (cheap, do first, its own PR)

The Mosaic docs lag shipped code; fixing this is prerequisite credibility for the ADRs:

1. `design/sec4_api_layer.md:732` — says multivalued slots don't persist. Fixed in v0.10.0
   (#79/ADR-0002; `sqlite_adapter.py:1422-1526`), PG parity v0.11.0 (#81). The *residual*
   limitation is narrower: multivalued refs can't be **filtered** on (edges, not columns;
   `graphql/resolvers.py:435-442`).
2. `design/sec4_api_layer.md:734` and `docs/graphql.md:188` — say "equality filters only".
   `FilterOp.IN` shipped v0.12.0 (#102; `graphql/resolvers.py:53-72`).
3. `design/INDEX.md:214` — ADR-0005 "implementation pending"; it shipped (v0.12.0 "BREAKING:
   edge-only GraphQL references").
4. `design/decisions/README.md:25-30` index table — missing ADR-0005 entirely; shows ADR-0001
   as Proposed while the file says Accepted (`ADR-0001:3`; `INDEX.md:211` has it right).

## Deliverable 2 — Mosaic ADR-0006: typed GraphQL filter contract

Next free ADR number is **0006** (template: `design/decisions/_template.md`; update the README
index table AND `design/INDEX.md` per `CLAUDE.md`). Contents to record:

**Decision:** the GraphQL filter contract is generated **typed per-class input objects** —
`<Type>Filter` with per-slot operator objects (`{eq, neq, in, gt, gte, lt, lte, contains,
isNull}` selected by slot kind/range) plus `and/or/not` combinators, exposed as a `where:` arg
beside the existing flat `filters:` arg (deprecation path for the flat form is an open
sub-question — ADR-0005's "clean break, early software" precedent at `ADR-0005:102-108` is the
prior art for breaking instead). Relationship predicates (phased, see below) nest the target
type's filter under the edge name, with `some`/`none` quantifiers on multivalued edges.

**Explicitly decided against: CEL on the GraphQL wire.** CEL stays for validator conditions
(its current role) and may serve as an internal adapter IR, but the consumer-facing contract is
typed inputs, because: a `filter: String` CEL arg is invisible to introspection (breaks
Aperture's derive-everything rule and capability gating); typed inputs fail GraphQL validation
with precise errors before execution (the dry-run property); and the documented CEL strategy
("translate common patterns to SQL, fall back to in-memory", `sec4_api_layer.md:390-393`) is an
invisible performance cliff. This supersedes/narrows the REST-side CEL sketch at
`sec4_api_layer.md:369-393` for the GraphQL transport — say so explicitly.

**Landing sites (evidence the pricing is real):**
- Operator vocabulary: `VALID_FILTER_OPS` + `normalize_filter`, `core/storage/__init__.py:50-106`
  — the single chokepoint; #129 deliberately made unsupported ops raise rather than degrade.
- SQL builders: SQLite `_find_per_class` `sqlite_adapter.py:2741-2794` (typed per-class columns
  — comparisons are trivial); Postgres `find` `postgres_adapter.py:2039-2092` (JSONB `data->>`
  — **needs per-range casts** `::numeric`/`::timestamptz` driven by `SlotModel.range`,
  `core/schema_typing.py:93`; this is the main cost and correctness risk).
- As-of mirrors: `_matches_filters` exists in four places (SQLite `:2709-2739`, PG `:2132+`) —
  every operator must land in all of them or as-of queries diverge.
- Input-type generation: copy the `_build_one_input` pattern, `graphql/schema_builder.py:673-724`;
  the two-pass bare-class trick at `:507-513` is the precedent for cyclic nested inputs.
- GraphQL translation: `_to_sdk_filters` + `FilterInput`, `graphql/resolvers.py:59-72,405-444`.

**Open sub-questions to resolve in the ADR:**
- `isNull` semantics — the read layer already treats null ambiguously (`_find_per_class` skips
  None columns `sqlite_adapter.py:2830-2839`; required multivalued nulls read as `[]`,
  `schema_builder.py:729-730`).
- Relationship-predicate phasing: **M5a to-one first** (correlated EXISTS on the FK column —
  moderate) before **M5b to-many quantifiers** (EXISTS against the `relationships` link table +
  recursive input types + a filter-nesting depth cap; `QueryDepthLimiter` guards output
  nesting only). Note there is no join/subquery machinery in the builders today, and
  multivalued refs are walled off from filtering by design (`resolvers.py:435-442`).
- **asOf × relationship predicates:** the temporal path filters in Python over reconstructed
  state and declares relationship-existence out of scope (`sqlite_adapter.py:2674-2675`,
  hippo#71). Either reject `asOf`+relationship-predicate with a coded error, or fund the
  temporal join — an undocumented wrong answer is the forbidden outcome.
- Ensure LinkML `description`/`comments` propagate into GraphQL SDL descriptions for types,
  fields, enums, and the new inputs (verify current state; this is the "literate schema" ask).

**Cross-references (two-sided, per the ADR-0001 ↔ Aperture ADR-0023 convention,
`ADR-0001:6,10-27,49-51`):** `Related:` Aperture `design/cross-class-query.md` §7 and Aperture
ADR-0035 (Proposed; may not exist yet — cite the exploration doc meanwhile) +
`aperture/design/portal-requirements.md` **X3** (Aperture will file it; the X4/L9/L10 citation
form is already used in `design/sec5_ingestion.md:206` and
`openspec/changes/batch-unit-of-work/proposal.md:14-15`). Add a `Tracking issue:` line
(BU-Neuromics/mosaic#NN — file one).

## Deliverable 3 — Mosaic ADR-0007: aggregation & ordering surface

**Decision:** add (a) count-mode queries (cheap filtered `total` — the field exists at
`schema_builder.py:641`/`query_service.py:270` but costs full materialization because
`Query` is built without limit/offset, `query_service.py:184-188`); (b) facet value counts
(`facetCounts(field, where)` — the GROUP BY precedent exists on both adapters:
`sqlite_adapter.py:3034-3053`, `postgres_adapter.py:2370-2385`); (c) min/max per slot for
ranges; (d) `order_by` (generated per-type enum from `filterable_slot_names()`,
`schema_builder.py:191-202`). Ship together — they share the limit/offset/order pushdown into
the storage `Query` and both adapters.

**Two recorded traps to pin in the ADR:**
- **Availability consistency:** `entity_counts()` counts unavailable entities
  (`sqlite_adapter.py:3035-3041`) while every list query filters `is_available = 1`
  (`:2760`). The new aggregation surface must see exactly what list queries see.
- **Temporal fields are computed, not stored** (provenance-derived): `orderBy: createdAt`
  cannot be a column sort; today's only ordering is the Python-side sort at
  `query_service.py:268`. Preserve the `limit=0` discipline (#130, `query_service.py:276-279`).

**Cross-references:** Aperture **X1** (`aperture/design/portal-requirements.md:323`, tracked as
hippo#96 — note #96 has **zero footprint** in the mosaic working tree; this ADR fills a void,
not reconciles prior design) + Aperture ADR-0035.

## Deliverable 4 — OpenSpec change proposals (design-only)

Per the house process (`openspec/changes/<slug>/{proposal.md,tasks.md}`, tracking issue on
line 3; model: `openspec/changes/batch-unit-of-work/proposal.md`):

- `typed-filter-inputs` (M1, under ADR-0006) — increments: operators on flat path → generated
  `<Type>Filter` + `where:` → M5a to-one nesting → M5b quantifiers.
- `aggregation-and-ordering` (M2, under ADR-0007).
- `search-composition` (M3): search returns a page envelope and accepts filters via id-set
  composition (ranked FTS ids from the good bm25 path `sqlite_adapter.py:1736-1814` fed as an
  `id IN` filter). Fixes three shipped defects at once: per-hit N+1
  (`query_service.py:396-411`), missing `total` on search twins, and the `offset >= limit → []`
  slice bug (`graphql/resolvers.py:491-499`). Decide bm25-rank vs `order_by` precedence.
- `heterogeneous-roots` (M4): `searchAll(q, limit)` and `neighbors(id, depth, asOf)` as
  JSON-envelope roots following the `XrefMatch`/`RelatedEntity` house pattern
  (`resolvers.py:124-160`), wrapping `RelationshipManager.traverse`
  (`core/relationship.py:241-299`, which already has an as-of variant). **Must address:**
  `traverse` walks the link table only, so single-valued (column-stored) reference edges are
  invisible — union column edges in or document the hole loudly; batch node materialization by
  type (DataLoader pattern at `schema_builder.py:238-260`) instead of get-per-node. A true
  GraphQL union/interface root is out of scope (it inverts the deliberate `Entity` exclusion,
  `core/schema_typing.py:37-45`; ADR-0005 flags it as future work) — if pursued later, it is
  its own ADR.

## Sequencing & guardrails

Priority: Deliverable 1 → ADR-0006 + ADR-0007 → OpenSpec proposals. M1 is the keystone; M2
unlocks Aperture's live criterion counts; M3/M4 are independent and cheap-to-moderate; M5b is
the only expensive item and nothing else waits on it. Every feature is double-priced by the
SQLite/Postgres parity discipline — keep both adapters in every estimate. Do not implement
storage/GraphQL changes as part of this handoff; land the design artifacts and file tracking
issues so implementation can be scheduled per increment.
