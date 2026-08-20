/**
 * Only post a link that actually resolves.
 *
 * The social posters pick from the .mdx files on disk, but what is PUBLISHED is
 * decided elsewhere (the `published` flag on blog_posts, which nexitel.us reads).
 * Those two sets diverged when the blog was pruned: 224 files on disk, 34 live.
 * Picking straight from disk therefore posts dead links.
 *
 * Rather than teach each script to query Supabase - which would mean adding the
 * service-role key to three more workflows - this checks the thing that actually
 * matters: does the URL we are about to publish return 200? That stays correct
 * regardless of how the two sites diverge later, and needs no new secrets.
 *
 * Slugs that fail are recorded in the log's `skipped` list so later runs do not
 * re-check them every day.
 */

/** True when the URL resolves to a 2xx. Redirects are followed. */
export async function isLive(url, { timeoutMs = 15000 } = {}) {
  const attempt = async (method) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        redirect: 'follow',
        signal: ctrl.signal,
        headers: { 'user-agent': 'nexitel-social-bot' },
      });
      return res.ok;
    } catch {
      return null; // network/abort — inconclusive, not a definite 404
    } finally {
      clearTimeout(timer);
    }
  };

  // Some hosts refuse HEAD; fall back to GET before believing a negative.
  const head = await attempt('HEAD');
  if (head === true) return true;
  const get = await attempt('GET');
  return get === true;
}

/**
 * Walk `pool` oldest-first and return the first entry whose URL is live.
 *
 * Returns { post, skipped }. `skipped` are slugs that did not resolve and should
 * be recorded so they are not retried on every future run.
 *
 * Fails CLOSED: if nothing in the pool resolves, returns post: null and the
 * caller posts nothing. A missed day is cheaper than a dead link on the page.
 */
export async function pickLive(pool, buildUrl, { maxChecks = 40 } = {}) {
  const skipped = [];
  for (const post of pool.slice(0, maxChecks)) {
    const url = buildUrl(post);
    if (await isLive(url)) return { post, skipped };
    console.log(`  skip (not live): ${url}`);
    skipped.push(post.slug);
  }
  return { post: null, skipped };
}
