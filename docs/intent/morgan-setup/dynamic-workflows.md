# Dynamic workflows intent

## Purpose

Show the order-of-operation tree that turns a selected harness into agent surfaces, provider choices, model defaults, routing, and auth.

## Required visible language

- Dynamic workflows
- Harness
- Agent surfaces
- Providers
- Models
- Routing
- Auth

## Inputs and defaults

- Agent surfaces default to the recommended local lane.
- Provider recommendations are derived from selected agent surfaces.
- Model and routing decisions come after providers are selected.

## Required actions

- Show the order-of-operation tree before provider selection.
- Let the user choose agent surfaces without exposing implementation jargon first.
- Continue to providers after at least one compatible agent surface is selected.

## Blocking behavior

- At least one agent surface must be selected before provider filtering.

## Setup payload expectations

- Selected agent surfaces are written to `harness.clis` for current chart compatibility.
- The UI language remains dynamic workflows / agent surfaces; internal payload names may stay stable.

## Visual expectations

- Compact tree, icon-first where available, minimal visible copy.
- Morgan narration explains why the tree exists; visible UI only anchors the order.
