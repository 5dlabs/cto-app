# Morgan conditional narration: 1Password saved access

These condition-specific lines are played from the Saved access modal after CTO checks 1Password readiness.

## Ready

1Password is ready. I can look up saved access without showing secrets, then you can approve anything before CTO uses it.

Output: `onepassword-ready.mp3`

## Missing desktop

I do not see the 1Password desktop app yet. Install and sign in to 1Password first, then I will check the command line again.

Output: `onepassword-missing-desktop.mp3`

## Missing CLI

The 1Password app is installed, but the op command line tool is missing. I can open the official CLI setup directions.

Output: `onepassword-missing-cli.mp3`

## Desktop app integration

It looks like you have the 1Password desktop app and the op CLI installed, but desktop app integration is not enabled yet. I opened the official 1Password CLI app-integration guide so you can turn it on, then I will check again.

Output: `onepassword-desktop-integration.mp3`

## Needs access

The op command is present, but access is not ready. Unlock 1Password and enable command line integration in the desktop app settings.

Output: `onepassword-needs-access.mp3`

## Generation notes

- Voice: Morgan via local `voice-bridge` / ElevenLabs voice ID `iP95p4xoKVk53GoZ742B`.
- Audio outputs: the condition-specific MP3s above.
- If local voice-bridge is not reachable, the UI falls back to reactive `speakCue` with the same text.
