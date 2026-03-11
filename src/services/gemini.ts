import { supabase } from '../lib/supabase';

// ========== API CALL HELPER ==========

async function callAIProxy(action: string, params: Record<string, any>): Promise<any> {
  try {
    const { data, error } = await supabase.functions.invoke('ai-proxy', {
      body: { action, ...params }
    });

    if (error) {
      console.error('AI Proxy error:', error);
      return null;
    }

    return data?.result;
  } catch (err: any) {
    console.error('AI Proxy call failed:', err?.message);
    return null;
  }
}

// ========== UNIFIED QUALITY ANALYSIS (ADMIN) ==========

export interface OptimizedQuestion {
  question_text_de: string;
  answers: Record<string, { text_de: string | null; isCorrect: boolean }>;
  correct_answer: string;
}

export interface QualityAnalysisResult {
  analysis: string; // Rich markdown
  optimized_question: OptimizedQuestion | null;
}

export const runQualityAnalysis = async (questionData: {
  questionText: string;
  answers: { letter: string; text: string; isCorrect: boolean }[];
  topic: string;
  questionType?: string;
}): Promise<QualityAnalysisResult> => {
  const result = await callAIProxy('quality-analysis', questionData);

  if (result && typeof result === 'object' && result.analysis) {
    return {
      analysis: result.analysis,
      optimized_question: result.optimized_question || null,
    };
  }

  return {
    analysis: '## \u274c Fehler\\n\\nKI-Qualit\u00e4tspr\u00fcfung nicht verf\u00fcgbar. API nicht erreichbar.',
    optimized_question: null,
  };
};

// ========== ARABIC TRANSLATION (ADMIN) ==========

export interface ArabicTranslationResult {
  analysis: string;
  translated_question: {
    question_text_ar: string;
    answers: Record<string, { text_ar: string }>;
  } | null;
}

export const runArabicTranslation = async (questionData: {
  questionText: string;
  answers: { letter: string; text: string; isCorrect: boolean; existingAr?: string | null }[];
  topic: string;
  questionType?: string;
  existingArabic?: { questionTextAr: string | null };
}): Promise<ArabicTranslationResult> => {
  const result = await callAIProxy('arabic-translation', questionData);

  if (result && typeof result === 'object' && result.analysis) {
    return {
      analysis: result.analysis,
      translated_question: result.translated_question || null,
    };
  }

  return {
    analysis: '## \u274c Fehler\\n\\nKI-\u00dcbersetzung nicht verf\u00fcgbar. API nicht erreichbar.',
    translated_question: null,
  };
};