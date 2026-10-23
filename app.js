// Dashboard for the snapshots written by collect.mjs (data/snapshots.json).

const HOUR = 3600e3;
const DAY = 24 * HOUR;
const IS_LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);

const tooltip = document.getElementById('tooltip');
const fmt = new Intl.NumberFormat('en');
const fmtDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const fmtDateTime = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

let snaps = [];
let videos = {};
let FORECAST;

// Forecast made on 23 Oct 2026: 2,000 to 3,000 subscribers by 23 Dec if daily Shorts continue.
// The range starts from the first snapshot so day one isn't judged against a line that began at midnight.
function setForecast() {
  FORECAST = {
    start: snaps[0]?.time ?? Date.parse('2026-10-23T00:00:00Z'),
    startSubs: snaps[0]?.subscribers ?? 771,
    end: Date.parse('2026-12-23T00:00:00Z'),
    low: 2000,
    high: 3000,
  };
}

function forecastAt(time) {
  const f = Math.min(1, Math.max(0, (time - FORECAST.start) / (FORECAST.end - FORECAST.start)));
  return {
    low: FORECAST.startSubs + (FORECAST.low - FORECAST.startSubs) * f,
    high: FORECAST.startSubs + (FORECAST.high - FORECAST.startSubs) * f,
  };
}

// Latest snapshot at least `ago` ms older than `time`, or null.
function snapshotBefore(time, ago) {
  for (let i = snaps.length - 1; i >= 0; i--) if (snaps[i].time <= time - ago) return snaps[i];
  return null;
}

