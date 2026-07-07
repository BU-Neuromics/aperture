# Aperture

**AI-native data & workflow explorer for the [DataHelix](https://github.com/VA-NCPTSDBB-Bioinformatics/drylims) platform.**

Aperture is an **LLM-native interaction layer** over the DataHelix **domain graph** — one typed
knowledge graph whose runtime is [Hippo](https://github.com/BU-Neuromics/hippo) (the platform's
LinkML runtime / structured domain graph, exposed over GraphQL + REST). Its differentiator is
the *interaction paradigm*: exploring and transforming scientific data through natural language.

The **config-driven portal is Aperture's substrate and MVP, not the product**: browsing, faceted
search, view construction/export, and visualization are **configured, not coded**, and custom
behavior is delivered through typed, sandboxed plugins/components rather than a scripting layer.
That validated, typed, declarative surface is exactly what makes natural-language control safe and
reliable. See [`design/vision.md`](design/vision.md) for the north-star framing.

> **Status: fresh start (v0.1).** This repository was seeded from the `drylims` monorepo,
> carrying forward the reusable Hippo backend protocol and the portal design. The earlier
> CLI-first v0.1 implementation was intentionally left behind in `drylims` history and is
> not part of this repo. See [`design/vision.md`](design/vision.md) for the north-star vision
> (AI-native explorer; portal = substrate), [`design/portal-vision-handoff.md`](design/portal-vision-handoff.md)
> for the original portal brainstorm (historical context), and
> [`design/portal-open-questions.md`](design/portal-open-questions.md) for the open decisions.

## What's here today

- `src/aperture/backends/` — the `HippoBackend` protocol and two adapters
  (`HippoSdkBackend` for in-process SDK use, `HippoRestBackend` for the REST API),
  selected via `create_backend(config)`.
- `src/aperture/config/` — `ApertureConfig`, which resolves Hippo backend settings from
  config files and `DATAHELIX_*` environment variables.
- `design/` — the north-star vision (`vision.md`), ADRs, the portal design handoff (historical), and open questions.

The portal application (config-in-Hippo, the agent-driven dev loop, the typed component
contract, and the visualization catalog) is built on top of this foundation.

## Install

```bash
# REST mode only (talks to a running Hippo REST API):
pip install datahelix-aperture

# Local/in-process mode (pulls in the Hippo SDK):
pip install "datahelix-aperture[local]"
```

## Usage

```python
from aperture.config.settings import ApertureConfig
from aperture.backends import create_backend

config = ApertureConfig()          # resolves hippo.mode / hippo.url / hippo.config
backend = create_backend(config)   # HippoSdkBackend or HippoRestBackend
entities = backend.list_entities("Sample", limit=10)
```

Configuration sources (lowest → highest precedence): built-in defaults → user config
(`~/.datahelix/aperture.yaml`) → project config (`.datahelix/aperture.yaml`) → explicit config file
→ `DATAHELIX_*` environment variables (`DATAHELIX_HIPPO_MODE`, `DATAHELIX_HIPPO_URL`,
`DATAHELIX_HIPPO_CONFIG`, `DATAHELIX_LOG_LEVEL`).

## Development

```bash
pip install -e ".[dev]"
pytest -v
```

## License

MIT — see [LICENSE](LICENSE).
