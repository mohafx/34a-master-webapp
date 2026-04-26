import { supabase } from './lib/supabase';

export const checkModuleData = async () => {
    // 1. Get the module ID for "Öffentliche Sicherheit und Ordnung"
    const { data: modules } = await supabase
        .from('modules')
        .select('id, title_de')
        .ilike('title_de', '%Sicherheit und Ordnung%');

    if (!modules || modules.length === 0) {
        console.log("Module not found");
        return;
    }

    const moduleId = modules[0].id;
    console.log(`Found Module: ${modules[0].title_de} (${moduleId})`);

    // 2. Check questions in this module
    const { data: questions } = await supabase
        .from('questions')
        .select('id, text_de, lesson_id')
        .eq('module_id', moduleId)
        .limit(10);

    console.log("Sample Questions:", questions);

    // 3. Check if lessons exist for this module
    const { data: lessons } = await supabase
        .from('lessons')
        .select('id, title_de')
        .eq('module_id', moduleId);

    console.log("Lessons in module:", lessons);
};
