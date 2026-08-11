# Social automation — Facebook + Instagram (image posts & posters)

Two daily GitHub Actions post **real images** to the Nexitel Facebook Page **and**
Instagram via the Meta Graph API. Each platform is independent: a platform is
only attempted if its secret is set, and one failing never blocks the other.

This is separate from (and runs alongside) the existing Telegram / Facebook
link-post / LinkedIn automations.

| Job | Workflow | Script | What it posts | Cron (UTC) |
| --- | --- | --- | --- | --- |
| Blog share | `daily-social.yml` | `scripts/generate-social-post.mjs` | Newest blog post's **cover image** + an AI caption + link | `15 14 * * *` |
| Daily poster | `daily-poster.yml` | `scripts/generate-poster.mjs` | A branded **1080×1350 poster** (AI wireless tip + QR → nexitel.us) | `15 17 * * *` |

- The poster dedups headlines via `content/poster-history.json` (committed back after each run).
- The poster's render deps (`satori`, `@resvg/resvg-js`, `qrcode`) install at workflow runtime — the repo has no lockfile.
- Local previews: `npm run poster:generate -- --dry-run --mock` (no API key) → `scripts/.preview-poster.png`; `npm run social:post -- --dry-run` (needs `ANTHROPIC_API_KEY`).

## Required GitHub secrets

| Secret | Used by | Notes |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | both | already set |
| `META_ACCESS_TOKEN` | both | permanent **Page** token that ALSO has Instagram permissions |
| `META_PAGE_ID` | both | the Nexitel Facebook Page ID |
| `META_IG_USER_ID` | both | the Instagram **Business** account ID linked to that Page |
| `IMGBB_API_KEY` | poster only | free image host (https://api.imgbb.com) — IG needs a public image URL |
| `PEXELS_API_KEY` | poster only | OPTIONAL — adds a matching photo header; otherwise a brand gradient |

> To post to Instagram ONLY (skip the 2nd Facebook post per day), just leave
> `META_PAGE_ID` unset on these two workflows — Facebook posting is skipped and
> the existing FB link-post automation is untouched.

## One-time Meta setup

Instagram publishing requires: (1) an Instagram **Business** account linked to
the Facebook Page, and (2) a token with `instagram_basic` +
`instagram_content_publish` (plus `pages_show_list`, `pages_read_engagement`,
`pages_manage_posts`, `business_management`). The standard "Other → Business"
app type is the one that exposes the Instagram permissions.

1. **Instagram Business account** — in Meta Business Suite, create/convert an IG
   account to **Business** and **link it to the Nexitel Facebook Page**.
2. **App** — reuse an existing Business-type Meta app, or create one via
   *Create App → "Other" → Business*.
3. **Token** — in Graph API Explorer, select the app, add the six permissions
   above, generate a **User token** authorizing the Nexitel Page + IG account.
4. Exchange it for a long-lived token, then derive the **permanent Page token**
   (the maintainer does this step) and store it as `META_ACCESS_TOKEN`.
5. Set `META_PAGE_ID`, `META_IG_USER_ID`, and `IMGBB_API_KEY`.

## Test

GitHub → **Actions** → pick the workflow → **Run workflow** → set `dry_run: true`
first (renders/builds without posting), then run for real.
