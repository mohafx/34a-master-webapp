import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useApp } from '../../App';
import { LogIn, Mail, Lock, X, User, CheckCircle, Languages, KeyRound, ChevronDown, Check, Chrome } from 'lucide-react';
import { detectInAppBrowser } from '../../utils/inAppBrowser';
import { InAppBrowserWarning } from './InAppBrowserWarning';
import { InAppBrowserDialog } from './InAppBrowserDialog';

interface AuthDialogProps {
    onClose: () => void;
    initialMode?: 'login' | 'register';
    message?: { de: string; ar: string } | null;
}

// Error message translations
const translateError = (error: string, showArabic: boolean): string => {
    const errorMap: Record<string, { de: string; ar: string }> = {
        'Email not confirmed': {
            de: 'E-Mail wurde noch nicht bestätigt. Bitte überprüfe dein Postfach.',
            ar: 'لم يتم تأكيد البريد الإلكتروني بعد. يرجى التحقق من صندوق الوارد.'
        },
        'Invalid login credentials': {
            de: 'Ungültige Anmeldedaten. Bitte überprüfe E-Mail und Passwort.',
            ar: 'بيانات تسجيل الدخول غير صحيحة. يرجى التحقق من البريد الإلكتروني وكلمة المرور.'
        },
        'User already registered': {
            de: 'Diese E-Mail ist bereits registriert.',
            ar: 'هذا البريد الإلكتروني مسجل بالفعل.'
        },
        'Email already registered': {
            de: 'Diese E-Mail-Adresse ist bereits registriert. Bitte melde dich an.',
            ar: 'هذا البريد الإلكتروني مسجل بالفعل. يرجى تسجيل الدخول.'
        },
        'Password should be at least 6 characters': {
            de: 'Das Passwort muss mindestens 6 Zeichen haben.',
            ar: 'يجب أن تتكون كلمة المرور من 6 أحرف على الأقل.'
        },
        'Unable to validate email address: invalid format': {
            de: 'Ungültiges E-Mail-Format.',
            ar: 'تنسيق البريد الإلكتروني غير صالح.'
        },
        'Signup requires a valid password': {
            de: 'Bitte gib ein gültiges Passwort ein.',
            ar: 'يرجى إدخال كلمة مرور صالحة.'
        },
        'Email rate limit exceeded': {
            de: 'Zu viele Versuche. Bitte warte einen Moment.',
            ar: 'محاولات كثيرة جداً. يرجى الانتظار قليلاً.'
        },
    };

    // Check for exact match first
    if (errorMap[error]) {
        return showArabic ? `${errorMap[error].de}\n${errorMap[error].ar}` : errorMap[error].de;
    }

    // Check for partial matches
    for (const [key, value] of Object.entries(errorMap)) {
        if (error.toLowerCase().includes(key.toLowerCase())) {
            return showArabic ? `${value.de}\n${value.ar}` : value.de;
        }
    }

    // Default fallback
    const defaultDe = 'Ein Fehler ist aufgetreten. Bitte versuche es erneut.';
    const defaultAr = 'حدث خطأ. يرجى المحاولة مرة أخرى.';
    return showArabic ? `${defaultDe}\n${defaultAr}` : defaultDe;
};

const GoogleIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18">
        <path fill="#4285F4" d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
        <path fill="#34A853" d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09C3.515 21.3 7.565 24 12.255 24z" />
        <path fill="#FBBC05" d="M5.525 14.29c-.25-.72-.38-1.5-.38-2.29s.14-1.57.38-2.29v-3.09h-3.98C.435 8.55 0 10.22 0 12s.435 3.45 1.545 5.38l3.98-3.09z" />
        <path fill="#EA4335" d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0 7.565 0 3.515 2.7 1.545 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z" />
    </svg>
);

