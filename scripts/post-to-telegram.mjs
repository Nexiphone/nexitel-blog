#!/usr/bin/env node
// Picks the oldest unposted blog entry per locale and sends it to the
// matching Telegram channel. State is tracked in scripts/posted-log.json,
// which the CI workflow commits back to the repo after each successful run.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const postsRoot = path.join(repoRoot, 'posts');
const logPath = path.join(__dirname, 'posted-log.json');

const LOCALES = ['en', 'zh', 'es'];
const BLOG_BASE_URL = (process.env.BLOG_BASE_URL || 'https://nexitel.com').replace(/\/$/, '');

const CHAT_ID_ENV = {
  en: 'TELEGRAM_CHAT_ID_EN',
  zh: 'TELEGRAM_CHAT_ID_ZH',
  es: 'TELEGRAM_CHAT_ID_ES',
};

function readLog() {
  if (!fs.existsSync(logPath)) {
    return { telegram: { en: [], zh: [], es: [] } };
  }
  const raw = JSON.parse(fs.readFileSync(logPath, 'utf8'));
  raw.telegram ??= {};
  for (const locale of LOCALES) raw.telegram[locale] ??= [];
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

function htmlEscape(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function categoryToHashtag(category) {
  const cleaned = category.replace(/[^A-Za-z0-9]+/g, '');
  return cleaned ? `#${cleaned}` : '';
}

function buildMessage(post, locale) {
  const url = `${BLOG_BASE_URL}/${locale}/blog/${post.slug}`;
  const hashtag = categoryToHashtag(post.category);
  const parts = [
    `<b>${htmlEscape(post.title)}</b>`,
    '',
    htmlEscape(post.description),
    '',
  ];
  if (hashtag) parts.push(hashtag);
  parts.push(url);
  return parts.join('\n');
}

async function sendTelegram(token, chatId, text) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.ok === false) {
    throw new Error(
      `Telegram API error (${res.status}): ${body.description || JSON.stringify(body)}`
    );
  }
  return body;
}

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('TELEGRAM_BOT_TOKEN is not set.');
    process.exit(1);
  }

  const log = readLog();
  let sent = 0;
  let fatalError = null;

  for (const locale of LOCALES) {
    const chatId = process.env[CHAT_ID_ENV[locale]];
    if (!chatId) {
      console.warn(`[${locale}] ${CHAT_ID_ENV[locale]} not set — skipping locale.`);
      continue;
    }

    const posts = listPosts(locale);
    if (posts.length === 0) {
      console.warn(`[${locale}] no posts found under posts/${locale} — skipping.`);
      continue;
    }

    const next = pickOldestUnposted(posts, log.telegram[locale]);
    if (!next) {
      console.warn(`[${locale}] backlog exhausted — every post has been sent.`);
      continue;
    }

    const message = buildMessage(next, locale);
    console.log(`[${locale}] sending "${next.title}" (${next.slug}) to ${chatId}`);

    try {
      await sendTelegram(token, chatId, message);
      log.telegram[locale].push(next.slug);
      writeLog(log);
      sent += 1;
    } catch (err) {
      console.error(`[${locale}] send failed: ${err.message}`);
      fatalError = err;
    }
  }

  console.log(`Done. ${sent} message(s) sent.`);
  if (fatalError) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
