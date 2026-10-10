# Authenticated cloud conflict recovery

Private projects use optimistic generation checks. A save includes the last
generation returned by the project API; a `409` response means another browser
or device wrote the project first. The client raises a typed
`CloudConflictError` carrying the project id and attempted generation. It
never replaces the local document or silently retries the write.

The editor keeps the current local edits available and offers two explicit
choices:

* **Save as new cloud project** writes the current local document with a new
  project id, preserving both versions.
* **Reload latest cloud copy** asks for confirmation, opens the remote project
  through the normal validated import path, and updates the local cloud link to
  the returned generation. The current local edits are replaced only after the
  user confirms; malformed, unauthorized or failed responses leave them
  untouched.

The remote document is decoded and rendered before installation, just like a
project-file import. Local autosave then records the new cloud generation in
the bookmark. Anonymous drafts never use this path, and cloud conflict
metadata is not included in portable project files.

Pure tests validate typed conflict identity and fail-closed response parsing.
The signed-in desktop acceptance flow exercises an update conflict, confirmation
and remote reload, then saves a separate copy. Mobile coverage uses the same
accessible controls in the responsive account/project suite.
