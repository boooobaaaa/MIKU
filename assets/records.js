/* =========================================================
   RECORDS — Hall of Fame stats per season and all-time.
   Worked out from results: the live season + every archived
   season file (data/seasons/<id>.json).
   ========================================================= */
(() => {
'use strict';
const LG = window.LG;
const { esc, byId } = LG;

const R = { view: 'champions', scope: 'all', kind: 'drivers', cache: {}, loading: false, err: '' };

/* ---------- per-season numbers ---------- */
function seasonStats(d, label) {
  const rs = LG.rounds(d).filter(r => !r.cancelled).slice().sort((a, b) => Number(a.round) - Number(b.round));
  const st = LG.computeStandings(d);
  const D = {}, T = {};
  const blank = () => ({ points: 0, best: 0, sprintPts: 0, starts: 0, wins: 0, podiums: 0, sprintWins: 0, poles: 0, fls: 0, sprintPoles: 0, finSum: 0, finN: 0, ptsFin: 0, entered: 0, seq: [] });
  const dr = id => D[id] || (D[id] = Object.assign(blank(), { id }));
  const tm = id => T[id] || (T[id] = Object.assign(blank(), { id }));
  const started = e => e.status !== 'DNS' && e.status !== 'NS';
  rs.forEach(r => {
    const pole = LG.poleDriver(d, r.id);
    const race = LG.classify(LG.session(d, r.id, 'race'), 'race', d.scoring, pole);
    if (race.length) {
      const teamsIn = {};
      race.forEach(e => {
        if (!started(e)) return;
        const x = dr(e.driverId); x.starts++;
        const t = e.teamId ? tm(e.teamId) : null; if (t) { t.starts++; teamsIn[e.teamId] = teamsIn[e.teamId] || { win: false, pod: false }; }
        const win = e.pos === 1, pod = e.pos && e.pos <= 3;
        [x, t].forEach(o => { if (!o) return; if (win) o.wins++; if (pod) o.podiums++; if (e.fastestLap) o.fls++; if (e.pos) { o.finSum += e.pos; o.finN++; } if ((e.pts || 0) > 0) o.ptsFin++; });
        x.seq.push({ win, pod });
        if (t) { if (win) teamsIn[e.teamId].win = true; if (pod) teamsIn[e.teamId].pod = true; }
      });
      Object.entries(teamsIn).forEach(([id, v]) => { const t = tm(id); t.entered++; t.seq.push(v); });
      if (pole) {
        dr(pole).poles++;
        const pe = race.find(e => e.driverId === pole) || LG.session(d, r.id, 'quali').find(e => e.driverId === pole);
        if (pe && pe.teamId) tm(pe.teamId).poles++;
      }
    }
    const spr = LG.classify(LG.session(d, r.id, 'sprint'), 'sprint', d.scoring, null);
    spr.forEach(e => {
      const x = dr(e.driverId), t = e.teamId ? tm(e.teamId) : null;
      [x, t].forEach(o => { if (!o) return; o.sprintPts += e.pts || 0; if (e.pos === 1) o.sprintWins++; });
    });
    const sq = LG.session(d, r.id, 'sprintQuali'), sprRaw = LG.session(d, r.id, 'sprint');
    const sp = sq.length ? (LG.classify(sq, 'quali', d.scoring, null).find(e => e.pos === 1) || {}) : (sprRaw.find(e => e.pole) || {});
    if (sp.driverId) { dr(sp.driverId).sprintPoles++; if (sp.teamId) tm(sp.teamId).sprintPoles++; }
  });
  st.drivers.forEach(x => { dr(x.id).points = x.points; dr(x.id).best = x.points; });
  st.teams.forEach(x => { tm(x.id).points = x.points; tm(x.id).best = x.points; });
  const nameD = id => { const p = byId(d.drivers, id); return p ? { name: p.name, color: LG.teamColor(byId(d.teams, p.teamId)), photo: p.headshot || p.photo, number: p.number } : null; };
  const nameT = id => { const t = byId(d.teams, id); return t ? { name: t.name, color: LG.teamColor(t), logo: t.logo } : null; };
  Object.values(D).forEach(x => { x.who = nameD(x.id); x.bestSeason = label; });
  Object.values(T).forEach(x => { x.who = nameT(x.id); x.bestSeason = label; x.carStarts = x.starts; x.starts = x.entered; });
  return { label, D, T };
}

/* merge several seasons (oldest first) */
function merge(list) {
  const out = { D: {}, T: {} };
  list.forEach(ss => ['D', 'T'].forEach(k => Object.values(ss[k]).forEach(x => {
    const o = out[k][x.id] || (out[k][x.id] = { id: x.id, points: 0, best: 0, bestSeason: '', sprintPts: 0, starts: 0, carStarts: 0, wins: 0, podiums: 0, sprintWins: 0, poles: 0, fls: 0, sprintPoles: 0, finSum: 0, finN: 0, ptsFin: 0, seq: [], who: null });
    ['points', 'sprintPts', 'starts', 'carStarts', 'wins', 'podiums', 'sprintWins', 'poles', 'fls', 'sprintPoles', 'finSum', 'finN', 'ptsFin'].forEach(f => { o[f] += x[f] || 0; });
    if ((x.best || 0) > o.best) { o.best = x.best; o.bestSeason = ss.label; }
    o.seq = o.seq.concat(x.seq);
    if (x.who) o.who = x.who; // newest name/photo wins
  })));
  return out;
}
const streak = (seq, k) => { let b = 0, c = 0; seq.forEach(s => { c = s[k] ? c + 1 : 0; if (c > b) b = c; }); return b; };

/* ---------- record definitions ---------- */
const pct = v => (v * 100).toFixed(v >= 0.995 || v === 0 ? 0 : 1) + '%';
const num = v => LG.fmtPts ? LG.fmtPts(v) : String(v);
function defs(kind, scope) {
  const car = kind === 'teams';
  const per = x => car ? (x.carStarts || 1) : x.starts;
  const single = scope === 'all';
  return [
    ['Points & Championship Records', [
      [single ? 'Most career points' : 'Most points', x => x.points, num, 'pts'],
      ...(single ? [['Most points in a single season', x => x.best, num, 'pts', x => x.bestSeason ? LG.seasonName(x.bestSeason) : '']] : []),
      ['Highest points-per-race average', x => x.starts ? x.points / x.starts : 0, v => v.toFixed(2), 'per race', null, true],
      ['Most sprint points', x => x.sprintPts, num, 'pts']]],
    ['Wins & Podiums Records', [
      ['Most race wins', x => x.wins, String, ''],
      ['Highest win percentage', x => x.starts ? x.wins / x.starts : 0, pct, '', null, true],
      ['Most podiums', x => x.podiums, String, ''],
      ['Highest podium percentage', x => per(x) ? x.podiums / per(x) : 0, pct, '', null, true],
      ['Most sprint wins', x => x.sprintWins, String, '']]],
    ['Qualifying & Pace Records', [
      ['Most pole positions', x => x.poles, String, ''],
      ['Highest pole percentage', x => x.starts ? x.poles / x.starts : 0, pct, '', null, true],
      ['Most fastest laps', x => x.fls, String, ''],
      ['Most sprint poles', x => x.sprintPoles, String, '']]],
    ['Consistency & Dominance Records', [
      ['Best average finish', x => x.finN ? -(x.finSum / x.finN) : -999, v => 'P' + (-v).toFixed(2), '', null, true],
      ['Most points finishes', x => x.ptsFin, String, ''],
      ['Longest win streak', x => streak(x.seq, 'win'), String, 'in a row'],
      ['Longest podium streak', x => streak(x.seq, 'pod'), String, 'in a row'],
      [single ? 'Most career starts' : 'Most starts', x => x.starts, String, car ? 'races' : '']]]
  ];
}

/* ---------- loading archives ---------- */
async function loadSeason(s) {
  if (R.cache[s.id]) return R.cache[s.id];
  const r = await fetch(s.file + '?t=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) throw new Error(`${LG.seasonName(s.label)}: ${r.status === 404 ? 'archive file not uploaded' : r.status}`);
  const data = LG.normalize(await r.json());
  return (R.cache[s.id] = seasonStats(data, s.label));
}
function archives() { return window.Extras ? window.Extras.seasonsIndex(LG.S.data) : []; }
function ensure(scope) {
  const list = archives().filter(s => scope === 'all' || s.id === scope).filter(s => !R.cache[s.id]);
  if (!list.length || R.loading) return !list.length;
  R.loading = true;
  Promise.allSettled(list.map(loadSeason)).then(rs => { const bad = rs.filter(x => x.status === 'rejected'); R.err = bad.length ? 'Some seasons couldn’t be loaded — ' + bad.map(b => b.reason.message).join('; ') : ''; })
    .finally(() => { R.loading = false; LG.render(false); });
  return false;
}

/* sakura sprigs in the leader's team colour */
const PETAL = 'M0 0C-7.5-5-9-14.5-4.2-20.5L0-17.2L4.2-20.5C9-14.5 7.5-5 0 0Z';
const flower = (x, y, sc, rot, op) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${sc})" opacity="${op}">${[0, 72, 144, 216, 288].map(a => `<path d="${PETAL}" transform="rotate(${a})"/>`).join('')}<circle r="3.2" class="c"/></g>`;
const blossoms = () => `<svg class="rec-sakura" viewBox="0 0 140 110" aria-hidden="true"><path class="br" d="M140 8C112 14 96 30 78 48S44 78 20 84" /><path class="br" d="M98 30c-4-12-2-20 6-26"/>${flower(118, 18, 1.1, 12, .95)}${flower(86, 40, .85, -20, .8)}${flower(52, 66, .7, 30, .6)}${flower(104, 2, .55, 40, .6)}${flower(26, 82, .5, 0, .45)}</svg>`;

/* rotate tied leaders */
setInterval(() => {
  document.querySelectorAll('[data-rec-rot]').forEach(box => {
    const sl = [...box.children], n = sl.length, cur = sl.findIndex(x => x.classList.contains('on')), nx = (cur + 1) % n;
    sl[cur].classList.remove('on'); sl[cur].classList.add('out'); setTimeout(() => sl[cur].classList.remove('out'), 600);
    sl[nx].classList.add('on');
    const card = box.closest('.rec-card'); card.style.setProperty('--tc', sl[nx].dataset.tc);
    const b = card.querySelector('.rec-tie b'); if (b) b.textContent = nx + 1;
    card.querySelectorAll('.rec-dots i').forEach((d, k) => d.classList.toggle('on', k === nx));
  });
}, 3500);

/* ---------- view ---------- */
function block() {
  const live = LG.S.data;
  const arch = archives();
  const scopes = [['all', 'All time'], ['live', LG.seasonName(live.league.season)], ...arch.slice().reverse().map(s => [s.id, LG.seasonName(s.label)])];
  if (!scopes.some(s => s[0] === R.scope)) R.scope = 'all';
  const ready = R.scope === 'live' ? true : ensure(R.scope);
  const head = `<div class="rec-bar"><select data-rec="scope">${scopes.map(([k, l]) => `<option value="${esc(k)}" ${R.scope === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
    <div class="tabs"><button data-rec-kind="drivers" class="${R.kind === 'drivers' ? 'active' : ''}">Drivers</button><button data-rec-kind="teams" class="${R.kind === 'teams' ? 'active' : ''}">Constructors</button></div></div>`;
  if (!ready) return head + '<p class="muted rec-loading">Loading season archives…</p>';
  const liveStats = seasonStats(live, live.league.season);
  let src;
  if (R.scope === 'live') src = merge([liveStats]);
  else if (R.scope === 'all') src = merge([...arch.map(s => R.cache[s.id]).filter(Boolean), liveStats]);
  else src = merge([R.cache[R.scope]].filter(Boolean));
  const pool = Object.values(R.kind === 'teams' ? src.T : src.D).filter(x => x.who && (x.starts || x.points));
  if (!pool.length) return head + (R.err ? `<div class="warn">${esc(R.err)}</div>` : '') + '<div class="card"><p class="muted">No results yet for this selection.</p></div>';
  const maxStarts = Math.max(...pool.map(x => x.starts)), minRate = Math.max(1, Math.ceil(maxStarts * 0.25));
  const card = ([title, fn, fmt, unit, extra, rate]) => {
    const all = pool.filter(x => !rate || x.starts >= minRate).map(x => ({ x, v: fn(x) })).filter(o => o.v > 0 || (rate && o.v > -999 && o.v !== 0)).sort((a, b) => b.v - a.v);
    if (!all.length) return `<div class="rec-card empty"><h4>${esc(title)}</h4>${blossoms()}<p class="muted">No record yet</p></div>`;
    const best = all[0].v, leaders = all.filter(o => Math.abs(o.v - best) < 1e-9), rest = all.slice(leaders.length, leaders.length + 4);
    const slide = (o, k) => {
      const w = o.x.who;
      const pic = R.kind === 'teams' ? (w.logo ? `<img src="${esc(LG.asset(w.logo))}" alt="" onerror="this.remove()">` : `<i>${esc(w.name[0])}</i>`) : (w.photo ? `<img src="${esc(LG.asset(w.photo))}" alt="" onerror="this.remove()">` : `<i>${esc(w.number ?? w.name[0])}</i>`);
      return `<div class="rec-top ${k === 0 ? 'on' : ''}" style="--tc:${esc(w.color)}" data-tc="${esc(w.color)}"><span class="rec-pic">${pic}</span><div class="rec-who"><b>${R.kind === 'teams' ? esc(w.name) : LG.nameHTML(w.name)}</b>${extra && extra(o.x) ? `<small>${esc(extra(o.x))}</small>` : ''}</div><div class="rec-val"><b class="mono">${esc(fmt(o.v))}</b>${unit ? `<small>${esc(unit)}</small>` : ''}</div></div>`;
    };
    const tie = leaders.length > 1;
    return `<div class="rec-card ${tie ? 'tied' : ''}" style="--tc:${esc(leaders[0].x.who.color)}">${blossoms()}<h4>${esc(title)}${tie ? `<span class="rec-tie">Tied · <b>1</b>/${leaders.length}</span>` : ''}</h4>
      <div class="rec-tops" ${tie ? `data-rec-rot="${leaders.length}"` : ''}>${leaders.map(slide).join('')}</div>
      ${tie ? `<div class="rec-dots">${leaders.map((_, k) => `<i class="${k === 0 ? 'on' : ''}"></i>`).join('')}</div>` : ''}
      ${rest.length ? `<ol class="rec-rest">${rest.map((o, k) => `<li style="--tc:${esc(o.x.who.color)}" data-n="${leaders.length + k + 1}"><span>${esc(o.x.who.name)}${extra && extra(o.x) ? ` <small class="muted">${esc(extra(o.x))}</small>` : ''}</span><b class="mono">${esc(fmt(o.v))}</b></li>`).join('')}</ol>` : ''}</div>`;
  };
  return head + (R.err ? `<div class="warn">${esc(R.err)}</div>` : '') + defs(R.kind, R.scope === 'all' ? 'all' : 'one').map(([cat, list]) => `<section class="rec-cat"><div class="section-title"><h2>${esc(cat)}</h2></div><div class="rec-grid">${list.map(card).join('')}</div></section>`).join('')
    + `<p class="hint rec-note">Percentages and averages only count ${R.kind === 'teams' ? 'teams' : 'drivers'} with at least ${minRate} race start${minRate === 1 ? '' : 's'}. ${R.kind === 'teams' ? 'Team podium % and points finishes count every car; win, pole % and starts count races entered.' : ''} Streaks count consecutive race starts.</p>`;
}

document.addEventListener('click', e => {
  const k = e.target.closest && e.target.closest('[data-rec-kind]'); if (k) { R.kind = k.dataset.recKind; return LG.render(false); }
  const v = e.target.closest && e.target.closest('[data-hof-view]'); if (v) { R.view = v.dataset.hofView; return LG.render(false); }
});
document.addEventListener('change', e => { if (e.target.matches && e.target.matches('[data-rec="scope"]')) { R.scope = e.target.value; LG.render(false); } });

window.Records = { block, state: R, seasonStats };
})();
