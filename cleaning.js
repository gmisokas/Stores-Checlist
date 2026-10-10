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
        // Από πότε μετράει (εξοπλισμός που προστέθηκε αργότερα στη λίστα).
        if (/^\d{4}-\d{2}-\d{2}$/.test(eq.since || '')) o.since = eq.since;
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

// version: έκδοση του Google Script (από την απάντηση του συγχρονισμού· null = δεν είναι ακόμα γνωστή).
const sync = { busy: {}, again: {}, error: {}, at: {}, tried: {}, oldScript: false, noPlanFill: false, version: null };
// Από αυτή την έκδοση του Google Script αποθηκεύεται το «Δεν έγινε» με αιτία.
const SKIP_VERSION = 4;

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

// Πρόγραμμα του τρέχοντος μήνα για το κοινό αρχείο, ώστε να μην αλλάζει προς τα πίσω όταν αλλάζει ο εξοπλισμός
// ή οι συχνότητες: όλος ο μήνας αν δεν έχει αποθηκευτεί, αλλιώς οι νέες μονάδες και όσες ημέρες λείπουν
// από σήμερα και μετά. null = δεν χρειάζεται τίποτα.
function planFill(sk) {
  const setup = getEquip(sk);
  if (!setup) return null;
  const today = todayISO();
  const ym = ymOf(today);
  const from = Number(today.slice(8));
  const plans = getPlans(sk);
  const saved = plans[ym];
  const plan = {};
  let n = 0;
  PlanCalc.TYPES.forEach((type) => {
    plan[type] = {};
    const auto = PlanCalc.auto(eqList(), ym, type, setup.counts);
    const load = {};
    Object.values(PlanCalc.days(eqList(), ym, type, setup.counts, plans)).forEach((list) => list.forEach((d) => { load[d] = (load[d] || 0) + 1; }));
    logUnits(setup.counts, type).forEach((u) => {
      const start = PlanCalc.startDay(setup, u, ym);
      const own = saved && saved[type] && saved[type][u.key];
      const days = topUpDays(u, ym, own || auto[u.key].filter((d) => d >= start && d < from), from, start, auto[u.key], load);
      const add = own ? days.filter((d) => !own.includes(d)) : days;
      if (!own || add.length) { plan[type][u.key] = add; n++; }
    });
  });
  if (saved && !n) return null;
  return { op: 'plan', store: sk, storeName: storeNameOf(sk), month: ym, plan };
}

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
  // Το «Δεν έγινε» στέλνεται μόνο σε Google Script που το αποθηκεύει (αλλιώς θα γραφόταν ως «έγινε»).
  const hold = (sync.version || 0) < SKIP_VERSION;
  const held = (o) => hold && o.op === 'add' && o.e && o.e.skip;
  const mine = pendingOf(sk).filter((o) => !held(o));
  const ops = [];
  if (!isSynced(sk)) {
    // Πρώτη σύνδεση της συσκευής: ό,τι είχε γραφτεί μόνο εδώ ανεβαίνει στο κοινό αρχείο.
    const local = getEquip(sk);
    if (local) ops.push(Object.assign({ qid: 'm-equip' }, equipOp(sk, local, true)));
    getLog(sk).forEach((e) => ops.push(Object.assign({ qid: 'm-' + e.id }, addOp(sk, e))));
  }
  ops.push(...mine);
  // Το πρόγραμμα του μήνα αποθηκεύεται στο κοινό αρχείο, ώστε να μην αλλάζει προς τα πίσω.
  const fill = sync.noPlanFill ? null : planFill(sk);
  if (fill) ops.push(Object.assign({ qid: 'p-fill' }, fill));
  const from = syncFrom();
  const res = await apiCall({ action: 'sync', store: sk, from, ops });
  // Παλιά έκδοση του Google Script: δεν ξέρει το αυτόματο πρόγραμμα (δεν ξαναστέλνεται σε αυτή τη χρήση).
  if ((res.results || []).some((x) => x.qid === 'p-fill' && x.reason === 'bad')) sync.noPlanFill = true;
  sync.version = Number(res.version) || 0;
  if (hold && sync.version >= SKIP_VERSION && pendingOf(sk).some((o) => o.op === 'add' && o.e && o.e.skip)) sync.again[sk] = true;
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
function eqList() { return state.data.cleaning.equipment; }

// Μονάδες ενός είδους (π.χ. Κατάψυξη Νο 1, Νο 2, Αποθήκη) με βάση τον εξοπλισμό.
function logUnits(counts, type) { return PlanCalc.units(eqList(), counts, type); }

