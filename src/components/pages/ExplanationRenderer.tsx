import React, { useMemo } from "react";

interface ExplanationRendererProps {
  text: string;
  textAR?: string;
  language?: string;
}

interface ParsedSection {
  id: string;
  title: string;
  content: string;
}

const SECTION_BY_NUMBER: Record<number, { id: string; title: string }> = {
  1: { id: "simple", title: "Einfache Erklärung" },
  2: { id: "terms", title: "Begriffserklärung" },
  3: { id: "law", title: "Gesetzliche Grundlage" },
  4: { id: "wrong", title: "Warum falsch?" },
  5: { id: "exam", title: "Prüfungsrelevanz" },
  6: { id: "errors", title: "Häufige Fehler" },
  7: { id: "example", title: "Praxisbeispiel" },
  8: { id: "memory", title: "Merkhilfe" },
};

const SIMPLE_HEADING_PATTERNS: Array<{ id: string; title: string; regex: RegExp }> = [
  { id: "simple", title: "Einfache Erklärung", regex: /^einfache\s+erklärung:?$/i },
  { id: "simple", title: "الشرح المبسط", regex: /^الشرح\s+المبسط:?$/i },
];

const htmlToText = (html: string): string => {
  if (!html) return "";
  let text = html;
  text = text.replace(/<li>/g, "• ");
  text = text.replace(/<\/li>/g, "\n");
  text = text.replace(/<\/p>/g, "\n\n");
  text = text.replace(/<br\s*\/?>/g, "\n");
  text = text.replace(/\\n/g, "\n");
  text = text.replace(/<[^>]*>?/gm, "");
  text = text.replace(/\n\s*\n/g, "\n\n");
  return text.trim();
};

function normalizeHeading(heading: string): string {
  return heading.trim().replace(/:+$/, "");
}

function detectSectionIdentity(heading: string): { id: string; title: string } {
  const clean = normalizeHeading(heading);
  for (const candidate of SIMPLE_HEADING_PATTERNS) {
    if (candidate.regex.test(clean)) {
      return { id: candidate.id, title: candidate.title };
    }
  }
  return { id: `heading-${clean.toLowerCase()}`, title: clean || "Erklärung" };
}

function parseSections(rawText: string): ParsedSection[] {
  const numberedHeadingRegex = /^\s*#{1,6}\s*([1-8])\.\s+(.+)$/gm;
  const numbered: Array<{ num: number; index: number; length: number }> = [];
  let numberedMatch: RegExpExecArray | null = null;
  while ((numberedMatch = numberedHeadingRegex.exec(rawText)) !== null) {
    const num = Number(numberedMatch[1]);
    if (!SECTION_BY_NUMBER[num]) continue;
    numbered.push({ num, index: numberedMatch.index, length: numberedMatch[0].length });
  }

  if (numbered.length >= 2) {
    numbered.sort((a, b) => a.index - b.index);
    return numbered
      .map((current, i) => {
        const next = numbered[i + 1];
        const start = current.index + current.length;
        const end = next ? next.index : rawText.length;
        const content = htmlToText(rawText.substring(start, end)).replace(/^[:\s]+/, "");
        const mapped = SECTION_BY_NUMBER[current.num];
        return { id: mapped.id, title: mapped.title, content };
      })
      .filter((block) => block.content.length > 0);
  }

  const genericHeadingRegex = /^\s*#{1,6}\s+(.+)$/gm;
  const generic: Array<{ heading: string; index: number; length: number }> = [];
  let genericMatch: RegExpExecArray | null = null;
  while ((genericMatch = genericHeadingRegex.exec(rawText)) !== null) {
    generic.push({
      heading: genericMatch[1].trim(),
      index: genericMatch.index,
      length: genericMatch[0].length,
    });
  }

  if (generic.length > 0) {
    return generic
      .map((current, i) => {
        const next = generic[i + 1];
        const start = current.index + current.length;
        const end = next ? next.index : rawText.length;
        const content = htmlToText(rawText.substring(start, end)).replace(/^[:\s]+/, "");
        const identity = detectSectionIdentity(current.heading);
        return {
          id: generic.length === 1 ? "simple" : identity.id,
          title: generic.length === 1 ? identity.title : identity.title || "Erklärung",
          content,
        };
      })
      .filter((block) => block.content.length > 0);
  }

  const cleanText = htmlToText(rawText);
  return [{ id: "general", title: "Erklärung", content: cleanText }];
}

