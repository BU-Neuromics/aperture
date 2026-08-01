# Aperture ↔ Mosaic GraphQL contract

A consumer-driven contract (issue #16): the subset of Mosaic's (formerly Hippo's) GraphQL
surface that Aperture's seam modules assume — introspection-shape assertions extracted from
the four seam modules (`web/src/data/introspection.ts`, `schemaModel.ts`, `batch.ts`,
`control/store.ts`) and confirmed against a live `mosaic serve` (issue #15). Plain JSON +
a dependency-free Node script — no Aperture build step required, so either side of the
integration can run it.

## Why

Most cross-component breakage should be caught in the *producer's* CI, before release —
a Mosaic PR that changes a seam shape (e.g. renames `ingestBatch`'s `entities` arg) should
fail Mosaic CI immediately, without booting Aperture. This directory is the portable check
that makes that possible.

## Files

- `hippo-graphql-contract.json` — the assertions: field/arg/type shapes, subset-checked
  (extra fields on the live schema are fine; every asserted name+type must still be present).
- `check-contract.mjs` — the runner. No npm dependencies; uses only `node:fs`, `node:url`,
  `node:path`, and global `fetch`.

## Usage

Against a captured/frozen introspection JSON (the `__schema` shape):

```sh
node contracts/check-contract.mjs --introspection web/src/data/testing/realIntrospection.json
```

Against a live GraphQL endpoint:

```sh
node contracts/check-contract.mjs --url http://localhost:8000/graphql
node contracts/check-contract.mjs --url http://localhost:8000/graphql --header "Authorization: Bearer test-token"
```

Exits `0` when every assertion passes, `1` (with a per-assertion PASS/FAIL report) otherwise.

## What's asserted, and why `ApertureDocument`

The assertions cover two kinds of surface:

- **Root fields** that exist regardless of the deployment's domain LinkML schema:
  `entityHistory`, `supersededBy`, `findByXref`, the batch mutations (`ingestBatch`/
  `validateBatch`) and their input types, `FilterInput`/`FilterMode`.
- **The generic list/singular/write/lifecycle field pattern** Aperture's schema-derived UI
  relies on for *every* collection (`schemaModel.ts`) — asserted against `ApertureDocument`
  specifically, because it's the one entity type Mosaic emits in every deployment
  independent of the user's domain schema (the control-plane document type, W4.x), so it
  doubles as a schema-agnostic instance of the pattern. Domain entity types (e.g. `Book`,
  `Sample`) are schema-specific and deliberately not hardcoded here.

## Scope note

This covers the Aperture-only piece of issue #16: extracting the confirmed shapes into a
portable artifact and self-validating Aperture's own fixture against it (see
`.github/workflows/web.yml`). Publishing a versioned artifact for Mosaic's CI to consume
and the DataHelix bootstrap fixture package, plus filing the Mosaic-side CI job, are
cross-repo follow-ups (per the issue's acceptance criteria) and stay out of this change.

## Keeping this in sync

The contract reflects the shape confirmed as of `web/src/data/testing/realIntrospection.json`
(captured 2026-07-08 against Mosaic — then Hippo — v0.10.3, per aperture#15). Mosaic's GraphQL
surface has moved since (e.g. `FilterInput.op`, mosaic#146's `relatedTo`) — those additions
don't fail this contract (assertions are additive-tolerant), but re-capturing the fixture
against a current `mosaic serve` and bumping `confirmedAgainst` is worth doing periodically
so newly-load-bearing shapes get their own assertions.