/* ===== ΚΟΙΝΟΣ ΚΩΔΙΚΑΣ: ίδιος στο cleaning.js και στο google/Code.gs ===== */
// Πρόγραμμα μήνα και κατάσταση κάθε εργασίας. Ό,τι αλλάζει εδώ αλλάζει και στο άλλο αρχείο.
const PlanCalc = {
  TYPES: ['clean', 'defrost'],
  WHY: { b: 'Βλάβη', c: 'Κλειστό κατάστημα', o: 'Άλλο' },
  DAYS: ['Κυρ', 'Δευ', 'Τρι', 'Τετ', 'Πεμ', 'Παρ', 'Σαβ'],

  month(ym) {
    const y = Number(ym.slice(0, 4));
    const m = Number(ym.slice(5, 7));
    return {
      dim: new Date(y, m, 0).getDate(),
      iso: (d) => `${ym}-${String(d).padStart(2, '0')}`,
      dow: (d) => new Date(y, m - 1, d).getDay(),
    };
  },

  // Πόσα από ένα είδος έχει το κατάστημα. Είδος χωρίς Νο που λείπει από τη δήλωση θεωρείται ότι υπάρχει.
  count(counts, eq) {
    const raw = (counts || {})[eq.id];
    if (raw === undefined) return eq.numbered ? 0 : 1;
    return Math.min(10, Math.max(0, parseInt(raw, 10) || 0));
  },

  // Μονάδες ενός είδους εργασίας, π.χ. Κατάψυξη Νο 1, Κατάψυξη Νο 2, Αποθήκη.
  units(equipment, counts, type) {
    const out = [];
    equipment.forEach((eq) => {
      const rule = eq[type];
      if (!rule || !(rule.min > 0)) return;
      const n = PlanCalc.count(counts, eq);
      if (!n) return;
      const nos = eq.numbered ? Array.from({ length: n }, (_, i) => i + 1) : [0];
      nos.forEach((no) => out.push({ eq, no, rule, key: eq.id + '#' + no, label: no ? `${eq.name} Νο ${no}` : eq.name }));
    });
    return out;
  },

  // Εβδομάδες του μήνα: 1–7, 8–14, 15–21, 22–τέλος. Για τις μηνιαίες, όλος ο μήνας.
  windows(rule, dim) {
    return rule.per === 'month' ? [[1, dim]] : [[1, 7], [8, 14], [15, 21], [22, dim]];
  },

  windowOf(rule, dim, d) {
    return PlanCalc.windows(rule, dim).find((w) => d >= w[0] && d <= w[1]) || [d, d];
  },

  // Σταθερές ημέρες εβδομάδας για τις εβδομαδιαίες εργασίες, μοιρασμένες ώστε να μη
  // συγκεντρώνονται όλες την ίδια ημέρα. Όλες οι ημέρες, και το Σαββατοκύριακο.
  weekdays(units) {
    const days = [1, 2, 3, 4, 5, 6, 0];
    const load = {};
    days.forEach((d) => { load[d] = 0; });
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
  },

  // Αυτόματη πρόταση της εφαρμογής: { μονάδα: [ημέρες του μήνα] }.
  auto(equipment, ym, type, counts) {
    const mi = PlanCalc.month(ym);
    const units = PlanCalc.units(equipment, counts, type);
    const wk = PlanCalc.weekdays(units);
    const load = new Array(mi.dim + 2).fill(0);
    const out = {};
    units.forEach((u) => { out[u.key] = []; });
    units.filter((u) => u.rule.per !== 'month').forEach((u) => {
      PlanCalc.windows(u.rule, mi.dim).forEach((w) => {
        wk[u.key].forEach((wd) => {
          for (let d = w[0]; d <= w[1]; d++) if (mi.dow(d) === wd) { out[u.key].push(d); load[d]++; break; }
        });
      });
    });
    // Οι μηνιαίες προτείνονται έως 3 ημέρες πριν από το τέλος του μήνα, ώστε να υπάρχει περιθώριο.
    const monthly = units.filter((u) => u.rule.per === 'month');
    const days = [];
    for (let d = 1; d <= mi.dim - 3; d++) days.push(d);
    monthly.forEach((u, j) => {
      const k = Math.min(u.rule.min, days.length);
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
        out[u.key].push(best);
      }
    });
    Object.keys(out).forEach((key) => out[key].sort((a, b) => a - b));
    return out;
  },

  // Από ποια ημέρα του μήνα μετράει μια μονάδα: δήλωση εξοπλισμού (since), προσθήκη της μονάδας
  // στο κατάστημα (added) ή προσθήκη του είδους στη λίστα (eq.since). dim + 1 = δεν μετράει αυτόν τον μήνα.
  startDay(setup, u, ym) {
    const list = [setup && setup.since, setup && setup.added && setup.added[u.key], u.eq.since]
      .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(String(x || ''))).sort();
    const s = list.length ? list[list.length - 1] : '';
    if (!s || s.slice(0, 7) < ym) return 1;
    if (s.slice(0, 7) > ym) return PlanCalc.month(ym).dim + 1;
    return Number(s.slice(8, 10));
  },

  // Ημέρες του προγράμματος ανά μονάδα: όσες αποθηκεύτηκαν (από τον/την υπεύθυνο ή αυτόματα),
  // αλλιώς η αυτόματη πρόταση.
  days(equipment, ym, type, counts, plans) {
    const dim = PlanCalc.month(ym).dim;
    const saved = (plans && plans[ym] && plans[ym][type]) || {};
    const auto = PlanCalc.auto(equipment, ym, type, counts);
    const out = {};
    PlanCalc.units(equipment, counts, type).forEach((u) => {
      const list = Array.isArray(saved[u.key]) ? saved[u.key] : auto[u.key];
      out[u.key] = list.filter((d, i) => d >= 1 && d <= dim && list.indexOf(d) === i).sort((a, b) => a - b);
    });
    return out;
  },

  // Κατάσταση κάθε εργασίας του προγράμματος. asOf = σήμερα (κενό για μήνα που έκλεισε).
  // ok: έγινε στην ώρα της (ή νωρίτερα, μέσα στην ίδια εβδομάδα) · late: έγινε αργότερα ·
  // skip: δεν έγινε, με αιτία · missed: δεν έγινε · overdue: καθυστερεί, μπορεί ακόμα να γίνει ·
  // due: σήμερα · todo: επόμενες ημέρες.
  // Μια εργασία που καθυστερεί μένει ανοιχτή μέχρι την επόμενη ημέρα της ίδιας μονάδας ή το τέλος του μήνα.
  // Κάθε καταχώρηση καλύπτει πρώτα την εργασία που ισχύει εκείνη την ημέρα (ή καθυστερεί)
  // και, αν αυτή έχει γίνει, την επόμενη της ίδιας εβδομάδας.
  states(equipment, setup, ym, type, entries, plans, asOf) {
    const mi = PlanCalc.month(ym);
    const last = mi.iso(mi.dim);
    const counts = (setup && setup.counts) || {};
    const days = PlanCalc.days(equipment, ym, type, counts, plans);
    const out = [];
    PlanCalc.units(equipment, counts, type).forEach((u) => {
      const from = PlanCalc.startDay(setup, u, ym);
      const ts = days[u.key].filter((d) => d >= from)
        .map((day) => ({ u, type, day, d: mi.iso(day), st: '', on: '', by: '', why: '', note: '' }));
      entries.filter((e) => e.t === type && e.eq === u.eq.id && (e.no || 0) === u.no && String(e.d).slice(0, 7) === ym)
        .sort((a, b) => (a.d + (a.at || '')).localeCompare(b.d + (b.at || '')))
        .forEach((e) => {
          const day = Number(e.d.slice(8, 10));
          let j = -1;
          ts.forEach((t, i) => { if (t.day <= day) j = i; });
          for (let i = 0; i < j; i++) if (!ts[i].st) ts[i].st = 'missed';
          let t = j >= 0 && !ts[j].st ? ts[j] : null;
          if (!t) {
            const w = PlanCalc.windowOf(u.rule, mi.dim, day);
            t = ts.find((x, i) => i > j && !x.st && x.day >= w[0] && x.day <= w[1]) || null;
          }
          if (!t) return;
          t.on = e.d;
          t.by = e.by || '';
          if (e.skip) {
            t.st = 'skip';
            t.why = e.skip;
            t.note = e.note || '';
          } else t.st = day > t.day ? 'late' : 'ok';
        });
      ts.forEach((t, i) => {
        if (t.st) return;
        if (!asOf || asOf > last) t.st = 'missed';
        else if (t.d > asOf) t.st = 'todo';
        else if (t.d === asOf) t.st = 'due';
        else t.st = ts.some((x, k) => k > i && x.d <= asOf) ? 'missed' : 'overdue';
      });
      out.push(...ts);
    });
    return out;
  },

  // Πόσες εργασίες σε κάθε κατάσταση· req = όσες έπρεπε να έχουν γίνει μέχρι σήμερα (χωρίς όσες έχουν αιτία).
  tally(tasks) {
    const n = { ok: 0, late: 0, skip: 0, missed: 0, overdue: 0, due: 0, todo: 0 };
    tasks.forEach((t) => { n[t.st]++; });
    n.done = n.ok + n.late;
    n.req = n.done + n.missed + n.overdue + n.due;
    return n;
  },

  // 2026-10-06 → «Τρι 6/10».
  dayLabel(iso) {
    const y = Number(iso.slice(0, 4));
    const m = Number(iso.slice(5, 7));
    const d = Number(iso.slice(8, 10));
    return `${PlanCalc.DAYS[new Date(y, m - 1, d).getDay()]} ${d}/${m}`;
  },

  // Ημέρες από το a έως το b, π.χ. «3 ημέρες».
  gap(a, b) {
    const t = (iso) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
    const n = Math.round((t(b) - t(a)) / 864e5);
    return `${n} ${n === 1 ? 'ημέρα' : 'ημέρες'}`;
  },

  // Περιγραφή κατάστασης, π.χ. «έγινε Παρ 9/10 (3 ημέρες καθυστέρηση)».
  text(t, asOf) {
    if (t.st === 'ok') return t.on === t.d ? 'έγινε' : `έγινε ${PlanCalc.dayLabel(t.on)}`;
    if (t.st === 'late') return `έγινε ${PlanCalc.dayLabel(t.on)} (${PlanCalc.gap(t.d, t.on)} καθυστέρηση)`;
    if (t.st === 'skip') return `δεν έγινε – ${PlanCalc.WHY[t.why] || 'με αιτία'}${t.note ? ': ' + t.note : ''}`;
    if (t.st === 'missed') return 'δεν έγινε';
    if (t.st === 'overdue') return `σε καθυστέρηση (${PlanCalc.gap(t.d, asOf)})`;
    if (t.st === 'due') return 'σήμερα';
    return 'προγραμματισμένη';
  },

  line(t, asOf) {
    return `${t.u.label} – ${PlanCalc.dayLabel(t.d)}: ${PlanCalc.text(t, asOf)}`;
  },
};
/* ===== ΤΕΛΟΣ ΚΟΙΝΟΥ ΚΩΔΙΚΑ ===== */

// Καταστάσεις των εργασιών ενός καταστήματος για έναν μήνα (type κενό = και τα δύο είδη).
// src = { equip, entries, plans } (deviceSrc ή archiveSrc).
function taskStates(src, ym, type, asOf) {
  if (!src || !src.equip) return [];
  return (type ? [type] : PlanCalc.TYPES)
    .flatMap((t) => PlanCalc.states(eqList(), src.equip, ym, t, src.entries || [], src.plans || {}, asOf));
}

// «Σήμερα» για τον έλεγχο ενός μήνα· για μήνα που έκλεισε, κενό (ό,τι έμεινε ανοιχτό «δεν έγινε»).
function asOfFor(ym) {
  const today = todayISO();
  return ym < ymOf(today) ? '' : today;
}

function entriesOf(entries, type, u) {
  return entries.filter((e) => e.t === type && e.eq === u.eq.id && (e.no || 0) === u.no);
}

// Εργασίες που δεν έγιναν όπως ορίζει το πρόγραμμα (καθυστέρηση, δεν έγιναν, με αιτία).
function isIssue(t) { return t.st === 'late' || t.st === 'missed' || t.st === 'overdue' || t.st === 'skip'; }

// Σύμβολο κάθε κατάστασης (ημερολόγια, Αρχείο).
const ST_MARK = { ok: '✓', late: '⚠️', skip: '⊘', missed: '✗', overdue: '⏳', due: '', todo: '' };

// Κείμενο για Viber με τις εργασίες ενός μήνα που δεν έγιναν όπως ορίζει το πρόγραμμα.
function noticeText(storeName, ym, tasks, asOf) {
  const lines = [`🔔 ΚΑΘΑΡΙΟΤΗΤΕΣ / ΑΠΟΨΥΞΕΙΣ – ${storeName}`, `📅 ${monthLabel(ym)}: δεν έγιναν όπως ορίζει το πρόγραμμα`];
  for (const [type, label] of Object.entries(LOG_TYPES)) {
    const list = tasks.filter((x) => x.type === type);
    if (list.length) lines.push('', `${label}:`, ...list.map((x) => '• ' + PlanCalc.line(x, asOf)));
  }
  return lines.join('\n');
}

function taskList(tasks, asOf) {
  return h('div', { class: 'fail-list' }, Object.entries(LOG_TYPES).map(([type, label]) => {
    const list = tasks.filter((x) => x.type === type);
    if (!list.length) return null;
    return [h('div', { class: 'fail-type' }, label), h('ul', {}, list.map((x) => h('li', {}, PlanCalc.line(x, asOf))))];
  }));
}

/* ---------- Ειδοποιήσεις (οθόνη checklist) ---------- */

