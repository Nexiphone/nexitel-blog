#!/usr/bin/env node
// Posts the oldest unposted blog entry to the business Facebook Page,
// rotating language each day (en -> zh -> es -> en). Uses image upload
// when the hero image exists in public/, falls back to /feed link-post
// when the image is missing. State in scripts/fb-blog-log.json.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const postsRoot = path.join(repoRoot, 'posts');
const publicRoot = path.join(repoRoot, 'public');
const logPath = path.join(__dirname, 'fb-blog-log.json');

const LOCALES = ['en', 'zh', 'es'];
const NEXT_LOCALE = { en: 'zh', zh: 'es', es: 'en' };
const BLOG_BASE_URL = (process.env.BLOG_BASE_URL || 'https://nexitel-blog.vercel.app').replace(/\/$/, '');
const FB_GRAPH_VERSION = 'v21.0';

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
        image: data.image ? String(data.image) : '',
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

function buildCaption(post, locale) {
  const url = `${BLOG_BASE_URL}/${locale}/blog/${post.slug}`;
  const hashtag = categoryToHashtag(post.category);
  const parts = [post.title, '', post.description, ''];
  if (hashtag) parts.push(hashtag);
  parts.push(url);
  return parts.join('\n');
}

function resolveImagePath(frontmatterImage) {
  if (!frontmatterImage) return null;
  // Blog frontmatter convention is leading-slash path under public/, e.g. "/images/blog/5g-coverage.jpg"
  const rel = frontmatterImage.replace(/^\//, '');
  return path.join(publicRoot, rel);
}

async function postPhoto(pageId, token, imagePath, caption) {
  const buffer = fs.readFileSync(imagePath);
  const form = new FormData();
  form.append('caption', caption);
  form.append('access_token', token);
  form.append('source', new Blob([buffer]), path.basename(imagePath));
  const res = await fetch(
    `https://graph.facebook.com/${FB_GRAPH_VERSION}/${pageId}/photos`,
    { method: 'POST', body: form }
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    throw new Error(
      `FB /photos failed (${res.status}): ${body.error?.message || JSON.stringify(body)}`
    );
  }
  return body;
}

async function postLink(pageId, token, message, link) {
  const res = await fetch(
    `https://graph.facebook.com/${FB_GRAPH_VERSION}/${pageId}/feed`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message, link, access_token: token }),
    }
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    throw new Error(
      `FB /feed failed (${res.status}): ${body.error?.message || JSON.stringify(body)}`
    );
  }
  return body;
}

async function main() {
  const pageId = process.env.FB_PAGE_ID;
  const token = process.env.FB_PAGE_ACCESS_TOKEN;
  if (!pageId || !token) {
    console.error('FB_PAGE_ID and FB_PAGE_ACCESS_TOKEN must be set.');
    process.exit(1);
  }

  const log = readLog();
  const locale = log.next_locale;
  console.log(`[fb-blog] selected locale: ${locale}`);

  const posts = listPosts(locale);
  if (posts.length === 0) {
    console.warn(`[fb-blog] no posts under posts/${locale} — advancing locale.`);
    log.next_locale = NEXT_LOCALE[locale];
    writeLog(log);
    return;
  }

  const next = pickOldestUnposted(posts, log.posted[locale]);
  if (!next) {
    console.warn(`[fb-blog] backlog exhausted in ${locale} — advancing locale anyway.`);
    log.next_locale = NEXT_LOCALE[locale];
    writeLog(log);
    return;
  }

  const caption = buildCaption(next, locale);
  const imagePath = resolveImagePath(next.image);
  const url = `${BLOG_BASE_URL}/${locale}/blog/${next.slug}`;

  try {
    // Always use /feed (link post). The /photos endpoint requires
    // pages_read_engagement, which needs App Review approval (weeks).
    // /feed only needs pages_manage_posts, and FB auto-renders a preview
    // card using the destination's OpenGraph image/title/description —
    // visually nearly identical for blog-link posts.
    console.log(`[fb-blog] posting "${next.title}" (${next.slug}) as link to ${url}`);
    await postLink(pageId, token, caption, url);
    log.posted[locale].push(next.slug);
    log.next_locale = NEXT_LOCALE[locale];
    writeLog(log);
    console.log(`[fb-blog] done. Next run will post ${log.next_locale}.`);
  } catch (err) {
    console.error(`[fb-blog] send failed: ${err.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
