# Morgan conditional narration: 1Password saved access

These condition-specific lines are played from the Saved access modal after CTO checks 1Password readiness.

## Ready

1Password is ready. I can look up saved access without showing secrets, then you can approve anything before CTO uses it.

Output: `onepassword-ready.mp3`

## Missing desktop

I do not see the 1Password desktop app yet. Install and sign in to 1Password first, then I will check SDK access again.

Output: `onepassword-missing-desktop.mp3`

## SDK auth needed

1Password SDK access is not ready yet. Use app approval, choose an account, or paste a service account token, then I will check access again.

Output: `onepassword-sdk-auth-needed.mp3`

## Desktop app integration

It looks like 1Password desktop app integration is not enabled yet. I opened the official 1Password SDK and app-integration guidance so you can turn it on, then I will check again.

Output: `onepassword-desktop-integration.mp3`

## Needs access

1Password access is not ready. Open and unlock 1Password, approve the app prompt, or use a service account token.

Output: `onepassword-needs-access.mp3`

## Generation notes

- Voice: Morgan via local `voice-bridge` / ElevenLabs voice ID `iP95p4xoKVk53GoZ742B`.
- Audio outputs: the condition-specific MP3s above.
- If local voice-bridge is not reachable, the UI falls back to reactive `speakCue` with the same text.
