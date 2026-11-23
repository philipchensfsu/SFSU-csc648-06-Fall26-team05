# Nautilus Discord bot (feature 04)

A small `discord.py` bot that lets people check Nautilus from Discord. It's a thin client of the backend's
bot routes (Vineela's #169–#172): every answer comes from Nautilus, as the person who ran the command, with
their own permissions and AI allowance. The bot stores nothing.

This is a Discord bot, not an MCP server. Whether it also covers the assignment's "MCP investigation/proof of
concept" is a separate question for the team.

## Commands

All replies are **ephemeral** (only the person who ran the command sees them), and every command is deferred
first, so slow answers don't hit Discord's 3-second limit.

| Command | Backend route | What it shows |
|---|---|---|
| `/link code:` | `POST /api/bot/link` | Links your Discord account using a code from Nautilus Settings > Connect Discord |
| `/me` | `GET /api/bot/me` | Which Nautilus account and organization you're linked to |
| `/prds [search] [view]` | `GET /api/bot/prds` | Up to 10 PRDs you can see, newest change first, with their ids |
| `/prd id:` | `GET /api/bot/prds/{id}` | Status, review progress, owners and your role |
| `/inbox [all]` | `GET /api/bot/inbox` | Your notifications (unread only unless `all`) |
| `/summary id: [version]` | `POST /api/bot/prds/{id}/summary` | AI summary of that version's review comments. Uses **your** AI allowance |

Every request sends `X-Bot-Secret` (the shared secret) and `X-Discord-User-Id`, which is always the id of the
Discord user who ran the command, from the interaction (never from what they typed). Text from Nautilus is
escaped, and replies are sent with mentions off, so a PRD title can't ping `@everyone`.

## Configuration

Set these in the environment, in a local `.env` (git-ignored; see `.env.example`), or in Railway's Variables.
Never commit them or paste them into chat.

| Variable | What |
|---|---|
| `DISCORD_BOT_TOKEN` | The bot's token from the Discord Developer Portal. Secret. |
| `NAUTILUS_API_URL` | `https://csc648-team05.vercel.app`, or `http://localhost:8000` locally |
| `BOT_API_SECRET` | The same value as the backend's `BOT_API_SECRET`. Secret. |
| `BOT_REQUEST_TIMEOUT_SECONDS` / `BOT_SUMMARY_TIMEOUT_SECONDS` | Optional (20 / 290) |

Logs show the command name and outcome only (for example `command=summary status=429 code=ai_cooldown`), never
tokens, the secret, link codes, search text or PRD content.

## Running locally (against the local stack)

The backend needs the bot routes (#169–#172; until they merge, run a branch that has them).

```bash
# 1. Backend: the local stack, with the bot settings compose.yaml sets in #171
supabase db reset && docker compose up        # BOT_API_SECRET=local-bot-secret locally

# 2. Bot, in another terminal
cd app/discord-bot
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env                          # then fill in DISCORD_BOT_TOKEN and BOT_API_SECRET
set -a && . ./.env && set +a
python -m nautilus_bot check                  # checks the configuration without connecting
python -m nautilus_bot sync --guild <server id>   # one-off: registers the 6 commands in your test server
python -m nautilus_bot                        # runs the bot (Ctrl+C to stop)
```

Running the bot never changes the registered commands. `sync` is a separate step, and `--guild` (one server,
instant) is preferred over `--global` (every server, slow to appear).

## Tests

```bash
python -m pytest            # offline: fake Discord interactions and a fake HTTP backend
ruff check .
```

`tests/test_local_backend.py` runs the real client against a local backend with the bot routes. It's skipped
unless `BOT_LOCAL_BACKEND=1` (see its docstring). It uses the local seed accounts and AI off, so it never calls
Gemini.

## Deploying on Railway

One long-running worker, built from this folder's `Dockerfile`. There's no web port or public domain.

- **Source:** the repo belongs to another GitHub account, so connecting it may need the owner to grant
  Railway's GitHub app access. The alternative is the Railway CLI from this folder: `railway up` uploads and
  builds it.
- **Service settings:**
  - root directory `app/discord-bot` if deployed from GitHub;
  - restart policy On Failure;
  - one replica (the default; run only one instance, or each command is answered twice);
  - no public networking.
- **Variables:** `DISCORD_BOT_TOKEN`, `BOT_API_SECRET` and `NAUTILUS_API_URL`. Mark the two secrets as sealed.
- **Before the bot is useful**, the backend needs the bot routes deployed and `BOT_API_SECRET` plus
  `SUPABASE_JWT_SECRET` set on Vercel. Otherwise commands answer "isn't set up" (503) or "not found".
- **Reconnects:** discord.py reconnects by itself after network drops, and Railway restarts the process if it
  exits.

Stopping it: remove the service's active deployment in Railway (or delete the service). The bot goes offline and
commands show "The application did not respond" until it's back.
