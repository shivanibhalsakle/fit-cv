# Resume Optimizer — Product Spec

## Problem

Tailoring resume bullets for every job application is slow and repetitive. Every time Shivani applies to a new role, a new company, or wants to reflect a project update / new experience, she manually rewrites bullets to keep them sharp and relevant. This eats hours that could go elsewhere. The web app exists to remove that manual tailoring loop while keeping bullet quality high and specific to each job.

## Core Goals

- Store multiple resume variants (e.g. Technical Product Manager, Business Analyst, Software Engineer) so she never starts from scratch.
- Let her maintain a standing profile that updates all resumes going forward (new internship, "make it more technical," etc.) without manual edits to every variant.
- Auto-tailor a resume to a specific company + role + job description with one generation step, either updating a stored variant permanently or producing a one-off tailored copy.
- Make it easy to see exactly what changed between the resume that was used and the newly generated one.

## Feature 1 — Resume Variants

- Store multiple named resume variants (e.g. "TPM," "Business Analyst," "SWE").
- Each variant is a full resume (all sections: summary, experience, projects, skills, education, etc.).
- User can open any variant and continue tailoring it rather than rebuilding from zero.
- Variants are the base resumes referenced during generation (see Feature 4).

## Feature 2 — Home Dashboard

The dashboard is the main input hub, with the following sections:

### 2a. Customize Profile
- A living, standing profile the user edits directly, independent of any single resume.
- Supports free-form instructions/updates such as:
  - "Make my resume more technically oriented henceforth."
  - "I've gotten a new internship — include it in all resumes going forward."
- Changes here are meant to persist and influence *all* future resume generations (all variants), unless a generation explicitly overrides them (see Feature 4d).
- Should support both structured updates (add an experience/project entry) and unstructured natural-language preference statements (tone/style directives).

### 2b. Customize Rules
- A separate input area for:
  - A list of roles the user is interested in applying for.
  - A list of companies the user is interested in applying for.
- This is for analysis/reference at this stage — not necessarily used to auto-tailor resumes yet, but stored so the app can use it for future features (e.g. suggestions, tracking, alerts).

## Feature 3 — Resume Variant Management
- View, create, rename, duplicate, and delete resume variants.
- Each variant shows version history over time (see Feature 5, diff view).

## Feature 4 — Tailor a Resume (core workflow)

A dedicated screen with the following inputs:

1. **Company name** — free text. App looks up the company and surfaces relevant keywords/context (e.g. via web search) to inform tailoring.
2. **Role** — free text, plus optional job requisition ID / job ID.
3. **Job description** — paste the full JD text.
4. **Optional one-off customization instructions** — free text, scoped *only* to this generation/variant, does NOT get written back into the standing profile (Feature 2a). This lets the user tweak a single tailored resume without affecting all future resumes.

Also on this screen:
- Selection of which stored resume variant(s) to use as the base (one or more source resumes can be blended into the new tailored version).
- **Generate Resume** button that kicks off tailoring using: selected base variant(s) + standing profile (2a) + company/role/JD inputs + optional one-off instructions (4).

## Feature 5 — Generation Result / Diff View

After generation, show a side-by-side (or stacked) comparison:

- **Left/before panel** — the source resume(s) used to generate the new version. If more than one base resume was used, indicate which one contributed each section/line.
- **Right/after panel** — the newly generated resume.
- **Diff highlighting:**
  - Lines/bullets removed from the old resume → shown in red (strikethrough or red text) in the before panel.
  - Lines/bullets that are new or substantially reworded in the new resume → shown in yellow highlight in the after panel.
  - Unchanged lines shown normally in both.
- User can accept the generated resume (save as a new version of the variant, or save as a new variant) or discard/regenerate.

## Future Ideas (not in initial build, but noted for later)

- Use the "interested roles/companies" list (2b) to proactively suggest which variant to tailor for a new opportunity, or to auto-tailor in bulk.
- Resume scoring against a JD (keyword match %, ATS compatibility check).
- Export to PDF/DOCX with formatting preserved.
- Application tracker (status per company/role, linked to which resume version was submitted).
- Version history / rollback per resume variant beyond the single before/after diff.
- Browser extension to pull JD directly from a job posting URL.

## Open Questions / Decisions To Make During Build

- Auth/storage: local-only vs. accounts + database?
- LLM provider for tailoring generation (Claude API is the natural fit given the build environment).
- How company keyword lookup is sourced (web search vs. static data).
- Resume storage format (structured JSON per section vs. rich text/markdown) — structured JSON is recommended since it enables reliable diffing and multi-format export.
- Where diffing happens (client-side diff on structured JSON, or server returns diff metadata alongside generated content).
