from __future__ import annotations

import json
import logging
import time
from typing import AsyncIterator

import httpx

log = logging.getLogger("voice-bridge.eleven")

_API_BASE = "https://api.elevenlabs.io/v1"


def _emit(event: dict[str, object], *, level: int = logging.INFO) -> None:
    log.log(level, json.dumps(event, sort_keys=True))


class ElevenLabsClient:
    def __init__(self, api_key: str, voice_id: str) -> None:
        self._api_key = api_key
        self._voice_id = voice_id

    @property
    def is_configured(self) -> bool:
        return bool(self._api_key and self._voice_id)

    async def transcribe(
        self,
        audio_bytes: bytes,
        *,
        content_type: str = "audio/webm",
        filename: str = "turn.webm",
        language_code: str | None = None,
    ) -> str:
        started = time.monotonic()
        _emit(
            {
                "type": "elevenlabs_stt_request",
                "audio_bytes": len(audio_bytes),
                "content_type": content_type,
                "filename": filename,
                "configured": bool(self._api_key),
            }
        )
        if not self._api_key:
            _emit(
                {
                    "type": "elevenlabs_stt_skipped",
                    "reason": "missing_api_key",
                    "audio_bytes": len(audio_bytes),
                },
                level=logging.WARNING,
            )
            return ""
        if not audio_bytes:
            _emit(
                {"type": "elevenlabs_stt_skipped", "reason": "empty_audio", "audio_bytes": 0}
            )
            return ""

        url = f"{_API_BASE}/speech-to-text"
        headers = {"xi-api-key": self._api_key, "accept": "application/json"}
        data: dict[str, str] = {"model_id": "scribe_v1"}
        if language_code:
            data["language_code"] = language_code
        files = {"file": (filename, audio_bytes, content_type)}

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(url, headers=headers, data=data, files=files)
                duration_ms = round((time.monotonic() - started) * 1000, 2)
                if resp.status_code >= 400:
                    body = resp.text[:400]
                    _emit(
                        {
                            "type": "elevenlabs_stt_response",
                            "status": resp.status_code,
                            "audio_bytes": len(audio_bytes),
                            "duration_ms": duration_ms,
                            "error_preview": body,
                        },
                        level=logging.WARNING,
                    )
                    return ""
                payload = resp.json()
                text = (payload.get("text") or "").strip()
                _emit(
                    {
                        "type": "elevenlabs_stt_response",
                        "status": resp.status_code,
                        "audio_bytes": len(audio_bytes),
                        "transcript_chars": len(text),
                        "transcript_empty": not bool(text),
                        "duration_ms": duration_ms,
                    }
                )
                return text
        except httpx.HTTPError as exc:
            _emit(
                {
                    "type": "elevenlabs_stt_error",
                    "audio_bytes": len(audio_bytes),
                    "duration_ms": round((time.monotonic() - started) * 1000, 2),
                    "error": str(exc),
                },
                level=logging.WARNING,
            )
            return ""

    async def stream_tts(self, text: str) -> AsyncIterator[bytes]:
        if not self.is_configured or not text:
            _emit(
                {
                    "type": "elevenlabs_tts_skipped",
                    "configured": self.is_configured,
                    "text_chars": len(text or ""),
                }
            )
            return
        started = time.monotonic()
        _emit(
            {
                "type": "elevenlabs_tts_request",
                "voice_id": self._voice_id,
                "text_chars": len(text),
                "alignment": False,
            }
        )
        url = f"{_API_BASE}/text-to-speech/{self._voice_id}/stream"
        headers = {
            "xi-api-key": self._api_key,
            "accept": "audio/mpeg",
            "content-type": "application/json",
        }
        payload = {
            "text": text,
            "model_id": "eleven_flash_v2_5",
            "output_format": "mp3_22050_32",
        }
        total_bytes = 0
        chunks = 0
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                async with client.stream("POST", url, headers=headers, json=payload) as resp:
                    resp.raise_for_status()
                    async for chunk in resp.aiter_bytes():
                        if chunk:
                            chunks += 1
                            total_bytes += len(chunk)
                            yield chunk
        finally:
            _emit(
                {
                    "type": "elevenlabs_tts_complete",
                    "voice_id": self._voice_id,
                    "text_chars": len(text),
                    "audio_bytes": total_bytes,
                    "chunks": chunks,
                    "duration_ms": round((time.monotonic() - started) * 1000, 2),
                }
            )

    async def stream_tts_with_timestamps(self, text: str) -> AsyncIterator[dict]:
        """Stream TTS with character-level alignment timestamps."""
        if not self.is_configured or not text:
            _emit(
                {
                    "type": "elevenlabs_tts_skipped",
                    "configured": self.is_configured,
                    "text_chars": len(text or ""),
                    "alignment": True,
                }
            )
            return
        started = time.monotonic()
        _emit(
            {
                "type": "elevenlabs_tts_request",
                "voice_id": self._voice_id,
                "text_chars": len(text),
                "alignment": True,
            }
        )
        url = f"{_API_BASE}/text-to-speech/{self._voice_id}/stream/with-timestamps"
        headers = {
            "xi-api-key": self._api_key,
            "accept": "application/json",
            "content-type": "application/json",
        }
        payload = {
            "text": text,
            "model_id": "eleven_flash_v2_5",
            "output_format": "mp3_22050_32",
        }
        frames = 0
        audio_frames = 0
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                async with client.stream("POST", url, headers=headers, json=payload) as resp:
                    resp.raise_for_status()
                    async for line in resp.aiter_lines():
                        if line.strip():
                            frames += 1
                            try:
                                frame = json.loads(line)
                                if frame.get("audio_base64"):
                                    audio_frames += 1
                                yield frame
                            except json.JSONDecodeError:
                                log.warning("Failed to parse alignment frame: %s", line[:200])
        finally:
            _emit(
                {
                    "type": "elevenlabs_tts_complete",
                    "voice_id": self._voice_id,
                    "text_chars": len(text),
                    "alignment": True,
                    "frames": frames,
                    "audio_frames": audio_frames,
                    "duration_ms": round((time.monotonic() - started) * 1000, 2),
                }
            )

    def with_voice(self, voice_id: str) -> "ElevenLabsClient":
        return ElevenLabsClient(api_key=self._api_key, voice_id=voice_id)
