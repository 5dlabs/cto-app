# GitLab CodeRun Auth Contract

This spike defines the GitLab-backed CodeRun/source-control auth path for Rex, Blaze, Pass, and Cipher style agents.

## Contract

- Tauri command: `probe_gitlab_coderun_auth`
- TypeScript wrapper: `probeGitlabCodeRunAuth(request)`
- Default host: `https://gitlab.com`
- Probe endpoint: `GET /api/v4/user`
- Auth header: bearer token from the approved setup path
- Runtime secret destination: `cto-agent-keys` / `GITLAB_TOKEN`
- Agent lanes: `rex`, `blaze`, `pass`, `cipher`
- Required practical scopes:
  - `api`
  - `read_api`
  - `read_repository`
  - `write_repository`

## Redaction rules

- Raw token is accepted only as command input and used only for the single GitLab probe request.
- Command output returns `redactedTokenPreview` and the literal redaction marker `[REDACTED]`; it never returns the token.
- Logs/docs/tests must not include raw tokens. Canary checks should use fake values and assert they do not appear in serialized result contracts.

## CodeRun usage model

After the probe succeeds and the user approves saving the credential, CTO stores the token as `GITLAB_TOKEN` in the tenant-owned agent secret. CodeRun jobs can then form HTTPS remotes at runtime, for example `oauth2:${GITLAB_TOKEN}@gitlab.com/<group>/<repo>.git`, without writing the expanded credential to git, logs, or config files.
