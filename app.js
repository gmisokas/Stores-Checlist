'use strict';

/* ==========================================================
   Checklist καταστημάτων – Lartecono DaVinci
   Τα δεδομένα βρίσκονται στο data.json. Αλλάζουν από την
   οθόνη «Διαχείριση», όχι από εδώ.
   ========================================================== */

const SECTIONS = { opening: 'Άνοιγμα', closing: 'Κλείσιμο' };
const GENERAL_ID = '__general';
const SECTIONS_UPPER = { opening: 'ΑΝΟΙΓΜΑ', closing: 'ΚΛΕΙΣΙΜΟ' };
const LS = {
  draft: 'cl-draft',
  settings: 'cl-settings',
  last: 'cl-last',
  progPrefix: 'cl-prog:',
};

const state = {
  data: null,
  hasDraft: false,
  section: 'opening',
  adminTab: 'general',
  adminSection: 'opening',
  adminStore: null,
  // Αρχείο καθαριοτήτων/αποψύξεων
  logType: 'clean',
  logMode: 'main',
  logCalMonth: null,
  logCalDay: null,
  logCalOpen: false,
  logArchiveMonth: null,
  logArchiveStore: '',
  logDateSeen: null,
  logSel: null,
  // Κοινό αρχείο: δεδομένα του μήνα που είναι ανοιχτός στο Αρχείο και ο κωδικός (μόνο στη μνήμη).
  archive: null,
  archivePw: '',
  syncTest: '',
  logSaving: false,
  archSaving: false,
  syncSheetUrl: '',
};

const $ = (id) => document.getElementById(id);
const f = {};

/* ---------- Βοηθητικά ---------- */

function lsGet(key, def) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : def;
  } catch (e) {
    return def;
  }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* χωρίς αποθήκευση */ }
}
function lsDel(key) {
  try { localStorage.removeItem(key); } catch (e) { /* τίποτα */ }
}

// Δημιουργία στοιχείου: h('div', {class: 'x', onclick: fn}, 'κείμενο', παιδί...)
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  let value;
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'value') value = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  if (value !== undefined) el.value = value;
  return el;
}

function toast(msg, ms = 3500) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, ms);
}

function todayISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function trunc(s, n) {
  s = String(s || '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
function newId(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

/* ---------- Δεδομένα ---------- */

function normalize(data) {
  data = data || {};
  data.general = data.general || {};
  for (const s of Object.keys(SECTIONS)) {
    data.general[s] = Array.isArray(data.general[s]) ? data.general[s] : [];
    data.general[s].forEach((it, i) => { if (!it.id) it.id = s[0] + 'n' + i + newId(''); });
  }
  data.contacts = Array.isArray(data.contacts) ? data.contacts : [];
  data.contacts.forEach((c) => { if (!c.id) c.id = newId('p'); });
  data.stores = Array.isArray(data.stores) ? data.stores : [];
  data.stores.forEach((st) => {
    if (!st.id) st.id = newId('s');
    st.contacts = Array.isArray(st.contacts) ? st.contacts : [];
    st.overrides = st.overrides && typeof st.overrides === 'object' && !Array.isArray(st.overrides) ? st.overrides : {};
    st.contacts.forEach((c) => { if (!c.id) c.id = newId('p'); });
    st.extras = Array.isArray(st.extras) ? st.extras : [];
    st.extras.forEach((x) => {
      if (!x.id) x.id = newId('x');
      if (!SECTIONS[x.section]) x.section = 'opening';
      if (!x.after) x.after = 'start';
    });
  });
  data.cleaning = normalizeCleaning(data.cleaning);
  return data;
}

async function fetchServerData() {
  // Το ?t= παρακάμπτει την cache, ώστε να φαίνονται αμέσως οι νέες αλλαγές.
  const r = await fetch('data.json?t=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return normalize(await r.json());
}

async function load() {
  let server = null;
  try { server = await fetchServerData(); } catch (e) { /* εκτός σύνδεσης */ }
  const draft = lsGet(LS.draft, null);
  if (draft) {
    state.data = normalize(draft);
    state.hasDraft = true;
  } else if (server) {
    state.data = server;
  } else {
    document.querySelector('#view-checklist').prepend(
      h('p', { class: 'warn' }, 'Δεν φορτώθηκε το checklist. Έλεγξε τη σύνδεση και ανανέωσε τη σελίδα.'));
    state.data = normalize({});
  }
}

function currentStore() {
  return state.data.stores.find((s) => s.id === f.store.value) || null;
}

// Ενώνει γενικές γραμμές και ιδιαιτερότητες καταστήματος στη σωστή σειρά.
function buildRows(section, store) {
  if (!SECTIONS[section]) return [];
  const general = state.data.general[section] || [];
  const extras = ((store && store.extras) || []).filter((x) => x.section === section);
  const ids = new Set(general.map((g) => g.id));
  const overrides = (store && store.overrides) || {};
  const rows = [];
  const pushExtras = (after) => extras
    .filter((x) => x.after === after)
    .forEach((x) => rows.push({ key: x.id, text: x.text, extra: true }));

  pushExtras('start');
  general.forEach((g) => {
    // Προσαρμογή της γενικής γραμμής μόνο για αυτό το κατάστημα.
    const o = overrides[g.id];
    rows.push({
      key: g.id,
      text: o && o.text ? o.text : g.text,
      important: !!g.important,
      notify: !!g.notify,
      extra: !!(o && o.text && o.highlight),
    });
    pushExtras(g.id);
  });
  // Αν σβήστηκε η γραμμή αναφοράς, η ιδιαιτερότητα πάει στο τέλος.
  extras
    .filter((x) => x.after !== 'start' && !ids.has(x.after))
    .forEach((x) => rows.push({ key: x.id, text: x.text, extra: true }));
  return rows;
}

/* ---------- Πρόοδος (σώζεται στο κινητό) ---------- */

function progKey() {
  return `${LS.progPrefix}${f.store.value || 'geniko'}:${f.date.value}:${state.section}`;
}
function getProg() { return lsGet(progKey(), {}); }
function setProg(p) { lsSet(progKey(), p); }

function cleanupOldProgress() {
  try {
    const limit = new Date();
    limit.setDate(limit.getDate() - 30);
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(LS.progPrefix)) continue;
      const date = k.split(':')[2];
      if (date && new Date(date) < limit) localStorage.removeItem(k);
    }
  } catch (e) { /* τίποτα */ }
}

/* ==========================================================
   Οθόνη checklist
   ========================================================== */

function fillStoreSelect() {
  const keep = f.store.value || (lsGet(LS.last, {}).store || '');
  f.store.replaceChildren(
    h('option', { value: '' }, '— Επίλεξε κατάστημα —'),
    h('option', { value: GENERAL_ID }, 'ΓΕΝΙΚΟ'),
    ...state.data.stores.map((s) => h('option', { value: s.id }, s.name || '(χωρίς όνομα)')));
  f.store.value = keep === GENERAL_ID || state.data.stores.some((s) => s.id === keep) ? keep : '';
}

// Όνομα που εμφανίζεται για την επιλογή καταστήματος (κατάστημα, ΓΕΝΙΚΟ ή κενό).
function storeLabel() {
  if (f.store.value === GENERAL_ID) return 'ΓΕΝΙΚΟ';
  const st = currentStore();
  return st ? st.name : '';
}

function updateHeader() {
  const d = fmtDate(f.date.value);
  $('top-date').textContent = d ? 'Ημερομηνία: ' + d : '';
  $('hero-sub').textContent = [storeLabel(), d ? 'Ημερομηνία: ' + d : ''].filter(Boolean).join(' · ');
}

function renderChecklist() {
  updateHeader();
  const isLog = state.section === 'log';
  const rows = isLog ? [] : buildRows(state.section, currentStore());
  const prog = isLog ? {} : getProg();
  const chosen = !!SECTIONS[state.section];
  $('items').hidden = isLog;
  $('log-view').hidden = !isLog;
  $('items').replaceChildren(...(chosen
    ? rows.map((r, i) => rowEl(r, i + 1, prog))
    : [h('li', { class: 'pick-hint' }, 'Επίλεξε «Άνοιγμα», «Κλείσιμο» ή «ΚΑΘΑΡΙΟΤΗΤΕΣ / ΑΠΟΨΥΞΕΙΣ».')]));
  $('legend').hidden = !rows.some((r) => r.extra);
  document.querySelector('#view-checklist .progress').hidden = !chosen;
  $('checklist-actions').hidden = !chosen;
  document.querySelectorAll('#section-seg button').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.section === state.section));
  });
  renderLogNotice();
  if (isLog) renderLog();
  updateProgress();
  updateArchiveBtn();
}

