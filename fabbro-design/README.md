# Adopted Fabbro Design System

Heracles consumes a local snapshot of the canonical Fabbro Design System.

**Adopted design-system version:** 0.2.0  
**Adopted Application Sidebar:** 1.0.0  
**Upstream:** `NeoLorenzo/Fabbro-Systems/design-system`

Heracles is not a React application, so it implements the canonical sidebar through:

- `components/application-sidebar/contract.json`
- `components/application-sidebar/vanilla/implementation.md`

Do not reinterpret canonical family-level geometry or behavior locally. Heracles remains free to own its page definitions, workout-specific UI, training workflows, analytics, and domain-specific controls.

## Snapshot contents

- `VERSION`
- `core.json`
- `product.json`
- `fabbro-tokens.css`
- `assets/`
- `components/application-sidebar/`

- `components/public-shell/` — canonical Public Shell 1.0.0 framework-agnostic contract
