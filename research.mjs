// Finds Shorts from other channels that are doing well this month in the same niche, so the
// dashboard can recommend video ideas. Uses public YouTube search pages only.
// Runs at most once every 20 hours (set FORCE=1 to run anyway). Run: node research.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OWN_CHANNEL_ID = 'UCmHZlPrlf72eez6ISdVJ_IA';
const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = join(ROOT, 'data', 'research.json');
const MIN_AGE_MS = 20 * 3600e3;
const DETAIL_LIMIT = 40; // candidates we open for channel/date/length; keeps each run light
const KEEP = 18;
const MIN_VIEWS = 5000; // ignore tiny videos whose per-day rate is just noise

// Search phrases per topic, matching the themes of his best Shorts.
const QUERIES = [
  { topic: 'Space and planets', q: 'space facts shorts' },
  { topic: 'Space and planets', q: 'moon facts shorts' },
  { topic: 'Space and planets', q: 'planets facts shorts' },
  { topic: 'What if', q: 'what if space shorts' },
  { topic: 'What if', q: 'what if earth shorts' },
  { topic: 'Mind-bending scenarios', q: 'can you escape shorts' },
  { topic: 'Human body and mind', q: 'human body facts shorts' },
  { topic: 'Aliens and the unknown', q: 'aliens facts shorts' },
];

const HEADERS = { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en' };
const THIS_MONTH = 'EgIIBA%3D%3D'; // YouTube search filter: uploaded this month

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Spaced out and retried once, because YouTube answers 429 to quick bursts of searches.
async function get(url) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: HEADERS });
    if (res.ok) return res.text();
    if (res.status !== 429 || attempt) throw new Error(`${url} -> HTTP ${res.status}`);
    await sleep(15e3);
  }
}

// "29 thousand views", "1.2 million views", "12,345 views" -> number
function parseViews(text) {
  const m = text.replace(/,/g, '').match(/([\d.]+)\s*(thousand|million|billion|K|M|B)?\s*views?/i);
  if (!m) return 0;
  const mult = { thousand: 1e3, k: 1e3, million: 1e6, m: 1e6, billion: 1e9, b: 1e9 }[m[2]?.toLowerCase()] ?? 1;
  return Math.round(parseFloat(m[1]) * mult);
}

function initialData(html) {
  const m = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  return m ? JSON.parse(m[1]) : null;
}

function findAll(node, key, out = []) {
  if (Array.isArray(node)) node.forEach((n) => findAll(n, key, out));
  else if (node && typeof node === 'object') {
    if (key in node) out.push(node[key]);
    Object.values(node).forEach((v) => findAll(v, key, out));
  }
  return out;
}

async function searchShorts({ topic, q }) {
  const html = await get(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=${THIS_MONTH}`);
  const data = initialData(html);
  if (!data) return [];
  return findAll(data, 'shortsLockupViewModel').flatMap((s) => {
    const id = s.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId;
    const label = s.accessibilityText ?? '';
    // accessibilityText looks like: "<title>, 29 thousand views - play Short"
    const m = label.match(/^(.*), ([\d.,]+\s*(?:thousand|million|billion)?\s*views?)/i);
    if (!id || !m) return [];
    return [{ id, title: m[1].trim(), views: parseViews(m[2]), topic, query: q }];
  });
}

async function details(id) {
  const html = await get(`https://www.youtube.com/watch?v=${id}`);
  const pick = (re) => html.match(re)?.[1];
  return {
    channel: JSON.parse(`"${pick(/"ownerChannelName":"((?:[^"\\]|\\.)*)"/) ?? ''}"`),
    channelId: pick(/"channelId":"(UC[^"]+)"/),
    published: pick(/"publishDate":"([^"]+)"/),
    lengthSeconds: Number(pick(/"lengthSeconds":"(\d+)"/) ?? 0),
    views: Number(pick(/"viewCount":"(\d+)"/) ?? 0),
  };
}

async function main() {
  try {
    const prev = JSON.parse(await readFile(OUT_FILE, 'utf8'));
    if (!process.env.FORCE && Date.now() - Date.parse(prev.t) < MIN_AGE_MS) {
      console.log(`research is fresh (${prev.t}), skipping`);
      return;
    }
  } catch {
    // no previous research
  }

  const seen = new Map();
  for (const query of QUERIES) {
    try {
      for (const v of await searchShorts(query)) if (!seen.has(v.id)) seen.set(v.id, v);
      await sleep(4e3);
    } catch (err) {
      console.error(`search "${query.q}" failed: ${err.message}`);
    }
  }

  const candidates = [...seen.values()]
    .filter((v) => v.views >= MIN_VIEWS)
    .sort((a, b) => b.views - a.views)
    .slice(0, DETAIL_LIMIT);
  const now = Date.now();
  const videos = [];
  for (const c of candidates) {
    try {
      const d = await details(c.id);
      await sleep(1e3);
      if (d.channelId === OWN_CHANNEL_ID || !d.published) continue;
      const ageDays = Math.max(0.5, (now - Date.parse(d.published)) / 86400e3);
      const views = d.views || c.views;
      videos.push({ ...c, ...d, views, viewsPerDay: Math.round(views / ageDays) });
    } catch (err) {
      console.error(`details ${c.id} failed: ${err.message}`);
    }
  }

  videos.sort((a, b) => b.viewsPerDay - a.viewsPerDay);
  // At most two picks per channel so one big creator doesn't fill the list.
  const perChannel = new Map();
  const picks = videos.filter((v) => {
    const n = perChannel.get(v.channelId) ?? 0;
    perChannel.set(v.channelId, n + 1);
    return n < 2;
  }).slice(0, KEEP);

  await writeFile(OUT_FILE, JSON.stringify({ t: new Date().toISOString(), queries: QUERIES, videos: picks }));
  console.log(`research: ${seen.size} Shorts found, ${videos.length} checked, ${picks.length} kept`);
}

main().catch((err) => {
  console.error(`research failed: ${err.message}`);
  process.exit(1);
});
