import React from 'react';
import { ArrowLeft, XCircle, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Widerrufsbelehrung() {
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
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white">Widerruf</h1>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 space-y-6">

                    {/* Header */}
                    <section>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
                                <XCircle size={20} className="text-red-600 dark:text-red-400" />
                            </div>
                            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                                Widerrufsbelehrung
                            </h1>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            Für Verbraucher im Sinne von § 13 BGB
                        </p>
                    </section>

                    <hr className="border-slate-200 dark:border-slate-700" />

                    {/* Widerrufsrecht */}
                    <section>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3">
                            Widerrufsrecht
                        </h2>
                        <div className="text-sm text-slate-600 dark:text-slate-400 space-y-3">
                            <p>
                                Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen.
                            </p>
                            <p>
                                Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des Vertragsabschlusses.
                            </p>
                            <p>
                                Um Ihr Widerrufsrecht auszuüben, müssen Sie uns mittels einer eindeutigen Erklärung
                                (z.B. ein mit der Post versandter Brief oder E-Mail) über Ihren Entschluss,
                                diesen Vertrag zu widerrufen, informieren.
                            </p>
                        </div>
                    </section>

                    <hr className="border-slate-200 dark:border-slate-700" />

                    {/* Kontakt für Widerruf */}
                    <section>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3">
                            Kontakt für den Widerruf
                        </h2>
                        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4">
                            <p className="text-sm text-slate-700 dark:text-slate-300">
                                Mohamad Almajzoub<br />
                                Grumsinerstr. 32<br />
                                12679 Berlin<br /><br />
                                E-Mail: <a href="mailto:m.almajzoub1@gmail.com" className="text-blue-600 dark:text-blue-400 hover:underline">m.almajzoub1@gmail.com</a>
                            </p>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-3">
                            Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung über die
                            Ausübung des Widerrufsrechts vor Ablauf der Widerrufsfrist absenden.
                        </p>
                    </section>

                    <hr className="border-slate-200 dark:border-slate-700" />

                    {/* Folgen des Widerrufs */}
                    <section>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3">
                            Folgen des Widerrufs
                        </h2>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von Ihnen
                            erhalten haben, unverzüglich und spätestens binnen vierzehn Tagen ab dem Tag zurückzuzahlen,
                            an dem die Mitteilung über Ihren Widerruf bei uns eingegangen ist. Für diese Rückzahlung
                            verwenden wir dasselbe Zahlungsmittel, das Sie bei der ursprünglichen Transaktion eingesetzt haben,
                            es sei denn, mit Ihnen wurde ausdrücklich etwas anderes vereinbart; in keinem Fall werden Ihnen
                            wegen dieser Rückzahlung Entgelte berechnet.
                        </p>
                    </section>

                    <hr className="border-slate-200 dark:border-slate-700" />

                    {/* Vorzeitiges Erlöschen */}
                    <section>
                        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <AlertTriangle size={20} className="text-amber-600 dark:text-amber-400" />
                                <h2 className="text-lg font-bold text-amber-900 dark:text-amber-100">
                                    Vorzeitiges Erlöschen bei digitalen Inhalten
                                </h2>
                            </div>
                            <div className="text-sm text-amber-800 dark:text-amber-200 space-y-3">
                                <p>
                                    Das Widerrufsrecht erlischt bei einem Vertrag über die Lieferung von nicht auf einem
                                    körperlichen Datenträger befindlichen digitalen Inhalten, wenn der Unternehmer mit der
                                    Ausführung des Vertrags begonnen hat, nachdem der Verbraucher:
                                </p>
                                <ul className="list-disc list-inside space-y-1 ml-2">
                                    <li>ausdrücklich zugestimmt hat, dass der Unternehmer mit der Ausführung des Vertrags vor Ablauf der Widerrufsfrist beginnt, und</li>
                                    <li>seine Kenntnis davon bestätigt hat, dass er durch seine Zustimmung mit Beginn der Ausführung des Vertrags sein Widerrufsrecht verliert.</li>
                                </ul>
                                <p className="font-medium mt-3 pt-3 border-t border-amber-300 dark:border-amber-700">
                                    Mit dem Kauf von Premium-Inhalten in der App „34a Master" stimmen Sie zu, dass wir sofort mit der
                                    Ausführung beginnen. Sie bestätigen, dass Sie Ihr Widerrufsrecht damit verlieren.
                                </p>
                            </div>
                        </div>
                    </section>

                    <hr className="border-slate-200 dark:border-slate-700" />

                    {/* Muster-Widerrufsformular */}
                    <section>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3">
                            Muster-Widerrufsformular
                        </h2>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                            Wenn Sie den Vertrag widerrufen wollen, können Sie dieses Formular ausfüllen und an uns senden:
                        </p>
                        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                            <p className="text-sm text-slate-700 dark:text-slate-300 italic">
                                An Mohamad Almajzoub, Grumsinerstr. 32, 12679 Berlin, E-Mail: m.almajzoub1@gmail.com<br /><br />
                                Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag über den Kauf der folgenden Waren (*)/die Erbringung der folgenden Dienstleistung (*):<br /><br />
                                _______________________________________________<br /><br />
                                Bestellt am (*)/erhalten am (*):<br />
                                _______________________________________________<br /><br />
                                Name des/der Verbraucher(s):<br />
                                _______________________________________________<br /><br />
                                Anschrift des/der Verbraucher(s):<br />
                                _______________________________________________<br /><br />
                                Datum:<br />
                                _______________________________________________<br /><br />
                                Unterschrift (nur bei Mitteilung auf Papier):<br />
                                _______________________________________________<br /><br />
                                <span className="text-xs">(*) Unzutreffendes streichen</span>
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
