import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { NewSessionForm } from "@/components/tailor-forms";
import { Tag } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Not analysed yet",
  ANALYZING: "Analysing…",
  AWAITING_ANSWERS: "Gaps to review",
  GENERATING: "Generating…",
  COMPLETE: "Generated",
  ABANDONED: "Abandoned",
};

export default async function TailorPage() {
  await requireUser();

  const [sessions, personas] = await Promise.all([
    prisma.tailoringSession.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { generations: true } } },
    }),
    prisma.persona.findMany({
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { bullets: true } } },
    }),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8">
        <Link href="/" className="text-xs text-neutral-500 hover:underline dark:text-neutral-400">
          ← Home
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Tailor</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Paste a posting, review what your corpus does and does not evidence,
          then generate. Nothing is invented — generation selects and reframes
          bullets you already own.
        </p>
      </header>

      {personas.length === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Create a persona first.
        </p>
      ) : (
        <section className="mb-10">
          <h2 className="mb-3 text-sm font-medium">New session</h2>
          <NewSessionForm
            personas={personas.map((p) => ({
              id: p.id,
              name: p.name,
              bulletCount: p._count.bullets,
            }))}
          />
        </section>
      )}

      {sessions.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Sessions
          </h2>
          <ul className="space-y-1.5">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/tailor/${s.id}`}
                  className="block rounded-lg border border-neutral-200 p-3 transition-colors hover:border-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium">
                      {s.role} — {s.company}
                    </span>
                    <span className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400">
                      {s.createdAt.toLocaleDateString()}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Tag>{STATUS_LABEL[s.status]}</Tag>
                    {s.extractedKeywords.length > 0 && (
                      <Tag>{s.extractedKeywords.length} keywords</Tag>
                    )}
                    {s._count.generations > 0 && (
                      <Tag>
                        {s._count.generations} generation
                        {s._count.generations === 1 ? "" : "s"}
                      </Tag>
                    )}
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
