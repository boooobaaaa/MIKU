/* =========================================================
   CUSTOM DROPDOWNS — every <select> on the site opens a themed
   menu instead of the operating system's picker.
   The real <select> stays in the page (hidden behind the scenes as the
   source of truth), so forms, data-path bindings and change handlers
   keep working exactly as before.
   Opt out on a single select with  data-native .
   ========================================================= */
(() => {
'use strict';
const P = { sel: null, el: null, list: null, items: [], idx: -1, q: '', typed: '', typedAt: 0 };
const ok = s => s && s.tagName === 'SELECT' && !s.multiple && !(s.size > 1) && !s.hasAttribute('data-native');
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SEARCH_AT = 9;

function readOptions(sel) {
  const out = [];
  [...sel.children].forEach(ch => {
    if (ch.tagName === 'OPTGROUP') {
      out.push({ group: ch.label });
      [...ch.children].forEach(o => out.push({ o, dis: o.disabled || ch.disabled }));
    } else if (ch.tagName === 'OPTION') out.push({ o: ch, dis: ch.disabled });
  });
  return out;
}

function open(sel) {
  if (!ok(sel) || sel.disabled) return;
  if (P.sel === sel) return close();
  close();
  P.sel = sel; P.q = '';
  const opts = readOptions(sel), n = opts.filter(x => x.o).length;
  const el = document.createElement('div');
  el.className = 'cdd';
  el.setAttribute('role', 'presentation');
  el.innerHTML = `${n >= SEARCH_AT ? `<div class="cdd-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg><input type="text" placeholder="Search…" aria-label="Search options" autocomplete="off" spellcheck="false"></div>` : ''}<div class="cdd-list" role="listbox" tabindex="-1"></div>`;
  document.body.appendChild(el);
  P.el = el; P.list = el.querySelector('.cdd-list');
  sel.classList.add('cdd-open');
  sel.setAttribute('aria-expanded', 'true');
  paint(opts);
  place();
  requestAnimationFrame(() => el.classList.add('in'));
  const inp = el.querySelector('input');
  if (inp) {
    if (matchMedia('(pointer: fine)').matches) inp.focus({ preventScroll: true });
    inp.addEventListener('input', () => { P.q = inp.value.trim().toLowerCase(); paint(readOptions(sel)); });
    inp.addEventListener('keydown', onKey);
  }
  scrollToActive();
}

function paint(opts) {
  const sel = P.sel, q = P.q;
  P.items = [];
  let html = '', pendingGroup = null;
  opts.forEach(x => {
    if (x.group !== undefined) { pendingGroup = x.group; return; }
    const txt = x.o.textContent;
    if (q && !txt.toLowerCase().includes(q)) return;
    if (pendingGroup !== null) { html += `<div class="cdd-group">${esc(pendingGroup)}</div>`; pendingGroup = null; }
    const i = P.items.length, selected = x.o.selected && sel.selectedIndex === x.o.index;
    P.items.push({ o: x.o, dis: x.dis });
    html += `<div class="cdd-opt ${selected ? 'sel' : ''} ${x.dis ? 'dis' : ''} ${x.o.value === '' ? 'blank' : ''}" role="option" data-i="${i}" aria-selected="${selected}" ${x.dis ? 'aria-disabled="true"' : ''}><span>${esc(txt)}</span>${selected ? '<svg class="cdd-tick" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>' : ''}</div>`;
  });
  P.list.innerHTML = html || '<div class="cdd-empty">No matches</div>';
  P.idx = P.items.findIndex(x => x.o.selected && sel.selectedIndex === x.o.index);
  if (P.idx < 0 || q) P.idx = P.items.findIndex(x => !x.dis);
  mark();
}
function mark() {
  P.list.querySelectorAll('.cdd-opt.act').forEach(e => e.classList.remove('act'));
  const e = P.list.querySelector(`.cdd-opt[data-i="${P.idx}"]`);
  if (e) e.classList.add('act');
}
function scrollToActive() {
  const e = P.list && P.list.querySelector(`.cdd-opt[data-i="${P.idx}"]`);
  if (!e) return;
  const l = P.list, top = e.offsetTop, bot = top + e.offsetHeight;
  if (top < l.scrollTop) l.scrollTop = top - 6;
  else if (bot > l.scrollTop + l.clientHeight) l.scrollTop = bot - l.clientHeight + 6;
}
function place() {
  const sel = P.sel, el = P.el; if (!sel || !el) return;
  if (!sel.isConnected) return close();
  const r = sel.getBoundingClientRect();
  if (!r.width && !r.height) return close();
  const vw = innerWidth, vh = innerHeight, gap = 6, pad = 10;
  const w = Math.min(Math.max(r.width, 200), vw - pad * 2);
  el.style.width = w + 'px';
  el.style.maxHeight = '';
  const natural = Math.min(el.scrollHeight, 360);
  const below = vh - r.bottom - gap - pad, above = r.top - gap - pad;
  const up = natural > below && above > below;
  const room = Math.max(140, up ? above : below);
  el.style.maxHeight = Math.min(360, room) + 'px';
  let left = r.left; if (left + w > vw - pad) left = vw - pad - w; if (left < pad) left = pad;
  el.style.left = left + 'px';
  el.classList.toggle('up', up);
  if (up) { el.style.top = ''; el.style.bottom = (vh - r.top + gap) + 'px'; }
  else { el.style.bottom = ''; el.style.top = (r.bottom + gap) + 'px'; }
}
function close(refocus) {
  const sel = P.sel;
  if (P.el) P.el.remove();
  if (sel) { sel.classList.remove('cdd-open'); sel.setAttribute('aria-expanded', 'false'); }
  P.sel = null; P.el = null; P.list = null; P.items = []; P.idx = -1;
  if (refocus && sel && sel.isConnected) sel.focus({ preventScroll: true });
}
function choose(i) {
  const it = P.items[i], sel = P.sel; if (!it || it.dis || !sel) return;
  const changed = sel.selectedIndex !== it.o.index;
  close(true);
  if (changed) {
    sel.selectedIndex = it.o.index;
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
}
function step(dir) {
  if (!P.items.length) return;
  let i = P.idx;
  for (let k = 0; k < P.items.length; k++) {
    i = i + dir;
    if (i < 0) i = 0; if (i >= P.items.length) i = P.items.length - 1;
    if (!P.items[i].dis) break;
  }
  P.idx = i; mark(); scrollToActive();
}
function typeAhead(ch) {
  const now = Date.now();
  P.typed = now - P.typedAt < 700 ? P.typed + ch : ch; P.typedAt = now;
  const t = P.typed.toLowerCase();
  const start = P.typed.length === 1 ? P.idx + 1 : P.idx;
  for (let k = 0; k < P.items.length; k++) {
    const i = (start + k) % P.items.length, it = P.items[i];
    if (!it.dis && it.o.textContent.trim().toLowerCase().startsWith(t)) { P.idx = i; mark(); scrollToActive(); return; }
  }
}
function onKey(e) {
  if (!P.sel) return;
  const k = e.key;
  if (k === 'ArrowDown') { e.preventDefault(); step(1); }
  else if (k === 'ArrowUp') { e.preventDefault(); step(-1); }
  else if (k === 'Home' || k === 'PageUp') { e.preventDefault(); P.idx = -1; step(1); }
  else if (k === 'End' || k === 'PageDown') { e.preventDefault(); P.idx = P.items.length; step(-1); }
  else if (k === 'Enter' || (k === ' ' && e.target.tagName !== 'INPUT')) { e.preventDefault(); choose(P.idx); }
  else if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
  else if (k === 'Tab') { close(false); }
  else if (k.length === 1 && e.target.tagName !== 'INPUT' && !e.ctrlKey && !e.metaKey && !e.altKey) { typeAhead(k); }
}

/* ---- intercept the native picker ---- */
// mouse / pen: stop the OS menu from opening and show ours
document.addEventListener('mousedown', e => {
  const sel = e.target.closest && e.target.closest('select');
  if (!ok(sel) || e.button !== 0) return;
  e.preventDefault();
  if (sel.disabled) return;
  sel.focus({ preventScroll: true });
  open(sel);
}, true);
// touch: let scrolling happen; only a tap (no movement) opens our menu
let tStart = null;
document.addEventListener('touchstart', e => {
  const sel = e.target.closest && e.target.closest('select');
  tStart = ok(sel) ? { sel, x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
}, { capture: true, passive: true });
document.addEventListener('touchend', e => {
  if (!tStart) return;
  const t = e.changedTouches[0], s = tStart; tStart = null;
  if (Math.abs(t.clientX - s.x) > 10 || Math.abs(t.clientY - s.y) > 10) return;
  if (!s.sel.contains(e.target) && e.target !== s.sel) return;
  e.preventDefault();
  if (!s.sel.disabled) open(s.sel);
}, { capture: true, passive: false });
// keyboard on a focused select: Space / Enter / Alt+↓ / F4 open our menu
document.addEventListener('keydown', e => {
  if (P.sel && P.el && !P.el.contains(e.target)) { onKey(e); return; }
  const sel = e.target;
  if (!ok(sel)) return;
  if (e.key === ' ' || e.key === 'Enter' || e.key === 'F4' || e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(sel); }
}, true);
// clicks inside the menu
document.addEventListener('mousedown', e => { if (P.el && P.el.contains(e.target) && !e.target.closest('input')) e.preventDefault(); });
document.addEventListener('click', e => {
  if (!P.el) return;
  if (P.el.contains(e.target)) {
    const o = e.target.closest('.cdd-opt'); if (o) choose(Number(o.dataset.i));
    return;
  }
  if (e.target === P.sel || (P.sel && P.sel.contains(e.target))) return;
  close(false);
});
document.addEventListener('pointerdown', e => { if (P.el && !P.el.contains(e.target) && e.target !== P.sel && !(e.target.closest && e.target.closest('select') === P.sel)) close(false); }, true);
document.addEventListener('mousemove', e => {
  if (!P.el) return;
  const o = e.target.closest && e.target.closest('.cdd-opt');
  if (o && P.el.contains(o) && !o.classList.contains('dis')) { const i = Number(o.dataset.i); if (i !== P.idx) { P.idx = i; mark(); } }
});
// keep it attached to its select while the page scrolls; close if the select disappears (re-render)
addEventListener('scroll', e => { if (P.el && !(e.target && e.target.nodeType === 1 && P.el.contains(e.target))) place(); }, true);
addEventListener('resize', () => { if (P.el) place(); });
addEventListener('hashchange', () => close(false));
new MutationObserver(() => { if (P.sel && !P.sel.isConnected) close(false); }).observe(document.documentElement, { childList: true, subtree: true });

window.LGDropdown = { open, close };
})();
