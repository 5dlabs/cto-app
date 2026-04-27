from __future__ import annotations

import json
import logging
from typing import Any, AsyncIterator

import httpx

from .voice_agents import AgentSpec

log = logging.getLogger("voice-bridge.agent")


def _content_from_choice(choice: dict[str, Any]) -> str:
    message = choice.get("delta") or choice.get("message") or {}
    content = message.get("content") if isinstance(message, dict) else None
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                text = item.get("text") or item.get("content")
                if isinstance(text, str):
                    parts.append(text)
        return "".join(parts)
    text = choice.get("text")
    return text if isinstance(text, str) else ""


class MorganAgentClient:
    def __init__(
        self,
        agent: AgentSpec,
        request_timeout_s: float = 120.0,
    ) -> None:
        self._agent = agent
        self._request_timeout_s = request_timeout_s

    @property
    def is_configured(self) -> bool:
        return bool(
            self._agent.gateway_url
            and self._agent.gateway_token
            and self._agent.model
        )

    async def send_and_stream(self, *, session_id: str, text: str) -> AsyncIterator[str]:
        if not self.is_configured:
            log.warning("agent stub: gateway not configured for %s", self._agent.name)
            yield f"(voice-bridge: {self._agent.name} gateway not configured)"
            return

        url = f"{self._agent.gateway_url.rstrip('/')}/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self._agent.gateway_token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        payload = {
            "model": self._agent.model,
            "stream": False,
            "messages": [{"role": "user", "content": text}],
            "user": f"voice-bridge:{self._agent.name}:{session_id}",
        }

        try:
            async with httpx.AsyncClient(timeout=self._request_timeout_s) as client:
                resp = await client.post(
                    url,
                    headers=headers,
                    json=payload,
                )
                if resp.status_code >= 400:
                    body = resp.text[:400]
                    log.warning("gateway %s %d: %s", self._agent.name, resp.status_code, body)
                    yield f"(voice-bridge: {self._agent.name} returned {resp.status_code})"
                    return
                try:
                    obj = resp.json()
                except json.JSONDecodeError:
                    obj = {}
                choices = obj.get("choices") or []
                if choices:
                    content = _content_from_choice(choices[0]).strip()
                    if content:
                        yield content
        except httpx.HTTPError as exc:
            log.warning("gateway request failed for %s: %s", self._agent.name, exc)
            yield f"(voice-bridge: {self._agent.name} unreachable: {exc})"

    async def close(self) -> None:
        return None
