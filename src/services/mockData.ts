import { Module, Question, QuestionType } from '../types';

export const MOCK_MODULES: Module[] = [
  {
    id: 'm1',
    titleDE: 'Recht der öffentlichen Sicherheit',
    titleAR: 'قانون الأمن العام والنظام',
    descriptionDE: 'Grundlagen des Rechts und der öffentlichen Ordnung.',
    descriptionAR: 'أساسيات القانون والنظام العام.',
    icon: 'Shield',
    totalQuestions: 3,
    lessons: [
      { id: 'l1_1', titleDE: 'Grundlagen der öffentlichen Sicherheit', titleAR: 'أساسيات الأمن العام', isCompleted: true },
      { id: 'l1_2', titleDE: 'Ordnungswidrigkeiten', titleAR: 'المخالفات الإدارية', isCompleted: false },
      { id: 'l1_3', titleDE: 'Polizeiliche Befugnisse', titleAR: 'صلاحيات الشرطة', isCompleted: false }
    ]
  },
  {
    id: 'm2',
    titleDE: 'Gewerberecht',
    titleAR: 'قانون التجارة والأعمال',
    descriptionDE: 'Vorschriften für das Bewachungsgewerbe.',
    descriptionAR: 'اللوائح الخاصة بصناعة الحراسة.',
    icon: 'Briefcase',
    totalQuestions: 2,
    lessons: [
      { id: 'l2_1', titleDE: 'Gewerbeordnung §34a', titleAR: 'لوائح التجارة §34a', isCompleted: false },
      { id: 'l2_2', titleDE: 'Bewachungsverordnung', titleAR: 'مرسوم الحراسة', isCompleted: false }
    ]
  },
  {
    id: 'm3',
    titleDE: 'Datenschutz',
    titleAR: 'حماية البيانات',
    descriptionDE: 'Umgang mit personenbezogenen Daten.',
    descriptionAR: 'التعامل مع البيانات الشخصية.',
    icon: 'Lock',
    totalQuestions: 2,
    lessons: [
      { id: 'l3_1', titleDE: 'BDSG Grundlagen', titleAR: 'أساسيات قانون حماية البيانات', isCompleted: false },
      { id: 'l3_2', titleDE: 'Videoüberwachung', titleAR: 'المراقبة بالفيديو', isCompleted: false }
    ]
  },
  {
    id: 'm4',
    titleDE: 'Bürgerliches Recht (BGB)',
    titleAR: 'القانون المدني',
    descriptionDE: 'Notwehr, Notstand und Selbsthilfe.',
    descriptionAR: 'الدفاع عن النفس، حالة الطوارئ والمساعدة الذاتية.',
    icon: 'Scale',
    totalQuestions: 3,
    lessons: [
      { id: 'l4_1', titleDE: 'Notwehr §32 StGB', titleAR: 'الدفاع عن النفس', isCompleted: false },
      { id: 'l4_2', titleDE: 'Notstand §34 StGB', titleAR: 'حالة الطوارئ', isCompleted: false },
      { id: 'l4_3', titleDE: 'Besitzwehr und Besitzkehr', titleAR: 'الدفاع عن الملكية', isCompleted: false }
    ]
  }
];

