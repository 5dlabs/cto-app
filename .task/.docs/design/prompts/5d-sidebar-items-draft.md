# 5D Platform Sidebar Items (Draft)

This document is an iterative draft for Claude's design output. It captures additions to the current design we just started, and is intended to be updated incrementally as we refine the sidebar/navigation structure.

Design intent:
- This is not a net-new redesign from scratch.
- These sections are additive updates to the current in-progress design direction.
- Content should be interpreted as implementation-ready sidebar IA and service/integration copy blocks for Claude to incorporate.

## Sidebar Information Architecture

- `Infrastructure` sidebar item: contains all 5D platform service offerings (from Security through Blockchain Infrastructure below).
- `Integrations` sidebar item: separate section for third-party/native integrations.
- `Morgan` sidebar item: remove any numeric badge/count; display label only.
- Add `GitLab` as a dedicated sidebar item for MVP.
- Future option: switch between `GitHub` and `GitLab` conditionally based on workspace/user settings.
- Rename `PRDs` to `Projects`.
- Use the current PRD layout only as a visual example; do not keep PRD-specific metadata fields.
- Remove project metadata fields from cards/list rows: `status`, `active`, `owner`, `Morgan`, and `context`.
- `Projects` uses three columns:
  - `Pending`: project has not yet been submitted.
  - `In Progress`: project is currently being built.
  - `Complete`: project build is finished.
- `Projects` includes a per-project design thread:
  - Each project has a design thread that displays candidate directions selected from intake output (as defined in the UI/intake generation flow).
  - This is the canonical place to review selected candidates before or during build.
- Top-level view tabs inside a project:
  - `Design` tab: candidate-driven design discussion thread.
  - `Storybook` tab: project-scoped component library view.
- `Storybook` tree behavior:
  - Keep one Storybook per project.
  - In the project tree, selecting `Storybook` opens component racks/stories for that specific project and selected story path.
- `Projects > Complete` interaction:
  - Right-hand pane shows a plain-language summary of all completed tasks for that project.
  - Do not require deep-linking from this summary to individual task docs.
- Intake-complete default state (no project selected):
  - On the main pane, show a live video debate between moderator `Optimus Pestimus` and the committee.
  - Visual style uses cyberpunk image assets.
  - Stream includes audio.
  - User can switch interaction mode between `audio`, `voice`, and `text`.
  - Subtitles are always visible and attributed so users can see exactly who is speaking.
- Task surface (avatar + interaction modes):
  - Show the agent avatar in all three modes: `video`, `voice`, and `text`.
  - Always surface runtime harness metadata alongside the avatar:
    - Harness: `OpenClaw` or `Hermes` (whichever is active for this task run).
    - ACP CLI: which CLI build/version is driving the task session.
    - Model + provider: show one or more model/provider pairs when a task uses multiple backends in parallel or in sequence.
  - When multiple model/provider pairs apply, present them as a compact list or stacked chips so the layout stays readable in every mode.
- `GitLab` sidebar interaction:
  - Main pane is an embedded view of the actual GitLab interface.
  - The embed should be skinned to match 5D platform color/theme styling.
  - MVP scope uses GitLab only; GitHub parity is deferred.

## New Agent Creation Flow

Clicking `New Agent` opens a polished creation modal (or equivalent form surface) optimized for fast onboarding.

Fields and inputs:
- Avatar upload
- Agent name
- GitHub URL list for tools/repositories (multi-entry field)
- File upload area for OpenClaw/OpenCode agent assets

Agent asset upload checklist:
- Required:
  - `AGENTS.md`
  - `SOUL.md`
  - System prompt file/content
  - Skills package(s) (`SKILL.md`-based skill folders or archives)
- Common additional files to support:
  - `IDENTITY.md`
  - `TOOLS.md`
  - `USER.md`
  - `HANDOFF.md`
  - `HEARTBEAT.md`
  - Other agent-specific `.md` context files used by the runtime

UX behavior:
- Show uploaded files in a structured manifest with validation states (`valid`, `missing`, `unsupported`).
- Detect duplicate uploads and prefer latest version with replace confirmation.
- Provide inline guidance for expected file names and allowed archive formats.
- Allow save as draft before final agent creation.
- Include a `Publish On-Chain` action in the agent creation/edit flow.

On-chain publish (MVP):
- Initial chain target: `Solana`.
- Clicking `Publish On-Chain` prompts wallet connection flow.
- Preferred wallet for MVP: `Phantom`.
- Publish flow should include:
  - wallet connect
  - transaction preview
  - user confirmation/signature
  - success/failure state with transaction reference
- Desktop-app note:
  - Phantom connection behavior in desktop context is currently unverified and must be tested in-app.
  - If native wallet handoff is limited, provide fallback options (QR/deep-link/browser handoff) in a later iteration.

