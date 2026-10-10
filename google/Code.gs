/**
 * Lartecono Stores Checklist – κοινό αρχείο καθαριοτήτων/αποψύξεων.
 *
 * Εγκατάσταση (μία φορά, από υπολογιστή):
 * 1. script.google.com → Νέο έργο
 *    (ή, από ένα Google Sheet: Επεκτάσεις → Apps Script).
 * 2. Σβήσε ό,τι υπάρχει, επικόλλησε αυτόν τον κώδικα και πάτα Αποθήκευση.
 * 3. Ανάπτυξη → Νέα ανάπτυξη → Τύπος: Εφαρμογή ιστού.
 *    Εκτέλεση ως: Εγώ · Ποιος έχει πρόσβαση: Οποιοσδήποτε → Ανάπτυξη.
 * 4. Αντέγραψε τη διεύθυνση (τελειώνει σε /exec) στην εφαρμογή:
 *    Διαχείριση → Καθαριότητες → Κοινό αρχείο.
 *
 * Report με email: στο Apps Script διάλεξε πάνω τη συνάρτηση «setupMonthlyReport»
 * και πάτα «Εκτέλεση» (μία φορά). Στέλνει αμέσως δύο δοκιμαστικά και μετά κάθε 1η του μήνα
 * στις 8:00 τη σύνοψη του προηγούμενου μήνα και κάθε Δευτέρα στις 8:00 τις καθυστερήσεις της
 * εβδομάδας που πέρασε. Μετά: Ανάπτυξη → Διαχείριση αναπτύξεων → μολύβι → Έκδοση: Νέα έκδοση → Ανάπτυξη.
 *
 * Τα φύλλα «Καταχωρήσεις», «Εξοπλισμός», «Checklists» (ανοίγματα/κλεισίματα) και «Πρόγραμμα»
 * δημιουργούνται μόνα τους. Αν ο κώδικας
 * μπήκε ως νέο έργο (όχι μέσα από Google Sheet), δημιουργείται και το ίδιο το Google Sheet
 * «Lartecono – Αρχείο καθαριοτήτων» στο Google Drive.
 * Μην αλλάζεις τις κρυφές στήλες (id, store, …): τις χρησιμοποιεί η εφαρμογή.
 */

const TZ = 'Europe/Athens';
const SH_ENTRIES = 'Καταχωρήσεις';
const SH_EQUIP = 'Εξοπλισμός';
const ENTRY_HEAD = ['Ημερομηνία', 'Κατάστημα', 'Είδος', 'Εξοπλισμός / χώρος', 'Νο', 'Υπεύθυνος', 'Καταχωρήθηκε',
  'id', 'store', 'type', 'eq', 'at', 'skip'];
const EQUIP_HEAD = ['Κατάστημα', 'Εξοπλισμός', 'Δηλώθηκε από', 'Ενημερώθηκε', 'store', 'setup'];
const SH_CHECK = 'Checklists';
const CHECK_HEAD = ['Ημερομηνία', 'Κατάστημα', 'Ενότητα', 'Υπεύθυνος', '✓', '✗', 'Χωρίς συμπλήρωση', 'Δεν έγιναν', 'Σημειώσεις', 'Στάλθηκε',
  'key', 'store', 'section', 'at'];
const SECTIONS = { opening: 'ΑΝΟΙΓΜΑ', closing: 'ΚΛΕΙΣΙΜΟ' };
const SH_PLAN = 'Πρόγραμμα';
const PLAN_HEAD = ['Κατάστημα', 'Μήνας', 'Αποθηκεύτηκε από', 'Ενημερώθηκε', 'store', 'month', 'plan'];
const VERSION = 4;
const TYPES = { clean: 'Γενική καθαριότητα', defrost: 'Απόψυξη' };
// Θέσεις στηλών (από 0) στο φύλλο «Καταχωρήσεις».
const C = { d: 0, no: 4, by: 5, id: 7, store: 8, type: 9, eq: 10, at: 11, skip: 12 };
const MAX_OPS = 500;
const BOOK_NAME = 'Lartecono – Αρχείο καθαριοτήτων';
// Η εφαρμογή: από εδώ διαβάζονται τα καταστήματα και οι συχνότητες (data.json).
const APP_URL = 'https://gmisokas.github.io/Stores-Checlist/';
const MONTHS = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος',
  'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'];
let BOOK = null;
const HEADS_OK = {};

/* ---------- Είσοδος ---------- */

function doGet(e) {
  return reply(run((e && e.parameter) || {}));
}

