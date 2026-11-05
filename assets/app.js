/* =========================================================
   League site — public pages, data loading, standings engine
   All league data lives in data/league.json.
   ========================================================= */
(() => {
'use strict';

const DATA_URL = 'data/league.json';
const DRAFT_KEY = 'league.draft.v1';
const S = { published: null, data: null, isDraft: false, draftStale: false };

/* ---------------- utilities ---------------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const uid = (p = 'x') => p + '-' + Math.random().toString(36).slice(2, 8);
const fmtPts = n => { const v = Math.round((Number(n) || 0) * 10) / 10; return String(v); };
const fmtDate = (iso, o = { day: 'numeric', month: 'short', year: 'numeric' }) => iso ? new Date(iso).toLocaleDateString(undefined, o) : 'TBA';
const fmtTime = iso => iso ? new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
const byId = (arr, id) => (arr || []).find(x => x.id === id);

const DEFAULT_SCORING = {
  race: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
  sprint: [8, 7, 6, 5, 4, 3, 2, 1],
  fastestLap: 1, fastestLapTopN: 10, sprintFastestLap: 0, pole: 0
};

const DEFAULT_THEME = { accent: '#39c5bb', accentSoft: '#86cecb', accentDeep: '#137a7f', highlight: '#e12885', bgDark: '#07090c', bgLight: '#f2f8f7', defaultMode: 'dark', allowToggle: true, effects: true };
const DEFAULT_SIGNUPS = { open: false, title: 'Join the grid', intro: '', requirements: '', formUrl: '', seatsPerTeam: 2, showBuilder: true };
const MODE_KEY = 'league.mode';
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { } };
const isHex = v => /^#[0-9a-f]{6}$/i.test(v || '');
const rcName = d => String((d.league && d.league.raceControl) || 'FIA').trim() || 'FIA';
const hasVal = x => x !== '' && x !== null && x !== undefined;
const TZ_BY_CC = { BH: 'Asia/Bahrain', SA: 'Asia/Riyadh', AU: 'Australia/Melbourne', JP: 'Asia/Tokyo', CN: 'Asia/Shanghai', US: 'America/New_York', IT: 'Europe/Rome', MC: 'Europe/Monaco',
  ES: 'Europe/Madrid', CA: 'America/Toronto', AT: 'Europe/Vienna', GB: 'Europe/London', HU: 'Europe/Budapest', BE: 'Europe/Brussels', NL: 'Europe/Amsterdam', AZ: 'Asia/Baku',
  SG: 'Asia/Singapore', MX: 'America/Mexico_City', BR: 'America/Sao_Paulo', QA: 'Asia/Qatar', AE: 'Asia/Dubai', FR: 'Europe/Paris', DE: 'Europe/Berlin', PT: 'Europe/Lisbon',
  TR: 'Europe/Istanbul', RU: 'Europe/Moscow', VN: 'Asia/Ho_Chi_Minh', KR: 'Asia/Seoul', IN: 'Asia/Kolkata', MY: 'Asia/Kuala_Lumpur', AR: 'America/Argentina/Buenos_Aires', ZA: 'Africa/Johannesburg' };
const trackTz = r => r.tz || TZ_BY_CC[String(r.country || '').toUpperCase()] || '';
function fmtIn(iso, tz, opts) { try { return new Date(iso).toLocaleString(undefined, Object.assign({}, opts, tz ? { timeZone: tz } : {})); } catch (e) { return ''; } }

function emptyLeague() {
  return {
    league: { name: 'My F1 League', season: String(new Date().getFullYear()), tagline: '', logo: '', rules: '', links: {} },
    settings: { adminHash: '' },
    scoring: clone(DEFAULT_SCORING),
    teams: [], drivers: [], calendar: [], results: {}, adjustments: [], news: [], stewards: [], history: [],
    theme: clone(DEFAULT_THEME), signups: clone(DEFAULT_SIGNUPS),
    meta: { updated: null }
  };
}

function normalize(x) {
  const base = emptyLeague();
  const d = Object.assign(base, x || {});
  d.league = Object.assign(emptyLeague().league, d.league || {});
  d.league.links = d.league.links || {};
  d.settings = Object.assign({ adminHash: '' }, d.settings || {});
  d.scoring = Object.assign(clone(DEFAULT_SCORING), d.scoring || {});
  d.theme = Object.assign(clone(DEFAULT_THEME), d.theme || {});
  d.signups = Object.assign(clone(DEFAULT_SIGNUPS), d.signups || {});
  ['teams', 'drivers', 'calendar', 'adjustments', 'news', 'stewards', 'history'].forEach(k => { if (!Array.isArray(d[k])) d[k] = []; });
  if (!d.results || typeof d.results !== 'object' || Array.isArray(d.results)) d.results = {};
  d.meta = d.meta || { updated: null };
  return d;
}

function themeMode(d) {
  const t = d.theme;
  let m = (t.allowToggle !== false && lsGet(MODE_KEY)) || t.defaultMode || 'dark';
  if (m === 'system') m = window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  return m === 'light' ? 'light' : 'dark';
}
function applyTheme(d) {
  const t = d.theme, r = document.documentElement;
  const set = (k, v, f) => r.style.setProperty(k, isHex(v) ? v : f);
  set('--miku', t.accent, DEFAULT_THEME.accent);
  set('--miku-soft', t.accentSoft, DEFAULT_THEME.accentSoft);
  set('--miku-deep', t.accentDeep, DEFAULT_THEME.accentDeep);
  set('--pink', t.highlight, DEFAULT_THEME.highlight);
  set('--bg-dark', t.bgDark, DEFAULT_THEME.bgDark);
  set('--bg-light', t.bgLight, DEFAULT_THEME.bgLight);
  const mode = themeMode(d);
  r.dataset.theme = mode;
  r.dataset.effects = t.effects === false ? 'off' : 'on';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = mode === 'light' ? (isHex(t.bgLight) ? t.bgLight : DEFAULT_THEME.bgLight) : (isHex(t.bgDark) ? t.bgDark : DEFAULT_THEME.bgDark);
  const mt = document.getElementById('mode-toggle');
  if (mt) { mt.hidden = t.allowToggle === false; mt.textContent = mode === 'light' ? '☾' : '☀'; mt.title = mode === 'light' ? 'Switch to dark mode' : 'Switch to light mode'; }
}

function flag(cc, cls = '') {
  if (!cc || !/^[a-z]{2}$/i.test(cc)) return '';
  return `<img class="flag ${cls}" src="https://flagcdn.com/w80/${cc.toLowerCase()}.png" alt="${esc(cc.toUpperCase())}" loading="lazy" onerror="this.remove()">`;
}

function nameHTML(n) {
  const parts = String(n || 'Unknown').trim().split(/\s+/);
  const last = parts.pop();
  return `<span class="dname">${parts.length ? `<span class="fn">${esc(parts.join(' '))}</span> ` : ''}<span class="ln">${esc(last)}</span></span>`;
}

const teamColor = t => (t && t.color) || '#39c5bb';
/* freshly uploaded files show from memory until GitHub Pages has rebuilt */
const ASSET_CACHE = {};
const asset = u => ASSET_CACHE[u] || u;
const isImg = u => /\.(png|jpe?g|gif|webp|avif|svg)(\?.*)?$/i.test(String(u || '')) || /^data:image\//.test(String(u || ''));
function avatar(drv, t, size = '') {
  const src = drv && (drv.headshot || drv.photo);
  return `<span class="avatar ${size}" style="--tc:${esc(teamColor(t))}">${src ? `<img src="${esc(asset(src))}" alt="" loading="lazy" onerror="this.remove()">` : esc(drv && drv.number !== undefined ? drv.number : '')}</span>`;
}

/* tiny markdown: # headings, **bold**, *italic*, [links](https://…), - lists, paragraphs */
function md(src) {
  const inline = s => s
    .replace(/!\[([^\]]*)\]\(((?:https?:\/\/|uploads\/|images\/)[^\s)]+)\)/g, (m, alt, u) => `<img class="md-img zoomable" src="${asset(u)}" alt="${alt}" loading="lazy">`)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  let html = '', para = [], list = null;
  const flushP = () => { if (para.length) { html += `<p>${inline(para.join(' '))}</p>`; para = []; } };
  const flushL = () => { if (list) { html += `<ul>${list.map(i => `<li>${inline(i)}</li>`).join('')}</ul>`; list = null; } };
  for (const raw of esc(src || '').split(/\r?\n/)) {
    const t = raw.trim(); let m;
    if (!t) { flushP(); flushL(); continue; }
    if ((m = t.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/))) { flushP(); flushL(); html += `<figure>${inline(t)}${m[1] ? `<figcaption>${m[1]}</figcaption>` : ''}</figure>`; continue; }
    if ((m = t.match(/^(#{1,3})\s+(.*)/))) { flushP(); flushL(); const lv = m[1].length + 1; html += `<h${lv}>${inline(m[2])}</h${lv}>`; continue; }
    if ((m = t.match(/^[-*]\s+(.*)/))) { flushP(); (list = list || []).push(m[1]); continue; }
    flushL(); para.push(t);
  }
  flushP(); flushL();
  return html;
}
const plain = src => String(src || '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/[#*_\[\]()>-]/g, '').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();

function toast(msg, kind = 'ok') {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + kind; el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), kind === 'err' ? 7000 : 3500);
}

/* ---------------- data loading & drafts ---------------- */
async function load() {
  let pub = null;
  try {
    const r = await fetch(DATA_URL + '?t=' + Date.now(), { cache: 'no-store' });
    if (r.ok) pub = await r.json();
  } catch (e) { /* offline or file:// */ }
  if (!pub && window.EMBEDDED_LEAGUE) pub = window.EMBEDDED_LEAGUE;
  if (!pub) pub = emptyLeague();
  S.published = normalize(pub);

  let draft = null;
  try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { }
  if (draft && draft.data) {
    S.data = normalize(draft.data);
    S.isDraft = true;
    S.draftStale = (draft.base || null) !== (S.published.meta.updated || null);
  } else {
    S.data = clone(S.published);
  }
}

function saveDraft() {
  S.isDraft = true;
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ base: S.published.meta.updated || null, saved: new Date().toISOString(), data: S.data })); }
  catch (e) { toast('Could not save draft in this browser (storage full?). Download a backup!', 'err'); }
  updateDraftBanner();
}
function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch (e) { }
  S.isDraft = false; S.draftStale = false;
  updateDraftBanner();
}
function discardDraft() {
  S.data = clone(S.published);
  clearDraft(); render(); toast('Draft discarded — showing the published site.');
}
function updateDraftBanner() {
  const b = document.getElementById('draft-banner');
  if (!b) return;
  const inAdmin = location.hash.startsWith('#/admin');
  if (!S.isDraft || inAdmin) { b.hidden = true; return; }
  b.hidden = false;
  b.innerHTML = `<span>👀 You're previewing <b>unpublished changes</b> (only visible in this browser).${S.draftStale ? ' ⚠️ The live site changed since this draft was started.' : ''}</span>
    <a class="btn xs primary" href="#/admin/publish">Publish</a>
    <button class="btn xs ghost" data-act="discard-draft">Discard</button>`;
}

/* ---------------- league maths ---------------- */
const rounds = d => [...d.calendar].sort((a, b) => (Number(a.round) || 0) - (Number(b.round) || 0));
const session = (d, rid, s) => (d.results[rid] && Array.isArray(d.results[rid][s])) ? d.results[rid][s] : [];
const isDone = (d, r) => session(d, r.id, 'race').length > 0;
const nextRound = d => rounds(d).find(r => !isDone(d, r) && !r.cancelled);
const lastRound = d => rounds(d).filter(r => isDone(d, r)).pop();

function poleDriver(d, rid) {
  const flagged = session(d, rid, 'race').find(e => e.pole);
  if (flagged) return flagged.driverId;
  const q = classify(session(d, rid, 'quali'), 'quali', d.scoring);
  return q.length && q[0].pos === 1 ? q[0].driverId : null;
}

/* Turns an ordered list of entries into classified rows with positions & points.
   Order in the array = finishing order. Non-finishers (DNF/DSQ/DNS) get no position. */
