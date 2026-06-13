"""Configuration loading and resolution for Aperture.

Resolution order: explicit config file > env vars > project config > user config
> defaults. Scoped to what the Hippo backends need (`hippo.mode`, `hippo.url`,
`hippo.config`, plus `logging.level`); the CLI-era output/format settings were
dropped in the portal fresh-start.
"""

from __future__ import annotations

import os
from copy import deepcopy
from pathlib import Path
from typing import Any

import yaml

# Defaults are declared inline here (formerly in a separate CLI-era module) so the
# backends carry no dependency on the dropped CLI tree.
DEFAULT_CONFIG: dict = {
    "hippo": {
        "mode": "sdk",
        "config": "./hippo.yaml",
        "url": "http://localhost:8000",
    },
    "logging": {
        "level": "WARNING",
    },
}

USER_CONFIG_DIR = Path.home() / ".bass"
USER_CONFIG_FILE = USER_CONFIG_DIR / "aperture.yaml"
PROJECT_CONFIG_FILE = Path(".bass") / "aperture.yaml"


def _deep_merge(base: dict, override: dict) -> dict:
    """Merge override into base, recursing into nested dicts."""
    result = deepcopy(base)
    for key, value in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = deepcopy(value)
    return result


def _load_yaml(path: Path) -> dict:
    """Load a YAML file, returning empty dict if missing or invalid."""
    if not path.is_file():
        return {}
    with open(path) as f:
        data = yaml.safe_load(f)
    return data if isinstance(data, dict) else {}


def _apply_env_vars(config: dict) -> dict:
    """Override config values from BASS_* environment variables."""
    env_map = {
        "BASS_HIPPO_MODE": ("hippo", "mode"),
        "BASS_HIPPO_URL": ("hippo", "url"),
        "BASS_HIPPO_CONFIG": ("hippo", "config"),
        "BASS_LOG_LEVEL": ("logging", "level"),
    }
    for env_var, key_path in env_map.items():
        value = os.environ.get(env_var)
        if value is None:
            continue
        section, key = key_path
        config.setdefault(section, {})[key] = value
    return config


class ApertureConfig:
    """Resolved Aperture configuration (Hippo backend selection)."""

    def __init__(self, config_path: Path | None = None) -> None:
        self._raw = self._resolve(config_path)

    def _resolve(self, config_path: Path | None) -> dict:
        """Build resolved config from all sources."""
        config = deepcopy(DEFAULT_CONFIG)

        # Layer 1: user config
        config = _deep_merge(config, _load_yaml(USER_CONFIG_FILE))

        # Layer 2: project config
        config = _deep_merge(config, _load_yaml(PROJECT_CONFIG_FILE))

        # Layer 3: explicit config file (--config flag)
        if config_path:
            config = _deep_merge(config, _load_yaml(Path(config_path)))

        # Layer 4: env vars
        config = _apply_env_vars(config)

        return config

    def get(self, key: str, default: Any = None) -> Any:
        """Get a dot-separated config key (e.g. 'hippo.mode')."""
        parts = key.split(".")
        value: Any = self._raw
        for part in parts:
            if isinstance(value, dict):
                value = value.get(part)
            else:
                return default
            if value is None:
                return default
        return value

    def set(self, key: str, value: Any) -> None:
        """Set a config key in the user config file."""
        USER_CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        user_config = _load_yaml(USER_CONFIG_FILE)
        parts = key.split(".")
        target = user_config
        for part in parts[:-1]:
            target = target.setdefault(part, {})
        target[parts[-1]] = value
        # Write with temp-file + rename for atomicity
        tmp_path = USER_CONFIG_FILE.with_suffix(".tmp")
        with open(tmp_path, "w") as f:
            yaml.dump(user_config, f, default_flow_style=False)
        tmp_path.rename(USER_CONFIG_FILE)
        # Update in-memory config
        self._raw = self._resolve(None)

    @property
    def raw(self) -> dict:
        return deepcopy(self._raw)

    @property
    def hippo_mode(self) -> str:
        return self.get("hippo.mode", "sdk")

    @property
    def hippo_url(self) -> str:
        return self.get("hippo.url", "http://localhost:8000")

    @property
    def hippo_config_path(self) -> str:
        return self.get("hippo.config", "./hippo.yaml")
