# 34a Master Email Design Guidelines (TikTok Funnel Style)

Dieses Dokument dient als Vorlage und Styleguide für alle System-E-Mails von 34a Master. Das Design ist an den modernen "TikTok Funnel" angelehnt, um ein konsistentes Markenerlebnis zu gewährleisten.

## Design Tokens

- **Hintergrundfarbe (Body):** `#F1F5F9` (Slate 100)
- **Container:** Weiß, `32px` abgerundete Ecken, Schatten `0 20px 40px rgba(59, 101, 245, 0.1)`
- **Primärfarbe (Blau):** `#3B65F5`
- **Text Dunkel (Headline):** `#0F172A`
- **Text Hell (Body):** `#475569`
- **Button:** `#3B65F5`, `24px` abgerundete Ecken, fett (`900`), weißer Text.

---

## 1. Magic Link / Password Reset (Recovery)
**Einsatz:** Gast-Checkout Bestätigung, Passwort vergessen, Login ohne Passwort.
**Betreff-Vorschlag:** `Wichtig: Schließe deine Registrierung ab! 🎓`

```html
<!DOCTYPE html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      body { background-color: #F1F5F9; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; margin: 0; padding: 0; }
      .wrapper { padding: 40px 20px; }
      .container { max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 32px; overflow: hidden; box-shadow: 0 20px 40px rgba(59, 101, 245, 0.1); border: 1px solid rgba(59, 101, 245, 0.05); }
      .header-card { background-color: #3B65F5; padding: 40px 32px; text-align: left; }
      .title { font-size: 32px; font-weight: 900; color: #ffffff; margin: 0; letter-spacing: -1px; }
      .subtitle { font-size: 14px; font-weight: 600; color: rgba(255, 255, 255, 0.8); margin-top: 4px; text-transform: uppercase; letter-spacing: 1px; }
      .content { padding: 40px 32px; }
      .headline-dark { font-size: 24px; font-weight: 900; color: #0F172A; line-height: 1.1; margin-bottom: 16px; }
      .text { font-size: 16px; line-height: 1.6; color: #475569; margin-bottom: 32px; }
      .button { display: block; background-color: #3B65F5; color: #ffffff !important; padding: 20px; border-radius: 24px; font-size: 18px; font-weight: 900; text-align: center; text-decoration: none; box-shadow: 0 10px 25px rgba(59, 101, 245, 0.3); }
      .footer { padding: 0 32px 40px; font-size: 13px; color: #94A3B8; text-align: center; }
      .highlight { color: #3B65F5; font-weight: 900; }
    </style>
  </head>
  <body>
    <div class="wrapper">
      <div class="container">
        <div class="header-card">
          <h1 class="title">34a Master</h1>
          <p class="subtitle">Registrierung abschließen</p>
        </div>
        <div class="content">
          <h2 class="headline-dark">Vielen Dank für deinen <span class="highlight">Kauf!</span></h2>
          <p class="text">
            Um loszulegen, klicke bitte auf den Button unten. Du wirst direkt zur App geleitet, wo du deinen Namen und dein Passwort festlegen kannst.
          </p>
          <a href="{{ .ConfirmationURL }}" class="button">Jetzt Zugang freischalten</a>
        </div>
        <div class="footer">Dein 34a Master Team</div>
      </div>
    </div>
  </body>
</html>
```

---

## 2. Confirm Sign Up (E-Mail Bestätigung)
**Einsatz:** Standard Registrierung (E-Mail/Passwort).
**Betreff-Vorschlag:** `Nur noch ein Klick: Bestätige dein Konto für 34a Master 🚀`

```html
<!DOCTYPE html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      /* Styles wie oben */
    </style>
  </head>
  <body>
    <div class="wrapper">
      <div class="container">
        <div class="header-card">
          <h1 class="title">34a Master</h1>
          <p class="subtitle">Konto Bestätigen</p>
        </div>
        <div class="content">
          <h2 class="headline-dark">Fast geschafft! Deine <span class="highlight">Prüfungsvorbereitung</span> wartet.</h2>
          <p class="text">
            Willkommen bei 34a Master. Um dein Konto zu aktivieren und deinen Lernfortschritt zu sichern, bestätige bitte kurz deine E-Mail-Adresse.
          </p>
          <a href="{{ .ConfirmationURL }}" class="button">E-Mail jetzt bestätigen</a>
        </div>
        <div class="footer">Dein 34a Master Team</div>
      </div>
    </div>
  </body>
</html>
```

---

## Erstellung neuer E-Mails

1.  **Struktur beibehalten:** Immer den `.header-card` und `.content` Block nutzen.
2.  **Highlight-Farben:** Wichtige Wörter (z.B. Kauf, Prüfung, Erfolg) mit `<span class="highlight">` markieren.
3.  **Abgerundete Ecken:** Buttons (`24px`) und Container (`32px`) müssen konsistent bleiben.
4.  **Tonalität:** Direkt, motivierend und klar. Vermeide lange Einleitungen.
