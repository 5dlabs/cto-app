# Agent Tokens Intent

## Purpose

Collect optional agent communication tokens and reach the final Start action.

## Required visible language

- Discord
- Start

## Inputs and defaults

- Optional agent token inputs

## Required actions

- Start the local bootstrap when required setup state is complete

## Blocking behavior

- Start must be enabled only when required prior setup state is valid.
- Any tokens must be redacted from artifacts.

## Setup payload expectations

- Agent token fields are represented in secret-safe setup state.

## Visual expectations

- Start action is visible and enabled when the flow is ready.
