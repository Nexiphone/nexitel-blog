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
      if (!existsSync(IMAGES_DIR)) mkdirSync(IMAGES_DIR, { recursive: true });
      writeFileSync(join(IMAGES_DIR, `${slug}.jpg`), buf);
      ledger.set(slug, String(p.id));
      writeLedger(ledger);
      return `/images/blog/${slug}.jpg`;
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
  for (const locale of ["en", "zh", "es"]) {
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

const TOPIC_GENERATION_PROMPT = `Generate 2 fresh, unique SEO blog post topics about Nexitel prepaid wireless plans, TARGETED AT ONE OF THESE COUNTRIES per post:

🇮🇳 India  |  🇨🇳 China  |  🇹🇼 Taiwan  |  🇦🇪 UAE/Dubai  |  🇪🇬 Egypt

The 2 topics should target 2 DIFFERENT countries (e.g., one India + one China, or one Dubai + one Egypt).

DO NOT pick any of these existing topics (filenames):
${existingSlugs.join("\n")}

GOOD TOPIC EXAMPLES (don't reuse exact phrasing — generate fresh variations):

INDIA-focused:
- "Best USA SIM card for Indian students arriving on F-1 visa"
- "Cheap calls from USA to India: NexiTalk vs WhatsApp vs Skype"
- "Sending Airtel/Jio recharge to family in India from USA"
- "Best prepaid plan for H1B workers from India in the USA"
- "Indian newlyweds moving to USA: setting up phones together"
- "Tourist from India to USA: airport SIM vs Nexitel prepaid"

CHINA-focused:
- "Best USA prepaid SIM for Chinese international students"
- "How to keep your China number alive while studying in USA"
- "Top-up China Mobile/Unicom/Telecom from USA with Nexi Volt"
- "Cheap calls from USA to China when WeChat won't connect"

TAIWAN-focused:
- "USA prepaid SIM card for Taiwanese students and immigrants"
- "Best plan to call Taiwan (中華電信) from USA cheaply"
- "Taiwanese tourist visiting USA: prepaid SIM guide"

UAE/DUBAI-focused:
- "Dubai resident traveling to USA: prepaid SIM before you land"
- "Best USA prepaid SIM for Emirati students and businesspeople"
- "Calling Dubai from USA: NexiTalk vs international roaming"
- "Sending du/Etisalat recharge to UAE family from USA"

EGYPT-focused:
- "Best USA prepaid SIM for new Egyptian immigrants"
- "Send Vodafone Egypt recharge from USA: complete guide"
- "Egyptian students in USA: cheapest plan to call home"
- "Tourist from Egypt to USA: prepaid SIM vs international roaming"

Return ONLY a JSON array (no markdown, no commentary) like this:
[
  {
    "slug": "kebab-case-slug-here-2026",
    "title": "Title in English",
    "description": "SEO meta description, 150-160 chars",
    "category": "Guide" | "Plans" | "Technology" | "Travel",
    "image": "filename-from-list.jpg",
    "photoQuery": "2-4 word stock-photo search query",
    "targetCountry": "India" | "China" | "Taiwan" | "UAE" | "Egypt"
  },
  { ... }
]

"photoQuery" must describe the post's main HUMAN SUBJECT or scenario as a photographer would shoot it (e.g. "indian student campus", "warehouse worker scanning", "family video call"). NEVER use abstract telecom words like "prepaid", "plan", "SIM", "5G", "coverage" — those don't photograph well. It drives a real, unique cover photo per post.

Pick TWO DIFFERENT target countries for the two posts.`;

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

  for (const topic of topics) {
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
    for (const locale of ["en", "zh", "es"]) {
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
  }

  console.log(`\nDone. Created ${topics.length * 3} files for ${topics.length} posts.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
