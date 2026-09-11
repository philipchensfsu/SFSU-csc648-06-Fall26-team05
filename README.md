# SFSU-csc648-06-Fall26-team05

Team repository for CSC 648 – Section 06, Fall 2026, Team 5.
San Francisco State University

## Table of Contents
- [Project Overview](#project-overview)
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
[In Progress]

## Team Members

| Team Member       | GitHub Username  | Roles                          |
|--------------------|-------------------|----------------------------------|
| Aksh Patel         | AkshPatel63       | Front-End Lead, GitHub Co-Lead   |
| Giovannie Silva    | Gsilva-code       | AI Master                        |
| Leman Yuksel       | LemanYuksel       | Scrum Master                     |
| Marco Garcia       | MarcoGarcia650    | Back-End Lead                    |
| Om Pandya          | Atom3798          | Team Lead, AI Master              |
| Philip Chen        | philipchensfsu    | GitHub Master                    |
| Vineela Vandanapu  | whichcat          | Back-End Lead                    |

## Communication
Our team primarily communicates via **Slack**. All project-related discussions, updates, and questions are posted there.

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

### Required Software
- [Node.js](https://nodejs.org/) 18 or newer (with npm)
- [Python](https://www.python.org/) 3.11 or newer (with pip)
- Git

### Backend (FastAPI)
```
cd app/backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in your Supabase project URL + service_role key
uvicorn main:app --reload
```

### Frontend (Next.js)
```
cd app/frontend
cp .env.local.example .env.local   # fill in your Supabase project URL + anon key
npm install
npm run dev
```

Supabase credentials come from your project's **Settings > API** page. Never commit `.env` / `.env.local` files — they're covered by `.gitignore`.

## Database

We use **Supabase (PostgreSQL)** for auth and data storage. The schema is defined in
[`app/backend/schema.sql`](app/backend/schema.sql) and covers the core product flow for M0: a PM signs
in, submits product/feature context, and the app generates a PRD from it.

- **`profiles`** — one row per authenticated user (extends Supabase's built-in `auth.users`)
- **`prds`** — one row per generated Product Requirements Document, linked to the user who created it

Both tables have Row Level Security enabled so a user can only read/write their own rows. Multi-project
support, PRD versioning, and org/team features are intentionally out of scope for now.

To set up the schema on a fresh Supabase project: open **SQL Editor** in the Supabase dashboard, paste
the contents of `app/backend/schema.sql`, and run it.

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
- `main` — stable, production-ready code only
- Create a new branch for each task:
  - New features: `feature/[your-name]-[short-description]`
  - Bug fixes: `bugfix/[your-name]-[short-description]`
- Examples: `feature/philip-about-page`, `bugfix/philip-about-error`

## Pull Request & Merge Process
1. Push your feature branch to GitHub
2. Open a Pull Request into `main`
3. At least one teammate must review and approve the Pull Request before it can be merged
4. Resolve any merge conflicts before merging
5. Delete the feature branch after merging

## Tech Stack
- Frontend: Next.js / React, hosted on Vercel
- Backend: Python + FastAPI, deployed as Vercel serverless functions
- Database / Auth: Supabase
