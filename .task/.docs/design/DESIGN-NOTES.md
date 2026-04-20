# Design — CTO Desktop

## Canonical source

The canonical design lives in this directory (`.task/.docs/design/`). The
intended file set:

- `CTO Desktop.html` — primary layout
- Any supporting assets (images, fonts, component fragments) alongside

## Upstream reference

The design was authored in the Anthropic design tool at:

```
https://api.anthropic.com/v1/design/h/VeNWrpouE4ESOg1P3s_h0Q?open_file=CTO+Desktop.html
```

As of repo bootstrap, this URL is **not anonymously fetchable** — it is a
session-scoped endpoint on `api.anthropic.com` and returns `405 Method Not
Allowed` / `404 Not Found` to unauthenticated clients. The design file must be
**downloaded from within the Claude.ai session** and committed to this
directory manually.

## Rules for implementation

1. Treat the HTML design as the **source of truth** for layout, color, and
   typography. Do not re-interpret the brief from memory.
2. The Tauri shell (`src-tauri/`) is presentational-agnostic. All UI lives in
   `ui/`. Port the design straight into `ui/src/` using React + Tailwind.
3. When porting, preserve:
   - Exact color tokens (lift to `tailwind.config.js` theme).
   - Exact spacing / sizing — no rounding to "nicer" values.
   - Exact iconography and imagery (commit the assets alongside the HTML).
4. Anything not covered by the design (states, edge cases, scroll) is a
   product decision — flag it, don't invent it.

## Status

- [ ] `CTO Desktop.html` committed to this directory
- [ ] Assets extracted and committed
- [ ] Tailwind theme seeded from design tokens
- [ ] Top-level layout ported
- [ ] Component inventory complete
