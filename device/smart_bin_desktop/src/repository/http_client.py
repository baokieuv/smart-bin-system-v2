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


class HttpClient(Protocol):
    """Simple HTTP client protocol for dependency inversion in repositories."""

    def post(self, url: str, **kwargs: Any) -> HttpResponse:
        ...

    def put(self, url: str, **kwargs: Any) -> HttpResponse:
        ...


class RequestsHttpClient:
    """Default HttpClient implementation based on requests library."""

    def post(self, url: str, **kwargs: Any) -> HttpResponse:
        return requests.post(url, **kwargs)

    def put(self, url: str, **kwargs: Any) -> HttpResponse:
        return requests.put(url, **kwargs)
