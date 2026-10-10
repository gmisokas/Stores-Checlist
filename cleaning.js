'use strict';

/* ==========================================================
   Αρχείο γενικών καθαριοτήτων / αποψύξεων
   - Εξοπλισμός, συχνότητες και κωδικός αρχείου: data.json
     (Διαχείριση → Καθαριότητες).
   - Εξοπλισμός κάθε καταστήματος και καταχωρήσεις: στη συσκευή και,
     όταν έχει οριστεί «Κοινό αρχείο», σε Google Sheet (google/Code.gs),
     ώστε να τα βλέπουν όλα τα κινητά.
   Φορτώνεται πριν από το app.js και χρησιμοποιεί τα βοηθητικά του.
   ========================================================== */

const LOG_TYPES = { clean: 'Γενική καθαριότητα', defrost: 'Απόψυξη' };
const LOG_TITLES = { clean: 'Αρχείο γενικών καθαριοτήτων', defrost: 'Αρχείο αποψύξεων' };
const LOG_LS = {
  equip: 'cl-equip:', log: 'cl-log:', seen: 'cl-log-seen:', unlocked: 'cl-log-unlocked',
  queue: 'cl-log-queue', synced: 'cl-log-synced:',
  draft: 'cl-log-draft:', saved: 'cl-log-saved:', plan: 'cl-plan:',
};
// Διεύθυνση της εφαρμογής ιστού του Google Apps Script (…/exec). Το localhost μόνο για δοκιμές.
const SYNC_URL_RE = /^(https:\/\/script\.google\.com\/(macros|a\/macros\/[^/]+)\/s\/[\w-]+\/exec|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/[\w/-]*)$/;
const REMIND_FROM_DAY = 25;
const KEEP_MONTHS = 13;

const MONTHS = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος',
  'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'];
// Δείκτης = getDay() (0 = Κυριακή).
const DAYS_SHORT = ['Κυρ', 'Δευ', 'Τρι', 'Τετ', 'Πεμ', 'Παρ', 'Σαβ'];
const DAYS_FULL = ['Κυριακή', 'Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο'];

// Χρησιμοποιείται μόνο αν το data.json δεν έχει ακόμα ενότητα «cleaning».
const DEFAULT_EQUIPMENT = [
  { id: 'katapsyxi', name: 'Κατάψυξη', numbered: true, clean: { min: 1, per: 'week' }, defrost: { min: 1, max: 2, per: 'week' } },
  { id: 'semifreddo', name: 'Κατάψυξη semifreddo', numbered: true, clean: { min: 2, per: 'month' }, defrost: { min: 1, per: 'month' } },
  { id: 'katapsyxi-pagkos', name: 'Κατάψυξη πάγκος', numbered: true, clean: { min: 2, per: 'month' }, defrost: { min: 1, per: 'month' } },
  { id: 'vouta', name: 'Κατάψυξη βούτα', numbered: true, clean: { min: 2, per: 'month' }, defrost: { min: 1, per: 'month' } },
  { id: 'vitrina', name: 'Βιτρίνα παγωτού', numbered: true, clean: { min: 1, per: 'week' }, defrost: { min: 2, max: 3, per: 'week' } },
  { id: 'psygeio-stili', name: 'Ψυγείο στήλη', numbered: true, clean: { min: 2, per: 'month' }, defrost: { min: 1, per: 'month' } },
  { id: 'psygeio-pagkos', name: 'Ψυγείο πάγκος', numbered: true, clean: { min: 1, per: 'week' }, defrost: { min: 1, per: 'month' } },
  { id: 'psygeio-anapsyktikon', name: 'Ψυγείο αναψυκτικών', numbered: true, clean: { min: 1, per: 'month' }, defrost: { min: 1, per: 'month' } },
  { id: 'santigiera', name: 'Σαντιγιέρα', clean: { min: 2, per: 'week' } },
  { id: 'ben-mari', name: 'Μπεν μαρί', clean: { min: 1, per: 'week' } },
  { id: 'sokolatovrysi', name: 'Σοκολατοβρύση', clean: { min: 2, per: 'month' } },
  { id: 'fournos', name: 'Φούρνος μικροκυμάτων', clean: { min: 1, per: 'month' } },
  { id: 'ntoulapia', name: 'Αποθηκευτικοί χώροι/ντουλάπια/ράφια', clean: { min: 1, per: 'week' } },
  { id: 'apothiki', name: 'Αποθήκη', clean: { min: 1, per: 'week' } },
  { id: 'toixoi', name: 'Τοίχοι', clean: { min: 1, per: 'month' } },
  { id: 'pezodromio', name: 'Πεζοδρόμιο', clean: { min: 1, per: 'week' } },
  { id: 'kadoi', name: 'Κάδοι', clean: { min: 1, per: 'month' } },
];

/* ---------- Ρυθμίσεις (data.json) ---------- */

function normalizeCleaning(c) {
  c = c && typeof c === 'object' && !Array.isArray(c) ? c : {};
  if (typeof c.passwordHash !== 'string') c.passwordHash = '';
  if (typeof c.syncUrl !== 'string') c.syncUrl = '';
  if (!Array.isArray(c.equipment)) c.equipment = JSON.parse(JSON.stringify(DEFAULT_EQUIPMENT));
  c.equipment.forEach((eq) => {
    if (!eq.id) eq.id = newId('eq');
    eq.name = eq.name || '';
    for (const t of Object.keys(LOG_TYPES)) {
      const r = eq[t];
      if (!r || !(r.min > 0)) { delete eq[t]; continue; }
      if (r.per !== 'month') r.per = 'week';
      if (!(r.max > r.min)) delete r.max;
    }
  });
  return c;
}

function cleanCleaning(c) {
  return {
    passwordHash: c.passwordHash || '',
    syncUrl: SYNC_URL_RE.test((c.syncUrl || '').trim()) ? c.syncUrl.trim() : '',
    equipment: c.equipment
      .map((eq) => {
        const o = { id: eq.id, name: (eq.name || '').trim() };
        if (eq.numbered) o.numbered = true;
        for (const t of Object.keys(LOG_TYPES)) {
          const r = eq[t];
          if (r && r.min > 0) o[t] = r.max > r.min ? { min: r.min, max: r.max, per: r.per } : { min: r.min, per: r.per };
        }
        return o;
      })
      .filter((eq) => eq.name),
  };
}

function freqText(rule) {
  if (!rule) return '';
  const n = rule.max > rule.min ? `${rule.min}–${rule.max}` : String(rule.min);
  return `${n} ${n === '1' ? 'φορά' : 'φορές'}/${rule.per === 'month' ? 'μήνα' : 'εβδομάδα'}`;
}

async function pwHash(pw) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('lartecono-log:' + pw));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ---------- Αποθήκευση στη συσκευή ---------- */

function getEquip(sk) { return lsGet(LOG_LS.equip + sk, null); }
function setEquip(sk, v) { if (v) lsSet(LOG_LS.equip + sk, v); else lsDel(LOG_LS.equip + sk); }
function getLog(sk) { return lsGet(LOG_LS.log + sk, []); }
function setLog(sk, list) { lsSet(LOG_LS.log + sk, list); }

function sessGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
function sessSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* τίποτα */ } }

// Κρατάμε καταχωρήσεις 13 μηνών.
function cleanupOldLog() {
  const limit = addMonths(ymOf(todayISO()), -KEEP_MONTHS) + '-01';
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(LOG_LS.log)) continue;
      const sk = k.slice(LOG_LS.log.length);
      const list = getLog(sk);
      const keep = list.filter((e) => e.d >= limit);
      if (keep.length !== list.length) setLog(sk, keep);
    }
  } catch (e) { /* τίποτα */ }
}

/* ---------- Κοινό αρχείο (Google Sheet) ---------- */

const sync = { busy: {}, again: {}, error: {}, at: {}, tried: {}, oldScript: false };

function shared() { return SYNC_URL_RE.test(state.data.cleaning.syncUrl || ''); }

function storeNameOf(sk) {
  if (sk === GENERAL_ID) return 'ΓΕΝΙΚΟ';
  const st = state.data.stores.find((s) => s.id === sk);
  if (st) return st.name;
  const a = state.archive && state.archive.stores[sk];
  return (a && a.name) || sk;
}

// Δεδομένα ενός καταστήματος: από τη συσκευή ή, μέσα στο Αρχείο, από το κοινό αρχείο.
function deviceSrc(sk) { return { equip: getEquip(sk), entries: getLog(sk), plans: getPlans(sk) }; }
function archiveSrc(sk) {
  if (!state.archive) return deviceSrc(sk);
  const a = state.archive.stores[sk] || {};
  return { equip: a.equip || null, entries: a.entries || [], checklists: a.checklists || [], plans: a.plans || {} };
}

// Πρόγραμμα μήνα του καταστήματος (από τον/την υπεύθυνο): { 'YYYY-MM': { clean: {key: [ημέρες]}, defrost: {…} } }.
function getPlans(sk) { return lsGet(LOG_LS.plan + sk, {}); }
function setPlans(sk, map) { if (Object.keys(map).length) lsSet(LOG_LS.plan + sk, map); else lsDel(LOG_LS.plan + sk); }

// Checklists ανοίγματος/κλεισίματος που στάλθηκαν στο αρχείο: σε πόσες ημέρες του μήνα.
function checklistDays(src, ym) {
  const today = todayISO();
  const days = ym === ymOf(today) ? Number(today.slice(8)) : monthInfo(ym).dim;
  const count = (sec) => new Set((src.checklists || []).filter((c) => c.section === sec).map((c) => c.d)).size;
  return { days, opening: count('opening'), closing: count('closing') };
}

