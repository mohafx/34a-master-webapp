import { supabase } from '../lib/supabase';
import type { Lernplan } from './lernplanGenerator';

export const db = {
    // ========== MODULES ==========
    async getModules() {
        const { data, error } = await supabase
            .from('modules')
            .select(`
                *
            `)
            .order('order_index');

        if (error) throw error;

        // Fetch all lessons in a single query for better performance
        const { data: allLessons, error: lessonsError } = await supabase
            .from('lessons')
            .select('id, module_id, title_de, title_ar, order_index, image_url, image_status, image_style_code')
            .order('order_index');

        if (lessonsError) throw lessonsError;

        // Group lessons by module_id
        const lessonsByModule = (allLessons || []).reduce((acc: Record<string, any[]>, lesson: any) => {
            if (!acc[lesson.module_id]) {
                acc[lesson.module_id] = [];
            }
            acc[lesson.module_id].push({
                id: lesson.id,
                moduleId: lesson.module_id,
                titleDE: lesson.title_de,
                titleAR: lesson.title_ar,
                orderIndex: lesson.order_index,
                imageUrl: lesson.image_url || undefined,
                imageStatus: lesson.image_status || undefined,
                imageStyleCode: lesson.image_style_code || undefined
            });
            return acc;
        }, {});

        // Map modules with populated lessons
        const modulesWithLessons = (data || []).map((m: any) => {
            const moduleLessons = lessonsByModule[m.id] || [];
            return {
                id: m.id,
                titleDE: m.title_de,
                titleAR: m.title_ar,
                descriptionDE: m.description_de,
                descriptionAR: m.description_ar,
                icon: m.icon,
                totalQuestions: 0,
                lessons: moduleLessons, // Now contains real metadata
                hasLessons: moduleLessons.length > 0
            };
        });

        return modulesWithLessons;
    },

    async getLessonsByModuleId(moduleId: string) {
        const { data, error } = await supabase
            .from('lessons')
            .select('*')
            .eq('module_id', moduleId)
            .order('order_index');

        if (error) throw error;

        return (data || []).map((l: any) => ({
            id: l.id,
            moduleId: l.module_id,
            titleDE: l.title_de,
            contentDE: l.content_de,
            titleAR: l.title_ar,
            contentAR: l.content_ar,
            orderIndex: l.order_index,
            isLocked: l.is_locked,
            imageUrl: l.image_url || undefined,
            imageStatus: l.image_status || undefined,
            imageStyleCode: l.image_style_code || undefined
        }));
    },



    async searchLessons(query: string) {
        if (!query || query.length < 2) return [];

        const { data, error } = await supabase
            .from('lessons')
            .select('*')
            .or(`title_de.ilike.%${query}%,content_de.ilike.%${query}%,title_ar.ilike.%${query}%,content_ar.ilike.%${query}%`)
            .limit(20);

        if (error) throw error;

        return (data || []).map((l: any) => {
            // Snippet extraction logic
            let snippet = null;
            if (l.content_de) {
                const lowerContent = l.content_de.toLowerCase();
                const lowerQuery = query.toLowerCase();
                const index = lowerContent.indexOf(lowerQuery);

                if (index !== -1) {
                    const start = Math.max(0, index - 40);
                    const end = Math.min(l.content_de.length, index + query.length + 60);
                    snippet = (start > 0 ? '...' : '') +
                        l.content_de.substring(start, end).replace(/\n/g, ' ') +
                        (end < l.content_de.length ? '...' : '');
                }
            }

            return {
                id: l.id,
                moduleId: l.module_id,
                titleDE: l.title_de,
                titleAR: l.title_ar,
                contentDE: l.content_de,
                snippet: snippet,
                orderIndex: l.order_index
            };
        });
    },

    // ========== QUESTIONS ==========
    // Helper function to map flat answer columns to answers array
    _mapQuestionAnswers(q: any) {
        const answerLetters = ['a', 'b', 'c', 'd', 'e', 'f'];
        const correctAnswers = (q.correct_answer || '').split(',').map((s: string) => s.trim().toUpperCase());

        const answers = answerLetters
            .map((letter, index) => {
                const textDE = q[`answer_${letter}_de`];
                if (!textDE) return null; // Skip if no answer text

                return {
                    id: `${q.id}-${letter.toUpperCase()}`,
                    text_de: textDE,
                    text_ar: q[`answer_${letter}_ar`] || null,
                    is_correct: correctAnswers.includes(letter.toUpperCase()),
                    order_index: index
                };
            })
            .filter(Boolean);

        return {
            ...q,
            answers,
            is_free: q.is_free ?? false  // Include is_free field
        };
    },

    async getAllQuestions() {
        const { data, error } = await supabase
            .from('questions')
            .select('*')
            .order('order_index');

        if (error) throw error;
        return (data || []).map((q: any) => this._mapQuestionAnswers(q));
    },

    async getQuestionsPreview() {
        const { data, error } = await supabase
            .from('questions_preview')
            .select('*')
            .order('order_index');

        if (error) throw error;

        // Map to Question type but with empty answers
        return (data || []).map((q: any) => ({
            ...q,
            // Map snake_case to camelCase
            textDE: q.text_de,
            textAR: q.text_ar,
            moduleId: q.module_id,
            lessonId: q.lesson_id,
            explanationDE: '', // Empty for preview
            explanationAR: '',
            answers: [], // Empty for preview
            is_free: q.is_free ?? false // Include is_free field
        }));
    },

    async getQuestionsByModule(moduleId: string) {
        const { data, error } = await supabase
            .from('questions')
            .select('*')
            .eq('module_id', moduleId)
            .order('order_index');

        if (error) throw error;
        return (data || []).map((q: any) => this._mapQuestionAnswers(q));
    },

    // ========== USER LERNPLANS ==========
    async getActiveUserLernplan(userId: string): Promise<Lernplan | null> {
        const { data, error } = await supabase
            .from('user_lernplans')
            .select('plan_json')
            .eq('user_id', userId)
            .eq('source', 'tiktok_funnel')
            .eq('status', 'active')
            .order('activated_at', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) throw error;
        if (!data?.plan_json) return null;
        return data.plan_json as Lernplan;
    },

    // ========== FLASHCARDS ==========
    async getAllFlashcards() {
        const { data, error } = await supabase
            .from('flashcards')
            .select('*')
            .order('order_index');

        if (error) throw error;
        return (data || []).map((f: any) => ({
            id: f.id,
            moduleId: f.module_id,
            lessonId: f.lesson_id,
            orderIndex: f.order_index,
            questionDE: f.question_de,
            questionAR: f.question_ar,
            answerDE: f.answer_de,
            answerAR: f.answer_ar,
            hintDE: f.hint_de,
            hintAR: f.hint_ar
        }));
    },

    async getFlashcardsPreview() {
        const { data, error } = await supabase
            .from('flashcards_preview')
            .select('*')
            .order('order_index');

        if (error) throw error;
        return (data || []).map((f: any) => ({
            id: f.id,
            moduleId: f.module_id,
            lessonId: f.lesson_id,
            orderIndex: f.order_index,
            questionDE: f.question_de,
            questionAR: f.question_ar,
            answerDE: '', // Locked
            answerAR: '', // Locked
            hintDE: '',
            hintAR: ''
        }));
    },

    // ========== USER PROGRESS ==========
    async toggleLessonCompletion(userId: string, lessonId: string): Promise<boolean> {
        // Check if already completed
        const { data: existing } = await supabase
            .from('user_lesson_progress')
            .select('id')
            .eq('user_id', userId)
            .eq('lesson_id', lessonId)
            .single();

        if (existing) {
            // Undo completion
            const { error } = await supabase
                .from('user_lesson_progress')
                .delete()
                .eq('id', existing.id);

            if (error) throw error;
            return false; // Not completed anymore
        } else {
            // Mark as completed
            const { error } = await supabase
                .from('user_lesson_progress')
                .insert({
                    user_id: userId,
                    lesson_id: lessonId,
                    completed_at: new Date().toISOString()
                });

            if (error) throw error;
            return true; // Now completed
        }
    },

    async setLessonCompletion(userId: string, lessonId: string, completed: boolean): Promise<boolean> {
        const { data: existing } = await supabase
            .from('user_lesson_progress')
            .select('id')
            .eq('user_id', userId)
            .eq('lesson_id', lessonId)
            .maybeSingle();

        if (completed) {
            if (existing) return true;

            const { error } = await supabase
                .from('user_lesson_progress')
                .insert({
                    user_id: userId,
                    lesson_id: lessonId,
                    completed_at: new Date().toISOString()
                });

            if (error) throw error;
            return true;
        }

        if (!existing) return false;

        const { error } = await supabase
            .from('user_lesson_progress')
            .delete()
            .eq('id', existing.id);

        if (error) throw error;
        return false;
    },

    async getCompletedLessons(userId: string): Promise<string[]> {
        const { data, error } = await supabase
            .from('user_lesson_progress')
            .select('lesson_id')
            .eq('user_id', userId);

        if (error) throw error;
        return (data || []).map(row => row.lesson_id);
    },

    // ========== ACTIVITY HISTORY (for Statistics) ==========
    async getCompletedLessonsWithDates(userId: string): Promise<{ lessonId: string; completedAt: string }[]> {
        const { data, error } = await supabase
            .from('user_lesson_progress')
            .select('lesson_id, completed_at')
            .eq('user_id', userId)
            .order('completed_at', { ascending: true });

        if (error) throw error;
        return (data || []).map(row => ({
            lessonId: row.lesson_id,
            completedAt: row.completed_at
        }));
    },

    async getQuestionActivityHistory(userId: string): Promise<{ questionId: string; answeredAt: string; isCorrect: boolean }[]> {
        const { data, error } = await supabase
            .from('user_progress')
            .select('question_id, answered_at, is_correct')
            .eq('user_id', userId)
            .order('answered_at', { ascending: true });

        if (error) throw error;
        return (data || []).map(row => ({
            questionId: row.question_id,
            answeredAt: row.answered_at,
            isCorrect: row.is_correct
        }));
    },

    async getActivityHistoryByDay(userId: string, days: number = 30): Promise<{ date: string; lessons: number; questions: number }[]> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        const cutoffISO = cutoffDate.toISOString();

        // Fetch lessons
        const { data: lessonData, error: lessonError } = await supabase
            .from('user_lesson_progress')
            .select('completed_at')
            .eq('user_id', userId)
            .gte('completed_at', cutoffISO);

        if (lessonError) throw lessonError;

        // Fetch questions
        const { data: questionData, error: questionError } = await supabase
            .from('user_progress')
            .select('answered_at')
            .eq('user_id', userId)
            .gte('answered_at', cutoffISO);

        if (questionError) throw questionError;

        // Aggregate by day
        const dailyStats: Record<string, { lessons: number; questions: number }> = {};

        // Initialize all days in range
        for (let i = 0; i < days; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateKey = d.toISOString().split('T')[0];
            dailyStats[dateKey] = { lessons: 0, questions: 0 };
        }

        // Count lessons per day
        (lessonData || []).forEach(row => {
            const dateKey = row.completed_at.split('T')[0];
            if (dailyStats[dateKey]) {
                dailyStats[dateKey].lessons++;
            }
        });

        // Count questions per day
        (questionData || []).forEach(row => {
            const dateKey = row.answered_at.split('T')[0];
            if (dailyStats[dateKey]) {
                dailyStats[dateKey].questions++;
            }
        });

        // Convert to array and sort by date
        return Object.entries(dailyStats)
            .map(([date, stats]) => ({ date, ...stats }))
            .sort((a, b) => a.date.localeCompare(b.date));
    },

    async getFullActivityHistory(userId: string): Promise<{ date: string; lessons: number; questions: number }[]> {
        // Fetch ALL lessons (no date filter)
        const { data: lessonData, error: lessonError } = await supabase
            .from('user_lesson_progress')
            .select('completed_at')
            .eq('user_id', userId)
            .order('completed_at', { ascending: true });

        if (lessonError) throw lessonError;

        // Fetch ALL questions (no date filter)
        const { data: questionData, error: questionError } = await supabase
            .from('user_progress')
            .select('answered_at')
            .eq('user_id', userId)
            .order('answered_at', { ascending: true });

        if (questionError) throw questionError;

        // Find earliest activity date
        const lessonDates = (lessonData || []).map(r => r.completed_at.split('T')[0]);
        const questionDates = (questionData || []).map(r => r.answered_at.split('T')[0]);
        const allDates = [...lessonDates, ...questionDates];

        if (allDates.length === 0) {
            return []; // No activity yet
        }

        const sortedDates = allDates.sort();
        const firstDate = new Date(sortedDates[0]);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Initialize all days from first activity to today
        const dailyStats: Record<string, { lessons: number; questions: number }> = {};
        const currentDate = new Date(firstDate);
        while (currentDate <= today) {
            const dateKey = currentDate.toISOString().split('T')[0];
            dailyStats[dateKey] = { lessons: 0, questions: 0 };
            currentDate.setDate(currentDate.getDate() + 1);
        }

        // Count lessons per day
        (lessonData || []).forEach(row => {
            const dateKey = row.completed_at.split('T')[0];
            if (dailyStats[dateKey]) {
                dailyStats[dateKey].lessons++;
            }
        });

        // Count questions per day
        (questionData || []).forEach(row => {
            const dateKey = row.answered_at.split('T')[0];
            if (dailyStats[dateKey]) {
                dailyStats[dateKey].questions++;
            }
        });

        // Convert to array and sort by date
        return Object.entries(dailyStats)
            .map(([date, stats]) => ({ date, ...stats }))
            .sort((a, b) => a.date.localeCompare(b.date));
    },

    // ========== WAITLIST / NEWSLETTER ==========
    async addToWaitlist(email: string) {
        const { error } = await supabase
            .from('waitlist')
            .insert({ email });
            
        // Ignore unique constraint errors (already subscribed)
        if (error && error.code !== '23505') throw error;
    },

    // ========== PROGRESS ==========
    async saveProgress(userId: string, questionId: string, isCorrect: boolean) {
        // First check if entry exists
        const { data: existing } = await supabase
            .from('user_progress')
            .select('id, is_correct, wrong_count')
            .eq('user_id', userId)
            .eq('question_id', questionId)
            .single();

        if (existing) {
            // Calculate new wrong_count
            const currentWrongCount = existing.wrong_count || 0;
            const newWrongCount = isCorrect ? currentWrongCount : currentWrongCount + 1;

            const { error } = await supabase
                .from('user_progress')
                .update({
                    is_correct: isCorrect,
                    wrong_count: newWrongCount,
                    answered_at: new Date().toISOString()
                })
                .eq('id', existing.id);

            if (error) throw error;
        } else {
            // Insert new entry
            const { error } = await supabase
                .from('user_progress')
                .insert({
                    user_id: userId,
                    question_id: questionId,
                    is_correct: isCorrect,
                    wrong_count: isCorrect ? 0 : 1,
                    answered_at: new Date().toISOString()
                });

            if (error) throw error;
        }
    },

    async getUserProgress(userId: string) {
        const { data, error } = await supabase
            .from('user_progress')
            .select('question_id, is_correct')
            .eq('user_id', userId);

        if (error) throw error;

        // Convert to object: { questionId: isCorrect }
        return (data || []).reduce((acc: Record<string, boolean>, item) => {
            acc[item.question_id] = item.is_correct;
            return acc;
        }, {});
    },

    async getUserFlashcardProgress(userId: string) {
        const { data, error } = await supabase
            .from('user_flashcard_progress')
            .select('flashcard_id, known')
            .eq('user_id', userId);

        if (error) throw error;

        // Convert to object: { flashcardId: known }
        return (data || []).reduce((acc: Record<string, boolean>, item) => {
            acc[item.flashcard_id] = item.known;
            return acc;
        }, {});
    },

    // ========== BOOKMARKS ==========
    async toggleBookmark(userId: string, questionId: string) {
        const { data: existing } = await supabase
            .from('user_bookmarks')
            .select('id')
            .eq('user_id', userId)
            .eq('question_id', questionId)
            .single();

        if (existing) {
            await supabase.from('user_bookmarks').delete().eq('id', existing.id);
        } else {
            await supabase.from('user_bookmarks').insert({
                user_id: userId,
                question_id: questionId
            });
        }
    },

    async getUserBookmarks(userId: string) {
        const { data, error } = await supabase
            .from('user_bookmarks')
            .select('question_id')
            .eq('user_id', userId);

        if (error) throw error;
        return (data || []).map(b => b.question_id);
    },

    // ========== EXPANDED SECTIONS STATE ==========
    async saveExpandedSections(userId: string, moduleId: string, expandedSections: Record<string, boolean>) {
        // For now, use localStorage for all users (simpler and works offline)
        // Can be extended to use database if needed
        const storageKey = `user_expanded_sections_${moduleId}`;
        localStorage.setItem(storageKey, JSON.stringify(expandedSections));
    },

    async getExpandedSections(userId: string, moduleId: string): Promise<Record<string, boolean> | null> {
        // For now, use localStorage for all users (simpler and works offline)
        // Can be extended to use database if needed
        const storageKey = `user_expanded_sections_${moduleId}`;
        const data = localStorage.getItem(storageKey);
        return data ? JSON.parse(data) : null;
    },

    // ========== USER PROFILE ==========
    async getUserProfile(userId: string) {
        const { data, error } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows found
        return data;
    },

    async updateExamDate(userId: string, examDate: string) {
        const { error } = await supabase
            .from('user_profiles')
            .upsert({
                id: userId,
                exam_date: examDate,
                updated_at: new Date().toISOString()
            }, { onConflict: 'id' });

        if (error) throw error;
    },

    async updateUserSettings(userId: string, settings: any) {
        const { error } = await supabase
            .from('user_profiles')
            .upsert({
                id: userId,
                settings: settings,
                updated_at: new Date().toISOString()
            }, { onConflict: 'id' });

        if (error) throw error;
    },

    async resetUserProgress(userId: string) {
        const tables = [
            'user_progress',
            'user_bookmarks',
            'user_lesson_progress',
            'user_flashcard_progress',
            'user_lesson_quiz_results',
            'written_exam_sessions'
        ];

        // Delete from all progress tables
        const results = await Promise.all(
            tables.map(table =>
                supabase.from(table).delete().eq('user_id', userId)
            )
        );

        // Also clear exam_date in user_profiles
        await supabase.from('user_profiles').update({ 
            exam_date: null,
            updated_at: new Date().toISOString()
        }).eq('id', userId);

        const error = results.find(r => r.error);
        if (error) throw error.error;
    },

    // ========== WRITTEN EXAM ==========
    async getWrittenExamQuestionsByTopic(topic: string, limit: number) {
        const { data, error } = await supabase
            .from('written_exam_questions')
            .select('*')
            .eq('topic', topic)
            .limit(limit);

        if (error) throw error;

        // Shuffle the results randomly
        const shuffled = (data || []).sort(() => Math.random() - 0.5);
        return shuffled.map((q: any) => ({
            id: q.id,
            topic: q.topic,
            questionTextDE: q.question_text_de,
            questionTextAR: q.question_text_ar,
            answers: {
                A: { de: q.answer_a_de, ar: q.answer_a_ar },
                B: { de: q.answer_b_de, ar: q.answer_b_ar },
                C: { de: q.answer_c_de, ar: q.answer_c_ar },
                D: { de: q.answer_d_de, ar: q.answer_d_ar },
                E: q.answer_e_de ? { de: q.answer_e_de, ar: q.answer_e_ar } : undefined,
                F: q.answer_f_de ? { de: q.answer_f_de, ar: q.answer_f_ar } : undefined
            },
            correctAnswer: q.correct_answer,
            explanationDE: q.explanation_de,
            explanationAR: q.explanation_ar
        }));
    },

    async getWrittenExamQuestion(questionId: string) {
        const { data, error } = await supabase
            .from('written_exam_questions')
            .select('*')
            .eq('id', questionId)
            .single();

        if (error) throw error;

        if (!data) return null;

        return {
            id: data.id,
            topic: data.topic,
            questionTextDE: data.question_text_de,
            questionTextAR: data.question_text_ar,
            answers: {
                A: { de: data.answer_a_de, ar: data.answer_a_ar },
                B: { de: data.answer_b_de, ar: data.answer_b_ar },
                C: { de: data.answer_c_de, ar: data.answer_c_ar },
                D: { de: data.answer_d_de, ar: data.answer_d_ar },
                E: data.answer_e_de ? { de: data.answer_e_de, ar: data.answer_e_ar } : undefined,
                F: data.answer_f_de ? { de: data.answer_f_de, ar: data.answer_f_ar } : undefined
            },
            correctAnswer: data.correct_answer,
            explanationDE: data.explanation_de,
            explanationAR: data.explanation_ar
        };
    },

    async getWrittenExamQuestionsByIds(questionIds: string[]) {
        const { data, error } = await supabase
            .from('written_exam_questions')
            .select('*')
            .in('id', questionIds);

        if (error) throw error;

        // Maintain order from questionIds array
        const questionMap = new Map((data || []).map((q: any) => [q.id, {
            id: q.id,
            topic: q.topic,
            questionTextDE: q.question_text_de,
            questionTextAR: q.question_text_ar,
            answers: {
                A: { de: q.answer_a_de, ar: q.answer_a_ar },
                B: { de: q.answer_b_de, ar: q.answer_b_ar },
                C: { de: q.answer_c_de, ar: q.answer_c_ar },
                D: { de: q.answer_d_de, ar: q.answer_d_ar },
                E: q.answer_e_de ? { de: q.answer_e_de, ar: q.answer_e_ar } : undefined,
                F: q.answer_f_de ? { de: q.answer_f_de, ar: q.answer_f_ar } : undefined
            },
            correctAnswer: q.correct_answer,
            explanationDE: q.explanation_de,
            explanationAR: q.explanation_ar
        }]));

        return questionIds.map(id => questionMap.get(id)).filter(Boolean);
    },

    async createWrittenExamSession(userId: string, questionIds: string[], examType: 'full' | 'mini' = 'full') {
        const timeLimitMinutes = examType === 'mini' ? 20 : 120;
        const { data, error } = await supabase
            .from('written_exam_sessions')
            .insert({
                user_id: userId,
                question_ids: questionIds,
                user_answers: {},
                started_at: new Date().toISOString(),
                time_limit_minutes: timeLimitMinutes,
                total_questions: questionIds.length
                // Note: exam_type not stored in DB, inferred from total_questions (16=mini, 82=full)
            })
            .select()
            .single();

        if (error) throw error;

        return {
            id: data.id,
            userId: data.user_id,
            questionIds: data.question_ids,
            userAnswers: data.user_answers || {},
            startedAt: data.started_at,
            completedAt: data.completed_at,
            timeLimitMinutes: data.time_limit_minutes,
            score: data.score,
            totalQuestions: data.total_questions,
            examType: data.total_questions === 16 ? 'mini' : 'full'
        };
    },

    async updateWrittenExamSession(sessionId: string, answers: Record<string, string>) {
        const { error } = await supabase
            .from('written_exam_sessions')
            .update({
                user_answers: answers
            })
            .eq('id', sessionId);

        if (error) throw error;
    },

    async completeWrittenExamSession(sessionId: string, score: number) {
        const { error } = await supabase
            .from('written_exam_sessions')
            .update({
                completed_at: new Date().toISOString(),
                score: score
            })
            .eq('id', sessionId);

        if (error) throw error;
    },

    async getWrittenExamSession(sessionId: string) {
        const { data, error } = await supabase
            .from('written_exam_sessions')
            .select('*')
            .eq('id', sessionId)
            .single();

        if (error) throw error;

        if (!data) return null;

        return {
            id: data.id,
            userId: data.user_id,
            questionIds: data.question_ids,
            userAnswers: data.user_answers || {},
            startedAt: data.started_at,
            completedAt: data.completed_at,
            timeLimitMinutes: data.time_limit_minutes,
            score: data.score,
            totalQuestions: data.total_questions,
            examType: data.total_questions === 16 ? 'mini' : 'full'
        };
    },

    async getWrittenExamSessions(userId: string) {
        const { data, error } = await supabase
            .from('written_exam_sessions')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        return (data || []).map((s: any) => ({
            id: s.id,
            userId: s.user_id,
            questionIds: s.question_ids,
            userAnswers: s.user_answers || {},
            startedAt: s.started_at,
            completedAt: s.completed_at,
            timeLimitMinutes: s.time_limit_minutes,
            score: s.score,
            totalQuestions: s.total_questions
        }));
    },


    // ========== LESSON QUIZ ==========
    async getLessonQuizQuestions(lessonId: string) {
        const { data, error } = await supabase
            .from('lesson_quiz_questions_v2')
            .select(`
                *,
                lesson_quiz_answers (*)
            `)
            .eq('lesson_id', lessonId)
            .order('question_number');

        if (error) throw error;

        return (data || []).map((q: any) => ({
            id: q.id,
            lessonId: q.lesson_id,
            questionNumber: q.question_number,
            questionType: q.question_type as 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE',
            questionTextDE: q.question_text_de,
            questionTextAR: q.question_text_ar,
            explanationDE: q.explanation_de,
            explanationAR: q.explanation_ar,
            answers: (q.lesson_quiz_answers || [])
                .sort((a: any, b: any) => a.answer_number - b.answer_number)
                .map((a: any) => ({
                    id: a.id,
                    answerNumber: a.answer_number,
                    textDE: a.answer_text_de,
                    textAR: a.answer_text_ar,
                    isCorrect: a.is_correct
                }))
        }));
    },

    async hasLessonQuiz(lessonId: string): Promise<boolean> {
        const { count, error } = await supabase
            .from('lesson_quiz_questions_v2')
            .select('*', { count: 'exact', head: true })
            .eq('lesson_id', lessonId);

        if (error) return false;
        return (count || 0) > 0;
    },

    async saveLessonQuizResult(userId: string, lessonId: string, score: number, totalQuestions: number = 5) {
        // Upsert - update if exists, insert if not
        const { error } = await supabase
            .from('user_lesson_quiz_results')
            .upsert({
                user_id: userId,
                lesson_id: lessonId,
                score: score,
                total_questions: totalQuestions,
                completed_at: new Date().toISOString()
            }, { onConflict: 'user_id,lesson_id' });

        if (error) throw error;
    },

    async getLessonQuizResult(userId: string, lessonId: string) {
        const { data, error } = await supabase
            .from('user_lesson_quiz_results')
            .select('*')
            .eq('user_id', userId)
            .eq('lesson_id', lessonId)
            .single();

        if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows found

        if (!data) return null;

        return {
            id: data.id,
            userId: data.user_id,
            lessonId: data.lesson_id,
            score: data.score,
            totalQuestions: data.total_questions,
            completedAt: data.completed_at
        };
    },

    // ========== ADMIN ==========
    async updateQuestion(questionId: string, updates: {
        text_de?: string;
        text_ar?: string;
        type?: string;
        module_id?: string;
        lesson_id?: string;
        correct_answer?: string;
        answer_a_de?: string | null;
        answer_a_ar?: string | null;
        answer_b_de?: string | null;
        answer_b_ar?: string | null;
        answer_c_de?: string | null;
        answer_c_ar?: string | null;
        answer_d_de?: string | null;
        answer_d_ar?: string | null;
        answer_e_de?: string | null;
        answer_e_ar?: string | null;
        answer_f_de?: string | null;
        answer_f_ar?: string | null;
        explanation_de?: string;
        explanation_ar?: string;
        order_index?: number;
        quality_check?: any;
        reviewed?: boolean;
    }) {
        const { error } = await supabase
            .from('questions')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', questionId);

        if (error) throw error;
    },

    async updateWrittenExamQuestion(questionId: string, updates: {
        question_text_de?: string;
        question_text_ar?: string;
        answer_a_de?: string | null;
        answer_a_ar?: string | null;
        answer_b_de?: string | null;
        answer_b_ar?: string | null;
        answer_c_de?: string | null;
        answer_c_ar?: string | null;
        answer_d_de?: string | null;
        answer_d_ar?: string | null;
        answer_e_de?: string | null;
        answer_e_ar?: string | null;
        answer_f_de?: string | null;
        answer_f_ar?: string | null;
        correct_answer?: string;
        topic?: string;
        quality_check?: any;
        reviewed?: boolean;
    }) {
        const { error } = await supabase
            .from('written_exam_questions')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', questionId);

        if (error) throw error;
    },

    async getAllModulesWithLessons() {
        const { data: modules, error: mErr } = await supabase
            .from('modules')
            .select('id, title_de, title_ar, order_index')
            .order('order_index');

        if (mErr) throw mErr;

        const { data: lessons, error: lErr } = await supabase
            .from('lessons')
            .select('id, module_id, title_de, title_ar, order_index, image_url, image_status, image_style_code')
            .order('order_index');

        if (lErr) throw lErr;

        return (modules || []).map((m: any) => ({
            ...m,
            lessons: (lessons || []).filter((l: any) => l.module_id === m.id)
        }));
    },

    async getWrittenExamTopics(): Promise<string[]> {
        const { data, error } = await supabase
            .from('written_exam_questions')
            .select('topic');

        if (error) throw error;

        const unique = [...new Set((data || []).map((d: any) => d.topic))];
        return unique.sort();
    },

    async getAllWrittenExamQuestions() {
        const { data, error } = await supabase
            .from('written_exam_questions')
            .select('*')
            .order('topic');

        if (error) throw error;
        return data || [];
    }
};

