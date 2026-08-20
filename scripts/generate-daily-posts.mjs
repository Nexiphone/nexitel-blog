#!/usr/bin/env node
/**
 * Daily blog post generator using the Anthropic API.
 *
 * Generates 2 fresh SEO blog posts about Nexitel Blue/Purple plans in EN/ZH/ES
 * (6 files total) and writes them to posts/{en,zh,es}/.
 *
 * Required env: ANTHROPIC_API_KEY
 *
 * Usage: node scripts/generate-daily-posts.mjs
 */

import Anthropic from "@anthropic-ai/sdk";
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { publishPostToDb } from "./lib/publish-db.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const POSTS_DIR = join(ROOT, "posts");
const IMAGES_DIR = join(ROOT, "public", "images", "blog");

/**
 * Ledger of Pexels photo IDs already used as a cover, committed to the repo so
 * it survives between CI runs.
 *
 * Without it every run asked Pexels for a query and took photos[0], which meant
 * two posts on related topics got byte-identical covers. That is how the blog
 * ended up with 224 posts sharing 22 images.
 */
const PHOTO_LEDGER = join(__dirname, "used-photo-ids.json");

// English + Chinese only. Spanish was dropped for new posts: none of the dealer
// markets speak it, and the existing Spanish posts stay published untouched.
const LOCALES = ["en", "zh"];

function readLedger() {
  try {
    const raw = JSON.parse(readFileSync(PHOTO_LEDGER, "utf8"));
    return new Map(Object.entries(raw));
  } catch {
    return new Map();
  }
}

function writeLedger(ledger) {
  const obj = Object.fromEntries([...ledger.entries()].sort());
  writeFileSync(PHOTO_LEDGER, JSON.stringify(obj, null, 2) + "\n");
}

/**
 * Publish the cover to Supabase Storage and return its public URL.
 *
 * nexitel.us serves images from its own public/ directory, which this repo
 * cannot write to - so a cover saved only here would render as a broken image
 * on the live site. Storage is the one place both sites can read, and the
 * generator already holds the credentials for it, so no new token is needed.
 *
 * Returns null on any failure; the caller then skips the post rather than
 * shipping it with a cover the site cannot load.
 */
async function uploadCover(slug, buf) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn("  SUPABASE_URL / SERVICE_ROLE_KEY not set - cannot publish cover");
    return null;
  }
  try {
    const db = createClient(url, key, { auth: { persistSession: false } });
    const path = `${slug}.jpg`;
    const { error } = await db.storage
      .from("blog-images")
      .upload(path, buf, { contentType: "image/jpeg", upsert: true });
    if (error) {
      console.warn(`  storage upload failed: ${error.message}`);
      return null;
    }
    return db.storage.from("blog-images").getPublicUrl(path).data.publicUrl;
  } catch (err) {
    console.warn(`  storage upload threw: ${err.message}`);
    return null;
  }
}

/** sha1 of every cover already on disk, so a repeat cannot slip through. */
function hashesOfExistingImages() {
  const out = new Set();
  if (!existsSync(IMAGES_DIR)) return out;
  for (const name of readdirSync(IMAGES_DIR)) {
    if (!/\.(jpg|jpeg|png|webp)$/i.test(name)) continue;
    try {
      out.add(createHash("sha1").update(readFileSync(join(IMAGES_DIR, name))).digest("hex"));
    } catch {}
  }
  return out;
}

/**
 * Fetch an UNUSED on-topic landscape photo and save it as <slug>.jpg.
 *
 * Returns null when no key, no query, no unused result, or any failure. The
 * caller must then SKIP the post: there is deliberately no static fallback
 * pool, because falling back is precisely what produced the duplicates.
 */