function doPost(e) {
  let p;
  try {
    p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (x) {
    return reply({ ok: false, error: 'bad-request' });
  }
  return reply(run(p));
}

function reply(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function run(p) {
  try {
    BOOK = book();
    switch (p.action) {
      case 'ping': return { ok: true, app: 'lartecono-log', version: VERSION, hasPassword: !!prop('PW_HASH'), sheetUrl: BOOK.getUrl() };
      case 'sync': return sync(p);
      case 'archive': checkPw(p.pw); return archive(p);
      case 'remove': checkPw(p.pw); locked(() => applyOps([{ op: 'del', id: p.id, force: true }])); return { ok: true };
      case 'setPassword': return setPassword(p);
      case 'report': checkPw(p.pw); return reportSettings(p);
      case 'checkPlanPw': checkStorePw(p.store, p.pw); return { ok: true };
      case 'savePlan': checkStorePw(p.store, p.pw); return savePlan(p);
      case 'setStorePw': checkPw(p.pw); return setStorePw(p);
      case 'storePws': checkPw(p.pw); return { ok: true, stores: storesWithPw() };
      default: return { ok: false, error: 'unknown-action' };
    }
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
}

/* ---------- Κωδικός αρχείου ---------- */

function prop(k) { return PropertiesService.getScriptProperties().getProperty(k); }

function hashPw(pw) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'lartecono-log:' + pw, Utilities.Charset.UTF_8);
  return bytes.map((b) => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

// Μετά από 10 λάθος προσπάθειες, κλείδωμα για 10 λεπτά.
function checkPw(pw) {
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('pw-fails') || 0);
  if (fails >= 10) throw new Error('locked');
  const saved = prop('PW_HASH');
  if (!saved) throw new Error('no-password');
  if (!pw || hashPw(String(pw)) !== saved) {
    cache.put('pw-fails', String(fails + 1), 600);
    throw new Error('password');
  }
}

// Κωδικός υπευθύνου καταστήματος (για το πρόγραμμα μήνα). Δέχεται και τον κωδικό αρχείου.
function checkStorePw(store, pw) {
  const sk = code(store);
  if (!sk) throw new Error('no-store');
  const own = prop('PW_STORE_' + sk);
  if (own && pw && hashPw(String(pw)) === own) return;
  checkPw(pw);
}

function setStorePw(p) {
  const sk = code(p.store);
  if (!sk) throw new Error('no-store');
  const pw = String(p.newPw || '');
  if (!pw) { PropertiesService.getScriptProperties().deleteProperty('PW_STORE_' + sk); return { ok: true }; }
  if (pw.length < 4) throw new Error('short');
  PropertiesService.getScriptProperties().setProperty('PW_STORE_' + sk, hashPw(pw));
  return { ok: true };
}

function storesWithPw() {
  return Object.keys(PropertiesService.getScriptProperties().getProperties())
    .filter((k) => k.indexOf('PW_STORE_') === 0).map((k) => k.slice(9));
}

function setPassword(p) {
  const pw = String(p.pw || '');
  if (pw.length < 4) throw new Error('short');
  if (prop('PW_HASH')) checkPw(p.old);
  PropertiesService.getScriptProperties().setProperty('PW_HASH', hashPw(pw));
  return { ok: true };
}

/* ---------- Φύλλα ---------- */

function locked(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try { return fn(); } finally { lock.releaseLock(); }
}

// Το Google Sheet του αρχείου: αυτό στο οποίο είναι «δεμένος» ο κώδικας ή, για ξεχωριστό
// έργο, ένα που δημιουργείται την πρώτη φορά και θυμόμαστε το id του.
function book() {
  if (BOOK) return BOOK;
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  const id = prop('SHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  return locked(() => {
    const again = prop('SHEET_ID');
    if (again) return SpreadsheetApp.openById(again);
    const ss = SpreadsheetApp.create(BOOK_NAME);
    PropertiesService.getScriptProperties().setProperty('SHEET_ID', ss.getId());
    return ss;
  });
}

function sheet(name, head, hideFrom) {
  const ss = book();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    // Απλό κείμενο, ώστε οι ημερομηνίες να μένουν όπως γράφτηκαν.
    sh.getRange(1, 1, sh.getMaxRows(), head.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.hideColumns(hideFrom, head.length - hideFrom + 1);
  } else if (!HEADS_OK[name]) {
    // Φύλλο από παλαιότερη έκδοση: προστίθενται οι νέες (κρυφές) στήλες στο τέλος.
    const have = sh.getLastColumn();
    if (have >= hideFrom && have < head.length) {
      sh.getRange(1, have + 1, 1, head.length - have).setValues([head.slice(have)]).setFontWeight('bold');
      sh.hideColumns(have + 1, head.length - have);
    }
    HEADS_OK[name] = true;
  }
  return sh;
}

function values(sh) {
  return sh.getLastRow() < 2 ? [] : sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
}

function writeRows(sh, row, rows, width) {
  const need = row + rows.length - 1 - sh.getMaxRows();
  if (need > 0) sh.insertRowsAfter(sh.getMaxRows(), need + 100);
  sh.getRange(row, 1, rows.length, width).setNumberFormat('@').setValues(rows);
}

function txt(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  return v == null ? '' : String(v);
}

// Κείμενο χωρίς σύμβολα που το Sheets θα διάβαζε σαν τύπο.
function clean(v, n) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().replace(/^[=+\-@]+/, '').slice(0, n || 80);
}

function code(v) {
  const s = String(v == null ? '' : v);
  return /^[\w-]{1,60}$/.test(s) ? s : '';
}

function isDay(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s)); }

// Η ημέρα του καταστήματος αλλάζει στις 05:00 (όπως στην εφαρμογή): ό,τι γίνεται μετά τα μεσάνυχτα
// μετράει για την προηγούμενη ημέρα.
function bizDay(date) {
  const day = Utilities.formatDate(date, TZ, 'yyyy-MM-dd');
  return Number(Utilities.formatDate(date, TZ, 'HH')) < 5 ? addDaysIso(day, -1) : day;
}

