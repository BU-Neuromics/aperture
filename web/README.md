# Aperture Web (MVP portal SPA)

The TypeScript single-page app for the Aperture MVP portal — a config-driven, schema-derived
data explorer over a Hippo (LinkML + GraphQL) endpoint. Stack per **ADR-0030**: Vite + React +
TypeScript, urql (GraphQL), TanStack Table, nuqs. Talks to Hippo's GraphQL **directly**
(ADR-0014/0016).

> **Phase 0 — walking skeleton.** This is the foundational scaffold. See
> `../design/implementation-plan.md` for the phased build and
> `../design/design-export/` + `../design/design-tokens.md` for the visual target.

## Getting started

```bash
cd web
npm install
npm run dev        # start the dev server
```

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
│   ├── main.tsx            # entry
│   ├── App.tsx             # Phase 0.1 placeholder shell (real shell = step 0.1a)
│   ├── styles/
│   │   ├── tokens.css      # design tokens (seeded from design/design-tokens.md)
│   │   └── global.css      # reset + base, imports tokens
│   └── test/setup.ts       # jest-dom matchers for Vitest
└── (config: vite / tsconfig / eslint / prettier)
```

## Notes

- **Design tokens** live in `src/styles/tokens.css`, extracted from the Claude Design export.
  A dark theme (`[data-theme='dark']`) is a follow-on.
- **Fonts:** the token stack names IBM Plex with a system fallback. Self-host IBM Plex woff2 under
  `public/fonts/` to match the design exactly (the design export loaded them from Google Fonts —
  not carried over; see `../design/design-export/README.md`).
- **Next:** step 0.1a (layout registry + typed slot contract, ADR-0031), then the urql
  `HippoSource` adapter + capability negotiation (0.2/0.3), then the schema-derived collection
  table (0.5).
