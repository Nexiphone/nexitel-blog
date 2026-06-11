#!/usr/bin/env node
/**
 * Generates one social media post per run from the newest blog article and
 * publishes it to a Facebook Page and/or Instagram via the Meta Graph API.
 *
 * It picks the newest *published* English post under posts/en/ (date <= today),
 * asks the Claude API to write a short caption with hashtags + a link to the
 * article, and reuses the post's cover photo (served publicly from the live
 * blog) as the image. Posting to each platform is independent: a platform is
 * only attempted if its env vars are present, and a failure on one platform
 * does not stop the other.
 *
 * Zero runtime dependencies (uses only Node built-ins + a tiny inline
 * frontmatter parser) so the workflow needs no `npm install`.
 *
 * Env:
 *   ANTHROPIC_API_KEY   (required) — writes the caption
 *   CLAUDE_MODEL        (optional, default claude-sonnet-4-6)
 *   SITE_BASE           (optional, default https://blog.nexitel.us)
 *   META_ACCESS_TOKEN   (required to post) — long-lived/permanent Page token
 *   META_PAGE_ID        (optional) — Facebook Page ID; enables Facebook posting
 *   META_IG_USER_ID     (optional) — Instagram Business account ID; enables Instagram
 *   META_GRAPH_VERSION  (optional, default v21.0)
 *
 * Usage:
 *   node scripts/generate-social-post.mjs            # post the newest article
 *   node scripts/generate-social-post.mjs --dry-run  # write caption, do not post
 *   node scripts/generate-social-post.mjs --slug=foo # target a specific post slug
 */
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const postsDir = path.join(root, "posts", "en");

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("ANTHROPIC_API_KEY is not set. Add it as a GitHub Actions secret.");
  process.exit(1);
}
const model = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
const siteBase = (process.env.SITE_BASE || "https://blog.nexitel.us").replace(/\/+$/, "");
const graphVersion = process.env.META_GRAPH_VERSION || "v21.0";

const dryRun = process.argv.includes("--dry-run");
const slugArg = process.argv.find((a) => a.startsWith("--slug="))?.split("=")[1];

const today = new Date().toISOString().slice(0, 10);

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found in model output.");
  return JSON.parse(candidate.slice(start, end + 1));
}

/** Minimal YAML frontmatter parser — handles the flat key: "value" pairs our posts use. */
function parseFrontmatter(raw) {
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv) continue;
    let val = kv[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[kv[1]] = val;
  }
  return out;
}

/** Load every EN post and return the one for --slug, else the newest published. */
async function pickPost() {
  const files = (await readdir(postsDir)).filter((f) => /\.(mdx|md)$/.test(f));
  if (!files.length) throw new Error("No blog posts found to share.");
  const posts = [];
  for (const f of files) {
    const raw = await readFile(path.join(postsDir, f), "utf8");
    const data = parseFrontmatter(raw);
    posts.push({
      slug: f.replace(/\.(mdx|md)$/, ""),
      title: String(data.title || ""),
      excerpt: String(data.description || ""),
      category: String(data.category || "Wireless"),
      date: String(data.date || ""),
      image: String(data.image || ""),
    });
  }
  if (slugArg) {
    const match = posts.find((p) => p.slug === slugArg);
    if (!match) throw new Error(`No post found for slug "${slugArg}".`);
    return match;
  }
  const published = posts.filter((p) => p.date && p.date <= today);
  const pool = published.length ? published : posts;
  pool.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return pool[0];
}

async function writeCaption(post) {
  const articleUrl = `${siteBase}/en/blog/${post.slug}`;
  const system =
    "You write short, helpful social media captions for Nexitel (nexitel.us) — an " +
    "affordable prepaid wireless / SIM service in the USA with no contracts: cheap " +
    "unlimited talk & text, nationwide 5G coverage on major networks, eSIM and physical " +
    "SIM, number transfer, and plans for families, travelers, immigrants and budget users. " +
    "Captions are clear, friendly, money-saving in tone, emoji-light, and never spammy. " +
    "You ALWAYS respond with a single valid JSON object and nothing else.";

  const prompt = `Write one social media caption promoting this Nexitel blog article.

Article title: ${post.title}
Article hook: ${post.excerpt}
Category: ${post.category}

Requirements:
- 1-3 short sentences, helpful and engaging, that make people want to read the article.
- A natural call to action to read more (the link is added separately, do NOT include a URL in the caption text).
- 3-6 tasteful, relevant hashtags (always include #Nexitel; add prepaid/wireless tags and #USA).
- A couple of fitting emojis, but don't overdo it.
- Total length well under 600 characters so it fits every platform.

Return ONLY a JSON object with EXACTLY these fields:
{
  "caption": "the caption text WITHOUT hashtags and WITHOUT any URL",
  "hashtags": ["#Nexitel", "#..."]
}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1000,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Claude API error ${res.status}: ${body}`);
  }
  const data = await res.json();
  const text = (data.content || []).map((b) => b.text || "").join("");
  const out = extractJson(text);

  const hashtags = (Array.isArray(out.hashtags) ? out.hashtags : [])
    .map((h) => (h.startsWith("#") ? h : `#${h}`))
    .slice(0, 8);
  const caption = (out.caption || "").trim();
  const full = `${caption}\n\nRead more: ${articleUrl}\n\n${hashtags.join(" ")}`.trim();
  return { full, articleUrl };
}

