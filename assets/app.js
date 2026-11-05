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

function emptyLeague() {
  return {
    league: { name: 'My F1 League', season: String(new Date().getFullYear()), tagline: '', logo: '', rules: '', links: {} },
    settings: { adminHash: '' },
    scoring: clone(DEFAULT_SCORING),
    teams: [], drivers: [], calendar: [], results: {}, adjustments: [], news: [],
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
  ['teams', 'drivers', 'calendar', 'adjustments', 'news'].forEach(k => { if (!Array.isArray(d[k])) d[k] = []; });
  if (!d.results || typeof d.results !== 'object' || Array.isArray(d.results)) d.results = {};
  d.meta = d.meta || { updated: null };
  return d;
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

/* tiny markdown: # headings, **bold**, *italic*, [links](https://…), - lists, paragraphs */
function md(src) {
  const inline = s => s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  let html = '', para = [], list = null;
  const flushP = () => { if (para.length) { html += `<p>${inline(para.join(' '))}</p>`; para = []; } };
  const flushL = () => { if (list) { html += `<ul>${list.map(i => `<li>${inline(i)}</li>`).join('')}</ul>`; list = null; } };
  for (const raw of esc(src || '').split(/\r?\n/)) {
    const t = raw.trim(); let m;
    if (!t) { flushP(); flushL(); continue; }
    if ((m = t.match(/^(#{1,3})\s+(.*)/))) { flushP(); flushL(); const lv = m[1].length + 1; html += `<h${lv}>${inline(m[2])}</h${lv}>`; continue; }
    if ((m = t.match(/^[-*]\s+(.*)/))) { flushP(); (list = list || []).push(m[1]); continue; }
    flushL(); para.push(t);
  }
  flushP(); flushL();
  return html;
}
const plain = src => String(src || '').replace(/[#*_\[\]()>-]/g, '').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();

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
        <div class="hero-cta"><a class="btn primary" href="#/standings">Championship standings</a><a class="btn ghost" href="#/results">Latest results</a></div>
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
      <td class="mono hide-sm">${esc((w && w.laps) || r.laps || '')}</td>
    </tr>`;
  }).join('');
  return `<div class="page">${head('Season ' + d.league.season, 'Race results', 'Pick a round for the full classification, sprint and qualifying.')}
    ${roundPicker(d, null)}
    ${rs.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Rd</th><th>Grand Prix</th><th class="hide-sm">Date</th><th>Winner</th><th class="hide-sm">Team</th><th class="hide-sm">Pole</th><th class="hide-sm">Fastest lap</th><th class="hide-sm">Laps</th></tr></thead><tbody>${rows}</tbody></table></div>` : empty('No rounds yet')}
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
      <td><a href="#/driver/${esc(drv.id)}">${nameHTML(drv.name)}</a>${e.fastestLap && !isQ ? '<span class="tag-fl">FL</span>' : ''}${!isQ && sess === 'race' && pole === e.driverId ? '<span class="tag-pole">POLE</span>' : ''}</td>
      <td>${teamCell(t)}</td>
      ${isQ ? '' : `<td class="mono hide-sm">${esc(e.laps ?? '')}</td>`}
      <td class="mono">${esc(e.time || (e.pos ? '' : e.status))}</td>
      ${isQ ? '' : `<td class="pts">${fmtPts(e.pts)}</td>`}
    </tr>`;
  }).join('');

  const tabs = avail.length > 1 ? `<div class="tabs">${avail.map(s => `<a href="#/results/${esc(rid)}/${s}" class="${s === sess ? 'active' : ''}">${sessionName(s)}</a>`).join('')}</div>` : '';
  const notes = r.notes ? `<div class="card" style="margin-top:20px"><div class="prose">${md(r.notes)}</div></div>` : '';

  return `<div class="page">
    ${roundPicker(d, rid)}
    <div class="page-head"><div class="eyebrow">Round ${esc(r.round)} · ${esc(sessionName(sess))}</div>
      <div class="round-head">${flag(r.country, 'lg')}<h1 style="margin:0">${esc(r.name)}</h1>
        <div class="round-nav">${prev ? `<a class="btn sm" href="#/results/${esc(prev.id)}">← R${esc(prev.round)}</a>` : ''}${next ? `<a class="btn sm" href="#/results/${esc(next.id)}">R${esc(next.round)} →</a>` : ''}</div>
      </div>
      <div class="rh-meta"><span>${esc(r.track || '')}</span>${r.start ? `<span class="mono">${fmtDate(r.start, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>` : ''}${r.laps ? `<span>${esc(r.laps)} laps</span>` : ''}</div>
    </div>
    ${tabs}
    ${cl.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Pos</th><th class="hide-sm">No</th><th>Driver</th><th>Team</th>${isQ ? '' : '<th class="hide-sm">Laps</th>'}<th>${isQ ? 'Lap time' : 'Time / Retired'}</th>${isQ ? '' : '<th class="r">Pts</th>'}</tr></thead><tbody>${rows}</tbody></table></div>`
      : empty(r.cancelled ? 'This round was cancelled' : 'No results yet', r.start ? `<p>${esc(sessionName(sess))} scheduled for ${fmtDate(r.start)} · ${fmtTime(r.start)}</p>` : '')}
    ${notes}
  </div>`;
}

function pageStandings(d, view) {
  view = ['drivers', 'teams', 'grid'].includes(view) ? view : 'drivers';
  const st = computeStandings(d);
  const tabs = `<div class="tabs">${[['drivers', 'Drivers'], ['teams', 'Constructors'], ['grid', 'Season grid']].map(([k, l]) => `<a href="#/standings/${k}" class="${k === view ? 'active' : ''}">${l}</a>`).join('')}</div>`;
  let body = '';
  if (view === 'drivers') {
    body = st.drivers.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Pos</th><th>Driver</th><th class="hide-sm">Nat</th><th>Team</th><th class="r hide-sm">Wins</th><th class="r hide-sm">Podiums</th><th class="r">Pts</th></tr></thead><tbody>
      ${st.drivers.map(x => { const drv = driverLabel(d, x.id), t = driverTeam(d, drv, x); return `<tr class="${x.position <= 3 ? 'top' + x.position : ''}"><td class="pos">${x.position}</td><td><a href="#/driver/${esc(x.id)}">${nameHTML(drv.name)}</a>${x.adj ? `<span class="adj-note" title="Includes penalties/adjustments">(${x.adj > 0 ? '+' : ''}${fmtPts(x.adj)})</span>` : ''}</td><td class="hide-sm">${flag(drv.country)}</td><td>${teamCell(t)}</td><td class="r mono hide-sm">${x.wins}</td><td class="r mono hide-sm">${x.podiums}</td><td class="pts">${fmtPts(x.points)}</td></tr>`; }).join('')}
      </tbody></table></div>` : empty('No drivers yet');
  } else if (view === 'teams') {
    body = st.teams.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Pos</th><th>Team</th><th class="hide-sm">Drivers</th><th class="r hide-sm">Wins</th><th class="r hide-sm">Podiums</th><th class="r">Pts</th></tr></thead><tbody>
      ${st.teams.map(x => { const t = teamLabel(d, x.id); const drs = d.drivers.filter(p => p.teamId === x.id && p.active !== false).map(p => esc(p.name.split(' ').pop())).join(' / '); return `<tr class="${x.position <= 3 ? 'top' + x.position : ''}"><td class="pos">${x.position}</td><td><a href="#/team/${esc(x.id)}">${teamCell(t)}</a>${x.adj ? `<span class="adj-note">(${x.adj > 0 ? '+' : ''}${fmtPts(x.adj)})</span>` : ''}</td><td class="muted hide-sm">${drs}</td><td class="r mono hide-sm">${x.wins}</td><td class="r mono hide-sm">${x.podiums}</td><td class="pts">${fmtPts(x.points)}</td></tr>`; }).join('')}
      </tbody></table></div>` : empty('No teams yet');
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
    return `<a class="driver-card" href="#/driver/${esc(drv.id)}" style="--tc:${esc(teamColor(t))}">
      <div class="dc-pos">${s.position ? 'P' + s.position + ' in championship' : 'Driver'}</div>
      <div class="dc-pts"><b>${fmtPts(s.points)}</b><span>PTS</span></div>
      ${drv.photo ? `<img class="dc-photo" src="${esc(drv.photo)}" alt="" loading="lazy" onerror="this.remove()">` : `<div class="dc-num">${esc(drv.number ?? '')}</div>`}
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
  const adjs = d.adjustments.filter(a => a.type !== 'team' && a.targetId === id);
  return `<div class="page">
    <a class="back" href="#/drivers">← All drivers</a>
    <div class="profile-hero" style="--tc:${esc(teamColor(t))}">
      ${D.photo ? `<img class="ph-photo" src="${esc(D.photo)}" alt="" onerror="this.remove()">` : `<div class="ph-num">${esc(D.number ?? '')}</div>`}
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
      <div style="display:flex;gap:12px;align-items:center">${t.logo ? `<img class="tc-logo" src="${esc(t.logo)}" alt="" onerror="this.remove()">` : ''}<div class="tc-pts"><b>${fmtPts(s.points)}</b><span>PTS</span></div></div></div>
      <div class="tc-drivers">${drs.length ? drs.map(x => `<div class="tc-driver"><small>#${esc(x.number ?? '')}</small>${nameHTML(x.name)}</div>`).join('') : '<div class="tc-driver muted">No drivers yet</div>'}</div>
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
      ${T.logo ? `<img class="ph-photo" src="${esc(T.logo)}" alt="" style="height:70%;bottom:15%" onerror="this.remove()">` : ''}
      <div class="eyebrow">${x.position ? `P${x.position} in constructors'` : 'Constructor'}</div>
      <h1>${esc(T.name)}</h1>
      <dl class="kv" style="position:relative;margin-top:14px">
        ${T.base ? `<dt>Base</dt><dd>${esc(T.base)}</dd>` : ''}${T.principal ? `<dt>Team principal</dt><dd>${esc(T.principal)}</dd>` : ''}${T.car ? `<dt>Chassis</dt><dd>${esc(T.car)}</dd>` : ''}${T.engine ? `<dt>Power unit</dt><dd>${esc(T.engine)}</dd>` : ''}
      </dl>
      ${T.bio ? `<div class="bio prose">${md(T.bio)}</div>` : ''}
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
    <div class="nc-img">${n.image ? `<img src="${esc(n.image)}" alt="" loading="lazy" onerror="this.remove()">` : ''}<div class="ph" ${n.image ? 'style="display:none"' : ''}>${initials}</div></div>
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
    ${n.image ? `<div class="a-cover"><img src="${esc(n.image)}" alt="" onerror="this.parentNode.remove()"></div>` : ''}
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

const notFound = () => `<div class="page">${empty('Page not found', '<p><a href="#/">Back to home</a></p>')}</div>`;

/* ---------------- router & chrome ---------------- */
const NAV = [['', 'Home'], ['schedule', 'Calendar'], ['results', 'Results'], ['standings', 'Standings'], ['drivers', 'Drivers'], ['teams', 'Teams'], ['news', 'News'], ['rules', 'Rules']];
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
  [/^admin(?:\/(\w+))?$/, (d, m) => window.Admin ? window.Admin.render(m[1]) : notFound()]
];

function chrome() {
  const d = S.data, L = d.league;
  document.title = (L.name || 'F1 League') + (L.season ? ` · ${L.season}` : '');
  document.getElementById('brand-name').textContent = L.name || 'F1 League';
  document.getElementById('brand-season').textContent = L.season ? 'Season ' + L.season : '';
  const mark = document.getElementById('brand-mark');
  mark.innerHTML = L.logo ? `<img src="${esc(L.logo)}" alt="" onerror="this.remove()">` : esc((L.name || 'F1').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase());
  const path = location.hash.replace(/^#\/?/, '');
  const top = path.split('/')[0];
  const alias = { driver: 'drivers', team: 'teams' };
  document.getElementById('nav').innerHTML = NAV.map(([k, l]) => `<a href="#/${k}" class="${(alias[top] || top) === k ? 'active' : ''}">${l}</a>`).join('');
  const links = L.links || {};
  const ext = [['discord', 'Discord'], ['youtube', 'YouTube'], ['twitch', 'Twitch'], ['website', 'Website']].filter(([k]) => links[k]).map(([k, l]) => `<a href="${esc(links[k])}" target="_blank" rel="noopener">${l}</a>`).join('');
  document.getElementById('foot').innerHTML = `<div class="inner"><div><b style="color:var(--text)">${esc(L.name)}</b> · Season ${esc(L.season)}<br><span style="font-size:12px">Fan-run sim racing league. Not affiliated with Formula 1.</span></div>
    <div class="links">${ext}<a href="#/rules">Rules</a><a href="#/admin">Admin</a></div></div>`;
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
  if (resetScroll) window.scrollTo({ top: 0, behavior: 'instant' });
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-act="discard-draft"]');
  if (b && confirm('Throw away all unpublished changes in this browser?')) discardDraft();
});
document.getElementById('nav-toggle').addEventListener('click', () => document.getElementById('nav').classList.toggle('open'));
window.addEventListener('hashchange', () => render(true));

/* expose helpers for the admin console */
window.LG = { S, esc, clone, uid, md, fmtPts, fmtDate, fmtTime, byId, flag, nameHTML, teamColor, toast, normalize, emptyLeague,
  rounds, session, isDone, nextRound, classify, poleDriver, computeStandings, saveDraft, clearDraft, discardDraft, render, DEFAULT_SCORING };

load().then(() => render(false));
})();
