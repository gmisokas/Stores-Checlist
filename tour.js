'use strict';

/* ==========================================================
   DEMO – εκπαιδευτική περιήγηση
   Pop-up με οδηγίες πάνω στην εφαρμογή: φωτίζεται ένα σημείο και ο χρήστης
   το πατάει ο ίδιος (ή πατάει «Επόμενο» όπου δεν χρειάζεται πάτημα).
   Φορτώνεται μετά το app.js. Στο DEMO τίποτα δεν πάει στο κοινό αρχείο ή στο Viber.
   ========================================================== */

const TOUR_LS = 'cl-tour-offered';
const TOUR_CHAPTERS = {
  basic: 'Βασικά',
  check: 'ΑΝΟΙΓΜΑ / ΚΛΕΙΣΙΜΟ',
  log: 'ΚΑΘΑΡΙΟΤΗΤΕΣ / ΑΠΟΨΥΞΕΙΣ και ΕΚΚΡΕΜΟΤΗΤΕΣ',
  plan: 'Πρόγραμμα μήνα (υπεύθυνος)',
};
const tour = { steps: [], i: 0, root: null, timer: null, onClick: null, onChange: null };

const q = (sel) => document.querySelector(sel);
const fieldOf = (id) => () => { const el = $(id); return el && el.closest('label'); };
const logButton = (text) => () => [...document.querySelectorAll('#log-view .actions button')].find((b) => b.textContent.includes(text));

