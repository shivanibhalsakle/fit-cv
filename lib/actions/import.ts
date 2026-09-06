"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ExtractError, extractText } from "@/lib/extract";
import { MissingApiKeyError } from "@/lib/claude";
import { parseResume } from "@/lib/parse-resume";
import { buildMergePlan, type ExistingFact, type MergePlan } from "@/lib/merge";
import { monthToDate } from "@/lib/dates";
import type { ActionState } from "@/lib/validation";

async function requireSession() {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated");
}

async function loadCorpus(): Promise<ExistingFact[]> {
  const facts = await prisma.fact.findMany({
    include: { bullets: { select: { id: true, canonicalText: true } } },
  });
  return facts.map((f) => ({
    id: f.id,
    kind: f.kind,
    title: f.title,
    org: f.org,
    startDate: f.startDate,
    endDate: f.endDate,
    isCurrent: f.isCurrent,
    bullets: f.bullets,
  }));
}

/** Step 1 — take a file or pasted text and store the raw text. No model call. */
export async function createImport(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();

  const file = formData.get("file");
  const pasted = String(formData.get("pasted") ?? "").trim();

  let text: string;
  let filename: string | null = null;

  try {
    if (file instanceof File && file.size > 0) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await extractText(bytes, file.name);
      text = result.text;
      filename = file.name;
    } else if (pasted) {
      text = pasted;
      filename = null;
    } else {
      return { ok: false, error: "Choose a file or paste some text." };
    }
  } catch (e) {
    if (e instanceof ExtractError) return { ok: false, error: e.message };
    throw e;
  }

  if (text.length < 100) {
    return {
      ok: false,
      error: "That is too short to be a resume — only " + text.length + " characters were read.",
    };
  }

  const created = await prisma.importedResume.create({
    data: { filename, rawText: text, status: "PENDING" },
  });

  revalidatePath("/import");
  redirect(`/import/${created.id}`);
}

/** Step 2 — the one model call. Transcribes to JSON, then plans the merge in code. */
export async function parseImport(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const record = await prisma.importedResume.findUnique({ where: { id } });
  if (!record) return;

  try {
    const { parsed, inputTokens, outputTokens, costUsd } = await parseResume(
      record.rawText,
    );

    const [corpus, skills, contact] = await Promise.all([
      loadCorpus(),
      prisma.skill.findMany({ select: { name: true } }),
      prisma.contact.findUnique({ where: { id: "singleton" } }),
    ]);

    const plan = buildMergePlan(
      parsed,
      corpus,
      skills.map((s) => s.name),
      contact?.email ?? "",
    );

    await prisma.importedResume.update({
      where: { id },
      data: {
        parsedJson: parsed as unknown as Prisma.InputJsonValue,
        conflicts: {
          plan,
          usage: { inputTokens, outputTokens, costUsd },
        } as unknown as Prisma.InputJsonValue,
        status: "REVIEWING",
        notes: null,
      },
    });
  } catch (e) {
    const message =
      e instanceof MissingApiKeyError
        ? e.message
        : e instanceof Error
          ? e.message
          : "Parsing failed.";
    await prisma.importedResume.update({
      where: { id },
      data: { status: "PENDING", notes: message },
    });
  }

  revalidatePath(`/import/${id}`);
}

/**
 * Step 3 — apply the reviewed plan.
 *
 * Decisions come from the form, not from the stored plan, so anything the user
 * overrode in the UI is what gets written. Immutable fields are never updated
 * on an existing fact: an imported title becomes an archived title instead.
 */
