# Fabbro Application Sidebar

**Component version:** 1.0.0  
**Introduced in Fabbro Design System:** 0.2.0

The Fabbro Application Sidebar is the canonical primary-navigation component for authenticated Fabbro Systems products.

It is based on the shadcn/ui Sidebar composition model and was promoted from the validated Kleos implementation.

## Canonical behavior

- persistent left-side desktop navigation;
- expanded by default;
- collapsible to an icon rail;
- rail-edge and explicit trigger support;
- approved product lockup when expanded;
- approved product mark when collapsed;
- Lucide visual grammar for navigation icons;
- product-accent active state;
- workspace to the right of the rail;
- separate top/right utility region for context, Fabbro mark, and account/session actions;
- off-canvas drawer below 900px;
- no duplicate global primary navigation inside page content.

Exact route definitions, labels, grouping, and icon choices remain product-owned.

## React consumers

Use the source under `react/` as the canonical primitive.

React product repositories should vendor this component unchanged inside their adopted Fabbro Design System snapshot and build a small product-specific wrapper around it.

Do not fork the primitive to change family-level geometry or interaction behavior.

The React reference requires `lucide-react` for the trigger/close icons and assumes product navigation icons follow the Lucide visual grammar.

## Non-React consumers

Use `vanilla/implementation.md` and `contract.json` to reproduce the same DOM behavior and geometry without adopting React.

Framework choice is not part of the visual contract.

## Versioning

The application-sidebar component has its own component version in addition to the parent Fabbro Design System version.

A product should record both:

- adopted Fabbro Design System version;
- adopted Application Sidebar version.

Any change to canonical sidebar behavior or geometry requires a component-version change and an explicit product sync.
