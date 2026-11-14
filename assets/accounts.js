/* =========================================================
   ACCOUNTS — Google sign-in (same Firebase as Grid Draft) + a linked
   Discord account, approved by an admin in the console.
   Approved accounts can claim their driver profile, and their Grid Draft
   and Fantasy teams show a verified badge.
   Discord is linked with Discord's own login page (OAuth2 "implicit grant"),
   so no server is needed. Because the browser reports the Discord ID,
   an admin approves every link before it counts.
   ========================================================= */
(() => {
'use strict';
const LG = window.LG;
const { esc, byId, toast, nameHTML, teamColor, fmtPts } = LG;
const TOK = 'league.dc.token', USR = 'league.dc.user', STATE = 'league.dc.state', ERR = 'league.dc.err';
const ss = { get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { } }, del(k) { try { sessionStorage.removeItem(k); } catch (e) { } } };

/* ---- 1. catch Discord's redirect back (before the router sees the #access_token=… hash) ---- */
function catchReturn() {
  const h = location.hash || '';
  if (!/(^#|&)(access_token|error)=/.test(h)) return;
  const q = new URLSearchParams(h.slice(1));
  if (q.get('error')) ss.set(ERR, q.get('error') === 'access_denied' ? 'You cancelled the Discord sign-in.' : (q.get('error_description') || q.get('error')));
  else if (q.get('access_token') && q.get('state') && q.get('state') === ss.get(STATE)) {
    ss.set(TOK, JSON.stringify({ t: q.get('access_token'), type: q.get('token_type') || 'Bearer', exp: Date.now() + (Number(q.get('expires_in')) || 600) * 1000 }));
    ss.del(USR);
  } else ss.set(ERR, 'That Discord sign-in couldn’t be verified — please try again.');
  ss.del(STATE);
  history.replaceState(null, '', location.pathname + location.search + '#/account');
  if (window.LG && LG.S && LG.S.data) setTimeout(() => LG.render(false), 0);
}
catchReturn();
window.addEventListener('hashchange', catchReturn, true);

const DEF = { verifiedLabel: 'MRA Verified', enabled: false, discordClientId: '', fantasyApproved: true, gdApproved: false };
const cfg = d => Object.assign({}, DEF, d.accounts || {});
const redirectUri = () => location.origin + location.pathname;
const avatarUrl = (id, av, size = 64) => av ? `https://cdn.discordapp.com/avatars/${encodeURIComponent(id)}/${encodeURIComponent(av)}.${String(av).startsWith('a_') ? 'gif' : 'png'}?size=${size}` : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt.asUintN(64, BigInt(id || 0)) >> 22n) % 6}.png`;
const dcFace = (l, cls = '') => `<img class="dc-av ${cls}" src="${esc(avatarUrl(l.discordId, l.discordAvatar))}" alt="" loading="lazy" onerror="if(!this.dataset.f){this.dataset.f=1;this.src='https://cdn.discordapp.com/embed/avatars/0.png'}else{this.style.visibility='hidden'}">`;
const store = d => window.Portal ? window.Portal.store(d) : null;

/* ---- 2. Discord login (redirect) + reading the Discord profile ---- */
function startDiscord(d) {
  const c = cfg(d);
  if (!c.discordClientId) return toast('Discord linking isn’t set up yet — ask an admin.', 'err');
  const st = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
  ss.set(STATE, st);
  location.href = 'https://discord.com/oauth2/authorize?' + new URLSearchParams({ client_id: c.discordClientId, response_type: 'token', redirect_uri: redirectUri(), scope: 'identify', state: st }).toString();
}
const DC = { user: null, loading: false };
function discordUser() {
  if (DC.user) return DC.user;
  try { const u = JSON.parse(ss.get(USR) || 'null'); if (u) return (DC.user = u); } catch (e) { }
  let tok = null; try { tok = JSON.parse(ss.get(TOK) || 'null'); } catch (e) { }
  if (!tok || tok.exp < Date.now()) { ss.del(TOK); return null; }
  if (!DC.loading) {
    DC.loading = true;
    fetch('https://discord.com/api/users/@me', { headers: { authorization: `${tok.type} ${tok.t}` } })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Discord said ' + r.status)))
      .then(u => { DC.user = { id: String(u.id), username: u.username || '', name: u.global_name || u.username || '', avatar: u.avatar || '' }; ss.set(USR, JSON.stringify(DC.user)); })
      .catch(e => { ss.del(TOK); ss.set(ERR, 'Couldn’t read your Discord profile (' + e.message + '). Try linking again.'); })
      .finally(() => { DC.loading = false; LG.render(false); });
  }
  return 'loading';
}
function forgetDiscord() { DC.user = null; ss.del(TOK); ss.del(USR); }

/* ---- 3. approved links (public) — used for badges and leaderboard filters ---- */
const AP = { map: null, loading: false, at: 0 };
function approved(d) {
  const s = store(d);
  if (!s || !s.ready || s.error || !s.approvedLinks) return null;
  if ((AP.map === null || Date.now() - AP.at > 60000) && !AP.loading) {
    AP.loading = true;
    s.approvedLinks().then(list => { const m = {}; list.forEach(l => { m[l.uid] = l; }); AP.map = m; }).catch(() => { AP.map = AP.map || {}; })
      .finally(() => { AP.loading = false; AP.at = Date.now(); LG.render(false); });
  }
  return AP.map;
}
const refreshApproved = () => { AP.at = 0; AP.map = null; };
function badge(d, uid, opts = {}) {
  const m = approved(d); const l = m && m[uid];
  if (!l) return '';
  return `<span class="ac-badge" title="${esc(cfg(d).verifiedLabel || 'MRA Verified')} · @${esc(l.discordUser || l.discordName)}">${dcFace(l)}${opts.name ? `<span>${esc(l.discordName)}</span>` : ''}<i>✓</i></span>`;
}
function isApproved(d, uid) { const m = approved(d); return !!(m && m[uid]); }

/* ---- 4. My account page ---- */
const ME = { link: undefined, for: '', loading: false, pick: '' };
function loadMine(s) {
  if (!s.user) { ME.link = undefined; ME.for = ''; return; }
  if (ME.for === s.user.uid || ME.loading) return;
  ME.loading = true;
  s.myLink().then(l => { ME.link = l; ME.for = s.user.uid; }).catch(() => { ME.link = null; ME.for = s.user.uid; }).finally(() => { ME.loading = false; LG.render(false); });
}
const head = (eyebrow, title, sub) => `<div class="page-head"><div class="eyebrow">${esc(eyebrow)}</div><h1>${title}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div>`;
const DCLOGO = '<svg class="dc-logo" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.3 4.4A19.6 19.6 0 0 0 15.4 3l-.6 1.3a18.2 18.2 0 0 0-5.6 0L8.6 3a19.6 19.6 0 0 0-4.9 1.5C.6 9.1-.3 13.6.1 18.1a19.8 19.8 0 0 0 6 3l1.3-2a12.8 12.8 0 0 1-2-1l.5-.4a14.1 14.1 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1l1.3 2a19.7 19.7 0 0 0 6-3c.5-5.2-.8-9.7-3.6-13.7ZM8 15.4c-1.2 0-2.2-1.1-2.2-2.4S6.8 10.6 8 10.6s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z"/></svg>';

function driverOptions(d, cur, takenBy) {
  const act = d.drivers.filter(x => x.active !== false), old = d.drivers.filter(x => x.active === false);
  const o = x => `<option value="${esc(x.id)}" ${x.id === cur ? 'selected' : ''}>${esc((x.number !== undefined && x.number !== '' ? '#' + x.number + ' · ' : '') + x.name)}${takenBy && takenBy(x) ? ' — already claimed' : ''}</option>`;
  return `<option value="">— I'm not a Driver —</option>${act.length ? `<optgroup label="Drivers">${act.map(o).join('')}</optgroup>` : ''}${old.length ? `<optgroup label="Former Drivers">${old.map(o).join('')}</optgroup>` : ''}`;
}

