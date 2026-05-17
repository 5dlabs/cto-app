import asyncio
import os
import sys
from pathlib import Path
from app.elevenlabs_client import ElevenLabsClient

VOICE_ID = "iP95p4xoKVk53GoZ742B"

JOBS = [
    (
        "02_saved-access",
        "morgan.mp3",
        "I’ll try to read what 1Password can safely show me from the command line. First I check that the desktop app is installed, then I check for the op CLI, and then I ask the CLI to list vault metadata so we know the desktop integration is actually working.\n\nIf the CLI is missing, I’ll install it and run the check again. If 1Password says desktop integration is not enabled, I’ll open Chrome to the official 1Password instructions and wait while you turn it on in Settings, Developer. Once I can read vault metadata, I can look for the credentials CTO needs, show you only redacted matches, and ask before setting anything as a secret.\n\nIf you do not want to use 1Password here, just continue. We can collect provider credentials later through the manual or provider-specific setup path.",
    ),
    (
        "03_endpoint",
        "morgan.mp3",
        "Now we’ll give Morgan a public door. Cloudflare is the easiest path for webhooks and app callbacks: sign in with Cloudflare for a durable endpoint, use approved Cloudflare access if 1Password found it, or take a temporary tunnel for a walkthrough. Pick the icon that matches what you want, and I’ll handle the details behind the scenes.",
    ),
]

async def main():
    api_key = os.environ.get("ELEVENLABS_API_KEY", "")
    client = ElevenLabsClient(api_key, VOICE_ID)
    if not client.is_configured:
        raise SystemExit("missing ELEVENLABS_API_KEY or voice id")
    out_root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/tmp/morgan-setup-mp3")
    out_root.mkdir(parents=True, exist_ok=True)
    for folder, filename, text in JOBS:
        out_dir = out_root / folder
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / filename
        total = 0
        with out_path.open("wb") as handle:
            async for chunk in client.stream_tts(text):
                handle.write(chunk)
                total += len(chunk)
        print(f"{folder}/{filename} {total} bytes voice={VOICE_ID}")

asyncio.run(main())
