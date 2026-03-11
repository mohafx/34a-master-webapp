import { supabase } from './lib/supabase';

export const checkSpecificQuestion = async () => {
    const { data: questions } = await supabase
        .from('questions')
        .select('id, text_de, anchor_id, lesson_id')
        .ilike('text_de', '%Wann entsteht Gewohnheitsrecht%');

    console.log("Question Data:", questions);

    if (questions && questions[0]?.lesson_id) {
        const { data: lesson } = await supabase
            .from('lessons')
            .select('id, title_de, content_de')
            .eq('id', questions[0].lesson_id)
            .single();

        console.log("Lesson Title:", lesson.title_de);
        // Log headings to see available anchors
        const headings = lesson.content_de.match(/^#{2,3}\s+.+$/gm);
        console.log("Available Headings:", headings);
    }
};
