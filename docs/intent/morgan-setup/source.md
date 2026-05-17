# Source Intent

## Purpose

Connect CTO Desktop to the Git source that will own local GitOps state.

## Required visible language

- GitHub
- repository
- authorization

## Inputs and defaults

- Owner/user or organization
- GitOps repository name
- Authorization state

## Required actions

- Authorize with GitHub when no token exists
- Continue to harness selection once source credentials are valid

## Blocking behavior

- Continue must remain disabled until the app has valid source-control credentials.
- Device-code values must not be persisted in artifacts.

## Setup payload expectations

- Source provider is `github`.
- Owner is populated.
- Repository is populated.
- Credential material is stored outside Git and redacted from artifacts.

## Visual expectations

- The screen clearly communicates that GitHub authorization is required.
- Disabled actions are visibly disabled and remain accessible by title or aria-label.