## Settings

`Settings` is the secure control surface for credentials and runtime configuration.

Settings responsibilities:
- Secure API key entry and management for model/providers/integrations.
- Masked key display, scoped permissions, and rotation/update workflows.
- Validation of key format/connectivity where possible.
- Clear separation between local-user secrets and shared workspace configuration.

Security expectations:
- Never display full secret values after save.
- Encrypt secrets at rest and in transit within app boundaries.
- Provide audit-friendly events for create/update/revoke actions.

## Applications

Add an `Applications` sidebar tab for extension-based product modules.

Applications model:
- Each application is an extension that can be enabled/disabled per workspace/project context.
- Extensions can add their own views, workflows, and integrations while inheriting platform auth/theme/navigation.
- MVP should support clear extension discovery and activation state.

Initial extension set:
- Accounting
- Marketing
- RMS (Sigma 1 context)
- Voice Agents

## Memory

Add a `Memory` sidebar tab with a mem0-style graph visualization.

Purpose:
- Provide a visual map of memory/entities/links across all projects and all agents.
- Help users keep shared context tidy, deduplicated, and well organized.
- Make it easy to inspect what is stored, how nodes are connected, and where cleanup is needed.

Core behavior:
- Graph-first view with searchable nodes/edges.
- Filters by project, agent, memory type, and recency.
- Quick actions for merge, archive, prune, and relink of memory nodes.

## Cost

Add a `Cost` sidebar tab for usage and spend analytics.

Data and visualization:
- Use platform-native charting surfaces backed by Grafana APIs/data sources.
- Track input tokens, output tokens, and total token volume.
- Track overall cost by provider and aggregated platform total.

Cost breakdown expectations:
- Per provider (for example OpenAI, Anthropic, Google, and others configured in settings).
- Per project, per agent, and time-window rollups.
- Clear trend views plus current period totals.

## Quality

Add a `Quality` sidebar tab for task-level execution quality and efficiency metrics.

Measurement scope:
- Per-task metrics (not only aggregate platform cost views).
- Input tokens and output tokens used per task.
- Overall cost per task.
- Number of iterations required to reach acceptance criteria per task.

Visualization expectations:
- Charted views that compare tasks by efficiency and completion quality.
- Ability to sort/filter by iteration count, token usage, and cost.
- Include task-level trend/history where available.

## Infrastructure

Display 5D services provisioned through operators but branded as first-party 5D platform services (similar to a cloud provider).

- Cluster scheduling status note:
  - `0/5 nodes are available: 1 Insufficient nvidia.com/gpu, 4 node(s) didn't match Pod's node affinity/selector. no new claims to deallocate, preemption: 0/5 nodes are available: 1 No preemption victims found for incoming pod, 4 Preemption is not helpful for scheduling. (28m)`

### Security

Continuous vulnerability scanning, dependency analysis, and AI-native remediation running across every service, integrated into the same agent pipeline.

### 5D SENTINEL

- **Tagline:** Continuous security scanning and AI remediation
- **Description:** Continuous vulnerability scanning, dependency analysis, and AI-native remediation running across every service. Cipher does not just flag issues; it ships the fix through the same agent pipeline as everything else.
- **Stack:** Snyk + Nuclei + Aikido + Semgrep + CodeQL

### Data & Storage

Managed databases, object storage, and high-performance block volumes, fully operated so teams do not need to run storage engineering.

### 5D DATA

- **Tagline:** Managed PostgreSQL
- **Description:** Production-grade PostgreSQL clusters with automated backups, point-in-time recovery, connection pooling, and high-availability failover.
- **Stack:** CloudNativePG operator

### 5D CACHE

- **Tagline:** High-performance in-memory data layer
- **Description:** Redis-compatible caching and pub/sub with sub-millisecond latency for session state, rate limiting, leaderboards, and real-time pipelines.
- **Stack:** Redis operator (Valkey)

### 5D STORE

- **Tagline:** S3-compatible object storage
- **Description:** Fast distributed object storage for assets, artifacts, model weights, backups, and durable application data via an S3-compatible API.
- **Stack:** SeaweedFS operator

### 5D VOLUME

- **Tagline:** NVMe-backed block volumes
- **Description:** High-performance persistent block storage with synchronous replication, built for databases, message queues, and stateful workloads.
- **Stack:** Mayastor (OpenEBS)

### AI & Inference

Managed model runtimes across hosted providers and dedicated GPU infrastructure with a consistent API surface.

### 5D INFERENCE

- **Tagline:** Managed model runtime
- **Description:** Run open-weight models on dedicated GPU infrastructure or route to hosted providers (OpenAI, Anthropic, Google) behind a single OpenAI-compatible API. Scale from zero and hot-swap models without code changes.
- **Stack:** KubeAI operator (vLLM, Ollama, FasterWhisper) + NVIDIA GPU operator

