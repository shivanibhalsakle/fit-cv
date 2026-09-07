import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ResumeDoc } from "@/lib/resume-doc";

/**
 * The default template, replicating the user's existing Word layout:
 * name in caps at top left with contact details right-aligned, section headings
 * over a rule, entries with the date range right-aligned, and tight bullet
 * spacing.
 *
 * Type size and leading are parameters, not constants — the renderer searches
 * for the largest pair that still holds the page budget, so a short resume
 * fills the page instead of leaving half of it blank. See lib/render-pdf.ts.
 *
 * Only built-in fonts are used (Helvetica), so nothing has to be fetched at
 * render time — important on serverless, where a font download is a cold-start
 * failure waiting to happen.
 */

export type TypeScale = { fontSize: number; lineHeight: number };

export const BASE_SCALE: TypeScale = { fontSize: 8.7, lineHeight: 1.24 };

function makeStyles({ fontSize, lineHeight }: TypeScale) {
  // Everything else is derived from the body size so the hierarchy holds at
  // every step of the fit search.
  const f = (mult: number) => Math.round(fontSize * mult * 10) / 10;
  // Vertical rhythm grows with leading, but more slowly than the text does —
  // at 1.5 the gaps would otherwise dominate the page.
  const gap = (base: number) => Math.round(base * (0.75 + lineHeight * 0.35) * 10) / 10;

  return StyleSheet.create({
    page: {
      paddingTop: 24,
      paddingBottom: 22,
      paddingHorizontal: 34,
      fontFamily: "Helvetica",
      fontSize,
      color: "#111",
      lineHeight,
    },

    headerRow: { flexDirection: "row", justifyContent: "space-between" },
    // lineHeight 1 keeps the name's own box tight; the gap to the location
    // line is set explicitly below rather than inherited from body leading.
    name: {
      fontSize: f(1.78),
      fontFamily: "Helvetica-Bold",
      letterSpacing: 0.6,
      lineHeight: 1,
    },
    headerLocation: { fontSize: f(0.92), color: "#333", marginTop: 4.5 },
    contactBlock: { alignItems: "flex-end", fontSize: f(0.87), color: "#333" },
    contactLine: { marginBottom: 1 },

    sectionTitle: {
      fontSize: f(1.08),
      fontFamily: "Helvetica-Bold",
      marginTop: gap(6.5),
      marginBottom: 1.5,
    },
    rule: {
      borderBottomWidth: 0.6,
      borderBottomColor: "#111",
      marginBottom: gap(2.5),
    },

    entry: { marginBottom: gap(3.2) },
    entryRow: { flexDirection: "row", justifyContent: "space-between" },
    entryTitle: {
      fontSize: f(1.03),
      fontFamily: "Helvetica-Bold",
      flex: 1,
      paddingRight: 8,
    },
    entryDate: { fontSize: f(0.92), color: "#333" },
    tagline: {
      fontSize: f(0.92),
      fontStyle: "italic",
      color: "#333",
      marginTop: 0.5,
    },

    bulletRow: { flexDirection: "row", marginTop: gap(0.8), paddingRight: 2 },
    bulletGlyph: { width: f(0.8), fontSize },
    bulletText: { flex: 1, textAlign: "justify" },
    bold: { fontFamily: "Helvetica-Bold" },

    skillRow: { flexDirection: "row", marginBottom: gap(0.8) },
    skillLabel: { fontFamily: "Helvetica-Bold" },

    inlineText: { marginBottom: 2 },
  });
}

/**
 * Splits bullet text into plain and bold runs.
 *
 * Phrases are matched case-insensitively, longest first, and each match is
 * taken once. Matching on text rather than character offsets means an edit to
 * the bullet cannot silently move the emphasis onto the wrong words — a stale
 * phrase simply stops matching and renders plain.
 */
