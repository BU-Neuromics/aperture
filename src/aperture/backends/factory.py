"""Backend factory for creating the appropriate Mosaic backend."""

from __future__ import annotations

from aperture.backends.base import MosaicBackend
from aperture.config.settings import ApertureConfig


def create_backend(config: ApertureConfig) -> MosaicBackend:
    """Create the appropriate backend based on configuration."""
    mode = config.mosaic_mode

    if mode == "sdk":
        from aperture.backends.mosaic_sdk import MosaicSdkBackend

        return MosaicSdkBackend(config_path=config.mosaic_config)
    elif mode == "rest":
        from aperture.backends.mosaic_rest import MosaicRestBackend

        return MosaicRestBackend(base_url=config.mosaic_url)
    else:
        raise ValueError(
            f"Unknown mosaic.mode '{mode}'. Expected 'sdk' or 'rest'."
        )
