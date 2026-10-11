/**
 * Gate a generated post before it is published.
 *
 * The topic brief in generate-daily-posts.mjs states its rules as prohibitions
 * ("NO nationality-plus-occupation topics", "never publish a minimum order").
 * The first unattended run broke three of them at once: it published a section
 * headed "Minimum Order Quantities", a "Taiwanese Immigrant and Tourist Market"
 * segment, and priced Nexitel Purple at $6/mo when the plan is $5.
 *
 * A prohibition in a prompt is a request, not a constraint. This module is the
 * constraint: the post is checked against the rules and against the live plan
 * catalog, and anything that fails is not published.
 */

/** Live plan catalog, read from the Product markup on /plans. */
export async function fetchPlanPrices(origin = "https://www.nexitel.us") {
  const res = await fetch(`${origin}/plans`, {
    headers: { "user-agent": "nexitel-blog-validator" },
  });
  if (!res.ok) throw new Error(`could not read plan catalog: HTTP ${res.status}`);
  const html = await res.text();
  const block = html.match(
    /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (!block) throw new Error("no JSON-LD on /plans");
  const data = JSON.parse(block[1].replace(/\\u003c/g, "<"));
  const out = new Map();
  for (const entry of data.itemListElement ?? []) {
    const p = entry.item;
    if (p?.name && p?.offers?.price) out.set(p.name, Number(p.offers.price));
  }
  if (out.size === 0) throw new Error("plan catalog parsed but empty");
  return out;
}

const BANNED = [
  {
    name: "nationality-persona topic",
    re: /\b(indian|chinese|taiwanese|filipino|vietnamese|korean|japanese|egyptian|nigerian|mexican|bangladeshi|pakistani|nepali|sri[- ]lankan|cambodian|thai|arab|latino|hispanic)\s+(immigrant|student|worker|nurse|engineer|researcher|professional|family|families|tourist|visitor|resident|market|community|customers?)\b/i,
    why: "the pattern that produced the 191 unpublished posts",
  },
  {
    name: "order minimum",
    re: /minimum\s+(order|starter|purchase|quantity|quantities)|\b(start|begin|order)\s+with\s+[0-9,]{2,}\s*(sim|card|line|unit)/i,
    why: "order minimums are a dealer conversation, never published",
  },
  {
    name: "margin or commission",
    re: /\b(profit\s+)?margins?\b|\bmarkup\b|\bcommission\s+(rate|structure|per)\b/i,
    why: "margins are a dealer conversation, never published",
  },
];

/**
 * Every "$N" that sits within 80 characters of a plan name must match that
 * plan's real price. Generic editorial figures ("plans under $20") are left
 * alone - only claims attached to a named product are checked.
 */
function priceProblems(text, prices) {
  const problems = [];
  for (const [name, price] of prices) {
    const short = name.replace(/^Nexitel (Blue|Purple)\s*/, "");
    for (const label of new Set([name, short])) {
      if (!label) continue;
      const re = new RegExp(
        `${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^.$]{0,80}\\$(\\d+(?:\\.\\d{2})?)`,
        "gi",
      );
      let m;
      while ((m = re.exec(text))) {
        const claimed = Number(m[1]);
        if (claimed !== price) {
          problems.push(
            `priced "${label}" at $${claimed}; the catalog says $${price}`,
          );
        }
      }
    }
  }
  // Family-level claims: "Nexitel Purple plans from $6/mo". The family name is
  // not a catalog entry, so the per-plan check above never sees it - which is
  // exactly how the $6 claim reached the live site when PurpleStart is $5.
  for (const family of ["Blue", "Purple"]) {
    const inFamily = [...prices.entries()]
      .filter(([n]) => n.includes(`Nexitel ${family}`))
      .map(([, v]) => v);
    if (inFamily.length === 0) continue;
    const valid = new Set(inFamily);
    const cheapest = Math.min(...inFamily);

    const fromRe = new RegExp(`Nexitel ${family}[^.$]{0,60}from \\$(\\d+)`, "gi");
    let m;
    while ((m = fromRe.exec(text))) {
      if (Number(m[1]) !== cheapest) {
        problems.push(
          `said Nexitel ${family} starts "from $${m[1]}"; cheapest in that family is $${cheapest}`,
        );
      }
    }

    const nearRe = new RegExp(`Nexitel ${family}[^.$]{0,60}\\$(\\d+)`, "gi");
    while ((m = nearRe.exec(text))) {
      if (!valid.has(Number(m[1]))) {
        problems.push(
          `attached $${m[1]} to Nexitel ${family}; no plan in that family costs that`,
        );
      }
    }
  }

  return problems;
}

/** Returns { ok, problems }. Never throws on content - only on a missing catalog. */
export function validatePost({ title = "", description = "", body = "" }, prices) {
  const text = `${title}\n${description}\n${body}`;
  const problems = [];

  for (const rule of BANNED) {
    const hit = text.match(rule.re);
    if (hit) problems.push(`${rule.name}: "${hit[0].trim()}" - ${rule.why}`);
  }
  problems.push(...priceProblems(text, prices));

  return { ok: problems.length === 0, problems };
}
