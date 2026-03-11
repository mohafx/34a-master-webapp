import React, { useState, useEffect } from 'react';
import { Lightbulb, Sparkles, Rocket, Star, Heart, Zap } from 'lucide-react';

interface MotivationalTipProps {
    language: string;
}

const tips = [
    { emoji: '🎯', text: 'Jeden Tag 15 Minuten lernen ist besser als einmal die Woche 2 Stunden!', textAr: 'التعلم 15 دقيقة يومياً أفضل من ساعتين مرة واحدة في الأسبوع!', color: 'from-blue-500 to-cyan-500' },
    { emoji: '💪', text: 'Du schaffst das! Jede richtige Antwort bringt dich näher zum Ziel.', textAr: 'يمكنك القيام بذلك! كل إجابة صحيحة تقربك من الهدف.', color: 'from-green-500 to-emerald-500' },
    { emoji: '🚀', text: 'Wiederholung ist der Schlüssel zum Erfolg. Bleib dran!', textAr: 'التكرار هو مفتاح النجاح. استمر!', color: 'from-purple-500 to-pink-500' },
    { emoji: '⭐', text: 'Kleine Schritte führen zu großen Erfolgen. Weitermachen!', textAr: 'الخطوات الصغيرة تؤدي إلى نجاحات كبيرة. استمر!', color: 'from-amber-500 to-orange-500' },
    { emoji: '🎓', text: 'Wissen ist Macht. Du investierst in deine Zukunft!', textAr: 'المعرفة قوة. أنت تستثمر في مستقبلك!', color: 'from-indigo-500 to-blue-500' },
    { emoji: '🔥', text: 'Deine Motivation heute ist dein Erfolg morgen!', textAr: 'حافزك اليوم هو نجاحك غداً!', color: 'from-red-500 to-rose-500' },
    { emoji: '✨', text: 'Jeder Fehler ist eine Chance zu lernen. Nutze sie!', textAr: 'كل خطأ هو فرصة للتعلم. استفد منها!', color: 'from-yellow-500 to-amber-500' },
    { emoji: '🎯', text: 'Konzentriere dich auf den Fortschritt, nicht auf Perfektion.', textAr: 'ركز على التقدم، وليس على الكمال.', color: 'from-teal-500 to-cyan-500' },
    { emoji: '💡', text: 'Verstehen ist wichtiger als auswendig lernen!', textAr: 'الفهم أهم من الحفظ!', color: 'from-lime-500 to-green-500' },
    { emoji: '🌟', text: 'Du bist stärker als du denkst. Glaub an dich!', textAr: 'أنت أقوى مما تعتقد. آمن بنفسك!', color: 'from-fuchsia-500 to-purple-500' },
    { emoji: '🎊', text: 'Feiere jeden kleinen Erfolg auf deinem Weg!', textAr: 'احتفل بكل نجاح صغير في طريقك!', color: 'from-pink-500 to-rose-500' },
    { emoji: '🧠', text: 'Dein Gehirn ist wie ein Muskel - trainiere es täglich!', textAr: 'دماغك مثل العضلة - درّبه يومياً!', color: 'from-violet-500 to-purple-500' },
    { emoji: '⚡', text: 'Energie folgt der Aufmerksamkeit. Fokussiere dich!', textAr: 'الطاقة تتبع الانتباه. ركز!', color: 'from-yellow-500 to-orange-500' },
    { emoji: '🏆', text: 'Champions werden nicht geboren, sie werden gemacht!', textAr: 'الأبطال لا يولدون، بل يُصنعون!', color: 'from-amber-500 to-yellow-500' },
    { emoji: '🌈', text: 'Nach jedem Regen kommt ein Regenbogen. Bleib positiv!', textAr: 'بعد كل مطر يأتي قوس قزح. ابق إيجابياً!', color: 'from-blue-500 to-indigo-500' },
    { emoji: '🎪', text: 'Mach Lernen zu einem Abenteuer, nicht zu einer Pflicht!', textAr: 'اجعل التعلم مغامرة، وليس واجباً!', color: 'from-red-500 to-pink-500' },
    { emoji: '🌺', text: 'Wachstum braucht Zeit. Sei geduldig mit dir selbst.', textAr: 'النمو يحتاج وقتاً. كن صبوراً مع نفسك.', color: 'from-pink-500 to-fuchsia-500' },
    { emoji: '🎨', text: 'Kreativität beim Lernen macht es unvergesslich!', textAr: 'الإبداع في التعلم يجعله لا يُنسى!', color: 'from-purple-500 to-indigo-500' },
    { emoji: '🔑', text: 'Der Schlüssel zum Erfolg liegt in der Beständigkeit.', textAr: 'مفتاح النجاح يكمن في الثبات.', color: 'from-cyan-500 to-blue-500' },
    { emoji: '🎁', text: 'Jede Lerneinheit ist ein Geschenk an dein zukünftiges Ich!', textAr: 'كل جلسة تعلم هي هدية لنفسك المستقبلية!', color: 'from-green-500 to-teal-500' },
    { emoji: '🌟', text: 'Deine Zukunft wird von dem bestimmt, was du heute tust.', textAr: 'مستقبلك يتحدد بما تفعله اليوم.', color: 'from-orange-500 to-red-500' },
    { emoji: '💎', text: 'Du bist wertvoll. Investiere in deine Bildung!', textAr: 'أنت ثمين. استثمر في تعليمك!', color: 'from-indigo-500 to-purple-500' },
    { emoji: '🎯', text: 'Setze dir klare Ziele und verfolge sie konsequent!', textAr: 'حدد أهدافاً واضحة واتبعها بثبات!', color: 'from-blue-500 to-cyan-500' },
    { emoji: '🌸', text: 'Selbstvertrauen wächst mit jedem Erfolg. Mach weiter!', textAr: 'الثقة بالنفس تنمو مع كل نجاح. استمر!', color: 'from-pink-500 to-rose-500' },
    { emoji: '⚡', text: 'Deine Energie heute formt deine Realität morgen!', textAr: 'طاقتك اليوم تشكل واقعك غداً!', color: 'from-yellow-500 to-amber-500' },
    { emoji: '🎓', text: 'Bildung ist die mächtigste Waffe, um die Welt zu verändern.', textAr: 'التعليم هو السلاح الأقوى لتغيير العالم.', color: 'from-teal-500 to-green-500' },
    { emoji: '🌟', text: 'Glaube an dich selbst und alles ist möglich!', textAr: 'آمن بنفسك وكل شيء ممكن!', color: 'from-purple-500 to-pink-500' },
    { emoji: '🚀', text: 'Der beste Zeitpunkt anzufangen war gestern. Der zweitbeste ist jetzt!', textAr: 'أفضل وقت للبدء كان بالأمس. الثاني هو الآن!', color: 'from-blue-500 to-indigo-500' },
    { emoji: '💪', text: 'Herausforderungen sind Chancen in Verkleidung!', textAr: 'التحديات هي فرص متنكرة!', color: 'from-green-500 to-emerald-500' },
    { emoji: '✨', text: 'Du bist auf dem richtigen Weg. Vertraue dem Prozess!', textAr: 'أنت على الطريق الصحيح. ثق بالعملية!', color: 'from-amber-500 to-orange-500' }
];