function page(d) {
  const c = cfg(d), s = store(d);
  const top = head('Your account', 'My account', 'Link your Discord, claim your driver profile and keep your Grid Draft and Fantasy teams in one place.');
  if (!s) return `<div class="page">${top}<div class="empty"><b>Accounts aren’t set up yet</b><p>An admin needs to finish the Firebase setup first.</p></div></div>`;
  if (s.error) return `<div class="page">${top}<div class="empty"><b>Can’t connect right now</b><p>${esc(s.error)}</p></div></div>`;
  if (!s.ready) return `<div class="page">${top}<div class="loading">Loading…</div></div>`;
  const err = ss.get(ERR); if (err) { ss.del(ERR); setTimeout(() => toast(err, 'err'), 50); }
  if (!s.user) return `<div class="page ac">${top}<div class="card ac-signin"><div class="ac-steps"><span><b>1</b>Sign in with Google</span><i></i><span><b>2</b>Link Discord</span><i></i><span><b>3</b>An admin approves</span></div>
    <p>Your Google account keeps your Grid Draft and Fantasy teams. Your email is never shown on the site.</p><button class="btn primary" data-ac="signin">Sign in with Google</button></div></div>`;
  loadMine(s);
  const l = ME.for === s.user.uid ? ME.link : undefined;
  const drv = l && l.driverId ? byId(d.drivers, l.driverId) : null;
  let link;
  if (l === undefined) link = '<p class="muted">Checking your Discord link…</p>';
  else if (l && l.status === 'approved') link = `<div class="ac-linked ok">${dcFace(l, 'lg')}<div><b>${esc(l.discordName)}</b><span class="muted">@${esc(l.discordUser)}</span><span class="ac-st ok">✓ ${esc(c.verifiedLabel || 'MRA Verified')}</span></div></div>
      ${drv ? `<p class="ac-claim"><span class="muted">Driver profile</span><a href="#/driver/${esc(drv.id)}" style="--tc:${esc(teamColor(byId(d.teams, drv.teamId)))}">${LG.avatar(drv, byId(d.teams, drv.teamId), 'sm')}${nameHTML(drv.name)}</a></p>` : '<p class="muted">Not linked to a driver profile.</p>'}
      <div class="toolbar"><button class="btn sm ghost" data-ac="unlink">Unlink Discord</button></div>`;
  else if (l && l.status === 'pending') link = `<div class="ac-linked">${dcFace(l, 'lg')}<div><b>${esc(l.discordName)}</b><span class="muted">@${esc(l.discordUser)}</span><span class="ac-st wait">⏳ Waiting for an admin to approve</span></div></div>
      <p class="muted">${drv ? `You asked to claim <b>${esc(drv.name)}</b>. ` : ''}You’ll see the verified tick here once it's approved.</p><div class="toolbar"><button class="btn sm ghost" data-ac="unlink">Cancel request</button></div>`;
  else {
    const du = discordUser();
    const denied = l && l.status === 'denied' ? `<div class="warn">Your last request wasn't approved${l.note ? `: “${esc(l.note)}”` : '.'} You can try again.</div>` : '';
    if (du === 'loading') link = denied + '<p class="muted">Reading your Discord profile…</p>';
    else if (du) link = denied + `<div class="ac-linked">${dcFace({ discordId: du.id, discordAvatar: du.avatar }, 'lg')}<div><b>${esc(du.name)}</b><span class="muted">@${esc(du.username)}</span><button class="linkish" data-ac="redo">Not you? Use a different Discord</button></div></div>
      <form class="ac-form" data-form="ac-link"><label class="fld"><span>Are you one of the league's drivers? Claim your profile</span><select name="drv">${driverOptions(d, ME.pick || (l && l.driverId) || '')}</select></label>
      <button class="btn primary">Send for approval</button></form><p class="hint">An admin checks that this Discord account belongs to you before it counts.</p>`;
    else link = denied + (c.discordClientId ? `<p>Connect the Discord account you use in the league's server.</p><button class="btn dc-btn" data-ac="discord">${DCLOGO}Link Discord</button>` : '<p class="muted">Discord linking isn’t switched on yet — check back soon.</p>');
  }
  // games
  let gd = '';
  if (window.GridDraft && d.gridDraft && d.gridDraft.enabled) {
    const g = window.GridDraft.store(d), p = g && g.profile;
    let sc = null; try { if (p && p.team) sc = window.GridDraft.teamScore(window.GridDraft.buildCards(d), p.team); } catch (e) { }
    gd = `<a class="ac-game" href="#/griddraft"><span class="ac-gi">⇄</span><span><b>Grid Draft</b><small>${p ? esc(p.name) + (sc ? ' · ' + fmtPts(sc.total) + ' pts' : ' · no team yet') : 'Not played yet'}</small></span><span class="ac-go">›</span></a>`;
  }
  let ft = '';
  if (window.Fantasy && d.fantasy && d.fantasy.enabled) {
    const row = window.Fantasy.accountRow ? window.Fantasy.accountRow(d, s.user.uid) : null;
    ft = `<a class="ac-game" href="#/fantasy/team"><span class="ac-gi">★</span><span><b>Fantasy</b><small>${row ? esc(row.entry.team) + ' · ' + (row.rank ? 'P' + row.rank + ' · ' : '') + fmtPts(row.total) + ' pts' : 'No team saved yet'}</small></span><span class="ac-go">›</span></a>`;
  }
  // names shown on the leaderboards
  const gs = window.GridDraft && d.gridDraft && d.gridDraft.enabled ? window.GridDraft.store(d) : null, gp = gs && gs.profile;
  const fdoc = window.Fantasy && d.fantasy && d.fantasy.enabled ? (window.Fantasy.accountDocs(d) || []).find(x => x.uid === s.user.uid) : null;
  const lockNote = '<small class="ac-lock">🔒 Locked by an admin</small>';
  const names = gp || fdoc ? `<section class="card ac-names"><h3>Names on the leaderboards</h3>
    <form data-form="ac-names" class="ac-names-grid">
      ${gp ? `<label class="fld"><span>Grid Draft username</span><input name="gd" minlength="2" maxlength="24" value="${esc(gp.name)}" ${gp.nameLocked ? 'disabled' : ''}>${gp.nameLocked ? lockNote : ''}</label>` : ''}
      ${fdoc ? `<label class="fld"><span>Fantasy manager name</span><input name="fm" minlength="1" maxlength="40" value="${esc(fdoc.manager)}" ${fdoc.nameLocked ? 'disabled' : ''}>${fdoc.nameLocked ? lockNote : ''}</label>
        <label class="fld"><span>Fantasy team name</span><input name="ft" minlength="1" maxlength="40" value="${esc(fdoc.name)}" ${fdoc.nameLocked ? 'disabled' : ''}></label>` : ''}
      <div class="ac-names-act"><button class="btn primary" ${(!gp || gp.nameLocked) && (!fdoc || fdoc.nameLocked) ? 'disabled' : ''}>Save names</button></div>
    </form>
    <p class="hint">Keep it friendly — admins can reset any name that breaks the league's rules.</p></section>` : '';
  return `<div class="page ac">${top}
    <div class="ac-grid">
      <section class="card"><h3>Signed in</h3><p class="ac-who"><b>${esc(s.user.displayName || 'Google account')}</b><span class="muted">Google · your email stays private</span></p><button class="btn sm ghost" data-ac="signout">Sign out</button></section>
      <section class="card ac-dc"><h3>${DCLOGO} Discord</h3>${link}</section>
      ${gd || ft ? `<section class="card"><h3>Your games</h3><div class="ac-games">${gd}${ft}</div>${!(l && l.status === 'approved') && (c.fantasyApproved || c.gdApproved) ? `<p class="hint">${[c.fantasyApproved && 'Fantasy', c.gdApproved && 'Grid Draft'].filter(Boolean).join(' and ')} leaderboard${c.fantasyApproved && c.gdApproved ? 's only show' : ' only shows'} approved accounts — link your Discord to appear.</p>` : ''}</section>` : ''}
    </div>${names}</div>`;
}

