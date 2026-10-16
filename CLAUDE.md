# CLAUDE.md - FeuerwehrHub Projekt Anweisungen

## Token-Nutzung anzeigen

Am Ende jeder Ausgabe sollen die **Eingabe-Tokens** (input tokens) und **Ausgabe-Tokens** (output tokens), die für die jeweilige Antwort verwendet wurden, angezeigt werden.

Format:
```
---
Token Usage: Input: X | Output: Y | Total: Z | Kosten: Input: $A | Output: $B | Gesamt: $C
```

Dabei gelten folgende Stückpreise (Stand: 2026-10):
- Eingabe-Tokens: 4 $ pro 1 Mio. Tokens → `A = X × 4 / 1.000.000`
- Ausgabe-Tokens: 20 $ pro 1 Mio. Tokens → `B = Y × 20 / 1.000.000`
- Gesamtkosten: `C = A + B`

---

## Projekt-Übersicht

**FeuerwehrHub** — Modulares Verwaltungssystem für Freiwillige Feuerwehren (selbst gehostet, AGPL v3).

- **Backend**: Rust + Axum (tokio async), PostgreSQL via sqlx
- **Frontend**: Vanilla JS + SCSS, Vite-basiert
- **Deployment**: Docker Compose mit GHCR-Images
- **Auth**: JWT (HttpOnly Cookie) + TOTP 2FA (RFC 6238), bcrypt Password Hashing
- **DSGVO**: GDPR-konform — AES-256-GCM verschlüsselte Kontakte, Audit-Log, JSON-Export, Kontolöschung

## Befehle (häufig genutzt)

### Backend-Entwicklung

```bash
# Backend starten (Cargo)
cd backend
cargo run

# Backend tests ausführen
cargo test

# Backend build (Release)
cargo build --release

# Migrationen direkt ausführen (ohne Docker)
cd backend
sqlx migrate run
```

### Frontend-Entwicklung

```bash
# Frontend dev server starten (Vite, Port 5173)
cd frontend
npm run dev

# Frontend build produzieren
npm run build

# Frontend preview starten
npm run preview
```

### Docker & Compose

```bash
# Volle Umgebung starten (Backend + Frontend + PostgreSQL)
docker compose up -d

# Mit Entwicklungs-Overrides (lokal gebaute Images)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build

# Images neu ziehen und neu starten
docker compose pull
docker compose up -d

# Container stoppen
docker compose down

# Logs anzeigen
docker compose logs -f
```

### Datenbank

```bash
# Migrationen anwenden
docker exec <container> sqlx migrate run

# Backup erstellen (externer PostgreSQL)
pg_dump -h DB_HOST -U DB_USER DB_NAME > backup_$(date +%F).sql

# Backup einspielen
psql -h DB_HOST -U DB_USER DB_NAME < backup_2024-01-01.sql
```

### Wichtige Umgebungvariablen (.env)

Siehe `README.md` für die vollständige `.env`-Referenz. Wichtigste Variablen:

- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- `APP_PORT` (Standard: 3000)
- `JWT_SECRET` (mind. 32 Zeichen, `openssl rand -hex 64`)
- `ENCRYPTION_KEY` (muss von `JWT_SECRET` abweichen, mind. 32 Zeichen)
- `FF_NAME` (z.B. "Freiwillige Feuerwehr")
- `FRONTEND_URL` (Origin für CORS, ohne Pfad/Query/Fragment)
- `LOGIN_MAX_ATTEMPTS` (Standard: 5)
- `LOCKOUT_MINUTES` (Standard: 15)
- `JWT_EXPIRY_HOURS` (Standard: 8)
- `DATA_DIR` (Standard: /data)

## High-Level Code-Architektur

### Backend (Rust/Axum)

- **`backend/src/main.rs`** — App-Setup, Routen, Middleware (CORS, Security-Header, Rate-Limiting)
- **`backend/src/config.rs`** — Environment-basierte Konfiguration mit Validierung
- **`backend/src/auth/`** — JWT, TOTP, Rate-Limiting, Middleware (`require_auth`, `require_admin`, `require_module`)
- **`backend/src/routes/`** — Eine Datei pro Modul (admin, articles, auth, calendar, incidents, lehrgaenge, orders, personal, vehicles, verein, etc.)
- **`backend/src/crypto.rs`** — AES-256-GCM Verschlüsselung mit HKDF-SHA256 Key-Derivation
- **`backend/src/audit.rs`** — Audit-Logging
- **`backend/src/pdf.rs`** — PDF-Generierung (printpdf)

