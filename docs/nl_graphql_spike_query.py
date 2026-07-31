import json
import urllib.request

GRAPHQL_URL = "http://localhost:8080/graphql"
PAGE_SIZE = 100


def gql(query):
    req = urllib.request.Request(
        GRAPHQL_URL,
        data=json.dumps({"query": query}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        body = json.loads(resp.read())
    if body.get("errors"):
        raise RuntimeError(body["errors"])
    return body["data"]


def paginate(query_template, root_field):
    """Fully paginate a root list field; never stop at the first page."""
    items = []
    offset = 0
    total = None
    while total is None or offset < total:
        page = gql(query_template.format(offset=offset, limit=PAGE_SIZE))[root_field]
        total = page["total"]
        items.extend(page["items"])
        offset += len(page["items"])
        if not page["items"]:
            break
    assert len(items) == total, f"paginated {len(items)} but total was {total}"
    return items


# --- Leg 1: tissue samples across 4 brain regions, with donor attributes ---
TISSUE_QUERY_TEMPLATE = """
{{
  samples(
    filters: [
      {{ field: "sample_type", value: "tissue" }}
      {{ field: "brain_region", value: ["hippocampus", "frontal_cortex", "cerebellum", "brainstem"], op: IN }}
    ]
    filterMode: AND
    limit: {limit}
    offset: {offset}
  ) {{
    total
    items {{
      id
      brainRegion
      sampleType
      donor {{ id cohort sex historyOfRhi }}
    }}
  }}
}}
"""
tissue_items = paginate(TISSUE_QUERY_TEMPLATE, "samples")
print(f"Leg 1 (tissue x 4 regions): {len(tissue_items)} samples (fully paginated)")
sample_ids = {s["id"] for s in tissue_items}

# --- Leg 2 (illustration only, NOT a supported query): does RNA-seq data
# exist for any of these samples/donors? There is no reverse lookup from
# Sample -> Workflow (relationships-table-backed multivalued reference,
# forward-resolved only). The only route is fetching ALL rna_seq workflows
# with nested inputSamples and matching ids client-side -- fully paginated,
# never truncated on the first page.
RNA_SEQ_QUERY_TEMPLATE = """
{{
  workflows(filters: [{{field: "workflow_type", value: "rna_seq"}}], limit: {limit}, offset: {offset}) {{
    total
    items {{ id inputSamples {{ id donor {{ id }} }} }}
  }}
}}
"""
workflow_items = paginate(RNA_SEQ_QUERY_TEMPLATE, "workflows")
rna_seq_sample_ids = {s["id"] for w in workflow_items for s in w["inputSamples"]}
print(f"Leg 2 (illustration only, client-side): {len(workflow_items)} rna_seq workflows (fully paginated)")

matched = sample_ids & rna_seq_sample_ids
print(
    f"{len(matched)}/{len(sample_ids)} of the tissue samples appear as an "
    f"input to at least one rna_seq workflow (client-side intersection, "
    f"not a single server-side query)."
)
print("Matched sample ids:", sorted(matched))
