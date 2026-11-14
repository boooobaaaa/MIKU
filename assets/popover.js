/* =========================================================
   POPOVER — small themed boxes that open right under the button
   you clicked, instead of the browser's prompt()/confirm() dialogs.
   Pop.form(anchor, { title, text, fields, checks, ok, danger }) → Promise<values | null>
   Pop.confirm(anchor, { title, text, ok, danger, checks }) → Promise<values | null>
   ========================================================= */
(() => {
'use strict';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let cur = null; // { el, anchor, resolve }

function close(result) {
  if (!cur) return;
  const c = cur; cur = null;
  c.el.classList.remove('in');
  setTimeout(() => c.el.remove(), 120);
  if (c.shade) { c.shade.classList.remove('in'); setTimeout(() => c.shade.remove(), 150); }
  if (c.anchor && c.anchor.classList) c.anchor.classList.remove('pop-open');
  c.resolve(result);
}
function place() {
  if (!cur) return;
  const a = cur.anchor, el = cur.el;
  if (cur.centre) { el.classList.add('centre'); el.style.left = Math.max(10, (innerWidth - el.offsetWidth) / 2) + 'px'; el.style.top = Math.max(16, innerHeight * .22) + 'px'; return; }
  if (!a || !a.isConnected) return close(null);
  const r = a.getBoundingClientRect(), vw = innerWidth, vh = innerHeight, pad = 10, gap = 8;
  const w = Math.min(el.offsetWidth || 320, vw - pad * 2);
  let left = r.left + r.width / 2 - w / 2;
  left = Math.max(pad, Math.min(left, vw - pad - w));
  const h = el.offsetHeight;
  const up = r.bottom + gap + h > vh - pad && r.top - gap - h > pad;
  el.style.left = left + 'px';
  el.style.top = (up ? r.top - gap - h : r.bottom + gap) + 'px';
  el.classList.toggle('up', up);
  // little arrow points at the button
  const ax = Math.max(16, Math.min(w - 16, r.left + r.width / 2 - left));
  el.style.setProperty('--ax', ax + 'px');
}
function form(anchor, o = {}) {
  close(null);
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'pop' + (o.danger ? ' danger' : '');
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', o.title || 'Edit');
    const fields = (o.fields || []).map((f, i) => `<label class="pop-f">${f.label ? `<span>${esc(f.label)}</span>` : ''}<input type="text" name="${esc(f.name)}" value="${esc(f.value || '')}" ${f.max ? `maxlength="${f.max}"` : ''} autocomplete="off" spellcheck="false" ${i === 0 ? 'data-first' : ''}>${f.max ? `<small class="pop-n"><b>${String(f.value || '').length}</b>/${f.max}</small>` : ''}</label>`).join('');
    const checks = (o.checks || []).map(c => `<label class="pop-c"><input type="checkbox" name="${esc(c.name)}" ${c.checked ? 'checked' : ''}><span>${esc(c.label)}</span></label>`).join('');
    el.innerHTML = `<form class="pop-in" novalidate>
      ${o.title ? `<div class="pop-t">${esc(o.title)}</div>` : ''}${o.text ? `<p class="pop-x">${o.text}</p>` : ''}
      ${fields}${checks}<p class="pop-err" hidden></p>
      <div class="pop-a"><button type="button" class="btn sm ghost" data-pop="cancel">Cancel</button><button type="submit" class="btn sm ${o.danger ? 'danger' : 'primary'}">${esc(o.ok || 'Save')}</button></div>
    </form>`;
    document.body.appendChild(el);
    const ds = anchor && anchor.dataset || {}, sel = ds.act ? `[data-act="${ds.act}"]${ds.uid ? `[data-uid="${ds.uid}"]` : ''}${ds.id ? `[data-id="${ds.id}"]` : ''}` : '';
    cur = { el, anchor, resolve, sel, centre: !anchor || !anchor.isConnected || !anchor.getBoundingClientRect().width };
    if (cur.centre) { const sh = document.createElement('div'); sh.className = 'pop-shade'; document.body.appendChild(sh); cur.shade = sh; requestAnimationFrame(() => sh.classList.add('in')); }
    if (anchor && anchor.classList) anchor.classList.add('pop-open');
    place();
    requestAnimationFrame(() => { el.classList.add('in'); place(); });
    const first = el.querySelector('[data-first]') || el.querySelector('button[type=submit]');
    setTimeout(() => { if (first) { first.focus({ preventScroll: true }); if (first.select) first.select(); } }, 30);
    const f = el.querySelector('form'), err = el.querySelector('.pop-err');
    f.addEventListener('input', e => { const n = e.target.parentNode.querySelector('.pop-n b'); if (n) n.textContent = e.target.value.length; err.hidden = true; });
    f.addEventListener('submit', e => {
      e.preventDefault();
      const out = {};
      (o.fields || []).forEach(x => { out[x.name] = f.elements[x.name].value.trim(); });
      (o.checks || []).forEach(x => { out[x.name] = f.elements[x.name].checked; });
      const bad = (o.fields || []).find(x => (x.min || 0) > out[x.name].length);
      if (bad) { err.textContent = `${bad.label} needs at least ${bad.min} character${bad.min === 1 ? '' : 's'}.`; err.hidden = false; f.elements[bad.name].focus(); return; }
      close(out);
    });
    el.querySelector('[data-pop="cancel"]').addEventListener('click', () => close(null));
  });
}
const confirm = (anchor, o = {}) => form(anchor, Object.assign({ ok: 'Yes' }, o, { fields: [] }));
/* drop-in for confirm(message): resolves true / false. Picks a sensible button label and red styling for destructive actions. */
function ask(anchor, message, o = {}) {
  const msg = String(message || ''), first = msg.split(/\n/)[0];
  const verb = (msg.match(/^(Delete|Remove|Clear|Disconnect|Reset|Replace|Withdraw|Archive|Hide|Stop sharing|Start a new season|Throw away|Import)/i) || [])[1];
  const danger = o.danger !== undefined ? o.danger : /delete|remove|throw away|clear|disconnect|reset|withdraw|stop sharing|replace|permanent|can.t be undone/i.test(msg);
  const ok = o.ok || (verb ? (/^throw away/i.test(verb) ? 'Discard' : /^stop sharing/i.test(verb) ? 'Stop sharing' : /^start a new season/i.test(verb) ? 'Start season' : verb.charAt(0).toUpperCase() + verb.slice(1).toLowerCase()) : 'Yes');
  const rest = msg.slice(first.length).trim();
  return confirm(anchor, { title: o.title || first, text: rest ? rest.split(/\n+/).map(esc).join('<br>') : (o.text || ''), ok, danger }).then(r => !!r);
}
/* drop-in for prompt(message, value): resolves the text, or null when cancelled */
function promptBox(anchor, message, value = '', o = {}) {
  return form(anchor, { title: o.title || message, fields: [{ name: 'v', label: o.label || '', value, max: o.max }], ok: o.ok || 'OK' }).then(r => r ? r.v : null);
}

document.addEventListener('pointerdown', e => { if (cur && !cur.el.contains(e.target) && !(cur.centre && !e.target.classList.contains('pop-shade')) && !(cur.anchor && cur.anchor.contains && cur.anchor.contains(e.target))) close(null); }, true);
document.addEventListener('keydown', e => { if (cur && e.key === 'Escape') { e.preventDefault(); close(null); } }, true);
addEventListener('scroll', () => place(), true);
addEventListener('resize', () => place());
addEventListener('hashchange', () => close(null));
new MutationObserver(() => {
  if (!cur || cur.centre || !cur.anchor || cur.anchor.isConnected) return;
  const again = cur.sel && document.querySelector(cur.sel); // the page re-drew: follow the same button
  if (again) { cur.anchor = again; again.classList.add('pop-open'); place(); } else close(null);
}).observe(document.documentElement, { childList: true, subtree: true });

window.Pop = { form, confirm, ask, prompt: promptBox, close };
})();
