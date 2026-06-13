# ADR-0009: Components emit serializable view descriptions, never direct DOM

- **Status:** Accepted
- **Date:** 2026-06-13
- **Deciders:** design session (backfilled from handoff §2.8, §5)
- **Related:** handoff §2.8, §5, §10 (invariant), ADR-0004, ADR-0006, ADR-0010 (vocabulary, Proposed), ADR-0011 (runtime, Proposed)

## Context

For the sandbox to be enforceable, for validation to run headlessly (no browser), and for an
LLM to reason about what a component does, a component cannot be allowed to manipulate the
DOM directly or reach around the runtime.

## Decision

Components produce a serializable **view description**, not direct DOM manipulation. The
runtime decides how to realize the description. This single rule:

- makes **headless validation** possible (no browser / Playwright),
- makes the **sandbox enforceable** (the component can't reach around the runtime),
- lets an **LLM reason** about component output,
- bounds the blast radius of a bad-but-passing component to **one slot's view**.

The component contract is three independently headless-checkable layers (handoff §5):
**manifest** (LinkML-validated, zero execution), **data-contract** (GraphQL
introspection/dry-run), **render-contract** (execute render in a non-DOM environment with a
mocked capability-scoped client; assert a valid view description is returned).

## Consequences

- Requires a defined view-description vocabulary — its richness is the keystone open decision
  (ADR-0010). The vocabulary's "nouns not verbs" rule is what keeps this from becoming a DSL.
- The render-contract runtime and the live runtime should be the same environment (feeds
  ADR-0011).
- **Forcing function:** if a component's correctness can only be confirmed by inspecting
  rendered pixels, the contract is wrong.

## Alternatives considered

- **Let components render directly (return DOM / JSX / raw HTML).** Maximally flexible, but
  un-sandboxable, un-headless-validatable, and opaque to an LLM. Rejected — it defeats every
  property this rule exists to provide.
