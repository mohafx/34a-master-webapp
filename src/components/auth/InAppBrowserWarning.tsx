import { AlertTriangle, Chrome } from 'lucide-react';
import { useApp } from '../../App';
import { openInSystemBrowser } from '../../utils/inAppBrowser';

interface InAppBrowserWarningProps {
    className?: string;
}

export function InAppBrowserWarning({ className }: InAppBrowserWarningProps) {
    const { language } = useApp();
    const showArabic = language === 'DE_AR';

    const handleOpenInBrowser = () => {
        openInSystemBrowser(window.location.href);
    };

    return (
        <div className={`mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-left animate-in fade-in slide-in-from-top-2 duration-300 ${className}`}>
            <div className="flex items-start gap-3 mb-3">
                <div className="mt-0.5 text-amber-600 dark:text-amber-400 shrink-0">
                    <AlertTriangle size={18} />
                </div>
                <div className="flex-1">
                    <p className="text-sm text-slate-900 dark:text-white font-medium">
                        Google-Anmeldung funktioniert hier nicht
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                        Bitte öffne die Seite im Safari oder Chrome Browser.
                    </p>

                    {showArabic && (
                        <div dir="rtl" className="mt-2 pt-2 border-t border-amber-200/50 dark:border-amber-700/30">
                            <p className="text-sm text-slate-900 dark:text-white font-medium">
                                تسجيل الدخول عبر جوجل لا يعمل هنا
                            </p>
                            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                                يرجى فتح الموقع في متصفح Safari أو Chrome.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            <button
                onClick={handleOpenInBrowser}
                className="w-full bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-100 font-medium py-2 px-3 rounded-lg hover:bg-amber-50 dark:hover:bg-slate-700 transition-all flex items-center justify-center gap-2 text-sm"
            >
                <Chrome size={16} />
                <div className="flex flex-col items-center">
                    <span>Im Browser öffnen</span>
                    {showArabic && <span className="text-xs mt-0.5" dir="rtl">فتح في المتصفح</span>}
                </div>
            </button>
        </div>
    );
}
