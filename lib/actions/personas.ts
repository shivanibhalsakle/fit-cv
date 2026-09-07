"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import type { ActionState } from "@/lib/validation";

async function requireSession() {
  // Redirects rather than throwing: a server action is an independently
  // addressable POST endpoint, and an expired session should end at sign-in,
  // not at a runtime error page.
  await requireUser();
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export async function createPersona(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Give the persona a name." };

  const slug = slugify(name);
  const clash = await prisma.persona.findFirst({
    where: { OR: [{ name }, { slug }] },
    select: { id: true },
  });
  if (clash) return { ok: false, error: "A persona with that name exists." };

  const persona = await prisma.persona.create({
    data: {
      name,
      slug,
      sectionOrder: ["education", "skills", "experience", "projects"],
    },
  });

  revalidatePath("/personas");
  redirect(`/personas/${persona.id}`);
}

export async function renamePersona(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return;

  await prisma.persona.update({
    where: { id },
    data: { name, slug: slugify(name) },
  });
  revalidatePath("/personas");
  revalidatePath(`/personas/${id}`);
}

/**
 * Duplicating copies the *selection*, not the corpus content — a persona is a
 * view, so a duplicate is a second view over the same facts.
 */
export async function duplicatePersona(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const source = await prisma.persona.findUnique({
    where: { id },
    include: {
      facts: true,
      bullets: true,
      skillGroups: { include: { items: true } },
    },
  });
  if (!source) return;

  let name = `${source.name} (copy)`;
  let n = 2;
  while (await prisma.persona.findFirst({ where: { name }, select: { id: true } })) {
    name = `${source.name} (copy ${n++})`;
  }

  const copy = await prisma.persona.create({
    data: {
      name,
      slug: slugify(name),
      sectionOrder: source.sectionOrder,
      voiceGuidance: source.voiceGuidance,
      keywordVocab: source.keywordVocab,
      pageBudget: source.pageBudget,
      facts: {
        create: source.facts.map((f) => ({
          factId: f.factId,
          sortHint: f.sortHint,
        })),
      },
      bullets: {
        create: source.bullets.map((b) => ({
          bulletId: b.bulletId,
          sortHint: b.sortHint,
          emphasis: b.emphasis,
          preferredVariantId: b.preferredVariantId,
        })),
      },
    },
  });

  for (const g of source.skillGroups) {
    await prisma.skillGroup.create({
      data: {
        personaId: copy.id,
        label: g.label,
        sortHint: g.sortHint,
        items: {
          create: g.items.map((i) => ({
            skillId: i.skillId,
            sortHint: i.sortHint,
          })),
        },
      },
    });
  }

  revalidatePath("/personas");
  redirect(`/personas/${copy.id}`);
}

export async function deletePersona(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  // Only the view is removed. Corpus facts and bullets are untouched.
  await prisma.persona.delete({ where: { id } });
  revalidatePath("/personas");
  redirect("/personas");
}

export async function updatePersonaSettings(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const sectionOrder = formData
    .getAll("section")
    .map(String)
    .filter(Boolean);
  const voiceGuidance = String(formData.get("voiceGuidance") ?? "").trim();
  const pageBudget = Number(formData.get("pageBudget") ?? 1);
  const autofit = formData.get("autofit") === "on";

  // Clamped to the ceilings agreed for this template: 12pt type, 1.5 leading.
  const clamp = (v: number, lo: number, hi: number, fallback: number) =>
    Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
  const fontSize = clamp(Number(formData.get("fontSize")), 6, 12, 8.7);
  const lineHeight = clamp(Number(formData.get("lineHeight")), 1, 1.5, 1.24);

  await prisma.persona.update({
    where: { id },
    data: {
      sectionOrder,
      voiceGuidance: voiceGuidance || null,
      pageBudget: Number.isFinite(pageBudget) && pageBudget > 0 ? pageBudget : 1,
      autofit,
      fontSize,
      lineHeight,
    },
  });

  revalidatePath(`/personas/${id}`);
}

/**
 * Sets the persona's whole selection in one write.
 *
 * Replacing rather than diffing keeps the UI honest: the form posts exactly
 * what is ticked, so an unticked box always means "not in this persona" and
 * there is no stale state to reconcile.
 */
export async function setPersonaSelection(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const factIds = formData.getAll("fact").map(String).filter(Boolean);
  const bulletIds = formData.getAll("bullet").map(String).filter(Boolean);

  // Bullets belong to facts; a bullet whose fact is not selected is dropped.
  const bullets = bulletIds.length
    ? await prisma.bullet.findMany({
        where: { id: { in: bulletIds } },
        select: { id: true, factId: true, sortHint: true },
      })
    : [];
  const factSet = new Set(factIds);
  const keptBullets = bullets.filter((b) => factSet.has(b.factId));

  await prisma.$transaction([
    prisma.personaFact.deleteMany({ where: { personaId: id } }),
    prisma.personaBullet.deleteMany({ where: { personaId: id } }),
    prisma.personaFact.createMany({
      data: factIds.map((factId, i) => ({ personaId: id, factId, sortHint: i })),
    }),
    prisma.personaBullet.createMany({
      data: keptBullets.map((b, i) => ({
        personaId: id,
        bulletId: b.id,
        sortHint: i,
      })),
    }),
  ]);

  revalidatePath(`/personas/${id}`);
}

export async function setSkillGroups(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  // Each row is "Label: skill, skill, skill" — one line per group.
  const raw = String(formData.get("groups") ?? "");
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const allSkills = await prisma.skill.findMany();
  const byName = new Map(allSkills.map((s) => [s.name.toLowerCase(), s]));

  await prisma.skillGroup.deleteMany({ where: { personaId: id } });

  for (const [i, line] of lines.entries()) {
    const idx = line.indexOf(":");
    if (idx < 1) continue;
    const label = line.slice(0, idx).trim();
    const names = line
      .slice(idx + 1)
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);
    if (!label || !names.length) continue;

    const group = await prisma.skillGroup.create({
      data: { personaId: id, label, sortHint: i },
    });

    for (const [j, name] of names.entries()) {
      let skill = byName.get(name.toLowerCase());
      // A skill typed here that the corpus does not know is created, so the
      // taxonomy is not blocked on curating the skill list first.
      skill ??= await prisma.skill.create({ data: { name } });
      byName.set(name.toLowerCase(), skill);
      await prisma.skillGroupItem.create({
        data: { skillGroupId: group.id, skillId: skill.id, sortHint: j },
      });
    }
  }

  revalidatePath(`/personas/${id}`);
}