function today() { return bizDay(new Date()); }

function addDaysIso(iso, n) {
  const d = new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)) + n));
  return d.toISOString().slice(0, 10);
}

function stamp(iso) {
  const d = new Date(iso);
  return Utilities.formatDate(isNaN(d) ? new Date() : d, TZ, 'dd/MM/yyyy HH:mm');
}

/* ---------- Καταχωρήσεις και εξοπλισμός ---------- */

function sync(p) {
  const store = code(p.store);
  if (!store) throw new Error('no-store');
  const ops = Array.isArray(p.ops) ? p.ops.slice(0, MAX_OPS) : [];
  const results = ops.length ? locked(() => applyOps(ops)) : [];
  const from = isDay(p.from) ? p.from : '0000-00-00';
  return { ok: true, version: VERSION, results, equip: equipOf(store), entries: entriesOf(store, from), plans: plansOf(store, from.slice(0, 7)) };
}

function entryKey(store, type, eq, no, d) { return [store, type, eq, no, d].join('|'); }

function applyOps(ops) {
  const sh = sheet(SH_ENTRIES, ENTRY_HEAD, C.id + 1);
  const data = values(sh);
  const byId = {};
  const keys = {};
  data.forEach((r, i) => {
    byId[txt(r[C.id])] = i;
    keys[entryKey(txt(r[C.store]), txt(r[C.type]), txt(r[C.eq]), Number(r[C.no]) || 0, txt(r[C.d]))] = true;
  });
  const add = [];
  const addAt = {};
  const del = {};
  const now = today();

  const results = ops.map((o) => {
    const qid = String((o && o.qid) || '');
    if (!o) return { qid, ok: false, reason: 'bad' };

    if (o.op === 'add') {
      const e = o.e || {};
      const id = code(e.id);
      const store = code(o.store);
      const eq = code(e.eq);
      const no = Math.max(0, Math.min(10, parseInt(e.no, 10) || 0));
      if (!id || !store || !eq || !TYPES[e.t] || !isDay(e.d)) return { qid, ok: false, reason: 'bad' };
      if (byId[id] !== undefined || addAt[id] !== undefined) return { qid, ok: true };
      const key = entryKey(store, e.t, eq, no, e.d);
      if (keys[key]) return { qid, ok: false, reason: 'dup' };
      keys[key] = true;
      const at = isNaN(new Date(e.at)) ? new Date().toISOString() : new Date(e.at).toISOString();
      // «Δεν έγινε» με αιτία (βλάβη, κλειστό κατάστημα, άλλο) και σημείωση.
      const skip = PlanCalc.WHY[e.skip] ? String(e.skip) : '';
      const note = skip ? clean(e.note, 120) : '';
      const kind = TYPES[e.t] + (skip ? ` – Δεν έγινε: ${PlanCalc.WHY[skip]}${note ? ' (' + note + ')' : ''}` : '');
      addAt[id] = add.length;
      add.push([e.d, clean(o.storeName), kind, clean(o.eqName), no || '', clean(e.by), stamp(at), id, store, e.t, eq, at, skip ? skip + '|' + note : '']);
      return { qid, ok: true };
    }

    if (o.op === 'del') {
      const id = code(o.id);
      if (addAt[id] !== undefined) {
        const r = add[addAt[id]];
        delete keys[entryKey(r[C.store], r[C.type], r[C.eq], Number(r[C.no]) || 0, r[C.d])];
        add[addAt[id]] = null;
        delete addAt[id];
        return { qid, ok: true };
      }
      const i = byId[id];
      if (i === undefined) return { qid, ok: true };
      const r = data[i];
      // Χωρίς κωδικό διαγράφεται μόνο καταχώρηση της ίδιας ημέρας (διόρθωση λάθους).
      const atDay = r[C.at] && !isNaN(new Date(txt(r[C.at]))) ? bizDay(new Date(txt(r[C.at]))) : '';
      if (!o.force && atDay !== now) return { qid, ok: false, reason: 'old' };
      del[i] = true;
      delete byId[id];
      delete keys[entryKey(txt(r[C.store]), txt(r[C.type]), txt(r[C.eq]), Number(r[C.no]) || 0, txt(r[C.d]))];
      return { qid, ok: true };
    }

    if (o.op === 'equip') return Object.assign({ qid }, saveEquip(o));
    if (o.op === 'checklist') return Object.assign({ qid }, saveChecklist(o));
    if (o.op === 'plan') return Object.assign({ qid }, fillPlan(o));

    return { qid, ok: false, reason: 'bad' };
  });

  // Πρώτα οι διαγραφές (από κάτω προς τα πάνω), μετά οι νέες γραμμές.
  Object.keys(del).map(Number).sort((a, b) => b - a).forEach((i) => sh.deleteRow(i + 2));
  const rows = add.filter(Boolean);
  if (rows.length) writeRows(sh, sh.getLastRow() + 1, rows, ENTRY_HEAD.length);
  return results;
}