function rowEl(r, n, prog) {
  const p = prog[r.key] || {};
  const note = h('textarea', {
    class: 'note',
    rows: 2,
    placeholder: 'Σημείωση…',
    hidden: !p.n,
    value: p.n || '',
    oninput: (e) => setNote(r.key, e.target.value),
  });
  return h('li', {
    class: 'item' + (r.extra ? ' extra' : '') + (r.important ? ' important' : '') + (p.s ? ' st-' + p.s : ''),
    'data-key': r.key,
  },
  h('div', { class: 'item-main' },
    h('span', { class: 'num' }, n + '.'),
    h('span', { class: 'text' }, r.text)),
  h('div', { class: 'item-actions' },
    h('button', { type: 'button', class: 'mark ok', 'aria-label': 'Έγινε', 'aria-pressed': String(p.s === 'ok'), onclick: () => setMark(r.key, 'ok') }, '✓'),
    h('button', { type: 'button', class: 'mark no', 'aria-label': 'Δεν έγινε', 'aria-pressed': String(p.s === 'no'), onclick: () => setMark(r.key, 'no') }, '✗'),
    h('button', {
      type: 'button',
      class: 'note-btn' + (p.n ? ' has' : ''),
      onclick: () => { note.hidden = !note.hidden; if (!note.hidden) note.focus(); },
    }, 'Σημείωση')),
  note,
  r.notify ? notifyBox() : null);
}

