import { supabase } from './lib/supabase';

export const fixLatinQuestion = async () => {
    console.log("Attempting to fix Latin question...");

    // 1. Find the question
    const { data: questions, error } = await supabase
        .from('questions')
        .select('*')
        .ilike('text_de', '%Nulla poena sine lege%');

    if (error) {
        console.error("Error finding question:", error);
        return;
    }

    if (!questions || questions.length === 0) {
        console.log("No question found containing 'Nulla poena sine lege'. It might have been fixed already.");
        return;
    }

    console.log(`Found ${questions.length} question(s) to fix.`);

    // 2. Update each found question
    for (const q of questions) {
        const newText = q.text_de.replace("Nulla poena sine lege", "Keine Strafe ohne Gesetz");

        const { error: updateError } = await supabase
            .from('questions')
            .update({ text_de: newText })
            .eq('id', q.id);

        if (updateError) {
            console.error(`Error updating question ${q.id}:`, updateError);
        } else {
            console.log(`Successfully updated question ${q.id} to: "${newText}"`);
        }
    }
};
