# Prefab — Data Stories → moved to Reel

> **Moved to Reel (2026-06-22).** The conversational data-story keystone MVP moved to the **Reel**
> component with the data-story engine split (boundary:
> `drylims:platform/design/decisions/ADR-0001`; runbook `drylims:proposals/reel-split.md`).
>
> **Canonical home:** Reel `design/prefab/data-stories.md` —
> <https://github.com/BU-Neuromics/reel/blob/main/design/prefab/data-stories.md>

The keystone probe — a NotebookLM-style conversational exploration of Hippo metadata, the cheapest
decisive test of *"can an LLM reliably drive a typed declarative artifact through a validator to a
correct change?"* — is now **Reel's** keystone, not Aperture's. Aperture is the **rendering
portal** that consumes the View Contract instances such a story produces.

The portal-era prefab walkthrough (`core-loop.md`, the two-tier ladder) that the *portal* config
engine must reproduce stays here in Aperture's `prefab/`.
