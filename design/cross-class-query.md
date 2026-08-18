# Cross-Class Query & Heterogeneous Results — Design Exploration

**Status:** 🟠 Working — research + candidate design, feeding a Proposed ADR slate (0035+)
**Date:** 2026-08-18
**Problem owner:** Aperture (portal query capability, Level-2 binding); instruction-path composition stays with Reel

---

## 1. Problem

The portal's default surface is a nav list of every derived collection. That is honest but not
useful: the first question a researcher brings is rarely "show me all X" — it is a *criteria*
question that spans classes ("donors over 60 with samples of type X processed after date Y").
Today Aperture cannot express that at all. The gap has three parts:

1. **Query expression.** A user-friendly way to build potentially complex criteria that traverse
   reference edges between classes, driven entirely by the introspected GraphQL schema.
2. **Tabular results + CSV export.** A joined, SQL-like flat table as the workhorse presentation
   and the export format.
3. **Heterogeneous result exploration.** Optionally, a graph view over result sets that mix
   classes, explorable by expanding neighbors.

This doc records (§2) the constraint envelope from our ADRs, (§3) what the endpoint can and
cannot execute today, (§4) external prior art, and (§5–§9) a candidate design with a staged
delivery plan and the decisions it forces.

## 2. Constraint envelope (what any design must satisfy)

Hard constraints from Accepted ADRs:

- **Derived, never enumerated** (ADR-0002). Every class, edge, operator, and traversal offered
  must come from introspection. No hardcoded join lists, no domain nouns.
- **No middle scripting layer** (ADR-0004). The query cannot be an expression box or a DSL the
  user types. It must be a *closed, typed, declarative artifact* — a noun. ADR-0004 explicitly
  assigns "relationship joins" to Level-2 binding territory, which is where this feature lives.
- **Capability-honest** (ADR-0029). Every operator/traversal/aggregate must map to a declared
  capability and visibly gate off otherwise. Client-side compensation is allowed only at small
  scale, itself behind the gate, never silent.
- **One endpoint** (ADR-0017 amendment). Cross-*class*, never cross-*source*.
- **New views are nouns** (ADR-0009/0010). A graph view enters the primitive catalog as a typed,
  parameterized primitive emitting a serializable, headlessly-validatable view description.
- **Persistence rides the control plane** (ADR-0032). A saved query is a `{kind, name, payload}`
  versioned-envelope document.

Recorded prior decisions to build *with*, not around:

- **ADR-0022** (relocated to Reel ADR-0001) already defines the sanctioned op vocabulary:
  `filter · exists-related-filter · distinct-values · group-by+count · pivot-grain · set-op ·
  render-as-primitive`, over intensional subgraph **states** viewed through a **focal lens**
  (focal type + selection). Heterogeneous multi-type op semantics are its named open problem.
- **ADR-0024** (→ Reel ADR-0003) **rejects arbitrary join semantics**; grain-typed set-ops and
  grain pivots are the sanctioned convergence mechanisms.
- **The Reel boundary.** The instruction-path/data-story engine is Reel's. Per
  `prefab/README.md`: *"the portal's core-loop cohort/query-state remains the foundation Reel's
  stories build on."* Aperture's job is the **single query state** — one anchored, criteria-bound
  subgraph selection — not paths, versions, or story composition.

The vision doc supplies the through-line: push computation into the query/binding layer; keep
the view vocabulary a noun catalog; every artifact typed and dry-run-validatable so an LLM can
drive it (`vision.md:50-62`). A cross-class query artifact is not just compatible with the
AI-native framing — it is the substrate the agentic probe ladder (`vision.md:98-108`, rung 2)
requires.

## 3. What the endpoint can actually execute (and what's lying on the floor)

From the committed live capture (`web/src/data/testing/realIntrospection.json`, hippo 0.10.3)
and the current adapter:

**Available and used:** per-class page envelopes with `filters: [FilterInput!]` (flat
`{field, value}` equality, keyed by LinkML slot name), `filterMode: FilterMode`, offset
pagination, FTS search twins, singular detail fields, `entityHistory`.

**Available and UNUSED — free capability:**

| Capability | Where | Note |
|---|---|---|
| `FilterMode { AND, OR }` | derived at `schemaModel.ts:682-685`; **client always sends `'AND'`** (`hippoSource.ts:170`) | OR + repeated `field` = a de-facto `IN` list — see §7 |
| `FilterInput.value: JSON!` | live schema | the transport carries structured values; our `FilterValues = Record<string, string\|boolean>` is a client-side narrowing. Probe what Mosaic actually accepts (lists? ranges?) before assuming equality-only |
| `asOf: String` on every list field | live schema; zero hits in `web/src` | graph-level as-of (the ADR-0023 / Reel-ADR-0002 D-4 ask) is live server-side and unclaimed |
| `findByXref(system, value)` | live schema; unused | the one inherently cross-class lookup on the endpoint |
| `supersededBy(id)` chain | live schema; unused | a second traversal primitive |

