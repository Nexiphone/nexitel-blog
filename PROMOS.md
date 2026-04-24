# Promo authoring guide

Promos are the **second daily Telegram post** per channel. Blog posts fire at ~9 AM ET with evergreen content; promos fire at ~5 PM ET with a CTA (plan offers, time-limited deals, product launches, dealer/referral). The two pipelines are independent.

- Script: [scripts/post-promo-to-telegram.mjs](scripts/post-promo-to-telegram.mjs)
- Workflow: [.github/workflows/daily-promo-post.yml](.github/workflows/daily-promo-post.yml) (cron `17 21 * * *` UTC)
- State: [scripts/promo-log.json](scripts/promo-log.json) — `locale → id → last_posted_timestamp`. Committed back after each run.
- Content: `promos/{en,zh,es}/*.md`
- Images: `public/promos/*.{jpg,png,webp}` (optional per-promo)

## How to ask Claude to create a promo

In a Claude Code session in this repo, say something like:

> Make a promo for our $15 plan starting today, evergreen. Image is `plan-15-banner.jpg`.

or for a time-limited deal:

> Black Friday deal: 30% off the $25 plan, Nov 25 to Dec 2. Image `bf-2026.jpg`. Feature this heavily.

Claude will:

1. Draft all three language versions inline in chat as fenced code blocks.
2. Wait for approval ("ship it" / "approved" / "looks good").
3. Write `promos/en/{id}.md`, `promos/zh/{id}.md`, `promos/es/{id}.md`, commit, and push to `main`.

You still need to **drop the image file** into `public/promos/{filename}` yourself (Claude can't create images). If you approve a promo before the image exists, the script will skip that promo locale with a clear error on the next run — fix by either adding the image and re-running the workflow, or removing the `image:` field for text-only.

## Frontmatter schema

```yaml
---
id: 15-dollar-plan                        # required, kebab-case, must match across locales
type: plan                                # required: plan | deal | launch | referral
image: 15-dollar-plan.jpg                 # optional filename under public/promos/
cta_url: https://nexitel.com/en/plans     # optional; posted as a standalone link under the body
cta_text: View plans                      # optional label (reserved for future use)
start_date: 2026-04-23                    # optional ISO date, default = always active
end_date: 2026-12-31                      # optional ISO date; REQUIRED for type=deal
priority: 0                               # optional int, higher = prefer when rotating
---

Body: 2–4 short lines, emoji-friendly. Caption limit is 1024 chars with an image.

#Hashtag1 #Hashtag2
```

Rules to avoid duplicate links:
- **Either** put the URL in `cta_url:` **or** inline in the body — never both.
- Hashtags go at the end of the body.

## How rotation picks the next promo

Each day at 21:17 UTC, for each locale:

1. Filter to **active** promos (now between `start_date` and `end_date`; both optional).
2. Pick the one with the **oldest** `last_posted` timestamp (never-posted wins — new promos fire right away).
3. Tie-break by higher `priority`, then by alphabetical `id`.

If only one active promo exists for a locale, the workflow logs a warning and posts it anyway — add more promos to spread the rotation.

## Adding a time-limited deal

Use `type: deal` and **always** set `end_date`. The script stops showing the promo the day after `end_date` — no more "Black Friday" posts in March.

```yaml
---
id: black-friday-2026
type: deal
image: bf-2026.jpg
cta_url: https://nexitel.com/en/black-friday
start_date: 2026-11-25
end_date: 2026-12-02
priority: 10
---
🎉 Black Friday: 30% off the $25 plan.

No contract. Switch in 5 minutes.

Ends Dec 2.

#BlackFriday #Nexitel
```

## Running locally

```sh
export TELEGRAM_BOT_TOKEN=...
export TELEGRAM_CHAT_ID_EN=@nexitel_en
export TELEGRAM_CHAT_ID_ZH=@nexitel_zh
export TELEGRAM_CHAT_ID_ES=@nexitel_es

npm run post:promo
```

This writes to `scripts/promo-log.json` locally — revert the log before committing if you were just testing, otherwise those test sends will count toward rotation.

## Manually triggering a promo run

GitHub → **Actions** → **Daily promo post** → **Run workflow** → branch `main` → Run. Useful right after adding a new promo so you can see it land in channels without waiting for 21:17 UTC.

## Troubleshooting

- **"no active promos"** — none of your promos pass the `start_date`/`end_date` filter. Check dates.
- **"image referenced but not found on disk"** — the file under `public/promos/{filename}` is missing. Add it (and commit), or remove the `image:` line from the promo markdown for text-only.
- **Same promo posting twice in a row** — only one active promo exists in that locale. Author another one.
- **Changes to a promo's body aren't showing** — Telegram doesn't edit past messages. New wording only takes effect on the next rotation where this promo is picked.
