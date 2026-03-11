import React, { useState, useEffect } from 'react';
import { X, Trophy, Zap, Rocket, UserPlus } from 'lucide-react';
import { Button } from './Button';
import { Card } from './Card';
import { useApp } from '../../App';
import * as Icons from 'lucide-react';

interface GuestProgressPopupProps {
  onClose: () => void;
  onRegister: () => void;
  correctAnswersCount: number;
}

export function GuestProgressPopup({ onClose, onRegister, correctAnswersCount }: GuestProgressPopupProps) {
  const { language } = useApp();
  const showArabic = language === 'DE_AR';
  const [messageIndex, setMessageIndex] = useState(0);

  // Motivational messages
  const messages = [
    {
      de: "Super gemacht!",
      ar: "عمل رائع!",
      icon: Trophy
    },
    {
      de: "Weiter so!",
      ar: "استمر هكذا!",
      icon: Zap
    },
    {
      de: "Du machst das toll!",
      ar: "أنت تبلي بلاءً حسناً!",
      icon: Rocket
    }
  ];

  useEffect(() => {
    // Select random message on mount
    setMessageIndex(Math.floor(Math.random() * messages.length));
  }, []);

  const handleClose = () => {
    onClose();
  };

  const currentMessage = messages[messageIndex];
  const Icon = currentMessage.icon;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-300"
      onClick={handleClose}
    >
      <div 
        className="w-full max-w-sm transform bg-white dark:bg-slate-900 rounded-2xl shadow-2xl shadow-black/20 animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 ease-out relative"
        onClick={e => e.stopPropagation()}
      >
        <Card className="overflow-hidden border-none bg-transparent shadow-none relative" padding="none">
          {/* Close button */}
          <button 
            onClick={handleClose}
            className="absolute top-3 right-3 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors z-10"
          >
            <X size={20} />
          </button>
          
          <div className="p-6 text-center">
            {/* Icon Bubble */}
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4 relative">
              <Icon size={32} className="text-primary" />
            </div>

            {/* Title / Motivation */}
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">
              {currentMessage.de}
            </h2>
            {showArabic && (
              <p className="text-sm font-bold text-primary dark:text-primary-light mb-4" dir="rtl">
                {currentMessage.ar}
              </p>
            )}

            {/* Context message */}
            <div className={`bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 mb-6 border border-slate-100 dark:border-slate-800 ${showArabic ? 'mt-3' : 'mt-4'}`}>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Dein Lernfortschritt geht beim Schließen verloren. Speichere ihn mit einem kostenlosen Account!
              </p>
              {showArabic && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2" dir="rtl">
                  سيضيع تقدمك في التعلم عند الإغلاق. احفظه باستخدام حساب مجاني!
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <Button 
                variant="primary" 
                fullWidth 
                onClick={onRegister}
                leftIcon={<UserPlus size={18} />}
                className="py-3 shadow-lg shadow-primary/20"
              >
                <div className="flex flex-col items-center">
                  <span>Kostenlos registrieren</span>
                  {showArabic && <span className="text-[10px] opacity-90 font-normal mt-0.5" dir="rtl">تسجيل مجاني</span>}
                </div>
              </Button>
              
              <button 
                onClick={handleClose}
                className="w-full py-2 text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors flex flex-col items-center group"
              >
                <span>Weiter ohne Speichern</span>
                {showArabic && <span className="text-[10px] mt-0.5 opacity-80" dir="rtl">المتابعة بدون حفظ</span>}
              </button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
