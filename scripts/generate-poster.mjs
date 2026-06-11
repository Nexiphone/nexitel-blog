#!/usr/bin/env node
/**
 * Generates one branded Nexitel "poster" per run: Claude writes a short
 * money-saving wireless tip, we render it into an on-brand 1080x1350 image with
 * satori + resvg, upload it to imgbb (free host -> public URL Instagram needs),
 * and post it to a Facebook Page and Instagram via the Meta Graph API.
 *
 * Env:
 *   ANTHROPIC_API_KEY   (required) — writes the tip + caption
 *   CLAUDE_MODEL        (optional, default claude-sonnet-4-6)
 *   IMGBB_API_KEY       (required to post) — free image host, https://api.imgbb.com
 *   PEXELS_API_KEY      (optional) — adds a matching photo header; gradient if absent
 *   META_ACCESS_TOKEN   (required to post)
 *   META_PAGE_ID        (optional) — enables Facebook
 *   META_IG_USER_ID     (optional) — enables Instagram
 *   META_GRAPH_VERSION  (optional, default v21.0)
 *
 * Usage:
 *   node scripts/generate-poster.mjs              # render, upload, post
 *   node scripts/generate-poster.mjs --dry-run    # render to scripts/.preview-poster.png only
 *   node scripts/generate-poster.mjs --dry-run --mock  # same, skip the Claude call
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import QRCode from "qrcode";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fontsDir = path.join(root, "scripts", "assets", "fonts");
const historyPath = path.join(root, "content", "poster-history.json");

const model = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
const graphVersion = process.env.META_GRAPH_VERSION || "v21.0";
const dryRun = process.argv.includes("--dry-run");
const mock = process.argv.includes("--mock");

// Where the poster's QR code + caption link point.
const SITE_URL = "https://nexitel.us";

// Brand palette (tailwind nexitel.*)
const INK = "#0f0a2e"; // darker
const INK2 = "#1a1145"; // dark
const PURPLE = "#8b5cf6";
const BLUE = "#3b82f6";
const ACCENT = "#c4b5fd"; // light purple for accents

// Rotating topic pillars so daily tips stay varied across themes.
const PILLARS = [
  "how much money you can save switching from a big carrier to prepaid",
  "what to check before buying a prepaid SIM (coverage, network, data)",
  "eSIM vs physical SIM — which to pick and why",
  "how to keep your phone number when switching carriers",
  "picking the right amount of data so you never overpay",
  "best prepaid setup for a family on one bill",
  "staying connected affordably while traveling in the USA",
  "why unlimited talk & text doesn't have to be expensive",
  "hidden fees on phone bills and how prepaid avoids them",
  "a quick win for new immigrants getting their first US SIM",
  "dual-SIM tips for work + personal on one phone",
  "how to activate a new prepaid plan in minutes",
  "best prepaid plan for heavy streamers / gamers",
  "data-only plans for tablets, hotspots and IoT devices",
];

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found in model output.");
  return JSON.parse(candidate.slice(start, end + 1));
}

async function loadHistory() {
  try {
    return JSON.parse(await readFile(historyPath, "utf8"));
  } catch {
    return [];
  }
}

const MOCK_CONTENT = {
  category: "Money Tip",
  headline: "Cut Your Phone Bill in Half",
  tip: "Most prepaid plans give you the same 5G towers as the big carriers — for a fraction of the price. No contract, no credit check.",
  imageQuery: "person using smartphone city",
  caption: "Why pay more for the same network? Switch to prepaid and keep the savings.",
  hashtags: ["#Nexitel", "#PrepaidWireless", "#PhonePlans", "#5G", "#USA"],
};

async function writeContent(history) {
  if (mock) return { ...MOCK_CONTENT };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY is not set. Add it as a GitHub Actions secret.");
    process.exit(1);
  }

  const recent = history.slice(-40).map((h) => `- ${h.headline}`).join("\n") || "- (none yet)";
  const pillar = PILLARS[history.length % PILLARS.length];

  const system =
    "You write punchy, helpful social media graphics for Nexitel (nexitel.us) — an " +
    "affordable prepaid wireless / SIM service in the USA with no contracts: cheap " +
    "unlimited talk & text, nationwide 5G on major networks, eSIM and physical SIM, easy " +
    "number transfer, and plans for families, travelers, immigrants and budget users. Tone " +
    "is clear, upbeat, money-saving and genuinely useful. You ALWAYS respond with a single " +
    "valid JSON object and nothing else.";

  const prompt = `Create the text for ONE daily Nexitel poster (a designed graphic with a short tip).

Theme for today: "${pillar}". Pick a fresh, specific angle.

Do NOT repeat or closely overlap any of these recent headlines:
${recent}

Return ONLY a JSON object with EXACTLY these fields:
{
  "category": "2-3 word kicker in Title Case, e.g. 'Money Tip', 'Did You Know?', 'Wireless 101', 'Save More'",
  "headline": "punchy hook, MAX 38 characters, Title Case, no period",
  "tip": "1-2 helpful sentences expanding the headline, MAX 170 characters",
  "imageQuery": "2-3 word search term for a REAL photo, e.g. 'person using smartphone', 'family phones', 'travel airport phone', 'city 5g'",
  "caption": "social caption WITHOUT hashtags and WITHOUT any URL, 1-2 sentences, friendly",
  "hashtags": ["#Nexitel", "#... 3-6 relevant prepaid/wireless hashtags"]
}

Keep the headline SHORT so it fits the poster.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model, max_tokens: 1000, system, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Claude API error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const out = extractJson((data.content || []).map((b) => b.text || "").join(""));
  if (!out.headline || !out.tip) throw new Error("Model did not return headline/tip.");
  out.category = (out.category || "Wireless Tip").trim();
  out.headline = out.headline.trim();
  out.tip = out.tip.trim();
  return out;
}

// ---- Poster rendering (satori -> SVG -> resvg -> PNG) -----------------------

function box(style, children) {
  return { type: "div", props: { style: { display: "flex", ...style }, children } };
}

/**
 * Fetch a relevant real photo from Pexels and return it as a base64 data URI
 * (satori needs the image inline). Returns null if no key / no result, so the
 * poster falls back to a clean brand gradient header.
 */
