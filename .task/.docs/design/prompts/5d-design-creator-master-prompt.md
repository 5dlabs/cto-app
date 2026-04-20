# 5D Platform — Design Creator Master Prompt (Claude Console)

Use this document when feeding **Claude Console** (Workbench) or an internal **design creator** pipeline. It follows Anthropic's **prompt template + `{{variables}}`** pattern so dynamic slices stay testable and nothing important gets dropped by accident.

**Official reference:** [Console prompting tools — Prompt templates and variables](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-tools) (Console uses `{{double_brackets}}`; `claude.ai` chat does not support these templates.)

---

## How instructions actually get into the prompt

Nothing magic reads your repo by itself. **Something you control** must load text and put it where the model sees it. Three common patterns:

### 1. Claude Console (Workbench)

- You paste the **Master prompt template** (the big block with `{{DESIGN_DOCUMENT}}`, etc.) into the project prompt / editor.
- You register **variables** with the same names as the placeholders (Console expects `{{VARIABLE_NAME}}`).
- When you run a turn, **Console substitutes** each `{{...}}` with the value you entered in the Variables UI (or from an eval run). The model receives **one assembled user message** (fixed template + filled slots).
- **Reading the design doc in:** open `docs/5d-sidebar-items-draft.md`, copy all, paste into the `DESIGN_DOCUMENT` variable field. Repeat for other variables (delta, criteria, etc.).

### 2. Messages API (your app or a script)

- Your code reads files, e.g. `fs.readFileSync("docs/5d-sidebar-items-draft.md","utf8")`.
- You **string-replace** each placeholder in the template with the loaded text (or use a small templating helper).
- You send the result as `messages[].content` to Claude. The API has no separate "variables panel"; **you** are the substitution layer.

### 3. Internal "design creator" tool

- Same as (2): your service loads `5d-design-creator-master-prompt.md` + `5d-sidebar-items-draft.md`, merges them, optionally adds user input from a form, then calls the API.
- Optional: store the last merged prompt in a DB for audit and version the **design document** separately from the **template**.

**Rule of thumb:** `{{NAME}}` is only a **marker** for "insert value here." Whoever runs the session (Console UI or your code) performs the insert before the model runs.

---

## What you actually "gave" someone (why details can disappear)

- **`docs/5d-design-creator-master-prompt.md`** is mostly **process**: variables, rules, coverage map, and a template whose body says `{{DESIGN_DOCUMENT}}`. It does **not** embed the full 5D product spec unless you **also** paste or attach `docs/5d-sidebar-items-draft.md` into that slot (or merge both into one file).
- **`docs/5d-sidebar-items-draft.md`** is where the **concrete product details** live (sidebar items, Projects flows, GitLab embed, New Agent, Memory, Cost, Quality, Infrastructure copy, etc.).
- If the recipient only got the **master prompt file** or a Console project that never had `DESIGN_DOCUMENT` filled, they would correctly see **methodology + placeholders**, not the narrative we defined here.

**For cloud-native design tools** (Stitch, v0-style builders, shared Claude projects, etc.): prefer **one handoff artifact** so nothing is split across "template vs spec":

1. Either attach **both** files, or
2. A single **merged** markdown: paste the full contents of `5d-sidebar-items-draft.md` under a top-level `# Design specification`, then paste the master template below it, with the spec duplicated inside `<design_document>` if the tool does not support variables.

---

## How to use (human)