export function splitEmphasis(
  text: string,
  phrases: string[],
): { text: string; bold: boolean }[] {
  if (!phrases.length) return [{ text, bold: false }];

  const lower = text.toLowerCase();
  const taken: [number, number][] = [];

  for (const phrase of [...phrases].sort((a, b) => b.length - a.length)) {
    const needle = phrase.trim().toLowerCase();
    if (!needle) continue;
    let from = 0;
    while (from <= lower.length - needle.length) {
      const at = lower.indexOf(needle, from);
      if (at === -1) break;
      const end = at + needle.length;
      const overlaps = taken.some(([s, e]) => at < e && s < end);
      if (!overlaps) {
        taken.push([at, end]);
        break;
      }
      from = at + 1;
    }
  }

  if (!taken.length) return [{ text, bold: false }];
  taken.sort((a, b) => a[0] - b[0]);

  const runs: { text: string; bold: boolean }[] = [];
  let cursor = 0;
  for (const [start, end] of taken) {
    if (start > cursor) runs.push({ text: text.slice(cursor, start), bold: false });
    runs.push({ text: text.slice(start, end), bold: true });
    cursor = end;
  }
  if (cursor < text.length) runs.push({ text: text.slice(cursor), bold: false });
  return runs;
}

export function ResumePdf({
  doc,
  scale = BASE_SCALE,
}: {
  doc: ResumeDoc;
  scale?: TypeScale;
}) {
  const s = makeStyles(scale);
  const { contact } = doc;

  return (
    <Document
      title={`${contact.name} — ${doc.personaName}`}
      author={contact.name}
    >
      <Page size="LETTER" style={s.page}>
        <View style={s.headerRow}>
          <View>
            <Text style={s.name}>{contact.name.toUpperCase()}</Text>
            {contact.location && (
              <Text style={s.headerLocation}>{contact.location}</Text>
            )}
          </View>
          <View style={s.contactBlock}>
            <Text style={s.contactLine}>
              {[contact.phone, contact.email].filter(Boolean).join(" | ")}
            </Text>
            {contact.links.map((l) => (
              <Text key={l.url} style={s.contactLine}>
                {l.url.replace(/^https?:\/\//, "")}
              </Text>
            ))}
          </View>
        </View>

        {doc.sections.map((section) => {
          if (section.type === "skills") {
            return (
              <View key={section.key}>
                <View wrap={false}>
                  <Text style={s.sectionTitle}>{section.label}</Text>
                  <View style={s.rule} />
                </View>
                {section.groups.map((g) => (
                  <View key={g.label} style={s.skillRow}>
                    <Text>
                      <Text style={s.skillLabel}>{g.label}: </Text>
                      {g.items.join(", ")}
                    </Text>
                  </View>
                ))}
              </View>
            );
          }

          if (section.type === "inline") {
            return (
              <View key={section.key}>
                <View wrap={false}>
                  <Text style={s.sectionTitle}>{section.label}</Text>
                  <View style={s.rule} />
                </View>
                <Text style={s.inlineText}>{section.items.join("  |  ")}</Text>
              </View>
            );
          }

          return (
            <View key={section.key}>
              <View wrap={false}>
                <Text style={s.sectionTitle}>{section.label}</Text>
                <View style={s.rule} />
              </View>
              {section.entries.map((e) => (
                <View key={e.factId} style={s.entry} wrap={false}>
                  <View style={s.entryRow}>
                    {/* Organisation, title and location share one line, as on
                        the source resume. Giving location its own line costs a
                        line per entry, which a one-page budget cannot spare.
                        Education leads with the institution; everything else
                        leads with the title. */}
                    <Text style={s.entryTitle}>
                      {(section.key === "education"
                        ? [e.org, e.title, e.location]
                        : [e.title, e.org, e.orgDescriptor, e.location]
                      )
                        .filter(Boolean)
                        .join(" – ")}
                    </Text>
                    {e.dateRange ? (
                      <Text style={s.entryDate}>{e.dateRange}</Text>
                    ) : null}
                  </View>

                  {e.tagline && <Text style={s.tagline}>{e.tagline}</Text>}

                  {e.bullets.map((b) => (
                    <View key={b.bulletId} style={s.bulletRow}>
                      <Text style={s.bulletGlyph}>•</Text>
                      <Text style={s.bulletText}>
                        {splitEmphasis(b.text, b.boldPhrases).map((run, i) =>
                          run.bold ? (
                            <Text key={i} style={s.bold}>
                              {run.text}
                            </Text>
                          ) : (
                            <Text key={i}>{run.text}</Text>
                          ),
                        )}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          );
        })}
      </Page>
    </Document>
  );
}
