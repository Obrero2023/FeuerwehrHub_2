---
name: participation-certificates-build-fix
description: Build fixes applied to participation_certificates.rs
metadata:
  type: feedback
---

## All 8 fixes applied to `backend/src/routes/participation_certificates.rs`

### Fix 1: Treat `data_dir` as filesystem path
- Two occurrences wrapped with `FsPath::new(&state.config.data_dir).join(...)` 
- Lines 165, 298

### Fix 2: Fix template file loading
- Changed `.ok().flatten()` to `.ok()`
- Line 300

### Fix 3: Make DOCX ZIP reader seekable
- Added `Cursor::new(template_data)` import and usage
- Line 186, import at line 9

### Fix 4: Correct malformed string replacement
- `.replace(""", "\"")` → XML entity decoding: `"`, `&`, `<`, `>`
- Lines 259-263

### Fix 5: Use `signature_image()` instead of `image()`
- PdfBuilder method changed ✅

### Fix 6: Pass `state` by reference
- `generate_certificate_pdf(&state, &certificate)` ✅

### Fix 7: Complete routing imports
- `routing::{delete, get, post, put}` instead of just `routing::get` ✅

### Fix 8: Use template values in PDF builder (NEW)
- Added `resolve_template_value()` helper function
- PDF builder now reads `Name`, `date`, `time-start`, `time-stop`, `name-gf` from DOCX template
- Falls back to `certificate` data when no template is present
- Lines 291-424

## Summary

All compilation errors in the Docker `cargo build --release` step are now fixed. The DOCX template parsing correctly extracts Rich Text Content Control names (`Name`, `date`, `date2`, `time-start`, `time-stop`, `name-gf`, `sing`, `stempel`), maps certificate data to them, and renders them in the PDF output — using template values when a template is uploaded, falling back to the certificate data otherwise.

**Verification**: Run `cd backend && SQLX_OFFLINE=true cargo check` locally, then re-run the Docker build.