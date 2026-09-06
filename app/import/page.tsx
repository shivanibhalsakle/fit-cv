import Link from "next/link";
import { prisma } from "@/lib/db";
import { ImportForm } from "@/components/import-form";
import { Tag } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Not parsed yet",
  REVIEWING: "Ready to review",
  MERGED: "Merged",
  DISCARDED: "Discarded",
};

export default async function ImportPage() {
  const imports = await prisma.importedResume.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8">
        <Link
          href="/"
          className="text-xs text-neutral-500 hover:underline dark:text-neutral-400"
        >
          ← Home
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Import</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Add resumes to enrich the corpus. Nothing is written until you review
          and apply — old files are safe to import, since values that disagree
          with the canonical record are flagged as stale rather than applied.
        </p>
      </header>

      <section className="mb-10">
        <ImportForm />
      </section>

      {imports.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Queue
          </h2>
          <ul className="space-y-1.5">
            {imports.map((imp) => (
              <li key={imp.id}>
                <Link
                  href={`/import/${imp.id}`}
                  className="block rounded-lg border border-neutral-200 p-3 transition-colors hover:border-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium">
                      {imp.filename ?? "Pasted text"}
                    </span>
                    <span className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400">
                      {imp.createdAt.toLocaleDateString()}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <Tag>{STATUS_LABEL[imp.status]}</Tag>
                    <Tag>{imp.rawText.length.toLocaleString()} chars</Tag>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
