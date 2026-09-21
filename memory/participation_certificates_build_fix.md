---
name: participation-certificates-build-fix
description: Build fixes applied to participation_certificates.rs
metadata:
  type: feedback
---

## All fixes applied to `backend/src/routes/participation_certificates.rs`

### Original Issue
The Docker build failed during `cargo build --release` with 13 compilation errors in `backend/src/routes/participation_certificates.rs` after the DOCX template parsing feature was added (commit f7f941f).

### Fixes Applied

#### 1. Treat `data_dir` as filesystem path ✅
- **Problem**: `Config::data_dir` is a `String`, so `.join()` couldn't be called directly
- **Fix**: Wrapped all occurrences with `FsPath::new(&state.config.data_dir).join(...)`
- **Locations**: Lines 165, 310, 685, 718, 746, 788, 821, 849

#### 2. Fix template file loading ✅
- **Problem**: `tokio::fs::read()` returns `Result<Vec<u8>>`, so `.ok().flatten()` was invalid
- **Fix**: Changed to `.await.ok()`
- **Location**: Line 312

#### 3. Make DOCX ZIP reader seekable ✅
- **Problem**: `zip::ZipArchive::new` requires `Read + Seek`; `&[u8]` doesn't implement `Seek`
- **Fix**: Added `Cursor::new(template_data)` and replaced `unwrap_or_else` with proper error handling
- **Locations**: Import at line 9, usage at line 186

#### 4. Correct malformed string replacement ✅
- **Problem**: Invalid Rust `.replace(""", "\"")` in XML text processing
- **Fix**: Replaced with proper XML entity decoding: `"`, `&`, `<`, `>`
- **Locations**: Lines 259-263

#### 5. Use correct PDF API method ✅
- **Problem**: `PdfBuilder` has no `image()` method; correct method is `signature_image()`
- **Fix**: Changed `.image(...)` to `.signature_image(...)`
- **Location**: Line 439

#### 6. Pass `state` by reference ✅
- **Problem**: `generate_certificate_pdf` expects `&AppState` but was passed `state` by value
- **Fix**: Changed to `generate_certificate_pdf(&state, &certificate)`
- **Location**: Line 531

#### 7. Fix routing imports ✅
- **Problem**: Router uses `.get().post().put().delete()` chains but only imported `routing::get`
- **Fix**: Changed to `routing::{delete, get, post, put}`
- **Location**: Line 4

#### 8. DOCX template rendering enhancement ✅
- **Enhancement**: Added actual DOCX template rendering via LibreOffice conversion
- **Added functions**:
  - `fill_docx_template()`: Fills DOCX content controls with certificate data
  - `fill_sdt_content()`: Helper to replace text in content controls
  - `docx_to_pdf()`: Converts filled DOCX to PDF using LibreOffice (requires Dockerfile change)
- **Dependencies added**: `tempfile` (to Cargo.toml), LibreOffice (to Dockerfile)
- **Usage**: When template exists, fills content controls and converts to PDF; falls back to PDF builder when no template

### Key Lesson
When route handlers chain multiple HTTP method helpers (e.g. `.route("/template", post(...).get(...).delete(...))`), all imported helpers must be present — `routing::get` alone is insufficient.

### How to Verify
```bash
cd backend
SQLX_OFFLINE=true cargo check
# Then rerun the Docker build
```