### 5D LLAMASTACK

- **Tagline:** Meta LlamaStack inference and agents
- **Description:** Deploy and manage Meta LlamaStack distributions for agentic inference workflows with structured tool use and memory.
- **Stack:** LlamaStack Kubernetes operator

### Messaging & Events

High-throughput, durable messaging for agent-to-agent communication, event-driven services, and real-time workloads.

### 5D STREAM

- **Tagline:** Cloud-native messaging and event streaming
- **Description:** High-performance publish/subscribe, request-reply, and persistent JetStream messaging with at-least-once and exactly-once delivery.
- **Stack:** NATS with JetStream

### Secrets & Identity

Secrets management, dynamic credentials, and automatic synchronization, hardened and fully managed by default.

### 5D VAULT

- **Tagline:** Secrets management and dynamic credentials
- **Description:** API keys, credentials, and environment secrets managed behind a secure audited control layer. Includes dynamic secret generation, automatic rotation, lease management, and Kubernetes-native synchronization.
- **Stack:** OpenBao (open-source Vault) + External Secrets Operator

### Source Control

Self-hosted Git hosting with CI/CD, issues, and merge requests. No vendor lock-in and no per-seat pricing.

### 5D GIT

- **Tagline:** Self-hosted GitLab or Gitea
- **Description:** Enterprise-grade Git hosting on your infrastructure with full CI/CD, issues, merge requests, and repository management. Integrates with CTO agents and 5D Deploy.
- **Stack:** GitLab Helm chart / Gitea Helm chart

### Delivery & Observability

GitOps-driven release pipelines, unified monitoring, self-healing operations, and automated remediation.

### 5D DEPLOY

- **Tagline:** GitOps-driven delivery pipeline
- **Description:** Every change moves through a tracked automated flow from PR merge to production deployment with rollbacks, health checks, and auditability.
- **Stack:** ArgoCD + ArgoCD Image Updater

### 5D OBSERVE

- **Tagline:** Unified monitoring, logs, and traces
- **Description:** Metrics, logs, traces, and incident signals in one place with pre-wired dashboards for every platform service and OpenTelemetry-native plumbing.
- **Stack:** Prometheus + Grafana + Loki + Fluent Bit + Jaeger + OpenTelemetry Collector

### 5D PULSE

- **Tagline:** Self-healing and automated remediation
- **Description:** The platform monitors and remediates its own failures before incidents escalate, using automated detection, restart, and rollback logic.
- **Stack:** Healer agent + health check controllers + auto-rollback

### Networking & Connectivity

eBPF-powered service mesh, zero-trust access, TLS automation, and DNS management across bare metal and cloud.

### 5D MESH

- **Tagline:** eBPF networking and zero-trust access
- **Description:** High-performance eBPF networking with policy enforcement and secure cluster connectivity, including zero-trust private access without VPNs for internal tooling.
- **Stack:** Cilium + Twingate operator + Headscale/Tailscale

### 5D EDGE

- **Tagline:** Ingress, TLS, and DNS automation
- **Description:** Managed ingress routing with automatic certificate provisioning/renewal and DNS record synchronization as services move.
- **Stack:** ingress-nginx + cert-manager + external-dns

### Blockchain Infrastructure

Managed node operations and on-chain data infrastructure for Web3 teams across L1s, L2s, and interoperability protocols.

### 5D NODE

- **Tagline:** Validator and RPC node operations
- **Description:** Managed deployment across Solana, Sui, Aptos, NEAR, Base, Ethereum (Reth), Berachain, Monad, Arbitrum, Optimism, and LayerZero with upgrades, monitoring, and failover on dedicated hardware.
- **Stack:** CTO Blockchain Operator (Rust) + Kotal (5dlabs fork)

### 5D INDEX

- **Tagline:** On-chain data indexing and explorer infrastructure
- **Description:** Real-time indexing of events, account states, and transaction history, including BlockScout deployments and Cloudflare R2-backed archive storage.
- **Stack:** CTO Blockchain Operator indexing and explorer CRDs (in development)

## Integrations

Native integrations with tools teams already use for project management, communications, observability, source control, and security.

### Project Management

Linear is primary for full agent sync, project intake, and live task updates. Other tools receive task mirroring and status updates.

- Linear (primary, full bi-directional sync)
- Jira
- Asana
- Trello
- Monday

### Communications

- Slack
- Discord
- Microsoft Teams
- Email (SMTP/IMAP)

### Observability

- Grafana (platform-native)
- Datadog
- New Relic
- PagerDuty

### Source Control / CI

- GitHub
- GitLab (5D GIT primary via embedded view)
- Bitbucket
- Jenkins
- CircleCI

### Security Scanning

- Snyk
- Aikido
- Semgrep
- CodeQL
