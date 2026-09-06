import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import type { MergePlan } from "@/lib/merge";
import { MergeReview } from "@/components/merge-review";
import { discardImport, parseImport } from "@/lib/actions/import";
import { buttonClass, secondaryButtonClass } from "@/components/ui";

export const dynamic = "force-dynamic";

type Stored = {
  plan?: MergePlan;
  usage?: { inputTokens: number; outputTokens: number; costUsd: number };
};

export default async function ImportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const record = await prisma.importedResume.findUnique({ where: { id } });
  if (!record) notFound();

  const stored = record.conflicts as unknown as Stored | null;
  const plan = stored?.plan;
  const usage = stored?.usage;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8">
        <Link
          href="/import"
          className="text-xs text-neutral-500 hover:underline dark:text-neutral-400"
        >
          ← Import
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {record.filename ?? "Pasted text"}
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          {record.rawText.length.toLocaleString()} characters extracted
          {usage &&
            ` · parsed for $${usage.costUsd.toFixed(3)} (${usage.inputTokens.toLocaleString()} in / ${usage.outputTokens.toLocaleString()} out)`}
        </p>
      </header>

      {record.notes && (
        <div className="mb-6 rounded-lg border border-red-300 bg-red-50/60 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-400">
          {record.notes}
        </div>
      )}

      {record.status === "MERGED" && (
        <div className="mb-6 rounded-lg border border-green-300 bg-green-50/60 p-3 text-sm dark:border-green-900 dark:bg-green-950/20">
          Merged into the corpus.{" "}
          <Link href="/corpus" className="underline">
            View corpus
          </Link>
        </div>
      )}

      {record.status === "DISCARDED" && (
        <div className="mb-6 rounded-lg border border-neutral-300 bg-neutral-50 p-3 text-sm dark:border-neutral-700 dark:bg-neutral-900">
          Discarded. The extracted text is kept, so it can be parsed again later.
        </div>
      )}

      {!plan && record.status !== "MERGED" && (
        <section className="space-y-4">
          <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
            <h2 className="text-sm font-medium">Parse this resume</h2>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              One Claude call transcribes the text into structured facts and
              bullets — roughly $0.06. Matching and dedup against your corpus
              then run in code, at no cost. Nothing is written to the corpus
              until you review the result.
            </p>
            <form action={parseImport} className="mt-3">
              <input type="hidden" name="id" value={record.id} />
              <button type="submit" className={buttonClass}>
                Parse
              </button>
            </form>
          </div>

          <details className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
            <summary className="cursor-pointer text-sm font-medium">
              Extracted text
            </summary>
            <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap text-xs text-neutral-600 dark:text-neutral-400">
              {record.rawText}
            </pre>
          </details>
        </section>
      )}

      {plan && record.status === "REVIEWING" && (
        <>
          <MergeReview importId={record.id} plan={plan} />
          <div className="mt-6 flex items-center gap-3 border-t border-neutral-200 pt-4 dark:border-neutral-800">
            <form action={parseImport}>
              <input type="hidden" name="id" value={record.id} />
              <button type="submit" className={secondaryButtonClass}>
                Re-parse
              </button>
            </form>
            <form action={discardImport}>
              <input type="hidden" name="id" value={record.id} />
              <button type="submit" className={secondaryButtonClass}>
                Discard
              </button>
            </form>
          </div>
        </>
      )}
    </main>
  );
}
