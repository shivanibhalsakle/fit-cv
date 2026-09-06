import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatRange } from "@/lib/dates";
import { FACT_KINDS, FACT_KIND_LABELS } from "@/lib/validation";
import { Tag, buttonClass } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CorpusPage() {
  const facts = await prisma.fact.findMany({
    orderBy: [{ kind: "asc" }, { startDate: "desc" }, { sortHint: "asc" }],
    include: { _count: { select: { bullets: true } } },
  });

  const totalBullets = facts.reduce((n, f) => n + f._count.bullets, 0);
  const byKind = FACT_KINDS.map((kind) => ({
    kind,
    facts: facts.filter((f) => f.kind === kind),
  })).filter((g) => g.facts.length > 0);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <Link
            href="/"
            className="text-xs text-neutral-500 hover:underline dark:text-neutral-400"
          >
            ← Home
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Corpus</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            {facts.length} fact{facts.length === 1 ? "" : "s"} · {totalBullets}{" "}
            bullet{totalBullets === 1 ? "" : "s"} — everything you have done, not
            just what fits on a page.
          </p>
        </div>
        <Link href="/corpus/new" className={buttonClass}>
          New fact
        </Link>
      </header>

      {facts.length === 0 && (
        <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center dark:border-neutral-700">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            The corpus is empty. Add a fact, or run{" "}
            <code className="rounded bg-neutral-100 px-1 py-0.5 text-xs dark:bg-neutral-800">
              npm run db:seed
            </code>{" "}
            to load your current resume.
          </p>
        </div>
      )}

      <div className="space-y-8">
        {byKind.map((group) => (
          <section key={group.kind}>
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              {FACT_KIND_LABELS[group.kind]}
            </h2>
            <ul className="space-y-1.5">
              {group.facts.map((fact) => (
                <li key={fact.id}>
                  <Link
                    href={`/corpus/${fact.id}`}
                    className="block rounded-lg border border-neutral-200 p-3 transition-colors hover:border-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-medium">{fact.title}</span>
                      <span className="shrink-0 text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                        {formatRange(
                          fact.startDate,
                          fact.endDate,
                          fact.isCurrent,
                        )}
                      </span>
                    </div>
                    {(fact.org || fact.location) && (
                      <div className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                        {[fact.org, fact.location].filter(Boolean).join(" · ")}
                      </div>
                    )}
                    {fact.tagline && (
                      <p className="mt-1 text-xs italic text-neutral-500 dark:text-neutral-400">
                        {fact.tagline}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Tag>
                        {fact._count.bullets} bullet
                        {fact._count.bullets === 1 ? "" : "s"}
                      </Tag>
                      {fact.tags.map((t) => (
                        <Tag key={t}>#{t}</Tag>
                      ))}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
