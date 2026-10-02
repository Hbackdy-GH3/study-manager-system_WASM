var state = null;
var currentView = 'today';
var topicFilter = 'All';
var topicSubject = '';
var topicQuery = '';
var topicPrio = '';
var topicGroup = false;
var calYear = 0;
var calMonth = 0;
var syncChain = Promise.resolve();

var Module = {
  print: function (t) { console.log(t); },
  printErr: function (t) { console.warn(t); },
  onRuntimeInitialized: function () {
    var fs = window.FS || Module.FS;
    try { fs.mkdir('/data'); } catch (e) {}
    fs.mount(fs.filesystems.IDBFS || window.IDBFS, {}, '/data');
    fs.syncfs(true, function () {
      Module.ccall('wasm_init', 'number', [], []);
      persist();
      boot();
    });
  }
};

function api(name, ret, types, args) {
  return Module.ccall(name, ret, types || [], args || []);
}

function persist() {
  var fs = window.FS || Module.FS;
  syncChain = syncChain.then(function () {
    return new Promise(function (resolve) {
      fs.syncfs(false, function () { resolve(); });
    });
  });
  return syncChain;
}

function refresh() {
  state = JSON.parse(api('wasm_get_state', 'string'));
}

function boot() {
  refresh();
  var d = ymdToDate(state.today);
  calYear = d.getFullYear();
  calMonth = d.getMonth();
  document.getElementById('loading').hidden = true;
  document.getElementById('app').hidden = false;
  document.querySelectorAll('.nav button').forEach(function (b) {
    b.addEventListener('click', function () { show(b.dataset.view); });
  });
  document.getElementById('btn-export').addEventListener('click', exportData);
  document.getElementById('btn-import').addEventListener('click', function () {
    document.getElementById('import-file').click();
  });
  document.getElementById('import-file').addEventListener('change', function (e) {
    var file = e.target.files[0];
    e.target.value = '';
    if (file) importData(file);
  });
  document.getElementById('toast-undo').addEventListener('click', function () {
    var fn = toastUndo;
    hideToast();
    if (fn) fn();
  });
  document.addEventListener('click', function (e) {
    document.querySelectorAll('details.menu[open]').forEach(function (m) {
      if (!m.contains(e.target)) m.open = false;
    });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      document.querySelectorAll('details.menu[open]').forEach(function (m) { m.open = false; });
    }
  });
  ['today', 'topics', 'plan', 'progress'].forEach(function (v) { bindView(document.getElementById('view-' + v)); });
  render();
  openFileDb().then(cleanOrphanFiles).then(refreshFileCounts).then(function () {
    if (currentView !== 'plan' || state.plan.exists) render();
  });
}

function show(view) {
  currentView = view;
  document.querySelectorAll('.nav button').forEach(function (b) {
    if (b.dataset.view === view) {
      b.setAttribute('aria-current', 'page');
    } else {
      b.removeAttribute('aria-current');
    }
  });
  document.querySelectorAll('.view').forEach(function (v) {
    v.hidden = v.id !== 'view-' + view;
  });
  render();
  window.scrollTo(0, 0);
}

function changed(message, undo) {
  persist();
  refresh();
  render();
  if (message) toast(message, undo);
}

function render() {
  if (currentView === 'today') renderToday();
  if (currentView === 'topics') renderTopicsView();
  if (currentView === 'plan') renderPlanView();
  if (currentView === 'progress') renderProgressView();
}

function onFilesChanged() {
  if (currentView === 'plan' && !state.plan.exists) return;
  render();
}

/* ---------- helpers ---------- */

function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function ymdToDate(ymd) {
  return new Date(Math.floor(ymd / 10000), Math.floor(ymd / 100) % 100 - 1, ymd % 100);
}
function dateToYmd(d) {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}
function ymdToInput(ymd) {
  var s = String(ymd);
  return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8);
}
function inputToYmd(v) {
  if (!v) return 0;
  return parseInt(v.replace(/-/g, ''), 10);
}
function addDays(ymd, n) {
  var d = ymdToDate(ymd);
  d.setDate(d.getDate() + n);
  return dateToYmd(d);
}
function dayDiff(a, b) {
  return Math.round((ymdToDate(b) - ymdToDate(a)) / 86400000);
}
function niceDate(ymd, withYear) {
  var o = { day: 'numeric', month: 'short' };
  if (withYear) o.year = 'numeric';
  return ymdToDate(ymd).toLocaleDateString('en-GB', o);
}
function longDate(ymd) {
  return ymdToDate(ymd).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}
function prioName(p) { return p === 1 ? 'High' : (p === 0 ? 'Medium' : 'Low'); }
function prioClass(p) { return p === 1 ? 'p-high' : (p === 0 ? 'p-medium' : 'p-low'); }
function topicById(id) {
  for (var i = 0; i < state.topics.length; i++) {
    if (state.topics[i].id === id) return state.topics[i];
  }
  return null;
}
function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }
function subjects() {
  var seen = {};
  var out = [];
  state.topics.forEach(function (t) {
    var k = t.subject.toLowerCase();
    if (!seen[k]) { seen[k] = true; out.push(t.subject); }
  });
  return out.sort(function (a, b) { return a.localeCompare(b); });
}
function planActive() { return state.plan.exists && state.plan.stage === 'active'; }
function leftToday() {
  if (!planActive() || state.plan.done >= state.plan.totals) return 0;
  return Math.max(0, state.plan.morningTarget - state.report.donePlanToday);
}
function planQueued() {
  return state.queue.filter(function (id) { var t = topicById(id); return t && t.inPlan && !t.done; }).length;
}
function canFill() { return leftToday() > planQueued(); }

var toastTimer = null;
var toastUndo = null;
function toast(msg, undo) {
  var t = document.getElementById('toast');
  document.getElementById('toast-text').textContent = msg;
  toastUndo = undo || null;
  document.getElementById('toast-undo').hidden = !undo;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, undo ? 6000 : 3000);
}
function hideToast() {
  document.getElementById('toast').hidden = true;
  toastUndo = null;
}

function openDialog(html, setup) {
  var dlg = document.getElementById('dlg');
  var body = document.getElementById('dlg-body');
  body.innerHTML = html;
  return new Promise(function (resolve) {
    var result = { value: 'cancel', data: null };
    function close(value, data) {
      result = { value: value, data: data || null };
      dlg.close();
    }
    dlg.addEventListener('close', function onClose() {
      dlg.removeEventListener('close', onClose);
      resolve(result);
    });
    body.querySelectorAll('[data-close]').forEach(function (b) {
      b.addEventListener('click', function () { close(b.dataset.close); });
    });
    if (setup) setup(body, close);
    dlg.showModal();
    var first = body.querySelector('[autofocus], input:not([type=hidden]):not([type=radio]), select');
    if (first) first.focus();
  });
}

function confirmBox(title, text, okLabel, danger) {
  return openDialog(
    '<h2>' + esc(title) + '</h2><p class="muted">' + esc(text) + '</p>' +
    '<div class="dlg-actions"><button class="btn btn-quiet" data-close="cancel">Cancel</button>' +
    '<button class="btn ' + (danger ? 'btn-danger' : 'btn-teal') + '" data-close="ok">' + esc(okLabel) + '</button></div>'
  ).then(function (r) { return r.value === 'ok'; });
}

function messageBox(title, text) {
  return openDialog('<h2>' + esc(title) + '</h2><p>' + esc(text) + '</p><div class="dlg-actions"><button class="btn btn-teal" data-close="ok" autofocus>OK</button></div>');
}

function icon(name, size) {
  var p = {
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    dots: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    left: '<path d="M15 6l-6 6 6 6"/>',
    right: '<path d="M9 6l6 6-6 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    clip: '<path d="M21 11l-8.5 8.5a5 5 0 01-7-7L14 4a3.5 3.5 0 015 5l-8.5 8.5a2 2 0 01-3-3L15 7"/>',
    skip: '<path d="M5 5l9 7-9 7z"/><path d="M19 5v14"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1"/>',
    fill: '<path d="M12 4v12M6 10l6 6 6-6M5 20h14"/>'
  }[name];
  var s = size || 20;
  return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
}

/* ---------- actions on topics ---------- */

function markDone(id) {
  var t = topicById(id);
  if (!t || t.done) return;
  var pos = state.queue.indexOf(id);
  if (pos !== -1) {
    api('wasm_finish_queue_topic', 'number', ['number', 'number'], [id, 1]);
  } else {
    api('wasm_set_status', 'number', ['number', 'number'], [id, 1]);
  }
  changed('Marked “' + t.chapter + '” as done', function () {
    api('wasm_set_completed', 'number', ['number', 'number'], [id, 0]);
    if (pos !== -1) api('wasm_queue_at', 'number', ['number', 'number'], [id, pos]);
    changed('Undone');
  });
}

function markPending(id) {
  var t = topicById(id);
  if (!t || !t.done) return;
  var day = t.completedOn;
  api('wasm_set_completed', 'number', ['number', 'number'], [id, 0]);
  changed('“' + t.chapter + '” is pending again', function () {
    api('wasm_set_completed', 'number', ['number', 'number'], [id, day || state.today]);
    changed('Undone');
  });
}

function toggleDone(id) {
  var t = topicById(id);
  if (!t) return;
  if (t.done) {
    markPending(id);
  } else {
    markDone(id);
  }
}

function queueTopic(id) {
  var t = topicById(id);
  var r = api('wasm_enqueue_topic', 'number', ['number'], [id]);
  if (r === 1) {
    changed((t.done ? 'Added for revision: ' : 'Added to today: ') + t.chapter, function () {
      api('wasm_finish_queue_topic', 'number', ['number', 'number'], [id, 0]);
      changed('Undone');
    });
  } else {
    changed('Already in today’s queue');
  }
}

function unqueueTopic(id) {
  var t = topicById(id);
  var pos = state.queue.indexOf(id);
  if (pos === -1) return;
  api('wasm_finish_queue_topic', 'number', ['number', 'number'], [id, 0]);
  changed('Removed “' + t.chapter + '” from today', function () {
    api('wasm_queue_at', 'number', ['number', 'number'], [id, pos]);
    changed('Undone');
  });
}

function fillQueue() {
  var r = api('wasm_fill_queue', 'number');
  if (r > 0) {
    changed(plural(r, 'topic') + ' added from your plan');
    return;
  }
  if (r === -1) toast('Make a study plan first');
  else if (r === -2) toast('Nothing left for today in your plan');
  else toast('Today’s plan topics are already in your queue');
  changed();
}

