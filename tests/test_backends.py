"""Smoke tests for the carried-over Mosaic backend protocol + config.

These cover everything that does not require the Mosaic SDK to be installed
(the SDK backend is imported lazily by the factory, so it is exercised only
when ``hippo.mode == "sdk"``).
"""

from __future__ import annotations

import pytest

from aperture.backends import MosaicBackend, create_backend
from aperture.backends.mosaic_rest import MosaicRestBackend
from aperture.config.settings import ApertureConfig


def test_config_defaults():
    config = ApertureConfig()
    assert config.hippo_mode == "sdk"
    assert config.hippo_url == "http://localhost:8000"
    assert config.hippo_config_path == "./hippo.yaml"


def test_env_override(monkeypatch):
    monkeypatch.setenv("DATAHELIX_HIPPO_MODE", "rest")
    monkeypatch.setenv("DATAHELIX_HIPPO_URL", "http://example.test:9000")
    config = ApertureConfig()
    assert config.hippo_mode == "rest"
    assert config.hippo_url == "http://example.test:9000"


def test_factory_rest_backend(monkeypatch):
    monkeypatch.setenv("DATAHELIX_HIPPO_MODE", "rest")
    backend = create_backend(ApertureConfig())
    assert isinstance(backend, MosaicRestBackend)
    # Structural conformance to the protocol.
    assert isinstance(backend, MosaicBackend)


def test_factory_unknown_mode(monkeypatch):
    monkeypatch.setenv("DATAHELIX_HIPPO_MODE", "bogus")
    with pytest.raises(ValueError, match="Unknown hippo.mode"):
        create_backend(ApertureConfig())


def test_rest_backend_strips_trailing_slash():
    backend = MosaicRestBackend(base_url="http://localhost:8000/")
    assert backend._base_url == "http://localhost:8000"
