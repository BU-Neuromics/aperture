"""Remote REST backend adapter for Mosaic."""

from __future__ import annotations

from typing import Any

import httpx


class MosaicRestBackend:
    """Backend that calls the Mosaic REST API via httpx."""

    def __init__(self, base_url: str = "http://localhost:8000") -> None:
        self._base_url = base_url.rstrip("/")
        self._client = httpx.Client(base_url=self._base_url, timeout=30.0)

    def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        response = self._client.request(method, path, **kwargs)
        if response.status_code == 404:
            raise EntityNotFoundError(f"Not found: {path}")
        response.raise_for_status()
        return response.json()

    def list_entities(
        self,
        entity_type: str,
        filters: dict | None = None,
        limit: int = 50,
        offset: int = 0,
        include_unavailable: bool = False,
    ) -> list[dict]:
        params: dict[str, Any] = {"limit": limit, "offset": offset}
        if include_unavailable:
            params["include_unavailable"] = "true"
        if filters:
            for k, v in filters.items():
                params[f"filter.{k}"] = v
        return self._request("GET", f"/entities/{entity_type}", params=params)

    def get_entity(self, entity_type: str, entity_id: str) -> dict:
        return self._request("GET", f"/entities/{entity_type}/{entity_id}")

    def create_entity(
        self, entity_type: str, data: dict, actor: str
    ) -> dict:
        return self._request(
            "POST",
            f"/entities/{entity_type}",
            json=data,
            headers={"X-Mosaic-Actor": f"actor:{actor}"},
        )

    def update_entity(
        self, entity_type: str, entity_id: str, data: dict, actor: str
    ) -> dict:
        return self._request(
            "PATCH",
            f"/entities/{entity_type}/{entity_id}",
            json=data,
            headers={"X-Mosaic-Actor": f"actor:{actor}"},
        )

    def set_availability(
        self, entity_type: str, entity_id: str, available: bool, actor: str
    ) -> dict:
        return self._request(
            "PATCH",
            f"/entities/{entity_type}/{entity_id}/availability",
            json={"is_available": available},
            headers={"X-Mosaic-Actor": f"actor:{actor}"},
        )

    def search(
        self,
        entity_type: str,
        query: str,
        field: str | None = None,
        limit: int = 10,
    ) -> list[dict]:
        params: dict[str, Any] = {"q": query, "limit": limit}
        if field:
            params["field"] = field
        return self._request("GET", f"/search/{entity_type}", params=params)

    def get_history(
        self, entity_type: str, entity_id: str
    ) -> list[dict]:
        return self._request(
            "GET", f"/entities/{entity_type}/{entity_id}/history"
        )

    def list_entity_types(self) -> list[str]:
        return self._request("GET", "/schema")

    def get_entity_type_schema(self, entity_type: str) -> dict:
        return self._request("GET", f"/schema/{entity_type}")

    def status(self) -> dict:
        try:
            health = self._request("GET", "/health")
            return {
                "component": "mosaic",
                "mode": "rest",
                "url": self._base_url,
                "status": "healthy",
                "version": health.get("version", "unknown"),
                "entity_types": health.get("entity_types", 0),
            }
        except Exception as exc:
            return {
                "component": "mosaic",
                "mode": "rest",
                "url": self._base_url,
                "status": "unavailable",
                "error": str(exc),
            }


class EntityNotFoundError(Exception):
    """Raised when an entity is not found via the REST API."""
