/**
 * Lartecono Stores Checklist – κοινό αρχείο καθαριοτήτων/αποψύξεων.
 *
 * Εγκατάσταση (μία φορά, από υπολογιστή):
 * 1. Νέο Google Sheet → Επεκτάσεις → Apps Script.
 * 2. Σβήσε ό,τι υπάρχει, επικόλλησε αυτόν τον κώδικα και πάτα Αποθήκευση.
 * 3. Ανάπτυξη → Νέα ανάπτυξη → Τύπος: Εφαρμογή ιστού.
 *    Εκτέλεση ως: Εγώ · Ποιος έχει πρόσβαση: Οποιοσδήποτε → Ανάπτυξη.
 * 4. Αντέγραψε τη διεύθυνση (τελειώνει σε /exec) στην εφαρμογή:
 *    Διαχείριση → Καθαριότητες → Κοινό αρχείο.
 *
 * Τα φύλλα «Καταχωρήσεις» και «Εξοπλισμός» δημιουργούνται μόνα τους.
 * Μην αλλάζεις τις κρυφές στήλες (id, store, …): τις χρησιμοποιεί η εφαρμογή.
 */

const TZ = 'Europe/Athens';
const SH_ENTRIES = 'Καταχωρήσεις';
const SH_EQUIP = 'Εξοπλισμός';
const ENTRY_HEAD = ['Ημερομηνία', 'Κατάστημα', 'Είδος', 'Εξοπλισμός / χώρος', 'Νο', 'Υπεύθυνος', 'Καταχωρήθηκε',
  'id', 'store', 'type', 'eq', 'at'];
const EQUIP_HEAD = ['Κατάστημα', 'Εξοπλισμός', 'Δηλώθηκε από', 'Ενημερώθηκε', 'store', 'setup'];
const TYPES = { clean: 'Γενική καθαριότητα', defrost: 'Απόψυξη' };
// Θέσεις στηλών (από 0) στο φύλλο «Καταχωρήσεις».
const C = { d: 0, no: 4, by: 5, id: 7, store: 8, type: 9, eq: 10, at: 11 };
const MAX_OPS = 500;

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
    switch (p.action) {
      case 'ping': return { ok: true, app: 'lartecono-log', hasPassword: !!prop('PW_HASH') };
      case 'sync': return sync(p);
      case 'archive': checkPw(p.pw); return archive(p);
      case 'remove': checkPw(p.pw); locked(() => applyOps([{ op: 'del', id: p.id, force: true }])); return { ok: true };
      case 'setPassword': return setPassword(p);
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

function sheet(name, head, hideFrom) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
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
    if (!stores[sk]) stores[sk] = { name: name || '', equip: null, entries: [] };
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
  return { ok: true, month, stores };
}
