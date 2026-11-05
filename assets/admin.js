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
  ['dashboard', 'Dashboard', '◈'], ['league', 'League & rules', '✦'], ['theme', 'Look & theme', '✿'], ['drivers', 'Drivers', '◉'], ['teams', 'Constructors', '▣'],
  ['calendar', 'Calendar', '◷'], ['results', 'Results', '▤'], ['scoring', 'Scoring system', '✚'], ['adjust', 'Penalties & points', '±'],
  ['stewards', 'FIA reports', '⚑'], ['news', 'News posts', '✎'], ['rulebook', 'Rulebook', '§'], ['signups', 'Sign-ups', '✋'], ['history', 'Hall of fame', '♛'], ['publish', 'Publish & backup', '⇪']
];
const STATUSES = ['FIN', 'DNF', 'DSQ', 'DNS'];
/* recommended image sizes — shown under each upload field and checked on upload */
const IMG_SPECS = {
  logo: { w: 512, h: 512, fmt: 'square PNG, transparent background', note: 'shown whole inside a rounded square, so leave a little empty space around the artwork' },
  teamLogo: { w: 512, h: 512, fmt: 'square PNG, transparent background', note: 'shown whole (never cropped) on team cards and the team page' },
  car: { w: 1600, h: 500, fmt: 'wide PNG, transparent background', note: 'side view, car facing right and filling the width' },
  driverPhoto: { w: 1000, h: 1200, fmt: 'portrait PNG cut-out, transparent background', note: 'waist-up, top of the head near the top edge — sits bottom-aligned, never cropped' },
  headshot: { w: 400, h: 400, fmt: 'square JPG or PNG', note: 'face centred and filling most of the frame — shown in circles, so the corners get trimmed', round: true, fit: 'cover' },
  cover: { w: 1600, h: 900, fmt: '16:9 JPG or PNG', note: 'cards crop the edges a little, so keep the subject near the middle', fit: 'cover' },
  clockLogo: { w: 256, h: 256, fmt: 'square PNG, transparent background', note: 'shown small next to the clocks' }
};
const TZ_OPTS = [['', 'Auto (from country code)'], ['Asia/Bahrain', 'Bahrain'], ['Asia/Riyadh', 'Saudi Arabia'], ['Australia/Melbourne', 'Melbourne'], ['Asia/Tokyo', 'Japan'], ['Asia/Shanghai', 'China'],
  ['America/New_York', 'Miami / US East'], ['America/Chicago', 'Austin / US Central'], ['America/Los_Angeles', 'Las Vegas / US West'], ['America/Toronto', 'Montréal / Canada'], ['America/Mexico_City', 'Mexico City'],
  ['America/Sao_Paulo', 'São Paulo'], ['Europe/London', 'Silverstone / UK'], ['Europe/Monaco', 'Monaco'], ['Europe/Rome', 'Imola / Monza'], ['Europe/Madrid', 'Barcelona / Madrid'], ['Europe/Paris', 'France'],
  ['Europe/Brussels', 'Spa / Belgium'], ['Europe/Amsterdam', 'Zandvoort'], ['Europe/Vienna', 'Austria'], ['Europe/Budapest', 'Hungary'], ['Europe/Berlin', 'Germany'], ['Europe/Lisbon', 'Portugal'],
  ['Europe/Istanbul', 'Türkiye'], ['Asia/Baku', 'Baku'], ['Asia/Singapore', 'Singapore'], ['Asia/Qatar', 'Qatar'], ['Asia/Dubai', 'Abu Dhabi'], ['Asia/Seoul', 'Korea'], ['Asia/Kuala_Lumpur', 'Malaysia'],
  ['Asia/Kolkata', 'India'], ['Africa/Johannesburg', 'South Africa'], ['UTC', 'UTC']];
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
  image: (label, path, val, folder, maxDim = 1600, spec = '') => {
    const sp = IMG_SPECS[spec] || null;
    const ar = sp ? sp.w / sp.h : 1;
    return `<div class="fld wide"><span>${label}</span><div class="img-field">
      <span class="thumb-frame ${sp && sp.round ? 'round' : ''}" style="aspect-ratio:${ar};${ar >= 1 ? 'width:' + Math.min(96, Math.round(44 * ar)) + 'px' : 'height:56px'}">${val ? `<img src="${esc(LG.asset(val))}" alt="" style="object-fit:${sp && sp.fit === 'cover' ? 'cover' : 'contain'}" onerror="this.style.visibility='hidden'">` : ''}</span>
      <input type="text" data-path="${path}" data-reload value="${esc(val || '')}" placeholder="Upload, or paste an image link">
      <button class="btn sm" data-act="upload" data-mode="set" data-target="${path}" data-folder="${folder}" data-max="${maxDim}" ${sp ? `data-spec="${spec}"` : ''}>⬆ Upload</button>${val ? `<button class="iconbtn del" data-act="clear-field" data-target="${path}" title="Remove">✕</button>` : ''}</div>
      ${sp ? `<div class="img-spec"><b>Best: ${sp.w} × ${sp.h} px</b> · ${esc(sp.fmt)}<span> — ${esc(sp.note)}</span></div>` : ''}</div>`;
  },
  tags: (label, path, vals, opts) => `<div class="fld wide"><span>${label}</span><div class="tagpick">${opts.length ? opts.map(o => `<label class="tp ${(vals || []).includes(o.id) ? 'on' : ''}" ${o.color ? `style="--tc:${esc(o.color)}"` : ''}><input type="checkbox" data-tagpath="${path}" value="${esc(o.id)}" ${(vals || []).includes(o.id) ? 'checked' : ''}>${o.color ? '<span class="swatch"></span>' : ''}${esc(o.label)}</label>`).join('') : '<span class="muted">None yet</span>'}</div></div>`,
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
        <a href="#/admin/stewards">⚑ Log an FIA decision<small>Incidents, penalties, documents</small></a>
        <a href="#/admin/adjust">± Adjust points<small>Add or remove points with a reason</small></a>
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
      ${F.text('Race control name', 'league.raceControl', L.raceControl || 'FIA', 'data-reload')}
      ${F.text('Tagline (home page)', 'league.tagline', L.tagline, 'wide')}
      ${F.image('League logo', 'league.logo', L.logo, 'branding', 600, 'logo')}
    </div></div>
    <div class="a-card"><h3>YouTube on the home page</h3><div class="fgrid">
      ${F.check('Show the video player', 'youtube.show', (d.youtube || {}).show !== false)}
      ${F.text('Section title', 'youtube.title', (d.youtube || {}).title || 'Latest video')}
      ${F.text('Channel ID (starts with UC…)', 'youtube.channelId', (d.youtube || {}).channelId, 'data-reload placeholder="UCxxxxxxxxxxxxxxxxxxxxxx"')}
      ${F.text('Channel link (for the Subscribe button)', 'youtube.channelUrl', (d.youtube || {}).channelUrl, 'placeholder="https://youtube.com/@yourleague"')}
      ${F.text('Pin a specific video instead (optional — paste its link)', 'youtube.pinned', (d.youtube || {}).pinned, 'wide data-reload')}
    </div>
    ${(d.youtube || {}).channelId && !/^UC[\w-]{22}$/.test(String(d.youtube.channelId).trim()) ? '<div class="warn" style="margin:12px 0 0">That doesn\'t look like a channel ID — it should be 24 characters starting with <b>UC</b>.</div>' : ''}
    <p class="hint">With a channel ID the player always shows your newest upload automatically — nothing to update after each race. Find the ID on YouTube: your channel → <b>About</b> (or the channel description) → <b>Share channel</b> → <b>Copy channel ID</b>. Or YouTube Studio → Settings → Channel → Advanced settings. Paste a video link in "Pin" to feature one video until you clear it.</p></div>
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
        ${F.image('Driver photo (driver cards, team page & profile)', p + '.photo', x.photo, 'drivers', 1400, 'driverPhoto')}
        ${F.image('Headshot for the small circles (optional — the photo is used if empty)', p + '.headshot', x.headshot, 'drivers', 500, 'headshot')}
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
        ${F.text('Chassis / car', p + '.car', t.car)}
        ${F.text('Power unit', p + '.engine', t.engine)}
        ${F.image('Team logo', p + '.logo', t.logo, 'teams', 600, 'teamLogo')}
        ${F.image('Car image', p + '.carImage', t.carImage, 'teams', 1800, 'car')}
        ${F.area('About (optional)', p + '.bio', t.bio)}
      </div>
      ${staffEditor(d, t, p)}
      <div class="item-actions"><a class="btn sm ghost" href="#/team/${esc(t.id)}">View page</a><button class="btn sm danger" data-act="del-team" data-i="${i}">Delete team</button></div></div>
    </details>`;
  }).join('');
  return head('Constructors', 'Team colours flow through every table, card and chart on the site.', `<button class="btn primary" data-act="add-team">+ Add team</button>`) +
    `<div class="a-card">${items || '<p class="muted">No teams yet.</p>'}</div>`;
}

function personRow(d, path, x, kind, del) {
  x = x || {};
  const linked = (kind === 'reserve' || kind === 'academy') && x.driverId;
  const pic = linked ? (byId(d.drivers, x.driverId) || {}).photo : x.photo;
  const drvOpts = [['', kind === 'eng' ? '— nobody —' : '— not on the roster (type below) —'], ...driverOpts(d)];
  return `<div class="prow">
    <div class="prow-pic"><span class="thumb-frame round">${pic ? `<img src="${esc(LG.asset(pic))}" alt="" style="object-fit:cover" onerror="this.remove()">` : ''}</span>
      ${linked ? '' : `<button class="btn xs" data-act="upload" data-mode="set" data-target="${path}.photo" data-folder="staff" data-max="${kind === 'reserve' || kind === 'academy' ? 1400 : 600}" data-spec="${kind === 'reserve' || kind === 'academy' ? 'driverPhoto' : 'headshot'}">⬆ Photo</button>`}</div>
    <div class="prow-fields">
      ${kind === 'exec' ? F.text('Title', path + '.title', x.title || '', 'placeholder="Chief Executive Officer"') : ''}
      ${kind === 'reserve' || kind === 'academy' ? F.select('Driver from your roster', path + '.driverId', x.driverId, drvOpts) : ''}
      ${linked ? `<div class="hint" style="align-self:end;padding-bottom:10px">Uses ${esc((byId(d.drivers, x.driverId) || {}).name || 'that driver')}'s profile & photo.</div>` : `
        ${F.text('Name', path + '.name', x.name || '', 'data-reload')}
        ${F.text('Country code', path + '.country', x.country || '', 'maxlength="2" data-reload')}
        ${kind === 'reserve' || kind === 'academy' ? F.num('Car number', path + '.number', x.number) : ''}
        ${kind === 'eng' ? F.select('Works with', path + '.driverId', x.driverId, drvOpts) : ''}
        ${F.text('Photo link (or use ⬆ Photo)', path + '.photo', x.photo || '', 'data-reload')}`}
    </div>
    ${del ? `<button class="iconbtn del" data-act="del-person" data-list="${del.list}" data-k="${del.k}" title="Remove">✕</button>` : ''}
  </div>`;
}
const STAFF_LISTS = { race: ['Race engineers', 4, 'eng'], perf: ['Performance engineers', 4, 'eng'], reserves: ['Reserve drivers', 2, 'reserve'], academy: ['Academy driver', 1, 'academy'] };
function staffEditor(d, t, p) {
  const st = t.staff || {};
  const list = key => {
    const [label, max, kind] = STAFF_LISTS[key], arr = st[key] || [], lp = `${p}.staff.${key}`;
    return `<div class="staff-block"><div class="staff-h"><b>${label}</b><span class="muted">${arr.length}/${max}</span>${arr.length < max ? `<button class="btn xs" data-act="add-person" data-list="${lp}">+ Add</button>` : ''}</div>
      ${arr.map((x, k) => personRow(d, `${lp}.${k}`, x, kind, { list: lp, k })).join('') || '<p class="hint" style="margin:0 0 6px">None yet.</p>'}</div>`;
  };
  return `<div class="staff-ed"><h4>Team personnel</h4><p class="hint" style="margin:-4px 0 12px">Shown as a "full team" section on the team page. Leave anything empty to hide it.</p>
    <div class="staff-block"><div class="staff-h"><b>Executive / team manager</b><span class="muted">title is up to you</span></div>${personRow(d, `${p}.staff.exec`, st.exec, 'exec')}</div>
    <div class="staff-block"><div class="staff-h"><b>Team principal</b></div>${personRow(d, `${p}.staff.principal`, st.principal || (t.principal ? { name: t.principal } : {}), 'principal')}</div>
    ${list('race')}${list('perf')}${list('reserves')}${list('academy')}
  </div>`;
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
        ${F.select('Track time zone', p + '.tz', r.tz || '', TZ_OPTS)}
        ${F.num('Laps', p + '.laps', r.laps)}
        ${F.check('Sprint weekend', p + '.sprint', r.sprint)}
        ${F.check('Cancelled', p + '.cancelled', r.cancelled)}
        ${F.area('Round notes (shown under results)', p + '.notes', r.notes)}
        <div class="wide"><div class="fld"><span>Weekend schedule (shown on the round page; leave empty to just show the race start)</span></div>
          ${(r.sessions || []).length ? `<table class="rtable sess"><thead><tr><th>Session</th><th>Start (your local time)</th><th>End (optional)</th><th></th></tr></thead><tbody>${(r.sessions || []).map((x, k) => `<tr>
            <td><input type="text" list="sess-presets" data-path="${p}.sessions.${k}.name" value="${esc(x.name || '')}"></td>
            <td><input type="datetime-local" data-dt data-path="${p}.sessions.${k}.start" data-reload value="${toLocalInput(x.start)}"></td>
            <td><input type="datetime-local" data-dt data-path="${p}.sessions.${k}.end" value="${toLocalInput(x.end)}"></td>
            <td class="c-act"><button class="iconbtn del" data-act="del-sess" data-i="${i}" data-k="${k}">✕</button></td></tr>`).join('')}</tbody></table>` : ''}
          <div class="toolbar" style="margin-top:8px"><button class="btn sm" data-act="add-sess" data-i="${i}">+ Add session</button>
            <button class="btn sm" data-act="sess-preset" data-k="qr" data-i="${i}">Quick: Qualifying + Race</button>
            <button class="btn sm" data-act="sess-preset" data-k="sprint" data-i="${i}">Quick: Sprint weekend</button>
            <button class="btn sm" data-act="sess-preset" data-k="full" data-i="${i}">Quick: Full F1 weekend</button></div>
          <p class="hint">Quick presets are built backwards from the race start above — adjust any time afterwards.</p>
        </div>
      </div>
      <div class="item-actions"><button class="btn sm" data-act="goto-round" data-id="${esc(r.id)}">Enter results</button><button class="btn sm danger" data-act="del-round" data-i="${i}">Delete round</button></div></div>
    </details>`;
  }).join('');
  return head('Calendar', 'Times are entered in your local time and shown to each visitor in theirs. The site is always ordered by round number.',
    `<button class="btn" data-act="sort-rounds">Sort by round</button><button class="btn primary" data-act="add-round">+ Add round</button>`) +
    `<div class="a-card">${items || '<p class="muted">No rounds yet.</p>'}</div><datalist id="sess-presets">${LG.SESSION_PRESETS.map(x => `<option value="${esc(x)}">`).join('')}</datalist>`;
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
    </div>${dotdAdmin(d, r)}`;
}
function dotdAdmin(d, r) {
  const v = (d.results[r.id] && d.results[r.id].dotd) || {}, dp = `results.${r.id}.dotd`, run = v.runners || [];
  const opts = [['', '— not set —'], ...driverOpts(d)];
  return `<div class="a-card"><h3>⭐ Driver of the Day · R${esc(r.round)}</h3>
    <div class="fgrid dotd-grid">
      <div class="pair">${F.select('Winner', dp + '.driverId', v.driverId, opts)}${F.num('Vote %', dp + '.pct', v.pct, 'data-reload')}</div>
      ${[0, 1, 2, 3].map(k => `<div class="pair">${F.select('Runner-up ' + (k + 1), `${dp}.runners.${k}.driverId`, (run[k] || {}).driverId, opts)}${F.num('%', `${dp}.runners.${k}.pct`, (run[k] || {}).pct, 'data-reload')}</div>`).join('')}
      ${F.text('Link to the Discord poll (optional)', dp + '.link', v.link, 'wide')}
    </div>
    <p class="hint">Run the poll in Discord, then enter the result here. Runner-ups are optional — with percentages they show as a vote breakdown. ${v.driverId ? '<button class="btn xs danger" data-act="clear-dotd">Clear</button>' : ''}</p></div>`;
}
function newSD(d) {
  const r = LG.lastRound(d) || LG.nextRound(d);
  return { id: uid('sd'), roundId: r ? r.id : '', session: 'race', lap: '', title: 'New incident', driverId: '', involved: '', status: 'Under investigation', penalty: '', points: '', teamToo: false, decision: '', docs: [] };
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
    <p class="hint">Points given in <a href="#/admin/stewards">FIA reports</a> are applied automatically and don't need repeating here.</p>
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
      ${F.image('Cover photo', `news.${i}.image`, n.image, 'news', 1920, 'cover')}
      ${F.tags('Related teams — the post appears under "Related articles" on these team pages', `news.${i}.teams`, n.teams, d.teams.map(t => ({ id: t.id, label: t.name, color: t.color })))}
      ${F.tags('Related drivers', `news.${i}.drivers`, n.drivers, d.drivers.filter(x => x.active !== false || (n.drivers || []).includes(x.id)).map(x => ({ id: x.id, label: x.name })))}
      ${F.tags('Related rounds', `news.${i}.rounds`, n.rounds, LG.rounds(d).map(r => ({ id: r.id, label: 'R' + r.round + ' ' + r.name })))}
      ${F.area('Post body — # headings, **bold**, *italic*, - lists, [links](https://…), photos', `news.${i}.body`, n.body, 'tall')}
      <div class="wide toolbar"><button class="btn sm" data-act="upload" data-mode="insert" data-target="news.${i}.body" data-folder="news" data-max="1920" data-multiple="1">🖼 Insert photo(s) at cursor</button><span class="hint" style="margin:0">Adds <code>![caption](link)</code> — the text inside [ ] becomes the caption (leave it empty for none).</span></div>
    </div><div class="item-actions"><a class="btn sm ghost" href="#/news/${esc(n.id)}">Preview post →</a><button class="btn sm danger" data-act="del-news" data-id="${esc(n.id)}">Delete post</button></div></div>` : '';
  return head('News posts', 'Race reports, signings, announcements. Posts show on the home page and the News tab.', `<button class="btn primary" data-act="new-news">+ New post</button>`) +
    editor + `<div class="a-card"><h3>All posts</h3>${list.length ? list.map(x => `<div style="display:flex;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid var(--line)">
      <span class="mono muted" style="width:100px">${esc(x.date || '')}</span><b style="flex:1">${x.pinned ? '📌 ' : ''}${esc(x.title || 'Untitled')}</b>${(x.teams || []).length ? `<span class="chip">${x.teams.length} team${x.teams.length > 1 ? 's' : ''}</span>` : ''}${x.hidden ? '<span class="pill-inactive">hidden</span>' : ''}${x.tag ? `<span class="chip">${esc(x.tag)}</span>` : ''}
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
    <div class="a-card"><h3>New season</h3><p class="hint" style="margin:-6px 0 12px">Saves the final standings to the Hall of fame, downloads a backup, then clears all results, penalties, FIA reports and the calendar. Drivers, teams, scoring, news and rules are kept.</p>
      <button class="btn sm danger" data-act="new-season">Start a new season</button></div>`;
}

/* ---------------- theme ---------------- */
const THEMES = {
  'Miku classic': { accent: '#39c5bb', accentSoft: '#86cecb', accentDeep: '#137a7f', highlight: '#e12885', bgDark: '#07090c', bgLight: '#f2f8f7' },
  'Sakura': { accent: '#f4a6c6', accentSoft: '#ffd1e3', accentDeep: '#b2557f', highlight: '#5fd3c4', bgDark: '#0d0a0c', bgLight: '#fbf4f7' },
  'Snow': { accent: '#7fb8ff', accentSoft: '#cfe5ff', accentDeep: '#2f6db5', highlight: '#ff8fb1', bgDark: '#070a10', bgLight: '#f3f7fc' },
  'Lavender night': { accent: '#a99bff', accentSoft: '#d4ccff', accentDeep: '#5a4bc4', highlight: '#ffd36e', bgDark: '#09080e', bgLight: '#f6f4fc' },
  'Papaya': { accent: '#ff8a3d', accentSoft: '#ffc49c', accentDeep: '#b4531a', highlight: '#3dc7ff', bgDark: '#0b0807', bgLight: '#fbf6f2' },
  'Racing red': { accent: '#ff4655', accentSoft: '#ff9aa2', accentDeep: '#a11826', highlight: '#ffd166', bgDark: '#0a0708', bgLight: '#fbf4f4' },
  'Forest': { accent: '#5fd08a', accentSoft: '#b5ecc8', accentDeep: '#1f7a47', highlight: '#f7b84b', bgDark: '#060a08', bgLight: '#f3f8f4' },
  'Mono': { accent: '#e8e8e8', accentSoft: '#bdbdbd', accentDeep: '#5b5b5b', highlight: '#39c5bb', bgDark: '#09090a', bgLight: '#f5f5f5' }
};
function secTheme(d) {
  const t = d.theme;
  const sw = (k, p) => `<button class="theme-swatch" data-act="theme-preset" data-k="${esc(k)}" style="--a:${p.accent};--b:${p.bgDark};--c:${p.highlight};--l:${p.bgLight}"><span class="ts-prev"><i></i><i></i><i></i></span>${esc(k)}</button>`;
  return head('Look & theme', 'Recolour the whole site. Changes preview instantly here and on the public pages in this browser — publish to make them live for everyone.', '<button class="btn" data-act="theme-reset">Reset to Miku classic</button>') + `
    <div class="a-card"><h3>Presets</h3><div class="theme-presets">${Object.entries(THEMES).map(([k, p]) => sw(k, p)).join('')}</div></div>
    <div class="a-card"><h3>Colours</h3><div class="fgrid">
      ${F.color('Main accent (buttons, points, active tabs)', 'theme.accent', t.accent)}
      ${F.color('Soft accent (links, borders)', 'theme.accentSoft', t.accentSoft)}
      ${F.color('Deep accent (gradients)', 'theme.accentDeep', t.accentDeep)}
      ${F.color('Highlight (fastest lap, sprints, alerts)', 'theme.highlight', t.highlight)}
      ${F.color('Dark mode background', 'theme.bgDark', t.bgDark)}
      ${F.color('Light mode background', 'theme.bgLight', t.bgLight)}
    </div><p class="hint">Cards, borders and text shades are mixed automatically from these. Team colours are set per team under Constructors.</p></div>
    <div class="a-card"><h3>Light / dark mode</h3><div class="fgrid">
      ${F.select('Default mode for visitors', 'theme.defaultMode', t.defaultMode, [['dark', 'Dark'], ['light', 'Light'], ['system', "Match the visitor's device"]])}
      ${F.check('Show the ☀ / ☾ toggle in the top bar', 'theme.allowToggle', t.allowToggle !== false)}
      ${F.check('Background glow & dot pattern', 'theme.effects', t.effects !== false)}
      ${F.check('Next-race strip at the very top (your time + track time)', 'theme.topBanner', t.topBanner !== false)}
      ${F.image('Logo on the clock widget (your league logo is used if empty — or use a real sponsor of yours)', 'theme.timingLogo', t.timingLogo === 'none' ? '' : t.timingLogo, 'branding', 400, 'clockLogo')}
    </div><p class="hint">A visitor's own toggle choice is remembered in their browser and wins over the default. <button class="btn xs" data-act="clear-mode">Forget my choice</button></p></div>
    <div class="a-card"><h3>Preview</h3><div class="toolbar"><span class="btn primary">Primary</span><span class="btn">Button</span><span class="badge next">Next race</span><span class="badge sprint">Sprint</span><span class="tag-fl">FL</span><span class="tag-pole">POLE</span><span class="cell p1">1</span><span class="cell pts">6</span><span class="cell nopts">14</span><span class="cell dnf">DNF</span></div>
      <p class="hint">Tip: use the ☀ / ☾ button in the top bar to check both modes.</p></div>`;
}

/* ---------------- stewards ---------------- */
const SD_STATUS = ['Under investigation', 'No further action', 'Reprimand', 'Warning', 'Penalty'];
function secStewards(d) {
  const rs = LG.rounds(d);
  const order = x => { const r = byId(d.calendar, x.roundId); return r ? Number(r.round) || 0 : -1; };
  const items = d.stewards.map((x, i) => ({ x, i })).sort((a, b) => order(b.x) - order(a.x)).map(({ x, i }) => {
    const key = 'sd-' + x.id, p = `stewards.${i}`, r = byId(d.calendar, x.roundId), drv = byId(d.drivers, x.driverId);
    return `<details class="item" data-key="${key}" ${A.open[key] ? 'open' : ''}>
      <summary><span class="chip">${r ? 'R' + esc(r.round) : '—'}</span><b>${esc(x.title || 'Incident')}</b><span class="muted" style="font-size:13px">${drv ? esc(drv.name) : ''}</span><span class="badge">${esc(x.status || '')}</span>${Number(x.points) ? `<span class="tag-fl">${fmtPts(x.points)} pts</span>` : ''}</summary>
      <div class="body"><div class="fgrid">
        ${F.select('Round', p + '.roundId', x.roundId, [['', '— none —'], ...rs.map(z => [z.id, `R${z.round} · ${z.name}`])])}
        ${F.select('Session', p + '.session', x.session, [['race', 'Race'], ['sprint', 'Sprint'], ['quali', 'Qualifying']])}
        ${F.text('Lap / corner', p + '.lap', x.lap, 'placeholder="Lap 1, Turn 3"')}
        ${F.text('Incident', p + '.title', x.title, 'wide data-reload')}
        ${F.select('Driver investigated', p + '.driverId', x.driverId, [['', '— none —'], ...driverOpts(d)])}
        ${F.text('Also involved', p + '.involved', x.involved, 'placeholder="e.g. #44 Okafor"')}
        ${F.select('Outcome', p + '.status', x.status, SD_STATUS.map(z => [z, z]))}
        ${F.text('Penalty shown (e.g. +5s, 3-place grid drop)', p + '.penalty', x.penalty)}
        ${F.num('Championship points (e.g. -3)', p + '.points', x.points, 'data-reload')}
        ${F.check('Also apply points to their team', p + '.teamToo', x.teamToo)}
        ${F.area('Decision & reasoning (optional if you upload your report)', p + '.decision', x.decision)}
        <div class="wide"><div class="fld"><span>Report document(s) — your template as an image or PDF</span></div>
          <div class="doc-list">${(x.docs || []).map((u, k) => `<div class="doc-item">${LG.isImg(u) ? `<img src="${esc(LG.asset(u))}" alt="">` : '<span class="doc-ic">📄</span>'}<span class="mono">${esc(String(u).split('/').pop())}</span><button class="iconbtn del" data-act="del-doc" data-i="${i}" data-k="${k}" title="Remove">✕</button></div>`).join('')}</div>
          <div class="toolbar"><button class="btn sm" data-act="upload" data-mode="push" data-target="${p}.docs" data-folder="stewards" data-max="2600" data-multiple="1" data-accept="image/*,application/pdf">⬆ Upload report file(s)</button><input type="text" data-adddoc="${i}" placeholder="…or paste a link and press Enter" style="max-width:320px"></div>
        </div>
      </div><div class="item-actions"><a class="btn sm ghost" href="#/stewards">View page</a><button class="btn sm danger" data-act="del-sd" data-i="${i}">Delete report</button></div></div>
    </details>`;
  }).join('');
  return head(esc((d.league.raceControl || 'FIA')) + ' reports', "Log incidents and decisions. They show on the " + esc(d.league.raceControl || 'FIA') + " page and under that round's results. Championship points entered here are applied to the standings automatically.", '<button class="btn primary" data-act="add-sd">+ New report</button>') +
    `<div class="a-card" style="display:flex;gap:14px;align-items:center;flex-wrap:wrap"><button class="btn primary" data-act="upload" data-mode="new-sd" data-folder="stewards" data-max="2600" data-multiple="1" data-accept="image/*,application/pdf">⬆ New report(s) from files</button><span class="hint" style="margin:0">Pick one or more filled-in templates — each becomes a report on the latest round. Then just set the dropdowns.</span></div>
    <div class="a-card">${items || '<p class="muted">No reports yet.</p>'}</div>
    <p class="hint">Time penalties that change the finishing order still need the driver moved down in <a href="#/admin/results">Results</a>.</p>`;
}

/* ---------------- hall of fame ---------------- */
function secHistory(d) {
  const items = d.history.map((h, i) => {
    const key = 'hist-' + h.id, p = `history.${i}`;
    return `<details class="item" data-key="${key}" ${A.open[key] ? 'open' : ''}>
      <summary><b class="mono" style="min-width:60px">${esc(h.season || '????')}</b><span class="swatch" style="--tc:${esc(h.driverColor || '#39c5bb')}"></span><b>${esc(h.driverChampion || 'No champion set')}</b><span class="muted" style="font-size:13px">${esc(h.teamChampion || '')}</span>${h.standings ? '<span class="chip">full standings</span>' : ''}</summary>
      <div class="body"><div class="fgrid">
        ${F.text('Season', p + '.season', h.season, 'data-reload')}
        ${F.text("Drivers' champion", p + '.driverChampion', h.driverChampion, 'data-reload')}
        ${F.text('Their team', p + '.driverTeam', h.driverTeam)}
        ${F.num('Points', p + '.driverPoints', h.driverPoints)}
        ${F.color('Card colour', p + '.driverColor', h.driverColor)}
        ${F.text("Constructors' champion", p + '.teamChampion', h.teamChampion, 'data-reload')}
        ${F.num('Team points', p + '.teamPoints', h.teamPoints)}
        ${F.color('Team colour', p + '.teamColor', h.teamColor)}
        ${F.area('Notes (season story, records, shout-outs)', p + '.notes', h.notes)}
      </div><div class="item-actions">${h.standings ? `<a class="btn sm ghost" href="#/history/${esc(h.id)}">View final standings</a><button class="btn sm" data-act="drop-snapshot" data-i="${i}">Remove standings snapshot</button>` : ''}<button class="btn sm danger" data-act="del-hist" data-i="${i}">Delete season</button></div></div>
    </details>`;
  }).join('');
  return head('Hall of fame', 'Past champions. "Start a new season" archives automatically; you can also archive now or type in seasons from before this website existed.',
    `<button class="btn" data-act="add-hist">+ Add past season</button><button class="btn primary" data-act="archive-now">♛ Archive season ${esc(d.league.season)} now</button>`) +
    `<div class="a-card">${items || '<p class="muted">No seasons archived yet.</p>'}</div>
    <p class="hint">"Archive now" saves a snapshot of the current final standings and race winners without clearing anything — handy right after the last race.</p>`;
}

/* ---------------- sign-ups ---------------- */
function secSignups(d) {
  const s = d.signups;
  return head('Sign-ups', 'GitHub Pages can\'t receive form submissions by itself, so applications go to a free form (Google Forms, Tally…) or your Discord. The page shows open seats and lets drivers build a ready-to-paste application.', '<a class="btn" href="#/join">View page</a>') + `
    <div class="a-card"><div class="fgrid">
      ${F.check('Sign-ups are open (shows a dot on the menu + a button on the home page)', 'signups.open', s.open)}
      ${F.check('Show the application builder', 'signups.showBuilder', s.showBuilder !== false)}
      ${F.text('Page title', 'signups.title', s.title)}
      ${F.num('Seats per team', 'signups.seatsPerTeam', s.seatsPerTeam, 'data-reload')}
      ${F.text('Application form link (optional — otherwise the Discord link is used)', 'signups.formUrl', s.formUrl, 'wide')}
      ${F.area('Intro text', 'signups.intro', s.intro)}
      ${F.area('Requirements (e.g. - Clean racing record, - Available Wednesdays)', 'signups.requirements', s.requirements)}
    </div></div>`;
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
  const fn = { dashboard: secDashboard, league: secLeague, drivers: secDrivers, teams: secTeams, calendar: secCalendar, results: secResults, scoring: secScoring, adjust: secAdjust, news: secNews, publish: secPublish, theme: secTheme, stewards: secStewards, history: secHistory, signups: secSignups, rulebook: secRulebook }[A.section];
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
  if (el.dataset.path.startsWith('theme.')) LG.applyTheme(D());
});
document.addEventListener('change', e => {
  const el = e.target;
  if (!inAdmin(el)) return;
  if (el.dataset.ctl === 'round') { A.roundId = el.value; return rerender(); }
  if (el.dataset.ctl === 'import') return importFile(el.files[0]);
  if (el.dataset.ctl === 'rb-file') { const f = el.files[0]; if (!f) return; const fr = new FileReader(); fr.onload = () => importRulebook(/\.html?$/i.test(f.name) ? LG.htmlToMd(String(fr.result)) : String(fr.result)); fr.readAsText(f); return; }
  if (el.dataset.tagpath) { const cur = getPath(D(), el.dataset.tagpath) || []; const v = el.value; setPath(D(), el.dataset.tagpath, el.checked ? [...new Set([...cur, v])] : cur.filter(x => x !== v)); LG.saveDraft(); return rerender(); }
  if (el.dataset.adddoc !== undefined) { const v = el.value.trim(); if (v) { const x = D().stewards[Number(el.dataset.adddoc)]; (x.docs = x.docs || []).push(v); commit(); } return; }
  if (!el.dataset.path) return;
  setPath(D(), el.dataset.path, readVal(el));
  // picking a driver in results auto-fills their current team
  if (el.hasAttribute('data-driver')) {
    const drv = byId(D().drivers, el.value);
    setPath(D(), el.dataset.path.replace(/driverId$/, 'teamId'), drv ? drv.teamId || '' : '');
  }
  if (el.dataset.path.startsWith('calendar.') && el.dataset.path.endsWith('.round')) sortRounds();
  { const m = el.dataset.path.match(/^calendar\.(\d+)\.sessions\.(\d+)\.start$/); if (m) { const r = D().calendar[+m[1]], x = r.sessions[+m[2]]; if (/^race$/i.test(String(x.name || '').trim()) && x.start) r.start = x.start; } }
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
    case 'theme-preset': d.theme = Object.assign({}, d.theme, THEMES[b.dataset.k]); toast(b.dataset.k + ' theme applied — publish to make it live'); return commit();
    case 'theme-reset': d.theme = clone(LG.DEFAULT_THEME); return commit();
    case 'clear-mode': try { localStorage.removeItem(LG.MODE_KEY); } catch (x) { } toast('Using the site default mode again'); return rerender();
    case 'add-sd': { const x = newSD(d); d.stewards.push(x); A.open['sd-' + x.id] = true; return commit(); }
    case 'del-sd': if (confirm('Delete this report?')) { d.stewards.splice(i, 1); commit(); } return;
    case 'archive-now': {
      if (d.history.some(h => String(h.season) === String(d.league.season)) && !confirm(`Season ${d.league.season} is already in the Hall of fame. Add another entry anyway?`)) return;
      d.history.push(LG.snapshotSeason(d)); toast(`Season ${d.league.season} saved to the Hall of fame`); return commit();
    }
    case 'add-hist': { const h = { id: uid('season'), season: '', driverChampion: '', driverTeam: '', driverColor: '#39c5bb', driverPoints: '', teamChampion: '', teamColor: '#39c5bb', teamPoints: '', notes: '' }; d.history.push(h); A.open['hist-' + h.id] = true; return commit(); }
    case 'del-hist': if (confirm('Remove this season from the Hall of fame?')) { d.history.splice(i, 1); commit(); } return;
    case 'drop-snapshot': delete d.history[i].standings; delete d.history[i].winners; return commit();
    case 'upload': if (!ghReady()) return; return pickFiles({ spec: b.dataset.spec, mode: b.dataset.mode, target: b.dataset.target, folder: b.dataset.folder || 'misc', maxDim: Number(b.dataset.max) || 1920, multiple: !!b.dataset.multiple, accept: b.dataset.accept || 'image/*' });
    case 'clear-field': setPath(d, b.dataset.target, ''); return commit();
    case 'del-doc': d.stewards[i].docs.splice(Number(b.dataset.k), 1); return commit();
    case 'clear-dotd': delete d.results[A.roundId].dotd; return commit();
    case 'add-sess': { const r = d.calendar[i]; (r.sessions = r.sessions || []).push({ name: r.sessions.length ? '' : 'Qualifying', start: '', end: '' }); A.open['rnd-' + r.id] = true; return commit(); }
    case 'del-sess': d.calendar[i].sessions.splice(Number(b.dataset.k), 1); return commit();
    case 'sess-preset': {
      const r = d.calendar[i];
      if (!r.start) return toast('Set the race start first', 'err');
      if ((r.sessions || []).length && !confirm('Replace this round\'s schedule?')) return;
      const R = new Date(r.start).getTime(), H = 36e5, D = 24 * H;
      const mk = (name, off, len) => ({ name, start: new Date(R + off).toISOString(), end: len ? new Date(R + off + len).toISOString() : '' });
      const P = {
        qr: [mk('Qualifying', -0.5 * H, 0.33 * H), mk('Race', 0, 0)],
        sprint: [mk('Practice 1', -2 * D - 1.5 * H, H), mk('Sprint Qualifying', -2 * D + 2 * H, 0.75 * H), mk('Sprint', -D - 2.5 * H, 0.5 * H), mk('Qualifying', -D + H, H), mk('Race', 0, 0)],
        full: [mk('Practice 1', -2 * D - 1.5 * H, H), mk('Practice 2', -2 * D + 2 * H, H), mk('Practice 3', -D - 2.5 * H, H), mk('Qualifying', -D + H, H), mk('Race', 0, 0)]
      };
      r.sessions = P[b.dataset.k]; A.open['rnd-' + r.id] = true; return commit();
    }
    case 'add-person': { const arr = getPath(d, b.dataset.list) || []; arr.push({}); setPath(d, b.dataset.list, arr); return commit(); }
    case 'del-person': { const arr = getPath(d, b.dataset.list) || []; arr.splice(Number(b.dataset.k), 1); return commit(); }
    case 'rb-clear': if (confirm('Remove the imported rulebook? (The Rules page goes back to your simple rules text.)')) { d.rulebook.md = ''; commit(); } return;
    case 'publish': return publish(b);
    case 'discard-draft': if (confirm('Throw away all unpublished changes?')) LG.discardDraft(); return;
    case 'reload-live': return reloadLive();
    case 'download': return download(d, 'league.json');
    case 'new-season': {
      if (!confirm('Start a new season? A backup will download first. Results, penalties and the calendar will be cleared (nothing goes live until you publish).')) return;
      download(d, `league-${String(d.league.season).replace(/[^\w-]+/g, '_')}-backup.json`);
      d.history.push(LG.snapshotSeason(d));
      d.results = {}; d.adjustments = []; d.stewards = []; d.calendar = [];
      const n = parseInt(d.league.season, 10); if (!isNaN(n) && String(n) === String(d.league.season).trim()) d.league.season = String(n + 1);
      toast('New season started — set up the calendar next'); return commit();
    }
  }
});

/* ---------------- rulebook ---------------- */
function secRulebook(d) {
  const rb = d.rulebook = d.rulebook || {};
  const parsed = LG.parseRulebook(rb.md || '', rb);
  const pts = parsed.chapters.reduce((a, c) => a + c.sections.length, 0);
  return head('Rulebook', 'Import your Google Doc rulebook — the Rules page turns it into chapters and points visitors can click through and search.', '<a class="btn" href="#/rules">View Rules page</a>') + `
    <div class="a-card"><h3>1 · Import from Google Docs</h3>
      <ol class="steps">
        <li>In your doc, give each <b>chapter</b> the style <b>Heading 1</b> and each <b>rule / point</b> the style <b>Heading 2</b> (Format → Paragraph styles). Normal text under a heading becomes its content. Numbers like "3.2" in a heading are kept.</li>
        <li>Click in the doc, press <b>Ctrl/⌘ + A</b> then <b>Ctrl/⌘ + C</b>.</li>
        <li>Click the box below and press <b>Ctrl/⌘ + V</b>.</li>
      </ol>
      <div class="paste-zone" contenteditable="true" data-paste="rulebook" spellcheck="false">📋 Click here, then paste your whole Google Doc</div>
      <div class="toolbar" style="margin-top:10px"><label class="btn sm">⬆ Or import a file (.md / .html / .txt)<input type="file" accept=".md,.markdown,.txt,.html,.htm" data-ctl="rb-file" hidden></label><span class="hint" style="margin:0">Google Docs → File → Download → <b>Markdown (.md)</b> works too.</span></div>
      <p class="hint">Importing replaces the current rulebook in your draft — nothing goes live until you publish. Re-import any time you update the doc.</p>
    </div>
    <div class="a-card"><h3>2 · Details</h3><div class="fgrid">
      ${F.text('Rulebook title', 'rulebook.title', rb.title || '', 'placeholder="Sporting Regulations"')}
      ${F.text('Version', 'rulebook.version', rb.version || '', 'placeholder="v1.2"')}
      ${F.date('Last updated', 'rulebook.updated', rb.updated)}
      ${F.check('Number chapters & points automatically if the doc has no numbers', 'rulebook.autoNumber', rb.autoNumber !== false)}
      ${F.check('Add a "Points & scoring" chapter from your scoring system', 'rulebook.showScoring', rb.showScoring !== false)}
    </div></div>
    <div class="a-card"><h3>3 · Check the result</h3>
      ${parsed.chapters.length ? `<p class="ok-note" style="margin:0 0 14px">Found <b>${parsed.chapters.length} chapters</b> and <b>${pts} points</b>${parsed.title ? ` · title "${esc(parsed.title)}"` : ''}.</p>
        <div class="rb-outline">${parsed.chapters.map(c => `<details><summary><b>${esc(c.num)}</b> ${esc(c.title)} <span class="muted">· ${c.sections.length} point${c.sections.length === 1 ? '' : 's'}</span></summary><ul>${c.sections.map(x => `<li><b class="mono">${esc(x.num)}</b> ${esc(x.title || x.label)}</li>`).join('')}</ul></details>`).join('')}</div>`
        : `<p class="muted" style="margin:0">${rb.md ? 'No headings found yet — make sure chapters use Heading 1 (or lines like "Chapter 1 …") and points use Heading 2 (or lines starting "1.1").' : 'Nothing imported yet.'}</p>`}
      <details style="margin-top:14px"><summary class="muted" style="cursor:pointer">Edit the imported text directly</summary>
        <p class="hint"># = chapter, ## = point, ### = sub-heading inside a point. Also **bold**, *italic*, - lists, 1. lists, | tables |.</p>
        <div class="fgrid">${F.area('Rulebook source', 'rulebook.md', rb.md || '', 'tall')}</div></details>
      ${rb.md ? '<div class="item-actions"><button class="btn sm danger" data-act="rb-clear">Remove rulebook</button></div>' : ''}
    </div>`;
}
function importRulebook(mdText) {
  const d = D(); d.rulebook = d.rulebook || {};
  const parsed = LG.parseRulebook(mdText, d.rulebook);
  if (!parsed.chapters.length && !confirm('No chapters were detected (use Heading 1 for chapters, Heading 2 for points). Import anyway?')) return;
  if (d.rulebook.md && !confirm('Replace the current rulebook with this one?')) return;
  d.rulebook.md = mdText;
  if (parsed.title && !d.rulebook.title) d.rulebook.title = parsed.title;
  d.rulebook.updated = new Date().toISOString().slice(0, 10);
  toast(`Imported ${parsed.chapters.length} chapters · ${parsed.chapters.reduce((a, c) => a + c.sections.length, 0)} points`);
  commit();
}
document.addEventListener('paste', e => {
  const z = e.target.closest && e.target.closest('[data-paste="rulebook"]');
  if (!z) return;
  e.preventDefault();
  const html = e.clipboardData.getData('text/html'), txt = e.clipboardData.getData('text/plain');
  importRulebook(html ? LG.htmlToMd(html) : txt);
});
document.addEventListener('focusin', e => { const z = e.target.closest && e.target.closest('[data-paste="rulebook"]'); if (z && /^📋/.test(z.textContent)) z.textContent = ''; });

/* ---------------- uploads (straight into the repo) ---------------- */
const fileInput = Object.assign(document.createElement('input'), { type: 'file', hidden: true });
document.body.appendChild(fileInput);
let pending = null;
function pickFiles(o) { pending = o; fileInput.accept = o.accept; fileInput.multiple = o.multiple; fileInput.value = ''; fileInput.click(); }
fileInput.addEventListener('change', () => { const files = [...fileInput.files], o = pending; pending = null; if (files.length && o) handleUpload(files, o); });
const lastCursor = {};
document.addEventListener('focusout', e => { const t = e.target; if (t.tagName === 'TEXTAREA' && t.dataset.path) lastCursor[t.dataset.path] = t.selectionStart; });
function getPath(obj, path) { return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj); }
const prettyName = n => n.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();

async function shrinkImage(file, maxDim) {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return file;
  let bmp; try { bmp = await createImageBitmap(file); } catch (e) { return file; }
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.size < 1.5e6) return file;
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const out = await new Promise(r => c.toBlob(r, file.type, 0.88));
  return out && out.size < file.size ? out : file;
}
const blobToB64 = blob => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(blob); });
async function uploadToGitHub(g, blob, name, folder) {
  if (blob.size > 25e6) throw new Error('file is over 25 MB');
  const ext = ((name.match(/\.([a-z0-9]+)$/i) || [])[1] || 'bin').toLowerCase();
  const base = name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'file';
  const path = `uploads/${folder}/${new Date().toISOString().slice(0, 10)}-${base}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
  const api = `https://api.github.com/repos/${encodeURIComponent(g.c.owner)}/${encodeURIComponent(g.c.repo)}/contents/${path}`;
  const r = await fetch(api, { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, g.headers), body: JSON.stringify({ message: `Upload ${path}`, content: await blobToB64(blob), branch: g.c.branch }) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || r.status);
  return path;
}
async function checkSpec(f, sp) {
  let bmp; try { bmp = await createImageBitmap(f); } catch (e) { return; }
  const want = sp.w / sp.h, got = bmp.width / bmp.height, tips = [];
  if (Math.abs(Math.log(got / want)) > 0.22) tips.push(`it's ${bmp.width} × ${bmp.height}, but this spot looks best at about ${sp.w} × ${sp.h}${sp.fit === 'cover' ? ' — the edges will be cropped' : ' — it will have empty space around it'}`);
  else if (bmp.width < sp.w * 0.5) tips.push(`it's only ${bmp.width} px wide, so it may look blurry (aim for ${sp.w} px)`);
  if (/transparent/.test(sp.fmt) && f.type === 'image/jpeg') tips.push('JPGs can\'t be transparent — a PNG cut-out will blend in better');
  if (tips.length) toast(`Heads up for ${f.name}: ${tips.join('; ')}.`, 'err');
}
async function handleUpload(files, o) {
  const g = ghReady(); if (!g) return;
  const d = D(), done = [];
  const sp = IMG_SPECS[o.spec];
  for (const f of files) {
    try {
      if (sp) await checkSpec(f, sp);
      toast(`Uploading ${f.name}…`);
      const blob = await shrinkImage(f, o.maxDim);
      const path = await uploadToGitHub(g, blob, f.name, o.folder);
      LG.ASSET_CACHE[path] = URL.createObjectURL(blob);
      done.push({ path, name: f.name });
    } catch (err) { toast(`Upload failed (${f.name}): ${err.message}`, 'err'); }
  }
  if (!done.length) return;
  if (o.mode === 'set') setPath(d, o.target, done[0].path);
  else if (o.mode === 'push') { const arr = getPath(d, o.target) || []; done.forEach(x => arr.push(x.path)); setPath(d, o.target, arr); }
  else if (o.mode === 'insert') {
    const ta = document.querySelector(`textarea[data-path="${o.target}"]`);
    const cur = getPath(d, o.target) || '';
    const pos = ta && lastCursor[o.target] !== undefined ? Math.min(lastCursor[o.target], cur.length) : cur.length;
    const snippet = done.map(x => `\n![${prettyName(x.name)}](${x.path})\n`).join('');
    setPath(d, o.target, cur.slice(0, pos) + snippet + cur.slice(pos));
  } else if (o.mode === 'new-sd') {
    done.forEach(x => { const s = Object.assign(newSD(d), { title: prettyName(x.name), docs: [x.path] }); d.stewards.push(s); A.open['sd-' + s.id] = true; });
  }
  toast(done.length > 1 ? `${done.length} files uploaded ✓` : 'Uploaded ✓ — publish so it shows on the live site');
  commit();
}

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
