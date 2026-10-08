# ADR-050: Animated EychAr brand loader on slow route loads

## Status

Accepted. Extends ADR-048 (loading states).

## Context

Every route already streams a skeleton shaped like its page plus a top progress bar (ADR-048). The
product owner wanted a branded loader on top: a fast-paced (about 2 s loop) construction scene (a crane hoisting floors into a rising tower) that ends with the PCAS sign on the building and the EychAr wordmark below it.

## Decision

- **An image, not a script.** The animation ships as four static files in `public/assets/images`: a
  256px animated WebP per theme (light, dark) and a still PNG of the finished frame per theme. All
  are transparent, so the loader is only the scene and the lettering: no card, ring or ground line. Beside the tower, trees sway, clouds and a bird drift past, and employees walk in from both sides through the door (an HR nod).
  A GIF was tried first, but it can't do smooth transparency (jagged edges on any background). At the
  default display size of 112px (192px on the page-load stage) the 256px file stays sharp on retina screens at about 360 KB.
- **`BrandLoader`** (`components/shared/brand-loader.tsx`) renders all four images; `.brand-loader`
  CSS in `globals.css` shows one: the theme's animation, or the still under `prefers-reduced-motion`.
  Hidden images are lazy, so only the visible one is fetched. It is decorative (`aria-hidden`, empty
  alt); the `PageLoader` status text stays the single announcement.
- **Skeleton at once, loader on top.** `PageLoader` shows the skeleton immediately (120 ms fade) and
  fixes the loader (112px, in a small translucent card) at the centre of the main panel (sticky inside its scroll area, beside the sidebar and below the top bar) over it, the same spot on every page, dropping in with a
  120 ms fade. It never covers the page and stays until the route renders. The top progress bar runs
  throughout. Under reduced motion the stills replace the animation and the movement is dropped.
- **Same-origin images only**, so the CSP `img-src 'self'` needs no change.

## Consequences

- Palette changes need the animations regenerated; the colors (navy, soft pale-blue) are baked in. The light
  theme uses navy, the dark theme a light blue, so each stays legible over its own background.
- The loader sits in a small blurred card so it stays legible over the skeleton bones.
