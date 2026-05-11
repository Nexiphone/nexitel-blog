#!/usr/bin/env node
// Posts the least-recently-shown active promo to the business Facebook Page,
// rotating language each run (en -> zh -> es -> en). Uploads the image as
// multipart binary when present in public/promos/, otherwise falls back to
// a link-only post via /feed. State in scripts/fb-promo-log.json.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const promosRoot = path.join(repoRoot, 'promos');
const imagesRoot = path.join(repoRoot, 'public', 'promos');
const logPath = path.join(__dirname, 'fb-promo-log.json');

const LOCALES = ['en', 'zh', 'es'];
const NEXT_LOCALE = { en: 'zh', zh: 'es', es: 'en' };
const EPOCH = '1970-01-01T00:00:00.000Z';
const FB_GRAPH_VERSION = 'v21.0';

function readLog() {
  if (!fs.existsSync(logPath)) {
    return { next_locale: 'en', history: { en: {}, zh: {}, es: {} } };
  }
  const raw = JSON.parse(fs.readFileSync(logPath, 'utf8'));
  if (!LOCALES.includes(raw.next_locale)) raw.next_locale = 'en';
  raw.history ??= {};
  for (const locale of LOCALES) raw.history[locale] ??= {};
  return raw;
}

function writeLog(log) {
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2) + '\n');
}

function listPromos(locale) {
  const dir = path.join(promosRoot, locale);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((n) => n.endsWith('.md'))
    .map((name) => {
      const fullPath = path.join(dir, name);
      const { data, content } = matter(fs.readFileSync(fullPath, 'utf8'));
      return {
        id: String(data.id || name.replace(/\.md$/, '')),
        type: String(data.type || 'plan'),
        image: data.image ? String(data.image) : null,
        cta_url: data.cta_url ? String(data.cta_url) : null,
        start_date: data.start_date ? String(data.start_date) : null,
        end_date: data.end_date ? String(data.end_date) : null,
        priority: Number(data.priority ?? 0),
        body: content.trim(),
      };
    });
}

function isActive(promo, now) {
  if (promo.start_date && new Date(promo.start_date) > now) return false;
  if (promo.end_date) {
    const end = new Date(promo.end_date);
    end.setUTCHours(23, 59, 59, 999);
    if (end < now) return false;
  }
  return true;
}

function pickNext(promos, historyForLocale) {
  if (promos.length === 0) return null;
  return promos
    .map((p) => ({
      promo: p,
      lastPosted: historyForLocale[p.id] || EPOCH,
    }))
    .sort((a, b) => {
      if (a.lastPosted !== b.lastPosted) return a.lastPosted < b.lastPosted ? -1 : 1;
      if (a.promo.priority !== b.promo.priority) return b.promo.priority - a.promo.priority;
      return a.promo.id < b.promo.id ? -1 : 1;
    })[0].promo;
}

function buildCaption(promo) {
  const parts = [promo.body];
  if (promo.cta_url) {
    parts.push('');
    parts.push(promo.cta_url);
  }
  return parts.join('\n');
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

async function postFeed(pageId, token, message, link) {
  const payload = { message, access_token: token };
  if (link) payload.link = link;
  const res = await fetch(
    `https://graph.facebook.com/${FB_GRAPH_VERSION}/${pageId}/feed`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
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

  const now = new Date();
  const log = readLog();
  const locale = log.next_locale;
  console.log(`[fb-promo] selected locale: ${locale}`);

  const all = listPromos(locale);
  if (all.length === 0) {
    console.warn(`[fb-promo] no promo files in promos/${locale} — advancing locale.`);
    log.next_locale = NEXT_LOCALE[locale];
    writeLog(log);
    return;
  }

  const active = all.filter((p) => isActive(p, now));
  if (active.length === 0) {
    console.warn(`[fb-promo] no active promos in ${locale} — advancing locale.`);
    log.next_locale = NEXT_LOCALE[locale];
    writeLog(log);
    return;
  }

  if (active.length === 1) {
    console.warn(`[fb-promo] only 1 active promo in ${locale} — same one will repeat next ${locale} run.`);
  }

  const promo = pickNext(active, log.history[locale]);
  const caption = buildCaption(promo);

  try {
    if (promo.image) {
      const imagePath = path.join(imagesRoot, promo.image);
      if (fs.existsSync(imagePath)) {
        console.log(`[fb-promo] posting "${promo.id}" with image ${promo.image}`);
        await postPhoto(pageId, token, imagePath, caption);
      } else {
        console.warn(`[fb-promo] image referenced but not found (${imagePath}); falling back to feed post.`);
        await postFeed(pageId, token, caption, promo.cta_url);
      }
    } else {
      console.log(`[fb-promo] posting "${promo.id}" (text-only via /feed)`);
      await postFeed(pageId, token, caption, promo.cta_url);
    }
    log.history[locale][promo.id] = now.toISOString();
    log.next_locale = NEXT_LOCALE[locale];
    writeLog(log);
    console.log(`[fb-promo] done. Next run will post ${log.next_locale}.`);
  } catch (err) {
    console.error(`[fb-promo] send failed: ${err.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
