# ADR-0014: Application architecture — server-rendered vs client-side app shell

- **Status:** Accepted
- **Date:** 2026-06-30 (ratified — MVP = client-side SPA)
- **Deciders:** labadorf, design session
- **Related:** ADR-0026 (portal-first MVP), ADR-0011, ADR-0009, ADR-0016 (Bridge BFF deferred); `portal-requirements.md` N5.9

## Context

ADR-0011 decides where *components* execute (the sandbox). This ADR is the separate,
broader question of how the **application shell** is architected and rendered: a
server-rendered app (SSR / server-driven UI) vs. a client-side SPA that calls Hippo's
GraphQL/REST directly, vs. a hybrid (server-rendered shell + client-side islands/workers for
component view-specs).

These are separable: one could server-render the shell and still run components client-side
in Web Workers (ADR-0011), or ship a pure SPA that hosts the same workers. The realized
view-description (ADR-0009) has to be turned into pixels *somewhere* — that "somewhere" is
this decision.

## Decision

**Ratified (2026-06-30, MVP — `portal-requirements.md` N5.9): a pure client-side SPA.** The MVP
ships a browser app that talks to the active endpoint's GraphQL/REST directly (Hippo now), with a
thin Aperture API; component view-specs run in client-side Web Workers (ADR-0011). This is the
simplest deployment story and aligns with the capability-scoped client (ADR-0008) and Bridge-as-BFF
deferral (ADR-0016) — auth/capability enforcement is server-side (Bridge) when present, a no-op
pass-through locally. SSR / hybrid is **not** an MVP requirement; revisit if first-load weight
(esp. a bundled Pyodide escape hatch) or deep-link/SEO needs demand it. The original candidate
framing is retained below.

*Candidate framing (pre-ratification):*

- **Pure client-side SPA** — browser app talks to Hippo GraphQL/REST directly; Aperture's own
  API is thin. Simplest deployment story; aligns with ADR-0013's "always talk to a running
  API" and with client-side component workers (ADR-0011). Weaknesses: initial-load weight
  (worse if Pyodide is bundled), SEO/deep-link/no-JS concerns, and auth/capability scoping
  must be enforced server-side regardless.
- **Server-rendered / server-driven shell** — server renders the resolved view-spec to HTML;
  client hydrates. Better first-paint and deep-linking; centralizes capability enforcement.
  Heavier server; the component-worker boundary still lives client-side.
- **Hybrid (server shell + client islands/workers)** — server-render layout + Type-A
  composition; client-side workers realize Type-B component view-specs. Most flexible, most
  moving parts.

## Consequences

- Interacts with ADR-0011 (Pyodide bundle size hurts a pure SPA's first load more than a
  server-rendered shell) and with ADR-0015 (how cross-links/hrefs are realized — server-side
  routing vs. client-side router).
- Sets the deployment topology and where the capability-scoped client (ADR-0008) is enforced.

## Notes / open sub-questions

- **The BFF candidate is Bridge (2026-06-15).** A multi-source, per-viewer model wants a thin
  trusted server in front of the data plane; that server is **Bridge** — the same component as
  the platform auth gateway (platform `sec6_security_model.md`), not a new Aperture server. So
  the "hybrid (server shell + client workers)" option resolves to "Aperture client-rendered UI
  + Bridge as the trusted data/aggregation seam." Bridge is deferred (ADR-0016); locally
  Aperture talks to Hippo directly, so this decision can be made without blocking near-term
  work.
- Decide *after* ADR-0011, since the runtime/Pyodide weight materially changes the SPA vs.
  SSR tradeoff.
- Technology/framework selection (which JS/TS framework, build tooling) is downstream of this
  and ADR-0011; it may warrant its own ADR once these two land.
