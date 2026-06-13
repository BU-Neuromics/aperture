# ADR-0007: User-space and system-space components are the same artifact; promotion is ACL-only

- **Status:** Accepted
- **Date:** 2026-06-13
- **Deciders:** design session (backfilled from handoff §2.6)
- **Related:** handoff §2.6, §10 (invariant), ADR-0006, ADR-0008

## Context

Components exist at different visibility scopes — one user's private experiment vs. a
portal-wide component. If "system" components had different (looser) requirements than
"user" components, promoting a user component to portal-wide would be a moment where new
authority is granted and new risk introduced.

## Decision

User-space and system-space components are the **same artifact at different visibility
scopes**. Requirements are identical; only *access* differs. "Promote to portal-wide" is a
pure ACL/visibility change that touches **no code** and grants **no new capability**.

**Invariant (critical):** the sandbox and all safety constraints are **universal from the
first keystroke**. Safety is never "added at promotion." Every component — including an
unprivileged user's first experiment — already runs under the constraints required of
portal-wide code.

## Consequences

- Promotion can't be a privilege-escalation vector (depends on ADR-0008: components hold no
  authority).
- The sandbox/validation machinery has exactly one code path, exercised from the first
  component a user writes — no "trusted" fast lane to maintain or accidentally widen.

## Alternatives considered

- **Looser rules for personal/user components, hardening at promotion.** Creates a promotion
  cliff where safety is retrofitted and a privilege boundary is crossed. Rejected.