// sec: σε ποια οθόνη πρέπει να βρίσκεται η εφαρμογή για το βήμα (και όταν πατηθεί «Πίσω»).
// act: next = κουμπί «Επόμενο» · click = πατάει το φωτισμένο σημείο · cond = κάνει κάτι (π.χ. επιλογή) και συνεχίζει μόνο του.
const TOUR_STEPS = [
  { ch: 'basic', sec: 'none', sel: fieldOf('f-date'), act: 'next', title: 'Ημερομηνία',
    text: 'Συμπληρώνεται μόνη της με τη σημερινή. Η ημέρα αλλάζει στις 05:00, ώστε ένα κλείσιμο μετά τα μεσάνυχτα να μετράει για την ίδια βάρδια.' },
  { ch: 'basic', sec: 'none', sel: fieldOf('f-name'), act: 'next', title: 'Υπεύθυνος',
    text: 'Γράφεις το ονοματεπώνυμό σου μία φορά. Το κινητό το θυμάται και φαίνεται σε ό,τι στέλνεις.' },
  { ch: 'basic', sec: 'none', sel: fieldOf('f-store'), act: 'next', title: 'Κατάστημα',
    text: 'Διαλέγεις το κατάστημά σου. Τώρα είσαι στο DEMO, για δοκιμή. Κάθε κατάστημα έχει και τις δικές του γραμμές (με κίτρινο).' },
  { ch: 'basic', sec: 'none', sel: '#section-seg', act: 'next', title: 'Οι 4 ενότητες',
    text: 'ΑΝΟΙΓΜΑ και ΚΛΕΙΣΙΜΟ: τα checklist της βάρδιας. ΚΑΘΑΡΙΟΤΗΤΕΣ / ΑΠΟΨΥΞΕΙΣ: καταχώρηση. ΕΚΚΡΕΜΟΤΗΤΕΣ: ό,τι πρέπει να γίνει, με κόκκινο αριθμό.' },

  { ch: 'check', sec: null, sel: '#section-seg [data-section="opening"]', act: 'click', title: 'ΑΝΟΙΓΜΑ',
    text: 'Πάτα «ΑΝΟΙΓΜΑ» για να ανοίξει το checklist ανοίγματος.' },
  { ch: 'check', sec: 'opening', sel: '#items .item', act: 'next', title: 'Κάθε γραμμή, μία ενέργεια',
    text: 'Τις κάνεις με τη σειρά. Δίπλα σε κάθε γραμμή υπάρχουν ✓, ✗ και «Σημείωση».' },
  { ch: 'check', sec: 'opening', sel: '#items .item:nth-child(1) .mark.ok', act: 'click', title: '✓ Έγινε',
    text: 'Πάτα ✓ όταν η ενέργεια έγινε.' },
  { ch: 'check', sec: 'opening', sel: '#items .item:nth-child(2) .mark.no', act: 'click', title: '✗ Δεν έγινε',
    text: 'Πάτα ✗ όταν κάτι δεν έγινε.' },
  { ch: 'check', sec: 'opening', sel: '#items .item:nth-child(2) .note-btn', act: 'click', title: 'Σημείωση',
    text: 'Πάτα «Σημείωση» και γράψε γιατί δεν έγινε ή ό,τι πρέπει να ξέρει ο υπεύθυνος.' },
  { ch: 'check', sec: 'opening', sel: '.sticky .progress', act: 'next', title: 'Πρόοδος',
    text: 'Εδώ βλέπεις πόσα έγιναν και πόσα απομένουν. Η πρόοδος σώζεται στο κινητό, ακόμα κι αν κλείσει η σελίδα.' },
  { ch: 'check', sec: 'opening', sel: '#checklist-actions', act: 'next', title: 'Στο τέλος',
    text: '«Αποστολή στο Viber»: στέλνει τη σύνοψη και την αποθηκεύει στο αρχείο. Υπάρχουν και «Αποθήκευση στο αρχείο», Excel, εκτύπωση και «Καθαρισμός». Στο DEMO δεν στέλνεται τίποτα.' },
  { ch: 'check', sec: null, sel: '#section-seg [data-section="closing"]', act: 'click', title: 'ΚΛΕΙΣΙΜΟ',
    text: 'Πάτα «ΚΛΕΙΣΙΜΟ». Δουλεύει ακριβώς όπως το ΑΝΟΙΓΜΑ.' },
  { ch: 'check', sec: 'closing', sel: '#items .item.important', act: 'next', title: 'Κόκκινες γραμμές',
    text: 'Οι κόκκινες γραμμές είναι πολύ σημαντικές. Οι κίτρινες (στα καταστήματα) είναι ιδιαιτερότητες του καταστήματος.' },

  { ch: 'log', sec: null, sel: '#section-seg [data-section="todo"]', act: 'click', title: 'ΕΚΚΡΕΜΟΤΗΤΕΣ',
    text: 'Ο κόκκινος αριθμός δείχνει πόσα θέλουν ενέργεια. Πάτα «ΕΚΚΡΕΜΟΤΗΤΕΣ».' },
  { ch: 'log', sec: 'todo', sel: () => q('#log-view .todo-box.late') || q('#log-view .todo-box') || q('#log-view .todo'), act: 'next', title: 'Τι εκκρεμεί',
    text: 'Εδώ μαζεύονται όλα: σε καθυστέρηση, για σήμερα, τικ που δεν αποθηκεύτηκαν και οι ειδοποιήσεις. Σε καθυστέρηση = η ημέρα του προγράμματος πέρασε και δεν έγινε.' },
  { ch: 'log', sec: 'todo', sel: '#log-view .todo .actions .btn.primary', act: 'click', title: 'Πάμε για καταχώρηση',
    text: 'Η καταχώρηση γίνεται στις ΚΑΘΑΡΙΟΤΗΤΕΣ / ΑΠΟΨΥΞΕΙΣ. Πάτα το κουμπί.' },
  { ch: 'log', sec: 'log', sel: '.log-type', act: 'next', title: 'Είδος',
    text: 'Διαλέγεις «Γενική καθαριότητα» ή «Απόψυξη».' },
  { ch: 'log', sec: 'log', sel: '.log-grid select', act: 'cond', check: () => state.logSel && state.logSel.eq === 'apothiki', title: 'Εξοπλισμός / χώρος',
    text: 'Διάλεξε «Αποθήκη» από τη λίστα. Για καταψύξεις, ψυγεία και βιτρίνες διαλέγεις και Νο.' },
  { ch: 'log', sec: 'log', sel: '.log-tick', act: 'click', title: '✓ Αν έγινε, πατήστε',
    text: 'Πάτα ✓. Η εργασία μπαίνει στη λίστα «Προς αποθήκευση».' },
  { ch: 'log', sec: 'log', sel: '.save-log', act: 'click', title: 'Αποθήκευση στο αρχείο',
    text: 'Στο τέλος πάτα «Αποθήκευση στο αρχείο». Από κάτω γράφει «✓ Έγινε αποστολή». Μέχρι τότε τα τικ περιμένουν στο κινητό.' },
  { ch: 'log', sec: 'log', sel: '.skip-link', act: 'next', title: 'Δεν έγινε; Δήλωσε αιτία',
    text: 'Αν μια εργασία δεν μπορεί να γίνει (βλάβη, κλειστό κατάστημα, άλλο), τη δηλώνεις εδώ με την αιτία. Τότε δεν μετράει ως καθυστέρηση.' },
  { ch: 'log', sec: 'log', sel: 'details.cal', act: 'next', title: 'Ημερολόγιο',
    text: 'Το πρόγραμμα του μήνα: πράσινο = έγιναν, κίτρινο = καθυστέρηση, κόκκινο = δεν έγιναν.' },
  { ch: 'log', sec: 'log', sel: '#log-view .log > .actions', act: 'next', title: 'Υπόλοιπα κουμπιά',
    text: 'Αποστολή στο Viber (τι έγινε σήμερα), Excel, «Εξοπλισμός καταστήματος» (μόνο ο/η υπεύθυνος), «Πρόγραμμα μήνα» και «Αρχείο» (με κωδικό).' },

  { ch: 'plan', sec: 'log', sel: logButton('Πρόγραμμα μήνα'), act: 'click', title: 'Πρόγραμμα μήνα',
    text: 'Για τον/την υπεύθυνο καταστήματος, με δικό του κωδικό (στο DEMO χωρίς κωδικό). Πάτα το κουμπί.' },
  { ch: 'plan', sec: 'plan', sel: () => document.querySelectorAll('.planner select')[1], act: 'next', title: 'Εξοπλισμός / χώρος',
    text: 'Διαλέγεις ποιον εξοπλισμό προγραμματίζεις. Το ✓ δείχνει ότι καλύπτει τις οδηγίες, το ⚠️ ότι λείπουν ημέρες.' },
  { ch: 'plan', sec: 'plan', sel: '.planner .plan-status', act: 'next', title: 'Τι χρειάζεται',
    text: 'Πόσες φορές μπήκαν σε κάθε εβδομάδα σε σχέση με όσες ορίζονται (π.χ. «15–21: 1/1 ✓»).' },
  { ch: 'plan', sec: 'plan', sel: '.planner .cal-grid', act: 'next', title: 'Ημέρες',
    text: 'Πατάς τις ημέρες που θα γίνει η εργασία· ξαναπατάς για να τη βγάλεις. Οι ημέρες πριν από σήμερα κλειδώνουν και δείχνουν τι έγινε.' },
  { ch: 'plan', sec: 'plan', sel: '.planner .btn.auto', act: 'next', title: 'Αυτόματη κατανομή',
    text: 'Η εφαρμογή μοιράζει μόνη της τις ημέρες για τον εξοπλισμό που φαίνεται. Από κάτω, η «Αφαίρεση όλων των εργασιών του μήνα». Και τα δύο αλλάζουν μόνο από σήμερα και μετά.' },
  { ch: 'plan', sec: 'plan', sel: '.planner > .actions', act: 'next', title: 'Αποθήκευση προγράμματος',
    text: 'Αν λείπουν ημέρες, δεν αποθηκεύεται και φαίνεται τι λείπει. Υπάρχει και «Αντιγραφή από τον προηγούμενο μήνα». Στο DEMO αποθηκεύεται μόνο για δοκιμή.' },
];

