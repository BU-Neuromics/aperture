# NL→GraphQL query spike: tissue-request example

Spike for `mosaic-demo-small`'s `add-aperture-nl-graphql-query-foundation`
change (see that repo's `openspec/changes/add-aperture-nl-graphql-query-foundation/`
for the full proposal/design). Motivating example: "8 brain tissue samples
across 4 regions, donors with a history of repetitive head impacts (RHI),
plus whether RNA-seq data exists for them."

Run against a host-side `mosaic serve --config mosaic.yaml --graphql`
(fixed `../hippo` checkout at commit `ec59c90`, unreleased past `v0.12.1`)
standing in for `mosaic-demo-small`'s certified solo container — see that
repo's README ("Two Mosaic builds in play") for why. Query script:
[`nl_graphql_spike_query.py`](./nl_graphql_spike_query.py).

## Leg 1 — tissue samples across 4 brain regions, with donor attributes

Fully composable as one server-side query:

```graphql
{
  samples(
    filters: [
      { field: "sample_type", value: "tissue" }
      { field: "brain_region", value: ["hippocampus", "frontal_cortex", "cerebellum", "brainstem"], op: IN }
    ]
    filterMode: AND
    limit: 100
    offset: 0
  ) {
    total
    items {
      id
      brainRegion
      sampleType
      donor { id cohort sex historyOfRhi }
    }
  }
}
```

**Result**: 115 matching samples (fully paginated across two pages of 100
— the default page size truncates at 100, and `total` must always be
checked against the item count actually retrieved before treating a page
as complete; this bit the first draft of the spike script).

**Gotcha for any future query-plan compiler**: filter `field` values must
be the schema's LinkML slot names (`sample_type`, `brain_region`), not the
GraphQL output field names (`sampleType`, `brainRegion`) — `filters:
[{field: "sampleType", ...}]` silently matches zero rows rather than
erroring. Confirmed against this live endpoint.

## Leg 2 — RNA-seq data availability (NOT server-side composable)

There is no reverse lookup from `Sample`/`Donor` to the `Workflow`s that
consumed them — `Workflow.input_samples` is a multivalued reference stored
in Mosaic's shared `relationships` table, forward-resolved only (see the
`mosaic-demo-small` change's `design.md` for the full platform-level
finding and the upstream issue being filed for it). The only route to
"does an RNA-seq workflow exist for any of these samples" is:

```graphql
{
  workflows(filters: [{field: "workflow_type", value: "rna_seq"}], limit: 100, offset: 0) {
    total
    items { id inputSamples { id donor { id } } }
  }
}
```

...fetching **every** `rna_seq` workflow (186 total, fully paginated) and
intersecting `inputSamples` ids against the leg-1 sample set client-side.

**Result**: 45 of the 115 tissue samples appear as an input to at least
one `rna_seq` workflow.

**This is explicitly not a supported query pattern** — it requires an
unfiltered scan of every `rna_seq` workflow rather than a single filtered
query, and doesn't scale past whatever full-table page count is fetchable
client-side. It is demonstrated here for illustration only, per the
motivating example's own third clause, and must not be presented to an end
user (or an eventual NL→GraphQL agent) as if the platform composes it
server-side. A `capability: blocked` benchmark question should track this
gap, alongside the upstream issue requesting a reverse-lookup mechanism
for relationships-table-backed multivalued references.
