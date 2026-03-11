import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Database, Cookie, Mail, Server, CreditCard, Bug, Globe, BarChart } from 'lucide-react';

export default function Datenschutz() {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-[#F2F4F6] dark:bg-slate-950 pb-8">
            {/* Content */}
            <div className="max-w-2xl mx-auto px-4 py-6">
                <div className="flex items-center gap-4 mb-6">
                    <button
                        onClick={() => navigate(-1)}
                        className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 shadow-sm border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white">Datenschutz</h1>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 space-y-6">

                    {/* Einleitung */}
                    <section>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                                <Shield size={20} className="text-blue-600 dark:text-blue-400" />
                            </div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                                1. Datenschutz auf einen Blick
                            </h2>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            Diese Datenschutzerklärung klärt Sie über die Art, den Umfang und Zweck der
                            Verarbeitung von personenbezogenen Daten innerhalb unserer App „34a Master" auf.
                        </p>
                    </section>

                    <hr className="border-slate-200 dark:border-slate-700" />

                    {/* Verantwortlicher */}
                    <section>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3">
                            2. Verantwortlicher
                        </h2>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            Mohamad Almajzoub<br />
                            Grumsinerstr. 32<br />
                            12679 Berlin<br />
                            E-Mail: <a href="mailto:m.almajzoub1@gmail.com" className="text-blue-600 dark:text-blue-400 hover:underline">m.almajzoub1@gmail.com</a>
                        </p>
                    </section>

                    <hr className="border-slate-200 dark:border-slate-700" />

                    {/* Welche Daten werden erhoben */}
                    <section>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-green-50 dark:bg-green-900/20 flex items-center justify-center">
                                <Database size={20} className="text-green-600 dark:text-green-400" />
                            </div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                                3. Datenverarbeitung, Rechtsgrundlagen und Speicherdauer
                            </h2>
                        </div>

                        <div className="space-y-4 text-sm text-slate-600 dark:text-slate-400">
                            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4">
                                <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-2">Bei der Registrierung:</h3>
                                <ul className="list-disc list-inside space-y-1 ml-2 mb-2">
                                    <li>E-Mail-Adresse</li>
                                    <li>Name (optional)</li>
                                    <li>Passwort (verschlüsselt gespeichert)</li>
                                </ul>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                                    <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung)<br />
                                    <strong>Speicherdauer:</strong> Bis zur Kontolöschung durch Sie oder 3 Jahre nach letzter Aktivität
                                </p>
                            </div>

                            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4">
                                <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-2">Bei der Nutzung:</h3>
                                <ul className="list-disc list-inside space-y-1 ml-2 mb-2">
                                    <li>Lernfortschritt (beantwortete Fragen, abgeschlossene Lektionen)</li>
                                    <li>Lesezeichen</li>
                                    <li>App-Einstellungen (Sprache, Dark Mode)</li>
                                </ul>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                                    <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung)<br />
                                    <strong>Speicherdauer:</strong> Bis zur Kontolöschung durch Sie
                                </p>
                            </div>

                            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4">
                                <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-2">Bei Zahlungen:</h3>
                                <ul className="list-disc list-inside space-y-1 ml-2 mb-2">
                                    <li>Zahlungsinformationen werden von Stripe verarbeitet (nicht von uns gespeichert)</li>
                                    <li>Wir speichern: Transaktions-ID, Zahlungsdatum, Betrag, gewählter Plan</li>
                                </ul>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                                    <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung), Art. 6 Abs. 1 lit. c DSGVO (gesetzliche Aufbewahrungspflichten)<br />
                                    <strong>Speicherdauer:</strong> 10 Jahre gem. § 147 AO (steuerliche Aufbewahrungsfrist)
                                </p>
                            </div>
                        </div>
                    </section>

                    <hr className="border-slate-200 dark:border-slate-700" />

                    {/* Drittanbieter */}
                    <section>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center">
                                <Server size={20} className="text-purple-600 dark:text-purple-400" />
                            </div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                                4. Drittanbieter-Dienste
                            </h2>
                        </div>

                        <div className="space-y-4 text-sm text-slate-600 dark:text-slate-400">
                            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <Globe size={16} className="text-green-600" />
                                    <h3 className="font-semibold text-slate-800 dark:text-slate-200">Supabase (Datenbank & Authentifizierung)</h3>
                                </div>
                                <p>Wir nutzen Supabase für die Speicherung von Benutzerdaten und Authentifizierung.
                                    Server in der EU. <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">Datenschutz von Supabase</a></p>
                            </div>

                            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <CreditCard size={16} className="text-blue-600" />
                                    <h3 className="font-semibold text-slate-800 dark:text-slate-200">Stripe (Zahlungsabwicklung)</h3>
                                </div>
                                <p>Für Zahlungen nutzen wir Stripe. Zahlungsdaten werden direkt von Stripe verarbeitet
                                    und nicht auf unseren Servern gespeichert. <a href="https://stripe.com/de/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">Datenschutz von Stripe</a></p>
                            </div>

                            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <Bug size={16} className="text-orange-600" />
                                    <h3 className="font-semibold text-slate-800 dark:text-slate-200">Sentry (Fehlerüberwachung)</h3>
                                </div>
                                <p>Zur Verbesserung der App-Stabilität nutzen wir Sentry für die Fehlerüberwachung.
                                    Bei Ihrer Zustimmung können anonymisierte Session-Aufnahmen erstellt werden, um Fehler
                                    besser zu verstehen. <a href="https://sentry.io/privacy/" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">Datenschutz von Sentry</a></p>
                            </div>

                            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                                        <path fill="#4285F4" d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
                                        <path fill="#34A853" d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09C3.515 21.3 7.565 24 12.255 24z" />
                                        <path fill="#FBBC05" d="M5.525 14.29c-.25-.72-.38-1.5-.38-2.29s.14-1.57.38-2.29v-3.09h-3.98C.435 8.55 0 10.22 0 12s.435 3.45 1.545 5.38l3.98-3.09z" />
                                        <path fill="#EA4335" d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0 7.565 0 3.515 2.7 1.545 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z" />
                                    </svg>
                                    <h3 className="font-semibold text-slate-800 dark:text-slate-200">Google OAuth (Anmeldung)</h3>
                                </div>
                                <p>Sie können sich optional mit Ihrem Google-Konto anmelden. Dabei werden
                                    grundlegende Profilinformationen (Name, E-Mail) von Google übermittelt.
                                    <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline ml-1">Datenschutz von Google</a></p>
                            </div>

                            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <BarChart size={16} className="text-indigo-600" />
                                    <h3 className="font-semibold text-slate-800 dark:text-slate-200">PostHog (Analyse)</h3>
                                </div>
                                <p>Wir nutzen PostHog, um die Nutzung unserer App zu analysieren und zu verbessern (z.B. welche Lektionen beliebt sind).
                                    Die Daten werden pseudonymisiert verarbeitet.
                                    <a href="https://posthog.com/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline ml-1">Datenschutz von PostHog</a></p>
                            </div>
                        </div>
                    </section>

                    <hr className="border-slate-200 dark:border-slate-700" />

                    {/* Cookies */}
                    <section>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 flex items-center justify-center">
                                <Cookie size={20} className="text-yellow-600 dark:text-yellow-400" />
                            </div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                                5. Cookies & Lokaler Speicher
                            </h2>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                            Diese App verwendet den lokalen Speicher (Local Storage) Ihres Browsers für:
                        </p>
                        <ul className="list-disc list-inside text-sm text-slate-600 dark:text-slate-400 space-y-1 ml-2">
                            <li><strong>Authentifizierung:</strong> Session-Token für den Login (technisch notwendig)</li>
                            <li><strong>Einstellungen:</strong> Ihre App-Präferenzen (Sprache, Dark Mode)</li>
                            <li><strong>Lernfortschritt:</strong> Lokale Zwischenspeicherung für Gäste</li>
                        </ul>
                    </section>

                    <hr className="border-slate-200 dark:border-slate-700" />

                    {/* Ihre Rechte */}
                    <section>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3">
                            6. Ihre Rechte (DSGVO)
                        </h2>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                            Sie haben folgende Rechte bezüglich Ihrer personenbezogenen Daten:
                        </p>
                        <ul className="list-disc list-inside text-sm text-slate-600 dark:text-slate-400 space-y-1 ml-2">
                            <li><strong>Auskunft:</strong> Welche Daten wir über Sie speichern</li>
                            <li><strong>Berichtigung:</strong> Korrektur falscher Daten</li>
                            <li><strong>Löschung:</strong> Entfernung Ihrer Daten ("Recht auf Vergessenwerden")</li>
                            <li><strong>Einschränkung:</strong> Einschränkung der Verarbeitung</li>
                            <li><strong>Datenübertragbarkeit:</strong> Export Ihrer Daten</li>
                            <li><strong>Widerspruch:</strong> Widerspruch gegen die Verarbeitung</li>
                        </ul>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-3">
                            Kontaktieren Sie uns unter <a href="mailto:m.almajzoub1@gmail.com" className="text-blue-600 dark:text-blue-400 hover:underline">m.almajzoub1@gmail.com</a> zur Ausübung dieser Rechte.
                        </p>
                    </section>

                    <hr className="border-slate-200 dark:border-slate-700" />

                    {/* Datenlöschung */}
                    <section>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3">
                            7. Kontolöschung
                        </h2>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            Sie können Ihr Konto jederzeit löschen lassen. Senden Sie dazu eine E-Mail an
                            <a href="mailto:m.almajzoub1@gmail.com" className="text-blue-600 dark:text-blue-400 hover:underline ml-1">m.almajzoub1@gmail.com</a>.
                            Alle Ihre personenbezogenen Daten werden innerhalb von 30 Tagen gelöscht.
                        </p>
                    </section>

                    <hr className="border-slate-200 dark:border-slate-700" />

                    {/* Beschwerderecht */}
                    <section>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3">
                            8. Beschwerderecht
                        </h2>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            Sie haben das Recht, sich bei einer Datenschutz-Aufsichtsbehörde zu beschweren.
                            Die zuständige Aufsichtsbehörde ist die Berliner Beauftragte für Datenschutz und
                            Informationsfreiheit: <a href="https://www.datenschutz-berlin.de" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">www.datenschutz-berlin.de</a>
                        </p>
                    </section>
                </div>

                {/* Last updated */}
                <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-6">
                    Stand: Januar 2025
                </p>
            </div>
        </div>
    );
}
