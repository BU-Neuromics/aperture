"""Backend factory for creating the appropriate Mosaic backend."""

from __future__ import annotations

from aperture.backends.base import MosaicBackend
from aperture.config.settings import ApertureConfig


def create_backend(config: ApertureConfig) -> MosaicBackend:
    """Create the appropriate backend based on configuration."""
    mode = config.hippo_mode

    if mode == "sdk":
        from aperture.backends.mosaic_sdk import MosaicSdkBackend

        return MosaicSdkBackend(config_path=config.hippo_config_path)
    elif mode == "rest":
        from aperture.backends.mosaic_rest import MosaicRestBackend

        return MosaicRestBackend(base_url=config.hippo_url)
    else:
        raise ValueError(
            f"Unknown hippo.mode '{mode}'. Expected 'sdk' or 'rest'."
        )
