# Prefab — Data Stories over Hippo Metadata (the keystone MVP)

**Status:** 🟠 Working design (2026-06-17). The simplest concrete realization of the
[vision](../vision.md): a NotebookLM-style conversational exploration of **Hippo metadata only**
(workflow editing is the deferred "final form"). This is **keystone probe rung 1–2** — the
cheapest decisive test of "can an LLM reliably drive a typed declarative artifact through a
validator to a correct change?"

## The driving example (verbatim use case)

A multi-turn data story (the **gene-expression-*value*** turn from the original example is
**excised** — see "The boundary" below — because it crosses from the domain graph into bulk-data
slicing that Canon/Cappella don't yet implement; "*has* expression for gene Y" stays, as an
existence/relationship fact):
1. *"show me a summary of all the cases that are either PTSD, MDD, or controls, with negative
   toxicology reports for amphetamines, and that have gene expression data for gene Y"*
2. *"which genotypes do we have on these subjects?"*
3. *"how do the samples break down by genotypes A and B?"*

## The key insight: a data story is a narrated sequence of cohort states

Each turn operates on an **evolving selection** (a cohort), not from scratch. Turn 1 *establishes*
a cohort of subjects; later turns operate on "these subjects / these samples." So the central
object is exactly the **serializable query-state** we identified in
[core-loop.md](./core-loop.md) Step 4 — now promoted from "URL state" to "the thing the
conversation builds." **A data story = a sequence of core-loop states + transforms, narrated.**
This unifies the AI vision with the paused core-loop work: same substrate, conversational driver
on top.

**The cohort object is grain-agnostic and re-rootable.** Per the platform
[domain-graph model](../../../platform/design/domain-graph.md), a query returns a *knowledge
subgraph*, and "metadata vs. data" is a **role a node plays relative to the query**, not a storage
category. Turn 3 ("how do the *samples* break down…") re-roots the focal entity from subjects to
samples while the same diagnosis/toxicology predicates stay attached as *descriptors* — the
role-swap made operational. So the selection is not "a set of subjects" but **"a position in the
graph + predicates," re-rootable to any entity type.**

## Decomposing the turns into a query algebra

| Turn | Operation(s) | Grain |
|---|---|---|
| 1 | **filter** (set membership: `diagnosis ∈ {PTSD,MDD,control}`) + **exists-related filter** (has ToxReport{analyte=amphetamine, result=negative}; has expression *data* for gene Y) + **summarize/count** | subjects |
| 2 | **distinct values** of an attribute (genotype) over the cohort | subjects |
| 3 | **group-by + count**, **pivot grain** (subjects → samples) by genotype ∈ {A,B} | samples |

*(The excised value-histogram turn would have added `bind-measured-value` — the one op that
reaches across the structured/bulk boundary; deferred with the boundary, below.)*

**The minimal operation set:** filter (predicates, set-membership, ranges) · exists/related-entity
filter (join with predicate) · distinct-values (facet enumeration) · group-by + aggregate(count) ·
bind-measured-value · render-as-primitive (summary, histogram, bar, table, value-list) · and
**carry-cohort-across-turns + pivot-grain**.

## Interfaces this implies (the "set it up correctly" list)

1. **A serializable selection/cohort object** that persists across turns and can pivot grain
   (subjects↔samples). = core-loop query-state, made central.
2. **A query capability** over Hippo supporting: set-membership filters, **relationship-existence
   filters with predicates on the related entity**, distinct-value enumeration, and
   **group-by + count**. ⚠️ Several exceed Hippo's current GraphQL (equality + AND/OR + offset +
   FTS): relationship-existence/join filters and group-by/count are the notable gaps — same
   capability-negotiation theme as the core loop, and the same answer space (a/b/c: Hippo
   enhancement, or the Gen3-style aggregation tier, or client-side compute).
3. **Schema grounding for the LLM** — the introspected LinkML types/slots/enums/descriptions are
   the model's context for NL→typed-query (so "PTSD, MDD, or controls" → `diagnosis IN [...]`,
   "genotypes A and B" → the genotype slot). This is ADR-0005 ("the schema *is* the agent's
   context") + the `hippoSchema` introspection resolver, finally exercised by a consumer.
4. **A view-primitive set** (the noun-catalog, ADR-0010): summary/stat card, histogram, bar,
   table, value-list.
5. **Dry-run validation** of the LLM's translated query/view-spec before it runs — the keystone
   guardrail.

The LLM's job each turn: **NL utterance + current cohort + schema grounding → a typed
query/view-spec → dry-run validate → execute → render + narrate.** Nothing freeform; everything
typed and checked.

## The boundary (decided): structured graph vs. bulk payload — Option B

The original example's value-histogram turn crossed a real boundary — but the boundary is **not**
"metadata vs. data" (a query-relative role); it is **structured relational records vs. bulk opaque
payloads** (see [domain-graph.md](../../../platform/design/domain-graph.md)). The sharp reason to
excise that turn: expression *values* are a **bulk array payload**, not a structured record.

**Decision (2026-06-17): Option B.** Hippo tracks that the expression *data exists* (a
relationship/existence fact — subject has a sample with an RNASeq datafile); the actual values
live in files, mediated by **Canon/Cappella** (deferred). The MVP data story therefore covers
**attribute / relationship / categorical / count** questions over the domain graph (all three
remaining turns), and **defers value-distribution turns** until the bulk-slice path exists.

When that path arrives, it is the **deliberate boundary crossing** described in the domain-graph
model: a bulk slice (e.g., gene-Y normalized counts) is **induced as a subgraph** and **unioned**
into the query — *or* a derived per-(gene,group) **summary** is promoted into the graph (the
Gen3-Guppy two-tier lesson, [gen3-comparison.md](../gen3-comparison.md)). Either way it is an
expert-implemented slicer behind uniform graph semantics, not Hippo becoming a data warehouse.

## Why this is the right first probe

It exercises the entire keystone — schema-grounded NL→typed-query, dry-run validation, typed view
primitives, cohort-state across turns — on the structured domain graph (Hippo), with a real,
motivating use case and **no** dependency on Cappella/Canon (all three remaining turns stay within
the structured graph). If this rung works, the vision is real; if NL→validated-query proves
unreliable even here, we learn it cheaply.

## Open questions
- **DS-1 — RESOLVED (2026-06-17): Option B.** Structured-record/bulk-payload boundary; values live
  in files via Canon/Cappella (deferred); MVP stories stay within the domain graph. See above +
  [domain-graph.md](../../../platform/design/domain-graph.md).
- **DS-2:** does Hippo's GraphQL support relationship-existence/join filters and group-by+count,
  or are those capability gaps to fill (Hippo enhancement vs. aggregation tier)? *(verify against
  the code — the immediate next step.)*
- **DS-3:** the real PTSD-brain-bank schema (case_status enum, toxicology, genotype) vs. the
  `omics` demo schema — which to ground the probe in?
