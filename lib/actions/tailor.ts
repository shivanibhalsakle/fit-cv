"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { computeCoverage, extractKeywords, type Coverage } from "@/lib/keywords";
import { generateTailoredResume, type CandidateBullet } from "@/lib/generate";
import type { ActionState } from "@/lib/validation";

async function requireSession() {
  await requireUser();
}

/**
 * Everything the analysis step produces, stored on TailoringSession.gapList.
 * Kept as one blob rather than spread across columns because it is written once
 * and read whole.
 */
export type SessionAnalysis = Coverage & {
  emphasis: string | null;
  seniority: string | null;
  usage: { inputTokens: number; outputTokens: number; costUsd: number };
};

export type QaPair = {
  keyword: string;
  question: string;
  answer: string;
  /** Set once the answer has been promoted into the corpus. */
  createdBulletId?: string;
};

// --- 1. create -------------------------------------------------------------

export async function createTailoringSession(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();

  const personaId = String(formData.get("personaId") ?? "");
  const company = String(formData.get("company") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();
  const jobId = String(formData.get("jobId") ?? "").trim();
  const jdText = String(formData.get("jdText") ?? "").trim();
  const oneOff = String(formData.get("oneOffInstructions") ?? "").trim();

  if (!personaId) return { ok: false, error: "Choose a persona to tailor from." };
  if (!company || !role) return { ok: false, error: "Company and role are required." };
  if (jdText.length < 200) {
    return {
      ok: false,
      error: `Paste the full job description — only ${jdText.length} characters given.`,
    };
  }

  const created = await prisma.tailoringSession.create({
    data: {
      personaIds: [personaId],
      company,
      role,
      jobId: jobId || null,
      jdText,
      // Scoped to this generation only; never written to StandingProfile.
      oneOffInstructions: oneOff || null,
      status: "DRAFT",
    },
  });

  revalidatePath("/tailor");
  redirect(`/tailor/${created.id}`);
}

// --- 2. analyse ------------------------------------------------------------

/**
 * Extracts keywords and computes coverage.
 *
 * One small model call over the job description alone — the corpus is never
 * sent here. Coverage itself is set arithmetic and costs nothing.
 */
export async function analyzeSession(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const session = await prisma.tailoringSession.findUnique({ where: { id } });
  if (!session) return;

  await prisma.tailoringSession.update({
    where: { id },
    data: { status: "ANALYZING" },
  });

  try {
    const [skills, personas] = await Promise.all([
      prisma.skill.findMany({ select: { name: true, aliases: true } }),
      prisma.persona.findMany({
        where: { id: { in: session.personaIds } },
        select: { keywordVocab: true },
      }),
    ]);

    const dictionary = [
      ...skills.flatMap((s) => [s.name, ...s.aliases]),
      ...personas.flatMap((p) => p.keywordVocab),
    ];

    const extraction = await extractKeywords(session.jdText, dictionary);

    // Evidence is bullets AND credentials — a certification has no bullets, so
    // reading only bullet text made the corpus look as though it had never
    // heard of a qualification the user actually holds.
    const allBullets = await prisma.bullet.findMany({
      select: { id: true, canonicalText: true },
    });
    const allFacts = await prisma.fact.findMany({
      select: { id: true, title: true, org: true, tagline: true },
    });
    const personaBullets = await prisma.personaBullet.findMany({
      where: { personaId: { in: session.personaIds } },
      select: { bulletId: true },
    });
    const personaFacts = await prisma.personaFact.findMany({
      where: { personaId: { in: session.personaIds } },
      select: { factId: true },
    });
    const personaBulletIds = new Set(personaBullets.map((b) => b.bulletId));
    const personaFactIds = new Set(personaFacts.map((f) => f.factId));

    const factText = (f: (typeof allFacts)[number]) =>
      [f.title, f.org, f.tagline].filter(Boolean).join(" ");

    const corpusEvidence = [
      ...allBullets.map((b) => b.canonicalText),
      ...allFacts.map(factText),
    ].join(" ");

    const personaEvidence = [
      ...allBullets.filter((b) => personaBulletIds.has(b.id)).map((b) => b.canonicalText),
      ...allFacts.filter((f) => personaFactIds.has(f.id)).map(factText),
    ].join(" ");

    // The skills list is a claim, not evidence, so it is kept separate.
    const skillsListed = skills.map((s) => s.name).join(" ");

    const coverage = computeCoverage(extraction.keywords, {
      corpusEvidence,
      personaEvidence,
      skillsListed,
    });

    const analysis: SessionAnalysis = {
      ...coverage,
      emphasis: extraction.emphasis,
      seniority: extraction.seniority,
      usage: {
        inputTokens: extraction.inputTokens,
        outputTokens: extraction.outputTokens,
        costUsd: extraction.costUsd,
      },
    };

    await prisma.tailoringSession.update({
      where: { id },
      data: {
        extractedKeywords: extraction.keywords.map((k) => k.term),
        gapList: analysis as unknown as Prisma.InputJsonValue,
        status: "AWAITING_ANSWERS",
      },
    });
  } catch (e) {
    await prisma.tailoringSession.update({
      where: { id },
      data: {
        status: "DRAFT",
        gapList: {
          error: e instanceof Error ? e.message : "Analysis failed.",
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  revalidatePath(`/tailor/${id}`);
}

// --- 3. gap answers -> corpus ----------------------------------------------

/**
 * Promotes a gap answer into a real corpus bullet.
 *
 * This is the only way new material enters a generation, and it goes through
 * the corpus rather than around it. Generation downstream is purely selective,
 * so anything not written here cannot appear on the resume.
 */
export async function answerGap(formData: FormData) {
  await requireSession();

  const id = String(formData.get("id") ?? "");
  const keyword = String(formData.get("keyword") ?? "");
  const answer = String(formData.get("answer") ?? "").trim();
  const factId = String(formData.get("factId") ?? "");

  if (!id || !keyword) return;

  const session = await prisma.tailoringSession.findUnique({ where: { id } });
  if (!session) return;

  const pairs = (session.qaPairs as unknown as QaPair[] | null) ?? [];
  const existing = pairs.find((p) => p.keyword === keyword);

  let createdBulletId: string | undefined;

  // An answer with a chosen fact becomes a bullet the user owns from now on —
  // not a one-off string that disappears with this session.
  if (answer && factId) {
    const last = await prisma.bullet.findFirst({
      where: { factId },
      orderBy: { sortHint: "desc" },
      select: { sortHint: true },
    });
    const bullet = await prisma.bullet.create({
      data: {
        factId,
        canonicalText: answer,
        tags: [keyword.toLowerCase()],
        sortHint: (last?.sortHint ?? -1) + 1,
        variants: { create: { text: answer, origin: "MANUAL" } },
      },
    });
    createdBulletId = bullet.id;
  }

  const updated: QaPair = {
    keyword,
    question: existing?.question ?? `How can you evidence “${keyword}”?`,
    answer,
    ...(createdBulletId ? { createdBulletId } : {}),
  };

  await prisma.tailoringSession.update({
    where: { id },
    data: {
      qaPairs: [
        ...pairs.filter((p) => p.keyword !== keyword),
        updated,
      ] as unknown as Prisma.InputJsonValue,
    },
  });

  revalidatePath(`/tailor/${id}`);
  revalidatePath("/corpus");
}

export async function skipGap(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id") ?? "");
  const keyword = String(formData.get("keyword") ?? "");
  if (!id || !keyword) return;

  const session = await prisma.tailoringSession.findUnique({ where: { id } });
  if (!session) return;
  const pairs = (session.qaPairs as unknown as QaPair[] | null) ?? [];

  await prisma.tailoringSession.update({
    where: { id },
    data: {
      qaPairs: [
        ...pairs.filter((p) => p.keyword !== keyword),
        {
          keyword,
          question: `How can you evidence “${keyword}”?`,
          answer: "",
        },
      ] as unknown as Prisma.InputJsonValue,
    },
  });

  revalidatePath(`/tailor/${id}`);
}

// --- 4. generate -----------------------------------------------------------

export async function generateForSession(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const session = await prisma.tailoringSession.findUnique({ where: { id } });
  if (!session) return;

  await prisma.tailoringSession.update({
    where: { id },
    data: { status: "GENERATING" },
  });

  try {
    const personaId = session.personaIds[0];
    const persona = await prisma.persona.findUnique({
      where: { id: personaId },
      include: { bullets: true, facts: true },
    });
    if (!persona) throw new Error("Persona no longer exists.");

    // Candidates: every bullet on a fact this persona includes, whether or not
    // it is currently selected. Facts the persona excludes stay excluded —
    // tailoring reweights a resume, it does not silently add a whole new role.
    const factIds = persona.facts.map((f) => f.factId);
    const facts = await prisma.fact.findMany({
      where: { id: { in: factIds } },
      include: { bullets: { orderBy: { sortHint: "asc" } } },
    });

    const selected = new Set(persona.bullets.map((b) => b.bulletId));
    const candidates: CandidateBullet[] = facts.flatMap((f) =>
      f.bullets.map((b) => ({
        bulletId: b.id,
        text: b.canonicalText,
        factTitle: f.title,
        factOrg: f.org,
        currentlySelected: selected.has(b.id),
      })),
    );

    const standing = await prisma.standingProfile.findUnique({
      where: { id: "singleton" },
    });
    const standingPreferences =
      (standing?.preferenceStatements as unknown as string[] | null) ?? [];

    const analysis = session.gapList as unknown as SessionAnalysis | null;

    const result = await generateTailoredResume({
      personaName: persona.name,
      voiceGuidance: persona.voiceGuidance,
      company: session.company,
      role: session.role,
      jdText: session.jdText,
      jdEmphasis: analysis?.emphasis ?? null,
      keywords: session.extractedKeywords,
      candidates,
      standingPreferences,
      oneOffInstructions: session.oneOffInstructions,
      pageBudget: persona.pageBudget,
      currentBulletCount: persona.bullets.length,
    });

    await prisma.generation.create({
      data: {
        sessionId: id,
        sourcePersonaIds: session.personaIds,
        outputJson: {
          plan: result.plan,
          usage: {
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            costUsd: result.costUsd,
          },
        } as unknown as Prisma.InputJsonValue,
        unsourcedFlags: result.flags as unknown as Prisma.InputJsonValue,
      },
    });

    await prisma.tailoringSession.update({
      where: { id },
      data: { status: "COMPLETE" },
    });
  } catch (e) {
    await prisma.tailoringSession.update({
      where: { id },
      data: {
        status: "AWAITING_ANSWERS",
        gapList: {
          ...((session.gapList as object) ?? {}),
          error: e instanceof Error ? e.message : "Generation failed.",
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  revalidatePath(`/tailor/${id}`);
}

export async function deleteTailoringSession(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.tailoringSession.delete({ where: { id } });
  revalidatePath("/tailor");
  redirect("/tailor");
}
