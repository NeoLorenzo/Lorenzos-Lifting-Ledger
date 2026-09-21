# Fabbro Public Shell 1.0.0

Framework-agnostic canonical contract for signed-out Fabbro product surfaces.

Products may implement the shell in their own frontend stack, but must consume the values in `contract.json`, `tokens/core.json`, and `css/fabbro-tokens.css` rather than redefining shared geometry locally.

The contract owns header geometry, product lockup sizing, explanatory navigation structure, Sign In placement, hero typography, kicker typography, keyboard focus treatment, footer geometry, and responsive behavior. Product-specific visuals and deeper sections remain local.

Heracles is the reference implementation for the header geometry. Kleos adopts this contract from Fabbro Design System 0.3.0 onward.
