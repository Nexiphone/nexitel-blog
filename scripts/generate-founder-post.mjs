#!/usr/bin/env node
/**
 * Founder portfolio post for LinkedIn. Rotates through the projects in
 * scripts/founder-portfolio.json; for each run it:
 *   1. picks the next project (round-robin, state in scripts/founder-post-log.json)
 *   2. asks Claude to write a first-person, CEO-voice LinkedIn post about it
 *   3. renders an on-brand 1080x1350 poster (satori + resvg) with the project's
 *      logo (scripts/assets/logos/<logo>) or a wordmark fallback, headline,
 *      tagline, URL and a "Deluxion Mohan · Founder & CEO, NEXI Corp" footer
 *   4. uploads the image to LinkedIn (Images API) and publishes an image post
 *      to the personal profile (urn:li:person:<LI_PERSON_ID>)
 *
 * Env:
 *   ANTHROPIC_API_KEY   (required) — writes the post copy
 *   CLAUDE_MODEL        (optional, default claude-sonnet-4-6)
 *   LI_ACCESS_TOKEN     (required to post) — w_member_social token
 *   LI_PERSON_ID        (required to post) — the author's person id (sub)
 *   LI_API_VERSION      (optional, default 202506)
 *
 * Usage:
 *   node scripts/generate-founder-post.mjs              # next project, render+post
 *   node scripts/generate-founder-post.mjs --dry-run    # render preview only, no post
 *   node scripts/generate-founder-post.mjs --dry-run --mock   # skip Claude too
 *   node scripts/generate-founder-post.mjs --key=pawmance     # force a project
 */
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fontsDir = path.join(root, "scripts", "assets", "fonts");
const logosDir = path.join(root, "scripts", "assets", "logos");
const portfolioPath = path.join(root, "scripts", "founder-portfolio.json");
const logPath = path.join(root, "scripts", "founder-post-log.json");

const model = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
const liVersion = process.env.LI_API_VERSION || "202506";
const dryRun = process.argv.includes("--dry-run");
const mock = process.argv.includes("--mock");
const keyArg = process.argv.find((a) => a.startsWith("--key="))?.split("=")[1];

const FOUNDER = "Deluxion Mohan";
const FOUNDER_TITLE = "Founder & CEO, NEXI Corp";

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found in model output.");
  return JSON.parse(candidate.slice(start, end + 1));
}

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

async function loadPortfolio() {
  const data = JSON.parse(await readFile(portfolioPath, "utf8"));
  return data.projects || [];
}

async function loadLog() {
  try { return JSON.parse(await readFile(logPath, "utf8")); }
  catch { return { index: 0, history: [] }; }
}

function pickProject(projects, log) {
  if (keyArg) {
    const p = projects.find((x) => x.key === keyArg);
    if (!p) throw new Error(`No project with key "${keyArg}".`);
    return p;
  }
  return projects[log.index % projects.length];
}

const MOCK = {
  headline: "We're rewiring how America buys a phone plan",
  commentary:
    "When I started Nexitel, the goal was simple: the same towers the big carriers use, without the contract or the markup.\n\nThree years in, what still drives me is the family that saves $900 a year, the new immigrant who gets connected on day one, the dealer who builds a business on top of what we made.\n\nAffordable connectivity isn't a feature. It's access. And access is the whole point.\n\nWhat are you building that gives people more access?",
};

