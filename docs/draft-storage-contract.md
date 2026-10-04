# Durable local draft storage

PixelForge local drafts use a versioned IndexedDB bundle so large editable projects remain recoverable when a session snapshot cannot fit in `sessionStorage`.

## Bundle format

The `pixelforge-documents` database is now version 2. The existing `drafts` object store holds the current manifest pointer and the new `draftBlobs` store holds immutable UTF-8 JSON chunks. A manifest has `kind: "pixelforge-draft-bundle"`, bundle version `1`, draft revision, SHA-256 checksum, byte length, bounded chunk size/count and ordered chunk keys. The display name and `localRevision` are duplicated on the pointer for conflict diagnostics without loading the payload.

The payload is the validated editable `Draft` JSON. It is split into chunks of at most 512 KiB by default (1 MiB maximum), with a 64 MiB total limit and 256 chunk limit. On recovery, all chunks are required, ordered, length checked and hashed before JSON parsing and normal draft validation. Missing, duplicated, forged or modified chunks fail closed so a partial record cannot replace the in-memory document.

## Atomic writes and migration

A save writes new chunks, deletes the previous bundle's chunks, and updates the manifest pointer in one read-write IndexedDB transaction. The pointer is therefore an atomic commit record: a crash before commit leaves the previous complete revision addressable, while a successful commit exposes all chunks together. The optimistic `localRevision` check still rejects competing tabs.

Database version 1 records were complete Draft objects. The version upgrade preserves these records and reads them through the existing schema validator. A save under that same draft ID writes a v2 manifest/blob bundle; the editor's legacy migration may intentionally create a new bookmark so the original v1 bookmark remains recoverable. No pixels or editable properties are discarded during this migration. Discard removes both the pointer and any chunks in the same transaction.

`sessionStorage` write-ahead snapshots remain bounded at 4 MiB. Larger drafts intentionally rely on the transactional IndexedDB bundle, and the UI continues to offer project export when local storage is unavailable. The browser never uploads anonymous assets as part of local recovery.

Pure integrity tests cover a multi-megabyte round trip, missing/duplicate/modified chunks, forged pointers and legacy-record detection. Browser persistence suites open the version 2 stores and verify resize, rapid-save and legacy migration behavior through the public editor flows.
