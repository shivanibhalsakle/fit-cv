import type { ParsedFact, ParsedResume } from "@/lib/parse-resume";

/**
 * Deterministic merge planning. No model involvement.
 *
 * The plan PROPOSES; it never decides. Matching resumes to an existing corpus
 * is genuinely ambiguous — the same employer can appear as two roles with
 * overlapping dates and different titles across files — so every proposal is
 * overridable in the review UI before anything is written.
 */

// --- text normalisation ----------------------------------------------------

export function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "of", "to", "in", "on", "for", "with", "by",
  "at", "as", "from", "into", "across", "using", "used", "that", "this",
]);

/**
 * Crude suffix stripping. Resume bullets describing the same work routinely
 * differ only in inflection — "analyzed"/"analyze", "used"/"using",
 * "identify"/"identifying" — and treating those as different tokens badly
 * under-scores genuine rewrites of the same accomplishment.
 */
function stem(w: string): string {
  for (const suffix of ["ingly", "edly", "ing", "ies", "ied", "ers", "er", "ed", "es", "s"]) {
    if (w.length > suffix.length + 2 && w.endsWith(suffix)) {
      return w.slice(0, -suffix.length);
    }
  }
  return w;
}

function tokens(s: string): Set<string> {
  return new Set(
    normalise(s)
      .split(" ")
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
      .map(stem),
  );
}

/** Jaccard overlap. Cheap, no embeddings, good enough at corpus scale. */
export function similarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  return shared / (ta.size + tb.size - shared);
}

/**
 * Above this, two bullets are the same accomplishment phrased differently.
 *
 * Deliberately low, because this is only ever applied WITHIN a fact that has
 * already been matched — both bullets are known to describe the same job, so
 * the prior that a partial overlap means "same work, reworded" is high. A
 * missed variant becomes a near-duplicate bullet the user can see and merge; a
 * false variant would bury an unrelated accomplishment under another bullet,
 * which is the worse error, so this is not lowered further.
 */
export const VARIANT_THRESHOLD = 0.32;
/** Above this, they are effectively identical and nothing needs storing. */
export const DUPLICATE_THRESHOLD = 0.95;

// --- shapes ----------------------------------------------------------------

export type ExistingBullet = { id: string; canonicalText: string };

export type ExistingFact = {
  id: string;
  kind: string;
  title: string;
  org: string | null;
  startDate: Date | null;
  endDate: Date | null;
  isCurrent: boolean;
  bullets: ExistingBullet[];
};

export type BulletPlan = {
  text: string;
  metrics: string[];
  /** duplicate: already held. variant: same work, new phrasing. new: unseen. */
  disposition: "duplicate" | "variant" | "new";
  /** Set for variant and duplicate. */
  matchedBulletId?: string;
  matchedBulletText?: string;
  score: number;
};

export type FactPlan = {
  parsed: ParsedFact;
  /** Best-guess existing fact, or null to create a new one. Overridable. */
  suggestedFactId: string | null;
  suggestedFactLabel: string | null;
  matchScore: number;
  /** Populated when several existing facts are plausible. */
  alternatives: { id: string; label: string; score: number }[];
  conflicts: Conflict[];
  bullets: BulletPlan[];
  /**
   * Bullets already on the matched fact, so the review UI can offer them as
   * attach targets. Lexical similarity misses rewrites that share little
   * vocabulary, so the user must be able to say "this is a phrasing of that"
   * even when the score did not suggest it.
   */
  targetBullets: { id: string; text: string }[];
};

export type Conflict = {
  field: string;
  incoming: string;
  canonical: string;
  note: string;
};

export type MergePlan = {
  facts: FactPlan[];
  newSkills: string[];
  contactConflicts: Conflict[];
  summary: {
    newFacts: number;
    matchedFacts: number;
    newBullets: number;
    newVariants: number;
    duplicateBullets: number;
  };
};

// --- planning --------------------------------------------------------------

