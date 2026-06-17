# Prefab — Data Stories over Hippo Metadata (the keystone MVP)

**Status:** 🟠 Working design (2026-06-17). The simplest concrete realization of the
[vision](../vision.md): a NotebookLM-style conversational exploration of **Hippo metadata only**
(workflow editing is the deferred "final form"). This is **keystone probe rung 1–2** — the
cheapest decisive test of "can an LLM reliably drive a typed declarative artifact through a
validator to a correct change?"

## The driving example (verbatim use case)

A multi-turn data story:
1. *"show me a summary of all the cases that are either PTSD, MDD, or controls, with negative
   toxicology reports for amphetamines, and that have gene expression counts for gene Y"*
2. *"show me a histogram of the normalized gene expression counts organized by case status"*
3. *"which genotypes do we have on these subjects?"*
4. *"how do the samples break down by genotypes A and B?"*

## The key insight: a data story is a narrated sequence of cohort states

Each turn operates on an **evolving selection** (a cohort), not from scratch. Turn 1 *establishes*
a cohort of subjects; turns 2–4 operate on "these subjects / these samples." So the central
object is exactly the **serializable query-state** we identified in
[core-loop.md](./core-loop.md) Step 4 — now promoted from "URL state" to "the thing the
conversation builds." **A data story = a sequence of core-loop states + transforms, narrated.**
This unifies the AI vision with the paused core-loop work: same substrate, conversational driver
on top.

## Decomposing the turns into a query algebra

| Turn | Operation(s) | Grain |
|---|---|---|
| 1 | **filter** (set membership: `diagnosis ∈ {PTSD,MDD,control}`) + **exists-related filter** (has ToxReport{analyte=amphetamine, result=negative}; has expression for gene Y) + **summarize/count** | subjects |
| 2 | **bind measured value** (normalized expression, gene Y) + **histogram** + **group-by** (case status), scoped to cohort | subjects → values |
| 3 | **distinct values** of an attribute (genotype) over the cohort | subjects |
| 4 | **group-by + count**, **pivot grain** (subjects → samples) by genotype ∈ {A,B} | samples |

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

## The one real fork: the metadata ↔ measured-value boundary

Most of the example is pure metadata and genuinely straightforward:
- **Turns 1 (filters), 3 (distinct genotypes), 4 (sample breakdown by genotype)** operate on
  entity *attributes and relationships* Hippo holds → tractable now (modulo the join-filter
  capability in #2). Turn 1's "*has* gene expression counts for gene Y" is satisfiable at the
  **existence** level (subject has a sample with a RNASeq datafile / an expression record for
  gene Y) — still metadata.
- **Turn 2 — the histogram of normalized expression *values* — is the exception.** It needs the
  actual per-subject quantitative values, which classically live in expression-matrix *files*,
  not metadata. "Just Hippo metadata" has a sharp edge here. Three ways to resolve it:

  - **(A) Model quantitative results as queryable Hippo entities** (e.g. `ExpressionValue{subject,
    gene, normalized_count}`). → turn 2 becomes a pure-metadata story; uniform query path.
    *Cost:* cardinality (genes × samples = millions of rows) — is Hippo still "metadata
    tracking" or now a data warehouse?
  - **(B) Hippo tracks only file existence** (modality=RNASeq); values live in files. → keeps
    Hippo metadata-only and honest to its mission, but turn 2 is **not** a pure-metadata story —
    it needs a data-access/compute path (Canon/Cappella, deferred). MVP data stories then cover
    attribute/relationship/categorical/count questions (turns 1,3,4), deferring value
    distributions.
  - **(C) An aggregation/summary tier** — precomputed per-(gene, group) summaries stored as
    queryable metadata, or a Gen3-Guppy-style index that serves distributions without Hippo
    holding every raw value. *This is exactly the two-tier lesson from
    [gen3-comparison.md](../gen3-comparison.md), reconnecting here.*

  **This fork decides whether the headline example works end-to-end on metadata alone, and it's a
  Hippo data-modeling decision, not an Aperture one.** Needs the user's call.

## Why this is the right first probe

It exercises the entire keystone — schema-grounded NL→typed-query, dry-run validation, typed view
primitives, cohort-state across turns — on the artifact we're closest to (Hippo metadata), with a
real, motivating use case, and **no** dependency on Cappella/Canon (turns 1/3/4) except the one
fork (turn 2). If this rung works, the vision is real; if NL→validated-query proves unreliable
even here, we learn it cheaply.

## Open questions
- **DS-1 (the fork):** measured-value boundary — option A / B / C for turn-2-style value
  distributions? *(Hippo modeling decision; user's call.)*
- **DS-2:** does Hippo's GraphQL support relationship-existence/join filters and group-by+count,
  or are those capability gaps to fill (Hippo enhancement vs. aggregation tier)? *(verify against
  the code.)*
- **DS-3:** the real PTSD-brain-bank schema (case_status enum, toxicology, genotype, expression)
  vs. the `omics` demo schema — which to ground the probe in?