export const MOCK_QUESTIONS: Question[] = [
  // Module 1: Recht
  {
    id: 'q1',
    moduleId: 'm1',
    type: QuestionType.SINGLE_CHOICE,
    textDE: 'Was versteht man unter dem Gewaltmonopol des Staates?',
    textAR: 'ماذا يقصد باحتكار الدولة لاستخدام القوة؟',
    explanationDE: 'Nur der Staat darf physische Gewalt durch seine Organe (z.B. Polizei) ausüben. Private Sicherheitsdienste haben nur Jedermannsrechte.',
    explanationAR: 'فقط الدولة يحق لها ممارسة القوة الجسدية من خلال أجهزتها (مثل الشرطة). خدمات الأمن الخاصة لديها فقط حقوق الأفراد العاديين.',
    answers: [
      { id: 'a1', textDE: 'Dass Sicherheitsdienste Gewalt anwenden dürfen.', textAR: 'أن خدمات الأمن مسموح لها باستخدام العنف.', isCorrect: false },
      { id: 'a2', textDE: 'Dass nur der Staat das Recht hat, physische Gewalt auszuüben.', textAR: 'أن الدولة فقط لديها الحق في ممارسة العنف الجسدي.', isCorrect: true },
      { id: 'a3', textDE: 'Dass jeder Bürger Gewalt anwenden darf.', textAR: 'أن كل مواطن مسموح له باستخدام العنف.', isCorrect: false },
      { id: 'a4', textDE: 'Dass Gewalt grundsätzlich verboten ist.', textAR: 'أن العنف ممنوع من حيث المبدأ.', isCorrect: false }
    ]
  },
  {
    id: 'q2',
    moduleId: 'm1',
    type: QuestionType.MULTIPLE_CHOICE,
    textDE: 'Welche Rechte stehen dem privaten Sicherheitsmitarbeiter zu? (2 Richtige)',
    textAR: 'ما هي الحقوق التي يتمتع بها موظف الأمن الخاص؟ (إجابتان صحيحتان)',
    explanationDE: 'Private Sicherheitsmitarbeiter haben die gleichen Rechte wie jeder andere Bürger (Jedermannsrechte), z.B. Notwehr §32 StGB und vorläufige Festnahme §127 StPO.',
    explanationAR: 'يتمتع موظفو الأمن الخاص بنفس الحقوق التي يتمتع بها أي مواطن آخر (حقوق الجميع)، مثل الدفاع عن النفس §32 StGB والاعتقال المؤقت §127 StPO.',
    answers: [
      { id: 'a1', textDE: 'Hoheitliche Befugnisse', textAR: 'سلطات سيادية', isCorrect: false },
      { id: 'a2', textDE: 'Notwehrrecht (§ 32 StGB)', textAR: 'حق الدفاع عن النفس', isCorrect: true },
      { id: 'a3', textDE: 'Recht zur vorläufigen Festnahme (§ 127 StPO)', textAR: 'الحق في الاعتقال المؤقت', isCorrect: true },
      { id: 'a4', textDE: 'Recht auf Durchsuchung von Personen', textAR: 'الحق في تفتيش الأشخاص', isCorrect: false }
    ]
  },
  {
    id: 'q3',
    moduleId: 'm1',
    type: QuestionType.SINGLE_CHOICE,
    textDE: 'Was ist eine "Öffentliche Sicherheit"?',
    textAR: 'ما هو "الأمن العام"؟',
    explanationDE: 'Öffentliche Sicherheit umfasst den Schutz der Rechtsordnung, des Staates und der individuellen Rechtsgüter.',
    explanationAR: 'يشمل الأمن العام حماية النظام القانوني للدولة والحقوق الفردية.',
    answers: [
      { id: 'a1', textDE: 'Nur der Schutz von Privateigentum', textAR: 'فقط حماية الملكية الخاصة', isCorrect: false },
      { id: 'a2', textDE: 'Schutz der Unversehrtheit der Rechtsordnung und Rechtsgüter', textAR: 'حماية سلامة النظام القانوني والمصالح القانونية', isCorrect: true },
      { id: 'a3', textDE: 'Die Sicherheit in geschlossenen Räumen', textAR: 'الأمن في الأماكن المغلقة', isCorrect: false },
      { id: 'a4', textDE: 'Schutz vor Naturkatastrophen', textAR: 'الحماية من الكوارث الطبيعية', isCorrect: false }
    ]
  },
  // Module 2: Gewerberecht
  {
    id: 'q4',
    moduleId: 'm2',
    type: QuestionType.SINGLE_CHOICE,
    textDE: 'Wann muss ein Gewerbe angemeldet werden?',
    textAR: 'متى يجب تسجيل العمل التجاري؟',
    explanationDE: 'Mit Beginn der Tätigkeit muss das Gewerbe angemeldet sein.',
    explanationAR: 'يجب تسجيل التجارة عند بدء النشاط.',
    answers: [
      { id: 'a1', textDE: 'Nach 3 Monaten', textAR: 'بعد 3 أشهر', isCorrect: false },
      { id: 'a2', textDE: 'Gleichzeitig mit Beginn des Betriebes', textAR: 'في وقت واحد مع بدء التشغيل', isCorrect: true },
      { id: 'a3', textDE: 'Nur wenn Gewinn erzielt wird', textAR: 'فقط إذا تم تحقيق ربح', isCorrect: false },
      { id: 'a4', textDE: 'Wenn das Finanzamt auffordert', textAR: 'عندما يطلب مكتب الضرائب', isCorrect: false }
    ]
  },
  {
    id: 'q5',
    moduleId: 'm2',
    type: QuestionType.MULTIPLE_CHOICE,
    textDE: 'Was sind Voraussetzungen für die Erteilung einer Erlaubnis nach §34a GewO? (2 Richtige)',
    textAR: 'ما هي متطلبات منح التصريح وفقاً للمادة 34a من قانون تنظيم التجارة والصناعة؟ (إجابتان صحيحتان)',
    explanationDE: 'Zuverlässigkeit und Sachkunde sind zwingend erforderlich.',
    explanationAR: 'الموثوقية والكفاءة (الخبرة) مطلوبتان بشكل إلزامي.',
    answers: [
      { id: 'a1', textDE: 'Zuverlässigkeit', textAR: 'الموثوقية', isCorrect: true },
      { id: 'a2', textDE: 'Mindestens 100.000€ Startkapital', textAR: 'رأس مال لا يقل عن 100,000 يورو', isCorrect: false },
      { id: 'a3', textDE: 'Nachweis der Sachkunde', textAR: 'إثبات الكفاءة (Sachkunde)', isCorrect: true },
      { id: 'a4', textDE: 'Mitgliedschaft in einem Sportverein', textAR: 'عضوية في نادي رياضي', isCorrect: false }
    ]
  },
  // Module 4: BGB
  {
    id: 'q6',
    moduleId: 'm4',
    type: QuestionType.SINGLE_CHOICE,
    textDE: 'Was ist Notwehr?',
    textAR: 'ما هو الدفاع عن النفس؟',
    explanationDE: 'Verteidigung, die erforderlich ist, um einen gegenwärtigen rechtswidrigen Angriff von sich oder einem anderen abzuwenden.',
    explanationAR: 'الدفاع الضروري لصد هجوم حالي غير قانوني عن النفس أو عن الآخرين.',
    answers: [
      { id: 'a1', textDE: 'Rache für eine Tat', textAR: 'الانتقام لفعل ما', isCorrect: false },
      { id: 'a2', textDE: 'Die erforderliche Verteidigung gegen einen gegenwärtigen rechtswidrigen Angriff', textAR: 'الدفاع المطلوب ضد هجوم حالي غير قانوني', isCorrect: true },
      { id: 'a3', textDE: 'Präventiver Angriff', textAR: 'هجوم وقائي', isCorrect: false },
      { id: 'a4', textDE: 'Hilfe bei einem Unfall', textAR: 'المساعدة في حادث', isCorrect: false }
    ]
  }
];