// Επιλογή υπευθύνου και άνοιγμα της συνομιλίας του στο Viber.
// Δέχεται 69XXXXXXXX, +30…, 0030… ή παλιό σύνδεσμο viber:// και δίνει τα ψηφία με κωδικό χώρας.
function phoneDigits(c) {
  let d = String((c && (c.phone || c.viber)) || '').replace(/%2B/gi, '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 10 && /^[26]/.test(d)) d = '30' + d;
  return d.length >= 11 ? d : '';
}

function viberLink(c) {
  const d = phoneDigits(c);
  return d ? 'viber://chat?number=%2B' + d : '';
}

function notifyBox() {
  const store = currentStore();
  // Πρώτα οι υπεύθυνοι του καταστήματος, μετά όσοι ισχύουν για όλα τα καταστήματα.
  const seen = new Set();
  const contacts = [...((store && store.contacts) || []), ...state.data.contacts]
    .filter((c) => c.name && viberLink(c))
    .filter((c) => { const d = phoneDigits(c); if (seen.has(d)) return false; seen.add(d); return true; });
  if (!contacts.length) return null;
  const link = h('a', { class: 'btn viber', 'aria-disabled': 'true', role: 'button' }, 'Άνοιγμα συνομιλίας στο Viber');
  const sel = h('select', {
    onchange: (e) => {
      const c = contacts.find((x) => x.id === e.target.value);
      if (c) { link.href = viberLink(c); link.removeAttribute('aria-disabled'); }
      else { link.removeAttribute('href'); link.setAttribute('aria-disabled', 'true'); }
    },
  }, h('option', { value: '' }, '— Επίλεξε υπεύθυνο —'),
  ...contacts.map((c) => h('option', { value: c.id }, c.name)));
  return h('div', { class: 'notify' },
    h('label', {}, 'Επίλεξε υπεύθυνο για ενημέρωση', sel),
    link);
}

function setMark(key, val) {
  const prog = getProg();
  const p = prog[key] || {};
  if (p.s === val) delete p.s; else p.s = val;
  prog[key] = p;
  setProg(prog);

  const li = document.querySelector(`.item[data-key="${CSS.escape(key)}"]`);
  li.classList.remove('st-ok', 'st-no');
  if (p.s) li.classList.add('st-' + p.s);
  li.querySelector('.mark.ok').setAttribute('aria-pressed', String(p.s === 'ok'));
  li.querySelector('.mark.no').setAttribute('aria-pressed', String(p.s === 'no'));
  updateProgress();
  updateArchiveBtn();
}

function setNote(key, text) {
  const prog = getProg();
  const p = prog[key] || {};
  if (text.trim()) p.n = text; else delete p.n;
  prog[key] = p;
  setProg(prog);
  const li = document.querySelector(`.item[data-key="${CSS.escape(key)}"]`);
  li.querySelector('.note-btn').classList.toggle('has', !!p.n);
  updateArchiveBtn();
}

function stats() {
  const rows = buildRows(state.section, currentStore());
  const prog = getProg();
  const res = { rows, prog, ok: 0, no: 0, left: 0 };
  rows.forEach((r) => {
    const s = (prog[r.key] || {}).s;
    if (s === 'ok') res.ok++; else if (s === 'no') res.no++; else res.left++;
  });
  return res;
}

function updateProgress() {
  if (!SECTIONS[state.section]) { $('progress-text').textContent = ''; $('bar-fill').style.width = '0'; return; }
  const s = stats();
  const total = s.rows.length || 1;
  $('bar-fill').style.width = Math.round(((s.ok + s.no) / total) * 100) + '%';
  $('progress-text').textContent =
    `${SECTIONS[state.section]}: ${s.ok + s.no} από ${s.rows.length} · ✓ ${s.ok} · ✗ ${s.no} · απομένουν ${s.left}`;
}

/* ---------- Αποστολή στο Viber ---------- */

function summaryText() {
  const s = stats();
  const store = currentStore();
  const lines = [];
  lines.push(`📋 ${SECTIONS_UPPER[state.section]} – ${storeLabel() || 'Χωρίς κατάστημα'}`);
  lines.push(`📅 ${fmtDate(f.date.value)} · 👤 ${f.name.value.trim() || '-'}`);
  lines.push(`✓ ${s.ok}/${s.rows.length} · ✗ ${s.no} · ⏳ ${s.left}`);

  const no = [], left = [], notes = [];
  s.rows.forEach((r, i) => {
    const p = s.prog[r.key] || {};
    const label = `${i + 1}. ${trunc(r.text, 70)}`;
    const noteTxt = p.n ? ` — σημ.: ${p.n.trim()}` : '';
    if (p.s === 'no') no.push(`• ${label}${noteTxt}`);
    else if (!p.s) left.push(`• ${label}${noteTxt}`);
    else if (p.n) notes.push(`• ${label}${noteTxt}`);
  });
  if (no.length) lines.push('', '✗ Δεν έγιναν:', ...no);
  if (left.length) lines.push('', '⏳ Δεν συμπληρώθηκαν:', ...left);
  if (notes.length) lines.push('', '📝 Σημειώσεις:', ...notes);
  if (!no.length && !left.length) lines.push('', 'Όλα ολοκληρώθηκαν ✅');
  return lines.join('\n');
}

async function share() {
  if (!SECTIONS[state.section]) { toast('Επίλεξε πρώτα Άνοιγμα ή Κλείσιμο.'); return; }
  if (state.data.stores.length && !f.store.value) { toast('Επίλεξε πρώτα κατάστημα.'); f.store.focus(); return; }
  if (!f.name.value.trim()) { toast('Συμπλήρωσε το όνομα του υπευθύνου.'); f.name.focus(); return; }
  const s = stats();
  if (s.left && !confirm(`Υπάρχουν ${s.left} γραμμές χωρίς ✓ ή ✗. Να σταλεί έτσι;`)) return;
  const a = archiveState();
  if (shared() && (!a || a[0] === 'warn') && !confirm(a ? 'Υπάρχουν αλλαγές που δεν αποθηκεύτηκαν στο αρχείο. Να σταλεί έτσι στο Viber;'
    : 'Δεν έγινε ακόμα «Αποθήκευση στο αρχείο». Να σταλεί έτσι στο Viber;')) return;

  await shareText(summaryText());
}

/* ---------- Αποστολή στο αρχείο (κοινό αρχείο Google) ---------- */

function sentKey() { return `cl-sent:${f.store.value}:${f.date.value}:${state.section}`; }
function progSig() { return JSON.stringify(getProg()); }

// Κατάσταση αποθήκευσης του checklist στο αρχείο: ['ok'|'wait'|'warn', κείμενο] ή null.
function archiveState() {
  if (!shared() || !SECTIONS[state.section] || !f.store.value) return null;
  if (state.archSaving) return ['wait', '⏳ Αποστολή…'];
  let rec = lsGet(sentKey(), null);
  if (!rec) return null;
  if (typeof rec === 'string') rec = { at: rec, sig: null };
  const pend = pendingOf(f.store.value).some((o) => o.op === 'checklist' && o.c.date === f.date.value && o.c.section === state.section);
  if (pend) {
    return ['wait', sync.oldScript ? '⏳ Δεν έγινε ακόμα αποστολή – περιμένει ενημέρωση του Google Script.'
      : '⏳ Δεν έγινε ακόμα αποστολή – θα σταλεί μόλις υπάρξει σύνδεση.'];
  }
  if (rec.sig != null && rec.sig !== progSig()) return ['warn', '⚠️ Υπάρχουν αλλαγές που δεν αποθηκεύτηκαν στο αρχείο.'];
  return ['ok', `✓ Έγινε αποστολή – ${new Date(rec.at).toTimeString().slice(0, 5)}`];
}

function updateArchiveBtn() {
  const btn = $('btn-archive');
  const st = $('archive-status');
  btn.hidden = !shared();
  btn.disabled = !!state.archSaving;
  const a = btn.hidden ? null : archiveState();
  st.hidden = !a;
  if (a) { st.className = 'save-status ' + a[0]; st.textContent = a[1]; }
}

async function sendToArchive() {
  if (!SECTIONS[state.section]) { toast('Επίλεξε πρώτα Άνοιγμα ή Κλείσιμο.'); return; }
  if (!f.store.value) { toast('Επίλεξε πρώτα κατάστημα.'); f.store.focus(); return; }
  if (!f.name.value.trim()) { toast('Συμπλήρωσε το όνομα του υπευθύνου.'); f.name.focus(); return; }
  if (!f.date.value) { toast('Συμπλήρωσε την ημερομηνία.'); f.date.focus(); return; }
  const s = stats();
  if (s.left && !confirm(`Υπάρχουν ${s.left} γραμμές χωρίς ✓ ή ✗. Να αποθηκευτεί έτσι στο αρχείο;`)) return;
  const sk = f.store.value;
  const c = {
    date: f.date.value,
    section: state.section,
    by: f.name.value.trim(),
    ok: s.ok,
    no: s.no,
    left: s.left,
    at: new Date().toISOString(),
    items: s.rows.map((r, i) => {
      const p = s.prog[r.key] || {};
      return { n: i + 1, text: trunc(r.text, 200), s: p.s || '', note: (p.n || '').trim() };
    }),
  };
  // Νέα αποθήκευση για την ίδια ημέρα/ενότητα αντικαθιστά όποια περιμένει ακόμα.
  lsSet(LOG_LS.queue, queueGet().filter((o) => !(o.op === 'checklist' && o.store === sk && o.c.date === c.date && o.c.section === c.section)));
  queueAdd({ op: 'checklist', store: sk, storeName: storeLabel(), c });
  lsSet(sentKey(), { at: c.at, sig: progSig() });
  state.archSaving = true;
  updateArchiveBtn();
  await syncStore(sk);
  state.archSaving = false;
  updateArchiveBtn();
}

// Κοινοποίηση κειμένου (Viber κ.λπ.)· αλλιώς αντιγραφή ή παράθυρο με το κείμενο.
async function shareText(text) {
  if (navigator.share) {
    try { await navigator.share({ text }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('Αντιγράφηκε. Άνοιξε το Viber και κάνε επικόλληση.', 5000);
  } catch (e) {
    showTextDialog('Αντίγραψε το κείμενο και επικόλλησέ το στο Viber:', text);
  }
}

function showTextDialog(msg, text) {
  $('text-dialog-msg').textContent = msg;
  $('text-dialog-text').value = text;
  $('text-dialog').showModal();
  $('text-dialog-text').select();
}

/* ---------- Εκτύπωση ---------- */

function renderPrint() {
  const s = stats();
  const store = currentStore();
  const table = h('table', { class: 'p-table' },
    h('thead', {}, h('tr', {},
      h('th', { class: 'c-num' }, '#'),
      h('th', { class: 'c-text' }, 'Ενέργεια'),
      h('th', { class: 'c-mark' }, '✓'),
      h('th', { class: 'c-mark' }, '✗'),
      h('th', { class: 'c-note' }, 'Σημειώσεις'))),
    h('tbody', {}, s.rows.map((r, i) => {
      const p = s.prog[r.key] || {};
      return h('tr', { class: (r.extra ? 'extra ' : '') + (r.important ? 'important' : '') },
        h('td', { class: 'c-num' }, i + 1),
        h('td', { class: 'c-text' }, r.text),
        h('td', { class: 'c-mark' }, p.s === 'ok' ? '✓' : ''),
        h('td', { class: 'c-mark' }, p.s === 'no' ? '✗' : ''),
        h('td', { class: 'c-note' }, p.n || ''));
    })));

  $('print-area').replaceChildren(
    h('h1', { class: 'p-title' }, `Checklist ${SECTIONS[state.section]} καταστήματος – Lartecono DaVinci`),
    h('div', { class: 'p-fields' },
      h('span', {}, 'Ημερομηνία: ', fmtDate(f.date.value)),
      h('span', {}, 'Υπεύθυνος: ', f.name.value.trim()),
      h('span', {}, 'Κατάστημα: ', storeLabel())),
    s.rows.some((r) => r.extra)
      ? h('p', { class: 'p-legend' }, h('span', { class: 'swatch' }),
        'Η χρωματισμένη γραμμή αφορά ιδιαιτερότητα του συγκεκριμένου καταστήματος.')
      : null,
    table);
}

/* ---------- Αποθήκευση σε Excel (.xlsx) ---------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Απλό ZIP χωρίς συμπίεση: όσο χρειάζεται για ένα αρχείο .xlsx.
function zipStore(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of files) {
    const nameB = enc.encode(name);
    const data = enc.encode(text);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameB.length, true);
    parts.push(new Uint8Array(local.buffer), nameB, data);

    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 20, true);
    cen.setUint16(6, 20, true);
    cen.setUint16(8, 0x0800, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, data.length, true);
    cen.setUint32(24, data.length, true);
    cen.setUint16(28, nameB.length, true);
    cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), nameB);
    offset += 30 + nameB.length + data.length;
  }
  const cenSize = central.reduce((n, b) => n + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cenSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)],
    { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function xmlEsc(v) {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Στυλ κελιών (δείκτες στο cellXfs του styles.xml).
const XS = {
  title: 1, label: 2, head: 3, cell: 4, center: 5, xCell: 6, xCenter: 7, imp: 8, impX: 9,
  // Αρχείο καθαριοτήτων/αποψύξεων
  dCell: 10, dSug: 11, dDone: 12, dWe: 13, headWe: 14, bad: 15, good: 16,
};

const XLSX_STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="5"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFC62828"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF2E7D32"/><name val="Calibri"/></font></fonts>
<fills count="8"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE0E0E0"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF3C4"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD6E6FF"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFC8E6C9"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF0F0F0"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFBDBDBD"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="17">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>
<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="4" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="6" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function buildXlsx() {
  const s = stats();
  const rowsXml = [];
  let r = 0;
  const cell = (col, v, style) => {
    if (typeof v === 'number') return `<c r="${col}${r}" s="${style}"><v>${v}</v></c>`;
    return `<c r="${col}${r}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
  };
  const row = (cells) => { r++; rowsXml.push(`<row r="${r}">${cells.map((c) => cell(...c)).join('')}</row>`); };

  row([['A', `Checklist ${SECTIONS[state.section]} καταστήματος – Lartecono DaVinci`, XS.title]]);
  row([['A', `Ημερομηνία: ${fmtDate(f.date.value)}`, XS.label]]);
  row([['A', `Υπεύθυνος: ${f.name.value.trim()}`, XS.label]]);
  row([['A', `Κατάστημα: ${storeLabel()}`, XS.label]]);
  r++;
  row([['A', '#', XS.head], ['B', 'Ενέργεια', XS.head], ['C', '✓', XS.head], ['D', '✗', XS.head], ['E', 'Σημειώσεις', XS.head]]);
  const headRow = r;
  s.rows.forEach((x, i) => {
    const p = s.prog[x.key] || {};
    const textStyle = x.important ? (x.extra ? XS.impX : XS.imp) : (x.extra ? XS.xCell : XS.cell);
    const ctr = x.extra ? XS.xCenter : XS.center;
    row([['A', i + 1, ctr], ['B', x.text, textStyle], ['C', p.s === 'ok' ? '✓' : '', ctr],
      ['D', p.s === 'no' ? '✗' : '', ctr], ['E', p.n || '', x.extra ? XS.xCell : XS.cell]]);
  });
  if (s.rows.some((x) => x.extra)) {
    r++;
    row([['A', 'Οι κίτρινες γραμμές αφορούν ιδιαιτερότητες του συγκεκριμένου καταστήματος.', 0]]);
  }

  const cols = '<col min="1" max="1" width="5" customWidth="1"/><col min="2" max="2" width="70" customWidth="1"/><col min="3" max="4" width="5" customWidth="1"/><col min="5" max="5" width="35" customWidth="1"/>';
  const pane = `ySplit="${headRow}" topLeftCell="A${headRow + 1}" activePane="bottomLeft"`;
  return xlsxBlob([{ name: SECTIONS[state.section], xml: sheetXml(rowsXml, cols, pane, 'portrait') }]);
}

// Ένα φύλλο: γραμμές XML, πλάτη στηλών, «πάγωμα» κεφαλίδας, προσανατολισμός A4.
function sheetXml(rowsXml, colsXml, paneAttrs, orientation) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
<sheetViews><sheetView workbookViewId="0"><pane ${paneAttrs} state="frozen"/></sheetView></sheetViews>
<cols>${colsXml}</cols>
<sheetData>${rowsXml.join('')}</sheetData>
<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>
<pageSetup paperSize="9" orientation="${orientation}" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
}

// Αρχείο .xlsx με ένα ή περισσότερα φύλλα: [{name, xml}].
function xlsxBlob(sheets) {
  const x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const sheetType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml';
  return zipStore([
    ['[Content_Types].xml', `${x}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="${sheetType}"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ['_rels/.rels', `${x}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `${x}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xmlEsc(s.name.replace(/[\\/?*[\]:]/g, '-').slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `${x}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', XLSX_STYLES],
    ...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, s.xml]),
  ]);
}

// Λατινικοί χαρακτήρες στο όνομα αρχείου, για να το κρατούν όλα τα κινητά.
function toLatin(str) {
  const map = { α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o' };
  return String(str).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[α-ω]/g, (c) => map[c] || '').toUpperCase();
}

async function exportExcel() {
  if (!SECTIONS[state.section]) { toast('Επίλεξε πρώτα Άνοιγμα ή Κλείσιμο.'); return; }
  const blob = buildXlsx();
  const sec = state.section === 'opening' ? 'anoigma' : 'kleisimo';
  const store = toLatin(storeLabel() || 'xoris-katastima').replace(/[^A-Za-z0-9-]+/g, '-');
  await deliverFile(blob, `checklist_${store}_${sec}_${f.date.value}.xlsx`);
}

// Στο κινητό ανοίγει την κοινοποίηση (και «Αποθήκευση σε Αρχεία»), αλλιώς κανονική λήψη.
async function deliverFile(blob, name) {
  const file = typeof File === 'function' ? new File([blob], name, { type: blob.type }) : null;
  const mobile = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  if (mobile && file && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ==========================================================
   Οθόνη διαχείρισης
   ========================================================== */

function markDirty(rerender) {
  state.hasDraft = true;
  lsSet(LS.draft, state.data);
  $('draft-banner').hidden = false;
  if (rerender) renderAdmin();
}

function renderAdmin() {
  document.querySelectorAll('.tabs button').forEach((b) => {
    b.setAttribute('aria-selected', String(b.dataset.tab === state.adminTab));
  });
  const body = state.adminTab === 'general' ? adminGeneral()
    : state.adminTab === 'stores' ? adminStores()
      : state.adminTab === 'cleaning' ? adminCleaning()
        : adminSave();
  $('admin-body').replaceChildren(body);
}

function sectionToggle(current, onPick) {
  return h('div', { class: 'seg' }, Object.entries(SECTIONS).map(([k, label]) =>
    h('button', { type: 'button', 'aria-pressed': String(k === current), onclick: () => onPick(k) }, label)));
}

/* ---- Γενικό checklist ---- */

function adminGeneral() {
  const sec = state.adminSection;
  const items = state.data.general[sec];

  const move = (i, d) => {
    const j = i + d;
    [items[i], items[j]] = [items[j], items[i]];
    markDirty(true);
  };
  const del = (i) => {
    const it = items[i];
    const used = state.data.stores.filter((s) => s.extras.some((x) => x.after === it.id)).length;
    let msg = `Διαγραφή της γραμμής ${i + 1};\n\n«${trunc(it.text, 80)}»`;
    if (used) msg += `\n\nΠροσοχή: ${used} κατάστημα/τα έχουν ιδιαιτερότητα μετά από αυτή τη γραμμή. Θα μετακινηθεί στο τέλος.`;
    if (!confirm(msg)) return;
    items.splice(i, 1);
    markDirty(true);
  };
  const add = () => {
    let max = 0;
    items.forEach((it) => { const m = /^[a-z](\d+)$/.exec(it.id); if (m) max = Math.max(max, +m[1]); });
    let id = sec[0] + (max + 1);
    while (items.some((it) => it.id === id)) id = newId(sec[0]);
    items.push({ id, text: '' });
    markDirty(true);
    const tas = document.querySelectorAll('#admin-body .ed-row textarea');
    const last = tas[tas.length - 1];
    if (last) { last.focus(); last.scrollIntoView({ block: 'center' }); }
  };

  return h('div', {},
    sectionToggle(sec, (k) => { state.adminSection = k; renderAdmin(); }),
    h('p', { class: 'hint' }, 'Οι γραμμές αυτές εμφανίζονται σε όλα τα καταστήματα. Γράψε, μετακίνησε ή σβήσε ελεύθερα.'),
    h('p', { class: 'warn' }, 'Μη γράφεις ποσά παγίου ή κωδικούς συναγερμού/POS.'),
    h('div', { class: 'ed-list' }, items.map((it, i) =>
      h('div', { class: 'ed-row' + (it.important ? ' important' : '') },
        h('div', { class: 'ed-top' },
          h('span', { class: 'num' }, (i + 1) + '.'),
          h('textarea', {
            rows: 2,
            value: it.text,
            placeholder: 'Κείμενο γραμμής…',
            oninput: (e) => { it.text = e.target.value; markDirty(false); },
          })),
        h('div', { class: 'ed-tools' },
          h('label', { class: 'chk' },
            h('input', {
              type: 'checkbox',
              checked: !!it.important,
              onchange: (e) => { if (e.target.checked) it.important = true; else delete it.important; markDirty(true); },
            }),
            'Κόκκινα έντονα'),
          h('label', { class: 'chk notify-chk' },
            h('input', {
              type: 'checkbox',
              checked: !!it.notify,
              onchange: (e) => { if (e.target.checked) it.notify = true; else delete it.notify; markDirty(true); },
            }),
            'Επιλογή υπευθύνου (Viber)'),
          h('button', { type: 'button', 'aria-label': 'Πάνω', disabled: i === 0, onclick: () => move(i, -1) }, '↑'),
          h('button', { type: 'button', 'aria-label': 'Κάτω', disabled: i === items.length - 1, onclick: () => move(i, 1) }, '↓'),
          h('button', { type: 'button', class: 'danger', onclick: () => del(i) }, 'Διαγραφή'))))),
    h('button', { type: 'button', class: 'btn', onclick: add }, '+ Προσθήκη γραμμής'),
    h('h2', {}, 'Υπεύθυνοι για όλα τα καταστήματα (Viber)'),
    h('p', { class: 'hint' }, 'Εμφανίζονται στη λίστα υπευθύνων κάθε καταστήματος, μετά τους υπευθύνους του ίδιου του καταστήματος.'),
    h('div', { class: 'ed-list' }, state.data.contacts.map((c) => contactEditor(state.data, c))),
    h('button', {
      type: 'button',
      class: 'btn',
      onclick: () => { state.data.contacts.push({ id: newId('p'), name: '', phone: '' }); markDirty(true); },
    }, '+ Προσθήκη υπευθύνου'),
    saveReminder());
}

/* ---- Καταστήματα ---- */

function adminStores() {
  const stores = state.data.stores;
  if (!stores.some((s) => s.id === state.adminStore)) state.adminStore = stores[0] ? stores[0].id : null;
  const store = stores.find((s) => s.id === state.adminStore);

  const addStore = () => {
    const name = prompt('Όνομα νέου καταστήματος:');
    if (!name || !name.trim()) return;
    const st = { id: newId('s'), name: name.trim(), overrides: {}, contacts: [], extras: [] };
    stores.push(st);
    state.adminStore = st.id;
    markDirty(true);
  };

  const top = h('div', { class: 'row' },
    h('label', { class: 'field' }, 'Κατάστημα',
      h('select', {
        value: state.adminStore || '',
        onchange: (e) => { state.adminStore = e.target.value; renderAdmin(); },
      }, stores.length
        ? stores.map((s) => h('option', { value: s.id }, s.name || '(χωρίς όνομα)'))
        : h('option', { value: '' }, '— Δεν υπάρχουν καταστήματα —'))),
    h('button', { type: 'button', class: 'btn', onclick: addStore }, '+ Νέο'));

  if (!store) {
    return h('div', {}, top, h('p', { class: 'hint' }, 'Πρόσθεσε το πρώτο κατάστημα με το κουμπί «+ Νέο».'));
  }

  const delStore = () => {
    if (!confirm(`Διαγραφή του καταστήματος «${store.name}» και των ιδιαιτεροτήτων του;`)) return;
    stores.splice(stores.indexOf(store), 1);
    state.adminStore = null;
    markDirty(true);
  };
  const addExtra = () => {
    store.extras.push({ id: newId('x'), section: 'opening', after: 'start', text: '' });
    markDirty(true);
    const tas = document.querySelectorAll('#admin-body .ed-row.extra textarea');
    const last = tas[tas.length - 1];
    if (last) { last.focus(); last.scrollIntoView({ block: 'center' }); }
  };

  return h('div', {},
    top,
    h('label', { class: 'field' }, 'Όνομα καταστήματος',
      h('input', {
        type: 'text',
        value: store.name,
        oninput: (e) => { store.name = e.target.value; markDirty(false); },
        onchange: () => renderAdmin(),
      })),
    h('h2', {}, 'Προσαρμοσμένες γενικές γραμμές'),
    h('p', { class: 'hint' }, 'Αλλάζει το κείμενο μιας γενικής γραμμής μόνο για αυτό το κατάστημα. Τα άλλα καταστήματα βλέπουν το γενικό κείμενο.'),
    h('div', { class: 'ed-list' }, Object.keys(store.overrides).map((id) => overrideEditor(store, id))),
    h('button', { type: 'button', class: 'btn', onclick: () => addOverride(store) }, '+ Προσαρμογή γενικής γραμμής'),
    h('h2', {}, 'Υπεύθυνοι για ενημέρωση (Viber)'),
    h('p', { class: 'hint' }, 'Εμφανίζονται κάτω από κάθε γενική γραμμή που έχει την επιλογή «Επιλογή υπευθύνου (Viber)». Γράψε το κινητό του υπευθύνου, π.χ. 6943554348. Τον σύνδεσμο Viber τον φτιάχνει η εφαρμογή.'),
    h('div', { class: 'ed-list' }, store.contacts.map((c) => contactEditor(store, c))),
    h('button', {
      type: 'button',
      class: 'btn',
      onclick: () => { store.contacts.push({ id: newId('p'), name: '', phone: '' }); markDirty(true); },
    }, '+ Προσθήκη υπευθύνου'),
    h('h2', {}, 'Ιδιαιτερότητες καταστήματος'),
    h('p', { class: 'hint' }, 'Έξτρα γραμμές μόνο για αυτό το κατάστημα. Εμφανίζονται χρωματισμένες, στη θέση που θα διαλέξεις.'),
    h('div', { class: 'ed-list' }, store.extras.map((x) => extraEditor(store, x))),
    h('div', { class: 'stack' },
      h('button', { type: 'button', class: 'btn', onclick: addExtra }, '+ Προσθήκη ιδιαιτερότητας'),
      h('button', { type: 'button', class: 'btn danger', onclick: delStore }, 'Διαγραφή καταστήματος')),
    saveReminder());
}

function generalOptions(selectedId) {
  const opts = [];
  for (const [sec, label] of Object.entries(SECTIONS)) {
    state.data.general[sec].forEach((g, i) => opts.push(
      h('option', { value: g.id }, `${label} ${i + 1}. ${trunc(g.text, 45)}`)));
  }
  return opts;
}

function findGeneral(id) {
  for (const sec of Object.keys(SECTIONS)) {
    const g = state.data.general[sec].find((x) => x.id === id);
    if (g) return g;
  }
  return null;
}

function addOverride(store) {
  const all = Object.keys(SECTIONS).flatMap((sec) => state.data.general[sec]);
  const free = all.find((g) => !store.overrides[g.id]);
  if (!free) { toast('Όλες οι γενικές γραμμές έχουν ήδη προσαρμογή.'); return; }
  store.overrides[free.id] = { text: free.text };
  markDirty(true);
}

function overrideEditor(store, id) {
  const o = store.overrides[id];
  const g = findGeneral(id);
  return h('div', { class: 'ed-row' + (o.highlight ? ' extra' : '') },
    h('label', { class: 'field' }, 'Γενική γραμμή',
      h('select', {
        value: id,
        onchange: (e) => {
          const nid = e.target.value;
          if (store.overrides[nid]) { toast('Αυτή η γραμμή έχει ήδη προσαρμογή.'); renderAdmin(); return; }
          delete store.overrides[id];
          store.overrides[nid] = o;
          markDirty(true);
        },
      }, g ? generalOptions(id) : [h('option', { value: id }, '(η γενική γραμμή σβήστηκε)'), ...generalOptions(id)])),
    g ? h('p', { class: 'hint' }, 'Γενικό κείμενο: ', g.text) : null,
    h('label', { class: 'field' }, 'Κείμενο για αυτό το κατάστημα',
      h('textarea', { rows: 3, value: o.text || '', oninput: (e) => { o.text = e.target.value; markDirty(false); } })),
    h('div', { class: 'ed-tools' },
      h('label', { class: 'chk notify-chk' },
        h('input', {
          type: 'checkbox',
          checked: !!o.highlight,
          onchange: (e) => { if (e.target.checked) o.highlight = true; else delete o.highlight; markDirty(true); },
        }),
        'Κίτρινη (ιδιαιτερότητα)'),
      h('button', {
        type: 'button',
        class: 'danger',
        onclick: () => {
          if (!confirm('Διαγραφή της προσαρμογής; Θα εμφανίζεται ξανά το γενικό κείμενο.')) return;
          delete store.overrides[id];
          markDirty(true);
        },
      }, 'Διαγραφή')));
}

function contactEditor(store, c) {
  return h('div', { class: 'ed-row' },
    h('label', { class: 'field' }, 'Όνομα υπευθύνου',
      h('input', { type: 'text', value: c.name, placeholder: 'Ονοματεπώνυμο', oninput: (e) => { c.name = e.target.value; markDirty(false); } })),
    h('label', { class: 'field' }, 'Κινητό (Viber)',
      h('input', {
        type: 'tel',
        value: c.phone || (phoneDigits(c) ? phoneDigits(c).replace(/^30/, '') : ''),
        placeholder: '69XXXXXXXX',
        inputmode: 'tel',
        oninput: (e) => { c.phone = e.target.value; delete c.viber; markDirty(false); },
      })),
    h('div', { class: 'ed-tools' },
      h('button', {
        type: 'button',
        class: 'danger',
        onclick: () => {
          if (!confirm(`Διαγραφή του υπευθύνου «${c.name || ''}»;`)) return;
          store.contacts.splice(store.contacts.indexOf(c), 1);
          markDirty(true);
        },
      }, 'Διαγραφή')));
}

function extraEditor(store, x) {
  const general = state.data.general[x.section];
  const afterOptions = [h('option', { value: 'start' }, 'Στην αρχή')];
  general.forEach((g, i) => afterOptions.push(h('option', { value: g.id }, `Μετά τη γραμμή ${i + 1}. ${trunc(g.text, 45)}`)));
  if (x.after !== 'start' && !general.some((g) => g.id === x.after)) {
    afterOptions.push(h('option', { value: x.after }, 'Στο τέλος (η γραμμή αναφοράς σβήστηκε)'));
  }

  return h('div', { class: 'ed-row extra' },
    h('div', { class: 'row' },
      h('label', { class: 'field' }, 'Ενότητα',
        h('select', {
          value: x.section,
          onchange: (e) => { x.section = e.target.value; x.after = 'start'; markDirty(true); },
        }, Object.entries(SECTIONS).map(([k, l]) => h('option', { value: k }, l))))),
    h('label', { class: 'field' }, 'Θέση',
      h('select', {
        value: x.after,
        onchange: (e) => { x.after = e.target.value; markDirty(false); },
      }, afterOptions)),
    h('label', { class: 'field' }, 'Κείμενο',
      h('textarea', {
        rows: 2,
        value: x.text,
        placeholder: 'Τι πρέπει να γίνει σε αυτό το κατάστημα…',
        oninput: (e) => { x.text = e.target.value; markDirty(false); },
      })),
    h('div', { class: 'ed-tools' },
      h('button', {
        type: 'button',
        class: 'danger',
        onclick: () => {
          if (!confirm('Διαγραφή αυτής της ιδιαιτερότητας;')) return;
          store.extras.splice(store.extras.indexOf(x), 1);
          markDirty(true);
        },
      }, 'Διαγραφή')));
}

function saveReminder() {
  if (!state.hasDraft) return null;
  return h('p', { class: 'hint' }, 'Οι αλλαγές φαίνονται μόνο σε αυτή τη συσκευή μέχρι να πατήσεις «Αποθήκευση για όλους» στην καρτέλα Αποθήκευση.');
}

/* ---- Αποθήκευση ---- */

function defaultSettings() {
  const s = { owner: 'gmisokas', repo: 'Stores-Checlist', branch: 'main', token: '' };
  if (location.hostname.endsWith('.github.io')) {
    s.owner = location.hostname.split('.')[0];
    const first = location.pathname.split('/').filter(Boolean)[0];
    if (first) s.repo = first;
  }
  return s;
}
function getSettings() { return Object.assign(defaultSettings(), lsGet(LS.settings, {})); }

function cleanContacts(list) {
  return (list || [])
    .map((c) => ({ id: c.id, name: (c.name || '').trim(), phone: phoneDigits(c).replace(/^30(?=\d{10}$)/, '') }))
    .filter((c) => c.name && c.phone);
}

function findGeneralIn(data, id) {
  return Object.keys(SECTIONS).some((sec) => data.general[sec].some((g) => g.id === id));
}

function cleanData(data) {
  const out = JSON.parse(JSON.stringify(data));
  for (const s of Object.keys(SECTIONS)) {
    out.general[s] = out.general[s]
      .map((it) => Object.assign(it, { text: (it.text || '').trim() }))
      .filter((it) => it.text);
  }
  out.contacts = cleanContacts(out.contacts);
  out.stores = out.stores
    .map((st) => Object.assign(st, {
      name: (st.name || '').trim() || 'Χωρίς όνομα',
      overrides: Object.fromEntries(Object.entries(st.overrides || {})
        .filter(([id, o]) => findGeneralIn(out, id) && o && (o.text || '').trim())
        .map(([id, o]) => [id, o.highlight ? { text: o.text.trim(), highlight: true } : { text: o.text.trim() }])),
      contacts: cleanContacts(st.contacts),
      extras: st.extras
        .map((x) => Object.assign(x, { text: (x.text || '').trim() }))
        .filter((x) => x.text),
    }));
  out.cleaning = cleanCleaning(out.cleaning);
  return out;
}

function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}

async function githubDetail(e) {
  try {
    if (e && typeof e.json === 'function') {
      const j = await e.clone().json();
      return `${e.status}: ${j.message || ''}`.trim();
    }
  } catch (x) { /* τίποτα */ }
  return e && e.message ? String(e.message) : '';
}

async function testToken(out) {
  const s = getSettings();
  const tok = s.token || '';
  const lines = [];
  lines.push(tok
    ? `Κλειδί στη συσκευή: αρχίζει «${tok.slice(0, 11)}», μήκος ${tok.length} χαρακτήρες.`
    : 'Δεν υπάρχει κλειδί αποθηκευμένο σε αυτή τη συσκευή.');
  out.textContent = lines.join('\n');
  if (!tok) return;
  if (!/^[\x21-\x7e]+$/.test(tok)) {
    out.textContent = lines.concat('Το κλειδί έχει περίεργους χαρακτήρες (π.χ. ελληνικά ή «…»). Ξαναγράψ’ το με επικόλληση από το GitHub.').join('\n');
    return;
  }
  const headers = { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json' };
  try {
    const u = await fetch('https://api.github.com/user', { headers, cache: 'no-store' });
    if (!u.ok) {
      lines.push(`Το GitHub δεν δέχεται το κλειδί → ${await githubDetail(u)}`);
      out.textContent = lines.join('\n');
      return;
    }
    lines.push(`Το κλειδί ισχύει για τον λογαριασμό «${(await u.json()).login}».`);
    const r = await fetch(`https://api.github.com/repos/${encodeURIComponent(s.owner)}/${encodeURIComponent(s.repo)}`, { headers, cache: 'no-store' });
    if (!r.ok) lines.push(`Το repo «${s.owner}/${s.repo}» δεν φαίνεται από αυτό το κλειδί → ${await githubDetail(r)}`);
    else {
      const j = await r.json();
      lines.push(j.permissions && j.permissions.push
        ? 'Το repo βρέθηκε και το κλειδί έχει δικαίωμα εγγραφής. Όλα εντάξει ✅'
        : 'Το repo βρέθηκε, αλλά το κλειδί ΔΕΝ έχει δικαίωμα εγγραφής. Στο Contents βάλε «Read and write».');
    }
  } catch (e) {
    lines.push('Δεν έγινε σύνδεση με το GitHub. Έλεγξε το ίντερνετ. ' + (e && e.message ? e.message : ''));
  }
  out.textContent = lines.join('\n');
}

async function saveToGithub(btn) {
  const s = getSettings();
  if (!s.token) { toast('Βάλε πρώτα το κλειδί (token) στις ρυθμίσεις παρακάτω.'); return; }

  const clean = cleanData(state.data);
  const json = JSON.stringify(clean, null, 2) + '\n';
  const api = `https://api.github.com/repos/${encodeURIComponent(s.owner)}/${encodeURIComponent(s.repo)}/contents/data.json`;
  const headers = { Authorization: 'Bearer ' + s.token, Accept: 'application/vnd.github+json' };

  btn.disabled = true;
  btn.textContent = 'Αποθήκευση…';
  try {
    let sha;
    const g = await fetch(`${api}?ref=${encodeURIComponent(s.branch)}`, { headers, cache: 'no-store' });
    if (g.ok) sha = (await g.json()).sha;
    else if (g.status !== 404) throw g;

    const p = await fetch(api, {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
      body: JSON.stringify({
        message: 'Ενημέρωση checklist από την οθόνη Διαχείρισης',
        content: toBase64(json),
        branch: s.branch,
        sha,
      }),
    });
    if (!p.ok) throw p;

    state.data = normalize(clean);
    state.hasDraft = false;
    lsDel(LS.draft);
    $('draft-banner').hidden = true;
    fillStoreSelect();
    renderAdmin();
    toast('Αποθηκεύτηκε! Σε 1–2 λεπτά θα το βλέπουν όλα τα κινητά.', 6000);
  } catch (e) {
    const status = e && e.status;
    const detail = await githubDetail(e);
    const msg = status === 401 ? 'Το κλειδί (token) δεν είναι σωστό ή έληξε.'
      : status === 403 ? 'Το κλειδί δεν έχει δικαίωμα εγγραφής σε αυτό το repo.'
        : status === 404 ? 'Δεν βρέθηκε το repo ή ο κλάδος (branch). Έλεγξε τις ρυθμίσεις.'
          : status === 409 || status === 422 ? 'Το αρχείο άλλαξε στο μεταξύ. Δοκίμασε ξανά.'
            : 'Δεν έγινε αποθήκευση. Έλεγξε τη σύνδεση.';
    toast(msg + (detail ? ` (${detail})` : ''), 9000);
    btn.disabled = false;
    btn.textContent = 'Αποθήκευση για όλους';
  }
}

function downloadData() {
  const json = JSON.stringify(cleanData(state.data), null, 2) + '\n';
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = h('a', { href: url, download: 'data.json' });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function discardDraft() {
  if (!confirm('Να χαθούν οι αλλαγές που δεν αποθηκεύτηκαν;')) return;
  try {
    state.data = await fetchServerData();
  } catch (e) {
    toast('Δεν φορτώθηκε το αρχείο από τον server. Δοκίμασε ξανά.');
    return;
  }
  lsDel(LS.draft);
  state.hasDraft = false;
  $('draft-banner').hidden = true;
  fillStoreSelect();
  renderAdmin();
  toast('Οι αλλαγές απορρίφθηκαν.');
}

function adminSave() {
  const s = getSettings();
  const inputs = {
    owner: h('input', { type: 'text', value: s.owner, autocomplete: 'off' }),
    repo: h('input', { type: 'text', value: s.repo, autocomplete: 'off' }),
    branch: h('input', { type: 'text', value: s.branch, autocomplete: 'off' }),
    token: h('input', { type: 'password', value: s.token, autocomplete: 'off', placeholder: 'github_pat_…' }),
  };
  const saveSettings = () => {
    const v = {};
    for (const k of Object.keys(inputs)) v[k] = inputs[k].value.trim();
    v.token = v.token.replace(/[\s\u200b-\u200d\ufeff]+/g, '');
    lsSet(LS.settings, v);
    toast('Οι ρυθμίσεις αποθηκεύτηκαν σε αυτή τη συσκευή.');
    renderAdmin();
  };

  return h('div', {},
    h('div', { class: 'box' },
      h('h2', {}, state.hasDraft ? 'Υπάρχουν αλλαγές που δεν αποθηκεύτηκαν' : 'Δεν υπάρχουν νέες αλλαγές'),
      h('p', { class: 'hint' }, 'Με την «Αποθήκευση για όλους» οι αλλαγές ανεβαίνουν στο GitHub και σε 1–2 λεπτά τις βλέπουν όλα τα κινητά.'),
      h('div', { class: 'stack' },
        h('button', { type: 'button', class: 'btn dark', disabled: !state.hasDraft, onclick: (e) => saveToGithub(e.currentTarget) }, 'Αποθήκευση για όλους'),
        h('button', { type: 'button', class: 'btn', onclick: downloadData }, 'Λήψη αρχείου data.json'),
        h('button', { type: 'button', class: 'btn danger', disabled: !state.hasDraft, onclick: discardDraft }, 'Απόρριψη αλλαγών'))),
    h('div', { class: 'box' },
      h('h2', {}, 'Ρυθμίσεις (μία φορά)'),
      h('p', { class: 'hint' }, 'Το κλειδί (token) μένει μόνο σε αυτή τη συσκευή. Μην το δίνεις σε υπαλλήλους. Οδηγίες στο README του repo.'),
      h('label', { class: 'field' }, 'Κλειδί GitHub (token)', inputs.token),
      h('label', { class: 'field' }, 'Λογαριασμός GitHub', inputs.owner),
      h('label', { class: 'field' }, 'Repo', inputs.repo),
      h('label', { class: 'field' }, 'Κλάδος (branch)', inputs.branch),
      h('button', { type: 'button', class: 'btn', onclick: saveSettings }, 'Αποθήκευση ρυθμίσεων'),
      h('button', { type: 'button', class: 'btn', onclick: () => testToken($('token-result')) }, 'Δοκιμή κλειδιού'),
      h('pre', { id: 'token-result', class: 'hint result' })));
}

/* ---------- Οδηγίες «Προσθήκη στην αρχική οθόνη» ---------- */

const A2HS_HIDE = 'cl-a2hs-hide';

function isStandalone() {
  return window.navigator.standalone === true ||
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
}

function showA2hs(os) {
  const dlg = $('a2hs');
  os = os || (/android/i.test(navigator.userAgent) ? 'android' : 'ios');
  dlg.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.os === os)));
  $('a2hs-ios').hidden = os !== 'ios';
  $('a2hs-android').hidden = os !== 'android';
  $('a2hs-hide').checked = !!lsGet(A2HS_HIDE, false);
  if (!dlg.open) dlg.showModal();
}

function initA2hs() {
  const dlg = $('a2hs');
  dlg.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => showA2hs(b.dataset.os)));
  $('a2hs-ok').addEventListener('click', () => {
    if ($('a2hs-hide').checked) lsSet(A2HS_HIDE, true); else lsDel(A2HS_HIDE);
    dlg.close();
  });
  $('open-a2hs').addEventListener('click', (e) => { e.preventDefault(); showA2hs(); });
  if (!isStandalone() && !lsGet(A2HS_HIDE, false) && location.hash !== '#admin') showA2hs();
}

