#!/usr/bin/env node
// Posts the least-recently-shown active promo to the Nexitel LinkedIn Company
// Page, rotating language each run (en -> zh -> es -> en). Text + CTA URL —
// LinkedIn auto-generates a preview card from the destination's OpenGraph
// tags. State in scripts/li-promo-log.json.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const promosRoot = path.join(repoRoot, 'promos');
const logPath = path.join(__dirname, 'li-promo-log.json');

const LOCALES = ['en', 'zh', 'es'];
const NEXT_LOCALE = { en: 'zh', zh: 'es', es: 'en' };
const EPOCH = '1970-01-01T00:00:00.000Z';
const LI_API_VERSION = '202401';

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

function buildCommentary(promo) {
  const parts = [promo.body];
  if (promo.cta_url) {
    parts.push('');
    parts.push(promo.cta_url);
  }
  return parts.join('\n');
}

async function postToLinkedIn(orgId, token, commentary) {
  const body = {
    author: `urn:li:organization:${orgId}`,
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
  return res.headers.get('x-restli-id') || 'unknown';
}

async function main() {
  const token = process.env.LI_ACCESS_TOKEN;
  const orgId = process.env.LI_ORGANIZATION_ID;
  if (!token || !orgId) {
    console.error('LI_ACCESS_TOKEN and LI_ORGANIZATION_ID must be set.');
    process.exit(1);
  }

  const now = new Date();
  const log = readLog();
  const locale = log.next_locale;
  console.log(`[li-promo] selected locale: ${locale}`);

  const all = listPromos(locale);
  if (all.length === 0) {
    console.warn(`[li-promo] no promo files in promos/${locale} — advancing locale.`);
    log.next_locale = NEXT_LOCALE[locale];
    writeLog(log);
    return;
  }

  const active = all.filter((p) => isActive(p, now));
  if (active.length === 0) {
    console.warn(`[li-promo] no active promos in ${locale} — advancing locale.`);
    log.next_locale = NEXT_LOCALE[locale];
    writeLog(log);
    return;
  }

  if (active.length === 1) {
    console.warn(`[li-promo] only 1 active promo in ${locale} — same one will repeat next ${locale} run.`);
  }

  const promo = pickNext(active, log.history[locale]);
  const commentary = buildCommentary(promo);
  console.log(`[li-promo] posting "${promo.id}" to org ${orgId}`);

  try {
    const postId = await postToLinkedIn(orgId, token, commentary);
    console.log(`[li-promo] posted: ${postId}`);
    log.history[locale][promo.id] = now.toISOString();
    log.next_locale = NEXT_LOCALE[locale];
    writeLog(log);
    console.log(`[li-promo] done. Next run will post ${log.next_locale}.`);
  } catch (err) {
    console.error(`[li-promo] post failed: ${err.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