// Η εφαρμογή στην οθόνη που χρειάζεται το βήμα.
function tourEnsure(sec) {
  if (!sec) return;
  if (sec === 'none') {
    if (state.section) { state.section = ''; renderChecklist(); }
    return;
  }
  if (sec === 'plan') {
    if (state.section !== 'log' || state.logMode !== 'plan') { state.section = 'log'; renderChecklist(); openPlanner(DEMO_ID); }
    return;
  }
  if (sec === 'log') {
    if (state.section !== 'log' || state.logMode !== 'main') {
      state.section = 'log';
      state.logMode = 'main';
      state.planEdit = null;
      state.logType = 'clean';
      renderChecklist();
    }
    return;
  }
  if (state.section !== sec) { state.section = sec; renderChecklist(); }
}

function tourTarget(step) {
  if (!step || !step.sel) return null;
  const el = typeof step.sel === 'function' ? step.sel() : q(step.sel);
  return el && el.getClientRects().length ? el : null;
}

function tourRoot() {
  if (tour.root) return tour.root;
  const root = h('div', { class: 'tour', hidden: true },
    ...['t', 'b', 'l', 'r'].map((p) => h('div', { class: 'tour-block tour-' + p, onclick: () => tourNudge() })),
    h('div', { class: 'tour-ring' }),
    h('div', { class: 'tour-card', role: 'dialog', 'aria-live': 'polite' }));
  document.body.append(root);
  tour.root = root;
  window.addEventListener('resize', tourPlace);
  window.addEventListener('scroll', tourPlace, true);
  return root;
}

