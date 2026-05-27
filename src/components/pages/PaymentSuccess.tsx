import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle, Loader2, Mail, ShieldCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { isLocalhostDev } from '../../utils/isLocalhostDev';

type VerificationState = 'checking' | 'success' | 'pending' | 'failed';

interface VerifyCheckoutResponse {
    isSuccess?: boolean;
    isPremium?: boolean;
    sessionStatus?: string;
    paymentStatus?: string;
    checkoutMode?: 'guest' | 'authenticated';
    isGuest?: boolean;
    email?: string | null;
    plan?: string | null;
    error?: string;
}

export default function PaymentSuccess() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const sessionId = searchParams.get('session_id');
    const isDevPaymentSuccess = isLocalhostDev() && searchParams.get('dev_payment') === 'success';
    const { user } = useAuth();
    const { refreshSubscription } = useSubscription();
    const [state, setState] = useState<VerificationState>(isDevPaymentSuccess ? 'success' : sessionId ? 'checking' : 'failed');
    const [details, setDetails] = useState<VerifyCheckoutResponse | null>(
        isDevPaymentSuccess
            ? {
                isSuccess: true,
                isPremium: true,
                sessionStatus: 'complete',
                paymentStatus: 'paid',
                checkoutMode: 'authenticated',
                isGuest: false,
                email: 'premium@localhost.dev',
                plan: '6months',
            }
            : null,
    );
    const hasRefreshedSubscriptionRef = useRef(false);
    const refreshSubscriptionRef = useRef(refreshSubscription);

    useEffect(() => {
        refreshSubscriptionRef.current = refreshSubscription;
    }, [refreshSubscription]);

    useEffect(() => {
        let cancelled = false;
        let timeout: ReturnType<typeof setTimeout> | null = null;

        async function verify(attempt = 1) {
            if (isDevPaymentSuccess) {
                setState('success');
                return;
            }

            if (!sessionId) {
                setState('failed');
                return;
            }

            const { data, error } = await supabase.functions.invoke<VerifyCheckoutResponse>('verify-checkout', {
                body: { sessionId },
            });

            if (cancelled) return;

            if (error) {
                setDetails({ error: error.message });
                setState(attempt >= 5 ? 'failed' : 'checking');
            } else {
                setDetails(data || null);

                if (data?.isSuccess && data?.paymentStatus === 'paid') {
                    setState('success');
                    if (user && !hasRefreshedSubscriptionRef.current) {
                        hasRefreshedSubscriptionRef.current = true;
                        await refreshSubscriptionRef.current();
                    }
                    return;
                }

                if (data?.sessionStatus === 'open' || data?.sessionStatus === 'expired' || data?.sessionStatus === 'not_found') {
                    setState('failed');
                    return;
                }

                if (attempt >= 15) {
                    setState('pending');
                    return;
                }
            }

            timeout = setTimeout(() => verify(attempt + 1), 2000);
        }

        verify();

        return () => {
            cancelled = true;
            if (timeout) clearTimeout(timeout);
        };
    }, [isDevPaymentSuccess, sessionId, user?.id]);

    const isGuest = details?.isGuest || details?.checkoutMode === 'guest' || (!user && state === 'success');
    const email = details?.email;
    const activationPending = state === 'success' && details?.isPremium === false;

    const content = {
        checking: {
            icon: <Loader2 size={42} className="text-blue-600 animate-spin" strokeWidth={1.8} />,
            iconBg: 'bg-blue-50',
            title: 'Zahlung wird bestätigt',
            text: 'Wir prüfen deine Zahlung und schalten Premium automatisch frei.',
            panelTitle: 'Bitte kurz warten',
            panelText: 'Das dauert normalerweise nur wenige Sekunden.',
        },
        success: {
            icon: <CheckCircle size={44} className="text-green-500" strokeWidth={1.8} />,
            iconBg: 'bg-green-50',
            title: 'Zahlung erfolgreich',
            text: activationPending
                ? 'Deine Zahlung wurde bestätigt. Wir aktualisieren deinen Premium-Zugang automatisch.'
                : 'Premium wurde aktiviert. Du hast jetzt vollen Zugriff auf alle Lerninhalte und Prüfungsfragen.',
            panelTitle: activationPending ? 'Aktivierung läuft' : isGuest ? 'Konto per E-Mail aktivieren' : 'Premium ist aktiv',
            panelText: activationPending
                ? 'Falls Premium nicht sofort sichtbar ist, öffne die App neu oder melde dich kurz erneut an.'
                : isGuest
                ? `Wir haben dir${email ? ` an ${email}` : ''} eine E-Mail geschickt. Öffne den Link, um dein Passwort festzulegen.`
                : 'Du kannst jetzt direkt weiterlernen.',
        },
        pending: {
            icon: <ShieldCheck size={42} className="text-amber-500" strokeWidth={1.8} />,
            iconBg: 'bg-amber-50',
            title: 'Zahlung wird noch bestätigt',
            text: 'Die Zahlung wurde gestartet, aber Stripe hat sie noch nicht final bestätigt.',
            panelTitle: 'Wir aktivieren automatisch',
            panelText: 'Sobald Stripe die Zahlung bestätigt, wird dein Premium-Zugang freigeschaltet.',
        },
        failed: {
            icon: <AlertTriangle size={42} className="text-red-500" strokeWidth={1.8} />,
            iconBg: 'bg-red-50',
            title: 'Zahlung nicht abgeschlossen',
            text: 'Wir konnten für diese Checkout-Session keine erfolgreiche Zahlung bestätigen.',
            panelTitle: 'Kein Zugriff aktiviert',
            panelText: 'Falls der Betrag bereits abgebucht wurde, kontaktiere bitte den Support mit deiner Zahlungs-E-Mail.',
        },
    }[state];

    return (
        <div className="min-h-screen bg-[#F2F4F6] flex items-center justify-center px-4 py-8 font-sans">
            <div className="w-full max-w-md">
                <div className="mb-6 text-center">
                    <p className="text-sm font-black uppercase tracking-[0.18em] text-blue-600">34a Master</p>
                    <h1 className="mt-2 text-3xl font-black text-slate-900">Premium Zugang</h1>
                </div>

                <div className="rounded-[2rem] bg-white border border-slate-100 shadow-xl shadow-blue-500/10 p-6 text-center">
                    <div className="flex justify-center mb-5">
                        <div className={`w-20 h-20 rounded-full ${content.iconBg} flex items-center justify-center`}>
                            {content.icon}
                        </div>
                    </div>

                    <h2 className="text-2xl font-black text-slate-900 mb-3">{content.title}</h2>
                    <p className="text-sm leading-relaxed text-slate-500 mb-6">{content.text}</p>

                    <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-left mb-6">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
                                <Mail size={20} className="text-white" />
                            </div>
                            <div>
                                <p className="text-sm font-black text-slate-900 mb-1">{content.panelTitle}</p>
                                <p className="text-[13px] leading-relaxed text-slate-600">{content.panelText}</p>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={() => navigate(state === 'success' && !isGuest ? '/' : '/profile')}
                        className="w-full bg-blue-600 text-white font-black py-3.5 rounded-2xl active:scale-[0.99] transition-all flex items-center justify-center gap-2"
                    >
                        {state === 'success' && !isGuest ? 'Weiterlernen' : 'Zurück zur App'}
                        <ArrowRight size={18} />
                    </button>
                </div>

                <p className="text-center text-xs text-slate-400 mt-6">
                    Support: <a href="mailto:support@34a-master.app" className="text-blue-600 font-bold">support@34a-master.app</a>
                </p>
            </div>
        </div>
    );
}
