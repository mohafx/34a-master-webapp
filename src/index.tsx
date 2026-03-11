import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import './index.css';

// Sentry Initialisierung
Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
  // Performance Monitoring
  tracesSampleRate: import.meta.env.MODE === 'production' ? 0.1 : 1.0, // 10% in Production, 100% in Development
  
  // Session Replay
  replaysSessionSampleRate: 0.1, // 10% der Sessions aufnehmen
  replaysOnErrorSampleRate: 1.0, // 100% der Sessions mit Fehlern aufnehmen
  
  // Environment setzen
  environment: import.meta.env.MODE || 'development',
});

// Test-Funktionen für Sentry (nur in Development)
if (import.meta.env.MODE === 'development') {
  // @ts-ignore - Globale Test-Funktion
  window.testSentry = {
    // Test-Fehler werfen
    throwError: () => {
      throw new Error('Sentry Test Error - Dies ist ein Test-Fehler für Sentry');
    },
    
    // Test-Fehler an Sentry senden (ohne App-Crash)
    captureError: () => {
      Sentry.captureException(new Error('Sentry Test Error - Manuell gesendet'));
      console.log('✅ Test-Fehler wurde an Sentry gesendet!');
    },
    
    // Unbehandelte Promise Rejection testen
    testPromiseRejection: () => {
      Promise.reject(new Error('Sentry Test - Unbehandelte Promise Rejection'));
      console.log('✅ Promise Rejection wurde ausgelöst!');
    },
    
    // Test-Message senden
    sendMessage: (message: string = 'Sentry Test Message') => {
      Sentry.captureMessage(message, 'info');
      console.log('✅ Test-Message wurde an Sentry gesendet!');
    },
  };
  
  console.log('🧪 Sentry Test-Funktionen verfügbar! Verwende: window.testSentry.throwError()');
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

function renderBootstrapError(error: unknown) {
  const technicalMessage = error instanceof Error ? error.message : 'Unbekannter Startfehler';
  const isSupabaseConfigError = technicalMessage.includes('Missing Supabase environment variables');

  root.render(
    <React.StrictMode>
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: 'linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)',
          color: '#0f172a',
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '720px',
            background: '#ffffff',
            borderRadius: '24px',
            padding: '28px',
            boxShadow: '0 24px 60px rgba(15, 23, 42, 0.12)',
          }}
        >
          <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#475569' }}>
            Startfehler
          </p>
          <h1 style={{ margin: '8px 0 12px', fontSize: '32px', lineHeight: 1.1 }}>
            Die App konnte nicht geladen werden.
          </h1>
          <p style={{ margin: 0, fontSize: '16px', lineHeight: 1.6, color: '#334155' }}>
            {isSupabaseConfigError
              ? 'Der App fehlen die Supabase-Zugangsdaten. Lege im Ordner App src eine lokale .env-Datei oder .env.local-Datei mit VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY an und starte den Server danach neu.'
              : 'Beim Start ist ein technischer Fehler aufgetreten. Bitte lade die Seite neu. Wenn der Fehler bleibt, prüfe die lokale Konfiguration und den Dev-Server.'}
          </p>
          <div
            style={{
              marginTop: '20px',
              padding: '16px',
              borderRadius: '16px',
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              fontSize: '14px',
              lineHeight: 1.5,
              color: '#475569',
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
            }}
          >
            {technicalMessage}
          </div>
        </div>
      </div>
    </React.StrictMode>
  );
}

async function bootApp() {
  try {
    const { default: App } = await import('./App');

    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  } catch (error) {
    console.error('App bootstrap failed:', error);
    Sentry.captureException(error);
    renderBootstrapError(error);
  }
}

void bootApp();