export function AuthDialog({ onClose, initialMode = 'register', message }: AuthDialogProps) {
    const { signIn, signUp, signInWithGoogle, resetPassword } = useAuth();
    const { language, toggleLanguage, showLanguageToggle } = useApp();
    const showArabic = language === 'DE_AR';

    const [mode, setMode] = useState<'login' | 'register' | 'forgotPassword'>(initialMode);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [registrationSuccess, setRegistrationSuccess] = useState(false);
    const [resetPasswordSuccess, setResetPasswordSuccess] = useState(false);
    const [loginSuccess, setLoginSuccess] = useState(false);
    const [showEmailForm, setShowEmailForm] = useState(false);
    const [acceptTerms, setAcceptTerms] = useState(false);

    // In-App Browser Detection
    const [isInAppBrowser, setIsInAppBrowser] = useState(false);
    const [showWarning, setShowWarning] = useState(false);
    const [highlightWarning, setHighlightWarning] = useState(false);
    const [showInAppBrowserDialog, setShowInAppBrowserDialog] = useState(false);

    useEffect(() => {
        const inAppBrowser = detectInAppBrowser();
        setIsInAppBrowser(inAppBrowser);
        // Don't show dialog automatically - only when user clicks Google button
    }, []);

    const handleGoogleLogin = async () => {
        if (isInAppBrowser) {
            // Show popup when user clicks Google button
            setShowInAppBrowserDialog(true);
            setShowWarning(true); // Also show inline warning

            // Highlight the inline warning
            setHighlightWarning(true);
            setTimeout(() => setHighlightWarning(false), 800);
            return;
        }

        try {
            setLoading(true);
            await signInWithGoogle();
        } catch (err: any) {
            setError(translateError(err.message || 'Unknown error', showArabic));
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (mode === 'login') {
                await signIn(email, password);
                // Show success state briefly before closing
                setLoginSuccess(true);
                setTimeout(() => {
                    onClose();
                }, 800); // Close after 800ms
            } else if (mode === 'register') {
                if (!displayName) {
                    setError(showArabic
                        ? 'Bitte gib deinen Namen ein.\nيرجى إدخال اسمك.'
                        : 'Bitte gib deinen Namen ein.');
                    setLoading(false);
                    return;
                }
                if (!acceptTerms) {
                    setError(showArabic
                        ? 'Bitte akzeptiere die AGB und Datenschutzerklärung.\nيرجى قبول الشروط وسياسة الخصوصية.'
                        : 'Bitte akzeptiere die AGB und Datenschutzerklärung.');
                    setLoading(false);
                    return;
                }
                await signUp(email, password, displayName);
                setRegistrationSuccess(true);
            } else if (mode === 'forgotPassword') {
                if (!email) {
                    setError(showArabic
                        ? 'Bitte gib deine E-Mail-Adresse ein.\nيرجى إدخال عنوان بريدك الإلكتروني.'
                        : 'Bitte gib deine E-Mail-Adresse ein.');
                    setLoading(false);
                    return;
                }
                await resetPassword(email);
                setResetPasswordSuccess(true);
            }
        } catch (err: any) {
            const errorMessage = err.message || 'Unknown error';
            setError(translateError(errorMessage, showArabic));
        } finally {
            setLoading(false);
        }
    };

    // Arabic text helper
    const ArabicText = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => {
        if (!showArabic) return null;
        return (
            <p dir="rtl" className={`text-emerald-600 dark:text-emerald-400 text-sm mt-1 ${className}`}>
                {children}
            </p>
        );
    };

    // Show success message after login
    if (loginSuccess) {
        return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-md w-full relative animate-in fade-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
                    <div className="text-center">
                        <div className="w-16 h-16 bg-green-50 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-4 animate-in zoom-in duration-300">
                            <CheckCircle size={32} className="text-green-600 dark:text-green-400" />
                        </div>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                            Erfolgreich angemeldet!
                        </h2>
                        <ArabicText className="text-base font-bold mb-4">
                            تم تسجيل الدخول بنجاح!
                        </ArabicText>
                        <div className="flex items-center justify-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                            <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
                            <span>Wird geladen...</span>
                        </div>
                        {showArabic && (
                            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1" dir="rtl">
                                جاري التحميل...
                            </p>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // Show success message after password reset
    if (resetPasswordSuccess) {
        return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-md w-full relative animate-in fade-in duration-200" onClick={(e) => e.stopPropagation()}>
                    <button
                        onClick={onClose}
                        className="absolute top-2 right-2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-4 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-all z-20"
                    >
                        <X size={24} />
                    </button>

                    <div className="text-center pt-6">
                        <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <CheckCircle size={32} className="text-blue-600 dark:text-blue-400" />
                        </div>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                            E-Mail gesendet!
                        </h2>
                        <ArabicText className="text-base font-bold mb-2">
                            تم إرسال البريد الإلكتروني!
                        </ArabicText>

                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">
                            Wir haben dir einen Link zum Zurücksetzen des Passworts gesendet
                        </p>
                        <ArabicText className="text-xs mb-1">
                            أرسلنا لك رابطاً لإعادة تعيين كلمة المرور
                        </ArabicText>

                        <p className="text-xs text-slate-500 dark:text-slate-500 mb-6">
                            an <span className="font-semibold text-slate-700 dark:text-slate-300">{email}</span>
                        </p>
                        {showArabic && (
                            <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-6" dir="rtl">
                                إلى <span className="font-semibold">{email}</span>
                            </p>
                        )}

                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 mb-6 text-left">
                            <p className="text-sm text-blue-900 dark:text-blue-100 font-medium mb-2">
                                Nächste Schritte:
                            </p>
                            {showArabic && (
                                <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-2" dir="rtl">
                                    الخطوات التالية:
                                </p>
                            )}
                            <ol className="text-xs text-blue-800 dark:text-blue-200 space-y-1.5 ml-4 list-decimal">
                                <li>
                                    Öffne dein E-Mail-Postfach
                                    {showArabic && <span className="block text-emerald-600 dark:text-emerald-400 mt-0.5" dir="rtl">افتح صندوق بريدك الإلكتروني</span>}
                                </li>
                                <li>
                                    Klicke auf den Link in der E-Mail
                                    {showArabic && <span className="block text-emerald-600 dark:text-emerald-400 mt-0.5" dir="rtl">انقر على الرابط في البريد الإلكتروني</span>}
                                </li>
                                <li>
                                    Setze ein neues Passwort
                                    {showArabic && <span className="block text-emerald-600 dark:text-emerald-400 mt-0.5" dir="rtl">قم بتعيين كلمة مرور جديدة</span>}
                                </li>
                            </ol>
                        </div>

                        <button
                            onClick={() => {
                                setResetPasswordSuccess(false);
                                setMode('login');
                                setEmail('');
                                setError('');
                            }}
                            className="w-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold py-3.5 rounded-xl hover:shadow-lg hover:shadow-blue-200/50 transition-all mb-3 flex flex-col items-center"
                        >
                            <span>Zurück zur Anmeldung</span>
                            {showArabic && <span className="text-sm font-normal mt-1" dir="rtl">العودة إلى تسجيل الدخول</span>}
                        </button>

                        <button
                            onClick={onClose}
                            className="w-full text-slate-600 dark:text-slate-400 text-sm hover:text-slate-800 dark:hover:text-slate-200 transition-colors flex flex-col items-center"
                        >
                            <span>Schließen</span>
                            {showArabic && <span className="text-xs mt-1" dir="rtl">إغلاق</span>}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Show success message after registration
    if (registrationSuccess) {
        return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-md w-full relative animate-in fade-in duration-200" onClick={(e) => e.stopPropagation()}>
                    <button
                        onClick={onClose}
                        className="absolute top-2 right-2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-4 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-all z-20"
                    >
                        <X size={24} />
                    </button>

                    <div className="text-center pt-6">
                        <div className="w-16 h-16 bg-green-50 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <CheckCircle size={32} className="text-green-600 dark:text-green-400" />
                        </div>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                            Registrierung erfolgreich!
                        </h2>
                        <ArabicText className="text-base font-bold mb-2">
                            تم التسجيل بنجاح!
                        </ArabicText>

                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">
                            Bitte bestätige deine E-Mail-Adresse
                        </p>
                        <ArabicText className="text-xs mb-1">
                            يرجى تأكيد عنوان بريدك الإلكتروني
                        </ArabicText>

                        <p className="text-xs text-slate-500 dark:text-slate-500 mb-6">
                            Wir haben dir eine Bestätigungs-E-Mail an <span className="font-semibold text-slate-700 dark:text-slate-300">{email}</span> gesendet.
                        </p>
                        {showArabic && (
                            <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-6" dir="rtl">
                                لقد أرسلنا لك رسالة تأكيد إلى <span className="font-semibold">{email}</span>
                            </p>
                        )}

                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 mb-6 text-left">
                            <p className="text-sm text-blue-900 dark:text-blue-100 font-medium mb-2">
                                Nächste Schritte:
                            </p>
                            {showArabic && (
                                <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-2" dir="rtl">
                                    الخطوات التالية:
                                </p>
                            )}
                            <ol className="text-xs text-blue-800 dark:text-blue-200 space-y-1.5 ml-4 list-decimal">
                                <li>
                                    Öffne dein E-Mail-Postfach
                                    {showArabic && <span className="block text-emerald-600 dark:text-emerald-400 mt-0.5" dir="rtl">افتح صندوق بريدك الإلكتروني</span>}
                                </li>
                                <li>
                                    Klicke auf den Bestätigungslink
                                    {showArabic && <span className="block text-emerald-600 dark:text-emerald-400 mt-0.5" dir="rtl">انقر على رابط التأكيد</span>}
                                </li>
                                <li>
                                    Komm zurück und melde dich an
                                    {showArabic && <span className="block text-emerald-600 dark:text-emerald-400 mt-0.5" dir="rtl">عد وسجّل الدخول</span>}
                                </li>
                            </ol>
                        </div>

                        <button
                            onClick={() => {
                                setRegistrationSuccess(false);
                                setMode('login');
                                setPassword('');
                                setError('');
                            }}
                            className="w-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold py-3.5 rounded-xl hover:shadow-lg hover:shadow-blue-200/50 transition-all mb-3 flex flex-col items-center"
                        >
                            <span>Jetzt anmelden</span>
                            {showArabic && <span className="text-sm font-normal mt-1" dir="rtl">تسجيل الدخول الآن</span>}
                        </button>

                        <button
                            onClick={onClose}
                            className="w-full text-slate-600 dark:text-slate-400 text-sm hover:text-slate-800 dark:hover:text-slate-200 transition-colors flex flex-col items-center"
                        >
                            <span>Später anmelden</span>
                            {showArabic && <span className="text-xs mt-1" dir="rtl">تسجيل الدخول لاحقاً</span>}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <>
            {/* In-App Browser Dialog - Shows proactively */}
            {showInAppBrowserDialog && (
                <InAppBrowserDialog
                    onClose={() => setShowInAppBrowserDialog(false)}
                    onContinueAnyway={() => {
                        setShowInAppBrowserDialog(false);
                        // Keep the inline warning visible
                        setShowWarning(true);
                    }}
                />
            )}

            <div
                className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-sm animate-in fade-in duration-300"
                onClick={onClose}
            >
                <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
                    <div
                        className={`relative transform bg-white dark:bg-slate-900 rounded-2xl text-left shadow-2xl shadow-black/20 transition-all sm:my-8 w-full max-w-sm animate-in slide-in-from-bottom-4 fade-in zoom-in-95 duration-300 ease-out ${showArabic ? 'p-4' : 'p-5'
                            }`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header with language toggle and close button */}
                        <div className="flex items-center justify-end mb-2 gap-2">
                            {showLanguageToggle && (
                                <button
                                    onClick={toggleLanguage}
                                    className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-[10px] font-medium text-slate-500 dark:text-slate-400"
                                    title={showArabic ? 'Nur Deutsch' : 'Deutsch + Arabisch'}
                                >
                                    <Languages size={12} />
                                    <span>{showArabic ? 'DE+AR' : 'DE'}</span>
                                </button>
                            )}
                            <button
                                onClick={onClose}
                                className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-3 -mr-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                            >
                                <X size={22} />
                            </button>
                        </div>

                        {/* Main Content - Register/Login/ForgotPassword modes only */}
                        <>
                            <div className={`text-center ${showArabic ? 'mb-3' : 'mb-4'}`}>
                                <div className={`bg-blue-50 dark:bg-blue-900/20 rounded-xl flex items-center justify-center mx-auto mb-2 ${showArabic ? 'w-8 h-8' : 'w-10 h-10'}`}>
                                    {mode === 'forgotPassword' ? (
                                        <KeyRound size={showArabic ? 16 : 20} className="text-blue-600 dark:text-blue-400" />
                                    ) : (
                                        <LogIn size={showArabic ? 16 : 20} className="text-blue-600 dark:text-blue-400" />
                                    )}
                                </div>
                                <h2 className={`font-bold text-slate-900 dark:text-white ${showArabic ? 'text-base' : 'text-lg'}`}>
                                    {mode === 'login' ? 'Anmelden' : mode === 'register' ? 'Registrieren' : 'Passwort zurücksetzen'}
                                </h2>
                                {showArabic && (
                                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5" dir="rtl">
                                        {mode === 'login' ? 'تسجيل الدخول' : mode === 'register' ? 'إنشاء حساب جديد' : 'استعادة كلمة المرور'}
                                    </p>
                                )}
                                <p className={`text-slate-500 dark:text-slate-400 ${showArabic ? 'text-[10px] mt-1' : 'text-xs mt-1.5'}`}>
                                    {mode === 'login' ? 'Willkommen zurück!' : mode === 'register' ? 'Erstelle deinen kostenlosen Account' : 'Wir senden dir einen Link'}
                                </p>
                                {showArabic && (
                                    <p className="text-[10px] text-emerald-600/70 dark:text-emerald-400/70 mt-0.5" dir="rtl">
                                        {mode === 'login' ? 'أهلاً بعودتك!' : mode === 'register' ? 'أنشئ حسابك المجاني الآن' : 'سنرسل لك رابط الاستعادة'}
                                    </p>
                                )}
                            </div>

                            {/* Custom Message Banner */}
                            {message && (mode === 'login' || mode === 'register') && (
                                <div className="mx-5 mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl flex items-start gap-3 text-left">
                                    <div className="mt-0.5 text-amber-600 dark:text-amber-400 shrink-0">
                                        <Lock size={16} />
                                    </div>
                                    <div>
                                        <p className="text-sm text-slate-900 dark:text-white font-medium">
                                            {message.de}
                                        </p>
                                        {showArabic && (
                                            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5" dir="rtl">
                                                {message.ar}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* In-App Browser Warning */}
                            {showWarning && (mode === 'login' || mode === 'register') && (
                                <div className="mx-5 mb-0">
                                    <InAppBrowserWarning className={highlightWarning ? 'animate-pulse ring-2 ring-blue-500/50' : ''} />
                                </div>
                            )}

                            <div className={showArabic ? "space-y-3" : "space-y-4"}>
                                {(mode === 'login' || mode === 'register') && (
                                    <>
                                        <button
                                            onClick={handleGoogleLogin}
                                            disabled={loading}
                                            className={`w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 hover:shadow-md transition-all flex items-center justify-center gap-3 group ${showArabic ? 'py-2' : 'py-2.5'}
                                        ${isInAppBrowser ? 'opacity-50 grayscale cursor-not-allowed hover:bg-white dark:hover:bg-slate-800 hover:shadow-none' : ''}`}
                                        >
                                            <GoogleIcon />
                                            <div className="flex flex-col items-start">
                                                <span className={`font-semibold group-hover:text-slate-900 dark:group-hover:text-white transition-colors ${showArabic ? 'text-xs' : 'text-sm'}`}>Mit Google fortfahren</span>
                                                {showArabic && <span className="text-[10px] text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300 transition-colors" dir="rtl">الاستمرار عبر جوجل</span>}
                                            </div>
                                        </button>

                                        {/* Show email form toggle for register mode */}
                                        {mode === 'register' && !showEmailForm && (
                                            <>
                                                <div className="relative">
                                                    <div className="absolute inset-0 flex items-center">
                                                        <div className="w-full border-t border-slate-200 dark:border-slate-700"></div>
                                                    </div>
                                                    <div className="relative flex justify-center text-xs uppercase">
                                                        <span className="px-2 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400">
                                                            oder
                                                            {showArabic && <span className="mr-1" dir="rtl"> أو</span>}
                                                        </span>
                                                    </div>
                                                </div>

                                                <button
                                                    type="button"
                                                    onClick={() => setShowEmailForm(true)}
                                                    className={`w-full border-2 border-dashed border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 font-medium rounded-lg hover:border-blue-400 hover:text-blue-600 dark:hover:border-blue-500 dark:hover:text-blue-400 transition-all flex items-center justify-center gap-2 ${showArabic ? 'py-2' : 'py-2.5'}`}
                                                >
                                                    <Mail size={16} />
                                                    <div className="flex flex-col items-start">
                                                        <span className={showArabic ? 'text-xs' : 'text-sm'}>Mit E-Mail registrieren</span>
                                                        {showArabic && <span className="text-[10px] text-slate-400" dir="rtl">التسجيل بالبريد الإلكتروني</span>}
                                                    </div>
                                                </button>
                                            </>
                                        )}

                                        {/* Show divider for login mode or when email form is shown */}
                                        {(mode === 'login' || showEmailForm) && (
                                            <div className="relative">
                                                <div className="absolute inset-0 flex items-center">
                                                    <div className="w-full border-t border-slate-200 dark:border-slate-700"></div>
                                                </div>
                                                <div className="relative flex justify-center text-xs uppercase">
                                                    <span className="px-2 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400">
                                                        oder
                                                        {showArabic && <span className="mr-1" dir="rtl"> أو</span>}
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}

                                {/* Only show form for login, forgotPassword, or register with showEmailForm */}
                                {(mode === 'login' || mode === 'forgotPassword' || (mode === 'register' && showEmailForm)) && (
                                    <form onSubmit={handleSubmit} className={`animate-in fade-in slide-in-from-bottom-2 duration-300 ${showArabic ? 'space-y-2.5' : 'space-y-3'}`}>
                                        {mode === 'forgotPassword' && (
                                            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 mb-4">
                                                <p className="text-sm text-blue-900 dark:text-blue-100">
                                                    Gib deine E-Mail-Adresse ein und wir senden dir einen Link zum Zurücksetzen deines Passworts.
                                                </p>
                                                {showArabic && (
                                                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2" dir="rtl">
                                                        أدخل بريدك الإلكتروني وسنرسل لك رابط استعادة كلمة المرور.
                                                    </p>
                                                )}
                                            </div>
                                        )}

                                        {mode === 'register' && (
                                            <div>
                                                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                                                    Name
                                                    {showArabic && <span className="text-emerald-600 dark:text-emerald-400 ml-2" dir="rtl"> / الاسم</span>}
                                                </label>
                                                <div className="relative">
                                                    <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                                                    <input
                                                        type="text"
                                                        value={displayName}
                                                        onChange={(e) => setDisplayName(e.target.value)}
                                                        className={`w-full pl-9 pr-3 text-sm border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white dark:bg-slate-800 text-slate-900 dark:text-white ${showArabic ? 'py-1.5' : 'py-2'}`}
                                                        placeholder={showArabic ? "اسمك / Dein Name" : "Dein Name"}
                                                        required={mode === 'register'}
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        <div>
                                            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                                                E-Mail
                                                {showArabic && <span className="text-emerald-600 dark:text-emerald-400 ml-2" dir="rtl"> / البريد الإلكتروني</span>}
                                            </label>
                                            <div className="relative">
                                                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                                                <input
                                                    type="email"
                                                    value={email}
                                                    onChange={(e) => setEmail(e.target.value)}
                                                    className={`w-full pl-9 pr-3 text-sm border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white dark:bg-slate-800 text-slate-900 dark:text-white ${showArabic ? 'py-1.5' : 'py-2'}`}
                                                    placeholder="deine@email.de"
                                                    required
                                                />
                                            </div>
                                        </div>

                                        {mode !== 'forgotPassword' && (
                                            <div>
                                                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                                                    Passwort
                                                    {showArabic && <span className="text-emerald-600 dark:text-emerald-400 ml-2" dir="rtl"> / كلمة المرور</span>}
                                                </label>
                                                <div className="relative">
                                                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                                                    <input
                                                        type="password"
                                                        value={password}
                                                        onChange={(e) => setPassword(e.target.value)}
                                                        className={`w-full pl-9 pr-3 text-sm border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white dark:bg-slate-800 text-slate-900 dark:text-white ${showArabic ? 'py-1.5' : 'py-2'}`}
                                                        placeholder="••••••••"
                                                        required
                                                        minLength={6}
                                                    />
                                                </div>
                                                {mode === 'register' && (
                                                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                                                        Mindestens 6 Zeichen
                                                        {showArabic && <span className="text-emerald-600 dark:text-emerald-400 ml-2" dir="rtl"> / 6 أحرف على الأقل</span>}
                                                    </p>
                                                )}
                                            </div>
                                        )}

                                        {/* Terms Checkbox for Registration */}
                                        {mode === 'register' && (
                                            <label className="flex items-start gap-3 cursor-pointer group">
                                                <div className="relative mt-0.5">
                                                    <input
                                                        type="checkbox"
                                                        checked={acceptTerms}
                                                        onChange={(e) => setAcceptTerms(e.target.checked)}
                                                        className="sr-only"
                                                    />
                                                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${acceptTerms
                                                        ? 'bg-blue-600 border-blue-600'
                                                        : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 group-hover:border-blue-400'
                                                        }`}>
                                                        {acceptTerms && <Check size={14} className="text-white" strokeWidth={3} />}
                                                    </div>
                                                </div>
                                                <span className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                                                    Ich akzeptiere die{' '}
                                                    <Link to="/agb" className="text-blue-600 dark:text-blue-400 hover:underline font-medium" onClick={(e) => e.stopPropagation()}>AGB</Link>
                                                    {' '}und die{' '}
                                                    <Link to="/datenschutz" className="text-blue-600 dark:text-blue-400 hover:underline font-medium" onClick={(e) => e.stopPropagation()}>Datenschutzerklärung</Link>.
                                                    {showArabic && (
                                                        <span className="block text-emerald-600 dark:text-emerald-400 mt-1" dir="rtl">
                                                            أوافق على الشروط وسياسة الخصوصية
                                                        </span>
                                                    )}
                                                </span>
                                            </label>
                                        )}

                                        {error && (
                                            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-2 rounded-xl text-xs whitespace-pre-line">
                                                {error}
                                            </div>
                                        )}

                                        <button
                                            type="submit"
                                            disabled={loading}
                                            className={`w-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold rounded-lg hover:shadow-lg hover:shadow-blue-200/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex flex-col items-center ${showArabic ? 'py-2' : 'py-2.5'}`}
                                        >
                                            <span className={showArabic ? 'text-sm' : 'text-base'}>
                                                {loading
                                                    ? (mode === 'login' ? 'Wird angemeldet...'
                                                        : mode === 'register' ? 'Wird registriert...'
                                                            : 'E-Mail wird gesendet...')
                                                    : (mode === 'login' ? 'Anmelden'
                                                        : mode === 'register' ? 'Registrieren'
                                                            : 'Link senden')
                                                }
                                            </span>
                                            {showArabic && !loading && (
                                                <span className="text-[10px] font-normal opacity-90" dir="rtl">
                                                    {mode === 'login' ? 'تسجيل الدخول'
                                                        : mode === 'register' ? 'إنشاء حساب'
                                                            : 'إرسال الرابط'}
                                                </span>
                                            )}
                                        </button>
                                    </form>
                                )}


                            </div>
                            <div className={`mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-center ${showArabic ? 'mt-2 pt-2' : ''}`}>
                                {mode === 'login' && (
                                    <button
                                        onClick={() => {
                                            setMode('forgotPassword');
                                            setError('');
                                        }}
                                        className="block w-full text-xs text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 mb-3"
                                    >
                                        Passwort vergessen?
                                    </button>
                                )}
                                {(mode === 'login' || mode === 'register') && (
                                    <div className="text-center">
                                        <button
                                            onClick={() => {
                                                setMode(mode === 'login' ? 'register' : 'login');
                                                setError('');
                                            }}
                                            className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium transition-colors flex flex-col items-center w-full"
                                        >
                                            <span>
                                                {mode === 'login'
                                                    ? 'Noch kein Konto? Jetzt registrieren'
                                                    : 'Bereits registriert? Anmelden'
                                                }
                                            </span>
                                            {showArabic && (
                                                <span className="text-xs mt-1" dir="rtl">
                                                    {mode === 'login'
                                                        ? 'ليس لديك حساب؟ سجّل الآن'
                                                        : 'لديك حساب بالفعل؟ سجّل الدخول'
                                                    }
                                                </span>
                                            )}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </>
                    </div>
                </div>
            </div>
        </>
    );
}