export default function MotivationalTip({ language }: MotivationalTipProps) {
    const [currentTipIndex, setCurrentTipIndex] = useState(0);

    useEffect(() => {
        // Calculate tip index based on current hour
        const updateTip = () => {
            const now = new Date();
            const hourOfDay = now.getHours();
            // Use hour to determine which tip to show (cycles through all 30 tips)
            const index = hourOfDay % tips.length;
            setCurrentTipIndex(index);
        };

        updateTip();

        // Update every hour
        const interval = setInterval(updateTip, 60 * 60 * 1000);

        return () => clearInterval(interval);
    }, []);

    const currentTip = tips[currentTipIndex];

    return (
        <div className="mt-6 mb-4">
            <div className={`bg-gradient-to-br ${currentTip.color} rounded-[28px] p-6 shadow-lg relative overflow-hidden`}>
                {/* Decorative background elements */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16" />
                <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full -ml-12 -mb-12" />

                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center text-2xl">
                            {currentTip.emoji}
                        </div>
                        <div className="flex items-center gap-2">
                            <Sparkles className="text-white/80" size={18} />
                            <span className="text-white/90 font-bold text-sm uppercase tracking-wide">
                                Tipp des Tages
                            </span>
                        </div>
                    </div>

                    <p className="text-white font-bold text-base leading-relaxed mb-2">
                        {currentTip.text}
                    </p>

                    {language === 'DE_AR' && (
                        <p className="text-white/90 text-sm leading-relaxed text-right" dir="rtl">
                            {currentTip.textAr}
                        </p>
                    )}

                    {/* Tip counter */}
                    <div className="mt-4 flex items-center justify-between">
                        <div className="flex gap-1">
                            {tips.slice(0, 5).map((_, idx) => (
                                <div
                                    key={idx}
                                    className={`w-1.5 h-1.5 rounded-full transition-all ${idx === currentTipIndex % 5 ? 'bg-white w-4' : 'bg-white/40'
                                        }`}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
