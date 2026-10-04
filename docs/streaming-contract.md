# Rendering and sync contract

PixelForge is a local-first editor. Canvas edits render asynchronously on the
client with Canvas2D and publish the newest completed frame; stale renders are
dropped. Anonymous images and edits stay in the browser, and drafts autosave
to IndexedDB with a revision check for multi-tab conflicts.

Authenticated cloud projects use explicit request/response saves and opens.
They are whole-project JSON operations with generation-based conflict handling,
not a pixel stream. The editor therefore remains usable offline and does not
upload anonymous work in the background.

Progressive large-image rendering is a separate performance milestone. It
should use a worker, OffscreenCanvas and bounded tiles before introducing any
network transport. The current worker slice reports completed layer passes and
cancellation state only; it does not stream partial pixels or remove the
full-frame allocation. If realtime collaboration becomes a product requirement,
it must be an explicit opt-in for authenticated projects, send version or
validated operation deltas through a durable session service, queue offline
operations in IndexedDB, and preserve conflict recovery. Anonymous editing
must remain fully local.
