---
title: Agenten-Wissensbasis — Index
scope: Navigation
last_verified: 2026-06-15
---

# docs/agents/ — Wissensbasis für KI-Agenten

Strukturiertes Detailwissen zum Projekt **34a Master Webapp**. Einstieg ist immer
[`../../AGENTS.md`](../../AGENTS.md); diese Dateien vertiefen einzelne Themen (Progressive
Disclosure). Jede Datei hat YAML-Frontmatter (`title`, `scope`, `last_verified`) zur Navigation.

| # | Datei | Wann lesen |
|---|-------|------------|
| 01 | [01-architektur.md](01-architektur.md) | Überblick verschaffen: Stack, `src/`-Layout, Datenfluss |
| 02 | [02-routing-und-auth.md](02-routing-und-auth.md) | Routing-, Auth-, Login-/Reset-Änderungen |
| 03 | [03-datenmodell.md](03-datenmodell.md) | Datenbank-/Typen-Arbeit |
| 04 | [04-edge-functions.md](04-edge-functions.md) | Serverseitige Logik / Edge Functions |
| 05 | [05-payments-stripe.md](05-payments-stripe.md) | Bezahlung, Premium, Subscriptions |
| 06 | [06-skripte-und-pipelines.md](06-skripte-und-pipelines.md) | Inhalts-Pipelines, Admin-Skripte |
| 07 | [07-konventionen.md](07-konventionen.md) | Code schreiben, der zum Projekt passt |
| 08 | [08-testing.md](08-testing.md) | Tests schreiben/ausführen |
| 09 | [09-stolperfallen.md](09-stolperfallen.md) | **Immer überfliegen** — bekannte Fallen |
| 10 | [10-email-kampagnen.md](10-email-kampagnen.md) | E-Mail-Kampagnen, Resend & Opt-Out-Logik |

## Pflege

Wenn sich Code ändert, der hier beschrieben ist, diese Dateien mitziehen und `last_verified`
aktualisieren. Inhalte aus `scripts/README.md`, `database/README.md` und `../docs/` werden
**verlinkt, nicht dupliziert**.
