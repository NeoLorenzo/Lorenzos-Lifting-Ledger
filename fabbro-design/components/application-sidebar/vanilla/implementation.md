# Vanilla implementation contract

**Application Sidebar version:** 1.0.0

Use this specification when the product is not React-based.

## Required DOM roles

The authenticated shell must contain:

1. a persistent desktop `aside` for global primary navigation;
2. a main/inset workspace to its right;
3. an optional top utility bar inside the workspace;
4. a collapse trigger;
5. a rail-edge collapse target on desktop;
6. an off-canvas drawer treatment below 900px.

## Required states

Expose the sidebar state as either:

- `data-state="expanded"`; or
- `data-state="collapsed"`.

Expanded is the default desktop state.

Persist desktop preference using the shared key:

`fabbro:application-sidebar-expanded`

## Geometry

- expanded width: 15.5rem
- collapsed width: 4.5rem
- menu item minimum height: 2.55rem
- navigation icon size: 1.15rem
- active indicator width: 2px
- mobile breakpoint: 900px
- mobile drawer width: `min(19rem, calc(100vw - 3rem))`

## Identity

Expanded:
- approved product lockup.

Collapsed:
- approved product mark.

## Active state

Use the product accent for restrained active emphasis:

- accent-tinted background;
- accent-mixed border;
- 2px vertical accent indicator.

Do not turn the navigation item into a large filled CTA.

## Mobile

Below 900px:

- remove the persistent rail from document flow;
- open the same navigation as a left off-canvas drawer;
- provide a backdrop;
- provide an explicit close control;
- close the drawer after selecting a destination.

## Utilities

The optional top utility region may contain page context, search/status, the canonical mark-only Fabbro endorsement, and account/session actions.

It must not contain a second copy of global primary navigation.