function checklistTable(src, ym) {
  const mi = monthInfo(ym);
  const { days } = checklistDays(src, ym);
  const by = {};
  (src.checklists || []).forEach((c) => { by[c.d + c.section] = c; });
  const cell = (d, sec) => {
    const c = by[mi.iso(d) + sec];
    if (!c) return h('td', { class: 'c miss' }, '—');
    const label = `✓${c.ok}${c.no ? ' ✗' + c.no : ''}${c.left ? ' ⏳' + c.left : ''}`;
    const info = [`${SECTIONS[sec]} – ${fmtDate(c.d)}`, `Υπεύθυνος: ${c.by || '-'}`, `✓ ${c.ok} · ✗ ${c.no} · χωρίς συμπλήρωση ${c.left}`,
      c.notDone ? '\nΔεν έγιναν:\n' + c.notDone : '', c.notes ? '\nΣημειώσεις:\n' + c.notes : ''].filter(Boolean).join('\n');
    return h('td', { class: 'c' + (c.no || c.left ? ' warn-c' : '') },
      h('button', { type: 'button', class: 'linkbtn', onclick: () => showTextDialog('Checklist στο αρχείο:', info) }, label));
  };
  const rows = [];
  for (let d = days; d >= 1; d--) {
    rows.push(h('tr', {}, h('td', {}, `${DAYS_SHORT[mi.dow(d)]} ${fmtDate(mi.iso(d)).slice(0, 5)}`), cell(d, 'opening'), cell(d, 'closing')));
  }
  return h('table', { class: 'sum-table' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Ημέρα'), h('th', {}, SECTIONS.opening), h('th', {}, SECTIONS.closing))),
    h('tbody', {}, rows));
}

async function apiCall(payload, url) {
  url = url || state.data.cleaning.syncUrl;
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 30000) : null;
  let r;
  try {
    // Χωρίς δικές μας κεφαλίδες, ώστε το Google να απαντά απευθείας στον browser.
    r = await fetch(url, { method: 'POST', body: JSON.stringify(payload), cache: 'no-store', signal: ctrl ? ctrl.signal : undefined });
  } catch (e) {
    throw new Error('offline');
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (!r.ok) throw new Error('http-' + r.status);
  let j;
  try { j = await r.json(); } catch (e) { throw new Error('bad-response'); }
  if (!j || j.ok !== true) throw new Error((j && j.error) || 'error');
  return j;
}

function apiMsg(e) {
  const m = String((e && e.message) || e);
  return {
    offline: 'Δεν υπάρχει σύνδεση με το κοινό αρχείο. Δοκίμασε ξανά.',
    password: 'Λάθος κωδικός.',
    locked: 'Πολλές λάθος προσπάθειες. Δοκίμασε ξανά σε 10 λεπτά.',
    'no-password': 'Δεν έχει οριστεί κωδικός αρχείου. Ορίζεται στη Διαχείριση → Καθαριότητες.',
    short: 'Ο κωδικός θέλει τουλάχιστον 4 χαρακτήρες.',
  }[m] || 'Σφάλμα κοινού αρχείου (' + m + ').';
}

// Αλλαγές που περιμένουν να σταλούν (π.χ. όταν δεν υπάρχει ίντερνετ).
function queueGet() { return lsGet(LOG_LS.queue, []); }
function queueAdd(op) {
  const q = queueGet();
  q.push(Object.assign({ qid: newId('q') }, op));
  lsSet(LOG_LS.queue, q);
}
function pendingOf(sk) { return queueGet().filter((o) => o.store === sk); }

// Πόσα από ένα είδος έχει το κατάστημα. Χώρος/εξοπλισμός χωρίς Νο που προστέθηκε αργότερα
// στη λίστα (δεν υπάρχει στη δήλωση) θεωρείται ότι υπάρχει, όπως και στη φόρμα δήλωσης.
function countOf(counts, eq) {
  const raw = (counts || {})[eq.id];
  if (raw === undefined) return eq.numbered ? 0 : 1;
  return Math.min(10, Math.max(0, parseInt(raw, 10) || 0));
}

function equipSummary(setup) {
  return state.data.cleaning.equipment
    .filter((eq) => countOf(setup.counts, eq) > 0)
    .map((eq) => (eq.numbered ? `${eq.name} ×${countOf(setup.counts, eq)}` : eq.name))
    .join(', ');
}
function addOp(sk, e) {
  const eq = eqById(e.eq);
  return { op: 'add', store: sk, storeName: storeNameOf(sk), eqName: eq ? eq.name : e.eq, e };
}
function equipOp(sk, setup, ifMissing) {
  return { op: 'equip', store: sk, storeName: storeNameOf(sk), setup, summary: equipSummary(setup), ifMissing: !!ifMissing };
}

// Από ποια ημερομηνία κρατάμε αντίγραφο στη συσκευή: προηγούμενος μήνας (για την ειδοποίηση) ή ο μήνας της ημερομηνίας.
function syncFrom() {
  const prev = addMonths(ymOf(todayISO()), -1);
  const sel = ymOf(f.date.value || todayISO());
  return (sel < prev ? sel : prev) + '-01';
}

function isSynced(sk) { return lsGet(LOG_LS.synced + sk, '') === state.data.cleaning.syncUrl; }

function syncStore(sk) {
  if (!shared() || !sk) return Promise.resolve();
  if (sync.busy[sk]) { sync.again[sk] = true; return sync.busy[sk]; }
  sync.tried[sk] = Date.now();
  const before = JSON.stringify(deviceSrc(sk));
  const p = runSync(sk)
    .then(() => { sync.error[sk] = ''; sync.at[sk] = Date.now(); })
    .catch((e) => { sync.error[sk] = String((e && e.message) || e); })
    .then(() => {
      delete sync.busy[sk];
      afterSync(sk, JSON.stringify(deviceSrc(sk)) !== before);
      const again = sync.again[sk] && !sync.error[sk];
      sync.again[sk] = false;
      if (again) return syncStore(sk);
      return undefined;
    });
  sync.busy[sk] = p;
  updateSyncStatus();
  updateSaveStatus();
  if (typeof updateArchiveBtn === 'function') updateArchiveBtn();
  return p;
}

async function runSync(sk) {
  const mine = pendingOf(sk);
  const ops = [];
  if (!isSynced(sk)) {
    // Πρώτη σύνδεση της συσκευής: ό,τι είχε γραφτεί μόνο εδώ ανεβαίνει στο κοινό αρχείο.
    const local = getEquip(sk);
    if (local) ops.push(Object.assign({ qid: 'm-equip' }, equipOp(sk, local, true)));
    getLog(sk).forEach((e) => ops.push(Object.assign({ qid: 'm-' + e.id }, addOp(sk, e))));
  }
  ops.push(...mine);
  const from = syncFrom();
  const res = await apiCall({ action: 'sync', store: sk, from, ops });
  // Παλιά έκδοση του Google Script που δεν ξέρει τα checklists: τα κρατάμε για αργότερα.
  const kept = new Set((res.results || []).filter((x) => x.reason === 'bad').map((x) => x.qid)
    .filter((q) => mine.some((o) => o.qid === q && o.op === 'checklist')));
  sync.oldScript = kept.size > 0;
  const sent = new Set(mine.filter((o) => !kept.has(o.qid)).map((o) => o.qid));
  const rest = queueGet().filter((o) => !sent.has(o.qid));
  lsSet(LOG_LS.queue, rest);
  mergeStore(sk, res, from, rest.filter((o) => o.store === sk));
  lsSet(LOG_LS.synced + sk, state.data.cleaning.syncUrl);
  const results = res.results || [];
  const mineIds = new Set(mine.map((o) => o.qid));
  if (results.some((x) => mineIds.has(x.qid) && x.reason === 'dup')) toast('Κάποια καταχώρηση είχε ήδη γίνει από άλλη συσκευή.', 5000);
  if (results.some((x) => mineIds.has(x.qid) && x.reason === 'old')) toast('Χωρίς κωδικό διαγράφονται μόνο καταχωρήσεις της ίδιας ημέρας.', 5000);
}

// Το κοινό αρχείο είναι το σωστό· κρατάμε από πάνω μόνο ό,τι δεν έχει σταλεί ακόμα.
function mergeStore(sk, res, from, pending) {
  const pe = pending.filter((o) => o.op === 'equip').pop();
  setEquip(sk, pe ? pe.setup : (res.equip || null));
  const dels = new Set(pending.filter((o) => o.op === 'del').map((o) => o.id));
  const server = (res.entries || []).filter((e) => !dels.has(e.id));
  const ids = new Set(server.map((e) => e.id));
  const adds = pending.filter((o) => o.op === 'add' && !ids.has(o.e.id) && !dels.has(o.e.id)).map((o) => o.e);
  setLog(sk, [...getLog(sk).filter((e) => e.d < from), ...server, ...adds]);
  if (res.plans) {
    const keep = Object.fromEntries(Object.entries(getPlans(sk)).filter(([ym]) => ym < from.slice(0, 7)));
    setPlans(sk, Object.assign(keep, res.plans));
  }
}

function afterSync(sk, changed) {
  updateSyncStatus();
  updateSaveStatus();
  if (typeof updateArchiveBtn === 'function') updateArchiveBtn();
  if (f.store.value !== sk) return;
  const view = $('log-view');
  const waiting = !!view.querySelector('.log-wait');
  if (changed) renderLogNotice();
  if (state.section !== 'log' || state.logMode !== 'main') return;
  // Δεν χαλάμε τη φόρμα πρώτης δήλωσης εξοπλισμού όσο συμπληρώνεται.
  if (!waiting && view.querySelector('.log-setup') && !getEquip(sk)) return;
  if (waiting || changed) renderLog();
}

function syncStatusContent(sk) {
  const n = pendingOf(sk).length;
  const wait = n === 1 ? '1 αλλαγή περιμένει να σταλεί' : `${n} αλλαγές περιμένουν να σταλούν`;
  if (sync.busy[sk]) return ['⏳ Συγχρονισμός με το κοινό αρχείο…'];
  if (sync.error[sk]) {
    return [`⚠️ Χωρίς σύνδεση με το κοινό αρχείο${n ? ' · ' + wait : ''}. `,
      h('button', { type: 'button', class: 'linkbtn', onclick: () => syncStore(sk) }, 'Δοκίμασε ξανά')];
  }
  if (n) return [`⏳ ${wait}.`];
  const t = sync.at[sk] ? new Date(sync.at[sk]).toTimeString().slice(0, 5) : '';
  return [`☁️ Κοινό αρχείο${t ? ' · ενημερώθηκε ' + t : ''}`];
}

function updateSyncStatus() {
  document.querySelectorAll('.log-sync').forEach((el) => el.replaceChildren(...syncStatusContent(f.store.value)));
}

function initLogSync() {
  const flush = (force) => {
    if (!shared()) return;
    const stores = new Set(queueGet().map((o) => o.store));
    const sk = f.store.value;
    if (sk && (force || Date.now() - (sync.tried[sk] || 0) > 30000)) stores.add(sk);
    stores.forEach((s) => syncStore(s));
  };
  window.addEventListener('online', () => flush(true));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') flush(false); });
  flush(true);
}

/* ---------- Ημερομηνίες ---------- */

function ymOf(iso) { return String(iso).slice(0, 7); }
function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
function monthInfo(ym) {
  const [y, m] = ym.split('-').map(Number);
  return {
    dim: new Date(y, m, 0).getDate(),
    iso: (d) => `${ym}-${String(d).padStart(2, '0')}`,
    dow: (d) => new Date(y, m - 1, d).getDay(),
  };
}
function localISO(dt) {
  const p = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}
function monthOptions(selected, count = 13) {
  const now = ymOf(todayISO());
  const list = Array.from({ length: count }, (_, i) => addMonths(now, -i));
  if (selected && !list.includes(selected)) list.push(selected);
  return list.sort().reverse().map((ym) => h('option', { value: ym }, monthLabel(ym)));
}

/* ---------- Πρόγραμμα και έλεγχος ---------- */

function unitLabel(eq, no) { return no ? `${eq.name} Νο ${no}` : eq.name; }

// Μονάδες ενός είδους (π.χ. Κατάψυξη Νο 1, Νο 2, Αποθήκη) με βάση τον εξοπλισμό.
function logUnits(counts, type) {
  const out = [];
  state.data.cleaning.equipment.forEach((eq) => {
    const rule = eq[type];
    if (!rule || !(rule.min > 0)) return;
    const n = countOf(counts, eq);
    if (!n) return;
    const nos = eq.numbered ? Array.from({ length: n }, (_, i) => i + 1) : [0];
    nos.forEach((no) => out.push({ eq, no, rule, key: eq.id + '#' + no, label: unitLabel(eq, no) }));
  });
  return out;
}

// Εβδομάδες του μήνα για τον έλεγχο: 1–7, 8–14, 15–21, 22–τέλος. Για τις μηνιαίες, όλος ο μήνας.
function logWindows(rule, dim) {
  return rule.per === 'month' ? [[1, dim]] : [[1, 7], [8, 14], [15, 21], [22, dim]];
}

// Σταθερές ημέρες εβδομάδας για τις εβδομαδιαίες εργασίες, μοιρασμένες ώστε να μη
// συγκεντρώνονται όλες την ίδια ημέρα. Όλες οι ημέρες, και το Σαββατοκύριακο.
function weeklyDays(units) {
  const days = [1, 2, 3, 4, 5, 6, 0];
  const load = Object.fromEntries(days.map((d) => [d, 0]));
  const map = {};
  units.filter((u) => u.rule.per !== 'month').forEach((u) => {
    const k = Math.min(u.rule.min, days.length);
    let best = null;
    let bestScore = Infinity;
    for (let s = 0; s < days.length; s++) {
      const picks = [];
      for (let i = 0; i < k; i++) picks.push(days[(s + Math.floor((i * days.length) / k)) % days.length]);
      const score = Math.max(...picks.map((d) => load[d])) * 1000 + picks.reduce((a, d) => a + load[d], 0);
      if (score < bestScore) { bestScore = score; best = picks; }
    }
    best.forEach((d) => { load[d]++; });
    map[u.key] = best.slice().sort((a, b) => days.indexOf(a) - days.indexOf(b));
  });
  return map;
}

// Προτεινόμενες ημερομηνίες του μήνα: [{u, day, w, k}]. w = εβδομάδα ελέγχου, k = σειρά μέσα σε αυτή.
// plans: πρόγραμμα του υπευθύνου ({ym: {clean, defrost}}). Ό,τι έχει ορίσει αντικαθιστά την αυτόματη πρόταση.
function planMonth(ym, type, counts, plans) {
  const auto = autoPlan(ym, type, counts);
  const custom = plans && plans[ym] && plans[ym][type];
  if (!custom) return auto;
  const mi = monthInfo(ym);
  const tasks = auto.filter((t) => !custom[t.u.key]);
  logUnits(counts, type).forEach((u) => {
    const days = custom[u.key];
    if (!days) return;
    const wins = logWindows(u.rule, mi.dim);
    const rank = wins.map(() => 0);
    days.filter((d) => d >= 1 && d <= mi.dim).sort((a, b) => a - b).forEach((day) => {
      const w = wins.findIndex(([a, b]) => day >= a && day <= b);
      rank[w]++;
      tasks.push({ u, day, w, k: rank[w] });
    });
  });
  return tasks;
}

function autoPlan(ym, type, counts) {
  const mi = monthInfo(ym);
  const units = logUnits(counts, type);
  const wk = weeklyDays(units);
  const load = new Array(mi.dim + 2).fill(0);
  const tasks = [];

  units.filter((u) => u.rule.per !== 'month').forEach((u) => {
    logWindows(u.rule, mi.dim).forEach(([a, b], w) => {
      const picked = [];
      wk[u.key].forEach((wd) => {
        for (let d = a; d <= b; d++) if (mi.dow(d) === wd) { picked.push(d); break; }
      });
      picked.sort((x, y) => x - y).forEach((day, i) => { load[day]++; tasks.push({ u, day, w, k: i + 1 }); });
    });
  });

  // Οι μηνιαίες προτείνονται έως 3 ημέρες πριν από το τέλος του μήνα, ώστε να υπάρχει περιθώριο.
  const monthly = units.filter((u) => u.rule.per === 'month');
  const days = [];
  for (let d = 1; d <= mi.dim - 3; d++) days.push(d);
  monthly.forEach((u, j) => {
    const k = Math.min(u.rule.min, days.length);
    const picked = [];
    for (let i = 0; i < k; i++) {
      const seg = days.slice(Math.floor((i * days.length) / k), Math.floor(((i + 1) * days.length) / k));
      // Ξεκινάμε από διαφορετικό σημείο για κάθε εργασία, ώστε να απλώνονται μέσα στον μήνα.
      const start = Math.floor((j / monthly.length) * seg.length);
      let best = seg[start];
      for (let x = 0; x < seg.length; x++) {
        const d = seg[(start + x) % seg.length];
        if (load[d] < load[best]) best = d;
      }
      load[best]++;
      picked.push(best);
    }
    picked.sort((x, y) => x - y).forEach((day, i) => tasks.push({ u, day, w: 0, k: i + 1 }));
  });
  return tasks;
}

function entriesOf(entries, type, u) {
  return entries.filter((e) => e.t === type && e.eq === u.eq.id && (e.no || 0) === u.no);
}

// Σημειώνει ποιες προτεινόμενες εργασίες έχουν καλυφθεί (αρκετές καταχωρήσεις μέσα στην ίδια εβδομάδα/μήνα).
function markDone(tasks, entries, type, ym) {
  const mi = monthInfo(ym);
  tasks.forEach((t) => {
    const [a, b] = logWindows(t.u.rule, mi.dim)[t.w];
    const n = entriesOf(entries, type, t.u).filter((e) => e.d >= mi.iso(a) && e.d <= mi.iso(b)).length;
    t.done = n >= t.k;
  });
  return tasks;
}

// Έλεγχος ανά εβδομάδα/μήνα. asOf = σήμερα για τον τρέχοντα μήνα, null για μήνα που έκλεισε.
function checkUnits(units, type, entries, ym, since, asOf) {
  const mi = monthInfo(ym);
  const out = [];
  units.forEach((u) => {
    const mine = entriesOf(entries, type, u);
    logWindows(u.rule, mi.dim).forEach(([a, b]) => {
      const start = mi.iso(a);
      const end = mi.iso(b);
      if (asOf && start > asOf) return;
      if (since > end) return;
      let req = u.rule.min;
      if (since > start) {
        // Πρώτος μήνας χρήσης: οι εβδομάδες πριν από τη δήλωση εξοπλισμού δεν μετράνε,
        // και οι μηνιαίες ζητούνται αναλογικά με τις ημέρες που απέμειναν.
        if (u.rule.per !== 'month') return;
        req = Math.round((u.rule.min * (b - Number(since.slice(8)) + 1)) / (b - a + 1));
      }
      if (req <= 0) return;
      const done = mine.filter((e) => e.d >= start && e.d <= end).length;
      out.push({ type, u, a, b, done, req, ok: done >= req, ended: !asOf || end < asOf });
    });
  });
  return out;
}

// src = { equip, entries } (deviceSrc ή archiveSrc).
function checkMonth(src, ym, asOf) {
  const setup = src.equip;
  if (!setup) return [];
  const entries = src.entries.filter((e) => ymOf(e.d) === ym);
  return Object.keys(LOG_TYPES).flatMap((type) =>
    checkUnits(logUnits(setup.counts, type), type, entries, ym, setup.since || '', asOf));
}

function failText(x, ym) {
  const when = x.u.rule.per === 'month' ? 'μήνας' : `εβδομάδα ${x.a}–${x.b}/${ym.slice(5)}`;
  return `${x.u.label} – ${when}: ${x.done} από ${x.req}`;
}

function noticeText(storeName, ym, fails) {
  const lines = [`🔔 ΚΑΘΑΡΙΟΤΗΤΕΣ / ΑΠΟΨΥΞΕΙΣ – ${storeName}`, `📅 ${monthLabel(ym)}: δεν έγιναν όπως ορίζεται`];
  for (const [type, label] of Object.entries(LOG_TYPES)) {
    const list = fails.filter((x) => x.type === type);
    if (list.length) lines.push('', `${label}:`, ...list.map((x) => '• ' + failText(x, ym)));
  }
  return lines.join('\n');
}

function failList(fails, ym) {
  return h('div', { class: 'fail-list' }, Object.entries(LOG_TYPES).map(([type, label]) => {
    const list = fails.filter((x) => x.type === type);
    if (!list.length) return null;
    return [h('div', { class: 'fail-type' }, label), h('ul', {}, list.map((x) => h('li', {}, failText(x, ym))))];
  }));
}

/* ---------- Ειδοποιήσεις (οθόνη checklist) ---------- */

function renderLogNotice() {
  const box = $('log-notice');
  box.replaceChildren();
  const sk = f.store.value;
  const nd = sk ? getDraft(sk).length : 0;
  if (nd && state.section !== 'log') {
    box.append(h('div', { class: 'log-remind' },
      `⚠️ Έχεις ${nd} τικ καθαριοτήτων/αποψύξεων που δεν αποθηκεύτηκαν στο αρχείο. `,
      h('button', { type: 'button', class: 'linkbtn', onclick: () => { state.section = 'log'; renderChecklist(); } }, 'Προβολή')));
  }
  if (!sk || !getEquip(sk)) return;
  const today = todayISO();

  // Από την 1η του μήνα: τι δεν έγινε τον προηγούμενο μήνα, μέχρι να πατηθεί «Το είδα».
  const prev = addMonths(ymOf(today), -1);
  const seenKey = LOG_LS.seen + sk + ':' + prev;
  if (!lsGet(seenKey, false)) {
    const fails = checkMonth(deviceSrc(sk), prev, null).filter((x) => !x.ok);
    if (fails.length) {
      box.append(h('div', { class: 'log-alert' },
        h('div', { class: 'log-alert-title' }, `🔔 Ειδοποίηση – ${monthLabel(prev)}`),
        h('p', {}, 'Οι παρακάτω καθαριότητες/αποψύξεις δεν έγιναν όπως ορίζεται:'),
        failList(fails, prev),
        h('div', { class: 'stack' },
          h('button', { type: 'button', class: 'btn viber', onclick: () => shareText(noticeText(storeLabel(), prev, fails)) }, 'Αποστολή στο Viber'),
          h('button', { type: 'button', class: 'btn ghost', onclick: () => { lsSet(seenKey, true); renderChecklist(); } }, 'Το είδα'))));
    }
  }

  // Από τις 25 του μήνα: υπενθύμιση για ό,τι εκκρεμεί μέχρι το τέλος του μήνα.
  if (state.section !== 'log' && Number(today.slice(8)) >= REMIND_FROM_DAY) {
    const pend = checkMonth(deviceSrc(sk), ymOf(today), today).filter((x) => !x.ok && !x.ended);
    const n = pend.reduce((s, x) => s + x.req - x.done, 0);
    if (n) {
      box.append(h('div', { class: 'log-remind' },
        `⏰ Υπενθύμιση: εκκρεμούν ${n} καθαριότητες/αποψύξεις μέχρι το τέλος του μήνα. `,
        h('button', { type: 'button', class: 'linkbtn', onclick: () => { state.section = 'log'; renderChecklist(); } }, 'Προβολή')));
    }
  }
}

/* ---------- Οθόνη αρχείου ---------- */

function renderLog() {
  const view = $('log-view');
  const sk = f.store.value;
  if (!sk) {
    view.replaceChildren(h('p', { class: 'pick-hint' }, 'Επίλεξε πρώτα κατάστημα.'));
    return;
  }
  const date = f.date.value || todayISO();
  if (state.logDateSeen !== date) {
    state.logDateSeen = date;
    state.logCalMonth = null;
    state.logCalDay = null;
  }
  if (state.logMode === 'unlock') { view.replaceChildren(unlockForm()); return; }
  if (state.logMode === 'archive') {
    view.replaceChildren(shared() && state.archive ? archiveShared() : archiveView(sk, deviceSrc(sk)));
    return;
  }
  if (shared()) {
    // Ενημέρωση από το κοινό αρχείο (το πολύ κάθε λεπτό όσο είναι ανοιχτή η οθόνη).
    if (!sync.busy[sk] && Date.now() - (sync.tried[sk] || 0) > 60000) syncStore(sk);
    if (!isSynced(sk)) { view.replaceChildren(waitBox(sk)); return; }
  }
  const setup = getEquip(sk);
  if (setup && state.logMode === 'planUnlock') { view.replaceChildren(planUnlockForm(sk)); return; }
  if (setup && state.logMode === 'plan' && state.planEdit && state.planEdit.sk === sk) { view.replaceChildren(planEditor(sk, setup)); return; }
  view.replaceChildren(!setup || state.logMode === 'setup' ? setupForm(sk, setup) : logMain(sk, setup));
  updateSaveStatus();
}

// Πρώτη φορά σε αυτή τη συσκευή: περιμένουμε το κοινό αρχείο πριν δείξουμε οτιδήποτε.
function waitBox(sk) {
  const failed = !sync.busy[sk] && sync.error[sk];
  return h('div', { class: 'log log-wait' }, h('div', { class: 'box' },
    failed
      ? [h('p', {}, '⚠️ ' + apiMsg(sync.error[sk])),
        h('button', { type: 'button', class: 'btn', onclick: () => { syncStore(sk); renderLog(); } }, 'Δοκίμασε ξανά')]
      : h('p', {}, '⏳ Φόρτωση κοινού αρχείου…')));
}

function logMain(sk, setup) {
  const type = state.logType;
  const date = f.date.value || todayISO();
  const ym = ymOf(date);
  const mi = monthInfo(ym);
  const day = Number(date.slice(8));
  const all = getLog(sk);
  const monthEntries = all.filter((e) => ymOf(e.d) === ym);
  const tasks = markDone(planMonth(ym, type, setup.counts, getPlans(sk)), monthEntries, type, ym);
  const since = setup.since || '';

  // Υπενθύμιση στο τέλος του μήνα.
  const today = todayISO();
  let remind = null;
  if (ym === ymOf(today) && Number(today.slice(8)) >= REMIND_FROM_DAY) {
    const pend = checkMonth(deviceSrc(sk), ym, today).filter((x) => !x.ok && !x.ended);
    if (pend.length) {
      remind = h('div', { class: 'log-remind' },
        h('b', {}, '⏰ Υπενθύμιση: μέχρι το τέλος του μήνα εκκρεμούν:'),
        failList(pend, ym));
    }
  }

  const typeSeg = h('div', { class: 'seg log-type' }, Object.entries(LOG_TYPES).map(([k, label]) =>
    h('button', { type: 'button', 'aria-pressed': String(k === type), onclick: () => { state.logType = k; renderLog(); } }, label)));

  // Καταχώρηση: εξοπλισμός/χώρος, Νο, τικ.
  const eqs = state.data.cleaning.equipment.filter((eq) => eq[type] && countOf(setup.counts, eq) > 0);
  // Η επιλογή κρατιέται αν η οθόνη ξαναχτιστεί (π.χ. μετά από συγχρονισμό).
  const sel = state.logSel && state.logSel.type === type && state.logSel.sk === sk ? state.logSel : { sk, type, eq: '', no: '' };
  state.logSel = sel;
  const selNo = h('select', { 'aria-label': 'Νο', onchange: () => { sel.no = selNo.value; } });
  const selEq = h('select', { 'aria-label': 'Εξοπλισμός / χώρος', onchange: () => { sel.eq = selEq.value; sel.no = ''; fillNo(); } },
    h('option', { value: '' }, '— Επίλεξε —'),
    eqs.map((eq) => h('option', { value: eq.id }, eq.name)));
  selEq.value = eqs.some((eq) => eq.id === sel.eq) ? sel.eq : '';
  const fillNo = () => {
    const eq = eqs.find((x) => x.id === selEq.value);
    if (eq && eq.numbered) {
      const n = countOf(setup.counts, eq);
      selNo.replaceChildren(h('option', { value: '' }, '–'),
        ...Array.from({ length: n }, (_, i) => h('option', { value: String(i + 1) }, String(i + 1))));
      selNo.disabled = false;
      selNo.value = sel.no && Number(sel.no) <= n ? sel.no : n === 1 ? '1' : '';
      sel.no = selNo.value;
    } else {
      selNo.replaceChildren(h('option', { value: '0' }, '—'));
      selNo.disabled = true;
    }
  };
  fillNo();
  const tick = () => {
    const eq = eqs.find((x) => x.id === selEq.value);
    if (!eq) { toast('Επίλεξε εξοπλισμό ή χώρο.'); selEq.focus(); return; }
    const no = eq.numbered ? parseInt(selNo.value, 10) || 0 : 0;
    if (eq.numbered && !no) { toast('Επίλεξε Νο.'); selNo.focus(); return; }
    addDraft(sk, type, eq, no);
  };
  const draft = getDraft(sk);
  const entryCard = h('div', { class: 'box log-entry' },
    h('h2', {}, 'Καταχώρηση – ' + LOG_TYPES[type]),
    h('div', { class: 'log-grid' },
      h('span', { class: 'log-col' }, 'Εξοπλισμός / χώρος'),
      h('span', { class: 'log-col' }, 'Νο'),
      h('span', { class: 'log-col log-col-tick' }, 'Αν έγινε, πατήστε'),
      selEq, selNo,
      h('button', { type: 'button', class: 'mark ok log-tick', 'aria-label': 'Έγινε', onclick: tick }, '✓')),
    h('p', { class: 'hint' }, `Ημερομηνία: ${fmtDate(date)} · Υπεύθυνος: `, whoEl()));

  // Στο τέλος της σελίδας: τα τικ που περιμένουν και η αποθήκευση στο αρχείο.
  const saveCard = h('div', { class: 'box log-save' },
    h('h2', {}, `Προς αποθήκευση (${draft.length})`),
    draft.length
      ? h('ul', { class: 'entries draft' }, draft.map((x, i) => h('li', {},
        h('span', {}, entryLabel(x), h('small', {}, ` · ${LOG_TYPES[x.t]}${x.d !== date ? ' · ' + fmtDate(x.d) : ''}`)),
        h('button', { type: 'button', class: 'del', 'aria-label': 'Αφαίρεση', onclick: () => removeDraft(sk, i) }, '✕'))))
      : h('p', { class: 'hint' }, 'Πάτα ✓ σε ό,τι έγινε. Στο τέλος πάτα «Αποθήκευση στο αρχείο».'),
    h('button', { type: 'button', class: 'btn dark save-log', disabled: !!state.logSaving, onclick: () => saveDraft(sk) }, 'Αποθήκευση στο αρχείο'),
    h('p', { class: 'save-status log-save-status', hidden: true }));

  // Προτεινόμενα για την ημέρα + εκκρεμότητες της ίδιας εβδομάδας/μήνα.
  const todayTasks = tasks.filter((t) => t.day === day);
  const overdue = tasks.filter((t) => {
    if (t.done || t.day >= day || mi.iso(t.day) < since) return false;
    const [a, b] = logWindows(t.u.rule, mi.dim)[t.w];
    return day >= a && day <= b;
  });
  // Μόνο ενημέρωση: η καταχώρηση γίνεται από τα πεδία Εξοπλισμός / Νο / ✓.
  const taskRow = (t) => h('li', { class: 'task' + (t.done ? ' done' : '') },
    h('span', { class: 'task-text' }, t.u.label, h('small', {}, ' · ' + freqText(t.u.rule))),
    t.done
      ? h('span', { class: 'done-tag' }, 'Έγινε')
      : inDraft(sk, type, t.u.eq.id, t.u.no, date)
        ? h('span', { class: 'todo-tag' }, 'Προς αποθήκευση')
        : null);
  const isToday = date === today;
  const planCard = h('div', { class: 'box' },
    h('h2', {}, `Προτεινόμενα για ${isToday ? 'σήμερα' : fmtDate(date)}`),
    todayTasks.length
      ? h('ul', { class: 'tasks' }, todayTasks.map(taskRow))
      : h('p', { class: 'hint' }, 'Δεν υπάρχει προτεινόμενη εργασία για αυτή την ημέρα.'),
    overdue.length ? [
      h('h3', {}, 'Εκκρεμούν από προηγούμενες ημέρες'),
      h('ul', { class: 'tasks' }, overdue.map(taskRow))] : null);

  // Καταχωρήσεις της ημέρας. Διαγραφή μόνο αυθημερόν (για λάθη).
  const dayEntries = all.filter((e) => e.d === date && e.t === type).sort((x, y) => String(x.at).localeCompare(String(y.at)));
  const entriesCard = h('div', { class: 'box' },
    h('h2', {}, `Καταχωρήσεις ${isToday ? 'σήμερα' : fmtDate(date)}`),
    dayEntries.length
      ? h('ul', { class: 'entries' }, dayEntries.map((e) => entryRow(sk, e, e.at && localISO(new Date(e.at)) === today)))
      : h('p', { class: 'hint' }, 'Καμία καταχώρηση ακόμα.'));

  return h('div', { class: 'log' },
    shared() ? h('p', { class: 'log-sync' }, syncStatusContent(sk)) : null,
    remind,
    typeSeg,
    entryCard,
    planCard,
    entriesCard,
    calendarEl(sk, setup, type),
    saveCard,
    h('section', { class: 'actions' },
      h('button', { type: 'button', class: 'btn primary', onclick: () => logViber(sk) }, 'Αποστολή στο Viber'),
      h('button', { type: 'button', class: 'btn', onclick: () => openLogExport(sk, ym, deviceSrc(sk), shared() ? 2 : 13) }, 'Αποθήκευση σε Excel'),
      h('button', { type: 'button', class: 'btn', onclick: () => { state.logMode = 'setup'; renderLog(); scrollToLog(); } }, 'Εξοπλισμός καταστήματος'),
      shared() ? h('button', { type: 'button', class: 'btn', onclick: () => openPlanner(sk) }, '📅 Πρόγραμμα μήνα (υπεύθυνος)') : null,
      h('button', { type: 'button', class: 'btn ghost', onclick: () => openArchive() }, '🔒 Αρχείο (με κωδικό)')));
}

// Όνομα υπευθύνου που ενημερώνεται καθώς γράφεται (χωρίς να ξαναχτίζεται η οθόνη).
function whoEl() { return h('span', { class: 'log-who' }, whoText()); }
function whoText() { return f.name.value.trim() || '— (συμπλήρωσε το όνομα πάνω)'; }
function updateWho() { document.querySelectorAll('.log-who').forEach((el) => { el.textContent = whoText(); }); }

function scrollToLog() {
  const el = $('log-view');
  if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start' });
}

function eqById(id) { return state.data.cleaning.equipment.find((x) => x.id === id) || null; }

function entryLabel(e) {
  const eq = eqById(e.eq);
  return eq ? unitLabel(eq, e.no || 0) : '(διαγραμμένος εξοπλισμός)';
}

function entryRow(sk, e, canDelete, showDate) {
  const time = e.at ? new Date(e.at).toTimeString().slice(0, 5) : '';
  return h('li', {},
    h('span', {},
      showDate ? h('b', {}, fmtDate(e.d) + ' ') : null,
      showDate ? h('small', {}, LOG_TYPES[e.t] + ' · ') : null,
      entryLabel(e),
      h('small', {}, ` · ${e.by || '—'}${time ? ' · ' + time : ''}`)),
    canDelete ? h('button', {
      type: 'button',
      class: 'del',
      'aria-label': 'Διαγραφή',
      onclick: () => deleteEntry(sk, e),
    }, '✕') : null);
}

async function deleteEntry(sk, e) {
  if (!confirm(`Διαγραφή της καταχώρησης;\n\n${fmtDate(e.d)} · ${LOG_TYPES[e.t]} · ${entryLabel(e)}`)) return;
  if (state.logMode === 'archive' && shared() && state.archive) {
    // Από το Αρχείο: διαγραφή στο κοινό αρχείο με τον κωδικό.
    try {
      await apiCall({ action: 'remove', pw: state.archivePw, id: e.id });
      setLog(sk, getLog(sk).filter((x) => x.id !== e.id));
      await loadArchive(state.archive.month);
    } catch (x) {
      toast(apiMsg(x));
      return;
    }
    toast('Η καταχώρηση διαγράφηκε.');
    renderLog();
    renderLogNotice();
    return;
  }
  setLog(sk, getLog(sk).filter((x) => x.id !== e.id));
  if (shared()) {
    // Αν δεν είχε σταλεί ακόμα, απλώς δεν στέλνεται.
    const q = queueGet();
    const i = q.findIndex((o) => o.op === 'add' && o.e.id === e.id);
    if (i >= 0) { q.splice(i, 1); lsSet(LOG_LS.queue, q); } else queueAdd({ op: 'del', store: sk, id: e.id });
    syncStore(sk);
  }
  renderLog();
  renderLogNotice();
}

/* ---- Τικ «Προς αποθήκευση» και «Αποθήκευση στο αρχείο» ---- */

// Τα τικ μένουν στη συσκευή μέχρι να πατηθεί «Αποθήκευση στο αρχείο» (δεν χάνονται αν κλείσει η σελίδα).
function getDraft(sk) { return lsGet(LOG_LS.draft + sk, []); }
function setDraft(sk, list) { if (list.length) lsSet(LOG_LS.draft + sk, list); else lsDel(LOG_LS.draft + sk); }
function sameUnit(a, t, eq, no, d) { return a.t === t && a.eq === eq && (a.no || 0) === no && a.d === d; }
function inDraft(sk, t, eq, no, d) { return getDraft(sk).some((x) => sameUnit(x, t, eq, no, d)); }

function addDraft(sk, type, eq, no) {
  const date = f.date.value;
  if (!date) { toast('Συμπλήρωσε την ημερομηνία.'); f.date.focus(); return; }
  if (date > todayISO()) { toast('Δεν γίνεται καταχώρηση για μελλοντική ημερομηνία.'); return; }
  if (getLog(sk).some((e) => sameUnit(e, type, eq.id, no, date))) { toast('Έχει ήδη αποθηκευτεί για αυτή την ημέρα.'); return; }
  if (inDraft(sk, type, eq.id, no, date)) { toast('Είναι ήδη στη λίστα «Προς αποθήκευση».'); return; }
  setDraft(sk, [...getDraft(sk), { t: type, eq: eq.id, no, d: date }]);
  state.logSel = null;
  renderLog();
  renderLogNotice();
}

function removeDraft(sk, i) {
  const list = getDraft(sk);
  list.splice(i, 1);
  setDraft(sk, list);
  renderLog();
  renderLogNotice();
}

async function saveDraft(sk) {
  if (!getDraft(sk).length) { toast('Πάτα πρώτα ✓ σε ό,τι έγινε.'); return; }
  if (!f.name.value.trim()) { toast('Συμπλήρωσε πρώτα το όνομα του υπευθύνου (πάνω).'); f.name.focus(); return; }
  commitDraft(sk);
  if (shared()) {
    state.logSaving = true;
    renderLog();
    await syncStore(sk);
    state.logSaving = false;
  }
  renderLog();
  renderLogNotice();
}

// Τα τικ γίνονται καταχωρήσεις (και μπαίνουν στην ουρά για το κοινό αρχείο). Χωρίς αναμονή δικτύου.
function commitDraft(sk) {
  const draft = getDraft(sk);
  const name = f.name.value.trim();
  const list = getLog(sk);
  const at = new Date().toISOString();
  draft.forEach((x) => {
    if (list.some((e) => sameUnit(e, x.t, x.eq, x.no || 0, x.d))) return;
    const entry = { id: newId('e'), t: x.t, eq: x.eq, no: x.no || 0, d: x.d, by: name, at };
    list.push(entry);
    if (shared()) queueAdd(addOp(sk, entry));
  });
  setLog(sk, list);
  setDraft(sk, []);
  lsSet(LOG_LS.saved + sk, at);
}

// Viber: πρώτα αποθηκεύονται τα τικ που περιμένουν, μετά ανοίγει η κοινοποίηση με ό,τι έγινε και ό,τι εκκρεμεί σήμερα.
async function logViber(sk) {
  if (!f.name.value.trim()) { toast('Συμπλήρωσε πρώτα το όνομα του υπευθύνου (πάνω).'); f.name.focus(); return; }
  if (getDraft(sk).length) {
    commitDraft(sk);
    if (shared()) syncStore(sk);
    renderLog();
    renderLogNotice();
  }
  // Χωρίς αναμονή: το κινητό ανοίγει την κοινοποίηση μόνο αμέσως μετά το πάτημα.
  await shareText(logSummaryText(sk));
}

function logSummaryText(sk) {
  const date = f.date.value || todayISO();
  const ym = ymOf(date);
  const day = Number(date.slice(8));
  const me = f.name.value.trim();
  const setup = getEquip(sk);
  const all = getLog(sk);
  const lines = [`🧽 ΚΑΘΑΡΙΟΤΗΤΕΣ / ΑΠΟΨΥΞΕΙΣ – ${storeLabel()}`, `📅 ${fmtDate(date)} · 👤 ${me || '-'}`];
  const done = all.filter((e) => e.d === date).sort((a, b) => String(a.at).localeCompare(String(b.at)));
  lines.push('', '✓ Έγιναν:');
  if (done.length) done.forEach((e) => lines.push(`• ${entryLabel(e)} – ${LOG_TYPES[e.t]}${e.by && e.by !== me ? ` (${e.by})` : ''}`));
  else lines.push('• Καμία καταχώρηση');
  const left = [];
  if (setup) {
    const monthEntries = all.filter((e) => ymOf(e.d) === ym);
    Object.keys(LOG_TYPES).forEach((type) => {
      markDone(planMonth(ym, type, setup.counts, getPlans(sk)), monthEntries, type, ym)
        .filter((t) => t.day === day && !t.done)
        .forEach((t) => left.push(`• ${t.u.label} – ${LOG_TYPES[type]}`));
    });
  }
  if (left.length) lines.push('', '⏳ Προτεινόμενα που δεν έγιναν:', ...left);
  else if (setup) lines.push('', 'Όλα τα προτεινόμενα της ημέρας έγιναν ✅');
  return lines.join('\n');
}

// Ένδειξη κάτω από το «Αποθήκευση στο αρχείο».
function saveStatus(sk) {
  const pendAdd = shared() && pendingOf(sk).some((o) => o.op === 'add');
  if (state.logSaving || (pendAdd && sync.busy[sk])) return ['wait', '⏳ Αποστολή…'];
  if (pendAdd) return ['wait', '⏳ Δεν έγινε ακόμα αποστολή – θα σταλεί μόλις υπάρξει σύνδεση.'];
  const n = getDraft(sk).length;
  if (n) return ['warn', `⚠️ ${n === 1 ? '1 τικ δεν έχει' : n + ' τικ δεν έχουν'} αποθηκευτεί ακόμα.`];
  const at = lsGet(LOG_LS.saved + sk, '');
  if (at && localISO(new Date(at)) === todayISO()) {
    return ['ok', `✓ ${shared() ? 'Έγινε αποστολή' : 'Αποθηκεύτηκε'} – ${new Date(at).toTimeString().slice(0, 5)}`];
  }
  return null;
}

function updateSaveStatus() {
  const st = f.store.value ? saveStatus(f.store.value) : null;
  document.querySelectorAll('.log-save-status').forEach((el) => {
    el.hidden = !st;
    if (st) { el.className = 'save-status log-save-status ' + st[0]; el.textContent = st[1]; }
  });
}

// Προειδοποίηση πριν φύγει κάποιος από την οθόνη με τικ που δεν αποθηκεύτηκαν.
function draftLeaveOk(sk) {
  const n = sk ? getDraft(sk).length : 0;
  if (!n) return true;
  return confirm(`Έχεις ${n} τικ καθαριοτήτων/αποψύξεων που δεν αποθηκεύτηκαν στο αρχείο.\n\nΠάτα «Άκυρο» για να γυρίσεις και να πατήσεις «Αποθήκευση στο αρχείο».\nΑν συνεχίσεις, τα τικ μένουν στη λίστα για αργότερα.`);
}

/* ---- Πρόγραμμα μήνα: ο/η υπεύθυνος ορίζει ημέρες ανά εξοπλισμό ---- */

function openPlanner(sk) {
  if (!shared()) { toast('Το πρόγραμμα μήνα χρειάζεται σύνδεση με το κοινό αρχείο (Διαχείριση → Καθαριότητες).', 6000); return; }
  state.logMode = state.planPw && state.planPwStore === sk ? 'plan' : 'planUnlock';
  if (state.logMode === 'plan') state.planEdit = initPlanEdit(sk, ymOf(f.date.value || todayISO()));
  renderLog();
  scrollToLog();
}

function planUnlockForm(sk) {
  const pw = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Κωδικός υπευθύνου' });
  const btn = h('button', { type: 'submit', class: 'btn dark' }, 'Είσοδος');
  const go = async (e) => {
    e.preventDefault();
    btn.disabled = true;
    try {
      await apiCall({ action: 'checkPlanPw', store: sk, pw: pw.value });
    } catch (x) {
      const m = String((x && x.message) || x);
      toast(m === 'unknown-action' ? 'Το Google Script χρειάζεται ενημέρωση (οδηγίες στο README).' : m === 'no-password' ? 'Δεν έχει οριστεί κωδικός υπευθύνου. Ορίζεται στη Διαχείριση → Καταστήματα.' : apiMsg(x), 6000);
      btn.disabled = false;
      pw.value = '';
      pw.focus();
      return;
    }
    state.planPw = pw.value;
    state.planPwStore = sk;
    state.planEdit = initPlanEdit(sk, ymOf(f.date.value || todayISO()));
    state.logMode = 'plan';
    renderLog();
  };
  setTimeout(() => pw.focus(), 0);
  return h('div', { class: 'log' }, h('form', { class: 'box', onsubmit: go },
    h('h2', {}, `📅 Πρόγραμμα μήνα – ${storeLabel()}`),
    h('p', { class: 'hint' }, 'Μόνο για τον/την υπεύθυνο καταστήματος.'),
    h('label', { class: 'field' }, 'Κωδικός υπευθύνου', pw),
    h('div', { class: 'stack' },
      btn,
      h('button', { type: 'button', class: 'btn ghost', onclick: () => { state.logMode = 'main'; renderLog(); } }, 'Πίσω'))));
}

// Αρχικό πρόγραμμα: ό,τι έχει αποθηκευτεί, αλλιώς η αυτόματη πρόταση της εφαρμογής.
function initPlanEdit(sk, ym) {
  const setup = getEquip(sk);
  const saved = getPlans(sk)[ym] || {};
  const plan = {};
  Object.keys(LOG_TYPES).forEach((type) => {
    plan[type] = {};
    const auto = autoPlan(ym, type, setup.counts);
    logUnits(setup.counts, type).forEach((u) => {
      const own = saved[type] && saved[type][u.key];
      plan[type][u.key] = own ? own.slice() : auto.filter((t) => t.u.key === u.key).map((t) => t.day).sort((a, b) => a - b);
    });
  });
  const first = logUnits(setup.counts, 'clean')[0];
  return { sk, ym, plan, type: 'clean', key: first ? first.key : '', dirty: false, saved: !!getPlans(sk)[ym], problems: [] };
}

// Πόσες φορές μπήκαν σε κάθε εβδομάδα/μήνα σε σχέση με όσες ορίζονται.
function planWindows(u, days, ym) {
  const mi = monthInfo(ym);
  return logWindows(u.rule, mi.dim).map(([a, b]) => {
    const n = days.filter((d) => d >= a && d <= b).length;
    return { a, b, n, req: u.rule.min, ok: n >= u.rule.min };
  });
}

function planProblems(ed, counts) {
  const out = [];
  Object.keys(LOG_TYPES).forEach((type) => {
    logUnits(counts, type).forEach((u) => {
      planWindows(u, ed.plan[type][u.key] || [], ed.ym).filter((w) => !w.ok).forEach((w) => {
        out.push(`${LOG_TYPES[type]} · ${u.label} – ${u.rule.per === 'month' ? 'μήνας' : `εβδομάδα ${w.a}–${w.b}`}: ${w.n} από ${w.req}`);
      });
    });
  });
  return out;
}

function planEditor(sk, setup) {
  const ed = state.planEdit;
  const mi = monthInfo(ed.ym);
  const units = logUnits(setup.counts, ed.type);
  if (!units.some((u) => u.key === ed.key)) ed.key = units[0] ? units[0].key : '';
  const u = units.find((x) => x.key === ed.key);
  const days = u ? ed.plan[ed.type][u.key] || [] : [];
  const unitOk = (x) => planWindows(x, ed.plan[ed.type][x.key] || [], ed.ym).every((w) => w.ok);
  const rerender = () => renderLog();

  const now = ymOf(todayISO());
  const months = [now, addMonths(now, 1), addMonths(now, 2)];
  if (!months.includes(ed.ym)) months.unshift(ed.ym);
  const selMonth = h('select', {
    value: ed.ym,
    onchange: (e) => {
      if (ed.dirty && !confirm('Υπάρχουν αλλαγές που δεν αποθηκεύτηκαν. Να χαθούν;')) { e.target.value = ed.ym; return; }
      state.planEdit = Object.assign(initPlanEdit(sk, e.target.value), { type: ed.type });
      rerender();
    },
  }, months.map((ym) => h('option', { value: ym }, monthLabel(ym))));

  const typeSeg = h('div', { class: 'seg log-type' }, Object.entries(LOG_TYPES).map(([k, label]) =>
    h('button', { type: 'button', 'aria-pressed': String(k === ed.type), onclick: () => { ed.type = k; ed.key = ''; rerender(); } }, label)));

  const selUnit = h('select', { value: ed.key, onchange: (e) => { ed.key = e.target.value; rerender(); } },
    units.map((x) => h('option', { value: x.key }, `${unitOk(x) ? '✓' : '⚠️'} ${x.label}`)));

  const toggle = (d) => {
    const list = ed.plan[ed.type][u.key] || [];
    const i = list.indexOf(d);
    if (i >= 0) list.splice(i, 1); else list.push(d);
    list.sort((a, b) => a - b);
    ed.plan[ed.type][u.key] = list;
    ed.dirty = true;
    ed.problems = [];
    rerender();
  };

  // Πόσες εργασίες έχει κάθε ημέρα (όλος ο εξοπλισμός του είδους), για να μοιράζονται σωστά.
  const load = {};
  units.forEach((x) => (ed.plan[ed.type][x.key] || []).forEach((d) => { load[d] = (load[d] || 0) + 1; }));
  const cells = ['Δευ', 'Τρι', 'Τετ', 'Πεμ', 'Παρ', 'Σαβ', 'Κυρ'].map((d) => h('div', { class: 'cal-h' }, d));
  for (let i = 0; i < (mi.dow(1) + 6) % 7; i++) cells.push(h('div', {}));
  for (let d = 1; d <= mi.dim; d++) {
    const on = days.includes(d);
    cells.push(h('button', {
      type: 'button',
      class: 'cal-day plan-day' + (on ? ' on' : '') + (mi.dow(d) === 0 || mi.dow(d) === 6 ? ' we' : ''),
      'aria-pressed': String(on),
      onclick: () => toggle(d),
    }, h('span', { class: 'cal-n' }, d), load[d] ? h('span', { class: 'cal-c' }, h('b', {}, load[d]), ' ', h('span', { class: 'w' }, load[d] === 1 ? 'εργασία' : 'εργασίες')) : null));
  }

  const wins = u ? planWindows(u, days, ed.ym) : [];
  const status = u ? h('div', { class: 'plan-status' }, wins.map((w) => h('span', { class: w.ok ? 'ok' : 'bad' },
    `${u.rule.per === 'month' ? 'Μήνας' : `${w.a}–${w.b}`}: ${w.n}/${w.req} ${w.ok ? '✓' : '✗'}`))) : null;

  const autoUnit = () => {
    ed.plan[ed.type][u.key] = autoPlan(ed.ym, ed.type, setup.counts).filter((t) => t.u.key === u.key).map((t) => t.day).sort((a, b) => a - b);
    ed.dirty = true;
    rerender();
  };

  // Ίδιες ημέρες της εβδομάδας (εβδομαδιαίες) ή ίδιες ημερομηνίες (μηνιαίες) με τον προηγούμενο μήνα.
  const copyPrev = () => {
    const prevYm = addMonths(ed.ym, -1);
    const pmi = monthInfo(prevYm);
    const prev = getPlans(sk)[prevYm];
    if (!confirm(`Να αντιγραφεί το πρόγραμμα του ${monthLabel(prevYm)}${prev ? '' : ' (αυτόματη πρόταση, δεν είχε αποθηκευτεί πρόγραμμα)'}; Θα αντικαταστήσει όλο το τρέχον.`)) return;
    Object.keys(LOG_TYPES).forEach((type) => {
      const autoPrev = autoPlan(prevYm, type, setup.counts);
      logUnits(setup.counts, type).forEach((x) => {
        const pd = (prev && prev[type] && prev[type][x.key]) || autoPrev.filter((t) => t.u.key === x.key).map((t) => t.day);
        let nd;
        if (x.rule.per === 'month') nd = pd.map((d) => Math.min(d, mi.dim));
        else {
          const wds = new Set(pd.map((d) => pmi.dow(d)));
          nd = [];
          for (let d = 1; d <= mi.dim; d++) if (wds.has(mi.dow(d))) nd.push(d);
        }
        ed.plan[type][x.key] = [...new Set(nd)].sort((a, b) => a - b);
      });
    });
    ed.dirty = true;
    ed.problems = [];
    rerender();
  };

  const save = async (btn) => {
    const problems = planProblems(ed, setup.counts);
    if (problems.length) {
      ed.problems = problems;
      rerender();
      toast('Το πρόγραμμα δεν καλύπτει τις οδηγίες. Δες τι λείπει.', 5000);
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Αποθήκευση…';
    try {
      await apiCall({ action: 'savePlan', store: sk, storeName: storeLabel(), month: ed.ym, plan: ed.plan, by: f.name.value.trim(), pw: state.planPw });
    } catch (x) {
      const m = String((x && x.message) || x);
      toast(m === 'unknown-action' ? 'Το Google Script χρειάζεται ενημέρωση (οδηγίες στο README).' : apiMsg(x), 6000);
      btn.disabled = false;
      btn.textContent = 'Αποθήκευση προγράμματος';
      return;
    }
    setPlans(sk, Object.assign(getPlans(sk), { [ed.ym]: JSON.parse(JSON.stringify(ed.plan)) }));
    ed.dirty = false;
    ed.saved = true;
    toast(`✓ Το πρόγραμμα του ${monthLabel(ed.ym)} αποθηκεύτηκε. Το βλέπουν όλα τα κινητά του καταστήματος.`, 6000);
    rerender();
  };

  // Άδειο ημερολόγιο (και τα δύο είδη) για να ξεκινήσει από την αρχή.
  const clearAll = () => {
    if (!confirm(`Να αφαιρεθούν όλες οι εργασίες του ${monthLabel(ed.ym)} (γενική καθαριότητα και αποψύξεις, για όλο τον εξοπλισμό);\n\nΔεν αποθηκεύεται τίποτα μέχρι να πατήσεις «Αποθήκευση προγράμματος».`)) return;
    Object.keys(LOG_TYPES).forEach((type) => {
      Object.keys(ed.plan[type]).forEach((key) => { ed.plan[type][key] = []; });
    });
    ed.dirty = true;
    ed.problems = [];
    rerender();
    toast('Αφαιρέθηκαν όλες οι εργασίες του μήνα. Πάτα τις ημέρες που θέλεις.', 5000);
  };

  const back = () => {
    if (ed.dirty && !confirm('Υπάρχουν αλλαγές που δεν αποθηκεύτηκαν. Να χαθούν;')) return;
    state.planEdit = null;
    state.logMode = 'main';
    renderLog();
  };

  return h('div', { class: 'log planner' },
    h('div', { class: 'box' },
      h('h2', {}, `📅 Πρόγραμμα μήνα – ${storeLabel()}`),
      h('label', { class: 'field' }, 'Μήνας', selMonth),
      h('p', { class: 'hint' }, ed.saved ? 'Υπάρχει αποθηκευμένο πρόγραμμα για αυτόν τον μήνα.' : 'Δεν έχει αποθηκευτεί πρόγραμμα: φαίνεται η αυτόματη πρόταση της εφαρμογής.')),
    typeSeg,
    units.length ? h('div', { class: 'box' },
      h('label', { class: 'field' }, '1. Διάλεξε εξοπλισμό / χώρο', selUnit),
      h('p', { class: 'plan-rule' }, `${LOG_TYPES[ed.type]} · ${freqText(u.rule)}`),
      status,
      h('p', { class: 'hint' }, '2. Πάτα τις ημέρες που θα γίνει. Ξαναπάτα για να τη βγάλεις.'),
      h('div', { class: 'cal-grid' }, cells),
      h('button', { type: 'button', class: 'btn auto', onclick: autoUnit }, '⚡ Αυτόματη κατανομή')) : h('p', { class: 'hint' }, 'Δεν υπάρχει εξοπλισμός για αυτό το είδος.'),
    ed.problems.length ? h('div', { class: 'log-alert' },
      h('div', { class: 'log-alert-title' }, 'Δεν αποθηκεύτηκε: λείπουν ημέρες'),
      h('ul', {}, ed.problems.map((p) => h('li', {}, p)))) : null,
    h('section', { class: 'actions' },
      h('button', { type: 'button', class: 'btn dark', onclick: (e) => save(e.currentTarget) }, 'Αποθήκευση προγράμματος'),
      h('button', { type: 'button', class: 'btn', onclick: copyPrev }, 'Αντιγραφή από τον προηγούμενο μήνα'),
      h('button', { type: 'button', class: 'btn danger', onclick: clearAll }, 'Αφαίρεση όλων των εργασιών'),
      h('button', { type: 'button', class: 'btn ghost', onclick: back }, 'Πίσω')));
}

/* ---- Ημερολόγιο μήνα ---- */

function calendarEl(sk, setup, type) {
  const ym = state.logCalMonth || ymOf(f.date.value || todayISO());
  const mi = monthInfo(ym);
  const entries = getLog(sk).filter((e) => ymOf(e.d) === ym);
  const plans = getPlans(sk);
  const custom = plans[ym] && plans[ym][type];
  const tasks = markDone(planMonth(ym, type, setup.counts, plans), entries, type, ym);
  const today = todayISO();
  const since = setup.since || '';
  const byDay = {};
  tasks.forEach((t) => { (byDay[t.day] = byDay[t.day] || []).push(t); });
  let sel = state.logCalDay;
  if (!sel || sel > mi.dim) sel = ym === ymOf(f.date.value || today) ? Number((f.date.value || today).slice(8)) : 1;

  const cells = ['Δευ', 'Τρι', 'Τετ', 'Πεμ', 'Παρ', 'Σαβ', 'Κυρ'].map((d) => h('div', { class: 'cal-h' }, d));
  for (let i = 0; i < (mi.dow(1) + 6) % 7; i++) cells.push(h('div', {}));
  for (let d = 1; d <= mi.dim; d++) {
    const ts = byDay[d] || [];
    const done = ts.filter((t) => t.done).length;
    const iso = mi.iso(d);
    let cls = 'cal-day';
    if (mi.dow(d) === 0 || mi.dow(d) === 6) cls += ' we';
    if (ts.length && done === ts.length) cls += ' all-done';
    else if (ts.length && iso < today && iso >= since) cls += ' missed';
    if (iso === today) cls += ' today';
    if (d === sel) cls += ' sel';
    cells.push(h('button', {
      type: 'button',
      class: cls,
      onclick: () => { state.logCalMonth = ym; state.logCalDay = d; state.logCalOpen = true; renderLog(); },
    }, h('span', { class: 'cal-n' }, d), ts.length ? h('span', { class: 'cal-c' }, `${done}/${ts.length}`) : null));
  }

  const selTasks = byDay[sel] || [];
  const units = logUnits(setup.counts, type);
  const wk = weeklyDays(units);
  const nav = (n) => { state.logCalMonth = addMonths(ym, n); state.logCalDay = null; state.logCalOpen = true; renderLog(); };

  const det = h('details', { class: 'box cal', open: !!state.logCalOpen },
    h('summary', {}, `Πρόγραμμα μήνα – ${LOG_TYPES[type]}`),
    h('div', { class: 'cal-nav' },
      h('button', { type: 'button', 'aria-label': 'Προηγούμενος μήνας', onclick: () => nav(-1) }, '‹'),
      h('b', {}, monthLabel(ym)),
      h('button', { type: 'button', 'aria-label': 'Επόμενος μήνας', onclick: () => nav(1) }, '›')),
    h('div', { class: 'cal-grid' }, cells),
    h('p', { class: 'hint' }, 'Σε κάθε ημέρα: έγιναν / προτεινόμενα.'),
    h('h3', {}, `${DAYS_FULL[mi.dow(sel)]} ${fmtDate(mi.iso(sel))}`),
    selTasks.length
      ? h('ul', { class: 'tasks' }, selTasks.map((t) => h('li', { class: 'task' + (t.done ? ' done' : '') },
        h('span', { class: 'task-text' }, t.u.label), h('span', { class: t.done ? 'done-tag' : 'todo-tag' }, t.done ? '✓ Έγινε' : '○'))))
      : h('p', { class: 'hint' }, 'Καμία προτεινόμενη εργασία.'),
    h('h3', {}, custom ? 'Πρόγραμμα του υπευθύνου' : 'Σταθερό πρόγραμμα'),
    units.length
      ? h('ul', { class: 'plan-list' }, units.map((u) => {
        const mine = tasks.filter((t) => t.u.key === u.key).map((t) => t.day).sort((a, b) => a - b);
        const when = u.rule.per === 'month' || (custom && custom[u.key])
          ? `${freqText(u.rule)} · προτείνεται: ${mine.map((d) => d + '/' + ym.slice(5)).join(', ')}`
          : `${freqText(u.rule)} · κάθε ${wk[u.key].map((d) => DAYS_FULL[d]).join(' και ')}`;
        return h('li', {}, h('b', {}, u.label), h('br'), h('small', {}, when));
      }))
      : h('p', { class: 'hint' }, 'Δεν υπάρχει εξοπλισμός για αυτό το είδος.'));
  det.addEventListener('toggle', () => { state.logCalOpen = det.open; });
  return det;
}

/* ---- Δήλωση εξοπλισμού (από τον/την υπεύθυνο καταστήματος) ---- */

function setupForm(sk, setup) {
  const editing = !!setup;
  const all = state.data.cleaning.equipment;
  const counts = {};
  all.forEach((eq) => {
    counts[eq.id] = setup ? countOf(setup.counts, eq) : (eq.numbered ? 0 : 1);
  });

  const save = () => {
    const name = f.name.value.trim();
    if (!name) { toast('Συμπλήρωσε πρώτα το όνομα του υπευθύνου (πάνω).'); f.name.focus(); return; }
    if (editing && !confirm('Να αποθηκευτεί ο νέος εξοπλισμός; Αλλάζει το πρόγραμμα και ο έλεγχος του μήνα.')) return;
    const next = { counts, since: setup && setup.since ? setup.since : todayISO(), by: name, at: new Date().toISOString() };
    setEquip(sk, next);
    if (shared()) { queueAdd(equipOp(sk, next, false)); syncStore(sk); }
    state.logMode = 'main';
    renderLog();
    renderLogNotice();
    scrollToLog();
    toast('Ο εξοπλισμός του καταστήματος αποθηκεύτηκε.');
  };

  return h('div', { class: 'log log-setup' },
    h('div', { class: 'log-warn' },
      h('div', { class: 'log-warn-title' }, '⚠️ Προσοχή!'),
      editing
        ? h('p', {}, 'Αλλαγή εξοπλισμού του καταστήματος. Γίνεται ', h('b', {}, 'μόνο από τον/την υπεύθυνο καταστήματος'), ' και επηρεάζει το πρόγραμμα και τον έλεγχο του μήνα.')
        : [
          h('p', {}, `Πρώτη χρήση του αρχείου καθαριοτήτων/αποψύξεων για το κατάστημα «${storeLabel()}»${shared() ? '' : ' σε αυτή τη συσκευή'}.`),
          h('p', {}, h('b', {}, 'Ο/Η υπεύθυνος καταστήματος'), ' δηλώνει πρώτα τον εξοπλισμό του καταστήματος. Αν δεν είσαι ο/η υπεύθυνος καταστήματος, μην προχωρήσεις.'),
        ]),
    h('div', { class: 'box' },
      h('h2', {}, 'Μηχανήματα κατάψυξης/συντήρησης και βιτρίνες παγωτού'),
      h('p', { class: 'hint' }, 'Πόσα υπάρχουν στο κατάστημα; (0 = δεν υπάρχει). Η αρίθμηση Νο 1, Νο 2… να ταιριάζει με την αρίθμηση στο κατάστημα.'),
      all.filter((eq) => eq.numbered).map((eq) => h('label', { class: 'eq-row' },
        h('span', {}, eq.name),
        h('select', {
          value: String(counts[eq.id]),
          onchange: (e) => { counts[eq.id] = Number(e.target.value); },
        }, Array.from({ length: 11 }, (_, i) => h('option', { value: String(i) }, String(i)))))),
      h('h2', {}, 'Λοιπός εξοπλισμός και χώροι'),
      h('p', { class: 'hint' }, 'Τσέκαρε όσα υπάρχουν στο κατάστημα.'),
      all.filter((eq) => !eq.numbered).map((eq) => h('label', { class: 'chk-row' },
        h('input', {
          type: 'checkbox',
          checked: !!counts[eq.id],
          onchange: (e) => { counts[eq.id] = e.target.checked ? 1 : 0; },
        }),
        eq.name))),
    h('p', { class: 'hint' }, 'Υπεύθυνος: ', whoEl()),
    h('div', { class: 'stack' },
      h('button', { type: 'button', class: 'btn dark', onclick: save }, 'Αποθήκευση εξοπλισμού'),
      editing ? h('button', { type: 'button', class: 'btn ghost', onclick: () => { state.logMode = 'main'; renderLog(); } }, 'Ακύρωση') : null,
      !editing && shared() ? h('button', { type: 'button', class: 'btn ghost', onclick: () => openArchive() }, '🔒 Αρχείο (με κωδικό)') : null));
}

/* ---- Αρχείο με κωδικό ---- */

function openArchive() {
  if (shared()) {
    state.logMode = state.archivePw && state.archive ? 'archive' : 'unlock';
    renderLog();
    scrollToLog();
    return;
  }
  const hash = state.data.cleaning.passwordHash;
  if (!hash) { toast('Δεν έχει οριστεί κωδικός αρχείου. Ορίζεται στη Διαχείριση → Καθαριότητες.', 6000); return; }
  state.logMode = sessGet(LOG_LS.unlocked) === hash ? 'archive' : 'unlock';
  renderLog();
  scrollToLog();
}

// Κοινό αρχείο: όλα τα καταστήματα για έναν μήνα (ο κωδικός ελέγχεται από το Google).
async function loadArchive(month, pw) {
  pw = pw || state.archivePw;
  const res = await apiCall({ action: 'archive', pw, month });
  state.archivePw = pw;
  state.archive = { month: res.month, stores: res.stores || {} };
  state.logArchiveMonth = res.month;
}

function lockArchive() {
  state.archivePw = '';
  state.archive = null;
  sessSet(LOG_LS.unlocked, '');
  state.logMode = 'main';
  renderLog();
}

function unlockForm() {
  const pw = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Κωδικός' });
  const btn = h('button', { type: 'submit', class: 'btn dark' }, 'Είσοδος');
  const go = async (e) => {
    e.preventDefault();
    if (shared()) {
      btn.disabled = true;
      btn.textContent = 'Φόρτωση…';
      try {
        await loadArchive(state.logArchiveMonth || ymOf(todayISO()), pw.value);
      } catch (x) {
        toast(apiMsg(x));
        btn.disabled = false;
        btn.textContent = 'Είσοδος';
        pw.value = '';
        pw.focus();
        return;
      }
      state.logArchiveStore = state.data.stores.some((s) => s.id === f.store.value) ? f.store.value : '';
      state.logMode = 'archive';
      renderLog();
      return;
    }
    let hash = '';
    try { hash = await pwHash(pw.value); } catch (x) { toast('Ο έλεγχος κωδικού δεν υποστηρίζεται σε αυτή τη σύνδεση.'); return; }
    if (hash !== state.data.cleaning.passwordHash) { toast('Λάθος κωδικός.'); pw.value = ''; pw.focus(); return; }
    sessSet(LOG_LS.unlocked, hash);
    state.logMode = 'archive';
    renderLog();
  };
  const form = h('form', { class: 'box', onsubmit: go },
    h('h2', {}, '🔒 Αρχείο καθαριοτήτων/αποψύξεων'),
    shared() ? h('p', { class: 'hint' }, 'Κοινό αρχείο όλων των καταστημάτων.') : null,
    h('label', { class: 'field' }, 'Κωδικός αρχείου', pw),
    h('div', { class: 'stack' },
      btn,
      h('button', { type: 'button', class: 'btn ghost', onclick: () => { state.logMode = 'main'; renderLog(); } }, 'Πίσω')));
  setTimeout(() => pw.focus(), 0);
  return h('div', { class: 'log' }, form);
}

// Σύνοψη ανά μονάδα: έγιναν / απαιτούνται / τι δεν έγινε.
function unitSummary(rows) {
  const map = new Map();
  rows.forEach((x) => {
    const k = x.type + ':' + x.u.key;
    if (!map.has(k)) map.set(k, { type: x.type, u: x.u, done: 0, req: 0, missed: [], pending: false });
    const s = map.get(k);
    s.done += x.done;
    s.req += x.req;
    if (!x.ok && x.ended) s.missed.push(x);
    if (!x.ok && !x.ended) s.pending = true;
  });
  return [...map.values()];
}

async function changeArchiveMonth(ym) {
  $('log-view').replaceChildren(h('div', { class: 'log' }, h('div', { class: 'box' }, h('p', {}, '⏳ Φόρτωση…'))));
  try { await loadArchive(ym); } catch (x) { toast(apiMsg(x)); }
  renderLog();
}

function archiveShared() {
  const ym = state.archive.month;
  const sel = state.logArchiveStore || '';
  const ids = state.data.stores.map((s) => s.id);
  const keys = [...ids, ...Object.keys(state.archive.stores).filter((k) => !ids.includes(k))];
  const head = h('div', { class: 'box' },
    h('h2', {}, '🔒 Αρχείο καθαριοτήτων/αποψύξεων'),
    h('label', { class: 'field' }, 'Κατάστημα',
      h('select', { value: sel, onchange: (e) => { state.logArchiveStore = e.target.value; renderLog(); } },
        h('option', { value: '' }, 'Όλα τα καταστήματα'),
        keys.map((k) => h('option', { value: k }, storeNameOf(k))))),
    h('label', { class: 'field' }, 'Μήνας',
      h('select', { value: ym, onchange: (e) => changeArchiveMonth(e.target.value) }, monthOptions(ym))));
  return sel && keys.includes(sel) ? archiveView(sel, archiveSrc(sel), head) : archiveAll(keys, ym, head);
}

// Όλα τα καταστήματα μαζί: πόσα έγιναν και πόσες ελλείψεις.
function archiveAll(keys, ym, head) {
  const today = todayISO();
  const current = ym === ymOf(today);
  const msgs = [];
  const open = (sk) => h('button', { type: 'button', class: 'linkbtn', onclick: () => { state.logArchiveStore = sk; renderLog(); } }, storeNameOf(sk));
  const rows = keys.map((sk) => {
    const src = archiveSrc(sk);
    const cd = checklistDays(src, ym);
    const first = h('td', {}, open(sk), h('br'), h('small', {}, `Checklists: Άν. ${cd.opening}/${cd.days} · Κλ. ${cd.closing}/${cd.days}`));
    if (!src.equip) return h('tr', {}, first, h('td', { colspan: 3, class: 'muted' }, 'Δεν έχει δηλωθεί εξοπλισμός'));
    const res = checkMonth(src, ym, current ? today : null);
    const part = (type) => {
      const xs = res.filter((x) => x.type === type);
      const req = xs.reduce((n, x) => n + x.req, 0);
      return req ? `${xs.reduce((n, x) => n + Math.min(x.done, x.req), 0)}/${req}` : '—';
    };
    const fails = res.filter((x) => !x.ok && x.ended);
    if (fails.length) msgs.push(noticeText(storeNameOf(sk), ym, fails));
    return h('tr', { class: fails.length ? 'bad' : '' },
      first,
      h('td', { class: 'c' }, part('clean')),
      h('td', { class: 'c' }, part('defrost')),
      h('td', { class: 'c' }, fails.length ? `✗ ${fails.length}` : '✓'));
  });
  return h('div', { class: 'log' },
    head,
    h('div', { class: 'box' },
      h('h2', {}, `Σύνοψη – ${monthLabel(ym)}`),
      h('p', { class: 'hint' }, 'Έγιναν / απαιτούνται' + (current ? ' (μετράνε οι εβδομάδες που έχουν ξεκινήσει)' : '') + '. «✗» = πόσες φορές δεν έγινε κάτι όπως ορίζεται. Πάτα ένα κατάστημα για λεπτομέρειες.'),
      h('table', { class: 'sum-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Κατάστημα'), h('th', {}, 'Καθαρ.'), h('th', {}, 'Αποψ.'), h('th', {}, 'Ελλείψεις'))),
        h('tbody', {}, rows))),
    h('section', { class: 'actions' },
      msgs.length ? h('button', { type: 'button', class: 'btn viber', onclick: () => shareText(msgs.join('\n\n')) }, 'Αποστολή ελλείψεων στο Viber') : null,
      h('button', { type: 'button', class: 'btn ghost', onclick: lockArchive }, 'Κλείδωμα και επιστροφή')));
}