function classify(entries, type, sc, pole) {
  const fin = [], other = [];
  (entries || []).forEach(e => ((e.status || 'FIN') === 'FIN' ? fin : other).push(e));
  const table = type === 'race' ? (sc.race || []) : type === 'sprint' ? (sc.sprint || []) : [];
  const hasOverride = e => e.pointsOverride !== undefined && e.pointsOverride !== null && e.pointsOverride !== '';
  const out = fin.map((e, i) => {
    const pos = i + 1;
    let pts = Number(table[i]) || 0;
    if (type !== 'quali' && e.fastestLap) {
      const fl = Number(type === 'race' ? sc.fastestLap : sc.sprintFastestLap) || 0;
      const topN = Number(sc.fastestLapTopN) || 0;
      if (fl && (!topN || pos <= topN)) pts += fl;
    }
    if (type === 'race' && pole && e.driverId === pole) pts += Number(sc.pole) || 0;
    if (hasOverride(e)) pts = Number(e.pointsOverride) || 0;
    return { ...e, status: 'FIN', pos, label: String(pos), pts };
  });
  const order = { DNF: 0, DSQ: 1, DNS: 2 };
  other.map((e, i) => ({ e, i })).sort((a, b) => (order[a.e.status] ?? 9) - (order[b.e.status] ?? 9) || a.i - b.i)
    .forEach(({ e }) => {
      let pts = 0;
      if (type === 'race' && pole && e.driverId === pole && e.status !== 'DSQ') pts += Number(sc.pole) || 0;
      if (hasOverride(e)) pts = Number(e.pointsOverride) || 0;
      out.push({ ...e, pos: null, label: e.status, pts });
    });
  if (type === 'quali') out.forEach(o => { o.pts = 0; });
  return out;
}

function countback(a, b) {
  const n = Math.max(a.counts.length, b.counts.length);
  for (let i = 0; i < n; i++) { const diff = (b.counts[i] || 0) - (a.counts[i] || 0); if (diff) return diff; }
  return 0;
}

function computeStandings(d) {
  const sc = d.scoring, D = {}, T = {};
  const dRow = id => D[id] || (D[id] = { id, points: 0, wins: 0, podiums: 0, poles: 0, fls: 0, dnfs: 0, starts: 0, best: null, adj: 0, counts: [], rounds: {}, lastTeam: null });
  const tRow = id => T[id] || (T[id] = { id, points: 0, wins: 0, podiums: 0, poles: 0, adj: 0, counts: [], rounds: {} });
  d.drivers.forEach(x => dRow(x.id));
  d.teams.forEach(x => tRow(x.id));

  for (const r of rounds(d)) {
    if (!d.results[r.id]) continue;
    const pole = poleDriver(d, r.id);
    for (const type of ['sprint', 'race']) {
      for (const e of classify(session(d, r.id, type), type, sc, pole)) {
        if (!e.driverId) continue;
        const dr = dRow(e.driverId), tr = e.teamId ? tRow(e.teamId) : null;
        dr.points += e.pts; if (tr) tr.points += e.pts;
        const rr = dr.rounds[r.id] || (dr.rounds[r.id] = { pts: 0 });
        rr.pts += e.pts; rr[type] = { pos: e.pos, label: e.label, pts: e.pts, teamId: e.teamId, fl: !!e.fastestLap };
        if (tr) { const tt = tr.rounds[r.id] || (tr.rounds[r.id] = { pts: 0 }); tt.pts += e.pts; }
        if (type === 'race') {
          if (e.teamId) dr.lastTeam = e.teamId;
          if (e.status !== 'DNS') dr.starts++;
          if (e.status === 'DNF') dr.dnfs++;
          if (e.fastestLap) dr.fls++;
          if (e.pos) {
            dr.counts[e.pos - 1] = (dr.counts[e.pos - 1] || 0) + 1;
            if (tr) tr.counts[e.pos - 1] = (tr.counts[e.pos - 1] || 0) + 1;
            if (e.pos === 1) { dr.wins++; if (tr) tr.wins++; }
            if (e.pos <= 3) { dr.podiums++; if (tr) tr.podiums++; }
            if (!dr.best || e.pos < dr.best) dr.best = e.pos;
          }
        }
      }
    }
    if (pole) {
      dRow(pole).poles++;
      const pe = session(d, r.id, 'race').find(e => e.driverId === pole) || session(d, r.id, 'quali').find(e => e.driverId === pole);
      if (pe && pe.teamId) tRow(pe.teamId).poles++;
    }
  }
  for (const a of d.adjustments) {
    if (!a.targetId) continue;
    const row = a.type === 'team' ? tRow(a.targetId) : dRow(a.targetId);
    const p = Number(a.points) || 0;
    row.points += p; row.adj += p;
    if (a.roundId) { const rr = row.rounds[a.roundId] || (row.rounds[a.roundId] = { pts: 0 }); rr.pts += p; rr.adj = (rr.adj || 0) + p; }
  }
  for (const s of d.stewards) {
    const p = Number(s.points) || 0;
    if (!s.driverId || !p) continue;
    const bump = row => { row.points += p; row.adj += p; if (s.roundId) { const rr = row.rounds[s.roundId] || (row.rounds[s.roundId] = { pts: 0 }); rr.pts += p; rr.adj = (rr.adj || 0) + p; } };
    bump(dRow(s.driverId));
    if (s.teamToo) {
      const ent = s.roundId ? [...session(d, s.roundId, 'race'), ...session(d, s.roundId, 'sprint')].find(e => e.driverId === s.driverId) : null;
      const tid = (ent && ent.teamId) || (byId(d.drivers, s.driverId) || {}).teamId;
      if (tid) bump(tRow(tid));
    }
  }
  const cmp = (a, b) => b.points - a.points || countback(a, b);
  const drivers = Object.values(D).filter(x => {
    const drv = byId(d.drivers, x.id);
    return (drv && drv.active !== false) || x.starts > 0 || x.points !== 0;
  }).sort(cmp);
  drivers.forEach((x, i) => { x.position = i + 1; });
  const teams = Object.values(T).filter(x => byId(d.teams, x.id) || x.points !== 0).sort(cmp);
  teams.forEach((x, i) => { x.position = i + 1; });
  return { drivers, teams, D, T };
}

const driverTeam = (d, drv, st) => byId(d.teams, (drv && drv.teamId) || (st && st.lastTeam));
const driverLabel = (d, id) => byId(d.drivers, id) || { id, name: 'Unknown driver', number: '' };
const teamLabel = (d, id) => byId(d.teams, id) || { id, name: id ? 'Unknown team' : '—', color: '#555' };

/* ---------------- shared snippets ---------------- */
const head = (eyebrow, title, sub) => `<div class="page-head"><div class="eyebrow">${esc(eyebrow)}</div><h1>${title}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div>`;
const empty = (t, s) => `<div class="empty"><b>${esc(t)}</b>${s || ''}</div>`;
const teamCell = t => `<span class="swatch" style="--tc:${esc(teamColor(t))}"></span><span class="team-name">${esc(t ? t.name : '—')}</span>`;
const sessionName = s => ({ race: 'Race', sprint: 'Sprint', quali: 'Qualifying' }[s] || s);

function roundStatus(d, r) {
  if (r.cancelled) return ['cancelled', 'Cancelled'];
  if (isDone(d, r)) return ['done', 'Completed'];
  const n = nextRound(d);
  if (n && n.id === r.id) {
    if (r.start && new Date(r.start) < Date.now()) return ['live', 'Results pending'];
    return ['next', 'Next race'];
  }
  return ['upcoming', 'Upcoming'];
}

function countdownHTML(iso) {
  if (!iso) return `<div class="countdown over">Date to be announced</div>`;
  return `<div class="countdown" data-countdown="${esc(iso)}">
    <div><b data-u="d">00</b><span>Days</span></div><div><b data-u="h">00</b><span>Hrs</span></div>
    <div><b data-u="m">00</b><span>Min</span></div><div><b data-u="s">00</b><span>Sec</span></div></div>`;
}
function tick() {
  document.querySelectorAll('[data-cd-short]').forEach(el => {
    const ms = new Date(el.dataset.cdShort) - Date.now();
    if (ms <= 0) { raceBar(); return; }
    const dd = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60, sec = Math.floor(ms / 1e3) % 60;
    el.textContent = 'in ' + (dd ? `${dd}d ${h}h` : h ? `${h}h ${m}m` : `${m}m ${sec}s`);
  });
  document.querySelectorAll('[data-countdown]').forEach(el => {
    const ms = new Date(el.dataset.countdown) - Date.now();
    if (ms <= 0) { el.className = 'countdown over'; el.removeAttribute('data-countdown'); el.textContent = '🏁 Lights out! Results coming soon.'; return; }
    const v = { d: Math.floor(ms / 864e5), h: Math.floor(ms / 36e5) % 24, m: Math.floor(ms / 6e4) % 60, s: Math.floor(ms / 1e3) % 60 };
    for (const k in v) { const b = el.querySelector(`[data-u="${k}"]`); if (b) b.textContent = String(v[k]).padStart(2, '0'); }
  });
}
setInterval(tick, 1000);

/* ---------------- pages ---------------- */
function pageHome(d) {
  const st = computeStandings(d);
  const nx = nextRound(d), last = lastRound(d);
  const words = esc(d.league.name).split(' ');
  const title = words.length > 1 ? `${words.slice(0, -1).join(' ')} <span class="accent">${words.slice(-1)}</span>` : `<span class="accent">${words[0]}</span>`;
  const done = rounds(d).filter(r => isDone(d, r)).length, total = rounds(d).filter(r => !r.cancelled).length;

  const nextCard = nx ? `<div class="next-card">
      <div class="nc-top"><span class="eyebrow" style="margin:0">Round ${esc(nx.round)} · Up next</span>${nx.sprint ? '<span class="badge sprint">Sprint weekend</span>' : ''}</div>
      <div style="display:flex;gap:12px;align-items:center">${flag(nx.country, 'lg')}<h2>${esc(nx.name)}</h2></div>
      <div class="nc-meta"><span>${esc(nx.track || '')}</span>${nx.start ? `<span>·</span><span class="mono">${fmtDate(nx.start, { weekday: 'short', day: 'numeric', month: 'short' })} · ${fmtTime(nx.start)}</span>` : ''}</div>
      ${countdownHTML(nx.start)}
      <div class="hero-cta"><a class="btn sm" href="#/schedule">Full calendar →</a></div>
    </div>`
    : `<div class="next-card"><span class="eyebrow">Season status</span><h2>${total && done >= total ? 'Season complete 🏆' : 'Calendar coming soon'}</h2>
       ${st.drivers[0] && done ? `<p class="nc-meta">Champion: ${nameHTML(driverLabel(d, st.drivers[0].id).name)}</p>` : ''}</div>`;

  let podium = empty('No races yet', '<p>The first podium will appear here.</p>');
  if (last) {
    const cl = classify(session(d, last.id, 'race'), 'race', d.scoring, poleDriver(d, last.id)).filter(e => e.pos && e.pos <= 3);
    const step = p => {
      const e = cl.find(x => x.pos === p); if (!e) return '<div class="step"></div>';
      const drv = driverLabel(d, e.driverId), t = teamLabel(d, e.teamId);
      return `<div class="step p${p}" style="--tc:${esc(teamColor(t))}"><div class="who"><a href="#/driver/${esc(drv.id)}">${nameHTML(drv.name)}</a><small>${esc(t.name)}</small></div><div class="block">${p}</div></div>`;
    };
    podium = `<div class="podium">${step(2)}${step(1)}${step(3)}</div>`;
  }

  const miniD = st.drivers.slice(0, 6).map(x => { const drv = driverLabel(d, x.id), t = driverTeam(d, drv, x); return `<li><span class="p">${x.position}</span><span class="swatch" style="--tc:${esc(teamColor(t))}"></span><a class="grow" href="#/driver/${esc(x.id)}">${nameHTML(drv.name)}</a><span class="v">${fmtPts(x.points)}</span></li>`; }).join('');
  const miniT = st.teams.slice(0, 6).map(x => { const t = teamLabel(d, x.id); return `<li><span class="p">${x.position}</span><span class="swatch" style="--tc:${esc(teamColor(t))}"></span><a class="grow" href="#/team/${esc(x.id)}">${esc(t.name)}</a><span class="v">${fmtPts(x.points)}</span></li>`; }).join('');

  const news = sortedNews(d).slice(0, 3);

  return `<div class="page">
    <section class="hero">
      <div class="hero-text">
        <div class="eyebrow">Season ${esc(d.league.season)}${total ? ` · Round ${Math.min(done + (nx ? 1 : 0), total)} of ${total}` : ''}</div>
        <h1>${title}</h1>
        ${d.league.tagline ? `<p>${esc(d.league.tagline)}</p>` : ''}
        <div class="hero-cta"><a class="btn primary" href="#/standings">Championship standings</a><a class="btn ghost" href="#/results">Latest results</a>${d.signups.open ? '<a class="btn ghost" href="#/join">✦ Join the league</a>' : ''}</div>
      </div>
      ${nextCard}
    </section>

    <section class="grid grid-3">
      <div class="card">
        <div class="card-title"><h3>${last ? `${esc(last.name)} podium` : 'Latest podium'}</h3>${last ? `<a href="#/results/${esc(last.id)}">Full result →</a>` : ''}</div>
        ${podium}
      </div>
      <div class="card"><div class="card-title"><h3>Drivers</h3><a href="#/standings">All →</a></div>${miniD ? `<ul class="mini">${miniD}</ul>` : empty('No drivers yet')}</div>
      <div class="card"><div class="card-title"><h3>Constructors</h3><a href="#/standings/teams">All →</a></div>${miniT ? `<ul class="mini">${miniT}</ul>` : empty('No teams yet')}</div>
    </section>

    ${(() => { const r = rounds(d).filter(x => dotdOf(d, x.id)).pop(); return r ? `<section>${dotdCard(d, r.id, true)}</section>` : ''; })()}
    <section>
      <div class="section-title"><h2>Latest news</h2><a href="#/news">All news →</a></div>
      ${news.length ? `<div class="news-grid">${news.map(n => newsCard(n)).join('')}</div>` : empty('No news yet', '<p>Posts written in the admin console show up here.</p>')}
    </section>
  </div>`;
}

