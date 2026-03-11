import { AlertTriangle, Chrome, X } from 'lucide-react';
import { useApp } from '../../App';
import { detectIOS, openInSystemBrowser } from '../../utils/inAppBrowser';

interface InAppBrowserDialogProps {
    onClose: () => void;
    onContinueAnyway: () => void;
}

export function InAppBrowserDialog({ onClose, onContinueAnyway }: InAppBrowserDialogProps) {
    const { language } = useApp();
    const showArabic = language === 'DE_AR';
    const isIOS = detectIOS();

    const handleOpenInBrowser = () => {
        openInSystemBrowser(window.location.href);
        // Don't close the dialog immediately - let user see what happened
    };

    return (
        <div
            className="fixed inset-0 z-[60] overflow-y-auto bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
            onClick={onClose}
        >
            <div className="flex min-h-full items-center justify-center p-4 text-center">
                <div
                    className="relative transform bg-white dark:bg-slate-900 rounded-2xl text-left shadow-2xl shadow-black/30 transition-all w-full max-w-md animate-in slide-in-from-bottom-4 fade-in zoom-in-95 duration-300 ease-out p-6"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Close button */}
                    <button
                        onClick={onClose}
                        className="absolute top-3 right-3 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                        <X size={20} />
                    </button>

                    {/* Warning Icon */}
                    <div className="flex justify-center mb-4">
                        <div className="w-16 h-16 bg-amber-50 dark:bg-amber-900/20 rounded-full flex items-center justify-center">
                            <AlertTriangle size={32} className="text-amber-600 dark:text-amber-400" />
                        </div>
                    </div>

                    {/* Title */}
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white text-center mb-2">
                        Google-Anmeldung funktioniert hier nicht
                    </h2>
                    {showArabic && (
                        <p className="text-base font-bold text-emerald-600 dark:text-emerald-400 text-center mb-4" dir="rtl">
                            تسجيل الدخول عبر جوجل لا يعمل هنا
                        </p>
                    )}

                    {/* Explanation */}
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 mb-4">
                        <p className="text-sm text-slate-700 dark:text-slate-300 mb-2">
                            Du befindest dich in einem In-App-Browser (z.B. TikTok, Instagram). Google blockiert aus Sicherheitsgründen die Anmeldung in solchen Browsern.
                        </p>
                        {showArabic && (
                            <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-2" dir="rtl">
                                أنت في متصفح داخل التطبيق (مثل TikTok أو Instagram). تحظر Google تسجيل الدخول في هذه المتصفحات لأسباب أمنية.
                            </p>
                        )}
                    </div>

                    {/* iOS-specific instructions */}
                    {isIOS && (
                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 mb-4">
                            <p className="text-sm text-blue-900 dark:text-blue-100 font-medium mb-2">
                                📱 So öffnest du die Seite in Safari:
                            </p>
                            {showArabic && (
                                <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-2" dir="rtl">
                                    📱 كيفية فتح الصفحة في Safari:
                                </p>
                            )}
                            <ol className="text-xs text-blue-800 dark:text-blue-200 space-y-1.5 ml-4 list-decimal">
                                <li>
                                    Tippe auf <span className="font-semibold">"..."</span> (unten rechts oder oben rechts)
                                    {showArabic && <span className="block text-emerald-600 dark:text-emerald-400 mt-0.5" dir="rtl">اضغط على "..." (أسفل اليمين أو أعلى اليمين)</span>}
                                </li>
                                <li>
                                    Wähle <span className="font-semibold">"In Safari öffnen"</span> oder <span className="font-semibold">"Im Browser öffnen"</span>
                                    {showArabic && <span className="block text-emerald-600 dark:text-emerald-400 mt-0.5" dir="rtl">اختر "فتح في Safari" أو "فتح في المتصفح"</span>}
                                </li>
                            </ol>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="space-y-3">
                        <button
                            onClick={handleOpenInBrowser}
                            className="w-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold py-3.5 rounded-xl hover:shadow-lg hover:shadow-blue-200/50 transition-all flex items-center justify-center gap-2"
                        >
                            <Chrome size={20} />
                            <div className="flex flex-col items-center">
                                <span>Im Browser öffnen</span>
                                {showArabic && <span className="text-sm font-normal mt-0.5" dir="rtl">فتح في المتصفح</span>}
                            </div>
                        </button>

                        <button
                            onClick={onContinueAnyway}
                            className="w-full border-2 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-medium py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex flex-col items-center"
                        >
                            <span>Trotzdem fortfahren</span>
                            {showArabic && <span className="text-sm mt-0.5" dir="rtl">المتابعة على أي حال</span>}
                        </button>

                        <p className="text-xs text-slate-500 dark:text-slate-400 text-center mt-2">
                            Du kannst dich alternativ mit E-Mail und Passwort anmelden
                            {showArabic && <span className="block text-emerald-600/70 dark:text-emerald-400/70 mt-1" dir="rtl">يمكنك تسجيل الدخول بالبريد الإلكتروني وكلمة المرور</span>}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