async function writeCopy(project) {
  if (mock) return { ...MOCK };
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { console.error("ANTHROPIC_API_KEY is not set."); process.exit(1); }

  const system =
    `You ghost-write LinkedIn posts in the authentic first-person voice of ${FOUNDER}, ${FOUNDER_TITLE} — ` +
    "a hands-on founder building a portfolio of consumer and B2B ventures (telecom, safety, social apps). " +
    "Voice: confident but human, reflective, plain-spoken, founder-to-founder. No hype, no buzzword soup, " +
    "no emoji spam (one tasteful emoji at most, usually none). Short punchy lines and line breaks like a real " +
    "LinkedIn post. Lead with a hook or a belief, tell it through the lens of WHY this product matters to real " +
    "people, end with a light reflection or a question to the reader. You ALWAYS reply with one JSON object only.";

  const prompt = `Write ONE first-person LinkedIn post by ${FOUNDER} about this venture.

Venture: ${project.name} (${project.category})
What it is: ${project.blurb}
One-liner: ${project.tagline}
Link: ${project.url}

Requirements:
- First person ("I", "we built", "at NEXI Corp"). Sound like the founder, not a brand account.
- 4-9 short lines/paragraphs with line breaks, LinkedIn-native. ~120-200 words.
- Open with a strong hook (a belief, a problem, a moment) — NOT "Excited to announce".
- Make the reader feel why ${project.name} matters to real people.
- Do NOT put the URL in the body (it's added separately). No more than 3 hashtags, placed at the very end.
- End with a brief reflection or a question to other builders.

Return ONLY a JSON object with EXACTLY:
{
  "headline": "a punchy 3-7 word phrase for the poster graphic, Title Case, no period",
  "commentary": "the full LinkedIn post text (with line breaks, hashtags at the end)"
}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 1200, system, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Claude API error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const out = extractJson((data.content || []).map((b) => b.text || "").join(""));
  if (!out.commentary) throw new Error("Model did not return commentary.");
  out.headline = (out.headline || project.tagline).trim();
  out.commentary = out.commentary.trim();
  return out;
}

// ---- Poster rendering -------------------------------------------------------

function box(style, children) {
  return { type: "div", props: { style: { display: "flex", ...style }, children } };
}

async function logoDataUri(project) {
  if (!project.logo) return null;
  const p = path.join(logosDir, project.logo);
  if (!(await exists(p))) return null;
  const buf = await readFile(p);
  const ext = path.extname(p).slice(1).toLowerCase();
  const mime = ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "svg" ? "image/svg+xml" : "image/png";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

async function renderPoster(project, headline, logoUri) {
  const [bold, semi, regular] = await Promise.all([
    readFile(path.join(fontsDir, "Poppins-Bold.ttf")),
    readFile(path.join(fontsDir, "Poppins-SemiBold.ttf")),
    readFile(path.join(fontsDir, "Poppins-Regular.ttf")),
  ]);
  const c = project.colors;

  // logo block: real logo image if present, else a wordmark chip
  const logoBlock = logoUri
    ? { type: "img", props: { src: logoUri, height: 132, style: { objectFit: "contain" } } }
    : box(
        { backgroundColor: "rgba(255,255,255,0.08)", border: `2px solid ${c.accent}`, borderRadius: 28, padding: "22px 40px", alignItems: "center" },
        [box({ fontSize: 56, fontWeight: 700, color: c.accentText || c.accent }, project.name)],
      );

  const tree = box(
    { width: 1080, height: 1350, flexDirection: "column", justifyContent: "space-between",
      backgroundImage: `linear-gradient(160deg, ${c.ink} 0%, ${c.ink2} 100%)`,
      fontFamily: "Poppins", color: "white", padding: "96px 88px" },
    [
      // top: category kicker + logo
      box({ flexDirection: "column" }, [
        box({ alignItems: "center" }, [
          box({ backgroundColor: c.accent, color: c.ink, fontWeight: 700, fontSize: 26, letterSpacing: 2, padding: "12px 28px", borderRadius: 999 }, (project.category || "").toUpperCase()),
        ]),
        box({ height: 64 }, []),
        box({}, [logoBlock]),
      ]),
      // middle: headline + tagline
      box({ flexDirection: "column" }, [
        box({ fontSize: 78, fontWeight: 700, lineHeight: 1.06, color: "#ffffff" }, headline),
        box({ height: 26 }, []),
        box({ fontSize: 38, fontWeight: 400, lineHeight: 1.34, color: "rgba(255,255,255,0.84)" }, project.tagline),
      ]),
      // footer: founder attribution + url
      box({ flexDirection: "column" }, [
        box({ width: 1080 - 176, height: 2, backgroundColor: "rgba(255,255,255,0.18)" }, []),
        box({ height: 30 }, []),
        box({ justifyContent: "space-between", alignItems: "flex-end" }, [
          box({ flexDirection: "column" }, [
            box({ fontSize: 38, fontWeight: 700, color: "#ffffff" }, FOUNDER),
            box({ height: 6 }, []),
            box({ fontSize: 27, fontWeight: 500, color: "rgba(255,255,255,0.7)" }, FOUNDER_TITLE),
          ]),
          box({ flexDirection: "column", alignItems: "flex-end" }, [
            box({ fontSize: 34, fontWeight: 700, color: c.accentText || c.accent }, project.name),
            box({ height: 6 }, []),
            box({ fontSize: 26, fontWeight: 600, color: "rgba(255,255,255,0.7)" }, (project.cta || project.url).replace(/^https?:\/\//, "")),
          ]),
        ]),
      ]),
    ],
  );

  const svg = await satori(tree, {
    width: 1080, height: 1350,
    fonts: [
      { name: "Poppins", data: regular, weight: 400, style: "normal" },
      { name: "Poppins", data: semi, weight: 600, style: "normal" },
      { name: "Poppins", data: bold, weight: 700, style: "normal" },
    ],
  });
  return new Resvg(svg, { fitTo: { mode: "width", value: 1080 } }).render().asPng();
}

// ---- LinkedIn image post (Images API + Posts API) ---------------------------

function liHeaders(token, json) {
  const h = { Authorization: `Bearer ${token}`, "LinkedIn-Version": liVersion, "X-Restli-Protocol-Version": "2.0.0" };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

async function uploadImageToLinkedIn(token, authorUrn, png) {
  // 1) initialize upload -> uploadUrl + image urn
  const initRes = await fetch("https://api.linkedin.com/rest/images?action=initializeUpload", {
    method: "POST", headers: liHeaders(token, true),
    body: JSON.stringify({ initializeUploadRequest: { owner: authorUrn } }),
  });
  const initBody = await initRes.json().catch(() => ({}));
  if (!initRes.ok) throw new Error(`LinkedIn initializeUpload failed (${initRes.status}): ${JSON.stringify(initBody).slice(0, 300)}`);
  const uploadUrl = initBody?.value?.uploadUrl;
  const imageUrn = initBody?.value?.image;
  if (!uploadUrl || !imageUrn) throw new Error("LinkedIn initializeUpload: missing uploadUrl/image.");
  // 2) PUT the bytes
  const putRes = await fetch(uploadUrl, { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" }, body: png });
  if (!putRes.ok) throw new Error(`LinkedIn image upload PUT failed (${putRes.status}): ${(await putRes.text()).slice(0, 200)}`);
  return imageUrn;
}

async function publishImagePost(token, authorUrn, commentary, imageUrn, altText) {
  const body = {
    author: authorUrn,
    commentary,
    visibility: "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    content: { media: { id: imageUrn, altText: altText.slice(0, 290) } },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
  const res = await fetch("https://api.linkedin.com/rest/posts", { method: "POST", headers: liHeaders(token, true), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`LinkedIn post failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return res.headers.get("x-restli-id") || "unknown";
}

