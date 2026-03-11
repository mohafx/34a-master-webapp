import { supabase } from '../lib/supabase';

// Helper to slugify text for anchors
const slugify = (text: string) => {
    return text
        .toLowerCase()
        .replace(/[äöüß]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }[c] || c))
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
};

const cleanText = (text: string) => {
    return text
        .toLowerCase()
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '')
        .replace(/\s{2,}/g, ' ');
};

interface LessonSection {
    id: string;
    title: string;
    content: string;
}

export const analyzeAnchors = async () => {
    console.log("Starting IMPROVED Anchor Analysis...");

    // 1. Get Module ID
    const { data: modules } = await supabase
        .from('modules')
        .select('id, title_de')
        .ilike('title_de', '%Sicherheit und Ordnung%');

    if (!modules || modules.length === 0) return;
    const moduleId = modules[0].id;

    // 2. Fetch questions
    const { data: questions } = await supabase
        .from('questions')
        .select(`
            id, 
            text_de, 
            lesson_id,
            answers:answers(text_de, is_correct)
        `)
        .eq('module_id', moduleId)
        .not('lesson_id', 'is', null);

    if (!questions) return;
    console.log(`Analyzing ${questions.length} questions...`);

    // 3. Fetch lessons
    const { data: lessons } = await supabase
        .from('lessons')
        .select('id, title_de, content_de')
        .eq('module_id', moduleId);

    if (!lessons) return;

    // 4. Parse lessons
    const lessonSections: Record<string, LessonSection[]> = {};

    lessons.forEach(lesson => {
        const sections: LessonSection[] = [];
        const lines = lesson.content_de.split('\n');

        let currentSection: LessonSection = { id: 'top', title: 'Start', content: '' };

        lines.forEach(line => {
            if (line.match(/^#{2,3}\s/)) {
                if (currentSection.content.length > 20 || currentSection.id !== 'top') {
                    sections.push(currentSection);
                }
                const title = line.replace(/^#+\s+/, '').trim();
                currentSection = {
                    id: slugify(title),
                    title,
                    content: title + ' '
                };
            } else {
                currentSection.content += line + ' ';
            }
        });
        sections.push(currentSection);
        lessonSections[lesson.id] = sections;
    });

    // 5. Match
    let updateCount = 0;

    for (const q of questions) {
        if (!q.lesson_id || !lessonSections[q.lesson_id]) continue;
        const sections = lessonSections[q.lesson_id];

        // Only use Question + Correct Answer (Explanation was adding noise)
        const correctAnswers = q.answers?.filter((a: any) => a.is_correct).map((a: any) => a.text_de).join(' ');
        const queryText = cleanText(`${q.text_de} ${correctAnswers}`);
        const tokens = queryText.split(' ').filter(w => w.length > 4); // Only significant words

        let bestSectionId = null;
        let maxScore = 0;

        sections.forEach(section => {
            if (section.id === 'top') return;
            const content = cleanText(section.content);
            let score = 0;
            tokens.forEach(t => { if (content.includes(t)) score++; });

            if (score > maxScore) {
                maxScore = score;
                bestSectionId = section.id;
            }
        });

        // Lower threshold to 1 (since we filter strictly for length > 4)
        const finalAnchor = (bestSectionId && maxScore >= 1) ? bestSectionId : 'NO_MATCH';

        // Log edge cases
        if (finalAnchor === 'NO_MATCH') {
            console.log(`[NO_MATCH] "${q.text_de.substring(0, 30)}..." BestScore: ${maxScore}`);
        }

        await supabase.from('questions').update({ anchor_id: finalAnchor }).eq('id', q.id);
        updateCount++;
    }
    console.log(`Updated ${updateCount} questions.`);
};
