#!/usr/bin/env node
// Picks the least-recently-posted active promo per locale and sends it to the
// matching Telegram channel. Promos rotate (unlike blog posts) so state is a
// map of id -> last_posted_timestamp, tracked in scripts/promo-log.json.
// Images are uploaded via multipart so this works regardless of whether the
// public site is live yet.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const promosRoot = path.join(repoRoot, 'promos');
const imagesRoot = path.join(repoRoot, 'public', 'promos');
const logPath = path.join(__dirname, 'promo-log.json');

const LOCALES = ['en', 'zh', 'es'];
const EPOCH = '1970-01-01T00:00:00.000Z';

const CHAT_ID_ENV = {
  en: 'TELEGRAM_CHAT_ID_EN',
  zh: 'TELEGRAM_CHAT_ID_ZH',
  es: 'TELEGRAM_CHAT_ID_ES',
};

function readLog() {
  if (!fs.existsSync(logPath)) return { en: {}, zh: {}, es: {} };
  const raw = JSON.parse(fs.readFileSync(logPath, 'utf8'));
  for (const locale of LOCALES) raw[locale] ??= {};
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
        _file: fullPath,
      };
    });
}

function isActive(promo, now) {
  if (promo.start_date && new Date(promo.start_date) > now) return false;
  if (promo.end_date) {
    // Inclusive through end of end_date
    const end = new Date(promo.end_date);
    end.setUTCHours(23, 59, 59, 999);
    if (end < now) return false;
  }
  return true;
}

function pickNext(promos, logForLocale) {
  if (promos.length === 0) return null;
  const ranked = promos
    .map((p) => ({
      promo: p,
      lastPosted: logForLocale[p.id] || EPOCH,
    }))
    .sort((a, b) => {
      // 1. Least-recently-posted wins
      if (a.lastPosted !== b.lastPosted) {
        return a.lastPosted < b.lastPosted ? -1 : 1;
      }
      // 2. Higher priority wins
      if (a.promo.priority !== b.promo.priority) {
        return b.promo.priority - a.promo.priority;
      }
      // 3. Alphabetical id (deterministic)
      return a.promo.id < b.promo.id ? -1 : 1;
    });
  return ranked[0].promo;
}

function htmlEscape(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildCaption(promo) {
  const parts = [htmlEscape(promo.body)];
  if (promo.cta_url) {
    parts.push('');
    parts.push(promo.cta_url);
  }
  return parts.join('\n');
}

async function sendMessage(token, chatId, text) {
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
      `sendMessage failed (${res.status}): ${body.description || JSON.stringify(body)}`
    );
  }
  return body;
}

async function sendPhoto(token, chatId, imagePath, caption) {
  const buffer = fs.readFileSync(imagePath);
  const form = new FormData();
  form.append('chat_id', chatId);
  form.append('caption', caption);
  form.append('parse_mode', 'HTML');
  form.append(
    'photo',
    new Blob([buffer]),
    path.basename(imagePath)
  );
  const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: 'POST',
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.ok === false) {
    throw new Error(
      `sendPhoto failed (${res.status}): ${body.description || JSON.stringify(body)}`
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

  const now = new Date();
  const log = readLog();
  let sent = 0;
  let fatalError = null;

  for (const locale of LOCALES) {
    const chatId = process.env[CHAT_ID_ENV[locale]];
    if (!chatId) {
      console.warn(`[${locale}] ${CHAT_ID_ENV[locale]} not set — skipping locale.`);
      continue;
    }

    const all = listPromos(locale);
    if (all.length === 0) {
      console.warn(`[${locale}] no promo files in promos/${locale} — skipping.`);
      continue;
    }

    const active = all.filter((p) => isActive(p, now));
    if (active.length === 0) {
      console.warn(`[${locale}] no active promos right now (all outside start/end window) — skipping.`);
      continue;
    }

    if (active.length === 1) {
      console.warn(`[${locale}] only 1 active promo — will repeat until more are added.`);
    }

    const promo = pickNext(active, log[locale]);
    const caption = buildCaption(promo);

    try {
      if (promo.image) {
        const imagePath = path.join(imagesRoot, promo.image);
        if (!fs.existsSync(imagePath)) {
          throw new Error(
            `image referenced but not found on disk: public/promos/${promo.image}. ` +
              `Either add the file or remove the \`image:\` field from promos/${locale}/${promo.id}.md.`
          );
        }
        console.log(`[${locale}] sending promo "${promo.id}" (with image ${promo.image}) to ${chatId}`);
        await sendPhoto(token, chatId, imagePath, caption);
      } else {
        console.log(`[${locale}] sending promo "${promo.id}" (text-only) to ${chatId}`);
        await sendMessage(token, chatId, caption);
      }
      log[locale][promo.id] = now.toISOString();
      writeLog(log);
      sent += 1;
    } catch (err) {
      console.error(`[${locale}] send failed: ${err.message}`);
      fatalError = err;
    }
  }

  console.log(`Done. ${sent} promo message(s) sent.`);
  if (fatalError) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
