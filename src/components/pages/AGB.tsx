import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, CreditCard, ShieldCheck, XCircle, AlertTriangle, Scale } from 'lucide-react';

export default function AGB() {
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
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white">AGB</h1>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 space-y-6">

                    {/* Geltungsbereich */}
                    <section>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                                <FileText size={20} className="text-blue-600 dark:text-blue-400" />
                            </div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                                § 1 Geltungsbereich
                            </h2>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            Diese Allgemeinen Geschäftsbedingungen gelten für die Nutzung der App „34a Master"
                            (nachfolgend „App" genannt), betrieben von Mohamad Almajzoub (nachfolgend „Anbieter" genannt).
                            Mit der Registrierung oder Nutzung der App akzeptieren Sie diese Bedingungen.
                        </p>
                    </section>

                    <hr className="border-slate-200 dark:border-slate-700" />

                    {/* Leistungsbeschreibung */}
                    <section>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3">
                            § 2 Leistungsbeschreibung
                        </h2>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                            Die App bietet Lernmaterialien zur Vorbereitung auf die IHK-Sachkundeprüfung
                            nach § 34a GewO. Der Leistungsumfang umfasst:
                        </p>
                        <ul className="list-disc list-inside text-sm text-slate-600 dark:text-slate-400 space-y-1 ml-2">
                            <li>Lernmodule mit Texten und Übungsfragen</li>
                            <li>Quiz-Funktionen zum Üben</li>
                            <li>Fortschrittsverfolgung</li>
                            <li>Prüfungssimulation (Premium)</li>
                        </ul>
                        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 mt-4">
                            <p className="text-sm text-amber-800 dark:text-amber-200">
                                <strong>Hinweis:</strong> Die App dient ausschließlich zur Prüfungsvorbereitung und
                                ersetzt keine offizielle IHK-Schulung. Wir garantieren keinen Prüfungserfolg.
                            </p>
                        </div>
                    </section>

                    <hr className="border-slate-200 dark:border-slate-700" />

                    {/* Preise und Zahlung */}
                    <section>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-green-50 dark:bg-green-900/20 flex items-center justify-center">
                                <CreditCard size={20} className="text-green-600 dark:text-green-400" />
                            </div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                                § 3 Preise und Zahlung
                            </h2>
                        </div>
                        <div className="text-sm text-slate-600 dark:text-slate-400 space-y-3">
                            <p>
                                <strong>Kostenlose Nutzung:</strong> Grundfunktionen der App sind kostenlos nutzbar.
                            </p>
                            <p>
                                <strong>Premium-Abonnement:</strong> Erweiterte Funktionen sind über ein
                                kostenpflichtiges Abonnement verfügbar. Die aktuellen Preise werden in der App angezeigt.
                            </p>
                            <p>
                                <strong>Zahlungsabwicklung:</strong> Die Zahlung erfolgt über den Zahlungsdienstleister
                                Stripe. Es gelten zusätzlich die Nutzungsbedingungen von Stripe.
                            </p>
                            <p>
                                <strong>Laufzeit:</strong> Das monatliche Abonnement verlängert sich automatisch,
                                wenn es nicht vor Ablauf gekündigt wird. Das 6-Monats-Paket ist eine Einmalzahlung
                                ohne automatische Verlängerung.
                            </p>
                        </div>
                    </section>

                    <hr className="border-slate-200 dark:border-slate-700" />

                    {/* Widerrufsrecht */}
                    <section id="widerruf">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
                                <XCircle size={20} className="text-red-600 dark:text-red-400" />
                            </div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                                § 4 Widerrufsbelehrung
                            </h2>
                        </div>

                        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4">
                            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                                Als Verbraucher haben Sie ein gesetzliches Widerrufsrecht. Die vollständige
                                Widerrufsbelehrung inklusive des Muster-Widerrufsformulars finden Sie auf
                                unserer separaten Seite:
                            </p>
                            <a
                                href="#/widerrufsbelehrung"
                                className="inline-flex items-center gap-2 text-primary hover:text-primary/80 font-medium text-sm transition-colors"
                            >
                                → Zur vollständigen Widerrufsbelehrung
                            </a>
                        </div>
                    </section>

                    <hr className="border-slate-200 dark:border-slate-700" />

                    {/* Kündigung */}
                    <section>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3">
                            § 5 Kündigung
                        </h2>
                        <div className="text-sm text-slate-600 dark:text-slate-400 space-y-2">
                            <p>
                                <strong>Monatliches Abo:</strong> Sie können das monatliche Abonnement jederzeit
                                zum Ende des aktuellen Abrechnungszeitraums kündigen.
                            </p>
                            <p>
                                <strong>6-Monats-Paket:</strong> Das 6-Monats-Paket ist eine Einmalzahlung und
                                endet automatisch nach Ablauf der 6 Monate ohne Kündigung.
                            </p>
                            <p>
                                <strong>Kündigung:</strong> Die Kündigung kann per E-Mail an m.almajzoub1@gmail.com erfolgen.
                            </p>
                        </div>
                    </section>

                    <hr className="border-slate-200 dark:border-slate-700" />

                    {/* Nutzungsrechte */}
                    <section>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center">
                                <ShieldCheck size={20} className="text-purple-600 dark:text-purple-400" />
                            </div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                                § 6 Nutzungsrechte und Pflichten
                            </h2>
                        </div>
                        <div className="text-sm text-slate-600 dark:text-slate-400 space-y-2">
                            <p>
                                Sie erhalten ein nicht übertragbares, nicht exklusives Recht zur Nutzung der App
                                für persönliche, nicht-kommerzielle Zwecke.
                            </p>
                            <p><strong>Es ist untersagt:</strong></p>
                            <ul className="list-disc list-inside space-y-1 ml-2">
                                <li>Inhalte der App zu kopieren oder weiterzuverbreiten</li>
                                <li>Die App zu dekompilieren oder zu reverse-engineeren</li>
                                <li>Zugangsdaten an Dritte weiterzugeben</li>
                                <li>Die App für illegale Zwecke zu nutzen</li>
                            </ul>
                        </div>
                    </section>

                    <hr className="border-slate-200 dark:border-slate-700" />

                    {/* Haftung */}
                    <section>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center">
                                <AlertTriangle size={20} className="text-orange-600 dark:text-orange-400" />
                            </div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                                § 7 Haftungsbeschränkung
                            </h2>
                        </div>
                        <div className="text-sm text-slate-600 dark:text-slate-400 space-y-2">
                            <p>
                                Der Anbieter haftet unbeschränkt für Vorsatz und grobe Fahrlässigkeit sowie bei
                                Verletzung von Leben, Körper oder Gesundheit.
                            </p>
                            <p>
                                Für leichte Fahrlässigkeit haftet der Anbieter nur bei Verletzung wesentlicher
                                Vertragspflichten, wobei die Haftung auf den vorhersehbaren, vertragstypischen
                                Schaden begrenzt ist.
                            </p>
                            <p>
                                Der Anbieter übernimmt keine Garantie für den Erfolg bei der IHK-Prüfung.
                                Die Richtigkeit der Lerninhalte wird nach bestem Wissen erstellt, jedoch ohne Gewähr.
                            </p>
                        </div>
                    </section>

                    <hr className="border-slate-200 dark:border-slate-700" />

                    {/* Schlussbestimmungen */}
                    <section>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                                <Scale size={20} className="text-slate-600 dark:text-slate-400" />
                            </div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                                § 8 Schlussbestimmungen
                            </h2>
                        </div>
                        <div className="text-sm text-slate-600 dark:text-slate-400 space-y-2">
                            <p>
                                <strong>Änderungen:</strong> Der Anbieter behält sich vor, diese AGB zu ändern.
                                Änderungen werden per E-Mail oder in der App mitgeteilt.
                            </p>
                            <p>
                                <strong>Anwendbares Recht:</strong> Es gilt das Recht der Bundesrepublik Deutschland.
                            </p>
                            <p>
                                <strong>Salvatorische Klausel:</strong> Sollten einzelne Bestimmungen unwirksam sein,
                                bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.
                            </p>
                        </div>
                    </section>

                    <hr className="border-slate-200 dark:border-slate-700" />

                    {/* Streitbeilegung */}
                    <section>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3">
                            § 9 Online-Streitbeilegung
                        </h2>
                        <div className="text-sm text-slate-600 dark:text-slate-400 space-y-2">
                            <p>
                                Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:{' '}
                                <a
                                    href="https://ec.europa.eu/consumers/odr/"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 dark:text-blue-400 hover:underline"
                                >
                                    https://ec.europa.eu/consumers/odr/
                                </a>
                            </p>
                            <p>
                                Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer
                                Verbraucherschlichtungsstelle teilzunehmen.
                            </p>
                        </div>
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
