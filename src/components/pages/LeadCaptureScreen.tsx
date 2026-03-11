import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useApp } from '../../App';
import { db } from '../../services/database';
import { CheckCircle2, Bell, BookOpen, Brain, Trophy, Loader2, Mail } from 'lucide-react';

export default function LeadCaptureScreen() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { language } = useApp();
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email && !user) return;

        setLoading(true);
        setError(null);

        try {
            const emailToSubmit = user ? user.email : email;
            if (!emailToSubmit) throw new Error("Email is required");

            await db.addToWaitlist(emailToSubmit, user?.id);
            setSuccess(true);
        } catch (err: any) {
            console.error(err);
            if (err.message?.includes('duplicate') || err.code === '23505') {
                setError(language === 'DE_AR' ? "هذا البريد الإلكتروني موجود بالفعل في قائمة الانتظار." : "Diese E-Mail ist bereits auf der Warteliste.");
            } else {
                setError(language === 'DE_AR' ? "حدث خطأ. يرجى المحاولة مرة أخرى." : "Es ist ein Fehler aufgetreten. Bitte versuche es erneut.");
            }
        } finally {
            setLoading(false);
        }
    };

    const features = [
        {
            icon: BookOpen,
            title: 'Alle Lektionen',
            titleAr: 'جميع الدروس',
            desc: '10+ interaktive Lernmodule',
            descAr: 'أكثر من 10 وحدات تعليمية تفاعلية',
            color: 'bg-blue-500'
        },
        {
            icon: Brain,
            title: 'KI-Prüfer',
            titleAr: 'المختبر بالذكاء الاصطناعي',
            desc: 'Mündliche Prüfungssimulation',
            descAr: 'محاكاة الامتحان الشفهي',
            color: 'bg-purple-500'
        },
        {
            icon: Trophy,
            title: 'Prüfungsmodus',
            titleAr: 'وضع الامتحان',
            desc: 'Realistische Prüfungsbedingungen',
            descAr: 'ظروف امتحان واقعية',
            color: 'bg-amber-500'
        },
    ];

    // Success Screen
    if (success) {
        return (
            <div className="min-h-screen bg-[#F2F4F6] dark:bg-slate-950">
                {/* Header */}
                <header className="px-4 py-4">
                </header>

                <div className="px-6 pt-8 pb-12 flex flex-col items-center">
                    {/* Success Icon */}
                    <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-6">
                        <CheckCircle2 className="text-green-600 dark:text-green-400 w-10 h-10" strokeWidth={2.5} />
                    </div>

                    <h1 className="text-2xl font-black text-slate-900 dark:text-white text-center mb-3">
                        Du bist dabei!
                    </h1>
                    {language === 'DE_AR' && (
                        <p className="text-lg text-slate-500 dark:text-slate-400 text-center mb-2" dir="rtl">
                            تم تسجيلك بنجاح!
                        </p>
                    )}

                    <p className="text-slate-600 dark:text-slate-400 text-center mb-8 max-w-sm">
                        Wir benachrichtigen dich per E-Mail, sobald die neuen Inhalte verfügbar sind.
                    </p>
                    {language === 'DE_AR' && (
                        <p className="text-emerald-600 dark:text-emerald-400 text-sm text-center mb-8 max-w-sm pr-2 border-r-2 border-emerald-400/50" dir="rtl">
                            سنخطرك عبر البريد الإلكتروني بمجرد توفر المحتوى الجديد
                        </p>
                    )}

                    {/* What happens next */}
                    <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-200 dark:border-slate-800 mb-6">
                        <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                            <Bell size={18} className="text-primary" />
                            Was passiert jetzt?
                        </h3>
                        {language === 'DE_AR' && (
                            <p className="text-emerald-600 dark:text-emerald-400 text-sm mb-4 pr-2 border-r-2 border-emerald-400/50" dir="rtl">
                                ماذا يحدث الآن؟
                            </p>
                        )}
                        <ul className="space-y-3">
                            <li className="flex items-start gap-3">
                                <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-sm font-bold flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                                <div className="flex-1">
                                    <span className="text-slate-600 dark:text-slate-400 text-sm block">Wir arbeiten an neuen Lektionen und Features</span>
                                    {language === 'DE_AR' && (
                                        <span className="text-emerald-600 dark:text-emerald-400 text-xs block mt-1 pr-1 border-r-2 border-emerald-400/50" dir="rtl">
                                            نحن نعمل حالياً على دروس وميزات جديدة
                                        </span>
                                    )}
                                </div>
                            </li>
                            <li className="flex items-start gap-3">
                                <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-sm font-bold flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                                <div className="flex-1">
                                    <span className="text-slate-600 dark:text-slate-400 text-sm block">Du erhältst eine E-Mail bei Freischaltung</span>
                                    {language === 'DE_AR' && (
                                        <span className="text-emerald-600 dark:text-emerald-400 text-xs block mt-1 pr-1 border-r-2 border-emerald-400/50" dir="rtl">
                                            ستحصل على بريد إلكتروني عند تفعيل المحتوى
                                        </span>
                                    )}
                                </div>
                            </li>
                            <li className="flex items-start gap-3">
                                <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-sm font-bold flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                                <div className="flex-1">
                                    <span className="text-slate-600 dark:text-slate-400 text-sm block">Bis dahin: Nutze alle aktuellen Inhalte!</span>
                                    {language === 'DE_AR' && (
                                        <span className="text-emerald-600 dark:text-emerald-400 text-xs block mt-1 pr-1 border-r-2 border-emerald-400/50" dir="rtl">
                                            حتى ذلك الحين: استخدم جميع المحتويات المتاحة حالياً
                                        </span>
                                    )}
                                </div>
                            </li>
                        </ul>
                    </div>

                    <button
                        onClick={() => navigate('/learn')}
                        className="w-full max-w-sm py-4 bg-primary text-white rounded-2xl font-bold text-lg shadow-sm hover:bg-primary/90 active:scale-[0.98] transition-all flex flex-col items-center"
                    >
                        <span>Weiter lernen</span>
                        {language === 'DE_AR' && (
                            <span className="text-sm font-normal mt-1" dir="rtl">
                                متابعة التعلم
                            </span>
                        )}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F2F4F6] dark:bg-slate-950">
            {/* Header */}
            <header className="px-4 py-4">
            </header>

            <div className="px-6 pt-4 pb-12">
                {/* Title Section */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center gap-2 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-4 py-2 rounded-full text-sm font-bold mb-4">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                        </span>
                        Bald verfügbar
                        {language === 'DE_AR' && (
                            <span className="mr-2 text-xs" dir="rtl">
                                متاح قريباً
                            </span>
                        )}
                    </div>

                    <h1 className="text-2xl font-black text-slate-900 dark:text-white mb-2">
                        Mehr Inhalte kommen!
                    </h1>
                    {language === 'DE_AR' && (
                        <p className="text-lg text-slate-500 dark:text-slate-400 mb-2" dir="rtl">
                            المزيد من المحتوى قادم!
                        </p>
                    )}
                    <p className="text-slate-600 dark:text-slate-400">
                        Werde benachrichtigt, wenn neue Lektionen verfügbar sind.
                    </p>
                    {language === 'DE_AR' && (
                        <p className="text-emerald-600 dark:text-emerald-400 text-sm mt-1 pr-2 border-r-2 border-emerald-400/50" dir="rtl">
                            سيتم إشعارك عند توفر دروس جديدة
                        </p>
                    )}
                </div>

                {/* Email Form */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 mb-8">
                    {user ? (
                        // Logged in user - simple button
                        <div className="text-center">
                            <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Mail className="w-7 h-7 text-primary" />
                            </div>
                            <h3 className="font-bold text-slate-900 dark:text-white mb-2">
                                Benachrichtigung aktivieren
                            </h3>
                            {language === 'DE_AR' && (
                                <p className="text-emerald-600 dark:text-emerald-400 text-sm mb-2 pr-2 border-r-2 border-emerald-400/50" dir="rtl">
                                    تفعيل الإشعارات
                                </p>
                            )}
                            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                                Wir informieren dich an <span className="font-medium text-slate-700 dark:text-slate-300">{user.email}</span>
                            </p>
                            {language === 'DE_AR' && (
                                <p className="text-emerald-600 dark:text-emerald-400 text-xs mb-6 pr-2 border-r-2 border-emerald-400/50" dir="rtl">
                                    سنخطرك على البريد الإلكتروني: <span className="font-medium">{user.email}</span>
                                </p>
                            )}
                            <button
                                onClick={handleSubmit}
                                disabled={loading}
                                className="w-full py-4 bg-primary text-white rounded-2xl font-bold text-lg shadow-sm hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50 flex flex-col items-center justify-center gap-1"
                            >
                                {loading ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <>
                                        <div className="flex items-center gap-2">
                                            <Bell size={20} />
                                            <span>Benachrichtige mich</span>
                                        </div>
                                        {language === 'DE_AR' && (
                                            <span className="text-sm font-normal" dir="rtl">
                                                أبلغني
                                            </span>
                                        )}
                                    </>
                                )}
                            </button>
                        </div>
                    ) : (
                        // Not logged in - email form
                        <form onSubmit={handleSubmit}>
                            <h3 className="font-bold text-slate-900 dark:text-white text-center mb-4">
                                E-Mail eintragen
                            </h3>
                            {language === 'DE_AR' && (
                                <p className="text-emerald-600 dark:text-emerald-400 text-sm text-center mb-4 pr-2 border-r-2 border-emerald-400/50" dir="rtl">
                                    أدخل بريدك الإلكتروني
                                </p>
                            )}

                            <div className="space-y-4">
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder={language === 'DE_AR' ? 'example@email.com' : 'deine@email.de'}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-4 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-0 transition-colors font-medium"
                                    required
                                />
                                <button
                                    type="submit"
                                    disabled={loading || !email}
                                    className="w-full py-4 bg-primary text-white rounded-2xl font-bold text-lg shadow-sm hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50 flex flex-col items-center justify-center gap-1"
                                >
                                    {loading ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                        <>
                                            <div className="flex items-center gap-2">
                                                <Bell size={20} />
                                                <span>Benachrichtige mich</span>
                                            </div>
                                            {language === 'DE_AR' && (
                                                <span className="text-sm font-normal" dir="rtl">
                                                    أبلغني
                                                </span>
                                            )}
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    )}

                    {error && (
                        <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm text-center">
                            {error}
                            {language === 'DE_AR' && !error.includes('هذا') && !error.includes('حدث') && (
                                <p className="text-red-600 dark:text-red-400 text-xs mt-2 pr-2 border-r-2 border-red-400/50" dir="rtl">
                                    {error.includes('Warteliste') ? 'هذا البريد الإلكتروني موجود بالفعل في قائمة الانتظار.' : 'حدث خطأ. يرجى المحاولة مرة أخرى.'}
                                </p>
                            )}
                        </div>
                    )}

                    <p className="text-xs text-slate-400 dark:text-slate-500 text-center mt-4">
                        Kein Spam. Nur wichtige Updates.
                    </p>
                    {language === 'DE_AR' && (
                        <p className="text-emerald-600 dark:text-emerald-400 text-[10px] text-center mt-2 pr-2 border-r-2 border-emerald-400/50" dir="rtl">
                            لا بريد مزعج - تحديثات مهمة فقط
                        </p>
                    )}
                </div>

                {/* Features Preview */}
                <div className="space-y-3 mb-8">
                    {features.map((feature, i) => (
                        <div
                            key={i}
                            className="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-slate-800 flex items-center gap-4"
                        >
                            <div className={`w-12 h-12 ${feature.color} rounded-xl flex items-center justify-center flex-shrink-0`}>
                                <feature.icon className="w-6 h-6 text-white" strokeWidth={2} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="font-bold text-slate-900 dark:text-white">
                                    {feature.title}
                                </h3>
                                {language === 'DE_AR' && (
                                    <p className="text-xs text-slate-400 dark:text-slate-500" dir="rtl">
                                        {feature.titleAr}
                                    </p>
                                )}
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                    {feature.desc}
                                </p>
                                {language === 'DE_AR' && (
                                    <p className="text-emerald-600 dark:text-emerald-400 text-xs mt-1 pr-1 border-r-2 border-emerald-400/50" dir="rtl">
                                        {feature.descAr}
                                    </p>
                                )}
                            </div>
                            <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                                <span className="text-slate-400 text-xs">🔒</span>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Back to learning hint */}
                <div className="text-center mt-8">
                    <p className="text-slate-500 dark:text-slate-400 text-sm mb-3">
                        Du kannst jederzeit mit dem Lernen fortfahren
                    </p>
                    {language === 'DE_AR' && (
                        <p className="text-emerald-600 dark:text-emerald-400 text-xs mb-3 pr-2 border-r-2 border-emerald-400/50" dir="rtl">
                            يمكنك متابعة التعلم في أي وقت
                        </p>
                    )}
                    <button
                        onClick={() => navigate('/learn')}
                        className="text-primary font-bold hover:underline flex flex-col items-center"
                    >
                        <span>← Zurück zu den Lektionen</span>
                        {language === 'DE_AR' && (
                            <span className="text-sm font-normal mt-1" dir="rtl">
                                ← العودة إلى الدروس
                            </span>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
