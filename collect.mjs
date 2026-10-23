// Takes one snapshot of the Unfiltered Checks YouTube channel and appends it to data/snapshots.json.
// Uses only public YouTube pages (no API key, no paid services). Run: node collect.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHANNEL_HANDLE = 'UnfilteredChecks';
const CHANNEL_ID = 'UCmHZlPrlf72eez6ISdVJ_IA';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(ROOT, 'data');
const JSON_FILE = join(DATA_DIR, 'snapshots.json');

const HEADERS = { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en' };

async function get(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}

// "771 subscribers" -> 771, "1.2K subscribers" -> 1200, "185,291 views" -> 185291
function parseCount(text) {
  const m = text?.replace(/,/g, '').match(/([\d.]+)\s*([KMB])?/i);
  if (!m) return null;
  const mult = { K: 1e3, M: 1e6, B: 1e9 }[m[2]?.toUpperCase()] ?? 1;
  return Math.round(parseFloat(m[1]) * mult);
}

function decode(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

async function channelStats() {
  const html = await get(`https://www.youtube.com/@${CHANNEL_HANDLE}/about`);
  const pick = (key) => html.match(new RegExp(`"${key}":"([^"]*)"`))?.[1] ?? null;
  const subscribersText = pick('subscriberCountText');
  if (!subscribersText) throw new Error('subscriber count not found on the channel page');
  return {
    subscribers: parseCount(subscribersText),
    subscribersRounded: /\d\s*[KMB]\b/i.test(subscribersText), // YouTube rounds above 1,000
    views: parseCount(pick('viewCountText')),
    videos: parseCount(pick('videoCountText')),
  };
}

// The public feed lists the latest 15 uploads with their view and like counts.
async function latestUploads() {
  const xml = await get(`https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`);
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => ({
    id: e.match(/<yt:videoId>([^<]+)/)?.[1],
    title: decode(e.match(/<title>([^<]*)/)?.[1] ?? ''),
    published: e.match(/<published>([^<]+)/)?.[1],
    views: Number(e.match(/views="(\d+)"/)?.[1] ?? 0),
    likes: Number(e.match(/starRating count="(\d+)"/)?.[1] ?? 0),
  }));
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });
  let data = { handle: CHANNEL_HANDLE, channelId: CHANNEL_ID, videos: {}, snapshots: [] };
  try {
    data = JSON.parse(await readFile(JSON_FILE, 'utf8'));
  } catch {
    // first run
  }

  const [stats, uploads] = await Promise.all([channelStats(), latestUploads()]);
  // Titles live once in `videos`; each snapshot keeps only [id, views, likes] so the file stays small.
  for (const u of uploads) data.videos[u.id] = { title: u.title, published: u.published };
  const snapshot = { t: new Date().toISOString(), ...stats, u: uploads.map((u) => [u.id, u.views, u.likes]) };
  data.snapshots.push(snapshot);

  await writeFile(JSON_FILE, JSON.stringify(data));
  console.log(
    `${snapshot.t}  subscribers ${stats.subscribers}  views ${stats.views}  videos ${stats.videos}  ` +
      `uploads tracked ${uploads.length}  snapshots ${data.snapshots.length}`
  );
}

main().catch((err) => {
  console.error(`${new Date().toISOString()}  collect failed: ${err.message}`);
  process.exit(1);
});
