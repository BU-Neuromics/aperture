# ADR-0004: Three levels of configurability; no middle scripting layer

- **Status:** Accepted
- **Date:** 2026-06-13
- **Deciders:** design session (backfilled from handoff §2.3)
- **Related:** handoff §2.3, §10 (invariant), ADR-0009, ADR-0010 (vocabulary, Proposed)

## Context

Low-code/config-driven systems reliably bloat when they grow a middle "expression/scripting"
layer between declarative config and real code. Aperture must stay configurable without
acquiring that layer.

## Decision

Keep three distinct levels of configurability:

- **Level 1 — Composition:** which blocks appear, where, in what order. Bounded, fully
  declarative.
- **Level 2 — Binding:** how blocks map to the Hippo schema / GraphQL (class, filterable
  slots, relationship joins). Mostly *derived* from the LinkML schema, with thin overrides.
- **Level 3 — Behavior:** custom logic, novel views, custom viz, export transforms. **Not a
  config surface** — delivered exclusively via typed, sandboxed plugins (ADR-0009).

**Invariant:** Levels 1 & 2 are declarative and exhaustive. Level 3 is an escape hatch to
real (sandboxed) code. There is **no middle scripting/expression layer**.

## Consequences

- Pushes computation into the query/binding layer (GraphQL) or into Type-B components —
  directly shaping the view-vocabulary decision (ADR-0010): vocabulary additions are *nouns*,
  not *verbs*.
- Agent requests split cleanly into Type A (config) and Type B (component) — handoff §7.
- Defaults must be declared in schema, never in render logic (ADR-0005).

## Alternatives considered

- **Add an expression/formula layer for "just a little logic."** The exact mechanism that
  bloats low-code systems into unmaintainable DSLs. Rejected on principle.
