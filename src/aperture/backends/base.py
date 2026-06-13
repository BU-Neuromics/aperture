"""Backend protocol for Hippo integration."""

from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class HippoBackend(Protocol):
    """Structural typing protocol for Hippo backend adapters."""

    def list_entities(
        self,
        entity_type: str,
        filters: dict | None = None,
        limit: int = 50,
        offset: int = 0,
        include_unavailable: bool = False,
    ) -> list[dict]: ...

    def get_entity(self, entity_type: str, entity_id: str) -> dict: ...

    def create_entity(
        self, entity_type: str, data: dict, actor: str
    ) -> dict: ...

    def update_entity(
        self, entity_type: str, entity_id: str, data: dict, actor: str
    ) -> dict: ...

    def set_availability(
        self, entity_type: str, entity_id: str, available: bool, actor: str
    ) -> dict: ...

    def search(
        self,
        entity_type: str,
        query: str,
        field: str | None = None,
        limit: int = 10,
    ) -> list[dict]: ...

    def get_history(
        self, entity_type: str, entity_id: str
    ) -> list[dict]: ...

    def list_entity_types(self) -> list[str]: ...

    def get_entity_type_schema(self, entity_type: str) -> dict: ...

    def status(self) -> dict: ...
