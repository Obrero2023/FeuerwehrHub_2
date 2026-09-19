---
name: participation-certificates-build-fix
description: Build fixes applied to participation_certificates.rs
metadata:
  type: feedback
---

## What happened

The Docker build failed during `cargo build --release` in `backend/src/routes/participation_certificates.rs` due to multiple compilation errors introduced in the DOCX template parsing feature (commit f7f941f).

## Fixes applied (7 total)

1. **`data_dir` as filesystem path** — `Config::data_dir` is a `String`, so `.join()` was called on it directly (invalid). Wrapped both occurrences with `FsPath::new(&state.config.data_dir)`.
2. **Removed invalid `.flatten()`** — `tokio::fs::read()` returns `Result<Vec<u8>>`, so `.ok().flatten()` was invalid. Changed to `.ok()`.
3. **`Cursor` for ZIP reader** — `zip::ZipArchive::new` requires `Read + Seek`. `&[u8]` doesn't implement `Seek`. Wrapped with `Cursor::new(template_data)` and replaced `unwrap_or_else`/`unwrap` calls with proper `match`/`is_err` error handling.
4. **Malformed string replacement** — `.replace(""", "\"")` was invalid Rust. Replaced the broken chain with proper XML entity decoding (`&quot;`, `&amp;`, `&lt;`, `&gt;`).
5. **PDF API method** — `PdfBuilder` has no `image()` method; the correct method is `signature_image()`.
6. **Pass `state` by reference** — `generate_certificate_pdf` expects `&AppState`; the handler was passing `state` by value.
7. **Routing imports** — The router uses `.get().post().put().delete()` chains. Removed the `delete, get, post, put` imports in favor of `routing::get` only, which was wrong. The correct import is `routing::{delete, get, post, put}`.

## Key lesson

When a route handler chains multiple HTTP method helpers (e.g. `.route("/template", post(...).get(...).delete(...))`), all imported helpers must be present — `routing::get` alone is insufficient.

## How to verify

```bash
cd backend
SQLX_OFFLINE=true cargo check
# then rerun the Docker build
```