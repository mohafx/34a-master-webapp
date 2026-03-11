import React from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, Clock, CheckCircle, AlertTriangle, Play, ArrowLeft, Languages } from 'lucide-react';
import { useApp } from '../../App';

export default function ExamIntro() {
  const navigate = useNavigate();
  const { language, toggleLanguage, showLanguageToggle } = useApp();
  const [showLanguageWarning, setShowLanguageWarning] = React.useState(false);

  const handleStartExam = () => {
    if (language === 'DE_AR') {
      setShowLanguageWarning(true);
    } else {
      navigate('/written-exam');
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 pb-32">
      {/* Unified Header Card with Integrated Navigation */}
      <div className="pt-3 mb-6 md:mb-8">
        <div className="bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-3xl md:rounded-[2rem] p-5 md:p-10 shadow-card relative overflow-hidden flex flex-col">
          {/* Decorative background elements */}
          <div className="absolute top-0 right-0 w-64 md:w-96 h-64 md:h-96 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-48 md:w-72 h-48 md:h-72 bg-black/10 rounded-full translate-y-1/3 -translate-x-1/3 blur-3xl pointer-events-none" />

          {/* Navigation Buttons Header Area */}
          <div className="flex justify-between items-center mb-5 relative z-10 w-full">
            <button
              onClick={() => navigate('/exam')}
              className="w-10 h-10 md:w-12 md:h-12 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/20 text-white transition-all active:scale-95 shadow-sm"
            >
              <ArrowLeft size={20} className="md:hidden" strokeWidth={2.5} />
              <ArrowLeft size={24} className="hidden md:block" strokeWidth={2.5} />
            </button>

            <div className="text-center absolute left-1/2 -translate-x-1/2 w-full pointer-events-none md:static md:translate-x-0">
              <h1 className="font-black text-lg md:text-2xl text-white tracking-tight uppercase">Prüfungssimulation</h1>
              {language === 'DE_AR' && <p className="text-white/80 font-medium text-[13px] md:text-sm mt-0.5" dir="rtl">محاكاة الامتحان</p>}
            </div>

            {showLanguageToggle ? (
              <button
                onClick={toggleLanguage}
                className={`w-10 h-10 md:w-12 md:h-12 rounded-2xl flex items-center justify-center shadow-sm border-2 transition-all duration-300 flex-shrink-0 ${language === 'DE_AR'
                  ? 'bg-emerald-500 border-emerald-600 text-white shadow-emerald-500/30'
                  : 'bg-white/20 hover:bg-white/30 backdrop-blur-md border-white/20 text-white'
                  }`}
              >
                <Languages size={20} className="md:hidden" strokeWidth={2.5} />
                <Languages size={24} className="hidden md:block" strokeWidth={2.5} />
              </button>
            ) : (
              <div className="w-10 md:w-12" />
            )}
          </div>

          <div className="relative z-10 flex items-start gap-3 md:gap-4 bg-white/10 rounded-2xl md:rounded-[1.5rem] p-3 md:p-6 backdrop-blur-md border border-white/10">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-white/20 rounded-xl md:rounded-2xl flex items-center justify-center flex-shrink-0 shadow-inner">
              <GraduationCap className="text-white md:hidden" size={20} strokeWidth={2.5} />
              <GraduationCap className="text-white hidden md:block" size={24} strokeWidth={2.5} />
            </div>
            <div className="flex-1">
              <h2 className="font-bold md:font-black text-sm md:text-xl mb-0.5 md:mb-1 text-white">IHK-Sachkundeprüfung §34a</h2>
              {language === 'DE_AR' && (
                <p className="text-white/80 text-[11px] md:text-sm mb-1 md:mb-2 text-left" dir="rtl">
                  امتحان الكفاءة IHK §34a
                </p>
              )}
              <p className="text-white/90 text-[11px] md:text-base leading-relaxed max-w-2xl">
                Testen Sie Ihr Wissen unter realistischen Prüfungsbedingungen.
              </p>
              {language === 'DE_AR' && (
                <p className="text-white/70 text-[10px] md:text-sm mt-0.5 md:mt-1.5 leading-relaxed text-left" dir="rtl">
                  اختبر معلوماتك في ظروف امتحان واقعية.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mb-3 md:mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-bold md:font-black text-slate-900 dark:text-white text-base md:text-xl">Prüfungsdetails</h3>
          {language === 'DE_AR' && <p className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400 text-left" dir="rtl">تفاصيل الامتحان</p>}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-850 rounded-[20px] md:rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-800 mb-6 md:mb-8 overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-100 dark:divide-slate-800">
          {/* 82 Fragen */}
          <div className="p-4 md:p-6 flex items-center md:items-start md:flex-col gap-3.5 md:gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center shrink-0">
              <div className="w-3.5 h-3.5 md:w-4 md:h-4 rounded-full border-2 md:border-4 border-blue-600 dark:border-blue-400"></div>
            </div>
            <div className="flex-1">
              <span className="block font-bold md:font-black text-slate-900 dark:text-white text-sm md:text-base mb-0.5 md:mb-1">82 Fragen</span>
              {language === 'DE_AR' && <p className="text-[11px] md:text-xs text-blue-700 dark:text-blue-400 text-left font-bold mb-0.5 md:mb-1" dir="rtl">82 سؤال</p>}
              <span className="text-[11px] md:text-xs text-slate-500 dark:text-slate-400 leading-tight">Multiple-Choice-Fragen aus allen Themenbereichen</span>
              {language === 'DE_AR' && <p className="text-[10px] md:text-[10px] text-slate-400 dark:text-slate-500 text-left mt-0.5 md:mt-1" dir="rtl">أسئلة اختيار من متعدد من جميع المجالات</p>}
            </div>
          </div>

          {/* 120 Minuten */}
          <div className="p-4 md:p-6 flex items-center md:items-start md:flex-col gap-3.5 md:gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-2xl flex items-center justify-center shrink-0">
              <Clock size={20} className="md:hidden" strokeWidth={1.5} />
              <Clock size={24} className="hidden md:block" strokeWidth={2} />
            </div>
            <div className="flex-1">
              <span className="block font-bold md:font-black text-slate-900 dark:text-white text-sm md:text-base mb-0.5 md:mb-1">120 Minuten</span>
              {language === 'DE_AR' && <p className="text-[11px] md:text-xs text-amber-700 dark:text-amber-400 text-left font-bold mb-0.5 md:mb-1" dir="rtl">120 دقيقة</p>}
              <span className="text-[11px] md:text-xs text-slate-500 dark:text-slate-400 leading-tight">Zeitlimit entspricht der echten IHK-Prüfung</span>
              {language === 'DE_AR' && <p className="text-[10px] md:text-[10px] text-slate-400 dark:text-slate-500 text-left mt-0.5 md:mt-1" dir="rtl">الحد الزمني يطابق الامتحان الحقيقي</p>}
            </div>
          </div>

          {/* 50% zum Bestehen */}
          <div className="p-4 md:p-6 flex items-center md:items-start md:flex-col gap-3.5 md:gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-2xl flex items-center justify-center shrink-0">
              <CheckCircle size={20} className="md:hidden" strokeWidth={1.5} />
              <CheckCircle size={24} className="hidden md:block" strokeWidth={2} />
            </div>
            <div className="flex-1">
              <span className="block font-bold md:font-black text-slate-900 dark:text-white text-sm md:text-base mb-0.5 md:mb-1">50% zum Bestehen</span>
              {language === 'DE_AR' && <p className="text-[11px] md:text-xs text-green-700 dark:text-green-400 text-left font-bold mb-0.5 md:mb-1" dir="rtl">50% للنجاح</p>}
              <span className="text-[11px] md:text-xs text-slate-500 dark:text-slate-400 leading-tight">Mindestens 60 von 120 Punkten erreichen</span>
              {language === 'DE_AR' && <p className="text-[10px] md:text-[10px] text-slate-400 dark:text-slate-500 text-left mt-0.5 md:mt-1" dir="rtl">تحقيق 60 نقطة على الأقل من أصل 120</p>}
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={handleStartExam}
        className="w-full bg-gradient-to-br from-amber-500 to-orange-600 text-white font-bold md:font-black py-4 md:py-5 rounded-[20px] md:rounded-[2rem] shadow-lg md:shadow-xl shadow-amber-500/20 hover:scale-[1.02] hover:shadow-amber-500/30 transition-all active:scale-[0.98] flex flex-col items-center justify-center gap-0.5 md:gap-1 group"
      >
        <div className="flex items-center gap-2 md:gap-3">
          <Play fill="currentColor" size={18} className="md:hidden" />
          <Play fill="currentColor" size={24} className="hidden md:block group-hover:scale-110 transition-transform" />
          <span className="text-[15px] md:text-lg">Prüfung starten</span>
        </div>
        {language === 'DE_AR' && <span className="text-sm font-medium opacity-80">ابدأ الامتحان</span>}
      </button>

      <div className="mt-8 bg-white dark:bg-slate-850 border-l-4 border-amber-500 p-5 rounded-r-[2rem] shadow-sm">
        <div className="flex items-center gap-2 mb-2 text-amber-600 dark:text-amber-400 font-black text-sm">
          <AlertTriangle size={18} />
          <span>WICHTIGE HINWEISE</span>
        </div>
        <div className="space-y-2">
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
            Achten Sie auf die genaue Fragestellung. Manche Fragen haben zwei richtige Antworten. Die arabische Übersetzung kann bei der Prüfungssimulation nicht aktiviert werden, um die Prüfungssituation maximal zu simulieren.
          </p>

          {language === 'DE_AR' && (
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-left" dir="rtl">
              <p className="text-xs font-bold text-amber-600 dark:text-amber-400 mb-1">ملاحظات هامة</p>
              <div className="space-y-1">
                <p className="text-xs text-slate-500 dark:text-slate-400">انتبه لصياغة السؤال بدقة. بعض الأسئلة لها إجابتان صحيحتان.</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">لا يمكن تفعيل الترجمة العربية في محاكاة الامتحان لضمان محاكاة ظروف الامتحان بأقصى قدر ممكن.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Language Warning Dialog */}
      {
        showLanguageWarning && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
            <div className="bg-white dark:bg-slate-800 rounded-[20px] p-6 max-w-md w-full">
              <div className="flex items-center gap-3 text-amber-500 mb-2">
                <AlertTriangle size={24} />
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                  Hinweis zur Sprache
                </h3>
              </div>
              {language === 'DE_AR' && (
                <p className="text-amber-600 font-bold text-sm mb-3 text-right" dir="rtl">
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
                    toggleLanguage(); // Switch to German
                    navigate('/written-exam');
                  }}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-primary text-white font-bold hover:bg-primary/90 transition-colors text-sm"
                >
                  Verstanden & Starten
                  {language === 'DE_AR' && <span className="block text-xs opacity-70 mt-0.5 font-normal">فهمت وابدأ</span>}
                </button>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
}