function renderLogNotice() {
  const box = $('log-notice');
  box.replaceChildren();
  const sk = f.store.value;
  const nd = sk ? getDraft(sk).length : 0;
  const toLog = () => { state.section = 'log'; renderChecklist(); };
  if (nd && state.section !== 'log') {
    box.append(h('div', { class: 'log-remind' },
      `⚠️ Έχεις ${nd} τικ καθαριοτήτων/αποψύξεων που δεν αποθηκεύτηκαν στο αρχείο. `,
      h('button', { type: 'button', class: 'linkbtn', onclick: toLog }, 'Προβολή')));
  }
  if (!sk || !getEquip(sk)) return;
  const today = todayISO();
  const src = deviceSrc(sk);

  // Από την 1η του μήνα: τι δεν έγινε όπως ορίζει το πρόγραμμα τον προηγούμενο μήνα, μέχρι να πατηθεί «Το είδα».
  const prev = addMonths(ymOf(today), -1);
  const seenKey = LOG_LS.seen + sk + ':' + prev;
  if (!lsGet(seenKey, false)) {
    const issues = taskStates(src, prev, '', '').filter((t) => t.st === 'missed' || t.st === 'late');
    if (issues.length) {
      box.append(h('div', { class: 'log-alert' },
        h('div', { class: 'log-alert-title' }, `🔔 Ειδοποίηση – ${monthLabel(prev)}`),
        h('p', {}, 'Οι παρακάτω καθαριότητες/αποψύξεις δεν έγιναν όπως ορίζει το πρόγραμμα:'),
        taskList(issues, ''),
        h('div', { class: 'stack' },
          h('button', { type: 'button', class: 'btn viber', onclick: () => shareText(noticeText(storeLabel(), prev, issues, '')) }, 'Αποστολή στο Viber'),
          h('button', { type: 'button', class: 'btn ghost', onclick: () => { lsSet(seenKey, true); renderChecklist(); } }, 'Το είδα'))));
    }
  }
  if (state.section === 'log') return;
  const now = taskStates(src, ymOf(today), '', today);

  // Εργασίες σε καθυστέρηση: φαίνονται σε κάθε βάρδια, μέχρι να γίνουν.
  const late = now.filter((t) => t.st === 'overdue');
  if (late.length) {
    box.append(h('div', { class: 'log-late' },
      h('b', {}, `⚠️ ${late.length === 1 ? '1 εργασία' : late.length + ' εργασίες'} σε καθυστέρηση`),
      h('ul', {}, late.slice(0, 4).map((t) => h('li', {}, `${t.u.label} – ${LOG_TYPES[t.type]} (από ${PlanCalc.dayLabel(t.d)})`))),
      late.length > 4 ? h('p', {}, `και ${late.length - 4} ακόμα`) : null,
      h('button', { type: 'button', class: 'linkbtn', onclick: toLog }, 'Προβολή')));
  }

  // Από τις 25 του μήνα: υπενθύμιση για ό,τι μένει από το πρόγραμμα μέχρι το τέλος του μήνα.
  if (Number(today.slice(8)) >= REMIND_FROM_DAY) {
    const n = now.filter((t) => t.st === 'due' || t.st === 'todo').length;
    if (n) {
      box.append(h('div', { class: 'log-remind' },
        `⏰ Υπενθύμιση: μέχρι το τέλος του μήνα μένουν ${n === 1 ? '1 εργασία' : n + ' εργασίες'} του προγράμματος. `,
        h('button', { type: 'button', class: 'linkbtn', onclick: toLog }, 'Προβολή')));
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
  const day = Number(date.slice(8));
  const today = todayISO();
  const asOf = asOfFor(ym);
  const all = getLog(sk);
  const src = deviceSrc(sk);
  const tasks = taskStates(src, ym, type, asOf);

  // Υπενθύμιση στο τέλος του μήνα: ό,τι μένει από το πρόγραμμα.
  let remind = null;
  if (ym === ymOf(today) && Number(today.slice(8)) >= REMIND_FROM_DAY) {
    const left = taskStates(src, ym, '', today).filter((t) => t.st === 'due' || t.st === 'todo');
    if (left.length) {
      remind = h('div', { class: 'log-remind' },
        h('b', {}, '⏰ Υπενθύμιση: μέχρι το τέλος του μήνα μένουν:'),
        taskList(left, today));
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
  const pick = () => {
    const eq = eqs.find((x) => x.id === selEq.value);
    if (!eq) { toast('Επίλεξε εξοπλισμό ή χώρο.'); selEq.focus(); return null; }
    const no = eq.numbered ? parseInt(selNo.value, 10) || 0 : 0;
    if (eq.numbered && !no) { toast('Επίλεξε Νο.'); selNo.focus(); return null; }
    return { eq, no };
  };
  const tick = () => {
    const p = pick();
    if (p) addDraft(sk, type, p.eq, p.no);
  };

  // «Δεν έγινε» με αιτία: για εργασία του προγράμματος που δεν μπορεί να γίνει (βλάβη, κλειστό κατάστημα…).
  const skip = state.logSkip && state.logSkip.sk === sk && state.logSkip.type === type ? state.logSkip : null;
  let skipEl;
  if (skip) {
    const note = h('input', {
      type: 'text',
      maxlength: 120,
      value: skip.note,
      placeholder: skip.why === 'o' ? 'Γράψε την αιτία' : 'Σημείωση (προαιρετικά)',
      'aria-label': 'Σημείωση',
      oninput: (e) => { skip.note = e.target.value; },
    });
    const send = () => {
      const p = pick();
      if (!p) return;
      if (!skip.why) { toast('Διάλεξε αιτία.'); return; }
      if (skip.why === 'o' && !skip.note.trim()) { toast('Γράψε την αιτία.'); note.focus(); return; }
      addDraft(sk, type, p.eq, p.no, { skip: skip.why, note: skip.note.trim() });
    };
    skipEl = h('div', { class: 'skip-box' },
      h('div', { class: 'skip-title' }, 'Δεν έγινε – αιτία'),
      h('p', { class: 'hint' }, 'Για εργασία του προγράμματος που δεν μπορεί να γίνει. Διάλεξε πάνω εξοπλισμό / χώρο και Νο.'),
      h('div', { class: 'seg skip-why' }, Object.entries(PlanCalc.WHY).map(([k, label]) =>
        h('button', { type: 'button', 'aria-pressed': String(skip.why === k), onclick: () => { skip.why = k; renderLog(); } }, label))),
      note,
      h('div', { class: 'stack' },
        h('button', { type: 'button', class: 'btn dark', onclick: send }, 'Καταχώρηση «Δεν έγινε»'),
        h('button', { type: 'button', class: 'btn ghost', onclick: () => { state.logSkip = null; renderLog(); } }, 'Άκυρο')));
  } else {
    skipEl = h('button', {
      type: 'button',
      class: 'linkbtn skip-link',
      onclick: () => { state.logSkip = { sk, type, why: '', note: '' }; renderLog(); },
    }, 'Δεν έγινε; Δήλωσε αιτία');
  }

  const draft = getDraft(sk);
  const entryCard = h('div', { class: 'box log-entry' },
    h('h2', {}, 'Καταχώρηση – ' + LOG_TYPES[type]),
    h('div', { class: 'log-grid' },
      h('span', { class: 'log-col' }, 'Εξοπλισμός / χώρος'),
      h('span', { class: 'log-col' }, 'Νο'),
      h('span', { class: 'log-col log-col-tick' }, 'Αν έγινε, πατήστε'),
      selEq, selNo,
      h('button', { type: 'button', class: 'mark ok log-tick', 'aria-label': 'Έγινε', onclick: tick }, '✓')),
    h('p', { class: 'hint' }, `Ημερομηνία: ${fmtDate(date)} · Υπεύθυνος: `, whoEl()),
    skipEl);

  // Στο τέλος της σελίδας: τα τικ που περιμένουν και η αποθήκευση στο αρχείο.
  const saveCard = h('div', { class: 'box log-save' },
    h('h2', {}, `Προς αποθήκευση (${draft.length})`),
    draft.length
      ? h('ul', { class: 'entries draft' }, draft.map((x, i) => h('li', { class: x.skip ? 'skip' : '' },
        h('span', {}, entryLabel(x), h('small', {}, ` · ${LOG_TYPES[x.t]}${x.skip ? ' · Δεν έγινε – ' + (PlanCalc.WHY[x.skip] || '') : ''}${x.d !== date ? ' · ' + fmtDate(x.d) : ''}`)),
        h('button', { type: 'button', class: 'del', 'aria-label': 'Αφαίρεση', onclick: () => removeDraft(sk, i) }, '✕'))))
      : h('p', { class: 'hint' }, 'Πάτα ✓ σε ό,τι έγινε. Στο τέλος πάτα «Αποθήκευση στο αρχείο».'),
    h('button', { type: 'button', class: 'btn dark save-log', disabled: !!state.logSaving, onclick: () => saveDraft(sk) }, 'Αποθήκευση στο αρχείο'),
    h('p', { class: 'save-status log-save-status', hidden: true }));

  // Προτεινόμενα για την ημέρα + όσα καθυστερούν. Μόνο ενημέρωση: η καταχώρηση γίνεται από τα πεδία πάνω.
  const todayTasks = tasks.filter((t) => t.day === day);
  const overdue = tasks.filter((t) => t.st === 'overdue');
  const tag = (t) => {
    if (t.st === 'ok') return h('span', { class: 'done-tag' }, t.on === t.d ? '✓ Έγινε' : `✓ Έγινε ${PlanCalc.dayLabel(t.on)}`);
    if (t.st === 'late') return h('span', { class: 'late-tag' }, `⚠️ Έγινε ${PlanCalc.dayLabel(t.on)}`);
    if (t.st === 'skip') return h('span', { class: 'skip-tag' }, `⊘ ${PlanCalc.WHY[t.why] || 'Δεν έγινε'}`);
    if (inDraft(sk, type, t.u.eq.id, t.u.no, date)) return h('span', { class: 'todo-tag' }, 'Προς αποθήκευση');
    if (t.st === 'missed') return h('span', { class: 'miss-tag' }, '✗ Δεν έγινε');
    if (t.st === 'overdue') return h('span', { class: 'late-tag' }, `⏳ ${PlanCalc.gap(t.d, asOf)}`);
    return null;
  };
  const taskRow = (t, sub) => h('li', { class: 'task st-' + t.st },
    h('span', { class: 'task-text' }, t.u.label, h('small', {}, ' · ' + (sub || freqText(t.u.rule)))),
    tag(t));
  const isToday = date === today;
  const planCard = h('div', { class: 'box' },
    h('h2', {}, `Προτεινόμενα για ${isToday ? 'σήμερα' : fmtDate(date)}`),
    todayTasks.length
      ? h('ul', { class: 'tasks' }, todayTasks.map((t) => taskRow(t)))
      : h('p', { class: 'hint' }, 'Δεν υπάρχει προτεινόμενη εργασία για αυτή την ημέρα.'),
    overdue.length ? [
      h('h3', { class: 'late-h' }, `⚠️ Σε καθυστέρηση (${overdue.length})`),
      h('p', { class: 'hint' }, 'Να γίνουν το συντομότερο. Μένουν εδώ μέχρι να γίνουν· αν φτάσει η επόμενη ημέρα του προγράμματος, γράφονται «δεν έγινε».'),
      h('ul', { class: 'tasks' }, overdue.map((t) => taskRow(t, 'από ' + PlanCalc.dayLabel(t.d))))] : null);

  // Καταχωρήσεις της ημέρας. Διαγραφή μόνο αυθημερόν (για λάθη).
  const dayEntries = all.filter((e) => e.d === date && e.t === type).sort((x, y) => String(x.at).localeCompare(String(y.at)));
  const entriesCard = h('div', { class: 'box' },
    h('h2', {}, `Καταχωρήσεις ${isToday ? 'σήμερα' : fmtDate(date)}`),
    dayEntries.length
      ? h('ul', { class: 'entries' }, dayEntries.map((e) => entryRow(sk, e, e.at && bizISO(new Date(e.at)) === today)))
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
  const at = e.at ? new Date(e.at) : null;
  const time = at ? at.toTimeString().slice(0, 5) : '';
  // Καταχώρηση που έγινε άλλη ημέρα (π.χ. σήμερα για χθες): φαίνεται πότε καταχωρήθηκε.
  const later = at && bizISO(at) > e.d ? `καταχωρήθηκε ${fmtDate(localISO(at)).slice(0, 5)} ${time}` : '';
  return h('li', { class: e.skip ? 'skip' : '' },
    h('span', {},
      showDate ? h('b', {}, fmtDate(e.d) + ' ') : null,
      showDate ? h('small', {}, LOG_TYPES[e.t] + ' · ') : null,
      entryLabel(e),
      e.skip ? h('b', { class: 'skip-txt' }, ` – Δεν έγινε: ${PlanCalc.WHY[e.skip] || ''}${e.note ? ' (' + e.note + ')' : ''}`) : null,
      h('small', {}, ` · ${e.by || '—'}${later ? ' · ' + later : time ? ' · ' + time : ''}`)),
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

// extra: { skip, note } για «Δεν έγινε» με αιτία.
function addDraft(sk, type, eq, no, extra) {
  const date = f.date.value;
  const today = todayISO();
  if (!date) { toast('Συμπλήρωσε την ημερομηνία.'); f.date.focus(); return; }
  if (date > today) { toast('Δεν γίνεται καταχώρηση για μελλοντική ημερομηνία.'); return; }
  if (date < addDays(today, -1)) { toast('Η καταχώρηση γίνεται μόνο για σήμερα ή για χθες. Άλλαξε την ημερομηνία πάνω.', 5000); return; }
  if (getLog(sk).some((e) => sameUnit(e, type, eq.id, no, date))) { toast('Έχει ήδη αποθηκευτεί για αυτή την ημέρα.'); return; }
  if (inDraft(sk, type, eq.id, no, date)) { toast('Είναι ήδη στη λίστα «Προς αποθήκευση».'); return; }
  const item = Object.assign({ t: type, eq: eq.id, no, d: date }, extra && extra.skip ? { skip: extra.skip, note: extra.note || '' } : {});
  if (item.skip && !skipFits(sk, item)) {
    toast('Δεν υπάρχει εργασία του προγράμματος για αυτόν τον εξοπλισμό σήμερα ή σε καθυστέρηση. Δεν χρειάζεται δήλωση.', 6000);
    return;
  }
  setDraft(sk, [...getDraft(sk), item]);
  state.logSel = null;
  if (item.skip) state.logSkip = null;
  renderLog();
  renderLogNotice();
}

// Το «Δεν έγινε» δηλώνεται μόνο για εργασία του προγράμματος (σημερινή, σε καθυστέρηση ή της ίδιας εβδομάδας).
function skipFits(sk, item) {
  const src = deviceSrc(sk);
  const ym = ymOf(item.d);
  const test = Object.assign({}, src, { entries: [...src.entries, ...getDraft(sk), Object.assign({ at: '~' }, item)] });
  return taskStates(test, ym, item.t, asOfFor(ym))
    .some((t) => t.st === 'skip' && t.on === item.d && t.u.eq.id === item.eq && t.u.no === item.no);
}

function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return localISO(new Date(y, m - 1, d + n));
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
    if (x.skip) Object.assign(entry, { skip: x.skip, note: x.note || '' });
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
  const asOf = asOfFor(ym);
  const me = f.name.value.trim();
  const setup = getEquip(sk);
  const all = getLog(sk);
  const tasks = setup ? taskStates(deviceSrc(sk), ym, '', asOf) : [];
  const lines = [`🧽 ΚΑΘΑΡΙΟΤΗΤΕΣ / ΑΠΟΨΥΞΕΙΣ – ${storeLabel()}`, `📅 ${fmtDate(date)} · 👤 ${me || '-'}`];
  const dayEntries = all.filter((e) => e.d === date).sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const done = dayEntries.filter((e) => !e.skip);
  const skipped = dayEntries.filter((e) => e.skip);
  // Αν η καταχώρηση κάλυψε εργασία προηγούμενης ημέρας, γράφεται ότι έγινε με καθυστέρηση.
  const lateOf = (e) => tasks.find((t) => t.st === 'late' && t.on === e.d && t.type === e.t && t.u.eq.id === e.eq && t.u.no === (e.no || 0));
  lines.push('', '✓ Έγιναν:');
  if (done.length) {
    done.forEach((e) => {
      const lt = lateOf(e);
      lines.push(`• ${entryLabel(e)} – ${LOG_TYPES[e.t]}${lt ? ` (με καθυστέρηση· ήταν για ${PlanCalc.dayLabel(lt.d)})` : ''}${e.by && e.by !== me ? ` (${e.by})` : ''}`);
    });
  } else lines.push('• Καμία καταχώρηση');
  if (skipped.length) {
    lines.push('', '⊘ Δεν έγιναν, με αιτία:',
      ...skipped.map((e) => `• ${entryLabel(e)} – ${LOG_TYPES[e.t]}: ${PlanCalc.WHY[e.skip] || ''}${e.note ? ' – ' + e.note : ''}`));
  }
  if (setup) {
    const left = tasks.filter((t) => t.day === day && !['ok', 'late', 'skip', 'todo'].includes(t.st));
    const late = tasks.filter((t) => t.st === 'overdue' && t.day !== day);
    if (left.length) lines.push('', '⏳ Προτεινόμενα που δεν έγιναν:', ...left.map((t) => `• ${t.u.label} – ${LOG_TYPES[t.type]}`));
    if (late.length) {
      lines.push('', '⚠️ Σε καθυστέρηση:',
        ...late.map((t) => `• ${t.u.label} – ${LOG_TYPES[t.type]} (από ${PlanCalc.dayLabel(t.d)}, ${PlanCalc.gap(t.d, asOf)})`));
    }
    if (!left.length && !late.length) lines.push('', 'Όλα τα προτεινόμενα της ημέρας έγιναν ✅');
  }
  return lines.join('\n');
}

// Ένδειξη κάτω από το «Αποθήκευση στο αρχείο».
function saveStatus(sk) {
  if (shared() && sync.version !== null && sync.version < SKIP_VERSION && pendingOf(sk).some((o) => o.op === 'add' && o.e && o.e.skip)) {
    return ['warn', '⚠️ Το «Δεν έγινε» δεν στάλθηκε: χρειάζεται ενημέρωση του Google Script (οδηγίες στο README).'];
  }
  const pendAdd = shared() && pendingOf(sk).some((o) => o.op === 'add');
  if (state.logSaving || (pendAdd && sync.busy[sk])) return ['wait', '⏳ Αποστολή…'];
  if (pendAdd) return ['wait', '⏳ Δεν έγινε ακόμα αποστολή – θα σταλεί μόλις υπάρξει σύνδεση.'];
  const n = getDraft(sk).length;
  if (n) return ['warn', `⚠️ ${n === 1 ? '1 τικ δεν έχει' : n + ' τικ δεν έχουν'} αποθηκευτεί ακόμα.`];
  const at = lsGet(LOG_LS.saved + sk, '');
  if (at && bizISO(new Date(at)) === todayISO()) {
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
  if (state.logMode === 'plan') state.planEdit = initPlanEdit(sk, plannerMonth());
  renderLog();
  scrollToLog();
}

// Ο μήνας της ημερομηνίας πάνω, αλλά όχι παλαιότερος από τον τρέχοντα (οι περασμένοι μήνες δεν αλλάζουν).
function plannerMonth() {
  const now = ymOf(todayISO());
  const sel = ymOf(f.date.value || todayISO());
  return sel < now ? now : sel;
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
    state.planEdit = initPlanEdit(sk, plannerMonth());
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
  const saved = getPlans(sk)[ym];
  const plan = {};
  PlanCalc.TYPES.forEach((type) => {
    plan[type] = PlanCalc.days(eqList(), ym, type, setup.counts, getPlans(sk));
  });
  const first = logUnits(setup.counts, 'clean')[0];
  return { sk, ym, plan, type: 'clean', key: first ? first.key : '', dirty: false, own: !!(saved && !saved.auto), problems: [] };
}

// Από ποια ημέρα του μήνα αλλάζει το πρόγραμμα: σήμερα για τον τρέχοντα μήνα, όλες για τους επόμενους.
function planFrom(ym) {
  const today = todayISO();
  if (ym > ymOf(today)) return 1;
  if (ym < ymOf(today)) return monthInfo(ym).dim + 1;
  return Number(today.slice(8));
}

// Πόσες φορές χρειάζονται σε μια εβδομάδα/μήνα από την ημέρα που μετράει η μονάδα (start).
// Εβδομάδα που ξεκίνησε πριν από τη μονάδα δεν μετράει· ο μήνας μετράει αναλογικά.
function planNeed(rule, a, b, start) {
  if (start <= a) return rule.min;
  if (rule.per !== 'month' || start > b) return 0;
  return Math.round((rule.min * (b - start + 1)) / (b - a + 1));
}

// Ανά εβδομάδα/μήνα: ημέρες του προγράμματος και πόσες χρειάζονται. past = έχει περάσει (δεν ελέγχεται).
function planWindows(u, days, ym, start) {
  const mi = monthInfo(ym);
  const from = planFrom(ym);
  return PlanCalc.windows(u.rule, mi.dim).map(([a, b]) => {
    const n = days.filter((d) => d >= a && d <= b && d >= start).length;
    const req = planNeed(u.rule, a, b, start);
    return { a, b, n, req, ok: n >= req, past: b < from };
  });
}

// Συμπλήρωση ημερών από την ημέρα from και μετά, ώστε κάθε εβδομάδα/μήνας να έχει όσες χρειάζονται.
// keep: ημέρες που μένουν. prefer: ημέρες της αυτόματης πρότασης. load: εργασίες ανά ημέρα (για να μοιράζονται).
function topUpDays(u, ym, keep, from, start, prefer, load) {
  const mi = monthInfo(ym);
  const out = new Set(keep);
  PlanCalc.windows(u.rule, mi.dim).forEach(([a, b]) => {
    const miss = planNeed(u.rule, a, b, start) - [...out].filter((d) => d >= a && d <= b && d >= start).length;
    if (miss <= 0) return;
    const free = [];
    for (let d = Math.max(a, from, start); d <= b; d++) if (!out.has(d)) free.push(d);
    free.sort((x, y) => (prefer.includes(y) - prefer.includes(x)) || ((load[x] || 0) - (load[y] || 0)) || (x - y));
    free.slice(0, miss).forEach((d) => out.add(d));
  });
  return [...out].sort((x, y) => x - y);
}

function planProblems(ed, setup) {
  const out = [];
  PlanCalc.TYPES.forEach((type) => {
    logUnits(setup.counts, type).forEach((u) => {
      const start = PlanCalc.startDay(setup, u, ed.ym);
      planWindows(u, ed.plan[type][u.key] || [], ed.ym, start).filter((w) => !w.past && !w.ok).forEach((w) => {
        out.push(`${LOG_TYPES[type]} · ${u.label} – ${u.rule.per === 'month' ? 'μήνας' : `εβδομάδα ${w.a}–${w.b}`}: ${w.n} από ${w.req}`);
      });
    });
  });
  return out;
}

function planEditor(sk, setup) {
  const ed = state.planEdit;
  const mi = monthInfo(ed.ym);
  const from = planFrom(ed.ym);
  const asOf = asOfFor(ed.ym);
  const units = logUnits(setup.counts, ed.type);
  if (!units.some((u) => u.key === ed.key)) ed.key = units[0] ? units[0].key : '';
  const u = units.find((x) => x.key === ed.key);
  const days = u ? ed.plan[ed.type][u.key] || [] : [];
  const start = u ? PlanCalc.startDay(setup, u, ed.ym) : 1;
  const rerender = () => renderLog();

  // Κατάσταση των εργασιών με το πρόγραμμα όπως είναι τώρα στην οθόνη.
  const statesOf = (type) => PlanCalc.states(eqList(), setup, ed.ym, type, getLog(sk), { [ed.ym]: ed.plan }, asOf);
  const done = (t) => t.st === 'ok' || t.st === 'late' || t.st === 'skip';
  // Ημέρες που δεν αλλάζουν: πριν από σήμερα και όσες η εργασία έχει ήδη καταχωρηθεί.
  const lockedOf = (type, sts, key) => (ed.plan[type][key] || [])
    .filter((d) => d < from || sts.some((t) => t.u.key === key && t.day === d && done(t)));
  const sts = statesOf(ed.type);
  const unitOk = (x) => planWindows(x, ed.plan[ed.type][x.key] || [], ed.ym, PlanCalc.startDay(setup, x, ed.ym)).every((w) => w.past || w.ok);

  const now = ymOf(todayISO());
  const months = [now, addMonths(now, 1), addMonths(now, 2)];
  if (!months.includes(ed.ym)) months.push(ed.ym);
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

  const changed = () => {
    ed.dirty = true;
    ed.problems = [];
    rerender();
  };

  const locked = u ? lockedOf(ed.type, sts, u.key) : [];
  const toggle = (d) => {
    if (d < from) { toast('Οι ημέρες πριν από σήμερα δεν αλλάζουν.'); return; }
    if (locked.includes(d)) { toast('Η εργασία αυτής της ημέρας έχει ήδη καταχωρηθεί και δεν αλλάζει.'); return; }
    const list = ed.plan[ed.type][u.key] || [];
    const i = list.indexOf(d);
    if (i >= 0) list.splice(i, 1); else list.push(d);
    list.sort((a, b) => a - b);
    ed.plan[ed.type][u.key] = list;
    changed();
  };

  // Πόσες εργασίες έχει κάθε ημέρα (όλος ο εξοπλισμός του είδους), για να μοιράζονται σωστά.
  const loadOf = (type, skip) => {
    const load = {};
    Object.entries(ed.plan[type]).forEach(([key, list]) => {
      if (key !== skip) list.forEach((d) => { load[d] = (load[d] || 0) + 1; });
    });
    return load;
  };
  const load = loadOf(ed.type, '');
  const cells = ['Δευ', 'Τρι', 'Τετ', 'Πεμ', 'Παρ', 'Σαβ', 'Κυρ'].map((d) => h('div', { class: 'cal-h' }, d));
  for (let i = 0; i < (mi.dow(1) + 6) % 7; i++) cells.push(h('div', {}));
  for (let d = 1; d <= mi.dim; d++) {
    const on = days.includes(d);
    const t = sts.find((x) => x.u.key === ed.key && x.day === d);
    const fixed = d < from || locked.includes(d);
    let cls = 'cal-day plan-day' + (on ? ' on' : '') + (mi.dow(d) === 0 || mi.dow(d) === 6 ? ' we' : '');
    let sub = null;
    if (fixed) {
      cls += ' fixed' + (t ? ' st-' + t.st : '');
      if (t && ST_MARK[t.st]) sub = h('span', { class: 'cal-c st' }, ST_MARK[t.st]);
    } else if (load[d]) {
      sub = h('span', { class: 'cal-c' }, h('b', {}, load[d]), ' ', h('span', { class: 'w' }, load[d] === 1 ? 'εργασία' : 'εργασίες'));
    }
    cells.push(h('button', {
      type: 'button',
      class: cls,
      'aria-pressed': String(on),
      'aria-disabled': fixed ? 'true' : null,
      onclick: () => toggle(d),
    }, h('span', { class: 'cal-n' }, d), sub));
  }

  const wins = u ? planWindows(u, days, ed.ym, start) : [];
  const status = u ? h('div', { class: 'plan-status' }, wins.map((w) => {
    const label = u.rule.per === 'month' ? 'Μήνας' : `${w.a}–${w.b}`;
    if (w.past) return h('span', { class: 'past' }, `${label}: πέρασε`);
    if (!w.req) return h('span', { class: 'past' }, `${label}: δεν μετράει`);
    return h('span', { class: w.ok ? 'ok' : 'bad' }, `${label}: ${w.n}/${w.req} ${w.ok ? '✓' : '✗'}`);
  })) : null;

  // Η αυτόματη πρόταση της εφαρμογής, από σήμερα και μετά, για τον εξοπλισμό που φαίνεται.
  const autoUnit = () => {
    const auto = PlanCalc.auto(eqList(), ed.ym, ed.type, setup.counts)[u.key] || [];
    ed.plan[ed.type][u.key] = topUpDays(u, ed.ym, locked, from, start, auto, loadOf(ed.type, u.key));
    changed();
  };

  // Άδειο πρόγραμμα από σήμερα και μετά (και τα δύο είδη, όλος ο εξοπλισμός).
  const clearAll = () => {
    const when = from > 1 ? `από σήμερα (${fmtDate(todayISO())}) έως το τέλος του μήνα` : `του ${monthLabel(ed.ym)}`;
    if (!confirm(`Να αφαιρεθούν όλες οι εργασίες ${when}, για όλο τον εξοπλισμό (γενική καθαριότητα και αποψύξεις);\n\nΟι προηγούμενες ημέρες και ό,τι έχει ήδη γίνει μένουν όπως είναι.\nΔεν αποθηκεύεται τίποτα μέχρι να πατήσεις «Αποθήκευση προγράμματος».`)) return;
    PlanCalc.TYPES.forEach((type) => {
      const s = statesOf(type);
      Object.keys(ed.plan[type]).forEach((key) => { ed.plan[type][key] = lockedOf(type, s, key); });
    });
    changed();
    toast(from > 1 ? 'Αφαιρέθηκαν οι εργασίες από σήμερα και μετά. Πάτα τις ημέρες που θέλεις.' : 'Αφαιρέθηκαν όλες οι εργασίες του μήνα. Πάτα τις ημέρες που θέλεις.', 5000);
  };

  // Ίδιες ημέρες της εβδομάδας (εβδομαδιαίες) ή ίδιες ημερομηνίες (μηνιαίες) με τον προηγούμενο μήνα.
  const copyPrev = () => {
    const prevYm = addMonths(ed.ym, -1);
    const pmi = monthInfo(prevYm);
    const prev = getPlans(sk)[prevYm];
    const own = prev && !prev.auto;
    if (!confirm(`Να αντιγραφεί το πρόγραμμα του ${monthLabel(prevYm)}${own ? '' : ' (αυτόματη πρόταση της εφαρμογής)'};\n\nΑντικαθιστά τις ημέρες ${from > 1 ? 'από σήμερα και μετά' : 'όλου του μήνα'}.`)) return;
    PlanCalc.TYPES.forEach((type) => {
      const s = statesOf(type);
      const prevDays = PlanCalc.days(eqList(), prevYm, type, setup.counts, getPlans(sk));
      logUnits(setup.counts, type).forEach((x) => {
        const pd = prevDays[x.key] || [];
        let nd;
        if (x.rule.per === 'month') nd = pd.map((d) => Math.min(d, mi.dim));
        else {
          const wds = new Set(pd.map((d) => pmi.dow(d)));
          nd = [];
          for (let d = 1; d <= mi.dim; d++) if (wds.has(mi.dow(d))) nd.push(d);
        }
        const keep = lockedOf(type, s, x.key);
        ed.plan[type][x.key] = [...new Set([...keep, ...nd.filter((d) => d >= from)])].sort((a, b) => a - b);
      });
    });
    changed();
  };

  const save = async (btn) => {
    const problems = planProblems(ed, setup);
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
    ed.own = true;
    toast(`✓ Το πρόγραμμα του ${monthLabel(ed.ym)} αποθηκεύτηκε. Το βλέπουν όλα τα κινητά του καταστήματος.`, 6000);
    rerender();
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
      h('p', { class: 'hint' }, ed.own ? 'Υπάρχει αποθηκευμένο πρόγραμμα του υπευθύνου για αυτόν τον μήνα.' : 'Φαίνεται η αυτόματη πρόταση της εφαρμογής. Άλλαξέ τη όπως θέλεις και πάτα «Αποθήκευση προγράμματος».')),
    typeSeg,
    units.length ? h('div', { class: 'box' },
      h('label', { class: 'field' }, '1. Διάλεξε εξοπλισμό / χώρο', selUnit),
      h('p', { class: 'plan-rule' }, `${LOG_TYPES[ed.type]} · ${freqText(u.rule)}`),
      status,
      h('p', { class: 'hint' }, from > 1
        ? '2. Πάτα τις ημέρες που θα γίνει. Ξαναπάτα για να τη βγάλεις. Οι ημέρες πριν από σήμερα και όσες έχουν ήδη γίνει δεν αλλάζουν.'
        : '2. Πάτα τις ημέρες που θα γίνει. Ξαναπάτα για να τη βγάλεις.'),
      h('div', { class: 'cal-grid' }, cells),
      from > 1 ? h('p', { class: 'hint plan-legend' }, '✓ έγινε · ⚠️ με καθυστέρηση · ⏳ σε καθυστέρηση · ✗ δεν έγινε · ⊘ με αιτία') : null,
      h('button', { type: 'button', class: 'btn auto', onclick: autoUnit }, `⚡ Αυτόματη κατανομή – ${u.label}`),
      h('button', { type: 'button', class: 'btn danger', onclick: clearAll }, 'Αφαίρεση όλων των εργασιών του μήνα'),
      h('p', { class: 'hint' }, from > 1
        ? 'Η κατανομή αφορά τον εξοπλισμό που φαίνεται· η αφαίρεση όλο τον εξοπλισμό. Και τα δύο αλλάζουν μόνο από σήμερα και μετά.'
        : 'Η κατανομή αφορά τον εξοπλισμό που φαίνεται· η αφαίρεση όλο τον εξοπλισμό.'))
      : h('p', { class: 'hint' }, 'Δεν υπάρχει εξοπλισμός για αυτό το είδος.'),
    ed.problems.length ? h('div', { class: 'log-alert' },
      h('div', { class: 'log-alert-title' }, 'Δεν αποθηκεύτηκε: λείπουν ημέρες'),
      h('ul', {}, ed.problems.map((p) => h('li', {}, p)))) : null,
    h('section', { class: 'actions' },
      h('button', { type: 'button', class: 'btn dark', onclick: (e) => save(e.currentTarget) }, 'Αποθήκευση προγράμματος'),
      h('button', { type: 'button', class: 'btn', onclick: copyPrev }, 'Αντιγραφή από τον προηγούμενο μήνα'),
      h('button', { type: 'button', class: 'btn ghost', onclick: back }, 'Πίσω')));
}

/* ---- Ημερολόγιο μήνα ---- */

function calendarEl(sk, setup, type) {
  const ym = state.logCalMonth || ymOf(f.date.value || todayISO());
  const mi = monthInfo(ym);
  const today = todayISO();
  const asOf = asOfFor(ym);
  const plans = getPlans(sk);
  const own = !!(plans[ym] && !plans[ym].auto);
  const tasks = taskStates(deviceSrc(sk), ym, type, asOf);
  const byDay = {};
  tasks.forEach((t) => { (byDay[t.day] = byDay[t.day] || []).push(t); });
  let sel = state.logCalDay;
  if (!sel || sel > mi.dim) sel = ym === ymOf(f.date.value || today) ? Number((f.date.value || today).slice(8)) : 1;
  const done = (t) => t.st === 'ok' || t.st === 'late' || t.st === 'skip';

  const cells = ['Δευ', 'Τρι', 'Τετ', 'Πεμ', 'Παρ', 'Σαβ', 'Κυρ'].map((d) => h('div', { class: 'cal-h' }, d));
  for (let i = 0; i < (mi.dow(1) + 6) % 7; i++) cells.push(h('div', {}));
  for (let d = 1; d <= mi.dim; d++) {
    const ts = byDay[d] || [];
    let cls = 'cal-day';
    if (mi.dow(d) === 0 || mi.dow(d) === 6) cls += ' we';
    if (ts.some((t) => t.st === 'missed')) cls += ' missed';
    else if (ts.some((t) => t.st === 'late' || t.st === 'overdue')) cls += ' late';
    else if (ts.length && ts.every((t) => t.st === 'ok' || t.st === 'skip')) cls += ' all-done';
    if (mi.iso(d) === today) cls += ' today';
    if (d === sel) cls += ' sel';
    cells.push(h('button', {
      type: 'button',
      class: cls,
      onclick: () => { state.logCalMonth = ym; state.logCalDay = d; state.logCalOpen = true; renderLog(); },
    }, h('span', { class: 'cal-n' }, d), ts.length ? h('span', { class: 'cal-c' }, `${ts.filter(done).length}/${ts.length}`) : null));
  }

  const selTasks = byDay[sel] || [];
  const units = logUnits(setup.counts, type);
  const days = PlanCalc.days(eqList(), ym, type, setup.counts, plans);
  const nav = (n) => { state.logCalMonth = addMonths(ym, n); state.logCalDay = null; state.logCalOpen = true; renderLog(); };
  const tagOf = (t) => {
    if (t.st === 'ok') return h('span', { class: 'done-tag' }, t.on === t.d ? '✓ Έγινε' : `✓ Έγινε ${PlanCalc.dayLabel(t.on)}`);
    if (t.st === 'late') return h('span', { class: 'late-tag' }, `⚠️ ${PlanCalc.text(t, asOf)}`);
    if (t.st === 'skip') return h('span', { class: 'skip-tag' }, `⊘ ${PlanCalc.WHY[t.why] || 'Δεν έγινε'}`);
    if (t.st === 'missed') return h('span', { class: 'miss-tag' }, '✗ Δεν έγινε');
    if (t.st === 'overdue') return h('span', { class: 'late-tag' }, '⏳ Σε καθυστέρηση');
    return h('span', { class: 'todo-tag' }, '○');
  };

  const det = h('details', { class: 'box cal', open: !!state.logCalOpen },
    h('summary', {}, `Πρόγραμμα μήνα – ${LOG_TYPES[type]}`),
    h('div', { class: 'cal-nav' },
      h('button', { type: 'button', 'aria-label': 'Προηγούμενος μήνας', onclick: () => nav(-1) }, '‹'),
      h('b', {}, monthLabel(ym)),
      h('button', { type: 'button', 'aria-label': 'Επόμενος μήνας', onclick: () => nav(1) }, '›')),
    h('div', { class: 'cal-grid' }, cells),
    h('p', { class: 'hint' }, 'Σε κάθε ημέρα: έγιναν / εργασίες. Πράσινο = έγιναν, κίτρινο = καθυστέρηση, κόκκινο = δεν έγιναν.'),
    h('h3', {}, `${DAYS_FULL[mi.dow(sel)]} ${fmtDate(mi.iso(sel))}`),
    selTasks.length
      ? h('ul', { class: 'tasks' }, selTasks.map((t) => h('li', { class: 'task st-' + t.st },
        h('span', { class: 'task-text' }, t.u.label), tagOf(t))))
      : h('p', { class: 'hint' }, 'Καμία προτεινόμενη εργασία.'),
    h('h3', {}, own ? 'Πρόγραμμα του υπευθύνου' : 'Πρόγραμμα της εφαρμογής'),
    units.length
      ? h('ul', { class: 'plan-list' }, units.map((u) => h('li', {}, h('b', {}, u.label), h('br'),
        h('small', {}, `${freqText(u.rule)} · ${(days[u.key] || []).map((d) => PlanCalc.dayLabel(mi.iso(d))).join(', ') || '—'}`))))
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
    const today = todayISO();
    const next = { counts, since: setup && setup.since ? setup.since : today, by: name, at: new Date().toISOString() };
    // Μονάδες που προστέθηκαν τώρα (π.χ. νέα κατάψυξη Νο 3): το πρόγραμμα και ο έλεγχος μετράνε από σήμερα.
    if (setup) {
      const added = {};
      all.forEach((eq) => {
        const before = countOf(setup.counts, eq);
        const nos = eq.numbered ? Array.from({ length: counts[eq.id] }, (_, i) => i + 1) : counts[eq.id] ? [0] : [];
        nos.forEach((no) => {
          const key = eq.id + '#' + no;
          if (eq.numbered ? no > before : !before) added[key] = today;
          else if (setup.added && setup.added[key]) added[key] = setup.added[key];
        });
      });
      if (Object.keys(added).length) next.added = added;
    }
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

// Όλα τα καταστήματα μαζί: πόσα έγιναν, πόσα με καθυστέρηση, πόσα δεν έγιναν.
function archiveAll(keys, ym, head) {
  const asOf = asOfFor(ym);
  const current = ym === ymOf(todayISO());
  const msgs = [];
  const open = (sk) => h('button', { type: 'button', class: 'linkbtn', onclick: () => { state.logArchiveStore = sk; renderLog(); } }, storeNameOf(sk));
  const rows = keys.map((sk) => {
    const src = archiveSrc(sk);
    const cd = checklistDays(src, ym);
    const first = h('td', {}, open(sk), h('br'), h('small', {}, `Checklists: Άν. ${cd.opening}/${cd.days} · Κλ. ${cd.closing}/${cd.days}`));
    if (!src.equip) return h('tr', {}, first, h('td', { colspan: 4, class: 'muted' }, 'Δεν έχει δηλωθεί εξοπλισμός'));
    const tasks = taskStates(src, ym, '', asOf);
    const part = (type) => {
      const n = PlanCalc.tally(tasks.filter((t) => t.type === type));
      return n.req ? `${n.done}/${n.req}` : '—';
    };
    const n = PlanCalc.tally(tasks);
    const late = n.late + n.overdue;
    const issues = tasks.filter(isIssue);
    if (issues.length) msgs.push(noticeText(storeNameOf(sk), ym, issues, asOf));
    return h('tr', { class: n.missed ? 'bad' : late ? 'warn' : '' },
      first,
      h('td', { class: 'c' }, part('clean')),
      h('td', { class: 'c' }, part('defrost')),
      h('td', { class: 'c' }, late ? `⚠️ ${late}` : '–'),
      h('td', { class: 'c' }, n.missed ? `✗ ${n.missed}` : '✓', n.skip ? h('br') : null, n.skip ? h('small', {}, `⊘ ${n.skip}`) : null));
  });
  return h('div', { class: 'log' },
    head,
    h('div', { class: 'box' },
      h('h2', {}, `Σύνοψη – ${monthLabel(ym)}`),
      h('p', { class: 'hint' }, `Έγιναν / όσες έπρεπε${current ? ' μέχρι σήμερα' : ''}. ⚠️ = με καθυστέρηση ή σε καθυστέρηση. ✗ = δεν έγιναν. ⊘ = δεν έγιναν, με αιτία. Πάτα ένα κατάστημα για λεπτομέρειες.`),
      h('table', { class: 'sum-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Κατάστημα'), h('th', {}, 'Καθαρ.'), h('th', {}, 'Αποψ.'), h('th', {}, 'Καθυστ.'), h('th', {}, 'Δεν έγιναν'))),
        h('tbody', {}, rows))),
    h('section', { class: 'actions' },
      msgs.length ? h('button', { type: 'button', class: 'btn viber', onclick: () => shareText(msgs.join('\n\n')) }, 'Αποστολή ελλείψεων στο Viber') : null,
      h('button', { type: 'button', class: 'btn ghost', onclick: lockArchive }, 'Κλείδωμα και επιστροφή')));
}

// Ένα κατάστημα: κατάσταση ανά εξοπλισμό, καταχωρήσεις, Excel. head = επιλογές του κοινού αρχείου.
function archiveView(sk, src, head) {
  const today = todayISO();
  const ym = head ? state.archive.month : state.logArchiveMonth || ymOf(today);
  const current = ym === ymOf(today);
  const asOf = asOfFor(ym);
  const tasks = taskStates(src, ym, '', asOf);
  const entries = src.entries.filter((e) => ymOf(e.d) === ym)
    .sort((a, b) => (b.d + b.at).localeCompare(a.d + a.at));
  const issues = tasks.filter(isIssue);

  const setup = src.equip || { counts: {} };
  // Σύντομη σημείωση για κάθε εργασία που δεν έγινε όπως ορίζει το πρόγραμμα.
  const note = (t) => {
    const d = PlanCalc.dayLabel(t.d);
    if (t.st === 'late') return `⚠️ ${d} → ${PlanCalc.dayLabel(t.on)}`;
    if (t.st === 'overdue') return `⏳ ${d}`;
    if (t.st === 'skip') return `⊘ ${d} ${PlanCalc.WHY[t.why] || ''}${t.note ? ': ' + t.note : ''}`;
    return `✗ ${d}`;
  };
  const table = (type) => {
    // Όλες οι μονάδες του καταστήματος, ακόμα κι αν δεν έχουν ακόμα εργασίες.
    const list = logUnits(setup.counts, type).map((u) => {
      const ts = tasks.filter((t) => t.type === type && t.u.key === u.key);
      return { u, ts, n: PlanCalc.tally(ts) };
    });
    if (!list.length) return h('p', { class: 'hint' }, 'Δεν υπάρχει εξοπλισμός για αυτό το είδος.');
    return h('table', { class: 'sum-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Εξοπλισμός / χώρος'), h('th', {}, 'Έγιναν'), h('th', {}, 'Κατάσταση'))),
      h('tbody', {}, list.map((s) => {
        const bad = s.ts.filter(isIssue);
        return h('tr', { class: s.n.missed ? 'bad' : s.n.late || s.n.overdue ? 'warn' : '' },
          h('td', {}, s.u.label, h('br'), h('small', {}, freqText(s.u.rule))),
          h('td', { class: 'c' }, s.n.req ? `${s.n.done}/${s.n.req}` : '—'),
          h('td', {}, bad.length
            ? bad.map((t, i) => [i ? h('br') : null, note(t)])
            : s.n.req ? '✓' : s.n.todo ? '⏳ προγραμματισμένη' : '—'));
      })));
  };

  return h('div', { class: 'log' },
    head || h('div', { class: 'box' },
      h('h2', {}, `🔒 Αρχείο – ${storeNameOf(sk)}`),
      h('label', { class: 'field' }, 'Μήνας',
        h('select', { value: ym, onchange: (e) => { state.logArchiveMonth = e.target.value; renderLog(); } }, monthOptions(ym)))),
    h('div', { class: 'box' },
      head ? h('h2', {}, storeNameOf(sk)) : null,
      src.equip
        ? h('p', { class: 'hint' }, `Έγιναν = στην ώρα τους ή με καθυστέρηση / όσες έπρεπε${current ? ' μέχρι σήμερα' : ''}. ⚠️ πρόγραμμα → έγινε · ⏳ σε καθυστέρηση · ✗ δεν έγινε · ⊘ δεν έγινε, με αιτία. Ο εξοπλισμός δηλώθηκε ${fmtDate(setup.since)}.`)
        : h('p', { class: 'hint' }, 'Δεν έχει δηλωθεί εξοπλισμός για αυτό το κατάστημα.')),
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
      issues.length ? h('button', { type: 'button', class: 'btn viber', onclick: () => shareText(noticeText(storeNameOf(sk), ym, issues, asOf)) }, 'Αποστολή όσων δεν έγιναν στο Viber') : null,
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
  const setup = Object.assign({}, src.equip || {}, { counts });
  const units = logUnits(counts, type);
  const tasks = PlanCalc.states(eqList(), setup, ym, type, src.entries, src.plans || {}, asOfFor(ym));
  const entries = src.entries.filter((e) => ymOf(e.d) === ym && e.t === type);
  const D = 3; // πρώτη στήλη ημερών (D)
  const last = D + mi.dim;
  const we = (d) => mi.dow(d) === 0 || mi.dow(d) === 6;
  const MARK = { ok: ['✓', XS.dDone], late: ['⚠', XS.dLate], skip: ['⊘', XS.dSkip], missed: ['✗', XS.dMiss], overdue: ['⏳', XS.dLate] };
  const SUMS = ['Πρόγραμμα', 'Στην ώρα τους', 'Με καθυστέρηση', 'Δεν έγιναν', 'Με αιτία', 'Εκκρεμούν'];
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
  SUMS.forEach((label, i) => { head.push([last + i, label, XS.head]); head2.push([last + i, '', XS.head]); });
  s.add(head);
  s.add(head2);
  const headRow = s.r;

  units.forEach((u) => {
    const ts = tasks.filter((t) => t.u.key === u.key);
    const byDay = {};
    ts.forEach((t) => { byDay[t.day] = t; });
    // Ημέρες που έγινε κάτι εκτός από την ημέρα του προγράμματος (νωρίτερα, αργότερα ή επιπλέον).
    const doneDays = new Set(entriesOf(entries, type, u).filter((e) => !e.skip).map((e) => Number(e.d.slice(8))));
    const n = PlanCalc.tally(ts);
    const cells = [[0, u.eq.name, XS.cell], [1, u.no || '', XS.center], [2, freqText(u.rule), XS.cell]];
    for (let d = 1; d <= mi.dim; d++) {
      const t = byDay[d];
      let cell = ['', we(d) ? XS.dWe : XS.dCell];
      if (t) cell = MARK[t.st] || ['', XS.dSug];
      else if (doneDays.has(d)) cell = ['•', XS.good];
      cells.push([D + d - 1, cell[0], cell[1]]);
    }
    const sums = [ts.length, n.ok, n.late, n.missed, n.skip, n.overdue + n.due + n.todo];
    const style = [XS.center, XS.good, n.late ? XS.dLate : XS.center, n.missed ? XS.bad : XS.center, XS.center, XS.center];
    sums.forEach((v, i) => cells.push([last + i, v, style[i]]));
    s.add(cells);
  });
  if (!units.length) s.add([[0, 'Δεν επιλέχθηκε εξοπλισμός.', 0]]);

  s.skip();
  s.add([[0, 'Υπόμνημα:', XS.label]]);
  s.add([[1, '', XS.dSug], [2, 'Ημέρα του προγράμματος', 0]]);
  s.add([[1, '✓', XS.dDone], [2, 'Έγινε στην ώρα της', 0]]);
  s.add([[1, '⚠', XS.dLate], [2, 'Έγινε με καθυστέρηση', 0]]);
  s.add([[1, '⏳', XS.dLate], [2, 'Σε καθυστέρηση (δεν έχει γίνει ακόμα)', 0]]);
  s.add([[1, '✗', XS.dMiss], [2, 'Δεν έγινε', 0]]);
  s.add([[1, '⊘', XS.dSkip], [2, 'Δεν έγινε, με αιτία (βλάβη, κλειστό κατάστημα, άλλο)', 0]]);
  s.add([[1, '•', XS.good], [2, 'Ημέρα που έγινε, όταν δεν ήταν η ημέρα του προγράμματος', 0]]);
  s.add([[1, '', XS.dWe], [2, 'Σάββατο / Κυριακή', 0]]);
  s.add([[0, 'Κάθε εργασία ελέγχεται με την ημέρα του προγράμματος. Αν καθυστερήσει, μένει ανοιχτή μέχρι την επόμενη ημέρα του προγράμματος για τον ίδιο εξοπλισμό.', 0]]);

  const cols = [`<col min="1" max="1" width="30" customWidth="1"/>`, `<col min="2" max="2" width="5" customWidth="1"/>`,
    `<col min="3" max="3" width="17" customWidth="1"/>`, `<col min="${D + 1}" max="${last}" width="3.6" customWidth="1"/>`,
    `<col min="${last + 1}" max="${last + SUMS.length}" width="13" customWidth="1"/>`];
  return sheetXml(s.rows, cols.join(''), `xSplit="3" ySplit="${headRow}" topLeftCell="D${headRow + 1}" activePane="bottomRight"`, 'landscape');
}

function logEntriesXml(src, sk, ym) {
  const entries = src.entries.filter((e) => ymOf(e.d) === ym)
    .sort((a, b) => (a.d + a.at).localeCompare(b.d + b.at));
  const s = sheetRows();
  s.add([[0, `Καταχωρήσεις καθαριοτήτων/αποψύξεων – ${storeNameOf(sk)} – ${monthLabel(ym)}`, XS.title]]);
  s.skip();
  s.add([[0, 'Ημερομηνία', XS.head], [1, 'Είδος', XS.head], [2, 'Εξοπλισμός / χώρος', XS.head], [3, 'Νο', XS.head],
    [4, 'Κατάσταση', XS.head], [5, 'Υπεύθυνος', XS.head], [6, 'Καταχωρήθηκε', XS.head]]);
  const headRow = s.r;
  entries.forEach((e) => {
    const eq = eqById(e.eq);
    const at = e.at ? new Date(e.at) : null;
    s.add([[0, fmtDate(e.d), XS.center], [1, LOG_TYPES[e.t] || '', XS.cell], [2, eq ? eq.name : '(διαγραμμένος εξοπλισμός)', XS.cell],
      [3, e.no || '', XS.center],
      [4, e.skip ? `Δεν έγινε – ${PlanCalc.WHY[e.skip] || ''}${e.note ? ': ' + e.note : ''}` : 'Έγινε', e.skip ? XS.imp : XS.cell],
      [5, e.by || '', XS.cell], [6, at ? `${fmtDate(localISO(at)).slice(0, 5)} ${at.toTimeString().slice(0, 5)}` : '', XS.center]]);
  });
  if (!entries.length) s.add([[0, 'Καμία καταχώρηση αυτόν τον μήνα.', 0]]);
  const cols = '<col min="1" max="1" width="12" customWidth="1"/><col min="2" max="2" width="20" customWidth="1"/>'
    + '<col min="3" max="3" width="34" customWidth="1"/><col min="4" max="4" width="5" customWidth="1"/>'
    + '<col min="5" max="5" width="34" customWidth="1"/><col min="6" max="6" width="26" customWidth="1"/>'
    + '<col min="7" max="7" width="14" customWidth="1"/>';
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

  // Report με email, μηνιαίο και εβδομαδιαίο (ρυθμίσεις στο Google Script, με τον κωδικό αρχείου).
  const repTo = h('input', { type: 'text', inputmode: 'email', autocomplete: 'off', placeholder: 'π.χ. onoma@gmail.com, allos@gmail.com' });
  const repPw = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Κωδικός αρχείου' });
  const repOut = h('pre', { class: 'hint result' });
  const report = async (payload) => {
    if (!repPw.value) { toast('Γράψε τον κωδικό αρχείου.'); repPw.focus(); return; }
    repOut.textContent = 'Περίμενε…';
    try {
      const r = await apiCall(Object.assign({ action: 'report', pw: repPw.value }, payload));
      const setup = 'Στο Apps Script τρέξε μία φορά τη συνάρτηση «setupMonthlyReport».';
      repOut.textContent = !('weekly' in r)
        ? 'Το Google Script είναι παλιά έκδοση. Επικόλλησε τον νέο κώδικα και κάνε «Νέα έκδοση» στην ανάπτυξη (οδηγίες στο README).'
        : [
          payload.send ? '✓ Το δοκιμαστικό μηνιαίο report στάλθηκε. Δες τα εισερχόμενα (και τα ανεπιθύμητα).'
            : payload.sendWeekly ? '✓ Το δοκιμαστικό εβδομαδιαίο report στάλθηκε. Δες τα εισερχόμενα (και τα ανεπιθύμητα).' : '✓ Αποθηκεύτηκε.',
          'Παραλήπτες: ' + String(r.to || '').split(',').join(', '),
          r.monthly ? 'Μηνιαία αποστολή: ενεργή ✓ (κάθε 1η του μήνα, 8:00)' : 'Μηνιαία αποστολή: δεν είναι ενεργή. ' + setup,
          r.weekly ? 'Εβδομαδιαία αποστολή: ενεργή ✓ (κάθε Δευτέρα, 8:00)' : 'Εβδομαδιαία αποστολή: δεν είναι ενεργή. ' + setup,
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
      h('h2', {}, 'Report με email'),
      h('p', { class: 'hint' }, 'Κάθε 1η του μήνα στις 8:00: σύνοψη όλων των καταστημάτων για τον προηγούμενο μήνα. Κάθε Δευτέρα στις 8:00: οι καθυστερήσεις και ό,τι δεν έγινε την εβδομάδα που πέρασε. Ενεργοποιούνται μία φορά από το Apps Script (οδηγίες στο README: «Report με email»).'),
      h('label', { class: 'field' }, 'Email παραληπτών (κενό = ο λογαριασμός Google σου)', repTo),
      h('label', { class: 'field' }, 'Κωδικός αρχείου', repPw),
      h('button', { type: 'button', class: 'btn', onclick: () => report({ emails: repTo.value.trim() }) }, 'Αποθήκευση παραληπτών'),
      h('button', { type: 'button', class: 'btn', onclick: () => report({ send: true }) }, 'Δοκιμαστικό μηνιαίο report'),
      h('button', { type: 'button', class: 'btn', onclick: () => report({ sendWeekly: true }) }, 'Δοκιμαστικό εβδομαδιαίο report'),
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
    h('p', { class: 'hint' }, 'Κενό στις «φορές» σημαίνει ότι δεν ισχύει για αυτό το είδος. Το «έως» είναι προαιρετικό (π.χ. 2–3 φορές)· το πρόγραμμα βάζει το ελάχιστο. «Αριθμημένο»: ο υπάλληλος διαλέγει Νο. Νέος εξοπλισμός μετράει από την ημέρα που προστέθηκε. Αν αυξήσεις μια συχνότητα, στον τρέχοντα μήνα προστίθενται ημέρες από σήμερα και μετά· οι προηγούμενες ημέρες δεν αλλάζουν.'),
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
      onclick: () => { eqs.push({ id: newId('eq'), name: '', clean: { min: 1, per: 'week' }, since: todayISO() }); markDirty(true); },
    }, '+ Προσθήκη εξοπλισμού/χώρου'),
    saveReminder());
}
