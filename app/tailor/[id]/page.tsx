import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { formatRange } from "@/lib/dates";
import {
  analyzeSession,
  deleteTailoringSession,
  generateForSession,
  type QaPair,
  type SessionAnalysis,
} from "@/lib/actions/tailor";
import type { FabricationFlag, GenerationPlan } from "@/lib/generate";
import { GapAnswer } from "@/components/tailor-forms";
import { Tag, buttonClass, dangerButtonClass } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function TailorSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;

  const session = await prisma.tailoringSession.findUnique({
    where: { id },
    include: { generations: { orderBy: { createdAt: "desc" } } },
  });
  if (!session) notFound();

  const analysis = session.gapList as unknown as
    | (Partial<SessionAnalysis> & { error?: string })
    | null;
  const qaPairs = (session.qaPairs as unknown as QaPair[] | null) ?? [];
  const answeredKeywords = new Set(qaPairs.map((p) => p.keyword));

  const persona = await prisma.persona.findUnique({
    where: { id: session.personaIds[0] },
    include: { facts: true },
  });

  // Only roles and projects this persona actually shows can receive a new
  // bullet — attaching evidence to a fact the resume omits would be pointless.
  const facts = persona
    ? await prisma.fact.findMany({
        where: { id: { in: persona.facts.map((f) => f.factId) } },
        orderBy: [{ startDate: "desc" }],
      })
    : [];

  const latest = session.generations[0];
  const plan = latest
    ? ((latest.outputJson as unknown as { plan: GenerationPlan }).plan ?? null)
    : null;
  const genUsage = latest
    ? (latest.outputJson as unknown as { usage?: { costUsd: number } }).usage
    : undefined;
  const flags = (latest?.unsourcedFlags as unknown as FabricationFlag[] | null) ?? [];

  const bulletTextById = new Map<string, string>();
  if (plan) {
    const ids = [
      ...plan.included.map((i) => i.bulletId),
      ...plan.excluded.map((i) => i.bulletId),
    ];
    const bullets = await prisma.bullet.findMany({
      where: { id: { in: ids } },
      select: { id: true, canonicalText: true },
    });
    for (const b of bullets) bulletTextById.set(b.id, b.canonicalText);
  }

  // Listed-only terms are asked about too: the user claims the skill, so there
  // may well be work behind it that the corpus has simply never recorded.
  const gaps = [
    ...(analysis?.gaps ?? []),
    ...(analysis?.listedOnly ?? []).map((keyword) => ({
      keyword,
      source: "dictionary" as const,
    })),
  ];
  const unanswered = gaps.filter((g) => !answeredKeywords.has(g.keyword));

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8">
        <Link href="/tailor" className="text-xs text-neutral-500 hover:underline dark:text-neutral-400">
          ← Tailor
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {session.role} — {session.company}
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          {persona?.name ?? "persona missing"}
          {session.jobId ? ` · job ${session.jobId}` : ""} ·{" "}
          {session.jdText.length.toLocaleString()} chars of JD
          {analysis?.usage && ` · analysed for $${analysis.usage.costUsd.toFixed(3)}`}
          {genUsage && ` · generated for $${genUsage.costUsd.toFixed(3)}`}
        </p>
      </header>

      {analysis?.error && (
        <div className="mb-6 rounded-lg border border-red-300 bg-red-50/60 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-400">
          {analysis.error}
        </div>
      )}

      {/* Step 1 — analyse */}
      {session.status === "DRAFT" && (
        <section className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="text-sm font-medium">Analyse the posting</h2>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            One small call over the job description alone — about $0.02. Your
            corpus is not sent. Matching what you already evidence is set
            arithmetic and costs nothing.
          </p>
          <form action={analyzeSession} className="mt-3">
            <input type="hidden" name="id" value={session.id} />
            <button type="submit" className={buttonClass}>Analyse</button>
          </form>
        </section>
      )}

      {/* Step 2 — coverage */}
      {analysis?.covered && (
        <section className="mb-8">
          <h2 className="mb-1 text-sm font-medium">Coverage</h2>
          {analysis.emphasis && (
            <p className="mb-3 text-xs italic text-neutral-600 dark:text-neutral-400">
              {analysis.emphasis}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Evidenced here", analysis.covered?.length ?? 0, "green"],
              ["Have, not shown", analysis.availableUnused?.length ?? 0, "amber"],
              ["Listed only", analysis.listedOnly?.length ?? 0, "amber"],
              ["No evidence", gaps.length, "red"],
            ].map(([label, value, tone]) => (
              <div
                key={String(label)}
                className={`rounded-lg border p-3 ${
                  tone === "green"
                    ? "border-green-300 bg-green-50/60 dark:border-green-900 dark:bg-green-950/20"
                    : tone === "amber"
                      ? "border-amber-300 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20"
                      : "border-red-300 bg-red-50/60 dark:border-red-900 dark:bg-red-950/20"
                }`}
              >
                <div className="text-xl font-semibold tabular-nums">{value}</div>
                <div className="text-xs text-neutral-600 dark:text-neutral-400">{label}</div>
              </div>
            ))}
          </div>

          {(analysis.availableUnused?.length ?? 0) > 0 && (
            <div className="mt-3 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
              <p className="text-xs text-neutral-600 dark:text-neutral-400">
                In your corpus but not on this resume — generation can pull these
                in without asking you anything:
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {analysis.availableUnused?.map((k) => <Tag key={k}>{k}</Tag>)}
              </div>
            </div>
          )}

          {(analysis.listedOnly?.length ?? 0) > 0 && (
            <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50/60 p-3 dark:border-amber-900 dark:bg-amber-950/20">
              <p className="text-xs text-neutral-700 dark:text-neutral-300">
                In your skills list, but no bullet or credential demonstrates
                them. Generation will not write a bullet for these — a listed
                skill is a claim, not evidence. Answer them below if you have
                the work to back them up.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {analysis.listedOnly?.map((k) => <Tag key={k}>{k}</Tag>)}
              </div>
            </div>
          )}

          {(analysis.covered?.length ?? 0) > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {analysis.covered?.map((k) => <Tag key={k}>{k}</Tag>)}
            </div>
          )}
        </section>
      )}

      {/* Step 3 — gap questions */}
      {gaps.length > 0 && session.status !== "COMPLETE" && (
        <section className="mb-8">
          <h2 className="mb-1 text-sm font-medium">
            Gaps
            <span className="ml-2 font-normal text-neutral-500 dark:text-neutral-400">
              {unanswered.length} left
            </span>
          </h2>
          <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
            Answers become permanent corpus bullets. Generation can only choose
            from bullets you own, so anything you skip here simply will not
            appear.
          </p>
          <div className="space-y-2">
            {gaps.map((g) => {
              const pair = qaPairs.find((p) => p.keyword === g.keyword);
              return (
                <GapAnswer
                  key={g.keyword}
                  sessionId={session.id}
                  keyword={g.keyword}
                  existingAnswer={pair?.answer ?? ""}
                  answered={Boolean(pair)}
                  facts={facts.map((f) => ({
                    id: f.id,
                    label: `${f.title}${f.org ? " — " + f.org : ""} (${formatRange(f.startDate, f.endDate, f.isCurrent)})`,
                  }))}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* Step 4 — generate */}
      {(session.status === "AWAITING_ANSWERS" || session.status === "COMPLETE") && (
        <section className="mb-8 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="text-sm font-medium">
            {latest ? "Regenerate" : "Generate"}
          </h2>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Roughly $0.07. Selects and reframes bullets you own; it has no way to
            invent one. {unanswered.length > 0 && `${unanswered.length} gap${unanswered.length === 1 ? "" : "s"} still unanswered — those requirements will be absent.`}
          </p>
          <form action={generateForSession} className="mt-3">
            <input type="hidden" name="id" value={session.id} />
            <button type="submit" className={buttonClass}>
              {latest ? "Regenerate" : "Generate"}
            </button>
          </form>
        </section>
      )}

      {/* Result */}
      {plan && (
        <section className="mb-8">
          <h2 className="mb-1 text-sm font-medium">Result</h2>
          <p className="mb-3 text-xs text-neutral-600 dark:text-neutral-400">
            {plan.summary}
          </p>

          {flags.length > 0 && (
            <div className="mb-3 rounded-lg border border-red-300 bg-red-50/60 p-3 dark:border-red-900 dark:bg-red-950/20">
              <p className="text-xs font-medium text-red-700 dark:text-red-400">
                {flags.length} guard{flags.length === 1 ? "" : "s"} triggered
              </p>
              <ul className="mt-1 space-y-0.5">
                {flags.map((f, i) => (
                  <li key={i} className="text-xs text-red-700 dark:text-red-400">
                    {f.detail}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Included ({plan.included.length})
          </h3>
          <ul className="mb-4 space-y-1.5">
            {plan.included.map((item) => {
              const original = bulletTextById.get(item.bulletId) ?? "";
              const changed = Boolean(item.rewrittenText);
              return (
                <li
                  key={item.bulletId}
                  className={`rounded-lg border p-3 ${
                    changed
                      ? "border-amber-300 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20"
                      : "border-neutral-200 dark:border-neutral-800"
                  }`}
                >
                  <p className="text-xs leading-relaxed">
                    {item.rewrittenText ?? original}
                  </p>
                  {changed && (
                    <p className="mt-1.5 border-l-2 border-neutral-300 pl-2 text-[11px] text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
                      was: {original}
                    </p>
                  )}
                  <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                    {changed ? "reworded — " : ""}{item.rationale}
                  </p>
                </li>
              );
            })}
          </ul>

          {plan.excluded.length > 0 && (
            <>
              <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                Cut ({plan.excluded.length})
              </h3>
              <ul className="space-y-1.5">
                {plan.excluded.map((item) => (
                  <li
                    key={item.bulletId}
                    className="rounded-lg border border-neutral-200 p-3 opacity-60 dark:border-neutral-800"
                  >
                    <p className="text-xs leading-relaxed line-through">
                      {bulletTextById.get(item.bulletId) ?? item.bulletId}
                    </p>
                    <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                      {item.rationale}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}

          <p className="mt-4 text-xs text-neutral-500 dark:text-neutral-400">
            Accept / discard and the red-yellow diff arrive in Phase 5.
          </p>
        </section>
      )}

      <section className="border-t border-neutral-200 pt-6 dark:border-neutral-800">
        <form action={deleteTailoringSession} className="flex items-center justify-between gap-4">
          <input type="hidden" name="id" value={session.id} />
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Deleting removes this session and its generations. Corpus bullets
            created from gap answers stay.
          </p>
          <button type="submit" className={dangerButtonClass}>Delete session</button>
        </form>
      </section>
    </main>
  );
}