Frontend (Vanilla JS + SCSS)

- **`frontend/src/js/api.js`** — Zentrale API-Client-Funktion (fetch mit cookies)
- **`frontend/src/js/router.js`** — Hash-basiertes Routing mit Permission-Checks
- **`frontend/src/js/shell.js`** — App-Navigation und Seiten-Layout
- **`frontend/src/js/pages/` — Eine JS-Datei pro Seite (admin, lehrgaenge, vehicles, incidents, etc.)
- **`frontend/src/js/router.js`** — Hash-basiertes Routing mit Permission-Checks
- **`frontend/src/js/api.js`** — Zentrale API-Client-Funktion

Module (mit Route-Prefix):

| Modul | Route | Permission |
|-------|-------|------------|
| Lager (inventory) | /api/articles, /api/orders, /api/storage-locations | lager / lager.read / lager.approve |
| Personal | /api/personal | personal |
| Fahrzeuge (vehicles) | /api/vehicles | fahrzeuge |
| Einsatzberichte (incidents) | /api/einsatzberichte | einsatzberichte / einsatzberichte.read |
| Lehrgangsverwaltung (courses) | /api/lehrgaenge | lehrgangsverwaltung / lehrgangsverwaltung.verwalten |
| Fahrzeugbuchung (vehicle bookings) | /api/vehicle-bookings | fahrzeugbuchung / fahrzeugbuchung.verwalten |
| Verein (club) | /api/verein | verein |
| Intranet | /api/intranet | intranet |
| Termine (calendar) | /api/calendar, /api/termine | — |
| Timeclock | /api/timeclock, /api/clock | — |
| Admin | /api/admin | admin (superuser für einige ops) |
| Settings/Auth | /api/settings, /api/auth | — |

### Zwei-Tier Auth-System

- **Service role**: admin / user / superuser
- **Granulare Berechtigungen**: z.B. `lehrgangsverwaltung.verwalten`, `lager.read`
- **Berechtigungs-Hierarchie**: `lager.read` gewährt auch `lager` und `lager.approve`
- **Token-Versionierung**: `token_version` Spalte invalidiert alle Sessions bei Rolle/Permission-Änderungen
- **Audit**: Jede Mutation loggt in `audit_log` Tabelle mit user, action, entity, entity_id, details

## Wichtige Design-Patterns

### Modul-Middleware (`require_module`)

Jede Module-Route wird mit `require_module("modul_name")` gesichert. Die Middleware prüft:

1. Admins und Superuser haben immer Zugriff
2. Für Module mit Hierarchie (z.B. `lager`): Jede höhere Permission reicht aus
3. Für Module ohne Hierarchie: Exakter Permission-Match

Beispiel:
- `require_module("lager")` — User braucht `lager` ODER `lager.approve`
- `require_module("lehrgangsverwaltung")` — User braucht `lehrgangsverwaltung` ODER `lehrgangsverwaltung.verwalten`

### Permission-Auflösung in `auth/middleware.rs`

Die Funktion `accepted_permissions(module)` gibt die akzeptierten Permissions für ein Modul zurück:

```rust
fn accepted_permissions(module: &str) -> Option<Vec<&'static str>> {
    match module {
        "lager.read"              => Some(vec!["lager.read", "lager", "lager.approve"]),
        "lager"                   => Some(vec!["lager", "lager.approve"]),
        "einsatzberichte.read"    => Some(vec!["einsatzberichte.read", "einsatzberichte", "einsatzberichte.approve"]),
        "einsatzberichte"         => Some(vec!["einsatzberichte", "einsatzberichte.approve"]),
        "fahrzeugbuchung"         => Some(vec!["fahrzeugbuchung", "fahrzeugbuchung.verwalten"]),
        "lehrgangsverwaltung"     => Some(vec!["lehrgangsverwaltung", "lehrgangsverwaltung.verwalten"]),
        _                         => None,
    }
}
```

### Status-Flow für Lehrgänge

