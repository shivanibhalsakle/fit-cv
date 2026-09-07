import { renderToBuffer } from "@react-pdf/renderer";
import { ResumePdf, BASE_SCALE, type TypeScale } from "@/lib/resume-pdf";
import type { ResumeDoc } from "@/lib/resume-doc";

/**
 * Renders a resume to PDF and measures it.
 *
 * The page count is read back off the rendered file rather than estimated from
 * character counts. With a hard one-page budget, every tailoring decision is a
 * zero-sum swap, so the meter has to reflect what actually came out — an
 * estimate that says "fits" when it does not is worse than no meter at all.
 */

/**
 * Type scales from tightest to loosest, in the order asked for: open the
 * leading first (ceiling 1.5), then step the type up (ceiling 12pt).
 *
 * The ladder is monotonic — each rung consumes at least as much vertical space
 * as the one before — which is what lets the search below be a binary search
 * instead of thirteen renders.
 */
const LADDER: TypeScale[] = [
  { fontSize: 8.7, lineHeight: 1.24 },
  { fontSize: 8.7, lineHeight: 1.32 },
  { fontSize: 8.7, lineHeight: 1.4 },
  { fontSize: 8.7, lineHeight: 1.5 },
  { fontSize: 9.3, lineHeight: 1.4 },
  { fontSize: 9.3, lineHeight: 1.5 },
  { fontSize: 10, lineHeight: 1.4 },
  { fontSize: 10, lineHeight: 1.5 },
  { fontSize: 10.8, lineHeight: 1.4 },
  { fontSize: 10.8, lineHeight: 1.5 },
  { fontSize: 11.4, lineHeight: 1.45 },
  { fontSize: 12, lineHeight: 1.45 },
  { fontSize: 12, lineHeight: 1.5 },
];

export type RenderResult = {
  buffer: Buffer;
  pageCount: number;
  overBudget: boolean;
  scale: TypeScale;
  /** How many renders the fit search cost. Useful when tuning the ladder. */
  attempts: number;
};

async function renderAt(
  doc: ResumeDoc,
  scale: TypeScale,
): Promise<{ buffer: Buffer; pageCount: number }> {
  // Called as a plain function, not via createElement: ResumePdf returns the
  // <Document> element directly, which is what renderToBuffer's type expects.
  const buffer = await renderToBuffer(ResumePdf({ doc, scale }));
  return { buffer, pageCount: await countPages(buffer) };
}

/**
 * Renders at the largest type scale that still fits the page budget.
 *
 * A resume that leaves half the page blank reads as thin, so rather than always
 * rendering at the tightest setting, the ladder is searched for the loosest rung
 * that holds. If even the tightest overflows, that render is returned and
 * flagged over budget — the fix there is cutting content, not shrinking type
 * further.
 */
export async function renderResumePdf(
  doc: ResumeDoc,
  options: { autofit?: boolean } = {},
): Promise<RenderResult> {
  const autofit = options.autofit ?? doc.autofit;

  if (!autofit) {
    // Manual override: render exactly as set, and report honestly if it spills.
    // Silently shrinking a deliberate choice would be worse than an accurate
    // over-budget warning.
    const manual: TypeScale = {
      fontSize: doc.fontSize || BASE_SCALE.fontSize,
      lineHeight: doc.lineHeight || BASE_SCALE.lineHeight,
    };
    const { buffer, pageCount } = await renderAt(doc, manual);
    return {
      buffer,
      pageCount,
      overBudget: pageCount > doc.pageBudget,
      scale: manual,
      attempts: 1,
    };
  }

  const budget = doc.pageBudget;
  let attempts = 1;

  // Tightest first: if this overflows, no looser rung can help.
  const tightest = await renderAt(doc, LADDER[0]);
  if (tightest.pageCount > budget) {
    return {
      buffer: tightest.buffer,
      pageCount: tightest.pageCount,
      overBudget: true,
      scale: LADDER[0],
      attempts,
    };
  }

  // Binary search for the last rung that still fits.
  let lo = 0;
  let hi = LADDER.length - 1;
  let best = { ...tightest, index: 0 };

  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const result = await renderAt(doc, LADDER[mid]);
    attempts += 1;
    if (result.pageCount <= budget) {
      best = { ...result, index: mid };
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }

  return {
    buffer: best.buffer,
    pageCount: best.pageCount,
    overBudget: false,
    scale: LADDER[best.index],
    attempts,
  };
}

async function countPages(buffer: Buffer): Promise<number> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  return pdf.numPages;
}
