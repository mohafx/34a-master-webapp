import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Clock, CheckCircle, AlertTriangle, ArrowLeft } from 'lucide-react';
import { useApp } from '../../App';

export default function MiniExamIntro() {
    const navigate = useNavigate();
    const { language, toggleLanguage } = useApp();
    const [showLanguageWarning, setShowLanguageWarning] = React.useState(false);

    const handleStartExam = () => {
        if (language === 'DE_AR') {
            setShowLanguageWarning(true);
        } else {
            navigate('/mini-exam');
        }
    };

    const features = [
        {
            icon: <Zap size={18} strokeWidth={2.5} />,
            title: '16 Fragen',
            titleAr: '16 سؤال',
            desc: 'Repräsentative Auswahl aus allen Bereichen',
            descAr: 'أسئلة اختيار من متعدد من جميع المجالات',
        },
        {
            icon: <Clock size={18} strokeWidth={2.5} />,
            title: '20 Minuten',
            titleAr: '20 دقيقة',
            desc: 'Perfekt für eine schnelle Übung zwischendurch',
            descAr: 'مثالي للتمرين السريع',
        },
        {
            icon: <CheckCircle size={18} strokeWidth={2.5} />,
            title: '50 % zum Bestehen',
            titleAr: '50% للنجاح',
            desc: 'Mindestens 8 von 16 Fragen richtig beantworten',
            descAr: 'الإجابة على 8 أسئلة على الأقل من أصل 16',
        },
    ];

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
            <div className="max-w-md mx-auto px-5 pt-3 pb-36">

                {/* Nav */}
                <div className="flex items-center gap-3 pt-3 mb-8">
                    <button
                        onClick={() => navigate(-1)}
                        className="w-10 h-10 flex-shrink-0 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center border border-slate-100 dark:border-slate-700 text-slate-600 dark:text-slate-300 transition-all active:scale-95 shadow-sm"
                    >
                        <ArrowLeft size={18} strokeWidth={2.5} />
                    </button>
                    <h1 className="font-black text-base text-slate-900 dark:text-white">Mini-Prüfung</h1>
                </div>

                {/* Hero Icon */}
                <div className="flex flex-col items-center text-center mb-6">
                    <div className="w-20 h-20 rounded-[24px] bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center mb-4">
                        <Zap size={36} strokeWidth={2} className="text-blue-600 dark:text-blue-400" />
                    </div>
                    <p className="text-[13px] text-slate-500 dark:text-slate-400 max-w-[240px] leading-relaxed">
                        Schnelle Wissensüberprüfung für zwischendurch.
                        {language === 'DE_AR' && (
                            <span className="block mt-1 text-slate-400 dark:text-slate-500" dir="rtl">اختبار سريع للمعرفة</span>
                        )}
                    </p>
                </div>

                {/* Info Card */}
                <div className="mb-5 rounded-[24px] border border-slate-100 bg-white px-5 py-5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] dark:border-slate-700 dark:bg-slate-800">
                    <h2 className="font-bold text-[15px] text-slate-900 dark:text-white mb-4">Prüfungsdetails</h2>
                    <div className="flex flex-col gap-3">
                        {features.map((item) => (
                            <div key={item.title} className="flex items-center gap-3">
                                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                                    {item.icon}
                                </div>
                                <div>
                                    <span className="text-[13px] font-bold text-slate-800 dark:text-white block leading-tight">{item.title}</span>
                                    <span className="text-[12px] text-slate-500 dark:text-slate-400 leading-tight">{item.desc}</span>
                                    {language === 'DE_AR' && (
                                        <span className="text-[11px] text-slate-400 dark:text-slate-500 block leading-tight" dir="rtl">{item.descAr}</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Hinweis */}
                <div className="rounded-[20px] border border-blue-100 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-900/10 px-5 py-4">
                    <div className="flex items-center gap-2 mb-1 text-blue-600 dark:text-blue-400 font-bold text-[13px]">
                        <AlertTriangle size={15} strokeWidth={2.5} />
                        <span>Hinweis</span>
                    </div>
                    <p className="text-[12px] text-slate-600 dark:text-slate-400 leading-relaxed">
                        Die Mini-Prüfung enthält Fragen aus allen Bereichen in proportionaler Verteilung wie die echte IHK-Prüfung.
                    </p>
                    {language === 'DE_AR' && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-500 leading-relaxed mt-1 text-right" dir="rtl">
                            يحتوي الامتحان المصغر على أسئلة من جميع المجالات بتوزيع متناسب.
                        </p>
                    )}
                </div>

            </div>

            {/* Fixed CTA */}
            <div className="fixed inset-x-0 bottom-0 md:static p-4 md:p-0 bg-white/80 dark:bg-slate-950/80 md:bg-transparent backdrop-blur-md md:backdrop-blur-none border-t border-slate-100 dark:border-slate-800 md:border-0">
                <button
                    onClick={handleStartExam}
                    className="w-full flex items-center justify-center gap-2.5 py-4 rounded-[24px] font-black text-base text-white bg-gradient-to-r from-blue-600 to-blue-700 shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-all"
                >
                    <Zap size={20} strokeWidth={2.5} />
                    <span>Mini-Prüfung starten</span>
                    {language === 'DE_AR' && <span className="font-normal opacity-80 text-sm">· ابدأ الامتحان</span>}
                </button>
            </div>

            {/* Language Warning Dialog */}
            {showLanguageWarning && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
                    <div className="bg-white dark:bg-slate-800 rounded-[20px] p-6 max-w-md w-full">
                        <div className="flex items-center gap-3 text-blue-500 mb-2">
                            <AlertTriangle size={24} />
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                                Hinweis zur Sprache
                            </h3>
                        </div>
                        {language === 'DE_AR' && (
                            <p className="text-blue-600 font-bold text-sm mb-3 text-right" dir="rtl">
                                تنبيه بخصوص اللغة
                            </p>
                        )}
                        <p className="text-slate-600 dark:text-slate-400 mb-4 text-sm leading-relaxed">
                            Um die echte Prüfungssituation zu simulieren, ist die arabische Übersetzung in diesem Modus <b>nicht verfügbar</b>. Die Sprache wird nun auf Deutsch umgestellt.
                        </p>
                        {language === 'DE_AR' && (
                            <p className="text-slate-500 dark:text-slate-400 mb-6 text-sm leading-relaxed text-right" dir="rtl">
                                لمحاكاة ظروف الامتحان الحقيقية، الترجمة العربية <b>غير متاحة</b> في هذا الوضع. سيتم تغيير اللغة إلى الألمانية الآن.
                            </p>
                        )}
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowLanguageWarning(false)}
                                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors font-medium text-sm"
                            >
                                Abbrechen
                                {language === 'DE_AR' && <span className="block text-xs opacity-70 mt-0.5">إلغاء</span>}
                            </button>
                            <button
                                onClick={() => {
                                    toggleLanguage();
                                    navigate('/mini-exam');
                                }}
                                className="flex-1 px-4 py-2.5 rounded-xl bg-primary text-white font-bold hover:bg-primary/90 transition-colors text-sm"
                            >
                                Verstanden & Starten
                                {language === 'DE_AR' && <span className="block text-xs opacity-70 mt-0.5 font-normal">فهمت وابدأ</span>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
