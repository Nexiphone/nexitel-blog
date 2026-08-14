#!/usr/bin/env node
/**
 * Re-sync the Supabase `blog_posts` mirror from the corrected posts/*.mdx.
 *
 * The .mdx files in this repo are the source of truth. The mirror is written
 * only by scripts/generate-daily-posts.mjs, so rows written before the link
 * fix still contain dead URLs (nexitel.us/blue-plans, /nexi-volt, ...). This
 * script re-reads every post from disk and re-upserts it through the SAME
 * publishPostToDb() path the generator uses. No SQL is written by hand.
 *
 * DRY RUN IS THE DEFAULT. Nothing is written unless you pass --apply.
 *
 * Env (both required, even for a dry run — it must read the table to diff):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   node scripts/resync-blog-db.mjs                 # dry run: report only
 *   node scripts/resync-blog-db.mjs --dry-run       # same, explicit
 *   node scripts/resync-blog-db.mjs --apply         # perform the upserts
 *   node scripts/resync-blog-db.mjs --slug foo-2026 # limit to one slug
 *   node scripts/resync-blog-db.mjs --limit 20      # limit to first N slugs
 *   node scripts/resync-blog-db.mjs --verbose       # list every changed slug
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { publishPostToDb, buildRow } from "./lib/publish-db.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const POSTS_DIR = join(ROOT, "posts");
const LOCALES = ["en", "zh", "es"];

// ---------------------------------------------------------------- args

const argv = process.argv.slice(2);
const hasFlag = (f) => argv.includes(f);
const flagValue = (f) => {
  const i = argv.indexOf(f);
  return i !== -1 ? argv[i + 1] : undefined;
};

const apply = hasFlag("--apply");
const verbose = hasFlag("--verbose");
const onlySlug = flagValue("--slug");
const limit = flagValue("--limit") ? Number(flagValue("--limit")) : undefined;

if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
  console.error("ERROR: --limit must be a positive integer.");
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set.\n" +
      "       A dry run needs them too — it reads blog_posts to diff against disk.",
  );
  process.exit(1);
}

// -------------------------------------------------------------- helpers

/**
 * URL paths that 404 on the consumer site. Counting these in the DB bodies is
 * how the dry run reports "broken links that would be replaced". Both the apex
 * and www hosts are counted, since rows were written with either.
 */
const DEAD_PATHS = [
  "blue-plans",
  "purple-plans",
  "data-plans",
  "compare",
  "international",
  "wholesale",
  "nexi-talk",
  "nexi-volt",
];
const DEAD_LINK_RE = new RegExp(
  `https://(?:www\\.)?nexitel\\.us/(?:${DEAD_PATHS.join("|")})\\b`,
  "g",
);
// Apex links that resolve but cost a 308 hop to www. Not broken, tracked apart.
const APEX_HOP_RE = /https:\/\/nexitel\.us(?!\/(?:logo\.png))/g;

const countMatches = (text, re) =>
  typeof text === "string" ? (text.match(re) ?? []).length : 0;

/**
 * Fields the resync is responsible for, compared verbatim.
 *
 * published_at is NOT in this list and is compared separately below: the column
 * comes back as a timestamp ("2026-02-25T00:00:00+00:00") while the frontmatter
 * holds a plain date ("2026-02-25"), so a verbatim compare would flag all 224
 * rows as changed. It still rides along on every upsert via buildRow(), so any
 * genuine drift is reported rather than being rewritten unannounced.
 */
const CONTENT_FIELDS = [
  "category",
  "cover_image_url",
  "author",
  "title_en", "title_zh", "title_es",
  "description_en", "description_zh", "description_es",
  "body_en", "body_zh", "body_es",
  "read_en", "read_zh", "read_es",
];

function readRepoPosts() {
  const bySlug = new Map();
  for (const locale of LOCALES) {
    const dir = join(POSTS_DIR, locale);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!/\.mdx?$/.test(file)) continue;
      const slug = file.replace(/\.mdx?$/, "");
      if (!bySlug.has(slug)) bySlug.set(slug, {});
      bySlug.get(slug)[locale] = readFileSync(join(dir, file), "utf8");
    }
  }
  return bySlug;
}

