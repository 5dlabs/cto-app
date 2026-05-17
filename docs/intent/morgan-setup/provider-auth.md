# Provider Auth Intent

## Purpose

Collect or validate non-source provider authentication settings.

## Required visible language

- authentication
- provider

## Inputs and defaults

- Provider auth state or token inputs

## Required actions

- Continue to tool API keys after provider auth requirements are satisfied

## Blocking behavior

- Required provider auth must block continuation until valid.
- Secret-like inputs must be redacted from artifacts.

## Setup payload expectations

- Provider auth state is reflected in setup payload without exposing raw secrets.

## Visual expectations

- Secret inputs use password-style controls or equivalent redaction affordances.