function pageSchedule(d) {
  const rs = rounds(d);
  const cards = rs.map(r => {
    const [cls, label] = roundStatus(d, r);
    let winner = '';
    if (isDone(d, r)) {
      const w = classify(session(d, r.id, 'race'), 'race', d.scoring).find(e => e.pos === 1);
      if (w) { const drv = driverLabel(d, w.driverId), t = teamLabel(d, w.teamId); winner = `<div class="rc-winner"><span class="swatch" style="--tc:${esc(teamColor(t))}"></span>🏆 ${nameHTML(drv.name)}</div>`; }
    }
    return `<a class="round-card ${cls}" href="#/results/${esc(r.id)}">
      <span class="big-n">${esc(r.round)}</span>
      <div class="rc-top"><span class="rc-round">Round ${esc(r.round)}</span><span style="display:flex;gap:6px">${r.sprint ? '<span class="badge sprint">Sprint</span>' : ''}<span class="badge ${cls}">${label}</span></span></div>
      <div>${flag(r.country, 'lg')}</div>
      <h3>${esc(r.name)}</h3>
      <div class="rc-track">${esc(r.track || '')}</div>
      <div class="rc-date">${r.start ? `${fmtDate(r.start, { weekday: 'short', day: 'numeric', month: 'short' })} · ${fmtTime(r.start)}` : 'Date TBA'}</div>
      ${winner}
    </a>`;
  }).join('');
  return `<div class="page">${head('Season ' + d.league.season, 'Calendar', 'Every round of the season. Times are shown in your local time zone.')}
    ${rs.length ? `<div class="round-grid">${cards}</div>` : empty('No rounds scheduled yet')}</div>`;
}

function pageResultsIndex(d) {
  const rs = rounds(d).filter(r => !r.cancelled);
  const rows = rs.map(r => {
    const done = isDone(d, r);
    let w = null, fl = null;
    if (done) {
      const cl = classify(session(d, r.id, 'race'), 'race', d.scoring);
      w = cl.find(e => e.pos === 1); fl = cl.find(e => e.fastestLap);
    }
    const pole = done ? poleDriver(d, r.id) : null;
    const wd = w && driverLabel(d, w.driverId), wt = w && teamLabel(d, w.teamId);
    return `<tr>
      <td class="pos">${esc(r.round)}</td>
      <td><a href="#/results/${esc(r.id)}">${flag(r.country)}&nbsp; ${esc(r.name)}</a>${r.sprint ? ' <span class="badge sprint">Sprint</span>' : ''}</td>
      <td class="mono hide-sm">${r.start ? fmtDate(r.start, { day: 'numeric', month: 'short' }) : 'TBA'}</td>
      <td>${wd ? `<a href="#/driver/${esc(wd.id)}">${nameHTML(wd.name)}</a>` : '<span class="muted">—</span>'}</td>
      <td class="hide-sm">${wt ? teamCell(wt) : ''}</td>
      <td class="hide-sm">${pole ? nameHTML(driverLabel(d, pole).name) : '<span class="muted">—</span>'}</td>
      <td class="hide-sm">${fl ? nameHTML(driverLabel(d, fl.driverId).name) : '<span class="muted">—</span>'}</td>
      <td class="hide-sm">${dotdOf(d, r.id) ? nameHTML(driverLabel(d, dotdOf(d, r.id).driverId).name) : '<span class="muted">—</span>'}</td>
      <td class="mono hide-sm">${esc((w && w.laps) || r.laps || '')}</td>
    </tr>`;
  }).join('');
  return `<div class="page">${head('Season ' + d.league.season, 'Race results', 'Pick a round for the full classification, sprint and qualifying.')}
    ${roundPicker(d, null)}
    ${rs.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Rd</th><th>Grand Prix</th><th class="hide-sm">Date</th><th>Winner</th><th class="hide-sm">Team</th><th class="hide-sm">Pole</th><th class="hide-sm">Fastest lap</th><th class="hide-sm">DOTD</th><th class="hide-sm">Laps</th></tr></thead><tbody>${rows}</tbody></table></div>` : empty('No rounds yet')}
  </div>`;
}

function roundPicker(d, activeId) {
  const rs = rounds(d).filter(r => !r.cancelled);
  if (!rs.length) return '';
  return `<div class="round-picker"><a href="#/results" class="${!activeId ? 'active' : ''}">All rounds</a>${rs.map(r => `<a href="#/results/${esc(r.id)}" class="${r.id === activeId ? 'active' : ''} ${isDone(d, r) ? '' : 'pending'}">${flag(r.country)} R${esc(r.round)}</a>`).join('')}</div>`;
}

function pageRound(d, rid, sess) {
  const r = byId(d.calendar, rid);
  if (!r) return notFound();
  const avail = ['race', 'sprint', 'quali'].filter(s => s === 'race' || session(d, rid, s).length || (s === 'sprint' && r.sprint));
  sess = avail.includes(sess) ? sess : 'race';
  const pole = poleDriver(d, rid);
  const cl = classify(session(d, rid, sess), sess, d.scoring, pole);
  const rs = rounds(d).filter(x => !x.cancelled);
  const idx = rs.findIndex(x => x.id === rid);
  const prev = rs[idx - 1], next = rs[idx + 1];
  const isQ = sess === 'quali';

  const rows = cl.map(e => {
    const drv = driverLabel(d, e.driverId), t = teamLabel(d, e.teamId);
    return `<tr class="${e.pos && e.pos <= 3 ? 'top' + e.pos : ''}">
      <td class="pos">${e.pos ? e.pos : `<span class="status">${esc(e.label)}</span>`}</td>
      <td class="num muted hide-sm">${esc(drv.number ?? '')}</td>
      <td>${avatar(drv, t, 'sm')}<a href="#/driver/${esc(drv.id)}">${nameHTML(drv.name)}</a>${e.fastestLap && !isQ ? '<span class="tag-fl">FL</span>' : ''}${!isQ && sess === 'race' && pole === e.driverId ? '<span class="tag-pole">POLE</span>' : ''}</td>
      <td>${teamCell(t)}</td>
      ${isQ ? '' : `<td class="mono hide-sm">${esc(e.laps ?? '')}</td>`}
      <td class="mono">${esc(e.time || (e.pos ? '' : e.status))}</td>
      ${isQ ? '' : `<td class="pts">${fmtPts(e.pts)}</td>`}
    </tr>`;
  }).join('');

  const tabs = avail.length > 1 ? `<div class="tabs">${avail.map(s => `<a href="#/results/${esc(rid)}/${s}" class="${s === sess ? 'active' : ''}">${sessionName(s)}</a>`).join('')}</div>` : '';
  const dotdHTML = dotdOf(d, rid) ? `<section>${dotdCard(d, rid)}</section>` : '';
  const sds = d.stewards.filter(x => x.roundId === rid);
  const sdHTML = sds.length ? `<section><div class="section-title"><h2>${esc(rcName(d))} decisions</h2><a href="#/stewards/${esc(rid)}">All for this round →</a></div><div class="sd-list">${sds.map(x => stewardCard(d, x, true)).join('')}</div></section>` : '';
  const notes = r.notes ? `<div class="card" style="margin-top:20px"><div class="prose">${md(r.notes)}</div></div>` : '';

  return `<div class="page">
    ${roundPicker(d, rid)}
    <div class="page-head"><div class="eyebrow">Round ${esc(r.round)} · ${esc(sessionName(sess))}</div>
      <div class="round-head">${flag(r.country, 'lg')}<h1 style="margin:0">${esc(r.name)}</h1>
        <div class="round-nav">${prev ? `<a class="btn sm" href="#/results/${esc(prev.id)}">← R${esc(prev.round)}</a>` : ''}${next ? `<a class="btn sm" href="#/results/${esc(next.id)}">R${esc(next.round)} →</a>` : ''}</div>
      </div>
      <div class="rh-meta"><span>${esc(r.track || '')}</span>${r.start ? `<span class="mono">${fmtDate(r.start, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span><span class="mono">${fmtTime(r.start)} your time${trackTz(r) ? ' · ' + esc(fmtIn(r.start, trackTz(r), { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })) + ' track time' : ''}</span>` : ''}${r.laps ? `<span>${esc(r.laps)} laps</span>` : ''}</div>
    </div>
    ${tabs}
    ${cl.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Pos</th><th class="hide-sm">No</th><th>Driver</th><th>Team</th>${isQ ? '' : '<th class="hide-sm">Laps</th>'}<th>${isQ ? 'Lap time' : 'Time / Retired'}</th>${isQ ? '' : '<th class="r">Pts</th>'}</tr></thead><tbody>${rows}</tbody></table></div>`
      : empty(r.cancelled ? 'This round was cancelled' : 'No results yet', r.start ? `<p>${esc(sessionName(sess))} scheduled for ${fmtDate(r.start)} · ${fmtTime(r.start)}</p>` : '')}
    ${dotdHTML}
    ${notes}
    ${sdHTML}
  </div>`;
}

