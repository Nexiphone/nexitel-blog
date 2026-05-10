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

const SYSTEM_PROMPT = `You are an SEO content writer for Nexitel, a US prepaid wireless carrier.

Nexitel offers:
- Nexitel Blue Plans — AT&T network, from $10/mo. Link: https://nexitel.us/blue-plans
- Nexitel Purple Plans — T-Mobile network, from $6/mo. Link: https://nexitel.us/purple-plans
- All plans page: https://nexitel.us/plans
- NexiTalk VoIP — international calling from $4.99/mo. Link: https://nexitel.us/nexi-talk
- Nexi Volt — global mobile recharge/top-up service. Link: https://nexitel.us/nexi-volt

Write helpful, informative posts with strong SEO. Each post should:
- Heavily feature Nexitel Blue or Purple plans (or both)
- Be ~80-110 lines of markdown content
- Start with an H2 heading (NOT H1)
- Use H2/H3 for structure
- Include bullet points and numbered lists
- Link to nexitel.us/plans, nexitel.us/blue-plans, nexitel.us/purple-plans
- End with a strong CTA
- NOT include any "Contact Us" section (handled by the layout)
- Be informative and helpful, not salesy`;

const TOPIC_GENERATION_PROMPT = `Generate 2 fresh, unique SEO blog post topics about Nexitel prepaid wireless plans.

DO NOT pick any of these existing topics (filenames):
${existingSlugs.join("\n")}

Each topic should target a specific audience or use-case. Be creative — examples to inspire (don't reuse):
- best plan for [specific profession/situation]
- how to [solve specific problem] with prepaid
- [specific scenario] with Nexitel Blue vs Purple
- prepaid plans for [specific demographic]

Return ONLY a JSON array (no markdown, no commentary) like this:
[
  {
    "slug": "kebab-case-slug-here-2026",
    "title": "Title in English",
    "description": "SEO meta description, 150-160 chars",
    "category": "Guide" | "Plans" | "Technology" | "Travel",
    "image": "filename-from-list.jpg"
  },
  { ... }
]

Available images: ${AVAILABLE_IMAGES.join(", ")}
Pick TWO DIFFERENT images for the two posts.`;

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

  const prompt = `Write a complete blog post in ${localeNames[locale]} for the following topic:

Title: ${topic.title}
Slug: ${topic.slug}
Description: ${topic.description}
Category: ${topic.category}
Date: ${today}

For ${locale === "en" ? "English" : locale === "zh" ? "Chinese" : "Spanish"}, write the title and description naturally in that language (don't just translate word-for-word — adapt culturally). Use the title and description in the frontmatter in the target language.

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
    for (const locale of ["en", "zh", "es"]) {
      console.log(`Writing ${locale}/${topic.slug}.mdx`);
      const content = await generatePost(topic, locale);
      const dir = join(POSTS_DIR, locale);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${topic.slug}.mdx`), content + "\n", "utf8");
    }
  }

  console.log(`\nDone. Created ${topics.length * 3} files for ${topics.length} posts.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