export async function applyImport(formData: FormData) {
  await requireSession();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const record = await prisma.importedResume.findUnique({ where: { id } });
  if (!record?.parsedJson) return;

  const stored = record.conflicts as unknown as { plan?: MergePlan } | null;
  const plan = stored?.plan;
  if (!plan) return;

  for (const [i, factPlan] of plan.facts.entries()) {
    const decision = String(formData.get(`fact-${i}-target`) ?? "skip");
    if (decision === "skip") continue;

    const p = factPlan.parsed;

    // Which bullets to bring across, and how — both as set in the review UI.
    // The user's choice wins over the planner's suggested disposition, because
    // lexical similarity misses rewrites that share little vocabulary.
    const chosen = factPlan.bullets
      .map((b, j) => {
        const include = formData.get(`fact-${i}-bullet-${j}`) === "on";
        const mode = formData.get(`fact-${i}-bullet-${j}-mode`);
        if (typeof mode !== "string") return { b, include };
        return {
          include,
          b:
            mode === "new"
              ? { ...b, disposition: "new" as const, matchedBulletId: undefined }
              : { ...b, disposition: "variant" as const, matchedBulletId: mode },
        };
      })
      .filter((x) => x.include)
      .map((x) => x.b);

    if (decision === "new") {
      const last = await prisma.fact.findFirst({
        orderBy: { sortHint: "desc" },
        select: { sortHint: true },
      });
      await prisma.fact.create({
        data: {
          kind: p.kind,
          title: p.title,
          org: p.org,
          location: p.location,
          startDate: monthToDate(p.startDate),
          endDate: p.isCurrent ? null : monthToDate(p.endDate),
          isCurrent: p.isCurrent,
          tagline: p.tagline,
          sortHint: (last?.sortHint ?? 0) + 1,
          bullets: {
            create: chosen.map((b, k) => ({
              canonicalText: b.text,
              metrics: b.metrics,
              sortHint: k,
              variants: {
                create: {
                  text: b.text,
                  origin: "IMPORTED",
                  sourceResumeId: record.id,
                },
              },
            })),
          },
        },
      });
      continue;
    }

    // Merging into an existing fact.
    const targetId = decision;
    const target = await prisma.fact.findUnique({
      where: { id: targetId },
      include: { bullets: { orderBy: { sortHint: "desc" }, take: 1 } },
    });
    if (!target) continue;

    // An imported title that differs is archived, never applied.
    if (
      p.title &&
      p.title !== target.title &&
      !target.archivedTitles.includes(p.title)
    ) {
      await prisma.fact.update({
        where: { id: targetId },
        data: { archivedTitles: { push: p.title } },
      });
    }

    let nextSort = (target.bullets[0]?.sortHint ?? -1) + 1;

    for (const b of chosen) {
      if (b.disposition === "duplicate") continue;

      if (b.disposition === "variant" && b.matchedBulletId) {
        const existing = await prisma.bulletVariant.findFirst({
          where: { bulletId: b.matchedBulletId, text: b.text },
          select: { id: true },
        });
        if (!existing) {
          await prisma.bulletVariant.create({
            data: {
              bulletId: b.matchedBulletId,
              text: b.text,
              origin: "IMPORTED",
              sourceResumeId: record.id,
            },
          });
        }
        continue;
      }

      await prisma.bullet.create({
        data: {
          factId: targetId,
          canonicalText: b.text,
          metrics: b.metrics,
          sortHint: nextSort++,
          variants: {
            create: {
              text: b.text,
              origin: "IMPORTED",
              sourceResumeId: record.id,
            },
          },
        },
      });
    }
  }

  // Skills carry no provenance; they are a flat vocabulary.
  const skillNames = formData.getAll("skill").map(String).filter(Boolean);
  for (const name of skillNames) {
    await prisma.skill.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  await prisma.importedResume.update({
    where: { id },
    data: { status: "MERGED" },
  });

  revalidatePath("/corpus");
  revalidatePath("/import");
  redirect("/corpus");
}

export async function discardImport(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.importedResume.update({
    where: { id },
    data: { status: "DISCARDED" },
  });
  revalidatePath("/import");
  redirect("/import");
}

export async function deleteImport(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.importedResume.delete({ where: { id } });
  revalidatePath("/import");
  redirect("/import");
}
