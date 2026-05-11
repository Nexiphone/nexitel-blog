# Social automation — Facebook

Auto-posts one blog entry daily at 13:32 UTC and one promo daily at 21:32 UTC to the business Facebook Page, rotating EN/ZH/ES.

- Blog script: [scripts/post-blog-to-facebook.mjs](scripts/post-blog-to-facebook.mjs)
- Promo script: [scripts/post-promo-to-facebook.mjs](scripts/post-promo-to-facebook.mjs)
- Blog workflow: [.github/workflows/daily-facebook-blog.yml](.github/workflows/daily-facebook-blog.yml)
- Promo workflow: [.github/workflows/daily-facebook-promo.yml](.github/workflows/daily-facebook-promo.yml)
- State files (auto-committed by CI): [scripts/fb-blog-log.json](scripts/fb-blog-log.json), [scripts/fb-promo-log.json](scripts/fb-promo-log.json)

## One-time setup (~20 minutes)

The Facebook side is more involved than Telegram because Meta's developer flow has multiple steps. Done once, then forget — page access tokens derived this way **never expire**.

### Step 1 — Register Meta developer account

1. Go to **https://developers.facebook.com**
2. Click **Get Started** (top-right). Uses your existing Facebook login.
3. Accept the developer terms. You're done — no application or approval needed.

### Step 2 — Create a Facebook App

