import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MODEL, anthropic, estimateCost } from "@/lib/claude";
import { findNumbers } from "@/lib/suggest-emphasis";

/**
 * Tailors a persona's selection to a job description.
 *
 * The no-fabrication rule is enforced by the SHAPE of this call, not by asking
 * nicely. There is no operation that creates a bullet from nothing: every
 * operation names a bulletId that must already exist in the corpus. The model
 * can select, reorder, and reword — it cannot invent.
 *
 * New material enters the corpus earlier, through the gap-fill Q&A, and is
 * approved by the user before generation ever sees it. That keeps the corpus
 * the single source of truth and keeps this step purely selective.
 */

const generationSchema = z.object({
  included: z
    .array(
      z.object({
        bulletId: z.string().describe("Must be one of the candidate bullet ids given."),
        rewrittenText: z
          .string()
          .nullable()
          .describe(
            "A rewording of this bullet for this posting, or null to use it unchanged. May reframe and reorder the same facts. Must not introduce any fact, tool, or number not already in the original.",
          ),
        rationale: z.string().describe("One short clause: why this bullet earns its place."),
      }),
    )
    .describe("The bullets to appear, in the order they should render."),
  excluded: z
    .array(
      z.object({
        bulletId: z.string(),
        rationale: z.string().describe("One short clause: why this was cut."),
      }),
    )
    .describe("Candidate bullets deliberately left out."),
  summary: z
    .string()
    .describe("Two or three sentences on the shape of the tailoring and its trade-offs."),
});

export type GenerationPlan = z.infer<typeof generationSchema>;

export type CandidateBullet = {
  bulletId: string;
  text: string;
  factTitle: string;
  factOrg: string | null;
  /** Whether this bullet is in the persona's current selection. */
  currentlySelected: boolean;
};

export type GenerateInput = {
  personaName: string;
  voiceGuidance: string | null;
  company: string;
  role: string;
  jdText: string;
  jdEmphasis: string | null;
  keywords: string[];
  candidates: CandidateBullet[];
  /** Persists across every generation. */
  standingPreferences: string[];
  /** Scoped to this generation only. Never written to the standing profile. */
  oneOffInstructions: string | null;
  pageBudget: number;
  /** How many bullets the current selection holds, as a sizing anchor. */
  currentBulletCount: number;
};

export type FabricationFlag = {
  bulletId: string;
  kind: "unknown-bullet" | "invented-number";
  detail: string;
};

export type GenerateResult = {
  plan: GenerationPlan;
  /** Anything rejected by the guards below, for display in the review UI. */
  flags: FabricationFlag[];
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

const SYSTEM = `You tailor an existing resume to a specific job posting.

You are SELECTING and REFRAMING work the candidate has already done. You are not
writing new claims.

Absolute rules:
- Every bulletId you return must be one of the candidate ids provided. Never
  invent an id.
- A rewrite may reframe, reorder, compress, or change emphasis. It may NOT add
  a technology, a responsibility, a scope, or an outcome that is not already in
  the original bullet.
- Numbers are sacred. Copy every figure exactly as written. Never add a figure
  that is not in the original, never round one, never "improve" one. A bullet
  with no number stays without a number.
- If a posting wants something the candidate has not done, leave it absent.
  Silence is correct; a fabricated claim is not.

How to choose:
- Lead with bullets that evidence what the posting actually asks for.
- Prefer a bullet already selected over an equivalent unselected one, so the
  resume stays recognisable between applications.
- Pull in unselected bullets when they evidence a posting requirement that the
  current selection does not.
- Cut bullets that evidence nothing this posting asks for. Cutting is how the
  page budget is met — do not compress every bullet to fit more in.

How to rewrite:
- Change the framing, not the facts. Move the posting-relevant part to the front.
- Keep the candidate's own register and vocabulary.
- Return null for rewrittenText when the original already reads well for this
  posting. Leaving a good bullet alone is a valid and common outcome.`;

export async function generateTailoredResume(
  input: GenerateInput,
): Promise<GenerateResult> {
  const byId = new Map(input.candidates.map((c) => [c.bulletId, c]));

  const candidateBlock = input.candidates
    .map(
      (c) =>
        `<bullet id="${c.bulletId}" role="${c.factTitle}${c.factOrg ? " — " + c.factOrg : ""}" currently_used="${c.currentlySelected}">${c.text}</bullet>`,
    )
    .join("\n");

  const standing = input.standingPreferences.length
    ? `\n\nStanding preferences (apply to every resume, not just this one):\n${input.standingPreferences.map((p) => `- ${p}`).join("\n")}`
    : "";

  // Kept textually separate from standing preferences so the two can never be
  // conflated by the model any more than they are in the data model.
  const oneOff = input.oneOffInstructions
    ? `\n\nOne-off instruction for THIS generation only (do not treat as a standing preference):\n${input.oneOffInstructions}`
    : "";

  const prompt = `Tailor the "${input.personaName}" resume for this posting.

Company: ${input.company}
Role: ${input.role}
${input.jdEmphasis ? `What the posting most wants: ${input.jdEmphasis}\n` : ""}
Requirements to evidence where genuinely possible:
${input.keywords.map((k) => `- ${k}`).join("\n")}
${input.voiceGuidance ? `\nVoice for this persona: ${input.voiceGuidance}` : ""}${standing}${oneOff}

Page budget: ${input.pageBudget} page. The current selection holds ${input.currentBulletCount} bullets and fits, so treat that as the size to stay near. Going a little under is fine; going well over will not fit.

<posting>
${input.jdText}
</posting>

Candidate bullets — every one is something the candidate has actually done:
${candidateBlock}`;

  const response = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
    output_config: {
      format: zodOutputFormat(generationSchema),
      effort: "high",
    },
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The model declined to tailor against this posting.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("Generation was cut off. Try a shorter job description.");
  }
  if (!response.parsed_output) {
    throw new Error("The model returned output that did not match the schema.");
  }

  const flags: FabricationFlag[] = [];
  const plan = response.parsed_output;

  // Guard 1 — unknown ids. The schema cannot enforce membership, so it is
  // checked here and offending entries are dropped rather than rendered.
  plan.included = plan.included.filter((item) => {
    if (byId.has(item.bulletId)) return true;
    flags.push({
      bulletId: item.bulletId,
      kind: "unknown-bullet",
      detail: "Referenced a bullet that is not in the corpus. Dropped.",
    });
    return false;
  });
  plan.excluded = plan.excluded.filter((item) => byId.has(item.bulletId));

  // Guard 2 — invented numbers. A rewrite may drop a figure but may never add
  // one, so any number in the rewrite that is absent from the original means
  // the rewrite is discarded and the original text stands.
  for (const item of plan.included) {
    if (!item.rewrittenText) continue;
    const original = byId.get(item.bulletId)!.text;
    const before = new Set(findNumbers(original).map((n) => n.toLowerCase()));
    const invented = findNumbers(item.rewrittenText).filter(
      (n) => !before.has(n.toLowerCase()),
    );
    if (invented.length) {
      flags.push({
        bulletId: item.bulletId,
        kind: "invented-number",
        detail: `Rewrite introduced ${invented.join(", ")}, absent from the original. Reverted to the original wording.`,
      });
      item.rewrittenText = null;
    }
  }

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;

  return {
    plan,
    flags,
    inputTokens,
    outputTokens,
    costUsd: estimateCost(inputTokens, outputTokens),
  };
}
