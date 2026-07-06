# Aperture Web (MVP portal SPA)

The TypeScript single-page app for the Aperture MVP portal — a config-driven, schema-derived
data explorer over a Hippo (LinkML + GraphQL) endpoint. Stack per **ADR-0030**: Vite + React +
TypeScript, urql (GraphQL), TanStack Table, nuqs. Talks to Hippo's GraphQL **directly**
(ADR-0014/0016).

> **All four MVP phases built.** The app introspects the endpoint, negotiates capabilities,
> and derives everything from the schema: collections nav + table (Phase 0); equality facets +
> FTS, entity detail with cross-links/relationship pivot/change history, CSV/JSON export
> (Phase 1); Tier-0 create/edit forms generated from the mutation input types, with client
> pre-validation, server-authoritative rejection surfacing, partial-merge updates, and
> ref-pickers (Phase 2); the Tier-1 guided workflow (Phase 3, ADR-0028): steps-as-data config
> interpreted by a pure engine, staging in resumable version-pinned drafts, continuous
> dry-run, and one atomic batch commit with intra-batch references; and the control plane
> (Phase 4, ADR-0017): saved views, cross-browser drafts, and workflows-config-as-data as
> versioned documents on a LinkML-on-Hippo store (co-located by default,
> `VITE_HIPPO_CONTROL_PLANE_URL` to split; localStorage fallback, labeled in the footer).
> The full query state `{collection, page, q, filters, entity, form, workflow}` lives in the
> URL. See `../design/implementation-plan.md` for the phased build and
> `../design/design-export/` + `../design/design-tokens.md` for the visual target.

## Getting started

```bash
cd web
npm install
VITE_HIPPO_GRAPHQL_URL=http://localhost:8000/graphql npm run dev
```

`VITE_HIPPO_GRAPHQL_URL` points at a running Hippo GraphQL endpoint (`hippo serve` with the
graphql extra). Without it the app starts in an honest "no endpoint configured" state. You can
also put the variable in an untracked `web/.env.local`.

## Scripts

| Script | What |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | typecheck (`tsc -b`) + production build |
| `npm run preview` | preview the production build |
| `npm run test` | run unit tests once (Vitest + Testing Library) |
| `npm run test:watch` | tests in watch mode |
| `npm run typecheck` | `tsc -b --noEmit` |
| `npm run lint` | ESLint |
| `npm run format` | Prettier write |

CI runs typecheck + lint + test + build on changes under `web/` (`.github/workflows/web.yml`).

## Layout (current)

```
web/
├── index.html
├── src/
│   ├── main.tsx                  # entry (fonts, nuqs adapter)
│   ├── App.tsx                   # composition: provider + shell + slot bindings
│   ├── shell/                    # step 0.1a — layout library (ADR-0031)
│   │   ├── slots.ts              # typed named-slot contract
│   │   ├── registry.ts           # layout registry (one entry: headerNavMain)
│   │   ├── AppShell.tsx          # config selects layout; honest degradation
│   │   └── layouts/HeaderNavMain.tsx
│   ├── data/                     # steps 0.2–0.4, 0.7 — the Layer-D data spine
│   │   ├── endpoint.ts           # VITE_HIPPO_GRAPHQL_URL → EndpointConfig
│   │   ├── scopedClient.ts       # capability-scoped client seam (urql pass-through)
│   │   ├── introspection.ts      # standard __schema baseline
│   │   ├── schemaModel.ts        # collections + column models + Capabilities derivation
│   │   ├── hippoSource.ts        # the source adapter (ADR-0017)
│   │   └── DataSourceContext.tsx # useDataSource() / useCapabilities() (ADR-0029)
│   ├── features/collections/     # nav, table, facets, detail, export, URL state
│   ├── styles/                   # tokens.css (from design/design-tokens.md) + global.css
│   └── test/setup.ts             # jest-dom matchers for Vitest
└── (config: vite / tsconfig / eslint / prettier)
```

## Notes

- **Design tokens** live in `src/styles/tokens.css`, extracted from the Claude Design export.
  A dark theme (`[data-theme='dark']`) is a follow-on.
- **Fonts:** IBM Plex Sans/Mono are self-hosted via `@fontsource` imports in `main.tsx`
  (the design export loaded them from Google Fonts — not carried over).
- **Capabilities are negotiated, never faked (ADR-0029):** every flag derives from what the
  endpoint's introspection actually advertises. Sort/aggregation stay off until Hippo X1 lands;
  the pager hides entirely when offset pagination isn't advertised.
- **Hippo enrichment:** `hippoSchema` presence is detected as a capability; the richer
  enrichment query (slot kinds beyond GraphQL types) is a Phase-1 follow-on to confirm against
  a live `hippo serve`.
- **Sort + facet counts:** deliberately absent until Hippo X1 (aggregation) advertises them —
  the UI never fakes a count or a server sort (ADR-0029).
- **External xrefs:** `src/config/xrefs.ts` maps field names to URL templates per deployment;
  empty by default.
- **Write loop:** entry points gate on derived mutation paths (`New <Type>` needs a
  create-shaped mutation, `Edit` an update-shaped one). Updates are partial-merge; clearing a
  field to null is a later affordance. Field attribution of server rejections is heuristic
  until Hippo's structured `ValidationResult` shape over GraphQL is confirmed.
- **Next:** Phase 3 — the Tier-1 guided workflow (stage → whole-set validate → atomic commit
  via Hippo's batch unit-of-work); see issue #8.
