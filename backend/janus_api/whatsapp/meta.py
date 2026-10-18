import re
from typing import Any

import httpx

from janus_api.core.config import get_settings
from janus_api.core.errors import ApiError
from janus_api.whatsapp.schemas import TemplateOut


async def request(
    method: str,
    path: str,
    token: str,
    *,
    params: dict[str, str] | None = None,
    payload: dict[str, object] | None = None,
) -> dict[str, Any]:
    version = get_settings().meta_graph_version
    if not version:
        raise ApiError(
            "meta_not_configured",
            "WhatsApp is not configured on this server. Ask your administrator to finish setup.",
            503,
        )
    # Fixed official host: credentials can never be sent to a caller-supplied URL.
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=False) as client:
            response = await client.request(
                method,
                f"https://graph.facebook.com/{version}/{path}",
                headers={"Authorization": f"Bearer {token}"},
                params=params,
                json=payload,
            )
    except httpx.RequestError as error:
        raise ApiError(
            "meta_unknown_result", "Meta could not confirm the request result.", 502
        ) from error
    try:
        data = response.json()
    except ValueError as error:
        raise ApiError(
            "meta_unknown_result", "Meta returned an unreadable response.", 502
        ) from error
    if not response.is_success or not isinstance(data, dict) or data.get("error"):
        code = (
            data.get("error", {}).get("code")
            if isinstance(data, dict) and isinstance(data.get("error"), dict)
            else None
        )
        safe_code = str(code) if isinstance(code, int) else "rejected"
        if response.status_code >= 500 or response.status_code < 400:
            raise ApiError("meta_unknown_result", "Meta could not confirm the result.", 502)
        raise ApiError(
            f"meta_{safe_code}",
            f"Meta rejected the request ({safe_code}). Check your account and credentials.",
            422,
        )
    return dict(data)


async def templates(waba_id: str, token: str, *, name: str | None = None) -> list[TemplateOut]:
    params = {
        "fields": "name,language,status,components,parameter_format",
        "limit": "100",
        "status": "APPROVED",
    }
    if name:
        params["name"] = name
    data = await request("GET", f"{waba_id}/message_templates", token, params=params)
    output = []
    for item in data.get("data", []):
        if (
            not isinstance(item, dict)
            or item.get("status") != "APPROVED"
            or item.get("parameter_format") == "NAMED"
        ):
            continue
        components = item.get("components", [])
        if not isinstance(components, list) or any(
            not isinstance(c, dict) or c.get("type") not in {"HEADER", "BODY", "FOOTER"}
            for c in components
        ):
            continue
        parts = {c["type"]: c for c in components}
        body = parts.get("BODY", {}).get("text", "")
        header = parts.get("HEADER", {})
        footer = parts.get("FOOTER", {}).get("text", "")
        if header and (header.get("format") != "TEXT" or "{{" in header.get("text", "")):
            continue
        if not isinstance(body, str) or not body or not isinstance(footer, str):
            continue
        positions = sorted({int(n) for n in re.findall(r"\{\{(\d+)\}\}", body)})
        if (
            positions != list(range(1, len(positions) + 1))
            or len(positions) > 20
            or "{{" in re.sub(r"\{\{\d+\}\}", "", body)
        ):
            continue
        if isinstance(item.get("name"), str) and isinstance(item.get("language"), str):
            output.append(
                TemplateOut(
                    name=item["name"],
                    language=item["language"],
                    body=body,
                    header=header.get("text", ""),
                    footer=footer,
                    parameterCount=len(positions),
                )
            )
    return output
