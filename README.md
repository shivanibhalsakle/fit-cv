# Resume Optimizer

A web app that automates resume tailoring: maintain one source of truth for every piece of work you've done, keep several role-specific personas as views over it, and generate a job-specific tailored resume from a company, role, and job description — with a before/after diff showing exactly what changed.

## Why

Manually rewriting bullets for every application (and every time a project or role updates) is slow and repetitive. This removes that loop while keeping bullets specific and truthful.

## Status

**Phases 0–4 complete** — scaffold, schema, database, auth, corpus CRUD, resume import, personas, one-page PDF rendering, and the tailoring engine. See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the full build plan and [`docs/SPEC.md`](docs/SPEC.md) for the product spec.

Next: Phase 5, the diff view (bullet-level red/yellow, accept/discard/regenerate).

## Core concepts

- **Corpus** — the source of truth. Every fact and bullet you own, far more than fits on any one resume. Editable and additive forever.
- **Persona** — a *view* over the corpus (Technical/SWE, Business Analyst, Strategy & Consulting, Project Management). A persona varies which bullets appear, how they're phrased, section order, skill grouping, and voice. It does **not** vary job titles, employers, or dates — those are immutable so resumes stay consistent with public profiles.
- **Bullet variant** — every way an accomplishment has been phrased, whether imported from an old resume or generated for a specific application. Accepted generations write back, so the corpus gets richer with each application.
- **Standing profile** vs **one-off customization** — the first persists across all future generations; the second is scoped to a single generation. Kept separate end to end.
- **Generation** → **diff** → **archive** — every tailored resume is reviewable bullet by bullet, then saved with its JD and gap-fill Q&A for interview prep.

## Stack

| | |
|---|---|
| App | Next.js 16 (App Router) + TypeScript + Tailwind 4 |
| Database | PostgreSQL + Prisma |
| Auth | Auth.js v5, GitHub OAuth locked to a single account |
| LLM | Claude API (`claude-opus-5`) |
| PDF | `@react-pdf/renderer` — preview and download from one component tree |
| Hosting | Vercel + Neon (both free tier) |

Resumes are stored as structured JSON, never as text blobs or PDFs. PDF is a render target generated on demand, which is what makes bullet-level diffing and page budgeting reliable.

## Getting started

**Prerequisites:** Node 22+, Docker Desktop (running), and a GitHub OAuth app.

```bash
npm install
cp .env.example .env   # then fill in the values below
npm run db:up          # start Postgres (requires Docker Desktop running)
npm run db:push        # create tables
npm run db:seed        # optional — load a starting corpus
npm run dev
```

Open http://localhost:3000.

### Environment variables

| Variable | How to get it |
|---|---|
| `DATABASE_URL` | Pre-filled for local Docker Postgres; no change needed |
| `AUTH_SECRET` | `npx auth secret` |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | [Create an OAuth app](https://github.com/settings/developers). Homepage `http://localhost:3000`, callback `http://localhost:3000/api/auth/callback/github` |
| `ALLOWED_GITHUB_LOGIN` | Your GitHub username — the only account permitted to sign in |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com/settings/keys). Prefer a key created *inside* a workspace, so spend limits apply |
| `ANTHROPIC_WORKSPACE_ID` | Only needed if the key is org-level rather than workspace-scoped |
| `GITHUB_TOKEN` | Read-only PAT (needed from Phase 8) |

`ALLOWED_GITHUB_LOGIN` **fails closed** — leaving it blank denies everyone rather than admitting any GitHub account.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run db:up` / `db:down` | Start / stop local Postgres |
| `npm run db:push` | Sync schema to the database (no migration files) |
| `npm run db:migrate` | Create and apply a migration |
| `npm run db:seed` | Load the starting corpus (idempotent — safe to re-run) |
| `npm run db:reset` | Drop everything, recreate, re-seed |
| `npm run db:studio` | Browse the database |
| `npm run lint` | ESLint |

## Repo structure

```
resume-optimizer/
├── app/                 # Next.js App Router — pages and API routes
│   ├── api/auth/        # Auth.js handlers
│   ├── corpus/          # source-of-truth CRUD (list, new, [id])
│   ├── api/personas/    # PDF and .tex render endpoints
│   ├── import/          # upload / paste -> merge review queue
│   ├── personas/        # persona list and editor with live preview
│   ├── tailor/          # JD -> keywords -> gaps -> Q&A -> generate
│   └── signin/
├── components/          # form and UI pieces
├── lib/
│   ├── actions/         # server actions
│   ├── auth.ts          # Auth.js config, single-user allowlist
│   ├── db.ts            # Prisma client singleton
│   ├── claude.ts        # Anthropic client, model choice, cost estimate
│   ├── dates.ts         # month-precision date handling
│   ├── extract.ts       # PDF / DOCX -> text (free, deterministic)
│   ├── generate.ts      # tailoring call; no-fabrication enforced by schema
│   ├── keywords.ts      # JD keyword extraction + coverage (mostly free)
│   ├── latex.ts         # resume doc -> .tex (no compiler bundled)
│   ├── merge.ts         # matching, dedup, conflict detection (no LLM)
│   ├── parse-resume.ts  # the single model call, structured outputs
│   ├── render-pdf.ts    # render + measure page count off the real file
│   ├── resume-doc.ts    # persona -> renderable structured document
│   ├── resume-pdf.tsx   # the PDF template
│   └── validation.ts    # Zod schemas
├── prisma/
│   ├── schema.prisma    # full data model
│   └── seed.ts          # canonical contact + starting corpus
├── README.md            # this file
├── docs/
│   ├── SPEC.md          # product spec
│   └── ROADMAP.md       # build plan, decisions, cost model
├── docker-compose.yml   # local Postgres
├── proxy.ts             # route gate (Next 16's middleware)
└── .env.example
```

## Security note

This app stores a complete personal work history. The repository is public; the data is not. `.env` is gitignored, the deployed app is gated to one GitHub account, and no resume content is ever committed.
