import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MODEL, anthropic, estimateCost } from "@/lib/claude";
import { normalise } from "@/lib/merge";

/**
 * Job description → keywords → gaps.
 *
 * Two halves, deliberately split by cost:
 *
 *  - Matching known skills and computing which of them the corpus already
 *    covers is set arithmetic. It runs in code, costs nothing, and is exact.
 *  - Only discovering terms the dictionary has never seen needs a model, and
 *    that is one small call over the JD alone — the corpus is never sent.
 */

// --- deterministic ---------------------------------------------------------

/** Tokens too generic to be worth matching on. */
const NOISE = new Set([
  "experience", "work", "team", "role", "years", "strong", "ability", "skills",
  "knowledge", "understanding", "working", "environment", "including", "using",
  "related", "field", "degree", "plus", "bonus", "etc", "excellent", "good",
  "familiarity", "proficiency", "responsibilities", "requirements", "preferred",
]);

/**
 * Finds known vocabulary inside free text.
 *
 * Matching is done on a normalised copy with word boundaries so that "R" does
 * not match inside "React" and "Go" does not match inside "Google" — short
 * skill names are the whole reason this is not a naive `includes`.
 */
export function matchVocabulary(text: string, vocabulary: string[]): string[] {
  const haystack = ` ${normalise(text)} `;
  const found: string[] = [];

  for (const term of vocabulary) {
    const needle = normalise(term);
    if (!needle || NOISE.has(needle)) continue;
    if (haystack.includes(` ${needle} `)) {
      found.push(term);
      continue;
    }
    // Multi-word terms also match when the JD writes them without punctuation,
    // e.g. "ASP.NET Core" normalises to "asp net core".
    if (needle.includes(" ") && haystack.includes(needle)) found.push(term);
  }

  return [...new Set(found)];
}

export type Gap = {
  keyword: string;
  /** Where the term came from, so the UI can say why it is being asked about. */
  source: "dictionary" | "extracted";
};

export type Coverage = {
  /** In the JD and evidenced by a bullet or credential this resume shows. */
  covered: string[];
  /** In the JD, evidenced in the corpus, but not on this resume yet. */
  availableUnused: string[];
  /**
   * In the JD and named in the skills list, but no bullet or credential
   * actually demonstrates it. A claim, not evidence — and the distinction
   * matters, because generation will refuse to write a bullet for these.
   */
  listedOnly: string[];
  /** In the JD and nowhere at all. These become questions. */
  gaps: Gap[];
};

/**
 * What this resume can and cannot stand behind. Pure set arithmetic — no model,
 * no cost.
 *
 * Evidence means a bullet or a credential, never the skills list. Listing
 * "Power BI" is a claim; a bullet describing a Power BI dashboard is evidence.
 * Collapsing the two would report a requirement as covered while generation
 * correctly refuses to write anything for it.
 */
export function computeCoverage(
  jdKeywords: { term: string; source: Gap["source"] }[],
  sources: {
    /** Bullets and credentials the corpus holds, whether shown or not. */
    corpusEvidence: string;
    /** Bullets and credentials this persona actually renders. */
    personaEvidence: string;
    /** The skills list — claims, not evidence. */
    skillsListed: string;
  },
): Coverage {
  const terms = jdKeywords.map((k) => k.term);
  const inCorpus = new Set(matchVocabulary(sources.corpusEvidence, terms).map(normalise));
  const inPersona = new Set(matchVocabulary(sources.personaEvidence, terms).map(normalise));
  const listed = new Set(matchVocabulary(sources.skillsListed, terms).map(normalise));

  const covered: string[] = [];
  const availableUnused: string[] = [];
  const listedOnly: string[] = [];
  const gaps: Gap[] = [];

  for (const { term, source } of jdKeywords) {
    const key = normalise(term);
    if (inPersona.has(key)) covered.push(term);
    else if (inCorpus.has(key)) availableUnused.push(term);
    else if (listed.has(key)) listedOnly.push(term);
    else gaps.push({ keyword: term, source });
  }

  return { covered, availableUnused, listedOnly, gaps };
}

// --- model-assisted --------------------------------------------------------

const extractionSchema = z.object({
  keywords: z
    .array(z.string())
    .describe(
      "Concrete, checkable requirements from the job description: named technologies, tools, methods, certifications, and domain skills. Copy each as written in the posting.",
    ),
  seniority: z.string().nullable().describe("e.g. 'Intern', 'Senior'. Null if unstated."),
  emphasis: z
    .string()
    .describe(
      "One sentence: what this posting most wants, in the posting's own framing.",
    ),
});

const SYSTEM = `You extract the checkable requirements from a job description.

Return the specific, verifiable things a resume could be matched against:
named technologies, tools, platforms, languages, frameworks, methodologies,
certifications, and concrete domain skills.

Do NOT return:
- generic soft skills ("communication", "team player", "detail-oriented")
- company boilerplate, benefits, or values language
- job-function restatements ("software development", "analysis")
- anything that could not be evidenced by a specific accomplishment

Copy each keyword as the posting writes it. Prefer the specific over the
general: "Power BI" not "BI tools", "PostgreSQL" not "databases".`;

export type ExtractionResult = {
  keywords: { term: string; source: Gap["source"] }[];
  seniority: string | null;
  emphasis: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

/**
 * Extracts JD keywords. The dictionary pass runs first and for free; the model
 * only has to find what the dictionary does not already know.
 */
export async function extractKeywords(
  jdText: string,
  dictionary: string[],
): Promise<ExtractionResult> {
  const known = matchVocabulary(jdText, dictionary);

  const response = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 4000,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Extract the checkable requirements from this posting.\n\n<posting>\n${jdText}\n</posting>`,
      },
    ],
    output_config: {
      format: zodOutputFormat(extractionSchema),
      effort: "medium",
    },
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The model declined to read this posting.");
  }
  if (!response.parsed_output) {
    throw new Error("The model returned output that did not match the schema.");
  }

  const seen = new Set(known.map(normalise));
  const keywords: ExtractionResult["keywords"] = known.map((term) => ({
    term,
    source: "dictionary" as const,
  }));

  for (const term of response.parsed_output.keywords) {
    const key = normalise(term);
    if (!key || seen.has(key) || NOISE.has(key)) continue;
    seen.add(key);
    keywords.push({ term, source: "extracted" });
  }

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;

  return {
    keywords,
    seniority: response.parsed_output.seniority,
    emphasis: response.parsed_output.emphasis,
    inputTokens,
    outputTokens,
    costUsd: estimateCost(inputTokens, outputTokens),
  };
}
