import { z } from "zod";

export const FACT_KINDS = [
  "EXPERIENCE",
  "PROJECT",
  "EDUCATION",
  "CERTIFICATION",
  "AWARD",
  "PUBLICATION",
  "LEADERSHIP",
] as const;

export const FACT_KIND_LABELS: Record<(typeof FACT_KINDS)[number], string> = {
  EXPERIENCE: "Experience",
  PROJECT: "Project",
  EDUCATION: "Education",
  CERTIFICATION: "Certification",
  AWARD: "Award",
  PUBLICATION: "Publication",
  LEADERSHIP: "Leadership",
};

/** Splits "a, b, c" into ["a","b","c"], dropping blanks. */
const commaList = z
  .string()
  .optional()
  .transform((v) =>
    (v ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

/** Splits on newlines. Used for metrics, which often contain commas. */
const lineList = z
  .string()
  .optional()
  .transform((v) =>
    (v ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
  );

const optionalText = z
  .string()
  .optional()
  .transform((v) => {
    const trimmed = (v ?? "").trim();
    return trimmed.length ? trimmed : null;
  });

const monthString = z
  .string()
  .optional()
  .refine((v) => !v || /^\d{4}-\d{2}$/.test(v), {
    message: "Use a month value like 2026-08",
  });

export const factSchema = z
  .object({
    kind: z.enum(FACT_KINDS),
    title: z.string().trim().min(1, "Title is required").max(200),
    org: optionalText,
    orgDescriptor: optionalText,
    location: optionalText,
    startDate: monthString,
    endDate: monthString,
    isCurrent: z
      .union([z.literal("on"), z.literal("true"), z.literal(""), z.undefined()])
      .transform((v) => v === "on" || v === "true"),
    tagline: optionalText,
    tags: commaList,
    archivedTitles: commaList,
  })
  .refine(
    (v) => !(v.startDate && v.endDate) || v.startDate <= v.endDate,
    { message: "End date is before the start date", path: ["endDate"] },
  )
  .refine((v) => !(v.isCurrent && v.endDate), {
    message: "A current role cannot also have an end date",
    path: ["endDate"],
  });

export const bulletSchema = z.object({
  factId: z.string().min(1),
  canonicalText: z
    .string()
    .trim()
    .min(1, "Bullet text is required")
    .max(1000, "Bullets this long will never fit on one page"),
  metrics: lineList,
  tags: commaList,
});

export type FactInput = z.infer<typeof factSchema>;
export type BulletInput = z.infer<typeof bulletSchema>;

/** Shape returned by every corpus server action. */
export type ActionState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

/** Flattens a ZodError into the ActionState shape the forms render. */
export function toActionState(error: z.ZodError): ActionState {
  const flat = z.flattenError(error);
  return {
    ok: false,
    error: "Please fix the highlighted fields.",
    fieldErrors: flat.fieldErrors as Record<string, string[]>,
  };
}
