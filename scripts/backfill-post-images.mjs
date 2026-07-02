#!/usr/bin/env node
/**
 * Backfill unique, on-topic cover images for every blog post.
 *
 * Problem this solves: all posts drew from ~22 static images, so the same
 * boardroom / network-cable / padlock photos repeated dozens of times and
 * frequently didn't match the post. This gives each post its OWN photo,
 * chosen to match the post's real subject.
 *
 * For each unique slug:
 *   1. Ask Claude (batched, cheap) for a 2-4 word visual stock-photo query
 *      describing the post's human subject/scenario.
 *   2. Fetch a unique landscape photo from Pexels (deduping photo IDs so no
 *      two posts share an image).
 *   3. Save it to public/images/blog/<slug>.jpg.
 *   4. Rewrite the `image:` frontmatter line in every locale version.
 *
 * Env: PEXELS_API_KEY (required), ANTHROPIC_API_KEY (optional but recommended
 *      for good queries; falls back to a title heuristic if absent).
 *
 * Flags:
 *   --limit=N   only process the first N slugs (for a test run)
 *   --force     refetch even if public/images/blog/<slug>.jpg already exists
 *   --dry-run   log what would happen; fetch nothing, write nothing
 *
 * Usage: node scripts/backfill-post-images.mjs [--limit=6] [--force] [--dry-run]
 */

import matter from "gray-matter";
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const POSTS_DIR = join(ROOT, "posts");
const IMAGES_DIR = join(ROOT, "public", "images", "blog");
const LOCALES = ["en", "zh", "es"];

const args = process.argv.slice(2);
const LIMIT = (() => {
  const a = args.find((x) => x.startsWith("--limit="));
  return a ? parseInt(a.split("=")[1], 10) : Infinity;
})();
const FORCE = args.includes("--force");
const DRY_RUN = args.includes("--dry-run");

