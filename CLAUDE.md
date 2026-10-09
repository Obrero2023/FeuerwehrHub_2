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