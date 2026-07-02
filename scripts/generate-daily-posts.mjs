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
import { readdirSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { publishPostToDb } from "./lib/publish-db.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const POSTS_DIR = join(ROOT, "posts");

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("ERROR: ANTHROPIC_API_KEY not set");
  process.exit(1);
}

const client = new Anthropic({ apiKey });

const AVAILABLE_IMAGES = [
  "5g-coverage.jpg", "att-mvno.jpg", "avoid-overpaying.jpg", "best-prepaid-sim.jpg",
  "carrier-suspend.jpg", "cheapest-unlimited.jpg", "data-iot.jpg", "esim-activation.jpg",
  "esim-vs-sim.jpg", "hidden-fees.jpg", "international-roaming.jpg", "international-travel.jpg",
  "nexi-volt-recharge.jpg", "nexitalk-voip.jpg", "no-contract.jpg", "prepaid-vs-postpaid.jpg",
  "seniors.jpg", "small-business.jpg", "switch-prepaid.jpg", "tmobile-5g.jpg",
  "tourist-usa.jpg", "wifi-calling.jpg",
];

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
- Nexitel Blue Plans — AT&T network, from $10/mo. Link: https://nexitel.us/blue-plans
- Nexitel Purple Plans — T-Mobile network, from $6/mo. Link: https://nexitel.us/purple-plans
- All plans page: https://nexitel.us/plans
- NexiTalk VoIP — international calling from $4.99/mo. Link: https://nexitel.us/nexi-talk
- Nexi Volt — global mobile recharge/top-up service. Link: https://nexitel.us/nexi-volt

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
- Link to nexitel.us/plans, nexitel.us/blue-plans, nexitel.us/purple-plans, nexi-talk, nexi-volt
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
    "targetCountry": "India" | "China" | "Taiwan" | "UAE" | "Egypt"
  },
  { ... }
]

Available images: ${AVAILABLE_IMAGES.join(", ")}
Pick TWO DIFFERENT images for the two posts.
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
image: "/images/blog/${topic.image}"
---

Then the body: ~80-110 lines of markdown, starting with H2. Use H2/H3, bullets, numbered lists. Link to nexitel.us/plans, nexitel.us/blue-plans, nexitel.us/purple-plans. Mention NexiTalk and Nexi Volt where relevant. End with a strong CTA. No "Contact Us" section.

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
    // Collect each locale's MDX so we can mirror the post to the DB after the
    // files are on disk.
    const perLocale = {};
    for (const locale of ["en", "zh", "es"]) {
      console.log(`Writing ${locale}/${topic.slug}.mdx`);
      const content = await generatePost(topic, locale);
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
