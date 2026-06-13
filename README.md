# FeuerwehrHub

**Die modulare Verwaltungsplattform für Freiwillige Feuerwehren — selbst gehostet, kostenlos, open source.**

FeuerwehrHub entsteht ehrenamtlich und wächst mit den Bedürfnissen der Wehr.
Jedes Modul kann einzeln aktiviert werden — eine Wehr ohne Jugendfeuerwehr aktiviert das JF-Modul einfach nicht.

> **Aktuelle Version: v1.3.2**

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Ko-Fi](https://img.shields.io/badge/Ko--Fi-Unterst%C3%BCtzen-FF5E5B?style=flat&logo=ko-fi&logoColor=white)](https://ko-fi.com/obrero2023)

---

## Was kann FeuerwehrHub?

### Heute verfügbar

| Modul | Beschreibung |
|-------|-------------|
| 🏠 **Startseite** | Ankündigungen der Wehrführung, Modul-Kacheln, Fahrzeug- & Qualifikations-Ampel |
| 🏪 **Lager** | Beschaffungsaufträge, Bestellübersicht, Artikelstamm mit Prüffristen-Ampel, PDF-Export (generisch oder eigene Vorlage), CSV-Export, Unterschrift im PDF |
| 👤 **Mein Bereich** | Eigenes Profil, Kontaktdaten & Notfallkontakte, Qualifikationen & Ablaufdaten (Ampel), Ausrüstung, Ehrungen, Termine, iCal-Feed, Dienstausweis-QR, Datenschutz-Export (Art. 15 DSGVO) |
| 👥 **Personal** | Mitgliederstamm, Qualifikationen (inkl. Gesundheitsdaten-Kennzeichnung), Ausrüstung, Ehrungen, Anwesenheitstracking, Terminverwaltung, Notfallkontakte — für Wehrleiter |
| 📅 **Termine & Kalender** | Terminverwaltung mit Teilnehmer-RSVP, iCal-Feed-Export pro Mitglied (automatisch nach 1 Jahr erneuern), Zeiterfassung mit Stechuhr-Kiosk |
| 🔒 **Benutzerverwaltung** | Rollen, 2FA (TOTP) mit QR-Code, Admin-Reset bei verlorenem Handy, Passwortänderung (min. 16 Zeichen), Dienstausweis-QR, vollständiges Audit-Log, Kontolöschung (Art. 17 DSGVO) |
| ⚙️ **Admin-Panel** | Module aktivieren/deaktivieren, SMTP-Konfiguration, Datenschutz-Kontaktdaten, Benutzerverwaltung |
| 👥 **Feuerwehrrollen** | WL, ZF, GF, TF, TM, Gerätewart, JFW als anpassbare Vorlagen mit Modulzugriffen |
| 🚒 **Fahrzeuge** | Stammdaten, Fristen & Prüfungen (Ampel), Fahrtenbuch mit km-Übertrag, Tankprotokoll, Störungsmeldungen, Geräte/Beladung, Checklisten |
| 🚒 **Einsatzberichte** | Einsätze digital erfassen, Fahrzeuge & Personal zuordnen, Personalzeiten je Einsatz, Anhänge (Fotos/Dokumente), konfigurierbare Einsatztypen |
| 📓 **Dienstberichte** | Übungsbuch & Dienstberichte mit Kategorie, Teilnehmerliste, Dienstleiter und PDF-Export |
| 🔌 **Integrationen** | DIVERA 24/7 Webhook + Polling-Import, Alamos FE2 Webhook — automatischer Einsatz-Import |
| 📊 **Statistik & Export** | Einsatzstatistik als CSV oder PDF (Monatsaufschlüsselung), Ausrüstungs-PDF-Ausgabebeleg |
| 🏛️ **Vereinsverwaltung** | Mitglieder, Finanzen, Veranstaltungen mit RSVP & CSV-Export, Protokolle, Schriftverkehr, Inventar, Schlüsselverwaltung |
| 🔐 **Datenschutz (DSGVO)** | Kontaktdaten AES-256-GCM-verschlüsselt, Gesundheitsdaten-Kennzeichnung (Art. 9), Audit-Log, JSON-Datenexport, generierte Datenschutzerklärung |

### In Planung

| Modul | Zielgruppe |
|-------|-----------|
| 🧒 **Jugendfeuerwehr** | JFW — Mitglieder, Termine, Wettbewerbe |
| ✉️ **E-Mail-Benachrichtigungen** | Alle — Terminerinnerungen, Statusupdates (SMTP bereits konfigurierbar) |

---

## DSGVO-Compliance

FeuerwehrHub wurde mit Blick auf die Anforderungen der DSGVO entwickelt. Folgende Maßnahmen sind umgesetzt:

| Anforderung | Umsetzung |
|---|---|
| Art. 5 — Datensparsamkeit | Nur für den Feuerwehrbetrieb notwendige Daten; modularer Aufbau |
| Art. 9 — Gesundheitsdaten | Qualifikationen mit medizinischem Bezug (Atemschutz G26/3) werden als solche gekennzeichnet und Zugriff eingeschränkt |
| Art. 15 — Auskunftsrecht | JSON-Export aller eigenen Daten unter „Mein Bereich → Datenschutz" |
| Art. 17 — Löschung | `DELETE /api/admin/users/:id` mit vollständiger DB-Kaskade |
| Art. 32 — Technische Maßnahmen | Kontaktdaten AES-256-GCM verschlüsselt, bcrypt-Passworthashing, TOTP, Rate-Limiting, Audit-Log |
| Art. 13 — Informationspflicht | Generierte Datenschutzerklärung unter `#/datenschutz` (öffentlich) |

Die **Datenschutzerklärung** wird automatisch aus den Organisationseinstellungen generiert und ist ohne Login unter `#/datenschutz` erreichbar. Admins pflegen die Kontaktdaten im **Admin-Panel → Konfiguration**.

> **Hinweis:** FeuerwehrHub ist ein Werkzeug — keine Rechtsberatung. Die generierte Datenschutzerklärung sollte durch einen Datenschutzbeauftragten oder Rechtsanwalt geprüft werden.

---

## Rollensystem

Zweistufiges Rechtesystem: Dienstgrad + optionale Zusatzfunktionen.

**Dienstgrade** (hierarchisch, einer pro Person):
```
Admin (System)
└── Wehrleiter
      ├── Zugführer (ZF)
      │     └── Gruppenführer (GF)
      │           └── Truppführer (TF)
      │                 └── Truppmann (TM)
      ├── Gerätewart
      └── Jugendfeuerwehrwart
```

**Zusatzfunktionen** ergänzen den Dienstgrad mit Modulzugriffen (z.B. Kassenwart, IT-Beauftragter).
Rollen werden als Vorlagen mitgeliefert und können angepasst werden.

---

## Selbst hosten — so einfach wie möglich

FeuerwehrHub läuft per Docker Compose mit fertigen Images von GitHub Container Registry.
Kein Compiler, kein Build-Schritt, kein Cloud-Account — deine Daten bleiben bei dir.

### Voraussetzungen

- [Docker](https://www.docker.com/) & Docker Compose
- PostgreSQL-Datenbank (lokal, im Netzwerk, oder inklusive per Standalone-Modus)
- Optional: Reverse Proxy (z.B. nginx Proxy Manager) für eigene Domain + HTTPS

### Schnellstart

**Mit PostgreSQL (Standard, empfohlen für Einsteiger):**
```bash
git clone https://github.com/obrero2023/FeuerwehrHub_2.git
cd FeuerwehrHub && cp .env.example .env
# DB_PASSWORD, JWT_SECRET, ENCRYPTION_KEY und FF_NAME in .env anpassen
docker compose up -d
```

**Externe Datenbank (eigener PostgreSQL-Server):**
```bash
git clone https://github.com/obrero2023/FeuerwehrHub_2.git
cd FeuerwehrHub && cp .env.example .env
# DB_HOST, DB_PASSWORD, JWT_SECRET, ENCRYPTION_KEY und FF_NAME in .env anpassen
# Den postgres-Service aus docker-compose.yml entfernen
docker compose up -d
```

Die App ist danach unter `http://DEINE-IP:8080` erreichbar.
Beim ersten Start öffnet sich automatisch der Einrichtungs-Assistent.

### Konfiguration (`.env`)

```env
# Datenbank
DB_HOST=192.168.1.100
DB_PORT=5432
DB_NAME=feuerwehrhub
DB_USER=feuerwehrhub_user
DB_PASSWORD=sicheres-passwort

# Anwendung
APP_PORT=3000
JWT_SECRET=langer-zufaelliger-string        # openssl rand -hex 64
ENCRYPTION_KEY=anderer-zufaelliger-string   # openssl rand -hex 64  (erforderlich ab v1.2.0)

# Feuerwehr
FF_NAME=Freiwillige Feuerwehr Musterstadt

# Sicherheit
FRONTEND_URL=http://192.168.1.10:8080   # URL des Frontends (für CORS)
LOGIN_MAX_ATTEMPTS=5                     # Fehlversuche bis Account-Sperre
LOCKOUT_MINUTES=15                       # Sperrdauer in Minuten
```

> Die `.env`-Datei enthält sensible Daten — niemals einchecken!  
> `JWT_SECRET` und `ENCRYPTION_KEY` müssen **unterschiedlich** sein.

---

## Erster Start

1. App öffnen → Einrichtungs-Assistent startet automatisch
2. **Schritt 1:** Feuerwehrname, Admin-Benutzername & Passwort (mind. 16 Zeichen, 1 Großbuchstabe, 1 Zahl)
3. **Schritt 2:** Datenschutz-Kontaktdaten eintragen (Verantwortliche Person, E-Mail) — direkt im Wizard oder später im Admin-Panel → Konfiguration
4. Benutzer anlegen und Rollen zuweisen
5. Gewünschte Module aktivieren — fertig

> **Hinweis:** Solange Verantwortliche Person und E-Mail fehlen, erscheint für Admins ein Warnhinweis auf der Startseite und im Admin-Panel → Konfiguration.

---

## Sicherheit

FeuerwehrHub wurde mit einem Fokus auf Datenschutz und Sicherheit entwickelt:

| Maßnahme | Details |
|---|---|
| **Verschlüsselung** | Kontaktdaten mit AES-256-GCM; Schlüsselableitung via HKDF-SHA256 (RFC 5869) |
| **Passwort-Hashing** | bcrypt (DEFAULT_COST) — Klartext-Passwörter werden nie gespeichert |
| **2FA** | TOTP (RFC 6238) mit Authenticator-App; Admin-Reset möglich |
| **JWT** | HttpOnly-Cookie, Invalidierung bei Rechteänderungen, Token-Versionierung |
| **Rate-Limiting** | Global (300/min), Login (10/min), Badge-Code (10 Fehlversuche/5min pro Code) |
| **Audit-Log** | Alle Zugriffe auf personenbezogene Daten werden protokolliert |
| **HTTP-Header** | HSTS, CSP, X-Frame-Options: DENY, nosniff, Referrer-Policy |
| **Container** | read-only Filesystem, no-new-privileges, cap_drop: ALL, kein Docker-Socket-Zugriff |

---

## Tech Stack

| Schicht | Technologie |
|---------|------------|
| Backend | [Rust](https://www.rust-lang.org/) + [Axum](https://github.com/tokio-rs/axum) |
| Frontend | Vanilla JavaScript + SCSS |
| Datenbank | PostgreSQL (Migrationen via sqlx) |
| Deployment | Docker Compose |
| Auth | JWT (HttpOnly-Cookie) + TOTP (RFC 6238) |
| Verschlüsselung | AES-256-GCM + HKDF-SHA256 (RFC 5869) |

---

## Updates

Neue Version verfügbar? Einfach Images ziehen und neu starten — kein Build nötig:

```bash
docker compose pull
docker compose up -d
```

Datenbankmigrationen laufen beim Start automatisch durch.  
Neue Versionen werden als [GitHub Releases](https://github.com/obrero2023/FeuerwehrHub_2/releases) veröffentlicht.  
**Empfehlung:** Im Repo auf **Watch → Custom → Releases** klicken, um E-Mail-Benachrichtigungen zu erhalten.

---

## Datenbankbackup

Für regelmäßige Backups empfehlen wir einen Cronjob mit `pg_dump`:

```bash
# Einmalig manuell (bei externer Datenbank):
pg_dump -h DB_HOST -U DB_USER DB_NAME > backup_$(date +%F).sql

# Oder direkt im Postgres-Container (Standalone-Modus):
docker exec feuerwehrhub-postgres-1 pg_dump -U feuerwehrhub feuerwehrhub > backup_$(date +%F).sql
```

**Empfehlung:** Backups täglich per Cronjob erstellen und auf einem separaten Speichermedium aufbewahren.

---

## Entwicklung

```bash
# Backend
cd backend
cargo run

# Frontend
cd frontend
npm run dev
```

Datenbankmigrationen laufen beim Start automatisch durch (`sqlx::migrate!`).

### Lokal mit Docker bauen (statt GHCR-Images)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

---

## Lizenz

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

FeuerwehrHub steht unter der **GNU Affero General Public License v3 (AGPL v3)** — siehe [LICENSE](LICENSE).

**Was das bedeutet:**
- Kostenlose Nutzung und Selbst-Hosting für alle ✅
- Änderungen am Code müssen ebenfalls unter AGPL v3 veröffentlicht werden ✅
- Wer FeuerwehrHub als Dienst anbietet, muss den vollständigen Quellcode offenlegen ✅
- Eine Umbenennung und der Verkauf als eigenes Produkt ist **nicht erlaubt** ❌

&copy; 2026 Patrick Faust

---

## Mitwirken

Issues und Pull Requests sind willkommen.
Dieses Projekt entsteht ehrenamtlich — für Feuerwehren, von Feuerwehrmenschen.

---

## Unterstützen ☕

FeuerwehrHub ist ein privates Open-Source-Projekt, das in der Freizeit entsteht — für Feuerwehren, von einem Feuerwehrmitglied.
Wer das Projekt unterstützen möchte, kann das gerne über Ko-Fi tun:

[![Ko-Fi](https://img.shields.io/badge/Ko--Fi-Unterst%C3%BCtzen-FF5E5B?style=flat&logo=ko-fi&logoColor=white)](https://ko-fi.com/obrero2023)

---

## Copyright & Kontakt

&copy; 2026 Patrick Faust

Fragen, Feedback oder Kontakt:
**webmaster@feuerwehrhub.de**
