import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/db";

const PHASES = [
  { n: 1, name: "Source of truth", detail: "Corpus CRUD — facts, bullets, tags" }, // done
  { n: 2, name: "Resume import", detail: "Upload / paste / manual → merge queue" }, // done
  { n: 3, name: "Personas & rendering", detail: "Four personas, one-page PDF" }, // done
  { n: 4, name: "Tailoring engine", detail: "JD → keywords → gaps → Q&A → generate" },
  { n: 5, name: "Diff view", detail: "Bullet-level red/yellow + variant write-back" },
  { n: 6, name: "Editing surfaces", detail: "Direct, targeted, conversational" },
  { n: 7, name: "Archive & variant library", detail: "JD + resume + Q&A, traceable" },
  { n: 8, name: "GitHub sync", detail: "Repo-level, review queue" },
];

export default async function Home() {
  const session = await auth();

  const [facts, bullets, personas] = await Promise.all([
    prisma.fact.count(),
    prisma.bullet.count(),
    prisma.persona.count(),
  ]);

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <header className="mb-12 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Resume Optimizer
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Signed in as {session?.user?.name ?? session?.user?.email ?? "—"}
          </p>
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/signin" });
          }}
        >
          <button
            type="submit"
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-900"
          >
            Sign out
          </button>
        </form>
      </header>

      <nav className="mb-8 flex gap-2">
        <Link
          href="/corpus"
          className="inline-flex items-center rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
        >
          Open corpus →
        </Link>
        <Link
          href="/import"
          className="inline-flex items-center rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
        >
          Import resumes →
        </Link>
        <Link
          href="/personas"
          className="inline-flex items-center rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
        >
          Personas →
        </Link>
      </nav>

      <section className="mb-12 grid grid-cols-3 gap-3">
        {[
          { label: "Facts", value: facts },
          { label: "Bullets", value: bullets },
          { label: "Personas", value: personas },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
          >
            <div className="text-2xl font-semibold tabular-nums">{s.value}</div>
            <div className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
              {s.label}
            </div>
          </div>
        ))}
      </section>

      <section>
        <h2 className="mb-1 text-sm font-medium">Build progress</h2>
        <p className="mb-4 text-xs text-neutral-500 dark:text-neutral-400">
          Phases 0–3 complete — corpus, import, personas, one-page PDF.
        </p>
        <ol className="space-y-1.5">
          {PHASES.map((p) => (
            <li
              key={p.n}
              className="flex items-baseline gap-3 rounded-md px-3 py-2 text-sm odd:bg-neutral-50 dark:odd:bg-neutral-900/50"
            >
              <span className="w-4 shrink-0 text-xs tabular-nums text-neutral-400">
                {p.n}
              </span>
              <span className="font-medium">{p.name}</span>
              <span className="ml-auto text-right text-xs text-neutral-500 dark:text-neutral-400">
                {p.detail}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
