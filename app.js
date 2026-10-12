'use strict';

/* ==========================================================
   Checklist καταστημάτων – Lartecono DaVinci
   Τα δεδομένα βρίσκονται στο data.json. Αλλάζουν από την
   οθόνη «Διαχείριση», όχι από εδώ.
   ========================================================== */

// Έκδοση της εφαρμογής. Σε κάθε αλλαγή: ίδιος αριθμός εδώ, στο version.json και στα ?v= του index.html.
const APP_VERSION = '31';
// Οι ενότητες γράφονται πάντα με κεφαλαία (ΑΝΟΙΓΜΑ, ΚΛΕΙΣΙΜΟ, ΚΑΘΑΡΙΟΤΗΤΕΣ / ΑΠΟΨΥΞΕΙΣ).
const SECTIONS = { opening: 'ΑΝΟΙΓΜΑ', closing: 'ΚΛΕΙΣΙΜΟ' };
// Τίτλος στη μπάρα κάθε ενότητας (στον υπεύθυνο, ανάλογα με την οθόνη: managerTitle στο cleaning.js).
const SEC_TITLE = { opening: '☀️ ΑΝΟΙΓΜΑ', closing: '🌙 ΚΛΕΙΣΙΜΟ', log: '🧽 ΚΑΘΑΡΙΟΤΗΤΕΣ / ΑΠΟΨΥΞΕΙΣ', manager: '⚙️ ΥΠΕΥΘΥΝΟΣ' };
const GENERAL_ID = '__general';
const LS = {
  draft: 'cl-draft',
  settings: 'cl-settings',
  last: 'cl-last',
  progPrefix: 'cl-prog:',
};

