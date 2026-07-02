/**
 * Mirror generated blog posts into the new site's Supabase `blog_posts` table.
 *
 * This runs ALONGSIDE the .mdx writes — it never replaces them. The generator
 * writes the three locale .mdx files first, then calls publishPostToDb() to
 * upsert ONE row (per-language columns) keyed on slug.
 *
 * Env (both required to actually write):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 * If either is missing, the exported publishPostToDb is a no-op that logs and
 * returns — so local/dry runs and CI without the secrets don't touch the DB.
 */

import matter from "gray-matter";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const LOCALES = ["en", "zh", "es"];

// Read time in minutes, ceil(words / 200) — matches the site's convention.
function readTimeMinutes(body) {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

async function publishPostToDbImpl(slug, perLocale) {
  // perLocale = { en, zh, es } — each the RAW .mdx content (frontmatter + body).
  // gray-matter parses each into { data: frontmatter, content: body }.
  const parsed = {};
  for (const loc of LOCALES) {
    const mdx = perLocale?.[loc];
    if (!mdx) {
      parsed[loc] = null;
      continue;
    }
    const { data, content } = matter(mdx);
    parsed[loc] = { data, body: content.trim() };
  }

  // English is the base for the shared (non-language) columns, matching the
  // one-time import that seeded the table.
  const en = parsed.en;
  if (!en) {
    console.error(`DB publish skipped for ${slug}: no English content to key on.`);
    return;
  }

  const title = (loc) => (parsed[loc] ? parsed[loc].data.title ?? null : null);
  const desc = (loc) => (parsed[loc] ? parsed[loc].data.description ?? null : null);
  const body = (loc) => (parsed[loc] ? parsed[loc].body : null);
  const read = (loc) => (parsed[loc] ? readTimeMinutes(parsed[loc].body) : null);

  const row = {
    slug,
    category: en.data.category ?? "",
    cover_image_url: en.data.image ?? null, // frontmatter `image`
    author: en.data.author ?? "",
    published_at: en.data.date ?? new Date().toISOString(), // today
    published: true,
    title_en: title("en"), title_zh: title("zh"), title_es: title("es"),
    description_en: desc("en"), description_zh: desc("zh"), description_es: desc("es"),
    body_en: body("en"), body_zh: body("zh"), body_es: body("es"),
    read_en: read("en"), read_zh: read("zh"), read_es: read("es"),
  };

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Upsert on slug — idempotent: re-running the same slug updates the row, no dupes.
  const { error } = await sb.from("blog_posts").upsert(row, { onConflict: "slug" });
  if (error) throw new Error(`blog_posts upsert failed for ${slug}: ${error.message}`);
  console.log(`DB publish OK: blog_posts/${slug}`);
}

// Env-guarded no-op so local/dry runs (env unset) never write rows.
async function publishPostToDbNoop(slug) {
  console.log(`DB publish skipped (no Supabase env): ${slug}`);
}

export const publishPostToDb =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY ? publishPostToDbImpl : publishPostToDbNoop;