function boldifySegments(txt: string): React.ReactNode[] {
  const parts = txt.split(/(\*[^*]+\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("*") && part.endsWith("*")) {
      return (
        <em key={i} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="bg-slate-100 dark:bg-slate-800 px-1 rounded">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

function boldify(txt: string): React.ReactNode[] {
  if (!txt) return [];
  const parts = txt.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|(?:§+)\s*\d+[a-z]?)/g);
  return parts.map((part, i) => {
    if (!part) return null;

    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-bold text-slate-900 dark:text-white">
          {boldifySegments(part.slice(2, -2))}
        </strong>
      );
    }

    if (part.startsWith("*") && part.endsWith("*")) {
      return (
        <em key={i} className="italic opacity-90">
          {boldifySegments(part.slice(1, -1))}
        </em>
      );
    }

    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 font-mono text-[0.9em] border border-slate-200 dark:border-slate-700"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    if (part.match(/§+/)) {
      return (
        <span key={i} className="font-bold text-blue-600 dark:text-blue-400">
          {part}
        </span>
      );
    }

    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

function renderContent(content: string, dir: "ltr" | "rtl" = "ltr") {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let listGroup: { type: "ul" | "ol"; items: string[] } | null = null;
  let listKey = 0;
  let pKey = 0;

  const flushList = () => {
    if (!listGroup) return;
    const ListTag = listGroup.type;
    elements.push(
      <ListTag
        key={`list-${listKey++}`}
        className={`space-y-2 my-4 ${ListTag === "ol" ? "list-decimal list-inside ml-2" : ""}`}
      >
        {listGroup.items.map((item, i) => (
          <li key={i} className={`flex items-start gap-3 ${dir === "rtl" ? "flex-row-reverse text-right" : ""}`}>
            {listGroup?.type === "ul" && <div className="mt-2.5 w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />}
            <span className="text-slate-700 dark:text-slate-300 leading-relaxed">
              {listGroup?.type === "ol" && <span className="mr-2 font-bold text-blue-500">{i + 1}.</span>}
              {boldify(item)}
            </span>
          </li>
        ))}
      </ListTag>,
    );
    listGroup = null;
  };

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (trimmed.startsWith("- ") || trimmed.startsWith("• ") || trimmed.startsWith("* ")) {
      if (listGroup && listGroup.type !== "ul") flushList();
      if (!listGroup) listGroup = { type: "ul", items: [] };
      listGroup.items.push(trimmed.replace(/^[-•*]\s+/, ""));
      return;
    }

    if (trimmed.match(/^\d+\.\s/)) {
      if (listGroup && listGroup.type !== "ol") flushList();
      if (!listGroup) listGroup = { type: "ol", items: [] };
      listGroup.items.push(trimmed.replace(/^\d+\.\s+/, ""));
      return;
    }

    if (trimmed === "") {
      flushList();
      return;
    }

    if (trimmed.startsWith("> ") || trimmed.startsWith(">")) {
      flushList();
      const quoteText = trimmed.replace(/^>\s*/, "");
      elements.push(
        <blockquote
          key={`bq-${pKey++}`}
          className="border-l-4 border-blue-500 bg-blue-50 dark:bg-slate-800/50 p-3 my-3 rounded-r-lg text-slate-700 dark:text-slate-300 italic"
        >
          {boldify(quoteText)}
        </blockquote>,
      );
      return;
    }

    flushList();
    elements.push(
      <p key={`p-${pKey++}`} className="text-slate-700 dark:text-slate-300 leading-relaxed mb-3">
        {boldify(trimmed)}
      </p>,
    );
  });

  flushList();

  return (
    <div className={`text-[13px] sm:text-sm ${dir === "rtl" ? "text-right" : ""}`} dir={dir}>
      {elements}
    </div>
  );
}

export function ExplanationRenderer({ text, textAR, language = "DE" }: ExplanationRendererProps) {
  const isArabicEnabled = language === "DE_AR" && !!textAR;

  const sectionsDE = useMemo(() => parseSections(text), [text]);
  const sectionsAR = useMemo(() => {
    if (!isArabicEnabled) return [] as ParsedSection[];
    const parsed = parseSections(textAR!);
    if (parsed.length > 1 || (parsed.length === 1 && parsed[0].id !== "general")) {
      return parsed;
    }
    return [{ id: "simple", title: "الترجمة", content: parsed[0]?.content || "" }];
  }, [textAR, isArabicEnabled]);

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden min-h-[100px]">
        {sectionsDE.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm italic">Kein Inhalt für diesen Abschnitt verfügbar.</div>
        ) : (
          sectionsDE.map((block, idx) => {
            const arBlock = sectionsAR.find((b) => b.id === block.id) || sectionsAR[idx];
            const isFirst = idx === 0;
            const showTitle = sectionsDE.length > 1;

            return (
              <div key={`${block.id}-${idx}`} className={`p-6 ${!isFirst ? "border-t border-slate-100 dark:border-slate-800" : ""}`}>
                {showTitle && (
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 opacity-70">{block.title}</p>
                )}
                {renderContent(block.content)}
                {isArabicEnabled && arBlock?.content && (
                  <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 text-right opacity-70">
                      الترجمة
                    </p>
                    <div className="font-arabic">{renderContent(arBlock.content, "rtl")}</div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
