import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MODEL, anthropic, estimateCost } from "@/lib/claude";

/**
 * Suggests which phrases in each bullet should be bold.
 *
 * Emphasis is presentation, not content: nothing here may change a word of the
 * bullet. The model returns phrases that must appear verbatim in the source
 * text, and any that do not are discarded before they are stored — a
 * "suggestion" that quietly rewrites a bullet would defeat the point of holding
 * the corpus as the source of truth.
 */

const suggestionSchema = z.object({
  bullets: z.array(
    z.object({
      bulletId: z.string(),
      phrases: z
        .array(z.string())
        .describe(
          "Phrases copied EXACTLY from this bullet, to render bold. ONLY named technologies/tools/stacks and numeric figures. Empty if the bullet contains neither.",
        ),
    }),
  ),
});

const SYSTEM = `You mark phrases in resume bullets to be set in bold.

Bold exactly two kinds of thing, and nothing else:

1. TECHNOLOGY — a named tool, library, framework, language, platform, service,
   protocol, or standard. Examples of the kind of thing that qualifies:
   "React Native (Expo)", "Spring Boot", "LangGraph", "PostGIS", "FastAPI",
   "ASP.NET Core", "Web Speech API", "Hotjar", "XGBoost", "Power BI".
   Include the qualifier when it is part of the name, as in "React Native (Expo)".

2. NUMBERS — any figure, with the unit or noun attached to it when one is
   directly adjacent. "23 screens", "91.4%/90.0% ROC-AUC", "2,000+ early users",
   "10s", "3min", "20,000-certificate", "15%", "team of 3-4", "27-node".

Bold NOTHING else. Not verbs, not outcomes, not methodology words, not job
functions, not adjectives, not whole clauses. If a phrase is neither a named
technology nor a number, leave it plain.

Hard constraints:
- Every phrase MUST appear character-for-character in that bullet. Do not
  paraphrase, re-case, re-punctuate, expand an abbreviation, or fix anything.
- Keep each phrase minimal: the technology name or the figure with its unit,
  not the surrounding sentence.
- A bullet with no technology and no number gets an empty list. That is a
  normal and correct outcome.`;

export type EmphasisSuggestion = { bulletId: string; phrases: string[] };

/**
 * Numeric spans, including an attached unit or hyphenated compound:
 * "23", "91.4%", "2,000+", "10s", "3min", "27-node", "20,000-certificate".
 *
 * Deliberately conservative — it captures the figure itself rather than trying
 * to guess how far the surrounding noun phrase extends. The model supplies the
 * fuller phrase; this only exists so that a figure can never be missed
 * entirely, which is the most visible way this feature could fail.
 */
export function findNumbers(text: string): string[] {
  // The lookbehind matters: without it, "Auth0-based" yields "0-based", which
  // is part of a product name rather than a figure.
  const matches = text.match(
    /(?<![A-Za-z0-9])\$?\d[\d,]*(?:\.\d+)?[a-z%+]*(?:-[a-z0-9]+)?/gi,
  );
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.trim()).filter((m) => /\d/.test(m)))];
}

export type SuggestResult = {
  suggestions: EmphasisSuggestion[];
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  /** Phrases the model returned that were not present verbatim, so dropped. */
  rejected: number;
};

export async function suggestEmphasis(
  bullets: { bulletId: string; text: string }[],
  voiceGuidance: string | null,
  personaName: string,
): Promise<SuggestResult> {
  if (!bullets.length) {
    return {
      suggestions: [],
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      rejected: 0,
    };
  }

  const context = voiceGuidance
    ? `\n\nThis resume is the "${personaName}" persona. Its voice: ${voiceGuidance}\nEmphasise what a reader hiring for that role scans for.`
    : `\n\nThis resume is the "${personaName}" persona.`;

  const body = bullets
    .map((b) => `<bullet id="${b.bulletId}">${b.text}</bullet>`)
    .join("\n");

  const response = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Choose bold phrases for each bullet.${context}\n\n${body}`,
      },
    ],
    output_config: {
      format: zodOutputFormat(suggestionSchema),
      effort: "medium",
    },
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The model declined this request.");
  }
  if (!response.parsed_output) {
    throw new Error("The model returned output that did not match the schema.");
  }

  // Verbatim check. A phrase that is not in the bullet is dropped rather than
  // stored, because emphasis must never alter the text it marks up.
  const textById = new Map(bullets.map((b) => [b.bulletId, b.text]));
  let rejected = 0;
  const byBullet = new Map<string, string[]>();

  for (const item of response.parsed_output.bullets) {
    const source = textById.get(item.bulletId);
    if (!source) continue;
    const kept = item.phrases.filter((p) => {
      const ok = p.trim().length > 0 && source.includes(p);
      if (!ok) rejected += 1;
      return ok;
    });
    byBullet.set(item.bulletId, kept);
  }

  // Numbers are mechanical, so they are found by pattern rather than trusted to
  // the model: a missed figure is the most visible failure this feature has.
  // Anything the model already covered is left alone.
  for (const b of bullets) {
    const existing = byBullet.get(b.bulletId) ?? [];
    const missing = findNumbers(b.text).filter(
      (n) => !existing.some((p) => p.includes(n)),
    );
    if (missing.length) byBullet.set(b.bulletId, [...existing, ...missing]);
  }

  const suggestions: EmphasisSuggestion[] = [];
  for (const [bulletId, phrases] of byBullet) {
    if (phrases.length) suggestions.push({ bulletId, phrases });
  }

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;

  return {
    suggestions,
    inputTokens,
    outputTokens,
    costUsd: estimateCost(inputTokens, outputTokens),
    rejected,
  };
}