async function fetchPhotoDataUri(query, variety) {
  const key = process.env.PEXELS_API_KEY;
  if (!key || !query) return null;
  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=12&orientation=landscape`,
      { headers: { Authorization: key } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const photos = Array.isArray(data.photos) ? data.photos : [];
    if (!photos.length) return null;
    const photo = photos[variety % photos.length];
    const src = photo.src?.landscape || photo.src?.large2x || photo.src?.large || photo.src?.original;
    if (!src) return null;
    const imgRes = await fetch(src);
    if (!imgRes.ok) return null;
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const ct = imgRes.headers.get("content-type") || "image/jpeg";
    return `data:${ct};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * No-API-key photo pool: hand-validated Unsplash photos (direct CDN, no key
 * needed), tagged by theme so each poster gets a RELEVANT, rotating photo —
 * phones, people using phones, travel, city, remote work. Used when no
 * PEXELS_API_KEY is set so every poster still has a real, on-topic image.
 */
const PHOTO_LIBRARY = [
  { id: "photo-1511707171634-5f897ff02aa9", tags: ["phone", "apps", "device", "esim", "activation", "setup", "general"] },
  { id: "photo-1512941937669-90a1b58e7e9c", tags: ["phone", "apps", "device", "esim", "general"] },
  { id: "photo-1556656793-08538906a9f8", tags: ["phone", "device", "sim", "esim", "plan", "switch", "general"] },
  { id: "photo-1530319067432-f2a729c03db5", tags: ["phone", "activation", "new", "esim", "setup", "immigrant", "general"] },
  { id: "photo-1516321318423-f06f85e504b3", tags: ["phone", "online", "digital", "data", "general"] },
  { id: "photo-1522125670776-3c7abb882bc2", tags: ["phone", "using", "lifestyle", "data", "stream", "text", "talk"] },
  { id: "photo-1601972602237-8c79241e468b", tags: ["phone", "app", "city", "using", "data", "stream", "general"] },
  { id: "photo-1565849904461-04a58ad377e0", tags: ["phone", "camera", "outdoor", "travel", "content", "game", "stream"] },
  { id: "photo-1436491865332-7a61a109cc05", tags: ["airport", "travel", "international", "roam", "nomad", "trip"] },
  { id: "photo-1469854523086-cc02fe5d8800", tags: ["car", "road", "roadtrip", "travel", "drive", "trip"] },
  { id: "photo-1507525428034-b723cf961d3e", tags: ["beach", "travel", "vacation", "outdoor", "snowbird"] },
  { id: "photo-1551632811-561732d1e306", tags: ["hike", "trail", "travel", "outdoor", "adventure", "coverage"] },
  { id: "photo-1519608487953-e999c86e7455", tags: ["city", "people", "coverage", "urban", "general"] },
  { id: "photo-1502920917128-1aa500764cbd", tags: ["city", "commute", "street", "coverage", "general"] },
  { id: "photo-1494790108377-be9c29b29330", tags: ["person", "portrait", "people", "family", "couple", "general"] },
  { id: "photo-1521737711867-e3b97375f902", tags: ["remote", "work", "laptop", "team", "nomad", "gig", "business", "family"] },
];

/** Pick the most relevant photo for the tip; rotate by index when nothing matches. */
function pickPhotoId(content, index) {
  const hay = `${content.imageQuery || ""} ${content.headline || ""} ${content.tip || ""} ${content.category || ""}`.toLowerCase();
  let best = null, bestScore = 0;
  PHOTO_LIBRARY.forEach((p, i) => {
    const score = p.tags.reduce((s, t) => (t !== "general" && hay.includes(t) ? s + 1 : s), 0);
    // slight rotation tiebreak so equal-scoring tips don't always pick the same photo
    const tie = (i + index) % PHOTO_LIBRARY.length === 0 ? 0.1 : 0;
    if (score + tie > bestScore) { bestScore = score + tie; best = p.id; }
  });
  return best || PHOTO_LIBRARY[index % PHOTO_LIBRARY.length].id;
}

/** Fetch an Unsplash pool photo as a data URI (no API key needed). */
async function fetchUnsplashDataUri(id) {
  try {
    const res = await fetch(`https://images.unsplash.com/${id}?w=1080&h=520&fit=crop&q=80`);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${res.headers.get("content-type") || "image/jpeg"};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

async function renderPoster({ category, headline, tip, photoDataUri, qrDataUri }) {
  const [bold, semi, regular] = await Promise.all([
    readFile(path.join(fontsDir, "Poppins-Bold.ttf")),
    readFile(path.join(fontsDir, "Poppins-SemiBold.ttf")),
    readFile(path.join(fontsDir, "Poppins-Regular.ttf")),
  ]);

  const PHOTO_H = 500;
  const header = photoDataUri
    ? { type: "img", props: { src: photoDataUri, width: 1080, height: PHOTO_H, style: { objectFit: "cover" } } }
    : box({ width: 1080, height: PHOTO_H, backgroundImage: `linear-gradient(135deg, ${PURPLE} 0%, ${BLUE} 100%)` }, []);

  const qrCard = qrDataUri
    ? box({ flexDirection: "column", alignItems: "center" }, [
        box({ backgroundColor: "#ffffff", padding: 16, borderRadius: 24 }, [
          { type: "img", props: { src: qrDataUri, width: 200, height: 200 } },
        ]),
        box({ height: 12 }, []),
        box({ fontSize: 26, fontWeight: 600, color: "rgba(255,255,255,0.8)" }, "Scan to shop plans"),
      ])
    : box({}, []);

  const tree = box(
    { width: 1080, height: 1350, flexDirection: "column", backgroundColor: INK, fontFamily: "Poppins", color: "white" },
    [
      // photo/gradient header with category pill + blend into the panel below
      box({ width: 1080, height: PHOTO_H, position: "relative" }, [
        header,
        box({ position: "absolute", top: 42, left: 56 }, [
          box(
            { backgroundColor: ACCENT, color: INK, fontWeight: 700, fontSize: 28, letterSpacing: 2, padding: "14px 30px", borderRadius: 999 },
            category.toUpperCase(),
          ),
        ]),
        box({ position: "absolute", bottom: 0, left: 0, width: 1080, height: 220, backgroundImage: `linear-gradient(to bottom, rgba(15,10,46,0) 0%, ${INK} 100%)` }, []),
      ]),
      // text panel
      box({ flexGrow: 1, flexDirection: "column", justifyContent: "space-between", padding: "24px 84px 66px", backgroundImage: `linear-gradient(160deg, ${INK} 0%, ${INK2} 100%)` }, [
        box({ flexDirection: "column" }, [
          box({ fontSize: 72, fontWeight: 700, lineHeight: 1.05, color: "#ffffff" }, headline),
          box({ height: 20 }, []),
          box({ fontSize: 36, fontWeight: 400, lineHeight: 1.38, color: "rgba(255,255,255,0.86)" }, tip),
        ]),
        // call-to-action row: CTA text (left) + QR card (right)
        box({ alignItems: "flex-end", justifyContent: "space-between" }, [
          box({ flexDirection: "column" }, [
            box({ alignItems: "center" }, [
              box(
                { backgroundImage: `linear-gradient(135deg, ${PURPLE} 0%, ${BLUE} 100%)`, color: "#ffffff", fontWeight: 700, fontSize: 32, letterSpacing: 1, padding: "20px 44px", borderRadius: 999 },
                "SHOP PLANS",
              ),
            ]),
            box({ height: 18 }, []),
            box({ fontSize: 30, fontWeight: 600, color: "rgba(255,255,255,0.78)" }, "No contract · Nationwide 5G"),
            box({ height: 18 }, []),
            box({ fontSize: 36, fontWeight: 600, color: ACCENT }, "Affordable prepaid, no surprises"),
            box({ height: 26 }, []),
            box({ alignItems: "center" }, [
              box({ fontSize: 40, fontWeight: 700, color: PURPLE }, "Nexitel"),
              box({ width: 16 }, []),
              box({ fontSize: 28, fontWeight: 600, color: "rgba(255,255,255,0.6)" }, "·  nexitel.us"),
            ]),
          ]),
          qrCard,
        ]),
      ]),
    ],
  );

  const svg = await satori(tree, {
    width: 1080,
    height: 1350,
    fonts: [
      { name: "Poppins", data: regular, weight: 400, style: "normal" },
      { name: "Poppins", data: semi, weight: 600, style: "normal" },
      { name: "Poppins", data: bold, weight: 700, style: "normal" },
    ],
  });
  return new Resvg(svg, { fitTo: { mode: "width", value: 1080 } }).render().asPng();
}

// ---- imgbb upload ----------------------------------------------------------

async function uploadToImgbb(png) {
  const key = process.env.IMGBB_API_KEY;
  if (!key) throw new Error("IMGBB_API_KEY is not set.");
  const body = new URLSearchParams({ image: png.toString("base64") });
  const res = await fetch(`https://api.imgbb.com/1/upload?key=${key}`, { method: "POST", body });
  const data = await res.json().catch(() => ({}));
  const url = data?.data?.url || data?.data?.display_url;
  if (!res.ok || !url) throw new Error(`imgbb upload failed: ${JSON.stringify(data).slice(0, 200)}`);
  return url;
}

// ---- Meta Graph posting (self-contained) -----------------------------------

async function graph(pathPart, params) {
  const res = await fetch(`https://graph.facebook.com/${graphVersion}/${pathPart}`, {
    method: "POST",
    body: new URLSearchParams(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(`Graph API ${res.status}: ${data.error?.message || JSON.stringify(data)}`);
  return data;
}

async function resolvePageToken(token, pageId) {
  try {
    const res = await fetch(
      `https://graph.facebook.com/${graphVersion}/${pageId}?fields=access_token&access_token=${encodeURIComponent(token)}`,
    );
    const data = await res.json().catch(() => ({}));
    if (res.ok && !data.error && data.access_token) return data.access_token;
  } catch {
    /* fall back */
  }
  return token;
}

async function postToFacebook(token, pageId, imageUrl, caption) {
  const data = await graph(`${pageId}/photos`, { url: imageUrl, caption, access_token: token });
  return data.post_id || data.id;
}

async function igWaitReady(token, creationId) {
  // Poll the container until Instagram finishes processing the image, so
  // media_publish doesn't 400 with "Media ID is not available".
  for (let i = 0; i < 12; i++) {
    const res = await fetch(
      `https://graph.facebook.com/${graphVersion}/${creationId}?fields=status_code&access_token=${encodeURIComponent(token)}`,
    );
    const data = await res.json().catch(() => ({}));
    if (data.status_code === "FINISHED") return;
    if (data.status_code === "ERROR" || data.status_code === "EXPIRED") {
      throw new Error(`Instagram container ${data.status_code}`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
}

async function postToInstagram(token, igUserId, imageUrl, caption) {
  const container = await graph(`${igUserId}/media`, { image_url: imageUrl, caption, access_token: token });
  if (!container.id) throw new Error("Instagram: no creation id returned.");
  await igWaitReady(token, container.id);
  for (let attempt = 0; ; attempt++) {
    try {
      const published = await graph(`${igUserId}/media_publish`, { creation_id: container.id, access_token: token });
      return published.id;
    } catch (e) {
      if (attempt < 3 && /not available|Media ID|not ready/i.test(e.message)) {
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      throw e;
    }
  }
}

// ---- main ------------------------------------------------------------------

async function main() {
  const history = await loadHistory();
  const content = await writeContent(history);
  console.log(`\nPoster: [${content.category}] "${content.headline}"`);
  console.log(`Tip:    ${content.tip}`);

  const photoQuery = content.imageQuery || content.headline;
  let photoDataUri = await fetchPhotoDataUri(photoQuery, history.length);
  let photoSrc = photoDataUri ? `Pexels "${photoQuery}"` : "";
  if (!photoDataUri) {
    const id = pickPhotoId(content, history.length);
    photoDataUri = await fetchUnsplashDataUri(id);
    photoSrc = photoDataUri ? `Unsplash ${id}` : "gradient (photo fetch failed)";
  }
  console.log(`Photo:  ${photoSrc}`);

  const qrDataUri = await QRCode.toDataURL(SITE_URL, {
    margin: 1,
    width: 260,
    color: { dark: INK, light: "#ffffff" },
  });

  const png = await renderPoster({ ...content, photoDataUri, qrDataUri });
  console.log(`Rendered poster PNG (${Math.round(png.length / 1024)} KB).`);

  const hashtags = (Array.isArray(content.hashtags) ? content.hashtags : [])
    .map((h) => (h.startsWith("#") ? h : `#${h}`))
    .slice(0, 8);
  const caption = `${(content.caption || content.tip).trim()}\n\n📲 Affordable prepaid wireless, no contract — shop plans at Nexitel:\n${SITE_URL}\n\n${hashtags.join(" ")}`.trim();
  console.log(`\n--- caption ---\n${caption}\n---------------\n`);

  if (dryRun) {
    const preview = path.join(root, "scripts", ".preview-poster.png");
    await writeFile(preview, png);
    console.log(`--dry-run: wrote preview to ${path.relative(root, preview)} (not uploading or posting).`);
    return;
  }

  const imageUrl = await uploadToImgbb(png);
  console.log(`Uploaded poster: ${imageUrl}`);

  const token = process.env.META_ACCESS_TOKEN;
  const pageId = process.env.META_PAGE_ID;
  const igUserId = process.env.META_IG_USER_ID;
  if (!token || (!pageId && !igUserId)) {
    console.error("Nothing to post to. Set META_ACCESS_TOKEN plus META_PAGE_ID and/or META_IG_USER_ID.");
    process.exit(1);
  }
  const postToken = pageId ? await resolvePageToken(token, pageId) : token;

  const results = [];
  if (pageId) {
    try {
      console.log(`✓ Facebook posted (${await postToFacebook(postToken, pageId, imageUrl, caption)})`);
      results.push(true);
    } catch (err) {
      console.error(`✗ Facebook failed: ${err.message}`);
      results.push(false);
    }
  }
  if (igUserId) {
    try {
      console.log(`✓ Instagram posted (${await postToInstagram(postToken, igUserId, imageUrl, caption)})`);
      results.push(true);
    } catch (err) {
      console.error(`✗ Instagram failed: ${err.message}`);
      results.push(false);
    }
  }
  if (!results.some(Boolean)) throw new Error("All configured platforms failed to post.");

  // Record history (for dedup) — committed by the workflow.
  history.push({ date: new Date().toISOString().slice(0, 10), headline: content.headline });
  await mkdir(path.dirname(historyPath), { recursive: true });
  await writeFile(historyPath, `${JSON.stringify(history, null, 2)}\n`, "utf8");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