function tourNudge() {
  const card = tour.root && tour.root.querySelector('.tour-card');
  if (!card) return;
  card.classList.remove('nudge');
  void card.offsetWidth;
  card.classList.add('nudge');
}

// Θέση του φωτισμένου σημείου, των σκοτεινών περιοχών γύρω του και του pop-up.
function tourPlace() {
  const root = tour.root;
  if (!root || root.hidden) return;
  const step = tour.steps[tour.i];
  const el = step ? tourTarget(step) : null;
  const card = root.querySelector('.tour-card');
  const ring = root.querySelector('.tour-ring');
  const W = window.innerWidth;
  const H = window.innerHeight;
  const set = (p, x, y, w, hh) => Object.assign(root.querySelector('.tour-' + p).style, { left: x + 'px', top: y + 'px', width: Math.max(0, w) + 'px', height: Math.max(0, hh) + 'px' });
  if (!el) {
    set('t', 0, 0, W, H); set('b', 0, 0, 0, 0); set('l', 0, 0, 0, 0); set('r', 0, 0, 0, 0);
    ring.hidden = true;
    card.className = 'tour-card center';
    return;
  }
  const pad = 6;
  const r = el.getBoundingClientRect();
  const x1 = Math.max(0, r.left - pad);
  const y1 = Math.max(0, r.top - pad);
  const x2 = Math.min(W, r.right + pad);
  const y2 = Math.min(H, r.bottom + pad);
  set('t', 0, 0, W, y1);
  set('b', 0, y2, W, H - y2);
  set('l', 0, y1, x1, y2 - y1);
  set('r', x2, y1, W - x2, y2 - y1);
  ring.hidden = false;
  Object.assign(ring.style, { left: x1 + 'px', top: y1 + 'px', width: (x2 - x1) + 'px', height: (y2 - y1) + 'px' });
  // Το pop-up μπαίνει στο μισό της οθόνης που δεν έχει το φωτισμένο σημείο.
  card.className = 'tour-card ' + ((r.top + r.bottom) / 2 < H / 2 ? 'bottom' : 'top');
}

function tourShow(i) {
  tourRoot();
  tour.i = i;
  const step = tour.steps[i];
  if (!step) { tourEnd(); return; }
  tourEnsure(step.sec);
  const card = tour.root.querySelector('.tour-card');
  const total = tour.steps.length;
  card.replaceChildren(
    h('div', { class: 'tour-head' },
      h('span', { class: 'tour-ch' }, `🎓 ${TOUR_CHAPTERS[step.ch]} · ${i + 1}/${total}`),
      h('button', { type: 'button', class: 'tour-x', 'aria-label': 'Έξοδος από την περιήγηση', onclick: tourStop }, '✕')),
    h('h3', {}, step.title),
    h('p', {}, step.text),
    h('div', { class: 'tour-nav' },
      i > 0 ? h('button', { type: 'button', class: 'btn ghost', onclick: () => tourShow(i - 1) }, '‹ Πίσω') : h('span'),
      step.act === 'next'
        ? h('button', { type: 'button', class: 'btn dark', onclick: () => tourShow(i + 1) }, i === total - 1 ? 'Τέλος' : 'Επόμενο ›')
        : h('span', { class: 'tour-tap' }, step.act === 'click' ? '👆 Πάτα το φωτισμένο σημείο' : '👆 Κάνε την επιλογή')));
  tour.root.hidden = false;
  const el = tourTarget(step);
  if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' });
  tourPlace();
}

// Ελέγχει συνέχεια: η εφαρμογή ξαναχτίζει οθόνες, οπότε το σημείο ξαναβρίσκεται.
function tourTick() {
  const step = tour.steps[tour.i];
  if (!step) return;
  if (step.act === 'cond' && step.check()) { tourShow(tour.i + 1); return; }
  tourPlace();
}

function tourStart(ch) {
  if (!isDemo()) {
    f.store.value = DEMO_ID;
    f.store.dispatchEvent(new Event('change'));
  }
  tourStop();
  tour.steps = TOUR_STEPS.filter((s) => !ch || s.ch === ch);
  // Το πάτημα στο φωτισμένο σημείο ελέγχεται πριν το χειριστεί η εφαρμογή (η οθόνη μπορεί να ξαναχτιστεί)
  // και η περιήγηση συνεχίζει λίγο μετά.
  tour.onClick = (e) => {
    const step = tour.steps[tour.i];
    if (!step || step.act !== 'click' || tour.root.hidden) return;
    const el = tourTarget(step);
    if (el && el.contains(e.target)) setTimeout(() => { if (tour.steps[tour.i] === step) tourShow(tour.i + 1); }, 150);
  };
  tour.onChange = () => setTimeout(tourTick, 50);
  document.addEventListener('click', tour.onClick, true);
  document.addEventListener('change', tour.onChange);
  tour.timer = setInterval(tourTick, 400);
  tourShow(0);
}

