import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { CheckCircle, XCircle, Loader2, ArrowRight } from 'lucide-react';
import { useApp } from '../../App';

export default function EmailConfirmation() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { language } = useApp();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const handleEmailConfirmation = async () => {
      try {
        // Supabase kann verschiedene URL-Parameter-Formate verwenden
        const token_hash = searchParams.get('token_hash');
        const type = searchParams.get('type');
        const access_token = searchParams.get('access_token');
        const refresh_token = searchParams.get('refresh_token');

        // Wenn access_token vorhanden ist, wurde die Bestätigung bereits verarbeitet
        if (access_token && refresh_token) {
          // Session wird automatisch durch Supabase Client gesetzt
          const { data: { session }, error: sessionError } = await supabase.auth.setSession({
            access_token,
            refresh_token
          });

          if (sessionError) {
            setStatus('error');
            setMessage(sessionError.message || 'Fehler bei der Sitzungserstellung.');
            return;
          }

          if (session?.user) {
            setStatus('success');
            setMessage('E-Mail erfolgreich bestätigt! Willkommen!');
            setTimeout(() => {
              navigate('/');
            }, 2000);
          }
          return;
        }

        // Alternative: OTP-Verifizierung mit token_hash
        if (token_hash && type) {
          const { data, error } = await supabase.auth.verifyOtp({
            token_hash,
            type: type as any
          });

          if (error) {
            setStatus('error');
            setMessage(error.message || 'Fehler bei der E-Mail-Bestätigung.');
            return;
          }

          if (data.user) {
            setStatus('success');
            setMessage('E-Mail erfolgreich bestätigt! Willkommen!');
            setTimeout(() => {
              navigate('/');
            }, 2000);
          }
          return;
        }

        // Keine gültigen Parameter gefunden
        setStatus('error');
        setMessage('Ungültiger Bestätigungslink. Bitte verwenden Sie den Link aus der E-Mail.');
      } catch (err: any) {
        setStatus('error');
        setMessage(err.message || 'Ein Fehler ist aufgetreten.');
      }
    };

    handleEmailConfirmation();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen bg-[#F2F4F6] dark:bg-slate-950 flex items-center justify-center p-6">
      <Card className="max-w-md w-full text-center" padding="lg">
        {status === 'loading' && (
          <>
            <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Loader2 size={32} className="text-blue-600 dark:text-blue-400 animate-spin" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">
              E-Mail wird bestätigt...
            </h2>
            {language === 'DE_AR' && (
              <p className="text-lg text-slate-500 dark:text-slate-400 mb-4 font-bold" dir="rtl">
                جاري تأكيد البريد الإلكتروني...
              </p>
            )}
            <p className="text-slate-600 dark:text-slate-400">
              Bitte warten Sie einen Moment.
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} className="text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">
              E-Mail bestätigt!
            </h2>
            {language === 'DE_AR' && (
              <p className="text-lg text-slate-500 dark:text-slate-400 mb-4 font-bold" dir="rtl">
                تم تأكيد البريد الإلكتروني!
              </p>
            )}
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              {message}
            </p>
            <Button
              fullWidth
              variant="primary"
              onClick={() => navigate('/')}
              rightIcon={<ArrowRight size={20} />}
            >
              Zum Dashboard
            </Button>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <XCircle size={32} className="text-red-600 dark:text-red-400" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">
              Bestätigung fehlgeschlagen
            </h2>
            {language === 'DE_AR' && (
              <p className="text-lg text-slate-500 dark:text-slate-400 mb-4 font-bold" dir="rtl">
                فشل التأكيد
              </p>
            )}
            <p className="text-slate-600 dark:text-slate-400 mb-6">
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
          </>
        )}
      </Card>
    </div>
  );
}


























