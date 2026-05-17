# CTO Three-Minute Demo Script

## Recording setup

- App is already running in demo wizard mode from the beginning: `VITE_CTO_FORCE_LOCAL_STACK_BOOTSTRAP=1 VITE_CTO_SETUP_DEMO=1 VITE_CTO_SETUP_DEMO_AUTO=0 VITE_CTO_MORGAN_AUTOSTART=1 npm run tauri:dev`.
- Current desktop app process: `cto-app` is open. Start on the **Client Cluster** first setup screen.
- Keep the pace tight: click through only the main happy path, then showcase Morgan plus a few post-wizard app sections.

## Three-minute voiceover + click track

### 0:00–0:15 — Open on first-run setup

**On screen:** Client Cluster setup screen, Morgan video playing.

**Say:**
> This is CTO Desktop starting from a clean workstation. The first thing Morgan does is prepare the local client cluster: Kind, ingress, Argo CD, and the baseline CTO charts. The setup stays visual and low-cognition — Morgan explains what is happening while the app gives me only the actions I need.

**Action:** Click **Continue**.

### 0:15–0:35 — Saved access + endpoint

**On screen:** Saved Access, then Cloudflare endpoint.

**Say:**
> If I already have saved access in 1Password, CTO can use it. For this demo I’ll continue without it. Next, CTO checks the external endpoint, so remote agents and browser-based services can reach the local desktop stack safely.

**Action:** Click **Continue without saved access** if needed, then **Continue**. On endpoint, click **Continue**.

### 0:35–1:10 — Source, harness, CLIs, providers

**On screen:** Source provider, harness, CLIs, providers/model screens.

**Say:**
> Source comes first because the agent needs somewhere durable to work. The happy path is a GitHub or GitLab app install — not a personal token flow. Then I pick the execution harness, choose which AI CLIs are available, and connect model providers. These choices become the default routing policy for the desktop agent platform.

**Action:** Advance through Source, Harness, CLIs, Providers, Provider Models, Provider Auth. Do not dwell; one sentence per screen.

### 1:10–1:35 — Tools and agent tokens

**On screen:** Tools and agent tokens.

**Say:**
> CTO also turns tools into first-class capabilities: shell, browser, GitHub, Kubernetes, MCP surfaces, and local desktop automation. Agent tokens are separated from user credentials, so Morgan can act through approved service identities instead of asking for broad personal secrets.

**Action:** Click through Tools and Agent Tokens. Complete/continue into the app shell.

### 1:35–2:05 — Morgan intake: audio + video

**On screen:** Morgan view with video mode.

**Say:**
> After setup, the default workspace is Morgan. This is the intake surface: I can talk, type, or run video presence. A typical intake starts with audio or video: I explain the problem, Morgan captures the context, asks clarifying questions, and turns the conversation into structured project work.

**Action:** Show the Morgan mode tabs — Video, Voice, Text. If safe, click or point at the composer: **Message Morgan**. Example line to say or type:
> Begin intake for the antenna testing workstation. Capture notes, organize findings, and prepare follow-up tasks.

### 2:05–2:30 — Projects and tasks

**On screen:** Click Back, then Projects, then Tasks if time.

**Say:**
> The conversation does not stay as chat. CTO turns it into project state. Projects show where work is pending, in progress, or complete, and tasks can open directly into the agent workspace that will execute the work.

**Action:** Click **Back**, then **Projects**. Optionally click **Tasks**.

### 2:30–2:50 — Agent platform sections

**On screen:** Agents, Skills, Tools.

**Say:**
> Under the agent platform, I can inspect the roster, the reusable skills each agent can load, and the connected tools. This is what makes Morgan more than a voice assistant: she is routing work into a controlled, inspectable engineering system.

**Action:** Click **Agents**, **Skills**, **Tools** quickly.

### 2:50–3:00 — Close on platform value

**On screen:** Applications or Infrastructure, then back to Morgan if time.

**Say:**
> The result is a local-first CTO environment: setup, intake, source, tools, projects, and infrastructure in one desktop app — ready for a real team workflow in under three minutes.

**Action:** End on **Morgan** or **Applications/Infrastructure** with the app stable on screen.

## Backup shorter close

If the timer is tight, skip Skills/Tools and close from Projects:

> That is the core workflow: Morgan sets up the workstation, captures audio and video intake, and turns the conversation into executable project work inside CTO Desktop.
