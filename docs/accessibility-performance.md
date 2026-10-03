# Accessibility and motion contract

PixelForge keeps the editor usable with a keyboard, a touch device, and an
operating-system reduced-motion preference. This contract covers the shared
shell; individual tools retain their own pointer and persistence contracts.

## Keyboard focus

- Every native button, link, form control, and explicit tab stop receives a
  `:focus-visible` ring with a 2px cyan outline and a 3px offset. The ring is
  drawn on the control itself so it remains visible in both the two-column and
  three-column tool palettes.
- Pointer focus does not add a persistent ring. Keyboard focus is still
  visible when the control has a transparent background or an existing
  component rule that removes the browser default outline.
- Menu roving focus (Arrow keys, Home/End, Escape and Tab) remains the source
  of truth for Photoshop-style menus. The desktop and mobile browser suite
  checks that keyboard focus is visible after navigation.

## Reduced motion

`prefers-reduced-motion: reduce` disables decorative transitions and animation,
turns smooth scrolling off, and removes the canvas width transition. Editing,
render completion, keyboard focus, pointer input, and status updates continue
to work; this preference never disables an editing command.

## Performance evidence and limits

The performance browser test attaches a repeatable startup, raster-stroke, and
PNG-export measurement for both desktop and mobile Playwright projects. The
measurements have generous 30-second watchdogs because CI hardware varies;
they are evidence for regressions, not a universal device guarantee.

Rendering currently uses a main-thread Canvas2D surface and last-render-wins
sequencing. The documented 16 megapixel canvas, 64 megapixel raster-frame,
64 MiB portable project, and 64 megapixel decoded-cache limits are safety
budgets. Worker/OffscreenCanvas rendering, tile scheduling, cancellation, and
device-specific telemetry remain planned follow-up work and are not implied by
this contract.

## Verification

`tests/accessibility.test.mjs` verifies that the source stylesheet and this
contract retain the focus and reduced-motion rules. The browser acceptance
spec `tests/browser/accessibility.spec.ts` runs in the configured desktop and
mobile projects and verifies a visible keyboard focus ring, reduced-motion
computed styles, and continued menu/editor usability.