function tourStop() {
  if (tour.timer) clearInterval(tour.timer);
  tour.timer = null;
  if (tour.onClick) document.removeEventListener('click', tour.onClick, true);
  if (tour.onChange) document.removeEventListener('change', tour.onChange);
  tour.onClick = null;
  tour.onChange = null;
  if (tour.root) tour.root.hidden = true;
}

// Παράθυρο στη μέση της οθόνης (αρχή, τέλος, πρόταση την πρώτη φορά).
function tourModal(title, text, buttons) {
  tourStop();
  tourRoot();
  tour.steps = [];
  const card = tour.root.querySelector('.tour-card');
  card.replaceChildren(
    h('div', { class: 'tour-head' },
      h('span', { class: 'tour-ch' }, '🎓 DEMO – εκπαίδευση'),
      h('button', { type: 'button', class: 'tour-x', 'aria-label': 'Κλείσιμο', onclick: tourStop }, '✕')),
    h('h3', {}, title),
    h('p', {}, text),
    h('div', { class: 'stack tour-menu' }, buttons));
  tour.root.hidden = false;
  tourPlace();
}

function tourMenu() {
  tourModal('Περιήγηση στην εφαρμογή',
    'Δοκίμασε την εφαρμογή χωρίς κίνδυνο: στο DEMO τίποτα δεν αποθηκεύεται στο κοινό αρχείο και τίποτα δεν στέλνεται στο Viber. Διάλεξε τι θέλεις να δεις.',
    [h('button', { type: 'button', class: 'btn dark', onclick: () => tourStart('') }, '▶ Όλη η περιήγηση'),
      ...Object.entries(TOUR_CHAPTERS).map(([k, label]) => h('button', { type: 'button', class: 'btn', onclick: () => tourStart(k) }, label)),
      h('button', { type: 'button', class: 'btn ghost', onclick: tourStop }, 'Δοκιμή μόνος μου')]);
}

function tourEnd() {
  tourModal('Τέλος! 🎉',
    'Αυτά ήταν τα βασικά. Μπορείς να συνεχίσεις να δοκιμάζεις στο DEMO ή να διαλέξεις το κατάστημά σου για να ξεκινήσεις.',
    [h('button', { type: 'button', class: 'btn dark', onclick: tourLeave }, 'Έξοδος από το DEMO'),
      h('button', { type: 'button', class: 'btn', onclick: tourMenu }, 'Ξανά από την αρχή'),
      h('button', { type: 'button', class: 'btn ghost', onclick: tourStop }, 'Μένω στο DEMO')]);
}

function tourLeave() {
  tourStop();
  f.store.value = lsGet(LS.last, {}).store || '';
  f.store.dispatchEvent(new Event('change'));
  window.scrollTo(0, 0);
}

// Την πρώτη φορά σε κάθε κινητό: πρόταση για περιήγηση (μετά τις οδηγίες εγκατάστασης, αν ανοίξουν).
function initTour() {
  $('demo-help').addEventListener('click', tourMenu);
  if (isDemo()) resetDemo();
  if (lsGet(TOUR_LS, false) || location.hash === '#admin') return;
  const offer = () => {
    lsSet(TOUR_LS, true);
    tourModal('Καλώς ήρθες! 👋',
      'Θέλεις μια γρήγορη περιήγηση για το τι κάνει κάθε κουμπί; Γίνεται στο DEMO, χωρίς να αποθηκεύεται ή να στέλνεται τίποτα. Υπάρχει πάντα στο «Κατάστημα» → DEMO.',
      [h('button', { type: 'button', class: 'btn dark', onclick: () => { tourStop(); f.store.value = DEMO_ID; f.store.dispatchEvent(new Event('change')); } }, 'Ναι, ξεκίνα'),
        h('button', { type: 'button', class: 'btn ghost', onclick: tourStop }, 'Όχι τώρα')]);
  };
  const a2hs = $('a2hs');
  if (a2hs.open) a2hs.addEventListener('close', offer, { once: true });
  else offer();
}