1. From the Apps dashboard, click **Create App**.
2. Choose app type: **Business**.
3. App name: `Nexitel Auto-Poster` (or any name). Contact email: your address.
4. Click **Create App**. You may need to re-enter your password.
5. Once created, go to **App settings → Basic**. Copy and save these somewhere temporary (you'll use them in step 4, then can discard):
   - **App ID** (numeric, public)
   - **App Secret** — click **Show** and confirm with your password. Treat like a password.

### Step 3 — Generate a short-lived user access token

1. Go to **https://developers.facebook.com/tools/explorer**
2. Top-right dropdown: select your app (Nexitel Auto-Poster).
3. Below it, click **Get Token** → **Get User Access Token**.
4. In the permissions modal, check:
   - `pages_show_list`
   - `pages_manage_posts`
   - `pages_read_engagement`
5. Click **Generate Access Token**. A Facebook popup appears — confirm you want to grant these permissions to your app.
6. Copy the **Access Token** that appears at the top of the Graph API Explorer. This is short-lived (~1-2 hours).

### Step 4 — Exchange for a long-lived user token

Open Terminal and run (substitute `{APP_ID}`, `{APP_SECRET}`, `{SHORT_TOKEN}`):

```sh
curl "https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id={APP_ID}&client_secret={APP_SECRET}&fb_exchange_token={SHORT_TOKEN}"
```

Response:
```json
{
  "access_token": "EAA...long-lived-user-token...",
  "token_type": "bearer",
  "expires_in": 5183999
}
```

That `access_token` is your long-lived user token (60-day lifetime). Copy it.

### Step 5 — Get the never-expiring Page Access Token

```sh
curl "https://graph.facebook.com/v21.0/me/accounts?access_token={LONG_LIVED_USER_TOKEN}"
```

Response:
```json
{
  "data": [
    {
      "id": "1234567890",
      "name": "Nexitel",
      "access_token": "EAA...page-token...",
      "category": "Telecommunication Company",
      "tasks": ["CREATE_CONTENT", "MODERATE", "..."]
    }
  ]
}
```

For your Nexitel page, copy:
- `id` → **this is your `FB_PAGE_ID`**
- `access_token` → **this is your `FB_PAGE_ACCESS_TOKEN`** (does not expire)

### Step 6 — Verify the token has no expiry (optional but recommended)

```sh
curl "https://graph.facebook.com/v21.0/debug_token?input_token={PAGE_TOKEN}&access_token={PAGE_TOKEN}"
```

Look for `"expires_at": 0` in the response — that means never expires. If it's a real timestamp, something went wrong; redo step 4–5 ensuring you used the **long-lived** user token.

### Step 7 — Add GitHub Secrets

In GitHub: **Settings → Secrets and variables → Actions → New repository secret**. Add:

| Name | Value |
| --- | --- |
| `FB_PAGE_ID` | the numeric Page ID from step 5 |
| `FB_PAGE_ACCESS_TOKEN` | the page access token from step 5 |

### Step 8 — Test the workflow

In GitHub: **Actions → Daily Facebook blog post → Run workflow → main → Run workflow**.

Wait ~30 seconds, refresh the run, and check your Facebook Page. The next-oldest English blog entry should appear with its hero image. A follow-up commit lands on `main` updating `scripts/fb-blog-log.json`.

Then trigger **Daily Facebook promo post** — the seed promo posts in English with its CTA link.

After that, the cron fires automatically: blog daily at **13:32 UTC**, promo daily at **21:32 UTC**, alternating language each day.

## How language rotation works

Each workflow reads `next_locale` from its log file, posts in that language, then advances to the next. Sequence: `en → zh → es → en → ...`.

Blog and promo rotate independently — so day 1 might be EN blog + EN promo, day 2 ZH blog + ZH promo, etc. (They start in lockstep because both seed files default to `next_locale: en`, but if one workflow fails on a given day, they'll drift — by design.)

## How blog rotation works within a locale

Within a locale, the script picks the **oldest unposted** blog entry by frontmatter `date`. State in `scripts/fb-blog-log.json` under `posted.{locale}` accumulates slugs forever — same approach as the Telegram pipeline.

When a locale's backlog runs out, the script logs a warning and advances `next_locale` anyway (so it doesn't deadlock). Time to add new content, or revisit the strategy (e.g. re-share oldest posts after 90 days).

## How promo rotation works

Active = today is between `start_date` and `end_date` (both optional in promo frontmatter). Among active promos, the script picks the one with the **oldest `last_posted` timestamp** in `scripts/fb-promo-log.json`. Never-posted = epoch, so brand-new promos fire first.

Ties broken by `priority` (desc), then `id` (asc).

## Image handling

- **Blog posts**: frontmatter has `image: /images/blog/foo.jpg`. The script reads `public/images/blog/foo.jpg` and uploads via multipart to FB's `/photos` endpoint. If the file is missing, falls back to a `/feed` link post (FB scrapes OpenGraph tags from the destination URL).
- **Promos**: frontmatter has `image: foo.jpg` (no leading slash). Script reads `public/promos/foo.jpg`. Same fallback behavior.
- Either path works — there's no required image, but image posts get vastly better FB engagement than link posts.

## Running locally

```sh
export FB_PAGE_ID=...
export FB_PAGE_ACCESS_TOKEN=...
export BLOG_BASE_URL=https://nexitel-blog.vercel.app   # optional override

npm run post:fb-blog
# or
npm run post:fb-promo
```

This is the same code CI runs. Running locally will mutate `scripts/fb-{blog,promo}-log.json` and post to your live FB Page — revert the log file locally before committing if you don't want those slugs marked as sent.

## Recovery — if posts stop appearing

Most likely cause: the page access token was invalidated (FB does this occasionally on password changes, app changes, or perceived abuse). Symptom: GitHub Actions runs fail with a `FB /photos failed (4xx)` error mentioning `OAuthException`.

Fix:
1. Repeat Steps 3 → 4 → 5 above to mint a new page token.
2. Update the `FB_PAGE_ACCESS_TOKEN` secret in GitHub Settings → Secrets and variables → Actions (edit, paste new value, save).
3. Re-trigger the failed workflow from the Actions tab.

No code changes needed.

## Adjusting the schedule

Edit the `cron:` line in either workflow file. UTC, standard 5-field cron syntax. Examples:

- `32 13 * * *` — daily at 13:32 UTC (current blog)
- `32 21 * * *` — daily at 21:32 UTC (current promo)
- `32 14 * * 1-5` — weekdays at 14:32 UTC
- `32 */6 * * *` — every 6 hours at :32
