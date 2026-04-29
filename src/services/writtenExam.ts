import { db } from './database';
import {
    FULL_EXAM_TOPIC_POINT_DISTRIBUTION,
    FULL_EXAM_TOTAL_QUESTIONS,
    WrittenExamQuestion,
    MINI_EXAM_TOPIC_DISTRIBUTION
} from '../types';
import { getQuestionMaxPoints, scoreQuestionPoints } from '../utils/writtenExamAnswers';

/**
 * Generates 82 random exam questions according to the official 120-point distribution.
 * Questions are grouped by topic and selected by question type.
 * @returns Array of question IDs sorted by topic
 */
export async function generateExamQuestions(): Promise<string[]> {
    const allQuestionIds: string[] = [];

    for (const [topic, config] of Object.entries(FULL_EXAM_TOPIC_POINT_DISTRIBUTION)) {
        const questions = await db.getWrittenExamQuestionsByTopic(topic, 1000);
        const single = questions.filter(q => getQuestionMaxPoints(q.correctAnswer) === 1);
        const multiple = questions.filter(q => getQuestionMaxPoints(q.correctAnswer) === 2);

        if (single.length < config.single || multiple.length < config.multiple) {
            throw new Error(
                `Not enough questions for ${topic}. ` +
                `Need ${config.single} single and ${config.multiple} multiple, ` +
                `but found ${single.length} single and ${multiple.length} multiple.`
            );
        }

        const selectedSingle = single.sort(() => Math.random() - 0.5).slice(0, config.single);
        const selectedMultiple = multiple.sort(() => Math.random() - 0.5).slice(0, config.multiple);
        const selectedQuestions = [...selectedSingle, ...selectedMultiple].sort(() => Math.random() - 0.5);

        allQuestionIds.push(...selectedQuestions.map(q => q.id));
    }

    if (allQuestionIds.length !== FULL_EXAM_TOTAL_QUESTIONS) {
        throw new Error(
            `Expected ${FULL_EXAM_TOTAL_QUESTIONS} questions but got ${allQuestionIds.length}. Check topic distribution.`
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

export function calculateExamPoints(
    questions: WrittenExamQuestion[],
    userAnswers: Record<string, string>
): number {
    return questions.reduce((sum, question) => {
        return sum + scoreQuestionPoints(question.correctAnswer, userAnswers[question.id]);
    }, 0);
}

export function calculateMaxPoints(questions: WrittenExamQuestion[]): number {
    return questions.reduce((sum, question) => sum + getQuestionMaxPoints(question.correctAnswer), 0);
}

/**
 * Validates that enough questions exist in the database for each topic
 * @returns Object with validation results
 */
export async function validateQuestionAvailability(): Promise<{
    valid: boolean;
    topics: Record<string, { required: number; available: number; valid: boolean; requiredSingle?: number; requiredMultiple?: number; availableSingle?: number; availableMultiple?: number }>;
}> {
    const topics: Record<string, { required: number; available: number; valid: boolean; requiredSingle?: number; requiredMultiple?: number; availableSingle?: number; availableMultiple?: number }> = {};

    for (const [topic, config] of Object.entries(FULL_EXAM_TOPIC_POINT_DISTRIBUTION)) {
        try {
            const questions = await db.getWrittenExamQuestionsByTopic(topic, 1000);
            const available = questions.length;
            const availableSingle = questions.filter(q => getQuestionMaxPoints(q.correctAnswer) === 1).length;
            const availableMultiple = questions.filter(q => getQuestionMaxPoints(q.correctAnswer) === 2).length;
            const valid = available >= config.questions && availableSingle >= config.single && availableMultiple >= config.multiple;

            topics[topic] = {
                required: config.questions,
                available,
                valid,
                requiredSingle: config.single,
                requiredMultiple: config.multiple,
                availableSingle,
                availableMultiple
            };
        } catch (error) {
            topics[topic] = { required: config.questions, available: 0, valid: false };
        }
    }

    const valid = Object.values(topics).every(t => t.valid);

    return { valid, topics };
}
