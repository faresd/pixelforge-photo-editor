# Path Blur and Spin Blur contract

PixelForge exposes two bounded, nondestructive Blur Gallery commands:
**Filter → Blur Gallery → Path Blur…** and **Filter → Blur Gallery → Spin
Blur…**. Each command stores its validated metadata on the selected layer in
`adjustments.filterEffects`; the source asset is never replaced.

```ts
{
  type: 'path-blur' | 'spin-blur',
  amount: 0..100,
  radius: 0..64,
  angle: -180..180,
  centerX: 0..1,
  centerY: 0..1,
  seed: uint32,
  path?: Array<{ x: number; y: number; speed: number }>,
  pathCentered?: boolean,
  pathTaper?: number,
  spinEllipse?: { radiusX: number; radiusY: number; rotation: number; feather: number }
}
```

Spin Blur is a local fixed-sample polar integration around the editable centre.
`radius` is its angular sweep in degrees. New records can provide a rotated,
soft `spinEllipse`; the renderer leaves pixels outside the ellipse unchanged
and feathers the boundary. Path Blur accepts a normalized two-to-eight-point
polyline with a per-point `speed` value. The renderer finds each pixel's
nearest path segment, interpolates endpoint speed, and takes bounded
source-only samples along that direction. `pathCentered` controls symmetric
versus trailing samples and `pathTaper` fades the blur toward endpoints.
Legacy records without a path or ellipse retain the previous centre/angle
approximations. Both effects keep source alpha and transparent RGB padding
byte-for-byte stable, clamp sampling at document edges, and blend through
`amount`.

These are explicit local approximations. Path shape guides, rear-sync flash,
strobe controls, depth maps, bokeh/highlight reconstruction and camera-style
focus simulation remain staged. Pure tests cover deterministic output, source
immutability, bounds, identity controls, authored path speeds/taper, rotated
ellipse feathering, centre/direction changes, alpha preservation and hidden
transparent RGB. Desktop and mobile acceptance covers menu enablement,
editable controls, undo, source-asset retention and project reload round trips.