document.addEventListener('click', async e => {
  const b = e.target.closest && e.target.closest('[data-ac]'); if (!b) return;
  const d = LG.S.data, s = store(d); if (!s) return;
  const k = b.dataset.ac;
  try {
    if (k === 'signin') { await s.signIn(); return; }
    if (k === 'signout') { await s.signOut(); forgetDiscord(); ME.link = undefined; ME.for = ''; return LG.render(false); }
    if (k === 'discord') return startDiscord(d);
    if (k === 'redo') { forgetDiscord(); return startDiscord(d); }
    if (k === 'unlink') {
      if (!await Pop.ask(b, ME.link && ME.link.status === 'approved' ? 'Unlink your Discord? You’ll lose the verified tick until an admin approves a new link.' : 'Cancel your link request?')) return;
      await s.unlink(); ME.link = null; forgetDiscord(); refreshApproved(); toast('Discord unlinked'); return LG.render(false);
    }
  } catch (x) { toast('Something went wrong: ' + (x.code || x.message), 'err'); }
});
document.addEventListener('change', e => { if (e.target.closest && e.target.closest('[data-form="ac-link"]') && e.target.name === 'drv') ME.pick = e.target.value; });
document.addEventListener('submit', async e => {
  if (e.target.dataset.form !== 'ac-names') return;
  e.preventDefault();
  const d = LG.S.data, f = e.target, btn = f.querySelector('button'), done = [];
  btn.disabled = true;
  try {
    const gs = window.GridDraft && window.GridDraft.store(d);
    if (f.gd && !f.gd.disabled && gs && gs.profile) {
      const n = f.gd.value.trim().slice(0, 24);
      if (n.length < 2) throw new Error('Your Grid Draft username needs at least 2 characters.');
      if (n !== gs.profile.name) { await gs.rename(n); if (window.GridDraft.G) window.GridDraft.G.lb = null; done.push('Grid Draft'); }
    }
    if (f.fm && !f.fm.disabled) {
      const ps = store(d), doc = (window.Fantasy.accountDocs(d) || []).find(x => x.uid === ps.user.uid);
      const m = f.fm.value.trim().slice(0, 40), t = f.ft.value.trim().slice(0, 40);
      if (!m || !t) throw new Error('Fantasy names can’t be empty.');
      if (doc && (m !== doc.manager || t !== doc.name)) {
        await ps.saveFantasy({ manager: m, name: t }, false);
        const FT = window.Fantasy; FT.AC.docs = null; FT.AC.mineFor = '';
        try { const k = 'league.fantasy.myteam', my = JSON.parse(localStorage.getItem(k) || 'null'); if (my) { my.manager = m; my.name = t; localStorage.setItem(k, JSON.stringify(my)); } } catch (x) { }
        done.push('Fantasy');
      }
    }
    toast(done.length ? `Saved — your ${done.join(' and ')} name${done.length > 1 ? 's are' : ' is'} updated.` : 'Nothing changed.');
  } catch (x) { toast(x.code === 'name-locked' ? 'An admin has locked this name.' : 'Couldn’t save: ' + (x.message || x.code) + (/permission/i.test(x.code || x.message) ? ' — the league admin may need to update the Firebase rules.' : ''), 'err'); }
  btn.disabled = false; LG.render(false);
});
document.addEventListener('submit', async e => {
  if (e.target.dataset.form !== 'ac-link') return;
  e.preventDefault();
  const d = LG.S.data, s = store(d), du = discordUser();
  if (!s || !s.user || !du || du === 'loading') return;
  const btn = e.target.querySelector('button'); btn.disabled = true;
  try {
    await s.requestLink({ discordId: du.id, discordName: du.name.slice(0, 80), discordUser: du.username.slice(0, 40), discordAvatar: du.avatar.slice(0, 80), driverId: e.target.drv.value || '' }, ME.link);
    ME.link = await s.myLink(); ME.pick = '';
    toast('Sent! An admin will approve your link soon.');
    LG.render(false);
  } catch (x) { btn.disabled = false; toast('Couldn’t send: ' + (x.code || x.message) + (/permission/i.test(x.code || x.message) ? ' — the league admin may need to update the Firebase rules.' : ''), 'err'); }
});
// re-render when the shared Firebase sign-in changes
let hooked = false;
setInterval(() => { if (hooked) return; const d = LG.S && LG.S.data; const s = d && store(d); if (s && s.on) { hooked = true; s.on(() => { ME.for = ''; if (/^#\/(account|fantasy|griddraft)/.test(location.hash)) LG.render(false); }); } }, 400);

window.Accounts = { page, cfg, badge, isApproved, approved, refreshApproved, avatarUrl, dcFace, redirectUri, driverOptions, DEF };
})();
