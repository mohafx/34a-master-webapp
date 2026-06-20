UPDATE public.questions
SET
  correct_answer = 'C',
  type = 'SINGLE_CHOICE',
  updated_at = now()
WHERE id = '77bb2b90-1d2a-4630-ab7f-abcaaccca975';

UPDATE public.questions
SET
  correct_answer = 'B',
  type = 'SINGLE_CHOICE',
  updated_at = now()
WHERE id = '260e55df-05d2-417c-b47f-bc6bae889c2b';

UPDATE public.questions
SET
  correct_answer = 'B,D',
  type = 'MULTIPLE_CHOICE',
  explanation_de = $explanation_de$### Einfache Erklärung

Die richtigen Antworten sind B und D: Der Täter verwirklicht durch das Aufbrechen des Schlosses eine Sachbeschädigung (§ 303 StGB) und durch das Wegfahren mit dem Fahrrad einen Diebstahl (§ 242 StGB). Weil das Fahrrad durch ein Schloss besonders gegen Wegnahme gesichert war, wird zusätzlich ein besonders schwerer Fall des Diebstahls (§ 243 StGB) diskutiert.

Warum sind die anderen Antworten falsch oder unvollständig?
A) Unterschlagung (§ 246 StGB) ist hier nicht die vorrangige Einordnung, weil bereits eine Wegnahmehandlung vorliegt. Bei Wegnahme prüft man zuerst § 242 StGB.
C) Raub (§ 249 StGB) ist falsch, da keine Gewalt gegen eine Person oder Drohung mit gegenwärtiger Gefahr für Leib oder Leben zur Wegnahme eingesetzt wurde. Gewalt gegen eine Sache reicht für Raub nicht aus.
E) Hausfriedensbruch passt nicht automatisch, weil aus dem Sachverhalt kein geschützter Raum (Wohnung, Geschäftsräume oder befriedetes Besitztum) als Tatort folgt.
F) Nötigung ist ebenfalls nicht ersichtlich, weil keine Person zu einem Verhalten gezwungen wird.

Prüfungstipp: Bei solchen Fällen immer trennen: 1) Was passiert mit der Sache selbst (Wegnahme des Fahrrads)? 2) Wurde beim Zugriff noch etwas beschädigt (Schloss)? So kommt man sauber zu § 242/§ 243 StGB plus § 303 StGB.$explanation_de$,
  explanation_ar = $explanation_ar$### الشرح المبسط

الإجابتان الصحيحتان هما B و D: كسر قفل الدراجة يحقق جريمة إتلاف مال الغير (§ 303 StGB)، وأخذ الدراجة والفرار بها يحقق جريمة السرقة (§ 242 StGB). وبما أن الدراجة كانت مؤمنة بقفل ضد الأخذ، فيُناقش أيضاً وجود حالة مشددة من السرقة (§ 243 StGB).

لماذا الخيارات الأخرى خاطئة أو غير كاملة؟
A) الاختلاس (§ 246 StGB) ليس التكييف الأساسي هنا، لأن الجاني قام بأخذ شيء من حيازة الغير. عند وجود أخذ فعلي تُفحص السرقة أولاً.
C) السرقة بالإكراه (§ 249 StGB) غير صحيحة، لأنها تتطلب عنفاً ضد شخص أو تهديداً بخطر حال على الجسد أو الحياة. العنف ضد القفل وحده لا يكفي.
E) انتهاك حرمة المسكن لا ينطبق تلقائياً، لأن الواقعة لا تذكر دخول مسكن أو محل أو مكان محمي.
F) الإكراه غير ظاهر، لأنه لا توجد إجبار لشخص على فعل أو امتناع.

نصيحة للامتحان: افصل دائماً بين أخذ الشيء نفسه وبين الضرر الذي يقع أثناء الوصول إليه. هنا لدينا سرقة الدراجة وحالة مشددة محتملة، بالإضافة إلى إتلاف القفل.$explanation_ar$,
  updated_at = now()
WHERE id = '9ed854ef-7afb-4bd6-a424-2929844622f6';