const state = {
  data: null,
  hasDraft: false,
  // '' = αρχική · opening / closing / log · manager (υπεύθυνος καταστήματος)
  section: '',
  whoEdit: false,
  logOther: false,
  logSkip: null,
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
  // Πρόγραμμα μήνα του υπευθύνου
  planEdit: null,
  // Μετά τον κωδικό υπευθύνου: κατευθείαν σε αυτή την οθόνη (π.χ. 'setup').
  mgrNext: null,
  // Το κατάστημα που χρησιμοποιεί η εφαρμογή και αν η νέα επιλογή επιβεβαιώθηκε.
  storeNow: '',
  storeOk: false,
  planPw: '',
  planPwStore: '',
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

// Η ημέρα του καταστήματος αλλάζει στις 05:00: ό,τι γίνεται μετά τα μεσάνυχτα (π.χ. κλείσιμο στις 00:30)
// μετράει για την προηγούμενη ημέρα.
const DAY_START_HOUR = 5;
function bizISO(dt) {
  const d = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() - (dt.getHours() < DAY_START_HOUR ? 1 : 0));
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function todayISO() { return bizISO(new Date()); }
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
  state.resetAt = (server && server.cleaning.resetAt) || '';
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
    .forEach((x) => rows.push({ key: x.id, text: x.text, extra: true, important: !!x.important }));

  pushExtras('start');
  general.forEach((g) => {
    // Προσαρμογή της γενικής γραμμής μόνο για αυτό το κατάστημα.
    const o = overrides[g.id];
    // Γενική γραμμή που δεν ισχύει σε αυτό το κατάστημα (π.χ. δεν υπάρχει συναγερμός).
    if (o && o.hidden) { pushExtras(g.id); return; }
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
    .forEach((x) => rows.push({ key: x.id, text: x.text, extra: true, important: !!x.important }));
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

// Το DEMO δεν είναι στη λίστα: μπαίνει μόνο όσο είναι επιλεγμένο (από το «🎓 Εκπαίδευση»).
function fillStoreSelect() {
  const keep = f.store.value || (lsGet(LS.last, {}).store || '');
  f.store.replaceChildren(...[
    h('option', { value: '' }, '— Επίλεξε κατάστημα —'),
    keep === DEMO_ID ? demoOption() : null,
    h('option', { value: GENERAL_ID }, 'ΓΕΝΙΚΟ'),
    ...state.data.stores.map((s) => h('option', { value: s.id }, s.name || '(χωρίς όνομα)')),
  ].filter(Boolean));
  f.store.value = keep === GENERAL_ID || keep === DEMO_ID || state.data.stores.some((s) => s.id === keep) ? keep : '';
  state.storeNow = f.store.value;
}

/* ---------- Επιβεβαίωση καταστήματος ---------- */

// Για να μη διαλέξει κάποιος κατά λάθος άλλο κατάστημα: πληκτρολογεί το όνομά του.
// Δεν ζητείται για το DEMO ούτε για το κατάστημα που έχει ήδη το κινητό.
function needsConfirm(id) { return !!id && id !== DEMO_ID && id !== (lsGet(LS.last, {}).store || ''); }

// Χωρίς τόνους, κεφαλαία, χωρίς διπλά κενά: «Ψυρρή» = «ΨΥΡΡΗ».
function storeKey(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
}

function confirmStore(id) {
  const st = state.data.stores.find((s) => s.id === id);
  const name = id === GENERAL_ID ? 'ΓΕΝΙΚΟ' : (st && st.name) || '';
  const dlg = $('log-dialog');
  const input = h('input', { type: 'text', autocomplete: 'off', autocapitalize: 'characters', autocorrect: 'off', spellcheck: 'false' });
  const msg = h('p', { class: 'warn', hidden: true });
  const ok = (e) => {
    e.preventDefault();
    if (storeKey(input.value) !== storeKey(name)) {
      msg.textContent = `Δεν ταιριάζει. Πληκτρολογήστε: ${name}`;
      msg.hidden = false;
      input.select();
      return;
    }
    dlg.close();
    state.storeOk = true;
    f.store.value = id;
    f.store.dispatchEvent(new Event('change'));
  };
  $('log-dialog-body').replaceChildren(h('form', { class: 'store-confirm', onsubmit: ok },
    h('h2', {}, 'Επιβεβαίωση καταστήματος'),
    h('p', {}, 'Για επιβεβαίωση πληκτρολογήστε το όνομα του καταστήματος όπως το βλέπετε:'),
    h('div', { class: 'store-name' }, name),
    h('label', { class: 'field' }, 'Όνομα καταστήματος', input),
    msg,
    h('div', { class: 'stack' },
      h('button', { type: 'submit', class: 'btn dark' }, 'Επιβεβαίωση'),
      h('button', { type: 'button', class: 'btn ghost', onclick: () => dlg.close() }, 'Άκυρο'))));
  dlg.showModal();
  setTimeout(() => input.focus(), 50);
}

function demoOption() { return h('option', { value: DEMO_ID }, 'DEMO – εκπαίδευση'); }

function enterDemo() {
  if (isDemo()) return;
  if (![...f.store.options].some((o) => o.value === DEMO_ID)) f.store.add(demoOption(), 1);
  f.store.value = DEMO_ID;
  f.store.dispatchEvent(new Event('change'));
}

// Έξοδος από το DEMO: πίσω στο κατάστημα του κινητού (ή στην επιλογή καταστήματος).
function leaveDemo() {
  if (typeof tourStop === 'function') tourStop();
  f.store.value = lsGet(LS.last, {}).store || '';
  f.store.dispatchEvent(new Event('change'));
  window.scrollTo(0, 0);
}

// Όνομα που εμφανίζεται για την επιλογή καταστήματος (κατάστημα, ΓΕΝΙΚΟ ή κενό).
function storeLabel() {
  if (f.store.value === GENERAL_ID) return 'ΓΕΝΙΚΟ';
  if (f.store.value === DEMO_ID) return 'DEMO';
  const st = currentStore();
  return st ? st.name : '';
}

// Έτοιμο για χρήση: κατάστημα και όνομα (στο DEMO αρκεί το κατάστημα).
function ready() { return !!f.store.value && (isDemo() || !!f.name.value.trim()); }

// «Τετ 14/10», «Χθες, Τρι 13/10» ή «Δευ 5/10/2026».
function dayText(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const label = `${DAYS_SHORT[new Date(y, m - 1, d).getDay()]} ${d}/${m}`;
  const today = todayISO();
  if (iso === today) return label;
  if (iso === addDays(today, -1)) return `Χθες, ${label}`;
  return `${label}/${y}`;
}

// Γραμμή «ΚΑΤΑΣΤΗΜΑ · Όνομα · Ημέρα ✎». Άλλη ημέρα από σήμερα φαίνεται με χρώμα.
function updateInfo() {
  const d = f.date.value;
  $('who-text').replaceChildren(
    h('b', {}, storeLabel() || '—'), ' · ',
    f.name.value.trim() || (isDemo() ? 'χωρίς όνομα' : '—'), ' · ',
    h('span', { class: d && d !== todayISO() ? 'who-day other' : 'who-day' }, d ? dayText(d) : '—'));
}

// Ανοίγει τα στοιχεία για συμπλήρωση (π.χ. όταν λείπει το όνομα).
function askWho(field) {
  state.whoEdit = true;
  renderChecklist();
  $('who').scrollIntoView({ block: 'start' });
  (field || f.name).focus();
}

function whoDone() {
  if (!f.store.value) { toast('Διάλεξε κατάστημα.'); f.store.focus(); return; }
  if (!isDemo() && !f.name.value.trim()) { toast('Γράψε το ονοματεπώνυμό σου.'); f.name.focus(); return; }
  if (!f.date.value) f.date.value = todayISO();
  state.whoEdit = false;
  rememberLast();
  renderChecklist();
}

/* ---------- Πλοήγηση: αρχική ↔ ενότητες ---------- */

// Όσο είσαι σε ενότητα υπάρχει ένα επιπλέον βήμα στο ιστορικό, ώστε το «πίσω» του κινητού
// να γυρίζει στην αρχική αντί να κλείνει την εφαρμογή.
function openSection(sec) {
  if (!ready()) return;
  if (!state.section && sec) { try { history.pushState({ app: 'sec' }, ''); } catch (e) { /* τίποτα */ } }
  state.section = sec;
  state.logMode = 'main';
  state.planEdit = null;
  state.logSkip = null;
  state.logOther = false;
  state.whoEdit = false;
  $('more').open = false;
  renderChecklist();
  window.scrollTo(0, 0);
}

// Ένα βήμα πίσω: από οθόνη του υπευθύνου στο μενού του, αλλιώς στην αρχική. false = ακυρώθηκε.
function stepBack() {
  if (state.section === 'manager' && managerSub()) {
    if (state.logMode === 'plan' && state.planEdit && state.planEdit.dirty
      && !confirm('Υπάρχουν αλλαγές στο πρόγραμμα που δεν αποθηκεύτηκαν. Να χαθούν;')) return false;
    state.logMode = 'main';
    state.planEdit = null;
  } else {
    state.section = '';
    state.logMode = 'main';
    state.planEdit = null;
    state.logSkip = null;
  }
  state.whoEdit = false;
  renderChecklist();
  window.scrollTo(0, 0);
  return true;
}

function uiBack() {
  if (!stepBack()) return;
  if (!state.section && history.state && history.state.app === 'sec') history.back();
}

// Στην αρχική χωρίς ερωτήσεις (αλλαγή καταστήματος, DEMO).
function goHome() {
  const was = !!state.section;
  state.section = '';
  state.logMode = 'main';
  state.planEdit = null;
  state.logSkip = null;
  if (was && history.state && history.state.app === 'sec') history.back();
}

function onPopState() {
  if (location.hash === '#admin' || $('view-checklist').hidden || !state.section) return;
  const ok = stepBack();
  if (!ok || state.section) { try { history.pushState({ app: 'sec' }, ''); } catch (e) { /* τίποτα */ } }
}

// Μπάρα ενότητας: τίτλος και «‹ Αρχική» (ή «‹ Υπεύθυνος» μέσα στις οθόνες του υπευθύνου).
function updateSecBar() {
  const sec = state.section;
  if (!sec) return;
  const title = $('sec-title');
  title.textContent = sec === 'manager' ? managerTitle() : SEC_TITLE[sec];
  title.className = 'sec-title s-' + sec;
  $('back-label').textContent = sec === 'manager' && managerSub() ? 'Υπεύθυνος' : 'Αρχική';
}

/* ---------- Αρχική: πλακίδια ---------- */

// Κατάσταση ΑΝΟΙΓΜΑΤΟΣ / ΚΛΕΙΣΙΜΑΤΟΣ της ημέρας για το πλακίδιο.
function sectionStatus(sec) {
  const sk = f.store.value;
  const rows = buildRows(sec, currentStore());
  const prog = lsGet(`${LS.progPrefix}${sk || 'geniko'}:${f.date.value}:${sec}`, {});
  const done = rows.filter((r) => (prog[r.key] || {}).s).length;
  let rec = lsGet(`cl-sent:${sk}:${f.date.value}:${sec}`, null);
  if (typeof rec === 'string') rec = { at: rec };
  if (rec && rec.at) return ['ok', `✓ Στάλθηκε ${new Date(rec.at).toTimeString().slice(0, 5)}`];
  if (!done) return ['', 'Δεν ξεκίνησε'];
  return [done === rows.length ? 'ok' : 'wip', `${done} από ${rows.length}`];
}

function updateHome() {
  if (!ready()) return;
  for (const sec of Object.keys(SECTIONS)) {
    const [cls, text] = sectionStatus(sec);
    const el = $('sub-' + sec);
    el.textContent = text;
    el.className = 'tile-sub' + (cls ? ' ' + cls : '');
  }
  updateTodoBadge();
}

// Ποια οθόνη φαίνεται: αρχική (πλακίδια), ΑΝΟΙΓΜΑ / ΚΛΕΙΣΙΜΟ, ΚΑΘΑΡΙΟΤΗΤΕΣ / ΑΠΟΨΥΞΕΙΣ ή υπεύθυνος.
function renderChecklist() {
  // Πρώτα κατάστημα και όνομα.
  if (!ready() && state.section) goHome();
  const sec = state.section;
  const home = !sec;
  const check = !!SECTIONS[sec];
  const isLog = sec === 'log' || sec === 'manager';
  document.body.dataset.sec = sec || 'home';
  $('topbar').hidden = !home;
  $('sec-bar').hidden = home;
  $('demo-banner').hidden = !isDemo();

  $('who').hidden = sec === 'manager';
  $('who-line').hidden = !ready();
  $('who-line').setAttribute('aria-expanded', String(!!state.whoEdit));
  $('who-box').hidden = ready() && !state.whoEdit;
  $('who-title').textContent = ready() ? 'Αλλαγή στοιχείων' : 'Καλώς ήρθες! Διάλεξε κατάστημα και γράψε το ονοματεπώνυμό σου.';
  $('date-field').hidden = !ready();
  $('date-hint').hidden = !ready();
  $('who-done').textContent = ready() ? 'Τέλος' : 'Συνέχεια';
  updateInfo();

  $('home').hidden = !home || !ready();
  $('home-foot').hidden = !home;

  const rows = check ? buildRows(sec, currentStore()) : [];
  const prog = check ? getProg() : {};
  $('items').hidden = !check;
  $('items').replaceChildren(...rows.map((r, i) => rowEl(r, i + 1, prog)));
  $('legend').hidden = !rows.some((r) => r.extra);
  $('progress').hidden = !check;
  $('checklist-actions').hidden = !check;
  $('log-view').hidden = !isLog;

  updateSecBar();
  if (home) updateHome(); else updateTodoBadge();
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
      'aria-label': 'Σημείωση',
      title: 'Σημείωση',
      onclick: () => { note.hidden = !note.hidden; if (!note.hidden) note.focus(); },
    }, '✎')),
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
  $('progress-text').textContent = `${s.ok + s.no} από ${s.rows.length} · ✓ ${s.ok} · ✗ ${s.no}`;
}

