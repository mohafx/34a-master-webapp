import React from 'react';
import { X, Type, Moon, Sun } from 'lucide-react';
import { useApp } from '../../App';
import { Card } from '../ui/Card';

interface QuizSettingsDialogProps {
  onClose: () => void;
}

export function QuizSettingsDialog({ onClose }: QuizSettingsDialogProps) {
  const { settings, updateSettings } = useApp();
  const isDarkMode = settings.darkMode ?? false;

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    // Use updateSettings to persist to localStorage + DB
    updateSettings({ darkMode: newMode, autoTheme: false });
  };

  const sizes = [
    { id: 'large', label: 'Groß', description: 'Für bessere Lesbarkeit', sampleClass: 'text-lg' },
    { id: 'normal', label: 'Normal', description: 'Standard Schriftgröße', sampleClass: 'text-base' },
    { id: 'small', label: 'Klein', description: 'Mehr Inhalt auf einen Blick', sampleClass: 'text-sm' },
    { id: 'smaller', label: 'Kleiner', description: 'Kompakte Ansicht', sampleClass: 'text-xs' },
  ] as const;

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <Card className="w-full max-w-sm relative" padding="lg">
        <button
          onClick={onClose}
          className="absolute top-2 right-2 p-4 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors z-20"
        >
          <X size={24} />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-primary-light dark:bg-primary/20 flex items-center justify-center text-primary">
            <Type size={20} />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white">Einstellungen</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Passe die Darstellung an</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Font Size Section */}
          <div>
            <p className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">Schriftgröße</p>

            <div className="grid grid-cols-2 gap-2">
              {sizes.map((size) => (
                <button
                  key={size.id}
                  onClick={() => updateSettings({ cardSize: size.id })}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${settings.cardSize === size.id
                    ? 'border-primary bg-primary-light/20 dark:bg-primary/10'
                    : 'border-slate-100 dark:border-slate-800 hover:border-primary/30 dark:hover:border-primary/30'
                    }`}
                >
                  <div className={`mb-1 font-bold text-slate-900 dark:text-white ${size.sampleClass}`}>
                    Aa
                  </div>
                  <p className={`text-xs font-bold ${settings.cardSize === size.id ? 'text-primary' : 'text-slate-500 dark:text-slate-400'
                    }`}>
                    {size.label}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Dark Mode Toggle */}
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isDarkMode ? 'bg-slate-800 text-blue-400' : 'bg-amber-100 text-amber-500'}`}>
                {isDarkMode ? <Moon size={16} /> : <Sun size={16} />}
              </div>
              <div>
                <p className="font-bold text-sm text-slate-900 dark:text-white">Dunkelmodus</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{isDarkMode ? 'Aktiviert' : 'Deaktiviert'}</p>
              </div>
            </div>
            <button
              onClick={toggleDarkMode}
              className={`w-12 h-6 rounded-full transition-colors relative ${isDarkMode ? 'bg-primary' : 'bg-slate-200 dark:bg-slate-700'}`}
            >
              <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${isDarkMode ? 'left-7' : 'left-1'}`} />
            </button>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-slate-900 dark:bg-slate-700 text-white font-bold text-sm hover:bg-slate-800 dark:hover:bg-slate-600 transition-colors"
          >
            Fertig
          </button>
        </div>
      </Card>
    </div>
  );
}