**Not available (the real gap):** no nested/relationship filters, no `exists`, no joins, no
aggregation/counts/`totalCount`, no ranges, no sort. Filters apply to exactly one class at a
time. FTS and filters are mutually exclusive today (the search twin takes no filters,
`hippoSource.ts:140-151`). Aggregation & friends are the open **X1** ask (hippo#96);
relationship predicates have **no X-item yet** — this design files one (§10).

Also load-bearing: ref selections currently fetch only the target id (`hippoSource.ts:83-92`),
so even client-side evaluation of a related-field condition requires widening selection sets;
and Mosaic filters take LinkML **slot names**, not camelCase renames (`schemaModel.ts:280-287`)
— any query IR must store slot names.

## 4. Prior art (external survey, 2026-08-18)

Full trail in the survey run for this doc; the distilled findings:

**Filter builders over typed schemas.** The industry atom is *field / operator / value* rows in
shallow AND/OR groups. Airtable and Notion both cap nesting at depth 3 — a deliberate ceiling
worth copying. `react-querybuilder` (MIT, very active) is the strongest React substrate: its
serializable rule-group JSON doubles as an IR, and a custom `ruleGroupProcessor` can emit any
wire format — but it has **no native concept of relationships**; that part is ours to design.
(react-awesome-query-builder is inactive; jQuery QueryBuilder is the wrong substrate.)

**Related-entity conditions.** Two proven idioms, both needed:

- **Implicit traversal in the field picker** (Metabase): related classes' fields appear nested
  under the reference edge (`sample → processing.date`), so single-valued (to-one) hops never
  look like joins. Metabase's open wound: no semi/anti-join in the GUI — exactly the "donors
  *having* samples…" semantics — so users hit a wall.
- **Explicit quantified relationship criteria** (Hasura `_bool_exp` nesting, Directus
  `_some`/`_none`, Airtable conditional rollups, Kibana's nested-document syntax): "having ≥1 /
  exactly 0 [Samples] where […]", with the sub-conditions constrained to hold on the *same*
  related record. This maps 1:1 onto ADR-0022's `exists-related-filter`.

**Cohort builders (the scientist-facing gold standard).** OHDSI Atlas and i2b2 converge on:
pick an anchor population, stack inclusion criteria of the form "having at least N [events]
where [attributes]", express exclusion as "exactly 0 of…" (eliminates a whole class of
confusion), and — the single biggest trust-builder — show **live counts/attrition per
criterion**. Sobering datum: only ~51% of real trial criteria were fully expressible in Atlas
(Nature s41598-023-49560-w) → any structured builder needs a curated escape hatch, not a
scripting one.

**Graph query UIs.** Canvas-style "draw the pattern" builders (TigerGraph, Kineviz, Neo4j Labs
visual-cypher-builder) remain prototypes/niche. What works for non-experts: **Neo4j Bloom's**
schema-token autocomplete over near-natural-language patterns, plus admin-curated
**parameterized saved queries** ("search phrases"); and **Linkurious's** linear block stacks
(node block → edge block → node block). Lesson: linear beats canvas.

**GraphQL-native.** GraphiQL-class explorers solve *field selection* (checkbox trees — steal
for column/export pickers) but leave filters as raw input. Nobody ships a friendly generic
builder over GraphQL filter conventions — genuinely open space.

**Flat export of one-to-many.** Three shapes seen in the wild: row explosion (Metabase/SQL),
long format with instance columns (REDCap — analysts hate reshaping it; a whole ecosystem of
un-reshaping tools exists), aggregate/rollup columns (Airtable). Strongest synthesis: **anchor
semantics** — one row per anchor entity by default; traversing a to-many path in the column set
forces an explicit per-column choice between *aggregate* (count/concat/min/max) and *explode*
(grain change), with predicted row counts shown. Metabase's export cap honesty and Power BI's
opaque-limit complaints both argue for visible caps (which ADR-0029 already mandates and
`export.ts` already implements).

**Graph visualization libraries.** Shortlist for a React SPA at 100–5k nodes:
**Cytoscape.js** (MIT, best-maintained, richest interactions: expand-collapse, compound nodes,
CSS-like declarative stylesheets that mesh with view-descriptions-not-DOM) as primary;
**sigma.js + graphology** (MIT, WebGL, official React bindings) if result sets grow past ~5k.
react-force-graph = fast prototype, thin for product; G6 = capable but a heavier framework
commitment; vis-network/Reagraph = too little momentum to bet on.

**NL-to-query.** The converged pattern (Metabase Metabot → MBQL, Neo4j text2cypher tools):
the LLM emits the *same serializable structure the visual builder edits* — never opaque query
text — validated against the schema, landing in the builder for review and correction. This is
exactly our ADR-0005/0009 posture: one typed artifact, equally accessible to humans and LLMs.

## 5. Candidate design — the QuerySpec noun

The centerpiece is a typed, serializable, introspection-validated query artifact. Working name
**QuerySpec**; in ADR-0022 terms it is an intensional subgraph State restricted to a single
focal lens — the "cohort/query-state foundation" Reel builds on.

```yaml
QuerySpec:
  anchor: <typeName>            # focal type: defines what a result row IS
  asOf: <timestamp>?            # graph-level as-of (already live server-side)
  criteria: CriteriaGroup       # what qualifies an anchor entity
  columns: [ColumnSpec]         # what each row shows / exports
  sort: [{path, dir}]?          # capability-gated (Mosaic X1)

CriteriaGroup:
  mode: AND | OR
  items: [FieldCondition | RelatedCondition | CriteriaGroup]   # nesting capped at depth 3

FieldCondition:
  slot: <LinkML slot name>      # never the camelCase rename
  op: eq | neq | in | gt | gte | lt | lte | contains | isNull  # each op capability-gated
  value: <JSON>

RelatedCondition:               # ≙ ADR-0022 exists-related-filter
  edge: <ref | refList field>   # a derived reference edge on the enclosing class
  quantifier: some | none       # "having ≥1 …" / "having exactly 0 …"; count>=N later, gated
  criteria: CriteriaGroup       # conditions holding on the SAME related record

ColumnSpec:
  path: [<edge>…, <slot>]       # anchor slot, or a to-one traversal path
  # to-many paths additionally require ONE of:
  aggregate: count | joinIds | min | max   # keeps anchor grain (default)
  explode: true                            # changes grain — ≙ pivot-grain; must be explicit
```

Why this shape:

- **Closed and typed** — a noun catalog of criteria, not an expression language (ADR-0004).
  Every legal value of `anchor`, `edge`, `slot`, and `op` is enumerable from introspection +
  the declared capability set, so a dry-run validator is total (ADR-0005/0009 posture).
- **Anchor semantics answer the export question** before it's asked: a result row is an anchor
  entity; grain changes are explicit `explode` decisions, mirroring ADR-0024's grain-typed
  discipline. No arbitrary joins — traversal is always along schema-derived reference edges.
- **Quantifiers, not joins.** `some`/`none` gives semi/anti-join expressiveness (the thing
  Metabase never shipped and Atlas proves scientists need) without join semantics.
- **LLM-emittable.** An agent emits QuerySpec JSON, the validator gates it, the builder renders
  it for review — the exact Metabot/text2cypher pattern, and rung 2 of the vision's probe
  ladder ("agent composes bound queries from a prompt").
- **One artifact, three transports:** URL (nuqs, shareable), control plane (saved, versioned
  envelope), and agent I/O.

## 6. UX — three on-ramps, one artifact

**(a) The facet panel stays** and becomes a *degenerate QuerySpec* (anchor = current collection,
flat AND FieldConditions). No regression, and the certification-contract test-ids
(`FacetPanel.tsx:35-37`) are untouched.

**(b) The builder** (progressive disclosure from the facet panel — "Advanced…", the
Notion simple→advanced escalation):

- Anchor picker ("Rows are: Donors") — this replaces "which collection am I in" as the query's
  frame.
- Criteria rows: field/op/value, with the **field picker showing to-one refs' fields nested
  under the edge** (Metabase implicit traversal) — one-hop to-one conditions never look like
  joins.
- **Relationship criterion rows** for to-many edges, rendered in the Atlas idiom:
  *"having **at least one** / **no** Samples where …"* with an indented sub-group whose
  conditions hold on the same sample. Sub-groups can nest one more level (cap 3 total).
- **Live counts per criterion** (attrition-style) as soon as aggregation capability exists
  (X1); until then the row count of the current result is the only honest number we show —
  never a client-computed count over a partial page (ADR-0029).
- Column/export picker: checkbox tree over anchor slots + traversal paths (the GraphiQL-explorer
  pattern); picking a to-many path prompts the aggregate-vs-explode choice inline, with a
  predicted row count when counts are available.

**(c) NL box + global search** (the "default isn't useful" fix):

- **Global search as the landing surface.** Cheap and available *today*: fan the query out to
  every class's FTS search twin (`searchX(q)`) in parallel, plus `findByXref(system, value)`
  for exact identifier hits. Result: a heterogeneous hit list grouped by class — the first
  genuinely cross-class surface, with zero new server capability. Each group links into its
  collection with the search applied; the full hit set can seed the graph view (§8).
- **NL → QuerySpec.** The agent path: prompt → QuerySpec JSON → dry-run validation against
  introspection → populated builder for review → run. Never generated query text. A Bloom-style
  schema-token autocomplete bar (classes/edges/slots are all introspected) is a cheap
  additional on-ramp later.
- **Curated escape hatch:** parameterized saved QuerySpecs (a saved spec with typed parameter
  slots) — Bloom "search phrases" — covering the tail Atlas's ~51% datum warns about, without
  ever opening a scripting layer.

Shell-wise this is content bound into `main` (+ builder in `inspector`) under the existing
`headerNavMain` layout, or a second registered layout if the builder needs real estate
(ADR-0031 either way).

## 7. Execution — capability-mapped planner, staged

The adapter grows a planner that compiles a QuerySpec against the **declared capability set**
and refuses (visibly) what it can't execute. Three stages:

**Stage 0 — semijoin compensation over today's surface (no Mosaic changes).**
A `RelatedCondition` is executable *now* as a two-phase semijoin:

1. Query the related class with the sub-criteria as its flat filters
   (`samples(filters:[{field:'sample_type', value:'X'}], …)`), paging up to a hard cap;
   collect the linking ids — the backref FK values (to-many) or the anchor's FK targets
   (to-one).
2. Filter the anchor by id-membership. Server-side, `filterMode: OR` + repeated field is a
   de-facto `IN`: `filters:[{field:'id', value:id1}, {field:'id', value:id2}, …], filterMode:
   OR` — the OR mode is already advertised and derived, we just never send it. Above the
   id-list cap, degrade to client-side intersection of paged anchor rows, bounded
   `EXPORT_CAP`-style, with `truncated` surfaced exactly as `export.ts:13-17` does.

This is ADR-0029's sanctioned "adapter compensation at small scale, behind the gate": the
capability is declared as `relationshipFilter: 'compensated'` (vs `'server'` later), caps are
visible, and past the cap the criterion row shows *why* it's disabled instead of lying.
Also in stage 0: send `filterMode: OR` for OR groups (free), claim `asOf` (free), probe
`FilterInput.value: JSON!` for list/range acceptance before assuming equality-only.

**Stage 1 — global search fan-out + column traversal.** The heterogeneous search surface (§6c);
widen selection sets so to-one column paths fetch labeled fields, not bare ids
(`hippoSource.ts:83-92`).

**Stage 2 — file the Mosaic asks (two-sided cross-references per CLAUDE.md).**

- **X3 (new): relationship predicates** — either an `exists`/nested filter arg on list fields
  or CEL-over-GraphQL (the direction ADR-0010:45-48 already names), plus a native `in`
  operator. This moves `relationshipFilter` from `'compensated'` to `'server'`; the QuerySpec,
  builder, and saved artifacts don't change — only the planner does. That is the payoff of the
  IR-first design.
- **X1 (existing, hippo#96): aggregation** — facet counts, `totalCount`, ranges, sort — which
  unlocks live attrition counts and predicted explode sizes. Gen3's Peregrine/Guppy history
  (`gen3-comparison.md:54-76`) says real-scale counts want a server index layer; that stays a
  Mosaic-side decision.

## 8. Results presentation

**Table (workhorse).** Anchor-grain rows in the existing TanStack table; traversal columns
labeled by path ("Sample → Processing date"); to-many columns show the aggregate or, when
exploded, the table states its grain change ("1 row per Donor × Sample — 342 rows from 128
donors"). CSV export reuses the page-through exporter (cap + `truncated`, ADR-0029);
one-row-per-anchor with aggregates is the default export, explode is opt-in per path — the
REDCap lesson (neither pure long nor pure wide satisfies everyone; make it a visible choice).

**Graph view (new primitive, contingent on ADR-0010).** A `graph` noun in the view catalog:

- **View description, not DOM:** a serializable `{nodes: [{type, id, label}], edges: [{source,
  target, edge}], style: derived-per-class}` document. Node/edge sets, type-coverage, and
  style bindings are all checkable headlessly (ADR-0009's forcing function holds: correctness
  is set-membership, not pixels).
- **Runtime realization: Cytoscape.js** (MIT, active, compound nodes + expand-collapse
  ecosystem, declarative stylesheets). sigma.js/WebGL is the named fallback if heterogeneous
  result sets exceed ~5k nodes; the view description is renderer-agnostic either way.
- **Seeding:** a QuerySpec result (anchors + their selected traversals) or a global-search hit
  set. **Exploration:** expand-on-click fetches an entity's reference edges via the existing
  detail query; every node click-throughs to entity detail. Class legend = derived styling.
- **Honesty at scale:** node budget with visible truncation; cluster-by-class (compound nodes)
  before dropping data.

This is deliberately the *second* result surface: it should never be required to answer a
question the table can answer, but for supersession chains, provenance neighborhoods, and
"what's connected to this cohort" it earns its place.

## 9. Risks and open questions

1. **Payload/URL widening.** `SavedViewState.filters` and `urlState.validateFilters` both
   enforce the flat `Record<string, string|boolean>` shape; `openPayload` rejects mismatched
   envelope versions outright (`store.ts:44`), so a v2 QuerySpec payload and v1 saved views
   silently skip each other. Decide explicitly: new document kind (`querySpec`) vs `savedView`
   v2 with a migration read-path. Leaning **new kind** — saved views keep working untouched.
2. **Compensation ceiling.** Semijoins are honest only under caps; `library-survey.md:138`'s
   WASM memory ceiling applies to any richer client-side compute. The planner must make
   "beyond the cap → ask the server" a visible state, not a slow one.
3. **Polymorphic `is_a`** (`prefab/core-loop.md` Q1.1) — "is BrainSample a collection or a
   saved filter over Samples?" — becomes acute once QuerySpecs exist, because a saved
   parameterized QuerySpec *is* the "saved filter over the parent" answer. Fold into the ADR.
4. **Slot-name discipline.** The IR stores LinkML slot names; every UI label goes through the
   existing rename mapping. The FK-rename exclusions (`schemaModel.ts:280-322`) must extend to
   edge selection (offer `donor`, never `donorId`).
5. **Certification contracts.** Facet panel and table `data-testid`s are golden-path pinned;
   the builder is additive UI, and stage 0 must not alter existing emitted query shapes when
   no RelatedCondition/OR group is present.
6. **Reel boundary.** QuerySpec is one query state. Sequencing, forking, watermark pinning
   per-version, set-ops *between* states — Reel. The clean seam: Aperture owns the noun and its
   execution; Reel composes instances of it. Cross-reference Reel ADR-0001/0003 from the new
   ADR.
7. **FTS × filters.** The live search twin takes no filters, so "search + criteria" needs
   either client-side intersection (gated) or a Mosaic ask to add `filters` to search twins —
   fold into X3.

## 10. Recommended path & ADR slate

Sequenced to put user-visible value first while every stage feeds the same artifact:

| Step | Delivers | Needs |
|---|---|---|
| 1. Global search landing | first cross-class surface; fixes the useless default | nothing new server-side |
| 2. QuerySpec IR + validator + URL/control-plane transport | the noun everything else rides | decision on doc kind (risk #1) |
| 3. Builder v1: anchor + field conditions + OR groups + to-one traversal picker | complex single-class + one-hop queries | `filterMode` unlocked; JSON value probe |
| 4. RelatedCondition via semijoin compensation | "donors having samples where…" — the headline capability | caps + honest gating (§7 stage 0) |
| 5. Column traversal + aggregate/explode export | the joined table + CSV story | widened selections |
| 6. Mosaic X3 + X1; planner flips to server execution | scale + live counts | cross-component filing |
| 7. Graph view primitive | heterogeneous exploration | ADR-0010 ratification (or riding its ratification) |
| 8. NL → QuerySpec | the AI-native on-ramp; probe-ladder rung 2 | steps 2–4 |

**Proposed ADRs** (next free number: 0035; note the existing 0026 filename collision — don't
repeat it):

- **ADR-0035 — Cross-class queries are a typed QuerySpec artifact** (anchor/focal semantics,
  criteria vocabulary incl. quantified relationship conditions, capability-mapped execution
  with declared compensation, persistence & URL transport). Cross-refs: ADR-0002/0004/0005/
  0009/0015/0017/0029/0032, Reel ADR-0001/0003, Mosaic X1/X3.
- **ADR-0036 — Global search is a capability fan-out surface** (search twins + `findByXref`;
  heterogeneous grouped results; seeds table/graph views).
- **ADR-0037 — `graph` view primitive** (serializable graph description; Cytoscape.js
  realization; node budgets and class clustering) — sequenced behind ADR-0010.

ADR-0015 (cross-links, Proposed) should be resolved alongside 0035 — the traversal semantics
are shared.