// --- Emphasis --------------------------------------------------------------

/**
 * Asks the model which phrases to bold, and stores the result as *suggestions*.
 * Nothing renders until the user approves; see applyEmphasis below.
 */
export async function suggestPersonaEmphasis(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const persona = await prisma.persona.findUnique({
    where: { id },
    include: { bullets: true },
  });
  if (!persona) return;

  const bulletIds = persona.bullets.map((b) => b.bulletId);
  if (!bulletIds.length) return;

  const bullets = await prisma.bullet.findMany({
    where: { id: { in: bulletIds } },
    select: { id: true, canonicalText: true },
  });

  const { suggestEmphasis } = await import("@/lib/suggest-emphasis");

  try {
    const { suggestions } = await suggestEmphasis(
      bullets.map((b) => ({ bulletId: b.id, text: b.canonicalText })),
      persona.voiceGuidance,
      persona.name,
    );

    const byBullet = new Map(suggestions.map((s) => [s.bulletId, s.phrases]));
    await prisma.$transaction(
      persona.bullets.map((pb) =>
        prisma.personaBullet.update({
          where: { id: pb.id },
          data: { suggestedBold: byBullet.get(pb.bulletId) ?? [] },
        }),
      ),
    );
  } catch {
    // Surfaced by the page showing no suggestions; the model call is retryable.
  }

  revalidatePath(`/personas/${id}`);
}

/**
 * Promotes the ticked suggestions into rendered emphasis.
 *
 * The form posts the full approved set, so unticking a phrase removes it. Any
 * suggestion not approved is cleared rather than left pending, so the queue
 * never accumulates stale proposals.
 */
export async function applyEmphasis(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const persona = await prisma.persona.findUnique({
    where: { id },
    include: { bullets: true },
  });
  if (!persona) return;

  // Values arrive as "<personaBulletId>::<phrase>".
  const approved = new Map<string, string[]>();
  for (const raw of formData.getAll("phrase").map(String)) {
    const at = raw.indexOf("::");
    if (at < 1) continue;
    const key = raw.slice(0, at);
    const phrase = raw.slice(at + 2);
    approved.set(key, [...(approved.get(key) ?? []), phrase]);
  }

  await prisma.$transaction(
    persona.bullets.map((pb) =>
      prisma.personaBullet.update({
        where: { id: pb.id },
        data: { boldPhrases: approved.get(pb.id) ?? [], suggestedBold: [] },
      }),
    ),
  );

  revalidatePath(`/personas/${id}`);
}

export async function clearEmphasis(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.personaBullet.updateMany({
    where: { personaId: id },
    data: { boldPhrases: [], suggestedBold: [] },
  });
  revalidatePath(`/personas/${id}`);
}
