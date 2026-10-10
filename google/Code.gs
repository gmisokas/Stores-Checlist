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
 * Μηνιαίο report με email: στο Apps Script διάλεξε πάνω τη συνάρτηση «setupMonthlyReport»
 * και πάτα «Εκτέλεση» (μία φορά). Στέλνει αμέσως ένα δοκιμαστικό και μετά κάθε 1η του μήνα
 * στις 8:00 τη σύνοψη του προηγούμενου μήνα. Μετά: Ανάπτυξη → Διαχείριση αναπτύξεων →
 * μολύβι → Έκδοση: Νέα έκδοση → Ανάπτυξη.
 *
 * Τα φύλλα «Καταχωρήσεις», «Εξοπλισμός» και «Checklists» (ανοίγματα/κλεισίματα)
 * δημιουργούνται μόνα τους. Αν ο κώδικας
 * μπήκε ως νέο έργο (όχι μέσα από Google Sheet), δημιουργείται και το ίδιο το Google Sheet
 * «Lartecono – Αρχείο καθαριοτήτων» στο Google Drive.
 * Μην αλλάζεις τις κρυφές στήλες (id, store, …): τις χρησιμοποιεί η εφαρμογή.
 */

const TZ = 'Europe/Athens';
const SH_ENTRIES = 'Καταχωρήσεις';
const SH_EQUIP = 'Εξοπλισμός';
const ENTRY_HEAD = ['Ημερομηνία', 'Κατάστημα', 'Είδος', 'Εξοπλισμός / χώρος', 'Νο', 'Υπεύθυνος', 'Καταχωρήθηκε',
  'id', 'store', 'type', 'eq', 'at'];
const EQUIP_HEAD = ['Κατάστημα', 'Εξοπλισμός', 'Δηλώθηκε από', 'Ενημερώθηκε', 'store', 'setup'];
const SH_CHECK = 'Checklists';
const CHECK_HEAD = ['Ημερομηνία', 'Κατάστημα', 'Ενότητα', 'Υπεύθυνος', '✓', '✗', 'Χωρίς συμπλήρωση', 'Δεν έγιναν', 'Σημειώσεις', 'Στάλθηκε',
  'key', 'store', 'section', 'at'];
const SECTIONS = { opening: 'Άνοιγμα', closing: 'Κλείσιμο' };
const VERSION = 2;
const TYPES = { clean: 'Γενική καθαριότητα', defrost: 'Απόψυξη' };
// Θέσεις στηλών (από 0) στο φύλλο «Καταχωρήσεις».
const C = { d: 0, no: 4, by: 5, id: 7, store: 8, type: 9, eq: 10, at: 11 };
const MAX_OPS = 500;
const BOOK_NAME = 'Lartecono – Αρχείο καθαριοτήτων';
// Η εφαρμογή: από εδώ διαβάζονται τα καταστήματα και οι συχνότητες (data.json).
const APP_URL = 'https://gmisokas.github.io/Stores-Checlist/';
const MONTHS = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος',
  'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'];
let BOOK = null;

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

function today() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }

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
  return { ok: true, results, equip: equipOf(store), entries: entriesOf(store, isDay(p.from) ? p.from : '0000-00-00') };
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
      addAt[id] = add.length;
      add.push([e.d, clean(o.storeName), TYPES[e.t], clean(o.eqName), no || '', clean(e.by), stamp(at), id, store, e.t, eq, at]);
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
      const atDay = r[C.at] && !isNaN(new Date(txt(r[C.at]))) ? Utilities.formatDate(new Date(txt(r[C.at])), TZ, 'yyyy-MM-dd') : '';
      if (!o.force && atDay !== now) return { qid, ok: false, reason: 'old' };
      del[i] = true;
      delete byId[id];
      delete keys[entryKey(txt(r[C.store]), txt(r[C.type]), txt(r[C.eq]), Number(r[C.no]) || 0, txt(r[C.d]))];
      return { qid, ok: true };
    }

    if (o.op === 'equip') return Object.assign({ qid }, saveEquip(o));
    if (o.op === 'checklist') return Object.assign({ qid }, saveChecklist(o));

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

function parseSetup(v) {
  try { return JSON.parse(txt(v)); } catch (e) { return null; }
}

function equipOf(store) {
  const row = values(sheet(SH_EQUIP, EQUIP_HEAD, 5)).find((r) => txt(r[4]) === store);
  return row ? parseSetup(row[5]) : null;
}

function toEntry(r) {
  return { id: txt(r[C.id]), t: txt(r[C.type]), eq: txt(r[C.eq]), no: Number(r[C.no]) || 0, d: txt(r[C.d]), by: txt(r[C.by]), at: txt(r[C.at]) };
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
    if (!stores[sk]) stores[sk] = { name: name || '', equip: null, entries: [], checklists: [] };
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
  values(sheet(SH_CHECK, CHECK_HEAD, 11)).forEach((r) => {
    const sk = txt(r[11]);
    if (sk && txt(r[0]).slice(0, 7) === month) get(sk, txt(r[1])).checklists.push(toChecklist(r));
  });
  return { ok: true, month, stores };
}