const PEXELS_KEY = process.env.PEXELS_API_KEY;
if (!PEXELS_KEY && !DRY_RUN) {
  console.error("ERROR: PEXELS_API_KEY not set");
  process.exit(1);
}
// Loaded lazily so the script runs (heuristic queries) without the SDK present.
async function getAnthropic() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  } catch {
    console.warn("  @anthropic-ai/sdk not installed; falling back to heuristic queries");
    return null;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Collect the canonical set of slugs (union across locales), with EN metadata. */
function collectPosts() {
  const bySlug = new Map();
  for (const locale of LOCALES) {
    const dir = join(POSTS_DIR, locale);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".mdx") && !file.endsWith(".md")) continue;
      const slug = file.replace(/\.mdx?$/, "");
      if (!bySlug.has(slug)) bySlug.set(slug, { slug, locales: [], meta: {} });
      const entry = bySlug.get(slug);
      entry.locales.push({ locale, file: join(dir, file) });
      // Prefer EN for metadata used to build the search query.
      if (locale === "en" || !entry.meta.title) {
        const { data } = matter(readFileSync(join(dir, file), "utf8"));
        if (locale === "en" || !entry.meta.title) {
          entry.meta = { title: data.title || "", category: data.category || "", description: data.description || "" };
        }
      }
    }
  }
  return [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

/** Heuristic query if the LLM is unavailable: pull the audience after "for". */
function heuristicQuery(meta, slug) {
  const t = meta.title || slug.replace(/-/g, " ");
  const clean = (s) =>
    s.replace(/&/g, "and")
      .replace(/[():.,"']/g, " ")
      .replace(/\b(19|20)\d{2}\b/g, " ") // drop years
      .replace(/\b(best|prepaid|phone|plan|plans|service|the|a|an|and|in|for|with|to|how|complete|guide|usa|us)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  // Prefer the audience named after "for".
  const m = t.match(/\bfor\s+(.+?)(?:\s+in\b|\s*[:–-]|\s+\d{4}|$)/i);
  const candidate = clean(m ? m[1] : t);
  const words = candidate.split(/\s+/).filter((w) => w.length > 1).slice(0, 4).join(" ");
  if (words.length >= 3) return words;
  // Nothing useful survived — fall back to category-flavored generic.
  const cat = (meta.category || "").toLowerCase();
  if (cat.includes("travel")) return "traveler with smartphone airport";
  if (cat.includes("security")) return "person protecting smartphone";
  return "person using smartphone";
}

/** Batched LLM query generation: slug -> short visual search phrase. */
async function generateQueries(posts) {
  const queries = new Map();
  const anthropic = await getAnthropic();
  if (!anthropic) {
    for (const p of posts) queries.set(p.slug, heuristicQuery(p.meta, p.slug));
    return queries;
  }
  const CHUNK = 20;
  for (let i = 0; i < posts.length; i += CHUNK) {
    const batch = posts.slice(i, i + CHUNK);
    const list = batch.map((p, j) => `${j + 1}. [${p.slug}] "${p.meta.title}" (category: ${p.meta.category})`).join("\n");
    const prompt = `For each blog post title below, produce a 2-4 word STOCK PHOTO search query that visually represents the post's main HUMAN SUBJECT, activity, or scenario — something a photographer could shoot.

Rules:
- Focus on the PERSON or SCENE (e.g. "warehouse worker scanning", "senior woman smartphone", "musician on tour", "family video call", "nurse with tablet", "dog walker park").
- NEVER use abstract telecom words like "prepaid", "plan", "SIM", "5G", "MVNO", "coverage", "data" — those don't photograph well.
- For country-targeted posts, you may include the nationality/place if it helps (e.g. "indian student campus", "dubai skyline traveler").
- Keep it concrete and photographable.

Return ONLY a JSON array like: [{"slug":"...","query":"..."}]

Posts:
${list}`;
    try {
      const msg = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      });
      const text = msg.content[0].text.trim();
      const json = JSON.parse(text.match(/\[[\s\S]*\]/)[0]);
      for (const item of json) {
        if (item.slug && item.query) queries.set(item.slug, String(item.query).trim());
      }
    } catch (err) {
      console.warn(`  query batch ${i}-${i + batch.length} failed (${err.message}); using heuristic`);
    }
    // Ensure every post in the batch has a query.
    for (const p of batch) if (!queries.has(p.slug)) queries.set(p.slug, heuristicQuery(p.meta, p.slug));
  }
  return queries;
}

const usedPhotoIds = new Set();

/** Fetch a unique landscape photo for a query; returns {id, src} or null. */
async function fetchUniquePhoto(query, variety) {
  const res = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=30&orientation=landscape`,
    { headers: { Authorization: PEXELS_KEY } },
  );
  if (!res.ok) return null;
  const data = await res.json();
  const photos = Array.isArray(data.photos) ? data.photos : [];
  if (!photos.length) return null;
  // Prefer a photo we haven't used anywhere yet.
  let photo = photos.find((p) => !usedPhotoIds.has(p.id));
  if (!photo) photo = photos[variety % photos.length]; // all used: rotate, better than a static repeat
  usedPhotoIds.add(photo.id);
  const src = photo.src?.landscape || photo.src?.large2x || photo.src?.large || photo.src?.original;
  return src ? { id: photo.id, src } : null;
}

/** Rewrite only the `image:` frontmatter line, preserving everything else. */
function setImagePath(file, imagePath) {
  const raw = readFileSync(file, "utf8");
  if (/^image:\s*.*$/m.test(raw)) {
    return raw.replace(/^image:\s*.*$/m, `image: "${imagePath}"`);
  }
  // No image line: insert it just before the closing frontmatter fence (2nd `---`).
  let seen = 0;
  return raw.replace(/^---\s*$/gm, (fence) => (++seen === 2 ? `image: "${imagePath}"\n---` : fence));
}

async function main() {
  const all = collectPosts();
  const posts = all.slice(0, LIMIT === Infinity ? all.length : LIMIT);
  console.log(`Backfilling images for ${posts.length} of ${all.length} posts${DRY_RUN ? " (DRY RUN)" : ""}...`);

  console.log("Generating search queries...");
  const queries = await generateQueries(posts);

  let done = 0, skipped = 0, failed = 0;
  for (const post of posts) {
    const query = queries.get(post.slug);
    const dest = join(IMAGES_DIR, `${post.slug}.jpg`);
    const imagePath = `/images/blog/${post.slug}.jpg`;

    if (existsSync(dest) && !FORCE) {
      // Image already fetched on a prior run — just ensure frontmatter points to it.
      if (!DRY_RUN) for (const { file } of post.locales) writeFileSync(file, setImagePath(file, imagePath), "utf8");
      console.log(`= ${post.slug} (image exists; pointer ensured)`);
      skipped++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`~ ${post.slug}  ->  query: "${query}"`);
      done++;
      continue;
    }

    try {
      const photo = await fetchUniquePhoto(query, done);
      if (!photo) throw new Error(`no Pexels result for "${query}"`);
      const imgRes = await fetch(photo.src);
      if (!imgRes.ok) throw new Error(`download ${imgRes.status}`);
      writeFileSync(dest, Buffer.from(await imgRes.arrayBuffer()));
      for (const { file } of post.locales) writeFileSync(file, setImagePath(file, imagePath), "utf8");
      console.log(`✓ ${post.slug}  ("${query}"  #${photo.id})  [${post.locales.length} locales]`);
      done++;
      await sleep(200); // be gentle with the Pexels rate limit
    } catch (err) {
      console.warn(`✗ ${post.slug}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone. fetched=${done} skipped=${skipped} failed=${failed} unique_photos=${usedPhotoIds.size}`);
  if (failed > 0 && done === 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