async function fetchAndSaveImage(slug, query) {
  const key = process.env.PEXELS_API_KEY;
  if (!key || !query) return null;
  const ledger = readLedger();
  const used = new Set(ledger.values());
  try {
    // per_page=30 (not 15) so there is room to skip past already-used photos.
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=30&orientation=landscape`,
      { headers: { Authorization: key } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const photos = Array.isArray(data.photos) ? data.photos : [];
    // Two independent guards, because the ID ledger alone is not enough: the
    // one-off backfill that gave the existing posts their covers never recorded
    // its photo IDs, so the ledger cannot know about them. Hashing the bytes
    // catches a duplicate whatever its ID says.
    const existingHashes = hashesOfExistingImages();
    for (const p of photos) {
      if (used.has(String(p.id))) continue;
      const src = p.src?.landscape || p.src?.large2x || p.src?.large;
      if (!src) continue;
      const imgRes = await fetch(src);
      if (!imgRes.ok) continue;
      const buf = Buffer.from(await imgRes.arrayBuffer());
      const hash = createHash("sha1").update(buf).digest("hex");
      if (existingHashes.has(hash)) {
        console.warn(`  candidate is byte-identical to an existing cover - trying the next`);
        continue;
      }
      // Keep a copy in the repo (it is what the hash guard reads on the next
      // run) AND publish it where the live site can actually fetch it.
      if (!existsSync(IMAGES_DIR)) mkdirSync(IMAGES_DIR, { recursive: true });
      writeFileSync(join(IMAGES_DIR, `${slug}.jpg`), buf);
      const publicUrl = await uploadCover(slug, buf);
      if (!publicUrl) return null;
      ledger.set(slug, String(p.id));
      writeLedger(ledger);
      return publicUrl;
    }
    console.warn(`  no UNUSED photo for "${query}" - skipping rather than repeating`);
    return null;
  } catch {
    return null;
  }
}

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("ERROR: ANTHROPIC_API_KEY not set");
  process.exit(1);
}

const client = new Anthropic({ apiKey });


const today = new Date().toISOString().split("T")[0];

// Get list of existing slugs to avoid duplicates
function getExistingSlugs() {
  const slugs = new Set();
  for (const locale of LOCALES) {
    const dir = join(POSTS_DIR, locale);
    if (existsSync(dir)) {
      for (const file of readdirSync(dir)) {
        if (file.endsWith(".mdx") || file.endsWith(".md")) {
          slugs.add(file.replace(/\.mdx?$/, ""));
        }
      }
    }
  }
  return [...slugs].sort();
}

const existingSlugs = getExistingSlugs();
console.log(`Found ${existingSlugs.length} existing posts.`);

const SYSTEM_PROMPT = `You are an SEO content writer for Nexitel, a US prepaid wireless carrier targeting specific international audiences.

Nexitel offers:
- Nexitel Blue Plans — AT&T network, from $10/mo. Link: https://www.nexitel.us/plans
- Nexitel Purple Plans — T-Mobile network, from $6/mo. Link: https://www.nexitel.us/plans
- All plans page: https://www.nexitel.us/plans
- NexiTalk VoIP — international calling from $4.99/mo. Link: https://www.nexitel.us/nexitalk
- Nexi Volt — global mobile recharge/top-up service. Mention by name only, do NOT link it.

TARGET AUDIENCES (PRIORITY ORDER):
1. 🇮🇳 INDIANS — students on F-1 visa, H1B workers, tourists, immigrants, families connecting between USA & India. Mention Jio/Airtel/Vi top-ups, calls to India, USIE/H1B/L1 situations.
2. 🇨🇳 CHINESE — international students, recent immigrants, visitors. Mention China Mobile/China Unicom/China Telecom recharge, WeChat alternatives, calling family in China.
3. 🇹🇼 TAIWANESE — students, immigrants, tourists. Mention Chunghwa Telecom (中華電信), Taiwan Mobile, cross-strait communication.
4. 🇦🇪 UAE/DUBAI RESIDENTS — Emirati nationals and expats visiting/moving to USA, sending money to family. Mention du/Etisalat top-ups, Dubai-to-USA travel SIM needs.
5. 🇪🇬 EGYPTIANS — diaspora in USA, students, tourists, families. Mention Vodafone Egypt/Orange Egypt/WE recharges, calling Egypt cheaply.

Write helpful, informative posts that solve REAL problems these audiences face. Each post should:
- Mention specific carrier names in the target country (Jio, China Mobile, Vodafone Egypt, Etisalat, Chunghwa)
- Include specific scenarios (F-1 visa arrival, H1B worker, summer trip home, sending money home)
- Heavily feature Nexitel Blue or Purple plans (or both)
- Be ~80-110 lines of markdown content
- Start with an H2 heading (NOT H1)
- Use H2/H3 for structure
- Include bullet points and numbered lists
- Link to https://www.nexitel.us/plans and https://www.nexitel.us/nexitalk (these are the only valid link targets — never invent other paths)
- End with a strong CTA
- NOT include any "Contact Us" section (handled by the layout)
- Be informative and helpful, not salesy`;

const TOPIC_GENERATION_PROMPT = `Generate 2 candidate SEO blog post topics for Nexitel, a US prepaid wireless carrier. Only ONE will be published — the second is a spare in case the first cannot be produced.

Nexitel sells to two audiences, and BOTH are business-critical:
1. DEALERS AND DISTRIBUTORS, mostly outside the US, who buy prepaid SIMs and eSIMs in bulk and resell them.
2. END USERS in the US who activate a line on nexitel.us.

Products: Nexitel Blue runs on the AT&T network. Nexitel Purple runs on the T-Mobile network. Both nationwide 5G, prepaid, no contract, no credit check. Physical SIM and eSIM. Plans from $5/month. Several Blue plans include calling to 100+ countries.

PICK THE TOPIC FROM ONE OF THESE CLUSTERS. These are the only areas with demonstrated search demand — do not invent others:

- BULK / DEALER: buying US SIMs in bulk, becoming a US carrier distributor, bulk activation, eSIM at volume, supplying US numbers to businesses abroad
- PLANS AND PRICING: comparing Blue vs Purple, cheapest US prepaid plans, what $5-$35 a month actually buys, prepaid vs postpaid
- PORTING / SWITCHING: keeping your number when switching, porting from another carrier, what happens to your old plan
- ROAMING AND INTERNATIONAL: using a US number abroad, Wi-Fi calling overseas, international calling included in a plan, avoiding roaming charges
- ESIM: activation, eSIM vs physical SIM, dual SIM, provisioning devices
- IOT / M2M: data-only plans, fleet tracking, connected devices

HARD RULES:
- Write for someone deciding whether to BUY or RESELL, not for a general reader.
- NO nationality-plus-occupation topics. Nothing shaped like "Indian student", "Filipino nurse", "Taiwanese researcher". That pattern produced hundreds of near-identical posts Google refused to index, and every one has been unpublished.
- NO posts about sending mobile recharge home, remittances, or NexiTalk. Different products.
- NEVER promise a specific price, allowance or minimum order beyond the ranges above. Pricing, margins and order minimums are never published.
- AT&T and T-Mobile may be named in plain text as the underlying networks. Never imply partnership or endorsement.
- The topic must be answerable concretely. Prefer a real question a buyer types into Google over a broad theme.

DO NOT pick any of these existing topics (filenames):
${existingSlugs.join("\n")}

GOOD EXAMPLES of the shape wanted (generate fresh ones, do not reuse these):
- "How many SIMs do you need to start reselling US prepaid?"
- "Blue or Purple: which Nexitel network covers your area better"
- "What happens to your old number when you port to prepaid"
- "Does Wi-Fi calling work on a US number overseas?"
- "eSIM vs physical SIM for a bulk deployment"
- "What a $15 US prepaid plan actually includes in 2026"

Return ONLY a JSON array (no markdown, no commentary):
[
  {
    "slug": "kebab-case-slug-here-2026",
    "title": "Title in English, under 60 characters",
    "description": "SEO meta description, 150-160 chars",
    "category": "Guide" | "Plans" | "Technology" | "Comparison",
    "photoQuery": "2-4 word stock-photo search query",
    "cluster": "bulk" | "plans" | "porting" | "roaming" | "esim" | "iot"
  },
  { ... }
]

"photoQuery" must describe a photographable SCENE, not the subject matter — e.g. "warehouse worker scanning", "small shop counter", "person checking phone outdoors". NEVER abstract telecom words like "prepaid", "plan", "SIM", "5G", "coverage"; they do not photograph and produce generic stock. It drives a unique cover photo per post.

The 2 candidates must come from DIFFERENT clusters.`;

async function generateTopics() {
  const message = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: TOPIC_GENERATION_PROMPT }],
  });
  const text = message.content[0].text.trim();
  // Extract JSON if wrapped in code blocks
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error(`Could not parse topics JSON: ${text}`);
  return JSON.parse(jsonMatch[0]);
}

async function generatePost(topic, locale) {
  const localeNames = { en: "English", zh: "Chinese (Simplified)", es: "Spanish" };
  const authors = { en: "Nexitel Team", zh: "Nexitel 团队", es: "Equipo Nexitel" };

  const countryContext = topic.targetCountry
    ? `TARGET COUNTRY: ${topic.targetCountry}. Write specifically for readers from/in ${topic.targetCountry}. Reference local carriers, currencies, visa situations, common immigration paths, family connections, and pain points relevant to ${topic.targetCountry}. Use phrases and examples a ${topic.targetCountry} reader would recognize.`
    : "";

  const prompt = `Write a complete blog post in ${localeNames[locale]} for the following topic:

Title: ${topic.title}
Slug: ${topic.slug}
Description: ${topic.description}
Category: ${topic.category}
Date: ${today}
${countryContext}

For ${locale === "en" ? "English" : locale === "zh" ? "Chinese" : "Spanish"}, write the title and description naturally in that language (don't just translate word-for-word — adapt culturally for the target country audience). Use the title and description in the frontmatter in the target language.

Output the COMPLETE MDX file content (frontmatter + body). Frontmatter format:
---
title: "<title in ${localeNames[locale]}>"
description: "<description in ${localeNames[locale]}, 150-160 chars>"
date: "${today}"
category: "${topic.category}"
author: "${authors[locale]}"
image: "PLACEHOLDER"   # overwritten with the fetched cover path
---

Then the body: ~80-110 lines of markdown, starting with H2. Use H2/H3, bullets, numbered lists. Link to https://www.nexitel.us/plans and https://www.nexitel.us/nexitalk only. Mention NexiTalk and Nexi Volt by name where relevant, but do not link Nexi Volt. End with a strong CTA. No "Contact Us" section.

Output ONLY the file content, nothing else.`;

  const message = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });
  return message.content[0].text.trim();
}

async function main() {
  console.log(`Generating posts for ${today}...`);

  const topics = await generateTopics();
  console.log("Generated topics:", topics.map((t) => t.slug));

  // ONE post per run. The model returns two candidates so that a topic whose
  // cover cannot be sourced does not cost the whole run - the second is a
  // spare, not a second publication. Two runs a week is the cadence; the old
  // daily-times-three-locales pace is what produced the corpus Google refused
  // to index.
  let published = 0;
  for (const topic of topics) {
    if (published >= 1) break;
    // Every post gets its OWN photo or it does not ship. There is no shared
    // fallback pool any more: a skipped post costs one slot, a repeated cover
    // costs the whole set its credibility as original content.
    const imagePath = await fetchAndSaveImage(topic.slug, topic.photoQuery || topic.title);
    if (!imagePath) {
      console.warn(`SKIP ${topic.slug}: no unique cover image available.`);
      continue;
    }
    console.log(`Image for ${topic.slug}: ${imagePath}`);

    // Collect each locale's MDX so we can mirror the post to the DB after the
    // files are on disk.
    const perLocale = {};
    for (const locale of LOCALES) {
      console.log(`Writing ${locale}/${topic.slug}.mdx`);
      let content = await generatePost(topic, locale);
      // Force the frontmatter image to the resolved path so every locale shares
      // the same cover and the LLM can't drift from the chosen photo.
      content = content.replace(/^image:\s*.*$/m, `image: "${imagePath}"`);
      const dir = join(POSTS_DIR, locale);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${topic.slug}.mdx`), content + "\n", "utf8");
      perLocale[locale] = content;
    }

    // Files are written (the source of truth). Now mirror to Supabase.
    // A DB failure must NEVER break the .mdx/git flow — log and continue.
    try {
      await publishPostToDb(topic.slug, perLocale);
    } catch (err) {
      console.error(
        `DB publish failed for ${topic.slug} (continuing):`,
        err?.message ?? err,
      );
    }

    published++;
    console.log(`Published ${topic.slug} (cluster: ${topic.cluster ?? "n/a"})`);
  }

  if (published === 0) {
    console.warn("No post published this run - no candidate had a usable cover.");
  }

  console.log(`\nDone. Created ${topics.length * 3} files for ${topics.length} posts.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
