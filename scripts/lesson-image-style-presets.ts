export interface LessonImageStylePreset {
  code: string;
  name: string;
  description: string;
  mood: string;
  visualStyle: string;
  lighting: string;
  colors: string;
  composition: string;
  negativePrompt: string;
}

export const LESSON_IMAGE_STYLE_PRESETS: Record<string, LessonImageStylePreset> = {
  sachkunde_real_clean: {
    code: "sachkunde_real_clean",
    name: "Clean Realistic",
    description: "Photorealistic training scene, clear and professional.",
    mood: "trustworthy, calm, modern",
    visualStyle: "high-detail realistic photography, no text overlays, no logo",
    lighting: "soft daylight, neutral contrast",
    colors: "natural colors, subtle blue and gray accents",
    composition: "single clear focus, medium shot, tidy background",
    negativePrompt:
      "blurry, noisy, watermark, logo, text, low quality, distorted faces, extra fingers, cartoon",
  },
  sachkunde_cinematic: {
    code: "sachkunde_cinematic",
    name: "Cinematic Story",
    description: "Realistic but dramatic teaching image with depth.",
    mood: "focused, serious, motivating",
    visualStyle: "cinematic realism, shallow depth of field, no text overlays, no logo",
    lighting: "golden hour rim light with controlled shadows",
    colors: "deep teal and warm amber accents, still natural skin tones",
    composition: "rule of thirds, foreground depth, strong subject separation",
    negativePrompt:
      "anime, comic, low contrast, over-saturated, watermark, logo, text, artifacts, duplicate limbs",
  },
  sachkunde_vector_modern: {
    code: "sachkunde_vector_modern",
    name: "Modern Vector",
    description: "Flat vector style for very clean lesson thumbnails.",
    mood: "friendly, clear, structured",
    visualStyle: "flat vector illustration, geometric shapes, no text overlays, no logo",
    lighting: "flat lighting, minimal shadows",
    colors: "limited palette with navy, mint, sand, and soft gray",
    composition: "simple icon-like scene, centered subject, clean whitespace",
    negativePrompt:
      "photorealistic textures, cluttered background, tiny details, text, watermark, low resolution",
  },
};

export const DEFAULT_LESSON_IMAGE_STYLE_CODE = "sachkunde_real_clean";

export function resolveLessonImageStyle(code?: string): LessonImageStylePreset {
  if (code && LESSON_IMAGE_STYLE_PRESETS[code]) {
    return LESSON_IMAGE_STYLE_PRESETS[code];
  }
  return LESSON_IMAGE_STYLE_PRESETS[DEFAULT_LESSON_IMAGE_STYLE_CODE];
}

export function listLessonImageStyles(): LessonImageStylePreset[] {
  return Object.values(LESSON_IMAGE_STYLE_PRESETS);
}