/* ---------- Αποστολή στο Viber ---------- */

function summaryText() {
  const s = stats();
  const store = currentStore();
  const lines = [];
  lines.push(`📋 ${SECTIONS[state.section]} – ${storeLabel() || 'Χωρίς κατάστημα'}`);
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
  if (!SECTIONS[state.section]) { toast('Επίλεξε πρώτα «ΑΝΟΙΓΜΑ» ή «ΚΛΕΙΣΙΜΟ».'); return; }
  if (state.data.stores.length && !f.store.value) { toast('Επίλεξε πρώτα κατάστημα.'); askWho(f.store); return; }
  if (!f.name.value.trim() && !isDemo()) { toast('Συμπλήρωσε το όνομα του υπευθύνου.'); askWho(); return; }
  const s = stats();
  if (s.left && !confirm(`Υπάρχουν ${s.left} γραμμές χωρίς ✓ ή ✗. Να σταλεί έτσι;`)) return;
  // Η αποστολή στο Viber αποθηκεύει και στο αρχείο (χωρίς αναμονή: η κοινοποίηση ανοίγει αμέσως).
  if (shared() && f.store.value && f.date.value) {
    queueChecklist();
    syncStore(f.store.value);
    updateArchiveBtn();
  }

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
  if (pend && sync.busy[f.store.value]) return ['wait', '⏳ Αποστολή…'];
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

// Το checklist μπαίνει στην ουρά για το κοινό αρχείο (χωρίς αναμονή δικτύου).
function queueChecklist() {
  const s = stats();
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
}

async function sendToArchive() {
  if (!SECTIONS[state.section]) { toast('Επίλεξε πρώτα «ΑΝΟΙΓΜΑ» ή «ΚΛΕΙΣΙΜΟ».'); return; }
  if (!f.store.value) { toast('Επίλεξε πρώτα κατάστημα.'); askWho(f.store); return; }
  if (!f.name.value.trim()) { toast('Συμπλήρωσε το όνομα του υπευθύνου.'); askWho(); return; }
  if (!f.date.value) { toast('Συμπλήρωσε την ημερομηνία.'); askWho(f.date); return; }
  const s = stats();
  if (s.left && !confirm(`Υπάρχουν ${s.left} γραμμές χωρίς ✓ ή ✗. Να αποθηκευτεί έτσι στο αρχείο;`)) return;
  const sk = f.store.value;
  queueChecklist();
  state.archSaving = true;
  updateArchiveBtn();
  await syncStore(sk);
  state.archSaving = false;
  updateArchiveBtn();
}

// Κοινοποίηση κειμένου (Viber κ.λπ.)· αλλιώς αντιγραφή ή παράθυρο με το κείμενο.
async function shareText(text) {
  // Στο DEMO δεν στέλνεται τίποτα: φαίνεται μόνο το μήνυμα.
  if (isDemo()) { showTextDialog('DEMO: έτσι θα έφτανε το μήνυμα στο Viber. Δεν στάλθηκε.', text); return; }
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
    h('h1', { class: 'p-title' }, `Checklist καταστήματος – ${SECTIONS[state.section]} – Lartecono DaVinci`),
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
  dCell: 10, dSug: 11, dDone: 12, dWe: 13, headWe: 14, bad: 15, good: 16, dLate: 17, dMiss: 18, dSkip: 19,
};

const XLSX_STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="5"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFC62828"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF2E7D32"/><name val="Calibri"/></font></fonts>
<fills count="10"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE0E0E0"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF3C4"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD6E6FF"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFC8E6C9"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF0F0F0"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFBDBDBD"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFE0B2"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFDEAEA"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="20">
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
<xf numFmtId="0" fontId="1" fillId="8" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="9" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

// Το φύλλο της ενότητας που φαίνεται (Άνοιγμα ή Κλείσιμο), με ό,τι έχει συμπληρωθεί. Για Excel και PDF.
function checklistSheet() {
  const st = stats();
  const s = sheetRows();
  s.add([[0, `Checklist καταστήματος – ${SECTIONS[state.section]} – Lartecono DaVinci`, XS.title]]);
  s.add([[0, `Ημερομηνία: ${fmtDate(f.date.value)}`, XS.label]]);
  s.add([[0, `Υπεύθυνος: ${f.name.value.trim()}`, XS.label]]);
  s.add([[0, `Κατάστημα: ${storeLabel()}`, XS.label]]);
  s.skip();
  s.add([[0, '#', XS.head], [1, 'Ενέργεια', XS.head], [2, '✓', XS.head], [3, '✗', XS.head], [4, 'Σημειώσεις', XS.head]]);
  const headRow = s.r;
  st.rows.forEach((x, i) => {
    const p = st.prog[x.key] || {};
    const textStyle = x.important ? (x.extra ? XS.impX : XS.imp) : (x.extra ? XS.xCell : XS.cell);
    const ctr = x.extra ? XS.xCenter : XS.center;
    s.add([[0, i + 1, ctr], [1, x.text, textStyle], [2, p.s === 'ok' ? '✓' : '', ctr],
      [3, p.s === 'no' ? '✗' : '', ctr], [4, p.n || '', x.extra ? XS.xCell : XS.cell]]);
  });
  if (st.rows.some((x) => x.extra)) {
    s.skip();
    s.add([[0, 'Οι κίτρινες γραμμές αφορούν ιδιαιτερότητες του συγκεκριμένου καταστήματος.', 0]]);
  }
  const pane = `ySplit="${headRow}" topLeftCell="A${headRow + 1}" activePane="bottomLeft"`;
  return makeSheet(SECTIONS[state.section], s, [[1, 1, 5], [2, 2, 70], [3, 4, 5], [5, 5, 35]], pane, 'portrait', [headRow, headRow]);
}

// Ένα φύλλο: γραμμές XML, πλάτη στηλών, «πάγωμα» κεφαλίδας, προσανατολισμός A4.
// fit: όλο το φύλλο σε μία σελίδα κατά την εκτύπωση.
function sheetXml(rowsXml, colsXml, paneAttrs, orientation, fit) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
<sheetViews><sheetView workbookViewId="0">${paneAttrs ? `<pane ${paneAttrs} state="frozen"/>` : ''}</sheetView></sheetViews>
<cols>${colsXml}</cols>
<sheetData>${rowsXml.join('')}</sheetData>
<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>
<pageSetup paperSize="9" orientation="${orientation}" fitToWidth="1" fitToHeight="${fit ? 1 : 0}"/>
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

// «Αποθήκευση σε Excel / PDF» του checklist: διαλέγεις μορφή αρχείου.
function exportChecklist() {
  if (!SECTIONS[state.section]) { toast('Επίλεξε πρώτα «ΑΝΟΙΓΜΑ» ή «ΚΛΕΙΣΙΜΟ».'); return; }
  const dlg = $('log-dialog');
  const save = async (kind) => {
    dlg.close();
    const sheet = checklistSheet();
    const sec = state.section === 'opening' ? 'anoigma' : 'kleisimo';
    const store = toLatin(storeLabel() || 'xoris-katastima').replace(/[^A-Za-z0-9-]+/g, '-');
    await deliverFile(kind === 'pdf' ? pdfBlob([sheet]) : xlsxBlob([sheet]), `checklist_${store}_${sec}_${f.date.value}.${kind}`);
  };
  $('log-dialog-body').replaceChildren(
    h('h2', {}, 'Αποθήκευση σε Excel ή PDF'),
    h('p', { class: 'hint' }, `${SECTIONS[state.section]}${storeLabel() ? ' · ' + storeLabel() : ''} · ${fmtDate(f.date.value)}. Με ό,τι έχει συμπληρωθεί.`),
    h('div', { class: 'stack' },
      h('button', { type: 'button', class: 'btn dark', onclick: () => save('xlsx') }, 'Αποθήκευση σε Excel'),
      h('button', { type: 'button', class: 'btn dark', onclick: () => save('pdf') }, 'Αποθήκευση σε PDF'),
      h('button', { type: 'button', class: 'btn ghost', onclick: () => dlg.close() }, 'Άκυρο')));
  dlg.showModal();
}

/* ---------- Αποθήκευση σε PDF (A4) ---------- */

// Τα φύλλα του Excel ζωγραφίζονται σε σελίδες A4 (κάθετες· το μηνιαίο πρόγραμμα οριζόντιο, όπως στο Excel)
// και μπαίνουν ως εικόνες σε αρχείο PDF. Χωρίς εξωτερική βιβλιοθήκη, δουλεύει και χωρίς σύνδεση.
const PDF_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
// Ίδια εμφάνιση με τα στυλ του Excel (XS): b έντονα, c χρώμα, bg φόντο, box περίγραμμα, mid στο κέντρο, wrap αναδίπλωση.
const PDF_ST = {
  0: {}, 1: { b: 1, size: 18.7 }, 2: { b: 1 },
  3: { b: 1, bg: '#E0E0E0', box: 1, mid: 1, wrap: 1 }, 4: { box: 1, wrap: 1 }, 5: { box: 1, mid: 1 },
  6: { bg: '#FFF3C4', box: 1, wrap: 1 }, 7: { bg: '#FFF3C4', box: 1, mid: 1 },
  8: { b: 1, c: '#C62828', box: 1, wrap: 1 }, 9: { b: 1, c: '#C62828', bg: '#FFF3C4', box: 1, wrap: 1 },
  10: { box: 1, mid: 1 }, 11: { bg: '#D6E6FF', box: 1, mid: 1 }, 12: { b: 1, c: '#2E7D32', bg: '#C8E6C9', box: 1, mid: 1 },
  13: { bg: '#F0F0F0', box: 1, mid: 1 }, 14: { b: 1, bg: '#BDBDBD', box: 1, mid: 1 }, 15: { b: 1, c: '#C62828', box: 1, mid: 1 },
  16: { b: 1, c: '#2E7D32', box: 1, mid: 1 }, 17: { b: 1, bg: '#FFE0B2', box: 1, mid: 1 },
  18: { b: 1, c: '#C62828', bg: '#FDEAEA', box: 1, mid: 1 }, 19: { b: 1, bg: '#E0E0E0', box: 1, mid: 1 },
};

// Αναδίπλωση κειμένου στο πλάτος w (σπάει και πολύ μεγάλες λέξεις).
function pdfWrap(ctx, text, w) {
  const out = [];
  String(text).split('\n').forEach((para) => {
    let line = '';
    para.split(' ').forEach((word) => {
      const next = line ? line + ' ' + word : word;
      if (ctx.measureText(next).width <= w || !line) line = next;
      else { out.push(line); line = word; }
      while (ctx.measureText(line).width > w && line.length > 1) {
        let i = line.length - 1;
        while (i > 1 && ctx.measureText(line.slice(0, i)).width > w) i--;
        out.push(line.slice(0, i));
        line = line.slice(i);
      }
    });
    out.push(line);
  });
  return out;
}

// Ένα φύλλο → σελίδες (canvas). Μονάδες σχεδίασης: pixel του Excel (πλάτος στήλης w ≈ 7w + 5).
function sheetPages(sheet) {
  const R = 2.5; // pixel του canvas ανά point
  const land = sheet.orientation === 'landscape';
  const PW = land ? 841.89 : 595.28;
  const PH = land ? 595.28 : 841.89;
  const M = 28; // περιθώριο ~1 εκ.
  const base = [];
  sheet.cols.forEach(([a, b, w]) => { for (let c = a; c <= b; c++) base[c - 1] = Math.round(w * 7 + 5); });
  for (let c = 0; c < base.length; c++) if (!base[c]) base[c] = 69;
  let widths;
  let xs;
  let total;
  const FS = 14.7; // 11 pt
  const PAD = 4;
  const measure = document.createElement('canvas').getContext('2d');
  const fontOf = (st, size) => `${st.b ? 'bold ' : ''}${size || st.size || FS}px ${PDF_FONT}`;

  // Διάταξη κάθε γραμμής: κελιά με γραμμές κειμένου και ύψος.
  const layout = (cells) => {
    if (!cells) return { h: 12, cells: [] };
    let hgt = cells.ht ? cells.ht / 0.75 : 0; // ύψος γραμμής του Excel (point) → pixel
    const out = cells.map(([col, v, s]) => {
      const st = PDF_ST[s] || {};
      const x = xs[col] || 0;
      const w = st.box ? widths[col] : total - x; // χωρίς περίγραμμα το κείμενο απλώνεται δεξιά
      const text = v == null ? '' : String(v);
      // Σε στενή στήλη, λέξη που δεν χωράει μικραίνει (έως 70%) αντί να κοπεί.
      let size = st.size || FS;
      measure.font = fontOf(st, size);
      if (st.box) {
        const widest = Math.max(0, ...text.split(/\s+/).map((wd) => measure.measureText(wd).width));
        if (widest > w - 2 * PAD) size = Math.max(size * 0.7, (size * 0.96 * (w - 2 * PAD)) / widest);
        measure.font = fontOf(st, size);
      }
      const lines = text === '' ? [] : (st.wrap || !st.box ? pdfWrap(measure, text, w - 2 * PAD) : [text]);
      const lh = size * 1.3;
      hgt = Math.max(hgt, Math.max(1, lines.length) * lh + 2 * PAD);
      return { x, w, st, lines, lh, size };
    });
    return { h: Math.ceil(hgt), cells: out };
  };
  // Διάταξη με extra pixel στη στήλη sheet.grow· k = pixel → point, όσο χωράει στο πλάτος
  // (και στο ύψος, αν όλο το φύλλο πρέπει να μπει σε μία σελίδα).
  const build = (extra) => {
    widths = base.map((w, i) => (i === sheet.grow ? w + extra : w));
    xs = [0];
    widths.forEach((w, i) => { xs[i + 1] = xs[i] + w; });
    total = xs[widths.length];
    const list = sheet.rows.map(layout);
    let kk = Math.min(1, (PW - 2 * M) / (total * 0.75)) * 0.75;
    if (sheet.fit) kk = Math.min(kk, (PH - 2 * M - 14) / list.reduce((n, r) => n + r.h, 0));
    return { list, kk, extra };
  };
  let best = build(0);
  // Σε μία σελίδα: φαρδύτερη στήλη = λιγότερες γραμμές κειμένου = μεγαλύτερα γράμματα. Κρατάμε το καλύτερο.
  if (sheet.fit && sheet.grow != null) {
    for (let extra = 40; extra <= 2400; extra += 40) {
      const t = build(extra);
      if (t.kk > best.kk) best = t;
    }
    best = build(best.extra);
  }
  const rows = best.list;
  const k = best.kk;
  const head = sheet.head ? [sheet.head[0] - 1, sheet.head[1] - 1] : null;
  const areaH = sheet.fit ? Infinity : (PH - 2 * M - 14) / k;

  // Μοίρασμα σε σελίδες· η κεφαλίδα του πίνακα επαναλαμβάνεται σε κάθε σελίδα.
  const pages = [[]];
  let y = 0;
  rows.forEach((r, i) => {
    if (y + r.h > areaH && pages[pages.length - 1].length) {
      pages.push([]);
      y = 0;
      if (head && i > head[1]) for (let j = head[0]; j <= head[1]; j++) { pages[pages.length - 1].push(j); y += rows[j].h; }
    }
    pages[pages.length - 1].push(i);
    y += r.h;
  });

  return pages.map((list) => {
    const cv = document.createElement('canvas');
    cv.width = Math.round(PW * R);
    cv.height = Math.round(PH * R);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.setTransform(R * k, 0, 0, R * k, M * R, M * R);
    ctx.textBaseline = 'top';
    let yy = 0;
    list.forEach((i) => {
      const r = rows[i];
      r.cells.forEach((c) => {
        if (c.st.bg) { ctx.fillStyle = c.st.bg; ctx.fillRect(c.x, yy, c.w, r.h); }
        if (c.st.box) { ctx.strokeStyle = '#666'; ctx.lineWidth = 1; ctx.strokeRect(c.x, yy, c.w, r.h); }
        ctx.font = fontOf(c.st, c.size);
        ctx.fillStyle = c.st.c || '#111';
        ctx.textAlign = c.st.mid ? 'center' : 'left';
        const top = c.st.mid ? yy + (r.h - c.lines.length * c.lh) / 2 : yy + PAD;
        c.lines.forEach((line, j) => {
          ctx.fillText(line, c.st.mid ? c.x + c.w / 2 : c.x + PAD, top + j * c.lh + (c.lh - c.size) / 2);
        });
      });
      yy += r.h;
    });
    return { cv, w: PW, h: PH };
  });
}

// Φύλλα → αρχείο PDF (μία εικόνα JPEG ανά σελίδα). Σύγχρονο, ώστε η κοινοποίηση στο κινητό να ανοίγει κανονικά.
function pdfBlob(sheets) {
  const pages = sheets.flatMap((s) => sheetPages(s));
  const enc = new TextEncoder();
  const chunks = [];
  const offs = [];
  let len = 0;
  const push = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; chunks.push(b); len += b.length; };
  const obj = (n, head, stream) => {
    offs[n] = len;
    push(`${n} 0 obj\n${head}\n`);
    if (stream) { push('stream\n'); push(stream); push('\nendstream\n'); }
    push('endobj\n');
  };
  push(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // %PDF-1.4
  const n = pages.length;
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Count ${n} /Kids [${pages.map((p, i) => `${3 + i * 3} 0 R`).join(' ')}] >>`);
  pages.forEach((p, i) => {
    const ctx = p.cv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = `${8 * 2.5}px ${PDF_FONT}`;
    ctx.fillStyle = '#777';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`Σελίδα ${i + 1} από ${n}`, p.cv.width - 28 * 2.5, p.cv.height - 16 * 2.5);
    const b64 = p.cv.toDataURL('image/jpeg', 0.85).split(',')[1];
    const bin = atob(b64);
    const jpg = new Uint8Array(bin.length);
    for (let j = 0; j < bin.length; j++) jpg[j] = bin.charCodeAt(j);
    const draw = enc.encode(`q ${p.w.toFixed(2)} 0 0 ${p.h.toFixed(2)} 0 0 cm /Im0 Do Q`);
    const base = 3 + i * 3;
    obj(base, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${p.w.toFixed(2)} ${p.h.toFixed(2)}] /Resources << /XObject << /Im0 ${base + 2} 0 R >> >> /Contents ${base + 1} 0 R >>`);
    obj(base + 1, `<< /Length ${draw.length} >>`, draw);
    obj(base + 2, `<< /Type /XObject /Subtype /Image /Width ${p.cv.width} /Height ${p.cv.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>`, jpg);
  });
  const xref = len;
  const size = 3 + n * 3;
  let x = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let i = 1; i < size; i++) x += `${String(offs[i]).padStart(10, '0')} 00000 n \n`;
  push(x + `trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks, { type: 'application/pdf' });
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
    syncOn() ? allStorePwBox() : null,
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
    syncOn() ? storePwBox(store) : null,
    h('h2', {}, 'Ιδιαιτερότητες καταστήματος'),
    h('p', { class: 'hint' }, 'Έξτρα γραμμές μόνο για αυτό το κατάστημα. Εμφανίζονται χρωματισμένες, στη θέση που θα διαλέξεις.'),
    h('div', { class: 'ed-list' }, store.extras.map((x) => extraEditor(store, x))),
    h('div', { class: 'stack' },
      h('button', { type: 'button', class: 'btn', onclick: addExtra }, '+ Προσθήκη ιδιαιτερότητας'),
      h('button', { type: 'button', class: 'btn danger', onclick: delStore }, 'Διαγραφή καταστήματος')),
    saveReminder());
}

// Κωδικός υπευθύνου για το «Πρόγραμμα μήνα» καθαριοτήτων (φυλάσσεται στο Google Script).
// Ορισμός κωδικού υπευθύνου και έλεγχος ότι το κοινό αρχείο τον δέχεται πλέον.
async function setAndCheckStorePw(admin, store, newPw) {
  await apiCall({ action: 'setStorePw', pw: admin, store, newPw });
  try {
    await apiCall({ action: 'checkPlanPw', store, pw: newPw });
    return true;
  } catch (e) {
    if (String((e && e.message) || e) === 'password') return false;
    throw e;
  }
}

// Ίδιος κωδικός υπευθύνου για όλα τα καταστήματα (Πρόγραμμα μήνα), με τον κωδικό αρχείου.
function allStorePwBox() {
  const admin = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Ο δικός σου κωδικός αρχείου' });
  const pw = h('input', { type: 'text', autocomplete: 'off', placeholder: 'π.χ. 4 ή περισσότερα ψηφία' });
  const out = h('p', { class: 'hint result' });
  const setAll = async (btn) => {
    if (!admin.value) { toast('Γράψε τον κωδικό αρχείου σου.'); admin.focus(); return; }
    if (pw.value.trim().length < 4) { toast('Ο κωδικός υπευθύνου θέλει τουλάχιστον 4 χαρακτήρες.'); pw.focus(); return; }
    const stores = state.data.stores;
    if (!confirm(`Να οριστεί ο ίδιος κωδικός υπευθύνου σε όλα τα καταστήματα (${stores.length});`)) return;
    btn.disabled = true;
    const failed = [];
    for (let i = 0; i < stores.length; i++) {
      out.textContent = `Περίμενε… ${i + 1}/${stores.length} (${stores[i].name})`;
      try {
        if (!(await setAndCheckStorePw(admin.value, stores[i].id, pw.value.trim()))) failed.push(stores[i].name);
      } catch (e) {
        const m = String((e && e.message) || e);
        if (m === 'password' || m === 'locked' || m === 'unknown-action') {
          out.textContent = m === 'password' ? 'Ο κωδικός αρχείου είναι λάθος.' : m === 'locked' ? apiMsg(e) : 'Το Google Script χρειάζεται ενημέρωση (οδηγίες στο README).';
          btn.disabled = false;
          return;
        }
        failed.push(stores[i].name);
      }
    }
    btn.disabled = false;
    out.textContent = failed.length
      ? `Δεν επιβεβαιώθηκε σε: ${failed.join(', ')}. Δοκίμασε ξανά· αν επιμένει, ενημέρωσε το Google Script (νέα έκδοση).`
      : `✓ Ορίστηκε ο ίδιος κωδικός υπευθύνου σε όλα τα καταστήματα (${stores.length}).`;
    if (!failed.length) pw.value = '';
  };
  return h('div', { class: 'box' },
    h('h2', {}, 'Κωδικός υπευθύνου για όλα τα καταστήματα'),
    h('p', { class: 'hint' }, 'Ίδιος κωδικός για το «📅 Πρόγραμμα μήνα» σε όλα τα καταστήματα. Αργότερα μπορείς να αλλάξεις όποιο θέλεις χωριστά, παρακάτω.'),
    h('p', { class: 'warn' }, 'Μη χρησιμοποιείς κωδικό συναγερμού/POS.'),
    h('label', { class: 'field' }, 'Κωδικός αρχείου (δικός σου)', admin),
    h('label', { class: 'field' }, 'Κωδικός υπευθύνου για όλους', pw),
    h('button', { type: 'button', class: 'btn', onclick: (e) => setAll(e.currentTarget) }, 'Ορισμός σε όλα τα καταστήματα'),
    out);
}

function storePwBox(store) {
  const admin = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Ο δικός σου κωδικός αρχείου' });
  const pw = h('input', { type: 'text', autocomplete: 'off', placeholder: 'π.χ. 4 ή περισσότερα ψηφία' });
  const out = h('p', { class: 'hint' });
  const set = async (remove) => {
    if (!admin.value) { toast('Γράψε τον κωδικό αρχείου σου.'); admin.focus(); return; }
    if (!remove && pw.value.trim().length < 4) { toast('Ο κωδικός υπευθύνου θέλει τουλάχιστον 4 χαρακτήρες.'); pw.focus(); return; }
    if (remove && !confirm(`Να αφαιρεθεί ο κωδικός υπευθύνου για «${store.name}»;`)) return;
    out.textContent = 'Περίμενε…';
    try {
      if (remove) {
        await apiCall({ action: 'setStorePw', pw: admin.value, store: store.id, newPw: '' });
        out.textContent = '✓ Ο κωδικός αφαιρέθηκε.';
      } else if (await setAndCheckStorePw(admin.value, store.id, pw.value.trim())) {
        out.textContent = `✓ Ορίστηκε και ελέγχθηκε. Δώσε τον κωδικό στον/στην υπεύθυνο του καταστήματος «${store.name}».`;
        pw.value = '';
      } else {
        out.textContent = 'Ο κωδικός δεν επιβεβαιώθηκε από το Google Script. Ενημέρωσέ το (νέα έκδοση) και δοκίμασε ξανά.';
      }
    } catch (e) {
      const m = String((e && e.message) || e);
      out.textContent = m === 'password' ? 'Ο κωδικός αρχείου είναι λάθος.' : m === 'unknown-action' ? 'Το Google Script χρειάζεται ενημέρωση (οδηγίες στο README).' : apiMsg(e);
    }
  };
  return h('div', { class: 'box' },
    h('h2', {}, 'Κωδικός υπευθύνου (Πρόγραμμα μήνα)'),
    h('p', { class: 'hint' }, 'Με αυτόν τον κωδικό ο/η υπεύθυνος του καταστήματος ορίζει τις ημέρες καθαριοτήτων/αποψύξεων: ΚΑΘΑΡΙΟΤΗΤΕΣ / ΑΠΟΨΥΞΕΙΣ → «📅 Πρόγραμμα μήνα». Ο δικός σου κωδικός αρχείου ανοίγει όλα τα καταστήματα.'),
    h('p', { class: 'warn' }, 'Μη χρησιμοποιείς κωδικό συναγερμού/POS.'),
    h('label', { class: 'field' }, 'Κωδικός αρχείου (δικός σου)', admin),
    h('label', { class: 'field' }, 'Νέος κωδικός υπευθύνου', pw),
    h('button', { type: 'button', class: 'btn', onclick: () => set(false) }, 'Ορισμός κωδικού υπευθύνου'),
    h('button', { type: 'button', class: 'btn danger', onclick: () => set(true) }, 'Αφαίρεση κωδικού'),
    out);
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
  return h('div', { class: 'ed-row' + (o.hidden ? ' off' : o.highlight ? ' extra' : '') },
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
    o.hidden ? h('p', { class: 'hint' }, 'Η γραμμή δεν εμφανίζεται σε αυτό το κατάστημα.')
      : h('label', { class: 'field' }, 'Κείμενο για αυτό το κατάστημα',
        h('textarea', { rows: 3, value: o.text || '', oninput: (e) => { o.text = e.target.value; markDirty(false); } })),
    h('div', { class: 'ed-tools' },
      h('label', { class: 'chk notify-chk' },
        h('input', {
          type: 'checkbox',
          checked: !!o.hidden,
          onchange: (e) => {
            if (e.target.checked) o.hidden = true;
            else { delete o.hidden; if (!o.text && g) o.text = g.text; }
            markDirty(true);
          },
        }),
        'Δεν ισχύει σε αυτό το κατάστημα'),
      o.hidden ? null : h('label', { class: 'chk notify-chk' },
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
      h('label', { class: 'chk' },
        h('input', {
          type: 'checkbox',
          checked: !!x.important,
          onchange: (e) => { if (e.target.checked) x.important = true; else delete x.important; markDirty(true); },
        }),
        'Κόκκινα έντονα'),
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
        .filter(([id, o]) => findGeneralIn(out, id) && o && (o.hidden || (o.text || '').trim()))
        .map(([id, o]) => [id, o.hidden ? { hidden: true } : o.highlight ? { text: o.text.trim(), highlight: true } : { text: o.text.trim() }])),
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
        : 'Το repo βρέθηκε, αλλά το κλειδί δεν έχει δικαίωμα εγγραφής. Στο Contents βάλε «Read and write».');
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
  if (admin) { $('topbar').hidden = false; renderAdmin(); }
  else { fillStoreSelect(); renderChecklist(); }
  window.scrollTo(0, 0);
}

// Νέα αρχή (data.json → cleaning.resetAt): μία φορά σε κάθε συσκευή σβήνονται τα δεδομένα δοκιμών
// (τικ, καταχωρήσεις, εξοπλισμός, προγράμματα, ουρά αποστολής, τελευταία επιλογή). Δεν αγγίζει τις ρυθμίσεις της Διαχείρισης.
function resetDevice() {
  // Από τη δημοσιευμένη έκδοση, ακόμη κι αν υπάρχει πρόχειρο στη Διαχείριση.
  const r = state.resetAt || state.data.cleaning.resetAt || '';
  if (!r || lsGet('cl-reset', '') === r) return;
  const prefixes = [LS.progPrefix, 'cl-equip:', 'cl-log', 'cl-plan:', 'cl-sent:', 'cl-tour-offered', LS.last, 'cl-a2hs-hide'];
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && prefixes.some((p) => k === p || k.startsWith(p))) localStorage.removeItem(k);
    }
  } catch (e) { /* τίποτα */ }
  lsSet('cl-reset', r);
}

function rememberLast() {
  // Το DEMO δεν μένει ως τελευταία επιλογή.
  const store = f.store.value === DEMO_ID ? (lsGet(LS.last, {}).store || '') : f.store.value;
  lsSet(LS.last, { store, name: f.name.value });
}

// Αν το κινητό κράτησε παλιά έκδοση της σελίδας, φορτώνει τη νέα (μία φορά ανά έκδοση).
async function checkVersion() {
  try {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return;
    const v = String((await r.json()).v || '');
    if (!v || v === APP_VERSION) return;
    if (sessionStorage.getItem('cl-reload') === v) return;
    sessionStorage.setItem('cl-reload', v);
    location.replace(location.pathname + '?v=' + encodeURIComponent(v) + location.hash);
  } catch (e) { /* χωρίς σύνδεση: συνεχίζει με ό,τι έχει */ }
}

async function init() {
  // Στο iPhone (Safari) χρειάζεται για να φαίνεται το «πάτημα» στα κουμπιά.
  document.addEventListener('touchstart', () => {}, { passive: true });
  checkVersion();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkVersion(); });
  f.date = $('f-date');
  f.name = $('f-name');
  f.store = $('f-store');

  await load();
  resetDevice();
  cleanupOldProgress();
  cleanupOldLog();

  const last = lsGet(LS.last, {});
  f.date.value = todayISO();
  f.name.value = last.name || '';
  state.section = '';
  $('draft-banner').hidden = !state.hasDraft;

  f.date.addEventListener('change', () => { if (!f.date.value) f.date.value = todayISO(); renderChecklist(); });
  f.store.addEventListener('change', () => {
    // Νέο κατάστημα: πρώτα επιβεβαίωση με το όνομα. Μέχρι τότε μένει το προηγούμενο.
    const want = f.store.value;
    if (!state.storeOk && needsConfirm(want)) {
      f.store.value = state.storeNow;
      confirmStore(want);
      return;
    }
    state.storeOk = false;
    state.storeNow = want;
    rememberLast();
    state.logMode = 'main';
    state.logArchiveMonth = null;
    state.logSkip = null;
    if (f.store.value === DEMO_ID) { resetDemo(); goHome(); }
    else {
      // Το DEMO φεύγει από τη λίστα μόλις διαλεχτεί άλλο κατάστημα.
      const o = [...f.store.options].find((x) => x.value === DEMO_ID);
      if (o) o.remove();
    }
    renderChecklist();
    syncStore(f.store.value);
    if (f.store.value === DEMO_ID) tourMenu();
    else tourStop();
  });
  f.name.addEventListener('input', () => { rememberLast(); updateWho(); updateInfo(); });
  $('who-line').addEventListener('click', () => {
    state.whoEdit = !state.whoEdit;
    renderChecklist();
  });
  $('who-done').addEventListener('click', whoDone);
  document.querySelectorAll('#home [data-section]').forEach((b) => b.addEventListener('click', () => openSection(b.dataset.section)));
  $('go-back').addEventListener('click', uiBack);
  window.addEventListener('popstate', onPopState);
  $('demo-exit').addEventListener('click', leaveDemo);
  $('open-tour').addEventListener('click', () => { if (isDemo()) tourMenu(); else enterDemo(); });
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
    state.adminTab = b.dataset.tab;
    renderAdmin();
  }));

  $('btn-share').addEventListener('click', share);
  $('btn-archive').addEventListener('click', sendToArchive);
  $('btn-excel').addEventListener('click', exportChecklist);
  $('btn-blank').addEventListener('click', openBlankForms);
  $('btn-print').addEventListener('click', () => {
    if (!SECTIONS[state.section]) return;
    renderPrint();
    window.print();
  });
  window.addEventListener('beforeprint', () => {
    if (SECTIONS[state.section]) renderPrint(); else $('print-area').replaceChildren();
  });
  $('btn-reset').addEventListener('click', () => {
    if (!confirm(`Να σβηστούν όλα τα ✓/✗ και οι σημειώσεις για «${SECTIONS[state.section]}» αυτής της ημέρας;`)) return;
    lsDel(progKey());
    $('more').open = false;
    renderChecklist();
  });

  window.addEventListener('hashchange', route);
  route();
  initA2hs();
  initLogSync();
  initTour();
}

init();