/* ==========================================================
   Πλοήγηση & εκκίνηση
   ========================================================== */

function route() {
  const admin = location.hash === '#admin';
  $('view-checklist').hidden = admin;
  $('view-admin').hidden = !admin;
  if (admin) renderAdmin();
  else { fillStoreSelect(); renderChecklist(); }
  window.scrollTo(0, 0);
}

function rememberLast() {
  lsSet(LS.last, { store: f.store.value, name: f.name.value });
}

async function init() {
  f.date = $('f-date');
  f.name = $('f-name');
  f.store = $('f-store');

  await load();
  cleanupOldProgress();
  cleanupOldLog();

  const last = lsGet(LS.last, {});
  f.date.value = todayISO();
  f.name.value = last.name || '';
  state.section = '';
  $('draft-banner').hidden = !state.hasDraft;

  f.date.addEventListener('change', renderChecklist);
  let prevStore = f.store.value;
  f.store.addEventListener('focus', () => { prevStore = f.store.value; });
  f.store.addEventListener('change', () => {
    if (state.section === 'log' && prevStore !== f.store.value && !draftLeaveOk(prevStore)) { f.store.value = prevStore; return; }
    prevStore = f.store.value;
    rememberLast();
    state.logMode = 'main';
    state.logArchiveMonth = null;
    renderChecklist();
    syncStore(f.store.value);
  });
  f.name.addEventListener('input', () => { rememberLast(); updateWho(); });
  document.querySelectorAll('#section-seg button').forEach((b) => b.addEventListener('click', () => {
    if (state.section === 'log' && b.dataset.section !== 'log' && !draftLeaveOk(f.store.value)) return;
    state.section = b.dataset.section;
    if (state.section === 'log' && state.logMode !== 'archive') state.logMode = 'main';
    renderChecklist();
  }));
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
    state.adminTab = b.dataset.tab;
    renderAdmin();
  }));

  $('btn-share').addEventListener('click', share);
  $('btn-archive').addEventListener('click', sendToArchive);
  // Τικ καθαριοτήτων/αποψύξεων που δεν αποθηκεύτηκαν: ο browser ρωτά πριν κλείσει η σελίδα.
  window.addEventListener('beforeunload', (e) => {
    if (f.store.value && getDraft(f.store.value).length) { e.preventDefault(); e.returnValue = ''; }
  });
  $('btn-excel').addEventListener('click', exportExcel);
  $('btn-print').addEventListener('click', () => {
    if (!SECTIONS[state.section]) { toast('Επίλεξε πρώτα Άνοιγμα ή Κλείσιμο.'); return; }
    renderPrint();
    window.print();
  });
  window.addEventListener('beforeprint', () => {
    if (SECTIONS[state.section]) renderPrint(); else $('print-area').replaceChildren();
  });
  $('btn-reset').addEventListener('click', () => {
    if (!confirm(`Να σβηστούν όλα τα ✓/✗ και οι σημειώσεις για «${SECTIONS[state.section]}» αυτής της ημέρας;`)) return;
    lsDel(progKey());
    renderChecklist();
  });

  window.addEventListener('hashchange', route);
  route();
  initA2hs();
  initLogSync();
}

init();
