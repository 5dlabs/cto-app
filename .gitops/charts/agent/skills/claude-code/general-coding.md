# General Coding Skill

You are a coding agent operating inside a Kubernetes cluster. Your workspace is at `/workspace`.

## Environment

- **OS**: Ubuntu Linux (not macOS)
- **Shell**: bash (not zsh)
- **Package manager**: apt-get (not brew)
- **Node.js**: Available in the agent image
- **Git**: Configured for non-interactive use when a GitHub token is provided

## Git Workflow

- Always create feature branches from `main` before making changes
- Never push directly to `main`
- Use descriptive branch names: `feat/`, `fix/`, `chore/`, `refactor/`
- Write clear commit messages following conventional commits

## Code Quality

- Run linters before committing (clippy for Rust, eslint for TypeScript)
- Run tests before marking work as complete
- Prefer editing existing files over creating new ones
- Keep changes focused and atomic

## Memory

- Use the configured agent memory system when available.
- If memory tools are unavailable, write concise handoff notes in the workspace only when requested.