/** Page through the table — Supabase caps a single select at 1000 rows. */
async function fetchAllRows(sb) {
  const rows = [];
  const PAGE = 500;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("blog_posts")
      .select(["slug", "published_at", ...CONTENT_FIELDS].join(","))
      .order("slug", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`blog_posts select failed: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

const pct = (n, d) => (d === 0 ? "0.0" : ((n / d) * 100).toFixed(1));

/**
 * Reduce either representation of a publish date to YYYY-MM-DD so the mirror's
 * timestamp and the frontmatter's plain date can be compared for real drift.
 * Returns null for anything unparseable, which compares equal to nothing.
 */
function dateKey(value) {
  if (!value) return null;
  const s = String(value);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

// ----------------------------------------------------------------- main

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const repoPosts = readRepoPosts();
console.log(`Repo:  ${repoPosts.size} slugs across ${LOCALES.join("/")}`);

// Fail loudly on a typo rather than reporting a quiet "nothing to do".
if (onlySlug && !repoPosts.has(onlySlug)) {
  console.error(`\nERROR: --slug "${onlySlug}" has no .mdx under posts/{${LOCALES.join(",")}}/.`);
  process.exit(1);
}

const dbRows = await fetchAllRows(sb);
const dbBySlug = new Map(dbRows.map((r) => [r.slug, r]));
console.log(`DB:    ${dbBySlug.size} rows in blog_posts`);
console.log();

// Classify every repo slug against the mirror.
const toInsert = [];
const toUpdate = [];
const unchanged = [];
const skippedNoEnglish = [];
const missingLocales = [];
const dateDrift = [];

let deadBefore = 0;
let deadAfter = 0;
let apexBefore = 0;
let apexAfter = 0;

for (const [slug, perLocale] of repoPosts) {
  if (onlySlug && slug !== onlySlug) continue;

  const present = LOCALES.filter((l) => perLocale[l]);
  if (!perLocale.en) {
    skippedNoEnglish.push({ slug, present });
    continue;
  }
  if (present.length < LOCALES.length) {
    missingLocales.push({ slug, missing: LOCALES.filter((l) => !perLocale[l]) });
  }

  const row = buildRow(slug, perLocale);
  if (!row) {
    skippedNoEnglish.push({ slug, present });
    continue;
  }

  const existing = dbBySlug.get(slug);

  // Link accounting: "before" is what the mirror serves today, "after" is what
  // this resync would leave behind. Only rows we would actually touch count.
  for (const f of ["body_en", "body_zh", "body_es"]) {
    if (existing) {
      deadBefore += countMatches(existing[f], DEAD_LINK_RE);
      apexBefore += countMatches(existing[f], APEX_HOP_RE);
    }
    deadAfter += countMatches(row[f], DEAD_LINK_RE);
    apexAfter += countMatches(row[f], APEX_HOP_RE);
  }

  if (!existing) {
    toInsert.push({ slug, row });
    continue;
  }

  const diffs = CONTENT_FIELDS.filter((f) => {
    const a = existing[f] ?? null;
    const b = row[f] ?? null;
    return a !== b;
  });

  // Date drift is tracked but deliberately does NOT make a row "changed": we
  // never churn 224 publish dates just to resync links. It only matters when
  // the row is being rewritten anyway, so flag exactly those.
  const dbDate = dateKey(existing.published_at);
  const repoDate = dateKey(row.published_at);
  if (dbDate && repoDate && dbDate !== repoDate) {
    dateDrift.push({ slug, from: dbDate, to: repoDate, rewritten: diffs.length > 0 });
  }

  if (diffs.length === 0) unchanged.push(slug);
  else toUpdate.push({ slug, row, diffs });
}

// Slugs the mirror has that the repo does not. Reported, never touched.
// Meaningless during a single-slug run, so only computed for a full pass.
const orphans = onlySlug
  ? []
  : [...dbBySlug.keys()].filter((s) => !repoPosts.has(s));

let work = [...toInsert, ...toUpdate];
let limited = false;
if (limit !== undefined && work.length > limit) {
  work = work.slice(0, limit);
  limited = true;
}

// ---------------------------------------------------------------- report

console.log("=== Slug reconciliation ===");
console.log(`  in both repo and DB      ${unchanged.length + toUpdate.length}`);
console.log(`    would change           ${toUpdate.length}`);
console.log(`    already identical      ${unchanged.length}`);
console.log(`  in repo, not in DB       ${toInsert.length}  (would be inserted)`);
console.log(`  in DB, not in repo       ${orphans.length}  (reported only, never touched)`);
if (skippedNoEnglish.length) {
  console.log(`  skipped, no English      ${skippedNoEnglish.length}  (table keys on English)`);
}
console.log();

if (orphans.length) {
  console.log(`=== ${orphans.length} DB slugs with no .mdx in the repo ===`);
  console.log("  These are NOT deleted or modified. Investigate before assuming");
  console.log("  they are stale — they may predate the repo or come from elsewhere.");
  for (const s of orphans.slice(0, verbose ? orphans.length : 15)) console.log(`    ${s}`);
  if (!verbose && orphans.length > 15) {
    console.log(`    ... and ${orphans.length - 15} more (--verbose to list all)`);
  }
  console.log();
}

if (skippedNoEnglish.length) {
  console.log(`=== ${skippedNoEnglish.length} slugs skipped (no English source) ===`);
  for (const { slug, present } of skippedNoEnglish.slice(0, verbose ? Infinity : 10)) {
    console.log(`    ${slug}  (has: ${present.join(", ") || "nothing"})`);
  }
  console.log();
}

if (missingLocales.length) {
  console.log(`=== ${missingLocales.length} slugs missing a translation ===`);
  console.log("  These upsert fine; the absent locale's columns are set to null.");
  for (const { slug, missing } of missingLocales.slice(0, verbose ? Infinity : 10)) {
    console.log(`    ${slug}  (missing: ${missing.join(", ")})`);
  }
  if (!verbose && missingLocales.length > 10) {
    console.log(`    ... and ${missingLocales.length - 10} more (--verbose to list all)`);
  }
  console.log();
}

if (dateDrift.length) {
  const rewritten = dateDrift.filter((d) => d.rewritten);
  console.log(`=== ${dateDrift.length} slugs whose published_at differs from frontmatter ===`);
  console.log(`  ${rewritten.length} sit on rows this resync would rewrite — their date`);
  console.log("  WOULD be changed to the frontmatter value as a side effect.");
  console.log(`  The other ${dateDrift.length - rewritten.length} are on otherwise-identical rows and stay untouched.`);
  for (const { slug, from, to, rewritten: r } of (rewritten.length ? rewritten : dateDrift).slice(0, verbose ? Infinity : 10)) {
    console.log(`    ${slug}  ${from} -> ${to}${r ? "" : "  (not rewritten)"}`);
  }
  console.log();
}

console.log("=== Link repair (across body_en / body_zh / body_es) ===");
console.log(`  dead links in DB now     ${deadBefore}`);
console.log(`  dead links after resync  ${deadAfter}`);
console.log(`  would be replaced        ${deadBefore - deadAfter}  (${pct(deadBefore - deadAfter, deadBefore)}%)`);
console.log(`  apex 308 hops now        ${apexBefore}`);
console.log(`  apex 308 hops after      ${apexAfter}`);
console.log();

if (deadAfter > 0) {
  console.log(`  NOTE: ${deadAfter} dead links would REMAIN — the .mdx on disk still`);
  console.log("        contains them. Fix the repo first, then re-run.");
  console.log();
}

if (verbose && toUpdate.length) {
  console.log("=== Slugs that would change ===");
  for (const { slug, diffs } of toUpdate) console.log(`    ${slug}  [${diffs.join(", ")}]`);
  console.log();
}

// ----------------------------------------------------------------- write

if (!apply) {
  console.log(`DRY RUN — nothing was written. ${work.length} rows would be upserted.`);
  console.log("Re-run with --apply to write.");
  process.exit(0);
}

if (work.length === 0) {
  console.log("Nothing to do — the mirror already matches the repo.");
  process.exit(0);
}

console.log(`APPLYING — upserting ${work.length} rows${limited ? ` (capped by --limit)` : ""}...`);

let ok = 0;
const failures = [];
const CONCURRENCY = 5;

for (let i = 0; i < work.length; i += CONCURRENCY) {
  const batch = work.slice(i, i + CONCURRENCY);
  await Promise.all(
    batch.map(async ({ slug }) => {
      try {
        // Same code path the generator uses — it rebuilds the row internally.
        await publishPostToDb(slug, repoPosts.get(slug));
        ok++;
      } catch (err) {
        failures.push({ slug, message: err?.message ?? String(err) });
      }
    }),
  );
  const done = Math.min(i + CONCURRENCY, work.length);
  if (done % 50 < CONCURRENCY || done === work.length) {
    console.log(`  ${done}/${work.length}`);
  }
}

console.log();
console.log(`Done. ${ok} upserted, ${failures.length} failed.`);
if (failures.length) {
  console.log("=== Failures ===");
  for (const { slug, message } of failures) console.log(`    ${slug}: ${message}`);
  console.log();
  console.log("Re-running is safe — the upsert is idempotent and keys on slug.");
  process.exit(1);
}
