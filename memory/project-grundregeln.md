---
name: project-grundregeln
description: Grundregeln für das FeuerwehrHub_2 Projekt (Frontend & Backend)
metadata:
  type: project
---

# Grundregeln FeuerwehrHub_2

## Projekt-Übersicht
- **Name**: FeuerwehrHub_2 — modulare Verwaltungsplattform für Freiwillige Feuerwehren (selbst gehostet, kostenlos, Open Source, AGPL v3)
- **Tech-Stack**: Rust + Axum (Backend), Vanilla JS + SCSS (Frontend), PostgreSQL (DB)
- **Arbeitsverzeichnis**: `C:\Users\Christian\FeuerwehrHub_2`
- **Hauptzweig für PRs**: `main` (aktueller lokaler Zweig: `change_mobile_version`)

## Frontend-Grundregeln
- **Responsives Design**: Das Frontend muss für alle Geräte funktionieren — Handy, Tablet und PC.
- **Einfach & schlicht**: Keine überflüssige Komplexität; klare, bedienfreundliche Oberfläche.
- **Mobile Eingaben**: Bei Eingaben von Daten oder Uhrzeiten muss auf der mobilen Ansicht immer ein Kalender- oder Zeitpicker angezeigt werden (nicht nur ein Textfeld).
- **Progressive Ergänzung**: Desktop-Darstellung darf erweitert sein, darf aber niemals auf die Funktionalität der mobilen Ansicht verzichten.

## Backend-Grundregeln
- **Persistente Speicherung**: Alle relevanten Daten müssen in der PostgreSQL-Datenbank (Migrationen unter `migrations/`) dauerhaft gespeichert werden — nicht nur in Session- oder Laufzeitvariablen.
- **Session-unabhängig**: Keine Abhängigkeiten von User-Sessions. Jede Operation muss stateless gegenüber der Serverseite funktionieren (JWT-basiert, HttpOnly-Cookie); keine Server-seitigen Session-Daten benötigen.
- **Sicherheitsstandards**: Immer auf aktuell gültige Sicherheitsstandards setzen (siehe unten).

## Sicherheitsstandards
- **Passwort-Hashing**: bcrypt (DEFAULT_COST).
- **JWT**: HttpOnly-Cookie, min. 32 Zeichen `JWT_SECRET`, Ablauf `JWT_EXPIRY_HOURS` (Standard 8).
- **Token-Versionierung**: `token_version` in DB; bei Rollen-/Berechtigungsänderungen inkrementieren → Invalidierung aller Sessions.
- **Rate Limiting**: governor-Crate (global 300/min, Login 10/min, Badge 10/5min).
- **Eingabe-Validierung**: `validator`-Crate für alle Request-Bodies.
- **HTTP-Sicherheits-Header**: HSTS, CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`.
- **DSGVO**: AES-256-GCM-verschlüsselte Kontaktdaten (HKDF-SHA256), Audit-Log, JSON-Datensatzexport (Art. 15), Kontolöschung (Art. 17).
- **Secrets**: `JWT_SECRET` ≠ `ENCRYPTION_KEY`, beide ≥ 32 Zeichen.

## Datei- und Modulstruktur
- Backend: `backend/src/main.rs`, `config.rs`, `crypto.rs`, `audit.rs`, `pdf.rs`, `auth/`, `routes/<modul>.rs`.
- Frontend: `frontend/src/js/main.js`, `api.js`, `router.js`, `shell.js`, `pages/<seite>.js`.
- Migrationen: `migrations/001_*.sql` … aktuell bis `070_booking_audit.sql` (keine `07x_lehrgaenge`-Migrationen im Repo; Lehrgangsverwaltung wurde mehrfach hinzinzugefügt und widerrufen — `3e64901`, `448cb6f`).
