# Resume Optimizer — Build Roadmap

Companion to [`SPEC.md`](SPEC.md). The spec says *what*; this says *in what order, on what stack, and why*.

Last updated: 2026-09-06

---

## 1. Decisions locked

| Area | Decision | Rationale |
|---|---|---|
| **Source of truth** | One **master corpus** of every fact/bullet the user owns. Personas are *views* over it, not independent documents. | "Add my new internship everywhere" becomes one write. Blending personas becomes widening a candidate pool. Retrofitting this later is the only genuinely painful migration. |
| **Storage format** | Structured **JSON**, never text blobs or `.tex`. | Bullet-level diffing, page budgeting, multi-persona reuse, and schema-validated LLM output all depend on it. |
| **PDF** | Render target, not storage. Generated on demand from JSON. | Edits always mutate data; the preview can never disagree with what is stored. |
| **Renderer** | `@react-pdf/renderer` | One component tree drives both preview and download. No headless Chrome (serverless-hostile), no TeX toolchain. |
| **LaTeX** | Export only (JSON to `.tex` string templating). No in-app compiler in v1. | Nearly free to build, gives an Overleaf escape hatch. In-app compile (or Typst) stays available later without touching the data model. |
| **App** | Next.js (App Router) + TypeScript | One codebase, one deploy. `frontend/` and `backend/` collapse into one `app/` tree. |
| **DB** | PostgreSQL + Prisma | The data is deeply relational: corpus, facts, bullets, personas, sessions, applications. |
| **Hosting** | Vercel (Hobby) + Neon (free tier) | $0. Cloud Run + Neon is the migration path if ever outgrown; app code unchanged. |
| **LLM** | Claude API, `claude-opus-5`, structured outputs + prompt caching | Judgment-heavy work where quality is the product. Schema-valid JSON enforced at the API boundary. |
| **Auth** | Auth.js + GitHub OAuth, locked to one GitHub ID | Single user, but a full work history should not sit behind a public URL. |
| **Cloud** | Neither AWS nor GCP for v1 | GCP would be the cheaper of the two (Cloud Run scales to zero), but managed free tiers cost less and need no IAM or VPC. |

### Non-negotiable product rules

1. **No fabrication.** Generation may reframe, reorder, reweight, and reword facts that exist in the corpus. It may never introduce a claim with no backing fact. Every generated bullet carries a pointer to its source fact; anything unsourced is flagged in the diff, never silently accepted. Numbers are copied exactly — never invented, never "improved."
2. **Standing profile is not one-off customization.** Separate fields, separate tables, end to end. One-off instructions never leak into standing preferences.
3. **LLM edits return patches, not documents.** A change list (`replace bullet 2 of Experience 1`, `drop bullet 4`) is cheaper (output bills at roughly 5x input), reviewable before accepting, and structurally unable to drop a section while rewriting.
4. **Save aggressively.** Storage is not a cost constraint — a resume is a few KB. The save/discard toggle exists to keep the library uncluttered, not to save money.

---

## 2. Data model sketch

Derived from the structure of the user's actual resume.

```
Corpus (source of truth — everything ever done, far beyond any one resume)
├─ Fact              id, kind(experience|project|education|cert|skill|award|
│                    publication|leadership), title, org, org_descriptor,
│                    location, start, end, tagline, tags[]
│                    ⚠ title/org/dates are IMMUTABLE — identical in every persona
└─ Bullet            id, fact_id, canonical_text, metrics[], tags[]
   └─ BulletVariant  id, bullet_id, text, origin(imported|generated|manual),
                     source_resume_id?, generation_id?, application_id?,
                     persona_id, style_tags[], created_at, times_reused
                     └─ every way this accomplishment has ever been phrased:
                        historical (from imported resumes) AND generated
                        (written back on each ACCEPTED tailoring run)

Contact              name, phone, location, email (sab10099@nyu.edu), links[]

StandingProfile      structured facts + unstructured preference statements
                     (persists across ALL generations, ALL personas)

TargetRules          roles[], companies[]   (informational for now)

Persona              id, name (e.g. "Business Analyst"), section_order[],
                     included_bullet_ids[], emphasis_weights, page_budget,
                     skill_groups[],                 ← taxonomy differs per persona
                     voice_guidance (short prose),
                     keyword_vocab[]                 ← harvested from collected JDs
                     ⚠ NO title overrides — titles come from the Fact, always

TailoringSession     id, persona_id(s), company, role, job_id, jd_text,
                     one_off_instructions, extracted_keywords[], gap_list[],
                     qa_pairs[], status
                     └─ stateful: keyword extraction → gap analysis → Q&A → generate

Generation           id, session_id, source_persona_ids[], output_json,
                     diff_json, accepted(bool), created_at

Application          id, generation_id, company, role, jd_snapshot,
                     resume_snapshot, qa_snapshot, status, applied_at
                     └─ the interview-prep record
```