function pageStandings(d, view) {
  view = ['drivers', 'teams', 'grid', 'progress'].includes(view) ? view : 'drivers';
  const st = computeStandings(d);
  const tabs = `<div class="tabs">${[['drivers', 'Drivers'], ['teams', 'Constructors'], ['grid', 'Season grid'], ['progress', 'Progression']].map(([k, l]) => `<a href="#/standings/${k}" class="${k === view ? 'active' : ''}">${l}</a>`).join('')}</div>`;
  let body = '';
  if (view === 'drivers') {
    body = st.drivers.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Pos</th><th>Driver</th><th class="hide-sm">Nat</th><th>Team</th><th class="r hide-sm">Wins</th><th class="r hide-sm">Podiums</th><th class="r">Pts</th></tr></thead><tbody>
      ${st.drivers.map(x => { const drv = driverLabel(d, x.id), t = driverTeam(d, drv, x); return `<tr class="${x.position <= 3 ? 'top' + x.position : ''}"><td class="pos">${x.position}</td><td>${avatar(drv, t, 'sm')}<a href="#/driver/${esc(x.id)}">${nameHTML(drv.name)}</a>${x.adj ? `<span class="adj-note" title="Includes penalties/adjustments">(${x.adj > 0 ? '+' : ''}${fmtPts(x.adj)})</span>` : ''}</td><td class="hide-sm">${flag(drv.country)}</td><td>${teamCell(t)}</td><td class="r mono hide-sm">${x.wins}</td><td class="r mono hide-sm">${x.podiums}</td><td class="pts">${fmtPts(x.points)}</td></tr>`; }).join('')}
      </tbody></table></div>` : empty('No drivers yet');
  } else if (view === 'teams') {
    body = st.teams.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Pos</th><th>Team</th><th class="hide-sm">Drivers</th><th class="r hide-sm">Wins</th><th class="r hide-sm">Podiums</th><th class="r">Pts</th></tr></thead><tbody>
      ${st.teams.map(x => { const t = teamLabel(d, x.id); const drs = d.drivers.filter(p => p.teamId === x.id && p.active !== false).map(p => esc(p.name.split(' ').pop())).join(' / '); return `<tr class="${x.position <= 3 ? 'top' + x.position : ''}"><td class="pos">${x.position}</td><td><a href="#/team/${esc(x.id)}">${teamCell(t)}</a>${x.adj ? `<span class="adj-note">(${x.adj > 0 ? '+' : ''}${fmtPts(x.adj)})</span>` : ''}</td><td class="muted hide-sm">${drs}</td><td class="r mono hide-sm">${x.wins}</td><td class="r mono hide-sm">${x.podiums}</td><td class="pts">${fmtPts(x.points)}</td></tr>`; }).join('')}
      </tbody></table></div>` : empty('No teams yet');
  } else if (view === 'progress') {
    body = progressChart(d, st);
  } else {
    const rs = rounds(d).filter(r => !r.cancelled);
    const cellFor = (x, r) => {
      const rr = x.rounds[r.id];
      if (!rr || !rr.race) return isDone(d, r) ? '<span class="cell blank">–</span>' : '<span class="cell blank">·</span>';
      const race = rr.race;
      const sp = rr.sprint && rr.sprint.pos ? `<span class="s">S${rr.sprint.pos}</span>` : '';
      if (!race.pos) return `<span class="cell dnf">${esc(race.label)}${sp}</span>`;
      const cls = race.pos <= 3 ? 'p' + race.pos : (race.pts > 0 ? 'pts' : 'nopts');
      return `<span class="cell ${cls}" title="${fmtPts(rr.pts)} pts">${race.pos}${race.fl ? '•' : ''}${sp}</span>`;
    };
    body = st.drivers.length ? `<div class="table-wrap"><table class="tbl matrix"><thead><tr><th>Pos</th><th>Driver</th>${rs.map(r => `<th title="${esc(r.name)}">${flag(r.country)}<small>R${esc(r.round)}</small></th>`).join('')}<th class="r">Pts</th></tr></thead><tbody>
      ${st.drivers.map(x => { const drv = driverLabel(d, x.id), t = driverTeam(d, drv, x); return `<tr><td class="pos">${x.position}</td><td><span class="swatch" style="--tc:${esc(teamColor(t))}"></span><a href="#/driver/${esc(x.id)}">${nameHTML(drv.name)}</a></td>${rs.map(r => `<td>${cellFor(x, r)}</td>`).join('')}<td class="pts">${fmtPts(x.points)}</td></tr>`; }).join('')}
      </tbody></table></div>
      <div class="legend"><span><span class="cell p1">1</span>Win</span><span><span class="cell p2">2</span><span class="cell p3">3</span>Podium</span><span><span class="cell pts">7</span>Points</span><span><span class="cell nopts">14</span>No points</span><span><span class="cell dnf">DNF</span>Retired</span><span>• fastest lap</span><span>S = sprint finish</span></div>` : empty('No drivers yet');
  }
  return `<div class="page">${head('Season ' + d.league.season, 'Championship standings', '')}${tabs}${body}</div>`;
}

function pageDrivers(d) {
  const st = computeStandings(d);
  const active = d.drivers.filter(x => x.active !== false).sort((a, b) => ((st.D[a.id] || {}).position || 999) - ((st.D[b.id] || {}).position || 999));
  const former = d.drivers.filter(x => x.active === false);
  const card = drv => {
    const s = st.D[drv.id] || { points: 0 }, t = driverTeam(d, drv, s);
    return `<a class="driver-card${drv.photo ? ' has-photo' : ''}" href="#/driver/${esc(drv.id)}" style="--tc:${esc(teamColor(t))}">
      <div class="dc-pos">${s.position ? 'P' + s.position + ' in championship' : 'Driver'}</div>
      <div class="dc-pts"><b>${fmtPts(s.points)}</b><span>PTS</span></div>
      ${drv.photo ? `<img class="dc-photo" src="${esc(asset(drv.photo))}" alt="" loading="lazy" onerror="this.remove()">` : `<div class="dc-num">${esc(drv.number ?? '')}</div>`}
      <div class="dc-name">${nameHTML(drv.name)}</div>
      <div class="dc-team">${flag(drv.country)} <span>${esc(t ? t.name : 'Free agent')}</span></div>
    </a>`;
  };
  return `<div class="page">${head('Season ' + d.league.season, 'Drivers', `${active.length} drivers on the grid.`)}
    ${active.length ? `<div class="driver-grid">${active.map(card).join('')}</div>` : empty('No drivers yet', '<p>Add drivers from the admin console.</p>')}
    ${former.length ? `<section><div class="section-title"><h2>Former / reserve drivers</h2></div><div class="driver-grid">${former.map(card).join('')}</div></section>` : ''}
  </div>`;
}

