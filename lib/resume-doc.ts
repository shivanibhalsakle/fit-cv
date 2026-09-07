import { prisma } from "@/lib/db";
import { formatRange } from "@/lib/dates";

/**
 * A persona resolved into a renderable resume document.
 *
 * This is the structured JSON that everything downstream consumes: the PDF
 * renderer, the .tex exporter, and later the diff view. It is built fresh from
 * the corpus on every render, so a corpus edit is reflected immediately and a
 * resume can never drift from its source facts.
 */

export const SECTION_KEYS = [
  "education",
  "skills",
  "experience",
  "projects",
  "leadership",
  "certifications",
  "awards",
  "publications",
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

export const SECTION_LABELS: Record<SectionKey, string> = {
  education: "Education",
  skills: "Skills",
  experience: "Work Experience",
  projects: "Featured Projects",
  leadership: "Leadership",
  certifications: "Certifications",
  awards: "Awards",
  publications: "Publications",
};

/** Which fact kinds feed which section. */
const KIND_TO_SECTION: Record<string, SectionKey> = {
  EDUCATION: "education",
  EXPERIENCE: "experience",
  PROJECT: "projects",
  LEADERSHIP: "leadership",
  CERTIFICATION: "certifications",
  AWARD: "awards",
  PUBLICATION: "publications",
};

export type DocBullet = {
  bulletId: string;
  text: string;
  /** Set when the persona prefers a stored variant over the canonical text. */
  variantId: string | null;
  /** Approved emphasis for this persona. Suggestions are not included. */
  boldPhrases: string[];
};

export type DocEntry = {
  factId: string;
  /** Immutable — comes from the Fact, never from the persona. */
  title: string;
  org: string | null;
  orgDescriptor: string | null;
  location: string | null;
  dateRange: string;
  tagline: string | null;
  bullets: DocBullet[];
};

export type DocSkillGroup = { label: string; items: string[] };

export type DocSection =
  | { key: SectionKey; label: string; type: "entries"; entries: DocEntry[] }
  | { key: "skills"; label: string; type: "skills"; groups: DocSkillGroup[] }
  | { key: SectionKey; label: string; type: "inline"; items: string[] };

export type ResumeDoc = {
  personaId: string;
  personaName: string;
  pageBudget: number;
  /** When false, the manual scale below is used verbatim. */
  autofit: boolean;
  fontSize: number;
  lineHeight: number;
  contact: {
    name: string;
    email: string;
    phone: string | null;
    location: string | null;
    links: { label: string; url: string }[];
  };
  sections: DocSection[];
};

/**
 * Certifications and awards render as one compact line rather than as full
 * entries with bullets — they are credentials, not experiences, and a one-page
 * budget cannot afford a block each.
 */
const INLINE_SECTIONS = new Set<SectionKey>(["certifications", "awards"]);

export async function buildResumeDoc(
  personaId: string,
): Promise<ResumeDoc | null> {
  const persona = await prisma.persona.findUnique({
    where: { id: personaId },
    include: {
      facts: { orderBy: { sortHint: "asc" } },
      bullets: true,
      skillGroups: {
        orderBy: { sortHint: "asc" },
        include: {
          items: { orderBy: { sortHint: "asc" }, include: { skill: true } },
        },
      },
    },
  });
  if (!persona) return null;

  const contact = await prisma.contact.findUnique({ where: { id: "singleton" } });

  const factIds = persona.facts.map((pf) => pf.factId);
  const facts = await prisma.fact.findMany({
    where: { id: { in: factIds } },
    include: { bullets: { orderBy: { sortHint: "asc" } } },
  });
  const factById = new Map(facts.map((f) => [f.id, f]));

  // Persona-chosen bullets, with their ordering and any preferred phrasing.
  const chosen = new Map(persona.bullets.map((pb) => [pb.bulletId, pb]));
  const variantIds = persona.bullets
    .map((pb) => pb.preferredVariantId)
    .filter((v): v is string => Boolean(v));
  const variants = variantIds.length
    ? await prisma.bulletVariant.findMany({ where: { id: { in: variantIds } } })
    : [];
  const variantById = new Map(variants.map((v) => [v.id, v]));

  const entriesBySection = new Map<SectionKey, DocEntry[]>();

  for (const pf of persona.facts) {
    const fact = factById.get(pf.factId);
    if (!fact) continue;
    const section = KIND_TO_SECTION[fact.kind];
    if (!section) continue;

    const bullets: DocBullet[] = fact.bullets
      .filter((b) => chosen.has(b.id))
      .sort(
        (a, b) =>
          (chosen.get(a.id)?.sortHint ?? 0) - (chosen.get(b.id)?.sortHint ?? 0),
      )
      .map((b) => {
        const pick = chosen.get(b.id);
        const variant = pick?.preferredVariantId
          ? variantById.get(pick.preferredVariantId)
          : undefined;
        return {
          bulletId: b.id,
          text: variant?.text ?? b.canonicalText,
          variantId: variant?.id ?? null,
          boldPhrases: pick?.boldPhrases ?? [],
        };
      });

    const list = entriesBySection.get(section) ?? [];
    list.push({
      factId: fact.id,
      title: fact.title,
      org: fact.org,
      orgDescriptor: fact.orgDescriptor,
      location: fact.location,
      dateRange: formatRange(fact.startDate, fact.endDate, fact.isCurrent),
      tagline: fact.tagline,
      bullets,
    });
    entriesBySection.set(section, list);
  }

  const skillGroups: DocSkillGroup[] = persona.skillGroups.map((g) => ({
    label: g.label,
    items: g.items.map((i) => i.skill.name),
  }));

  // sectionOrder is the persona's; anything it does not name is left out.
  const order = (
    persona.sectionOrder.length
      ? persona.sectionOrder
      : ["education", "skills", "experience", "projects"]
  ).filter((k): k is SectionKey =>
    (SECTION_KEYS as readonly string[]).includes(k),
  );

  const sections: DocSection[] = [];
  for (const key of order) {
    if (key === "skills") {
      if (skillGroups.length) {
        sections.push({
          key: "skills",
          label: SECTION_LABELS.skills,
          type: "skills",
          groups: skillGroups,
        });
      }
      continue;
    }

    const entries = entriesBySection.get(key) ?? [];
    if (!entries.length) continue;

    if (INLINE_SECTIONS.has(key)) {
      sections.push({
        key,
        label: SECTION_LABELS[key],
        type: "inline",
        items: entries.map((e) =>
          e.org ? `${e.title} (${e.org})` : e.title,
        ),
      });
    } else {
      sections.push({
        key,
        label: SECTION_LABELS[key],
        type: "entries",
        entries,
      });
    }
  }

  return {
    personaId: persona.id,
    personaName: persona.name,
    pageBudget: persona.pageBudget,
    autofit: persona.autofit,
    fontSize: persona.fontSize,
    lineHeight: persona.lineHeight,
    contact: {
      name: contact?.name ?? "",
      email: contact?.email ?? "",
      phone: contact?.phone ?? null,
      location: contact?.location ?? null,
      links: (contact?.links as { label: string; url: string }[] | null) ?? [],
    },
    sections,
  };
}
