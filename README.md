# Resume Optimizer

A web app that automates resume tailoring: store multiple resume variants, maintain a standing profile of preferences and experience, and generate a job-specific tailored resume from a company, role, and job description — with a before/after diff view showing exactly what changed.

## Why

Manually rewriting resume bullets for every application (and every time a project or role updates) is slow and repetitive. This app removes that manual loop while keeping bullets sharp and specific to each job.

## Status

Early planning stage. See [`docs/SPEC.md`](docs/SPEC.md) for the full product spec.

## Planned Feature Set

- **Resume variants** — save multiple resumes (e.g. TPM, Business Analyst, SWE) so you're never starting from scratch.
- **Dashboard**
  - *Customize Profile* — standing instructions/updates (new experience, tone preferences) that apply to all future resumes.
  - *Customize Rules* — list of target roles and companies, stored for analysis.
- **Tailor a Resume** — input company, role/job ID, job description, and optional one-off customization, then generate a tailored resume from one or more base variants.
- **Diff view** — see the source resume(s) and the generated resume side by side, with removed lines in red and new/changed lines in yellow.

## Repo Structure

```
resume-optimizer/
├── README.md          # this file
├── CLAUDE.md           # instructions for Claude Code when building this project
├── docs/
│   └── SPEC.md          # full product spec
├── frontend/            # web app UI (to be scaffolded)
└── backend/             # API / resume generation logic (to be scaffolded)
```

## Tech Stack

Not yet decided — to be chosen during the build (see "Open Questions" in `docs/SPEC.md`).