function pageDriver(d, id) {
  const drv = byId(d.drivers, id);
  const st = computeStandings(d);
  const s = st.D[id];
  if (!drv && !s) return notFound();
  const D = drv || driverLabel(d, id), x = s || { points: 0, wins: 0, podiums: 0, poles: 0, fls: 0, dnfs: 0, starts: 0, rounds: {} };
  const t = driverTeam(d, D, x);
  const rows = rounds(d).filter(r => x.rounds[r.id]).map(r => {
    const rr = x.rounds[r.id], race = rr.race, sp = rr.sprint;
    const rt = race ? teamLabel(d, race.teamId) : null;
    return `<tr><td class="pos">${esc(r.round)}</td><td><a href="#/results/${esc(r.id)}">${flag(r.country)}&nbsp; ${esc(r.name)}</a></td><td class="hide-sm">${rt ? teamCell(rt) : ''}</td>
      <td class="mono">${sp ? esc(sp.label) : '<span class="muted">—</span>'}</td>
      <td class="mono">${race ? (race.pos ? race.pos : `<span class="status">${esc(race.label)}</span>`) + (race.fl ? '<span class="tag-fl">FL</span>' : '') : '<span class="muted">—</span>'}</td>
      <td class="pts">${fmtPts(rr.pts)}${rr.adj ? `<span class="adj-note">(${rr.adj > 0 ? '+' : ''}${fmtPts(rr.adj)})</span>` : ''}</td></tr>`;
  }).join('');
  const adjs = d.adjustments.filter(a => a.type !== 'team' && a.targetId === id)
    .concat(d.stewards.filter(x => x.driverId === id && Number(x.points)).map(x => ({ points: Number(x.points), reason: (x.title || rcName(d) + ' decision') + (x.penalty ? ' — ' + x.penalty : ''), roundId: x.roundId })));
  return `<div class="page">
    <a class="back" href="#/drivers">← All drivers</a>
    <div class="profile-hero" style="--tc:${esc(teamColor(t))}">
      ${D.photo ? `<img class="ph-photo" src="${esc(asset(D.photo))}" alt="" onerror="this.remove()">` : `<div class="ph-num">${esc(D.number ?? '')}</div>`}
      <div class="eyebrow">${x.position ? `P${x.position} · ` : ''}${esc(t ? t.name : 'Free agent')}</div>
      <h1>${nameHTML(D.name).replace('class="dname"', 'class="dname"')}</h1>
      <div class="ph-meta">${flag(D.country, 'lg')}${D.number !== undefined && D.number !== '' ? `<span class="mono">#${esc(D.number)}</span>` : ''}${D.active === false ? '<span class="pill-inactive">Inactive</span>' : ''}</div>
      ${D.bio ? `<div class="bio prose">${md(D.bio)}</div>` : ''}
    </div>
    <div class="stats">
      <div class="stat"><b>${x.position || '—'}</b><span>Position</span></div>
      <div class="stat"><b>${fmtPts(x.points)}</b><span>Points</span></div>
      <div class="stat"><b>${x.wins}</b><span>Wins</span></div>
      <div class="stat"><b>${x.podiums}</b><span>Podiums</span></div>
      <div class="stat"><b>${x.poles}</b><span>Poles</span></div>
      <div class="stat"><b>${x.fls}</b><span>Fastest laps</span></div>
      <div class="stat"><b>${x.best ? 'P' + x.best : '—'}</b><span>Best finish</span></div>
      <div class="stat"><b>${x.dnfs}</b><span>DNFs</span></div>
      <div class="stat"><b>${rounds(d).filter(r => (dotdOf(d, r.id) || {}).driverId === id).length}</b><span>Driver of the Day</span></div>
    </div>
    <div class="section-title"><h2>Season results</h2></div>
    ${rows ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Rd</th><th>Grand Prix</th><th class="hide-sm">Team</th><th>Sprint</th><th>Race</th><th class="r">Pts</th></tr></thead><tbody>${rows}</tbody></table></div>` : empty('No results yet')}
    ${adjs.length ? `<section><div class="section-title"><h2>Penalties & adjustments</h2></div><div class="table-wrap"><table class="tbl"><tbody>${adjs.map(a => `<tr><td class="pts" style="text-align:left;width:80px">${a.points > 0 ? '+' : ''}${fmtPts(a.points)}</td><td>${esc(a.reason || '')}</td><td class="muted">${a.roundId && byId(d.calendar, a.roundId) ? 'R' + esc(byId(d.calendar, a.roundId).round) : ''}</td></tr>`).join('')}</tbody></table></div></section>` : ''}
  </div>`;
}

function pageTeams(d) {
  const st = computeStandings(d);
  const list = [...d.teams].sort((a, b) => ((st.T[a.id] || {}).position || 999) - ((st.T[b.id] || {}).position || 999));
  const cards = list.map(t => {
    const s = st.T[t.id] || { points: 0 };
    const drs = d.drivers.filter(x => x.teamId === t.id && x.active !== false);
    return `<a class="team-card" href="#/team/${esc(t.id)}" style="--tc:${esc(teamColor(t))}">
      <div class="tc-head"><div><div class="tc-pos">${s.position ? 'P' + s.position : 'Team'}</div><h3>${esc(t.name)}</h3><div class="muted" style="font-size:14px">${esc(t.car || t.base || '')}</div></div>
      <div style="display:flex;gap:12px;align-items:center">${t.logo ? `<img class="tc-logo" src="${esc(asset(t.logo))}" alt="" onerror="this.remove()">` : ''}<div class="tc-pts"><b>${fmtPts(s.points)}</b><span>PTS</span></div></div></div>
      <div class="tc-drivers ${t.carImage ? 'has-car' : ''}">${drs.length ? drs.map(x => `<div class="tc-driver">${avatar(x, t)}<div><small>#${esc(x.number ?? '')}</small>${nameHTML(x.name)}</div></div>`).join('') : '<div class="tc-driver muted">No drivers yet</div>'}</div>
      <div class="tc-car-slot">${t.carImage ? `<img class="tc-car" src="${esc(asset(t.carImage))}" alt="" loading="lazy" onerror="this.remove()">` : ''}</div>
    </a>`;
  }).join('');
  return `<div class="page">${head('Season ' + d.league.season, 'Teams', `${d.teams.length} constructors fighting for the title.`)}
    ${list.length ? `<div class="team-grid">${cards}</div>` : empty('No teams yet', '<p>Add constructors from the admin console.</p>')}</div>`;
}

function pageTeam(d, id) {
  const t = byId(d.teams, id);
  const st = computeStandings(d);
  const s = st.T[id];
  if (!t && !s) return notFound();
  const T = t || teamLabel(d, id), x = s || { points: 0, wins: 0, podiums: 0, poles: 0, rounds: {} };
  const drs = d.drivers.filter(p => p.teamId === id);
  const raced = new Set();
  rounds(d).forEach(r => ['race', 'sprint'].forEach(ss => session(d, r.id, ss).forEach(e => { if (e.teamId === id) raced.add(e.driverId); })));
  const drIds = [...new Set([...drs.filter(p => p.active !== false).map(p => p.id), ...raced])];
  const rows = rounds(d).filter(r => isDone(d, r)).map(r => {
    const cl = classify(session(d, r.id, 'race'), 'race', d.scoring, poleDriver(d, r.id));
    const cells = drIds.map(did => { const e = cl.find(z => z.driverId === did && z.teamId === id); return `<td class="mono">${e ? (e.pos || `<span class="status">${esc(e.label)}</span>`) : '<span class="muted">—</span>'}</td>`; }).join('');
    const rr = x.rounds[r.id];
    return `<tr><td class="pos">${esc(r.round)}</td><td><a href="#/results/${esc(r.id)}">${flag(r.country)}&nbsp; ${esc(r.name)}</a></td>${cells}<td class="pts">${fmtPts(rr ? rr.pts : 0)}</td></tr>`;
  }).join('');
  return `<div class="page">
    <a class="back" href="#/teams">← All teams</a>
    <div class="profile-hero" style="--tc:${esc(teamColor(T))}">
      ${T.logo ? `<img class="ph-photo" src="${esc(asset(T.logo))}" alt="" style="height:70%;bottom:15%" onerror="this.remove()">` : ''}
      <div class="eyebrow">${x.position ? `P${x.position} in constructors'` : 'Constructor'}</div>
      <h1>${esc(T.name)}</h1>
      <dl class="kv" style="position:relative;margin-top:14px">
        ${T.base ? `<dt>Base</dt><dd>${esc(T.base)}</dd>` : ''}${T.principal ? `<dt>Team principal</dt><dd>${esc(T.principal)}</dd>` : ''}${T.car ? `<dt>Chassis</dt><dd>${esc(T.car)}</dd>` : ''}${T.engine ? `<dt>Power unit</dt><dd>${esc(T.engine)}</dd>` : ''}
      </dl>
      ${T.bio ? `<div class="bio prose">${md(T.bio)}</div>` : ''}
      ${T.carImage ? `<img class="ph-car zoomable" src="${esc(asset(T.carImage))}" alt="" onerror="this.remove()">` : ''}
    </div>
    <div class="stats">
      <div class="stat"><b>${x.position || '—'}</b><span>Position</span></div>
      <div class="stat"><b>${fmtPts(x.points)}</b><span>Points</span></div>
      <div class="stat"><b>${x.wins}</b><span>Wins</span></div>
      <div class="stat"><b>${x.podiums}</b><span>Podiums</span></div>
      <div class="stat"><b>${x.poles}</b><span>Poles</span></div>
    </div>
    <div class="section-title"><h2>Drivers</h2></div>
    <div class="driver-grid" style="margin-bottom:32px">${drs.length ? drs.map(p => { const ps = st.D[p.id] || { points: 0 }; return `<a class="driver-card" href="#/driver/${esc(p.id)}" style="--tc:${esc(teamColor(T))};min-height:160px"><div class="dc-pos">${ps.position ? 'P' + ps.position : 'Driver'}${p.active === false ? ' · inactive' : ''}</div><div class="dc-pts"><b>${fmtPts(ps.points)}</b><span>PTS</span></div><div class="dc-num">${esc(p.number ?? '')}</div><div class="dc-name">${nameHTML(p.name)}</div><div class="dc-team">${flag(p.country)}</div></a>`; }).join('') : empty('No drivers signed')}</div>
    <div class="section-title"><h2>Race by race</h2></div>
    ${rows ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Rd</th><th>Grand Prix</th>${drIds.map(did => `<th>${esc(driverLabel(d, did).name.split(' ').pop())}</th>`).join('')}<th class="r">Pts</th></tr></thead><tbody>${rows}</tbody></table></div>` : empty('No results yet')}
  </div>`;
}

const sortedNews = d => [...d.news].filter(n => !n.hidden).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || String(b.date || '').localeCompare(String(a.date || '')));
function newsCard(n, feature = false) {
  const initials = esc((n.tag || 'NEWS').slice(0, 4).toUpperCase());
  return `<a class="news-card ${feature ? 'feature' : ''}" href="#/news/${esc(n.id)}">
    <div class="nc-img">${n.image ? `<img src="${esc(asset(n.image))}" alt="" loading="lazy" onerror="this.remove()">` : ''}<div class="ph" ${n.image ? 'style="display:none"' : ''}>${initials}</div></div>
    <div class="nc-body">${n.tag ? `<span class="chip" style="width:fit-content">${esc(n.tag)}</span>` : ''}<h3>${esc(n.title)}</h3><p>${esc(plain(n.body).slice(0, feature ? 220 : 130))}${plain(n.body).length > (feature ? 220 : 130) ? '…' : ''}</p>
    <div class="nc-meta">${n.pinned ? '<span>📌</span>' : ''}<span>${n.date ? fmtDate(n.date + 'T12:00:00') : ''}</span>${n.author ? `<span>· ${esc(n.author)}</span>` : ''}</div></div>
  </a>`;
}
function pageNews(d) {
  const list = sortedNews(d);
  return `<div class="page">${head('Paddock', 'News', 'Announcements, race reports and everything in between.')}
    ${list.length ? `<div class="news-grid">${list.map((n, i) => newsCard(n, i === 0)).join('')}</div>` : empty('No news yet')}</div>`;
}
function pageArticle(d, id) {
  const n = byId(d.news, id);
  if (!n) return notFound();
  return `<div class="page"><article class="article">
    <a class="back" href="#/news">← All news</a>
    ${n.tag ? `<div class="eyebrow">${esc(n.tag)}</div>` : ''}
    <h1>${esc(n.title)}</h1>
    <div class="a-meta"><span>${n.date ? fmtDate(n.date + 'T12:00:00', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : ''}</span>${n.author ? `<span>· by ${esc(n.author)}</span>` : ''}</div>
    ${n.image ? `<div class="a-cover"><img src="${esc(asset(n.image))}" alt="" onerror="this.parentNode.remove()"></div>` : ''}
    <div class="prose">${md(n.body)}</div>
  </article></div>`;
}

function pageRules(d) {
  const sc = d.scoring;
  const ptsTable = (label, arr) => arr && arr.length ? `<div class="card"><h3>${label}</h3><div class="table-wrap" style="box-shadow:none"><table class="tbl"><thead><tr><th>Position</th><th class="r">Points</th></tr></thead><tbody>${arr.map((p, i) => `<tr class="${i < 3 ? 'top' + (i + 1) : ''}"><td class="pos">P${i + 1}</td><td class="pts">${fmtPts(p)}</td></tr>`).join('')}</tbody></table></div></div>` : '';
  const bonuses = [];
  if (Number(sc.fastestLap)) bonuses.push(`<li><b>+${fmtPts(sc.fastestLap)}</b> for the fastest lap in the race${Number(sc.fastestLapTopN) ? ` (only if finishing in the top ${esc(sc.fastestLapTopN)})` : ''}</li>`);
  if (Number(sc.sprintFastestLap)) bonuses.push(`<li><b>+${fmtPts(sc.sprintFastestLap)}</b> for the fastest lap in the sprint</li>`);
  if (Number(sc.pole)) bonuses.push(`<li><b>+${fmtPts(sc.pole)}</b> for pole position</li>`);
  bonuses.push('<li>DNF, DSQ and DNS score no points.</li><li>Ties are broken by most wins, then most 2nd places, and so on.</li>');
  return `<div class="page">${head('Season ' + d.league.season, 'Rules & scoring', '')}
    <div class="grid grid-3">${ptsTable('Race points', sc.race)}${ptsTable('Sprint points', sc.sprint)}<div class="card"><h3>Bonuses & tie-breaks</h3><ul class="prose" style="font-size:15px;padding-left:1.1em">${bonuses.join('')}</ul></div></div>
    ${d.league.rules ? `<section class="card" style="margin-top:24px"><div class="prose">${md(d.league.rules)}</div></section>` : ''}
  </div>`;
}

/* ---------------- driver of the day ---------------- */
const dotdOf = (d, rid) => { const v = d.results[rid] && d.results[rid].dotd; return v && v.driverId ? v : null; };
const teamAt = (d, rid, did) => { const e = [...session(d, rid, 'race'), ...session(d, rid, 'sprint')].find(x => x.driverId === did); return teamLabel(d, (e && e.teamId) || (byId(d.drivers, did) || {}).teamId); };
function dotdCard(d, rid, withRound) {
  const v = dotdOf(d, rid); if (!v) return '';
  const r = byId(d.calendar, rid), drv = driverLabel(d, v.driverId), t = teamAt(d, rid, v.driverId);
  const has = x => x !== '' && x !== null && x !== undefined;
  const rows = [{ driverId: v.driverId, pct: v.pct }, ...(v.runners || []).filter(x => x && x.driverId)];
  const bars = rows.length > 1 && rows.some(x => has(x.pct)) ? `<div class="dotd-bars">${rows.map(x => {
    const p = driverLabel(d, x.driverId), pt = teamAt(d, rid, x.driverId), w = Math.max(0, Math.min(100, Number(x.pct) || 0));
    return `<div class="bar"><span class="bl">${esc(p.name.split(' ').pop())}</span><span class="track"><i style="width:${w}%;background:${esc(teamColor(pt))}"></i></span><span class="bp">${has(x.pct) ? fmtPts(x.pct) + '%' : ''}</span></div>`;
  }).join('')}</div>` : '';
  return `<div class="dotd" style="--tc:${esc(teamColor(t))}">
    <div class="dotd-main">${avatar(drv, t, 'lg')}<div style="min-width:0"><div class="eyebrow" style="margin-bottom:4px">Driver of the Day${withRound && r ? ` · R${esc(r.round)} ${esc(r.name)}` : ''}</div>
      <div class="dotd-name"><a href="#/driver/${esc(drv.id)}">${nameHTML(drv.name)}</a></div>
      <div class="muted" style="font-size:14px">${esc(t.name)}${has(v.pct) ? ` · ${fmtPts(v.pct)}% of the vote` : ''}</div>
      ${v.link ? `<a class="btn xs ghost" style="margin-top:10px" href="${esc(v.link)}" target="_blank" rel="noopener">See the poll →</a>` : ''}</div></div>
    ${bars}
  </div>`;
}

/* ---------------- progression: animated graph + bar race ---------------- */
const PG = { kind: 'drv', mode: 'graph', t: null, n: 0, playing: false, hidden: {}, raf: 0, data: null };
function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(raw))); const f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }
function progressChart(d, st) {
  const rs = rounds(d).filter(r => !r.cancelled && isDone(d, r));
  if (!rs.length) return empty('No races completed yet', '<p>The progression fills in after the first round.</p>');
  const mk = (rows, isTeam) => rows.map(x => {
    const ent = isTeam ? teamLabel(d, x.id) : driverLabel(d, x.id);
    const t = isTeam ? ent : driverTeam(d, ent, x);
    let c = 0; const pts = [0];
    rs.forEach(r => { c += x.rounds[r.id] ? x.rounds[r.id].pts : 0; pts.push(c); });
    pts[pts.length - 1] += x.points - c;
    const short = isTeam ? (ent.name.length > 18 ? ent.name.slice(0, 17) + '…' : ent.name) : ent.name.split(' ').pop();
    return { name: ent.name, short, color: teamColor(t), pts, drv: isTeam ? null : ent, team: t };
  });
  const n = rs.length;
  if (PG.n !== n || PG.t === null) { PG.t = n; PG.hidden = {}; }
  PG.n = n; PG.data = { rs, drv: mk(st.drivers, false), team: mk(st.teams, true) };
  const seg = (attr, cur, opts) => `<div class="tabs seg">${opts.map(([k, l]) => `<button data-${attr}="${k}" class="${cur === k ? 'active' : ''}">${l}</button>`).join('')}</div>`;
  return `<div class="card prog" id="prog">
    <div class="prog-bar">
      ${seg('pg-kind', PG.kind, [['drv', 'Drivers'], ['team', 'Constructors']])}
      ${seg('pg-mode', PG.mode, [['graph', 'Graph'], ['race', 'Bar race']])}
      <div class="prog-play"><button class="btn sm primary" data-pg="play" id="pg-play">▶ Play</button><input type="range" id="pg-slider" min="0" max="${n}" step="0.01" value="${PG.t}" aria-label="Round"><span class="mono" id="pg-label"></span></div>
    </div>
    <div id="pg-stage" class="pg-stage"></div>
    <div class="chips" id="pg-chips"></div>
  </div>`;
}
const pgSeries = () => PG.kind === 'team' ? PG.data.team : PG.data.drv;
const pgVal = (s, t) => { const j = Math.floor(t), f = t - j, a = s.pts[Math.min(j, s.pts.length - 1)], b = s.pts[Math.min(j + 1, s.pts.length - 1)]; return a + (b - a) * f; };
function pgHidden() { const ser = pgSeries(); return PG.hidden[PG.kind] || (PG.hidden[PG.kind] = new Set(ser.map((x, i) => i).filter(i => i >= 10))); }
function mountProgress() { pgBuild(); pgDraw(); pgButton(); }
function pgBuild() {
  const stage = document.getElementById('pg-stage'); if (!stage) return;
  const ser = pgSeries(), hid = pgHidden();
  document.querySelectorAll('[data-pg-kind]').forEach(b => b.classList.toggle('active', b.dataset.pgKind === PG.kind));
  document.querySelectorAll('[data-pg-mode]').forEach(b => b.classList.toggle('active', b.dataset.pgMode === PG.mode));
  document.getElementById('pg-chips').innerHTML = PG.mode === 'graph'
    ? ser.map((x, i) => `<button data-pg-chip="${i}" class="${hid.has(i) ? 'off' : ''}" style="--c:${esc(x.color)}"><i></i>${esc(x.short)}</button>`).join('') + '<button data-pg="all" class="chip-act">Show all</button><button data-pg="none" class="chip-act">Hide all</button>'
    : '';
  stage.innerHTML = PG.mode === 'race'
    ? `<div class="race-head"><div class="race-round" id="pg-round"></div><div class="muted" id="pg-lead"></div></div>
       <div class="race" style="height:${ser.length * 44}px">${ser.map((x, i) => `<div class="race-row" data-i="${i}" style="--c:${esc(x.color)}"><span class="rr-pos"></span>${x.drv ? avatar(x.drv, x.team, 'sm') : `<span class="swatch" style="--tc:${esc(x.color)}"></span>`}<span class="rr-name">${esc(x.short)}</span><span class="rr-track"><i></i></span><span class="rr-val"></span></div>`).join('')}</div>`
    : '';
}
function pgDraw() {
  const stage = document.getElementById('pg-stage');
  if (!stage || !PG.data) { PG.playing = false; cancelAnimationFrame(PG.raf); return; }
  const ser = pgSeries(), rs = PG.data.rs, t = PG.t, ri = Math.round(t);
  const fmtV = v => PG.playing ? String(Math.round(v)) : fmtPts(v);
  const lbl = document.getElementById('pg-label'); if (lbl) lbl.textContent = ri ? `After R${rs[ri - 1].round}` : 'Season start';
  const sl = document.getElementById('pg-slider'); if (sl && document.activeElement !== sl) sl.value = t;
  if (PG.mode === 'race') {
    const order = ser.map((x, i) => ({ i, v: pgVal(x, t) })).sort((a, b) => b.v - a.v || a.i - b.i);
    const max = Math.max(1, order[0].v);
    order.forEach((o, rank) => {
      const row = stage.querySelector(`.race-row[data-i="${o.i}"]`); if (!row) return;
      row.style.transform = `translateY(${rank * 44}px)`;
      row.querySelector('.rr-pos').textContent = rank + 1;
      row.querySelector('.rr-track i').style.width = (Math.max(0, o.v) / max * 100).toFixed(2) + '%';
      row.querySelector('.rr-val').textContent = fmtV(o.v);
    });
    const r = ri ? rs[ri - 1] : null;
    document.getElementById('pg-round').innerHTML = r ? `${flag(r.country)} R${esc(r.round)} · ${esc(r.name)}` : 'Season start';
    document.getElementById('pg-lead').textContent = ri ? `Leader: ${ser[order[0].i].name} · ${fmtV(order[0].v)} pts` : '';
  } else stage.innerHTML = graphSVG(ser, rs, t, pgHidden(), fmtV);
}
function graphSVG(ser, rs, t, hid, fmtV) {
  const W = 960, H = 420, L = 46, R = 170, T = 18, B = 40, n = rs.length;
  const vis = ser.map((x, i) => ({ x, i })).filter(o => !hid.has(o.i));
  const all = (vis.length ? vis : ser.map((x, i) => ({ x, i }))).flatMap(o => o.x.pts);
  const hi = Math.max(...all, 1), lo = Math.min(0, ...all);
  const step = niceStep(Math.max(10, hi - lo) / 5);
  const top = Math.ceil(hi / step) * step, bot = Math.floor(lo / step) * step;
  const X = i => L + (W - L - R) * (n ? i / n : 0);
  const Y = v => T + (H - T - B) * (1 - (v - bot) / ((top - bot) || 1));
  let g = '';
  for (let v = bot; v <= top + 1e-9; v += step) g += `<line class="gl" x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text class="ax" x="${L - 8}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">${fmtPts(v)}</text>`;
  for (let i = 0; i <= n; i++) g += `<text class="ax" x="${X(i).toFixed(1)}" y="${H - B + 24}" text-anchor="middle">${i ? 'R' + esc(rs[i - 1].round) : 'Start'}</text>`;
  if (t < n) g += `<line class="now" x1="${X(t).toFixed(1)}" x2="${X(t).toFixed(1)}" y1="${T}" y2="${H - B}"/>`;
  const ends = vis.map(o => ({ i: o.i, y: Y(pgVal(o.x, t)) })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 14) ends[k].y = ends[k - 1].y + 14;
  const ly = {}; ends.forEach(e => { ly[e.i] = e.y; });
  const seen = {}, dash = {};
  ser.forEach((x, i) => { dash[i] = !!seen[x.color]; seen[x.color] = 1; });
  const fl = Math.floor(t);
  const lines = vis.map(({ x, i }) => {
    const pts = []; for (let j = 0; j <= fl && j <= n; j++) pts.push([X(j), Y(x.pts[j])]);
    if (t > fl) pts.push([X(t), Y(pgVal(x, t))]);
    const path = pts.map((p, j) => `${j ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    const dots = x.pts.slice(1, fl + 1).map((v, j) => `<circle cx="${X(j + 1).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="3.2" fill="${esc(x.color)}"><title>${esc(x.name)} · R${esc(rs[j].round)}: ${fmtPts(v)} pts</title></circle>`).join('');
    const hx = X(t), hy = Y(pgVal(x, t));
    return `<g><path class="ln" d="${path}" stroke="${esc(x.color)}"${dash[i] ? ' stroke-dasharray="7 5"' : ''}/>${dots}<circle class="head" cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" r="5" fill="${esc(x.color)}"/><text class="lbl" x="${W - R + 10}" y="${(ly[i] + 4).toFixed(1)}" fill="${esc(x.color)}">${esc(x.short)} · ${fmtV(pgVal(x, t))}</text></g>`;
  }).join('');
  return `<div style="overflow-x:auto"><svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Points progression" style="min-width:640px">${g}${lines}</svg></div>`;
}
function pgButton() { const b = document.getElementById('pg-play'); if (b) b.textContent = PG.playing ? '❚❚ Pause' : PG.t >= PG.n - 0.001 ? '↺ Replay' : '▶ Play'; }
function pgStop() { PG.playing = false; cancelAnimationFrame(PG.raf); pgButton(); pgDraw(); }
function pgPlay() {
  if (PG.playing) return pgStop();
  if (PG.t >= PG.n - 0.001) PG.t = 0;
  PG.playing = true; pgButton();
  let last = performance.now();
  const step = now => {
    if (!PG.playing) return;
    PG.t = Math.min(PG.n, PG.t + (now - last) / 1100); last = now;
    pgDraw();
    if (!document.getElementById('pg-stage')) return;
    if (PG.t >= PG.n) return pgStop();
    PG.raf = requestAnimationFrame(step);
  };
  PG.raf = requestAnimationFrame(step);
}
document.addEventListener('click', e => {
  const k = e.target.closest('[data-pg-kind]'), m = e.target.closest('[data-pg-mode]'), c = e.target.closest('[data-pg-chip]'), a = e.target.closest('[data-pg]');
  if (k) { PG.kind = k.dataset.pgKind; pgBuild(); pgDraw(); }
  else if (m) { PG.mode = m.dataset.pgMode; pgBuild(); pgDraw(); }
  else if (c) { const h = pgHidden(), i = Number(c.dataset.pgChip); h.has(i) ? h.delete(i) : h.add(i); c.classList.toggle('off'); pgDraw(); }
  else if (a) { const act = a.dataset.pg; if (act === 'play') pgPlay(); else { const h = pgHidden(); h.clear(); if (act === 'none') pgSeries().forEach((x, i) => h.add(i)); pgBuild(); pgDraw(); } }
});
document.addEventListener('input', e => { if (e.target.id === 'pg-slider') { PG.playing = false; cancelAnimationFrame(PG.raf); PG.t = Number(e.target.value); pgDraw(); pgButton(); } });

/* ---------------- hall of fame ---------------- */
function snapshotSeason(d) {
  const st = computeStandings(d);
  const dr = st.drivers.map(x => { const p = driverLabel(d, x.id), t = driverTeam(d, p, x); return { name: p.name, team: t ? t.name : '', color: teamColor(t), country: p.country || '', points: x.points, wins: x.wins, podiums: x.podiums }; });
  const tm = st.teams.map(x => { const t = teamLabel(d, x.id); return { name: t.name, color: teamColor(t), points: x.points, wins: x.wins }; });
  const winners = rounds(d).filter(r => isDone(d, r)).map(r => {
    const w = classify(session(d, r.id, 'race'), 'race', d.scoring).find(e => e.pos === 1);
    const p = w ? driverLabel(d, w.driverId) : null, t = w ? teamLabel(d, w.teamId) : null;
    return { round: r.round, name: r.name, country: r.country || '', winner: p ? p.name : '', team: t ? t.name : '', color: teamColor(t) };
  });
  const c = dr[0], ct = tm[0];
  return { id: uid('season'), season: d.league.season, driverChampion: c ? c.name : '', driverTeam: c ? c.team : '', driverColor: c ? c.color : '#39c5bb', driverPoints: c ? c.points : '',
    teamChampion: ct ? ct.name : '', teamColor: ct ? ct.color : '#39c5bb', teamPoints: ct ? ct.points : '', notes: '', standings: { drivers: dr, teams: tm }, winners };
}
const seasonSort = (a, b) => String(b.season).localeCompare(String(a.season), undefined, { numeric: true });
const TROPHY = `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="hofg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset=".5" stop-color="#e6b84f"/><stop offset="1" stop-color="#9c6a14"/></linearGradient></defs><path fill="url(#hofg)" d="M18 6h28v14c0 9-6 16-14 16S18 29 18 20zM16 10H6c0 10 5 15 13 16l-1-5c-4-1-6-4-7-7h5zM48 10h10c0 10-5 15-13 16l1-5c4-1 6-4 7-7h-5zM28 35h8v9h-8zM19 44h26l3 12H16z"/></svg>`;
function champPhoto(d, name) {
  const p = d.drivers.find(x => x.name && name && x.name.trim().toLowerCase() === String(name).trim().toLowerCase());
  return p && (p.headshot || p.photo) ? asset(p.headshot || p.photo) : '';
}
function champCard(d, h, current) {
  const photo = champPhoto(d, h.driverChampion);
  return `<article class="hof-card ${current ? 'current' : ''}">
    <div class="hof-sheen"></div>
    <div class="hof-top"><span class="hof-season">${esc(h.season)}</span><span class="hof-tag">${current ? 'In progress' : 'Champions'}</span></div>
    <div class="hof-driver">
      <div class="hof-medal"><span class="hof-trophy">${current ? '◆' : TROPHY}</span>${photo ? `<img src="${esc(photo)}" alt="" onerror="this.remove()">` : ''}</div>
      <div style="min-width:0"><div class="hof-label">${current ? 'Championship leader' : "Drivers' Champion"}</div>
        <div class="hof-name">${h.driverChampion ? nameHTML(h.driverChampion) : '—'}</div>
        <div class="hof-sub"><span class="swatch" style="--tc:${esc(h.driverColor || '#e6b84f')}"></span>${esc(h.driverTeam || '')}${hasVal(h.driverPoints) ? ` · <b>${fmtPts(h.driverPoints)}</b> pts` : ''}</div></div>
    </div>
    <div class="hof-divider"><span>✦</span></div>
    <div class="hof-label">${current ? 'Leading constructor' : "Constructors' Champion"}</div>
    <div class="hof-tname"><span class="swatch" style="--tc:${esc(h.teamColor || '#e6b84f')}"></span>${esc(h.teamChampion || '—')}${hasVal(h.teamPoints) ? `<span class="hof-pts">${fmtPts(h.teamPoints)} pts</span>` : ''}</div>
    ${h.notes ? `<div class="hof-notes prose">${md(h.notes)}</div>` : ''}
    ${current ? '<a class="hof-link" href="#/standings">Live standings →</a>' : h.standings ? `<a class="hof-link" href="#/history/${esc(h.id)}">Final standings →</a>` : ''}
  </article>`;
}
function pageHistory(d) {
  const list = [...d.history].sort(seasonSort);
  const st = computeStandings(d);
  const started = rounds(d).some(r => isDone(d, r));
  const cur = started && !d.history.some(h => String(h.season) === String(d.league.season)) && st.drivers[0] ? (() => {
    const p = driverLabel(d, st.drivers[0].id), t = driverTeam(d, p, st.drivers[0]), ct = st.teams[0] && teamLabel(d, st.teams[0].id);
    return champCard(d, { season: d.league.season, driverChampion: p.name, driverTeam: t ? t.name : '', driverColor: teamColor(t), driverPoints: st.drivers[0].points, teamChampion: ct ? ct.name : '', teamColor: teamColor(ct), teamPoints: st.teams[0] ? st.teams[0].points : '' }, true);
  })() : '';
  const tally = {};
  list.forEach(h => { if (h.driverChampion) tally[h.driverChampion] = (tally[h.driverChampion] || 0) + 1; });
  const ranked = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  const multi = ranked.filter(([, n]) => n > 1);
  return `<div class="page hof">
    <header class="hof-hero">
      <div class="hof-crest">${TROPHY}</div>
      <div class="hof-eyebrow">${esc(d.league.name)}</div>
      <h1 class="hof-title">Hall of Fame</h1>
      <p class="hof-subtitle">The drivers and teams who conquered the grid.</p>
      <div class="hof-stats">
        <div><b>${list.length}</b><span>Seasons</span></div>
        <div><b>${ranked.length}</b><span>Champions</span></div>
        <div><b>${ranked[0] ? esc(ranked[0][0].split(' ').pop()) : '—'}</b><span>Most titles${ranked[0] ? ' · ' + ranked[0][1] : ''}</span></div>
      </div>
    </header>
    ${multi.length ? `<div class="hof-multi">${multi.map(([nm, n]) => `<span class="hof-chip">${'★'.repeat(Math.min(n, 7))} ${esc(nm)} <b>×${n}</b></span>`).join('')}</div>` : ''}
    ${cur || list.length ? `<div class="hof-grid">${cur}${list.map(h => champCard(d, h)).join('')}</div>` : empty('No champions crowned yet', '<p>When a season ends, the admin archives it here.</p>')}
  </div>`;
}
function pageHistorySeason(d, id) {
  const h = byId(d.history, id);
  if (!h) return notFound();
  const sd = (h.standings && h.standings.drivers) || [], tm = (h.standings && h.standings.teams) || [], w = h.winners || [];
  return `<div class="page hof"><a class="back" href="#/history">← Hall of fame</a>
    <header class="hof-hero sm">
      <div class="hof-crest">${TROPHY}</div>
      <div class="hof-eyebrow">Season ${esc(h.season)} · Final standings</div>
      <h1 class="hof-title">${h.driverChampion ? esc(h.driverChampion) : 'Season ' + esc(h.season)}</h1>
      <p class="hof-subtitle">${h.driverChampion ? "Drivers' Champion" : ''}${h.teamChampion ? ` · ${esc(h.teamChampion)}, Constructors' Champion` : ''}</p>
    </header>
    <div class="grid grid-2">
      <div><div class="section-title"><h2>Drivers</h2></div>${sd.length ? `<div class="table-wrap hof-table"><table class="tbl"><thead><tr><th>Pos</th><th>Driver</th><th class="hide-sm">Team</th><th class="r">Wins</th><th class="r">Pts</th></tr></thead><tbody>${sd.map((x, i) => `<tr class="${i < 3 ? 'top' + (i + 1) : ''}"><td class="pos">${i + 1}</td><td><span class="swatch" style="--tc:${esc(x.color)}"></span>${nameHTML(x.name)} ${flag(x.country)}</td><td class="hide-sm team-name">${esc(x.team)}</td><td class="r mono">${x.wins ?? ''}</td><td class="pts">${fmtPts(x.points)}</td></tr>`).join('')}</tbody></table></div>` : empty('No data')}</div>
      <div><div class="section-title"><h2>Constructors</h2></div>${tm.length ? `<div class="table-wrap hof-table"><table class="tbl"><thead><tr><th>Pos</th><th>Team</th><th class="r">Wins</th><th class="r">Pts</th></tr></thead><tbody>${tm.map((x, i) => `<tr class="${i < 3 ? 'top' + (i + 1) : ''}"><td class="pos">${i + 1}</td><td><span class="swatch" style="--tc:${esc(x.color)}"></span>${esc(x.name)}</td><td class="r mono">${x.wins ?? ''}</td><td class="pts">${fmtPts(x.points)}</td></tr>`).join('')}</tbody></table></div>` : empty('No data')}</div>
    </div>
    ${w.length ? `<section><div class="section-title"><h2>Race winners</h2></div><div class="table-wrap"><table class="tbl"><thead><tr><th>Rd</th><th>Grand Prix</th><th>Winner</th><th class="hide-sm">Team</th></tr></thead><tbody>${w.map(x => `<tr><td class="pos">${esc(x.round)}</td><td>${flag(x.country)}&nbsp; ${esc(x.name)}</td><td>${x.winner ? nameHTML(x.winner) : '—'}</td><td class="hide-sm"><span class="swatch" style="--tc:${esc(x.color)}"></span><span class="team-name">${esc(x.team)}</span></td></tr>`).join('')}</tbody></table></div></section>` : ''}
  </div>`;
}

/* ---------------- stewards ---------------- */
const STATUS_CLS = { 'Penalty': 'st-pen', 'Warning': 'st-warn', 'Reprimand': 'st-warn', 'No further action': 'st-nfa', 'Under investigation': 'st-inv' };
function stewardCard(d, s, hideRound) {
  const r = byId(d.calendar, s.roundId);
  const drv = s.driverId ? driverLabel(d, s.driverId) : null;
  const ent = r && drv ? [...session(d, r.id, 'race'), ...session(d, r.id, 'sprint')].find(e => e.driverId === drv.id) : null;
  const t = byId(d.teams, (ent && ent.teamId) || (drv && drv.teamId));
  const pts = Number(s.points) || 0;
  return `<div class="sd-card" style="--tc:${esc(teamColor(t))}">
    <div class="sd-top"><span class="sd-org">${esc(rcName(d))}</span>${r && !hideRound ? `<a class="chip" href="#/results/${esc(r.id)}">R${esc(r.round)} · ${esc(r.name)}</a>` : ''}<span class="muted">${esc(sessionName(s.session || 'race'))}${s.lap ? ` · ${esc(s.lap)}` : ''}</span><span class="badge ${STATUS_CLS[s.status] || 'st-inv'}">${esc(s.status || 'Under investigation')}</span></div>
    <h3>${esc(s.title || 'Incident')}</h3>
    ${drv ? `<div class="sd-who"><span class="swatch" style="--tc:${esc(teamColor(t))}"></span><a href="#/driver/${esc(drv.id)}">${nameHTML(drv.name)}</a>${s.involved ? `<span class="muted"> · involving ${esc(s.involved)}</span>` : ''}</div>` : (s.involved ? `<div class="sd-who muted">Involving ${esc(s.involved)}</div>` : '')}
    ${s.decision ? `<div class="prose sd-body">${md(s.decision)}</div>` : ''}
    ${docsHTML(s.docs)}
    ${s.penalty || pts ? `<div class="sd-pen">${s.penalty ? `<span class="tag-fl">${esc(s.penalty)}</span>` : ''}${pts ? `<span class="tag-pole">${pts > 0 ? '+' : ''}${fmtPts(pts)} championship pts${s.teamToo ? ' · driver & team' : ''}</span>` : ''}</div>` : ''}
  </div>`;
}
function docsHTML(docs) {
  const list = (docs || []).filter(Boolean);
  if (!list.length) return '';
  return `<div class="sd-docs">${list.map(u => isImg(u)
    ? `<img class="sd-doc zoomable" src="${esc(asset(u))}" alt="Official document" loading="lazy">`
    : `<a class="btn sm" href="${esc(asset(u))}" target="_blank" rel="noopener">📄 ${/\.pdf$/i.test(u) ? 'Open full report (PDF)' : 'Open document'}</a>`).join('')}</div>`;
}
function pageStewards(d, rid) {
  const rorder = x => { const r = byId(d.calendar, x.roundId); return r ? Number(r.round) || 0 : -1; };
  const all = [...d.stewards].sort((a, b) => rorder(b) - rorder(a));
  const withDec = rounds(d).filter(r => all.some(x => x.roundId === r.id));
  const list = rid ? all.filter(x => x.roundId === rid) : all;
  const picker = withDec.length > 1 ? `<div class="round-picker"><a href="#/stewards" class="${!rid ? 'active' : ''}">All rounds</a>${withDec.map(r => `<a href="#/stewards/${esc(r.id)}" class="${r.id === rid ? 'active' : ''}">${flag(r.country)} R${esc(r.round)}</a>`).join('')}</div>` : '';
  const groups = [];
  list.forEach(x => { const g = groups.find(y => y.id === (x.roundId || '')); if (g) g.items.push(x); else groups.push({ id: x.roundId || '', items: [x] }); });
  const body = groups.map(g => { const r = byId(d.calendar, g.id); return `<section><div class="section-title"><h2>${r ? `${flag(r.country)} R${esc(r.round)} · ${esc(r.name)}` : 'General'}</h2><span class="muted">${g.items.length} decision${g.items.length > 1 ? 's' : ''}</span></div><div class="sd-list">${g.items.map(x => stewardCard(d, x, true)).join('')}</div></section>`; }).join('');
  return `<div class="page">${head('Race control', esc(rcName(d)) + ' decisions', 'Official documents, incident reviews and penalties from every round.')}
    ${picker}${list.length ? body : empty('No decisions published', '<p>Clean racing so far. 🩵</p>')}</div>`;
}

/* ---------------- sign-ups ---------------- */
function pageJoin(d) {
  const s = d.signups, per = Number(s.seatsPerTeam) || 2;
  const seats = d.teams.map(t => ({ t, n: per - d.drivers.filter(x => x.teamId === t.id && x.active !== false).length })).filter(x => x.n > 0);
  const total = seats.reduce((a, b) => a + b.n, 0);
  const taken = d.drivers.filter(x => x.active !== false && x.number !== '' && x.number != null).map(x => Number(x.number)).sort((a, b) => a - b);
  const discord = d.league.links && d.league.links.discord;
  const applyBtn = s.formUrl ? `<a class="btn primary" href="${esc(s.formUrl)}" target="_blank" rel="noopener">Apply now →</a>` : discord ? `<a class="btn primary" href="${esc(discord)}" target="_blank" rel="noopener">Apply on Discord →</a>` : '';
  return `<div class="page">${head('Season ' + d.league.season, esc(s.title || 'Join the grid'), '')}
    <div class="card" style="margin-bottom:20px"><div class="join-status"><span class="badge ${s.open ? 'next' : 'cancel'}" style="${s.open ? '' : 'text-decoration:none'}">${s.open ? 'Sign-ups open' : 'Sign-ups closed'}</span>${s.open && total ? `<span class="muted">${total} seat${total > 1 ? 's' : ''} available</span>` : ''}<span style="margin-left:auto">${s.open ? applyBtn : ''}</span></div>
      ${s.intro ? `<div class="prose" style="margin-top:16px">${md(s.intro)}</div>` : `<p class="muted" style="margin:14px 0 0">${s.open ? 'We\'re looking for drivers! Read the requirements and send in an application.' : 'Sign-ups are closed right now — keep an eye on the news page or Discord for the next window.'}</p>`}
    </div>
    <div class="grid grid-2">
      <div class="card"><div class="card-title"><h3>Open seats</h3></div>${seats.length ? `<ul class="mini">${seats.map(x => `<li><span class="swatch" style="--tc:${esc(teamColor(x.t))}"></span><span class="grow">${esc(x.t.name)}</span><span class="v">${x.n} seat${x.n > 1 ? 's' : ''}</span></li>`).join('')}</ul>` : '<p class="muted">Every race seat is filled — you can still apply as a reserve driver.</p>'}</div>
      <div class="card"><div class="card-title"><h3>Requirements</h3></div>${s.requirements ? `<div class="prose" style="font-size:15px">${md(s.requirements)}</div>` : `<p class="muted">Check the <a href="#/rules">rules</a> before applying.</p>`}</div>
    </div>
    ${s.open && s.showBuilder !== false ? `<section class="card" style="margin-top:20px"><div class="card-title"><h3>Build your application</h3><span class="muted" style="font-size:13px">Fill it in, copy, and paste it ${s.formUrl ? 'into the form' : 'in Discord'}</span></div>
      <div class="pform">
        <label class="fld"><span>Name</span><input id="ap-name" type="text"></label>
        <label class="fld"><span>Gamertag / PSN / Steam</span><input id="ap-tag" type="text"></label>
        <label class="fld"><span>Platform</span><select id="ap-platform"><option>PC</option><option>PlayStation</option><option>Xbox</option></select></label>
        <label class="fld"><span>Country</span><input id="ap-country" type="text"></label>
        <label class="fld"><span>Preferred number</span><input id="ap-number" type="number" min="1" max="99"></label>
        <label class="fld"><span>Availability</span><input id="ap-avail" type="text" placeholder="e.g. every Wednesday 8pm CT"></label>
        <label class="fld wide"><span>Racing experience</span><textarea id="ap-exp" placeholder="Leagues, lap times, favourite tracks…"></textarea></label>
        ${taken.length ? `<div class="wide"><span class="muted" style="font-size:13px">Numbers already taken:</span><div class="taken">${taken.map(n => `<span>#${n}</span>`).join('')}</div></div>` : ''}
        <div class="wide" style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn primary" data-act="copy-app">Copy application</button>${applyBtn.replace('btn primary', 'btn')}</div>
        <label class="fld wide" hidden><span>Your application</span><textarea id="ap-out" readonly rows="8"></textarea></label>
      </div></section>` : ''}
  </div>`;
}
function copyApplication() {
  const v = id => ((document.getElementById('ap-' + id) || {}).value || '').trim();
  if (!v('name')) return toast('Add your name first', 'err');
  const num = v('number');
  if (num && S.data.drivers.some(x => x.active !== false && String(x.number) === num)) return toast(`#${num} is already taken — pick another`, 'err');
  const txt = [`**Driver application · ${S.data.league.name}**`, `Name: ${v('name')}`, `Gamertag: ${v('tag') || '—'}`, `Platform: ${v('platform')}`, `Country: ${v('country') || '—'}`, `Preferred number: ${num || 'Any'}`, `Availability: ${v('avail') || '—'}`, `Experience: ${v('exp') || '—'}`].join('\n');
  const out = document.getElementById('ap-out');
  if (out) { out.value = txt; out.closest('label').hidden = false; }
  (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject())
    .then(() => toast('Application copied! Paste it ' + (S.data.signups.formUrl ? 'into the form.' : 'in Discord.')))
    .catch(() => { if (out) out.select(); toast('Copy the text below and paste it in Discord.'); });
}

const notFound = () => `<div class="page">${empty('Page not found', '<p><a href="#/">Back to home</a></p>')}</div>`;

/* ---------------- router & chrome ---------------- */
const NAV = [['', 'Home'], ['schedule', 'Calendar'], ['results', 'Results'], ['standings', 'Standings'], ['drivers', 'Drivers'], ['teams', 'Teams'], ['news', 'News']];
const MORE = [['stewards', 'Stewards'], ['history', 'Hall of fame'], ['join', 'Join the league'], ['rules', 'Rules']];
const ROUTES = [
  [/^$/, d => pageHome(d)],
  [/^schedule$/, d => pageSchedule(d)],
  [/^results$/, d => pageResultsIndex(d)],
  [/^results\/([^/]+)(?:\/(\w+))?$/, (d, m) => pageRound(d, m[1], m[2])],
  [/^standings(?:\/(\w+))?$/, (d, m) => pageStandings(d, m[1])],
  [/^drivers$/, d => pageDrivers(d)],
  [/^driver\/([^/]+)$/, (d, m) => pageDriver(d, m[1])],
  [/^teams$/, d => pageTeams(d)],
  [/^team\/([^/]+)$/, (d, m) => pageTeam(d, m[1])],
  [/^news$/, d => pageNews(d)],
  [/^news\/([^/]+)$/, (d, m) => pageArticle(d, m[1])],
  [/^rules$/, d => pageRules(d)],
  [/^(?:stewards|fia)(?:\/([^/]+))?$/, (d, m) => pageStewards(d, m[1])],
  [/^history$/, d => pageHistory(d)],
  [/^history\/([^/]+)$/, (d, m) => pageHistorySeason(d, m[1])],
  [/^join$/, d => pageJoin(d)],
  [/^admin(?:\/(\w+))?$/, (d, m) => window.Admin ? window.Admin.render(m[1]) : notFound()]
];

function barRound(d) { const now = Date.now(); return rounds(d).find(r => !r.cancelled && r.start && new Date(r.start).getTime() + 3 * 36e5 > now); }
function raceBar() {
  const el = document.getElementById('race-bar'); if (!el || !S.data) return;
  const d = S.data, r = d.theme.topBanner === false ? null : barRound(d);
  if (!r) { el.hidden = true; el.innerHTML = ''; return; }
  const live = new Date(r.start) <= Date.now(), tz = trackTz(r);
  const o = { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' };
  const mine = fmtIn(r.start, null, o), track = tz ? fmtIn(r.start, tz, o) : '';
  el.hidden = false;
  el.innerHTML = `<div class="rb-inner">
    <a class="rb-round" href="#/results/${esc(r.id)}"><span class="rb-pill ${live ? 'live' : ''}">${live ? '● Live' : 'Next'}</span><span class="mono rb-meta">R${esc(r.round)}<span class="rb-sep">|</span>${esc(fmtDate(r.start, { day: '2-digit', month: 'short' }).toUpperCase())}</span><b>${flag(r.country)} ${esc(r.name)}</b><span class="rb-chev">›</span></a>
    <div class="rb-times">${live ? '' : `<span class="rb-cd" data-cd-short="${esc(r.start)}"></span>`}<div class="rb-t"><span>Your time</span><b class="mono">${esc(mine)}</b></div>${track ? `<div class="rb-t"><span>Track time</span><b class="mono">${esc(track)}</b></div>` : ''}</div>
  </div>`;
}
setInterval(() => { if (S.data) raceBar(); }, 60000);

function chrome() {
  const d = S.data, L = d.league;
  applyTheme(d);
  document.title = (L.name || 'F1 League') + (L.season ? ` · ${L.season}` : '');
  document.getElementById('brand-name').textContent = L.name || 'F1 League';
  document.getElementById('brand-season').textContent = L.season ? 'Season ' + L.season : '';
  const mark = document.getElementById('brand-mark');
  mark.innerHTML = L.logo ? `<img src="${esc(asset(L.logo))}" alt="" onerror="this.remove()">` : esc((L.name || 'F1').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase());
  const top = location.hash.replace(/^#\/?/, '').split('/')[0];
  const cur = ({ driver: 'drivers', team: 'teams', fia: 'stewards' })[top] || top;
  raceBar();
  const link = ([k, l]) => `<a href="#/${k}" class="${cur === k ? 'active' : ''}">${l}${k === 'join' && d.signups.open ? '<span class="dot" title="Sign-ups open"></span>' : ''}</a>`;
  const moreOn = MORE.some(([k]) => k === cur);
  document.getElementById('nav').innerHTML = NAV.map(link).join('') +
    `<div class="more"><button class="more-btn ${moreOn ? 'active' : ''}" data-act="more" aria-haspopup="true">More ▾${d.signups.open ? '<span class="dot"></span>' : ''}</button><div class="more-menu">${MORE.map(([k, l]) => [k, k === 'stewards' ? esc(rcName(d)) : l]).map(link).join('')}</div></div>`;
  const links = L.links || {};
  const ext = [['discord', 'Discord'], ['youtube', 'YouTube'], ['twitch', 'Twitch'], ['website', 'Website']].filter(([k]) => links[k]).map(([k, l]) => `<a href="${esc(links[k])}" target="_blank" rel="noopener">${l}</a>`).join('');
  document.getElementById('foot').innerHTML = `<div class="inner"><div><b style="color:var(--text)">${esc(L.name)}</b> · Season ${esc(L.season)}<br><span style="font-size:12px">Fan-run sim racing league. Not affiliated with Formula 1.</span></div>
    <div class="links">${ext}<a href="#/stewards">${esc(rcName(d))}</a><a href="#/history">Hall of fame</a><a href="#/join">Join</a><a href="#/rules">Rules</a><a href="#/admin">Admin</a></div></div>`;
}

function render(resetScroll) {
  if (!S.data) return;
  const path = decodeURIComponent(location.hash.replace(/^#\/?/, '')).replace(/\/$/, '');
  let html = null;
  for (const [re, fn] of ROUTES) { const m = path.match(re); if (m) { html = fn(S.data, m); break; } }
  chrome();
  document.getElementById('app').innerHTML = html ?? notFound();
  document.getElementById('nav').classList.remove('open');
  updateDraftBanner();
  tick();
  if (document.getElementById('prog')) mountProgress();
  if (resetScroll) window.scrollTo({ top: 0, behavior: 'instant' });
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-act="discard-draft"]');
  if (b && confirm('Throw away all unpublished changes in this browser?')) discardDraft();
});
document.addEventListener('click', e => {
  const more = e.target.closest('[data-act="more"]');
  document.querySelectorAll('.more.open').forEach(m => { if (!more || !m.contains(more)) m.classList.remove('open'); });
  if (more) { more.parentNode.classList.toggle('open'); return; }
  const ser = e.target.closest('[data-series]');
  if (ser) { const off = ser.classList.toggle('off'); const g = document.querySelector(`[data-line="${ser.dataset.series}"]`); if (g) g.style.display = off ? 'none' : ''; return; }
  const z = e.target.closest('img.zoomable');
  if (z && !z.closest('.admin')) { const o = document.createElement('div'); o.className = 'lightbox'; o.innerHTML = `<img src="${esc(z.currentSrc || z.src)}" alt="">`; o.addEventListener('click', () => o.remove()); document.body.appendChild(o); return; }
  if (e.target.closest('[data-act="copy-app"]')) copyApplication();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.lightbox').forEach(o => o.remove()); });
document.getElementById('mode-toggle').addEventListener('click', () => {
  lsSet(MODE_KEY, themeMode(S.data) === 'light' ? 'dark' : 'light');
  applyTheme(S.data);
});
if (window.matchMedia) matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (S.data) applyTheme(S.data); });
document.getElementById('nav-toggle').addEventListener('click', () => document.getElementById('nav').classList.toggle('open'));
window.addEventListener('hashchange', () => render(true));

/* expose helpers for the admin console */
window.LG = { S, esc, clone, uid, md, fmtPts, fmtDate, fmtTime, byId, flag, nameHTML, teamColor, toast, normalize, emptyLeague,
  rounds, session, isDone, nextRound, classify, poleDriver, computeStandings, saveDraft, clearDraft, discardDraft, render, DEFAULT_SCORING,
  DEFAULT_THEME, MODE_KEY, applyTheme, snapshotSeason, lastRound, ASSET_CACHE, asset, isImg, avatar };

load().then(() => render(false));
})();