function signed(n) {
  return (n > 0 ? '+' : n < 0 ? '−' : '') + fmt.format(Math.abs(n));
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function renderTiles(last) {
  const first = snaps[0];
  const dayAgo = snapshotBefore(last.time, 20 * HOUR);
  const since = (key) => (snaps.length > 1 ? `${signed(last[key] - first[key])} since ${fmtDate.format(first.time)}` : 'first check');
  const lastDay = (key) => (dayAgo ? ` · ${signed(last[key] - dayAgo[key])} last 24h` : '');

  const band = forecastAt(last.time);
  const slack = Math.max(5, last.subscribers * 0.02); // ignore small wobbles, especially in the first days
  let status = { label: 'On track', color: 'var(--good)', detail: 'Inside the forecast range' };
  if (last.subscribers < band.low - slack) status = { label: 'Behind', color: 'var(--critical)', detail: `${fmt.format(Math.round(band.low - last.subscribers))} below the low end` };
  else if (last.subscribers > band.high + slack) status = { label: 'Ahead', color: 'var(--good)', detail: `${fmt.format(Math.round(last.subscribers - band.high))} above the high end` };

  const approx = last.subscribersRounded ? ' <span class="muted" title="YouTube rounds counts above 1,000">≈</span>' : '';
  document.getElementById('tiles').innerHTML = `
    <div class="tile"><div class="label">Subscribers</div>
      <div class="value">${fmt.format(last.subscribers)}${approx}</div>
      <div class="delta">${since('subscribers')}${lastDay('subscribers')}</div></div>
    <div class="tile"><div class="label">Total channel views</div>
      <div class="value">${fmt.format(last.views)}</div>
      <div class="delta">${since('views')}${lastDay('views')}</div></div>
    <div class="tile"><div class="label">Videos</div>
      <div class="value">${fmt.format(last.videos)}</div>
      <div class="delta">${since('videos')}</div></div>
    <div class="tile"><div class="label">Against forecast</div>
      <div class="value status"><span class="dot" style="background:${status.color}"></span>${status.label}</div>
      <div class="delta">${status.detail} (${fmt.format(Math.round(band.low))}–${fmt.format(Math.round(band.high))} expected now)</div></div>`;
}

// Minimal SVG line chart: one series, optional shaded band, crosshair tooltip (mouse and touch).
function lineChart(el, { points, xMin, xMax, band, tooltipRows }) {
  const draw = () => {
    const W = el.clientWidth;
    const H = el.clientHeight;
    const m = { top: 10, right: 12, bottom: 24, left: 44 };
    const iw = W - m.left - m.right;
    const ih = H - m.top - m.bottom;

    let yMax = Math.max(...points.map((p) => p.v));
    let yMin = Math.min(...points.map((p) => p.v));
    if (band) {
      yMax = Math.max(yMax, band(xMax).high);
      yMin = Math.min(yMin, band(xMin).low);
    }
    const pad = (yMax - yMin || yMax || 1) * 0.08;
    yMin = Math.max(0, yMin - pad);
    yMax += pad;

    const x = (t) => m.left + ((t - xMin) / (xMax - xMin)) * iw;
    const y = (v) => m.top + ih - ((v - yMin) / (yMax - yMin)) * ih;

    const yTicks = niceTicks(yMin, yMax, 4);
    const maxLabels = Math.max(2, Math.floor(iw / 70));
    const step = Math.max(DAY, Math.ceil((xMax - xMin) / DAY / maxLabels) * DAY);
    const xTicks = [];
    for (let t = Math.ceil(xMin / DAY) * DAY; t <= xMax; t += step) xTicks.push(t);

    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img">`;
    svg += '<g class="grid">' + yTicks.map((v) => `<line x1="${m.left}" x2="${W - m.right}" y1="${y(v)}" y2="${y(v)}"/>`).join('') + '</g>';
    svg += '<g class="axis">' +
      yTicks.map((v) => `<text x="${m.left - 8}" y="${y(v) + 4}" text-anchor="end">${compact(v)}</text>`).join('') +
      xTicks.map((t) => `<text x="${x(t)}" y="${H - 6}" text-anchor="middle">${fmtDate.format(t)}</text>`).join('') +
      '</g>';

    if (band) {
      const a = band(xMin);
      const b = band(xMax);
      svg += `<path d="M${x(xMin)},${y(a.high)} L${x(xMax)},${y(b.high)} L${x(xMax)},${y(b.low)} L${x(xMin)},${y(a.low)} Z" fill="var(--band)"/>`;
      svg += `<line x1="${x(xMin)}" y1="${y(a.high)}" x2="${x(xMax)}" y2="${y(b.high)}" stroke="var(--band-edge)" stroke-dasharray="4 4"/>`;
      svg += `<line x1="${x(xMin)}" y1="${y(a.low)}" x2="${x(xMax)}" y2="${y(b.low)}" stroke="var(--band-edge)" stroke-dasharray="4 4"/>`;
    }

    const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t)},${y(p.v)}`).join(' ');
    svg += `<path d="${path}" fill="none" stroke="var(--series-1)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    if (points.length <= 60) {
      svg += points.map((p) => `<circle cx="${x(p.t)}" cy="${y(p.v)}" r="4" fill="var(--series-1)" stroke="var(--surface-1)" stroke-width="2"/>`).join('');
    }
    svg += `<line class="crosshair" y1="${m.top}" y2="${m.top + ih}" visibility="hidden"/>`;
    svg += `<rect x="${m.left}" y="${m.top}" width="${iw}" height="${ih}" fill="transparent"/>`;
    svg += '</svg>';
    el.innerHTML = svg;

    const hit = el.querySelector('rect');
    const cross = el.querySelector('.crosshair');
    const show = (e) => {
      const box = el.getBoundingClientRect();
      const tAt = xMin + ((e.clientX - box.left - m.left) / iw) * (xMax - xMin);
      const p = points.reduce((best, q) => (Math.abs(q.t - tAt) < Math.abs(best.t - tAt) ? q : best));
      cross.setAttribute('x1', x(p.t));
      cross.setAttribute('x2', x(p.t));
      cross.setAttribute('visibility', 'visible');
      tooltip.innerHTML = `<div class="t-head">${fmtDateTime.format(p.t)}</div>${tooltipRows(p)}`;
      tooltip.hidden = false;
      const left = Math.max(8, Math.min(e.clientX + 14, window.innerWidth - tooltip.offsetWidth - 8));
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${e.clientY + 14}px`;
    };
    const hide = () => {
      cross.setAttribute('visibility', 'hidden');
      tooltip.hidden = true;
    };
    hit.addEventListener('pointermove', show);
    hit.addEventListener('pointerdown', show);
    hit.addEventListener('pointerleave', hide);
  };
  draw();
  let lastWidth = el.clientWidth;
  new ResizeObserver(() => {
    if (el.clientWidth !== lastWidth) {
      lastWidth = el.clientWidth;
      draw();
    }
  }).observe(el);
}

function niceTicks(min, max, count) {
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * mag).find((s) => s >= raw);
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) ticks.push(v);
  return ticks;
}

function compact(v) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
}

function renderUploads(last) {
  const dayAgo = snapshotBefore(last.time, 20 * HOUR);
  const before = new Map((dayAgo?.u ?? []).map(([id, views]) => [id, views]));
  const rows = last.u.map(([id, views, likes]) => {
    const meta = videos[id] ?? { title: id, published: last.t };
    const posted = Date.parse(meta.published);
    const hours = Math.max(1, (last.time - posted) / HOUR);
    const gained = before.has(id) ? signed(views - before.get(id)) : '<span class="muted">—</span>';
    const likeRate = likes && views ? `${((likes / views) * 100).toFixed(1)}%` : '<span class="muted">—</span>';
    const likesCell = likes ? fmt.format(likes) : '<span class="muted" title="Likes hidden or none">0</span>';
    return `<tr>
      <td class="title"><a href="https://www.youtube.com/shorts/${id}" target="_blank" rel="noopener">${escapeHtml(meta.title)}</a>
        <div class="posted">${fmtDateTime.format(posted)}</div></td>
      <td class="wide">${fmtDateTime.format(posted)}</td>
      <td class="num">${fmt.format(views)}</td>
      <td class="num">${gained}</td>
      <td class="num wide">${fmt.format(Math.round(views / hours))}</td>
      <td class="num wide">${likesCell}</td>
      <td class="num">${likeRate}</td>
    </tr>`;
  });
  document.querySelector('#uploads tbody').innerHTML = rows.join('');
}

function render() {
  const last = snaps[snaps.length - 1];
  document.getElementById('last-checked').textContent = `last checked ${fmtDateTime.format(last.time)}`;
  renderTiles(last);

  lineChart(document.getElementById('subs-chart'), {
    points: snaps.map((s) => ({ t: s.time, v: s.subscribers })),
    xMin: FORECAST.start,
    xMax: FORECAST.end,
    band: forecastAt,
    tooltipRows: (p) => {
      const b = forecastAt(p.t);
      return `<div class="t-val">${fmt.format(p.v)} subscribers</div>
        <div class="muted">Forecast ${fmt.format(Math.round(b.low))}–${fmt.format(Math.round(b.high))}</div>`;
    },
  });

  const t0 = snaps[0].time;
  lineChart(document.getElementById('views-chart'), {
    points: snaps.map((s) => ({ t: s.time, v: s.views })),
    xMin: t0 - (snaps.length > 1 ? 0 : DAY),
    xMax: snaps.length > 1 ? last.time : t0 + DAY,
    tooltipRows: (p) => `<div class="t-val">${fmt.format(p.v)} views</div>`,
  });

  renderUploads(last);
}

async function load() {
  try {
    const res = await fetch(`data/snapshots.json?t=${Date.now()}`, { cache: 'no-store' });
    const data = await res.json();
    videos = data.videos ?? {};
    snaps = (data.snapshots ?? []).map((s) => ({ ...s, time: Date.parse(s.t) }));
  } catch {
    snaps = [];
  }
  setForecast();
  if (!snaps.length) {
    const empty = document.getElementById('empty');
    empty.hidden = false;
    empty.textContent = location.protocol === 'file:'
      ? 'Open this page through the local server (node server.mjs) or the published site; browsers block data loading from a plain file.'
      : 'No checks recorded yet. The first one will appear within the hour.';
    document.getElementById('last-checked').textContent = 'no data yet';
    return;
  }
  render();
}

// Locally, "Refresh" asks server.mjs to take a new snapshot. On the published site it reloads the
// latest hourly check.
const refreshBtn = document.getElementById('refresh');
const refreshStatus = document.getElementById('refresh-status');
refreshBtn.addEventListener('click', async () => {
  refreshBtn.disabled = true;
  refreshBtn.textContent = 'Checking…';
  if (!IS_LOCAL) return location.reload();
  try {
    const res = await fetch('/api/refresh', { method: 'POST' });
    const result = await res.json();
    if (res.ok) return location.reload();
    refreshStatus.textContent = result.output || 'Refresh failed.';
  } catch {
    refreshStatus.textContent = 'Local server not reachable. See README.md to start it.';
  }
  refreshBtn.disabled = false;
  refreshBtn.textContent = 'Refresh';
});

load();
setTimeout(() => location.reload(), 30 * 60e3);
