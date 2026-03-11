import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, MapPin, User } from 'lucide-react';

export default function Impressum() {
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
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white">Impressum</h1>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 space-y-6">

                    {/* Angaben gemäß § 5 TMG */}
                    <section>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">
                            Angaben gemäß § 5 TMG
                        </h2>

                        <div className="space-y-4">
                            <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
                                    <User size={20} className="text-blue-600 dark:text-blue-400" />
                                </div>
                                <div>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">Betreiber</p>
                                    <p className="font-semibold text-slate-900 dark:text-white">Mohamad Almajzoub</p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-xl bg-green-50 dark:bg-green-900/20 flex items-center justify-center flex-shrink-0">
                                    <MapPin size={20} className="text-green-600 dark:text-green-400" />
                                </div>
                                <div>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">Adresse</p>
                                    <p className="font-semibold text-slate-900 dark:text-white">Grumsinerstr. 32</p>
                                    <p className="font-semibold text-slate-900 dark:text-white">12679 Berlin</p>
                                    <p className="text-slate-600 dark:text-slate-300">Deutschland</p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center flex-shrink-0">
                                    <Mail size={20} className="text-purple-600 dark:text-purple-400" />
                                </div>
                                <div>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">Kontakt</p>
                                    <a
                                        href="mailto:m.almajzoub1@gmail.com"
                                        className="font-semibold text-blue-600 dark:text-blue-400 hover:underline block"
                                    >
                                        m.almajzoub1@gmail.com
                                    </a>
                                    <a
                                        href="tel:+491782907020"
                                        className="font-semibold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 mt-1 block"
                                    >
                                        0178 290 70 20
                                    </a>
                                </div>
                            </div>
                        </div>
                    </section>

                    <hr className="border-slate-200 dark:border-slate-700" />

                    {/* Verantwortlich für den Inhalt */}
                    <section>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3">
                            Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV
                        </h2>
                        <p className="text-slate-700 dark:text-slate-300">
                            Mohamad Almajzoub<br />
                            Grumsinerstr. 32<br />
                            12679 Berlin
                        </p>
                    </section>

                    <hr className="border-slate-200 dark:border-slate-700" />

                    {/* Haftungsausschluss */}
                    <section>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3">
                            Haftungsausschluss
                        </h2>

                        <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-2">Haftung für Inhalte</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                            Die Inhalte dieser App wurden mit größter Sorgfalt erstellt. Für die Richtigkeit,
                            Vollständigkeit und Aktualität der Inhalte können wir jedoch keine Gewähr übernehmen.
                            Als Diensteanbieter sind wir gemäß § 7 Abs.1 TMG für eigene Inhalte nach den
                            allgemeinen Gesetzen verantwortlich. Die Lerninhalte dienen zur Prüfungsvorbereitung
                            und ersetzen keine offizielle Beratung.
                        </p>

                        <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-2">Haftung für Links</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                            Unser Angebot enthält möglicherweise Links zu externen Websites Dritter, auf deren
                            Inhalte wir keinen Einfluss haben. Deshalb können wir für diese fremden Inhalte
                            auch keine Gewähr übernehmen.
                        </p>

                        <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-2">Urheberrecht</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            Die durch den Betreiber erstellten Inhalte und Werke unterliegen dem deutschen
                            Urheberrecht. Die Vervielfältigung, Bearbeitung, Verbreitung und jede Art der
                            Verwertung außerhalb der Grenzen des Urheberrechtes bedürfen der schriftlichen
                            Zustimmung des Betreibers.
                        </p>
                    </section>

                    {/* Streitschlichtung */}
                    <section>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3">
                            Streitschlichtung
                        </h2>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS)
                            bereit: <a href="https://ec.europa.eu/consumers/odr/" target="_blank" rel="noopener noreferrer"
                                className="text-blue-600 dark:text-blue-400 hover:underline">https://ec.europa.eu/consumers/odr/</a>
                            <br /><br />
                            Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer
                            Verbraucherschlichtungsstelle teilzunehmen.
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
