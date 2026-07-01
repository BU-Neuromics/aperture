# Aperture — Claude Design brief (skeleton UI + layout library)

**Status:** 🟠 Working brief (2026-06-30). A ready-to-paste prompt for **[Claude Design](https://claude.ai/design)**
(Anthropic Labs, research preview) to produce the MVP walking-skeleton UI and the shell **layout
library**. Encodes the relevant decisions so Design output aligns with the architecture and is
cheap to integrate.

## How to use

1. New project at **claude.ai/design**; paste the prompt below. Optionally *point it at the
   `aperture` repo* for extra grounding.
2. Iterate via conversation + **sliders** (density, spacing, sidebar width, accent).
3. **Export** an HTML prototype + a **ZIP to code from** + the **design-system tokens**.
4. Bring the export back here; the exported code is a **visual target + design-system reference**,
   not a drop-in — it gets translated into the real `web/` components (Phase 0: layout templates +
   slot contract + urql-wired TanStack table).

## Grounding (why the prompt says what it says)

- **App shell = library of fixed layouts + typed slot contract** → **ADR-0031**. The prompt asks
  for `headerNavMain` + two variants (`masterDetail`, `dashboard`) sharing
  `{header, primaryNav, main, footer?, inspector?}`.
- **Generic, not domain-specific** → **ADR-0002**. Brain-bank data is *sample content only*;
  no domain motifs baked into the design.
- **Schema-derived collection browse / table** → `portal-requirements.md` R3.1/R3.2,
  `prefab/core-loop.md` (nav of collections; curated columns; cell renderers by slot kind;
  loading/empty/error states; pagination + count).
- **React + TanStack Table** target → **ADR-0030** (structure components to map cleanly).
- **Honest states** (loading/empty/error) and count caveats → **ADR-0029**.
- Deferred, shown only as a reserved empty region: the **inspector/facet** panel (Phase 1).

---

## The prompt (paste into Claude Design)

```
You are helping design the UI skeleton for "Aperture" — a generic, config-driven
data-exploration portal over a scientific knowledge graph. It is NOT domain-specific:
the same UI works over any schema. This brief uses a brain-bank/genomics dataset as
realistic sample content, but nothing in the design should hardcode that domain.

GOAL
Design the MVP "walking skeleton": an app shell + a schema-derived collection browser
(a navigable list of entity types on the left, a data table in the main area). Also
produce a small LIBRARY of shell layouts that share one slot contract, so we can see
the reusable structure. Deliver a clean, reusable design system alongside the screens.

AUDIENCE & TONE
Scientific/research users (lab staff, data analysts). Aesthetic: clean, calm, neutral,
information-dense but highly readable — think a serious data tool, not a marketing site.
Light mode primary; please also provide a dark variant. Accessible contrast.

═══════════════════════════════════════════════════════════════════
PART 1 — THE PRIMARY SCREEN: "headerNavMain" layout
═══════════════════════════════════════════════════════════════════
A three-region app shell:

• HEADER (top bar): product name "Aperture", a global search field (placeholder only,
  non-functional), and a right-side slot for user/account + settings icons.

• PRIMARY NAV (left sidebar): a hand-curated list of "collections" (entity types),
  each with an icon, a human label, and a selected/active state. For the sample data:
    Donors, Samples, Brain Samples, Datafiles, Datasets, Workflows
  Note: labels differ from underlying type names (e.g. "Donors" → type "Subject").
  Collapsible sidebar is a plus.

• MAIN (content area): the selected collection's TABLE view. For "Donors" show columns:
    external_id · species · biological_sex · age_at_collection · diagnosis · # samples
  Populate ~12 realistic rows. Design cells by data type:
    - enum (species, biological_sex, diagnosis) → subtle chips/labels
    - number (age_at_collection) → right-aligned formatted number
    - text/id (external_id) → monospace-ish, the row's primary link
    - relationship count (# samples) → a small count badge
  Include, above the table: the collection title + a total count ("1,243 donors"),
  and (design-only) a "Columns" and "Export" affordance. Sortable column headers.
  Pagination control (page size + prev/next or numbered) at the bottom.

  Design ALL THREE table states as separate frames:
    1. Loaded (the populated table above)
    2. Loading (skeleton rows)
    3. Empty ("No matching donors") and Error ("Couldn't load donors — retry")

RESERVE (show as a labeled, empty region, don't build yet): an optional right-side
INSPECTOR/aside panel — future home for a record detail and a facet/filter panel.

═══════════════════════════════════════════════════════════════════
PART 2 — THE LAYOUT LIBRARY (same slot contract, different chrome)
═══════════════════════════════════════════════════════════════════
Show that the shell is a small catalog of interchangeable layouts that all fill the
SAME named slots: {header, primaryNav, main, footer?, inspector?}. Design two more
layouts reusing the same header/nav/data:

• "masterDetail": primaryNav + a narrower main LIST + a persistent right INSPECTOR
  showing one selected record's details (key–value fields).

• "dashboard": a landing layout where MAIN is a grid of summary cards/blocks
  (counts per collection, a couple of simple charts as placeholders) instead of a table.

Present them so the shared structure is obvious (a layout switcher, or side-by-side).

═══════════════════════════════════════════════════════════════════
DESIGN SYSTEM (please formalize and keep consistent)
═══════════════════════════════════════════════════════════════════
Establish reusable tokens/components I can hand to engineering:
• Color tokens (surfaces, text, border, accent, semantic success/warn/error), light+dark
• Type scale + a mono face for IDs/data; spacing scale; radius; density option (comfortable/compact)
• Components: top bar, sidebar nav item, data table (header/row/cell/badge/chip),
  pagination, buttons, inputs, empty/loading/error states, card (for dashboard)

CONSTRAINTS / HANDOFF
• Target implementation is React with a headless table (TanStack Table) — structure the
  components so they map cleanly to that (semantic table markup, tokenized styles).
• Keep the design GENERIC (schema-driven): the table, columns, and nav are data, not
  hardcoded — avoid brain-bank-specific visual motifs.
• Deliverables to export: an HTML prototype of the screens, a ZIP I can code from, and
  the design-system tokens/spec.
```

---

## Handoff checklist (when the export comes back)

- [ ] Design-system tokens captured (colors/type/spacing/radius/density) → seed `web/` theme.
- [ ] `headerNavMain` structure maps to the ADR-0031 slot contract.
- [ ] Table markup is semantic and headless-friendly (TanStack Table).
- [ ] Loading / empty / error states covered.
- [ ] Nothing domain-specific baked into components (ADR-0002).
- [ ] Note which pieces are visual-only (search, columns, export, sort) vs. wired later.
