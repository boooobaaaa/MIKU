/* =========================================================
   Admin console  (#/admin)
   Edits are saved as a draft in this browser, then published
   to data/league.json in your GitHub repo via the GitHub API.
   ========================================================= */
(() => {
'use strict';
const LG = window.LG;
const { esc, clone, uid, byId, fmtPts, toast } = LG;
const K = { token: 'league.gh.token', cfg: 'league.gh.cfg', auth: 'league.admin.auth' };
const A = { section: 'dashboard', roundId: null, session: 'race', newsId: null, open: {} };

const SECTIONS = [
  ['dashboard', 'Dashboard', '◈'], ['league', 'League & rules', '✦'], ['drivers', 'Drivers', '◉'], ['teams', 'Constructors', '▣'],
  ['calendar', 'Calendar', '◷'], ['results', 'Results', '▤'], ['scoring', 'Scoring system', '✚'], ['adjust', 'Penalties & points', '±'],
  ['news', 'News posts', '✎'], ['publish', 'Publish & backup', '⇪']
];
const STATUSES = ['FIN', 'DNF', 'DSQ', 'DNS'];
const D = () => LG.S.data;
const ls = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } } };

/* ---------------- auth (UI gate only — the GitHub token is the real lock) ---------------- */
async function sha256(s) {
  if (!window.crypto || !crypto.subtle) return 'plain:' + s;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('league-salt::' + s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
const unlocked = () => !D().settings.adminHash || sessionStorage.getItem(K.auth) === D().settings.adminHash;

/* ---------------- field helpers ---------------- */
const opt = (v, label, cur) => `<option value="${esc(v)}" ${String(v) === String(cur ?? '') ? 'selected' : ''}>${esc(label)}</option>`;
const F = {
  text: (label, path, val, extra = '') => `<label class="fld ${extra.includes('wide') ? 'wide' : ''}"><span>${label}</span><input type="text" data-path="${path}" value="${esc(val)}" ${extra.replace('wide', '')}></label>`,
  num: (label, path, val, extra = '') => `<label class="fld"><span>${label}</span><input type="number" step="any" data-num data-path="${path}" value="${esc(val ?? '')}" ${extra}></label>`,
  color: (label, path, val) => `<label class="fld"><span>${label}</span><input type="color" data-path="${path}" data-reload value="${esc(/^#[0-9a-f]{6}$/i.test(val || '') ? val : '#39c5bb')}"></label>`,
  area: (label, path, val, cls = '') => `<label class="fld wide"><span>${label}</span><textarea class="${cls}" data-path="${path}">${esc(val)}</textarea></label>`,
  check: (label, path, val) => `<label class="chk"><input type="checkbox" data-path="${path}" data-reload ${val ? 'checked' : ''}><span>${label}</span></label>`,
  select: (label, path, val, opts, extra = 'data-reload') => `<label class="fld"><span>${label}</span><select data-path="${path}" ${extra}>${opts.map(([v, l]) => opt(v, l, val)).join('')}</select></label>`,
  dt: (label, path, val) => `<label class="fld"><span>${label}</span><input type="datetime-local" data-dt data-path="${path}" value="${toLocalInput(val)}"></label>`,
  date: (label, path, val) => `<label class="fld"><span>${label}</span><input type="date" data-path="${path}" value="${esc(val || '')}"></label>`
};
function toLocalInput(iso) { if (!iso) return ''; const t = new Date(iso); if (isNaN(t)) return ''; return new Date(t - t.getTimezoneOffset() * 6e4).toISOString().slice(0, 16); }
const teamOpts = d => [['', '— No team —'], ...d.teams.map(t => [t.id, t.name])];
const driverOpts = d => d.drivers.map(x => [x.id, `${x.number !== undefined && x.number !== '' ? '#' + x.number + ' ' : ''}${x.name}${x.active === false ? ' (inactive)' : ''}`]);
const head = (title, sub, tools = '') => `<div class="a-head"><div><div class="eyebrow">Admin console</div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div><div class="toolbar">${tools}</div></div>`;
const usedInResults = (d, key, id) => Object.values(d.results).some(r => ['race', 'sprint', 'quali'].some(s => (r[s] || []).some(e => e[key] === id)));

/* ---------------- sections ---------------- */
function secDashboard(d) {
  const st = LG.computeStandings(d);
  const nx = LG.nextRound(d);
  const done = LG.rounds(d).filter(r => LG.isDone(d, r)).length;
  const cfg = ghCfg();
  return head('Dashboard', 'Everything you change here saves instantly as a draft in this browser. Press <b>Publish</b> when you want it live.') + `
    ${!d.settings.adminHash ? `<div class="warn">No admin passcode is set yet. Set one under <a href="#/admin/league">League &amp; rules</a> so visitors can't poke around here. (They still can't publish without your GitHub token.)</div>` : ''}
    ${!cfg.owner || !ls.get(K.token) ? `<div class="warn">Publishing isn't set up yet. Go to <a href="#/admin/publish">Publish &amp; backup</a> to connect your GitHub repo — takes 2 minutes.</div>` : ''}
    <div class="dash-stats">
      <div class="stat"><b>${d.drivers.filter(x => x.active !== false).length}</b><span>Active drivers</span></div>
      <div class="stat"><b>${d.teams.length}</b><span>Teams</span></div>
      <div class="stat"><b>${done}/${d.calendar.filter(r => !r.cancelled).length}</b><span>Rounds done</span></div>
      <div class="stat"><b>${d.news.length}</b><span>News posts</span></div>
      <div class="stat"><b>${st.drivers[0] ? esc(LG.byId(d.drivers, st.drivers[0].id)?.name.split(' ').pop() || '—') : '—'}</b><span>Leader</span></div>
    </div>
    <div class="a-card"><h3>Race-weekend checklist</h3>
      <div class="quick">
        ${nx ? `<a href="#/admin/results" data-act="goto-round" data-id="${esc(nx.id)}">▤ Enter results<small>Round ${esc(nx.round)} · ${esc(nx.name)}</small></a>` : ''}
        <a href="#/admin/adjust">± Apply a penalty<small>Add or remove points with a reason</small></a>
        <a href="#/admin/news" data-act="new-news">✎ Write a race report<small>New news post</small></a>
        <a href="#/admin/publish">⇪ Publish to the site<small>${LG.S.isDraft ? 'You have unpublished changes' : 'Everything is live'}</small></a>
      </div>
    </div>
    <div class="a-card"><h3>Preview</h3><p class="hint" style="margin:0 0 12px">While you have a draft, the public pages in <i>this</i> browser show your unpublished version so you can check it before publishing.</p>
      <div class="toolbar"><a class="btn sm" href="#/">Home</a><a class="btn sm" href="#/standings">Standings</a><a class="btn sm" href="#/results">Results</a><a class="btn sm" href="#/schedule">Calendar</a></div></div>`;
}

function secLeague(d) {
  const L = d.league;
  return head('League & rules', 'Name, branding, links and your written rulebook.') + `
    <div class="a-card"><h3>Identity</h3><div class="fgrid">
      ${F.text('League name', 'league.name', L.name, 'data-reload')}
      ${F.text('Season label', 'league.season', L.season, 'data-reload')}
      ${F.text('Tagline (home page)', 'league.tagline', L.tagline, 'wide')}
      ${F.text('Logo image URL (square works best)', 'league.logo', L.logo, 'wide data-reload')}
    </div></div>
    <div class="a-card"><h3>Links (shown in footer)</h3><div class="fgrid">
      ${F.text('Discord invite', 'league.links.discord', L.links.discord)}
      ${F.text('YouTube', 'league.links.youtube', L.links.youtube)}
      ${F.text('Twitch', 'league.links.twitch', L.links.twitch)}
      ${F.text('Other website', 'league.links.website', L.links.website)}
    </div></div>
    <div class="a-card"><h3>Rulebook</h3><p class="hint" style="margin:-6px 0 12px">Shown on the Rules page under the points tables. Formatting: <code># Heading</code>, <code>**bold**</code>, <code>*italic*</code>, <code>- list item</code>, <code>[link](https://…)</code></p>
      <div class="fgrid">${F.area('Rules text', 'league.rules', L.rules, 'tall')}</div></div>
    <div class="a-card"><h3>Admin passcode</h3>
      <p class="hint" style="margin:-6px 0 12px">Hides this console from visitors. It's a convenience lock — the actual protection is that publishing needs your GitHub token, which never leaves your browser.</p>
      <div class="fgrid"><label class="fld"><span>New passcode</span><input type="password" id="new-pass" autocomplete="new-password"></label>
      <div style="display:flex;gap:8px;align-items:flex-end"><button class="btn sm primary" data-act="set-pass">Save passcode</button>${d.settings.adminHash ? '<button class="btn sm danger" data-act="clear-pass">Remove</button>' : ''}</div></div>
      ${d.settings.adminHash ? '<p class="hint">A passcode is set. Remember to publish so it applies on the live site.</p>' : ''}
    </div>`;
}

function secDrivers(d) {
  const st = LG.computeStandings(d);
  const items = d.drivers.map((x, i) => {
    const t = byId(d.teams, x.teamId), key = 'drv-' + x.id, p = `drivers.${i}`;
    return `<details class="item" data-key="${key}" ${A.open[key] ? 'open' : ''}>
      <summary><span class="swatch" style="--tc:${esc(LG.teamColor(t))}"></span><b class="mono" style="width:34px">${esc(x.number ?? '')}</b>${LG.nameHTML(x.name)} ${LG.flag(x.country)} <span class="muted" style="font-size:13px">${esc(t ? t.name : 'No team')} · ${fmtPts((st.D[x.id] || {}).points || 0)} pts</span>${x.active === false ? '<span class="pill-inactive">inactive</span>' : ''}</summary>
      <div class="body"><div class="fgrid">
        ${F.text('Full name', p + '.name', x.name, 'data-reload')}
        ${F.num('Car number', p + '.number', x.number, 'data-reload')}
        ${F.text('Country code (e.g. GB, JP, US)', p + '.country', x.country, 'maxlength="2" data-reload')}
        ${F.select('Team', p + '.teamId', x.teamId, teamOpts(d))}
        ${F.text('Gamertag / PSN / Steam', p + '.gamertag', x.gamertag)}
        ${F.check('Active on the grid', p + '.active', x.active !== false)}
        ${F.text('Photo / avatar URL (optional)', p + '.photo', x.photo, 'wide')}
        ${F.area('Bio (optional)', p + '.bio', x.bio)}
      </div>
      <div class="item-actions"><a class="btn sm ghost" href="#/driver/${esc(x.id)}">View page</a><button class="btn sm danger" data-act="del-driver" data-i="${i}">Delete driver</button></div></div>
    </details>`;
  }).join('');
  return head('Drivers', 'Moving a driver to a new team only affects future results — past points stay with the team they scored them for. Untick "Active" to bench someone without losing their history.',
    `<button class="btn primary" data-act="add-driver">+ Add driver</button>`) + `<div class="a-card">${items || '<p class="muted">No drivers yet.</p>'}</div>`;
}

function secTeams(d) {
  const items = d.teams.map((t, i) => {
    const key = 'team-' + t.id, p = `teams.${i}`;
    const drs = d.drivers.filter(x => x.teamId === t.id && x.active !== false).map(x => x.name).join(', ');
    return `<details class="item" data-key="${key}" ${A.open[key] ? 'open' : ''}>
      <summary><span class="swatch" style="--tc:${esc(LG.teamColor(t))}"></span><b>${esc(t.name)}</b><span class="muted" style="font-size:13px">${esc(drs || 'No drivers')}</span></summary>
      <div class="body"><div class="fgrid">
        ${F.text('Team name', p + '.name', t.name, 'data-reload')}
        ${F.color('Team colour', p + '.color', t.color)}
        ${F.text('Base', p + '.base', t.base)}
        ${F.text('Team principal', p + '.principal', t.principal)}
        ${F.text('Chassis / car', p + '.car', t.car)}
        ${F.text('Power unit', p + '.engine', t.engine)}
        ${F.text('Logo URL (optional)', p + '.logo', t.logo, 'wide')}
        ${F.area('About (optional)', p + '.bio', t.bio)}
      </div>
      <div class="item-actions"><a class="btn sm ghost" href="#/team/${esc(t.id)}">View page</a><button class="btn sm danger" data-act="del-team" data-i="${i}">Delete team</button></div></div>
    </details>`;
  }).join('');
  return head('Constructors', 'Team colours flow through every table, card and chart on the site.', `<button class="btn primary" data-act="add-team">+ Add team</button>`) +
    `<div class="a-card">${items || '<p class="muted">No teams yet.</p>'}</div>`;
}

function secCalendar(d) {
  const items = d.calendar.map((r, i) => {
    const key = 'rnd-' + r.id, p = `calendar.${i}`;
    return `<details class="item" data-key="${key}" ${A.open[key] ? 'open' : ''}>
      <summary><b class="mono" style="width:44px">R${esc(r.round)}</b>${LG.flag(r.country)} <b>${esc(r.name)}</b><span class="muted" style="font-size:13px">${r.start ? LG.fmtDate(r.start) + ' · ' + LG.fmtTime(r.start) : 'No date'}</span>${r.sprint ? '<span class="badge sprint">Sprint</span>' : ''}${LG.isDone(d, r) ? '<span class="badge done">Done</span>' : ''}${r.cancelled ? '<span class="badge cancel">Cancelled</span>' : ''}</summary>
      <div class="body"><div class="fgrid">
        ${F.num('Round #', p + '.round', r.round, 'data-reload')}
        ${F.text('Grand Prix name', p + '.name', r.name, 'data-reload')}
        ${F.text('Circuit', p + '.track', r.track)}
        ${F.text('Country code', p + '.country', r.country, 'maxlength="2" data-reload')}
        ${F.dt('Race start (your local time)', p + '.start', r.start)}
        ${F.num('Laps', p + '.laps', r.laps)}
        ${F.check('Sprint weekend', p + '.sprint', r.sprint)}
        ${F.check('Cancelled', p + '.cancelled', r.cancelled)}
        ${F.area('Round notes (shown under results — stewards decisions, etc.)', p + '.notes', r.notes)}
      </div>
      <div class="item-actions"><button class="btn sm" data-act="goto-round" data-id="${esc(r.id)}">Enter results</button><button class="btn sm danger" data-act="del-round" data-i="${i}">Delete round</button></div></div>
    </details>`;
  }).join('');
  return head('Calendar', 'Times are entered in your local time and shown to each visitor in theirs. The site is always ordered by round number.',
    `<button class="btn" data-act="sort-rounds">Sort by round</button><button class="btn primary" data-act="add-round">+ Add round</button>`) +
    `<div class="a-card">${items || '<p class="muted">No rounds yet.</p>'}</div>`;
}

function secResults(d) {
  const rs = LG.rounds(d);
  if (!rs.length) return head('Results', '') + `<div class="a-card"><p class="muted">Add some rounds to the calendar first.</p></div>`;
  if (!A.roundId || !byId(d.calendar, A.roundId)) A.roundId = (LG.nextRound(d) || rs[rs.length - 1]).id;
  const r = byId(d.calendar, A.roundId);
  const sess = A.session;
  const list = (d.results[r.id] && d.results[r.id][sess]) || [];
  const isQ = sess === 'quali';
  const pole = LG.poleDriver(d, r.id);
  const cl = LG.classify(list.map((e, i) => ({ ...e, _i: i })), sess, d.scoring, pole);
  const view = {}; cl.forEach(c => { view[c._i] = c; });
  const base = `results.${r.id}.${sess}`;
  const used = new Set(list.map(e => e.driverId));
  const avail = d.drivers.filter(x => !used.has(x.id));

  const rows = list.map((e, i) => {
    const c = view[i] || {};
    const p = `${base}.${i}`;
    return `<tr>
      <td class="c-pos">${c.pos ? 'P' + c.pos : `<span class="status" style="color:var(--pink-soft)">${esc(c.label || '')}</span>`}</td>
      <td><select data-path="${p}.driverId" data-reload data-driver>${driverOpts(d).map(([v, l]) => opt(v, l, e.driverId)).join('')}</select></td>
      <td class="c-md"><select data-path="${p}.teamId" data-reload>${teamOpts(d).map(([v, l]) => opt(v, l, e.teamId)).join('')}</select></td>
      <td class="c-sm"><select data-path="${p}.status" data-reload>${STATUSES.map(s => opt(s, s, e.status || 'FIN')).join('')}</select></td>
      ${isQ ? '' : `<td class="c-sm"><input type="number" data-num data-path="${p}.laps" value="${esc(e.laps ?? '')}"></td>`}
      <td class="c-md"><input type="text" data-path="${p}.time" value="${esc(e.time || '')}" placeholder="${isQ ? '1:29.708' : i === 0 ? '1:32:44.123' : '+3.211'}"></td>
      ${isQ ? '' : `<td class="c-chk"><input type="checkbox" data-act="flag" data-flag="fastestLap" data-i="${i}" ${e.fastestLap ? 'checked' : ''} title="Fastest lap"></td>`}
      ${sess === 'race' ? `<td class="c-chk"><input type="checkbox" data-act="flag" data-flag="pole" data-i="${i}" ${e.pole ? 'checked' : ''} title="Pole position"></td>` : ''}
      ${isQ ? '' : `<td class="c-sm"><input type="number" step="any" data-num data-path="${p}.pointsOverride" data-reload value="${esc(e.pointsOverride ?? '')}" placeholder="auto"></td><td class="c-pts">${fmtPts(c.pts || 0)}</td>`}
      <td class="c-act"><button class="iconbtn" data-act="move" data-i="${i}" data-dir="-1" title="Move up">↑</button> <button class="iconbtn" data-act="move" data-i="${i}" data-dir="1" title="Move down">↓</button> <button class="iconbtn del" data-act="del-entry" data-i="${i}" title="Remove">✕</button></td>
    </tr>`;
  }).join('');

  const sessions = [['race', 'Race'], ['sprint', 'Sprint'], ['quali', 'Qualifying']];
  return head('Results', 'Put drivers in finishing order (top = winner). Set DNF/DSQ/DNS for non-finishers — they score nothing and drop to the bottom automatically. Points are calculated from your scoring system; type a number in <b>Override</b> only for special cases.') + `
    <div class="a-card">
      <div class="toolbar" style="justify-content:space-between">
        <label class="fld" style="min-width:260px"><span>Round</span><select data-ctl="round">${rs.map(x => opt(x.id, `R${x.round} · ${x.name}${LG.isDone(d, x) ? ' ✓' : ''}`, r.id)).join('')}</select></label>
        <div class="tabs" style="margin:0">${sessions.map(([k, l]) => `<button data-act="session" data-s="${k}" class="${k === sess ? 'active' : ''}">${l}${((d.results[r.id] || {})[k] || []).length ? ' ✓' : ''}</button>`).join('')}</div>
      </div>
      ${sess === 'sprint' && !r.sprint ? '<p class="hint">This round isn\'t marked as a sprint weekend — results entered here still count. Tick "Sprint weekend" in the calendar to show the badge.</p>' : ''}
      ${isQ ? '<p class="hint">Qualifying order sets the pole sitter (P1) unless you tick a pole box in the race session. Qualifying itself scores no points.</p>' : ''}
    </div>
    <div class="a-card" style="overflow-x:auto">
      ${list.length ? `<table class="rtable"><thead><tr><th>Pos</th><th>Driver</th><th>Team</th><th>Status</th>${isQ ? '' : '<th>Laps</th>'}<th>${isQ ? 'Lap time' : 'Time / gap'}</th>${isQ ? '' : '<th>FL</th>'}${sess === 'race' ? '<th>Pole</th>' : ''}${isQ ? '' : '<th>Override</th><th>Pts</th>'}<th></th></tr></thead><tbody>${rows}</tbody></table>`
        : `<p class="muted">No ${sess === 'quali' ? 'qualifying' : sess} results for this round yet.</p>`}
      <div class="toolbar" style="margin-top:16px">
        ${avail.length ? `<select id="add-entry-sel" style="max-width:260px">${avail.map(x => opt(x.id, `${x.name}${x.active === false ? ' (inactive)' : ''}`, '')).join('')}</select><button class="btn sm" data-act="add-entry">+ Add driver</button>` : ''}
        <button class="btn sm" data-act="fill-all">Add all active drivers</button>
        ${sess !== 'quali' && ((d.results[r.id] || {}).quali || []).length ? '<button class="btn sm" data-act="copy-quali">Copy qualifying order</button>' : ''}
        ${list.length ? '<button class="btn sm danger" data-act="clear-session">Clear session</button>' : ''}
        <a class="btn sm ghost" href="#/results/${esc(r.id)}/${sess}">Preview →</a>
      </div>
    </div>`;
}

const PRESETS = {
  'F1 standard (2025)': { race: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1], sprint: [8, 7, 6, 5, 4, 3, 2, 1], fastestLap: 0, fastestLapTopN: 10, sprintFastestLap: 0, pole: 0 },
  'F1 + fastest lap point': { race: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1], sprint: [8, 7, 6, 5, 4, 3, 2, 1], fastestLap: 1, fastestLapTopN: 10, sprintFastestLap: 0, pole: 0 },
  'Full grid points (top 20)': { race: [35, 30, 26, 23, 21, 19, 17, 15, 13, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1], sprint: [10, 8, 7, 6, 5, 4, 3, 2, 1], fastestLap: 1, fastestLapTopN: 0, sprintFastestLap: 0, pole: 1 },
  'Classic 10-8-6 (2003–09)': { race: [10, 8, 6, 5, 4, 3, 2, 1], sprint: [], fastestLap: 0, fastestLapTopN: 0, sprintFastestLap: 0, pole: 0 }
};
function secScoring(d) {
  const sc = d.scoring;
  return head('Scoring system', 'Changes recalculate the whole season instantly — standings always come from the results + these rules + any manual adjustments.') + `
    <div class="a-card"><h3>Quick presets</h3><div class="toolbar">${Object.keys(PRESETS).map(k => `<button class="btn sm" data-act="preset" data-k="${esc(k)}">${esc(k)}</button>`).join('')}</div></div>
    <div class="a-card"><h3>Points by finishing position</h3><div class="fgrid">
      <label class="fld wide"><span>Race points (P1, P2, P3, …) — comma separated</span><input type="text" data-list data-path="scoring.race" value="${esc((sc.race || []).join(', '))}"></label>
      <label class="fld wide"><span>Sprint points (leave empty if you don't run sprints)</span><input type="text" data-list data-path="scoring.sprint" value="${esc((sc.sprint || []).join(', '))}"></label>
    </div></div>
    <div class="a-card"><h3>Bonus points</h3><div class="fgrid">
      ${F.num('Fastest lap (race)', 'scoring.fastestLap', sc.fastestLap, 'data-reload')}
      ${F.num('…only if finishing in top N (0 = anywhere)', 'scoring.fastestLapTopN', sc.fastestLapTopN, 'data-reload')}
      ${F.num('Fastest lap (sprint)', 'scoring.sprintFastestLap', sc.sprintFastestLap, 'data-reload')}
      ${F.num('Pole position', 'scoring.pole', sc.pole, 'data-reload')}
    </div><p class="hint">Half points work too (e.g. 0.5).</p></div>
    <div class="a-card"><h3>Live preview</h3><div class="toolbar">${(sc.race || []).map((p, i) => `<span class="chip">P${i + 1}: ${fmtPts(p)}</span>`).join('') || '<span class="muted">No race points set</span>'}</div></div>`;
}

function secAdjust(d) {
  const rs = LG.rounds(d);
  const rows = d.adjustments.map((a, i) => {
    const p = `adjustments.${i}`;
    const targets = a.type === 'team' ? d.teams.map(t => [t.id, t.name]) : driverOpts(d);
    return `<tr>
      <td class="c-md"><select data-path="${p}.type" data-reload>${opt('driver', 'Driver', a.type)}${opt('team', 'Team', a.type)}</select></td>
      <td><select data-path="${p}.targetId" data-reload>${opt('', '— choose —', a.targetId)}${targets.map(([v, l]) => opt(v, l, a.targetId)).join('')}</select></td>
      <td class="c-sm"><input type="number" step="any" data-num data-path="${p}.points" data-reload value="${esc(a.points ?? '')}" placeholder="-5"></td>
      <td class="c-md"><select data-path="${p}.roundId">${opt('', 'No round', a.roundId)}${rs.map(r => opt(r.id, 'R' + r.round + ' ' + r.name, a.roundId)).join('')}</select></td>
      <td><input type="text" data-path="${p}.reason" value="${esc(a.reason || '')}" placeholder="e.g. Causing a collision, Turn 1"></td>
      <td class="c-act"><button class="iconbtn del" data-act="del-adj" data-i="${i}">✕</button></td></tr>`;
  }).join('');
  return head('Penalties & points', 'Add or remove championship points from any driver or team — penalties, bonuses, corrections. Use a negative number to take points away.',
    `<button class="btn primary" data-act="add-adj">+ Add adjustment</button>`) + `
    <div class="a-card" style="overflow-x:auto">${rows ? `<table class="rtable"><thead><tr><th>Applies to</th><th>Who</th><th>Points</th><th>Round</th><th>Reason</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="muted">No adjustments. Standings come purely from results.</p>'}</div>
    <p class="hint">Want to change a finishing position instead (e.g. a time penalty that drops someone a place)? Edit that round in <a href="#/admin/results">Results</a> and move the driver down.</p>`;
}

function secNews(d) {
  const list = [...d.news].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const n = byId(d.news, A.newsId);
  const i = d.news.indexOf(n);
  const editor = n ? `<div class="a-card"><h3>Editing: ${esc(n.title || 'Untitled')}</h3><div class="fgrid">
      ${F.text('Headline', `news.${i}.title`, n.title, 'wide data-reload')}
      ${F.date('Date', `news.${i}.date`, n.date)}
      ${F.text('Author', `news.${i}.author`, n.author)}
      ${F.text('Tag (e.g. Race report, Announcement)', `news.${i}.tag`, n.tag)}
      ${F.check('Pin to top', `news.${i}.pinned`, n.pinned)}
      ${F.check('Hidden (draft post)', `news.${i}.hidden`, n.hidden)}
      ${F.text('Cover image URL (optional)', `news.${i}.image`, n.image, 'wide')}
      ${F.area('Post body — supports # headings, **bold**, *italic*, - lists, [links](https://…)', `news.${i}.body`, n.body, 'tall')}
    </div><div class="item-actions"><a class="btn sm ghost" href="#/news/${esc(n.id)}">Preview post →</a><button class="btn sm danger" data-act="del-news" data-id="${esc(n.id)}">Delete post</button></div></div>` : '';
  return head('News posts', 'Race reports, signings, announcements. Posts show on the home page and the News tab.', `<button class="btn primary" data-act="new-news">+ New post</button>`) +
    editor + `<div class="a-card"><h3>All posts</h3>${list.length ? list.map(x => `<div style="display:flex;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid var(--line)">
      <span class="mono muted" style="width:100px">${esc(x.date || '')}</span><b style="flex:1">${x.pinned ? '📌 ' : ''}${esc(x.title || 'Untitled')}</b>${x.hidden ? '<span class="pill-inactive">hidden</span>' : ''}${x.tag ? `<span class="chip">${esc(x.tag)}</span>` : ''}
      <button class="btn xs ${x.id === A.newsId ? 'primary' : ''}" data-act="edit-news" data-id="${esc(x.id)}">Edit</button></div>`).join('') : '<p class="muted">No posts yet.</p>'}</div>`;
}

function ghCfg() {
  let c = {}; try { c = JSON.parse(ls.get(K.cfg) || '{}'); } catch (e) { }
  if (!c.owner && /\.github\.io$/i.test(location.hostname)) {
    c.owner = location.hostname.split('.')[0];
    const seg = location.pathname.split('/').filter(Boolean)[0];
    c.repo = seg && !seg.includes('.') ? seg : location.hostname;
  }
  return Object.assign({ owner: '', repo: '', branch: 'main', path: 'data/league.json' }, c);
}
function secPublish(d) {
  const c = ghCfg(), hasTok = !!ls.get(K.token);
  return head('Publish & backup', 'Publishing commits your draft to <code>data/league.json</code> in your GitHub repo. GitHub Pages rebuilds the site in about a minute.') + `
    ${LG.S.isDraft ? `<div class="warn">You have unpublished changes${LG.S.draftStale ? ' — and the live site was updated since you started this draft (maybe from another device). Publishing will overwrite it.' : '.'}</div>` : '<div class="ok-note">Everything is published. The live site matches this console.</div>'}
    <div class="a-card"><h3>Publish</h3><div class="toolbar"><button class="btn primary" data-act="publish" ${LG.S.isDraft ? '' : 'disabled'}>⇪ Publish changes</button>${LG.S.isDraft ? '<button class="btn danger" data-act="discard-draft">Discard draft</button>' : ''}<button class="btn" data-act="reload-live">Reload live data</button></div>
      ${d.meta.updated ? `<p class="hint">Last published: ${new Date(d.meta.updated).toLocaleString()}</p>` : ''}</div>
    <div class="a-card"><h3>GitHub connection</h3>
      <div class="fgrid">
        <label class="fld"><span>GitHub username / org</span><input type="text" data-gh="owner" value="${esc(c.owner)}"></label>
        <label class="fld"><span>Repository name</span><input type="text" data-gh="repo" value="${esc(c.repo)}"></label>
        <label class="fld"><span>Branch</span><input type="text" data-gh="branch" value="${esc(c.branch)}"></label>
        <label class="fld"><span>Data file path</span><input type="text" data-gh="path" value="${esc(c.path)}"></label>
        <label class="fld wide"><span>Personal access token ${hasTok ? '(saved in this browser ✓)' : ''}</span><input type="password" id="gh-token" placeholder="${hasTok ? '•••••••••••• (leave blank to keep)' : 'github_pat_…'}" autocomplete="off"></label>
      </div>
      <div class="toolbar" style="margin-top:14px"><button class="btn sm primary" data-act="save-gh">Save connection</button><button class="btn sm" data-act="test-gh">Test connection</button>${hasTok ? '<button class="btn sm danger" data-act="forget-token">Forget token</button>' : ''}</div>
      <details style="margin-top:16px"><summary class="muted" style="cursor:pointer">How do I get a token?</summary>
        <ol class="steps" style="margin-top:10px">
          <li>On GitHub go to <b>Settings → Developer settings → Personal access tokens → Fine-grained tokens</b> → <b>Generate new token</b>.</li>
          <li>Repository access: <b>Only select repositories</b> → pick your league repo.</li>
          <li>Permissions → Repository permissions → <b>Contents: Read and write</b>. Nothing else needed.</li>
          <li>Copy the token, paste it above, Save, then Test.</li>
        </ol>
        <p class="hint">The token is stored only in this browser's local storage — it is never written into your site files. Use the same steps on any other device you want to admin from.</p>
      </details>
    </div>
    <div class="a-card"><h3>Backup & restore</h3><div class="toolbar">
      <button class="btn sm" data-act="download">⬇ Download league.json</button>
      <label class="btn sm">⬆ Import league.json<input type="file" accept=".json,application/json" data-ctl="import" hidden></label>
    </div><p class="hint">Download a backup before big changes. Importing replaces your draft (nothing goes live until you publish).</p></div>
    <div class="a-card"><h3>New season</h3><p class="hint" style="margin:-6px 0 12px">Downloads a backup of this season, then clears all results, penalties and the calendar. Drivers, teams, scoring, news and rules are kept.</p>
      <button class="btn sm danger" data-act="new-season">Start a new season</button></div>`;
}

/* ---------------- layout ---------------- */
function lockHTML() {
  return `<div class="lock"><div class="card"><div class="eyebrow">Admin console</div><h2>Paddock access only</h2>
    <form data-form="unlock"><input type="password" id="unlock-pass" placeholder="Passcode" autofocus><button class="btn primary">Unlock</button></form></div></div>`;
}
function render(sec) {
  if (sec && SECTIONS.some(s => s[0] === sec)) A.section = sec;
  if (!sec) A.section = 'dashboard';
  const d = D();
  if (!unlocked()) return lockHTML();
  const fn = { dashboard: secDashboard, league: secLeague, drivers: secDrivers, teams: secTeams, calendar: secCalendar, results: secResults, scoring: secScoring, adjust: secAdjust, news: secNews, publish: secPublish }[A.section];
  return `<div class="page admin">
    <aside class="admin-side"><h4>Console</h4>
      ${SECTIONS.map(([k, l, ic]) => `<a class="side-link ${k === A.section ? 'active' : ''}" href="#/admin/${k}"><span class="ic">${ic}</span>${l}</a>`).join('')}
      <div class="status-pill ${LG.S.isDraft ? 'draft' : 'clean'}">${LG.S.isDraft ? '● Unpublished changes' : '✓ All changes live'}${LG.S.isDraft ? '<button class="btn sm primary" data-act="publish">Publish</button>' : ''}</div>
    </aside>
    <section class="admin-main">${fn(d)}</section></div>`;
}
const rerender = () => LG.render(false);
const commit = () => { LG.saveDraft(); rerender(); };

/* ---------------- binding ---------------- */
function setPath(obj, path, val) {
  const keys = path.split('.'); let o = obj;
  for (let i = 0; i < keys.length - 1; i++) { if (o[keys[i]] === undefined || o[keys[i]] === null) o[keys[i]] = /^\d+$/.test(keys[i + 1]) ? [] : {}; o = o[keys[i]]; }
  o[keys[keys.length - 1]] = val;
}
function readVal(el) {
  if (el.type === 'checkbox') return el.checked;
  if (el.hasAttribute('data-num')) return el.value === '' ? '' : Number(el.value);
  if (el.hasAttribute('data-dt')) return el.value ? new Date(el.value).toISOString() : '';
  if (el.hasAttribute('data-list')) return el.value.split(/[,\s]+/).filter(Boolean).map(Number).filter(n => !isNaN(n));
  if (el.dataset.path.endsWith('.country')) return el.value.trim().toUpperCase();
  return el.value;
}
const inAdmin = el => el && el.closest && el.closest('.admin');

document.addEventListener('input', e => {
  const el = e.target;
  if (!inAdmin(el) || !el.dataset || !el.dataset.path || el.type === 'checkbox' || el.tagName === 'SELECT') return;
  setPath(D(), el.dataset.path, readVal(el));
  LG.saveDraft();
});
document.addEventListener('change', e => {
  const el = e.target;
  if (!inAdmin(el)) return;
  if (el.dataset.ctl === 'round') { A.roundId = el.value; return rerender(); }
  if (el.dataset.ctl === 'import') return importFile(el.files[0]);
  if (!el.dataset.path) return;
  setPath(D(), el.dataset.path, readVal(el));
  // picking a driver in results auto-fills their current team
  if (el.hasAttribute('data-driver')) {
    const drv = byId(D().drivers, el.value);
    setPath(D(), el.dataset.path.replace(/driverId$/, 'teamId'), drv ? drv.teamId || '' : '');
  }
  if (el.dataset.path.startsWith('calendar.') && el.dataset.path.endsWith('.round')) sortRounds();
  LG.saveDraft();
  if (el.hasAttribute('data-reload') || el.tagName === 'SELECT') rerender();
});
document.addEventListener('toggle', e => {
  const el = e.target;
  if (el.tagName === 'DETAILS' && el.dataset.key) A.open[el.dataset.key] = el.open;
}, true);
document.addEventListener('submit', async e => {
  if (e.target.dataset.form !== 'unlock') return;
  e.preventDefault();
  const h = await sha256(document.getElementById('unlock-pass').value);
  if (h === D().settings.adminHash) { sessionStorage.setItem(K.auth, h); rerender(); } else toast('Wrong passcode', 'err');
});

function sortRounds() { D().calendar.sort((a, b) => (Number(a.round) || 0) - (Number(b.round) || 0)); }
const sessList = () => { const d = D(); d.results[A.roundId] = d.results[A.roundId] || {}; d.results[A.roundId][A.session] = d.results[A.roundId][A.session] || []; return d.results[A.roundId][A.session]; };
const newEntry = drv => ({ driverId: drv.id, teamId: drv.teamId || '', status: 'FIN', time: '', laps: '' });

document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]');
  if (!b || !inAdmin(b)) return;
  const act = b.dataset.act, d = D(), i = Number(b.dataset.i);
  switch (act) {
    case 'add-driver': { const x = { id: uid('drv'), name: 'New Driver', number: '', country: '', teamId: '', active: true }; d.drivers.push(x); A.open['drv-' + x.id] = true; return commit(); }
    case 'del-driver': {
      const x = d.drivers[i];
      const msg = usedInResults(d, 'driverId', x.id) ? `${x.name} has race results. Deleting removes them from the roster but their results will show as "Unknown driver". Usually it's better to untick "Active" instead.\n\nDelete anyway?` : `Delete ${x.name}?`;
      if (confirm(msg)) { d.drivers.splice(i, 1); commit(); } return;
    }
    case 'add-team': { const t = { id: uid('team'), name: 'New Team', color: '#39c5bb' }; d.teams.push(t); A.open['team-' + t.id] = true; return commit(); }
    case 'del-team': {
      const t = d.teams[i];
      const msg = usedInResults(d, 'teamId', t.id) ? `${t.name} has scored in results. Deleting it will show those as "Unknown team" in constructor standings. Delete anyway?` : `Delete ${t.name}?`;
      if (confirm(msg)) { d.drivers.forEach(x => { if (x.teamId === t.id) x.teamId = ''; }); d.teams.splice(i, 1); commit(); } return;
    }
    case 'add-round': { const n = Math.max(0, ...d.calendar.map(r => Number(r.round) || 0)) + 1; const r = { id: uid('rnd'), round: n, name: 'New Grand Prix', track: '', country: '', start: '', laps: '', sprint: false }; d.calendar.push(r); A.open['rnd-' + r.id] = true; return commit(); }
    case 'del-round': { const r = d.calendar[i]; if (confirm(`Delete ${r.name}${LG.isDone(d, r) ? ' AND its results' : ''}?`)) { d.calendar.splice(i, 1); delete d.results[r.id]; d.adjustments.forEach(a => { if (a.roundId === r.id) a.roundId = ''; }); commit(); } return; }
    case 'sort-rounds': sortRounds(); return commit();
    case 'goto-round': e.preventDefault(); A.roundId = b.dataset.id; A.session = 'race'; location.hash = '#/admin/results'; if (A.section === 'results') rerender(); return;
    case 'session': A.session = b.dataset.s; return rerender();
    case 'add-entry': { const sel = document.getElementById('add-entry-sel'); const drv = byId(d.drivers, sel && sel.value); if (drv) { sessList().push(newEntry(drv)); commit(); } return; }
    case 'fill-all': { const l = sessList(); const used = new Set(l.map(x => x.driverId)); d.drivers.filter(x => x.active !== false && !used.has(x.id)).forEach(x => l.push(newEntry(x))); return commit(); }
    case 'copy-quali': {
      const q = (d.results[A.roundId] || {}).quali || [];
      if (sessList().length && !confirm('Replace this session\'s order with the qualifying order?')) return;
      d.results[A.roundId][A.session] = q.map(x => ({ driverId: x.driverId, teamId: x.teamId, status: 'FIN', time: '', laps: '' })); return commit();
    }
    case 'clear-session': if (confirm('Remove every entry from this session?')) { d.results[A.roundId][A.session] = []; commit(); } return;
    case 'move': { const l = sessList(), j = i + Number(b.dataset.dir); if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; return commit(); }
    case 'del-entry': sessList().splice(i, 1); return commit();
    case 'flag': { const l = sessList(), f = b.dataset.flag, was = !!l[i][f]; l.forEach(x => { x[f] = false; }); l[i][f] = !was; return commit(); }
    case 'preset': { d.scoring = clone(PRESETS[b.dataset.k]); toast('Scoring preset applied'); return commit(); }
    case 'add-adj': d.adjustments.push({ id: uid('adj'), type: 'driver', targetId: '', points: -5, roundId: A.roundId || '', reason: '' }); return commit();
    case 'del-adj': d.adjustments.splice(i, 1); return commit();
    case 'new-news': { e.preventDefault(); const n = { id: uid('news'), title: 'New post', date: new Date().toISOString().slice(0, 10), author: '', tag: '', body: '', image: '' }; d.news.push(n); A.newsId = n.id; LG.saveDraft(); if (A.section !== 'news') location.hash = '#/admin/news'; else rerender(); return; }
    case 'edit-news': A.newsId = b.dataset.id; return rerender();
    case 'del-news': if (confirm('Delete this post?')) { d.news = d.news.filter(n => n.id !== b.dataset.id); A.newsId = null; commit(); } return;
    case 'set-pass': {
      const v = document.getElementById('new-pass').value;
      if (v.length < 4) return toast('Use at least 4 characters', 'err');
      d.settings.adminHash = await sha256(v); sessionStorage.setItem(K.auth, d.settings.adminHash);
      toast('Passcode saved — publish to apply it to the live site'); return commit();
    }
    case 'clear-pass': d.settings.adminHash = ''; return commit();
    case 'save-gh': case 'test-gh': {
      const c = ghCfg();
      document.querySelectorAll('[data-gh]').forEach(el => { c[el.dataset.gh] = el.value.trim(); });
      ls.set(K.cfg, JSON.stringify(c));
      const tok = document.getElementById('gh-token').value.trim();
      if (tok) ls.set(K.token, tok);
      if (act === 'save-gh') { toast('Connection saved in this browser'); return rerender(); }
      return testGitHub();
    }
    case 'forget-token': try { localStorage.removeItem(K.token); } catch (x) { } toast('Token removed from this browser'); return rerender();
    case 'publish': return publish(b);
    case 'discard-draft': if (confirm('Throw away all unpublished changes?')) LG.discardDraft(); return;
    case 'reload-live': return reloadLive();
    case 'download': return download(d, 'league.json');
    case 'new-season': {
      if (!confirm('Start a new season? A backup will download first. Results, penalties and the calendar will be cleared (nothing goes live until you publish).')) return;
      download(d, `league-${String(d.league.season).replace(/[^\w-]+/g, '_')}-backup.json`);
      d.results = {}; d.adjustments = []; d.calendar = [];
      const n = parseInt(d.league.season, 10); if (!isNaN(n) && String(n) === String(d.league.season).trim()) d.league.season = String(n + 1);
      toast('New season started — set up the calendar next'); return commit();
    }
  }
});

