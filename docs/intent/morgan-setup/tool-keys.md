# Tool Keys Intent

## Purpose

Collect optional tool API keys for research and retrieval integrations.

## Required visible language

- API keys
- tools

## Inputs and defaults

- Optional tool API key inputs

## Required actions

- Configure agent Discord tokens after optional keys are reviewed

## Blocking behavior

- Optional keys must not block continuation when empty.
- Any entered keys must be redacted from artifacts.

## Setup payload expectations

- Tool keys are included only through secret-safe paths.

## Visual expectations

- Optional nature of this screen is visible.
