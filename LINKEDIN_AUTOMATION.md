# Social automation — LinkedIn

Auto-posts one blog entry at 13:47 UTC and one promo at 21:47 UTC daily to LinkedIn, rotating EN/ZH/ES.

The scripts support **two posting modes**:

1. **Personal profile** (via "Share on LinkedIn" product — Default Tier, auto-approved). Set `LI_PERSON_ID` secret. **This is the recommended starting point** because the product is approved instantly.
2. **Company Page** (via "Community Management API" — requires LinkedIn approval, often gated for new apps). Set `LI_ORGANIZATION_ID` secret.

Pick one, set the corresponding secret. The script auto-detects which mode based on which secret is present.

- Blog script: [scripts/post-blog-to-linkedin.mjs](scripts/post-blog-to-linkedin.mjs)
- Promo script: [scripts/post-promo-to-linkedin.mjs](scripts/post-promo-to-linkedin.mjs)
- Blog workflow: [.github/workflows/daily-linkedin-blog.yml](.github/workflows/daily-linkedin-blog.yml)
- Promo workflow: [.github/workflows/daily-linkedin-promo.yml](.github/workflows/daily-linkedin-promo.yml)
- State (auto-committed by CI): [scripts/li-blog-log.json](scripts/li-blog-log.json), [scripts/li-promo-log.json](scripts/li-promo-log.json)

## One-time setup (~15–20 min)

### Step 1 — Confirm LinkedIn Company Page admin access

Visit your Nexitel LinkedIn Company Page (e.g. `https://www.linkedin.com/company/nexitel`). You should see an admin badge / Page admin tools. If you don't, get added as Page admin before continuing.

### Step 2 — Create a LinkedIn Developer App

1. Go to **https://developer.linkedin.com/apps**
2. Click **Create app**
3. Fill in:
   - **App name**: `Nexitel Auto-Poster`
   - **LinkedIn Page**: pick **Nexitel** from the search (must be a page you admin)
   - **Privacy policy URL**: `https://nexitel.us/privacy` (any URL works for this form)
   - **App logo**: optional
4. Agree to terms → **Create app**

### Step 3 — Verify the Company Page on your app

On your new app's dashboard, look at the right sidebar. Next to the Nexitel page, there's a **Verify** link.

1. Click **Verify**
2. LinkedIn shows a verification URL — click it
3. It opens a confirmation page — click **Verify**
4. Back on the app dashboard, the page shows ✅ Verified

This step grants your app posting authority on the page.

### Step 4 — Request the right product

**For personal-profile posting (recommended starting path):**

1. On the app dashboard → **Products** tab
2. Find **Share on LinkedIn** (Default Tier) → click **Request access**
3. Agree to LinkedIn's terms → **auto-approved instantly**

**For Company Page posting (if Community Management API is available):**

1. **Products** tab → find **Community Management API**
2. If **Request access** is clickable, click it and agree. Often auto-approved for pages you admin.
3. If it's greyed out, LinkedIn has restricted this product for your app. Either fall back to personal-profile mode, or visit the [Access Request Form](https://linkedin.com/help/linkedin/answer/a1342443) — manual approval takes days/weeks.

### Step 5 — Generate an OAuth access token

LinkedIn requires the **Authorization Code flow** (no implicit/password grants). Easiest manual path:

