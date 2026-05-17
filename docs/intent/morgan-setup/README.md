# Morgan Setup Intent Contracts

These documents describe the intended user-facing behavior of each CTO Desktop Morgan setup screen.
They are used by intent E2E tests to verify that the UI collects the right data, exposes the right controls, and advances through the setup flow without a human desktop observer.

Each screen document defines:

- Purpose
- Required visible language
- Inputs and defaults
- Required actions
- Blocking and validation behavior
- Data that must be present in the generated setup payload
- Visual expectations

Intent tests are product-level contracts. They should stay stable when implementation details change, but they should fail when the setup experience no longer communicates or collects the intended information.
