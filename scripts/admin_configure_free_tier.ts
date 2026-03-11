
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Manual Load of Env because keys might be non-standard
const SUPABASE_URL = 'https://fcwyavxxcblcbdezobgz.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjd3lhdnh4Y2JsY2JkZXpvYmd6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDAwOTEyMywiZXhwIjoyMDc5NTg1MTIzfQ.-o90loDimq1zYqWMQRYQ1ffsevtQpyDdoltMWa4hnwg';

if (!SERVICE_KEY) {
    console.error("No service key found!");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function configureFreeTier() {
    console.log("🛠️  Configuring Free Tier using ADMIN privileges...");

    // 1. Reset everything to LOCKED
    console.log("🔒 Locking all content...");
    await supabase.from('questions').update({ is_free: false }).neq('id', '00000000-0000-0000-0000-000000000000'); // update all
    await supabase.from('flashcards').update({ is_free: false }).neq('id', '00000000-0000-0000-0000-000000000000');

    // 2. Get all modules
    const { data: modules } = await supabase.from('modules').select('id, title_de');
    if (!modules) return;

    console.log(`📂 Found ${modules.length} modules.`);

    let totalFreeQuestions = 0;

    // 3. For each module, find the first lesson
    for (const mod of modules) {
        const { data: lessons } = await supabase
            .from('lessons')
            .select('id, title_de, order_index')
            .eq('module_id', mod.id)
            .order('order_index', { ascending: true })
            .limit(1);

        if (lessons && lessons.length > 0) {
            const firstLesson = lessons[0];
            console.log(`   👉 Module '${mod.title_de}' -> First Lesson: '${firstLesson.title_de}' (Index ${firstLesson.order_index})`);

            // 4. Mark content as FREE
            const { count: qCount } = await supabase
                .from('questions')
                .update({ is_free: true }, { count: 'exact' })
                .eq('lesson_id', firstLesson.id)
                .select();

            const { count: fCount } = await supabase
                .from('flashcards')
                .update({ is_free: true }, { count: 'exact' })
                .eq('lesson_id', firstLesson.id)
                .select();

            console.log(`      ✅ Unlocked ${qCount} questions and ${fCount} flashcards.`);
            if (qCount) totalFreeQuestions += qCount;
        } else {
            console.log(`   ⚠️  Module '${mod.title_de}' has NO lessons.`);
        }
    }

    // 5. Also unlock questions without lesson_id (Intro)
    const { count: introCount } = await supabase
        .from('questions')
        .update({ is_free: true }, { count: 'exact' })
        .is('lesson_id', null)
        .select();

    if (introCount) {
        console.log(`   ✅ Unlocked ${introCount} intro questions (no lesson).`);
        totalFreeQuestions += introCount;
    }

    console.log("------------------------------------------------");
    console.log(`🎉 CONFIGURATION COMPLETE.`);
    console.log(`Total Free Questions: ${totalFreeQuestions}`);
}

configureFreeTier();