function ym(d: Date | null): string | null {
  if (!d) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function label(f: ExistingFact): string {
  const range = [ym(f.startDate), f.isCurrent ? "present" : ym(f.endDate)]
    .filter(Boolean)
    .join(" – ");
  return `${f.title}${f.org ? " — " + f.org : ""}${range ? " (" + range + ")" : ""}`;
}

/** Do two month-precision ranges overlap at all? */
function rangesOverlap(
  aStart: string | null,
  aEnd: string | null,
  bStart: string | null,
  bEnd: string | null,
): boolean {
  if (!aStart || !bStart) return false;
  const aE = aEnd ?? "9999-12";
  const bE = bEnd ?? "9999-12";
  return aStart <= bE && bStart <= aE;
}

/**
 * Kinds whose identity is the employer and the period worked, not the title —
 * the same job is deliberately titled differently across this user's resumes.
 * Everything else (a certification, an award, a project) is identified by its
 * name, and frequently carries no dates and no issuer at all.
 */
const ROLE_KINDS = new Set(["EXPERIENCE", "EDUCATION"]);

function scoreFactMatch(parsed: ParsedFact, existing: ExistingFact): number {
  if (parsed.kind !== existing.kind) return 0;

  const orgMatch =
    parsed.org && existing.org
      ? similarity(parsed.org, existing.org)
      : parsed.org || existing.org
        ? // One side names an issuer and the other does not. Common for
          // certifications listed as a bare run-on line; not evidence against.
          0.5
        : 0.5;

  const titleMatch = similarity(parsed.title, existing.title);

  const hasDates = Boolean(parsed.startDate) && Boolean(existing.startDate);
  const dateMatch = rangesOverlap(
    parsed.startDate,
    parsed.isCurrent ? null : parsed.endDate,
    ym(existing.startDate),
    existing.isCurrent ? null : ym(existing.endDate),
  )
    ? 1
    : 0;

  if (ROLE_KINDS.has(parsed.kind) && hasDates) {
    return orgMatch * 0.45 + dateMatch * 0.35 + titleMatch * 0.2;
  }

  // Undated, or not a role: the name carries the identity.
  return titleMatch * 0.7 + orgMatch * 0.3;
}

export const FACT_MATCH_THRESHOLD = 0.5;

function planBullets(
  parsed: ParsedFact,
  matched: ExistingFact | null,
): BulletPlan[] {
  return parsed.bullets.map((b) => {
    if (!matched) {
      return { text: b.text, metrics: b.metrics, disposition: "new" as const, score: 0 };
    }

    let best: ExistingBullet | null = null;
    let bestScore = 0;
    for (const eb of matched.bullets) {
      const s = similarity(b.text, eb.canonicalText);
      if (s > bestScore) {
        bestScore = s;
        best = eb;
      }
    }

    if (best && bestScore >= DUPLICATE_THRESHOLD) {
      return {
        text: b.text,
        metrics: b.metrics,
        disposition: "duplicate" as const,
        matchedBulletId: best.id,
        matchedBulletText: best.canonicalText,
        score: bestScore,
      };
    }
    if (best && bestScore >= VARIANT_THRESHOLD) {
      return {
        text: b.text,
        metrics: b.metrics,
        disposition: "variant" as const,
        matchedBulletId: best.id,
        matchedBulletText: best.canonicalText,
        score: bestScore,
      };
    }
    return { text: b.text, metrics: b.metrics, disposition: "new" as const, score: bestScore };
  });
}

function detectConflicts(
  parsed: ParsedFact,
  matched: ExistingFact | null,
): Conflict[] {
  if (!matched) return [];
  const out: Conflict[] = [];

  if (normalise(parsed.title) !== normalise(matched.title)) {
    out.push({
      field: "title",
      incoming: parsed.title,
      canonical: matched.title,
      note: "Titles are immutable. The imported title is kept as an archived title, never emitted.",
    });
  }

  const inStart = parsed.startDate;
  const exStart = ym(matched.startDate);
  if (inStart && exStart && inStart !== exStart) {
    out.push({
      field: "startDate",
      incoming: inStart,
      canonical: exStart,
      note: "Existing date is canonical. Imported value treated as stale.",
    });
  }

  const inEnd = parsed.isCurrent ? "present" : parsed.endDate;
  const exEnd = matched.isCurrent ? "present" : ym(matched.endDate);
  if (inEnd && exEnd && inEnd !== exEnd) {
    out.push({
      field: "endDate",
      incoming: inEnd,
      canonical: exEnd,
      note: "Existing date is canonical. Imported value treated as stale.",
    });
  }

  return out;
}

export function buildMergePlan(
  parsed: ParsedResume,
  corpus: ExistingFact[],
  existingSkills: string[],
  canonicalEmail: string,
): MergePlan {
  const claimed = new Set<string>();
  const facts: FactPlan[] = [];

  // Highest-confidence matches first, so a strong match claims its fact before
  // a weaker candidate can take it.
  const scored = parsed.facts.map((p) => {
    const ranked = corpus
      .map((e) => ({ e, score: scoreFactMatch(p, e) }))
      .filter((r) => r.score >= FACT_MATCH_THRESHOLD)
      .sort((a, b) => b.score - a.score);
    return { parsed: p, ranked };
  });

  const order = [...scored].sort(
    (a, b) => (b.ranked[0]?.score ?? 0) - (a.ranked[0]?.score ?? 0),
  );

  for (const item of order) {
    const available = item.ranked.filter((r) => !claimed.has(r.e.id));
    const top = available[0] ?? null;
    if (top) claimed.add(top.e.id);

    const matched = top?.e ?? null;

    facts.push({
      parsed: item.parsed,
      suggestedFactId: matched?.id ?? null,
      suggestedFactLabel: matched ? label(matched) : null,
      matchScore: top?.score ?? 0,
      alternatives: available.slice(1, 4).map((r) => ({
        id: r.e.id,
        label: label(r.e),
        score: r.score,
      })),
      conflicts: detectConflicts(item.parsed, matched),
      bullets: planBullets(item.parsed, matched),
      targetBullets:
        matched?.bullets.map((b) => ({ id: b.id, text: b.canonicalText })) ?? [],
    });
  }

  // Restore the resume's own ordering for review.
  const originalOrder = new Map(parsed.facts.map((f, i) => [f, i]));
  facts.sort(
    (a, b) =>
      (originalOrder.get(a.parsed) ?? 0) - (originalOrder.get(b.parsed) ?? 0),
  );

  const known = new Set(existingSkills.map(normalise));
  const newSkills = [...new Set(parsed.skills)].filter(
    (s) => s.trim() && !known.has(normalise(s)),
  );

  const contactConflicts: Conflict[] = [];
  if (
    parsed.contactEmail &&
    normalise(parsed.contactEmail) !== normalise(canonicalEmail)
  ) {
    contactConflicts.push({
      field: "email",
      incoming: parsed.contactEmail,
      canonical: canonicalEmail,
      note: "Contact details are canonical and are not changed by import.",
    });
  }

  const allBullets = facts.flatMap((f) => f.bullets);
  return {
    facts,
    newSkills,
    contactConflicts,
    summary: {
      newFacts: facts.filter((f) => !f.suggestedFactId).length,
      matchedFacts: facts.filter((f) => f.suggestedFactId).length,
      newBullets: allBullets.filter((b) => b.disposition === "new").length,
      newVariants: allBullets.filter((b) => b.disposition === "variant").length,
      duplicateBullets: allBullets.filter((b) => b.disposition === "duplicate")
        .length,
    },
  };
}
