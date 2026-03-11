import React, { Component, ReactNode } from 'react';
import * as Sentry from '@sentry/react';
import { AlertCircle, RefreshCw, Home, MessageCircle } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  isChunkError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      isChunkError: false
    };
  }

  static getDerivedStateFromError(error: Error): State {
    const isChunkError =
      error.name === 'ChunkLoadError' ||
      error.message.includes('Failed to fetch dynamically imported module') ||
      error.message.includes('importing');

    return {
      hasError: true,
      error,
      isChunkError
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by ErrorBoundary:', error, errorInfo);

    // Fehler an Sentry senden
    Sentry.captureException(error, {
      contexts: {
        react: {
          componentStack: errorInfo.componentStack,
        },
      },
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.hash = '/';
    this.setState({ hasError: false, error: null });
  };

  handleWhatsAppContact = () => {
    const errorDetails = this.state.error
      ? `Fehler: ${this.state.error.name}: ${this.state.error.message}`
      : 'Unbekannter Fehler';

    const text = `Hallo, ich habe einen technischen Fehler in der App gefunden:

${errorDetails}

Zeitpunkt: ${new Date().toLocaleString('de-DE')}
URL: ${window.location.href}

Bitte um Hilfe.`;

    // WhatsApp Business Nummer
    const whatsappNumber = import.meta.env.VITE_WHATSAPP_NUMBER || '+491782907020';
    const encodedMessage = encodeURIComponent(text);
    const whatsappUrl = `https://wa.me/${whatsappNumber.replace(/[^0-9+]/g, '')}?text=${encodedMessage}`;

    window.open(whatsappUrl, '_blank');
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-2xl shadow-xl p-8 text-center">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>

            <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">
              Etwas ist schiefgelaufen
            </h2>

            <p className="text-slate-600 dark:text-slate-400 mb-6 font-medium">
              {this.state.isChunkError
                ? "Ein Update ist verfügbar! Bitte lade die Seite neu, um fortzufahren."
                : "Es gab einen technischen Fehler. Bitte versuche es erneut."}
            </p>

            {this.state.isChunkError && (
              <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl text-sm text-blue-800 dark:text-blue-200 text-left">
                <p className="font-bold mb-1">💡 Tipp:</p>
                <p>Klicke auf "Neu laden". Das passiert meistens nach einem App-Update, damit du die neueste Version erhältst.</p>
              </div>
            )}

            {this.state.error && (
              <details className="mb-6 text-left">
                <summary className="text-sm text-slate-500 dark:text-slate-400 cursor-pointer hover:text-slate-700 dark:hover:text-slate-300">
                  Technische Details
                </summary>
                <pre className="mt-2 p-3 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs overflow-auto text-slate-700 dark:text-slate-300">
                  {this.state.error.toString()}
                </pre>
              </details>
            )}

            <div className="space-y-3">
              <div className="flex gap-3">
                <button
                  onClick={this.handleReload}
                  className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-primary text-white rounded-xl font-bold hover:bg-primary-hover transition-colors"
                >
                  <RefreshCw size={18} />
                  Neu laden
                </button>

                <button
                  onClick={this.handleGoHome}
                  className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl font-bold hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
                >
                  <Home size={18} />
                  Startseite
                </button>
              </div>

              <button
                onClick={this.handleWhatsAppContact}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold transition-colors"
              >
                <MessageCircle size={18} />
                Uns über den Fehler mitteilen
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