// ========== GUEST STORAGE (LocalStorage Fallback) ==========
export const guestStorage = {
    saveProgress: (questionId: string, isCorrect: boolean) => {
        const progress = JSON.parse(localStorage.getItem('guest_progress') || '{}');
        progress[questionId] = isCorrect;
        localStorage.setItem('guest_progress', JSON.stringify(progress));

        // Track order of answered questions (for scrolling to last answered)
        const answeredOrder = JSON.parse(localStorage.getItem('guest_answered_order') || '[]');
        if (!answeredOrder.includes(questionId)) {
            answeredOrder.push(questionId);
            localStorage.setItem('guest_answered_order', JSON.stringify(answeredOrder));
        }

        // Track wrong count
        if (!isCorrect) {
            const wrongCounts = JSON.parse(localStorage.getItem('guest_wrong_counts') || '{}');
            wrongCounts[questionId] = (wrongCounts[questionId] || 0) + 1;
            localStorage.setItem('guest_wrong_counts', JSON.stringify(wrongCounts));
        }
    },

    getProgress: (): Record<string, boolean> => {
        return JSON.parse(localStorage.getItem('guest_progress') || '{}');
    },

    getWrongCounts: (): Record<string, number> => {
        return JSON.parse(localStorage.getItem('guest_wrong_counts') || '{}');
    },

    toggleBookmark: (questionId: string) => {
        const bookmarks = JSON.parse(localStorage.getItem('guest_bookmarks') || '[]');
        const index = bookmarks.indexOf(questionId);

        if (index > -1) {
            bookmarks.splice(index, 1);
        } else {
            bookmarks.push(questionId);
        }

        localStorage.setItem('guest_bookmarks', JSON.stringify(bookmarks));
    },

    getBookmarks: (): string[] => {
        return JSON.parse(localStorage.getItem('guest_bookmarks') || '[]');
    },

    getCompletedLessons: (): Record<string, boolean> => {
        const completed = JSON.parse(localStorage.getItem('guest_completed_lessons') || '[]');
        return completed.reduce((acc: Record<string, boolean>, id: string) => {
            acc[id] = true;
            return acc;
        }, {});
    },

    setLessonCompletion: (lessonId: string, completed: boolean) => {
        const existing = JSON.parse(localStorage.getItem('guest_completed_lessons') || '[]');
        const next = completed
            ? Array.from(new Set([...existing, lessonId]))
            : existing.filter((id: string) => id !== lessonId);

        localStorage.setItem('guest_completed_lessons', JSON.stringify(next));
    },


    // ========== ANSWERED QUESTIONS ORDER ==========
    getAnsweredOrder: (): string[] => {
        return JSON.parse(localStorage.getItem('guest_answered_order') || '[]');
    },

    // ========== EXPANDED SECTIONS STATE ==========
    saveExpandedSections: (moduleId: string, expandedSections: Record<string, boolean>) => {
        const key = `guest_expanded_sections_${moduleId}`;
        localStorage.setItem(key, JSON.stringify(expandedSections));
    },

    getExpandedSections: (moduleId: string): Record<string, boolean> | null => {
        const key = `guest_expanded_sections_${moduleId}`;
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;
    }
};