/* ---------- shared pieces ---------- */

function greeting() {
  var h = new Date().getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function paceInfo() {
  var p = state.plan;
  if (!p.exists) return null;
  var left = p.totals - p.done;
  if (p.stage === 'ended') {
    if (left === 0) return { cls: 'good', badge: 'Finished', text: 'Plan finished. Every topic is done.' };
    return { cls: 'bad', badge: 'Ended', text: 'The plan ended with ' + plural(left, 'topic') + ' left. Extend the end date to keep going.' };
  }
  if (p.stage === 'notstarted') return { cls: 'soft', badge: 'Starts ' + niceDate(p.start), text: 'Starts on ' + longDate(p.start) + '. You will need about ' + p.basePace + ' a day.' };
  if (left === 0) return { cls: 'good', badge: 'All done', text: 'Every topic in this plan is done.' };
  if (p.diff > 0) return { cls: 'warn', badge: 'Behind', text: 'Behind plan. You now need ' + plural(p.target, 'topic') + ' a day, ' + p.diff + ' more than planned.' };
  if (p.diff < 0) return { cls: 'good', badge: 'Ahead', text: 'Ahead of plan. ' + plural(p.target, 'topic') + ' a day is enough now.' };
  return { cls: 'good', badge: 'On track', text: 'On track. Keep doing ' + plural(p.basePace, 'topic') + ' a day.' };
}

function percent() {
  var p = state.plan;
  if (!p.exists || p.totals === 0) return 0;
  return Math.floor(p.done * 100 / p.totals);
}

function ringSvg(value, total, size) {
  var r = 26;
  var c = 2 * Math.PI * r;
  var frac = total > 0 ? Math.min(1, value / total) : 0;
  var color = total > 0 && value >= total ? '#0F6B3E' : '#0F4C5C';
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 64 64" aria-hidden="true">' +
    '<circle cx="32" cy="32" r="' + r + '" fill="none" stroke="#E3DACB" stroke-width="7"/>' +
    '<circle cx="32" cy="32" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="7" stroke-linecap="round" stroke-dasharray="' + (frac * c).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 32 32)"/>' +
    '<text x="32" y="37" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-size="15" font-weight="700" fill="#14262B">' + value + '/' + total + '</text></svg>';
}

function calendarHtml() {
  var first = new Date(calYear, calMonth, 1);
  var start = new Date(calYear, calMonth, 1 - ((first.getDay() + 6) % 7));
  var doneDays = {};
  state.topics.forEach(function (t) { if (t.completedOn) doneDays[t.completedOn] = (doneDays[t.completedOn] || 0) + 1; });
  var cells = '';
  ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].forEach(function (d) { cells += '<span class="dow">' + d + '</span>'; });
  for (var i = 0; i < 42; i++) {
    var d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    if (i >= 35 && d.getMonth() !== calMonth) break;
    var ymd = dateToYmd(d);
    var cls = 'd';
    var label = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
    if (d.getMonth() !== calMonth) cls += ' other';
    if (state.plan.exists && ymd >= state.plan.start && ymd <= state.plan.end) { cls += ' plan'; label += ', plan day'; }
    if (state.plan.exists && ymd === state.plan.end) { cls += ' end'; label += ', plan ends'; }
    if (ymd === state.today) { cls += ' today'; label += ', today'; }
    if (doneDays[ymd]) { cls += ' done'; label += ', ' + plural(doneDays[ymd], 'topic') + ' done'; }
    cells += '<span class="' + cls + '" title="' + label + '">' + d.getDate() + '</span>';
  }
  var title = first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  return '<section class="card"><div class="cal-head"><h2>' + title + '</h2><div class="cal-nav">' +
    '<button class="icon-btn" data-cal="-1" aria-label="Previous month">' + icon('left') + '</button>' +
    '<button class="icon-btn" data-cal="1" aria-label="Next month">' + icon('right') + '</button></div></div>' +
    '<div class="cal">' + cells + '</div>' +
    '<div class="legend"><span><i style="background:#0F4C5C"></i>Today</span>' + (state.plan.exists ? '<span><i style="background:#DCEBEE"></i>Plan days</span>' : '') + '<span><i style="background:#0F6B3E;width:6px;height:6px"></i>Studied</span></div></section>';
}

/* ---------- topics table ---------- */

