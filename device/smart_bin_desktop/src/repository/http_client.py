from typing import Any, Mapping, Protocol
from urllib.parse import urlparse

import requests

from src.services.runtime_versions import RUNTIME_VERSIONS
from src.utils.config import APP_CONFIG


class HttpResponse(Protocol):
    """Protocol describing minimum response surface used by repositories."""

    status_code: int
    ok: bool
    text: str
    headers: Mapping[str, str]

    def json(self) -> Any:
        ...

    def raise_for_status(self) -> None:
        ...

    def iter_content(self, chunk_size: int = ...) -> Any:
        ...


class HttpClient(Protocol):
    """Simple HTTP client protocol for dependency inversion in repositories."""

    def get(self, url: str, **kwargs: Any) -> HttpResponse:
        ...

    def post(self, url: str, **kwargs: Any) -> HttpResponse:
        ...

    def put(self, url: str, **kwargs: Any) -> HttpResponse:
        ...


class RequestsHttpClient:
    """Default HttpClient implementation based on requests library."""

    @staticmethod
    def _should_attach_version_headers(url: str) -> bool:
        parsed = urlparse(url)
        host = (parsed.hostname or "").lower()
        return host == "api.localhost" or host.endswith(".api.localhost")

    @staticmethod
    def _inject_version_headers(kwargs: dict[str, Any], url: str) -> None:
        if not RequestsHttpClient._should_attach_version_headers(url):
            return

        headers = dict(kwargs.get("headers") or {})
        headers["X-Desktop-Version"] = APP_CONFIG.desktop_version

        bin_version = RUNTIME_VERSIONS.get_bin_version()
        if bin_version:
            headers["X-Bin-Version"] = bin_version

        kwargs["headers"] = headers

    def get(self, url: str, **kwargs: Any) -> HttpResponse:
        self._inject_version_headers(kwargs, url)
        return requests.get(url, **kwargs)

    def post(self, url: str, **kwargs: Any) -> HttpResponse:
        self._inject_version_headers(kwargs, url)
        return requests.post(url, **kwargs)

    def put(self, url: str, **kwargs: Any) -> HttpResponse:
        self._inject_version_headers(kwargs, url)
        return requests.put(url, **kwargs)
