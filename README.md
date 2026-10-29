# SFSU-csc648-06-Fall26-team05

Team repository for CSC 648 – Section 06, Fall 2026, Team 5.
San Francisco State University

## Table of Contents
- [Project Overview](#project-overview)
- [Milestones](#milestones)
- [Team Members](#team-members)
- [Communication](#communication)
- [Repository Structure](#repository-structure)
- [Initial Setup](#initial-setup)
- [Database](#database)
- [Deployment](#deployment)
- [Cloning the Repository](#cloning-the-repository)
- [Branching Strategy](#branching-strategy)
- [Pull Request & Merge Process](#pull-request--merge-process)
- [Tech Stack](#tech-stack)

## Project Overview
**Nautilus** is an AI-assisted web app that helps product managers, founders, and students write
Product Requirements Documents (PRDs). Users answer a short guided interview about their product idea,
and the app generates a structured PRD draft they can review, edit, and save.

## Milestones

| Milestone | Description | Status | Document |
|-----------|-------------|--------|----------|
| M0 | Team Formation & Tool Selection | ✅ Completed | [M0 Report](milestones/m0/CSC%20648-848%20M0%20section%206%20Team%205.docx) |
| M1 | User Stories & High-Level Requirements | ✅ Completed (submitted 9/29/2026) | [M1 Report](milestones/m1/CSC%20648-848%20M1%20section%206%20Team%205.pdf) |
| M2 | Architecture, UI Mockups & Vertical Prototype | ✅ Completed (submitted 10/20/2026) | [M2 Report](milestones/m2/CSC%20648-848%20M2%20section%206%20Team%205.pdf) |
| M3 | TBD | ⏳ Upcoming | |
| M4 | TBD | ⏳ Upcoming | |
| M5 | TBD | ⏳ Upcoming | |

## Team Members

Meet Our Team is on the public [About page](https://csc648-team05.vercel.app/about) at `/about`. The `/` route now shows the Nautilus landing page. You can also use the site's “About us” navigation link.

| Team Member       | GitHub Username  | Roles                          |
|--------------------|-------------------|----------------------------------|
| Aksh Patel         | AkshPatel63       | Front-End Lead, GitHub Co-Lead   |
| Giovannie Silva    | Gsilva-code       | AI Master                        |
| Leman Yuksel       | LemanYuksel       | Scrum Master                     |
| Marco Garcia       | MarcoGarcia650    | Back-End Lead                    |
| Om Pandya          | Atom3798          | Team Lead, AI Master             |
| Philip Chen        | philipchensfsu    | GitHub Master                    |
| Vineela Vandanapu  | whichcat          | Back-End Lead                    |

## Communication
Our team primarily communicates via **Discord**. All project-related discussions, updates, and questions are posted there.

## Repository Structure

```
SFSU-csc648-06-Fall26-team05/
│
├── milestones/       # Milestone deliverables and documentation
│   ├── m0/
│   ├── m1/
│   ├── m2/
│   ├── m3/
│   ├── m4/
│   └── m5/
│
└── app/              # Application source code
    ├── frontend/
    └── backend/
```

## Initial Setup

Everything runs locally in Docker: Supabase, the FastAPI backend and the Vite frontend.
You need **Git, Docker Desktop and the Supabase CLI** (no local Python or Node).

```
supabase start        # database, auth and Data API
docker compose up     # backend on :8000, frontend on :5173
```

Open http://localhost:5173 and sign in as `alice.pm@example.com` / `password1` (a local test account).

See **[docs/local-development.md](docs/local-development.md)** for installing the tools (including Windows),
test accounts, database migrations, running without Docker and troubleshooting.

## Database

We use **Supabase (PostgreSQL)** for auth and data storage. The schema is defined in
[`app/backend/schema.sql`](app/backend/schema.sql) and implements Data Definitions V2 (see the M2
report) for the full PRD-authoring flow: guided intake, AI generation, editing, versioning, and uploads.

- **`profile`** — one row per authenticated user (extends Supabase's built-in `auth.users`); carries the
  `pm` / `engineer` / `admin` role that drives access control
- **`project`** — an optional folder grouping PRDs
- **`prd`** — the primary document: content, editor state, status, and the currently active version
- **`intake_answer`** — one row per guided-wizard question answered for a PRD
- **`attachment`** — metadata for files uploaded to a PRD (the files themselves live in Supabase Storage)
- **`prd_context`** — the AI's durable per-PRD memory (decisions, constraints, running summary)
- **`source`** — citations/URLs attached to a PRD
- **`prd_version`** — snapshots for undo/version history, taken before every AI edit
- **`generation_record`** — an audit log of AI generation attempts (not chat memory)

All tables have Row Level Security enabled. Access follows the role table in the M2 report: PMs and
admins create/edit/delete their own projects and PRDs, engineers can view PRDs with status `final` or
`assigned`, and admins can see and manage everything. `project`/`prd` deletes cascade to their child
rows at the database level; Storage files do not cascade and must be cleaned up by the backend
separately.

To set up the schema on a fresh Supabase project: open **SQL Editor** in the Supabase dashboard, paste
the contents of `app/backend/schema.sql`, and run it. It's a single idempotent-ish script — safe to
re-run if no real data exists yet, since it drops the old M0 placeholder tables (`profiles`/`prds`)
before creating the real ones.

**Demo data:** `app/backend/seed_demo.py` creates a demo PM account (`nautilus.demo@example.com`) and
seeds it with 3 projects and 10 PRDs, for the M2 vertical prototype's "list and search" requirement.
Run `python seed_demo.py` from `app/backend`. It's re-runnable and only replaces the demo account's own
data. Row Level Security only shows PMs their own PRDs, so reviewers sign in *as* the demo account. The
password isn't stored in the repo; it's shared in the milestone submission.

TA/instructor database access is granted directly in the Supabase project (Project Settings > Team).

## Deployment

The app is deployed on **Vercel** as a single project (`csc-648/csc648-team05`) combining the frontend
and backend:

- **Live site:** https://csc648-team05.vercel.app
- The Vite frontend builds as a static site; the FastAPI backend deploys as a Python serverless function
- Routing is defined in [`vercel.json`](vercel.json) at the repo root: requests to `/api/*` go to the
  backend, everything else is served by the frontend build
- Environment variables (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`) are set directly in the Vercel project settings, not committed to the repo
- Deploys are currently manual via the [Vercel CLI](https://vercel.com/docs/cli) (`vercel deploy --prod`)
  run from the repo root; auto-deploy on push requires connecting the GitHub repo in the Vercel
  dashboard (Project > Settings > Git)

## Cloning the Repository
```
git clone https://github.com/philipchensfsu/SFSU-csc648-06-Fall26-team05.git
cd SFSU-csc648-06-Fall26-team05
```

## Branching Strategy

For the full workflow (branch rules, who reviews what, and the release process), see the [Team 5 GitHub Workflow guide](.github/team5-github-workflow.pdf).

- `main` — stable, production-ready code; only updated from `develop` at milestones
- `develop` — default branch; all finished features merge here first
- Create a new branch from `develop` for each task:
  - New features: `feature/[your-name]-[short-description]`
  - Bug fixes: `bugfix/[your-name]-[short-description]`
- Examples: `feature/philip-about-page`, `bugfix/philip-about-error`

## Pull Request & Merge Process
1. Push your feature branch to GitHub
2. Open a Pull Request into `develop` (not `main`)
3. At least one teammate must review and approve the Pull Request before it can be merged
4. Resolve any merge conflicts before merging
5. The feature branch is deleted automatically after merging

## Tech Stack
- Frontend: React + Vite, hosted on Vercel
- Backend: Python + FastAPI, deployed as Vercel serverless functions
- Database / Auth: Supabase
