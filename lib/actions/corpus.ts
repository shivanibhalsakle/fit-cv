"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { monthToDate } from "@/lib/dates";
import {
  bulletSchema,
  factSchema,
  toActionState,
  type ActionState,
} from "@/lib/validation";

/**
 * Every action re-checks the session. The proxy already gates these routes, but
 * server actions are independently addressable POST endpoints — the gate on the
 * page that renders the form is not a gate on the action itself.
 */
async function requireSession() {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated");
}

// --- Facts -----------------------------------------------------------------

export async function createFact(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();

  const parsed = factSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return toActionState(parsed.error);
  const d = parsed.data;

  const fact = await prisma.fact.create({
    data: {
      kind: d.kind,
      title: d.title,
      org: d.org,
      orgDescriptor: d.orgDescriptor,
      location: d.location,
      startDate: monthToDate(d.startDate),
      endDate: d.isCurrent ? null : monthToDate(d.endDate),
      isCurrent: d.isCurrent,
      tagline: d.tagline,
      tags: d.tags,
      archivedTitles: d.archivedTitles,
    },
  });

  revalidatePath("/corpus");
  redirect(`/corpus/${fact.id}`);
}

export async function updateFact(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing fact id." };

  const parsed = factSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return toActionState(parsed.error);
  const d = parsed.data;

  await prisma.fact.update({
    where: { id },
    data: {
      kind: d.kind,
      title: d.title,
      org: d.org,
      orgDescriptor: d.orgDescriptor,
      location: d.location,
      startDate: monthToDate(d.startDate),
      endDate: d.isCurrent ? null : monthToDate(d.endDate),
      isCurrent: d.isCurrent,
      tagline: d.tagline,
      tags: d.tags,
      archivedTitles: d.archivedTitles,
    },
  });

  revalidatePath("/corpus");
  revalidatePath(`/corpus/${id}`);
  return { ok: true };
}

export async function deleteFact(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  // Bullets and variants cascade. This removes work history permanently, so the
  // UI requires an explicit confirmation before calling it.
  await prisma.fact.delete({ where: { id } });

  revalidatePath("/corpus");
  redirect("/corpus");
}

// --- Bullets ---------------------------------------------------------------

export async function createBullet(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();

  const parsed = bulletSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return toActionState(parsed.error);
  const d = parsed.data;

  const last = await prisma.bullet.findFirst({
    where: { factId: d.factId },
    orderBy: { sortHint: "desc" },
    select: { sortHint: true },
  });

  await prisma.bullet.create({
    data: {
      factId: d.factId,
      canonicalText: d.canonicalText,
      metrics: d.metrics,
      tags: d.tags,
      sortHint: (last?.sortHint ?? -1) + 1,
    },
  });

  revalidatePath(`/corpus/${d.factId}`);
  return { ok: true };
}

export async function updateBullet(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing bullet id." };

  const parsed = bulletSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return toActionState(parsed.error);
  const d = parsed.data;

  await prisma.bullet.update({
    where: { id },
    data: {
      canonicalText: d.canonicalText,
      metrics: d.metrics,
      tags: d.tags,
    },
  });

  revalidatePath(`/corpus/${d.factId}`);
  return { ok: true };
}

export async function deleteBullet(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id") ?? "");
  const factId = String(formData.get("factId") ?? "");
  if (!id) return;

  await prisma.bullet.delete({ where: { id } });
  revalidatePath(`/corpus/${factId}`);
}

/**
 * Swaps a bullet with its neighbour. Ordering matters because a resume renders
 * bullets in sortHint order, and the strongest bullet should lead.
 */
export async function moveBullet(formData: FormData) {
  await requireSession();

  const id = String(formData.get("id") ?? "");
  const factId = String(formData.get("factId") ?? "");
  const direction = String(formData.get("direction") ?? "");
  if (!id || !factId || (direction !== "up" && direction !== "down")) return;

  const bullets = await prisma.bullet.findMany({
    where: { factId },
    orderBy: { sortHint: "asc" },
    select: { id: true, sortHint: true },
  });

  const index = bullets.findIndex((b) => b.id === id);
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || swapWith < 0 || swapWith >= bullets.length) return;

  const a = bullets[index];
  const b = bullets[swapWith];

  // sortHint values may collide (seeded data, concurrent inserts), so rewrite
  // positions rather than trusting the stored numbers to differ.
  await prisma.$transaction([
    prisma.bullet.update({ where: { id: a.id }, data: { sortHint: swapWith } }),
    prisma.bullet.update({ where: { id: b.id }, data: { sortHint: index } }),
  ]);

  revalidatePath(`/corpus/${factId}`);
}