// ---- main -------------------------------------------------------------------

async function main() {
  const projects = await loadPortfolio();
  const log = await loadLog();
  const project = pickProject(projects, log);
  console.log(`\nFounder post → ${project.name} (${project.key})`);

  const copy = await writeCopy(project);
  console.log(`Headline: ${copy.headline}`);

  const logoUri = await logoDataUri(project);
  console.log(`Logo:     ${logoUri ? project.logo : "none yet (wordmark fallback)"}`);

  const png = await renderPoster(project, copy.headline, logoUri);
  console.log(`Rendered poster (${Math.round(png.length / 1024)} KB).`);

  const fullText = `${copy.commentary}\n\n${project.cta && !copy.commentary.includes(project.url) ? project.url : ""}`.trim();
  console.log(`\n--- post ---\n${fullText}\n------------\n`);

  if (dryRun) {
    const preview = path.join(root, "scripts", ".preview-founder.png");
    await writeFile(preview, png);
    console.log(`--dry-run: wrote ${path.relative(root, preview)} (not posting).`);
    return;
  }

  const token = process.env.LI_ACCESS_TOKEN;
  const personId = process.env.LI_PERSON_ID;
  if (!token || !personId) { console.error("LI_ACCESS_TOKEN and LI_PERSON_ID must be set."); process.exit(1); }
  const authorUrn = `urn:li:person:${personId}`;

  const imageUrn = await uploadImageToLinkedIn(token, authorUrn, png);
  console.log(`Uploaded image: ${imageUrn}`);
  const postId = await publishImagePost(token, authorUrn, fullText, imageUrn, `${project.name} — ${copy.headline}`);
  console.log(`✓ LinkedIn posted: ${postId}`);

  log.index = (log.index + 1) % projects.length;
  log.history = (log.history || []).concat([{ date: new Date().toISOString().slice(0, 10), key: project.key, headline: copy.headline }]).slice(-60);
  await mkdir(path.dirname(logPath), { recursive: true });
  await writeFile(logPath, `${JSON.stringify(log, null, 2)}\n`, "utf8");
}

main().catch((err) => { console.error(err.message || err); process.exit(1); });