function topicsCardHtml(tall) {
  var all = state.topics.length;
  var done = state.topics.filter(function (t) { return t.done; }).length;
  var counts = { All: all, Pending: all - done, Done: done };
  var subs = subjects();
  if (topicSubject && subs.indexOf(topicSubject) === -1) topicSubject = '';
  var head = topicGroup
    ? '<tr><th class="c-check"><span class="sr">Done</span></th><th>Chapter</th><th class="c-prio">Priority</th><th class="c-act">Actions</th></tr>'
    : '<tr><th class="c-no" title="Position in your list">No.</th><th class="c-check"><span class="sr">Done</span></th><th>Chapter</th><th class="c-subject">Subject</th><th class="c-prio">Priority</th><th class="c-act">Actions</th></tr>';
  return '<section class="card topics-card">' +
    '<div class="card-head"><h2>' + (tall ? 'All topics' : 'Your topics') + '</h2><div class="focus-actions">' +
    '<div class="tabs" role="group" aria-label="Arrange"><button data-arrange="list" aria-pressed="' + !topicGroup + '" title="Same order as your linked list">List order</button><button data-arrange="group" aria-pressed="' + topicGroup + '">By subject</button></div>' +
    (tall ? listMenuHtml() : '<button class="btn btn-link" data-go="topics">Open full list</button>') + '</div></div>' +
    '<div class="filters">' +
    '<div class="tabs" role="group" aria-label="Status">' +
    ['All', 'Pending', 'Done'].map(function (f) {
      return '<button data-filter="' + f + '" aria-pressed="' + (topicFilter === f) + '">' + f + '<b>' + counts[f] + '</b></button>';
    }).join('') + '</div>' +
    '<select class="select" data-prio aria-label="Priority"><option value="">All priorities</option>' +
    [[1, 'High'], [0, 'Medium'], [-1, 'Low']].map(function (o) { return '<option value="' + o[0] + '"' + (String(o[0]) === topicPrio ? ' selected' : '') + '>' + o[1] + ' priority</option>'; }).join('') + '</select>' +
    (subs.length > 1 ? '<select class="select" data-subject aria-label="Subject"><option value="">All subjects</option>' +
      subs.map(function (s) { return '<option' + (s === topicSubject ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select>' : '') +
    '<input class="search" type="search" placeholder="Search chapter or subject" aria-label="Search topics" value="' + esc(topicQuery) + '">' +
    '</div>' +
    '<p class="hint" data-count></p>' +
    '<div class="table-box' + (tall ? ' tall' : '') + '"><table><thead>' + head + '</thead><tbody>' + rowsHtml() + '</tbody></table></div></section>';
}

function listMenuHtml() {
  return '<details class="menu"><summary class="btn btn-quiet btn-sm">List tools</summary><div class="menu-pop" role="menu">' +
    '<button role="menuitem" data-act="bulk-queue">' + icon('plus', 16) + 'Add several to today’s queue</button>' +
    '<button role="menuitem" data-act="delete-first">' + icon('trash', 16) + 'Delete first topic</button>' +
    '<button role="menuitem" data-act="delete-last">' + icon('trash', 16) + 'Delete last topic</button>' +
    '</div></details>';
}

function filteredTopics() {
  var q = topicQuery.trim().toLowerCase();
  return state.topics.filter(function (t) {
    if (topicFilter === 'Pending' && t.done) return false;
    if (topicFilter === 'Done' && !t.done) return false;
    if (topicPrio !== '' && String(t.priority) !== topicPrio) return false;
    if (topicSubject && t.subject !== topicSubject) return false;
    if (q && (t.subject + ' ' + t.chapter).toLowerCase().indexOf(q) === -1) return false;
    return true;
  });
}

function rowsHtml() {
  var cols = topicGroup ? 4 : 6;
  var rows = filteredTopics();
  if (state.topics.length === 0) {
    return '<tr><td colspan="' + cols + '" class="no-rows">No topics yet. Add your first one with “Add topic”.</td></tr>';
  }
  if (rows.length === 0) {
    return '<tr><td colspan="' + cols + '" class="no-rows">Nothing matches these filters.</td></tr>';
  }
  if (!topicGroup) {
    return rows.map(function (t) { return rowHtml(t); }).join('');
  }
  var groups = {};
  var order = [];
  rows.forEach(function (t) {
    if (!groups[t.subject]) { groups[t.subject] = []; order.push(t.subject); }
    groups[t.subject].push(t);
  });
  order.sort(function (a, b) { return a.localeCompare(b); });
  var html = '';
  order.forEach(function (s) {
    var list = groups[s];
    var d = list.filter(function (t) { return t.done; }).length;
    html += '<tr class="group-row"><td colspan="4">' + esc(s) + '<span>' + d + ' of ' + list.length + ' done</span></td></tr>';
    list.forEach(function (t) { html += rowHtml(t); });
  });
  return html;
}

function positionOf(id) {
  for (var i = 0; i < state.topics.length; i++) {
    if (state.topics[i].id === id) return i + 1;
  }
  return 0;
}

function rowHtml(t) {
  var qBtn;
  if (t.inQueue) {
    qBtn = '<button class="btn btn-sm q-btn queued" data-unqueue="' + t.id + '" title="In today’s queue. Click to remove.">' + icon('check', 16) + '<span class="lbl-long">Today</span></button>';
  } else if (t.done) {
    qBtn = '<button class="btn btn-sm btn-quiet q-btn" data-queue="' + t.id + '" title="Add to today for revision">' + icon('plus', 16) + '<span class="lbl-long">Revise</span></button>';
  } else {
    qBtn = '<button class="btn btn-sm btn-quiet q-btn" data-queue="' + t.id + '" title="Add to today’s queue">' + icon('plus', 16) + '<span class="lbl-long">Today</span></button>';
  }
  var n = fileCounts[t.id] || 0;
  var prio = '<span class="chip ' + prioClass(t.priority) + '">' + prioName(t.priority) + '</span>';
  return '<tr class="' + (t.done ? 'is-done' : '') + '">' +
    (topicGroup ? '' : '<td class="c-no">' + positionOf(t.id) + '</td>') +
    '<td class="c-check"><button class="check" role="checkbox" aria-checked="' + (t.done ? 'true' : 'false') + '" data-toggle="' + t.id + '" aria-label="' + esc(t.chapter) + ' done">' + icon('check') + '</button></td>' +
    '<td class="c-chapter"><span class="ch-name">' + esc(t.chapter) + '</span>' + (t.inPlan ? '<span class="chip plan">Plan</span>' : '') +
    '<span class="sub-mobile">' + (topicGroup ? '' : '<span class="sm-sub">' + esc(t.subject) + '</span> ') + '<span class="sm-prio">' + prio + '</span></span></td>' +
    (topicGroup ? '' : '<td class="c-subject">' + esc(t.subject) + '</td>') +
    '<td class="c-prio">' + prio + '</td>' +
    '<td class="c-act"><div class="row-actions">' + qBtn +
    '<button class="icon-btn clip-btn' + (n ? ' has' : '') + '" data-files="' + t.id + '" aria-label="Files for ' + esc(t.chapter) + (n ? ', ' + plural(n, 'file') : '') + '" title="Notes and files">' + icon('clip') + (n ? '<b>' + n + '</b>' : '') + '</button>' +
    '<button class="icon-btn" data-edit="' + t.id + '" aria-label="Details for ' + esc(t.chapter) + '" title="Details and edit">' + icon('dots') + '</button></div></td></tr>';
}

function refreshRows(root) {
  root.querySelectorAll('.topics-card tbody').forEach(function (tb) { tb.innerHTML = rowsHtml(); });
  updateCount(root);
}

function updateCount(root) {
  var shown = filteredTopics().length;
  root.querySelectorAll('[data-count]').forEach(function (p) {
    p.textContent = shown === state.topics.length ? plural(shown, 'topic') + (topicGroup ? ', grouped by subject' : ', in list order (No. is the position in your list)') : 'Showing ' + shown + ' of ' + plural(state.topics.length, 'topic');
  });
}

/* one delegated listener per view, bound once */
function bindView(root) {
  root.addEventListener('click', function (e) {
    var el = e.target.closest('button, [data-go]');
    if (!el || !root.contains(el)) return;
    var d = el.dataset;
    if (el.closest('.menu-pop')) {
      var det = el.closest('details');
      if (det) det.open = false;
    }
    if (d.go) { if (d.go === 'topics-pending') { topicFilter = 'Pending'; show('topics'); } else { show(d.go); } return; }
    if (d.act) { doAction(d.act); return; }
    if (d.toggle) { toggleDone(parseInt(d.toggle, 10)); return; }
    if (d.done) { markDone(parseInt(d.done, 10)); return; }
    if (d.queue) { queueTopic(parseInt(d.queue, 10)); return; }
    if (d.unqueue) { unqueueTopic(parseInt(d.unqueue, 10)); return; }
    if (d.files) { filesDialog(parseInt(d.files, 10)); return; }
    if (d.edit) { editTopic(parseInt(d.edit, 10)); return; }
    if (d.planRemove) { removeFromPlan(parseInt(d.planRemove, 10)); return; }
    if (d.arrange) {
      topicGroup = d.arrange === 'group';
      render();
      return;
    }
    if (d.filter) {
      topicFilter = d.filter;
      root.querySelectorAll('[data-filter]').forEach(function (x) { x.setAttribute('aria-pressed', String(x.dataset.filter === topicFilter)); });
      refreshRows(root);
      return;
    }
    if (d.cal) {
      calMonth += parseInt(d.cal, 10);
      if (calMonth < 0) { calMonth = 11; calYear--; }
      if (calMonth > 11) { calMonth = 0; calYear++; }
      render();
    }
  });
  root.addEventListener('input', function (e) {
    if (e.target.classList.contains('search')) {
      topicQuery = e.target.value;
      refreshRows(root);
    }
  });
  root.addEventListener('change', function (e) {
    if (e.target.hasAttribute('data-subject')) {
      topicSubject = e.target.value;
      refreshRows(root);
    }
    if (e.target.hasAttribute('data-prio')) {
      topicPrio = e.target.value;
      refreshRows(root);
    }
  });
}

function doAction(act) {
  if (act === 'add') addTopic();
  if (act === 'fill') fillQueue();
  if (act === 'edit-plan') editPlanTopics();
  if (act === 'extend') extendPlan();
  if (act === 'delete-plan') deletePlan();
  if (act === 'import') document.getElementById('import-file').click();
  if (act === 'bulk-queue') bulkQueueDialog();
  if (act === 'delete-first') deleteEnd(true);
  if (act === 'delete-last') deleteEnd(false);
}

/* ---------- Today ---------- */

function focusHtml() {
  var p = state.plan;
  if (state.topics.length === 0) {
    return '<section class="focus calm"><p class="focus-label">Welcome</p><h2>Start by adding the chapters you need to study</h2>' +
      '<p class="muted">Add topics one by one, or import a text file with one topic per line, like <b>DSA,Trees,1</b> (1 high, 0 medium, -1 low).</p>' +
      '<div class="focus-actions"><button class="btn btn-coral" data-act="add">' + icon('plus', 18) + 'Add topic</button><button class="btn btn-quiet" data-act="import">Import a list</button></div></section>';
  }
  if (state.queue.length === 0) {
    var fillable = canFill();
    var title;
    var text;
    if (planActive() && leftToday() === 0) {
      title = 'Today’s plan target is done';
      text = 'Nice work. Add more from your topics if you want to keep going.';
    } else if (fillable) {
      title = 'Nothing queued yet';
      text = 'Your plan needs ' + plural(leftToday(), 'more topic') + ' today. Fill the queue from the plan or pick topics yourself.';
    } else {
      title = 'Nothing queued yet';
      text = 'Pick what you want to study today from your topics.';
    }
    return '<section class="focus calm"><p class="focus-label">Study next</p><h2>' + title + '</h2><p class="muted">' + text + '</p>' +
      '<div class="focus-actions">' + (fillable ? '<button class="btn btn-teal" data-act="fill">' + icon('fill', 18) + 'Fill from plan</button>' : '') +
      '<button class="btn ' + (fillable ? 'btn-quiet' : 'btn-teal') + '" data-act="bulk-queue">Choose topics</button></div></section>';
  }
  var t = topicById(state.queue[0]);
  var n = fileCounts[t.id] || 0;
  return '<section class="focus" aria-label="Study next"><p class="focus-label">Today’s queue: study next (1 of ' + state.queue.length + ')</p>' +
    '<h2>' + esc(t.chapter) + '</h2>' +
    '<div class="focus-meta"><span class="tag">' + esc(t.subject) + '</span><span class="tag">' + prioName(t.priority) + ' priority</span>' +
    (t.inPlan ? '<span class="tag">In your plan</span>' : '') + (t.done ? '<span class="tag">Revision</span>' : '') + '</div>' +
    '<div class="focus-actions">' +
    (t.done ? '<button class="btn btn-coral" data-unqueue="' + t.id + '">' + icon('check', 18) + 'Revised</button>'
      : '<button class="btn btn-coral" data-done="' + t.id + '">' + icon('check', 18) + 'Mark as done</button>') +
    (t.done ? '' : '<button class="btn btn-on-teal" data-unqueue="' + t.id + '">' + icon('skip', 16) + 'Not today</button>') +
    '<button class="btn btn-on-teal" data-files="' + t.id + '">' + icon('clip', 16) + (n ? 'Notes (' + n + ')' : 'Add notes') + '</button>' +
    '</div></section>';
}

function upNextHtml() {
  if (state.queue.length === 0) return '';
  var rest = state.queue.slice(1);
  var rows = rest.map(function (id, i) {
    var t = topicById(id);
    return '<div class="q-row"><span class="q-num">' + (i + 2) + '</span><div class="q-text"><strong>' + esc(t.chapter) + '</strong><span>' + esc(t.subject) + (t.done ? ', revision' : '') + '</span></div>' +
      '<div class="q-btns">' + (t.done ? '' : '<button class="icon-btn" data-done="' + t.id + '" aria-label="Mark ' + esc(t.chapter) + ' as done" title="Mark as done">' + icon('check') + '</button>') +
      '<button class="icon-btn" data-unqueue="' + t.id + '" aria-label="Remove ' + esc(t.chapter) + ' from today" title="Remove from today">' + icon('x') + '</button></div></div>';
  }).join('');
  var foot = '<div class="focus-actions">' + (canFill() ? '<button class="btn btn-quiet btn-sm" data-act="fill">' + icon('fill', 16) + 'Fill from plan</button>' : '') +
    '<button class="btn btn-quiet btn-sm" data-act="bulk-queue">' + icon('plus', 16) + 'Add topics</button></div>';
  if (!rows) {
    return '<section class="card slim"><p class="muted">This is the only topic in today’s queue.</p>' + foot + '</section>';
  }
  return '<section class="card"><div class="card-head"><h2>Up next</h2><span class="muted small">' + plural(rest.length, 'more topic') + '</span></div>' +
    '<div class="q-list">' + rows + '</div>' + foot + '</section>';
}

function todayCardHtml() {
  var p = state.plan;
  var doneList = state.topics.filter(function (t) { return t.completedOn === state.today; });
  var top;
  if (planActive()) {
    var got = state.report.donePlanToday;
    var target = p.morningTarget;
    var line = got >= target ? (got > target ? 'Target done, ' + (got - target) + ' extra' : 'Today’s target is done') : plural(target - got, 'more topic') + ' to reach today’s target';
    top = '<div class="ring-row">' + ringSvg(got, target, 76) + '<div class="ring-text"><strong>' + line + '</strong><span class="muted small">Plan topics finished today</span></div></div>';
  } else {
    top = '<div class="ring-text"><strong>' + plural(doneList.length, 'topic') + ' done today</strong><span class="muted small">' +
      (p.exists ? 'Your plan is not running today.' : 'A study plan sets a daily target for you.') + '</span></div>' +
      (p.exists ? '' : '<button class="btn btn-outline btn-sm" data-go="plan">Make a study plan</button>');
  }
  var list = '';
  if (doneList.length) {
    list = '<div class="divider"></div><p class="small muted">Finished today</p><ul class="done-list">' +
      doneList.slice(0, 6).map(function (t) { return '<li>' + icon('check', 16) + '<span>' + esc(t.chapter) + ' <span class="muted">' + esc(t.subject) + '</span></span></li>'; }).join('') +
      (doneList.length > 6 ? '<li class="muted">and ' + (doneList.length - 6) + ' more</li>' : '') + '</ul>';
  }
  var names = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  var dots = names.map(function (n, i) {
    var cls = state.week[i] === 1 ? 'on' : (i === state.todayIndex ? 'now' : (state.week[i] === -1 ? 'future' : ''));
    return '<span><i class="' + cls + '"></i>' + n + '</span>';
  }).join('');
  var streak = '<div class="divider"></div><div class="streak-line"><strong>' + state.streak + '</strong><span>' + (state.streak === 1 ? 'day' : 'days') + ' in a row</span></div>' +
    '<div class="week" aria-label="Study days this week">' + dots + '</div>';
  var planLine = p.exists ? '<div class="divider"></div><button class="btn btn-link plan-link" data-go="plan">' + esc(p.name) + ': ' + p.done + ' of ' + plural(p.totals, 'topic') + ' done' + (p.stage === 'active' ? ', ' + plural(p.daysLeft, 'day') + ' left' : '') + '</button>' : '';
  return '<section class="card today-card"><h2>Today</h2>' + top + list + streak + planLine + '</section>';
}

function renderToday() {
  var v = document.getElementById('view-today');
  v.innerHTML =
    '<div class="head"><div><h1>' + greeting() + '</h1><p class="sub">' + longDate(state.today) + '</p></div>' +
    '<button class="btn btn-coral" data-act="add">' + icon('plus', 18) + 'Add topic</button></div>' +
    '<div class="layout"><div class="col">' + focusHtml() + upNextHtml() + (state.topics.length ? topicsCardHtml(false) : '') + '</div>' +
    '<div class="col">' + todayCardHtml() + calendarHtml() + '</div></div>';
  updateCount(v);
}

function renderTopicsView() {
  var v = document.getElementById('view-topics');
  var done = state.topics.filter(function (t) { return t.done; }).length;
  var pct = state.topics.length ? Math.round(done * 100 / state.topics.length) : 0;
  v.innerHTML =
    '<div class="head"><div><h1>Topics</h1><p class="sub">' + done + ' of ' + plural(state.topics.length, 'topic') + ' done (' + pct + '%) across ' + plural(subjects().length, 'subject') + '</p></div>' +
    '<button class="btn btn-coral" data-act="add">' + icon('plus', 18) + 'Add topic</button></div>' +
    topicsCardHtml(true);
  updateCount(v);
}

/* ---------- Progress (menus 9, 10, 16) ---------- */

function statBar(label, done, total, color) {
  var pct = total ? Math.round(done * 100 / total) : 0;
  return '<div class="sbar"><div class="sbar-top"><span>' + label + '</span><span class="muted"><b>' + done + '</b> of ' + total + ' · ' + pct + '%</span></div>' +
    '<div class="bar"><span style="width:' + pct + '%;background:' + (color || '#0F4C5C') + '"></span></div></div>';
}

function activitySvg(days) {
  var counts = [];
  var max = 1;
  for (var i = days - 1; i >= 0; i--) {
    var d = addDays(state.today, -i);
    var c = state.topics.filter(function (t) { return t.done && t.completedOn === d; }).length;
    counts.push({ d: d, c: c });
    if (c > max) max = c;
  }
  var W = 640, H = 200, L = 28, B = 34, T = 18;
  var bw = (W - L) / days;
  var bars = counts.map(function (o, i) {
    var h = (H - B - T) * o.c / max;
    var x = L + i * bw + bw * 0.18;
    var y = H - B - h;
    var isToday = o.d === state.today;
    var day = ymdToDate(o.d);
    var lbl = (i % 2 === (days - 1) % 2) ? '<text x="' + (x + bw * 0.32) + '" y="' + (H - 14) + '" text-anchor="middle">' + day.getDate() + '</text>' : '';
    return '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + (bw * 0.64).toFixed(1) + '" height="' + Math.max(h, o.c ? 2 : 0).toFixed(1) + '" rx="4" fill="' + (isToday ? '#E8735A' : '#0F4C5C') + '"><title>' + niceDate(o.d) + ': ' + plural(o.c, 'topic') + '</title></rect>' +
      (o.c ? '<text x="' + (x + bw * 0.32) + '" y="' + (y - 5) + '" text-anchor="middle" style="fill:#14262B;font-weight:700">' + o.c + '</text>' : '') + lbl;
  }).join('');
  var base = '<line x1="' + L + '" x2="' + W + '" y1="' + (H - B) + '" y2="' + (H - B) + '" stroke="#E3DACB"/>';
  var total = counts.reduce(function (a, o) { return a + o.c; }, 0);
  return { svg: '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Topics completed per day over the last ' + days + ' days, ' + total + ' in total">' + base + bars + '</svg>', total: total };
}

function reportHtml() {
  var p = state.plan;
  var doneList = state.topics.filter(function (t) { return t.completedOn === state.today; });
  var items = doneList.map(function (t) {
    return '<li>' + icon('check', 16) + '<span><b>' + esc(t.chapter) + '</b> <span class="muted">' + esc(t.subject) + '</span></span>' + (t.inPlan ? '<span class="chip plan">Plan</span>' : '') + '</li>';
  }).join('');
  var planPart = '';
  if (p.exists) {
    var body;
    var got = state.report.donePlanToday;
    if (p.stage === 'ended') {
      body = '<p>The plan has ended.</p><div class="facts"><div class="fact"><span>From plan today</span><b>' + got + '</b></div><div class="fact"><span>Plan progress</span><b>' + percent() + '%</b></div></div>';
    } else if (p.stage === 'notstarted') {
      body = '<p>The plan starts on <b>' + longDate(p.start) + '</b>.</p>';
    } else {
      var target = p.morningTarget;
      var result;
      if (got === target) result = '<p class="pace-note good">Target done!</p>';
      else if (got > target) result = '<p class="pace-note good">Target done, ' + plural(got - target, 'topic') + ' ahead!</p>';
      else result = '<p class="pace-note warn">' + plural(target - got, 'more topic') + ' to go today</p>';
      body = '<div class="facts"><div class="fact"><span>From plan today</span><b>' + got + '</b></div><div class="fact"><span>Today’s target</span><b>' + target + '</b></div><div class="fact"><span>Plan progress</span><b>' + percent() + '%</b></div></div>' + result;
    }
    planPart = '<div class="divider"></div><div class="card-head"><h3>' + esc(p.name) + '</h3><button class="btn btn-link" data-go="plan">Open plan</button></div>' + body;
  }
  return '<section class="card"><div class="card-head"><h2>Daily report</h2><span class="muted">' + longDate(state.today) + '</span></div>' +
    '<div class="card-head"><h3>Completed today</h3><span class="status ' + (doneList.length ? 'good' : 'soft') + '">' + doneList.length + '</span></div>' +
    (items ? '<ul class="done-list big">' + items + '</ul>' : '<p class="muted">No topics completed yet today.</p>') +
    planPart +
    '<div class="divider"></div><div class="card-head"><h3>Topics left in today’s queue</h3><span class="status soft">' + state.queue.length + '</span></div>' +
    (state.queue.length ? '<button class="btn btn-quiet btn-sm" data-go="today" style="align-self:flex-start">Go to today’s queue</button>' : '') +
    '</section>';
}

function renderProgressView() {
  var v = document.getElementById('view-progress');
  var total = state.topics.length;
  var done = state.topics.filter(function (t) { return t.done; }).length;
  var pending = total - done;
  var pct = total ? (done * 100 / total) : 0;
  if (total === 0) {
    v.innerHTML = '<div class="head"><div><h1>Progress</h1><p class="sub">See how far you are across all your topics.</p></div></div>' +
      '<section class="card"><div class="empty">No topics yet. Add some topics first.<button class="btn btn-coral" data-act="add">' + icon('plus', 18) + 'Add topic</button></div></section>';
    return;
  }
  var byPrio = [[1, 'High', '#9C3A23'], [0, 'Medium', '#0F4C5C'], [-1, 'Low', '#53666B']].map(function (o) {
    var list = state.topics.filter(function (t) { return t.priority === o[0]; });
    return statBar('<span class="chip ' + prioClass(o[0]) + '">' + o[1] + '</span>', list.filter(function (t) { return t.done; }).length, list.length, o[2]);
  }).join('');
  var bySubject = subjects().map(function (s) {
    var list = state.topics.filter(function (t) { return t.subject === s; });
    return statBar('<b>' + esc(s) + '</b>', list.filter(function (t) { return t.done; }).length, list.length);
  }).join('');
  var act = activitySvg(14);
  var queueDone = state.report.doneToday;
  var planCard = '';
  if (state.plan.exists) {
    var p = state.plan;
    var info = paceInfo();
    planCard = '<section class="card"><div class="card-head"><h2>Plan: ' + esc(p.name) + '</h2><span class="status ' + info.cls + '">' + info.badge + '</span></div>' +
      statBar('Plan topics', p.done, p.totals) +
      '<div class="facts"><div class="fact"><span>Pending</span><b>' + (p.totals - p.done) + '</b></div><div class="fact"><span>Total days</span><b>' + p.totalDays + '</b></div><div class="fact"><span>Days left</span><b>' + (p.stage === 'ended' ? 'Ended' : p.daysLeft) + '</b></div></div>' +
      '<p class="muted">' + esc(info.text) + '</p><button class="btn btn-link" data-go="plan" style="align-self:flex-start;padding:0">Open plan</button></section>';
  }
  v.innerHTML =
    '<div class="head"><div><h1>Progress</h1><p class="sub">' + done + ' of ' + plural(total, 'topic') + ' done across ' + plural(subjects().length, 'subject') + '</p></div></div>' +
    '<div class="progress-top">' +
    '<section class="card overall"><h2>All topics</h2><div class="ring-row">' + ringPct(pct, 120) +
    '<dl class="mini"><div><dt>Total topics</dt><dd>' + total + '</dd></div><div><dt>Completed</dt><dd class="g">' + done + '</dd></div><div><dt>Pending</dt><dd class="a">' + pending + '</dd></div></dl></div></section>' +
    '<section class="card"><h2>By priority</h2>' + byPrio + '</section>' +
    '<section class="card"><h2>Today’s queue</h2><div class="queue-stat"><div><b>' + state.queue.length + '</b><span>' + (state.queue.length === 1 ? 'topic' : 'topics') + ' left in the queue</span></div><div><b>' + queueDone + '</b><span>completed today</span></div></div>' +
    (state.queue.length ? '<ol class="queue-names">' + state.queue.map(function (id) { var t = topicById(id); return '<li>' + esc(t.chapter) + ' <span class="muted">' + esc(t.subject) + (t.done ? ', revision' : '') + '</span></li>'; }).join('') + '</ol>' : '') +
    '<div class="streak-line"><strong>' + state.streak + '</strong><span>' + (state.streak === 1 ? 'day' : 'days') + ' in a row</span></div>' +
    '<button class="btn btn-quiet btn-sm" data-go="today" style="align-self:flex-start">Open today</button></section>' +
    '</div>' +
    '<div class="layout"><div class="col">' + reportHtml() +
    '<section class="card chart"><div class="card-head"><h2>Last 14 days</h2><span class="muted">' + plural(act.total, 'topic') + ' completed</span></div>' + act.svg +
    '<p class="hint">Based on the date each topic was last marked done.</p></section></div>' +
    '<div class="col">' + planCard + '<section class="card"><h2>By subject</h2>' + bySubject + '</section></div></div>';
}

function ringPct(pct, size) {
  var r = 26;
  var c = 2 * Math.PI * r;
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 64 64" role="img" aria-label="' + pct.toFixed(1) + '% done">' +
    '<circle cx="32" cy="32" r="' + r + '" fill="none" stroke="#E3DACB" stroke-width="7"/>' +
    '<circle cx="32" cy="32" r="' + r + '" fill="none" stroke="#0F6B3E" stroke-width="7" stroke-linecap="round" stroke-dasharray="' + (pct / 100 * c).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 32 32)"/>' +
    '<text x="32" y="36" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-size="12" font-weight="700" fill="#14262B">' + pct.toFixed(1) + '%</text></svg>';
}

/* ---------- backup ---------- */

function exportData() {
  var queueSet = {};
  state.queue.forEach(function (id) { queueSet[id] = true; });
  var p = state.plan;
  toast('Preparing backup...');
  Promise.all(state.topics.map(function (t) {
    return filesForExport(t.id).then(function (files) {
      return {
        subject: t.subject,
        chapter: t.chapter,
        priority: t.priority,
        done: t.done,
        completedOn: t.completedOn,
        inPlan: t.inPlan,
        inQueue: queueSet[t.id] ? 1 : 0,
        files: files
      };
    });
  })).then(function (topics) {
    var fileTotal = 0;
    topics.forEach(function (t) { fileTotal += t.files.length; });
    var backup = {
      app: 'study-manager',
      version: 2,
      exportedOn: state.today,
      topics: topics,
      plan: p.exists ? { name: p.name, start: p.start, end: p.end, basePace: p.basePace } : null
    };
    var blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'study-backup-' + state.today + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast('Backup downloaded (' + plural(topics.length, 'topic') + ', ' + plural(fileTotal, 'file') + ')');
  }).catch(function () {
    toast('Could not create the backup');
  });
}

function checkBackup(obj) {
  if (!obj || obj.app !== 'study-manager' || !Array.isArray(obj.topics)) return 'This is not a Study Manager backup file.';
  for (var i = 0; i < obj.topics.length; i++) {
    var t = obj.topics[i];
    var where = 'Topic ' + (i + 1);
    if (!t || typeof t.subject !== 'string' || typeof t.chapter !== 'string') return where + ' has no subject or chapter.';
    if (!t.subject.trim() || !t.chapter.trim() || t.subject.length >= 50 || t.chapter.length >= 50) return where + ' has an empty or too long name.';
    if (t.subject.indexOf(',') !== -1 || t.chapter.indexOf(',') !== -1) return where + ' has a comma in its name.';
    if ([1, 0, -1].indexOf(t.priority) === -1) return where + ' has a bad priority.';
  }
  if (obj.plan) {
    var pl = obj.plan;
    if (typeof pl.name !== 'string' || !(pl.start > 0) || !(pl.end > pl.start) || typeof pl.basePace !== 'number') return 'The plan in this file is not valid.';
  }
  return '';
}

function parseTopicLines(text) {
  var lines = String(text).replace(/\r/g, '').split('\n');
  var topics = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (line === '') continue;
    var f = line.split(',').map(function (x) { return x.trim(); });
    if (f.length === 7 && /^\d+$/.test(f[0])) {
      f = [f[1], f[2], f[3], f[4], f[6]];
    }
    var where = 'Line ' + (i + 1);
    if (f.length !== 3 && f.length !== 5) return { error: where + ' should be: subject,chapter,priority  or  subject,chapter,priority,is_done,completed_on' };
    if (!/^-?\d+$/.test(f[2])) return { error: where + ' has a bad priority (use 1, 0 or -1).' };
    var done = 0;
    var completedOn = 0;
    if (f.length === 5) {
      if (f[3] !== '0' && f[3] !== '1') return { error: where + ' has a bad is_done (use 0 or 1).' };
      if (!/^\d+$/.test(f[4])) return { error: where + ' has a bad completed date (use YYYYMMDD or 0).' };
      done = parseInt(f[3], 10);
      completedOn = done ? parseInt(f[4], 10) : 0;
    }
    topics.push({ subject: f[0], chapter: f[1], priority: parseInt(f[2], 10), done: done, completedOn: completedOn, inPlan: 0, inQueue: 0 });
  }
  if (topics.length === 0) return { error: 'The file has no topics.' };
  return { topics: topics };
}

function importData(file) {
  var reader = new FileReader();
  reader.onload = function () {
    var text = String(reader.result);
    var obj = null;
    try {
      obj = JSON.parse(text);
    } catch (e) {
      obj = null;
    }
    if ((!obj || typeof obj !== 'object') && /\.(txt|csv)$/i.test(file.name)) {
      var parsed = parseTopicLines(text);
      if (parsed.error) {
        openDialog('<h2>Cannot import</h2><p class="muted" style="margin:0">' + esc(file.name) + '</p><p style="margin:0">' + esc(parsed.error) + '</p>' +
          '<div class="dlg-actions"><button class="btn btn-teal" data-close="ok">OK</button></div>');
        return;
      }
      obj = { app: 'study-manager', topics: parsed.topics, plan: null };
    }
    var problem = checkBackup(obj);
    if (problem) {
      openDialog('<h2>Cannot import</h2><p class="muted" style="margin:0">' + esc(file.name) + '</p><p style="margin:0">' + esc(problem) + '</p>' +
        '<div class="dlg-actions"><button class="btn btn-teal" data-close="ok">OK</button></div>');
      return;
    }
    var planNote = '';
    if (obj.plan && state.plan.exists) planNote = ' You already have a plan, so the plan “' + obj.plan.name + '” in the file will be skipped.';
    else if (obj.plan) planNote = ' The plan “' + obj.plan.name + '” will be added too.';
    confirmBox('Import topics?', 'The file has ' + plural(obj.topics.length, 'topic') + '. They will be added to your list with new IDs. Topics you already have are skipped.' + planNote, 'Import', false).then(function (ok) {
      if (!ok) return;
      var added = 0;
      var skipped = 0;
      var queueIds = [];
      var fileJobs = [];
      var have = {};
      state.topics.forEach(function (x) { have[(x.subject + '|' + x.chapter).toLowerCase()] = x.id; });
      obj.topics.forEach(function (t) {
        var id = api('wasm_import_topic', 'number', ['string', 'string', 'number', 'number', 'number', 'number'],
          [t.subject.trim(), t.chapter.trim(), t.priority, t.done ? 1 : 0, t.done ? (parseInt(t.completedOn, 10) || 0) : 0, t.inPlan ? 1 : 0]);
        if (id > 0) {
          added++;
          if (t.inQueue) queueIds.push(id);
        } else {
          skipped++;
          id = have[(t.subject.trim() + '|' + t.chapter.trim()).toLowerCase()] || 0;
        }
        if (id > 0 && Array.isArray(t.files) && t.files.length) {
          fileJobs.push({ id: id, files: t.files });
        }
      });
      queueIds.forEach(function (id) {
        api('wasm_import_queue', 'number', ['number'], [id]);
      });
      var planAdded = false;
      if (obj.plan && !state.plan.exists) {
        planAdded = api('wasm_import_plan', 'number', ['string', 'number', 'number', 'number'],
          [obj.plan.name, obj.plan.start, obj.plan.end, obj.plan.basePace]) === 1;
      }
      api('wasm_import_done', 'number');
      var msg = plural(added, 'topic') + ' imported' + (skipped ? ', ' + skipped + ' skipped' : '') + (planAdded ? ', plan added' : '');
      var chain = Promise.resolve(0);
      fileJobs.forEach(function (job) {
        chain = chain.then(function (n) {
          return importTopicFiles(job.id, job.files).then(function (k) { return n + k; });
        });
      });
      chain.catch(function () { return 0; }).then(function (n) {
        return refreshFileCounts().then(function () {
          changed(msg + (n ? ', ' + plural(n, 'file') : ''));
        });
      });
    });
  };
  reader.readAsText(file);
}


/* ---------- Plan ---------- */

function burndownSvg() {
  var p = state.plan;
  var planTopics = state.topics.filter(function (t) { return t.inPlan; });
  var days = dayDiff(p.start, p.end);
  if (days < 1) days = 1;
  var W = 640, H = 240, L = 36, R = 16, T = 28, B = 30;
  var total = Math.max(p.totals, 1);
  function x(i) { return L + (W - L - R) * i / days; }
  function y(v) { return T + (H - T - B) * (1 - v / total); }
  var lastDay = Math.min(dayDiff(p.start, state.today), days);
  var pts = [];
  for (var i = 0; i <= lastDay; i++) {
    var day = addDays(p.start, i);
    var done = planTopics.filter(function (t) { return t.done && t.completedOn && t.completedOn <= day; }).length;
    pts.push(x(i).toFixed(1) + ',' + y(p.totals - done).toFixed(1));
  }
  var grid = '';
  [0, 0.5, 1].forEach(function (f) {
    var v = Math.round(total * f);
    grid += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="#ECE5D9"/>' +
      '<text x="' + (L - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v + '</text>';
  });
  var labels = '<text x="' + L + '" y="' + (H - 8) + '">' + niceDate(p.start) + '</text>' +
    '<text x="' + (W - R) + '" y="' + (H - 8) + '" text-anchor="end">' + niceDate(p.end) + '</text>';
  var todayMark = '';
  if (lastDay >= 0 && lastDay <= days && state.today <= p.end) {
    todayMark = '<line x1="' + x(lastDay) + '" x2="' + x(lastDay) + '" y1="' + T + '" y2="' + (H - B) + '" stroke="#E8735A" stroke-dasharray="3 4"/>' +
      '<text x="' + x(lastDay) + '" y="' + (T - 10) + '" text-anchor="' + (lastDay === 0 ? 'start' : (lastDay === days ? 'end' : 'middle')) + '" style="fill:#9C3A23;font-weight:700">Today</text>';
  }
  var actual = pts.length > 1 ? '<polyline points="' + pts.join(' ') + '" fill="none" stroke="#0F4C5C" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>' : '';
  var lastPt = pts.length ? pts[pts.length - 1].split(',') : null;
  var dot = lastPt ? '<circle cx="' + lastPt[0] + '" cy="' + lastPt[1] + '" r="5" fill="#0F4C5C" stroke="#FBF8F2" stroke-width="2"/>' : '';
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Topics left over the plan: planned line from ' + p.totals + ' to 0, actual ' + (p.totals - p.done) + ' left now">' +
    grid + labels +
    '<line x1="' + x(0) + '" y1="' + y(p.totals) + '" x2="' + x(days) + '" y2="' + y(0) + '" stroke="#A8B9BC" stroke-width="2" stroke-dasharray="6 6"/>' +
    todayMark + actual + dot + '</svg>';
}

function planMessage() {
  var p = state.plan;
  var left = p.totals - p.done;
  if (p.stage === 'ended') {
    if (left === 0) return { cls: 'good', html: '<strong>“' + esc(p.name) + '” has ended.</strong> Congratulations, you completed every topic in the plan.' };
    return { cls: 'bad', html: '<strong>“' + esc(p.name) + '” has ended.</strong> ' + plural(left, 'topic') + (left === 1 ? ' was' : ' were') + ' left unfinished. Extend the plan to keep going, or delete it.',
      actions: '<button class="btn btn-teal btn-sm" data-act="extend">Extend plan</button><button class="btn btn-danger btn-sm" data-act="delete-plan">Delete plan</button>' };
  }
  if (p.stage === 'notstarted') {
    return { cls: 'soft', html: '<strong>Your plan has not started yet.</strong> It starts on ' + longDate(p.start) + ' and runs for ' + plural(p.daysLeft, 'day') + '.' };
  }
  if (left === 0) return { cls: 'good', html: '<strong>Every topic in this plan is done.</strong> Nice work.' };
  if (p.daysLeft === 1) return { cls: 'warn', html: '<strong>Today is the last day!</strong> Finish the remaining ' + plural(left, 'topic') + '.' };
  var lt = leftToday();
  var today = lt > 0 ? 'Today’s target: ' + plural(p.morningTarget, 'topic') + ', ' + lt + ' still to do.' : 'Today’s target of ' + plural(p.morningTarget, 'topic') + ' is done.';
  var pace;
  if (p.diff > 0) pace = 'Behind: ' + plural(p.diff, 'more topic') + ' a day than planned.';
  else if (p.diff < 0) pace = 'Ahead by ' + plural(-p.diff, 'topic') + ' a day.';
  else pace = 'On track.';
  return { cls: p.diff > 0 ? 'warn' : 'good', html: '<strong>' + pace + '</strong> ' + today };
}

function renderPlanView() {
  var v = document.getElementById('view-plan');
  var p = state.plan;
  if (!p.exists) {
    renderPlanForm(v);
    return;
  }
  var info = paceInfo();
  var msg = planMessage();
  var planTopics = state.topics.filter(function (t) { return t.inPlan; });
  var left = p.totals - p.done;
  var rows = planTopics.map(function (t) {
    return '<tr class="' + (t.done ? 'is-done' : '') + '">' +
      '<td class="c-check"><button class="check" role="checkbox" aria-checked="' + (t.done ? 'true' : 'false') + '" data-toggle="' + t.id + '" aria-label="' + esc(t.chapter) + ' done">' + icon('check') + '</button></td>' +
      '<td class="c-chapter"><span class="ch-name">' + esc(t.chapter) + '</span><span class="sub-mobile">' + esc(t.subject) + '</span></td><td class="c-subject">' + esc(t.subject) + '</td>' +
      '<td class="c-prio"><span class="chip ' + prioClass(t.priority) + '">' + prioName(t.priority) + '</span></td>' +
      '<td class="muted small c-when">' + (t.done ? 'Done ' + niceDate(t.completedOn) : (t.inQueue ? 'In today’s queue' : '')) + '</td>' +
      '<td class="c-act"><button class="icon-btn" data-plan-remove="' + t.id + '" aria-label="Remove ' + esc(t.chapter) + ' from the plan" title="Remove from plan">' + icon('x') + '</button></td></tr>';
  }).join('');
  var daysLeft = p.stage === 'ended' ? 0 : (p.stage === 'notstarted' ? p.totalDays : p.daysLeft);
  var facts = [
    ['Total topics', p.totals],
    ['Completed', p.done],
    ['Pending', left],
    ['Progress', percent() + '%'],
    ['Total days', p.totalDays],
    ['Days left', p.stage === 'ended' ? 'Ended' : daysLeft],
    ['Base pace', p.basePace + '/day'],
    ['Today’s target', p.stage === 'active' && left ? p.morningTarget : '–']
  ];
  v.innerHTML =
    '<div class="head"><div><h1>' + esc(p.name) + '</h1><p class="sub">' + longDate(p.start) + ' to ' + longDate(p.end) + '</p></div>' +
    '<div class="focus-actions">' + (canFill() ? '<button class="btn btn-teal" data-act="fill">' + icon('fill', 18) + 'Fill today’s queue</button>' : '') +
    (p.stage === 'ended' ? '' : '<button class="btn btn-quiet" data-act="extend">Extend end date</button><button class="btn btn-danger" data-act="delete-plan">Delete plan</button>') + '</div></div>' +
    '<div class="pace-note ' + msg.cls + ' banner"><p>' + msg.html + '</p>' + (msg.actions ? '<div class="focus-actions">' + msg.actions + '</div>' : '') + '</div>' +
    '<div class="plan-top">' +
    '<section class="card"><div class="card-head"><h2>Progress</h2><span class="status ' + info.cls + '">' + info.badge + '</span></div>' +
    '<p class="big-num">' + p.done + ' <small>of ' + plural(p.totals, 'topic') + ' done</small></p>' +
    '<div class="bar" role="progressbar" aria-valuenow="' + percent() + '" aria-valuemin="0" aria-valuemax="100" aria-label="Plan progress"><span style="width:' + percent() + '%"></span></div>' +
    '<div class="facts">' + facts.map(function (f) { return '<div class="fact"><span>' + f[0] + '</span><b>' + f[1] + '</b></div>'; }).join('') + '</div></section>' +
    '<section class="card chart"><div class="card-head"><h2>Topics left</h2><div class="legend"><span><i style="background:#0F4C5C;border-radius:2px;height:4px;width:16px"></i>You</span><span><i style="background:#A8B9BC;border-radius:2px;height:4px;width:16px"></i>Planned</span></div></div>' + burndownSvg() + '</section>' +
    '</div>' +
    '<div class="layout"><div class="col"><section class="card topics-card"><div class="card-head"><h2>Plan topics</h2><button class="btn btn-outline btn-sm" data-act="edit-plan">' + icon('plus', 16) + 'Add or remove topics</button></div>' +
    (rows ? '<div class="table-box"><table><thead><tr><th class="c-check"><span class="sr">Done</span></th><th>Chapter</th><th class="c-subject">Subject</th><th class="c-prio">Priority</th><th class="c-when">When</th><th class="c-act"><span class="sr">Remove</span></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      : '<div class="empty">This plan has no topics.<button class="btn btn-teal btn-sm" data-act="edit-plan">Add topics</button></div>') +
    '</section></div><div class="col">' + calendarHtml() + '</div></div>';
}

function removeFromPlan(id) {
  var t = topicById(id);
  var ids = state.topics.filter(function (x) { return x.inPlan && x.id !== id; }).map(function (x) { return x.id; });
  var n = api('wasm_set_plan_topics', 'number', ['string'], [ids.join(',')]);
  changed('Removed “' + t.chapter + '” from the plan (' + plural(n, 'topic') + ' left)', function () {
    api('wasm_set_plan_topics', 'number', ['string'], [ids.concat([id]).join(',')]);
    changed('Undone');
  });
}

function checklistHtml(list, checkedFn, noteFn) {
  var groups = {};
  var order = [];
  list.forEach(function (t) {
    if (!groups[t.subject]) { groups[t.subject] = []; order.push(t.subject); }
    groups[t.subject].push(t);
  });
  order.sort(function (a, b) { return a.localeCompare(b); });
  return '<div class="checklist">' + order.map(function (s) {
    return '<div class="subject-group"><label class="subject-head"><input type="checkbox" data-group="' + esc(s) + '">' + esc(s) + '<span class="muted small" style="font-weight:600">' + plural(groups[s].length, 'topic') + '</span></label>' +
      groups[s].map(function (t) {
        return '<label class="item"><input type="checkbox" value="' + t.id + '" data-in="' + esc(s) + '"' + (checkedFn(t) ? ' checked' : '') + '><span>' + esc(t.chapter) +
          ' <span class="chip ' + prioClass(t.priority) + '">' + prioName(t.priority) + '</span>' + (noteFn ? noteFn(t) : '') + '</span></label>';
      }).join('') + '</div>';
  }).join('') + '</div>';
}

function bindChecklist(root, onChange) {
  function syncGroups() {
    root.querySelectorAll('[data-group]').forEach(function (g) {
      var items = Array.prototype.filter.call(root.querySelectorAll('input[data-in]'), function (c) { return c.dataset.in === g.dataset.group; });
      var n = items.filter(function (c) { return c.checked; }).length;
      g.checked = n === items.length && n > 0;
      g.indeterminate = n > 0 && n < items.length;
    });
    if (onChange) onChange();
  }
  root.querySelectorAll('[data-group]').forEach(function (g) {
    g.addEventListener('change', function () {
      root.querySelectorAll('input[data-in]').forEach(function (c) {
        if (c.dataset.in === g.dataset.group) c.checked = g.checked;
      });
      syncGroups();
    });
  });
  root.querySelectorAll('input[data-in]').forEach(function (c) { c.addEventListener('change', syncGroups); });
  syncGroups();
  return function setAll(on) {
    root.querySelectorAll('input[data-in]').forEach(function (c) { c.checked = on; });
    syncGroups();
  };
}

function renderPlanForm(v) {
  var pending = state.topics.filter(function (t) { return !t.done; });
  v.innerHTML =
    '<div class="head"><div><h1>Make a study plan</h1><p class="sub">Pick the topics and the days you have. You get a daily target and see if you are on track.</p></div></div>' +
    (pending.length === 0
      ? '<section class="card"><div class="empty">' + (state.topics.length ? 'Every topic is done, so there is nothing to plan.' : 'Add some topics first, then come back to plan them.') +
        '<button class="btn btn-coral" data-act="add">' + icon('plus', 18) + 'Add topic</button></div></section>'
      : '<form class="plan-form" id="plan-form" novalidate>' +
        '<section class="card"><h2>Plan details</h2>' +
        '<div class="field"><label for="pf-name">Name</label><input id="pf-name" maxlength="49" placeholder="For example: Sessional 2" autocomplete="off"></div>' +
        '<div class="field-row"><div class="field"><label for="pf-start">Start</label><input id="pf-start" type="date" min="' + ymdToInput(state.today) + '" value="' + ymdToInput(state.today) + '"></div>' +
        '<div class="field"><label for="pf-end">Exam or end date</label><input id="pf-end" type="date" min="' + ymdToInput(addDays(state.today, 1)) + '" value="' + ymdToInput(addDays(state.today, 6)) + '"></div></div>' +
        '<p class="summary-box" id="pf-summary" aria-live="polite"></p>' +
        '<p class="error" id="pf-error" role="alert"></p>' +
        '<button class="btn btn-teal btn-block" type="submit">Create plan</button></section>' +
        '<section class="card"><div class="card-head"><h2>Topics</h2><div class="focus-actions"><button type="button" class="btn btn-link" id="pf-all">Select all</button><button type="button" class="btn btn-link" id="pf-none">Clear</button></div></div>' +
        '<p class="hint">Only pending topics are shown. Tick a subject to select all its chapters.</p>' +
        checklistHtml(pending, function () { return false; }) + '</section></form>');
  var form = v.querySelector('#plan-form');
  if (!form) return;
  function summary() {
    var n = v.querySelectorAll('input[data-in]:checked').length;
    var s = inputToYmd(v.querySelector('#pf-start').value);
    var e = inputToYmd(v.querySelector('#pf-end').value);
    var box = v.querySelector('#pf-summary');
    if (!s || !e || e <= s) { box.innerHTML = 'Pick an end date after the start date.'; return; }
    var days = dayDiff(s, e) + 1;
    if (n === 0) { box.innerHTML = '<strong>' + plural(days, 'day') + '</strong><br>Select topics to see your daily target.'; return; }
    box.innerHTML = '<strong>' + Math.ceil(n / days) + ' a day</strong><br>' + plural(n, 'topic') + ' over ' + plural(days, 'day');
  }
  var setAll = bindChecklist(v, summary);
  v.querySelector('#pf-all').addEventListener('click', function () { setAll(true); });
  v.querySelector('#pf-none').addEventListener('click', function () { setAll(false); });
  v.querySelector('#pf-start').addEventListener('change', summary);
  v.querySelector('#pf-end').addEventListener('change', summary);
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = v.querySelector('#pf-name').value.trim();
    var start = inputToYmd(v.querySelector('#pf-start').value);
    var end = inputToYmd(v.querySelector('#pf-end').value);
    var ids = Array.prototype.map.call(v.querySelectorAll('input[data-in]:checked'), function (c) { return c.value; }).join(',');
    var code = api('wasm_create_plan', 'number', ['string', 'number', 'number', 'string'], [name, start, end, ids]);
    var msg = {
      '-1': 'A plan already exists.',
      '-2': 'Give the plan a name (no commas, under 50 characters).',
      '-3': 'The start date can’t be in the past.',
      '-4': 'The end date can’t be in the past.',
      '-5': 'The end date must be after the start date.',
      '-6': 'Select at least one topic.'
    }[String(code)];
    if (msg) {
      v.querySelector('#pf-error').textContent = msg;
      if (code === -2) v.querySelector('#pf-name').focus();
      return;
    }
    changed('Plan “' + name + '” created');
  });
}

/* ---------- dialogs ---------- */

function prioritySegmented(name, value) {
  return '<div class="segmented" role="radiogroup" aria-label="Priority">' + [[1, 'High'], [0, 'Medium'], [-1, 'Low']].map(function (o) {
    return '<label><input type="radio" name="' + name + '" value="' + o[0] + '"' + (o[0] === value ? ' checked' : '') + '><span><i class="chip ' + prioClass(o[0]) + '" style="padding:0;background:none"></i>' + o[1] + '</span></label>';
  }).join('') + '</div>';
}

function segmented(name, options, value, label) {
  return '<div class="segmented" role="radiogroup" aria-label="' + label + '">' + options.map(function (o) {
    return '<label><input type="radio" name="' + name + '" value="' + o[0] + '"' + (String(o[0]) === String(value) ? ' checked' : '') + '><span>' + o[1] + '</span></label>';
  }).join('') + '</div>';
}

function addTopic() {
  var addedCount = 0;
  openDialog(
    '<h2>Add topic</h2><form class="form" id="add-form" novalidate>' +
    '<div class="field"><label for="at-sub">Subject</label><input id="at-sub" maxlength="49" list="subject-list" placeholder="For example: DSA" autocomplete="off">' +
    '<datalist id="subject-list">' + subjects().map(function (s) { return '<option value="' + esc(s) + '">'; }).join('') + '</datalist></div>' +
    '<div class="field"><label for="at-ch">Chapter</label><input id="at-ch" maxlength="49" placeholder="For example: Trees" autocomplete="off"></div>' +
    '<div class="field"><span class="label">Priority</span>' + prioritySegmented('at-p', 0) + '</div>' +
    '<div class="field"><span class="label">Where in the list</span>' +
    segmented('at-pos', [[0, 'By priority'], [1, 'At the front'], [2, 'At the back']], 0, 'Where in the list') +
    '<span class="hint" id="at-pos-hint">Placed after other topics of the same priority, so the list stays sorted High to Low.</span></div>' +
    '<p class="error" id="at-err" role="alert"></p>' +
    '<div class="dlg-actions"><button type="button" class="btn btn-quiet spacer" data-close="cancel">Close</button>' +
    '<button type="button" class="btn btn-outline" id="at-more">Add and next</button><button type="submit" class="btn btn-teal">Add topic</button></div></form>',
    function (body, close) {
      var form = body.querySelector('#add-form');
      var hints = {
        '0': 'Placed after other topics of the same priority, so the list stays sorted High to Low.',
        '1': 'Placed first in the list, whatever its priority.',
        '2': 'Placed last in the list, whatever its priority.'
      };
      body.querySelectorAll('input[name=at-pos]').forEach(function (r) {
        r.addEventListener('change', function () { body.querySelector('#at-pos-hint').textContent = hints[r.value]; });
      });
      function save(keepOpen) {
        var sub = body.querySelector('#at-sub').value.trim();
        var ch = body.querySelector('#at-ch').value.trim();
        var pr = parseInt(body.querySelector('input[name=at-p]:checked').value, 10);
        var pos = parseInt(body.querySelector('input[name=at-pos]:checked').value, 10);
        var err = body.querySelector('#at-err');
        if (!sub) { err.textContent = 'Enter a subject.'; body.querySelector('#at-sub').focus(); return; }
        if (!ch) { err.textContent = 'Enter a chapter.'; body.querySelector('#at-ch').focus(); return; }
        if (sub.indexOf(',') !== -1 || ch.indexOf(',') !== -1) { err.textContent = 'Names can’t contain commas.'; return; }
        var code = api('wasm_add_topic_at', 'number', ['string', 'string', 'number', 'number'], [sub, ch, pr, pos]);
        if (code === -2) { err.textContent = '“' + ch + '” is already in ' + sub + '.'; return; }
        if (code < 0) { err.textContent = 'Could not add this topic.'; return; }
        addedCount++;
        if (keepOpen) {
          persist();
          refresh();
          err.textContent = '';
          toast('Added “' + ch + '” at position ' + positionOf(code));
          body.querySelector('#at-ch').value = '';
          body.querySelector('#at-ch').focus();
        } else {
          close('ok');
        }
      }
      form.addEventListener('submit', function (e) { e.preventDefault(); save(false); });
      body.querySelector('#at-more').addEventListener('click', function () { save(true); });
    }
  ).then(function () {
    if (addedCount > 0) changed(addedCount === 1 ? 'Topic added' : plural(addedCount, 'topic') + ' added');
  });
}

function detailRows(t) {
  var rows = [
    ['Subject', esc(t.subject)],
    ['Position', positionOf(t.id) + ' of ' + state.topics.length + ' in your list'],
    ['Status', t.done ? 'Completed on ' + niceDate(t.completedOn, true) : 'Pending'],
    ['In plan', t.inPlan ? 'Yes, ' + esc(state.plan.name) : 'No'],
    ['Today’s queue', t.inQueue ? 'Yes, number ' + (state.queue.indexOf(t.id) + 1) : 'No'],
    ['Files', plural(fileCounts[t.id] || 0, 'file')]
  ];
  return '<dl class="details">' + rows.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>'; }).join('') + '</dl>';
}

function editTopic(id) {
  var t = topicById(id);
  if (!t) return;
  var n = fileCounts[id] || 0;
  openDialog(
    '<h2>' + esc(t.chapter) + '</h2>' + detailRows(t) +
    '<div class="field"><span class="label">Priority</span>' + prioritySegmented('et-p', t.priority) + '<span class="hint">Changing it moves the topic to its new place in the list.</span></div>' +
    '<div class="field"><span class="label">Status</span>' + segmented('et-s', [[0, 'Pending'], [1, 'Completed']], t.done, 'Status') + '</div>' +
    '<button class="btn btn-quiet" data-close="files">' + icon('clip', 18) + (n ? 'Notes and files (' + n + ')' : 'Add notes or files') + '</button>' +
    '<div class="dlg-actions"><button class="btn btn-danger spacer" data-close="delete">' + icon('trash', 18) + 'Delete</button>' +
    '<button class="btn btn-quiet" data-close="cancel">Cancel</button><button class="btn btn-teal" id="et-save">Save</button></div>',
    function (body, close) {
      body.querySelector('#et-save').addEventListener('click', function () {
        close('save', {
          p: parseInt(body.querySelector('input[name=et-p]:checked').value, 10),
          s: parseInt(body.querySelector('input[name=et-s]:checked').value, 10)
        });
      });
    }
  ).then(function (r) {
    if (r.value === 'files') filesDialog(id);
    if (r.value === 'save') {
      var msgs = [];
      if (r.data.p !== t.priority) {
        api('wasm_set_priority', 'number', ['number', 'number'], [id, r.data.p]);
        msgs.push('priority ' + prioName(r.data.p));
      }
      if (r.data.s !== t.done) {
        if (r.data.s === 1 && t.inQueue) {
          api('wasm_finish_queue_topic', 'number', ['number', 'number'], [id, 1]);
        } else {
          api('wasm_set_status', 'number', ['number', 'number'], [id, r.data.s]);
        }
        msgs.push(r.data.s ? 'completed' : 'pending');
      }
      if (msgs.length) changed('Saved: ' + msgs.join(', '));
    }
    if (r.value === 'delete') confirmDelete(t);
  });
}

function confirmDelete(t) {
  var n = fileCounts[t.id] || 0;
  var extra = n ? ' Its ' + plural(n, 'file') + ' will be deleted too.' : '';
  confirmBox('Delete “' + t.chapter + '”?', 'It will be removed from your topics, today’s queue and the plan.' + extra + ' This can’t be undone.', 'Delete topic', true).then(function (ok) {
    if (!ok) return;
    api('wasm_delete_topic', 'number', ['number'], [t.id]);
    afterDelete(t.id);
  });
}

function afterDelete(id) {
  deleteTopicFiles(id).then(refreshFileCounts).then(function () { changed('Topic deleted'); }, function () { changed('Topic deleted'); });
}

function deleteEnd(first) {
  if (state.topics.length === 0) {
    toast('The list is empty');
    return;
  }
  var t = first ? state.topics[0] : state.topics[state.topics.length - 1];
  openDialog(
    '<h2>Delete the ' + (first ? 'first' : 'last') + ' topic?</h2>' +
    '<p class="muted">This is the topic at the ' + (first ? 'front' : 'back') + ' of your list.</p>' +
    '<div class="topic-card"><strong>' + esc(t.chapter) + '</strong>' + detailRows(t) + '</div>' +
    '<div class="dlg-actions"><button class="btn btn-quiet" data-close="cancel">Keep it</button><button class="btn btn-danger" data-close="ok">' + icon('trash', 18) + 'Delete topic</button></div>'
  ).then(function (r) {
    if (r.value !== 'ok') return;
    var id = api(first ? 'wasm_delete_first' : 'wasm_delete_last', 'number');
    if (id > 0) afterDelete(id);
  });
}

function bulkQueueDialog() {
  if (state.topics.length === 0) {
    toast('Add topics first');
    return;
  }
  var stat = state.topics.some(function (t) { return !t.done; }) ? 0 : 1;
  var prio = null;
  var howMany = 1;
  function matching() {
    return state.topics.filter(function (t) { return t.done === stat && t.priority === prio; });
  }
  function willAdd() {
    return matching().filter(function (t) { return !t.inQueue; }).slice(0, howMany);
  }
  function countFor(p) {
    return state.topics.filter(function (t) { return t.done === stat && t.priority === p; }).length;
  }
  openDialog(
    '<h2>Add to today’s queue</h2><p class="muted">Pick a group of topics. They are added in list order, skipping any already queued.</p>' +
    '<div class="field"><span class="label">Which topics</span>' + segmented('bq-s', [[0, 'Pending'], [1, 'Completed, for revision']], stat, 'Which topics') + '</div>' +
    '<div class="field"><span class="label">Priority</span><div id="bq-prio" class="prio-pick"></div></div>' +
    '<div class="field"><label for="bq-n">How many</label><div class="stepper"><button type="button" class="icon-btn" id="bq-minus" aria-label="Fewer">−</button><input id="bq-n" type="number" min="0" value="1" inputmode="numeric"><button type="button" class="icon-btn" id="bq-plus" aria-label="More">+</button><span class="hint" id="bq-max"></span></div></div>' +
    '<div class="field"><span class="label">Will be added</span><ol class="preview" id="bq-preview"></ol></div>' +
    '<div class="dlg-actions"><button class="btn btn-quiet" data-close="cancel">Cancel</button><button class="btn btn-teal" id="bq-add"></button></div>',
    function (body, close) {
      var input = body.querySelector('#bq-n');
      function draw() {
        var pick = body.querySelector('#bq-prio');
        if (prio === null || countFor(prio) === 0) {
          prio = null;
          [1, 0, -1].some(function (p) { if (countFor(p) > 0) { prio = p; return true; } return false; });
        }
        pick.innerHTML = [[1, 'High'], [0, 'Medium'], [-1, 'Low']].map(function (o) {
          var c = countFor(o[0]);
          return '<label class="prio-opt' + (c === 0 ? ' off' : '') + '"><input type="radio" name="bq-p" value="' + o[0] + '"' + (o[0] === prio ? ' checked' : '') + (c === 0 ? ' disabled' : '') + '>' +
            '<span><span class="chip ' + prioClass(o[0]) + '">' + o[1] + '</span><b>' + c + '</b><small>available</small></span></label>';
        }).join('');
        pick.querySelectorAll('input').forEach(function (r) {
          r.addEventListener('change', function () { prio = parseInt(r.value, 10); howMany = 1; draw(); });
        });
        var free = prio === null ? 0 : matching().filter(function (t) { return !t.inQueue; }).length;
        if (howMany > free) howMany = free;
        if (howMany < 0) howMany = 0;
        input.max = free;
        input.value = howMany;
        body.querySelector('#bq-max').textContent = prio === null ? 'No topics in this group' : 'of ' + free + (free !== matching().length ? ' (' + (matching().length - free) + ' already queued)' : '');
        var list = prio === null ? [] : willAdd();
        body.querySelector('#bq-preview').innerHTML = list.length ? list.map(function (t) { return '<li>' + esc(t.chapter) + ' <span class="muted">' + esc(t.subject) + '</span></li>'; }).join('') : '<li class="muted">Nothing</li>';
        var btn = body.querySelector('#bq-add');
        btn.textContent = list.length ? 'Add ' + plural(list.length, 'topic') : 'Add';
        btn.disabled = list.length === 0;
      }
      body.querySelectorAll('input[name=bq-s]').forEach(function (r) {
        r.addEventListener('change', function () { stat = parseInt(r.value, 10); prio = null; howMany = 1; draw(); });
      });
      body.querySelector('#bq-minus').addEventListener('click', function () { howMany--; draw(); });
      body.querySelector('#bq-plus').addEventListener('click', function () { howMany++; draw(); });
      input.addEventListener('input', function () { howMany = parseInt(input.value, 10) || 0; draw(); });
      body.querySelector('#bq-add').addEventListener('click', function () { close('ok', { s: stat, p: prio, n: howMany }); });
      draw();
    }
  ).then(function (r) {
    if (r.value !== 'ok') return;
    var before = state.queue.slice();
    var added = api('wasm_enqueue_filtered', 'number', ['number', 'number', 'number'], [r.data.s, r.data.p, r.data.n]);
    changed(plural(added, 'topic') + ' added to today’s queue', function () {
      refresh();
      state.queue.forEach(function (id) {
        if (before.indexOf(id) === -1) api('wasm_finish_queue_topic', 'number', ['number', 'number'], [id, 0]);
      });
      changed('Undone');
    });
  });
}

function editPlanTopics() {
  var list = state.topics.filter(function (t) { return !t.done || t.inPlan; });
  openDialog(
    '<h2>Add or remove plan topics</h2><p class="muted">Tick the topics that belong to “' + esc(state.plan.name) + '”.</p>' +
    (list.length ? checklistHtml(list, function (t) { return t.inPlan; }, function (t) { return t.done ? ' <span class="muted small">done</span>' : ''; }) : '<div class="empty">No pending topics to add.</div>') +
    '<div class="dlg-actions"><button class="btn btn-quiet" data-close="cancel">Cancel</button><button class="btn btn-teal" id="ep-save">Save</button></div>',
    function (body, close) {
      bindChecklist(body);
      body.querySelector('#ep-save').addEventListener('click', function () {
        var ids = Array.prototype.map.call(body.querySelectorAll('input[data-in]:checked'), function (c) { return c.value; }).join(',');
        close('ok', ids);
      });
    }
  ).then(function (r) {
    if (r.value === 'ok') {
      var n = api('wasm_set_plan_topics', 'number', ['string'], [r.data]);
      changed('The plan now has ' + plural(n, 'topic'));
    }
  });
}

function extendPlan() {
  var p = state.plan;
  var suggest = Math.max(addDays(p.end, 3), addDays(state.today, 3));
  openDialog(
    '<h2>Change end date</h2><p class="muted">The plan ends on ' + longDate(p.end) + '. Pick a later date to get more days.</p>' +
    '<div class="field"><label for="ex-end">New end date</label><input id="ex-end" type="date" min="' + ymdToInput(Math.max(addDays(p.end, 1), state.today)) + '" value="' + ymdToInput(suggest) + '"></div>' +
    '<p class="error" id="ex-err" role="alert"></p>' +
    '<div class="dlg-actions"><button class="btn btn-quiet" data-close="cancel">Cancel</button><button class="btn btn-teal" id="ex-save">Save date</button></div>',
    function (body, close) {
      body.querySelector('#ex-save').addEventListener('click', function () {
        var d = inputToYmd(body.querySelector('#ex-end').value);
        var code = api('wasm_extend_plan', 'number', ['number'], [d]);
        if (code === -2) { body.querySelector('#ex-err').textContent = 'Pick today or a later date.'; return; }
        if (code === -3) { body.querySelector('#ex-err').textContent = 'Pick a date after ' + longDate(p.end) + '.'; return; }
        close('ok');
      });
    }
  ).then(function (r) {
    if (r.value === 'ok') changed('End date changed');
  });
}

function deletePlan() {
  confirmBox('Delete “' + state.plan.name + '”?', 'Your topics and their progress stay. Only the plan and its daily target are removed.', 'Delete plan', true).then(function (ok) {
    if (ok) {
      api('wasm_delete_plan', 'number');
      changed('Plan deleted');
    }
  });
}