**Section schema**, taken from the current resume: contact, education (with `coursework[]`), certifications, skills (labeled categories), experience (title / company / location / dates / bullets), projects (name / **tagline** / date / bullets). Projects carry a one-line tagline that experience entries do not. Other personas additionally use leadership, awards, publications, and summary sections.

### Why personas are configuration, not trained models

Nothing in this system is trained. No classical ML, no fine-tuning.

- **No training objective exists.** Training needs (input → correct output) pairs. There are no "ideal resumes" to serve as targets — only resumes that were sent, with no outcome signal attached. Collected JDs are inputs with no paired outputs, so they cannot be training data for a generation task regardless of quantity.
- **Data volume is nowhere near sufficient** — ~200 bullets across all resumes, roughly 25 per persona.
- **Fine-tuning solves the wrong problem.** It teaches style; this system needs knowledge and selection (know the user's facts, pick the right ones for this JD). That is retrieval plus in-context reasoning, which frontier models already handle.
- **A trained persona would be frozen.** A new internship would mean retraining. A config field is edited in seconds.

At generation time a request carries: corpus (cached prefix) + persona config + JD. The "personality" lives in the prompt, not in weights.

**Collected JDs are still valuable** — just not as training data. Per persona, 10–20 JDs give: (1) a **keyword vocabulary** powering zero-LLM gap analysis, (2) **pre-tagging** of corpus bullets for cheap retrieval, and (3) a **test set** for validating a persona before trusting it live.

### Immutable facts (user decision — do not vary these per persona)

**Job titles, employers, and dates are immutable and identical across every persona.** Resume titles must match the user's public professional profiles; maintaining divergent titles across personas would require re-editing those profiles per application and creates a verification liability. This is a hard product rule, not a default.

What a persona *may* vary: which facts and bullets are included, how bullets are phrased, section order and section set, skill grouping and labels, and voice. That is ample differentiation without touching identity fields.

Older resumes used different titles for the same roles (*Business Analyst Intern*, *Product Lead*, *Tech Lead (Business Strategy)* for SAKSHI). These are retained as **archival import metadata only** — never emitted into any generated resume — so the user can recognize what an out-of-date resume in circulation says if a recruiter references one.

### Canonical values (established 2026-09-06; source of truth for import)

| Field | Canonical value |
|---|---|
| NYU GPA | **3.69/4** (final) |
| Bachelor's GPA | **3.50/4** |
| Bachelor's degree | **Bachelor of Science, Computer Science, Honors Data Science** |
| SOFTWARE ENGINEER INTERN | InnovateMore LLC — San Antonio, TX — Aug 2026 – Present |
| FULL STACK DEVELOPER INTERN | Alhansat Solutions Pvt. Ltd. — Mumbai, India — Dec 2022 – Feb 2023 |
| EXECUTIVE WEB DEVELOPER | SAKSHI — New Delhi, India — Dec 2021 – Sep 2022 |
| DEVELOPER INTERN | SAKSHI — New Delhi, India — Oct 2021 – Nov 2021 |

Contact email: **sab10099@nyu.edu** (single canonical value; changed manually if ever needed).

Notes: earlier GPA discrepancies were in-progress values, now superseded. SAKSHI was two distinct roles previously written as one entry; they are now split, which is why dates differ from older files. The degree is recorded as *Bachelor of Science, Computer Science, Honors Data Science* — application dropdowns rarely offer "Bachelor of Engineering" and BS is the closest available option. Store this value only; no alternate degree name is kept.

### The four personas (confirmed 2026-09-06)

1. **Technical / SWE**
2. **Business Analyst**
3. **Strategy & Consulting**
4. **Project Management**

**Page budget: one page. All four. Hard constraint.**

Eight source files cluster into the first three personas plus one stale archival CV. Files like `risk+tax` and `tech cons` are tailored *outputs* of Strategy & Consulting, not personas themselves. The app enforces this distinction — 4 personas stay current; 8 files do not.

**Project Management is greenfield.** No existing resume is built as one, so it must be *constructed* in Phase 3 rather than derived from an import. The corpus already holds the material:

- **Credentials** — CAPM (PMI), Google Project Management Professional Certificate, ECBA (IIBA), BCG Digital Transformation. The strongest single signal, currently compressed into one line at the bottom of the technical resume.
- **Program leadership** — Dronarjun (founded, 40+ researchers, 30+ projects, executed in 3 phases); IEEE Pune SAC (directed 42 students across 44 colleges, 400+ attendee events); GDSC Head of Operations (events, logistics, budgeting, sponsorships).
- **Delivery ownership** — SAKSHI 20,000-certificate program led with a rotating team of 3–4; greytHR HRMS rollout across onboarding, invoicing, and tax workflows; Quaderno/ONESOURCE integration.
- **Client-facing PM** — Booz Allen capstone: bi-weekly client presentations, weighted decision matrix across 7 platforms, ROI and change-management frameworks.
- **Agile practice** — sprint documentation, user stories, compliance checklists (Alhansat).
- **Coursework** — Operations Management, Management Science, Economics & Strategy.

### Consequence of the one-page rule

With every persona capped at one page, generation is a **strict selection problem**: every bullet added displaces another. Two implications:

- The page-budget meter is not a nicety — it is load-bearing UI, required from Phase 3.
- The page budget must be passed to the generator as a **hard constraint**, not a stylistic preference, and the output must be re-measured after generation rather than trusted.

Section sets will differ sharply to make the page fit: the technical persona already drops Leadership, Awards, and Publications; Strategy & Consulting and Project Management need Leadership but will likely have to cut Publications and trim Awards.

---

## 3. Phases

Each phase is independently useful and testable. Nothing downstream is blocked on LLM output quality until Phase 4.

### Phase 0 — Foundations ✅ *complete 2026-09-06*
Next.js 16 (App Router) + TypeScript + Tailwind 4; `frontend/` and `backend/` collapsed into one `app/` tree; Prisma schema for the full model above; local Postgres via docker compose (port 5433); Auth.js v5 gated to one GitHub account; secret hygiene verified.

Delivered: `prisma/schema.prisma`, `lib/db.ts`, `lib/auth.ts`, `proxy.ts` (Next 16 renamed `middleware`), `app/signin`, `docker-compose.yml`, `.env.example`, README. Typecheck, lint, and production build all clean.

**Remaining to run locally:** start Docker Desktop, `npm run db:up`, `npm run db:push`, and fill the GitHub OAuth values in `.env`.

*Known issue:* `npm audit` reports 3 high-severity advisories in `deepmerge-ts`, reached only through the Prisma **CLI** (`prisma` → `@prisma/config`). Dev-dependency only, not in the runtime bundle; no non-breaking fix is published yet. Recheck on the next Prisma release.

### Phase 1 — Source of truth (manual) ✅ *complete 2026-09-06*
Corpus CRUD: add, edit, delete facts and bullets; tag them; attach metrics; reorder bullets. Additive and editable forever — this is where work gets logged as it happens. No LLM involved.

Delivered: `lib/validation.ts` (Zod), `lib/dates.ts`, `lib/actions/corpus.ts`, `app/corpus/*`, `components/*`, `prisma/seed.ts`.

**Seeded from `ShivaniB_Resume.pdf`** using the canonical values above — 13 facts, 18 bullets, 39 skills. Transcribed verbatim, no rewording; the other seven resumes arrive in Phase 2 through the merge queue where dedup and conflict review belong.

Notes:
- Metrics are newline-separated, tags comma-separated — resume metrics routinely contain commas (`"91.4%/90.0% ROC-AUC"`).
- Dates are month-precision, normalised to UTC first-of-month so a date entered in one timezone renders as the same month everywhere.
- Every server action re-checks the session. The proxy gates *pages*; server actions are independently addressable POST endpoints and need their own check.
- Archived titles render struck-through on the fact page, clearly marked as never emitted.

**Verified:** typecheck, lint, and production build clean; seed idempotent; list- and detail-page queries confirmed against the seeded data. **Not verified visually** — viewing the gated UI needs the GitHub OAuth credentials, which only the user can create.

### Phase 2 — Resume import ✅ *complete 2026-09-06*
Three input paths, all landing in the same **merge review queue**:

1. **Upload** a PDF or DOCX — extracted with `pdftotext -layout` (deterministic, free; verified working on all 8 of the user's resumes)
2. **Paste raw text** — for a resume that isn't handy as a file, or a fragment of one
3. **Manual structured entry** — the Phase 1 corpus editor

Paths 1 and 2 then take one Claude call to produce structured JSON.

**This is not one-time onboarding.** Import stays available permanently: more resumes exist beyond the initial batch, and older ones surface over time. Importing an out-of-date resume later is safe — immutable fields are checked against the **Canonical values** table, and disagreeing values are flagged as stale rather than overwriting the corpus. New bullets are added; bullets matching something already held attach as `BulletVariant` records with `origin: imported`.

**Target: the deduplicated union of every bullet across every resume.** Nothing is discarded as redundant — where the same accomplishment appears in several files, one canonical bullet is kept and the other phrasings are attached as `BulletVariant` records with `origin: imported`. The corpus is the complete pick-and-choose pool; a resume is a selection from it.

The merge queue must **surface conflicts** rather than silently picking a winner — older files carry superseded values. The conflicts found across the eight source files are already resolved in **Canonical values** above; import seeds from that table and treats disagreeing values in older PDFs as stale, not as candidates. `ShivaniB_Resume.pdf` is the authoritative file for titles, employers, and dates.

Contact details are a single canonical block — email **sab10099@nyu.edu** for every persona. Other addresses appearing in older files (`bhalsakleshivani@gmail.com`, `shivani.bhalsakle@gmail.com`) are stale and are not imported.

**Measured cost: $0.097 per resume** (2-page BA resume — 3,880 in / 3,100 out on Opus 5 at effort `medium`). Above the $0.06 estimate; seven remaining resumes come to roughly $0.70.

Implementation notes:
- **`unpdf` replaced `pdftotext`.** The binary has no equivalent on the deploy target; `unpdf` is pure JS and extracts equivalently on single-column resumes. DOCX via `mammoth`.
- **The planner proposes; it never decides.** Both fact matching *and* bullet disposition are overridable in the review UI. Lexical similarity cannot reliably distinguish a heavy rewrite of one accomplishment from a different one — the user's two Hotjar bullets describe the same work and score 23% — so any bullet can be attached as a phrasing of any existing bullet regardless of score.
- **Scoring is kind-aware.** Experience and education with dates score on employer and date overlap (title is only 20%, since the same role is deliberately titled differently across files). Certifications, awards and projects score on title at 70% — they carry no dates and often no issuer.
- Bullet variant threshold is 0.32, applied only *within* an already-matched fact. A missed variant becomes a near-duplicate the user can merge; a false variant would bury an unrelated accomplishment, which is the worse error.
- `lib/claude.ts` supports org-level keys via an optional `ANTHROPIC_WORKSPACE_ID` header. Workspace-scoped keys need nothing.

**Verified end to end** against `Resume for Business Analyst.pdf`: extraction, a real parse call, and merge planning against the seeded corpus. Bullets confirmed transcribed verbatim. Alhansat matched at 87% despite a completely different title; the SAKSHI entry that spans both split roles matched at 85% with the other role offered at 80%; contact email flagged as stale; 20 new skills identified.

**Not verified visually** — the gated UI cannot be opened from this environment.

*Placed early on purpose — everything downstream becomes testable against real content instead of fixtures. The corpus union is materially richer than any single file: the Believe Careers digital-marketing internship exists only in the archival CV and appears in none of the seven current resumes.*

### Phase 3 — Personas and rendering ✅ *complete 2026-09-06*
Persona CRUD (create, rename, duplicate, delete) as selections over the corpus. React-PDF template replicating the current Word layout. Live preview, **page-fit meter** (load-bearing given the one-page rule), **Download PDF**, **Download .tex**.

Seed all four personas: Technical/SWE, Business Analyst, and Strategy & Consulting derive from imported resumes; **Project Management is built from scratch** against the corpus material listed in §2.

**All four personas render at one page.** Measured, not estimated.

| Persona | Entries | Bullets | Pages |
|---|---|---|---|
| Technical / SWE | 9 | 18 | 1 |
| Business Analyst | 7 | 14 | 1 |
| Strategy & Consulting | 8 | 16 | 1 |
| Project Management | 7 | 14 | 1 |

Implementation notes:
- **The fit meter reads the page count off the rendered PDF** (via `unpdf` on the output buffer), never from a character-count estimate. With a hard one-page budget, a meter that says "fits" when it does not is worse than no meter.
- **Preview is a server-rendered PDF in an iframe**, not a client-side renderer — `@react-pdf/renderer` in the browser is a heavy, SSR-hostile bundle, and an iframe shows the actual file rather than an approximation of it.
- **Only built-in fonts (Helvetica).** Nothing is fetched at render time; a font download is a cold-start failure waiting to happen on serverless.
- **Entry metadata is inline** — `Title – Org – Location` on one line with the date right-aligned, as on the source resume. Giving location its own line cost a line per entry and pushed the technical persona to two pages.
- Certifications and awards render as one compact line rather than as entries with bullets; a one-page budget cannot afford a block each.
- `.tex` export escapes `|`, `<`, `>` in addition to LaTeX's own specials — they are legal in text mode but render as the wrong glyph, and contact lines use pipes.

**Project Management was built from scratch** as planned — no source resume is a PM resume. It leads with the credential stack (CAPM, ECBA, Google PM, BCG) and delivery-ownership material.

**Not verified visually in-app** — the gated preview cannot be opened from this environment; the rendered PDFs were sent to the user for review instead.

### Phase 4 — Tailoring engine ✅ *complete 2026-09-07*
Paste a JD, extract keywords (hybrid: skills dictionary in code plus one cheap call for the rest), run **gap analysis in pure code** (set arithmetic, zero LLM), ask how to portray missing keywords, search the corpus for relevant unused bullets, generate a patch.

**Done when:** a JD produces a tailored resume with every bullet traceable to a corpus fact. ✅ Verified against a real Deloitte BA posting — fabrication audit passed, 0 guard flags.

**No fabrication is enforced by the shape of the call, not by asking nicely.** The generation schema has no operation that creates a bullet from nothing: every operation names a `bulletId` that must already exist. Two guards run on the result — unknown ids are dropped, and any rewrite that introduces a number absent from the original is reverted to the original wording.

**New material enters through the corpus, never around it.** A gap answer becomes a real corpus bullet attached to a fact the user picks, and only then can generation select it. Skipping a gap means that requirement is simply absent from the resume.

**Coverage has four buckets, not two** — and the distinction is load-bearing:

| Bucket | Meaning | Action |
|---|---|---|
| Evidenced | a bullet or credential on this resume shows it | none |
| Have, not shown | evidenced in the corpus, not in this selection | generation pulls it in |
| **Listed only** | named in the skills list, but no bullet or credential demonstrates it | asked as a question |
| No evidence | nowhere at all | asked as a question |

Two bugs found by testing and fixed: certifications were invisible to coverage (it read bullet text only, and a certification has no bullets, so ECBA was reported as a gap the user already held), and the skills list was being treated as evidence (Power BI showed "covered" while generation correctly refused to write a bullet for it — a listed skill is a claim, not evidence).

**Measured cost per session: ~$0.23** — $0.013 to analyse (JD only; the corpus is never sent) and $0.216 to generate. Above the $0.38 whole-session estimate in §4 overall, but generation alone is 3x the $0.07 I projected, because a rationale per bullet across ~37 candidates is output-heavy and output bills at 5x input.

*Known limitation:* keyword matching is lexical, so a bullet describing requirements gathering without using that phrase will not match it. The bias is deliberate — a false gap costs one extra question, a false "covered" silently drops a requirement.

### Phase 5 — Diff view
Structured bullet-level diff. Before panel shows removed content in red; after panel shows new or reworded content in yellow. Multi-source attribution when blending personas. Accept, discard, regenerate.

**Variant write-back (on accept only).** When a generation is accepted, every rewritten bullet is written back to the corpus as a `BulletVariant` carrying its provenance: which persona, which generation, which company/role/JD, and style tags. Only *accepted* generations write back — discarded phrasings must never enter the corpus, or the library fills with rejected text.

Dedup on write-back: normalized comparison (lowercase, punctuation-stripped) auto-collapses trivial restatements; near-duplicates are surfaced for manual merge rather than silently split.

Variants live on the **Bullet in the corpus**, tagged with `persona_id` — not partitioned per persona. The same accomplishment gets rewritten under several personas, and the point is to see all of those phrasings side by side in one place.

**Done when:** every generation is reviewable line by line before it is kept, and accepting one enriches the corpus.

### Phase 6 — Editing surfaces
Three surfaces, all writing to the same JSON:

1. **Direct manipulation** — inline text edit, drag to reorder, toggle bullets and sections. Zero LLM.
2. **Targeted edit** — per bullet: "make this more technical", "quantify this", "cut to one line". About $0.01 per call.
3. **Edit chat** — free-form, for when the desired change is not yet known.

**Cost boundary (important):** the edit chat carries *only* the current resume JSON plus the JD (about 3k tokens, roughly $0.04 per turn). It loads the corpus only when the request needs new material. Getting this boundary right is worth more than any amount of prompt tuning.

**Done when:** the preview screen supports all three, and every LLM edit lands in the Phase 5 review flow.

### Phase 7 — Application archive + variant library
Save JD + generated resume + **gap-fill Q&A** + company / role / date / status as one unit. Optional per generation. Browsable and reopenable for interview prep.

*The Q&A is included deliberately — it records how the experience was framed for that specific company, which is what actually gets rehearsed.*

**Variant library UI** (the browsing half of the Phase 5 write-back; lands here because click-through needs the archive to exist):

- A bullet in the corpus shows its canonical text with a version count.
- **Expand** reveals every recorded phrasing — imported and generated — with its style tags.
- **Hover** a variant shows where it came from: *"Business Analyst — Deloitte, Mar 2026."*
- **Click** opens that saved application: the JD, the full resume sent, and the Q&A.

**Done when:** an interview call can be prepped from a single archived record, and any bullet can be traced through every version of itself back to the application it was written for.

**Why this matters beyond browsing:** the variant library becomes retrieval material for future generations. Tailoring a new BA role, the generator can draw on phrasings already written and accepted for BA roles instead of inventing from scratch — cheaper, and far more consistent with the user's own voice than a fresh rewrite each time. The corpus gets richer with every application.

### Phase 8 — GitHub sync
A "Sync GitHub" button, **repo-level, not commit-level**. Pulls the repo list plus README, languages, structure, and commit range; one call per repo produces a draft project entry that lands in a **review queue**. Nothing auto-writes to the corpus. Read-only token in env.

**Cost:** about $0.65 for ~20 repos, one time; pennies for incremental re-syncs.

**Why not continuous:** auto-sync on every push is both the most expensive and the lowest-quality option — most commits are `wip` or `fix typo` and would pollute the corpus with noise that then has to be cleaned up.

**Scope note:** GitHub only sees pushed code. It cannot see internships, BA/strategy/PM work, or business metrics — most of what actually carries these personas. It supplements the projects section; it is not the corpus engine. Hence Phase 8, not Phase 2.

### Phase 9+ — Later
Target rules wired into suggestions; ATS and keyword-match scoring; DOCX export; multiple visual templates; in-app LaTeX or Typst compilation; JD-from-URL browser extension; full version history and rollback per persona.

---

## 4. Cost model

Infrastructure: **$0** (Vercel Hobby + Neon free tier).

The Claude API is the only real cost. Per million tokens: Opus 5 is $5 in / $25 out; Sonnet 5 is $2 / $10; Haiku 4.5 is $1 / $5.

| Operation | Estimate (Opus 5) |
|---|---|
| Import one resume | ~$0.10 (measured) |
| GitHub sync, ~20 repos (one time) | ~$0.65 |
| Full tailoring session (~35k in / 8k out) | ~$0.38 |
| Targeted single-bullet edit | ~$0.01 |
| Edit-chat turn | ~$0.04 |
| **~40 applications per month** | **~$15/mo** |

Cost levers, in order of impact:

1. **Keep the corpus out of the edit-chat context** (architecture, Phase 6).
2. **Prompt-cache the corpus** — it is the large stable prefix of every tailoring request.
3. **Hardcode what needs no judgment** — gap comparison, diffing, page-fit, reordering, and rendering are all pure code.
4. **Drop mechanical steps to Haiku** (keyword extraction) only after measuring. Generation stays on Opus 5, where quality is the product.

---

## 5. Open questions

- **JD collection.** How many JDs per persona to seed the keyword vocabulary, and are they gathered up front or accumulated as applications happen? *(Needed by Phase 4, not before.)*
- **DOCX export priority**, given the current workflow is Word-based. *(Phase 9 candidate.)*

*Resolved 2026-09-06: GPA, degree name, SAKSHI dates, and contact email — see **Canonical values**. Job titles confirmed immutable across personas. Persona list confirmed as four; page budget confirmed as one page for all.*

**No open questions block Phase 0.**
