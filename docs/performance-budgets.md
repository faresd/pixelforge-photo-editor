# Performance budgets and current limits

PixelForge currently renders locally on the main thread with Canvas 2D. A
render is asynchronous from React's point of view, and stale renders are
dropped, but the raster work itself is not streamed to a server and is not yet
performed in a worker. A paint, clone or healing stroke can therefore touch a
full-canvas buffer. These measurements and limits describe the current safety
envelope; they do not establish Photoshop-class or industrial-scale
performance.

## Current hard limits

The limits below are enforced by the document/import code or by the private
project API:

| Resource | Current limit | Why it exists |
| --- | ---: | --- |
| Imported canvas or image asset | 16 megapixels and 16,000 px per edge | Avoid unbounded decoded Canvas2D allocations |
| Raster layers in one frame | 64 megapixels | Bound the amount of source data retained by an editable frame |
| Layers in one frame | 32 | Keep layer traversal and the inspector bounded |
| Undo history | 24 frames | Bound retained references and redraw work |
| Referenced history PNG data | approximately 32 MiB before old frames are trimmed; 64 MiB current-frame ceiling | Keep local history from growing without limit |
| Portable `.pixelforge` project | 64 MiB of encoded assets | Keep downloads and IndexedDB writes manageable |
| Private cloud project | 16 MiB per document, 30 projects and 256 MiB per library | Preserve the existing Marketplace API quota |

These are protection limits, not a promise that every device can edit at the
maximum. A 16 MP RGBA surface is approximately 64 MiB before Canvas backing
store overhead; a stroke may temporarily require more than one surface. PNG
URL length is also an encoded representation and does not equal decoded memory.

## Chromium baseline captured in CI

The browser test `tests/browser/performance.spec.ts` records three local
operations against the standard 1,440 × 960 starter document:

* **editor ready**: from the page's early init script until the application is
  no longer busy and the first canvas render is complete;
* **raster stroke**: ten pointer moves on a paint layer until the next render
  is complete (this includes Playwright input dispatch and is not a frame-time
  measurement);
* **PNG export**: one `HTMLCanvasElement.toDataURL('image/png')` call.

One run on 2026-10-02 used `CI=1`, one worker and Chromium 153. It used
Playwright's emulated devices, so the mobile row is **not a physical Pixel 7**
and neither row represents a network or CPU throttle:

| Playwright project | Viewport / DPR | Ready | Stroke | PNG encode |
| --- | --- | ---: | ---: | ---: |
| desktop (`Desktop Chrome`) | 1,280 × 720 / 1 | 185.1 ms | 429.9 ms | 4.0 ms |
| mobile (`Pixel 7`) | 412 × 839 / 2.625 | 90.7 ms | 423.8 ms | 3.7 ms |

The values are an observed single sample, retained as a test attachment in the
Playwright report. They are useful for detecting a regression or a hang, not a
distributional guarantee. A later release should collect repeated p50/p95
samples on representative physical desktop and mobile devices before turning
the candidate targets below into blocking assertions.

The test currently uses a 30-second watchdog for each operation. That is
deliberately much looser than a user-facing budget: it catches a stalled
render without making hosted CI hardware look like a supported performance
profile. It does not claim that a 30-second interaction is acceptable.

## Candidate release targets

These are proposed gates for the current starter-document path, not achieved
claims. They should be measured as p95 over at least 20 cold and warm runs on
each supported device class:

| Operation | Desktop target | Mobile target | Gate status |
| --- | ---: | ---: | --- |
| Editor ready, 1,440 × 960 | ≤ 1.5 s | ≤ 2.5 s | Candidate; instrumentation above is ready, repeated device runs are pending |
| One 10-point paint stroke commit | ≤ 250 ms | ≤ 500 ms | Candidate; current CI sample is ~430 ms including Playwright dispatch |
| PNG export, 1,440 × 960 | ≤ 250 ms | ≤ 500 ms | Candidate; current CI sample is ~4 ms, but physical-device data is pending |
| 16 MP first render/import | ≤ 2 s | ≤ 4 s | Future worker/tile benchmark; no current evidence |

The stroke target is intentionally separated from the current CI sample's
input-dispatch overhead. The app does not currently expose a production
pointer-to-paint mark, so this test cannot prove a 250 ms frame budget. Do not
raise the limits or publish these targets as support guarantees until physical
device samples and memory traces exist.

## Required scale work before larger documents

The current full-canvas model should remain bounded while the roadmap adds
professional tools. Before increasing the 16 MP limit or calling the editor
industrial-scale, the implementation needs:

1. A worker/`OffscreenCanvas` render path with cancellation and a visible
   progress state. The main thread must stay responsive while a large frame or
   adjustment renders.
2. Bounded tiles (with explicit edge overlap for blur, healing and other
   neighborhood operations) so one edit does not allocate several full-size
   surfaces. Tile cache size and eviction must be measured on desktop and
   mobile.
3. Operation-level marks for pointer-to-paint, render completion, export and
   IndexedDB save, plus p50/p95 reports on physical devices. A browser
   `toDataURL` benchmark alone is insufficient.
4. Memory-pressure tests for 16 MP imports, multi-layer compositions and undo
   trimming. A failed allocation must preserve the prior draft and offer an
   export path.
5. Regression gates for offline/local drafts, cloud conflict recovery and
   representative pixel output after worker/tile scheduling changes.

Until those gates pass, large-image, batch and AI operations remain opt-in
roadmap work. Network streaming or realtime collaboration would be a separate
authenticated feature with its own privacy, quota and conflict contract; it is
not implied by local rendering.

## Re-running the baseline

Use the repository's Node 22 toolchain and run:

```sh
CI=1 npm run test:e2e -- tests/browser/performance.spec.ts \
  --project=desktop --project=mobile --workers=1
```

The test output prints a JSON sample and attaches
`performance-baseline.json` to the Playwright report. Keep the browser version,
project, viewport, DPR and commit alongside any comparison; otherwise a timing
number is not reproducible evidence.
