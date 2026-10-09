'use strict';

/* ==========================================================
   Αρχείο γενικών καθαριοτήτων / αποψύξεων
   - Εξοπλισμός, συχνότητες και κωδικός αρχείου: data.json
     (Διαχείριση → Καθαριότητες).
   - Εξοπλισμός κάθε καταστήματος και καταχωρήσεις: σώζονται
     στη συσκευή.
   Φορτώνεται πριν από το app.js και χρησιμοποιεί τα βοηθητικά του.
   ========================================================== */

const LOG_TYPES = { clean: 'Γενική καθαριότητα', defrost: 'Απόψυξη' };
const LOG_TITLES = { clean: 'Αρχείο γενικών καθαριοτήτων', defrost: 'Αρχείο αποψύξεων' };
const LOG_LS = { equip: 'cl-equip:', log: 'cl-log:', seen: 'cl-log-seen:', unlocked: 'cl-log-unlocked' };
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
  { id: 'portes', name: 'Πόρτες', clean: { min: 1, per: 'week' } },
  { id: 'pezodromio', name: 'Πεζοδρόμιο', clean: { min: 1, per: 'week' } },
];

/* ---------- Ρυθμίσεις (data.json) ---------- */

function normalizeCleaning(c) {
  c = c && typeof c === 'object' && !Array.isArray(c) ? c : {};
  if (typeof c.passwordHash !== 'string') c.passwordHash = '';
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
function setEquip(sk, v) { lsSet(LOG_LS.equip + sk, v); }
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
function monthOptions(selected) {
  const now = ymOf(todayISO());
  const opts = [];
  for (let i = 0; i <= 12; i++) {
    const ym = addMonths(now, -i);
    opts.push(h('option', { value: ym }, monthLabel(ym)));
  }
  if (selected && selected > now) opts.unshift(h('option', { value: selected }, monthLabel(selected)));
  return opts;
}

/* ---------- Πρόγραμμα και έλεγχος ---------- */

function unitLabel(eq, no) { return no ? `${eq.name} Νο ${no}` : eq.name; }

// Μονάδες ενός είδους (π.χ. Κατάψυξη Νο 1, Νο 2, Πόρτες) με βάση τον εξοπλισμό.
function logUnits(counts, type) {
  const out = [];
  state.data.cleaning.equipment.forEach((eq) => {
    const rule = eq[type];
    if (!rule || !(rule.min > 0)) return;
    const n = Math.min(10, Math.max(0, parseInt(counts[eq.id], 10) || 0));
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
// συγκεντρώνονται όλες την ίδια ημέρα. Οι καθαριότητες μόνο Δευτέρα–Παρασκευή.
function weeklyDays(units, type) {
  const days = type === 'clean' ? [1, 2, 3, 4, 5] : [1, 2, 3, 4, 5, 6, 0];
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
function planMonth(ym, type, counts) {
  const mi = monthInfo(ym);
  const units = logUnits(counts, type);
  const wk = weeklyDays(units, type);
  const allowed = (d) => type !== 'clean' || (mi.dow(d) !== 0 && mi.dow(d) !== 6);
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
  for (let d = 1; d <= mi.dim - 3; d++) if (allowed(d)) days.push(d);
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

function checkMonth(sk, ym, asOf) {
  const setup = getEquip(sk);
  if (!setup) return [];
  const entries = getLog(sk).filter((e) => ymOf(e.d) === ym);
  return Object.keys(LOG_TYPES).flatMap((type) =>
    checkUnits(logUnits(setup.counts, type), type, entries, ym, setup.since || '', asOf));
}

function failText(x, ym) {
  const when = x.u.rule.per === 'month' ? 'μήνας' : `εβδομάδα ${x.a}–${x.b}/${ym.slice(5)}`;
  return `${x.u.label} – ${when}: ${x.done} από ${x.req}`;
}

function noticeText(storeName, ym, fails) {
  const lines = [`🔔 Καθαριότητες/αποψύξεις – ${storeName}`, `📅 ${monthLabel(ym)}: δεν έγιναν όπως ορίζεται`];
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
  if (!sk || !getEquip(sk)) return;
  const today = todayISO();

  // Από την 1η του μήνα: τι δεν έγινε τον προηγούμενο μήνα, μέχρι να πατηθεί «Το είδα».
  const prev = addMonths(ymOf(today), -1);
  const seenKey = LOG_LS.seen + sk + ':' + prev;
  if (!lsGet(seenKey, false)) {
    const fails = checkMonth(sk, prev, null).filter((x) => !x.ok);
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
    const pend = checkMonth(sk, ymOf(today), today).filter((x) => !x.ok && !x.ended);
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
  const setup = getEquip(sk);
  let body;
  if (!setup || state.logMode === 'setup') body = setupForm(sk, setup);
  else if (state.logMode === 'unlock') body = unlockForm(sk);
  else if (state.logMode === 'archive') body = archiveView(sk);
  else body = logMain(sk, setup);
  view.replaceChildren(body);
}

function logMain(sk, setup) {
  const type = state.logType;
  const date = f.date.value || todayISO();
  const ym = ymOf(date);
  const mi = monthInfo(ym);
  const day = Number(date.slice(8));
  const all = getLog(sk);
  const monthEntries = all.filter((e) => ymOf(e.d) === ym);
  const tasks = markDone(planMonth(ym, type, setup.counts), monthEntries, type, ym);
  const since = setup.since || '';

  // Υπενθύμιση στο τέλος του μήνα.
  const today = todayISO();
  let remind = null;
  if (ym === ymOf(today) && Number(today.slice(8)) >= REMIND_FROM_DAY) {
    const pend = checkMonth(sk, ym, today).filter((x) => !x.ok && !x.ended);
    if (pend.length) {
      remind = h('div', { class: 'log-remind' },
        h('b', {}, '⏰ Υπενθύμιση: μέχρι το τέλος του μήνα εκκρεμούν:'),
        failList(pend, ym));
    }
  }

  const typeSeg = h('div', { class: 'seg log-type' }, Object.entries(LOG_TYPES).map(([k, label]) =>
    h('button', { type: 'button', 'aria-pressed': String(k === type), onclick: () => { state.logType = k; renderLog(); } }, label)));

  // Καταχώρηση: εξοπλισμός/χώρος, Νο, τικ.
  const eqs = state.data.cleaning.equipment.filter((eq) => eq[type] && (parseInt(setup.counts[eq.id], 10) || 0) > 0);
  const selNo = h('select', { 'aria-label': 'Νο' });
  const selEq = h('select', { 'aria-label': 'Εξοπλισμός / χώρος', onchange: () => fillNo() },
    h('option', { value: '' }, '— Επίλεξε —'),
    eqs.map((eq) => h('option', { value: eq.id }, eq.name)));
  const fillNo = () => {
    const eq = eqs.find((x) => x.id === selEq.value);
    if (eq && eq.numbered) {
      const n = Math.min(10, parseInt(setup.counts[eq.id], 10) || 0);
      selNo.replaceChildren(h('option', { value: '' }, '–'),
        ...Array.from({ length: n }, (_, i) => h('option', { value: String(i + 1) }, String(i + 1))));
      selNo.disabled = false;
      if (n === 1) selNo.value = '1';
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
    addEntry(sk, type, eq, no);
  };
  const entryCard = h('div', { class: 'box log-entry' },
    h('h2', {}, 'Καταχώρηση – ' + LOG_TYPES[type]),
    h('div', { class: 'log-grid' },
      h('span', { class: 'log-col' }, 'Εξοπλισμός / χώρος'),
      h('span', { class: 'log-col' }, 'Νο'),
      h('span', { class: 'log-col' }, 'Έγινε'),
      selEq, selNo,
      h('button', { type: 'button', class: 'mark ok log-tick', 'aria-label': 'Έγινε', onclick: tick }, '✓')),
    h('p', { class: 'hint' }, `Ημερομηνία καταχώρησης: ${fmtDate(date)} · Υπεύθυνος: `, whoEl()));

  // Προτεινόμενα για την ημέρα + εκκρεμότητες της ίδιας εβδομάδας/μήνα.
  const todayTasks = tasks.filter((t) => t.day === day);
  const overdue = tasks.filter((t) => {
    if (t.done || t.day >= day || mi.iso(t.day) < since) return false;
    const [a, b] = logWindows(t.u.rule, mi.dim)[t.w];
    return day >= a && day <= b;
  });
  const taskRow = (t) => h('li', { class: 'task' + (t.done ? ' done' : '') },
    h('span', { class: 'task-text' }, t.u.label, h('small', {}, ' · ' + freqText(t.u.rule))),
    t.done
      ? h('span', { class: 'done-tag' }, '✓ Έγινε')
      : h('button', { type: 'button', class: 'mark ok', 'aria-label': 'Έγινε', onclick: () => addEntry(sk, type, t.u.eq, t.u.no) }, '✓'));
  const isToday = date === today;
  const dow = new Date(date + 'T12:00:00').getDay();
  const planCard = h('div', { class: 'box' },
    h('h2', {}, `Προτεινόμενα για ${isToday ? 'σήμερα' : fmtDate(date)}`),
    todayTasks.length
      ? h('ul', { class: 'tasks' }, todayTasks.map(taskRow))
      : h('p', { class: 'hint' }, type === 'clean' && (dow === 0 || dow === 6)
        ? 'Σαββατοκύριακο: δεν προγραμματίζονται γενικές καθαριότητες.'
        : 'Δεν υπάρχει προτεινόμενη εργασία για αυτή την ημέρα.'),
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
    remind,
    typeSeg,
    entryCard,
    planCard,
    entriesCard,
    calendarEl(sk, setup, type),
    h('section', { class: 'actions' },
      h('button', { type: 'button', class: 'btn', onclick: () => openLogExport(sk, ym) }, 'Αποθήκευση σε Excel'),
      h('button', { type: 'button', class: 'btn', onclick: () => { state.logMode = 'setup'; renderLog(); scrollToLog(); } }, 'Εξοπλισμός καταστήματος'),
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
      onclick: () => {
        if (!confirm(`Διαγραφή της καταχώρησης;\n\n${fmtDate(e.d)} · ${LOG_TYPES[e.t]} · ${entryLabel(e)}`)) return;
        setLog(sk, getLog(sk).filter((x) => x.id !== e.id));
        renderLog();
        renderLogNotice();
      },
    }, '✕') : null);
}

function addEntry(sk, type, eq, no) {
  const date = f.date.value;
  if (!date) { toast('Συμπλήρωσε την ημερομηνία.'); f.date.focus(); return; }
  if (date > todayISO()) { toast('Δεν γίνεται καταχώρηση για μελλοντική ημερομηνία.'); return; }
  const name = f.name.value.trim();
  if (!name) { toast('Συμπλήρωσε πρώτα το όνομα του υπευθύνου (πάνω).'); f.name.focus(); return; }
  const list = getLog(sk);
  if (list.some((e) => e.t === type && e.eq === eq.id && (e.no || 0) === no && e.d === date)) {
    toast('Έχει ήδη καταχωρηθεί για αυτή την ημέρα.');
    return;
  }
  list.push({ id: newId('e'), t: type, eq: eq.id, no, d: date, by: name, at: new Date().toISOString() });
  setLog(sk, list);
  toast(`✓ Καταχωρήθηκε: ${unitLabel(eq, no)} – ${LOG_TYPES[type]}, ${fmtDate(date)}`);
  renderLog();
  renderLogNotice();
}

/* ---- Ημερολόγιο μήνα ---- */

function calendarEl(sk, setup, type) {
  const ym = state.logCalMonth || ymOf(f.date.value || todayISO());
  const mi = monthInfo(ym);
  const entries = getLog(sk).filter((e) => ymOf(e.d) === ym);
  const tasks = markDone(planMonth(ym, type, setup.counts), entries, type, ym);
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
  const wk = weeklyDays(units, type);
  const nav = (n) => { state.logCalMonth = addMonths(ym, n); state.logCalDay = null; state.logCalOpen = true; renderLog(); };

  const det = h('details', { class: 'box cal', open: !!state.logCalOpen },
    h('summary', {}, `Πρόγραμμα μήνα – ${LOG_TYPES[type]}`),
    h('div', { class: 'cal-nav' },
      h('button', { type: 'button', 'aria-label': 'Προηγούμενος μήνας', onclick: () => nav(-1) }, '‹'),
      h('b', {}, monthLabel(ym)),
      h('button', { type: 'button', 'aria-label': 'Επόμενος μήνας', onclick: () => nav(1) }, '›')),
    h('div', { class: 'cal-grid' }, cells),
    h('p', { class: 'hint' }, 'Σε κάθε ημέρα: έγιναν / προτεινόμενα.', type === 'clean' ? ' Οι γενικές καθαριότητες δεν προγραμματίζονται Σάββατο και Κυριακή.' : ''),
    h('h3', {}, `${DAYS_FULL[mi.dow(sel)]} ${fmtDate(mi.iso(sel))}`),
    selTasks.length
      ? h('ul', { class: 'tasks' }, selTasks.map((t) => h('li', { class: 'task' + (t.done ? ' done' : '') },
        h('span', { class: 'task-text' }, t.u.label), h('span', { class: t.done ? 'done-tag' : 'todo-tag' }, t.done ? '✓ Έγινε' : '○'))))
      : h('p', { class: 'hint' }, 'Καμία προτεινόμενη εργασία.'),
    h('h3', {}, 'Σταθερό πρόγραμμα'),
    units.length
      ? h('ul', { class: 'plan-list' }, units.map((u) => {
        const mine = tasks.filter((t) => t.u.key === u.key).map((t) => t.day);
        const when = u.rule.per === 'month'
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
    counts[eq.id] = setup ? parseInt(setup.counts[eq.id], 10) || 0 : (eq.numbered ? 0 : 1);
  });

  const save = () => {
    const name = f.name.value.trim();
    if (!name) { toast('Συμπλήρωσε πρώτα το όνομα του υπευθύνου (πάνω).'); f.name.focus(); return; }
    if (editing && !confirm('Να αποθηκευτεί ο νέος εξοπλισμός; Αλλάζει το πρόγραμμα και ο έλεγχος του μήνα.')) return;
    setEquip(sk, { counts, since: setup && setup.since ? setup.since : todayISO(), by: name, at: new Date().toISOString() });
    state.logMode = 'main';
    renderLog();
    renderLogNotice();
    scrollToLog();
    toast('Ο εξοπλισμός του καταστήματος αποθηκεύτηκε.');
  };

  return h('div', { class: 'log' },
    h('div', { class: 'log-warn' },
      h('div', { class: 'log-warn-title' }, '⚠️ Προσοχή!'),
      editing
        ? h('p', {}, 'Αλλαγή εξοπλισμού του καταστήματος. Γίνεται ', h('b', {}, 'μόνο από τον/την υπεύθυνο καταστήματος'), ' και επηρεάζει το πρόγραμμα και τον έλεγχο του μήνα.')
        : [
          h('p', {}, `Πρώτη χρήση του αρχείου καθαριοτήτων/αποψύξεων για το κατάστημα «${storeLabel()}» σε αυτή τη συσκευή.`),
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
      editing ? h('button', { type: 'button', class: 'btn ghost', onclick: () => { state.logMode = 'main'; renderLog(); } }, 'Ακύρωση') : null));
}

/* ---- Αρχείο με κωδικό ---- */

function openArchive() {
  const hash = state.data.cleaning.passwordHash;
  if (!hash) { toast('Δεν έχει οριστεί κωδικός αρχείου. Ορίζεται στη Διαχείριση → Καθαριότητες.', 6000); return; }
  state.logMode = sessGet(LOG_LS.unlocked) === hash ? 'archive' : 'unlock';
  renderLog();
  scrollToLog();
}

function unlockForm() {
  const pw = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Κωδικός' });
  const go = async (e) => {
    e.preventDefault();
    let hash = '';
    try { hash = await pwHash(pw.value); } catch (x) { toast('Ο έλεγχος κωδικού δεν υποστηρίζεται σε αυτή τη σύνδεση.'); return; }
    if (hash !== state.data.cleaning.passwordHash) { toast('Λάθος κωδικός.'); pw.value = ''; pw.focus(); return; }
    sessSet(LOG_LS.unlocked, hash);
    state.logMode = 'archive';
    renderLog();
  };
  const form = h('form', { class: 'box', onsubmit: go },
    h('h2', {}, '🔒 Αρχείο καθαριοτήτων/αποψύξεων'),
    h('label', { class: 'field' }, 'Κωδικός αρχείου', pw),
    h('div', { class: 'stack' },
      h('button', { type: 'submit', class: 'btn dark' }, 'Είσοδος'),
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

function archiveView(sk) {
  const today = todayISO();
  const ym = state.logArchiveMonth || ymOf(today);
  const current = ym === ymOf(today);
  const rows = checkMonth(sk, ym, current ? today : null);
  const sum = unitSummary(rows);
  const entries = getLog(sk).filter((e) => ymOf(e.d) === ym)
    .sort((a, b) => (b.d + b.at).localeCompare(a.d + a.at));
  const fails = rows.filter((x) => !x.ok && x.ended);

  const setup = getEquip(sk) || { counts: {} };
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
        h('td', { class: 'c' }, `${s.done}/${s.req}`),
        h('td', {}, s.missed.length
          ? '✗ ' + s.missed.map((x) => (x.u.rule.per === 'month' ? 'μήνας' : `${x.a}–${x.b}/${ym.slice(5)}`)).join(', ')
          : s.pending ? '⏳ εκκρεμεί' : s.req ? '✓' : '—')))));
  };

  return h('div', { class: 'log' },
    h('div', { class: 'box' },
      h('h2', {}, `🔒 Αρχείο – ${storeLabel()}`),
      h('label', { class: 'field' }, 'Μήνας',
        h('select', { value: ym, onchange: (e) => { state.logArchiveMonth = e.target.value; renderLog(); } }, monthOptions(ym))),
      h('p', { class: 'hint' }, `Έγιναν: καταχωρήσεις του μήνα / όσες απαιτούνται. «—» = δεν μετράει ακόμα στον έλεγχο (ο εξοπλισμός δηλώθηκε ${fmtDate(setup.since)}).`),
      current ? h('p', { class: 'hint' }, 'Τρέχων μήνας: μετράνε μόνο οι εβδομάδες που έχουν ξεκινήσει.') : null),
    Object.entries(LOG_TYPES).map(([type, label]) => h('div', { class: 'box' }, h('h2', {}, label), table(type))),
    h('div', { class: 'box' },
      h('h2', {}, `Καταχωρήσεις (${entries.length})`),
      entries.length
        ? h('ul', { class: 'entries' }, entries.map((e) => entryRow(sk, e, true, true)))
        : h('p', { class: 'hint' }, 'Καμία καταχώρηση αυτόν τον μήνα.')),
    h('section', { class: 'actions' },
      h('button', { type: 'button', class: 'btn', onclick: () => openLogExport(sk, ym) }, 'Αποθήκευση σε Excel'),
      fails.length ? h('button', { type: 'button', class: 'btn viber', onclick: () => shareText(noticeText(storeLabel(), ym, fails)) }, 'Αποστολή όσων δεν έγιναν στο Viber') : null,
      h('button', {
        type: 'button',
        class: 'btn ghost',
        onclick: () => { sessSet(LOG_LS.unlocked, ''); state.logMode = 'main'; renderLog(); },
      }, 'Κλείδωμα και επιστροφή')));
}

/* ---------- Εξαγωγή σε Excel ---------- */

function openLogExport(sk, ymDefault) {
  const setup = getEquip(sk);
  if (!setup) return;
  const counts = Object.assign({}, setup.counts);
  const all = state.data.cleaning.equipment;
  const dlg = $('log-dialog');
  const selMonth = h('select', { value: ymDefault }, monthOptions(ymDefault));

  const download = async () => {
    dlg.close();
    const ym = selMonth.value;
    const blob = xlsxBlob([
      { name: LOG_TYPES.clean, xml: logSheetXml(sk, ym, 'clean', counts) },
      { name: LOG_TYPES.defrost, xml: logSheetXml(sk, ym, 'defrost', counts) },
      { name: 'Καταχωρήσεις', xml: logEntriesXml(sk, ym) },
    ]);
    const store = toLatin(storeLabel() || 'xoris-katastima').replace(/[^A-Za-z0-9-]+/g, '-');
    await deliverFile(blob, `kathariotites-apopsyxeis_${store}_${ym}.xlsx`);
  };

  $('log-dialog-body').replaceChildren(...[
    h('h2', {}, 'Αποθήκευση σε Excel'),
    h('label', { class: 'field' }, 'Μήνας', selMonth),
    h('p', { class: 'hint' }, 'Διάλεξε πόσα από το καθένα θα μπουν στο Excel. Οι τιμές έρχονται από τον εξοπλισμό του καταστήματος.'),
    all.filter((eq) => eq.numbered).map((eq) => h('label', { class: 'eq-row' },
      h('span', {}, eq.name),
      h('select', {
        value: String(parseInt(counts[eq.id], 10) || 0),
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

function logSheetXml(sk, ym, type, counts) {
  const mi = monthInfo(ym);
  const setup = getEquip(sk) || {};
  const entries = getLog(sk).filter((e) => ymOf(e.d) === ym && e.t === type);
  const units = logUnits(counts, type);
  const tasks = planMonth(ym, type, counts);
  const sum = unitSummary(checkUnits(units, type, entries, ym, setup.since || '', null));
  const D = 3; // πρώτη στήλη ημερών (D)
  const last = D + mi.dim;
  const we = (d) => mi.dow(d) === 0 || mi.dow(d) === 6;
  const s = sheetRows();

  s.add([[0, `${LOG_TITLES[type]} – ${storeLabel()} – ${monthLabel(ym)}`, XS.title]]);
  s.add([[0, `Κατάστημα: ${storeLabel()} · Μήνας: ${monthLabel(ym)} · Εξαγωγή: ${fmtDate(todayISO())}`, XS.label]]);
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

function logEntriesXml(sk, ym) {
  const entries = getLog(sk).filter((e) => ymOf(e.d) === ym)
    .sort((a, b) => (a.d + a.at).localeCompare(b.d + b.at));
  const s = sheetRows();
  s.add([[0, `Καταχωρήσεις καθαριοτήτων/αποψύξεων – ${storeLabel()} – ${monthLabel(ym)}`, XS.title]]);
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
  const p1 = h('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Νέος κωδικός' });
  const p2 = h('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Ξανά ο νέος κωδικός' });
  const setPw = async () => {
    if (p1.value.length < 4) { toast('Ο κωδικός θέλει τουλάχιστον 4 χαρακτήρες.'); return; }
    if (p1.value !== p2.value) { toast('Οι δύο κωδικοί δεν ταιριάζουν.'); return; }
    try { cfg.passwordHash = await pwHash(p1.value); } catch (e) { toast('Ο κωδικός δεν ορίστηκε: η σύνδεση δεν είναι ασφαλής (https).'); return; }
    markDirty(true);
    toast('Ο κωδικός ορίστηκε. Πάτα «Αποθήκευση για όλους» για να ισχύσει σε όλα τα κινητά.', 7000);
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

  return h('div', {},
    h('div', { class: 'box' },
      h('h2', {}, 'Κωδικός αρχείου'),
      h('p', { class: 'hint' }, cfg.passwordHash
        ? 'Έχει οριστεί κωδικός ✓. Γράψε νέο μόνο αν θέλεις να τον αλλάξεις.'
        : 'Δεν έχει οριστεί κωδικός. Χωρίς κωδικό το «Αρχείο» δεν ανοίγει.'),
      h('p', { class: 'warn' }, 'Μη χρησιμοποιείς κωδικό συναγερμού/POS ή κωδικό που χρησιμοποιείς αλλού.'),
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
