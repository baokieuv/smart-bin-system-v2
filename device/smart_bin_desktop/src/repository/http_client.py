from typing import Any, Mapping, Protocol

import requests


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

    def get(self, url: str, **kwargs: Any) -> HttpResponse:
        return requests.get(url, **kwargs)

    def post(self, url: str, **kwargs: Any) -> HttpResponse:
        return requests.post(url, **kwargs)

    def put(self, url: str, **kwargs: Any) -> HttpResponse:
        return requests.put(url, **kwargs)
