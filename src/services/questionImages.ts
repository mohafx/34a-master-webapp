import { supabase } from '../lib/supabase';

export interface GenerateQuestionImageResult {
  status: 'ready' | 'pending' | 'deleted';
  url?: string;
  altText?: string | null;
  cached?: boolean;
}

/**
 * Triggers (or retrieves) the single, cached explanation image for a quiz
 * question. The backend guarantees each question is generated exactly once;
 * repeat calls just return the cached image.
 */
export async function generateQuestionImage(
  questionId: string,
  action: 'generate' | 'delete' | 'regenerate' = 'generate',
): Promise<GenerateQuestionImageResult> {
  const { data, error } = await supabase.functions.invoke<GenerateQuestionImageResult & { error?: string }>(
    'generate-question-image',
    { body: { questionId, action } },
  );
  if (error) throw new Error(error.message || 'Bildgenerierung fehlgeschlagen.');
  if (!data || (data as { error?: string }).error) {
    throw new Error((data as { error?: string })?.error || 'Bildgenerierung fehlgeschlagen.');
  }
  return data;
}
