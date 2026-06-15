# CLAUDE.md

**Diese Datei spiegelt [`AGENTS.md`](AGENTS.md). Lies `AGENTS.md` zuerst** — dort stehen Stack,
Befehle, Environment, „Nicht anfassen"-Regeln und der Index der Wissensbasis unter
[`docs/agents/`](docs/agents/). Diese Datei ergänzt nur Claude-Code-spezifische Regeln, um
Duplikat-Drift zu vermeiden.

## Claude-Code-Regeln für dieses Projekt

1. **Aktiver Code = `src/`.** Das Legacy-Duplikat `app-src/` wurde entfernt (nach
   `../_legacy_app-src_archive/`); falls es wieder auftaucht, ignorieren.
2. **Lege keine `*" 2".tsx`-Dateien an** — die alten Duplikate wurden entfernt; immer die Variante
   ohne `" 2"` bearbeiten.
3. **Keine Secrets committen oder in Docs/Code-Kommentare schreiben.** Nur Variablen-*Namen*
   nennen, Werte bleiben in `.env` / `.env.local` bzw. Supabase Function Secrets.
4. **Datenbank-Migrationen** gehören ausschließlich nach `supabase/migrations/`
   (siehe [`database/README.md`](database/README.md)). Bevorzugt via Supabase-MCP-Tools
   (`list_tables`, `apply_migration`) arbeiten; vor Schemaänderungen `list_tables` lesen.
5. **HashRouter beachten:** Routen und Auth-Tokens leben im URL-Hash. Vor Auth-/Routing-Änderungen
   [`docs/agents/02-routing-und-auth.md`](docs/agents/02-routing-und-auth.md) lesen.
6. **Verifizieren statt behaupten:** Frontend-Änderungen mit den `preview_*`-Tools prüfen;
   Tests mit den `npm run test:*`-Befehlen ([`docs/agents/08-testing.md`](docs/agents/08-testing.md)).

Persönliche, sitzungsübergreifende Memory liegt separat unter `~/.claude/.../memory/` und ist nicht
Teil dieses Repos.
