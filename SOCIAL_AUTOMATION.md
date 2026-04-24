# Social automation — Telegram

This repo auto-posts one blog entry per language per day to three Telegram channels via a GitHub Actions cron.

- Script: [scripts/post-to-telegram.mjs](scripts/post-to-telegram.mjs)
- Workflow: [.github/workflows/daily-telegram-post.yml](.github/workflows/daily-telegram-post.yml)
- State: [scripts/posted-log.json](scripts/posted-log.json) (committed back after each run)

## One-time setup

### 1. Create the Telegram bot

1. Open Telegram and message [@BotFather](https://t.me/BotFather).
2. Send `/newbot`.
3. Pick a display name (e.g. `Nexitel Blog`) and a unique username ending in `bot` (e.g. `nexitel_blog_bot`).
4. Save the **bot token** BotFather gives you — it looks like `1234567890:AAEx…`. Treat it like a password.

### 2. Create three public channels

Create one channel per language. Suggested usernames:

- `@nexitel_en` — English
- `@nexitel_zh` — Chinese
- `@nexitel_es` — Spanish

In Telegram: **New Channel → Public → pick a username**. Set the description and avatar as you like.

### 3. Add the bot as admin to each channel

In each channel:

1. Channel name → **Administrators** → **Add Administrator**
2. Search for your bot's username, select it.
3. Enable **Post Messages** (other permissions can stay off).
4. Save.

### 4. Add the secrets to GitHub

In GitHub: **Settings → Secrets and variables → Actions → New repository secret**. Add four secrets:

| Name | Value |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | token from step 1 |
| `TELEGRAM_CHAT_ID_EN` | `@nexitel_en` (or your EN channel username) |
| `TELEGRAM_CHAT_ID_ZH` | `@nexitel_zh` |
| `TELEGRAM_CHAT_ID_ES` | `@nexitel_es` |

Optional: if your blog isn't served from `https://nexitel.com`, add a repository **variable** (not secret) named `BLOG_BASE_URL` under **Settings → Secrets and variables → Actions → Variables** with the correct base URL (no trailing slash).

### 5. Trigger a test run

- GitHub → **Actions** tab → **Daily Telegram post** → **Run workflow**.
- Confirm a message lands in each channel.
- Confirm a commit appears on `main` updating `scripts/posted-log.json`.

After that, the cron fires daily at **13:17 UTC** (~9:17 AM Eastern).

## How it picks posts

For each locale (`en`, `zh`, `es`):

1. Read all `posts/{locale}/*.mdx`.
2. Skip slugs already listed in `scripts/posted-log.json[telegram][locale]`.
3. Pick the one with the **oldest** `date` in frontmatter and send it.
4. On success, append the slug to the log.

This drains the backlog chronologically so subscribers see a steady cadence of evergreen content, not just same-day re-posts. When the backlog is empty for a locale, the script logs a warning and moves on — time to add new content, or revisit the picker strategy.

## Running locally

```sh
export TELEGRAM_BOT_TOKEN=...
export TELEGRAM_CHAT_ID_EN=@nexitel_en
export TELEGRAM_CHAT_ID_ZH=@nexitel_zh
export TELEGRAM_CHAT_ID_ES=@nexitel_es
# Optional override:
# export BLOG_BASE_URL=https://preview.example.com

npm run post:telegram
```

This is the same code CI runs and will update `scripts/posted-log.json` locally — if you're testing, revert the log file before committing unless you actually want those slugs marked as sent.

## Adjusting the schedule

Edit the `cron:` line in [.github/workflows/daily-telegram-post.yml](.github/workflows/daily-telegram-post.yml). Cron is in UTC. Some references:

- `17 13 * * *` — 13:17 UTC daily (current)
- `17 14 * * 1-5` — weekdays at 14:17 UTC
- `17 */6 * * *` — every 6 hours at :17

## Adding other platforms later

The posted-log schema is intentionally namespaced by platform:

```json
{ "telegram": { "en": [...] }, "linkedin": { "en": [...] } }
```

A future `scripts/post-to-linkedin.mjs` can reuse the same pick-oldest-unposted logic under its own `linkedin` key without interfering with Telegram state.
