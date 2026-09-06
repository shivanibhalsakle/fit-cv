import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MODEL, anthropic, estimateCost } from "@/lib/claude";

/**
 * Resume text → structured JSON.
 *
 * The one model call in the import path. Everything downstream — matching,
 * dedup, conflict detection — is deterministic code, so this call only has to
 * do transcription, never judgement about what belongs in the corpus.
 */

export const parsedBulletSchema = z.object({
  text: z
    .string()
    .describe("The bullet copied verbatim from the resume. Never reworded."),
  metrics: z
    .array(z.string())
    .describe(
      "Figures appearing in this bullet, copied exactly as written, e.g. '23 screens', '91.4%/90.0% ROC-AUC'. Empty if none.",
    ),
});

export const parsedFactSchema = z.object({
  kind: z.enum([
    "EXPERIENCE",
    "PROJECT",
    "EDUCATION",
    "CERTIFICATION",
    "AWARD",
    "PUBLICATION",
    "LEADERSHIP",
  ]),
  title: z
    .string()
    .describe(
      "Job title, project name, degree, certification name, or award name, exactly as written.",
    ),
  org: z
    .string()
    .nullable()
    .describe("Employer, university, issuer, or publisher. Null if absent."),
  location: z.string().nullable(),
  startDate: z
    .string()
    .nullable()
    .describe("Month precision as YYYY-MM, e.g. '2021-10'. Null if absent."),
  endDate: z
    .string()
    .nullable()
    .describe("YYYY-MM. Null if absent or if the role is ongoing."),
  isCurrent: z
    .boolean()
    .describe("True when the resume says Present / Current / Ongoing."),
  tagline: z
    .string()
    .nullable()
    .describe(
      "One-line descriptor under the title. Projects use it for a summary; education for GPA (e.g. 'GPA: 3.59/4'). Null for most experience entries.",
    ),
  bullets: z.array(parsedBulletSchema),
});

export const parsedResumeSchema = z.object({
  contactName: z.string().nullable(),
  contactEmail: z.string().nullable(),
  contactPhone: z.string().nullable(),
  contactLocation: z.string().nullable(),
  facts: z.array(parsedFactSchema),
  skills: z
    .array(z.string())
    .describe(
      "Every individual skill listed, flattened across all skill categories.",
    ),
});

export type ParsedResume = z.infer<typeof parsedResumeSchema>;
export type ParsedFact = z.infer<typeof parsedFactSchema>;

const SYSTEM = `You transcribe resumes into structured JSON.

You are a TRANSCRIBER, not an editor. The output feeds a corpus that is the
user's source of truth, so accuracy matters far more than polish.

Rules:
- Copy every bullet VERBATIM. Do not reword, shorten, expand, merge, split,
  improve grammar, or "clean up" anything.
- Never invent a fact, a metric, a date, or a technology that is not on the page.
- Copy numbers exactly as written, including their units and punctuation.
- If a field is genuinely absent, return null. Do not guess.
- Sub-bullets and continuation lines belong to the bullet above them; join them
  into that single bullet rather than creating a new one.
- PDF extraction can interleave dates and headings oddly. Attach each date range
  to the entry it actually belongs to, using surrounding context.
- One entry per role. If the same employer appears twice with different titles
  and different date ranges, that is two separate facts.
- Leadership positions, awards, and publications are their own kinds, not
  bullets under something else.`;

export type ParseResult = {
  parsed: ParsedResume;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

export async function parseResume(text: string): Promise<ParseResult> {
  const response = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Transcribe this resume into structured JSON.\n\n<resume>\n${text}\n</resume>`,
      },
    ],
    output_config: {
      format: zodOutputFormat(parsedResumeSchema),
      // Transcription, not reasoning. Medium holds quality here at lower spend;
      // raise it if bullets start arriving mangled.
      effort: "medium",
    },
  });

  // Always check stop_reason before reading content — a refusal returns HTTP 200.
  if (response.stop_reason === "refusal") {
    throw new Error(
      "The model declined to process this document. If it is genuinely a resume, please report this.",
    );
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error(
      "The resume was too long to transcribe in one pass. Split it and import the halves separately.",
    );
  }
  if (!response.parsed_output) {
    throw new Error("The model returned output that did not match the schema.");
  }

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;

  return {
    parsed: response.parsed_output,
    inputTokens,
    outputTokens,
    costUsd: estimateCost(inputTokens, outputTokens),
  };
}
