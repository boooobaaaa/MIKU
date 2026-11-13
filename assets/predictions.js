/* =========================================================
   PREDICTIONS — fans predict the next round (podium, fastest
   lap, pole). Stored in Firebase (same project as Grid Draft).
   The admin opens a round; picks lock automatically at the
   start of qualifying (or the race if there's no qualifying).
   ========================================================= */
(() => {
'use strict';
const LG = window.LG;
const { esc, toast, byId } = LG;

const cfg = d => Object.assign({ enabled: false, intro: '', points: {} }, d.predictions || {});
const PTS = d => Object.assign({ exact: 3, podium: 1, fl: 2, pole: 2 }, cfg(d).points || {});
const lockFor = r => {
  if (!r) return 0;
  const q = (r.sessions || []).find(s => s && /^qualifying$/i.test(String(s.name || '').trim()) && s.start);
  const t = new Date((q && q.start) || r.start || 0).getTime();
  return isNaN(t) ? 0 : t;
};
const nameKey = 'league.pred.name';
const getName = () => { try { return localStorage.getItem(nameKey) || ''; } catch (e) { return ''; } };
const setName = v => { try { localStorage.setItem(nameKey, v); } catch (e) { } };

/* ---------- scoring ---------- */
function actual(d, rid) {
  const race = LG.classify(LG.session(d, rid, 'race'), 'race', d.scoring, LG.poleDriver(d, rid));
  if (!race.length) return null;
  const fin = race.filter(e => e.pos).sort((a, b) => a.pos - b.pos);
  const fl = race.find(e => e.fastestLap);
  return { podium: fin.slice(0, 3).map(e => e.driverId), fl: fl ? fl.driverId : '', pole: LG.poleDriver(d, rid) || '' };
}
function score(d, p, act) {
  act = act || actual(d, p.roundId); if (!act) return null;
  const P = PTS(d), out = { total: 0, podium: [0, 0, 0], fl: 0, pole: 0, exact: 0 };
  (p.podium || []).forEach((id, i) => {
    if (!id) return;
    if (act.podium[i] === id) { out.podium[i] = Number(P.exact) || 0; out.exact++; }
    else if (act.podium.includes(id)) out.podium[i] = Number(P.podium) || 0;
  });
  if (p.fl && p.fl === act.fl) out.fl = Number(P.fl) || 0;
  if (p.pole && p.pole === act.pole) out.pole = Number(P.pole) || 0;
  out.total = out.podium.reduce((a, b) => a + b, 0) + out.fl + out.pole;
  return out;
}

/* ---------- state ---------- */
const S = { rounds: null, all: null, loading: false, err: '', tab: 'round', busy: false, view: '' };
function load(s) {
  if (S.loading || S.rounds !== null) return;
  S.loading = true;
  Promise.all([s.predRounds(), s.allPreds()])
    .then(([r, a]) => { S.rounds = r; S.all = a; S.err = ''; })
    .catch(e => { S.rounds = S.rounds || {}; S.all = S.all || []; S.err = e.code || e.message; })
    .finally(() => { S.loading = false; LG.render(false); });
}
window.addEventListener('hashchange', () => { if (/^#\/predictions/.test(location.hash) && !S.loading && !S.busy) { S.rounds = null; S.all = null; } });

/* which round is the prediction round right now */
function currentRound(d) {
  const now = Date.now(), R = S.rounds || {};
  const rs = LG.rounds(d).filter(r => !r.cancelled);
  const open = rs.filter(r => R[r.id] && R[r.id].open);
  const live = open.filter(r => (R[r.id].lockAt || lockFor(r)) > now).sort((a, b) => lockFor(a) - lockFor(b))[0];
  if (live) return { r: live, state: 'open' };
  const waiting = open.filter(r => !LG.isDone(d, r)).sort((a, b) => lockFor(a) - lockFor(b))[0];
  if (waiting) return { r: waiting, state: 'locked' };
  const next = LG.nextRound(d);
  return next ? { r: next, state: 'soon' } : { r: null, state: 'none' };
}

/* ---------- page ---------- */
const until = t => {
  const ms = t - Date.now(); if (ms <= 0) return 'now';
  const m = Math.floor(ms / 60000), dd = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  return dd ? `${dd}d ${h}h` : h ? `${h}h ${mm}m` : `${mm}m`;
};
const drvName = (d, id) => { const x = byId(d.drivers, id); return x ? x.name : '—'; };
const chipD = (d, id, ok) => { if (!id) return '<span class="muted">—</span>'; const x = byId(d.drivers, id), t = x && byId(d.teams, x.teamId); return `<span class="pr-pick ${ok === true ? 'hit' : ok === 'near' ? 'near' : ''}" style="--tc:${esc(LG.teamColor(t))}">${x ? LG.nameHTML(x.name) : '—'}</span>`; };

function page(d) {
  const C = cfg(d), s = window.Portal && window.Portal.store(d);
  const head = `<div class="page-head pr-head"><div class="eyebrow">${esc(LG.seasonName(d.league.season))}</div><h1>Predictions</h1><p class="lead">${C.intro ? LG.md(C.intro) : 'Call the podium, fastest lap and pole before qualifying starts — points for every correct pick.'}</p></div>`;
  if (!C.enabled) return `<div class="page">${head}<div class="card"><p class="muted">Predictions aren't open on this site yet.</p></div></div>`;
  if (!s) return `<div class="page">${head}<div class="card"><p class="muted">Predictions aren't set up yet.</p></div></div>`;
  if (!s.ready) return `<div class="page">${head}<p class="muted">Loading…</p></div>`;
  load(s);
  if (S.rounds === null) return `<div class="page">${head}<p class="muted">Loading predictions…</p></div>`;
  const P = PTS(d);
  const tabs = `<div class="tabs"><button data-pr-tab="round" class="${S.tab === 'round' ? 'active' : ''}">This round</button><button data-pr-tab="board" class="${S.tab === 'board' ? 'active' : ''}">Leaderboard</button><button data-pr-tab="past" class="${S.tab === 'past' ? 'active' : ''}">Past rounds</button></div>`;
  const how = `<div class="pr-how"><span><b>${P.exact}</b> exact podium spot</span><span><b>${P.podium}</b> right driver, wrong spot</span><span><b>${P.fl}</b> fastest lap</span><span><b>${P.pole}</b> pole</span></div>`;
  let body = '';
  if (S.tab === 'board') body = board(d);
  else if (S.tab === 'past') body = past(d, s);
  else body = roundView(d, s);
  return `<div class="page">${head}${S.err ? `<div class="warn">${esc(S.err)}</div>` : ''}${tabs}${body}${S.tab === 'round' ? how : ''}</div>`;
}

function roundView(d, s) {
  const { r, state } = currentRound(d);
  if (!r) return '<div class="card"><p class="muted">The season is over — see you next season!</p></div>';
  const R = (S.rounds || {})[r.id] || {}, lockAt = R.lockAt || lockFor(r);
  const mine = s.user ? (S.all || []).find(p => p.roundId === r.id && p.uid === s.user.uid) : null;
  const hdr = `<div class="pr-round card" style="--tc:var(--miku)"><div>${LG.flag(r.country, 'lg')}</div><div><div class="eyebrow">Round ${esc(r.round)}</div><h2>${esc(r.name)}</h2>
      <div class="muted">${state === 'open' ? `Closes <b>${esc(LG.fmtDate(lockAt))} · ${esc(LG.fmtTime(lockAt))}</b> <span class="pr-count">in ${esc(until(lockAt))}</span>` : state === 'locked' ? '🔒 Predictions are locked — results soon' : 'Predictions open soon'}</div></div>
      <div class="pr-entries"><b>${(S.all || []).filter(p => p.roundId === r.id).length}</b><span>entries</span></div></div>`;
  if (state === 'soon') return hdr + '<div class="card"><p class="muted">The admins haven\'t opened predictions for this round yet — check back closer to the weekend.</p></div>';
  if (state === 'locked') return hdr + entriesTable(d, r, s);
  if (!s.user) return hdr + `<div class="card ap-signin"><div><h3>Sign in to predict</h3><p class="muted">Sign in with Google so your picks and points are saved. Only the name you choose is shown publicly.</p></div><button class="btn primary" data-pr="signin">Sign in with Google</button></div>`;
  const drivers = d.drivers.filter(x => x.active !== false).slice().sort((a, b) => (parseInt(a.number, 10) || 999) - (parseInt(b.number, 10) || 999));
  const sel = (nm, val, label, ph) => `<label class="fld pr-fld"><span>${label}</span><select name="${nm}" required><option value="">${ph}</option>${drivers.map(x => { const t = byId(d.teams, x.teamId); return `<option value="${esc(x.id)}" ${x.id === val ? 'selected' : ''}>${x.number != null && x.number !== '' ? '#' + esc(x.number) + ' ' : ''}${esc(x.name)}${t ? ' · ' + esc(t.name) : x.reserve ? ' · reserve' : ''}</option>`; }).join('')}</select></label>`;
  const pod = (mine && mine.podium) || [];
  return hdr + `<form class="card pr-form" data-pr-form="${esc(r.id)}">
      <div class="pr-who">Signed in as <b>${esc(s.user.email)}</b> · <a href="javascript:void 0" data-pr="signout">Sign out</a>${mine ? ' · <span class="ok-txt">✓ Your picks are saved — you can change them until it closes</span>' : ''}</div>
      <label class="fld"><span>Your name on the leaderboard</span><input name="name" maxlength="40" value="${esc((mine && mine.name) || getName())}" placeholder="e.g. Miku Fan 39" required autocomplete="off"></label>
      <div class="pr-podium">
        <div class="pr-step p2">${sel('p2', pod[1], '🥈 P2', 'Second place…')}</div>
        <div class="pr-step p1">${sel('p1', pod[0], '🥇 Winner', 'Race winner…')}</div>
        <div class="pr-step p3">${sel('p3', pod[2], '🥉 P3', 'Third place…')}</div>
      </div>
      <div class="pr-extra">${sel('fl', mine && mine.fl, '⏱ Fastest lap', 'Fastest lap…')}${sel('pole', mine && mine.pole, '⚡ Pole position', 'Pole sitter…')}</div>
      <div class="toolbar" style="margin-top:14px"><button class="btn primary" ${S.busy ? 'disabled' : ''}>${mine ? 'Update my predictions' : 'Lock in my predictions'}</button><span class="hint" style="margin:0">Everyone's picks are revealed when predictions close.</span></div>
    </form>`;
}

function entriesTable(d, r, s) {
  const list = (S.all || []).filter(p => p.roundId === r.id);
  if (!list.length) return '<div class="card"><p class="muted">No predictions for this round.</p></div>';
  const act = actual(d, r.id);
  const rows = list.map(p => ({ p, sc: act ? score(d, p, act) : null })).sort((a, b) => ((b.sc || {}).total || 0) - ((a.sc || {}).total || 0) || String(a.p.name).localeCompare(String(b.p.name)));
  const mark = (id, i, sc) => act ? chipD(d, id, act.podium[i] === id ? true : act.podium.includes(id) ? 'near' : false) : chipD(d, id);
  return `<div class="card" style="overflow-x:auto">${act ? `<div class="pr-actual"><span class="muted">Result</span>${act.podium.map((id, i) => `<span>${['🥇', '🥈', '🥉'][i]} ${esc(drvName(d, id))}</span>`).join('')}<span>⏱ ${esc(act.fl ? drvName(d, act.fl) : '—')}</span><span>⚡ ${esc(act.pole ? drvName(d, act.pole) : '—')}</span></div>` : ''}
    <table class="tbl pr-tbl"><thead><tr><th>Name</th><th>🥇</th><th>🥈</th><th>🥉</th><th>⏱ FL</th><th>⚡ Pole</th>${act ? '<th class="r">Pts</th>' : ''}</tr></thead><tbody>
    ${rows.map(({ p, sc }) => `<tr class="${s.user && p.uid === s.user.uid ? 'me' : ''}"><td><b>${esc(p.name)}</b></td>${[0, 1, 2].map(i => `<td>${mark((p.podium || [])[i], i, sc)}</td>`).join('')}<td>${act ? chipD(d, p.fl, p.fl && p.fl === act.fl) : chipD(d, p.fl)}</td><td>${act ? chipD(d, p.pole, p.pole && p.pole === act.pole) : chipD(d, p.pole)}</td>${act ? `<td class="pts">${sc.total}</td>` : ''}</tr>`).join('')}
    </tbody></table></div>`;
}

function board(d) {
  const by = {};
  (S.all || []).forEach(p => {
    const sc = score(d, p); if (!sc) return;
    const u = by[p.uid] = by[p.uid] || { name: p.name, pts: 0, rounds: 0, exact: 0, best: 0, last: 0 };
    u.pts += sc.total; u.rounds++; u.exact += sc.exact; u.best = Math.max(u.best, sc.total);
    if ((p.at || 0) >= u.last) { u.name = p.name; u.last = p.at || 0; }
  });
  const list = Object.entries(by).map(([uid, u]) => Object.assign({ uid }, u)).sort((a, b) => b.pts - a.pts || b.exact - a.exact || a.name.localeCompare(b.name));
  if (!list.length) return '<div class="card"><p class="muted">The leaderboard fills up once the first predicted round has results.</p></div>';
  const s = window.Portal.store(d), me = s && s.user && s.user.uid;
  let pos = 0, prev = null;
  return `<div class="table-wrap"><table class="tbl"><thead><tr><th>Pos</th><th>Name</th><th class="r">Rounds</th><th class="r hide-sm">Exact podium picks</th><th class="r hide-sm">Best round</th><th class="r">Pts</th></tr></thead><tbody>
    ${list.map((u, k) => { if (u.pts !== prev) { pos = k + 1; prev = u.pts; } return `<tr class="${pos <= 3 ? 'top' + pos : ''} ${u.uid === me ? 'me' : ''}"><td class="pos">${pos}</td><td><b>${esc(u.name)}</b>${u.uid === me ? ' <span class="chip">You</span>' : ''}</td><td class="r mono">${u.rounds}</td><td class="r mono hide-sm">${u.exact}</td><td class="r mono hide-sm">${u.best}</td><td class="pts">${u.pts}</td></tr>`; }).join('')}
    </tbody></table></div>`;
}

function past(d, s) {
  const rs = LG.rounds(d).filter(r => (S.all || []).some(p => p.roundId === r.id) && (LG.isDone(d, r) || ((S.rounds || {})[r.id] || {}).lockAt < Date.now())).reverse();
  if (!rs.length) return '<div class="card"><p class="muted">No past rounds yet.</p></div>';
  const cur = rs.find(r => r.id === S.view) || rs[0];
  return `<div class="pr-pastbar"><select data-pr-view>${rs.map(r => `<option value="${esc(r.id)}" ${r.id === cur.id ? 'selected' : ''}>R${esc(r.round)} · ${esc(r.name)}</option>`).join('')}</select></div>${entriesTable(d, cur, s)}`;
}

/* ---------- events ---------- */
document.addEventListener('click', async e => {
  const t = e.target.closest && e.target.closest('[data-pr-tab]');
  if (t) { S.tab = t.dataset.prTab; return LG.render(false); }
  const b = e.target.closest && e.target.closest('[data-pr]'); if (!b) return;
  e.preventDefault();
  const s = window.Portal && window.Portal.store(LG.S.data); if (!s) return;
  try { if (b.dataset.pr === 'signin') await s.signIn(); if (b.dataset.pr === 'signout') await s.signOut(); } catch (x) { toast(x.code || x.message, 'err'); }
  LG.render(false);
});
document.addEventListener('change', e => { if (e.target.matches && e.target.matches('[data-pr-view]')) { S.view = e.target.value; LG.render(false); } });
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.closest('[data-pr-form]')) e.preventDefault(); });
document.addEventListener('submit', async e => {
  const f = e.target.closest && e.target.closest('[data-pr-form]'); if (!f) return;
  e.preventDefault();
  const d = LG.S.data, s = window.Portal.store(d), rid = f.dataset.prForm;
  if (!s || !s.user || S.busy) return;
  const v = k => String(f.elements[k].value || '');
  const name = v('name').trim().slice(0, 40), podium = [v('p1'), v('p2'), v('p3')];
  if (!name) return toast('Add a name for the leaderboard', 'err');
  if (podium.some(x => !x) || !v('fl') || !v('pole')) return toast('Pick a driver for every spot', 'err');
  if (new Set(podium).size < 3) return toast('Pick three different drivers for the podium', 'err');
  S.busy = true; LG.render(false);
  try {
    await s.savePred(rid, { name, podium, fl: v('fl'), pole: v('pole') });
    setName(name); toast('Predictions locked in 🔮 — good luck!');
    S.rounds = null; S.all = null;
  } catch (err) { toast('Could not save: ' + (err.code || err.message) + (/permission/.test(err.code || err.message) ? ' — predictions may have just closed.' : ''), 'err'); }
  S.busy = false; LG.render(false);
});
setInterval(() => { if (/^#\/predictions/.test(location.hash) && S.tab === 'round' && !document.activeElement.closest('[data-pr-form]')) { const c = document.querySelector('.pr-count'); if (c) { const { r } = currentRound(LG.S.data); if (r) { const R = (S.rounds || {})[r.id] || {}; c.textContent = 'in ' + until(R.lockAt || lockFor(r)); } } } }, 30000);

window.Predictions = { page, score, actual, lockFor, cfg, PTS, state: S };
})();