1. Keep the canonical spec in `docs/5d-sidebar-items-draft.md` (or merge into a single `DESIGN.md` later). That file is the usual **source of truth** for `{{DESIGN_DOCUMENT}}`.
2. In Console, define **one variable per distinct input** (do not cram unrelated asks into a single blob).
3. Paste the **Master prompt template** below into your project / Workbench prompt.
4. Fill each `{{...}}` in the Variables panel (or your generator's equivalent).
5. If the design creator still compresses detail, tighten `{{DESIGN_DELTA_OR_FOCUS}}` into XML with `<must_address>` items (one bullet = one `<item>`).

---

## Variables (define in Console)

| Variable | Purpose |
|----------|---------|
| `{{DESIGN_DOCUMENT}}` | Full current design spec (typically pasted from `docs/5d-sidebar-items-draft.md`). |
| `{{DESIGN_DELTA_OR_FOCUS}}` | Exactly what this run should change or explore (feature slice, new sidebar item, flow tweak). Use XML inside the value if long. |
| `{{DESIRED_OUTPUT}}` | What artifact format you want back (e.g. `DESIGN.md diff`, `IA bullet list`, `Figma handoff`, `MVP vs later table`). |
| `{{ACCEPTANCE_CRITERIA}}` | Testable checklist the output must satisfy. |
| `{{PLATFORM_CONSTRAINTS}}` | Stack, hosting, perf, accessibility, security, desktop vs web, wallet constraints, etc. |
| `{{KNOWN_OPEN_QUESTIONS}}` | Explicit unknowns; model must flag gaps, not invent silently. |

---

## Coverage map (design creator must cross-check)

When `{{DESIGN_DELTA_OR_FOCUS}}` touches navigation, layout, or product behavior, verify consistency against these **existing** spec areas (cite section headings in scratchpad when relevant):

- Sidebar IA: `Infrastructure`, `Integrations`, `Morgan` (no count badge), `GitLab` (MVP embed + skin), `Projects`, `Applications`, `Memory`, `Cost`, `Quality`
- `Projects`: three columns (`Pending` / `In Progress` / `Complete`), PRD layout as visual example only, no legacy metadata fields, Design + Storybook tabs, Storybook tree, Complete pane summary, debate default state, task surface avatar + harness metadata
- `New Agent` modal, uploads, on-chain publish (Solana + Phantom + desktop caveat)
- `Settings`: secure API keys
- `Applications`: extensions (Accounting, Marketing, RMS, Voice Agents)
- `Memory`: mem0-style graph
- `Cost` / `Quality`: metrics + charting (Grafana-backed where stated)
- `Infrastructure` service cards + `Integrations` lists + component library notes (Storybook + shadcn + tweakcn side-by-side)

---

## Master prompt template (copy into Console)

You are the **5D Platform design creator**. You refine or extend the product design using the canonical design document and the user's focused request. You produce **implementation-ready** design guidance: information architecture, key screens, states, empty/error/loading, and explicit MVP vs later scope.

### Inputs

<design_document>
{{DESIGN_DOCUMENT}}
</design_document>

<design_delta_or_focus>
{{DESIGN_DELTA_OR_FOCUS}}
</design_delta_or_focus>

<desired_output>
{{DESIRED_OUTPUT}}
</desired_output>

<acceptance_criteria>
{{ACCEPTANCE_CRITERIA}}
</acceptance_criteria>

<platform_constraints>
{{PLATFORM_CONSTRAINTS}}
</platform_constraints>

<known_open_questions>
{{KNOWN_OPEN_QUESTIONS}}
</known_open_questions>

### Rules

1. Treat `<design_document>` as authoritative unless `design_delta_or_focus` explicitly supersedes it; if conflict, call it out and propose resolution.
2. Before designing, cross-check the **Coverage map** in your scratchpad when the delta touches nav, projects, agents, settings, analytics, or infra copy.
3. Do **not** silently drop requirements from `acceptance_criteria`. If something is infeasible under `platform_constraints`, say so and give the smallest viable alternative.
4. Prefer **clear IA + state diagrams in prose** (or mermaid) over vague adjectives.
5. Separate **MVP** vs **post-MVP** in every answer where scope could blur.

### Work style

Write your private analysis in `<scratchpad>` tags:

1. Which sections of `<design_document>` apply.
2. Dependencies and ordering (what must exist first).
3. Ambiguities and what you assume vs what you need from humans.
4. How you will map `desired_output` to concrete sections.

Then write the deliverable in `<answer>` tags. The `<answer>` must:

- Follow the structure implied by `desired_output` (if ambiguous, use: Overview → IA changes → Key flows → Components/states → Metrics/observability hooks if any → MVP vs later → Open questions).
- Reference design document **section titles** when you rely on them.
- End with a short **Open questions / needs spec** list only if something is still missing.

If `<design_document>` is empty or too short for the request, say what is missing and produce only a **gap list + suggested spec outline**—do not invent full platform details.

---

## Optional: feed this file to the Colab Metaprompt

If you use the **Metaprompt notebook** instead of Console, replace its `TASK` string with: *"Given the following master prompt methodology and 5D coverage map, generate a minimal set of non-overlapping template variables and a final `<Instructions>` block for an API-deployed design agent."* and paste the **Coverage map + Rules + Work style** sections as context. Then convert any generated placeholders to Console's `{{var}}` form before Workbench use.
