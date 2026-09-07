import Link from "next/link";
import { prisma } from "@/lib/db";
import { NewPersonaForm } from "@/components/persona-forms";
import { Tag } from "@/components/ui";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PersonasPage() {
  await requireUser();

  const personas = await prisma.persona.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { facts: true, bullets: true, skillGroups: true } },
    },
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
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Personas</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Each persona is a view over the corpus — which bullets appear, in what
          order, under which sections. Titles, employers and dates are never
          varied; they come from the corpus unchanged.
        </p>
      </header>

      {personas.length === 0 ? (
        <div className="mb-8 rounded-lg border border-dashed border-neutral-300 p-8 text-center dark:border-neutral-700">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            No personas yet. Run{" "}
            <code className="rounded bg-neutral-100 px-1 py-0.5 text-xs dark:bg-neutral-800">
              npm run db:seed
            </code>{" "}
            to create the four starting personas, or add one below.
          </p>
        </div>
      ) : (
        <ul className="mb-10 space-y-1.5">
          {personas.map((p) => (
            <li key={p.id}>
              <Link
                href={`/personas/${p.id}`}
                className="block rounded-lg border border-neutral-200 p-3 transition-colors hover:border-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium">{p.name}</span>
                  <span className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400">
                    {p.pageBudget} page{p.pageBudget === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Tag>{p._count.facts} entries</Tag>
                  <Tag>{p._count.bullets} bullets</Tag>
                  <Tag>{p._count.skillGroups} skill groups</Tag>
                  {p.sectionOrder.length > 0 && (
                    <Tag>{p.sectionOrder.join(" → ")}</Tag>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section className="border-t border-neutral-200 pt-6 dark:border-neutral-800">
        <h2 className="mb-3 text-sm font-medium">New persona</h2>
        <NewPersonaForm />
      </section>
    </main>
  );
}