1. On the app dashboard → **Auth** tab
2. Note your **Client ID** and **Client Secret** (top of page)
3. Under **OAuth 2.0 settings → Authorized redirect URLs**, add: `https://oauth.pstmn.io/v1/callback` (Postman's official OAuth helper)
4. Save changes

Then, in your browser address bar, paste this URL (replace `{CLIENT_ID}`):

**For personal-profile mode** (Share on LinkedIn — recommended):
```
https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id={CLIENT_ID}&redirect_uri=https://oauth.pstmn.io/v1/callback&scope=w_member_social%20openid%20profile
```

**For Company Page mode** (Community Management API):
```
https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id={CLIENT_ID}&redirect_uri=https://oauth.pstmn.io/v1/callback&scope=w_organization_social%20r_organization_admin
```

LinkedIn will ask you to log in and approve. After approval, you're redirected to Postman's callback page showing a `code` parameter in the URL.

Copy that `code` value (long string after `code=` and before `&`).

In Terminal (replace placeholders — don't share with me):

```sh
curl -X POST 'https://www.linkedin.com/oauth/v2/accessToken' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=authorization_code' \
  -d 'code={CODE_FROM_REDIRECT}' \
  -d 'redirect_uri=https://oauth.pstmn.io/v1/callback' \
  -d 'client_id={CLIENT_ID}' \
  -d 'client_secret={CLIENT_SECRET}'
```

Response:
```json
{
  "access_token": "AQX...",
  "expires_in": 5184000,
  "refresh_token": "AQX...",
  "refresh_token_expires_in": 31536000,
  "scope": "r_organization_admin,w_organization_social"
}
```

- `access_token` — valid 60 days
- `refresh_token` — valid 365 days (we don't use it in phase 1; will add auto-refresh later)

Copy the `access_token`.

### Step 6 — Find your Person ID or Organization ID

**For personal-profile mode** — fetch your Person ID:

```sh
curl -H 'Authorization: Bearer {ACCESS_TOKEN}' \
     'https://api.linkedin.com/v2/userinfo'
```

Response includes `"sub": "AbC123XyZ"` — that's your Person ID. Copy it.

**For Company Page mode** — fetch your Organization ID:

```sh
curl -H 'Authorization: Bearer {ACCESS_TOKEN}' \
     -H 'LinkedIn-Version: 202401' \
     -H 'X-Restli-Protocol-Version: 2.0.0' \
     'https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(organization~(id,localizedName)))'
```

Response includes one entry per page you admin. For Nexitel, copy the numeric `id` (e.g. `12345678`).

### Step 7 — Add GitHub Secrets

In GitHub: **Settings → Secrets and variables → Actions → New repository secret**. Add:

| Name | Value |
| --- | --- |
| `LI_ACCESS_TOKEN` | the access token from step 5 |
| `LI_PERSON_ID` *(personal mode)* | the Person ID from step 6 |
| `LI_ORGANIZATION_ID` *(Company Page mode)* | the numeric org ID from step 6 |

Set only **one** of `LI_PERSON_ID` / `LI_ORGANIZATION_ID` based on which mode you're using. The script auto-picks.

### Step 8 — Test the workflow

GitHub → **Actions** → **Daily LinkedIn blog post** → **Run workflow** → **main** → green button.

Wait ~30 seconds; check your LinkedIn Company Page. The next-oldest EN blog entry should appear as a post, with a preview card auto-generated from the blog URL's OpenGraph tags.

Then do the same for **Daily LinkedIn promo post**.

After both succeed, the cron takes over: blog daily at **13:47 UTC**, promo daily at **21:47 UTC**.

## Token expires every 60 days

The `LI_ACCESS_TOKEN` you create has a 60-day lifetime. When it expires:

1. Your CI runs will start failing with `LinkedIn API failed (401)` errors
2. GitHub Actions will email you about the failures

**To renew**, repeat steps 5–7 (just steps 5 and 7 — generate new token, update secret). Takes ~5 min.

Tip: set a calendar reminder 50 days from token generation so you renew before it breaks.

(Phase 2 of this automation will add auto-refresh via the `refresh_token`, which removes this manual step. Skipped for now to ship faster.)

## How content is selected

Same as the other platforms:
- **Blog**: oldest unposted entry by frontmatter `date` in the current locale; one entry per locale before rotating
- **Promo**: least-recently-posted active promo (within start_date/end_date window) in the current locale

Language rotates daily: `en → zh → es → en → ...`. Blog and promo rotate independently.

## Local testing

```sh
export LI_ACCESS_TOKEN=AQX...
export LI_ORGANIZATION_ID=12345678
export BLOG_BASE_URL=https://nexitel-blog.vercel.app   # optional

npm run post:li-blog
# or
npm run post:li-promo
```

This will post to your LIVE LinkedIn Company Page. Revert `scripts/li-{blog,promo}-log.json` locally before committing if you don't want those slugs marked sent.

## Recovery — if posts stop appearing

1. **Token expired** (most common): repeat token generation (steps 5–7 above).
2. **API version deprecated**: LinkedIn versions their API monthly. The scripts use `LinkedIn-Version: 202401`. If LinkedIn deprecates it (typically after 18 months), bump to the current version in [scripts/post-blog-to-linkedin.mjs](scripts/post-blog-to-linkedin.mjs) and [scripts/post-promo-to-linkedin.mjs](scripts/post-promo-to-linkedin.mjs) (search `LI_API_VERSION`).
3. **Org ID changed**: very rare. Re-run step 6 to get the new value.
