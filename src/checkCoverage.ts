import { supabase } from './lib/supabase';

export const checkCoverage = async () => {
    // 1. Get Module ID
    const { data: modules } = await supabase
        .from('modules')
        .select('id, title_de')
        .ilike('title_de', '%Sicherheit und Ordnung%');

    if (!modules || modules.length === 0) {
        console.log("Module not found");
        return;
    }
    const moduleId = modules[0].id;
    console.log(`Checking module: ${modules[0].title_de}`);

    // 2. Count total questions in module
    const { count: total, error: err1 } = await supabase
        .from('questions')
        .select('*', { count: 'exact', head: true })
        .eq('module_id', moduleId);

    // 3. Count questions WITH lesson_id
    const { count: withLesson, error: err2 } = await supabase
        .from('questions')
        .select('*', { count: 'exact', head: true })
        .eq('module_id', moduleId)
        .not('lesson_id', 'is', null);

    console.log(`Total questions: ${total}`);
    console.log(`Questions with lesson link: ${withLesson}`);

    if (total && withLesson) {
        console.log(`Coverage: ${Math.round((withLesson / total) * 100)}%`);
        if (total > withLesson) {
            console.log(`Missing links for ${total - withLesson} questions.`);
        }
    }
};