// Ένα κατάστημα: σύνοψη ανά εξοπλισμό, καταχωρήσεις, Excel. head = επιλογές του κοινού αρχείου.
function archiveView(sk, src, head) {
  const today = todayISO();
  const ym = head ? state.archive.month : state.logArchiveMonth || ymOf(today);
  const current = ym === ymOf(today);
  const rows = checkMonth(src, ym, current ? today : null);
  const sum = unitSummary(rows);
  const entries = src.entries.filter((e) => ymOf(e.d) === ym)
    .sort((a, b) => (b.d + b.at).localeCompare(a.d + a.at));
  const fails = rows.filter((x) => !x.ok && x.ended);

  const setup = src.equip || { counts: {} };
  const table = (type) => {
    // Όλες οι μονάδες του καταστήματος, ακόμα κι αν δεν μετράνε ακόμα στον έλεγχο.
    const list = logUnits(setup.counts, type).map((u) => {
      const s = sum.find((x) => x.type === type && x.u.key === u.key);
      return { u, done: entriesOf(entries, type, u).length, req: s ? s.req : 0, missed: s ? s.missed : [], pending: !!(s && s.pending) };
    });
    if (!list.length) return h('p', { class: 'hint' }, 'Δεν υπάρχει εξοπλισμός για αυτό το είδος.');
    return h('table', { class: 'sum-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Εξοπλισμός / χώρος'), h('th', {}, 'Έγιναν'), h('th', {}, 'Κατάσταση'))),
      h('tbody', {}, list.map((s) => h('tr', { class: s.missed.length ? 'bad' : '' },
        h('td', {}, s.u.label, h('br'), h('small', {}, freqText(s.u.rule))),
        h('td', { class: 'c' }, s.req ? `${s.done}/${s.req}` : String(s.done)),
        h('td', {}, s.missed.length
          ? '✗ ' + s.missed.map((x) => (x.u.rule.per === 'month' ? 'μήνας' : `${x.a}–${x.b}/${ym.slice(5)}`)).join(', ')
          : s.pending ? '⏳ εκκρεμεί' : s.req ? '✓' : '—')))));
  };

  return h('div', { class: 'log' },
    head || h('div', { class: 'box' },
      h('h2', {}, `🔒 Αρχείο – ${storeNameOf(sk)}`),
      h('label', { class: 'field' }, 'Μήνας',
        h('select', { value: ym, onchange: (e) => { state.logArchiveMonth = e.target.value; renderLog(); } }, monthOptions(ym)))),
    h('div', { class: 'box' },
      head ? h('h2', {}, storeNameOf(sk)) : null,
      src.equip
        ? h('p', { class: 'hint' }, `Έγιναν: καταχωρήσεις του μήνα / όσες απαιτούνται. «—» = δεν μετράει ακόμα στον έλεγχο (ο εξοπλισμός δηλώθηκε ${fmtDate(setup.since)}· η πρώτη μισή εβδομάδα δεν μετράει).`)
        : h('p', { class: 'hint' }, 'Δεν έχει δηλωθεί εξοπλισμός για αυτό το κατάστημα.'),
      current ? h('p', { class: 'hint' }, 'Τρέχων μήνας: μετράνε μόνο οι εβδομάδες που έχουν ξεκινήσει.') : null),
    Object.entries(LOG_TYPES).map(([type, label]) => h('div', { class: 'box' }, h('h2', {}, label), table(type))),
    head ? h('div', { class: 'box' },
      h('h2', {}, `Checklists ${SECTIONS.opening} / ${SECTIONS.closing}`),
      h('p', { class: 'hint' }, 'Όσα στάλθηκαν στο αρχείο. «—» = δεν στάλθηκε. Πάτα μια ημέρα για λεπτομέρειες.'),
      checklistTable(src, ym)) : null,
    h('div', { class: 'box' },
      h('h2', {}, `Καταχωρήσεις (${entries.length})`),
      entries.length
        ? h('ul', { class: 'entries' }, entries.map((e) => entryRow(sk, e, true, true)))
        : h('p', { class: 'hint' }, 'Καμία καταχώρηση αυτόν τον μήνα.')),
    h('section', { class: 'actions' },
      src.equip ? h('button', { type: 'button', class: 'btn', onclick: () => openLogExport(sk, ym, src, head ? 0 : 13) }, 'Αποθήκευση σε Excel') : null,
      fails.length ? h('button', { type: 'button', class: 'btn viber', onclick: () => shareText(noticeText(storeNameOf(sk), ym, fails)) }, 'Αποστολή όσων δεν έγιναν στο Viber') : null,
      h('button', { type: 'button', class: 'btn ghost', onclick: lockArchive }, 'Κλείδωμα και επιστροφή')));
}

