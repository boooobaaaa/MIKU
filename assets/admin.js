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
const A = { section: 'dashboard', roundId: null, session: 'race', newsId: null, open: {}, typing: {} };
/* a real dropdown with an "✎ Type my own…" escape hatch (instead of the browser's autofill-style suggestions) */
function combo(path, val, options, ph = '') {
  val = val == null ? '' : String(val);
  if (A.typing[path]) {
    return `<span class="combo-typing"><input type="text" data-path="${path}" value="${esc(val)}" placeholder="${esc(ph)}" autocomplete="off" data-combo-input autofocus><button type="button" class="iconbtn" data-act="combo-list" data-path-k="${esc(path)}" title="Pick from the list">▾</button></span>`;
  }
  const list = val && !options.includes(val) ? [val, ...options] : options;
  return `<select data-path="${path}" data-combo>${val ? '' : `<option value="" selected>${esc(ph || '— choose —')}</option>`}${list.map(o => `<option value="${esc(o)}" ${o === val ? 'selected' : ''}>${esc(o)}</option>`).join('')}<option value="__type">✎ Type my own…</option></select>`;
}

const SECTIONS = [
  ['dashboard', 'Dashboard', '◈'], ['league', 'League & rules', '✦'], ['theme', 'Look & theme', '✿'], ['drivers', 'Drivers', '◉'], ['teams', 'Constructors', '▣'],
  ['calendar', 'Calendar', '◷'], ['results', 'Results', '▤'], ['scoring', 'Scoring system', '✚'], ['adjust', 'Penalties & points', '±'],
  ['stewards', 'KIRA', '⚑'], ['news', 'News posts', '✎'], ['rulebook', 'Rulebook', '§'], ['about', 'About page', 'ⓘ'], ['fantasy', 'Fantasy league', '★'], ['griddraft', 'Grid Draft', '⇄'], ['portal', 'Team portal', '✉'], ['applications', 'Applications', '✍'], ['predictions', 'Predictions', '🔮'], ['gallery', 'Gallery', '▦'], ['slideshow', 'Home slideshow', '◧'], ['seasons', 'Seasons', '⟲'], ['signups', 'Sign-ups', '✋'], ['history', 'Hall of fame', '♛'], ['access', 'Admin team', '⚿'], ['accounts', 'Accounts', '◎'], ['publish', 'Publish & backup', '⇪']
];
const STATUSES = ['FIN', 'DNF', 'DSQ', 'DNS', 'NS'];
/* recommended image sizes — shown under each upload field and checked on upload */
const IMG_SPECS = {
  logo: { w: 512, h: 512, fmt: 'square PNG, transparent background', note: 'shown whole inside a rounded square, so leave a little empty space around the artwork' },
  teamLogo: { w: 512, h: 512, fmt: 'square PNG, transparent background', note: 'shown whole (never cropped) on team cards and the team page' },
  car: { w: 1600, h: 500, fmt: 'wide PNG, transparent background', note: 'side view, car facing right and filling the width' },
  driverPhoto: { w: 1000, h: 1200, fmt: 'portrait PNG cut-out, transparent background', note: 'waist-up, top of the head near the top edge — sits bottom-aligned, never cropped' },
  headshot: { w: 400, h: 400, fmt: 'square JPG or PNG', note: 'face centred and filling most of the frame — shown in circles, so the corners get trimmed', round: true, fit: 'cover' },
  cover: { w: 1600, h: 900, fmt: '16:9 JPG or PNG', note: 'cards crop the edges a little, so keep the subject near the middle', fit: 'cover' },
  og: { w: 1200, h: 630, fmt: 'JPG or PNG', note: 'the standard size for link previews on Discord and social apps', fit: 'cover' },
  clockLogo: { w: 256, h: 256, fmt: 'square PNG, transparent background', note: 'shown small next to the clocks' },
  slide: { w: 1920, h: 840, fmt: 'wide JPG or PNG', note: 'shown wide across the home page — you can fine-tune the position and zoom afterwards', fit: 'cover' },
  favicon: { w: 256, h: 256, fmt: 'square PNG (transparent is fine)', note: 'shown tiny in the browser tab, so keep it simple and bold — a symbol or 1–2 letters reads best. Leave empty to use the league logo' }
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
const passOK = () => !!D().settings.adminHash && sessionStorage.getItem(K.auth) === D().settings.adminHash;
/* ----- admin team: Google sign-in via the Grid Draft Firebase ----- */
function teamStore() { const d = D(); return window.Portal && d.gridDraft && d.gridDraft.firebase && d.gridDraft.firebase.apiKey || window.PT_TEST_STORE ? window.Portal.store(d) : null; }
function ownerEmails() { return String((window.GridDraft ? window.GridDraft.cfg(D()).admins : '') || '').toLowerCase().split(/[\s,;]+/).filter(Boolean); }
function team() {
  const s = teamStore(); if (!s || !s.ready || !s.user) return null;
  const nm = s.user.displayName || s.user.email.split('@')[0];
  if (ownerEmails().includes(s.user.email)) return { owner: true, email: s.user.email, name: nm, sections: ['*'], s };
  if (s.siteAdmin) return { owner: false, email: s.user.email, name: s.siteAdmin.name || nm, sections: s.siteAdmin.sections || [], s };
  return null;
}
/* a co-admin who got in by Google sign-in (not the passcode) only sees the sections you gave them */
function limited() { if (passOK()) return null; const t = team(); return t && !t.owner ? t : null; }
function allowed(k) {
  const t = limited(); if (!t) return true;
  if (k === 'dashboard' || k === 'publish') return true;
  if (k === 'access') return false;
  return t.sections.includes('*') || t.sections.includes(k);
}
const unlocked = () => !D().settings.adminHash || passOK() || !!team();
const TEAMKEY = { key: undefined, loading: false };
function loadTeamKey() {
  const t = team(); if (!t || ls.get(K.token) || TEAMKEY.key !== undefined || TEAMKEY.loading) return;
  TEAMKEY.loading = true;
  t.s.getKey().then(k => { TEAMKEY.key = k && k.token ? k : null; }).catch(() => { TEAMKEY.key = null; }).finally(() => { TEAMKEY.loading = false; rerender(); });
}
function teamLog(action, detail) { const t = team(); if (t) t.s.log(action, detail, t.name).catch(() => { }); }

/* ---------------- field helpers ---------------- */
const opt = (v, label, cur) => `<option value="${esc(v)}" ${String(v) === String(cur ?? '') ? 'selected' : ''}>${esc(label)}</option>`;
const F = {
  text: (label, path, val, extra = '') => `<label class="fld ${extra.includes('wide') ? 'wide' : ''}"><span>${label}</span><input type="text" data-path="${path}" value="${esc(val)}" ${extra.replace('wide', '')}></label>`,
  num: (label, path, val, extra = '') => `<label class="fld"><span>${label}</span><input type="number" step="any" data-num data-path="${path}" value="${esc(val ?? '')}" ${extra}></label>`,
  color: (label, path, val) => `<label class="fld"><span>${label}</span><input type="color" data-path="${path}" data-reload value="${esc(/^#[0-9a-f]{6}$/i.test(val || '') ? val : '#39c5bb')}"></label>`,
  area: (label, path, val, cls = '') => `<label class="fld wide"><span>${label}</span><textarea class="${cls}" data-path="${path}">${esc(val)}</textarea></label>`,
  country: (label, path, val) => `<div class="fld cpick-fld"><span>${label}</span><input type="hidden" data-path="${path}" value="${esc(val || '')}" data-reload><button type="button" class="cpick" data-cpick="${path}">${val ? `${cpFlag(val)}<span>${esc(LG.countryName(val))}</span><small class="mono">${esc(String(val).toUpperCase())}</small>` : '<span class="muted">Choose a country…</span>'}<i>▾</i></button></div>`,
  check: (label, path, val) => `<label class="chk"><input type="checkbox" data-path="${path}" data-reload ${val ? 'checked' : ''}><span>${label}</span></label>`,
  select: (label, path, val, opts, extra = 'data-reload') => `<label class="fld"><span>${label}</span><select data-path="${path}" ${extra}>${opts.map(([v, l]) => opt(v, l, val)).join('')}</select></label>`,
  dt: (label, path, val) => `<label class="fld"><span>${label}</span><input type="datetime-local" data-dt data-path="${path}" value="${toLocalInput(val)}"></label>`,
  image: (label, path, val, folder, maxDim = 1600, spec = '') => {
    const sp = IMG_SPECS[spec] || null;
    const ar = sp ? sp.w / sp.h : 1;
    return `<div class="fld wide"><span>${label}</span><div class="img-field">
      <span class="thumb-frame ${sp && sp.round ? 'round' : ''}" style="aspect-ratio:${ar};${ar >= 1 ? 'width:' + Math.min(96, Math.round(44 * ar)) + 'px' : 'height:56px'}">${val ? `<img src="${esc(LG.asset(val))}" alt="" style="object-fit:${sp && sp.fit === 'cover' ? 'cover' : 'contain'}" onerror="this.style.visibility='hidden'">` : ''}</span>
      <input type="text" data-path="${path}" data-reload value="${esc(val || '')}" placeholder="Upload, or paste an image link">
      <button class="btn sm" data-act="upload" data-mode="set" data-target="${path}" data-folder="${folder}" data-max="${maxDim}" ${sp ? `data-spec="${spec}"` : ''}>⬆ Upload</button>${val && sp ? `<button class="btn sm" data-act="adjust" data-target="${path}" data-folder="${folder}" data-spec="${spec}" title="Crop / zoom / reposition">✂ Adjust</button>` : ''}${val ? `<button class="iconbtn del" data-act="clear-field" data-target="${path}" title="Remove">✕</button>` : ''}</div>
      ${sp ? `<div class="img-spec"><b>Best: ${sp.w} × ${sp.h} px</b> · ${esc(sp.fmt)}<span> — ${esc(sp.note)}</span></div>` : ''}</div>`;
  },
  tags: (label, path, vals, opts) => `<div class="fld wide"><span>${label}</span><div class="tagpick">${opts.length ? opts.map(o => `<label class="tp ${(vals || []).includes(o.id) ? 'on' : ''}" ${o.color ? `style="--tc:${esc(o.color)}"` : ''}><input type="checkbox" data-tagpath="${path}" value="${esc(o.id)}" ${(vals || []).includes(o.id) ? 'checked' : ''}>${o.color ? '<span class="swatch"></span>' : ''}${esc(o.label)}</label>`).join('') : '<span class="muted">None yet</span>'}</div></div>`,
  date: (label, path, val) => `<label class="fld"><span>${label}</span><input type="date" data-path="${path}" value="${esc(val || '')}"></label>`
};
function toLocalInput(iso) { if (!iso) return ''; const t = new Date(iso); if (isNaN(t)) return ''; return new Date(t - t.getTimezoneOffset() * 6e4).toISOString().slice(0, 16); }
const teamOpts = d => [['', '— No team —'], ...d.teams.map(t => [t.id, t.name])];
const driverOpts = d => d.drivers.map(x => [x.id, `${x.number !== undefined && x.number !== '' ? '#' + x.number + ' ' : ''}${x.name}${x.active === false ? ' (inactive)' : ''}`]);
const head = (title, sub, tools = '') => `<div class="a-head"><div><div class="eyebrow">Admin console</div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div><div class="toolbar">${tools}</div></div>`;
const usedInResults = (d, key, id) => Object.values(d.results).some(r => ['race', 'sprint', 'sprintQuali', 'quali'].some(s => (r[s] || []).some(e => e[key] === id)));

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
        <a href="#/admin/stewards">⚑ Log a ${esc(LG.rcName(d))} decision<small>Incidents, penalties, documents</small></a>
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
      ${F.text('Race control name', 'league.raceControl', L.raceControl || 'KIRA', 'data-reload')}
      ${F.text('Tagline (home page)', 'league.tagline', L.tagline, 'wide')}
      ${F.text('Footer text (small line at the bottom of every page)', 'league.footer', L.footer ?? 'Fan-run sim racing league. Not affiliated with Formula 1.', 'wide data-reload')}
      ${F.image('League logo', 'league.logo', L.logo, 'branding', 600, 'logo')}
      ${F.image('Browser tab icon (favicon)', 'league.favicon', L.favicon, 'branding', 256, 'favicon')}
    </div></div>
    <div class="a-card"><h3>Link preview (Discord, iMessage, X…)</h3>
      <p class="hint" style="margin:-4px 0 12px">What shows when someone pastes your site's link. Saved into your site's page file when you <b>Publish</b>.</p>
      <div class="fgrid">
        ${F.text('Preview title', 'seo.title', (d.seo || {}).title || '', 'placeholder="' + esc(L.name || 'F1 League') + '"')}
        ${F.color('Embed colour (Discord side bar)', 'seo.color', (d.seo || {}).color || d.theme.accent || '#39c5bb')}
        ${F.area('Preview description', 'seo.description', (d.seo || {}).description || '')}
        ${F.image('Preview image (optional — shows as a big picture)', 'seo.image', (d.seo || {}).image, 'branding', 1200, 'og')}
      </div>
      <div class="seo-prev" style="--sc:${esc((d.seo || {}).color || d.theme.accent || '#39c5bb')}"><span class="seo-site">${esc(location.host || 'your-site')}</span><b>${esc((d.seo || {}).title || L.name || 'F1 League')}</b><p>${esc((d.seo || {}).description || L.tagline || 'Official home of our F1 league.')}</p>${(d.seo || {}).image ? `<img src="${esc(LG.asset(d.seo.image))}" alt="">` : ''}</div>
      <div class="toolbar" style="margin-top:12px"><button class="btn sm" data-act="seo-now">Update link preview now</button></div>
      <p class="hint">Discord remembers previews for a while. To see a change immediately, paste the link with something added to the end, like <code>${esc(location.origin + location.pathname)}?v=2</code>.</p>
    </div>
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
    ${limited() ? '' : `<div class="a-card"><h3>Admin passcode</h3>
      <p class="hint" style="margin:-6px 0 12px">Hides this console from visitors. It's a convenience lock — the actual protection is that publishing needs your GitHub token, which never leaves your browser.</p>
      <div class="fgrid"><label class="fld"><span>New passcode</span><input type="password" id="new-pass" autocomplete="new-password"></label>
      <div style="display:flex;gap:8px;align-items:flex-end"><button class="btn sm primary" data-act="set-pass">Save passcode</button>${d.settings.adminHash ? '<button class="btn sm danger" data-act="clear-pass">Remove</button>' : ''}</div></div>
      ${d.settings.adminHash ? '<p class="hint">A passcode is set. Remember to publish so it applies on the live site.</p>' : ''}
    </div>`}`;
}

const ADS = (() => { try { return Object.assign({ sort: 'custom', team: '', show: 'all' }, JSON.parse(localStorage.getItem('league.admin.drvview') || '{}')); } catch (e) { return { sort: 'custom', team: '', show: 'all' }; } })();
const saveADS = () => { try { localStorage.setItem('league.admin.drvview', JSON.stringify(ADS)); } catch (e) { } };
const lastNameOf = x => { const p = String(x.name || '').trim().split(/\s+/); return (p[p.length - 1] || '').toLowerCase(); };
function driverOrder(d, st) {
  const num = x => { const n = parseInt(x.number, 10); return isNaN(n) ? 999 : n; };
  const team = x => { const t = byId(d.teams, x.teamId); return t ? t.name.toLowerCase() : 'zzz'; };
  const pos = x => (st.D[x.id] || {}).position || 999;
  const by = { number: (a, b) => num(a) - num(b), name: (a, b) => lastNameOf(a).localeCompare(lastNameOf(b)) || String(a.name).localeCompare(String(b.name)),
    team: (a, b) => team(a).localeCompare(team(b)) || num(a) - num(b), standings: (a, b) => pos(a) - pos(b) || num(a) - num(b) }[ADS.sort];
  const idx = d.drivers.map((x, i) => i);
  return by ? idx.sort((i, j) => by(d.drivers[i], d.drivers[j])) : idx;
}
function seasonOpts(d) {
  const s = new Set([String(d.league.season)]);
  (d.history || []).forEach(h => h && h.season != null && s.add(String(h.season)));
  (d.drivers || []).forEach(x => (x.history || []).forEach(h => { if (h) { if (h.fromSeason) s.add(String(h.fromSeason)); if (h.toSeason) s.add(String(h.toSeason)); } }));
  return [...s].filter(Boolean).sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0) || a.localeCompare(b));
}
function secDrivers(d) {
  const st = LG.computeStandings(d);
  const custom = ADS.sort === 'custom';
  const shownIdx = driverOrder(d, st).filter(i => { const x = d.drivers[i]; return (!ADS.team || x.teamId === ADS.team || (ADS.team === '-' && !x.teamId)) && (ADS.show === 'all' || (ADS.show === 'active' ? x.active !== false : x.active === false)); });
  const canMove = custom && !ADS.team && ADS.show === 'all';
  const items = shownIdx.map(i => {
    const x = d.drivers[i];
    const t = byId(d.teams, x.teamId), key = 'drv-' + x.id, p = `drivers.${i}`;
    const search = [x.name, x.number, x.gamertag, t && t.name, x.country].filter(Boolean).join(' ').toLowerCase();
    const dq = (ADS.q || '').trim().toLowerCase(), hit = !dq || dq.split(/\s+/).every(w => String(search).toLowerCase().includes(w));
    return `<details class="item" data-key="${key}" data-search="${esc(search)}" ${A.open[key] ? 'open' : ''} ${hit ? '' : 'hidden'}>
      <summary>${canMove ? mvBtns('drivers', i, d.drivers.length) : ''}<span class="swatch" style="--tc:${esc(LG.teamColor(t))}"></span><b class="mono" style="width:34px">${esc(x.number ?? '')}</b>${LG.nameHTML(x.name)} ${LG.flag(x.country)} <span class="muted" style="font-size:13px">${esc(t ? t.name : 'No team')} · ${fmtPts((st.D[x.id] || {}).points || 0)} pts</span>${x.active === false ? '<span class="pill-inactive">inactive</span>' : ''}</summary>
      <div class="body"><div class="fgrid">
        ${F.text('Full name', p + '.name', x.name, 'data-reload')}
        ${F.num('Car number', p + '.number', x.number, 'data-reload')}
        ${F.country('Country', p + '.country', x.country)}
        ${F.select('Team', p + '.teamId', x.teamId, teamOpts(d))}
        ${F.text('Gamertag / PSN / Steam', p + '.gamertag', x.gamertag)}
        ${F.num('Fantasy value (millions)', p + '.fantasyValue', x.fantasyValue, 'placeholder="auto"')}
        ${F.check('Active on the grid', p + '.active', x.active !== false)}
        ${F.check('Reserve driver (shows under Reserves, not a race seat)', p + '.reserve', !!x.reserve, 'data-reload')}
        ${F.image('Driver photo (driver cards, team page & profile)', p + '.photo', x.photo, 'drivers', 1400, 'driverPhoto')}
        ${F.image('Headshot for the small circles (optional — the photo is used if empty)', p + '.headshot', x.headshot, 'drivers', 500, 'headshot')}
        ${looksEditor(d, x, i, p)}
        ${F.area('Biography — shown on their profile (# headings, **bold**, - lists, [links](https://…))', p + '.bio', x.bio)}
        <div class="wide th-ed"><div class="fld"><span>Team history</span></div>
          ${F.check(`Work out this season's spells automatically from results`, p + '.autoHistory', x.autoHistory !== false)}
          ${x.autoHistory !== false ? (() => { const auto = LG.autoHistory(d, x).filter(h => h.auto); return `<div class="th-autobox">${auto.length ? `<b>Auto from results:</b> ${auto.map(h => `<span class="chip">${esc((byId(d.teams, h.teamId) || {}).name || h.teamId)} · R${esc(h.fromRound)} → ${h.toRound ? 'R' + esc(h.toRound) : 'Present'}</span>`).join(' ')}` : '<span class="muted">No race results yet this season.</span>'}<p class="hint" style="margin:6px 0 0">Wrong? Add a spell below to override it — your spell takes over the rounds it covers, and every other round stays automatic. Use the rows below for earlier seasons too.</p></div>`; })() : '<p class="hint">Only the spells below are shown.</p>'}
          ${(x.history || []).length ? `<div style="overflow-x:auto"><table class="rtable"><thead><tr><th>Team</th><th>Role</th><th>From season</th><th>Round</th><th>To season</th><th>Round</th><th></th></tr></thead><tbody>${(x.history || []).map((h, k) => `<tr>
            <td><select data-path="${p}.history.${k}.teamId" data-reload>${[['', '— other team (type) —'], ...d.teams.map(t => [t.id, t.name])].map(([v, l]) => opt(v, l, h.teamId)).join('')}</select>${h.teamId ? '' : `<input type="text" data-path="${p}.history.${k}.team" value="${esc(h.team || '')}" placeholder="Team name" style="margin-top:4px">`}</td>
            <td class="c-md"><select data-path="${p}.history.${k}.role">${[...LG.HIST_ROLES, ...(h.role && !LG.HIST_ROLES.includes(h.role) ? [h.role] : [])].map(r => `<option value="${esc(r)}" ${r === (h.role || 'Race Driver') ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select></td>
            <td class="c-sm">${combo(`${p}.history.${k}.fromSeason`, h.fromSeason || '', seasonOpts(d), 'Season')}</td>
            <td class="c-sm"><input type="number" data-num data-path="${p}.history.${k}.fromRound" value="${esc(h.fromRound ?? '')}" placeholder="1"></td>
            <td class="c-sm">${combo(`${p}.history.${k}.toSeason`, h.toSeason || '', seasonOpts(d), 'Current')}</td>
            <td class="c-sm"><input type="number" data-num data-path="${p}.history.${k}.toRound" value="${esc(h.toRound ?? '')}"></td>
            <td class="c-act"><button class="iconbtn del" data-act="th-del" data-i="${i}" data-k="${k}">✕</button></td></tr>`).join('')}</tbody></table></div>` : ''}
          <div class="toolbar" style="margin-top:8px"><button class="btn sm" data-act="th-add" data-i="${i}">+ Add team spell</button>${x.autoHistory === false ? `<button class="btn sm" data-act="th-auto" data-i="${i}">Fill from this season's results</button>` : ''}</div>
          
        </div>
      </div>
      <div class="item-actions"><a class="btn sm ghost" href="#/driver/${esc(x.id)}">View page</a><button class="btn sm danger" data-act="del-driver" data-i="${i}">Delete driver</button></div></div>
    </details>`;
  }).join('');
  const sorts = [['custom', 'My order'], ['number', 'Number'], ['name', 'Last name'], ['team', 'Team'], ['standings', 'Championship']];
  const bar = d.drivers.length > 1 ? `<div class="a-card drv-tools">
      <div class="drv-tools-row"><span class="muted">Sort</span><div class="tabs">${sorts.map(([k, l]) => `<button data-act="drv-sort" data-s="${k}" class="${ADS.sort === k ? 'active' : ''}">${l}</button>`).join('')}</div>
        ${!custom ? `<button class="btn sm" data-act="drv-save-order" title="Make this the saved order (used for ↑ ↓ and the public pages when set to My order)">Save as my order</button>` : ''}
        <span style="margin-left:auto;display:flex;gap:6px"><button class="btn sm ghost" data-act="drv-expand">Expand all</button><button class="btn sm ghost" data-act="drv-collapse">Collapse all</button></span></div>
      <div class="drv-tools-row"><input type="search" id="drv-q" placeholder="Search name, number, team, gamertag…" autocomplete="off" value="${esc(ADS.q || '')}">
        <select id="drv-team"><option value="">All teams</option>${d.teams.map(t => `<option value="${esc(t.id)}" ${ADS.team === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}<option value="-" ${ADS.team === '-' ? 'selected' : ''}>No team</option></select>
        <select id="drv-show">${[['all', 'Active & benched'], ['active', 'Active only'], ['benched', 'Benched only']].map(([k, l]) => `<option value="${k}" ${ADS.show === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
</div>
      ${!canMove ? `<p class="hint" style="margin:8px 0 0">↑ ↓ buttons show in <b>My order</b> with no filters.</p>` : ''}</div>` : '';
  return head('Drivers', 'Moving a driver to a new team only affects future results — past points stay with the team they scored them for. Untick "Active" to bench someone without losing their history.',
    `<button class="btn primary" data-act="add-driver">+ Add driver</button>`) + bar + `<div class="a-card" id="drv-list">${items || `<p class="muted">${d.drivers.length ? 'No drivers match.' : 'No drivers yet.'}</p>`}<p class="muted drv-none" hidden>No drivers match your search.</p></div>`;
}

function secTeams(d) {
  const items = d.teams.map((t, i) => {
    const key = 'team-' + t.id, p = `teams.${i}`;
    const drs = d.drivers.filter(x => x.teamId === t.id && x.active !== false).map(x => x.name).join(', ');
    return `<details class="item" data-key="${key}" ${A.open[key] ? 'open' : ''}>
      <summary>${mvBtns('teams', i, d.teams.length)}<span class="swatch" style="--tc:${esc(LG.teamColor(t))}"></span><b>${esc(t.name)}</b><span class="muted" style="font-size:13px">${esc(drs || 'No drivers')}</span></summary>
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
      ${linked ? '' : `<button class="btn xs" data-act="upload" data-mode="set" data-target="${path}.photo" data-folder="staff" data-max="${kind === 'reserve' || kind === 'academy' ? 1400 : 600}" data-spec="${kind === 'reserve' || kind === 'academy' ? 'driverPhoto' : 'headshot'}">⬆ Photo</button>${x.photo ? `<button class="btn xs" data-act="adjust" data-target="${path}.photo" data-folder="staff" data-spec="${kind === 'reserve' || kind === 'academy' ? 'driverPhoto' : 'headshot'}">✂ Adjust</button>` : ''}`}</div>
    <div class="prow-fields">
      ${kind === 'exec' ? F.text('Title', path + '.title', x.title || '', 'placeholder="Chief Executive Officer"') : ''}
      ${kind === 'reserve' || kind === 'academy' ? F.select('Driver from your roster', path + '.driverId', x.driverId, drvOpts) : ''}
      ${linked ? `<div class="hint" style="align-self:end;padding-bottom:10px">Uses ${esc((byId(d.drivers, x.driverId) || {}).name || 'that driver')}'s profile & photo.</div>` : `
        ${F.text('Name', path + '.name', x.name || '', 'data-reload')}
        ${F.country('Country', path + '.country', x.country || '')}
        ${kind === 'reserve' || kind === 'academy' ? F.num('Car number', path + '.number', x.number) : ''}
        ${kind === 'eng' ? F.select('Works with', path + '.driverId', x.driverId, drvOpts) : ''}
        ${F.text('Photo link (or use ⬆ Photo)', path + '.photo', x.photo || '', 'data-reload')}`}
    </div>
    ${del ? `<div class="prow-act">${del.len > 1 ? mvBtns(del.list, del.k, del.len) : ''}<button class="iconbtn del" data-act="del-person" data-list="${del.list}" data-k="${del.k}" title="Remove">✕</button></div>` : ''}
  </div>`;
}
const mvBtns = (list, k, len) => `<span class="mv-btns"><button class="iconbtn mv" data-act="reorder" data-list="${list}" data-k="${k}" data-dir="-1" title="Move up" ${k === 0 ? 'disabled' : ''}>↑</button><button class="iconbtn mv" data-act="reorder" data-list="${list}" data-k="${k}" data-dir="1" title="Move down" ${k >= len - 1 ? 'disabled' : ''}>↓</button></span>`;
const STAFF_LISTS = { race: ['Race engineers', 4, 'eng'], perf: ['Performance engineers', 4, 'eng'], reserves: ['Reserve drivers', 2, 'reserve'], academy: ['Academy driver', 1, 'academy'] };
function staffEditor(d, t, p) {
  const st = t.staff || {};
  const list = key => {
    const [label, max, kind] = STAFF_LISTS[key], arr = st[key] || [], lp = `${p}.staff.${key}`;
    return `<div class="staff-block"><div class="staff-h"><b>${label}</b><span class="muted">${arr.length}/${max}</span>${arr.length < max ? `<button class="btn xs" data-act="add-person" data-list="${lp}">+ Add</button>` : ''}</div>
      ${arr.map((x, k) => personRow(d, `${lp}.${k}`, x, kind, { list: lp, k, len: arr.length })).join('') || '<p class="hint" style="margin:0 0 6px">None yet.</p>'}</div>`;
  };
  return `<div class="staff-ed"><h4>Team personnel</h4><p class="hint" style="margin:-4px 0 12px">Shown as a "full team" section on the team page. Leave anything empty to hide it.</p>
    <div class="staff-block"><div class="staff-h"><b>Executive / team manager</b><span class="muted">title is up to you</span></div>${personRow(d, `${p}.staff.exec`, st.exec, 'exec')}</div>
    <div class="staff-block"><div class="staff-h"><b>Team Principal</b></div>${personRow(d, `${p}.staff.principal`, st.principal || (t.principal ? { name: t.principal } : {}), 'principal')}</div>
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
        ${F.country('Country', p + '.country', r.country)}
        ${F.dt('Race start (your local time)', p + '.start', r.start)}
        ${F.select('Track time zone', p + '.tz', r.tz || '', TZ_OPTS)}
        ${F.num('Laps', p + '.laps', r.laps)}
        ${F.check('Sprint weekend', p + '.sprint', r.sprint)}
        ${F.check('Cancelled', p + '.cancelled', r.cancelled)}
        ${F.area('Round notes (shown under results)', p + '.notes', r.notes)}
        <div class="wide"><div class="fld"><span>Weekend schedule (shown on the round page; leave empty to just show the race start)</span></div>
          ${(r.sessions || []).length ? `<table class="rtable sess"><thead><tr><th>Session</th><th>Start (your local time)</th><th>End (optional)</th><th></th></tr></thead><tbody>${(r.sessions || []).map((x, k) => `<tr>
            <td>${combo(`${p}.sessions.${k}.name`, x.name || '', LG.SESSION_PRESETS, 'Session')}</td>
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
    `<div class="a-card">${items || '<p class="muted">No rounds yet.</p>'}</div>`;
}

function secResults(d) {
  const rs = LG.rounds(d);
  if (!rs.length) return head('Results', '') + `<div class="a-card"><p class="muted">Add some rounds to the calendar first.</p></div>`;
  if (!A.roundId || !byId(d.calendar, A.roundId)) A.roundId = (LG.nextRound(d) || rs[rs.length - 1]).id;
  const r = byId(d.calendar, A.roundId);
  const sess = A.session;
  const list = (d.results[r.id] && d.results[r.id][sess]) || [];
  const isQ = sess === 'quali' || sess === 'sprintQuali';
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
      ${isQ ? '' : `<td class="c-md"><input type="text" class="${e.fastestLap ? 'fl-time' : ''}" data-path="${p}.bestLap" value="${esc(e.bestLap || '')}" placeholder="1:31.456"></td>`}
      ${isQ ? '' : `<td class="c-ty"><input type="text" data-path="${p}.tyres" data-reload value="${esc(Array.isArray(e.tyres) ? e.tyres.map(t => t.c + (t.laps || '')).join(' ') : e.tyres || '')}" placeholder="S12 M45"><span class="ty-prev">${LG.parseTyres(e.tyres).map(t => LG.tyreChip(t.c, 1)).join('')}</span></td>`}
      ${isQ ? '' : `<td class="c-chk"><input type="checkbox" data-act="flag" data-flag="fastestLap" data-i="${i}" ${e.fastestLap ? 'checked' : ''} title="Fastest lap"></td>`}
      ${sess === 'race' ? `<td class="c-chk"><input type="checkbox" data-act="flag" data-flag="pole" data-i="${i}" ${e.pole ? 'checked' : ''} title="Pole position"></td>` : ''}
      ${isQ ? '' : `<td class="c-sm"><input type="number" step="any" data-num data-path="${p}.pointsOverride" data-reload value="${esc(e.pointsOverride ?? '')}" placeholder="auto"></td><td class="c-pts">${fmtPts(c.pts || 0)}</td>`}
      <td class="c-act"><button class="iconbtn" data-act="move" data-i="${i}" data-dir="-1" title="Move up">↑</button> <button class="iconbtn" data-act="move" data-i="${i}" data-dir="1" title="Move down">↓</button> <button class="iconbtn del" data-act="del-entry" data-i="${i}" title="Remove">✕</button></td>
    </tr>`;
  }).join('');

  const sessions = [['race', 'Race'], ['sprint', 'Sprint'], ...(r.sprint || ((d.results[r.id] || {}).sprintQuali || []).length || sess === 'sprintQuali' ? [['sprintQuali', 'Sprint Qualifying']] : []), ['quali', 'Qualifying']];
  return head('Results', 'Put drivers in finishing order (top = winner). Set DNF/DSQ/DNS/NS (no show) for non-finishers — they score nothing and drop to the bottom automatically. Points are calculated from your scoring system; type a number in <b>Override</b> only for special cases.') + `
    <div class="a-card">
      <div class="toolbar" style="justify-content:space-between">
        <label class="fld" style="min-width:260px"><span>Round</span><select data-ctl="round">${rs.map(x => opt(x.id, `R${x.round} · ${x.name}${LG.isDone(d, x) ? ' ✓' : ''}`, r.id)).join('')}</select></label>
        <div class="tabs" style="margin:0">${sessions.map(([k, l]) => `<button data-act="session" data-s="${k}" class="${k === sess ? 'active' : ''}">${l}${((d.results[r.id] || {})[k] || []).length ? ' ✓' : ''}</button>`).join('')}</div>
      </div>
      ${sess === 'sprint' && !r.sprint ? '<p class="hint">This round isn\'t marked as a sprint weekend — results entered here still count. Tick "Sprint weekend" in the calendar to show the badge.</p>' : ''}
      ${!isQ ? '<p class="hint"><b>Tyres:</b> type the compounds in order with optional stint laps — <code>S12 M45</code>, <code>M H</code>, <code>S M S</code>. S soft · M medium · H hard · I inter · W wet. Shown in the "Detailed · tyres" view on the results page.</p>' : ''}
      ${sess === 'quali' ? '<p class="hint">Qualifying order sets the pole sitter (P1) unless you tick a pole box in the race session. Qualifying itself scores no points.</p>' : sess === 'sprintQuali' ? '<p class="hint">Sprint Qualifying sets the Sprint grid — use <b>Copy sprint qualifying order</b> on the Sprint tab. It scores no points.</p>' : ''}
    </div>
    <div class="a-card" style="overflow-x:auto">
      ${list.length ? `<table class="rtable"><thead><tr><th>Pos</th><th>Driver</th><th>Team</th><th>Status</th>${isQ ? '' : '<th>Laps</th>'}<th>${isQ ? 'Lap time' : 'Time / gap'}</th>${isQ ? '' : '<th title="Each driver\'s best lap time — the fastest one can be ticked as FL automatically">Best lap</th>'}${isQ ? '' : '<th title="Compounds in order, laps optional: S12 M45 · S M H · I W">Tyres</th>'}${isQ ? '' : '<th>FL</th>'}${sess === 'race' ? '<th>Pole</th>' : ''}${isQ ? '' : '<th>Override</th><th>Pts</th>'}<th></th></tr></thead><tbody>${rows}</tbody></table>`
        : `<p class="muted">No ${sess === 'quali' ? 'qualifying' : sess === 'sprintQuali' ? 'sprint qualifying' : sess} results for this round yet.</p>`}
      <div class="toolbar" style="margin-top:16px">
        ${avail.length ? `<select id="add-entry-sel" style="max-width:260px">${avail.map(x => opt(x.id, `${x.name}${x.active === false ? ' (inactive)' : ''}`, '')).join('')}</select><button class="btn sm" data-act="add-entry">+ Add driver</button>` : ''}
        <button class="btn sm" data-act="fill-all">Add all active drivers</button>
        <button class="btn sm" data-act="ns-rest" title="Adds every active race driver who isn't in this session yet, marked NS (no show)">NS rest of grid</button>
        ${!isQ && list.length ? '<button class="btn sm" data-act="fl-auto" title="Ticks FL for the quickest best lap">⏱ Set fastest lap from best laps</button>' : ''}
        ${sess === 'race' && ((d.results[r.id] || {}).quali || []).length ? '<button class="btn sm" data-act="copy-quali" data-from="quali">Copy qualifying order</button>' : ''}${sess === 'sprint' && ((d.results[r.id] || {}).sprintQuali || []).length ? '<button class="btn sm" data-act="copy-quali" data-from="sprintQuali">Copy sprint qualifying order</button>' : ''}${sess === 'sprint' && !((d.results[r.id] || {}).sprintQuali || []).length && ((d.results[r.id] || {}).quali || []).length ? '<button class="btn sm" data-act="copy-quali" data-from="quali">Copy qualifying order</button>' : ''}
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
    <p class="hint">Points given in <a href="#/admin/stewards">${esc(LG.rcName(d))} reports</a> are applied automatically and don't need repeating here.</p>
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
  if (!ls.get(K.token) && TEAMKEY.key) { const k = TEAMKEY.key; c = { owner: k.owner || c.owner, repo: k.repo || c.repo, branch: k.branch || c.branch, path: k.path || c.path }; }
  return Object.assign({ owner: '', repo: '', branch: 'main', path: 'data/league.json' }, c);
}
const ghToken = () => ls.get(K.token) || (TEAMKEY.key && TEAMKEY.key.token) || '';
function secPublish(d) {
  const c = ghCfg(), hasTok = !!ls.get(K.token);
  return head('Publish & backup', 'Publishing commits your draft to <code>data/league.json</code> in your GitHub repo. GitHub Pages rebuilds the site in about a minute.') + `
    ${LG.S.isDraft ? `<div class="warn">You have unpublished changes${LG.S.draftStale ? ' — and the live site was updated since you started this draft (maybe from another device). Publishing will overwrite it.' : '.'}</div>` : '<div class="ok-note">Everything is published. The live site matches this console.</div>'}
    <div class="a-card"><h3>Publish</h3><div class="toolbar"><button class="btn primary" data-act="publish" ${LG.S.isDraft ? '' : 'disabled'}>⇪ Publish changes</button>${LG.S.isDraft ? '<button class="btn danger" data-act="discard-draft">Discard draft</button>' : ''}<button class="btn" data-act="reload-live">Reload live data</button></div>
      ${d.meta.updated ? `<p class="hint">Last published: ${new Date(d.meta.updated).toLocaleString()}</p>` : ''}</div>
    ${!ls.get(K.token) && team() && !team().owner ? `<div class="a-card"><h3>Publishing access</h3>${TEAMKEY.key ? `<div class="ok-note">You publish with the league's shared key (set up by the owner). Every publish is logged under your name.</div>` : TEAMKEY.loading ? '<p class="muted">Fetching the team key…</p>' : '<div class="warn">The league owner hasn\'t shared a publishing key yet, so you can edit but not publish.</div>'}</div>` : ''}
    ${limited() ? '' : `<div class="a-card"><h3>GitHub connection</h3>
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
    </div>`}
    <div class="a-card"><h3>Backup & restore</h3><div class="toolbar">
      <button class="btn sm" data-act="download">⬇ Download league.json</button>
      ${limited() ? '' : `<label class="btn sm">⬆ Import league.json<input type="file" accept=".json,application/json" data-ctl="import" hidden></label>`}
    </div><p class="hint">Download a backup before big changes. Importing replaces your draft (nothing goes live until you publish).</p></div>
    ${allowed('seasons') ? `<div class="a-card"><h3>New season</h3><p class="hint" style="margin:-6px 0 12px">Archive this season and start the next one from <b>Seasons</b>.</p>
      <a class="btn sm" href="#/admin/seasons">Go to Seasons →</a></div>` : ''}`;
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
function musicCard(d) {
  const m = d.music = Object.assign({ enabled: false, tracks: [], volume: 35, shuffle: false, autoplay: true, loop: true, label: 'Now playing' }, d.music || {});
  const badLink = u => /youtu\.?be|spotify\.com|soundcloud\.com|drive\.google|docs\.google|dropbox\.com\/(?!.*dl=1)|cdn\.discordapp|media\.discordapp|apple\.com/i.test(u || '');
  return `<div class="a-card"><h3>♪ Background music</h3>
    <div class="fgrid">
      ${F.check('Play background music on the site', 'music.enabled', m.enabled)}
      ${F.check('Start automatically (on the visitor’s first click/tap)', 'music.autoplay', m.autoplay !== false)}
      ${F.check('Loop forever (one track repeats; several tracks repeat as a playlist)', 'music.loop', m.loop !== false)}
      ${F.check('Shuffle the playlist', 'music.shuffle', m.shuffle)}
      ${F.num('Starting volume (0–100)', 'music.volume', m.volume, 'min="0" max="100" data-reload')}
      ${F.text('Player heading', 'music.label', m.label || 'Now playing')}
    </div>
    <div class="mu-tracks">${m.tracks.map((t, k) => `<div class="mu-trow"><span class="mono muted">${k + 1}</span>
        <input type="text" data-path="music.tracks.${k}.title" value="${esc(t.title || '')}" placeholder="Track title">
        <input type="text" data-path="music.tracks.${k}.src" data-reload value="${esc(t.src || '')}" placeholder="Upload an MP3, or paste a direct link to one">
        <button class="btn sm" data-act="upload" data-mode="set" data-target="music.tracks.${k}.src" data-folder="music" data-accept="audio/*">⬆ Upload</button>
        ${t.src ? `<audio controls preload="none" src="${esc(LG.asset(t.src))}"></audio>` : ''}
        <button class="iconbtn" data-act="mu-move" data-i="${k}" data-dir="-1" title="Move up">↑</button><button class="iconbtn del" data-act="mu-del" data-i="${k}" title="Remove">✕</button>
        ${badLink(t.src) ? '<p class="warn mu-warn">This link won’t play for visitors — it’s a page or a link that expires (YouTube, Spotify, Google Drive, Discord…), not an audio file. Download the MP3 and use <b>⬆ Upload</b> instead.</p>' : ''}</div>`).join('') || '<p class="muted">No tracks yet.</p>'}</div>
    <div class="toolbar" style="margin-top:10px"><button class="btn sm" data-act="mu-add">+ Add track</button></div>
    <p class="hint"><b>Press Publish after adding tracks</b> — until then the music only plays in your browser. Visitors get a small ♪ button (bottom-left) to pause, skip, change the volume or mute — their choice is remembered on their device. Browsers don't allow sound until a visitor clicks or taps, so music starts on their first interaction. Use MP3s under 10 MB, and only music you have the rights to use (royalty-free or your own).</p>
  </div>`;
}
function secTheme(d) {
  const t = d.theme;
  const sw = (k, p) => `<button class="theme-swatch" data-act="theme-preset" data-k="${esc(k)}" style="--a:${p.accent};--b:${p.bgDark};--c:${p.highlight};--l:${p.bgLight}"><span class="ts-prev"><i></i><i></i><i></i></span>${esc(k)}</button>`;
  return head('Look & theme', 'Recolour the whole site. Changes preview instantly here and on the public pages in this browser — publish to make them live for everyone.', '<button class="btn" data-act="theme-reset">Reset to Miku classic</button>') + `
    ${LG.S.isDraft ? '<div class="warn">These changes are only showing <b>in your browser</b> right now. Press <b>Publish</b> to apply them for everyone.</div>' : '<div class="ok-note">The look you see here is what every visitor sees.</div>'}
    ${musicCard(d)}
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
      ${F.select('Drivers & Teams page order', 'theme.listOrder', t.listOrder || 'standings', [['standings', 'Championship position'], ['custom', 'My order (set with ↑ ↓ in Drivers / Constructors)']])}
      ${F.select('Hall of Fame style', 'theme.hofStyle', t.hofStyle || 'sakura', [['sakura', '🌸 Sakura night (cherry blossoms)'], ['classic', '🏆 Classic gold']])}
      ${F.select('Driver team history style', 'theme.historyStyle', t.historyStyle || 'timeline', [['timeline', 'Timeline (dots & line)'], ['strip', 'Career strip (coloured bar + list)'], ['cards', 'Team cards (logos & round count)']])}
      ${F.image('Logo on the clock widget (your league logo is used if empty — or use a real sponsor of yours)', 'theme.timingLogo', t.timingLogo === 'none' ? '' : t.timingLogo, 'branding', 400, 'clockLogo')}
    </div><p class="hint">A visitor's ☀/☾ choice is remembered in their browser — until you change the default mode, which resets everyone to your new default. <button class="btn xs" data-act="clear-mode">Forget my choice</button></p></div>
    <div class="a-card"><h3>Preview</h3><div class="toolbar"><span class="btn primary">Primary</span><span class="btn">Button</span><span class="badge next">Next race</span><span class="badge sprint">Sprint</span><span class="tag-fl">FL</span><span class="tag-pole">POLE</span><span class="cell p1">1</span><span class="cell pts">6</span><span class="cell nopts">14</span><span class="cell dnf">DNF</span></div>
      <p class="hint">Tip: use the ☀ / ☾ button in the top bar to check both modes.</p></div>`;
}

/* ---------------- stewards ---------------- */
const SD_STATUS = ['Under investigation', 'No further action', 'Reprimand', 'Warning', 'Penalty'];
const WH_KEY = 'league.discord.webhook';
function fiaAnnouncements(d) {
  const list = (d.fiaNews = d.fiaNews || []);
  const rs = LG.rounds(d);
  const order = [...list.keys()].sort((a, b) => String(list[b].date || '').localeCompare(String(list[a].date || '')));
  const hook = ls.get(WH_KEY) || '';
  return `<div class="a-card"><div class="card-title" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h3 style="margin:0">Announcements</h3><button class="btn sm primary" data-act="add-fia">+ New announcement</button></div>
    <p class="hint" style="margin:-4px 0 12px">The 3 newest show on the home page under "Latest from the ${esc(LG.rcName(d))}" with a link to all of them.</p>
    ${order.map(i => { const x = list[i], key = 'fia-' + x.id, pp = `fiaNews.${i}`; return `<details class="item" data-key="${key}" ${A.open[key] ? 'open' : ''}>
      <summary><span class="chip">${esc((x.category || 'notice'))}</span><b>${esc(x.title || 'Untitled')}</b><span class="muted" style="font-size:13px">${x.date ? LG.fmtDate(x.date) : ''}</span>${x.pinned ? '📌' : ''}${x.posted ? '<span class="pill-inactive">sent to Discord</span>' : ''}${x.hidden ? '<span class="pill-inactive">hidden</span>' : ''}</summary>
      <div class="body"><div class="fgrid">
        ${F.text('Title', pp + '.title', x.title, 'wide data-reload')}
        ${F.dt('Date & time', pp + '.date', x.date)}
        ${F.select('Category', pp + '.category', x.category || 'notice', [['notice', 'Notice'], ['document', 'Document'], ['penalty', 'Penalty'], ['schedule', 'Schedule'], ['regulation', 'Regulation']])}
        ${F.select('Round (optional)', pp + '.roundId', x.roundId || '', [['', '— none —'], ...rs.map(r => [r.id, 'R' + r.round + ' ' + r.name])])}
        ${F.check('Pin to top', pp + '.pinned', x.pinned)}
        ${F.check('Hidden', pp + '.hidden', x.hidden)}
        ${F.area('Announcement — you can paste straight from Discord', pp + '.body', x.body || '', 'tall')}
        <div class="wide"><div class="doc-list">${(x.docs || []).map((u, k) => `<div class="doc-item">${LG.isImg(u) ? `<img src="${esc(LG.asset(u))}" alt="">` : '<span class="doc-ic">📄</span>'}<span class="mono">${esc(String(u).split('/').pop())}</span><button class="iconbtn del" data-act="del-fia-doc" data-i="${i}" data-k="${k}">✕</button></div>`).join('')}</div>
          <button class="btn sm" data-act="upload" data-mode="push" data-target="${pp}.docs" data-folder="fia" data-max="2600" data-multiple="1" data-accept="image/*,application/pdf">⬆ Attach document(s)</button></div>
      </div>
      <div class="item-actions">${hook ? `<button class="btn sm" data-act="post-fia" data-i="${i}">${x.posted ? '↻ Send to Discord again' : '➤ Send to Discord'}</button>` : ''}<a class="btn sm ghost" href="#/fia/announcements">View</a><button class="btn sm danger" data-act="del-fia" data-i="${i}">Delete</button></div></div>
    </details>`; }).join('') || '<p class="muted">No announcements yet.</p>'}
  </div>
  <div class="a-card"><h3>Discord connection</h3>
    <div class="fgrid">
      <label class="fld wide"><span>Webhook for your ${esc(LG.rcName(d))} channel — lets you send announcements to Discord from here (saved in this browser only)</span><input type="password" id="wh-url" value="${esc(hook)}" placeholder="https://discord.com/api/webhooks/…" autocomplete="off"></label>
    </div>
    <div class="toolbar" style="margin-top:10px"><button class="btn sm" data-act="save-wh">Save webhook</button>${hook ? '<button class="btn sm" data-act="test-wh">Send test message</button><button class="btn sm danger" data-act="forget-wh">Forget</button>' : ''}</div>
    <p class="hint">Discord → your ${esc(LG.rcName(d))} channel → ⚙ Edit channel → Integrations → Webhooks → New webhook → Copy URL. Keep it private: anyone with it can post in that channel.</p>
    <div class="fgrid" style="margin-top:14px">
      ${F.text('Discord server ID (optional live feed)', 'fiaFeed.server', (d.fiaFeed || {}).server || '', 'placeholder="123456789012345678"')}
      ${F.text(LG.rcName(d) + ' channel ID', 'fiaFeed.channel', (d.fiaFeed || {}).channel || '', 'placeholder="123456789012345678"')}
    </div>
    <p class="hint">Optional: shows the real Discord channel live on the ${esc(LG.rcName(d))} page ("Live from Discord" tab). It uses the free <a href="https://widgetbot.io" target="_blank" rel="noopener">WidgetBot</a> service — add their bot to your server first. Get IDs by turning on Discord → Settings → Advanced → Developer Mode, then right-click the server / channel → Copy ID.</p>
  </div>`;
}
async function postToDiscord(x, d) {
  const hook = ls.get(WH_KEY); if (!hook) return toast('Save a Discord webhook first', 'err');
  const colors = { notice: 0x39c5bb, document: 0x9aa5ff, penalty: 0xe12885, schedule: 0xf3d27a, regulation: 0x86cecb };
  const site = location.href.split('#')[0];
  const files = (x.docs || []).filter(u => !/^https?:/.test(u)).map(u => site + u).concat((x.docs || []).filter(u => /^https?:/.test(u)));
  const img = files.find(u => LG.isImg(u));
  const body = { username: LG.rcName(d), embeds: [{ title: x.title, url: site + '#/fia/announcements', description: String(x.body || '').slice(0, 3900) + (files.filter(u => !LG.isImg(u)).length ? '\n\n' + files.filter(u => !LG.isImg(u)).map(u => `📄 ${u}`).join('\n') : ''), color: colors[x.category] || colors.notice, timestamp: x.date || new Date().toISOString(), footer: { text: d.league.name } }] };
  if (img) body.embeds[0].image = { url: img };
  try {
    const r = await fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(r.status + ' ' + (await r.text()).slice(0, 120));
    return true;
  } catch (err) { toast('Discord refused it: ' + err.message, 'err'); return false; }
}

/* ---------------- predictions ---------------- */
const PRA = { rounds: null, all: null, loading: false, err: '' };
window.addEventListener('hashchange', () => { if (/^#\/admin\/predictions/.test(location.hash) && !PRA.loading) { PRA.rounds = null; PRA.synced = false; setTimeout(rerender, 0); } });
function secPredictions(d) {
  const PR = window.Predictions, s = teamStore(), C = d.predictions, now = Date.now(), fmt = t => t ? `${LG.fmtDate(t)} · ${LG.fmtTime(t)}` : '—';
  const top = head('Predictions', 'Fans predict the podium, fastest lap and pole for each round. With the automatic schedule on, rounds open and close by themselves (set the timing under Schedule). Points are worked out from your results.', '<a class="btn" href="#/predictions">View page</a>');
  const SC = C.schedule = Object.assign({ auto: true, openDays: 3, openTime: '', closeOn: 'quali', closeMins: 0 }, C.schedule || {});
  const nx = LG.nextRound(d), ex = nx ? `e.g. ${esc(nx.name)}: opens ${fmt(PR.openFor(nx, d))}, closes ${fmt(PR.lockFor(nx, d))}` : '';
  const schedCard = `<div class="a-card"><h3>Schedule</h3>
    <div class="fgrid">${F.check('Open and close every round automatically', 'predictions.schedule.auto', SC.auto !== false)}</div>
    <div class="fgrid">${F.num('Opens — days before it closes', 'predictions.schedule.openDays', SC.openDays)}<label class="fld"><span>…at this time of day (optional, your time)</span><input type="time" data-path="predictions.schedule.openTime" value="${esc(SC.openTime || '')}"></label>
      ${F.select('Closes at', 'predictions.schedule.closeOn', SC.closeOn || 'quali', [['quali', 'Start of Qualifying'], ['race', 'Start of the race']])}${F.num('…minus minutes (0 = right at the start)', 'predictions.schedule.closeMins', SC.closeMins)}</div>
    <p class="hint">${ex}. Qualifying time comes from the round's weekend schedule (falls back to the race start). The schedule is sent to Firebase when you open this page or press <b>Sync now</b> — do that after changing the calendar or these settings (and Publish).</p>
    <div class="toolbar"><button class="btn sm" data-act="pr-sync">⟳ Sync now</button></div></div>`;
  const settings = schedCard + `<div class="a-card"><h3>Settings</h3><div class="fgrid">${F.check('Predictions page is on (shows in More)', 'predictions.enabled', !!C.enabled)}</div>
    <div class="fgrid">${F.num('Exact podium spot', 'predictions.points.exact', C.points.exact)}${F.num('Right driver, wrong spot', 'predictions.points.podium', C.points.podium)}${F.num('Fastest lap', 'predictions.points.fl', C.points.fl)}${F.num('Pole', 'predictions.points.pole', C.points.pole)}</div>
    <div class="fgrid">${F.area('Intro text (optional)', 'predictions.intro', C.intro || '')}</div><p class="hint">Publish after changing these.</p></div>`;
  if (!s) return top + `<div class="warn">Predictions use the same Firebase project as Grid Draft. Finish the setup in <a href="#/admin/griddraft">Grid Draft</a> first, then re-copy the rules.</div>` + settings;
  if (!s.ready) return top + '<p class="muted">Connecting…</p>' + settings;
  if (!s.user) return top + `<div class="a-card"><p>Sign in with your admin Google account to open rounds.</p><button class="btn primary" data-team="signin">Sign in with Google</button></div>` + settings;
  if (PRA.rounds === null && !PRA.loading) {
    PRA.loading = true;
    Promise.all([s.predRounds(), s.allPreds()]).then(([r, a]) => { PRA.rounds = r; PRA.all = a; PRA.err = ''; })
      .catch(e => { PRA.rounds = {}; PRA.all = []; PRA.err = (e.code || e.message) + (/permission/.test(e.code || e.message) ? ' — re-copy the security rules from Grid Draft ③ into Firebase (they now include predictions).' : ''); })
      .finally(() => { PRA.loading = false; rerender(); });
  }
  const rs = LG.rounds(d).filter(r => !r.cancelled);
  if (PRA.rounds && !PRA.synced && C.schedule.auto !== false) { PRA.synced = true; prSync(d, s, true); }
  const rows = rs.map(r => {
    const R = (PRA.rounds || {})[r.id], auto = PR.lockFor(r, d), lock = (R && R.lockAt) || auto, opens = (R && R.openAt) || PR.openFor(r, d), n = (PRA.all || []).filter(p => p.roundId === r.id).length;
    const st = !R || !R.open ? (LG.isDone(d, r) ? '<span class="muted">—</span>' : '<span class="chip">Not open</span>') : lock <= now ? '<span class="chip">🔒 Locked</span>' : opens > now ? '<span class="chip">⏳ Scheduled</span>' : '<span class="chip on">● Open</span>';
    const act = !R || !R.open
      ? (!LG.isDone(d, r) && auto > now ? `<button class="btn xs primary" data-act="pr-open" data-r="${esc(r.id)}">Open</button>` : !auto ? '<span class="hint" style="margin:0">Set a start time</span>' : '')
      : `${lock > now ? `<button class="btn xs" data-act="pr-lock" data-r="${esc(r.id)}">Lock now</button>` : ''}${lock !== auto && auto > now ? `<button class="btn xs" data-act="pr-open" data-r="${esc(r.id)}" title="Use the session time again">Reset lock time</button>` : ''}<button class="btn xs ghost" data-act="pr-hide" data-r="${esc(r.id)}">Hide</button>`;
    return `<tr><td class="mono">R${esc(r.round)}</td><td>${esc(r.name)}${R && R.manual ? ' <span class="chip" title="Set by hand — the automatic schedule leaves it alone">manual</span>' : ''}</td><td class="mono" style="font-size:13px">${esc(fmt(opens))}</td><td class="mono" style="font-size:13px">${esc(fmt(lock))}</td><td>${st}</td><td class="r mono">${n}</td><td style="white-space:nowrap">${act}</td></tr>`;
  }).join('');
  return top + (PRA.err ? `<div class="warn">${esc(PRA.err)}</div>` : '') + `<div class="a-card" style="overflow-x:auto"><div class="card-title" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><h3 style="margin:0">Rounds</h3><button class="btn sm" data-act="pr-reload">Refresh</button></div>
    ${PRA.rounds === null ? '<p class="muted">Loading…</p>' : `<table class="rtable"><thead><tr><th>Rnd</th><th>Grand Prix</th><th>Opens</th><th>Closes</th><th>Status</th><th class="r">Entries</th><th></th></tr></thead><tbody>${rows}</tbody></table>`}
    <p class="hint">With the automatic schedule on, every upcoming round is scheduled for you. <b>Open</b> / <b>Lock now</b> / <b>Hide</b> override one round by hand (marked <i>manual</i>); <b>Open</b> on a manual round puts it back on the schedule.</p></div>` + settings;
}

async function prSync(d, s, quiet) {
  const PR = window.Predictions, now = Date.now(); let n = 0;
  try {
    for (const r of LG.rounds(d).filter(x => !x.cancelled && !LG.isDone(d, x))) {
      const lock = PR.lockFor(r, d), open = PR.openFor(r, d); if (!lock || lock <= now) continue;
      const cur = (PRA.rounds || {})[r.id]; if (cur && cur.manual) continue;
      if (cur && cur.open && cur.lockAt === lock && cur.openAt === open) continue;
      await s.setPredRound(r.id, { open: true, lockAt: lock, openAt: open }); PRA.rounds[r.id] = { open: true, lockAt: lock, openAt: open }; n++;
    }
    if (n || !quiet) toast(n ? `Schedule synced — ${n} round${n === 1 ? '' : 's'} updated` : 'Schedule is up to date');
  } catch (e) { toast('Could not sync: ' + (e.code || e.message) + (/permission/.test(e.code || e.message) ? ' — re-copy the rules from Grid Draft ③' : ''), 'err'); }
  rerender();
}

/* ---------------- applications ---------------- */
const APA = { list: null, loading: false, err: '', filter: 'pending', hook: undefined, form: '' };
window.addEventListener('hashchange', () => { if (/^#\/admin\/applications/.test(location.hash) && !APA.loading) { APA.list = null; APA.hook = undefined; setTimeout(rerender, 0); } });
function secApplications(d) {
  const Apps = window.Apps, s = teamStore();
  const top = head('Applications', 'Build application forms people fill in on the site. New applications are posted to your Discord channel; you approve, waitlist or deny them here, approved people sign a contract on the site, and you confirm them. Applicants follow every step on the Join the league page → My applications.', `<a class="btn" href="#/apply">View public page</a>`);
  const forms = d.applications.forms;
  const qRow = (fi, q, k, n) => {
    const p = `applications.forms.${fi}.questions.${k}`;
    return `<div class="ap-q">
      <div class="fgrid">${F.text('Question', `${p}.label`, q.label || '')}${F.select('Type', `${p}.type`, q.type || 'short', Apps.Q_TYPES)}
        ${F.text('Help text (optional)', `${p}.help`, q.help || '')}
        ${q.type === 'number' ? F.num('Max digits (blank = no limit)', `${p}.maxDigits`, q.maxDigits ?? '', 'min="1" max="12" step="1" placeholder="e.g. 2"') : ''}
        ${q.type === 'short' ? F.num('Max characters (blank = no limit)', `${p}.maxLen`, q.maxLen ?? '', 'min="1" max="1000" step="1"') : ''}
        ${['choice', 'multi'].includes(q.type) ? `<label class="fld wide"><span>Options — one per line</span><textarea data-path="${p}.options" data-lines rows="${Math.max(3, (q.options || []).length + 1)}">${esc((q.options || []).join('\n'))}</textarea></label>` : ''}
        ${F.check('Required', `${p}.required`, !!q.required)}</div>
      <div class="prow-act">${mvBtns(`applications.forms.${fi}.questions`, k, n)}<button class="iconbtn del" data-act="apq-del" data-i="${fi}" data-k="${k}" title="Remove question">✕</button></div></div>`;
  };
  const formsHTML = forms.map((f, fi) => {
    const key = 'apf-' + f.id;
    return `<details class="item" data-key="${key}" ${A.open[key] ? 'open' : ''}>
      <summary>${mvBtns('applications.forms', fi, forms.length)}<b>${esc(f.title || 'Untitled form')}</b><span class="chip ${f.open ? 'on' : ''}">${f.open ? '● Open' : 'Closed'}</span><span class="muted" style="font-size:13px">${(f.questions || []).length} questions</span></summary>
      <div class="body">
        <div class="fgrid">${F.text('Form title', `applications.forms.${fi}.title`, f.title || '')}${F.check('Open — people can apply', `applications.forms.${fi}.open`, !!f.open)}</div>
        <div class="fgrid">${F.area('Description (shown above the form)', `applications.forms.${fi}.description`, f.description || '')}</div>
        <div class="fgrid">${F.text('First question (always asked — used as the applicant\'s name in review & Discord)', `applications.forms.${fi}.nameLabel`, f.nameLabel || '', 'placeholder="Your name / nickname"')}${F.text('Its help text (optional)', `applications.forms.${fi}.nameHelp`, f.nameHelp || '', 'placeholder="Shown to the admins and in Discord"')}</div>
        <div class="fgrid">${F.select('After approval', `applications.forms.${fi}.contract`, f.contract || 'league', [['league', 'Send the league contract to sign'], ['custom', 'Send a custom contract for this form'], ['none', 'No contract — accepting is final']])}</div>
        ${f.contract === 'custom' ? `<div class="fgrid">${F.text('Contract title', `applications.forms.${fi}.contractTitle`, f.contractTitle || '', 'placeholder="e.g. Team staff agreement"')}${F.area('Custom terms for this form (Markdown: # headings, **bold**, lists)', `applications.forms.${fi}.contractTerms`, f.contractTerms || '', 'ct-area')}</div>` : ''}
        <p class="hint">Link to this form: <code>#/apply/${esc(f.id)}</code></p>
        <h4 style="margin:14px 0 6px">Questions</h4>
        ${(f.questions || []).map((q, k) => qRow(fi, q, k, f.questions.length)).join('') || '<p class="muted">No questions yet.</p>'}
        <div class="toolbar" style="margin-top:10px"><button class="btn sm" data-act="apq-add" data-i="${fi}">+ Add question</button><button class="btn sm danger" data-act="apf-del" data-i="${fi}" style="margin-left:auto">Delete form</button></div>
      </div></details>`;
  }).join('');
  const C = d.applications.contract = Object.assign({ enabled: false, title: 'Terms & Conditions', terms: '', agree: '' }, d.applications.contract || {});
  const contractCard = `<div class="a-card"><h3>Contract (step 2)</h3>
    <p class="hint" style="margin-top:-4px">When this is on, approving an application sends the applicant a contract. They read it, tick “I agree” and type their name to sign on the site; it comes back to you under <b>Contracts</b> to confirm. Forms can use this contract, their own, or none (set on each form).</p>
    <div class="fgrid">${F.check('Send this contract after approval', 'applications.contract.enabled', !!C.enabled)}${F.text('Contract title', 'applications.contract.title', C.title || '')}</div>
    <div class="fgrid">${F.area('Terms & Conditions (Markdown: # headings, **bold**, - lists)', 'applications.contract.terms', C.terms || '', 'ct-area')}</div>
    <div class="fgrid">${F.text('“I agree” checkbox text', 'applications.contract.agree', C.agree || '', 'wide placeholder="I have read, understood and agree to the Terms & Conditions above."')}</div>
    ${C.enabled && !String(C.terms || '').trim() ? '<div class="warn">Add your terms above — without them, approving accepts people straight away.</div>' : ''}
    <p class="hint">Publish after changing it. Each signed contract keeps a copy of the exact terms they agreed to.</p></div>`;
  const builder = contractCard + `<div class="a-card"><h3>Forms</h3>${formsHTML || '<p class="muted">No forms yet — start from a template.</p>'}
    <div class="toolbar" style="margin-top:12px"><span class="hint" style="margin:0">New form:</span>${Object.entries(Apps.TEMPLATES).map(([k, t]) => `<button class="btn sm" data-act="apf-add" data-tpl="${k}">+ ${esc(t.title)}</button>`).join('')}<button class="btn sm ghost" data-act="apf-add" data-tpl="blank">+ Blank form</button></div>
    <p class="hint">Forms are part of your site — <b>Publish</b> after changing them. The answers people send are stored privately in Firebase, never in your public site files.</p></div>`;
  if (!s) return top + `<div class="warn">Applications use the same Firebase project as Grid Draft. Finish the setup in <a href="#/admin/griddraft">Grid Draft</a> first (steps 1–7), then re-copy the rules.</div>` + builder;
  if (!s.ready) return top + '<p class="muted">Connecting…</p>' + builder;
  if (!s.user) return top + `<div class="a-card"><p>Sign in with your admin Google account to review applications.</p><button class="btn primary" data-team="signin">Sign in with Google</button></div>` + builder;
  const owner = ownerEmails().includes(s.user.email);
  if (!owner && !(s.siteAdmin && allowed('applications'))) return top + `<div class="warn">Signed in as ${esc(s.user.email)}, which can't review applications. Add it as an owner email (Grid Draft ①) or to the Admin team with Applications access.</div>` + builder;
  if (APA.list === null && !APA.loading) {
    APA.loading = true;
    Promise.all([s.allApps(), APA.hook === undefined ? s.appHook().catch(() => null) : Promise.resolve(APA.hook)])
      .then(([l, h]) => { APA.list = l.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); APA.hook = h || null; APA.err = ''; })
      .catch(e => { APA.list = []; APA.err = (e.code || e.message) + (/permission/.test(e.code || e.message) ? ' — re-copy the security rules from Grid Draft ③ into Firebase (they now include applications).' : ''); })
      .finally(() => { APA.loading = false; rerender(); });
  }
  const all = APA.list || [], counts = { pending: 0, contracts: 0, accepted: 0, waitlist: 0, denied: 0 };
  all.forEach(a => { const k = ['offer', 'signed'].includes(a.status) ? 'contracts' : a.status; counts[k] = (counts[k] || 0) + 1; });
  const toConfirm = all.filter(a => a.status === 'signed').length;
  const inFilter = a => APA.filter === 'all' || (APA.filter === 'contracts' ? ['offer', 'signed'].includes(a.status) : a.status === APA.filter);
  const shown = all.filter(a => inFilter(a) && (!APA.form || a.formId === APA.form)).sort((x, y) => (y.status === 'signed') - (x.status === 'signed'));
  const fmt = t => t ? new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
  const rb = (a, st, label, cls = '', clear = false) => `<button class="btn sm ${cls}" data-act="ap-review" data-id="${esc(a.id)}" data-st="${st}" ${clear ? 'data-clear="1"' : ''}>${label}</button>`;
  const btn = (a, C) => {
    const st = a.status, back = rb(a, 'pending', 'Back to review', 'ghost', true);
    if (st === 'pending') return (C ? rb(a, 'offer', '✓ Approve &amp; send contract', 'primary') : rb(a, 'accepted', '✓ Accept', 'primary')) + rb(a, 'waitlist', '🕓 Waitlist') + rb(a, 'denied', '✕ Deny', 'danger');
    if (st === 'offer') return rb(a, 'accepted', 'Accept without contract') + rb(a, 'denied', '✕ Deny', 'danger') + back;
    if (st === 'signed') return rb(a, 'accepted', '✓ Confirm — fully accepted', 'primary') + rb(a, 'offer', 'Ask them to sign again', '', true) + rb(a, 'denied', '✕ Deny', 'danger');
    if (st === 'waitlist') return (C ? rb(a, 'offer', '✓ Approve &amp; send contract', 'primary') : rb(a, 'accepted', '✓ Accept', 'primary')) + rb(a, 'denied', '✕ Deny', 'danger') + back;
    return back;
  };
  const review = `<div class="a-card" style="overflow-x:auto"><div class="card-title" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px"><h3 style="margin:0">Review</h3>
      <div class="tabs" style="margin:0">${[['pending', 'Waiting'], ['contracts', 'Contracts'], ['accepted', 'Accepted'], ['waitlist', 'Waitlist'], ['denied', 'Denied'], ['all', 'All']].map(([k, l]) => `<button data-act="ap-filter" data-f="${k}" class="${APA.filter === k ? 'active' : ''}">${l}${k !== 'all' && counts[k] ? ` <span class="muted">${counts[k]}</span>` : ''}${k === 'contracts' && toConfirm ? ' <span class="dot"></span>' : ''}</button>`).join('')}</div>
      ${forms.length > 1 ? `<select id="ap-form-filter"><option value="">All forms</option>${forms.map(f => `<option value="${esc(f.id)}" ${APA.form === f.id ? 'selected' : ''}>${esc(f.title)}</option>`).join('')}</select>` : ''}
      <button class="btn sm" data-act="ap-reload" style="margin-left:auto">Refresh</button></div>
    ${APA.err ? `<div class="warn">${esc(APA.err)}</div>` : ''}
    ${APA.list === null ? '<p class="muted">Loading…</p>' : shown.length ? shown.map(a => {
      const f = forms.find(x => x.id === a.formId), key = 'apa-' + a.id;
      const qs = f ? f.questions : Object.keys(a.answers || {}).map(id => ({ id, label: id }));
      return `<details class="item" data-key="${key}" ${A.open[key] ? 'open' : ''}><summary>${Apps.badge(a.status)}<b>${esc(a.applicant)}</b><span class="muted" style="font-size:13px">${esc(a.formTitle || '')} · ${esc(fmt(a.createdAt))}</span></summary>
        <div class="body"><dl class="ap-answers">${qs.map(q => `<dt>${esc(q.label)}</dt><dd>${esc(Apps.answerText(d, q, (a.answers || {})[q.id]) || '—')}</dd>`).join('')}</dl>
          <p class="hint">Google account: <span class="mono">${esc(a.email || '')}</span>${a.reviewer ? ` · last decision by ${esc(a.reviewer)} ${esc(fmt(a.reviewedAt))}` : ''}</p>
          <label class="fld wide"><span>Message to the applicant (they'll see it on the site${APA.hook && APA.hook.decisions !== false ? ' and it\'s posted to Discord' : ''})</span><textarea id="ap-note-${esc(a.id)}" rows="3" placeholder="e.g. Welcome aboard! You'll drive for … from Round 6.">${esc(a.note || '')}</textarea></label>
          ${a.status === 'signed' ? `<div class="ap-signed-box"><div><b>✍️ Signed</b> as <span class="ap-sig">${esc(a.signature || '')}</span> · ${esc(fmt(a.signedAt))}</div>${a.contract ? `<details><summary>Read the contract they signed</summary><div class="prose">${LG.md(a.contract)}</div></details>` : ''}</div>` : a.status === 'offer' ? `<div class="ok-note">📜 Contract sent — waiting for them to sign it on the site.</div>` : ''}
          <div class="toolbar" style="margin-top:8px">${btn(a, Apps.contractFor(d, f))}<button class="btn sm ghost" data-act="ap-delete" data-id="${esc(a.id)}" style="margin-left:auto">Delete</button></div></div></details>`;
    }).join('') : `<p class="muted">${APA.filter === 'pending' ? 'Nothing waiting for review. 🎉' : 'Nothing here.'}</p>`}</div>`;
  const h = APA.hook || {};
  const discord = owner ? `<div class="a-card"><h3>Discord channel</h3>
      ${h.url ? '<div class="ok-note">Connected — new applications are posted to your channel.</div>' : '<div class="warn">Not connected yet — applications still work, they just won\'t be posted to Discord.</div>'}
      <div class="fgrid"><label class="fld wide"><span>Webhook for your applications channel</span><input type="password" id="ap-hook" placeholder="${h.url ? '•••••• saved — paste a new one to replace it' : 'https://discord.com/api/webhooks/…'}" autocomplete="off"></label>
        <label class="fld"><span>Ping with each new application (optional)</span><input id="ap-ping" value="${esc(h.ping || '')}" placeholder="e.g. <@&123456789> for a role"></label>
        ${F.select('Post layout', 'applications.discordStyle', d.applications.discordStyle || 'columns', [['columns', 'Two columns (card)'], ['container', 'Container (one column)']])}${F.color('Side bar colour', 'applications.discordColor', d.applications.discordColor || '#f6cde5')}
        <label class="chk"><input type="checkbox" id="ap-decisions" ${h.decisions !== false ? 'checked' : ''}><span>Also post updates (contracts sent &amp; signed, accepted / waitlisted / denied)</span></label></div>
      <div class="toolbar" style="margin-top:10px"><button class="btn sm primary" data-act="ap-hook-save">Save</button>${h.url ? '<button class="btn sm" data-act="ap-hook-test">Send test message</button><button class="btn sm danger" data-act="ap-hook-clear">Disconnect</button>' : ''}</div>
      <p class="hint">Discord → your applications channel → ⚙ Edit channel → Integrations → Webhooks → New webhook → Copy URL. It's stored in Firebase (not your public files). Signed-in applicants' browsers use it to post their application, so use a dedicated channel — if it's ever spammed, delete the webhook in Discord and paste a new one. To find a role ID for pings: Discord settings → Advanced → Developer Mode, then right-click the role → Copy ID.</p></div>` : '';
  return top + review + discord + builder;
}

/* ---------------- admin team ---------------- */
const ACT = { members: null, logs: null, key: undefined, err: '', loading: false, edit: null };
window.addEventListener('hashchange', () => { if (/^#\/admin\/access/.test(location.hash) && !ACT.loading) { ACT.members = null; setTimeout(rerender, 0); } });
const ACCESS_SECTIONS = () => SECTIONS.filter(([k]) => !['dashboard', 'publish', 'access'].includes(k));
function secAccess(d) {
  const s = teamStore();
  const top = head('Admin team', 'Let other people into this console with their Google account and publish the site — without giving them your passcode or GitHub token. Their emails are stored privately in Firebase, never in your public site files.');
  if (!s) return top + `<div class="warn">The admin team uses the same Firebase project as Grid Draft. Finish the setup in <a href="#/admin/griddraft">Grid Draft</a> first (steps 1–7).</div>`;
  if (!s.ready) return top + '<p class="muted">Connecting…</p>';
  if (!s.user) return top + `<div class="a-card"><p>Sign in with your owner Google account (the admin email from Grid Draft ①) to manage the team.</p><button class="btn primary" data-team="signin">Sign in with Google</button></div>`;
  if (!ownerEmails().includes(s.user.email)) return top + `<div class="warn">Signed in as ${esc(s.user.email)}. Only owner emails (Grid Draft → ①) can manage the admin team.</div>`;
  if (!ACT.loading && ACT.members === null) {
    ACT.loading = true;
    Promise.all([s.siteAdmins(), s.logs().catch(() => []), s.getKey()]).then(([m, l, k]) => { ACT.members = m; ACT.logs = l; ACT.key = k; ACT.err = ''; })
      .catch(e => { ACT.members = ACT.members || []; ACT.logs = ACT.logs || []; ACT.err = (e.code || e.message) + (/permission/.test(e.code || e.message) ? ' — re-copy the security rules from Grid Draft ③ into Firebase (they now include the admin team).' : ''); })
      .finally(() => { ACT.loading = false; rerender(); });
  }
  const mem = ACT.members || [], ed = ACT.edit || { email: '', name: '', sections: [] };
  const all = (ed.sections || []).includes('*');
  const secLabel = ss => (ss || []).includes('*') ? '<span class="chip">Everything</span>' : (ss || []).map(k => (k === 'stewards' ? LG.rcName(d) : (SECTIONS.find(x => x[0] === k) || [k, k])[1])).map(l => `<span class="chip">${esc(l)}</span>`).join(' ') || '<span class="muted">Dashboard only</span>';
  const hasLocal = !!ls.get(K.token), c = ghCfg(), k = ACT.key;
  return top + `${ACT.err ? `<div class="warn">${esc(ACT.err)}</div>` : ''}
    <div class="a-card"><h3>How it works</h3><ol class="steps">
      <li>Share a <b>publishing key</b> once (below). It's kept in Firebase and only the admin team can read it.</li>
      <li>Add each person's Google email and pick which parts of the console they can use.</li>
      <li>Send them <code>${esc(location.origin + location.pathname)}#/admin</code> — they choose <b>Sign in with Google (admin team)</b> instead of the passcode.</li>
      <li>Every publish is saved with their name in <b>Recent activity</b> and in the GitHub commit message.</li></ol></div>
    <div class="a-card"><h3>Publishing key</h3>
      ${k ? `<div class="ok-note">Shared — publishing to <b>${esc(k.owner)}/${esc(k.repo)}</b>${k.at ? ` · since ${esc(new Date(k.at).toLocaleDateString())}` : ''}.</div>` : ACT.members === null ? '<p class="muted">Loading…</p>' : '<div class="warn">Not shared yet — your team can edit but can\'t publish.</div>'}
      <p class="hint">Best practice: make a <b>separate</b> fine-grained GitHub token just for the team (same steps as yours: only this repo, Contents: Read and write). If you ever need to cut everyone off, delete that token on GitHub — yours keeps working.</p>
      <div class="fgrid"><label class="fld wide"><span>Team token</span><input type="password" id="ac-token" placeholder="github_pat_… (leave blank to share the one saved in this browser)" autocomplete="off"></label></div>
      <div class="toolbar" style="margin-top:12px"><button class="btn sm primary" data-act="ac-share" ${hasLocal ? '' : 'data-need="1"'}>${k ? 'Replace shared key' : 'Share publishing key'}</button>${k ? '<button class="btn sm danger" data-act="ac-unshare">Stop sharing</button>' : ''}
        <span class="hint" style="margin:0">Repo: ${esc(c.owner || '?')}/${esc(c.repo || '?')} · branch ${esc(c.branch)}</span></div></div>
    <div class="a-card" style="overflow-x:auto"><div class="card-title" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><h3 style="margin:0">Team members</h3><button class="btn sm" data-act="ac-reload">Refresh</button></div>
      ${mem.length ? `<table class="rtable"><thead><tr><th>Google email</th><th>Name</th><th>Can use</th><th></th></tr></thead><tbody>${mem.map(m => `<tr><td class="mono" style="font-size:13px">${esc(m.email)}</td><td>${esc(m.name)}</td><td class="ac-secs">${secLabel(m.sections)}</td><td class="c-act" style="white-space:nowrap"><button class="btn xs" data-act="ac-edit" data-email="${esc(m.email)}">Edit</button><button class="iconbtn del" data-act="ac-rm" data-email="${esc(m.email)}">✕</button></td></tr>`).join('')}</tbody></table>` : ACT.members === null ? '<p class="muted">Loading…</p>' : '<p class="muted">Nobody added yet.</p>'}
      <h4 style="margin:18px 0 8px">${ACT.edit ? 'Edit access' : 'Add someone'}</h4>
      <div class="fgrid">
        <label class="fld"><span>Their Google email</span><input type="text" inputmode="email" autocomplete="off" id="ac-email" value="${esc(ed.email)}" placeholder="name@gmail.com" ${ACT.edit ? 'readonly' : ''}></label>
        <label class="fld"><span>Name (for the activity log)</span><input type="text" id="ac-name" value="${esc(ed.name)}" maxlength="80"></label></div>
      <div class="ac-grid"><label class="ac-all"><input type="checkbox" id="ac-all" ${all ? 'checked' : ''}> <b>Everything</b> <span class="muted">(full editor — still can't change the passcode, GitHub connection or this team)</span></label>
        ${ACCESS_SECTIONS().map(([k, l, ic]) => `<label><input type="checkbox" class="ac-sec" value="${k}" ${all || (ed.sections || []).includes(k) ? 'checked' : ''} ${all ? 'disabled' : ''}> <span class="ic">${ic}</span> ${esc(k === 'stewards' ? LG.rcName(d) : l)}</label>`).join('')}</div>
      <div class="toolbar" style="margin-top:12px"><button class="btn sm primary" data-act="ac-add">${ACT.edit ? 'Save access' : '+ Give access'}</button>${ACT.edit ? '<button class="btn sm ghost" data-act="ac-cancel">Cancel</button>' : ''}</div>
      <p class="hint">Everyone on the team can open Dashboard and Publish. Removing someone takes effect the next time they load the console. To be 100% sure they can't publish again, also replace the team token.</p></div>
    <div class="a-card" style="overflow-x:auto"><h3>Recent activity</h3>
      ${(ACT.logs || []).length ? `<table class="rtable"><thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead><tbody>${ACT.logs.map(x => `<tr><td class="mono muted" style="font-size:12.5px;white-space:nowrap">${x.at ? esc(new Date(x.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })) : ''}</td><td><b>${esc(x.name || x.email)}</b></td><td>${esc(x.action)}${x.detail ? ` <span class="muted">— ${esc(x.detail)}</span>` : ''}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Nothing yet. Publishes (by you or the team) show up here.</p>'}</div>`;
}

/* ---------------- gallery ---------------- */
function secGallery(d) {
  const g = d.gallery = d.gallery || [];
  const rs = LG.rounds(d);
  return head('Gallery', 'Photos shown on the public Gallery page (and under each round). Press & media submissions you approve land here; you can also add photos yourself.', '<a class="btn" href="#/gallery">View Gallery</a>') + `
    <div class="a-card"><div class="toolbar"><button class="btn sm primary" data-act="upload" data-mode="gallery" data-folder="gallery" data-max="1920" data-multiple="1">⬆ Add photos</button><span class="hint" style="margin:0">Up to 1920 px wide · JPG or PNG</span></div></div>
    <div class="a-card">${g.length ? `<div class="gal-admin">${g.map((x, k) => `<div class="gal-item"><img class="zoomable" src="${esc(LG.asset(x.src))}" alt="">
        <div class="fgrid">${F.text('Caption', `gallery.${k}.caption`, x.caption || '')}${F.text('Credit', `gallery.${k}.credit`, x.credit || '')}${F.select('Round', `gallery.${k}.roundId`, x.roundId || '', [['', '— none —'], ...rs.map(r => [r.id, 'R' + r.round + ' ' + r.name])])}</div>
        <div class="prow-act">${mvBtns('gallery', k, g.length)}<button class="iconbtn del" data-act="gal-del" data-i="${k}" title="Remove from gallery">✕</button></div></div>`).join('')}</div>` : '<p class="muted">No photos yet.</p>'}</div>`;
}

/* ---------------- extra driver photos per team / round ---------------- */
function looksEditor(d, x, i, p) {
  const L = x.looks || [], rs = LG.rounds(d);
  const rows = L.map((l, k) => {
    const lp = `${p}.looks.${k}`, on = new Set(l.rounds || []), t = byId(d.teams, l.teamId);
    const src = l.headshot || l.photo;
    return `<div class="look-row" style="--tc:${esc(LG.teamColor(t))}">
      <div class="look-pic">${src ? `<img src="${esc(LG.asset(src))}" alt="" onerror="this.remove()">` : '<span>No photo yet</span>'}</div>
      <div class="look-body">
        <div class="fgrid">
          ${F.select('When they drove for', `${lp}.teamId`, l.teamId || '', [['', '— any team —'], ...d.teams.map(t2 => [t2.id, t2.name])])}
          ${F.image('Photo', `${lp}.photo`, l.photo, 'drivers', 1400, 'driverPhoto')}
          ${F.image('Headshot (optional)', `${lp}.headshot`, l.headshot, 'drivers', 500, 'headshot')}
        </div>
        ${rs.length ? `<div class="look-rounds"><span class="muted">Only on these rounds <small>(leave all off = every round with ${t ? esc(t.name) : 'that team'})</small></span>
          <div class="look-chips">${rs.map(r => `<label class="look-chip ${on.has(r.id) ? 'on' : ''}" title="${esc(r.name)}"><input type="checkbox" data-look="${esc(lp)}" value="${esc(r.id)}" ${on.has(r.id) ? 'checked' : ''}>R${esc(r.round)}</label>`).join('')}</div></div>` : ''}
        <p class="hint look-sum">${!l.photo && !l.headshot ? 'Upload a photo to use this.' : on.size ? `Used on ${[...on].map(id => { const r = byId(d.calendar, id); return r ? 'R' + r.round : ''; }).filter(Boolean).join(', ')}.` : l.teamId ? `Used whenever ${esc(x.name.split(' ')[0])} races for ${esc(t ? t.name : 'this team')}.` : 'Pick a team or some rounds.'}</p>
      </div>
      <button class="iconbtn del" data-act="look-del" data-i="${i}" data-k="${k}" title="Remove this photo">✕</button>
    </div>`;
  }).join('');
  return `<div class="wide looks-ed"><div class="fld"><span>Photos for other teams or rounds</span></div>
    <p class="hint" style="margin:0 0 10px">Changed teams mid-season? Add a photo for the rounds they drove for another team (or pick exact rounds). Race results, Driver of the Day and Grid Draft cards use the matching photo — everywhere else uses the main photo above.</p>
    ${rows}<div class="toolbar"><button class="btn sm" data-act="look-add" data-i="${i}">+ Add a team / round photo</button></div></div>`;
}
document.addEventListener('change', e => {
  const c = e.target.closest && e.target.closest('input[data-look]'); if (!c) return;
  const d = D(), l = getPath(d, c.dataset.look); if (!l) return;
  const set = new Set(l.rounds || []); if (c.checked) set.add(c.value); else set.delete(c.value);
  l.rounds = LG.rounds(d).map(r => r.id).filter(id => set.has(id)); commit();
});

/* ---------------- home page slideshow ---------------- */
const SSA = { gal: false };
function secSlideshow(d) {
  const c = d.slideshow = Object.assign({ enabled: false, title: 'From the paddock', interval: 6, position: 'top', aspect: '16/7', items: [] }, d.slideshow || {});
  const items = c.items = c.items || [], rs = LG.rounds(d), gal = d.gallery || [];
  const used = new Set(items.map(x => x.src));
  const card = (x, k) => `<div class="ss-item">
      <div class="ss-prev" data-ss-drag="${k}" style="--hs-ar:${esc(c.aspect)}" title="Drag to reposition">${LG.slideImg(x, 'ss-img')}<span class="ssa-no">${k + 1}</span><span class="ss-hint">✥ Drag to reposition</span>
        ${LG.slideLabel(d, x) || x.caption ? `<div class="ss-cap">${LG.slideLabel(d, x) ? `<span class="hs-ev">${LG.slideLabel(d, x)}</span>` : ''}${x.caption ? `<b>${esc(x.caption)}</b>` : ''}</div>` : ''}</div>
      <div class="ss-zoom"><span>Zoom</span><input type="range" min="1" max="2.5" step="0.05" value="${esc(x.zoom || 1)}" data-ss-zoom="${k}" aria-label="Zoom"><b class="mono">${(Number(x.zoom) || 1).toFixed(2)}×</b>
        <button class="btn xs" data-act="ss-center" data-i="${k}" title="Back to the middle, no zoom">↺ Reset</button><button class="btn xs" data-act="adjust" data-target="slideshow.items.${k}.src" data-folder="slides" data-spec="slide" title="Crop the photo file itself">✂ Re-crop</button></div>
      <div class="fgrid ss-fields">
        ${F.text('Short description', `slideshow.items.${k}.caption`, x.caption || '', 'wide maxlength="120" placeholder="e.g. Lights out at Imola"')}
        ${F.select('Round', `slideshow.items.${k}.roundId`, x.roundId || '', [['', '— Not a round —'], ...rs.map(r => [r.id, `R${r.round} · ${r.name}`])])}
        ${x.roundId ? '' : F.text('Event (if not a round)', `slideshow.items.${k}.event`, x.event || '', 'maxlength="40" placeholder="e.g. Pre-season testing"')}
        ${F.text('Photo credit (optional)', `slideshow.items.${k}.credit`, x.credit || '', 'maxlength="40"')}
      </div>
      <div class="ss-act">${F.check('Hide for now', `slideshow.items.${k}.hidden`, !!x.hidden)}<span style="flex:1"></span>${mvBtns('slideshow.items', k, items.length)}<button class="iconbtn del" data-act="ss-del" data-i="${k}" title="Remove from the slideshow">✕</button></div>
    </div>`;
  return head('Home slideshow', 'A rotating strip of league photos on the home page. Upload photos (or pick them from the Gallery), drag each one to frame it, add a short description and the round or event it was taken at, and set the order with ↑ ↓.', '<a class="btn" href="#/">View home page</a>') + `
    <div class="a-card"><div class="fgrid">
      ${F.check('Show the slideshow on the home page', 'slideshow.enabled', c.enabled)}
      ${F.text('Section title (optional)', 'slideshow.title', c.title || '', 'placeholder="From the paddock"')}
      ${F.num('Seconds per photo', 'slideshow.interval', c.interval, 'min="2" max="30" step="1"')}
      ${F.select('Where on the home page', 'slideshow.position', c.position, [['top', 'Near the top (under the hero)'], ['middle', 'Under the standings'], ['bottom', 'Above Latest news']])}
      ${F.select('Shape', 'slideshow.aspect', c.aspect, [['16/7', 'Wide (16:7)'], ['16/9', 'Standard (16:9)'], ['21/9', 'Cinematic (21:9)'], ['3/2', 'Photo (3:2)']])}
    </div></div>
    <div class="a-card"><div class="toolbar"><button class="btn sm primary" data-act="upload" data-mode="slides" data-folder="slides" data-max="2400" data-multiple="1" data-spec="slide">⬆ Upload photos</button>${gal.length ? `<button class="btn sm" data-act="ss-galtoggle">${SSA.gal ? 'Close Gallery' : '▦ Add from Gallery'}</button>` : ''}<span class="hint" style="margin:0">One photo at a time opens the cropper · several at once upload as they are · best at 1920 × 840</span></div>
      ${SSA.gal ? `<div class="ss-gal">${gal.map((g, i) => `<button class="ss-gpick ${used.has(g.src) ? 'used' : ''}" data-act="ss-fromgal" data-i="${i}" ${used.has(g.src) ? 'disabled' : ''} title="${esc(g.caption || '')}"><img src="${esc(LG.asset(g.src))}" alt="" loading="lazy"><span>${used.has(g.src) ? '✓ Added' : '+ Add'}</span></button>`).join('')}</div>` : ''}
    </div>
    ${items.length ? `<div class="ss-list">${items.map(card).join('')}</div>` : '<div class="a-card"><p class="muted">No photos yet — upload some or add them from the Gallery.</p></div>'}`;
}
/* drag to reposition / zoom slider — updates the preview live, saves when you let go */
(() => {
  let drag = null;
  document.addEventListener('pointerdown', e => {
    const box = e.target.closest && e.target.closest('[data-ss-drag]'); if (!box) return;
    const k = +box.dataset.ssDrag, x = D().slideshow.items[k]; if (!x) return;
    e.preventDefault(); box.setPointerCapture(e.pointerId); box.classList.add('dragging');
    drag = { box, k, x0: e.clientX, y0: e.clientY, fx: +x.fx || 50, fy: +x.fy || 50, w: box.clientWidth, h: box.clientHeight, z: Math.max(1, +x.zoom || 1) };
  });
  document.addEventListener('pointermove', e => {
    if (!drag) return;
    const k = 140 / drag.z, x = D().slideshow.items[drag.k];
    x.fx = Math.round(Math.max(0, Math.min(100, drag.fx - (e.clientX - drag.x0) / drag.w * k)) * 10) / 10;
    x.fy = Math.round(Math.max(0, Math.min(100, drag.fy - (e.clientY - drag.y0) / drag.h * k)) * 10) / 10;
    const img = drag.box.querySelector('img'); img.style.objectPosition = `${x.fx}% ${x.fy}%`; img.style.transformOrigin = `${x.fx}% ${x.fy}%`;
  });
  const end = () => { if (!drag) return; drag.box.classList.remove('dragging'); drag = null; commit(); };
  document.addEventListener('pointerup', end); document.addEventListener('pointercancel', end);
  document.addEventListener('input', e => {
    const r = e.target.closest && e.target.closest('[data-ss-zoom]'); if (!r) return;
    const x = D().slideshow.items[+r.dataset.ssZoom]; x.zoom = +r.value;
    const img = r.closest('.ss-item').querySelector('.ss-prev img'); img.style.transform = `scale(${x.zoom})`;
    r.nextElementSibling.textContent = x.zoom.toFixed(2) + '×';
  });
  document.addEventListener('change', e => { if (e.target.closest && e.target.closest('[data-ss-zoom]')) commit(); });
})();

/* ---------------- seasons ---------------- */
const seaSlug = s => 'season-' + (String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x');
function secSeasons(d) {
  const list = (d.seasons || []).slice().sort((a, b) => String(b.label).localeCompare(String(a.label), undefined, { numeric: true }));
  const done = LG.rounds(d).filter(r => LG.isDone(d, r)).length, total = d.calendar.filter(r => !r.cancelled).length;
  const saved = list.find(x => String(x.label) === String(d.league.season));
  const n = parseInt(d.league.season, 10), nextGuess = !isNaN(n) && String(n) === String(d.league.season).trim() ? String(n + 1) : '';
  return head('Seasons', 'Every archived season keeps its full calendar, results, standings, drivers, teams and race control decisions. Visitors browse them from <b>More → Seasons</b>.', '<a class="btn" href="#/seasons">View Seasons page</a>') + `
    <div class="a-card"><h3>Current season · ${esc(d.league.season)}</h3>
      <div class="fgrid">${F.text('Season name', 'league.season', d.league.season, 'data-reload placeholder="e.g. 2026 or Season 1"')}</div>
      <p class="muted" style="margin:-4px 0 14px">${done}/${total} rounds completed${saved ? ` · a copy was saved ${saved.savedAt ? LG.fmtDate(saved.savedAt) : ''}` : ''}</p>
      <div class="toolbar"><button class="btn sm" data-act="sea-save">💾 Save a full copy now</button></div>
      <p class="hint">Saves the season as it stands (doesn't clear anything). Handy after the final race, or as a checkpoint. Saving again replaces the earlier copy.</p>
    </div>
    <div class="a-card"><h3>Start a new season</h3>
      <ol class="steps"><li>Saves a full copy of ${esc(LG.seasonName(d.league.season))} and adds its champions to the Hall of fame.</li><li>Downloads a backup file to your computer.</li><li>Clears results, penalties, race control decisions and the calendar. Drivers, teams, scoring, news, rules and fantasy settings are kept.</li></ol>
      <div class="fgrid"><label class="fld"><span>New season label</span><input type="text" id="sea-next" value="${esc(nextGuess)}" placeholder="e.g. 2027 or Season 3"></label></div>
      <div class="toolbar" style="margin-top:10px"><button class="btn sm danger" data-act="sea-new">Archive ${esc(d.league.season)} & start the new season</button></div>
      <p class="hint">Needs your GitHub connection (Publish & backup) to save the archive file. Nothing goes live until you press Publish.</p>
    </div>
    <div class="a-card"><h3>Archived seasons (${list.length})</h3>
      ${list.length ? list.map(s => `<div class="sea-row"><input class="sea-name" data-sea-rename="${esc(s.id)}" value="${esc(s.label)}" title="Rename this season" autocomplete="off"><span class="muted">${s.champion ? '🏆 ' + esc(s.champion) + ' · ' : ''}${s.rounds || 0} rounds · saved ${s.savedAt ? LG.fmtDate(s.savedAt) : ''}</span><a class="btn xs" href="#/seasons/view/${esc(s.id)}">View</a><button class="btn xs danger" data-act="sea-rm" data-id="${esc(s.id)}">Remove</button></div>`).join('') : '<p class="muted">None yet.</p>'}
      <div class="toolbar" style="margin-top:14px"><label class="btn sm">⬆ Add a past season from a backup file<input type="file" accept=".json,application/json" data-ctl="sea-import" hidden></label></div>
      <p class="hint">Got an old <code>league-….json</code> backup (from "Download" or an earlier "Start a new season")? Import it here to make that season browsable.</p>
    </div>`;
}
async function putRepoFile(g, path, text, message) {
  const api = `https://api.github.com/repos/${encodeURIComponent(g.c.owner)}/${encodeURIComponent(g.c.repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
  let sha; const cur = await fetch(`${api}?ref=${encodeURIComponent(g.c.branch)}&t=${Date.now()}`, { headers: g.headers, cache: 'no-store' });
  if (cur.ok) sha = (await cur.json()).sha; else if (cur.status !== 404) throw new Error((await cur.json().catch(() => ({}))).message || cur.status);
  const body = { message, content: b64(text), branch: g.c.branch }; if (sha) body.sha = sha;
  const put = await fetch(api, { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, g.headers), body: JSON.stringify(body) });
  if (!put.ok) throw new Error((await put.json().catch(() => ({}))).message || put.status);
}
function archivePayload(src) {
  const a = clone(src);
  delete a.settings; delete a.gridDraft; delete a.seo; delete a.music; delete a.seasons;
  if (a.fantasy) a.fantasy = { enabled: false };
  a.meta = Object.assign({}, a.meta, { archived: new Date().toISOString() });
  return a;
}
async function saveArchive(d, src) {
  const g = ghReady(); if (!g) return null;
  const label = String(src.league.season || 'Season'), id = seaSlug(label), file = `data/seasons/${id.replace(/^season-/, '')}.json`;
  await putRepoFile(g, file, JSON.stringify(archivePayload(src)) + '\n', `Archive season ${label}`);
  const st = LG.computeStandings(LG.normalize(clone(src)));
  const champ = st.drivers[0] ? (LG.byId(src.drivers, st.drivers[0].id) || {}).name : '';
  const entry = { id, label, file, savedAt: new Date().toISOString(), rounds: (src.calendar || []).filter(r => !r.cancelled).length, champion: champ || '' };
  d.seasons = (d.seasons || []).filter(x => x.id !== id); d.seasons.push(entry);
  return entry;
}
async function seasonArchive(d, startNew, btn) {
  let next = '';
  if (startNew) {
    next = (document.getElementById('sea-next').value || '').trim();
    if (!next) return toast('Type the new season label first', 'err');
    if (String(next) === String(d.league.season)) return toast('The new season needs a different label', 'err');
    if (!await Pop.ask(btn, `Archive ${LG.seasonName(d.league.season)} and start ${next}?\n\nA backup downloads first. Results, penalties, race control decisions and the calendar will be cleared (nothing goes live until you publish).`)) return;
  }
  if (!ghReady()) return;
  btn.disabled = true; const old = btn.textContent; btn.textContent = 'Saving…';
  try {
    if (startNew) download(d, `league-${String(d.league.season).replace(/[^\w-]+/g, '_')}-backup.json`);
    const e = await saveArchive(d, d);
    if (startNew) {
      if (!d.history.some(h => String(h.season) === String(d.league.season))) d.history.push(LG.snapshotSeason(d));
      gdKeepSeason(d);
      d.results = {}; d.adjustments = []; d.stewards = []; d.calendar = [];
      d.league.season = next;
      toast(`${LG.seasonName(e.label)} archived — ${LG.seasonName(next)} is ready. Set up the calendar, then Publish.`);
    } else toast(`Saved a full copy of ${LG.seasonName(e.label)} — Publish to show it on the Seasons page`);
    commit();
  } catch (err) { btn.disabled = false; btn.textContent = old; toast('Couldn’t save the season: ' + err.message, 'err'); }
}

/* ---------------- team portal admin ---------------- */
const PTA = { subs: null, members: null, err: '', open: '', loading: false };
window.addEventListener('hashchange', () => { if (/^#\/admin\/portal/.test(location.hash) && window.Accounts) window.Accounts.refreshApproved(); });
window.addEventListener('hashchange', () => { if (/^#\/admin\/portal/.test(location.hash) && !PTA.loading) { PTA.subs = null; PTA.members = null; setTimeout(rerender, 0); } });
function secPortal(d) {
  const PT = window.Portal, s = PT.store(d);
  const c = window.GridDraft.cfg(d);
  const adminList = String(c.admins || '').toLowerCase().split(/[\s,;]+/);
  const top = head('Team portal', 'Team principals, executives and press / media sign in with Google and submit articles or photos. Approved articles are added to <b>News</b> (tagged to their team) — then you publish as usual.', '<a class="btn" href="#/portal">Open the portal page</a>');
  const onBox = `<div class="a-card"><div class="fgrid">${F.check('Show a “Team portal” link in the site footer', 'portalOn', d.portalOn)}</div><p class="hint">The portal page is <code>${esc(location.origin + location.pathname)}#/portal</code> — you can also just send staff that link.</p></div>`;
  if (!s) return top + `<div class="warn">The portal uses the same Firebase project as Grid Draft. Finish the setup in <a href="#/admin/griddraft">Grid Draft</a> first (steps 1–7).</div>` + onBox;
  if (!s.ready) return top + '<p class="muted">Connecting…</p>';
  if (!s.user) return top + onBox + `<div class="a-card"><p>Sign in with your admin Google account to review articles and manage staff access.</p><button class="btn primary" data-act="pt-signin">Sign in with Google</button></div>`;
  if (!adminList.includes(s.user.email) && !(s.siteAdmin && allowed('portal'))) return top + `<div class="warn">Signed in as ${esc(s.user.email)}, which isn't in the admin emails (Grid Draft → ①) or on the admin team with Team portal access.</div>`;
  if (!PTA.loading && (PTA.subs === null || PTA.members === null)) {
    PTA.loading = true;
    Promise.all([s.allSubs(), s.members(), s.uidMembers ? s.uidMembers().catch(() => []) : []]).then(([a, m, u]) => { PTA.subs = a.sort((x, y) => y.updatedAt - x.updatedAt); PTA.members = m; PTA.uids = u; PTA.err = ''; })
      .catch(e => { PTA.subs = PTA.subs || []; PTA.members = PTA.members || []; PTA.err = (e.code || e.message) + (/permission/.test(e.code || e.message) ? ' — re-copy the rules from Grid Draft ③ into Firebase (they now include the portal).' : ''); })
      .finally(() => { PTA.loading = false; rerender(); });
  }
  const subs = PTA.subs || [], mem = PTA.members || [];
  const pend = subs.filter(x => x.status === 'pending'), done = subs.filter(x => x.status !== 'pending');
  const tName = id => (byId(d.teams, id) || {}).name || 'Unknown team';
  const card = x => `<details class="item" data-key="pt-${x.id}" ${A.open['pt-' + x.id] ? 'open' : ''}>
      <summary>${window.Portal.badge(x.status)}<b>${x.kind === 'photos' ? '📷 ' : ''}${esc(x.title)}</b><span class="muted" style="font-size:13px">${esc(x.name)} · ${esc(x.role)}${x.teamId ? ', ' + esc(tName(x.teamId)) : ''} · ${x.updatedAt ? new Date(x.updatedAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : ''}</span></summary>
      <div class="body">${x.kind === 'photos' ? `<div class="pt-review"><h2>${esc(x.title)}</h2>${x.roundId && byId(d.calendar, x.roundId) ? `<p class="chip">R${esc(byId(d.calendar, x.roundId).round)} · ${esc(byId(d.calendar, x.roundId).name)}</p>` : ''}<div class="gal-grid adm">${(x.images || []).map(u => `<img class="zoomable" src="${esc(u)}" alt="">`).join('')}</div>${x.body ? `<p class="hint"><b>Their notes:</b> ${esc(x.body)}</p>` : ''}</div>`
        : `<article class="article pt-review">${x.tag ? `<div class="eyebrow">${esc(x.tag)}</div>` : ''}<h2>${esc(x.title)}</h2>${x.image ? `<div class="a-cover"><img src="${esc(x.image)}" alt=""></div>` : ''}<div class="prose">${LG.md(x.body)}</div></article>`}
        ${x.note ? `<p class="hint"><b>Your note:</b> ${esc(x.note)}</p>` : ''}
        <div class="item-actions">${x.status !== 'approved' ? `<button class="btn sm primary" data-act="pt-approve" data-id="${esc(x.id)}">${x.kind === 'photos' ? '✓ Approve & add to Gallery' : '✓ Approve & add to News'}</button><button class="btn sm" data-act="pt-changes" data-id="${esc(x.id)}">Request changes</button>${x.status !== 'rejected' ? `<button class="btn sm danger" data-act="pt-reject" data-id="${esc(x.id)}">Reject</button>` : ''}` : `${x.newsId ? `<a class="btn sm" href="#/admin/news" data-act="edit-news" data-id="${esc(x.newsId)}">Open in News posts</a>` : ''}`}<button class="btn sm ghost" data-act="pt-delete" data-id="${esc(x.id)}">Delete</button></div></div>
    </details>`;
  return top + `${PTA.err ? `<div class="warn">${esc(PTA.err)}</div>` : ''}
    <div class="a-card"><div class="card-title" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h3 style="margin:0">Waiting for review (${pend.length})</h3><button class="btn sm" data-act="pt-reload">Refresh</button></div>
      ${PTA.subs === null ? '<p class="muted">Loading…</p>' : pend.map(card).join('') || '<p class="muted">Nothing waiting. 🩵</p>'}</div>
    ${done.length ? `<div class="a-card"><h3>Reviewed (${done.length})</h3>${done.map(card).join('')}</div>` : ''}
    ${ptStaffCard(d, mem)}` + onBox;
}

function ptStaffCard(d, mem) {
  const AC = window.Accounts, appr = AC ? AC.approved(d) : null, links = appr ? Object.values(appr) : [];
  const uids = PTA.uids || [], has = new Set(uids.map(x => x.uid));
  const tName = id => id ? ((byId(d.teams, id) || {}).name || 'Unknown team') : 'Press / media';
  const roleSel = (id, cur = 'Team Principal') => `<select id="${id}">${window.Portal.ROLES.map(r => `<option ${r === cur ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>`;
  const teamSel = (id, cur) => `<select id="${id}">${d.teams.map(t => `<option value="${esc(t.id)}" ${t.id === cur ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}<option value="" ${cur === '' ? 'selected' : ''}>— None (press / media) —</option></select>`;
  const avail = links.filter(l => !has.has(l.uid)).sort((a, b) => String(a.discordName).localeCompare(String(b.discordName)));
  const rows = [
    ...uids.map(m => `<tr><td>${m.discordId ? `<span class="ac-badge" style="margin:0">${AC.dcFace({ discordId: m.discordId, discordAvatar: m.discordAvatar })}<span>${esc(m.discordName || m.name)}</span><i>✓</i></span>` : '<span class="muted">Discord account</span>'}</td><td>${esc(m.name)}</td><td>${esc(window.Portal.roleName(m.role))}</td><td>${esc(tName(m.teamId))}</td><td class="c-act"><button class="iconbtn del" data-act="pt-rm-uid" data-uid="${esc(m.uid)}" data-name="${esc(m.name)}" title="Remove access">✕</button></td></tr>`),
    ...mem.map(m => `<tr><td class="mono" style="font-size:13px">✉ ${esc(m.email)}</td><td>${esc(m.name)}</td><td>${esc(window.Portal.roleName(m.role))}</td><td>${esc(tName(m.teamId))}</td><td class="c-act"><button class="iconbtn del" data-act="pt-rm" data-email="${esc(m.email)}" title="Remove access">✕</button></td></tr>`)
  ].join('');
  return `<div class="a-card" style="overflow-x:auto"><h3>Staff access</h3>
    <p class="hint" style="margin:-4px 0 12px">Give access to someone's <b>linked Discord account</b> — they link it under 👤 My account and you approve it in <a href="#/admin/accounts">Accounts</a>. No emails needed. Each person can only write for their own team.</p>
    ${rows ? `<table class="rtable"><thead><tr><th>Account</th><th>Name shown</th><th>Role</th><th>Team</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="muted">Nobody has access yet.</p>'}
    <h4 style="margin:18px 0 8px">Give access with Discord</h4>
    ${appr === null ? '<p class="muted">Loading linked accounts…</p>' : avail.length ? `<div class="fgrid pt-dc-add">
        <label class="fld"><span>Linked Discord account</span><select id="pt-d-uid">${avail.map(l => { const f = ptDefaults(d, l); return `<option value="${esc(l.uid)}" data-team="${esc(f.teamId)}" data-name="${esc(f.name)}" data-role="${esc(f.role)}">${esc(l.discordName)} (@${esc(l.discordUser)})${f.from ? ' · ' + esc(f.from) : ''}</option>`; }).join('')}</select></label>
        <label class="fld"><span>Name shown on articles</span><input type="text" id="pt-d-name" value="${esc(ptDefaults(d, avail[0]).name)}" maxlength="60"></label>
        <label class="fld"><span>Role</span>${roleSel('pt-d-role', ptDefaults(d, avail[0]).role)}</label>
        <label class="fld"><span>Team</span>${teamSel('pt-d-team', ptDefaults(d, avail[0]).teamId)}</label>
      </div><div class="toolbar" style="margin-top:10px"><button class="btn sm primary" data-act="pt-add-dc">+ Give access</button></div>`
      : `<p class="muted">${links.length ? 'Every approved Discord account already has access.' : 'No approved Discord accounts yet — people link theirs under 👤 My account, then you approve them in <a href="#/admin/accounts">Accounts</a>.'}</p>`}
    <details class="pt-email-add" style="margin-top:16px"><summary>Or give access by Google email (older way)</summary>
      <div class="fgrid" style="margin-top:12px">
        <label class="fld"><span>Their Google email</span><input type="text" id="pt-m-email" placeholder="principal@gmail.com"></label>
        <label class="fld"><span>Name shown on articles</span><input type="text" id="pt-m-name"></label>
        <label class="fld"><span>Role</span>${roleSel('pt-m-role')}</label>
        <label class="fld"><span>Team</span>${teamSel('pt-m-team', (d.teams[0] || {}).id)}</label>
      </div>
      <div class="toolbar" style="margin-top:10px"><button class="btn sm" data-act="pt-add">+ Give access by email</button></div>
      <p class="hint">Emails are stored privately in Firebase — never in your public site files.</p>
    </details>
  </div>`;
}
/* defaults for portal access from what the account has claimed: team personnel first, then their driver, then their Discord name */
function ptDefaults(d, l) {
  if (!l) return { name: '', role: 'Team Principal', teamId: (d.teams[0] || {}).id || '', from: '' };
  const st = LG.staffOf(d, l.uid), drv = l.driverId && byId(d.drivers, l.driverId);
  const roleFrom = r => /chief/i.test(r) ? 'Chief Executive Officer' : /exec|ceo/i.test(r) ? 'Executive Officer' : /manager/i.test(r) ? 'Team Manager' : 'Team Principal';
  if (st) return { name: st.name, role: roleFrom(st.roles.find(r => /principal|exec|chief|manager/i.test(r)) || st.roles[0]), teamId: st.team.id, from: `${st.name} (${st.roles.join(', ')})` };
  if (drv) return { name: drv.name, role: 'Team Principal', teamId: drv.teamId || '', from: drv.name };
  return { name: l.discordName, role: 'Team Principal', teamId: (d.teams[0] || {}).id || '', from: '' };
}
// picking an account fills in its name, role and team
document.addEventListener('change', e => {
  if (e.target.id !== 'pt-d-uid') return;
  const o = e.target.selectedOptions[0]; if (!o) return;
  const set = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined) el.value = v; };
  set('pt-d-name', o.dataset.name); set('pt-d-role', o.dataset.role); set('pt-d-team', o.dataset.team);
});

/* ---------------- grid draft admin ---------------- */
const GDA = { players: null, drafts: null, err: '' };
function secGridDraft(d) {
  const GD = window.GridDraft, c = GD.cfg(d);
  d.gridDraft = Object.assign({}, GD.DEFAULTS, d.gridDraft || {});
  const fbOk = c.firebase && c.firebase.apiKey;
  let cards = null; try { cards = GD.buildCards(d); } catch (e) { cards = { drivers: [], constructors: [] }; }
  const s = fbOk ? GD.store(d) : null;
  const isAdm = s && s.user && String(c.admins || '').toLowerCase().split(/[\s,;]+/).includes(String(s.user.email || '').toLowerCase());
  const host = location.hostname || 'your-site.github.io';
  const pct = v => (Math.round(v * 1000) / 10).toFixed(1) + '%';
  const probTable = (list, isD) => list.length ? `<table class="rtable gd-ptable"><thead><tr><th>Card</th><th>Type</th><th>Season</th><th>Points</th><th>Point share</th><th>Rarity</th><th>Draw probability</th></tr></thead><tbody>${[...list].sort((a, b) => (b.seasonNum || 0) - (a.seasonNum || 0) || b.points - a.points).map(x => `<tr><td><b>${esc(x.name)}</b></td><td>${isD ? 'Driver' : 'Constructor'}</td><td>${esc(LG.seasonName(x.season))}</td><td class="mono">${LG.fmtPts(x.points)}</td><td class="mono">${pct(x.share)}</td><td><span class="gd-rar r-${x.rarity}">${GD.R_LABEL[x.rarity]}</span></td><td class="mono">${x.prob > 0 ? `<b>${pct(x.prob)}</b>` : '<span class="muted">Not in pool</span>'}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No eligible cards yet — they appear once drivers have race results.</p>';
  const rules = GD.rulesText(d);
  return head('Grid Draft', 'A card-drafting mini-game scored with real championship points. Players sign in with Google; their attempts, rerolls and teams are stored in your own free Firebase project.', '<a class="btn" href="#/griddraft">View game</a>') + `
    <div class="a-card"><h3>Setup (one time, about 10 minutes)</h3>
      <ol class="steps gd-steps">
        <li><b>Create the project.</b> Go to <a href="https://console.firebase.google.com" target="_blank" rel="noopener">console.firebase.google.com</a> → <b>Create a project</b> (any name, Google Analytics off is fine). The free <b>Spark</b> plan is all you need.</li>
        <li><b>Add a web app.</b> In the project overview click the <b>&lt;/&gt;</b> (Web) icon → give it a nickname → <b>Register app</b> (skip "Firebase Hosting"). Copy the <code>firebaseConfig = { … }</code> block it shows and paste it in box ① below.</li>
        <li><b>Turn on Google sign-in.</b> Build → <b>Authentication</b> → Get started → Sign-in method → <b>Google</b> → Enable → pick a support email → Save.</li>
        <li><b>Allow your website.</b> Authentication → <b>Settings</b> → <b>Authorized domains</b> → Add domain → <code>${esc(host)}</code>.</li>
        <li><b>Create the database.</b> Build → <b>Firestore Database</b> → Create database → any location near you → start in <b>production mode</b>.</li>
        <li><b>Paste the security rules.</b> Firestore → <b>Rules</b> tab → delete everything → paste the rules from box ③ → <b>Publish</b>. These are what stop cheating (extra attempts, extra rerolls, rigged picks).</li>
        <li>Put your Google email in <b>Admin emails</b>, tick <b>Grid Draft is on</b>, click <b>Publish</b> here, then press <b>Test connection</b>.</li>
      </ol>
      <p class="hint">The config values aren't secret — they only identify your project. Security comes from the rules in step 6.</p>
    </div>
    <div class="a-card"><h3>① Connection</h3><div class="fgrid">
      ${F.check('Grid Draft is on (shows in More, and a button on the home page)', 'gridDraft.enabled', c.enabled)}
      <label class="fld wide"><span>Firebase config — paste the whole <code>firebaseConfig = { … }</code> block</span><textarea id="gd-fbconf" rows="5" placeholder="const firebaseConfig = {\n  apiKey: &quot;…&quot;,\n  authDomain: &quot;…&quot;,\n  projectId: &quot;…&quot;,\n  …\n};">${fbOk ? esc(JSON.stringify(c.firebase, null, 2)) : ''}</textarea></label>
      ${F.text('Admin emails — can run Grid Draft & review Team portal articles (comma-separated)', 'gridDraft.admins', c.admins || '', 'wide placeholder="you@gmail.com"')}
    </div>
    <div class="toolbar" style="margin-top:12px"><button class="btn sm primary" data-act="gd-saveconf">Save config</button>${fbOk ? `<button class="btn sm" data-act="gd-test">Test connection</button><span class="ok-note" style="margin:0;padding:6px 10px">Project: <b>${esc(c.firebase.projectId)}</b></span>` : ''}</div></div>
    <div class="a-card"><h3>② Game rules</h3><div class="fgrid">
      ${F.num('Draft attempts per reset', 'gridDraft.attempts', c.attempts, 'data-reload')}
      ${F.num('Global reset every (hours)', 'gridDraft.periodHours', c.periodHours, 'data-reload')}
      ${F.num('Cooldown between drafts (seconds)', 'gridDraft.cooldownSec', c.cooldownSec, 'data-reload')}
    </div><p class="hint">Resets happen for everyone at the same time on a shared UTC schedule. <b>If you change these three, re-copy the rules into Firebase (box ③).</b></p>
      <h4 style="margin:16px 0 8px">Rarity</h4><div class="fgrid">
      ${F.num('Icon: 2nd place within … % of the leader', 'gridDraft.iconGap', c.iconGap, 'data-reload')}
      ${F.num('Prime: how many after Icon', 'gridDraft.primeCount', c.primeCount, 'data-reload')}
      ${F.num('Elite: top … % of the rest', 'gridDraft.elitePct', c.elitePct, 'data-reload')}
      ${F.num('Advanced: next … % of the rest', 'gridDraft.advancedPct', c.advancedPct, 'data-reload')}
    </div><p class="hint">Basic is everyone else (and genuine zero-point entries). Drivers are ranked against others from the <b>same season</b>; constructors against each other.</p>
      <h4 style="margin:16px 0 8px">Draw probability</h4><div class="fgrid">
      ${F.num('Minimum chance per card (%)', 'gridDraft.minProb', c.minProb, 'data-reload')}
      ${F.num('Maximum chance per card (%)', 'gridDraft.maxProb', c.maxProb, 'data-reload')}
      ${F.num('Smoothing (higher = more even)', 'gridDraft.smoothing', c.smoothing, 'data-reload')}
    </div><p class="hint">Higher points share → lower chance of appearing. The game uses exactly the numbers in the tables below.</p></div>
    <div class="a-card"><h3>③ Firestore security rules</h3><p class="hint" style="margin:-4px 0 10px">Copy all of this into Firebase → Firestore Database → Rules → Publish.${!String(c.admins || '').includes('@') ? ' <b style="color:var(--pink-soft)">Add your admin email first.</b>' : ''}</p>
      <textarea class="gd-rules" readonly rows="10">${esc(rules)}</textarea>
      <div class="toolbar" style="margin-top:10px"><button class="btn sm primary" data-act="gd-copyrules">Copy rules</button></div></div>
    ${gdSetsCard(d, c, cards)}
    <div class="a-card"><h3>Constructor points for Grid Draft</h3><p class="hint" style="margin:-4px 0 10px">For the <b>current season</b> only. Leave empty to use each team's championship points. These are cleared when a new season starts (the old values stay saved in that season's card set).</p>
      <div class="ft-price-grid">${d.teams.map((t, i) => `<label class="ft-price-row"><span class="swatch" style="--tc:${esc(LG.teamColor(t))}"></span><span class="ft-pn">${esc(t.name)}<small>${LG.fmtPts(((cards.constructors.find(x => x.key === t.id) || {}).points) || 0)} pts in use</small></span><input type="number" step="any" data-num data-path="teams.${i}.gdPoints" data-reload value="${esc(t.gdPoints ?? '')}" placeholder="auto"></label>`).join('')}</div></div>
    <div class="a-card" style="overflow-x:auto"><h3>Driver cards (${cards.drivers.length})</h3>${probTable(cards.drivers, true)}</div>
    <div class="a-card" style="overflow-x:auto"><h3>Constructor cards (${cards.constructors.length})</h3>${probTable(cards.constructors, false)}</div>
    <div class="a-card" style="overflow-x:auto"><h3>Players & attempts</h3>
      ${!fbOk ? '<p class="muted">Connect Firebase first.</p>' : !s || !s.ready ? '<p class="muted">Connecting…</p>' : !s.user ? '<button class="btn sm" data-act="gd-adminsignin">Sign in with Google to view players</button>' : !isAdm ? `<p class="warn">Signed in as ${esc(s.user.email)}, which isn't in Admin emails.</p>` : `
        <div class="toolbar" style="margin-bottom:10px"><button class="btn sm" data-act="gd-loadplayers">${GDA.players ? 'Refresh' : 'Load players & drafts'}</button><button class="btn sm danger" data-act="gd-reset">Global reset now</button><span class="muted" style="font-size:13px">Reset restores everyone's attempts and expires unfinished drafts. Teams and scores are kept.</span></div>
        ${GDA.err ? `<p class="warn">${esc(GDA.err)}</p>` : ''}
        ${GDA.players ? (() => { const pi = GD.periodInfo(d, s); const rows = GDA.players.map(p => ({ p, sc: p.team ? GD.teamScore(cards, p.team) : null, n: (GDA.drafts || []).filter(x => x.uid === p.uid).length })).sort((a, b) => (b.sc ? b.sc.total : -1) - (a.sc ? a.sc.total : -1));
          const byName = [...rows].sort((a, b) => String(a.p.name).localeCompare(String(b.p.name)));
          const picker = rows.length ? `<div class="gd-pickrow"><label class="fld"><span>Reset one player</span><select id="gd-pickp">${byName.map(({ p, sc }) => `<option value="${esc(p.uid)}" ${GDA.pick === p.uid ? 'selected' : ''}>${esc(p.name)} — ${p.period === pi.key ? p.attempts : 0}/${c.attempts} used${sc ? ' · ' + LG.fmtPts(sc.total) + ' pts' : ''}</option>`).join('')}</select></label>
            <button class="btn sm" data-act="gd-resetpick">↺ Reset rolls</button><button class="btn sm danger" data-act="gd-wipepick">🗑 Full reset</button>
            <p class="hint" style="flex-basis:100%;margin:0"><b>Reset rolls</b> gives them all their attempts back for this reset period (team and score kept). <b>Full reset</b> deletes their team, score and draft history — they pick a username and start from zero next time.</p></div>` : '';
          return picker + `<p class="muted" style="font-size:13px">${rows.length} players · ${(GDA.drafts || []).length} drafts · ${(GDA.drafts || []).filter(x => x.stage === 'done').length} completed</p><table class="rtable"><thead><tr><th>Player</th><th>Attempts this reset</th><th>Total drafts</th><th>Current team</th><th>Score</th><th>Last draft</th><th></th></tr></thead><tbody>${rows.map(({ p, sc, n }) => `<tr><td><b>${esc(p.name)}</b></td><td class="mono">${p.period === pi.key ? p.attempts : 0}/${c.attempts}</td><td class="mono">${n}</td><td style="font-size:12.5px">${p.team ? ['d1', 'd2', 'c'].map(k => esc((cards.byId[p.team[k]] || {}).name || '?')).join(' · ') : '<span class="muted">—</span>'}</td><td class="c-pts">${sc ? LG.fmtPts(sc.total) : '—'}</td><td class="muted" style="font-size:12.5px">${p.lastStart ? new Date(p.lastStart).toLocaleString() : ''}</td><td>${p.period === pi.key && p.attempts > 0 ? `<button class="btn xs" data-act="gd-resetone" data-uid="${esc(p.uid)}" data-name="${esc(p.name)}" title="Give this player all their attempts back">↺ Reset rolls</button>` : ''}<button class="iconbtn del" data-act="gd-wipe" data-uid="${esc(p.uid)}" data-name="${esc(p.name)}" title="Full reset — delete this player's team, score and drafts">✕</button></td></tr>`).join('')}</tbody></table>`; })() : ''}`}
    </div>`;
}

function gdSetsCard(d, c, cards) {
  const GD = window.GridDraft, cur = String(d.league.season), saved = cards.live;
  const src = { set: '💾 Saved set', hof: '🏆 From Hall of Fame', live: '🟢 Live (this season)' };
  const pctS = v => v === undefined ? '—' : (Math.round(v * 1000) / 10) + '%';
  const rows = [...cards.seasons].reverse().map(s => {
    const o = GD.seasonOpt(c, s.key), k = s.key.replace(/[^\w-]/g, '_'), base = `gridDraft.seasonOpts.${k}`;
    const hasSaved = s.src === 'set' || (s.current && saved);
    return `<tr class="${o.off ? 'gd-off' : ''}"><td><b>${esc(LG.seasonName(s.label))}</b>${s.current ? ' <span class="chip">newest</span>' : ''}<div class="muted" style="font-size:12px">${src[s.src]}${s.src === 'set' && (c.sets || []).find(x => x.key === s.key) ? ' · ' + new Date((c.sets.find(x => x.key === s.key) || {}).savedAt).toLocaleDateString() : ''}${s.current && saved ? ` · backup saved ${new Date(saved.savedAt).toLocaleDateString()}` : ''}</div></td>
      <td class="mono">${s.drivers.length} / ${s.constructors.length}</td>
      <td><label class="tgl"><input type="checkbox" data-gd-opt="${esc(s.key)}" data-k="on" ${o.off ? '' : 'checked'}><span>${o.off ? 'Off' : 'In pool'}</span></label></td>
      <td>${s.current ? `<span class="muted" style="font-size:12.5px">Gets ${esc(c.newShare ?? 50)}%</span>` : `<input type="number" min="0" step="0.5" style="width:80px" data-gd-opt="${esc(s.key)}" data-k="weight" value="${esc(o.weight)}">`}</td>
      <td class="mono">${pctS(s.share && s.share.drivers)}</td>
      <td><input type="text" style="min-width:150px" maxlength="24" data-gd-opt="${esc(s.key)}" data-k="edition" value="${esc(o.edition)}" placeholder="e.g. Sakura Edition"></td>
      <td class="c-act" style="white-space:nowrap">${s.current ? `<button class="btn xs" data-act="gd-saveset">${saved ? '↻ Update backup' : '💾 Save now'}</button>` : ''}${hasSaved && !s.current ? `<button class="iconbtn del" data-act="gd-delset" data-key="${esc(s.key)}" title="Delete this saved card set">✕</button>` : ''}</td></tr>`;
  }).join('');
  return `<div class="a-card" style="overflow-x:auto"><h3>Card sets by season</h3>
    <p class="hint" style="margin:-4px 0 12px">Each season has its own cards. When you <b>start a new season</b>, this season's cards are saved automatically (photos, teams, points and all), so they can still be pulled — and score exactly the same — after the new season begins. The newest season's cards are built live from your results.</p>
    <div class="fgrid">${F.num('Chance a pull comes from the newest season (%)', 'gridDraft.newShare', c.newShare ?? 50, 'data-reload min="0" max="100"')}</div>
    <p class="hint">The rest is split between older seasons by their <b>weight</b> (1 = normal, 2 = twice as likely, 0 = never). Untick <b>In pool</b> to retire a season's cards from pulls — players who already own them keep their scores. An <b>edition</b> name is printed on that season's cards.</p>
    <table class="rtable gd-sets" style="margin-top:12px"><thead><tr><th>Season</th><th>Drivers / Teams</th><th>Pulls</th><th>Weight</th><th>Driver pull share</th><th>Edition name</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    ${saved ? '' : `<p class="hint" style="margin-top:10px">Tip: “Save now” keeps a backup of ${esc(LG.seasonName(cur))}'s cards. It doesn't freeze them — the live cards keep updating until the season changes.</p>`}</div>`;
}
document.addEventListener('change', e => {
  const el = e.target.closest && e.target.closest('[data-gd-opt]'); if (!el) return;
  const d = D(), g = d.gridDraft = d.gridDraft || {}, so = g.seasonOpts = g.seasonOpts || {};
  const o = so[el.dataset.gdOpt] = so[el.dataset.gdOpt] || {}, k = el.dataset.k;
  if (k === 'on') o.off = !el.checked; else if (k === 'weight') o.weight = Math.max(0, Number(el.value) || 0); else o.edition = el.value.trim().slice(0, 24);
  commit();
});
/* save this season's Grid Draft cards (called right before a new season clears the results) */
function gdKeepSeasonBackup(d) { return window.GridDraft && window.GridDraft.saveSet(d); }
function gdKeepSeason(d) {
  const set = window.GridDraft && window.GridDraft.saveSet(d);
  if (set) d.teams.forEach(t => { delete t.gdPoints; });
  return set;
}

async function gdPlayerAct(what, b, d) {
  const s = window.GridDraft.store(d), uid = b.dataset.uid, name = b.dataset.name;
  if (what === 'rolls') {
    if (!(await Pop.confirm(b.isConnected ? b : document.querySelector('[data-act="gd-resetpick"]'), { title: 'Reset rolls', text: `Give <b>${esc(name)}</b> all their attempts back for this reset period?`, ok: 'Reset rolls' }))) return;
    try { await s.resetPlayer(uid); const p = (GDA.players || []).find(x => x.uid === uid); if (p) p.attempts = 0; toast(`${name}'s rolls are reset`); }
    catch (x) { toast('Could not reset: ' + (x.code || x.message) + (/permission/.test(x.code || x.message) ? ' — re-copy the rules from Grid Draft ③ into Firebase first' : ''), 'err'); }
    return rerender();
  }
  if (!(await Pop.confirm(b.isConnected ? b : document.querySelector('[data-act="gd-wipepick"]'), { title: `Fully reset ${name}?`, text: 'Deletes their current team, leaderboard score and every draft. They choose a username and start from zero. <b>This can’t be undone.</b>', ok: 'Full reset', danger: true }))) return;
  try {
    const n = await s.wipePlayer(uid);
    GDA.players = (GDA.players || []).filter(x => x.uid !== uid); GDA.drafts = (GDA.drafts || []).filter(x => x.uid !== uid);
    if (GDA.pick === uid) GDA.pick = '';
    const G = window.GridDraft.G; G.lb = null;
    toast(`${name} was fully reset (${n} draft${n === 1 ? '' : 's'} removed)`);
  } catch (x) { toast('Could not reset: ' + (x.code || x.message), 'err'); }
  rerender();
}

/* ---------------- fantasy admin ---------------- */
function secFantasy(d) {
  const FT = window.Fantasy, f = FT.cfg(d), S = FT.standings(d);
  const priceInput = a => {
    if (a.kind === 'driver') { const i = d.drivers.findIndex(x => x.id === a.id); return `<input type="number" step="0.5" data-num data-path="drivers.${i}.fantasyValue" value="${esc(d.drivers[i].fantasyValue ?? '')}" placeholder="${esc(a.price)}">`; }
    return `<input type="number" step="0.5" data-num data-path="fantasy.prices.${a.id}" value="${esc(f.prices[a.id] ?? '')}" placeholder="${esc(a.price)}">`;
  };
  const kinds = ['driver', 'reserve', 'constructor'];
  return head('Fantasy league', 'Fans pick <b>2 drivers</b>, up to <b>2 reserve drivers</b> and up to <b>2 constructors</b> within a budget. With accounts set up they save straight to the site; otherwise they send you an entry code. The leaderboard updates from your race results.', '<a class="btn" href="#/fantasy">View page</a>') + `
    <div class="a-card"><h3>Setup</h3><div class="fgrid">
      ${F.check('Fantasy is open (adds the Fantasy tab)', 'fantasy.enabled', f.enabled)}
      ${F.num('Budget (millions)', 'fantasy.budget', f.budget, 'data-reload')}
      ${F.num('Max reserve drivers', 'fantasy.maxReserves', f.maxReserves, 'data-reload min="0" max="4" step="1"')}
      ${F.num('Min constructors (required)', 'fantasy.minConstructors', f.minConstructors ?? 1, 'data-reload min="0" max="4" step="1"')}
      ${F.num('Max constructors', 'fantasy.maxConstructors', f.maxConstructors, 'data-reload min="0" max="4" step="1"')}
      ${F.text('Where fans send codes (link — defaults to your Discord)', 'fantasy.submitUrl', f.submitUrl || '', 'placeholder="https://discord.gg/…"')}
      ${F.text('Intro line on the Fantasy page', 'fantasy.intro', f.intro || '', 'wide')}
    </div></div>
    <div class="a-card"><h3>Scoring</h3><div class="fgrid">
      <label class="fld wide"><span>Finishing position points (P1, P2, …)</span><input type="text" data-list data-path="fantasy.positions" value="${esc((f.positions || []).join(', '))}"></label>
      <label class="fld wide"><span>Sprint points (empty = sprints don't count)</span><input type="text" data-list data-path="fantasy.sprint" value="${esc((f.sprint || []).join(', '))}"></label>
      ${F.num('Captain multiplier', 'fantasy.captainMult', f.captainMult)}
      ${F.num('Pole position bonus', 'fantasy.pole', f.pole)}
      ${F.num('Fastest lap bonus', 'fantasy.fastestLap', f.fastestLap)}
      ${F.num('…only if finishing top N (0 = any)', 'fantasy.fastestLapTopN', f.fastestLapTopN)}
      ${F.num('DNF / DSQ points (e.g. -5)', 'fantasy.dnf', f.dnf)}
      ${F.num('Constructor: % of both drivers’ points', 'fantasy.constructorPct', f.constructorPct)}
      ${F.num('Reserve: % of their points when they race', 'fantasy.reservePct', f.reservePct)}
    </div>
    <div class="ft-mult-ed">
      <div><h4>Constructor success multiplier</h4><div class="fgrid">
        ${F.check('On', 'fantasy.tpMult.enabled', f.tpMult.enabled)}${F.num('Cap (max)', 'fantasy.tpMult.cap', f.tpMult.cap)}
        ${F.num('1-2 finish', 'fantasy.tpMult.oneTwo', f.tpMult.oneTwo)}${F.num('Win', 'fantasy.tpMult.win', f.tpMult.win)}${F.num('Podium', 'fantasy.tpMult.podium', f.tpMult.podium)}
        ${F.num('Both cars in points', 'fantasy.tpMult.bothPoints', f.tpMult.bothPoints)}${F.num('One car in points', 'fantasy.tpMult.onePoints', f.tpMult.onePoints)}${F.num('No points', 'fantasy.tpMult.none', f.tpMult.none)}
        ${F.num('Extra for pole / fastest lap', 'fantasy.tpMult.bonus', f.tpMult.bonus)}
      </div></div>
    </div><p class="hint">The multiplier is worked out each race from how the team did and capped at the "Cap" value. Changing scoring recalculates the whole leaderboard instantly.</p></div>
    <div class="a-card"><h3>Market prices <span class="muted" style="font-weight:400;font-size:13px">· millions · leave empty to use the suggested price shown in grey</span></h3>
      <div class="toolbar" style="margin-bottom:12px"><button class="btn sm" data-act="ft-autoprice">Fill all with suggested prices</button><button class="btn sm danger" data-act="ft-clearprice">Clear all (back to suggested)</button></div>
      ${kinds.map(k => { const list = S.assets.filter(a => a.kind === k); return list.length ? `<div class="ft-price-h">${FT.KIND_LABEL[k]}s</div><div class="ft-price-grid">${list.map(a => `<label class="ft-price-row"><span class="swatch" style="--tc:${esc(LG.teamColor(a.team))}"></span><span class="ft-pn">${esc(a.name)}<small>${esc(a.team ? a.team.name : '')} · ${LG.fmtPts((S.assetPts[a.id] || {}).total || 0)} pts</small></span>${priceInput(a)}</label>`).join('')}</div>` : ''; }).join('') || '<p class="muted">Add drivers and team personnel first.</p>'}
      <p class="hint">Any driver can be picked as a reserve. Race drivers cost the same as in the driver slots unless you set a reserve price (rows marked “Reserve”). Prices can change any time — teams already entered keep their picks.</p></div>
    <div class="a-card"><h3>Add entries from Discord</h3>
      <p class="hint" style="margin:-4px 0 10px">Copy the messages from your fantasy channel (several at once is fine) and paste them here. Codes start with <code>FTSY1.</code> A new code from someone already in the league replaces their picks from the next race that hasn't started.</p>
      <textarea id="ft-paste" rows="4" style="width:100%" placeholder="Paste entry codes here…"></textarea>
      <div class="toolbar" style="margin-top:10px"><button class="btn sm primary" data-act="ft-import">Add / update entries</button></div>
      <div id="ft-import-log"></div>
    </div>
    ${ftAccountsCard(d, f)}
    <div class="a-card" style="overflow-x:auto"><h3>Entries from codes (${f.entries.length})</h3>
      ${S.table.length ? `<table class="rtable"><thead><tr><th>#</th><th>Team</th><th>Manager</th><th>Discord</th><th>Picks now</th><th>Changes</th><th>Pts</th><th></th></tr></thead><tbody>${S.table.map(x => { const pk = x.picks || {}; const nm = id => (S.aById[id] || {}).name || '?'; const i = f.entries.indexOf(x.entry); return `<tr><td class="c-pos">${x.rank}</td><td><b>${esc(x.entry.team)}</b></td><td>${esc(x.entry.manager)}</td><td class="muted">${esc(x.entry.discord || '')}</td><td style="font-size:12.5px">${esc((pk.d || []).map(id => nm(id).split(' ').pop() + (id === pk.c ? '★' : '')).join(', '))}${(pk.k || []).length ? ' · ' + esc(pk.k.map(id => nm(id)).join(', ')) : ''}</td><td class="mono">${(x.entry.history || []).length}</td><td class="c-pts">${LG.fmtPts(x.total)}</td><td class="c-act"><button class="iconbtn del" data-act="ft-del" data-i="${i}">✕</button></td></tr>`; }).join('')}</tbody></table>` : '<p class="muted">No entries yet.</p>'}
    </div>`;
}
function ftAccountsCard(d, f) {
  const FT = window.Fantasy, s = window.Portal && window.Portal.store(d);
  if (!s || !s.allFantasy) return `<div class="a-card"><h3>Teams saved to accounts</h3><p class="hint">Once Firebase is set up (Grid Draft ①–⑦), players sign in and save their team straight to their account — no codes needed.</p></div>`;
  const docs = FT.accountDocs(d), AC = window.Accounts, appr = AC ? AC.approved(d) : null, need = AC && AC.cfg(d).fantasyApproved;
  const S = FT.standings(d, docs.map(x => ({ id: 'u:' + x.uid, uid: x.uid, manager: x.manager, team: x.name, history: x.history.map(h => ({ from: FT.effectiveRoundFor(d, h.at), picks: h.picks })) })));
  const A = S.aById;
  const rows = S.table.filter(x => x.entry.uid).map(x => {
    const doc = docs.find(z => z.uid === x.entry.uid), last = doc.history[doc.history.length - 1], v = FT.validate(d, last.picks);
    const ok = appr && appr[x.entry.uid];
    return `<tr><td><b>${esc(x.entry.team)}</b></td><td>${esc(x.entry.manager)}</td><td>${ok ? `<span class="ac-badge">${AC.dcFace(ok)}<span>${esc(ok.discordName)}</span><i>✓</i></span>` : `<span class="chip">${need ? 'Hidden · not approved' : 'Not linked'}</span>`}</td>
      <td style="font-size:12.5px">${FT.pickIds(last.picks).map(id => esc((A[id] || {}).name || '?')).join(' · ')}</td><td class="mono">${FT.money(FT.teamCost(last.picks, A))}${v.ok ? '' : `<div class="warn-sm" title="${esc(v.errs.join(', '))}">⚠ ${esc(v.errs[0])}</div>`}</td>
      <td class="mono">${doc.history.length}</td><td class="c-pts">${LG.fmtPts(x.total)}</td><td class="c-act"><button class="iconbtn del" data-act="ft-delacct" data-uid="${esc(x.entry.uid)}" data-name="${esc(x.entry.team)}" title="Remove this team">✕</button></td></tr>`;
  }).join('');
  return `<div class="a-card" style="overflow-x:auto"><h3>Teams saved to accounts (${docs.length})</h3>
    <p class="hint" style="margin:-4px 0 10px">Players sign in on the Fantasy page and save their team — every change is time-stamped and counts from the next race that hasn't started. ${need ? 'Only accounts you’ve approved under <a href="#/admin/accounts">Accounts</a> appear on the public leaderboard.' : ''} The ⚠ flags a team that breaks the rules at today's prices (for example after someone edited it outside the site).</p>
    <div class="toolbar" style="margin-bottom:10px"><button class="btn sm" data-act="ft-reloadacct">Refresh</button></div>
    ${rows ? `<table class="rtable"><thead><tr><th>Team</th><th>Manager</th><th>Discord</th><th>Picks now</th><th>Value</th><th>Saves</th><th>Pts</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="muted">No teams saved yet.</p>'}</div>`;
}

/* ---------------- accounts (Discord links) ---------------- */
const ACA = { links: null, err: '', loading: false, players: null, pLoading: false, q: '' };
window.addEventListener('hashchange', () => { if (!/^#\/admin\/accounts/.test(location.hash) && !ACA.loading) { ACA.links = null; if (!ACA.pLoading) ACA.players = null; } });
function accReviewer(d, s) {
  const adminList = String(window.GridDraft.cfg(d).admins || '').toLowerCase().split(/[\s,;]+/);
  return s && s.user && (adminList.includes(s.user.email) || (s.siteAdmin && allowed('accounts')));
}
function secAccounts(d) {
  const AC = window.Accounts, c = AC.cfg(d), s = window.Portal.store(d);
  const top = head('Accounts', 'People sign in with Google and link their Discord. You approve every link here — approved accounts get the 🌸 verified mark, can be linked to their Driver Profile and any Team Personnel cards, and can be the only ones shown on the Grid Draft, Predictions and Fantasy leaderboards.', '<a class="btn" href="#/account">Open My account page</a>');
  const setup = `<div class="a-card"><h3>Discord setup (one time, about 5 minutes)</h3>
    <ol class="steps gd-steps">
      <li>Open <a href="https://discord.com/developers/applications" target="_blank" rel="noopener">discord.com/developers/applications</a> → <b>New Application</b> → name it after your league → Create.</li>
      <li>Go to <b>OAuth2</b> → copy the <b>Client ID</b> → paste it below. <b>Don't</b> copy the Client Secret — it isn't needed and must never go on your site.</li>
      <li>Still in <b>OAuth2</b> → <b>Redirects</b> → <b>Add Redirect</b> → paste exactly <code class="acc-uri">${esc(AC.redirectUri())}</code> → <b>Save Changes</b>. (Use your real site address when you're on it — if you open this console on GitHub Pages, the address above is already the right one.)</li>
      <li>Re-copy the Firestore rules from <a href="#/admin/griddraft">Grid Draft ③</a> into Firebase → <b>Publish</b> (they now include accounts and fantasy teams).</li>
      <li>Tick <b>Show the 👤 My account button</b> below and Publish the site.</li>
    </ol>
    <div class="acc-id">${F.text('Verified badge text', 'accounts.verifiedLabel', c.verifiedLabel || 'MRA Verified', 'maxlength="30" placeholder="MRA Verified"')}${F.text('Discord application Client ID', 'accounts.discordClientId', c.discordClientId || '', 'placeholder="e.g. 1234567890123456789" inputmode="numeric"')}</div>
    <div class="acc-opts">
      ${F.check('Show the 👤 My account button in the top bar', 'accounts.enabled', c.enabled)}
      ${F.check('Fantasy leaderboard: only show approved accounts', 'accounts.fantasyApproved', c.fantasyApproved)}
      ${F.check('Grid Draft leaderboard: only show approved accounts', 'accounts.gdApproved', c.gdApproved)}
      ${F.check('Predictions leaderboard: only show approved accounts', 'accounts.predApproved', c.predApproved)}
    </div>
    <p class="hint">Players can always play and save; these switches only decide who appears on the public leaderboards. Existing entry-code fantasy teams are unaffected.</p></div>`;
  if (!s) return top + `<div class="warn">Accounts use the same Firebase project as Grid Draft. Finish the setup in <a href="#/admin/griddraft">Grid Draft</a> first.</div>` + setup;
  if (!s.ready) return top + '<p class="muted">Connecting…</p>' + setup;
  if (!s.user) return top + `<div class="a-card"><p>Sign in with your admin Google account to review link requests.</p><button class="btn primary" data-act="pt-signin">Sign in with Google</button></div>` + setup;
  if (!accReviewer(d, s)) return top + `<div class="warn">Signed in as ${esc(s.user.email)}, which isn't in the admin emails (Grid Draft ①) or on the admin team with Accounts access.</div>` + setup;
  if (ACA.links === null && !ACA.loading) {
    ACA.loading = true;
    s.allLinks().then(x => { ACA.links = x.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)); ACA.err = ''; })
      .catch(e => { ACA.links = []; ACA.err = (e.code || e.message) + (/permission/.test(e.code || e.message) ? ' — re-copy the rules from Grid Draft ③ into Firebase.' : ''); })
      .finally(() => { ACA.loading = false; rerender(); });
  }
  const L = ACA.links || [];
  const pend = L.filter(x => x.status === 'pending'), ok = L.filter(x => x.status === 'approved'), no = L.filter(x => x.status === 'denied');
  const when = t => t ? new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
  const claimedBy = drvId => ok.find(x => x.driverId === drvId);
  const row = x => {
    const warn = [];
    const dup = L.filter(y => y.uid !== x.uid && y.discordId === x.discordId && y.status !== 'denied');
    if (dup.length) warn.push(`This Discord account is also on ${dup.length} other request${dup.length > 1 ? 's' : ''}.`);
    const cb = x.driverId && claimedBy(x.driverId); if (cb && cb.uid !== x.uid) warn.push(`${esc((byId(d.drivers, x.driverId) || {}).name || 'That driver')} is already claimed by ${esc(cb.discordName)}.`);
    const drv = byId(d.drivers, x.driverId);
    return `<div class="acc-row ${x.status}">
      ${AC.dcFace(x, 'lg')}
      <div class="acc-who"><b>${esc(x.discordName)}</b><span class="muted">@${esc(x.discordUser)}</span><span class="muted acc-id-line">ID <span class="mono">${esc(x.discordId)}</span></span><span class="muted" style="font-size:12px">${x.status === 'pending' ? 'Requested' : x.status === 'approved' ? 'Approved' : 'Denied'} ${when(x.status === 'pending' ? x.updatedAt : x.reviewedAt || x.updatedAt)}</span>
        ${warn.map(w => `<span class="warn-sm">⚠ ${w}</span>`).join('')}${x.note ? `<span class="muted" style="font-size:12.5px">Note: ${esc(x.note)}</span>` : ''}</div>
      <div class="acc-claims"><label class="fld acc-drv"><span>Driver Profile${drv && x.status !== 'approved' ? ' (their pick)' : ''}</span><select id="acc-drv-${esc(x.uid)}">${AC.driverOptions(d, x.driverId, y => { const c2 = claimedBy(y.id); return c2 && c2.uid !== x.uid; })}</select></label>
      ${staffPicker(d, x)}</div>
      <div class="acc-act">${x.status !== 'approved' ? `<button class="btn sm primary" data-act="acc-approve" data-uid="${esc(x.uid)}">✓ Approve</button>` : `<button class="btn sm" data-act="acc-approve" data-uid="${esc(x.uid)}">Save</button>`}
        ${x.status === 'pending' ? `<button class="btn sm" data-act="acc-deny" data-uid="${esc(x.uid)}">Deny</button>` : ''}<button class="iconbtn del" data-act="acc-remove" data-uid="${esc(x.uid)}" title="Remove this link">✕</button></div>
    </div>`;
  };
  return top + `${ACA.err ? `<div class="warn">${esc(ACA.err)}</div>` : ''}
    <div class="a-card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h3 style="margin:0">Waiting for approval (${pend.length})</h3><button class="btn sm" data-act="acc-reload">Refresh</button></div>
      <p class="hint" style="margin:-4px 0 12px">Check the Discord name and ID against your server (Discord → User Settings → Advanced → Developer Mode, then right-click a member → Copy User ID).</p>
      ${ACA.links === null ? '<p class="muted">Loading…</p>' : pend.map(row).join('') || '<p class="muted">No requests waiting. 🩵</p>'}</div>
    <div class="a-card"><h3>Approved (${ok.length})</h3>${ok.map(row).join('') || '<p class="muted">Nobody approved yet.</p>'}
      ${ok.length ? '<p class="hint">Changing a driver or removing a link updates the driver pages — Publish to make it live.</p>' : ''}</div>
    ${no.length ? `<div class="a-card"><h3>Denied (${no.length})</h3>${no.map(row).join('')}</div>` : ''}
    ${namesCard(d, ok)}` + setup;
}
/* names players show on the Grid Draft / Fantasy leaderboards — revert, rename or lock */
function namesCard(d, approvedLinks) {
  const GD = window.GridDraft, gs = d.gridDraft && d.gridDraft.enabled ? GD.store(d) : null, ftOn = d.fantasy && d.fantasy.enabled;
  if (gs && gs.ready && !gs.error && ACA.players === null && !ACA.pLoading) {
    ACA.pLoading = true;
    gs.players().then(x => { ACA.players = x; }).catch(() => { ACA.players = []; }).finally(() => { ACA.pLoading = false; rerender(); });
  }
  const fdocs = ftOn ? window.Fantasy.accountDocs(d) : [];
  const by = {};
  (ACA.players || []).forEach(p => { (by[p.uid] = by[p.uid] || { uid: p.uid }).gd = p; });
  fdocs.forEach(f => { (by[f.uid] = by[f.uid] || { uid: f.uid }).ft = f; });
  const link = uid => approvedLinks.find(x => x.uid === uid);
  const changed = r => (r.gd && (r.gd.origName || r.gd.nameLocked)) || (r.ft && (r.ft.origName || r.ft.origManager || r.ft.nameLocked));
  const q = ACA.q.toLowerCase();
  let rows = Object.values(by).filter(r => !q || [r.gd && r.gd.name, r.gd && r.gd.origName, r.ft && r.ft.manager, r.ft && r.ft.name, r.ft && r.ft.origManager, r.ft && r.ft.origName, (link(r.uid) || {}).discordName].filter(Boolean).some(v => String(v).toLowerCase().includes(q)));
  rows.sort((a, b) => (changed(b) ? 1 : 0) - (changed(a) ? 1 : 0) || String((a.gd || a.ft).name || (a.ft || {}).manager).localeCompare(String((b.gd || b.ft).name || (b.ft || {}).manager)));
  const was = v => v ? `<small class="nm-was">was “${esc(v)}”</small>` : '';
  const lockBtn = (kind, uid, on) => `<button class="btn xs ${on ? 'nm-locked' : ''}" data-act="nm-${kind}-lock" data-uid="${esc(uid)}" title="${on ? 'Unlock — let them change it again' : 'Lock — stop them changing it'}">${on ? '🔒 Locked' : '🔓 Lock'}</button>`;
  const cell = (kind, r) => {
    if (kind === 'gd') { const p = r.gd; if (!p) return '<td class="muted">—</td>';
      return `<td><div class="nm-cell"><b>${esc(p.name)}</b>${p.origName && p.origName !== p.name ? was(p.origName) : ''}</div><div class="nm-btns">${p.origName && p.origName !== p.name ? `<button class="btn xs" data-act="nm-gd-revert" data-uid="${esc(r.uid)}">↺ Revert</button>` : ''}<button class="btn xs" data-act="nm-gd-rename" data-uid="${esc(r.uid)}">✎ Rename</button>${lockBtn('gd', r.uid, p.nameLocked)}</div></td>`; }
    const f = r.ft; if (!f) return '<td class="muted">—</td>';
    const diff = (f.origManager && f.origManager !== f.manager) || (f.origName && f.origName !== f.name);
    return `<td><div class="nm-cell"><b>${esc(f.manager)}</b>${f.origManager && f.origManager !== f.manager ? was(f.origManager) : ''}<span>${esc(f.name)}</span>${f.origName && f.origName !== f.name ? was(f.origName) : ''}</div><div class="nm-btns">${diff ? `<button class="btn xs" data-act="nm-ft-revert" data-uid="${esc(r.uid)}">↺ Revert</button>` : ''}<button class="btn xs" data-act="nm-ft-rename" data-uid="${esc(r.uid)}">✎ Rename</button>${lockBtn('ft', r.uid, f.nameLocked)}</div></td>`;
  };
  if (!gs && !ftOn) return '';
  return `<div class="a-card" style="overflow-x:auto"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px"><h3 style="margin:0">Names on the leaderboards</h3>
      <div style="display:flex;gap:8px"><input type="search" id="nm-q" placeholder="Search names…" value="${esc(ACA.q)}" style="min-width:200px"><button class="btn sm" data-act="nm-reload">Refresh</button></div></div>
    <p class="hint" style="margin:0 0 12px">Players can change their names under 👤 My account. <b>Revert</b> puts back the first name they used, <b>Rename</b> sets any name you like, and <b>Lock</b> stops them changing it again. Changed or locked names are listed first.</p>
    ${ACA.players === null && gs ? '<p class="muted">Loading players…</p>' : rows.length ? `<table class="rtable nm-table"><thead><tr><th>Discord</th>${gs ? '<th>Grid Draft username</th>' : ''}${ftOn ? '<th>Fantasy manager / team</th>' : ''}</tr></thead><tbody>
      ${rows.map(r => { const l = link(r.uid); return `<tr class="${changed(r) ? 'nm-changed' : ''}"><td>${l ? `<span class="ac-badge" style="margin:0">${window.Accounts.dcFace(l)}<span>${esc(l.discordName)}</span><i>✓</i></span>` : '<span class="muted" style="font-size:12.5px">Not linked</span>'}</td>${gs ? cell('gd', r) : ''}${ftOn ? cell('ft', r) : ''}</tr>`; }).join('')}
    </tbody></table>` : `<p class="muted">${q ? 'No names match that search.' : 'No players yet.'}</p>`}</div>`;
}
document.addEventListener('input', e => { if (e.target.id !== 'nm-q') return; ACA.q = e.target.value; const pos = e.target.selectionStart; rerender(); const el = document.getElementById('nm-q'); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (x) { } } });
/* checkbox dropdown: tick every personnel card (role · team) this account is */
function staffPicker(d, x) {
  const all = LG.staffEntries(d), mine = all.filter(e => e.x.discord && e.x.discord.uid === x.uid);
  const chip = e => `<span class="ms-chip" style="--tc:${esc(LG.teamColor(e.team))}">${LG.teamLogo(e.team, 'xs')}<span>${esc(e.role)}</span></span>`;
  const ini = n => String(n || '').split(/\s+/).map(z => z[0] || '').join('').slice(0, 2).toUpperCase();
  const byTeam = {}; all.forEach(e => (byTeam[e.team.id] = byTeam[e.team.id] || { t: e.team, list: [] }).list.push(e));
  const tick = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
  return `<div class="fld acc-drv"><span>Team Profile cards</span><details class="ms" id="acc-staff-${esc(x.uid)}">
    <summary><span class="ms-sum">${mine.length ? mine.map(chip).join('') : '<span class="ms-none">Not team personnel</span>'}</span><svg class="ms-car" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></summary>
    <div class="ms-pop"><div class="ms-top"><span class="ms-title">Team Profile cards</span><span class="ms-count">${mine.length} selected</span></div>
      ${all.length > 6 ? '<label class="ms-qw"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg><input type="text" class="ms-q" placeholder="Search names, roles, teams…" autocomplete="off" spellcheck="false"></label>' : ''}
      <div class="ms-list">${Object.values(byTeam).map(g => `<div class="ms-g" style="--tc:${esc(LG.teamColor(g.t))}"><div class="ms-gh">${LG.teamLogo(g.t, 'xs')}<span>${esc(g.t.name)}</span></div>${g.list.map(e => { const own = e.x.discord && e.x.discord.uid === x.uid, other = e.x.discord && !own ? e.x.discord : null, w = e.x.driverId && LG.byId(d.drivers, e.x.driverId);
        return `<label class="ms-o" data-s="${esc((e.x.name + ' ' + e.role + ' ' + e.team.name).toLowerCase())}"><input type="checkbox" value="${esc(e.path)}" ${own ? 'checked' : ''}>
          <span class="avatar ms-av">${e.x.photo ? `<img src="${esc(LG.asset(e.x.photo))}" alt="" loading="lazy" onerror="this.remove()">` : esc(ini(e.x.name))}</span>
          <span class="ms-txt"><span class="ms-role">${esc(e.role)}</span><span class="ms-name">${LG.nameHTML(e.x.name)}</span>${w || other ? `<span class="ms-sub">${w ? `with #${esc(w.number ?? '')} ${esc(String(w.name).split(' ').pop())}` : ''}${w && other ? ' · ' : ''}${other ? `<span class="ms-taken">Linked to ${esc(other.name || 'someone')}</span>` : ''}</span>` : ''}</span>
          <span class="ms-box">${tick}</span>${chip(e)}</label>`; }).join('')}</div>`).join('') || '<p class="muted" style="margin:10px">No personnel added to any team yet.</p>'}</div>
    </div></details></div>`;
}
const staffPicked = uid => { const el = document.getElementById('acc-staff-' + uid); return el ? [...el.querySelectorAll('input[type=checkbox]:checked')].map(c => c.value) : null; };
document.addEventListener('change', e => {
  const ms = e.target.closest && e.target.closest('details.ms'); if (!ms || e.target.type !== 'checkbox') return;
  const on = [...ms.querySelectorAll('input[type=checkbox]:checked')], sum = ms.querySelector('.ms-sum');
  sum.innerHTML = on.length ? on.map(c => c.parentNode.querySelector('.ms-chip').outerHTML).join('') : '<span class="ms-none">Not team personnel</span>';
  ms.querySelector('.ms-count').textContent = on.length + ' selected';
});
document.addEventListener('input', e => { if (!e.target.classList || !e.target.classList.contains('ms-q')) return; const q = e.target.value.trim().toLowerCase(), ms = e.target.closest('details.ms');
  ms.querySelectorAll('.ms-o').forEach(o => { o.hidden = !!q && !o.dataset.s.includes(q); }); ms.querySelectorAll('.ms-g').forEach(g => { g.hidden = ![...g.querySelectorAll('.ms-o')].some(o => !o.hidden); }); });
document.addEventListener('pointerdown', e => { document.querySelectorAll('details.ms[open]').forEach(m => { if (!m.contains(e.target)) m.open = false; }); }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('details.ms[open]').forEach(m => { m.open = false; m.querySelector('summary').focus(); }); });
document.addEventListener('toggle', e => { const m = e.target; if (!m.classList || !m.classList.contains('ms') || !m.open) return; const q = m.querySelector('.ms-q'); if (q && matchMedia('(pointer: fine)').matches) q.focus({ preventScroll: true }); }, true);
function setStaffClaim(d, link, paths) {
  const all = LG.staffEntries(d);
  if (paths === null || paths === undefined) return; // picker not on screen — leave claims as they are
  all.forEach(e => { if (e.x.discord && e.x.discord.uid === link.uid) delete e.x.discord; });
  (Array.isArray(paths) ? paths : []).forEach(p => { const e = all.find(z => z.path === p); if (e) e.x.discord = { uid: link.uid, id: link.discordId, name: link.discordName, user: link.discordUser, avatar: link.discordAvatar }; });
}
function setDriverClaim(d, link, driverId) {
  d.drivers.forEach(x => { if (x.discord && x.discord.uid === link.uid) delete x.discord; });
  const drv = driverId && byId(d.drivers, driverId);
  if (drv) drv.discord = { uid: link.uid, id: link.discordId, name: link.discordName, user: link.discordUser, avatar: link.discordAvatar };
}

function importFantasy(d) {
  const FT = window.Fantasy, f = FT.cfg(d);
  const codes = FT.readCodes(document.getElementById('ft-paste').value);
  if (!codes.length) return toast('No entry codes found — they start with FTSY1.', 'err');
  const log = [];
  codes.sort((a, b) => String(a.ts).localeCompare(String(b.ts))).forEach(c => {
    const name = (c.t || '').trim(), mgr = (c.m || '').trim();
    if (!mgr || !c.p) { log.push(['err', 'A code was missing details — skipped.']); return; }
    const v = FT.validate(d, c.p);
    if (!v.ok) { log.push(['err', `${mgr} (${name}): ${v.errs.join(', ')} — skipped.`]); return; }
    const from = FT.effectiveRoundFor(d, c.ts);
    const r = byId(d.calendar, from);
    let en = f.entries.find(e => FT.slug(e.manager) === FT.slug(mgr) && (!e.discord || !c.dc || FT.slug(e.discord) === FT.slug(c.dc)));
    if (!en) { en = { id: uid('ft'), manager: mgr, team: name, discord: c.dc || '', history: [] }; f.entries.push(en); }
    en.team = name || en.team; if (c.dc) en.discord = c.dc;
    const h = en.history;
    if (h.length && h[h.length - 1].from === from) h[h.length - 1] = { from, picks: c.p, ts: c.ts };
    else if (!h.some(x => x.ts === c.ts)) h.push({ from: h.length ? from : (LG.rounds(d).some(x => LG.isDone(d, x)) ? from : ''), picks: c.p, ts: c.ts });
    log.push(['ok', `${mgr} — “${name}” ${h.length > 1 ? 'updated' : 'added'}${r ? `, counts from R${r.round}` : from === '__after__' ? ' (season over — won’t score)' : ''}.`]);
  });
  d.fantasy = f;
  LG.saveDraft(); rerender();
  const el = document.getElementById('ft-import-log');
  if (el) el.innerHTML = `<ul class="ft-log">${log.map(([k, m]) => `<li class="${k}">${k === 'ok' ? '✓' : '✕'} ${esc(m)}</li>`).join('')}</ul>`;
  toast(`${log.filter(x => x[0] === 'ok').length} entr${log.filter(x => x[0] === 'ok').length === 1 ? 'y' : 'ies'} added/updated`);
}

function secStewards(d) {
  const rs = LG.rounds(d);
  const order = x => { const r = byId(d.calendar, x.roundId); return r ? Number(r.round) || 0 : -1; };
  const items = d.stewards.map((x, i) => ({ x, i })).sort((a, b) => order(b.x) - order(a.x)).map(({ x, i }) => {
    const key = 'sd-' + x.id, p = `stewards.${i}`, r = byId(d.calendar, x.roundId), drv = byId(d.drivers, x.driverId);
    return `<details class="item" data-key="${key}" ${A.open[key] ? 'open' : ''}>
      <summary><span class="chip">${r ? 'R' + esc(r.round) : '—'}</span><b>${esc(x.title || 'Incident')}</b><span class="muted" style="font-size:13px">${drv ? esc(drv.name) : ''}</span><span class="badge">${esc(x.status || '')}</span>${Number(x.points) ? `<span class="tag-fl">${fmtPts(x.points)} pts</span>` : ''}</summary>
      <div class="body"><div class="fgrid">
        ${F.select('Round', p + '.roundId', x.roundId, [['', '— none —'], ...rs.map(z => [z.id, `R${z.round} · ${z.name}`])])}
        ${F.select('Session', p + '.session', x.session, [['race', 'Race'], ['sprint', 'Sprint'], ['sprintQuali', 'Sprint Qualifying'], ['quali', 'Qualifying']])}
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
  return head(esc((LG.rcName(d))), "Log incidents and decisions. They show on the " + esc(LG.rcName(d)) + " page and under that round's results. Championship points entered here are applied to the standings automatically.", '<button class="btn primary" data-act="add-sd">+ New report</button>') +
    fiaAnnouncements(d) + `<h2 style="font-size:20px;margin:26px 0 12px">Decisions & incident reports</h2><div class="a-card" style="display:flex;gap:14px;align-items:center;flex-wrap:wrap"><button class="btn primary" data-act="upload" data-mode="new-sd" data-folder="stewards" data-max="2600" data-multiple="1" data-accept="image/*,application/pdf">⬆ New report(s) from files</button><span class="hint" style="margin:0">Pick one or more filled-in templates — each becomes a report on the latest round. Then just set the dropdowns.</span></div>
    <div class="a-card">${items || '<p class="muted">No reports yet.</p>'}</div>
    <p class="hint">Time penalties that change the finishing order still need the driver moved down in <a href="#/admin/results">Results</a>.</p>`;
}

/* ---------------- hall of fame ---------------- */
function secHistory(d) {
  const items = d.history.map((h, i) => {
    const key = 'hist-' + h.id, p = `history.${i}`;
    return `<details class="item" data-key="${key}" ${A.open[key] ? 'open' : ''}>
      <summary><b class="mono" style="min-width:60px">${esc(h.season || '????')}</b>${h.hidden ? '<span class="chip">Hidden</span>' : ''}<span class="swatch" style="--tc:${esc(h.driverColor || '#39c5bb')}"></span><b>${esc(h.driverChampion || 'No champion set')}</b><span class="muted" style="font-size:13px">${esc(h.teamChampion || '')}</span>${h.standings ? '<span class="chip">full standings</span>' : ''}</summary>
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
        ${F.check('Hide this season from the Hall of Fame', p + '.hidden', !!h.hidden)}
      </div><div class="item-actions">${h.standings ? `<a class="btn sm ghost" href="#/history/${esc(h.id)}">View final standings</a><button class="btn sm" data-act="drop-snapshot" data-i="${i}">Remove standings snapshot</button>` : ''}<button class="btn sm danger" data-act="del-hist" data-i="${i}">Delete season</button></div></div>
    </details>`;
  }).join('');
  return head('Hall of fame', 'Past champions. "Start a new season" archives automatically; you can also archive now or type in seasons from before this website existed.',
    `<button class="btn" data-act="add-hist">+ Add past season</button><button class="btn primary" data-act="archive-now">♛ Archive season ${esc(d.league.season)} now</button>`) +
    `<div class="a-card"><h3>Hall of Fame look</h3><div class="fgrid">${F.select('Page style', 'theme.hofStyle', (d.theme || {}).hofStyle || 'sakura', [['sakura', '🌸 Sakura night (cherry blossoms)'], ['classic', '🏆 Classic gold']])}${F.check(`Show the current season's leader (${esc(LG.seasonName(d.league.season))}) before it's archived`, 'theme.hofCurrent', (d.theme || {}).hofCurrent !== false)}</div></div>
    <div class="a-card">${items || '<p class="muted">No seasons archived yet.</p>'}</div>
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
    <form data-form="unlock"><input type="password" id="unlock-pass" placeholder="Passcode" autofocus><button class="btn primary">Unlock</button></form>
    ${teamLock()}</div></div>`;
}
function teamLock() {
  const s = teamStore(); if (!s) return '';
  if (!s.ready) return '<p class="hint" style="margin-top:14px">Checking admin team sign-in…</p>';
  if (s.user) return `<p class="hint" style="margin-top:14px">Signed in as <b>${esc(s.user.email)}</b>, which isn't on the admin team. <a href="javascript:void 0" data-team="signout">Sign out</a></p>`;
  return `<div class="lock-or"><span>or</span></div><button class="btn" data-team="signin">Sign in with Google (admin team)</button>`;
}
function render(sec) {
  if (sec && SECTIONS.some(s => s[0] === sec)) A.section = sec;
  if (!sec) A.section = 'dashboard';
  const d = D();
  if (!unlocked()) return lockHTML();
  loadTeamKey();
  const me = team(), lim = limited();
  const fn = !allowed(A.section) ? noAccess : { access: secAccess, dashboard: secDashboard, league: secLeague, drivers: secDrivers, teams: secTeams, calendar: secCalendar, results: secResults, scoring: secScoring, adjust: secAdjust, news: secNews, publish: secPublish, theme: secTheme, stewards: secStewards, history: secHistory, signups: secSignups, rulebook: secRulebook, about: secAbout, fantasy: secFantasy, griddraft: secGridDraft, portal: secPortal, accounts: secAccounts, applications: secApplications, predictions: secPredictions, seasons: secSeasons, gallery: secGallery, slideshow: secSlideshow }[A.section];
  return `<div class="page admin">
    <aside class="admin-side"><h4>Console</h4>
      ${me ? `<div class="side-who"><b>${esc(me.name)}</b><span>${me.owner ? 'Owner' : lim ? 'Admin team' : 'Admin team · passcode'} · <a href="javascript:void 0" data-team="signout">sign out</a></span></div>` : ''}
      ${(() => { const secs = sortedSections(d).filter(([k]) => allowed(k)), lbl = (k, l) => k === 'stewards' ? esc(LG.rcName(d)) : l, cur = secs.find(([k]) => k === A.section);
        return `<button type="button" class="side-toggle" data-side-toggle aria-expanded="${A.sideOpen ? 'true' : 'false'}">${cur ? `<span class="ic">${cur[2]}</span><span class="st-l">${lbl(cur[0], cur[1])}</span>` : '<span class="st-l">Choose a section</span>'}<span class="st-n">${secs.length} sections</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
        <nav class="side-nav ${A.sideOpen ? 'open' : ''}">${secs.map(([k, l, ic]) => `<a class="side-link ${k === A.section ? 'active' : ''}" href="#/admin/${k}"><span class="ic">${ic}</span>${lbl(k, l)}</a>`).join('')}</nav>`; })()}
      <div class="status-pill ${LG.S.isDraft ? 'draft' : 'clean'}">${LG.S.isDraft ? '● Unpublished changes' : '✓ All changes live'}${LG.S.isDraft ? '<button class="btn sm primary" data-act="publish">Publish</button>' : ''}</div>
    </aside>
    <section class="admin-main">${fn(d)}</section></div>`;
}
document.addEventListener('click', e => {
  const t = e.target.closest && e.target.closest('[data-side-toggle]');
  if (t) { A.sideOpen = !A.sideOpen; const side = t.closest('.admin-side'); t.setAttribute('aria-expanded', A.sideOpen); side.querySelector('.side-nav').classList.toggle('open', A.sideOpen); if (A.sideOpen) { const a = side.querySelector('.side-link.active'); if (a) a.scrollIntoView({ block: 'nearest' }); } return; }
  if (A.sideOpen && e.target.closest && (e.target.closest('.side-link') || !e.target.closest('.admin-side'))) { A.sideOpen = false; const n = document.querySelector('.side-nav'); if (n) n.classList.remove('open'); const b = document.querySelector('[data-side-toggle]'); if (b) b.setAttribute('aria-expanded', 'false'); }
});
function noAccess() { return head('No access', 'The league owner hasn\'t given you access to this part of the console. Ask them to add it under <b>Admin team</b>.'); }
function sortedSections(d) {
  const lbl = ([k, l]) => (k === 'stewards' ? LG.rcName(d) : l).toLowerCase();
  const first = SECTIONS.filter(x => x[0] === 'dashboard'), last = SECTIONS.filter(x => x[0] === 'publish');
  return [...first, ...SECTIONS.filter(x => !['dashboard', 'publish'].includes(x[0])).sort((a, b) => lbl(a).localeCompare(lbl(b))), ...last];
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
  if (el.hasAttribute('data-lines')) return el.value.split('\n').map(x => x.trim()).filter(Boolean);
  if (el.hasAttribute('data-dt')) { if (!el.value) return ''; const t = new Date(el.value); return isNaN(t) || t.getFullYear() > 9999 ? getPath(D(), el.dataset.path) : t.toISOString(); }
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
  if (el.dataset.ctl === 'sea-import') {
    const f = el.files[0]; if (!f) return;
    const fr = new FileReader();
    fr.onload = async () => {
      let src; try { src = LG.normalize(JSON.parse(fr.result)); } catch (x) { return toast('That isn\'t a league backup file', 'err'); }
      if (String(src.league.season) === String(D().league.season) && !await Pop.ask(null, `That file is labelled ${LG.seasonName(src.league.season)}, the same as your current season. Import it as an archive anyway?`)) return;
      try { const e = await saveArchive(D(), src); if (!e) return; const h = D().history; if (!h.some(x => String(x.season) === String(e.label))) h.push(Object.assign(LG.snapshotSeason(src), { season: e.label })); toast(`${LG.seasonName(e.label)} added — Publish to show it`); commit(); }
      catch (x) { toast('Couldn\'t import: ' + x.message, 'err'); }
    };
    fr.readAsText(f); return;
  }
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
  if (el.hasAttribute('data-reload') || el.tagName === 'SELECT') {
    // date/time boxes fire "change" after every part you type (month, day, hour…) — wait until you leave the box
    if (/^(datetime-local|date|time|month|week)$/.test(el.type)) {
      clearTimeout(el._rt);
      const done = () => { if (el._done) return; el._done = true; clearTimeout(el._rt); setTimeout(() => { const act = document.activeElement, path = act && act.dataset && act.dataset.path; rerender(); if (path && act !== el) { const again = document.querySelector(`[data-path="${CSS.escape(path)}"]`); if (again) again.focus(); } }, 0); };
      if (!el._watch) { el._watch = true; el.addEventListener('blur', done, { once: true }); }
      const check = () => { if (document.activeElement === el) el._rt = setTimeout(check, 1500); else done(); };
      el._rt = setTimeout(check, 1500);
      return;
    }
    rerender();
  }
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
      if (await Pop.ask(b, msg)) { d.drivers.splice(i, 1); commit(); } return;
    }
    case 'add-team': { const t = { id: uid('team'), name: 'New Team', color: '#39c5bb' }; d.teams.push(t); A.open['team-' + t.id] = true; return commit(); }
    case 'del-team': {
      const t = d.teams[i];
      const msg = usedInResults(d, 'teamId', t.id) ? `${t.name} has scored in results. Deleting it will show those as "Unknown team" in constructor standings. Delete anyway?` : `Delete ${t.name}?`;
      if (await Pop.ask(b, msg)) { d.drivers.forEach(x => { if (x.teamId === t.id) x.teamId = ''; }); d.teams.splice(i, 1); commit(); } return;
    }
    case 'add-round': { const n = Math.max(0, ...d.calendar.map(r => Number(r.round) || 0)) + 1; const r = { id: uid('rnd'), round: n, name: 'New Grand Prix', track: '', country: '', start: '', laps: '', sprint: false }; d.calendar.push(r); A.open['rnd-' + r.id] = true; return commit(); }
    case 'del-round': { const r = d.calendar[i]; if (await Pop.ask(b, `Delete ${r.name}${LG.isDone(d, r) ? ' AND its results' : ''}?`)) { d.calendar.splice(i, 1); delete d.results[r.id]; d.adjustments.forEach(a => { if (a.roundId === r.id) a.roundId = ''; }); commit(); } return; }
    case 'sort-rounds': sortRounds(); return commit();
    case 'goto-round': e.preventDefault(); A.roundId = b.dataset.id; A.session = 'race'; location.hash = '#/admin/results'; if (A.section === 'results') rerender(); return;
    case 'session': A.session = b.dataset.s; return rerender();
    case 'add-entry': { const sel = document.getElementById('add-entry-sel'); const drv = byId(d.drivers, sel && sel.value); if (drv) { sessList().push(newEntry(drv)); commit(); } return; }
    case 'fill-all': { const l = sessList(); const used = new Set(l.map(x => x.driverId)); d.drivers.filter(x => x.active !== false && !used.has(x.id)).forEach(x => l.push(newEntry(x))); return commit(); }
    case 'copy-quali': {
      const q = (d.results[A.roundId] || {})[b.dataset.from || 'quali'] || [];
      if (sessList().length && !await Pop.ask(b, 'Replace this session\'s order with the ' + (b.dataset.from === 'sprintQuali' ? 'sprint qualifying' : 'qualifying') + ' order?')) return;
      d.results[A.roundId][A.session] = q.map(x => ({ driverId: x.driverId, teamId: x.teamId, status: 'FIN', time: '', laps: '' })); return commit();
    }
    case 'fl-auto': {
      const L = sessList(), secs = L.map(e => LG.lapSecs(e.bestLap));
      let best = -1; secs.forEach((v, k) => { if (v != null && (best < 0 || v < secs[best])) best = k; });
      if (best < 0) return toast('Type some best lap times first (e.g. 1:31.456)', 'err');
      L.forEach((e, k) => { e.fastestLap = k === best; });
      toast(`Fastest lap: ${(byId(d.drivers, L[best].driverId) || {}).name || 'driver'} · ${L[best].bestLap}`); return commit();
    }
    case 'ns-rest': {
      const L = sessList(), have = new Set(L.map(e => e.driverId));
      const add = d.drivers.filter(x => x.active !== false && !x.reserve && !have.has(x.id));
      if (!add.length) return toast('Every active driver is already in this session');
      add.forEach(x => L.push({ driverId: x.id, teamId: x.teamId || '', status: 'NS', time: '', laps: '' }));
      toast(`${add.length} driver${add.length === 1 ? '' : 's'} marked NS (no show)`); return commit();
    }
    case 'clear-session': if (await Pop.ask(b, 'Remove every entry from this session?')) { d.results[A.roundId][A.session] = []; commit(); } return;
    case 'move': { const l = sessList(), j = i + Number(b.dataset.dir); if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; return commit(); }
    case 'del-entry': sessList().splice(i, 1); return commit();
    case 'flag': { const l = sessList(), f = b.dataset.flag, was = !!l[i][f]; l.forEach(x => { x[f] = false; }); l[i][f] = !was; return commit(); }
    case 'preset': { d.scoring = clone(PRESETS[b.dataset.k]); toast('Scoring preset applied'); return commit(); }
    case 'add-adj': d.adjustments.push({ id: uid('adj'), type: 'driver', targetId: '', points: -5, roundId: A.roundId || '', reason: '' }); return commit();
    case 'del-adj': d.adjustments.splice(i, 1); return commit();
    case 'new-news': { e.preventDefault(); const n = { id: uid('news'), title: 'New post', date: new Date().toISOString().slice(0, 10), author: '', tag: '', body: '', image: '' }; d.news.push(n); A.newsId = n.id; LG.saveDraft(); if (A.section !== 'news') location.hash = '#/admin/news'; else rerender(); return; }
    case 'edit-news': A.newsId = b.dataset.id; return rerender();
    case 'del-news': if (await Pop.ask(b, 'Delete this post?')) { d.news = d.news.filter(n => n.id !== b.dataset.id); A.newsId = null; commit(); } return;
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
    case 'del-sd': if (await Pop.ask(b, 'Delete this report?')) { d.stewards.splice(i, 1); commit(); } return;
    case 'archive-now': {
      if (d.history.some(h => String(h.season) === String(d.league.season)) && !await Pop.ask(b, `${LG.seasonName(d.league.season)} is already in the Hall of fame. Add another entry anyway?`)) return;
      d.history.push(LG.snapshotSeason(d)); toast(`${LG.seasonName(d.league.season)} saved to the Hall of fame`); return commit();
    }
    case 'add-hist': { const h = { id: uid('season'), season: '', driverChampion: '', driverTeam: '', driverColor: '#39c5bb', driverPoints: '', teamChampion: '', teamColor: '#39c5bb', teamPoints: '', notes: '' }; d.history.push(h); A.open['hist-' + h.id] = true; return commit(); }
    case 'del-hist': if (await Pop.ask(b, 'Remove this season from the Hall of fame?')) { d.history.splice(i, 1); commit(); } return;
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
      if ((r.sessions || []).length && !await Pop.ask(b, 'Replace this round\'s schedule?')) return;
      const R = new Date(r.start).getTime(), H = 36e5, D = 24 * H;
      const mk = (name, off, len) => ({ name, start: new Date(R + off).toISOString(), end: len ? new Date(R + off + len).toISOString() : '' });
      const P = {
        qr: [mk('Qualifying', -0.5 * H, 0.33 * H), mk('Race', 0, 0)],
        sprint: [mk('Practice 1', -2 * D - 1.5 * H, H), mk('Sprint Qualifying', -2 * D + 2 * H, 0.75 * H), mk('Sprint', -D - 2.5 * H, 0.5 * H), mk('Qualifying', -D + H, H), mk('Race', 0, 0)],
        full: [mk('Practice 1', -2 * D - 1.5 * H, H), mk('Practice 2', -2 * D + 2 * H, H), mk('Practice 3', -D - 2.5 * H, H), mk('Qualifying', -D + H, H), mk('Race', 0, 0)]
      };
      r.sessions = P[b.dataset.k]; A.open['rnd-' + r.id] = true; return commit();
    }
    case 'adjust': return adjustExisting(b);
    case 'pr-reload': PRA.rounds = null; PRA.synced = false; return rerender();
    case 'pr-sync': return prSync(d, teamStore(), false);
    case 'pr-open': case 'pr-lock': case 'pr-hide': {
      const r = byId(d.calendar, b.dataset.r), s = teamStore(); if (!r || !s) return;
      const PRx = window.Predictions, auto = d.predictions.schedule && d.predictions.schedule.auto !== false;
      const x = b.dataset.act === 'pr-open' ? { open: true, lockAt: PRx.lockFor(r, d), openAt: auto ? PRx.openFor(r, d) : 0, manual: !auto } : b.dataset.act === 'pr-lock' ? { open: true, lockAt: Date.now(), openAt: 0, manual: true } : { open: false, lockAt: PRx.lockFor(r, d) || Date.now(), openAt: 0, manual: true };
      if (b.dataset.act === 'pr-hide' && !await Pop.ask(b, 'Hide predictions for this round? Picks already made are kept.')) return;
      b.disabled = true;
      try { await s.setPredRound(r.id, x); PRA.rounds = Object.assign({}, PRA.rounds, { [r.id]: x }); toast({ 'pr-open': `Predictions open for R${r.round} — they lock ${LG.fmtDate(x.lockAt)} ${LG.fmtTime(x.lockAt)}`, 'pr-lock': 'Locked — everyone\'s picks are now visible', 'pr-hide': 'Hidden' }[b.dataset.act]); }
      catch (e2) { toast('Could not save: ' + (e2.code || e2.message) + (/permission/.test(e2.code || e2.message) ? ' — re-copy the rules from Grid Draft ③' : ''), 'err'); }
      b.disabled = false; return rerender();
    }
    case 'combo-list': A.typing[b.dataset.pathK] = false; return rerender();
    case 'drv-sort': ADS.sort = b.dataset.s; saveADS(); return rerender();
    case 'drv-save-order': { const st = LG.computeStandings(d); const order = driverOrder(d, st); d.drivers = order.map(k => d.drivers[k]); ADS.sort = 'custom'; saveADS(); toast('Saved as your order — Publish to use it on the site'); return commit(); }
    case 'drv-expand': case 'drv-collapse': document.querySelectorAll('#drv-list details.item').forEach(el => { if (!el.hidden) { el.open = b.dataset.act === 'drv-expand'; A.open[el.dataset.key] = el.open; } }); return;
    case 'apf-add': { const f = b.dataset.tpl === 'blank' ? { id: window.Apps.uidOf('form'), title: 'New application', description: '', open: false, questions: [{ id: window.Apps.uidOf('q'), label: 'Discord username', type: 'short', required: true, options: [], help: '' }] } : window.Apps.fromTemplate(b.dataset.tpl); d.applications.forms.push(f); A.open['apf-' + f.id] = true; toast('Form added — tick "Open" when it\'s ready, then Publish'); return commit(); }
    case 'apf-del': if (await Pop.ask(b, 'Delete this form? Applications already sent stay in Firebase.')) { d.applications.forms.splice(i, 1); commit(); } return;
    case 'apq-add': d.applications.forms[i].questions.push({ id: window.Apps.uidOf('q'), label: 'New question', type: 'short', required: false, options: [], help: '' }); return commit();
    case 'apq-del': d.applications.forms[i].questions.splice(Number(b.dataset.k), 1); return commit();
    case 'ap-filter': APA.filter = b.dataset.f; return rerender();
    case 'ap-reload': APA.list = null; APA.hook = undefined; return rerender();
    case 'ap-review': {
      const s = teamStore(), a = (APA.list || []).find(x => x.id === b.dataset.id); if (!a) return;
      const note = (document.getElementById('ap-note-' + a.id) || {}).value || '', st = b.dataset.st, me = team(), who = me ? me.name : '';
      b.disabled = true;
      try {
        const clear = !!b.dataset.clear;
        await s.reviewApp(a.id, st, note.trim(), who, clear);
        if (st !== 'pending') window.Apps.notifyDecision(s, d, a, st, note.trim(), who);
        Object.assign(a, { status: st, note: note.trim(), reviewer: who, reviewedAt: Date.now() }, clear ? { signature: '', contract: '', signedAt: 0 } : {});
        toast({ accepted: 'Accepted ✓', waitlist: 'Waitlisted', denied: 'Denied', pending: 'Moved back to review', offer: 'Contract sent 📜' }[st] + ' — the applicant will see it on the site');
        if (me) me.s.log('Application ' + st, `${a.applicant} · ${a.formTitle || ''}`, who).catch(() => { });
      } catch (x) { toast('Could not save: ' + (x.code || x.message) + (/permission/.test(x.code || x.message) ? ' — Firebase still has the old rules. Copy the rules from Grid Draft ③ again and Publish them in Firebase (Firestore Database → Rules).' : ''), 'err'); }
      b.disabled = false; return rerender();
    }
    case 'ap-delete': {
      if (!await Pop.ask(b, 'Delete this application permanently? The applicant will no longer see it.')) return;
      try { await teamStore().deleteApp(b.dataset.id); APA.list = (APA.list || []).filter(x => x.id !== b.dataset.id); toast('Deleted'); } catch (x) { toast('Could not delete: ' + (x.code || x.message), 'err'); }
      return rerender();
    }
    case 'ap-hook-save': case 'ap-hook-clear': {
      const s = teamStore(), cur = APA.hook || {};
      let url = b.dataset.act === 'ap-hook-clear' ? '' : document.getElementById('ap-hook').value.trim() || cur.url || '';
      if (url && !/^https:\/\/(?:\w+\.)?discord(?:app)?\.com\/api\/webhooks\//.test(url)) return toast('That doesn\'t look like a Discord webhook link', 'err');
      if (b.dataset.act === 'ap-hook-clear' && !await Pop.ask(b, 'Disconnect Discord? New applications will no longer be posted.')) return;
      const x = { url, ping: b.dataset.act === 'ap-hook-clear' ? '' : document.getElementById('ap-ping').value.trim(), decisions: b.dataset.act === 'ap-hook-clear' ? true : document.getElementById('ap-decisions').checked };
      try { await s.setAppHook(x); APA.hook = x; toast(url ? 'Discord settings saved' : 'Discord disconnected'); } catch (e2) { toast('Could not save: ' + (e2.code || e2.message) + (/permission/.test(e2.code || e2.message) ? ' — re-copy the rules from Grid Draft ③' : ''), 'err'); }
      return rerender();
    }
    case 'ap-hook-test': {
      const h = APA.hook; if (!h || !h.url) return;
      try { const r = await fetch(h.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: (d.league.name || 'League').slice(0, 60) + ' Applications', content: '✅ Test message — applications from the website will be posted here.' }) }); toast(r.ok ? 'Test message sent — check Discord' : 'Discord refused it (' + r.status + ')', r.ok ? '' : 'err'); } catch (x) { toast('Could not reach Discord', 'err'); }
      return;
    }
    case 'reorder': {
      e.preventDefault();
      const arr = getPath(d, b.dataset.list), k = Number(b.dataset.k), j = k + Number(b.dataset.dir);
      if (!Array.isArray(arr) || j < 0 || j >= arr.length) return;
      [arr[k], arr[j]] = [arr[j], arr[k]]; return commit();
    }
    case 'ac-reload': ACT.members = null; return rerender();
    case 'ac-cancel': ACT.edit = null; return rerender();
    case 'ac-edit': { const m = (ACT.members || []).find(x => x.email === b.dataset.email); ACT.edit = m ? { email: m.email, name: m.name, sections: m.sections || [] } : null; return rerender(); }
    case 'ac-add': {
      const s = teamStore(), email = document.getElementById('ac-email').value.trim().toLowerCase(), name = document.getElementById('ac-name').value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast('Enter their Google email', 'err');
      if (!name) return toast('Add a name for them', 'err');
      if (ownerEmails().includes(email)) return toast('That email is already an owner (Grid Draft ①)', 'err');
      const sections = document.getElementById('ac-all').checked ? ['*'] : [...document.querySelectorAll('.ac-sec:checked')].map(x => x.value);
      b.disabled = true;
      try { await s.setSiteAdmin(email, { name, sections }); s.log(ACT.edit ? 'Changed access' : 'Added to admin team', `${name} (${sections.includes('*') ? 'everything' : sections.length + ' sections'})`, team() ? team().name : '').catch(() => { }); toast(ACT.edit ? 'Access updated' : `${name} can now sign in to the console`); ACT.edit = null; ACT.members = null; }
      catch (x) { toast('Could not save: ' + (x.code || x.message) + (/permission/.test(x.code || x.message) ? ' — re-copy the rules from Grid Draft ③' : ''), 'err'); }
      b.disabled = false; return rerender();
    }
    case 'ac-rm': {
      const m = (ACT.members || []).find(x => x.email === b.dataset.email); if (!m || !await Pop.ask(b, `Remove ${m.name} from the admin team?`)) return;
      try { await teamStore().removeSiteAdmin(m.email); teamStore().log('Removed from admin team', m.name, team() ? team().name : '').catch(() => { }); toast('Removed'); ACT.members = null; } catch (x) { toast('Could not remove: ' + (x.code || x.message), 'err'); }
      return rerender();
    }
    case 'ac-share': {
      const typed = document.getElementById('ac-token').value.trim(), tok = typed || ls.get(K.token), c = ghCfg();
      if (!tok) return toast('Paste a team token first (or connect GitHub on this browser under Publish & backup)', 'err');
      if (!c.owner || !c.repo) return toast('Set your GitHub username and repo under Publish & backup first', 'err');
      b.disabled = true;
      try {
        const r = await fetch(`https://api.github.com/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}`, { headers: { Authorization: `Bearer ${tok}`, Accept: 'application/vnd.github+json' }, cache: 'no-store' });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error('GitHub rejected that token: ' + (j.message || r.status));
        if (j.permissions && j.permissions.push === false) throw new Error('that token can\'t write to the repo — give it Contents: Read and write');
        await teamStore().setKey({ token: tok, owner: c.owner, repo: c.repo, branch: c.branch, path: c.path, by: team() ? team().name : '' });
        teamStore().log('Shared publishing key', `${c.owner}/${c.repo}`, team() ? team().name : '').catch(() => { });
        toast('Publishing key shared with the admin team ✓'); ACT.members = null;
      } catch (x) { toast((x.code || x.message), 'err'); }
      b.disabled = false; return rerender();
    }
    case 'ac-unshare': {
      if (!await Pop.ask(b, 'Stop sharing the publishing key? The team will be able to edit but not publish. (Also delete the token on GitHub if you think it was copied.)')) return;
      try { await teamStore().clearKey(); teamStore().log('Stopped sharing publishing key', '', team() ? team().name : '').catch(() => { }); toast('Key removed'); ACT.members = null; } catch (x) { toast('Could not remove: ' + (x.code || x.message), 'err'); }
      return rerender();
    }
    case 'gal-del': if (await Pop.ask(b, 'Remove this photo from the gallery?')) { d.gallery.splice(i, 1); commit(); } return;
    case 'th-add': { const x = d.drivers[i]; (x.history = x.history || []).push({ teamId: x.teamId || '', role: 'Race Driver', fromSeason: String(d.league.season), fromRound: 1, toSeason: '', toRound: '' }); A.open['drv-' + x.id] = true; return commit(); }
    case 'th-del': d.drivers[i].history.splice(Number(b.dataset.k), 1); return commit();
    case 'th-auto': {
      const x = d.drivers[i], season = String(d.league.season), stints = [];
      LG.rounds(d).forEach(r => { const e = [...LG.session(d, r.id, 'race'), ...LG.session(d, r.id, 'sprint')].find(z => z.driverId === x.id && z.teamId); if (!e) return; const last = stints[stints.length - 1]; if (last && last.teamId === e.teamId) last.toRound = r.round; else stints.push({ teamId: e.teamId, role: 'Race Driver', fromSeason: season, fromRound: r.round, toSeason: season, toRound: r.round }); });
      if (!stints.length) return toast('No race results for this driver this season yet', 'err');
      const lastS = stints[stints.length - 1]; if (lastS.teamId === x.teamId) { lastS.toSeason = ''; lastS.toRound = ''; }
      x.history = (x.history || []).filter(h => String(h.fromSeason) !== season).concat(stints);
      A.open['drv-' + x.id] = true; toast(`Added ${stints.length} team spell${stints.length > 1 ? 's' : ''} from this season`); return commit();
    }
    case 'mu-add': d.music = d.music || { enabled: true, tracks: [] }; (d.music.tracks = d.music.tracks || []).push({ title: '', src: '' }); return commit();
    case 'mu-del': d.music.tracks.splice(i, 1); return commit();
    case 'mu-move': { const t = d.music.tracks, j = i + Number(b.dataset.dir); if (j < 0 || j >= t.length) return; [t[i], t[j]] = [t[j], t[i]]; return commit(); }
    case 'sea-save': return seasonArchive(d, false, b);
    case 'sea-new': return seasonArchive(d, true, b);
    case 'sea-rm': if (await Pop.ask(b, 'Remove this season from the Seasons list? (The saved file stays in your GitHub repo.)')) { d.seasons = (d.seasons || []).filter(x => x.id !== b.dataset.id); commit(); } return;
    case 'pt-signin': { try { await window.Portal.store(d).signIn(); } catch (x) { toast('Sign-in failed: ' + (x.code || x.message), 'err'); } return; }
    case 'pt-reload': PTA.subs = null; PTA.members = null; if (window.Accounts) window.Accounts.refreshApproved(); return rerender();
    case 'pt-add-dc': {
      const uidv = document.getElementById('pt-d-uid').value, L = (window.Accounts.approved(d) || {})[uidv];
      if (!L) return toast('Pick a linked account', 'err');
      const name = document.getElementById('pt-d-name').value.trim() || L.discordName, role = document.getElementById('pt-d-role').value, teamId = document.getElementById('pt-d-team').value;
      try { await window.Portal.store(d).setUidMember(uidv, { name, role, teamId, discordId: L.discordId, discordName: L.discordName, discordAvatar: L.discordAvatar }); toast(`${name} can now use the portal`); PTA.members = null; }
      catch (x) { toast('Couldn\'t save: ' + (x.code || x.message) + (/permission/.test(x.code || x.message) ? ' — re-copy the rules from Grid Draft ③ into Firebase.' : ''), 'err'); }
      return rerender();
    }
    case 'pt-rm-uid': if (!await Pop.ask(b, `Remove portal access for ${b.dataset.name}?`)) return; try { await window.Portal.store(d).removeUidMember(b.dataset.uid); PTA.members = null; } catch (x) { toast('Couldn\'t remove: ' + (x.code || x.message), 'err'); } return rerender();
    case 'pt-add': {
      const email = document.getElementById('pt-m-email').value.trim().toLowerCase(), name = document.getElementById('pt-m-name').value.trim(), role = document.getElementById('pt-m-role').value.trim() || 'Team Principal', teamId = document.getElementById('pt-m-team').value;
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast('Enter their full Google email', 'err');
      if (!name) return toast('Add the name to show on their articles', 'err');
      try { await window.Portal.store(d).setMember(email, { name, role, teamId }); toast(`${name} can now use the portal`); PTA.members = null; } catch (x) { toast('Couldn\'t save: ' + (x.code || x.message), 'err'); }
      return rerender();
    }
    case 'pt-rm': if (!await Pop.ask(b, 'Remove portal access for ' + b.dataset.email + '?')) return; try { await window.Portal.store(d).removeMember(b.dataset.email); PTA.members = null; } catch (x) { toast('Couldn\'t remove: ' + (x.code || x.message), 'err'); } return rerender();
    case 'pt-changes': case 'pt-reject': {
      const note = await Pop.prompt(b, act === 'pt-changes' ? 'What should they change?' : 'Reason (optional)', '', { label: 'They’ll see this note', max: 2000, ok: act === 'pt-changes' ? 'Request changes' : 'Reject' });
      if (note === null) return;
      try { await window.Portal.store(d).review(b.dataset.id, act === 'pt-changes' ? 'changes' : 'rejected', note.trim(), ''); toast(act === 'pt-changes' ? 'Sent back for changes' : 'Rejected'); PTA.subs = null; } catch (x) { toast('Failed: ' + (x.code || x.message), 'err'); }
      return rerender();
    }
    case 'pt-delete': if (!await Pop.ask(b, 'Delete this submission permanently?')) return; try { await window.Portal.store(d).withdraw(b.dataset.id); PTA.subs = null; } catch (x) { toast('Failed: ' + (x.code || x.message), 'err'); } return rerender();
    case 'pt-approve': {
      const x = (PTA.subs || []).find(z => z.id === b.dataset.id); if (!x) { PTA.subs = null; toast('That list was out of date — refreshed, please try again', 'err'); return rerender(); }
      b.disabled = true;
      try {
        let image = '';
        if (x.image && x.image.startsWith('data:')) {
          const g = ghReady(); if (!g) { b.disabled = false; return; }
          const blob = await (await fetch(x.image)).blob();
          image = await uploadToGitHub(g, blob, 'portal-cover.jpg', 'news');
          LG.ASSET_CACHE[image] = URL.createObjectURL(blob);
        }
        if (x.kind === 'photos') {
          const g = ghReady(); if (!g) { b.disabled = false; return; }
          d.gallery = d.gallery || [];
          let k = 0;
          for (const u of x.images || []) {
            const blob = await (await fetch(u)).blob();
            const path = await uploadToGitHub(g, blob, `photo-${++k}.jpg`, 'gallery');
            LG.ASSET_CACHE[path] = URL.createObjectURL(blob);
            d.gallery.push({ id: uid('ph'), src: path, caption: x.title, credit: `${x.name} · ${x.role}`, roundId: x.roundId || '', teamId: x.teamId || '', date: new Date().toISOString().slice(0, 10) });
          }
          await window.Portal.store(d).review(x.id, 'approved', '', '');
          PTA.subs = null; toast(`${k} photo${k === 1 ? '' : 's'} added to the Gallery — press Publish to make them live`); return commit();
        }
        const t = byId(d.teams, x.teamId);
        const n = { id: uid('news'), title: x.title, date: new Date().toISOString().slice(0, 10), author: `${x.name} · ${x.role}${t ? ', ' + t.name : ''}`, tag: x.tag || (t ? 'Team news' : 'Press'), body: x.body, image, teams: t ? [t.id] : [], pinned: false, hidden: false };
        d.news.push(n);
        await window.Portal.store(d).review(x.id, 'approved', '', n.id);
        PTA.subs = null; toast('Approved and added to News — press Publish to make it live'); return commit();
      } catch (err) { b.disabled = false; toast('Approve failed: ' + (err.code || err.message), 'err'); return; }
    }
    case 'gd-saveconf': {
      const raw = document.getElementById('gd-fbconf').value.trim();
      let conf = null; try { conf = JSON.parse(raw); } catch (x) { conf = window.GridDraft.parseFirebaseConfig(raw); }
      if (!conf || !conf.apiKey || !conf.projectId || !conf.appId) return toast('Couldn\'t find apiKey, projectId and appId in that — paste the whole firebaseConfig block', 'err');
      d.gridDraft = Object.assign({}, window.GridDraft.DEFAULTS, d.gridDraft || {}, { firebase: { apiKey: conf.apiKey, authDomain: conf.authDomain || conf.projectId + '.firebaseapp.com', projectId: conf.projectId, storageBucket: conf.storageBucket || '', messagingSenderId: conf.messagingSenderId || '', appId: conf.appId } });
      toast('Firebase config saved — publish to make it live'); return commit();
    }
    case 'gd-copyrules': { const ta = document.querySelector('.gd-rules'); (navigator.clipboard ? navigator.clipboard.writeText(ta.value) : Promise.reject()).then(() => toast('Rules copied — paste them in Firebase → Firestore → Rules')).catch(() => { ta.select(); toast('Press Ctrl/⌘+C to copy'); }); return; }
    case 'gd-test': {
      const s = window.GridDraft.store(d); if (!s) return;
      for (let i = 0; i < 40 && !s.ready; i++) await new Promise(r => setTimeout(r, 150));
      if (s.error) return toast(s.error, 'err');
      try { await s.test(); toast('Connected to Firebase ✓ — the database and rules are reachable'); }
      catch (x) { toast('Firebase answered with: ' + (x.code || x.message) + (/permission/.test(x.code || x.message) ? ' — paste the rules from box ③ and publish them in Firebase.' : /not-found|NOT_FOUND|failed-precondition/.test(x.code || x.message) ? ' — create the Firestore database (setup step 5).' : ''), 'err'); }
      return;
    }
    case 'gd-adminsignin': { const s = window.GridDraft.store(d); try { await s.signIn(); } catch (x) { toast('Sign-in failed: ' + (x.code || x.message) + (/unauthorized-domain/.test(x.code || '') ? ' — add this site in Firebase → Authentication → Settings → Authorized domains.' : ''), 'err'); } return; }
    case 'gd-loadplayers': { const s = window.GridDraft.store(d); GDA.err = ''; try { GDA.players = await s.players(); GDA.drafts = await s.allDrafts(); } catch (x) { GDA.err = 'Couldn\'t load: ' + (x.code || x.message); } return rerender(); }
    case 'gd-saveset': { const st = gdKeepSeasonBackup(d); if (!st) return toast('No cards yet — they appear once drivers have race results.', 'err'); toast(`${LG.seasonName(st.label)} cards saved (${st.drivers.length} drivers, ${st.constructors.length} teams)`); return commit(); }
    case 'gd-delset': { const k = b.dataset.key; if (!await Pop.ask(b, 'Delete this saved card set? Its cards leave the pool, and players who own them will show a missing card (0 pts). This can\'t be undone after you publish.')) return; d.gridDraft.sets = (d.gridDraft.sets || []).filter(x => x.key !== k); return commit(); }
    case 'acc-reload': ACA.links = null; return rerender();
    case 'acc-approve': case 'acc-deny': case 'acc-remove': {
      const s = window.Portal.store(d), L = (ACA.links || []).find(x => x.uid === b.dataset.uid); if (!L) return;
      const sel = document.getElementById('acc-drv-' + L.uid), drvId = sel ? sel.value : L.driverId, staffPaths = staffPicked(L.uid);
      try {
        if (act === 'acc-approve') {
          const other = drvId && (ACA.links || []).find(x => x.status === 'approved' && x.driverId === drvId && x.uid !== L.uid);
          if (other && !(await Pop.confirm(b, { title: 'Driver already claimed', text: `<b>${esc((byId(d.drivers, drvId) || {}).name)}</b> is claimed by <b>${esc(other.discordName)}</b>. Move the claim to <b>${esc(L.discordName)}</b>?`, ok: 'Move claim' }))) return;
          if (other) { await s.reviewLink(other.uid, 'approved', other.note || '', ''); other.driverId = ''; }
          await s.reviewLink(L.uid, 'approved', '', drvId); Object.assign(L, { status: 'approved', driverId: drvId, reviewedAt: Date.now(), note: '' });
          setDriverClaim(d, L, drvId); setStaffClaim(d, L, staffPaths); toast(`${L.discordName} ${L.status === 'approved' && b.textContent.includes('Save') ? 'updated' : 'approved'}${drvId || (staffPaths && staffPaths.length) ? ' — Publish to show the badge on their profile' : ''}`);
        } else if (act === 'acc-deny') {
          const r = await Pop.form(b, { title: `Deny ${L.discordName}'s link?`, fields: [{ name: 'note', label: 'Note they’ll see (optional)', value: '', max: 500 }], ok: 'Deny', danger: true }); if (!r) return; const note = r.note;
          await s.reviewLink(L.uid, 'denied', note.slice(0, 500), L.driverId); Object.assign(L, { status: 'denied', note, reviewedAt: Date.now() });
          setDriverClaim(d, L, ''); setStaffClaim(d, L, []); toast('Request denied');
        } else {
          if (!(await Pop.confirm(b, { title: 'Remove this link?', text: `<b>${esc(L.discordName)}</b> loses the verified badge and driver claim. They can request again.`, ok: 'Remove', danger: true }))) return;
          await s.deleteLink(L.uid); ACA.links = ACA.links.filter(x => x.uid !== L.uid); setDriverClaim(d, L, ''); setStaffClaim(d, L, []); toast('Link removed');
        }
        window.Accounts.refreshApproved(); return commit();
      } catch (x) { toast('Couldn’t update: ' + (x.code || x.message) + (/permission/.test(x.code || x.message) ? ' — re-copy the rules from Grid Draft ③ into Firebase.' : ''), 'err'); return; }
    }
    case 'nm-reload': ACA.players = null; window.Fantasy.AC.docs = null; return rerender();
    case 'nm-gd-revert': case 'nm-gd-rename': case 'nm-gd-lock': case 'nm-ft-revert': case 'nm-ft-rename': case 'nm-ft-lock': {
      const uid = b.dataset.uid, isGd = act.startsWith('nm-gd'), what = act.split('-')[2];
      try {
        if (isGd) {
          const p = (ACA.players || []).find(x => x.uid === uid); if (!p) return;
          let name = p.name, lock = !!p.nameLocked;
          if (what === 'revert') { const r = await Pop.confirm(b, { title: 'Revert Grid Draft username', text: `Change <b>${esc(p.name)}</b> back to <b>${esc(p.origName)}</b>?`, ok: 'Revert', checks: [{ name: 'lock', label: 'Lock it so they can’t change it again', checked: true }] }); if (!r) return; name = p.origName; lock = lock || r.lock; }
          else if (what === 'rename') { const r = await Pop.form(b, { title: 'Rename Grid Draft username', fields: [{ name: 'n', label: 'Username', value: p.name, max: 24, min: 2 }], checks: [{ name: 'lock', label: 'Lock it so they can’t change it again', checked: lock }], ok: 'Save name' }); if (!r) return; name = r.n.slice(0, 24); lock = r.lock; }
          else lock = !lock;
          await window.GridDraft.store(d).adminSetName(uid, name, lock); Object.assign(p, { name, nameLocked: lock }); window.GridDraft.G.lb = null;
        } else {
          const f = window.Fantasy.accountDocs(d).find(x => x.uid === uid); if (!f) return;
          let manager = f.manager, name = f.name, lock = !!f.nameLocked;
          if (what === 'revert') { const om = f.origManager || f.manager, on = f.origName || f.name; const r = await Pop.confirm(b, { title: 'Revert Fantasy names', text: `Change back to <b>${esc(om)}</b> · <b>${esc(on)}</b>?`, ok: 'Revert', checks: [{ name: 'lock', label: 'Lock them so they can’t change it again', checked: true }] }); if (!r) return; manager = om; name = on; lock = lock || r.lock; }
          else if (what === 'rename') { const r = await Pop.form(b, { title: 'Rename Fantasy entry', fields: [{ name: 'm', label: 'Manager name', value: f.manager, max: 40, min: 1 }, { name: 't', label: 'Team name', value: f.name, max: 40, min: 1 }], checks: [{ name: 'lock', label: 'Lock them so they can’t change it again', checked: lock }], ok: 'Save names' }); if (!r) return; manager = r.m.slice(0, 40); name = r.t.slice(0, 40); lock = r.lock; }
          else lock = !lock;
          await window.Portal.store(d).adminSetFantasyNames(uid, { manager, name, locked: lock }); Object.assign(f, { manager, name, nameLocked: lock });
        }
        toast(what === 'lock' ? 'Updated' : 'Name updated'); return rerender();
      } catch (x) { toast('Couldn’t update: ' + (x.code || x.message) + (/permission/.test(x.code || x.message) ? ' — re-copy the rules from Grid Draft ③ into Firebase.' : ''), 'err'); return; }
    }
    case 'ft-reloadacct': window.Fantasy.AC.docs = null; return rerender();
    case 'ft-delacct': {
      if (!await Pop.ask(b, `Remove the fantasy team “${b.dataset.name}”? This deletes it from their account and the leaderboard.`)) return;
      try { await window.Portal.store(d).deleteFantasy(b.dataset.uid); window.Fantasy.AC.docs = null; toast('Team removed'); } catch (x) { toast('Couldn’t remove: ' + (x.code || x.message), 'err'); }
      return rerender();
    }
    case 'gd-resetpick': case 'gd-wipepick': {
      const sel = document.getElementById('gd-pickp'); if (!sel || !sel.value) return toast('Pick a player first', 'err');
      const p = (GDA.players || []).find(x => x.uid === sel.value); if (!p) return;
      GDA.pick = p.uid;
      const fake = document.createElement('button'); fake.dataset.uid = p.uid; fake.dataset.name = p.name;
      return gdPlayerAct(act === 'gd-resetpick' ? 'rolls' : 'wipe', fake, d);
    }
    case 'gd-wipe': return gdPlayerAct('wipe', b, d);
    case 'look-add': { const x = d.drivers[i]; x.looks = x.looks || []; x.looks.push({ id: uid('look'), teamId: x.teamId || '', rounds: [], photo: '', headshot: '' }); return commit(); }
    case 'look-del': { if (!(await Pop.ask(b, 'Remove this photo?', { ok: 'Remove' }))) return; d.drivers[i].looks.splice(Number(b.dataset.k), 1); return commit(); }
    case 'ss-del': { const x = d.slideshow.items[i]; if (!(await Pop.confirm(b, { title: 'Remove this photo?', text: 'It leaves the slideshow. The file stays in your uploads (and in the Gallery if it came from there).', ok: 'Remove', danger: true }))) return; d.slideshow.items.splice(i, 1); return commit(); }
    case 'ss-center': Object.assign(d.slideshow.items[i], { fx: 50, fy: 50, zoom: 1 }); return commit();
    case 'ss-galtoggle': SSA.gal = !SSA.gal; return rerender();
    case 'ss-fromgal': { const g = (d.gallery || [])[i]; if (!g) return; d.slideshow = Object.assign({ enabled: true, items: [] }, d.slideshow || {}); d.slideshow.items.push({ id: uid('sl'), src: g.src, caption: g.caption || '', roundId: g.roundId || '', event: '', credit: g.credit || '', fx: 50, fy: 50, zoom: 1 }); toast('Added to the slideshow'); return commit(); }
    case 'gd-resetone': return gdPlayerAct('rolls', b, d);
    case 'gd-reset': { if (!await Pop.ask(b, 'Reset everyone\'s attempts now? Unfinished drafts expire. Completed teams and the leaderboard are kept.')) return; const s = window.GridDraft.store(d); try { await s.adminReset(); toast('Global reset done'); } catch (x) { toast('Reset failed: ' + (x.code || x.message), 'err'); } return; }
    case 'seo-now': { const g = ghReady(); if (!g) return; b.disabled = true; try { const ch = await updateIndexMeta(g, d); toast(ch ? 'Link preview updated — live in about a minute' : 'Link preview was already up to date'); } catch (err) { toast('Couldn\'t update: ' + err.message, 'err'); } b.disabled = false; return; }
    case 'add-fia': { d.fiaNews = d.fiaNews || []; const x = { id: uid('fia'), title: 'New announcement', date: new Date().toISOString(), category: 'notice', body: '', roundId: '', docs: [] }; d.fiaNews.push(x); A.open['fia-' + x.id] = true; return commit(); }
    case 'del-fia': if (await Pop.ask(b, 'Delete this announcement?')) { d.fiaNews.splice(i, 1); commit(); } return;
    case 'del-fia-doc': d.fiaNews[i].docs.splice(Number(b.dataset.k), 1); return commit();
    case 'post-fia': { b.disabled = true; const ok = await postToDiscord(d.fiaNews[i], d); if (ok) { d.fiaNews[i].posted = new Date().toISOString(); toast('Sent to Discord ✓'); commit(); } else b.disabled = false; return; }
    case 'save-wh': { const v = document.getElementById('wh-url').value.trim(); if (v && !/^https:\/\/(?:\w+\.)?discord(?:app)?\.com\/api\/webhooks\//.test(v)) return toast('That doesn\'t look like a Discord webhook link', 'err'); ls.set(WH_KEY, v); toast(v ? 'Webhook saved in this browser' : 'Webhook removed'); return rerender(); }
    case 'forget-wh': try { localStorage.removeItem(WH_KEY); } catch (x) { } return rerender();
    case 'test-wh': { const ok = await postToDiscord({ title: 'Test message', body: 'If you can see this, the website can post announcements here. ✅', category: 'notice' }, d); if (ok) toast('Test sent — check your Discord channel'); return; }
    case 'ft-import': return importFantasy(d);
    case 'ft-del': if (await Pop.ask(b, 'Remove this fantasy team from the league?')) { d.fantasy.entries.splice(i, 1); commit(); } return;
    case 'ft-autoprice': {
      const S = window.Fantasy.standings(d);
      S.assets.forEach(a => { if (a.kind === 'driver') { const x = byId(d.drivers, a.id); if (x && !LG.S.data.drivers.find(z => z.id === a.id).fantasyValue) x.fantasyValue = a.price; } else if (d.fantasy.prices[a.id] === undefined || d.fantasy.prices[a.id] === '') d.fantasy.prices[a.id] = a.price; });
      toast('Suggested prices filled in — edit any of them'); return commit();
    }
    case 'ft-clearprice': if (await Pop.ask(b, 'Clear every custom price?')) { d.fantasy.prices = {}; d.drivers.forEach(x => { delete x.fantasyValue; }); commit(); } return;
    case 'add-person': { const arr = getPath(d, b.dataset.list) || []; arr.push({}); setPath(d, b.dataset.list, arr); return commit(); }
    case 'del-person': { const arr = getPath(d, b.dataset.list) || []; arr.splice(Number(b.dataset.k), 1); return commit(); }
    case 'rb-clear': if (await Pop.ask(b, 'Remove the imported rulebook? (The Rules page goes back to your simple rules text.)')) { d.rulebook.md = ''; commit(); } return;
    case 'publish': return publish(b);
    case 'discard-draft': if (await Pop.ask(b, 'Throw away all unpublished changes?')) LG.discardDraft(); return;
    case 'reload-live': return reloadLive();
    case 'download': return download(d, 'league.json');
    case 'new-season': {
      if (!await Pop.ask(b, 'Start a new season? A backup will download first. Results, penalties and the calendar will be cleared (nothing goes live until you publish).')) return;
      download(d, `league-${String(d.league.season).replace(/[^\w-]+/g, '_')}-backup.json`);
      d.history.push(LG.snapshotSeason(d));
      gdKeepSeason(d);
      d.results = {}; d.adjustments = []; d.stewards = []; d.calendar = [];
      const n = parseInt(d.league.season, 10); if (!isNaN(n) && String(n) === String(d.league.season).trim()) d.league.season = String(n + 1);
      toast('New season started — set up the calendar next'); return commit();
    }
  }
});

/* ---------------- about page ---------------- */
function secAbout(d) {
  const a = d.about = d.about || {};
  const team = a.team || [];
  return head('About page', 'Tell visitors what the league is about. Shown at <b>More → About</b> and in the footer.', '<a class="btn" href="#/about">View page</a>') + `
    <div class="a-card"><div class="fgrid">
      ${F.text('Page title', 'about.title', a.title || '', 'placeholder="About ' + esc(d.league.name) + '"')}
      ${F.text('Subtitle', 'about.tagline', a.tagline || '')}
      ${F.text('Founded', 'about.founded', a.founded || '', 'placeholder="2024"')}
      ${F.text('Platform', 'about.platform', a.platform || '', 'placeholder="PC · F1 25"')}
      ${F.image('Banner photo', 'about.image', a.image, 'about', 1920, 'cover')}
      ${F.area('Our story — # headings, **bold**, - lists, [links](https://…), photos', 'about.body', a.body || '', 'tall')}
      <div class="wide toolbar"><button class="btn sm" data-act="upload" data-mode="insert" data-target="about.body" data-folder="about" data-max="1920" data-multiple="1">🖼 Insert photo(s) at cursor</button></div>
    </div></div>
    <div class="a-card"><h3>League staff</h3><div class="fgrid">${F.text('Section title', 'about.teamTitle', a.teamTitle || '', 'placeholder="League staff"')}${F.select('Layout', 'about.staffStyle', a.staffStyle || 'carousel', [['carousel', 'Big profile slides (arrows)'], ['grid', 'Compact cards grid']])}</div>
      <p class="hint">Use ↑ ↓ to set the order people appear in — the first person is shown first.</p>
      <div style="margin-top:12px">${team.map((x, k) => `<div class="prow">
        <div class="prow-pic"><span class="thumb-frame round">${x.photo ? `<img src="${esc(LG.asset(x.photo))}" alt="" style="object-fit:cover" onerror="this.remove()">` : ''}</span><button class="btn xs" data-act="upload" data-mode="set" data-target="about.team.${k}.photo" data-folder="about" data-max="600" data-spec="headshot">⬆ Photo</button></div>
        <div class="prow-fields">${F.text('Name', `about.team.${k}.name`, x.name || '', 'data-reload')}${F.text('Role', `about.team.${k}.role`, x.role || '', 'placeholder="League director"')}${F.country('Country', `about.team.${k}.country`, x.country || '')}${F.text('Photo link', `about.team.${k}.photo`, x.photo || '', 'data-reload')}${F.area('Short bio (shown on the big profile slides)', `about.team.${k}.bio`, x.bio || '')}${F.text('Discord / handle (optional)', `about.team.${k}.handle`, x.handle || '')}</div>
        <div class="prow-act">${mvBtns('about.team', k, team.length)}<button class="iconbtn del" data-act="del-person" data-list="about.team" data-k="${k}" title="Remove">✕</button></div></div>`).join('')}
      <button class="btn sm" data-act="add-person" data-list="about.team">+ Add staff member</button></div></div>`;
}

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
async function importRulebook(mdText) {
  const d = D(); d.rulebook = d.rulebook || {};
  const parsed = LG.parseRulebook(mdText, d.rulebook);
  if (!parsed.chapters.length && !await Pop.ask(null, 'No chapters were detected (use Heading 1 for chapters, Heading 2 for points). Import anyway?')) return;
  if (d.rulebook.md && !await Pop.ask(null, 'Replace the current rulebook with this one?')) return;
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
/* ---------------- photo cropper ---------------- */
function loadImg(url) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; }); }
async function cropImage(blob, sp, name) {
  const url = URL.createObjectURL(blob);
  let img; try { img = await loadImg(url); } catch (e) { URL.revokeObjectURL(url); return 'original'; }
  const iw = img.naturalWidth, ih = img.naturalHeight, ar = sp.w / sp.h;
  let vw = Math.min(560, window.innerWidth - 64), vh = vw / ar;
  if (vh > 400) { vh = 400; vw = vh * ar; }
  const fitS = Math.min(vw / iw, vh / ih), fillS = Math.max(vw / iw, vh / ih);
  const startFit = /logo|car|clockLogo/i.test(sp.key || '') || sp.fit !== 'cover' && /transparent/.test(sp.fmt) && sp.w === sp.h;
  let s = startFit ? fitS : fillS, x = (vw - iw * s) / 2, y = (vh - ih * s) / 2;
  const ov = document.createElement('div');
  ov.className = 'crop-ov';
  ov.innerHTML = `<div class="crop-box" role="dialog" aria-label="Adjust photo">
    <div class="crop-head"><h3>Adjust photo</h3><span class="muted">Saves at ${sp.w} × ${sp.h} px</span></div>
    <p class="hint" style="margin:0 0 12px">Drag to move · scroll or use the slider to zoom · zoom out past "Fit" to add empty space around it.</p>
    <div class="crop-view ${sp.round ? 'round' : ''}" style="width:${vw}px;height:${vh}px"><img class="crop-img" src="${url}" alt="" draggable="false"><div class="crop-guide"></div></div>
    <div class="crop-ctl"><span>−</span><input type="range" class="crop-zoom" min="${fitS * 0.4}" max="${fillS * 4}" step="any" value="${s}"><span>+</span>
      <button class="btn xs" data-c="fit">Fit</button><button class="btn xs" data-c="fill">Fill</button><button class="btn xs" data-c="center">Centre</button></div>
    <div class="crop-actions"><button class="btn sm ghost" data-c="cancel">Cancel</button><button class="btn sm" data-c="original">Use original</button><button class="btn sm primary" data-c="apply">Save crop</button></div>
  </div>`;
  document.body.appendChild(ov);
  const im = ov.querySelector('.crop-img'), view = ov.querySelector('.crop-view'), zoom = ov.querySelector('.crop-zoom');
  const draw = () => { im.style.width = iw * s + 'px'; im.style.height = ih * s + 'px'; im.style.transform = `translate(${x}px, ${y}px)`; zoom.value = s; };
  const zoomTo = (ns, cx = vw / 2, cy = vh / 2) => { ns = Math.max(+zoom.min, Math.min(+zoom.max, ns)); x = cx - (cx - x) * (ns / s); y = cy - (cy - y) * (ns / s); s = ns; draw(); };
  draw();
  let drag = null;
  view.addEventListener('pointerdown', e => { drag = { px: e.clientX, py: e.clientY, x, y }; view.setPointerCapture(e.pointerId); view.classList.add('dragging'); });
  view.addEventListener('pointermove', e => { if (!drag) return; x = drag.x + e.clientX - drag.px; y = drag.y + e.clientY - drag.py; draw(); });
  const end = () => { drag = null; view.classList.remove('dragging'); };
  view.addEventListener('pointerup', end); view.addEventListener('pointercancel', end);
  view.addEventListener('wheel', e => { e.preventDefault(); const r = view.getBoundingClientRect(); zoomTo(s * (e.deltaY < 0 ? 1.08 : 1 / 1.08), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  zoom.addEventListener('input', () => zoomTo(+zoom.value));
  return new Promise(resolve => {
    const done = v => { ov.remove(); URL.revokeObjectURL(url); resolve(v); };
    ov.addEventListener('click', async e => {
      const c = e.target.closest('[data-c]'); if (!c) { if (e.target === ov) done(null); return; }
      const k = c.dataset.c;
      if (k === 'fit') { s = fitS; x = (vw - iw * s) / 2; y = (vh - ih * s) / 2; draw(); }
      else if (k === 'fill') { s = fillS; x = (vw - iw * s) / 2; y = (vh - ih * s) / 2; draw(); }
      else if (k === 'center') { x = (vw - iw * s) / 2; y = (vh - ih * s) / 2; draw(); }
      else if (k === 'cancel') done(null);
      else if (k === 'original') done('original');
      else if (k === 'apply') {
        const cv = document.createElement('canvas'); cv.width = sp.w; cv.height = sp.h;
        const ctx = cv.getContext('2d'), kf = sp.w / vw;
        const png = /transparent/.test(sp.fmt) || blob.type === 'image/png' || blob.type === 'image/webp';
        if (!png) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, sp.w, sp.h); }
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, x * kf, y * kf, iw * s * kf, ih * s * kf);
        cv.toBlob(b => done(b ? { blob: b, name: String(name || 'photo').replace(/\.[^.]+$/, '') + (png ? '.png' : '.jpg') } : 'original'), png ? 'image/png' : 'image/jpeg', 0.9);
      }
    });
    ov.addEventListener('keydown', e => { if (e.key === 'Escape') done(null); });
  });
}
async function adjustExisting(b) {
  const g = ghReady(); if (!g) return;
  const d = D(), cur = getPath(d, b.dataset.target);
  if (!cur) return;
  let blob;
  try { const r = await fetch(LG.asset(cur)); if (!r.ok) throw new Error(r.status); blob = await r.blob(); }
  catch (e) { return toast('Couldn\'t open that image for editing (it may be on another website, or not live yet). Save it to your computer and use ⬆ Upload instead.', 'err'); }
  const sp = Object.assign({ key: b.dataset.spec }, IMG_SPECS[b.dataset.spec]);
  const res = await cropImage(blob, sp, String(cur).split('/').pop().split('?')[0]);
  if (!res || res === 'original') return;
  try {
    toast('Uploading adjusted photo…');
    const path = await uploadToGitHub(g, res.blob, res.name, b.dataset.folder || 'misc');
    LG.ASSET_CACHE[path] = URL.createObjectURL(res.blob);
    setPath(d, b.dataset.target, path); toast('Adjusted ✓ — publish so it shows on the live site'); commit();
  } catch (err) { toast('Upload failed: ' + err.message, 'err'); }
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
      let blob = null, fname = f.name;
      if (sp && files.length === 1 && /^image\/(png|jpeg|webp)$/.test(f.type)) {
        const res = await cropImage(f, Object.assign({ key: o.spec }, sp), f.name);
        if (res === null) return;
        if (res !== 'original') { blob = res.blob; fname = res.name; }
      }
      if (!blob) { if (sp) await checkSpec(f, sp); blob = await shrinkImage(f, o.maxDim); }
      toast(`Uploading ${fname}…`);
      const path = await uploadToGitHub(g, blob, fname, o.folder);
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
  } else if (o.mode === 'slides') {
    const ss = d.slideshow = Object.assign({ enabled: true, items: [] }, d.slideshow || {}); ss.items = ss.items || [];
    done.forEach(x => ss.items.push({ id: uid('sl'), src: x.path, caption: '', roundId: '', event: '', credit: '', fx: 50, fy: 50, zoom: 1 }));
  } else if (o.mode === 'gallery') {
    d.gallery = d.gallery || []; done.forEach(x => d.gallery.unshift({ id: uid('ph'), src: x.path, caption: prettyName(x.name), credit: '', roundId: '', teamId: '', date: new Date().toISOString().slice(0, 10) }));
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
  const c = ghCfg(), tok = ghToken();
  if (!c.owner || !c.repo || !tok) {
    if (limited() || (team() && !team().owner)) { toast(TEAMKEY.loading ? 'Still fetching the team publishing key — try again in a second' : 'The league owner hasn\'t shared the publishing key yet (Admin team → Publishing key)', 'err'); return null; }
    toast('Connect GitHub first (Publish & backup → GitHub connection)', 'err'); location.hash = '#/admin/publish'; return null;
  }
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
function themeBoot(d) {
  const t = d.theme || {}, hx = (v, f) => /^#[0-9a-f]{6}$/i.test(v || '') ? v : f, D = LG.DEFAULT_THEME;
  return `<style id="theme-boot">html:root{--miku:${hx(t.accent, D.accent)};--miku-soft:${hx(t.accentSoft, D.accentSoft)};--miku-deep:${hx(t.accentDeep, D.accentDeep)};--pink:${hx(t.highlight, D.highlight)};--bg-dark:${hx(t.bgDark, D.bgDark)};--bg-light:${hx(t.bgLight, D.bgLight)}}</style>`;
}
function seoBlock(d) {
  const sx = d.seo || {}, L = d.league;
  const e = v => String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const title = sx.title || L.name || 'F1 League';
  const desc = sx.description || L.tagline || 'Official home of our F1 league: calendar, results, standings, drivers, teams and news.';
  const site = location.origin + location.pathname.replace(/[^/]*$/, '');
  const img = sx.image ? (/^https?:/.test(sx.image) ? sx.image : site + sx.image) : '';
  const color = /^#[0-9a-f]{6}$/i.test(sx.color || '') ? sx.color : (d.theme.accent || '#39c5bb');
  return ['<!--link-preview:start-->', `<title>${e(title)}</title>`, `<meta name="description" content="${e(desc)}">`, '<meta property="og:type" content="website">',
    `<meta property="og:site_name" content="${e(L.name || title)}">`, `<meta property="og:title" content="${e(title)}">`, `<meta property="og:description" content="${e(desc)}">`, `<meta property="og:url" content="${e(site)}">`,
    ...(img ? [`<meta property="og:image" content="${e(img)}">`, '<meta name="twitter:card" content="summary_large_image">'] : ['<meta name="twitter:card" content="summary">']),
    `<meta name="theme-color" content="${e(color)}">`, themeBoot(d), '<!--link-preview:end-->'].join('\n  ');
}
const b64dec = s => { const bin = atob(String(s).replace(/\s/g, '')); const bytes = Uint8Array.from(bin, c => c.charCodeAt(0)); return new TextDecoder().decode(bytes); };
async function updateIndexMeta(g, d) {
  const path = g.c.path.replace(/data\/[^/]+$/, '').replace(/[^/]+$/, '') + 'index.html';
  const api = `https://api.github.com/repos/${encodeURIComponent(g.c.owner)}/${encodeURIComponent(g.c.repo)}/contents/${path.split('/').filter(Boolean).map(encodeURIComponent).join('/')}`;
  const r = await fetch(`${api}?ref=${encodeURIComponent(g.c.branch)}&t=${Date.now()}`, { headers: g.headers, cache: 'no-store' });
  if (!r.ok) throw new Error('could not read index.html');
  const j = await r.json(), html = b64dec(j.content);
  const block = seoBlock(d);
  let next;
  if (/<!--link-preview:start-->[\s\S]*?<!--link-preview:end-->/.test(html)) next = html.replace(/<!--link-preview:start-->[\s\S]*?<!--link-preview:end-->/, block);
  else next = html.replace(/<title>[\s\S]*?<\/title>/, '').replace(/\s*<meta name="description"[^>]*>/, '').replace(/\s*<meta name="theme-color"[^>]*>/, '').replace(/(<meta name="viewport"[^>]*>)/, `$1\n  ${block}`);
  const dm = ['light', 'dark', 'system'].includes((d.theme || {}).defaultMode) ? d.theme.defaultMode : 'dark';
  next = next.replace(/<html([^>]*)>/, (m0, at) => `<html${at.replace(/\s*data-default-mode="[^"]*"/, '')} data-default-mode="${dm}">`);
  const fav = (d.league && (d.league.favicon || d.league.logo)) || '';
  if (fav && !/^data:/.test(fav)) {
    const href = esc(fav) + '?v=' + (fav.length + (d.league.favicon || '').split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 99991, 7));
    const tag = `<link rel="icon" href="${href}"><link rel="apple-touch-icon" href="${esc(fav)}">`;
    // replace the whole icon line (the default icon is an SVG data link full of < > characters)
    next = next.replace(/^[ \t]*<link rel="apple-touch-icon"[^\n]*\n/gm, '').replace(/^([ \t]*)<link rel="icon"[^\n]*$/m, (m, sp) => sp + tag);
  }
  if (next === html) return false;
  const put = await fetch(api, { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, g.headers), body: JSON.stringify({ message: 'Update site look & link preview', content: b64(next), branch: g.c.branch, sha: j.sha }) });
  if (!put.ok) throw new Error((await put.json().catch(() => ({}))).message || put.status);
  return true;
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
    const changed = changedParts(LG.S.published, out), me = team();
    const body = { message: `League update${me ? ' by ' + me.name : ''} · ${new Date().toLocaleString()}${changed.length ? ' · ' + changed.join(', ') : ''}`, content: b64(JSON.stringify(out, null, 2) + '\n'), branch: g.c.branch };
    if (sha) body.sha = sha;
    const put = await fetch(api, { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, g.headers), body: JSON.stringify(body) });
    if (!put.ok) throw new Error((await put.json().catch(() => ({}))).message || put.status);
    LG.S.published = LG.normalize(out); LG.S.data = clone(LG.S.published); LG.clearDraft();
    toast('Published! The live site updates in about a minute. 🏁');
    teamLog('Published', changed.length ? 'Changed: ' + changed.join(', ') : 'Republished');
    try { if (await updateIndexMeta(g, out)) toast('Link preview updated too.'); } catch (e) { toast('Data published, but the link preview couldn\'t be updated: ' + e.message, 'err'); }
  } catch (err) {
    toast('Publish failed: ' + err.message, 'err');
  }
  rerender();
}
const PART_NAMES = { league: 'league info', drivers: 'drivers', teams: 'constructors', calendar: 'calendar', results: 'results', scoring: 'scoring', adjustments: 'penalties', news: 'news', stewards: 'decisions', theme: 'look & theme', history: 'hall of fame', signups: 'sign-ups', about: 'about page', fantasy: 'fantasy', gridDraft: 'grid draft', gallery: 'gallery', seo: 'link preview', settings: 'settings', announcements: 'announcements', music: 'music' };
function changedParts(a, b) {
  if (!a) return [];
  return Object.keys(Object.assign({}, a, b)).filter(k => k !== 'meta' && JSON.stringify(a[k]) !== JSON.stringify(b[k])).map(k => PART_NAMES[k] || k).slice(0, 12);
}
async function reloadLive() {
  if (LG.S.isDraft && !await Pop.ask(document.querySelector('[data-act="reload-live"]'), 'This throws away your unpublished draft and loads what is live right now. Continue?')) return;
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

document.addEventListener('click', async e => {
  const b = e.target.closest('[data-team]'); if (!b) return;
  e.preventDefault();
  const s = teamStore(); if (!s) return;
  if (b.dataset.team === 'signin') { try { await s.signIn(); } catch (x) { toast('Sign-in failed: ' + (x.code || x.message), 'err'); } }
  if (b.dataset.team === 'signout') { await s.signOut(); TEAMKEY.key = undefined; ACT.members = null; }
  rerender();
});
document.addEventListener('change', e => {
  const el = e.target; if (!el.matches || !el.matches('select[data-combo]') || el.value !== '__type') return;
  e.stopImmediatePropagation(); A.typing[el.dataset.path] = true; rerender();
  setTimeout(() => { const i = document.querySelector(`[data-combo-input][data-path="${CSS.escape(el.dataset.path)}"]`); if (i) i.focus(); }, 30);
}, true);
/* ---- country picker (flags + names, searchable) ---- */
function cpFlag(c) { const e = LG.flagEmoji(c.slice(0, 2)); return `<img class="flag" src="https://flagcdn.com/w40/${c.toLowerCase()}.png" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'cp-emo',textContent:'${e}'}))">`; }
let CP = null;
function placeCP() {
  if (!CP) return; const r = CP.btn.getBoundingClientRect(), w = Math.max(r.width, 300), el = CP.el;
  if (r.bottom < 0 || r.top > innerHeight) return closeCP();
  el.style.width = w + 'px'; el.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 10)) + 'px';
  el.style.top = (innerHeight - r.bottom > 340 ? r.bottom + 6 : Math.max(10, r.top - 346)) + 'px';
}
function closeCP() { if (CP) { CP.el.remove(); CP = null; } }
function openCP(btn) {
  closeCP();
  const path = btn.dataset.cpick, cur = (document.querySelector(`input[type=hidden][data-path="${CSS.escape(path)}"]`) || {}).value || '';
  const el = document.createElement('div'); el.className = 'cpick-pop';
  el.innerHTML = `<input type="search" placeholder="Search countries…" autocomplete="off"><div class="cpick-list">${LG.countries().map(([c, n]) => `<button type="button" data-cc="${c}" class="${c === cur.toUpperCase() ? 'on' : ''}" data-s="${esc((n + ' ' + c).toLowerCase())}">${cpFlag(c)}<span>${esc(n)}</span><small class="mono">${c}</small></button>`).join('')}</div>${cur ? '<button type="button" class="cpick-clear" data-cc="">Clear</button>' : ''}`;
  document.body.appendChild(el);
  CP = { el, path, btn }; placeCP();
  const q = el.querySelector('input'); q.focus();
  const on = el.querySelector('.on'); if (on) on.scrollIntoView({ block: 'center' });
  q.addEventListener('input', () => { const t = q.value.trim().toLowerCase(); el.querySelectorAll('.cpick-list button').forEach(b => { b.hidden = !!t && !b.dataset.s.includes(t); }); });
  q.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); const f = [...el.querySelectorAll('.cpick-list button')].find(b => !b.hidden); if (f) f.click(); } if (ev.key === 'Escape') closeCP(); });
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-cpick]');
  if (b) { e.preventDefault(); return CP && CP.path === b.dataset.cpick ? closeCP() : openCP(b); }
  const c = e.target.closest && e.target.closest('.cpick-pop [data-cc]');
  if (c && CP) {
    const inp = document.querySelector(`input[type=hidden][data-path="${CSS.escape(CP.path)}"]`);
    closeCP(); if (inp) { inp.value = c.dataset.cc; inp.dispatchEvent(new Event('change', { bubbles: true })); }
    return;
  }
  if (CP && !(e.target.closest && e.target.closest('.cpick-pop'))) closeCP();
});
window.addEventListener('hashchange', closeCP);
document.addEventListener('scroll', e => { if (CP && !(e.target.closest && e.target.closest('.cpick-pop'))) placeCP(); }, true);
document.addEventListener('input', e => {
  if (e.target.id !== 'drv-q') return;
  ADS.q = e.target.value; // kept (this visit only) so the list stays filtered after edits redraw the page
  const q = e.target.value.trim().toLowerCase(); let n = 0;
  document.querySelectorAll('#drv-list details.item').forEach(el => { const hit = !q || q.split(/\s+/).every(w => el.dataset.search.includes(w)); el.hidden = !hit; if (hit) n++; });
  const none = document.querySelector('#drv-list .drv-none'); if (none) none.hidden = n > 0;
});
document.addEventListener('change', e => {
  if (e.target.dataset && e.target.dataset.seaRename) {
    const d = D(), s = (d.seasons || []).find(x => x.id === e.target.dataset.seaRename), v = e.target.value.trim();
    if (s && v && v !== s.label) {
      const old = s.label; s.label = v;
      (d.history || []).forEach(h => { if (String(h.season) === String(old)) h.season = v; });
      LG.saveDraft(); toast(`Renamed to "${v}" — Publish to update the site`); return rerender();
    }
    return;
  }
  if (e.target.id === 'drv-team') { ADS.team = e.target.value; saveADS(); return rerender(); }
  if (e.target.id === 'drv-show') { ADS.show = e.target.value; saveADS(); return rerender(); }
  if (e.target.id === 'ap-form-filter') { APA.form = e.target.value; return rerender(); }
  if (e.target.id === 'ac-all') document.querySelectorAll('.ac-sec').forEach(x => { x.disabled = e.target.checked; if (e.target.checked) x.checked = true; });
});

window.Admin = { render };
})();
