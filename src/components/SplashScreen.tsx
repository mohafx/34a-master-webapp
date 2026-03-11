import React from 'react';

export default function SplashScreen({
  showSlowLoadingMessage,
  onRetry,
  detailMessage,
  statusMessage
}: {
  showSlowLoadingMessage?: boolean;
  onRetry?: () => void;
  detailMessage?: string;
  statusMessage?: string;
}) {
  return (
    <div className="fixed inset-0 bg-white dark:bg-slate-950 flex flex-col items-center justify-center z-50 transition-colors duration-300">
      {/* Logo Badge with Rounded Corners - Smaller Size */}
      <div className="bg-gradient-to-br from-blue-600 to-indigo-600 px-5 py-3 rounded-[16px] shadow-lg shadow-blue-500/30 mb-8 animate-pulse">
        <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
          34a Master
        </h1>
      </div>

      {/* Modern Spinner - Blue in Light, Indigo in Dark */}
      <div className="relative w-8 h-8 mb-6">
        <div className="absolute inset-0 border-3 border-slate-100 dark:border-slate-800 rounded-full"></div>
        <div className="absolute inset-0 border-3 border-blue-600 dark:border-indigo-500 rounded-full border-t-transparent animate-spin"></div>
      </div>

      {/* Loading Status Message - Slate in Light, Slate in Dark */}
      {statusMessage && (
        <div className="flex flex-col items-center animate-pulse">
          <p className="text-slate-500 dark:text-slate-400 text-[10px] font-bold tracking-wide uppercase">
            {statusMessage}
          </p>
        </div>
      )}

      {/* Only show error message if there's an actual error */}
      {detailMessage && detailMessage.includes('Fehler') && (
        <p className="mt-8 text-sm text-red-500 font-medium text-center px-6">
          {detailMessage}
        </p>
      )}

      {showSlowLoadingMessage && onRetry && (
        <div className="mt-8 flex flex-col items-center gap-3">
          <button
            onClick={onRetry}
            className="px-6 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-full text-sm font-medium transition-colors border border-slate-200 dark:border-slate-700"
          >
            Seite neu laden
          </button>
          <button
            onClick={() => {
              // Clear all localStorage to fix corrupted sessions
              localStorage.clear();
              window.location.reload();
            }}
            className="px-6 py-2 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full text-sm font-medium transition-colors border border-red-200 dark:border-red-800"
          >
            Cache löschen
          </button>
        </div>
      )}

      <style>{`
        @keyframes loading {
          0% {
            width: 0%;
          }
          50% {
            width: 100%;
          }
          100% {
            width: 0%;
          }
        }
      `}</style>
    </div>
  );
}