/* ---------- Εξαγωγή σε Excel ---------- */

// months = πόσοι μήνες προς τα πίσω προσφέρονται (0 = μόνο ο μήνας ymDefault).
function openLogExport(sk, ymDefault, src, months) {
  const setup = src.equip;
  if (!setup) return;
  const counts = {};
  state.data.cleaning.equipment.forEach((eq) => { counts[eq.id] = countOf(setup.counts, eq); });
  const all = state.data.cleaning.equipment;
  const dlg = $('log-dialog');
  const selMonth = h('select', { value: ymDefault, disabled: !months },
    months ? monthOptions(ymDefault, months) : h('option', { value: ymDefault }, monthLabel(ymDefault)));

  const download = async () => {
    dlg.close();
    const ym = selMonth.value;
    const blob = xlsxBlob([
      { name: LOG_TYPES.clean, xml: logSheetXml(src, sk, ym, 'clean', counts) },
      { name: LOG_TYPES.defrost, xml: logSheetXml(src, sk, ym, 'defrost', counts) },
      { name: 'Καταχωρήσεις', xml: logEntriesXml(src, sk, ym) },
    ]);
    const store = toLatin(storeNameOf(sk) || 'xoris-katastima').replace(/[^A-Za-z0-9-]+/g, '-');
    await deliverFile(blob, `kathariotites-apopsyxeis_${store}_${ym}.xlsx`);
  };

  $('log-dialog-body').replaceChildren(...[
    h('h2', {}, 'Αποθήκευση σε Excel'),
    h('p', { class: 'hint' }, storeNameOf(sk)),
    h('label', { class: 'field' }, 'Μήνας', selMonth),
    h('p', { class: 'hint' }, 'Διάλεξε πόσα από το καθένα θα μπουν στο Excel. Οι τιμές έρχονται από τον εξοπλισμό του καταστήματος.'),
    all.filter((eq) => eq.numbered).map((eq) => h('label', { class: 'eq-row' },
      h('span', {}, eq.name),
      h('select', {
        value: String(counts[eq.id]),
        onchange: (e) => { counts[eq.id] = Number(e.target.value); },
      }, Array.from({ length: 11 }, (_, i) => h('option', { value: String(i) }, String(i)))))),
    all.filter((eq) => !eq.numbered).map((eq) => h('label', { class: 'chk-row' },
      h('input', { type: 'checkbox', checked: !!counts[eq.id], onchange: (e) => { counts[eq.id] = e.target.checked ? 1 : 0; } }),
      eq.name)),
    h('div', { class: 'stack' },
      h('button', { type: 'button', class: 'btn dark', onclick: download }, 'Λήψη Excel'),
      h('button', { type: 'button', class: 'btn ghost', onclick: () => dlg.close() }, 'Άκυρο')),
  ].flat());
  dlg.showModal();
  dlg.scrollTop = 0;
}