/* ---------- Μηνιαίο report (email) ---------- */

// Εκτελείται μία φορά από το Apps Script: εξουσιοδότηση, μηνιαίος χρονοδιακόπτης, δοκιμαστικό email.
function setupMonthlyReport() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'sendMonthlyReport')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sendMonthlyReport').timeBased().onMonthDay(1).atHour(8).inTimezone(TZ).create();
  sendTestReport();
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

function recipients() {
  return prop('REPORT_TO') || Session.getEffectiveUser().getEmail();
}

function monthlyOn() {
  return ScriptApp.getProjectTriggers().some((t) => t.getHandlerFunction() === 'sendMonthlyReport');
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
  return { ok: true, to: recipients(), monthly: monthlyOn() };
}

function appConfig() {
  const r = UrlFetchApp.fetch(APP_URL + 'data.json?t=' + Date.now(), { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('data.json ' + r.getResponseCode());
  return JSON.parse(r.getContentText());
}

function freqText(rule) {
  const n = rule.max > rule.min ? `${rule.min}–${rule.max}` : String(rule.min);
  return `${n} ${n === '1' ? 'φορά' : 'φορές'}/${rule.per === 'month' ? 'μήνα' : 'εβδομάδα'}`;
}

// Ίδιος έλεγχος με την εφαρμογή: εβδομάδες 1–7, 8–14, 15–21, 22–τέλος· μηνιαίες για όλο τον μήνα.
function checkStore(equipment, setup, entries, ym, asOf) {
  const [y, m] = ym.split('-').map(Number);
  const dim = new Date(y, m, 0).getDate();
  const iso = (d) => `${ym}-${String(d).padStart(2, '0')}`;
  const since = setup.since || '';
  const out = [];
  equipment.forEach((eq) => {
    Object.keys(TYPES).forEach((type) => {
      const rule = eq[type];
      if (!rule || !(rule.min > 0)) return;
      // Ίδιο με την εφαρμογή: είδος χωρίς Νο που λείπει από τη δήλωση θεωρείται ότι υπάρχει.
      const raw = (setup.counts || {})[eq.id];
      const n = raw === undefined ? (eq.numbered ? 0 : 1) : Math.min(10, Math.max(0, parseInt(raw, 10) || 0));
      if (!n) return;
      const nos = eq.numbered ? Array.from({ length: n }, (_, i) => i + 1) : [0];
      const wins = rule.per === 'month' ? [[1, dim]] : [[1, 7], [8, 14], [15, 21], [22, dim]];
      nos.forEach((no) => {
        const mine = entries.filter((e) => e.t === type && e.eq === eq.id && (e.no || 0) === no);
        wins.forEach(([a, b]) => {
          const start = iso(a);
          const end = iso(b);
          if (asOf && start > asOf) return;
          if (since > end) return;
          let req = rule.min;
          if (since > start) {
            if (rule.per !== 'month') return;
            req = Math.round((rule.min * (b - Number(since.slice(8)) + 1)) / (b - a + 1));
          }
          if (req <= 0) return;
          const done = mine.filter((e) => e.d >= start && e.d <= end).length;
          out.push({
            type, label: no ? `${eq.name} Νο ${no}` : eq.name, rule, a, b, done, req,
            ok: done >= req, ended: !asOf || end < asOf,
          });
        });
      });
    });
  });
  return out;
}

function esc(v) {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildReport(month, asOf) {
  const cfg = appConfig();
  const equipment = (cfg.cleaning && cfg.cleaning.equipment) || [];
  const data = archive({ month }).stores;
  const names = {};
  (cfg.stores || []).forEach((st) => { names[st.id] = st.name; });
  const keys = (cfg.stores || []).map((st) => st.id).concat(Object.keys(data).filter((k) => !(k in names)));
  const label = `${MONTHS[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;
  const td = 'style="padding:6px 8px;border-bottom:1px solid #dde2ee;text-align:center"';
  const tdl = 'style="padding:6px 8px;border-bottom:1px solid #dde2ee"';
  const rows = [];
  const details = [];
  const text = [];
  let totalFails = 0;
  let totalReq = 0;
  const [yy, mm] = month.split('-').map(Number);
  const days = asOf ? Number(asOf.slice(8)) : new Date(yy, mm, 0).getDate();
  keys.forEach((sk) => {
    const st = data[sk] || {};
    const name = names[sk] || (sk === '__general' ? 'ΓΕΝΙΚΟ' : st.name || sk);
    const cls = st.checklists || [];
    const clCount = (sec) => `${new Set(cls.filter((c) => c.section === sec).map((c) => c.d)).size}/${days}`;
    const clCell = `<td ${td}>${clCount('opening')} · ${clCount('closing')}</td>`;
    text.push(`${name}: checklists άνοιγμα ${clCount('opening')} · κλείσιμο ${clCount('closing')}`);
    if (!st.equip) {
      if (sk === '__general' && !cls.length) { text.pop(); return; }
      rows.push(`<tr><td ${tdl}><b>${esc(name)}</b></td><td ${tdl} colspan="3" style="color:#6b6b6b">Δεν έχει δηλωθεί εξοπλισμός</td>${clCell}</tr>`);
      text.push(`${name}: δεν έχει δηλωθεί εξοπλισμός`);
      return;
    }
    const res = checkStore(equipment, st.equip, st.entries || [], month, asOf);
    const part = (type) => {
      const xs = res.filter((x) => x.type === type);
      const req = xs.reduce((n, x) => n + x.req, 0);
      return req ? `${xs.reduce((n, x) => n + Math.min(x.done, x.req), 0)}/${req}` : '—';
    };
    const fails = res.filter((x) => !x.ok && x.ended);
    totalFails += fails.length;
    totalReq += res.length;
    rows.push(`<tr${fails.length ? ' style="color:#c62828"' : ''}><td ${tdl}><b>${esc(name)}</b></td><td ${td}>${part('clean')}</td><td ${td}>${part('defrost')}</td><td ${td}>${fails.length ? '✗ ' + fails.length : '✓'}</td>${clCell}</tr>`);
    text.push(`${name}: καθαριότητες ${part('clean')} · αποψύξεις ${part('defrost')} · ελλείψεις ${fails.length}`);
    if (fails.length) {
      const items = Object.keys(TYPES).map((type) => {
        const list = fails.filter((x) => x.type === type);
        if (!list.length) return '';
        return `<p style="margin:8px 0 2px"><b>${TYPES[type]}</b></p><ul style="margin:0;padding-left:20px">${list.map((x) =>
          `<li>${esc(x.label)} – ${x.rule.per === 'month' ? 'μήνας' : `εβδομάδα ${x.a}–${x.b}/${month.slice(5)}`}: ${x.done} από ${x.req}</li>`).join('')}</ul>`;
      }).join('');
      details.push(`<h3 style="margin:18px 0 4px;color:#1b2d47">${esc(name)}</h3>${items}`);
    }
  });
  const sheetUrl = book().getUrl();
  const html = `<div style="font-family:Arial,sans-serif;color:#202936;max-width:640px">
<h2 style="color:#1b2d47;margin:0 0 4px">ΚΑΘΑΡΙΟΤΗΤΕΣ / ΑΠΟΨΥΞΕΙΣ – ${label}</h2>
<p style="margin:0 0 12px;color:#6b6b6b">${asOf ? `Δοκιμαστικό report: μέχρι ${asOf.split('-').reverse().join('/')}.` : 'Μηνιαίο report όλων των καταστημάτων.'}</p>
<table style="border-collapse:collapse;width:100%;font-size:14px">
<tr style="background:#eceff7"><th ${tdl}>Κατάστημα</th><th ${td}>Καθαριότητες</th><th ${td}>Αποψύξεις</th><th ${td}>Ελλείψεις</th><th ${td}>Checklists<br>άνοιγμα · κλείσιμο</th></tr>
${rows.join('\n')}
</table>
<p style="font-size:13px;color:#6b6b6b">Έγιναν / απαιτούνται. «✗» = πόσες φορές δεν έγινε κάτι όπως ορίζεται. Checklists = σε πόσες ημέρες στάλθηκε στο αρχείο το checklist ανοίγματος · κλεισίματος.</p>
${details.length ? `<h2 style="color:#c62828;font-size:18px;margin:20px 0 0">Τι δεν έγινε</h2>${details.join('')}`
    : totalReq ? '<p><b>Όλα έγιναν όπως ορίζεται ✅</b></p>' : '<p><b>Δεν υπάρχουν ακόμα έλεγχοι για αυτόν τον μήνα.</b></p>'}
<p style="margin-top:24px;font-size:13px"><a href="${sheetUrl}">Google Sheet με όλες τις καταχωρήσεις</a> · <a href="${APP_URL}">Εφαρμογή</a> (ΚΑΘΑΡΙΟΤΗΤΕΣ / ΑΠΟΨΥΞΕΙΣ → 🔒 Αρχείο)</p>
</div>`;
  return {
    subject: `${asOf ? '[Δοκιμή] ' : ''}Καθαριότητες/Αποψύξεις – ${label} – ${totalFails ? totalFails + ' ελλείψεις' : totalReq ? 'όλα εντάξει' : 'χωρίς στοιχεία'}`,
    html,
    text: [`ΚΑΘΑΡΙΟΤΗΤΕΣ / ΑΠΟΨΥΞΕΙΣ – ${label}`, ''].concat(text, ['', sheetUrl]).join('\n'),
  };
}

function sendReport(month, asOf) {
  BOOK = book();
  const r = buildReport(month, asOf);
  MailApp.sendEmail({ to: recipients(), subject: r.subject, body: r.text, htmlBody: r.html, name: 'Lartecono Checklist' });
}

