# Local development

Run the whole app on your machine: Supabase (database, auth and Data API),
the FastAPI backend and the Vite frontend. Nothing here touches the hosted
database.

## 1. Install the tools (once)

| Tool | macOS | Windows | Linux |
|---|---|---|---|
| Git | `brew install git` or Xcode tools | in WSL: `sudo apt install git` | `sudo apt install git` |
| Docker Desktop | [docker.com](https://www.docker.com/products/docker-desktop/) | [docker.com](https://www.docker.com/products/docker-desktop/), with the WSL 2 backend | Docker Engine + Compose plugin |
| Supabase CLI | `brew install supabase/tap/supabase` | in WSL: see below | see below |

You don't need Python or Node on your machine: the backend and frontend run
in containers (Python 3.12, Node 22).

**Supabase CLI on Linux and WSL:** download the `.deb` (or `.tar.gz`) for your
CPU from the [CLI releases](https://github.com/supabase/cli/releases) and
install it, e.g. `sudo dpkg -i supabase_*_linux_amd64.deb`. Check with
`supabase --version`.

**Intel Macs:** use the Supabase tap above. It ships a prebuilt binary, while
Homebrew's core formulas build from source on Intel and are very slow.

### Windows

- Install WSL 2 (`wsl --install` in PowerShell as admin), then Ubuntu.
- In Docker Desktop, turn on **Settings > Resources > WSL integration** for Ubuntu.
- **Run every command in the Ubuntu (WSL) terminal**, and clone the repo
  inside WSL (e.g. `~/code`), not under `C:\`. Files under `C:\` are slow in
  containers and don't trigger live reload.
- If live reload still doesn't pick up edits, start with
  `DOCKER_POLLING=true docker compose up`.

## 2. Start everything

```
git clone git@github.com:philipchensfsu/SFSU-csc648-06-Fall26-team05.git
cd SFSU-csc648-06-Fall26-team05
supabase start        # first run downloads images (several minutes)
docker compose up     # backend on :8000, frontend on :5173
```

Open **http://localhost:5173** and sign in with a test account:

| Email | Password | Role |
|---|---|---|
| alice.pm@example.com | password1 | pm (projects and PRDs) |
| ben.pm@example.com | password2 | pm (one PRD) |
| erin.engineer@example.com | password3 | engineer |
| ada.admin@example.com | password4 | admin (legacy) |

These are test-only accounts from `supabase/seed.sql` and exist only locally.

Edits under `app/backend` and `app/frontend` reload automatically.

## 3. Everyday commands

| Task | Command |
|---|---|
| Stop the app | `Ctrl-C`, or `docker compose down` |
| Stop Supabase (keeps data) | `supabase stop` |
| Rebuild the DB from migrations + seed | `supabase db reset` |
| See URLs and keys | `supabase status` |
| Database UI (Supabase Studio) | http://127.0.0.1:54323 |
| Run backend tests | `docker compose exec backend python -m pytest -q` |
| Backend logs | `docker compose logs -f backend` |
| SQL shell | `docker exec -it supabase_db_nautilus psql -U postgres` |
| After changing requirements.txt or package.json | `docker compose up --build -V` |

## 4. Changing the database

Schema changes are migrations in `supabase/migrations/`, applied in
timestamp order:

1. Create a file named `<YYYYMMDDHHMMSS>_<what_it_does>.sql`, e.g. with
   `supabase migration new add_comments` in a terminal.
2. Write the SQL. Every new table needs RLS and explicit `grant`s.
3. Run `supabase db reset` and check the app.
4. Never edit a migration after it has merged; add a new one.

After pulling someone else's migrations, update your local database with
`supabase migration up` (keeps your data) or `supabase db reset` (rebuilds
from migrations + seed).

### Applying a migration to the hosted database

The **hosted** database is shared with production. Migrations reach it only
by hand, after the PR merges, and Marco coordinates it:

1. Run any pre-check queries listed in the migration's header.
2. Paste the migration file into the Supabase SQL Editor and run it.
3. Run the checks the PR lists for afterwards (e.g. `pg_policies`).
4. **Comment on the migration's PR**, for example: "Applied to production
   2026-10-30, pre-check 0 rows, pg_policies verified." The PR history is
   our record of which migrations the hosted database has.

Never run `supabase db push` or point local tools at the hosted project.
`20261028000000_baseline.sql` is the schema the hosted database already has:
it exists only so local databases can be built from scratch.

## 5. Running without Docker (optional)

Run Supabase with `supabase start` as above. Then:

```
# backend (Python 3.12)
cd app/backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements-dev.txt   # app + test tools
cp .env.example .env    # use the URL and keys from `supabase status`
uvicorn main:app --reload

# frontend (Node 22), in another terminal
cd app/frontend
cp .env.local.example .env.local   # URL + anon key from `supabase status`
npm install
npm run dev
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Cannot connect to the Docker daemon` / `connection refused` | Start Docker Desktop and wait until it's running |
| `supabase start` stops with a health-check error | Run `supabase stop`, then `supabase start` again; `[analytics]` is already off in `supabase/config.toml` |
| Port already in use (5173, 8000, 54321–54324) | Stop the other process, or another Supabase project (`supabase stop --project-id <name>`) |
| Backend `/api/health/db` returns 503 | Supabase isn't running: `supabase start` |
| Sign-in fails for test accounts | `supabase db reset` to reload the seed |
| Frontend shows old dependencies | `docker compose up --build -V` |

## Safety

- Local tools and tests must only ever point at `127.0.0.1`.
- The shared develop site (https://csc648-team05-develop.vercel.app) uses the
  **production** database: only use test accounts there and delete test data.
- The keys in `compose.yaml` and the passwords in `supabase/seed.sql` are
  public local defaults and test-only values, not real credentials. Never
  commit real keys, `.env` files or real passwords.
