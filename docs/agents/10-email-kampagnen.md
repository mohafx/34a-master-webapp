---
title: E-Mail-Kampagnen & Opt-Out-System
scope: scripts/send-oral-exam-campaign.ts, Edge Functions, Opt-out/Opt-in
last_verified: 2026-06-20
---

# E-Mail-Kampagnen & Opt-Out-System

Dieses Dokument beschreibt das System für den E-Mail-Kampagnen-Versand über den Dienst **Resend** sowie die dahinterliegende Opt-Out- und Tracking-Logik in der Datenbank.

## Systemkomponenten

Das E-Mail-System besteht aus drei Kernkomponenten:
1. **Administratives Versandschreiben (`scripts/send-oral-exam-campaign.ts`):** Ein TypeScript-Skript zur Steuerung, Filterung und Durchführung der Kampagnen.
2. **Opt-Out Edge-Function (`supabase/functions/unsubscribe-user/`):** Eine serverseitige Funktion, die den Klick auf "Abmelden" verarbeitet.
3. **Datenbank-Statusfelder (`public.user_profiles`):** Tracking-Spalten, um Abmeldungen und bereits gesendete Kampagnen zu verwalten.

---

## 1. Datenbank-Erweiterungen (`public.user_profiles`)

Es wurden zwei Spalten zur Nachverfolgung hinzugefügt (siehe Migrationen `20260620000000_add_marketing_unsubscribe.sql` und `20260620001000_add_oral_exam_campaign_sent.sql`):

- **`unsubscribed_from_marketing` (boolean, Default: `false`):**
  Wird auf `true` gesetzt, wenn ein Benutzer Werbung abbestellt. Solche Benutzer werden für zukünftige E-Mail-Kampagnen komplett ignoriert.
- **`oral_exam_campaign_sent` (boolean, Default: `false`):**
  Markiert, ob dem Benutzer bereits die E-Mail zur mündlichen Prüfungssimulation geschickt wurde. Verhindert doppelte Zusendungen.

---

## 2. Der Kampagnen-Manager (`scripts/send-oral-exam-campaign.ts`)

Das Skript fragt die registrierten Benutzer ab, filtert sie anhand der obigen Spalten und führt den Versand durch.

### Umgebungsvariablen
Das Skript lädt Variablen aus `.env.local` / `.env`:
- `RESEND_API_KEY`: Der API-Schlüssel für die Resend-Schnittstelle.
- `VITE_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`: Für den administrative Zugriff auf die Benutzerliste.
- `RESEND_FROM_EMAIL` (Optional): Absenderadresse (z. B. `34a Master <support@34a-master.de>`).
- `CAMPAIGN_APP_URL` (Optional): Basis-URL der App (Standard: `https://app.34a-master.de`).

### Befehle und Parameter

- **Trockenlauf (Dry Run):**
  Ermittelt die Anzahl der Empfänger, filtert Abgemeldete und bereits Kontaktierte und gibt Statistiken sowie eine HTML-Vorschau aus.
  ```bash
  npm run campaign:send-oral-exam -- --dry-run
  ```

- **Test-E-Mail senden:**
  Sendet eine Test-E-Mail an eine angegebene Adresse, um das Design zu prüfen (aktualisiert den Datenbankstatus **nicht**).
  ```bash
  npm run campaign:send-oral-exam -- --test-email=ihre-email@beispiel.de
  ```

- **Scharfer Versand (Broadcast) mit Tageslimit:**
  Startet den echten E-Mail-Versand. Da Resend im Free Tier ein Tageslimit von 100 E-Mails hat, wird dringend empfohlen, ein Limit von maximal **80 E-Mails pro Tag** zu setzen:
  ```bash
  npm run campaign:send-oral-exam -- --send --limit=80
  ```
  *Hinweis:* Nach erfolgreichem Versand aktualisiert das Skript automatisch das Feld `oral_exam_campaign_sent = true` in der Datenbank. Dadurch kann derselbe Befehl täglich wiederholt werden, ohne dass Benutzer E-Mails doppelt erhalten.

---

## 3. Die Abmelde-Funktion (`unsubscribe-user`)

Jede Kampagnen-E-Mail enthält im Footer einen personalisierten Abmelde-Link:
`https://fcwyavxxcblcbdezobgz.supabase.co/functions/v1/unsubscribe-user?email=user@domain.com`

Wird dieser Link aufgerufen:
1. Sucht die Edge Function nach dem zugehörigen Benutzerprofil.
2. Setzt `unsubscribed_from_marketing = true`.
3. Zeigt dem Benutzer eine professionelle, responsive HTML-Bestätigungsseite im Dashboard-Design des 34a Masters.
