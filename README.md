# Aperture

**Config-driven data portal for the [BASS](https://github.com/VA-NCPTSDBB-Bioinformatics/drylims) platform.**

Aperture is a generic data portal that talks to [Hippo](https://github.com/BU-Neuromics/hippo)
(the LinkML runtime + GraphQL/REST data store). Browsing, faceted search, view
construction/export, and visualization are **configured, not coded**, for the common
cases; custom behavior is delivered through typed, sandboxed plugins/components rather
than a scripting layer.

> **Status: fresh start (v0.1).** This repository was seeded from the `drylims` monorepo,
> carrying forward the reusable Hippo backend protocol and the portal design. The earlier
> CLI-first v0.1 implementation was intentionally left behind in `drylims` history and is
> not part of this repo. See [`design/portal-vision-handoff.md`](design/portal-vision-handoff.md)
> for the authoritative vision and [`design/portal-open-questions.md`](design/portal-open-questions.md)
> for the open decisions.

## What's here today

- `src/aperture/backends/` — the `HippoBackend` protocol and two adapters
  (`HippoSdkBackend` for in-process SDK use, `HippoRestBackend` for the REST API),
  selected via `create_backend(config)`.
- `src/aperture/config/` — `ApertureConfig`, which resolves Hippo backend settings from
  config files and `BASS_*` environment variables.
- `design/` — the config-driven portal design handoff and open questions.

The portal application (config-in-Hippo, the agent-driven dev loop, the typed component
contract, and the visualization catalog) is built on top of this foundation.

## Install

```bash
# REST mode only (talks to a running Hippo REST API):
pip install bass-aperture

# Local/in-process mode (pulls in the Hippo SDK):
pip install "bass-aperture[local]"
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
(`~/.bass/aperture.yaml`) → project config (`.bass/aperture.yaml`) → explicit config file
→ `BASS_*` environment variables (`BASS_HIPPO_MODE`, `BASS_HIPPO_URL`,
`BASS_HIPPO_CONFIG`, `BASS_LOG_LEVEL`).

## Development

```bash
pip install -e ".[dev]"
pytest -v
```

## License

MIT — see [LICENSE](LICENSE).
