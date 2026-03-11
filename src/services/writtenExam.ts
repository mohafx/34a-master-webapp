import { db } from './database';
import { WrittenExamQuestion, TOPIC_DISTRIBUTION, MINI_EXAM_TOPIC_DISTRIBUTION, WrittenExamTopic } from '../types';

/**
 * Generates 82 random exam questions according to topic distribution
 * Questions are grouped by topic (not shuffled across topics)
 * 60% Single Choice (49 questions), 40% Multiple Choice (33 questions)
 * @returns Array of question IDs sorted by topic
 */
export async function generateExamQuestions(): Promise<string[]> {
    const allQuestionIds: string[] = [];

    // Target distribution: 60% Single Choice, 40% Multiple Choice
    const TOTAL_QUESTIONS = 82;
    const SINGLE_CHOICE_TARGET = Math.round(TOTAL_QUESTIONS * 0.6); // 49
    const MULTIPLE_CHOICE_TARGET = TOTAL_QUESTIONS - SINGLE_CHOICE_TARGET; // 33

    let singleChoiceCount = 0;
    let multipleChoiceCount = 0;

    // First, collect all questions by topic and type
    const questionsByTopic: Record<string, {
        single: WrittenExamQuestion[];
        multiple: WrittenExamQuestion[];
    }> = {};

    for (const [topic] of Object.entries(TOPIC_DISTRIBUTION)) {
        const questions = await db.getWrittenExamQuestionsByTopic(topic, 1000);
        const single = questions.filter(q => !q.correctAnswer.includes(','));
        const multiple = questions.filter(q => q.correctAnswer.includes(','));
        questionsByTopic[topic] = { single, multiple };
    }

    // Now select questions for each topic with 60/40 distribution
    for (const [topic, count] of Object.entries(TOPIC_DISTRIBUTION)) {
        const { single, multiple } = questionsByTopic[topic];

        // Calculate remaining needs
        const remainingSingleNeeded = SINGLE_CHOICE_TARGET - singleChoiceCount;
        const remainingMultipleNeeded = MULTIPLE_CHOICE_TARGET - multipleChoiceCount;
        const remainingTotalNeeded = TOTAL_QUESTIONS - allQuestionIds.length;

        // Calculate how many of each type for this topic (roughly 60/40)
        let topicSingleCount = Math.round(count * 0.6);
        let topicMultipleCount = count - topicSingleCount;

        // Adjust based on remaining needs
        if (remainingSingleNeeded < topicSingleCount) {
            topicSingleCount = Math.max(0, remainingSingleNeeded);
            topicMultipleCount = count - topicSingleCount;
        }
        if (remainingMultipleNeeded < topicMultipleCount) {
            topicMultipleCount = Math.max(0, remainingMultipleNeeded);
            topicSingleCount = count - topicMultipleCount;
        }

        // Ensure we don't exceed available questions
        topicSingleCount = Math.min(topicSingleCount, single.length);
        topicMultipleCount = Math.min(topicMultipleCount, multiple.length);

        // If we need more, adjust
        const totalSelected = topicSingleCount + topicMultipleCount;
        if (totalSelected < count) {
            // Fill remaining with available type
            if (single.length > topicSingleCount) {
                topicSingleCount = Math.min(count, single.length);
                topicMultipleCount = count - topicSingleCount;
            } else if (multiple.length > topicMultipleCount) {
                topicMultipleCount = Math.min(count, multiple.length);
                topicSingleCount = count - topicMultipleCount;
            }
        }

        // Select and shuffle within topic
        const selectedSingle = single.slice(0, topicSingleCount);
        const selectedMultiple = multiple.slice(0, topicMultipleCount);
        const selectedQuestions = [...selectedSingle, ...selectedMultiple].sort(() => Math.random() - 0.5);

        allQuestionIds.push(...selectedQuestions.map(q => q.id));
        singleChoiceCount += topicSingleCount;
        multipleChoiceCount += topicMultipleCount;
    }

    if (allQuestionIds.length !== 82) {
        throw new Error(
            `Expected 82 questions but got ${allQuestionIds.length}. Check topic distribution.`
        );
    }

    return allQuestionIds;
}

/**
 * Generates 16 random mini exam questions according to proportional topic distribution
 * Questions are grouped by topic (same order as full exam)
 * @returns Array of question IDs sorted by topic
 */
export async function generateMiniExamQuestions(): Promise<string[]> {
    const allQuestionIds: string[] = [];
    const TOTAL_QUESTIONS = 16;

    // First, collect all questions by topic
    const questionsByTopic: Record<string, WrittenExamQuestion[]> = {};

    for (const [topic] of Object.entries(MINI_EXAM_TOPIC_DISTRIBUTION)) {
        const questions = await db.getWrittenExamQuestionsByTopic(topic, 1000);
        // Shuffle questions for randomness
        questionsByTopic[topic] = questions.sort(() => Math.random() - 0.5);
    }

    // Select questions for each topic
    for (const [topic, count] of Object.entries(MINI_EXAM_TOPIC_DISTRIBUTION)) {
        const available = questionsByTopic[topic] || [];
        const selected = available.slice(0, count);
        allQuestionIds.push(...selected.map(q => q.id));
    }

    if (allQuestionIds.length !== TOTAL_QUESTIONS) {
        console.warn(
            `Expected ${TOTAL_QUESTIONS} questions but got ${allQuestionIds.length}. Some topics may have insufficient questions.`
        );
    }

    return allQuestionIds;
}

/**
 * Calculates the score for an exam session
 * @param questions Array of questions with their correct answers
 * @param userAnswers Record mapping questionId to user's selected answer(s)
 * @returns Number of correct answers
 */
export function calculateScore(
    questions: WrittenExamQuestion[],
    userAnswers: Record<string, string>
): number {
    let correctCount = 0;

    for (const question of questions) {
        const userAnswer = userAnswers[question.id];
        if (!userAnswer) continue; // Skip unanswered questions

        const correctAnswer = question.correctAnswer.trim().toUpperCase();
        const userAnswerNormalized = userAnswer.trim().toUpperCase();

        // Handle multiple choice (e.g., "A,B" or "A, B")
        if (correctAnswer.includes(',')) {
            // Multiple choice: user must select all correct answers
            const correctAnswers = correctAnswer.split(',').map(a => a.trim()).sort();
            const userAnswers = userAnswerNormalized.split(',').map(a => a.trim()).sort();

            // Check if arrays are equal
            if (correctAnswers.length === userAnswers.length &&
                correctAnswers.every((val, idx) => val === userAnswers[idx])) {
                correctCount++;
            }
        } else {
            // Single choice
            if (correctAnswer === userAnswerNormalized) {
                correctCount++;
            }
        }
    }

    return correctCount;
}

/**
 * Validates that enough questions exist in the database for each topic
 * @returns Object with validation results
 */
export async function validateQuestionAvailability(): Promise<{
    valid: boolean;
    topics: Record<string, { required: number; available: number; valid: boolean }>;
}> {
    const topics: Record<string, { required: number; available: number; valid: boolean }> = {};

    for (const [topic, required] of Object.entries(TOPIC_DISTRIBUTION)) {
        try {
            // Get all questions for this topic (with a high limit)
            const questions = await db.getWrittenExamQuestionsByTopic(topic, 1000);
            const available = questions.length;
            const valid = available >= required;

            topics[topic] = { required, available, valid };
        } catch (error) {
            topics[topic] = { required, available: 0, valid: false };
        }
    }

    const valid = Object.values(topics).every(t => t.valid);

    return { valid, topics };
}

