import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { dateToMonth, formatRange } from "@/lib/dates";
import { FactForm } from "@/components/fact-form";
import { BulletEditor } from "@/components/bullet-editor";
import { DeleteFact } from "@/components/delete-fact";

export const dynamic = "force-dynamic";

export default async function FactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const fact = await prisma.fact.findUnique({
    where: { id },
    include: {
      bullets: {
        orderBy: { sortHint: "asc" },
        include: { _count: { select: { variants: true } } },
      },
    },
  });

  if (!fact) notFound();

  const bullets = fact.bullets.map((b) => ({
    id: b.id,
    canonicalText: b.canonicalText,
    metrics: b.metrics,
    tags: b.tags,
    variantCount: b._count.variants,
  }));

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <header className="mb-8">
        <Link
          href="/corpus"
          className="text-xs text-neutral-500 hover:underline dark:text-neutral-400"
        >
          ← Corpus
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {fact.title}
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          {[
            fact.org,
            fact.location,
            formatRange(fact.startDate, fact.endDate, fact.isCurrent),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </header>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-medium">
          Bullets
          <span className="ml-2 font-normal text-neutral-500 dark:text-neutral-400">
            ordered as they render
          </span>
        </h2>
        <BulletEditor factId={fact.id} bullets={bullets} />
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-medium">Details</h2>
        <FactForm
          mode="edit"
          initial={{
            id: fact.id,
            kind: fact.kind,
            title: fact.title,
            org: fact.org ?? "",
            orgDescriptor: fact.orgDescriptor ?? "",
            location: fact.location ?? "",
            startDate: dateToMonth(fact.startDate),
            endDate: dateToMonth(fact.endDate),
            isCurrent: fact.isCurrent,
            tagline: fact.tagline ?? "",
            tags: fact.tags.join(", "),
            archivedTitles: fact.archivedTitles.join(", "),
          }}
        />
      </section>

      {fact.archivedTitles.length > 0 && (
        <section className="mb-10 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
          <h2 className="text-xs font-medium">Archived titles</h2>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Used on older resumes still in circulation. Reference only — never
            emitted into a generated resume.
          </p>
          <ul className="mt-2 space-y-0.5">
            {fact.archivedTitles.map((t) => (
              <li
                key={t}
                className="text-xs text-neutral-600 line-through dark:text-neutral-400"
              >
                {t}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="border-t border-neutral-200 pt-6 dark:border-neutral-800">
        <DeleteFact
          id={fact.id}
          title={fact.title}
          bulletCount={fact.bullets.length}
        />
      </section>
    </main>
  );
}
