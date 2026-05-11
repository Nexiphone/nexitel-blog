#!/usr/bin/env node
// Posts the oldest unposted blog entry to the Nexitel LinkedIn Company Page,
// rotating language each run (en -> zh -> es -> en). Text + URL only —
// LinkedIn auto-generates the preview card from the destination's OpenGraph
// tags, so we don't need to upload images. State in scripts/li-blog-log.json.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const postsRoot = path.join(repoRoot, 'posts');
const logPath = path.join(__dirname, 'li-blog-log.json');

const LOCALES = ['en', 'zh', 'es'];
const NEXT_LOCALE = { en: 'zh', zh: 'es', es: 'en' };
const BLOG_BASE_URL = (process.env.BLOG_BASE_URL || 'https://nexitel-blog.vercel.app').replace(/\/$/, '');
const LI_API_VERSION = '202401';

function readLog() {
  if (!fs.existsSync(logPath)) {
    return { next_locale: 'en', posted: { en: [], zh: [], es: [] } };
  }
  const raw = JSON.parse(fs.readFileSync(logPath, 'utf8'));
  if (!LOCALES.includes(raw.next_locale)) raw.next_locale = 'en';
  raw.posted ??= {};
  for (const locale of LOCALES) raw.posted[locale] ??= [];
  return raw;
}

function writeLog(log) {
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2) + '\n');
}

function listPosts(locale) {
  const dir = path.join(postsRoot, locale);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((n) => n.endsWith('.mdx') || n.endsWith('.md'))
    .map((name) => {
      const slug = name.replace(/\.(mdx|md)$/, '');
      const { data } = matter(fs.readFileSync(path.join(dir, name), 'utf8'));
      return {
        slug,
        title: String(data.title || ''),
        description: String(data.description || ''),
        date: String(data.date || ''),
        category: String(data.category || 'General'),
      };
    });
}

function pickOldestUnposted(posts, postedSlugs) {
  const posted = new Set(postedSlugs);
  const pool = posts.filter((p) => !posted.has(p.slug) && p.date);
  if (pool.length === 0) return null;
  pool.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return pool[0];
}

function categoryToHashtag(category) {
  const cleaned = category.replace(/[^A-Za-z0-9]+/g, '');
  return cleaned ? `#${cleaned}` : '';
}

function buildCommentary(post, locale) {
  const url = `${BLOG_BASE_URL}/${locale}/blog/${post.slug}`;
  const hashtag = categoryToHashtag(post.category);
  const parts = [post.title, '', post.description, ''];
  if (hashtag) parts.push(hashtag);
  parts.push(url);
  return parts.join('\n');
}

async function postToLinkedIn(authorUrn, token, commentary) {
  const body = {
    author: authorUrn,
    commentary,
    visibility: 'PUBLIC',
    distribution: {
      feedDistribution: 'MAIN_FEED',
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  };
  const res = await fetch('https://api.linkedin.com/rest/posts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'LinkedIn-Version': LI_API_VERSION,
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`LinkedIn API failed (${res.status}): ${text}`);
  }
  // Successful POST returns 201 with the post ID in `x-restli-id` header
  return res.headers.get('x-restli-id') || 'unknown';
}

// Build the author URN. Accepts either a person ID (Share on LinkedIn /
// w_member_social) or an organization ID (Community Management API /
// w_organization_social) via the LI_AUTHOR_URN env var. Falls back to the
// older LI_ORGANIZATION_ID for backward compatibility.
function resolveAuthorUrn() {
  if (process.env.LI_AUTHOR_URN) return process.env.LI_AUTHOR_URN;
  if (process.env.LI_PERSON_ID) return `urn:li:person:${process.env.LI_PERSON_ID}`;
  if (process.env.LI_ORGANIZATION_ID) return `urn:li:organization:${process.env.LI_ORGANIZATION_ID}`;
  return null;
}

async function main() {
  const token = process.env.LI_ACCESS_TOKEN;
  const authorUrn = resolveAuthorUrn();
  if (!token || !authorUrn) {
    console.error('LI_ACCESS_TOKEN must be set, and one of LI_AUTHOR_URN, LI_PERSON_ID, or LI_ORGANIZATION_ID.');
    process.exit(1);
  }

  const log = readLog();
  const locale = log.next_locale;
  console.log(`[li-blog] selected locale: ${locale}`);

  const posts = listPosts(locale);
  if (posts.length === 0) {
    console.warn(`[li-blog] no posts under posts/${locale} — advancing locale.`);
    log.next_locale = NEXT_LOCALE[locale];
    writeLog(log);
    return;
  }

  const next = pickOldestUnposted(posts, log.posted[locale]);
  if (!next) {
    console.warn(`[li-blog] backlog exhausted in ${locale} — advancing locale anyway.`);
    log.next_locale = NEXT_LOCALE[locale];
    writeLog(log);
    return;
  }

  const commentary = buildCommentary(next, locale);
  console.log(`[li-blog] posting "${next.title}" (${next.slug}) as ${authorUrn}`);

  try {
    const postId = await postToLinkedIn(authorUrn, token, commentary);
    console.log(`[li-blog] posted: ${postId}`);
    log.posted[locale].push(next.slug);
    log.next_locale = NEXT_LOCALE[locale];
    writeLog(log);
    console.log(`[li-blog] done. Next run will post ${log.next_locale}.`);
  } catch (err) {
    console.error(`[li-blog] post failed: ${err.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
