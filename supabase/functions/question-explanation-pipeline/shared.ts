export interface ExplanationPayload {
  explanation_de: string;
  explanation_ar: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: string[];
}

const DE_HEADING = "Einfache Erklärung";
const AR_HEADING = "الشرح المبسط";
const MARKDOWN_HEADING_REGEX = /^\s*#{1,6}\s+.+$/gm;

function containsForbiddenMarkup(text: string): boolean {
  const hasHtmlTag = /<[^>]+>/.test(text);
  const hasClassHints = /\b(class=|className=|tailwind|bg-[a-z]|text-[a-z]|px-\d|py-\d)\b/i.test(text);
  return hasHtmlTag || hasClassHints;
}

function countMarkdownHeadings(text: string): number {
  const matches = text.match(MARKDOWN_HEADING_REGEX);
  return matches ? matches.length : 0;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsRequiredHeading(text: string, heading: string): boolean {
  const rx = new RegExp(`^\\s*#{2,3}\\s*${escapeRegExp(heading)}\\s*:?\\s*$`, "m");
  return rx.test(text);
}

function parseMaybeObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function normalizeExplanationPayload(value: unknown): ExplanationPayload | null {
  const obj = parseMaybeObject(value);
  if (!obj) return null;

  const de = obj.explanation_de;
  const ar = obj.explanation_ar;
  if (typeof de !== "string" || typeof ar !== "string") return null;

  return {
    explanation_de: de.trim(),
    explanation_ar: ar.trim(),
  };
}

export function validateExplanationPayload(value: unknown): ValidationResult {
  const payload = normalizeExplanationPayload(value);
  if (!payload) {
    return { ok: false, issues: ["Payload ist kein valides Objekt mit explanation_de/explanation_ar."] };
  }

  return validateExplanationContent(payload.explanation_de, payload.explanation_ar);
}

export function validateExplanationContent(explanationDe: string, explanationAr: string): ValidationResult {
  const issues: string[] = [];

  if (!explanationDe || explanationDe.length < 1200) {
    issues.push("explanation_de ist zu kurz (<1200 Zeichen).");
  }
  if (!explanationAr || explanationAr.length < 1200) {
    issues.push("explanation_ar ist zu kurz (<1200 Zeichen).");
  }
  if (explanationDe.length > 9000) {
    issues.push("explanation_de ist zu lang (>9000 Zeichen).");
  }
  if (explanationAr.length > 9000) {
    issues.push("explanation_ar ist zu lang (>9000 Zeichen).");
  }

  if (containsForbiddenMarkup(explanationDe) || containsForbiddenMarkup(explanationAr)) {
    issues.push("HTML/Tailwind-Markup erkannt.");
  }

  const deHeadingCount = countMarkdownHeadings(explanationDe);
  const arHeadingCount = countMarkdownHeadings(explanationAr);

  if (deHeadingCount !== 1) {
    issues.push("DE: Es muss genau eine Markdown-Ueberschrift geben.");
  }
  if (arHeadingCount !== 1) {
    issues.push("AR: Es muss genau eine Markdown-Ueberschrift geben.");
  }

  if (!containsRequiredHeading(explanationDe, DE_HEADING)) {
    issues.push(`DE: Ueberschrift muss "### ${DE_HEADING}" sein.`);
  }
  if (!containsRequiredHeading(explanationAr, AR_HEADING)) {
    issues.push(`AR: Ueberschrift muss "### ${AR_HEADING}" sein.`);
  }

  if (!/(§|\bBGB\b|\bStGB\b|\bStPO\b|\bGewO\b|\bGG\b)/i.test(explanationDe)) {
    issues.push("DE: Keine klare Rechtsgrundlage erkannt (z.B. §, BGB, StGB, StPO, GewO, GG).");
  }

  if (!/(falsch|falsche|falschen|nicht korrekt|A\)|B\)|C\)|D\)|E\)|F\))/i.test(explanationDe)) {
    issues.push("DE: Analyse der falschen Antworten fehlt oder ist zu unklar.");
  }

  return { ok: issues.length === 0, issues };
}

export function safeJsonParse(rawText: string): unknown | null {
  if (!rawText) return null;
  const stripped = rawText.replace(/```(?:json)?\s*|\s*```/gi, "").trim();
  if (!stripped) return null;

  const tryParse = (value: string): unknown | null => {
    try {
      return JSON.parse(value);
    } catch (_) {
      return null;
    }
  };

  const extractBalancedCandidates = (value: string): string[] => {
    const candidates: string[] = [];
    for (let i = 0; i < value.length; i++) {
      const first = value[i];
      if (first !== "{" && first !== "[") continue;

      let depth = 0;
      let inString = false;
      let escaped = false;

      for (let j = i; j < value.length; j++) {
        const ch = value[j];

        if (inString) {
          if (escaped) {
            escaped = false;
            continue;
          }
          if (ch === "\\") {
            escaped = true;
            continue;
          }
          if (ch === "\"") {
            inString = false;
          }
          continue;
        }

        if (ch === "\"") {
          inString = true;
          continue;
        }
        if (ch === "{" || ch === "[") {
          depth++;
          continue;
        }
        if (ch === "}" || ch === "]") {
          depth--;
          if (depth === 0) {
            candidates.push(value.slice(i, j + 1).trim());
            break;
          }
        }
      }
    }
    return candidates;
  };

  const direct = tryParse(stripped);
  if (direct !== null) return direct;

  const candidates = extractBalancedCandidates(stripped);
  for (const candidate of candidates) {
    const parsed = tryParse(candidate);
    if (parsed !== null) return parsed;
  }

  return null;
}

export function nextStatusAfterFailure(attempts: number, maxAttempts = 3): "retry" | "failed" {
  return attempts >= maxAttempts ? "failed" : "retry";
}
