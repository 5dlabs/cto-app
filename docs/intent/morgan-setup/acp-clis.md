# Dynamic workflows intent

## Purpose

Choose compatible agent surfaces for the selected harness and show the order-of-operation tree before provider selection.

## Required visible language

- Dynamic workflows
- Harness
- Agent surfaces
- Providers
- Models
- Routing
- Auth
- Copilot

## Inputs and defaults

- Agent surface selection defaults to the current Hermes lane.
- Provider recommendations are derived from selected agent surfaces.

## Required actions

- Select Copilot for the current Hermes lane.
- Continue to providers after at least one compatible agent surface is selected.

## Blocking behavior

- At least one compatible agent surface must be selected before continuing.

## Setup payload expectations

- Selected agent surfaces are included in the setup payload.
- Payload keys may remain `clis` for current chart compatibility; visible UI should say dynamic workflows / agent surfaces.

## Visual expectations

- Available and selected agent surfaces are visually clear.
- The compact order-of-operation tree appears before provider selection.
