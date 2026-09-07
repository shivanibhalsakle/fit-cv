import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatRange } from "@/lib/dates";
import { buildResumeDoc, SECTION_KEYS, SECTION_LABELS } from "@/lib/resume-doc";
import { renderResumePdf } from "@/lib/render-pdf";
import { setSkillGroups, updatePersonaSettings } from "@/lib/actions/personas";
import { PersonaActions } from "@/components/persona-forms";
import { PersonaEditor, type EditorFact } from "@/components/persona-editor";
import { EmphasisReview, type EmphasisRow } from "@/components/emphasis-review";
import { inputClass, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const KIND_TO_SECTION: Record<string, string> = {
  EDUCATION: "education",
  EXPERIENCE: "experience",
  PROJECT: "projects",
  LEADERSHIP: "leadership",
  CERTIFICATION: "certifications",
  AWARD: "awards",
  PUBLICATION: "publications",
};

export default async function PersonaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();

  const { id } = await params;

  const persona = await prisma.persona.findUnique({
    where: { id },
    include: {
      facts: true,
      bullets: true,
      skillGroups: {
        orderBy: { sortHint: "asc" },
        include: {
          items: { orderBy: { sortHint: "asc" }, include: { skill: true } },
        },
      },
    },
  });
  if (!persona) notFound();

  const allFacts = await prisma.fact.findMany({
    orderBy: [{ startDate: "desc" }, { sortHint: "asc" }],
    include: { bullets: { orderBy: { sortHint: "asc" } } },
  });

  const selectedFacts = new Set(persona.facts.map((f) => f.factId));
  const selectedBullets = new Set(persona.bullets.map((b) => b.bulletId));

  const editorFacts: EditorFact[] = allFacts.map((f) => ({
    id: f.id,
    kind: f.kind,
    section: KIND_TO_SECTION[f.kind] ?? "other",
    title: f.title,
    org: f.org,
    dateRange: formatRange(f.startDate, f.endDate, f.isCurrent),
    selected: selectedFacts.has(f.id),
    bullets: f.bullets.map((b) => ({
      id: b.id,
      text: b.canonicalText,
      selected: selectedBullets.has(b.id),
    })),
  }));

  const factsBySection = SECTION_KEYS.filter((k) => k !== "skills")
    .map((key) => ({
      section: key,
      label: SECTION_LABELS[key],
      facts: editorFacts.filter((f) => f.section === key),
    }))
    .filter((g) => g.facts.length > 0);

  // Render now so the fit meter reflects the real document, not an estimate.
  const doc = await buildResumeDoc(id);
  let pageCount = 0;
  let overBudget = false;
  let scale: { fontSize: number; lineHeight: number } | null = null;
  let renderError: string | null = null;
  if (doc) {
    try {
      const result = await renderResumePdf(doc);
      pageCount = result.pageCount;
      overBudget = result.overBudget;
      scale = result.scale;
    } catch (e) {
      renderError = e instanceof Error ? e.message : "Render failed.";
    }
  }

  // Emphasis rows, keyed by PersonaBullet so approval maps back cleanly.
  const bulletTextById = new Map(
    allFacts.flatMap((f) => f.bullets.map((b) => [b.id, b.canonicalText] as const)),
  );
  const emphasisRows: EmphasisRow[] = persona.bullets
    .map((pb) => ({
      personaBulletId: pb.id,
      text: bulletTextById.get(pb.bulletId) ?? "",
      approved: pb.boldPhrases,
      suggested: pb.suggestedBold,
    }))
    .filter((r) => r.text);

  const groupsText = persona.skillGroups
    .map((g) => `${g.label}: ${g.items.map((i) => i.skill.name).join(", ")}`)
    .join("\n");

  const isEmpty = persona.facts.length === 0;

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <Link
            href="/personas"
            className="text-xs text-neutral-500 hover:underline dark:text-neutral-400"
          >
            ← Personas
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {persona.name}
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            {persona.facts.length} entries · {persona.bullets.length} bullets ·
            budget {persona.pageBudget} page
            {persona.pageBudget === 1 ? "" : "s"}
          </p>
        </div>
        <PersonaActions
          id={persona.id}
          name={persona.name}
          factCount={persona.facts.length}
        />
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_420px]">
        {/* Left: what goes in */}
        <div className="space-y-8 lg:order-1">
          <section>
            <h2 className="mb-3 text-sm font-medium">Content</h2>
            <PersonaEditor personaId={persona.id} factsBySection={factsBySection} />
          </section>

          <section>
            <h2 className="mb-1 text-sm font-medium">Skill groups</h2>
            <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
              One group per line, as <code>Label: skill, skill</code>. The
              taxonomy is persona-scoped — a technical persona groups by language
              and framework, a business one by capability.
            </p>
            <form action={setSkillGroups} className="space-y-2">
              <input type="hidden" name="id" value={persona.id} />
              <textarea
                name="groups"
                defaultValue={groupsText}
                rows={6}
                placeholder={"Languages: Python, SQL, TypeScript\nTools & Platforms: AWS, Docker"}
                className={`${inputClass} font-mono text-xs`}
              />
              <button type="submit" className={secondaryButtonClass}>
                Save skill groups
              </button>
            </form>
          </section>

          <section>
            <h2 className="mb-1 text-sm font-medium">Emphasis</h2>
            <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
              Suggested phrases to set bold, for a recruiter skimming. Nothing
              renders until you approve it, and suggestions are checked to appear
              verbatim in the bullet — emphasis never rewrites text.
            </p>
            <EmphasisReview personaId={persona.id} rows={emphasisRows} />
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium">Settings</h2>
            <form action={updatePersonaSettings} className="space-y-3">
              <input type="hidden" name="id" value={persona.id} />

              <div className="space-y-1.5">
                <span className="block text-xs font-medium">
                  Sections, in order
                </span>
                <div className="flex flex-wrap gap-2">
                  {SECTION_KEYS.map((key) => (
                    <label
                      key={key}
                      className="inline-flex items-center gap-1.5 rounded border border-neutral-200 px-2 py-1 text-xs dark:border-neutral-800"
                    >
                      <input
                        type="checkbox"
                        name="section"
                        value={key}
                        defaultChecked={persona.sectionOrder.includes(key)}
                        className="h-3.5 w-3.5 rounded border-neutral-300 dark:border-neutral-700"
                      />
                      {SECTION_LABELS[key]}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Order follows the sequence above; unticked sections are omitted.
                </p>
              </div>

              <label className="block space-y-1.5">
                <span className="block text-xs font-medium">Voice guidance</span>
                <textarea
                  name="voiceGuidance"
                  defaultValue={persona.voiceGuidance ?? ""}
                  rows={3}
                  placeholder="Lead with business outcome; name the artifact (BRD, user story); quantify in %."
                  className={inputClass}
                />
                <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                  Used from Phase 4 onward, when generation starts.
                </span>
              </label>

              <label className="block space-y-1.5">
                <span className="block text-xs font-medium">Page budget</span>
                <input
                  type="number"
                  name="pageBudget"
                  min={1}
                  max={3}
                  defaultValue={persona.pageBudget}
                  className={`${inputClass} w-24`}
                />
              </label>

              <div className="space-y-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
                <label className="flex items-center gap-2 text-xs font-medium">
                  <input
                    type="checkbox"
                    name="autofit"
                    defaultChecked={persona.autofit}
                    className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-700"
                  />
                  Auto-fit type to the page
                </label>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  On: the renderer picks the largest size and leading that still
                  holds the budget, so a short resume fills the page instead of
                  leaving it half blank. Off: the values below are used exactly
                  as set, even if the result spills.
                </p>
                <div className="flex gap-3">
                  <label className="space-y-1">
                    <span className="block text-xs">Font size (max 12)</span>
                    <input
                      type="number"
                      name="fontSize"
                      min={6}
                      max={12}
                      step={0.1}
                      defaultValue={persona.fontSize}
                      className={`${inputClass} w-24`}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="block text-xs">Line spacing (max 1.5)</span>
                    <input
                      type="number"
                      name="lineHeight"
                      min={1}
                      max={1.5}
                      step={0.01}
                      defaultValue={persona.lineHeight}
                      className={`${inputClass} w-24`}
                    />
                  </label>
                </div>
              </div>

              <button type="submit" className={secondaryButtonClass}>
                Save settings
              </button>
            </form>
          </section>
        </div>

        {/* Right: what comes out */}
        <aside className="space-y-3 lg:order-2">
          <div className="sticky top-6 space-y-3">
            <div
              className={`rounded-lg border p-3 ${
                overBudget
                  ? "border-red-300 bg-red-50/60 dark:border-red-900 dark:bg-red-950/20"
                  : "border-green-300 bg-green-50/60 dark:border-green-900 dark:bg-green-950/20"
              }`}
            >
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium">
                  {renderError
                    ? "Render failed"
                    : isEmpty
                      ? "Nothing selected"
                      : `${pageCount} page${pageCount === 1 ? "" : "s"}`}
                </span>
                <span className="text-xs text-neutral-600 dark:text-neutral-400">
                  budget {persona.pageBudget}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-400">
                {renderError
                  ? renderError
                  : overBudget
                    ? "Over budget — remove bullets or a section to fit."
                    : scale
                      ? `${persona.autofit ? "Auto-fit" : "Manual"}: ${scale.fontSize}pt / ${scale.lineHeight} leading. Measured from the rendered file.`
                      : "Fits."}
              </p>
            </div>

            <div className="flex gap-2">
              <a
                href={`/api/personas/${persona.id}/pdf?download=1`}
                className={secondaryButtonClass}
              >
                Download PDF
              </a>
              <a
                href={`/api/personas/${persona.id}/tex`}
                className={secondaryButtonClass}
              >
                Download .tex
              </a>
            </div>

            {!isEmpty && !renderError && (
              <iframe
                key={`${persona.facts.length}-${persona.bullets.length}-${persona.sectionOrder.join()}`}
                src={`/api/personas/${persona.id}/pdf`}
                title={`${persona.name} preview`}
                className="h-[560px] w-full rounded-lg border border-neutral-200 bg-white dark:border-neutral-800"
              />
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
