import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Lock, CheckCircle, XCircle, Loader2, Eye, EyeOff } from 'lucide-react';
import { useApp } from '../../App';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { language } = useApp();
  const showArabic = language === 'DE_AR';
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [status, setStatus] = useState<'input' | 'loading' | 'success' | 'error'>('input');
  const [message, setMessage] = useState('');

  useEffect(() => {
    // Check if we have the required tokens in URL
    const access_token = searchParams.get('access_token');
    const refresh_token = searchParams.get('refresh_token');

    if (!access_token || !refresh_token) {
      setStatus('error');
      setMessage('Ungültiger Link. Bitte fordere einen neuen Link an.');
      return;
    }

    // Set session to allow password reset
    supabase.auth.setSession({
      access_token,
      refresh_token
    }).catch((err) => {
      setStatus('error');
      setMessage(err.message || 'Fehler beim Verarbeiten des Links.');
    });
  }, [searchParams]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword.length < 6) {
      setMessage(showArabic 
        ? 'Das Passwort muss mindestens 6 Zeichen haben.\nيجب أن تتكون كلمة المرور من 6 أحرف على الأقل.'
        : 'Das Passwort muss mindestens 6 Zeichen haben.');
      setStatus('error');
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage(showArabic
        ? 'Die Passwörter stimmen nicht überein.\nكلمات المرور غير متطابقة.'
        : 'Die Passwörter stimmen nicht überein.');
      setStatus('error');
      return;
    }

    setStatus('loading');
    setMessage('');

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) {
        setStatus('error');
        setMessage(error.message || 'Fehler beim Zurücksetzen des Passworts.');
        return;
      }

      setStatus('success');
      setMessage('Passwort erfolgreich zurückgesetzt!');

      // Redirect to login after 2 seconds
      setTimeout(() => {
        navigate('/');
      }, 2000);
    } catch (err: any) {
      setStatus('error');
      setMessage(err.message || 'Ein Fehler ist aufgetreten.');
    }
  };

  return (
    <div className="min-h-screen bg-[#F2F4F6] dark:bg-slate-950 flex items-center justify-center p-6">
      <Card className="max-w-md w-full" padding="lg">
        {status === 'input' && (
          <>
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Lock size={32} className="text-blue-600 dark:text-blue-400" />
              </div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">
                Neues Passwort setzen
              </h2>
              {showArabic && (
                <p className="text-lg text-slate-500 dark:text-slate-400 mb-4 font-bold" dir="rtl">
                  تعيين كلمة مرور جديدة
                </p>
              )}
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Gib dein neues Passwort ein
              </p>
              {showArabic && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1" dir="rtl">
                  أدخل كلمة المرور الجديدة
                </p>
              )}
            </div>

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Neues Passwort
                  {showArabic && <span className="text-emerald-600 dark:text-emerald-400 mr-2" dir="rtl"> / كلمة المرور الجديدة</span>}
                </label>
                <div className="relative">
                  <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full pl-10 pr-12 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    placeholder="••••••••"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Mindestens 6 Zeichen
                  {showArabic && <span className="text-emerald-600 dark:text-emerald-400 mr-2" dir="rtl"> / 6 أحرف على الأقل</span>}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Passwort bestätigen
                  {showArabic && <span className="text-emerald-600 dark:text-emerald-400 mr-2" dir="rtl"> / تأكيد كلمة المرور</span>}
                </label>
                <div className="relative">
                  <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-10 pr-12 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    placeholder="••••••••"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {message && status === 'error' && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-2.5 rounded-xl text-sm whitespace-pre-line">
                  {message}
                </div>
              )}

              <Button
                type="submit"
                fullWidth
                variant="primary"
                disabled={status === 'loading'}
              >
                {status === 'loading' ? 'Wird gespeichert...' : 'Passwort speichern'}
                {showArabic && status !== 'loading' && (
                  <span className="text-sm font-normal mt-1" dir="rtl">حفظ كلمة المرور</span>
                )}
              </Button>
            </form>
          </>
        )}

        {status === 'loading' && (
          <>
            <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Loader2 size={32} className="text-blue-600 dark:text-blue-400 animate-spin" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2 text-center">
              Passwort wird gespeichert...
            </h2>
            {showArabic && (
              <p className="text-lg text-slate-500 dark:text-slate-400 mb-4 font-bold text-center" dir="rtl">
                جاري حفظ كلمة المرور...
              </p>
            )}
          </>
        )}

        {status === 'success' && (
          <>
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={32} className="text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">
                Passwort zurückgesetzt!
              </h2>
              {showArabic && (
                <p className="text-lg text-slate-500 dark:text-slate-400 mb-4 font-bold" dir="rtl">
                  تم إعادة تعيين كلمة المرور!
                </p>
              )}
              <p className="text-slate-600 dark:text-slate-400 mb-6">
                {message}
              </p>
              <Button
                fullWidth
                variant="primary"
                onClick={() => navigate('/')}
              >
                Zum Dashboard
              </Button>
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="text-center">
              <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <XCircle size={32} className="text-red-600 dark:text-red-400" />
              </div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">
                Fehler
              </h2>
              {showArabic && (
                <p className="text-lg text-slate-500 dark:text-slate-400 mb-4 font-bold" dir="rtl">
                  خطأ
                </p>
              )}
              <p className="text-slate-600 dark:text-slate-400 mb-6 whitespace-pre-line">
                {message}
              </p>
              <div className="flex gap-3">
                <Button
                  fullWidth
                  variant="secondary"
                  onClick={() => navigate('/profile')}
                >
                  Zum Profil
                </Button>
                <Button
                  fullWidth
                  variant="primary"
                  onClick={() => navigate('/')}
                >
                  Zum Dashboard
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}


























