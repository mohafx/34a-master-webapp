/**
 * Type definitions for Interactive Lesson Screens
 */

export type InteractiveScreenType =
  | 'video'
  | 'question_single'
  | 'expandable_terms'
  | 'question_multi'
  | 'expandable_cards'
  | 'matching'
  | 'expandable_norms'
  | 'question_multi_check'
  | 'fill_blank'
  | 'completion';

export interface InteractiveScreen {
  id: string;
  lesson_id: string;
  screen_index: number;
  screen_type: InteractiveScreenType;
  title_de?: string;
  title_ar?: string;
  content_json: any; // Screen-type specific content
  requires_answer: boolean;
  correct_answer_json?: any; // Validation data
  created_at: string;
  updated_at: string;
}

// ============================================
// Screen-Type Specific Content Interfaces
// ============================================

export interface VideoScreenContent {
  video_url: string;
  intro_text_de: string;
  intro_text_ar?: string;
  feature_grid?: {
    items: Array<{
      icon?: string; // Lucide icon name
      label: string;
      label_ar?: string;
      color: string;
      bg: string;
      examples?: {
        de: string[];
        ar?: string[];
      };
    }>;
  };
  info_card?: {
    text_de: string;
    text_ar?: string;
    icon?: string;
  };
}

export interface QuestionScreenContent {
  question_de: string;
  question_ar?: string;
  options: Array<{
    id: string;
    text: string;
    text_ar?: string;
    correct: boolean;
  }>;
  explanation_correct_de?: string;
  explanation_correct_ar?: string;
  explanation_incorrect_de?: string;
  explanation_incorrect_ar?: string;
  hint?: {
    text_de: string;
    text_ar?: string;
  };
  icon?: string;
  gradient_color?: string;
}

export interface ExpandableTermsScreenContent {
  intro_text_de: string;
  intro_text_ar?: string;
  highlighted_text?: {
    text_de: string;
    text_ar?: string;
  };
  transition_text_de?: string;
  transition_text_ar?: string;
  terms: Array<{
    id: string;
    term: string;
    term_ar?: string;
    definition: string;
    definition_ar?: string;
  }>;
}

export interface ExpandableCardsScreenContent {
  title_de: string;
  title_ar?: string;
  subtitle_de?: string;
  subtitle_ar?: string;
  cards: Array<{
    id: number;
    title: string;
    title_ar?: string;
    description: string;
    description_ar?: string;
    tip?: string;
    tip_ar?: string;
    color: string; // Gradient classes like 'from-blue-500 to-indigo-600'
  }>;
}

export interface MatchingScreenContent {
  instructions_de: string;
  instructions_ar?: string;
  left_items: Array<{
    id: string;
    text_de: string;
    text_ar?: string;
  }>;
  right_items: Array<{
    id: string;
    text_de: string;
    text_ar?: string;
  }>;
  legend_title_de?: string;
  legend_title_ar?: string;
  success_message_de?: string;
  success_message_ar?: string;
}

export interface ExpandableNormsScreenContent {
  title_de: string;
  title_ar?: string;
  items: Array<{
    id: string;
    title: string;
    title_ar?: string;
    example: string;
    example_ar?: string;
  }>;
  footer_text_de?: string;
  footer_text_ar?: string;
}

export interface FillBlankScreenContent {
  title_de: string;
  title_ar?: string;
  text_template: string; // Text with placeholders like {blank_0}, {blank_1}
  blanks: Array<{
    index: number;
    placeholder: string;
    options: Array<{
      value: string;
      label: string;
      label_ar?: string;
    }>;
    correct_value: string;
  }>;
  success_message_de?: string;
  success_message_ar?: string;
  error_message_de?: string;
  error_message_ar?: string;
}

export interface CompletionScreenContent {
  title_de: string;
  title_ar?: string;
  learned_items: Array<{
    text_de: string;
    text_ar?: string;
  }>;
  continue_button_text_de?: string;
  continue_button_text_ar?: string;
  back_button_text_de?: string;
  back_button_text_ar?: string;
  next_lesson_id?: string;
}

// ============================================
// Answer Validation Interfaces
// ============================================

export interface SingleQuestionAnswer {
  correct_option_id: string;
}

export interface MultiSelectAnswer {
  correct_options: string[];
  must_select_all: boolean;
}

export interface MatchingAnswer {
  matches: Record<string, string>; // term_id -> option_id
}

export interface FillBlankAnswer {
  blanks: Record<number, string>; // blank_index -> correct_value
}