/* ---------------- GitHub publishing ---------------- */
function b64(str) {
  const bytes = new TextEncoder().encode(str); let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function ghReady() {
  const c = ghCfg(), tok = ls.get(K.token);
  if (!c.owner || !c.repo || !tok) { toast('Connect GitHub first (Publish & backup → GitHub connection)', 'err'); location.hash = '#/admin/publish'; return null; }
  return { c, headers: { Authorization: `Bearer ${tok}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } };
}
async function testGitHub() {
  const g = ghReady(); if (!g) return;
  try {
    const r = await fetch(`https://api.github.com/repos/${encodeURIComponent(g.c.owner)}/${encodeURIComponent(g.c.repo)}`, { headers: g.headers, cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.message || r.status);
    toast(j.permissions && j.permissions.push === false ? 'Connected, but this token can\'t write to the repo. Give it Contents: Read and write.' : `Connected to ${j.full_name} ✓`, j.permissions && j.permissions.push === false ? 'err' : 'ok');
  } catch (err) { toast('GitHub said: ' + err.message + ' — check the username, repo name and token.', 'err'); }
}
async function publish(btn) {
  const g = ghReady(); if (!g) return;
  const api = `https://api.github.com/repos/${encodeURIComponent(g.c.owner)}/${encodeURIComponent(g.c.repo)}/contents/${g.c.path.split('/').map(encodeURIComponent).join('/')}`;
  if (btn) { btn.disabled = true; btn.textContent = 'Publishing…'; }
  try {
    let sha;
    const cur = await fetch(`${api}?ref=${encodeURIComponent(g.c.branch)}&t=${Date.now()}`, { headers: g.headers, cache: 'no-store' });
    if (cur.ok) sha = (await cur.json()).sha;
    else if (cur.status !== 404) throw new Error((await cur.json().catch(() => ({}))).message || cur.status);
    const out = clone(D());
    out.meta = Object.assign({}, out.meta, { updated: new Date().toISOString() });
    const body = { message: `League update · ${new Date().toLocaleString()}`, content: b64(JSON.stringify(out, null, 2) + '\n'), branch: g.c.branch };
    if (sha) body.sha = sha;
    const put = await fetch(api, { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, g.headers), body: JSON.stringify(body) });
    if (!put.ok) throw new Error((await put.json().catch(() => ({}))).message || put.status);
    LG.S.published = LG.normalize(out); LG.S.data = clone(LG.S.published); LG.clearDraft();
    toast('Published! The live site updates in about a minute. 🏁');
  } catch (err) {
    toast('Publish failed: ' + err.message, 'err');
  }
  rerender();
}
async function reloadLive() {
  if (LG.S.isDraft && !confirm('This throws away your unpublished draft and loads what is live right now. Continue?')) return;
  try {
    const r = await fetch('data/league.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    LG.S.published = LG.normalize(await r.json()); LG.S.data = clone(LG.S.published); LG.clearDraft(); toast('Loaded live data'); rerender();
  } catch (err) { toast('Could not load live data: ' + err.message, 'err'); }
}
function download(obj, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function importFile(file) {
  if (!file) return;
  const fr = new FileReader();
  fr.onload = () => {
    try { LG.S.data = LG.normalize(JSON.parse(fr.result)); LG.saveDraft(); toast('Imported into your draft — review, then publish'); rerender(); }
    catch (err) { toast('That file isn\'t valid league JSON', 'err'); }
  };
  fr.readAsText(file);
}

window.Admin = { render };
})();
