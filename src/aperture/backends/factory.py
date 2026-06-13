"""Backend factory for creating the appropriate Hippo backend."""

from __future__ import annotations

from aperture.backends.base import HippoBackend
from aperture.config.settings import ApertureConfig


def create_backend(config: ApertureConfig) -> HippoBackend:
    """Create the appropriate backend based on configuration."""
    mode = config.hippo_mode

    if mode == "sdk":
        from aperture.backends.hippo_sdk import HippoSdkBackend

        return HippoSdkBackend(config_path=config.hippo_config_path)
    elif mode == "rest":
        from aperture.backends.hippo_rest import HippoRestBackend

        return HippoRestBackend(base_url=config.hippo_url)
    else:
        raise ValueError(
            f"Unknown hippo.mode '{mode}'. Expected 'sdk' or 'rest'."
        )