function colName(n) {
  let s = '';
  for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function sheetRows() {
  const rows = [];
  let r = 0;
  const cell = (c, v, st) => {
    const ref = colName(c) + r;
    if (v === '' || v == null) return `<c r="${ref}" s="${st}"/>`;
    if (typeof v === 'number') return `<c r="${ref}" s="${st}"><v>${v}</v></c>`;
    return `<c r="${ref}" s="${st}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
  };
  return {
    rows,
    get r() { return r; },
    skip() { r++; },
    // cells: [[στήλη (0 = A), τιμή, στυλ], …]
    add(cells, ht) {
      r++;
      rows.push(`<row r="${r}"${ht ? ` ht="${ht}" customHeight="1"` : ''}>${cells.map((c) => cell(...c)).join('')}</row>`);
    },
  };
}

function logSheetXml(src, sk, ym, type, counts) {
  const mi = monthInfo(ym);
  const setup = src.equip || {};
  const entries = src.entries.filter((e) => ymOf(e.d) === ym && e.t === type);
  const units = logUnits(counts, type);
  const tasks = planMonth(ym, type, counts, src.plans);
  const sum = unitSummary(checkUnits(units, type, entries, ym, setup.since || '', null));
  const D = 3; // πρώτη στήλη ημερών (D)
  const last = D + mi.dim;
  const we = (d) => mi.dow(d) === 0 || mi.dow(d) === 6;
  const s = sheetRows();

  s.add([[0, `${LOG_TITLES[type]} – ${storeNameOf(sk)} – ${monthLabel(ym)}`, XS.title]]);
  s.add([[0, `Κατάστημα: ${storeNameOf(sk)} · Μήνας: ${monthLabel(ym)} · Εξαγωγή: ${fmtDate(todayISO())}`, XS.label]]);
  s.skip();
  const head = [[0, 'Εξοπλισμός / χώρος', XS.head], [1, 'Νο', XS.head], [2, 'Συχνότητα', XS.head]];
  const head2 = [[0, '', XS.head], [1, '', XS.head], [2, '', XS.head]];
  for (let d = 1; d <= mi.dim; d++) {
    head.push([D + d - 1, d, we(d) ? XS.headWe : XS.head]);
    head2.push([D + d - 1, DAYS_SHORT[mi.dow(d)].slice(0, 2), we(d) ? XS.headWe : XS.head]);
  }
  head.push([last, 'Έγιναν', XS.head], [last + 1, 'Απαιτούνται', XS.head]);
  head2.push([last, '', XS.head], [last + 1, '', XS.head]);
  s.add(head);
  s.add(head2);
  const headRow = s.r;

  units.forEach((u) => {
    const mine = entriesOf(entries, type, u);
    const doneDays = new Set(mine.map((e) => Number(e.d.slice(8))));
    const sugDays = new Set(tasks.filter((t) => t.u.key === u.key).map((t) => t.day));
    const sm = sum.find((x) => x.u.key === u.key) || { done: 0, req: 0 };
    const cells = [[0, u.eq.name, XS.cell], [1, u.no || '', XS.center], [2, freqText(u.rule), XS.cell]];
    for (let d = 1; d <= mi.dim; d++) {
      const st = doneDays.has(d) ? XS.dDone : sugDays.has(d) ? XS.dSug : we(d) ? XS.dWe : XS.dCell;
      cells.push([D + d - 1, doneDays.has(d) ? '✓' : '', st]);
    }
    cells.push([last, mine.length, sm.req && sm.done < sm.req ? XS.bad : XS.good], [last + 1, sm.req || '-', XS.center]);
    s.add(cells);
  });
  if (!units.length) s.add([[0, 'Δεν επιλέχθηκε εξοπλισμός.', 0]]);

  s.skip();
  s.add([[0, 'Υπόμνημα:', XS.label]]);
  s.add([[1, '', XS.dSug], [2, 'Προτεινόμενη ημέρα', 0]]);
  s.add([[1, '✓', XS.dDone], [2, 'Έγινε (καταχώρηση στην εφαρμογή)', 0]]);
  s.add([[1, '', XS.dWe], [2, 'Σάββατο / Κυριακή', 0]]);
  s.add([[0, 'Έλεγχος: οι εβδομαδιαίες ανά εβδομάδα 1–7, 8–14, 15–21, 22–τέλος μήνα· οι μηνιαίες για όλο τον μήνα.', 0]]);

  const cols = [`<col min="1" max="1" width="30" customWidth="1"/>`, `<col min="2" max="2" width="5" customWidth="1"/>`,
    `<col min="3" max="3" width="17" customWidth="1"/>`, `<col min="${D + 1}" max="${last}" width="3.6" customWidth="1"/>`,
    `<col min="${last + 1}" max="${last + 2}" width="13" customWidth="1"/>`];
  return sheetXml(s.rows, cols.join(''), `xSplit="3" ySplit="${headRow}" topLeftCell="D${headRow + 1}" activePane="bottomRight"`, 'landscape');
}

function logEntriesXml(src, sk, ym) {
  const entries = src.entries.filter((e) => ymOf(e.d) === ym)
    .sort((a, b) => (a.d + a.at).localeCompare(b.d + b.at));
  const s = sheetRows();
  s.add([[0, `Καταχωρήσεις καθαριοτήτων/αποψύξεων – ${storeNameOf(sk)} – ${monthLabel(ym)}`, XS.title]]);
  s.skip();
  s.add([[0, 'Ημερομηνία', XS.head], [1, 'Είδος', XS.head], [2, 'Εξοπλισμός / χώρος', XS.head], [3, 'Νο', XS.head],
    [4, 'Υπεύθυνος', XS.head], [5, 'Ώρα καταχώρησης', XS.head]]);
  const headRow = s.r;
  entries.forEach((e) => {
    const eq = eqById(e.eq);
    s.add([[0, fmtDate(e.d), XS.center], [1, LOG_TYPES[e.t] || '', XS.cell], [2, eq ? eq.name : '(διαγραμμένος εξοπλισμός)', XS.cell],
      [3, e.no || '', XS.center], [4, e.by || '', XS.cell], [5, e.at ? new Date(e.at).toTimeString().slice(0, 5) : '', XS.center]]);
  });
  if (!entries.length) s.add([[0, 'Καμία καταχώρηση αυτόν τον μήνα.', 0]]);
  const cols = '<col min="1" max="1" width="12" customWidth="1"/><col min="2" max="2" width="20" customWidth="1"/>'
    + '<col min="3" max="3" width="34" customWidth="1"/><col min="4" max="4" width="5" customWidth="1"/>'
    + '<col min="5" max="5" width="26" customWidth="1"/><col min="6" max="6" width="16" customWidth="1"/>';
  return sheetXml(s.rows, cols, `ySplit="${headRow}" topLeftCell="A${headRow + 1}" activePane="bottomLeft"`, 'portrait');
}

/* ---------- Διαχείριση → Καθαριότητες ---------- */

function adminCleaning() {
  const cfg = state.data.cleaning;
  const eqs = cfg.equipment;
  const isShared = shared();
  const p0 = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Τρέχων κωδικός' });
  const p1 = h('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Νέος κωδικός' });
  const p2 = h('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Ξανά ο νέος κωδικός' });
  const setPw = async () => {
    if (p1.value.length < 4) { toast('Ο κωδικός θέλει τουλάχιστον 4 χαρακτήρες.'); return; }
    if (p1.value !== p2.value) { toast('Οι δύο κωδικοί δεν ταιριάζουν.'); return; }
    if (isShared) {
      // Ο κωδικός φυλάσσεται στο Google Script, όχι στο GitHub.
      try {
        await apiCall({ action: 'setPassword', pw: p1.value, old: p0.value });
      } catch (e) {
        toast(String(e && e.message) === 'password' ? 'Ο τρέχων κωδικός είναι λάθος.' : apiMsg(e), 6000);
        return;
      }
      [p0, p1, p2].forEach((el) => { el.value = ''; });
      toast('Ο κωδικός ορίστηκε. Ισχύει αμέσως για το Αρχείο σε όλα τα κινητά.', 7000);
      return;
    }
    try { cfg.passwordHash = await pwHash(p1.value); } catch (e) { toast('Ο κωδικός δεν ορίστηκε: η σύνδεση δεν είναι ασφαλής (https).'); return; }
    markDirty(true);
    toast('Ο κωδικός ορίστηκε. Πάτα «Αποθήκευση για όλους» για να ισχύσει σε όλα τα κινητά.', 7000);
  };

  // Κοινό αρχείο (Google Sheet)
  const urlIn = h('input', {
    type: 'url',
    value: cfg.syncUrl || '',
    placeholder: 'https://script.google.com/macros/s/…/exec',
    autocomplete: 'off',
    oninput: (e) => { cfg.syncUrl = e.target.value.trim(); markDirty(false); },
  });
  // Το αποτέλεσμα της δοκιμής κρατιέται, γιατί μετά η οθόνη ξαναχτίζεται (αλλάζει και ο τρόπος ορισμού κωδικού).
  const out = h('pre', { class: 'hint result' }, state.syncTest || '');
  const testUrl = async () => {
    const url = urlIn.value.trim();
    let msg;
    if (!SYNC_URL_RE.test(url)) {
      msg = 'Η διεύθυνση δεν είναι σωστή. Πρέπει να αρχίζει με https://script.google.com/ και να τελειώνει σε /exec.';
    } else {
      out.textContent = 'Δοκιμή…';
      try {
        const r = await apiCall({ action: 'ping' }, url);
        if (r.app !== 'lartecono-log') throw new Error('app');
        state.syncSheetUrl = /^https:\/\/docs\.google\.com\//.test(r.sheetUrl || '') ? r.sheetUrl : '';
        msg = ['✓ Η σύνδεση λειτουργεί.',
          r.hasPassword ? 'Κωδικός αρχείου: έχει οριστεί.' : 'Κωδικός αρχείου: δεν έχει οριστεί ακόμα (ορίζεται παρακάτω).',
          state.hasDraft ? 'Πάτα «Αποθήκευση για όλους» (καρτέλα Αποθήκευση) για να συνδεθούν όλα τα κινητά.' : ''].filter(Boolean).join('\n');
      } catch (e) {
        msg = 'Δεν έγινε σύνδεση. Έλεγξε:\n• ότι η διεύθυνση τελειώνει σε /exec\n• ότι στο «Ποιος έχει πρόσβαση» διάλεξες «Οποιοσδήποτε»\n• ότι επικόλλησες όλο τον κώδικα και πάτησες Αποθήκευση πριν την Ανάπτυξη\n• τη σύνδεση στο ίντερνετ';
      }
    }
    state.syncTest = msg;
    if (state.adminTab === 'cleaning' && !$('view-admin').hidden) renderAdmin();
  };
  const copyCode = async () => {
    let text = '';
    try {
      const r = await fetch('google/Code.gs?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      text = await r.text();
    } catch (e) {
      toast('Δεν φορτώθηκε ο κώδικας. Έλεγξε τη σύνδεση.');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast('Ο κώδικας αντιγράφηκε. Επικόλλησέ τον στο Apps Script.', 6000);
    } catch (e) {
      showTextDialog('Αντίγραψε όλο τον κώδικα και επικόλλησέ τον στο Apps Script:', text);
    }
  };
  const move = (i, d) => {
    const j = i + d;
    [eqs[i], eqs[j]] = [eqs[j], eqs[i]];
    markDirty(true);
  };
  const del = (i) => {
    if (!confirm(`Διαγραφή του «${eqs[i].name}» από το αρχείο καθαριοτήτων/αποψύξεων;`)) return;
    eqs.splice(i, 1);
    markDirty(true);
  };

  const ruleEditor = (eq, type) => {
    const r = eq[type] || {};
    const min = h('input', { type: 'number', min: 0, max: 31, inputmode: 'numeric', class: 'num-in', value: r.min || '', 'aria-label': 'Φορές από' });
    const max = h('input', { type: 'number', min: 0, max: 31, inputmode: 'numeric', class: 'num-in', value: r.max || '', 'aria-label': 'Φορές έως' });
    const per = h('select', { value: r.per || 'week', 'aria-label': 'Περίοδος' },
      h('option', { value: 'week' }, 'εβδομάδα'), h('option', { value: 'month' }, 'μήνα'));
    const update = () => {
      const mn = parseInt(min.value, 10);
      const mx = parseInt(max.value, 10);
      if (!(mn > 0)) delete eq[type];
      else eq[type] = mx > mn ? { min: mn, max: mx, per: per.value } : { min: mn, per: per.value };
      markDirty(false);
    };
    [min, max, per].forEach((el) => el.addEventListener('change', update));
    return h('div', { class: 'rule-row' }, h('span', { class: 'rule-label' }, LOG_TYPES[type]), min, '–', max, 'φορές /', per);
  };

  // Μηνιαίο report με email (ρυθμίσεις στο Google Script, με τον κωδικό αρχείου).
  const repTo = h('input', { type: 'text', inputmode: 'email', autocomplete: 'off', placeholder: 'π.χ. onoma@gmail.com, allos@gmail.com' });
  const repPw = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Κωδικός αρχείου' });
  const repOut = h('pre', { class: 'hint result' });
  const report = async (payload) => {
    if (!repPw.value) { toast('Γράψε τον κωδικό αρχείου.'); repPw.focus(); return; }
    repOut.textContent = 'Περίμενε…';
    try {
      const r = await apiCall(Object.assign({ action: 'report', pw: repPw.value }, payload));
      repOut.textContent = [
        payload.send ? '✓ Το δοκιμαστικό στάλθηκε. Δες τα εισερχόμενα (και τα ανεπιθύμητα).' : '✓ Αποθηκεύτηκε.',
        'Παραλήπτες: ' + String(r.to || '').split(',').join(', '),
        r.monthly ? 'Μηνιαία αποστολή: ενεργή ✓ (κάθε 1η του μήνα, 8:00)' : 'Μηνιαία αποστολή: δεν είναι ενεργή. Στο Apps Script τρέξε μία φορά τη συνάρτηση «setupMonthlyReport».',
      ].join('\n');
    } catch (e) {
      const m = String((e && e.message) || e);
      repOut.textContent = m === 'emails' ? 'Κάποιο email δεν είναι σωστό. Χώρισε τα email με κόμμα.'
        : m === 'unknown-action' ? 'Το Google Script είναι παλιά έκδοση. Επικόλλησε τον νέο κώδικα και κάνε «Νέα έκδοση» στην ανάπτυξη (οδηγίες στο README).'
          : /auth|permission|εξουσιοδ|δικαίωμα/i.test(m) ? 'Χρειάζεται εξουσιοδότηση: στο Apps Script τρέξε μία φορά τη συνάρτηση «setupMonthlyReport».'
            : apiMsg(e);
    }
  };

  return h('div', {},
    h('div', { class: 'box' },
      h('h2', {}, 'Κοινό αρχείο (Google)'),
      h('p', { class: 'hint' }, isShared
        ? '☁️ Συνδεδεμένο: οι καταχωρήσεις όλων των κινητών γράφονται στο Google Sheet σου.'
        : 'Δεν έχει συνδεθεί: οι καταχωρήσεις μένουν μόνο στη συσκευή όπου γίνονται. Οδηγίες σύνδεσης στο README του repo («Κοινό αρχείο»).'),
      h('label', { class: 'field' }, 'Διεύθυνση εφαρμογής ιστού (τελειώνει σε /exec)', urlIn),
      h('button', { type: 'button', class: 'btn', onclick: testUrl }, 'Δοκιμή σύνδεσης'),
      out,
      state.syncSheetUrl ? h('a', { class: 'btn link-btn', href: state.syncSheetUrl, target: '_blank', rel: 'noopener' }, 'Άνοιγμα του Google Sheet') : null,
      h('button', { type: 'button', class: 'btn', onclick: copyCode }, 'Αντιγραφή κώδικα Google Script')),
    isShared ? h('div', { class: 'box' },
      h('h2', {}, 'Μηνιαίο report (email)'),
      h('p', { class: 'hint' }, 'Κάθε 1η του μήνα στις 8:00 έρχεται email με τη σύνοψη όλων των καταστημάτων για τον προηγούμενο μήνα και ό,τι δεν έγινε. Ενεργοποιείται μία φορά από το Apps Script (οδηγίες στο README: «Μηνιαίο report»).'),
      h('label', { class: 'field' }, 'Email παραληπτών (κενό = ο λογαριασμός Google σου)', repTo),
      h('label', { class: 'field' }, 'Κωδικός αρχείου', repPw),
      h('button', { type: 'button', class: 'btn', onclick: () => report({ emails: repTo.value.trim() }) }, 'Αποθήκευση παραληπτών'),
      h('button', { type: 'button', class: 'btn', onclick: () => report({ send: true }) }, 'Αποστολή δοκιμαστικού τώρα'),
      repOut) : null,
    h('div', { class: 'box' },
      h('h2', {}, 'Κωδικός αρχείου'),
      isShared
        ? h('p', { class: 'hint' }, 'Ο κωδικός φυλάσσεται στο Google Script και ισχύει αμέσως για όλους. Την πρώτη φορά άφησε κενό τον «Τρέχοντα κωδικό».')
        : h('p', { class: 'hint' }, cfg.passwordHash
          ? 'Έχει οριστεί κωδικός ✓. Γράψε νέο μόνο αν θέλεις να τον αλλάξεις.'
          : 'Δεν έχει οριστεί κωδικός. Χωρίς κωδικό το «Αρχείο» δεν ανοίγει.'),
      h('p', { class: 'warn' }, 'Μη χρησιμοποιείς κωδικό συναγερμού/POS ή κωδικό που χρησιμοποιείς αλλού.'),
      isShared ? h('label', { class: 'field' }, 'Τρέχων κωδικός (αν έχει ήδη οριστεί)', p0) : null,
      h('label', { class: 'field' }, 'Νέος κωδικός', p1),
      h('label', { class: 'field' }, 'Επανάληψη', p2),
      h('button', { type: 'button', class: 'btn', onclick: setPw }, 'Ορισμός κωδικού')),
    h('h2', {}, 'Εξοπλισμός, χώροι και συχνότητες'),
    h('p', { class: 'hint' }, 'Κενό στις «φορές» σημαίνει ότι δεν ισχύει για αυτό το είδος. Το «έως» είναι προαιρετικό (π.χ. 2–3 φορές)· ο έλεγχος του μήνα μετράει το ελάχιστο. «Αριθμημένο»: ο υπάλληλος διαλέγει Νο.'),
    h('div', { class: 'ed-list' }, eqs.map((eq, i) => h('div', { class: 'ed-row' },
      h('label', { class: 'field' }, 'Όνομα',
        h('input', { type: 'text', value: eq.name, oninput: (e) => { eq.name = e.target.value; markDirty(false); } })),
      ruleEditor(eq, 'clean'),
      ruleEditor(eq, 'defrost'),
      h('div', { class: 'ed-tools' },
        h('label', { class: 'chk notify-chk' },
          h('input', { type: 'checkbox', checked: !!eq.numbered, onchange: (e) => { eq.numbered = e.target.checked; markDirty(true); } }),
          'Αριθμημένο (Νο 1–10)'),
        h('button', { type: 'button', 'aria-label': 'Πάνω', disabled: i === 0, onclick: () => move(i, -1) }, '↑'),
        h('button', { type: 'button', 'aria-label': 'Κάτω', disabled: i === eqs.length - 1, onclick: () => move(i, 1) }, '↓'),
        h('button', { type: 'button', class: 'danger', onclick: () => del(i) }, 'Διαγραφή'))))),
    h('button', {
      type: 'button',
      class: 'btn',
      onclick: () => { eqs.push({ id: newId('eq'), name: '', clean: { min: 1, per: 'week' } }); markDirty(true); },
    }, '+ Προσθήκη εξοπλισμού/χώρου'),
    saveReminder());
}