- Standard-Status bei Erstellung: `"geplant"`
- Validierung: `end_datum > start_datum`, `anmeldeschluss <= start_datum`
- Status-Änderungen erfordern Admin/Verwalter
- Prüfung auf Duplikate, max_teilnehmer (falls back zu Waitlist-Message)

## Entwicklung workflow

1. **Branch erstellen**: `git checkout -b <name>` von der `change_course_exchange_4` oder `main` Branch
2. **Lokale Entwicklung**: Backend (`cargo run`) und Frontend (`npm run dev`) gleichzeitig starten
3. **Migrationen**: laufen automatisch beim Start via `sqlx::migrate!`
4. **Tests**: `cargo test` im Backend-Verzeichnis ausführen
5. **Commit Messages**: Mit folgender Attribution beenden:
   ```
   Co-Authored-By: Claude Code <noreply@anthropic.com>
   ```
6. **Pull Requests**: Auf `main` Branch zielen, Vorlage beachten

## Sicherheit

### Passwort-Regeln (validiert via `validator` crate)

- Mind. 16 Zeichen
- Mind. 1 Großbuchstabe
- Mind. 1 Kleinbuchstabe
- Mind. 1 Zahl oder Sonderzeichen

### JWT & Verschlüsselung

- `JWT_SECRET` und `ENCRYPTION_KEY` müssen unterschiedlich sein, beide mind. 32 Zeichen
- Standardwerte (`change-this-to-...`) verhindern den Start — `.env` setzen!
- Token-Versionierung invalidiert alle Sessions bei Änderungen

### Container-Security

- read-only Filesystem, `no-new-privileges`, `cap_drop: ALL`
- Kein Docker-Socket-Zugriff im Production-Container
- Datenbank nicht im Container (extern bevorzugt)

### HTTP-Header (automatisch gesetzt)

- HSTS: `max-age=31536000; includeSubDomains; preload`
- CSP: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'`
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- Referrer-Policy: strict-origin-when-cross-origin

## Module-spezifische Hinweise

### Lehrgangsverwaltung (aktuelle Branch-Focus: `change_course_exchange_4`)

- **Backend**: `routes/lehrgaenge.rs` — CR für Kurse (`lehrgaenge` table) + Registrierungen (`lehrgang_anmeldungen`)
- **Status**: Standard `"geplant"` bei Erstellung
- **Validierung**: `end_datum > start_datum`, `anmeldeschluss <= start_datum`
- **Registrierung**: Status-Check (`offen/geplant`), Doppelte Prüfung, max_teilnehmer (falls back zu Waitlist-Message)
- **Status-Änderungen**: Erfordern Admin/Verwalter
- **Frontend**: `frontend/src/js/pages/lehrgaenge.js`
- **Migrationen**: 071_lehrgaenge.sql, 072_lehrgang_anmeldungen.sql, 073_lehrgangsverwaltung_module.sql, 074_lehrgangsverwaltung_roles.sql, 075_lehrgangsarten.sql

### Aktuelle Git-History (Branch: `change_course_exchange_4`)

- `6c12f7f add`
- `b07de8c add`
- `3e64901 Revert "feat: Lehrgangsverwaltung module"`
- `448cb6f feat: Lehrgangsverwaltung module (re-added)`
- `2893aab Merge PR #46: change_vehicle_reservation_v2_2`
- `b596eed Fix migration 077: rename to 082 to resolve sqlx modification conflict`
- `4803e79 feat: lehrgangsverwaltung.admin permission (Dienstgrad role, not Zusatzfunktion)`

### Frontend-Routing

- Hash-basiert (`#/route`)
- Permission-Checks pro Route (Array von erforderlichen Permissions)
- Admin/Superuser haben bei allen Permissions Zugriff
- Dynamische Scan-Route (tokenbasiert): `#/scan/<token>`

## DSGVO-Endpunkte

- `GET /api/admin/users/:id/export` — Art. 15 Daten-Export (JSON)
- `DELETE /api/admin/users/:id` — Art. 17 Kontolöschung (Cascade)
- Frontend: `Mein Bereich → Datenschutz` — eigene Daten-Export

## Lizenz

AGPL v3 — siehe LICENSE-Datei.

Dieses Projekt ist kostenlos und Open Source — Änderungen müssen ebenfalls unter AGPL v3 veröffentlicht werden.