function saveEquip(o) {
  const store = code(o.store);
  if (!store) return { ok: false, reason: 'bad' };
  const sh = sheet(SH_EQUIP, EQUIP_HEAD, 5);
  const data = values(sh);
  let i = data.findIndex((r) => txt(r[4]) === store);
  if (i >= 0 && o.ifMissing) return { ok: true, reason: 'exists' };
  const s = o.setup || {};
  const counts = {};
  Object.keys(s.counts || {}).slice(0, 100).forEach((k) => {
    const n = parseInt(s.counts[k], 10);
    if (code(k) && n >= 0 && n <= 10) counts[k] = n;
  });
  const setup = {
    counts,
    since: isDay(s.since) ? s.since : today(),
    by: clean(s.by),
    at: isNaN(new Date(s.at)) ? new Date().toISOString() : new Date(s.at).toISOString(),
  };
  // Από πότε μετράει κάθε μονάδα που προστέθηκε αργότερα (π.χ. «katapsyxi#3»: «2026-10-15»).
  const added = {};
  Object.keys(s.added || {}).slice(0, 200).forEach((k) => {
    if (/^[\w-]{1,60}#\d{1,2}$/.test(k) && isDay(s.added[k])) added[k] = s.added[k];
  });
  if (Object.keys(added).length) setup.added = added;
  const row = [clean(o.storeName), clean(o.summary, 1000), setup.by, stamp(new Date().toISOString()), store, JSON.stringify(setup)];
  if (i < 0) i = data.length;
  writeRows(sh, i + 2, [row], EQUIP_HEAD.length);
  return { ok: true };
}

// Checklist ανοίγματος/κλεισίματος: μία γραμμή ανά κατάστημα, ημέρα και ενότητα (η νεότερη αποστολή μένει).
function saveChecklist(o) {
  const store = code(o.store);
  const c = o.c || {};
  if (!store || !SECTIONS[c.section] || !isDay(c.date)) return { ok: false, reason: 'bad' };
  const items = Array.isArray(c.items) ? c.items.slice(0, 200) : [];
  const num = (v) => Math.max(0, Math.min(999, parseInt(v, 10) || 0));
  const list = (fn) => items.filter(fn).map((it) => clean(`${num(it.n)}. ${clean(it.text, 200)}${it.note ? ' – ' + clean(it.note, 300) : ''}`, 600)).join('\n').slice(0, 20000);
  const key = [store, c.date, c.section].join('|');
  const at = isNaN(new Date(c.at)) ? new Date().toISOString() : new Date(c.at).toISOString();
  const row = [c.date, clean(o.storeName), SECTIONS[c.section], clean(c.by), num(c.ok), num(c.no), num(c.left),
    list((it) => it.s === 'no'), list((it) => it.s !== 'no' && it.note), stamp(at), key, store, c.section, at];
  const sh = sheet(SH_CHECK, CHECK_HEAD, 11);
  const data = values(sh);
  let i = data.findIndex((r) => txt(r[10]) === key);
  if (i < 0) i = data.length;
  writeRows(sh, i + 2, [row], CHECK_HEAD.length);
  return { ok: true };
}

function toChecklist(r) {
  return {
    d: txt(r[0]), section: txt(r[12]), by: txt(r[3]), ok: Number(r[4]) || 0, no: Number(r[5]) || 0, left: Number(r[6]) || 0,
    notDone: txt(r[7]), notes: txt(r[8]), at: txt(r[13]),
  };
}

/* ---------- Πρόγραμμα μήνα (από τον/την υπεύθυνο καταστήματος) ---------- */

// plan = { clean: { 'katapsyxi#1': [3, 10, 17, 24], … }, defrost: { … } }
function cleanPlan(plan) {
  const out = {};
  Object.keys(TYPES).forEach((t) => {
    const src = (plan && plan[t]) || {};
    out[t] = {};
    Object.keys(src).slice(0, 300).forEach((key) => {
      if (!/^[\w-]{1,60}#\d{1,2}$/.test(key) || !Array.isArray(src[key])) return;
      const days = src[key].map((d) => parseInt(d, 10)).filter((d) => d >= 1 && d <= 31);
      out[t][key] = days.filter((d, i) => days.indexOf(d) === i).sort((a, b) => a - b);
    });
  });
  return out;
}

function savePlan(p) {
  const store = code(p.store);
  const month = String(p.month || '');
  if (!store || !/^\d{4}-\d{2}$/.test(month)) throw new Error('bad');
  const plan = cleanPlan(p.plan);
  return locked(() => {
    const sh = sheet(SH_PLAN, PLAN_HEAD, 5);
    const data = values(sh);
    let i = data.findIndex((r) => txt(r[4]) === store && txt(r[5]) === month);
    if (i < 0) i = data.length;
    writeRows(sh, i + 2, [[clean(p.storeName), month, clean(p.by), stamp(new Date().toISOString()), store, month, JSON.stringify(plan)]], PLAN_HEAD.length);
    return { ok: true };
  });
}

// Πρόγραμμα που στέλνει η εφαρμογή ώστε να μην αλλάζει προς τα πίσω: δημιουργείται αν δεν υπάρχει
// (αυτόματο πρόγραμμα)· σε υπάρχον προστίθενται μόνο νέες μονάδες και ημέρες από χθες και μετά.
function fillPlan(o) {
  const store = code(o.store);
  const month = String(o.month || '');
  if (!store || !/^\d{4}-\d{2}$/.test(month)) return { ok: false, reason: 'bad' };
  const add = cleanPlan(o.plan);
  const sh = sheet(SH_PLAN, PLAN_HEAD, 5);
  const data = values(sh);
  const i = data.findIndex((r) => txt(r[4]) === store && txt(r[5]) === month);
  if (i < 0) {
    add.auto = true;
    writeRows(sh, data.length + 2, [[clean(o.storeName), month, 'Αυτόματο πρόγραμμα', stamp(new Date().toISOString()), store, month, JSON.stringify(add)]], PLAN_HEAD.length);
    return { ok: true };
  }
  const plan = parseSetup(data[i][6]) || {};
  const now = today();
  const min = month < now.slice(0, 7) ? 99 : month > now.slice(0, 7) ? 1 : Number(now.slice(8)) - 1;
  let changed = false;
  Object.keys(TYPES).forEach((t) => {
    plan[t] = plan[t] || {};
    Object.keys(add[t]).forEach((key) => {
      const cur = plan[t][key];
      if (!Array.isArray(cur)) {
        plan[t][key] = add[t][key];
        changed = true;
        return;
      }
      const more = add[t][key].filter((d) => d >= min && cur.indexOf(d) < 0);
      if (more.length) {
        plan[t][key] = cur.concat(more).sort((a, b) => a - b);
        changed = true;
      }
    });
  });
  if (changed) writeRows(sh, i + 2, [[txt(data[i][0]) || clean(o.storeName), month, txt(data[i][2]), stamp(new Date().toISOString()), store, month, JSON.stringify(plan)]], PLAN_HEAD.length);
  return { ok: true };
}

function plansOf(store, fromMonth) {
  const out = {};
  values(sheet(SH_PLAN, PLAN_HEAD, 5)).forEach((r) => {
    if (txt(r[4]) !== store || txt(r[5]) < fromMonth) return;
    const plan = parseSetup(r[6]);
    if (plan) out[txt(r[5])] = plan;
  });
  return out;
}

function parseSetup(v) {
  try { return JSON.parse(txt(v)); } catch (e) { return null; }
}

function equipOf(store) {
  const row = values(sheet(SH_EQUIP, EQUIP_HEAD, 5)).find((r) => txt(r[4]) === store);
  return row ? parseSetup(row[5]) : null;
}

function toEntry(r) {
  const e = { id: txt(r[C.id]), t: txt(r[C.type]), eq: txt(r[C.eq]), no: Number(r[C.no]) || 0, d: txt(r[C.d]), by: txt(r[C.by]), at: txt(r[C.at]) };
  const s = txt(r[C.skip]);
  if (s) {
    const i = s.indexOf('|');
    e.skip = i < 0 ? s : s.slice(0, i);
    e.note = i < 0 ? '' : s.slice(i + 1);
  }
  return e;
}

function entriesOf(store, from) {
  return values(sheet(SH_ENTRIES, ENTRY_HEAD, C.id + 1))
    .filter((r) => txt(r[C.store]) === store && txt(r[C.d]) >= from)
    .map(toEntry);
}

/* ---------- Αρχείο (με κωδικό): όλα τα καταστήματα για έναν μήνα ---------- */

function archive(p) {
  const month = /^\d{4}-\d{2}$/.test(String(p.month)) ? String(p.month) : today().slice(0, 7);
  const stores = {};
  const get = (sk, name) => {
    if (!stores[sk]) stores[sk] = { name: name || '', equip: null, entries: [], checklists: [], plans: {} };
    if (name && !stores[sk].name) stores[sk].name = name;
    return stores[sk];
  };
  values(sheet(SH_EQUIP, EQUIP_HEAD, 5)).forEach((r) => {
    const sk = txt(r[4]);
    if (sk) get(sk, txt(r[0])).equip = parseSetup(r[5]);
  });
  values(sheet(SH_ENTRIES, ENTRY_HEAD, C.id + 1)).forEach((r) => {
    const sk = txt(r[C.store]);
    if (sk && txt(r[C.d]).slice(0, 7) === month) get(sk, txt(r[1])).entries.push(toEntry(r));
  });
  values(sheet(SH_PLAN, PLAN_HEAD, 5)).forEach((r) => {
    const sk = txt(r[4]);
    const plan = sk && txt(r[5]) === month ? parseSetup(r[6]) : null;
    if (plan) get(sk, txt(r[0])).plans[month] = plan;
  });
  values(sheet(SH_CHECK, CHECK_HEAD, 11)).forEach((r) => {
    const sk = txt(r[11]);
    if (sk && txt(r[0]).slice(0, 7) === month) get(sk, txt(r[1])).checklists.push(toChecklist(r));
  });
  return { ok: true, month, stores };
}

/* ---------- Report με email: μηνιαίο και εβδομαδιαίο ---------- */

// Εκτελείται μία φορά από το Apps Script: εξουσιοδότηση, χρονοδιακόπτες (κάθε 1η του μήνα και κάθε Δευτέρα)
// και δύο δοκιμαστικά email.
function setupMonthlyReport() {
  ScriptApp.getProjectTriggers()
    .filter((t) => ['sendMonthlyReport', 'sendWeeklyReport'].indexOf(t.getHandlerFunction()) >= 0)
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sendMonthlyReport').timeBased().onMonthDay(1).atHour(8).inTimezone(TZ).create();
  ScriptApp.newTrigger('sendWeeklyReport').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8).inTimezone(TZ).create();
  sendTestReport();
  sendWeeklyReport();
}

// Κάθε 1η του μήνα: ο προηγούμενος μήνας.
function sendMonthlyReport() {
  const [y, m] = today().split('-').map(Number);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  sendReport(prev, null);
}

// Δοκιμαστικό: ο τρέχων μήνας μέχρι σήμερα.
function sendTestReport() {
  sendReport(today().slice(0, 7), today());
}

// Κάθε Δευτέρα: η εβδομάδα που πέρασε (Δευτέρα–Κυριακή) και ό,τι καθυστερεί ακόμα.
function sendWeeklyReport() {
  BOOK = book();
  mail(buildWeekly(today()));
}

function recipients() {
  return prop('REPORT_TO') || Session.getEffectiveUser().getEmail();
}

function triggerOn(fn) {
  return ScriptApp.getProjectTriggers().some((t) => t.getHandlerFunction() === fn);
}

// Από την εφαρμογή (με κωδικό): παραλήπτες και δοκιμαστική αποστολή.
function reportSettings(p) {
  if (typeof p.emails === 'string') {
    const list = p.emails.split(/[\s,;]+/).filter(Boolean);
    if (list.some((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) || list.length > 10) throw new Error('emails');
    if (list.length) PropertiesService.getScriptProperties().setProperty('REPORT_TO', list.join(','));
    else PropertiesService.getScriptProperties().deleteProperty('REPORT_TO');
  }
  if (p.send) sendTestReport();
  if (p.sendWeekly) sendWeeklyReport();
  return { ok: true, to: recipients(), monthly: triggerOn('sendMonthlyReport'), weekly: triggerOn('sendWeeklyReport') };
}

function appConfig() {
  const r = UrlFetchApp.fetch(APP_URL + 'data.json?t=' + Date.now(), { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('data.json ' + r.getResponseCode());
  return JSON.parse(r.getContentText());
}

function esc(v) {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Εξοπλισμός και συχνότητες (data.json) και τα δεδομένα όλων των καταστημάτων για τους μήνες που χρειάζονται.
function reportData(months) {
  const cfg = appConfig();
  const names = { __general: 'ΓΕΝΙΚΟ' };
  (cfg.stores || []).forEach((st) => { names[st.id] = st.name; });
  const byMonth = {};
  months.forEach((m) => { byMonth[m] = archive({ month: m }).stores; });
  const keys = (cfg.stores || []).map((st) => st.id);
  months.forEach((m) => Object.keys(byMonth[m]).forEach((k) => { if (keys.indexOf(k) < 0) keys.push(k); }));
  return { equipment: (cfg.cleaning && cfg.cleaning.equipment) || [], names, byMonth, keys };
}

function storeName(rd, sk) {
  if (rd.names[sk]) return rd.names[sk];
  const m = Object.keys(rd.byMonth).find((x) => rd.byMonth[x][sk] && rd.byMonth[x][sk].name);
  return m ? rd.byMonth[m][sk].name : sk;
}

// Κατάσταση κάθε εργασίας του προγράμματος ενός καταστήματος (και τα δύο είδη).
function storeTasks(rd, st, month, asOf) {
  if (!st || !st.equip) return [];
  return PlanCalc.TYPES.reduce((all, type) =>
    all.concat(PlanCalc.states(rd.equipment, st.equip, month, type, st.entries || [], st.plans || {}, asOf)), []);
}

const ISSUES = ['missed', 'late', 'overdue', 'skip'];

// Λίστα ανά είδος με όσα δεν έγιναν όπως ορίζει το πρόγραμμα.
function issueHtml(tasks, asOf) {
  return Object.keys(TYPES).map((type) => {
    const list = tasks.filter((t) => t.type === type);
    if (!list.length) return '';
    return `<p style="margin:8px 0 2px"><b>${TYPES[type]}</b></p><ul style="margin:0;padding-left:20px">${list.map((t) =>
      `<li${t.st === 'missed' ? ' style="color:#c62828"' : ''}>${esc(PlanCalc.line(t, asOf))}</li>`).join('')}</ul>`;
  }).join('');
}

function summaryOf(tot) {
  const parts = [];
  if (tot.missed) parts.push(`${tot.missed} δεν έγιναν`);
  if (tot.late) parts.push(`${tot.late} με καθυστέρηση`);
  return parts.length ? parts.join(' · ') : tot.req ? 'όλα στην ώρα τους' : 'χωρίς στοιχεία';
}

const TD = 'style="padding:6px 8px;border-bottom:1px solid #dde2ee;text-align:center"';
const TDL = 'style="padding:6px 8px;border-bottom:1px solid #dde2ee"';
const NOTE = '⚠️ = έγιναν αργότερα από την ημέρα του προγράμματος ή καθυστερούν ακόμα. ✗ = δεν έγιναν. ⊘ = δεν έγιναν, με αιτία (βλάβη, κλειστό κατάστημα, άλλο).';

function buildReport(month, asOf) {
  const rd = reportData([month]);
  const data = rd.byMonth[month];
  const label = `${MONTHS[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;
  const rows = [];
  const details = [];
  const text = [];
  const tot = { late: 0, missed: 0, req: 0 };
  const [yy, mm] = month.split('-').map(Number);
  const days = asOf ? Number(asOf.slice(8)) : new Date(yy, mm, 0).getDate();
  rd.keys.forEach((sk) => {
    const st = data[sk] || {};
    const name = storeName(rd, sk);
    const cls = st.checklists || [];
    const clCount = (sec) => `${new Set(cls.filter((c) => c.section === sec).map((c) => c.d)).size}/${days}`;
    const clCell = `<td ${TD}>${clCount('opening')} · ${clCount('closing')}</td>`;
    text.push(`${name}: checklists ΑΝΟΙΓΜΑ ${clCount('opening')} · ΚΛΕΙΣΙΜΟ ${clCount('closing')}`);
    if (!st.equip) {
      if (sk === '__general' && !cls.length) { text.pop(); return; }
      rows.push(`<tr><td ${TDL}><b>${esc(name)}</b></td><td ${TDL} colspan="4" style="color:#6b6b6b">Δεν έχει δηλωθεί εξοπλισμός</td>${clCell}</tr>`);
      text.push(`${name}: δεν έχει δηλωθεί εξοπλισμός`);
      return;
    }
    const tasks = storeTasks(rd, st, month, asOf || '');
    const part = (type) => {
      const n = PlanCalc.tally(tasks.filter((t) => t.type === type));
      return n.req ? `${n.done}/${n.req}` : '—';
    };
    const n = PlanCalc.tally(tasks);
    const late = n.late + n.overdue;
    tot.late += late;
    tot.missed += n.missed;
    tot.req += n.req;
    rows.push(`<tr${n.missed ? ' style="color:#c62828"' : ''}><td ${TDL}><b>${esc(name)}</b></td><td ${TD}>${part('clean')}</td><td ${TD}>${part('defrost')}</td><td ${TD}>${late ? '⚠️ ' + late : '–'}</td><td ${TD}>${n.missed ? '✗ ' + n.missed : '✓'}${n.skip ? ' · ⊘ ' + n.skip : ''}</td>${clCell}</tr>`);
    text.push(`${name}: καθαριότητες ${part('clean')} · αποψύξεις ${part('defrost')} · με καθυστέρηση ${late} · δεν έγιναν ${n.missed}${n.skip ? ' · με αιτία ' + n.skip : ''}`);
    const issues = tasks.filter((t) => ISSUES.indexOf(t.st) >= 0);
    if (issues.length) details.push(`<h3 style="margin:18px 0 4px;color:#1b2d47">${esc(name)}</h3>${issueHtml(issues, asOf || '')}`);
  });
  const sheetUrl = book().getUrl();
  const html = `<div style="font-family:Arial,sans-serif;color:#202936;max-width:680px">
<h2 style="color:#1b2d47;margin:0 0 4px">ΚΑΘΑΡΙΟΤΗΤΕΣ / ΑΠΟΨΥΞΕΙΣ – ${label}</h2>
<p style="margin:0 0 12px;color:#6b6b6b">${asOf ? `Δοκιμαστικό report: μέχρι ${asOf.split('-').reverse().join('/')}.` : 'Μηνιαίο report όλων των καταστημάτων.'}</p>
<table style="border-collapse:collapse;width:100%;font-size:14px">
<tr style="background:#eceff7"><th ${TDL}>Κατάστημα</th><th ${TD}>Καθαριότητες</th><th ${TD}>Αποψύξεις</th><th ${TD}>Με καθυστέρηση</th><th ${TD}>Δεν έγιναν</th><th ${TD}>Checklists<br>ΑΝΟΙΓΜΑ · ΚΛΕΙΣΙΜΟ</th></tr>
${rows.join('\n')}
</table>
<p style="font-size:13px;color:#6b6b6b">Καθαριότητες / Αποψύξεις = έγιναν (στην ώρα τους ή με καθυστέρηση) / όσες ορίζει το πρόγραμμα${asOf ? ' μέχρι σήμερα' : ''}. ${NOTE} Checklists = σε πόσες ημέρες στάλθηκε στο αρχείο το checklist για ΑΝΟΙΓΜΑ · ΚΛΕΙΣΙΜΟ.</p>
${details.length ? `<h2 style="color:#c62828;font-size:18px;margin:20px 0 0">Τι δεν έγινε όπως ορίζει το πρόγραμμα</h2>${details.join('')}`
    : tot.req ? '<p><b>Όλα έγιναν στην ώρα τους ✅</b></p>' : '<p><b>Δεν υπάρχουν ακόμα εργασίες για αυτόν τον μήνα.</b></p>'}
<p style="margin-top:24px;font-size:13px"><a href="${sheetUrl}">Google Sheet με όλες τις καταχωρήσεις</a> · <a href="${APP_URL}">Εφαρμογή</a> (ΚΑΘΑΡΙΟΤΗΤΕΣ / ΑΠΟΨΥΞΕΙΣ → 🔒 Αρχείο)</p>
</div>`;
  return {
    subject: `${asOf ? '[Δοκιμή] ' : ''}ΚΑΘΑΡΙΟΤΗΤΕΣ / ΑΠΟΨΥΞΕΙΣ – ${label} – ${summaryOf(tot)}`,
    html,
    text: [`ΚΑΘΑΡΙΟΤΗΤΕΣ / ΑΠΟΨΥΞΕΙΣ – ${label}`, ''].concat(text, ['', sheetUrl]).join('\n'),
  };
}

// Εβδομαδιαίο: οι εργασίες της εβδομάδας που πέρασε (Δευτέρα–Κυριακή, για Δευτέρα πρωί) και όσες καθυστερούν ακόμα.
function buildWeekly(asOf) {
  const start = addDaysIso(asOf, -7);
  const end = addDaysIso(asOf, -1);
  const cur = asOf.slice(0, 7);
  const months = [start.slice(0, 7), end.slice(0, 7), cur].filter((m, i, a) => a.indexOf(m) === i);
  const rd = reportData(months);
  const range = `${PlanCalc.dayLabel(start)} – ${PlanCalc.dayLabel(end)}`;
  const rows = [];
  const details = [];
  const text = [];
  const tot = { late: 0, missed: 0, req: 0 };
  rd.keys.forEach((sk) => {
    let tasks = [];
    let has = false;
    months.forEach((m) => {
      const st = rd.byMonth[m][sk];
      if (st && st.equip) has = true;
      tasks = tasks.concat(storeTasks(rd, st, m, m < cur ? '' : asOf));
    });
    if (!has) return;
    const name = storeName(rd, sk);
    const week = tasks.filter((t) => t.d >= start && t.d <= end);
    // Παλαιότερες εργασίες που καθυστερούν ακόμα.
    const older = tasks.filter((t) => t.st === 'overdue' && t.d < start);
    const n = PlanCalc.tally(week);
    const late = n.late + n.overdue + older.length;
    tot.late += late;
    tot.missed += n.missed;
    tot.req += n.req;
    rows.push(`<tr${n.missed ? ' style="color:#c62828"' : ''}><td ${TDL}><b>${esc(name)}</b></td><td ${TD}>${n.req ? `${n.done}/${n.req}` : '—'}</td><td ${TD}>${late ? '⚠️ ' + late : '–'}</td><td ${TD}>${n.missed ? '✗ ' + n.missed : '✓'}${n.skip ? ' · ⊘ ' + n.skip : ''}</td></tr>`);
    text.push(`${name}: έγιναν ${n.req ? `${n.done}/${n.req}` : '—'} · με καθυστέρηση ${late} · δεν έγιναν ${n.missed}${n.skip ? ' · με αιτία ' + n.skip : ''}`);
    const issues = older.concat(week.filter((t) => ISSUES.indexOf(t.st) >= 0));
    if (issues.length) details.push(`<h3 style="margin:18px 0 4px;color:#1b2d47">${esc(name)}</h3>${issueHtml(issues, asOf)}`);
  });
  const html = `<div style="font-family:Arial,sans-serif;color:#202936;max-width:680px">
<h2 style="color:#1b2d47;margin:0 0 4px">ΚΑΘΑΡΙΟΤΗΤΕΣ / ΑΠΟΨΥΞΕΙΣ – εβδομάδα ${range}</h2>
<p style="margin:0 0 12px;color:#6b6b6b">Εβδομαδιαίο report όλων των καταστημάτων: οι εργασίες του προγράμματος της εβδομάδας που πέρασε και όσες καθυστερούν ακόμα.</p>
<table style="border-collapse:collapse;width:100%;font-size:14px">
<tr style="background:#eceff7"><th ${TDL}>Κατάστημα</th><th ${TD}>Έγιναν</th><th ${TD}>Με καθυστέρηση</th><th ${TD}>Δεν έγιναν</th></tr>
${rows.join('\n')}
</table>
<p style="font-size:13px;color:#6b6b6b">Έγιναν = στην ώρα τους ή με καθυστέρηση / όσες ορίζει το πρόγραμμα για την εβδομάδα. ${NOTE}</p>
${details.length ? `<h2 style="color:#c62828;font-size:18px;margin:20px 0 0">Καθυστερήσεις και όσα δεν έγιναν</h2>${details.join('')}`
    : tot.req ? '<p><b>Όλα έγιναν στην ώρα τους ✅</b></p>' : '<p><b>Δεν υπήρχαν εργασίες αυτή την εβδομάδα.</b></p>'}
<p style="margin-top:24px;font-size:13px"><a href="${book().getUrl()}">Google Sheet με όλες τις καταχωρήσεις</a> · <a href="${APP_URL}">Εφαρμογή</a> (ΚΑΘΑΡΙΟΤΗΤΕΣ / ΑΠΟΨΥΞΕΙΣ → 🔒 Αρχείο)</p>
</div>`;
  return {
    subject: `Εβδομαδιαίο report – ΚΑΘΑΡΙΟΤΗΤΕΣ / ΑΠΟΨΥΞΕΙΣ – ${range} – ${summaryOf(tot)}`,
    html,
    text: [`ΚΑΘΑΡΙΟΤΗΤΕΣ / ΑΠΟΨΥΞΕΙΣ – εβδομάδα ${range}`, ''].concat(text, ['', book().getUrl()]).join('\n'),
  };
}

function mail(r) {
  MailApp.sendEmail({ to: recipients(), subject: r.subject, body: r.text, htmlBody: r.html, name: 'Lartecono Checklist' });
}

function sendReport(month, asOf) {
  BOOK = book();
  mail(buildReport(month, asOf));
}

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