async function graph(pathPart, params) {
  const url = `https://graph.facebook.com/${graphVersion}/${pathPart}`;
  const res = await fetch(url, { method: "POST", body: new URLSearchParams(params) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(`Graph API ${res.status}: ${data.error?.message || JSON.stringify(data)}`);
  }
  return data;
}

async function postToFacebook(token, pageId, imageUrl, message) {
  const data = await graph(`${pageId}/photos`, { url: imageUrl, caption: message, access_token: token });
  return data.post_id || data.id;
}

async function igWaitReady(token, creationId) {
  // Poll the container until Instagram finishes processing the image, so
  // media_publish doesn't 400 with "Media ID is not available".
  for (let i = 0; i < 12; i++) {
    const res = await fetch(
      `https://graph.facebook.com/${graphVersion}/${creationId}?fields=status_code&access_token=${encodeURIComponent(token)}`,
    );
    const data = await res.json().catch(() => ({}));
    if (data.status_code === "FINISHED") return;
    if (data.status_code === "ERROR" || data.status_code === "EXPIRED") {
      throw new Error(`Instagram container ${data.status_code}`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
}

async function postToInstagram(token, igUserId, imageUrl, caption) {
  const container = await graph(`${igUserId}/media`, { image_url: imageUrl, caption, access_token: token });
  if (!container.id) throw new Error("Instagram: no creation id returned.");
  await igWaitReady(token, container.id);
  // Publish, retrying briefly if the container is still settling.
  for (let attempt = 0; ; attempt++) {
    try {
      const published = await graph(`${igUserId}/media_publish`, { creation_id: container.id, access_token: token });
      return published.id;
    } catch (e) {
      if (attempt < 3 && /not available|Media ID|not ready/i.test(e.message)) {
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      throw e;
    }
  }
}

/**
 * Posting to a Facebook Page requires a PAGE access token. If META_ACCESS_TOKEN
 * is a (long-lived) USER token, ask the Page for its own access_token and use
 * that. If it is already a Page token this returns it unchanged.
 */
async function resolvePageToken(token, pageId) {
  try {
    const res = await fetch(
      `https://graph.facebook.com/${graphVersion}/${pageId}?fields=access_token&access_token=${encodeURIComponent(token)}`,
    );
    const data = await res.json().catch(() => ({}));
    if (res.ok && !data.error && data.access_token) {
      console.log("Using derived Page access token for posting.");
      return data.access_token;
    }
  } catch {
    /* fall back to the provided token */
  }
  return token;
}

async function main() {
  const post = await pickPost();
  const imageUrl = post.image ? `${siteBase}${post.image.startsWith("/") ? "" : "/"}${post.image}` : "";
  if (!/^https:\/\//.test(imageUrl)) {
    throw new Error(`Post "${post.title}" has no public https cover image to share.`);
  }

  const { full, articleUrl } = await writeCaption(post);
  console.log(`\nSharing: "${post.title}"`);
  console.log(`Link:    ${articleUrl}`);
  console.log(`Image:   ${imageUrl}`);
  console.log(`\n--- caption ---\n${full}\n---------------\n`);

  if (dryRun) {
    console.log("--dry-run: not posting to any platform.");
    return;
  }

  const token = process.env.META_ACCESS_TOKEN;
  const pageId = process.env.META_PAGE_ID;
  const igUserId = process.env.META_IG_USER_ID;

  if (!token || (!pageId && !igUserId)) {
    console.error("Nothing to post to. Set META_ACCESS_TOKEN plus META_PAGE_ID and/or META_IG_USER_ID.");
    process.exit(1);
  }

  const postToken = pageId ? await resolvePageToken(token, pageId) : token;

  const results = [];
  if (pageId) {
    try {
      const id = await postToFacebook(postToken, pageId, imageUrl, full);
      console.log(`✓ Facebook posted (${id})`);
      results.push(true);
    } catch (err) {
      console.error(`✗ Facebook failed: ${err.message}`);
      results.push(false);
    }
  }
  if (igUserId) {
    try {
      const id = await postToInstagram(postToken, igUserId, imageUrl, full);
      console.log(`✓ Instagram posted (${id})`);
      results.push(true);
    } catch (err) {
      console.error(`✗ Instagram failed: ${err.message}`);
      results.push(false);
    }
  }

  if (!results.some(Boolean)) throw new Error("All configured platforms failed to post.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
