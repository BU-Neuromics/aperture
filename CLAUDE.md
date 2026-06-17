# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Component Overview

**Aperture** is the Interface Layer for the BASS platform — an **AI-native data & workflow
explorer** over the platform's domain graph; the config-driven **portal** is its substrate / MVP,
not the product (see `design/vision.md`). See the root `../CLAUDE.md` for repo-wide conventions.

## Spec Structure

Design docs live in `design/`. Aperture was designed **ADR-first**: load-bearing decisions are
recorded as ADRs in `design/decisions/`, indexed by the **Decision Log** in `design/INDEX.md`
(the source of truth — always check it before drafting or modifying design content). Vision and
working-design docs (`vision.md`, `architecture.md`, `actors.md`, `instruction-path-model.md`,
`prefab/`) provide narrative context; **cite ADRs for decisions**.

## Design Decisions (ADRs)

- Decisions are recorded as **ADRs** per the **platform-wide convention** — canonical process and
  template in `../platform/design/decisions/README.md` (and the root `../CLAUDE.md`); local
  process notes in `design/decisions/README.md`.
- New/non-trivial decisions get an ADR; open questions are `Proposed` ADRs ratified by a status
  flip. Decisions are never deleted — reversals `Supersede` with a forward pointer.
- When an Aperture ADR imposes a requirement on another component, cross-reference that
  component's ADR / spec section so the dependency is legible from both sides (e.g. ADR-0023 ↔
  Hippo ADR-0001 for graph-level as-of).

## Writing Guidelines

- Keep the platform's **SDK-first** principle and the **typed/declarative substrate** invariants
  (config-as-LinkML-in-Hippo, no middle scripting layer, view-descriptions-not-DOM,
  dry-run-validatable) consistent across design docs.
- Aperture source is **generic** — no domain (e.g. brain-bank) nouns in source (ADR-0002).
