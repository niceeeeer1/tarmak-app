/**
 * Тармақ — бэкенд колледжской сети на Google Apps Script.
 * Google Таблица = база данных, Google Диск = хранилище фото.
 *
 * Листы:   Posts, Comments, Polls, Users, Notifications
 * Папка:   College_Threads_Media (рядом с таблицей на Диске)
 *
 * API (Web App):
 *   GET  ?action=bootstrap&token=…   — лента, комментарии, опросы, пользователи, мои уведомления, статистика
 *   GET  ?action=stats               — только KPI
 *   POST body = JSON-строка { action, token, ...данные }  (Content-Type: text/plain — без CORS preflight)
 */

// ───────────────────────── Настройки ─────────────────────────
var CONFIG = {
  DEMO_MODE: true,                 // true — демо-аккаунты demo-student / demo-teacher / demo-admin. Для продакшена: false
  MEDIA_FOLDER: 'College_Threads_Media',
  MAX_IMAGE_BYTES: 5 * 1024 * 1024,
  MAX_POSTS_PER_10_MIN: 8,         // антиспам (действует и для анонимных постов)
  LOCK_TIMEOUT_MS: 20000,
  SCHEMA_VERSION: '1'
};

var SCHEMA = {
  Posts: ['id', 'createdAt', 'authorId', 'anon', 'type', 'text', 'images', 'quoteId', 'repostOf', 'chainOf', 'chainIdx',
          'likedBy', 'repostedBy', 'ticketNum', 'category', 'building', 'floor', 'room', 'status', 'deadline',
          'resolvedAt', 'confirmedBy', 'officialText', 'officialBy', 'officialAt', 'deleted'],
  Comments: ['id', 'postId', 'parentId', 'authorId', 'anon', 'text', 'createdAt', 'likedBy', 'deleted'],
  Polls: ['postId', 'options', 'votes'],
  Users: ['id', 'name', 'handle', 'role', 'group', 'bio', 'hue', 'token', 'following', 'createdAt'],
  Notifications: ['id', 'to', 'type', 'fromId', 'postId', 'payload', 'read', 'createdAt']
};

var JSON_COLS = ['images', 'likedBy', 'repostedBy', 'confirmedBy', 'following', 'options', 'votes', 'payload'];
var OBJ_COLS = ['votes', 'payload'];
var NUM_COLS = ['createdAt', 'chainIdx', 'ticketNum', 'deadline', 'resolvedAt', 'officialAt', 'hue'];
var BOOL_COLS = ['anon', 'deleted', 'read'];

var POST_TYPES = ['talk', 'idea', 'complaint', 'lost'];
var COMPLAINT_CATS = ['cleaning', 'furniture', 'heat', 'wc', 'canteen'];
var CATEGORIES = COMPLAINT_CATS.concat(['idea', 'lost']);
var BUILDINGS = ['main', 'b2', 'dorm', 'gym'];
var TICKET_FLOW = ['accepted', 'review', 'resolved', 'rejected'];
var LOST_FLOW = ['searching', 'found', 'returned'];
var SOLVED = ['resolved', 'returned'];
var CLOSED = ['resolved', 'returned', 'rejected'];
var STATUS_LABELS = {
  kz: { accepted: 'Қабылданды', review: 'Қаралуда', resolved: 'Шешілді', rejected: 'Қабылданбады',
        searching: 'Іздеуде', found: 'Табылды', returned: 'Иесіне қайтарылды', overdue: 'Мерзімі өтті' },
  ru: { accepted: 'Принято', review: 'В работе', resolved: 'Решено', rejected: 'Отклонено',
        searching: 'В поиске', found: 'Найдено', returned: 'Возвращено владельцу', overdue: 'Просрочено' }
};
var DEMO_TOKENS = { student: 'demo-student', teacher: 'demo-teacher', admin: 'demo-admin' };
var H = 3600 * 1000, D = 24 * H;

// ───────────────────────── Меню и установка ─────────────────────────
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Тармақ')
    .addItem('Орнату / Установить', 'setup')
    .addToUi();
}

/** Запустите один раз вручную (или он выполнится сам при первом запросе). */
function setup() {
  ensureSheets_();
  var folder = ensureFolder_();
  if (CONFIG.DEMO_MODE) seedDemo_();
  PropertiesService.getScriptProperties().setProperty('SCHEMA_VERSION', CONFIG.SCHEMA_VERSION);
  return 'OK: листы созданы, папка ' + folder.getName() + ' (' + folder.getId() + ')';
}

function ensureReady_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('SCHEMA_VERSION') === CONFIG.SCHEMA_VERSION) return;
  var lock = LockService.getScriptLock();
  lock.waitLock(CONFIG.LOCK_TIMEOUT_MS);
  try {
    if (props.getProperty('SCHEMA_VERSION') !== CONFIG.SCHEMA_VERSION) setup();
  } finally {
    lock.releaseLock();
  }
}

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function ensureSheets_() {
  var ss = ss_();
  Object.keys(SCHEMA).forEach(function (name) {
    var cols = SCHEMA[name];
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var lastCol = sh.getLastColumn();
    var head = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String) : [];
    if (!head.filter(String).length) {
      sh.getRange(1, 1, 1, cols.length).setValues([cols]);
    } else {
      var missing = cols.filter(function (c) { return head.indexOf(c) < 0; });
      if (missing.length) sh.getRange(1, head.length + 1, 1, missing.length).setValues([missing]);
    }
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold');
  });
}

function ensureFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('MEDIA_FOLDER_ID');
  if (id) {
    try {
      var f = DriveApp.getFolderById(id);
      if (!f.isTrashed()) return f;
    } catch (e) { /* папку удалили — создадим заново */ }
  }
  var parent;
  try {
    var parents = DriveApp.getFileById(ss_().getId()).getParents();
    parent = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  } catch (e) {
    parent = DriveApp.getRootFolder();
  }
  var it = parent.getFoldersByName(CONFIG.MEDIA_FOLDER);
  var folder = it.hasNext() ? it.next() : parent.createFolder(CONFIG.MEDIA_FOLDER);
  props.setProperty('MEDIA_FOLDER_ID', folder.getId());
  return folder;
}

// ───────────────────────── Работа с таблицей ─────────────────────────
function readTable_(name) {
  var sh = ss_().getSheetByName(name);
  var values = sh.getDataRange().getValues();
  var head = values.length ? values[0].map(String) : [];
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    if (r.every(function (v) { return v === '' || v === null; })) continue;
    var o = { _row: i + 1 };
    head.forEach(function (h, j) { if (h) o[h] = parseCell_(h, r[j]); });
    rows.push(o);
  }
  return { sh: sh, head: head, rows: rows };
}

function parseCell_(col, v) {
  if (JSON_COLS.indexOf(col) >= 0) {
    var empty = OBJ_COLS.indexOf(col) >= 0 ? {} : [];
    if (v === '' || v === null || v === undefined) return empty;
    try { return JSON.parse(v); } catch (e) { return empty; }
  }
  if (NUM_COLS.indexOf(col) >= 0) {
    if (v === '' || v === null || v === undefined) return null;
    if (v instanceof Date) return v.getTime();
    var n = Number(v);
    return isNaN(n) ? null : n;
  }
  if (BOOL_COLS.indexOf(col) >= 0) return v === true || String(v).toUpperCase() === 'TRUE';
  if (v instanceof Date) return v.toISOString();
  return v === null || v === undefined ? '' : String(v);
}

function toCell_(col, v) {
  if (JSON_COLS.indexOf(col) >= 0) return JSON.stringify(v === null || v === undefined ? (OBJ_COLS.indexOf(col) >= 0 ? {} : []) : v);
  if (BOOL_COLS.indexOf(col) >= 0) return !!v;
  if (NUM_COLS.indexOf(col) >= 0) return v === null || v === undefined || v === '' ? '' : Number(v);
  if (v === null || v === undefined || v === '') return '';
  // Апостроф = «это текст»: Таблица не превратит «1/3» в дату, «206» в число, «=…» в формулу.
  return "'" + String(v);
}

function appendRows_(t, objs) {
  if (!objs.length) return;
  var data = objs.map(function (o) { return t.head.map(function (h) { return toCell_(h, o[h]); }); });
  var start = t.sh.getLastRow() + 1;
  t.sh.getRange(start, 1, data.length, t.head.length).setValues(data);
  objs.forEach(function (o, i) { o._row = start + i; t.rows.push(o); });
}

/** Точечно обновляет только нужные ячейки строки — меньше шансов затереть чужие изменения. */
function setCells_(t, obj, patch) {
  Object.keys(patch).forEach(function (col) {
    var c = t.head.indexOf(col);
    if (c < 0) return;
    obj[col] = patch[col];
    t.sh.getRange(obj._row, c + 1).setValue(toCell_(col, patch[col]));
  });
}

function find_(t, id, col) {
  col = col || 'id';
  for (var i = 0; i < t.rows.length; i++) if (t.rows[i][col] === String(id)) return t.rows[i];
  return null;
}

// ───────────────────────── HTTP ─────────────────────────
function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    ensureReady_();
    var viewer = p.token ? auth_(p.token) : null;
    var action = p.action || 'bootstrap';
    if (action === 'bootstrap') return json_({ ok: true, data: bootstrap_(viewer) });
    if (action === 'stats') return json_({ ok: true, data: stats_(readTable_('Posts').rows.filter(notDeleted_), Date.now()) });
    if (action === 'ping') return json_({ ok: true, data: { time: Date.now() } });
    throw err_('unknown_action');
  } catch (err) {
    return json_({ ok: false, error: err.code || 'server_error', message: String(err.message || err) });
  }
}

function doPost(e) {
  var body;
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return json_({ ok: false, error: 'bad_json' }); }
  var action = String(body.action || '');
  try {
    ensureReady_();
    // Загрузка фото пишет только на Диск (не в листы), поэтому не держит общий замок и не тормозит лайки других.
    if (action === 'upload') return json_({ ok: true, data: upload_(body, requireUser_(body.token)) });

    var fn = ACTIONS[action];
    if (!fn) throw err_('unknown_action');
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(CONFIG.LOCK_TIMEOUT_MS)) return json_({ ok: false, error: 'busy', message: 'Сервер занят, повторите' });
    try {
      var viewer = action === 'register' ? null : requireUser_(body.token);
      var data = fn(body, viewer);
      SpreadsheetApp.flush();
      return json_({ ok: true, data: data });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return json_({ ok: false, error: err.code || 'server_error', message: String(err.message || err) });
  }
}

var ACTIONS = {
  bootstrap: function (b, viewer) { return bootstrap_(viewer); },
  register: register_,
  createPost: createPost_,
  like: like_,
  repost: repost_,
  vote: vote_,
  confirm: confirm_,
  comment: comment_,
  setStatus: setStatus_,
  setDeadline: setDeadline_,
  setOfficial: setOfficial_,
  deletePost: deletePost_,
  deleteComment: deleteComment_,
  follow: follow_,
  markRead: markRead_
};

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function err_(code, msg) { var e = new Error(msg || code); e.code = code; return e; }
function id_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 12); }
function pad_(n) { return '#' + ('0000' + n).slice(-4); }
function clean_(s, max) { return String(s || '').replace(/\u0000/g, '').trim().slice(0, max); }
function notDeleted_(r) { return !r.deleted; }
function setIn_(arr, v, on) {
  arr = (arr || []).filter(function (x) { return x !== v; });
  if (on) arr.push(v);
  return arr;
}
function isOverdue_(p, now) { return !!(p.ticketNum && p.deadline && now > p.deadline && CLOSED.indexOf(p.status) < 0); }

// ───────────────────────── Пользователи ─────────────────────────
function auth_(token) {
  token = String(token || '');
  if (!token) return null;
  if (!CONFIG.DEMO_MODE && /^demo-/.test(token)) return null;
  var t = readTable_('Users');
  return find_(t, token, 'token');
}
function requireUser_(token) {
  var u = auth_(token);
  if (!u) throw err_('auth', 'Войдите заново');
  return u;
}
function requireAdmin_(u) { if (u.role !== 'admin') throw err_('forbidden', 'Только администрация / студсовет'); }

function publicUser_(u, followers) {
  return { id: u.id, name: u.name, handle: u.handle, role: u.role || 'student', group: u.group, bio: u.bio,
           hue: u.hue || 200, followers: followers[u.id] || 0 };
}

function register_(b) {
  var name = clean_(b.name, 60);
  if (name.length < 2) throw err_('bad_name', 'Укажите имя');
  var t = readTable_('Users');
  var base = name.toLowerCase().replace(/[^a-z0-9а-яәғқңөұүһі]+/gi, '').slice(0, 14) || 'user';
  var handle = translit_(base) + Math.floor(100 + Math.random() * 900);
  var user = { id: 'u' + id_(), name: name, handle: handle, role: 'student', group: clean_(b.group, 40), bio: '',
               hue: Math.floor(Math.random() * 360), token: Utilities.getUuid(), following: [], createdAt: Date.now() };
  appendRows_(t, [user]);
  return { token: user.token, me: meView_(user, {}) };
}
function meView_(u, followers) {
  var o = publicUser_(u, followers);
  o.following = u.following || [];
  return o;
}
function translit_(s) {
  var m = { а:'a',ә:'a',б:'b',в:'v',г:'g',ғ:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'i',к:'k',қ:'q',л:'l',м:'m',н:'n',ң:'n',
            о:'o',ө:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ұ:'u',ү:'u',ф:'f',х:'h',һ:'h',ц:'c',ч:'ch',ш:'sh',щ:'sh',ы:'y',і:'i',э:'e',ю:'yu',я:'ya' };
  return s.split('').map(function (c) { return m[c] !== undefined ? m[c] : c; }).join('').replace(/[^a-z0-9]/g, '');
}

function follow_(b, viewer) {
  var t = readTable_('Users');
  var me = find_(t, viewer.id);
  var target = find_(t, b.userId);
  if (!target || target.id === me.id) throw err_('not_found');
  var was = (me.following || []).indexOf(target.id) >= 0;
  setCells_(t, me, { following: setIn_(me.following, target.id, !!b.on) });
  if (b.on && !was) notify_(target.id, 'follow', viewer.id, '', {});
  return { following: me.following };
}

// ───────────────────────── Чтение ленты ─────────────────────────
function bootstrap_(viewer) {
  var now = Date.now();
  var users = readTable_('Users').rows;
  var posts = readTable_('Posts').rows.filter(notDeleted_);
  var comments = readTable_('Comments').rows.filter(notDeleted_);
  var polls = {};
  readTable_('Polls').rows.forEach(function (p) { polls[p.postId] = p; });
  var followers = {};
  users.forEach(function (u) { (u.following || []).forEach(function (id) { followers[id] = (followers[id] || 0) + 1; }); });
  var notifs = [];
  if (viewer) {
    notifs = readTable_('Notifications').rows
      .filter(function (n) { return n.to === viewer.id; })
      .sort(function (a, b) { return b.createdAt - a.createdAt; })
      .slice(0, 100).map(publicNotif_);
  }
  return {
    me: viewer ? meView_(viewer, followers) : null,
    users: users.map(function (u) { return publicUser_(u, followers); }),
    posts: posts.map(function (p) { return publicPost_(p, viewer, polls[p.id], now); }),
    comments: comments.map(function (c) { return publicComment_(c, viewer); }),
    notifications: notifs,
    stats: stats_(posts, now),
    statusLabels: STATUS_LABELS,
    serverTime: now
  };
}

/** Анонимность: authorId виден только самому автору. Ни студенты, ни админы его не получают. */
function publicPost_(p, viewer, poll, now) {
  var mine = !!viewer && p.authorId === viewer.id;
  return {
    id: p.id, createdAt: p.createdAt, authorId: p.anon && !mine ? null : p.authorId, anon: !!p.anon, mine: mine,
    type: p.type, text: p.text, images: p.images || [], quoteId: p.quoteId || null, repostOf: p.repostOf || null,
    chainOf: p.chainOf || null, chainIdx: p.chainIdx || 0, likedBy: p.likedBy || [], repostedBy: p.repostedBy || [],
    ticket: p.ticketNum ? {
      num: p.ticketNum, code: pad_(p.ticketNum), category: p.category, building: p.building, floor: p.floor, room: p.room,
      status: p.status, statusLabel: STATUS_LABELS.kz[p.status] || p.status, deadline: p.deadline, resolvedAt: p.resolvedAt,
      confirmedBy: p.confirmedBy || [],
      official: p.officialText ? { text: p.officialText, by: p.officialBy, at: p.officialAt } : null,
      overdue: isOverdue_(p, now || Date.now())
    } : null,
    poll: poll ? pollView_(poll, viewer) : null
  };
}
function pollView_(poll, viewer) {
  var counts = poll.options.map(function () { return 0; });
  var votes = poll.votes || {};
  Object.keys(votes).forEach(function (k) { if (counts[votes[k]] !== undefined) counts[votes[k]]++; });
  var my = viewer && votes[viewer.id] !== undefined ? votes[viewer.id] : null;
  return { options: poll.options, counts: counts, myVote: my };
}
function publicComment_(c, viewer) {
  var mine = !!viewer && c.authorId === viewer.id;
  return { id: c.id, postId: c.postId, parentId: c.parentId || null, authorId: c.anon && !mine ? null : c.authorId,
           anon: !!c.anon, mine: mine, text: c.text, createdAt: c.createdAt, likedBy: c.likedBy || [] };
}
function publicNotif_(n) {
  var anon = n.payload && n.payload.anon;
  return { id: n.id, type: n.type, fromId: anon ? null : (n.fromId || null), postId: n.postId || null,
           payload: n.payload || {}, read: !!n.read, createdAt: n.createdAt };
}

// ───────────────────────── Статистика:  T = Σtᵢ / n ─────────────────────────
function stats_(posts, now) {
  var tickets = posts.filter(function (p) { return p.ticketNum && p.type !== 'repost'; });
  var solved = tickets.filter(function (p) { return SOLVED.indexOf(p.status) >= 0; });
  var times = solved.filter(function (p) { return p.resolvedAt; })
                    .map(function (p) { return (p.resolvedAt - p.createdAt) / H; });
  var sum = times.reduce(function (a, b) { return a + b; }, 0);
  var byCat = {}, byStatus = {};
  CATEGORIES.forEach(function (c) { byCat[c] = { total: 0, solved: 0 }; });
  tickets.forEach(function (p) {
    var c = byCat[p.category] || (byCat[p.category] = { total: 0, solved: 0 });
    c.total++;
    if (SOLVED.indexOf(p.status) >= 0) c.solved++;
    byStatus[p.status] = (byStatus[p.status] || 0) + 1;
  });
  return {
    total: tickets.length,
    open: tickets.filter(function (p) { return CLOSED.indexOf(p.status) < 0; }).length,
    solved: solved.length,
    solvedPct: tickets.length ? Math.round(solved.length / tickets.length * 100) : 0,
    sumHours: Math.round(sum * 10) / 10,
    n: times.length,
    avgHours: times.length ? Math.round(sum / times.length * 10) / 10 : 0,
    overdue: tickets.filter(function (p) { return isOverdue_(p, now); }).length,
    byCat: byCat,
    byStatus: byStatus
  };
}

// ───────────────────────── Фото на Google Диск ─────────────────────────
function upload_(b, viewer) {
  var raw = String(b.data || '');
  var m = raw.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/);
  var mime = m ? m[1] : String(b.mime || 'image/jpeg');
  var base64 = m ? m[2] : raw;
  if (!/^image\/(jpeg|png|webp|gif)$/.test(mime)) throw err_('bad_mime', 'Только изображения');
  var bytes = Utilities.base64Decode(base64);
  if (bytes.length > CONFIG.MAX_IMAGE_BYTES) throw err_('too_large', 'Фото больше 5 МБ');
  var ext = mime.split('/')[1].replace('jpeg', 'jpg');
  var blob = Utilities.newBlob(bytes, mime, viewer.id + '_' + Date.now() + '.' + ext);
  var file = ensureFolder_().createFile(blob);
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    // В Google Workspace колледжа админ домена может запрещать доступ по ссылке
    throw err_('sharing_blocked', 'Диск запрещает доступ по ссылке: ' + e.message);
  }
  var fileId = file.getId();
  return { fileId: fileId, url: 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w1000' };
}
function isDriveUrl_(u) { return /^https:\/\/drive\.google\.com\/thumbnail\?id=[\w-]+&sz=w\d+$/.test(String(u)); }

// ───────────────────────── Посты, ветки, заявки ─────────────────────────
function rateLimit_(viewer) {
  var since = Date.now() - 10 * 60 * 1000;
  var n = readTable_('Posts').rows.filter(function (p) { return p.authorId === viewer.id && p.createdAt > since && p.type !== 'repost'; }).length
        + readTable_('Comments').rows.filter(function (c) { return c.authorId === viewer.id && c.createdAt > since; }).length;
  if (n >= CONFIG.MAX_POSTS_PER_10_MIN * 2) throw err_('rate_limit', 'Слишком часто. Подождите несколько минут');
}

function nextTicketNum_(t) {
  var props = PropertiesService.getScriptProperties();
  var max = Number(props.getProperty('TICKET_SEQ') || 0);
  t.rows.forEach(function (p) { if (p.ticketNum > max) max = p.ticketNum; });
  var next = max + 1;
  props.setProperty('TICKET_SEQ', String(next));
  return next;
}

/**
 * b = { type, anon, quoteId, category, building, floor, room,
 *       segments: [{ text, images:[driveUrl], poll:{ options:[…] } | null }] }
 * Несколько segments = ветка («Тармақ қосу»).
 */
function createPost_(b, viewer) {
  var type = String(b.type);
  if (POST_TYPES.indexOf(type) < 0) throw err_('bad_type');
  var segs = (b.segments || []).slice(0, 10).map(function (s) {
    var opts = s.poll && s.poll.options ? s.poll.options.map(function (o) { return clean_(o, 80); }).filter(String).slice(0, 4) : [];
    return { text: clean_(s.text, 2000), images: (s.images || []).filter(isDriveUrl_).slice(0, 4), poll: opts.length >= 2 ? opts : null };
  }).filter(function (s) { return s.text || s.images.length; });
  if (!segs.length) throw err_('empty', 'Пустой пост');
  rateLimit_(viewer);

  var T = readTable_('Posts');
  var now = Date.now();
  var isTicket = type !== 'talk';
  var num = isTicket ? nextTicketNum_(T) : null;
  var cat = type === 'complaint' ? (COMPLAINT_CATS.indexOf(b.category) >= 0 ? b.category : 'cleaning') : type;
  var quote = b.quoteId ? find_(T, b.quoteId) : null;
  var headId = id_();

  var rows = segs.map(function (s, i) {
    var head = i === 0;
    return {
      id: head ? headId : id_(), createdAt: now + i, authorId: viewer.id, anon: !!b.anon, type: type, text: s.text,
      images: s.images, quoteId: head && quote ? quote.id : '', repostOf: '', chainOf: head ? '' : headId, chainIdx: i,
      likedBy: [], repostedBy: [],
      ticketNum: head && isTicket ? num : null,
      category: head && isTicket ? cat : '',
      building: head && isTicket ? (BUILDINGS.indexOf(b.building) >= 0 ? b.building : 'main') : '',
      floor: head && isTicket ? clean_(b.floor, 4) : '',
      room: head && isTicket ? clean_(b.room, 30) : '',
      status: head && isTicket ? (type === 'lost' ? 'searching' : 'accepted') : '',
      deadline: null, resolvedAt: null, confirmedBy: [], officialText: '', officialBy: '', officialAt: null, deleted: false
    };
  });
  appendRows_(T, rows);

  var P = readTable_('Polls');
  var pollRows = [];
  segs.forEach(function (s, i) { if (s.poll) pollRows.push({ postId: rows[i].id, options: s.poll, votes: {} }); });
  appendRows_(P, pollRows);

  if (isTicket) {
    readTable_('Users').rows.filter(function (u) { return u.role === 'admin'; }).forEach(function (a) {
      notify_(a.id, 'ticket', b.anon ? '' : viewer.id, headId, { anon: !!b.anon, num: num });
    });
  }
  if (quote && quote.authorId !== viewer.id) notify_(quote.authorId, 'quote', b.anon ? '' : viewer.id, headId, { anon: !!b.anon });

  var pollMap = {};
  pollRows.forEach(function (p) { pollMap[p.postId] = p; });
  return { ticketNum: num, posts: rows.map(function (r) { return publicPost_(r, viewer, pollMap[r.id], now); }) };
}

function deletePost_(b, viewer) {
  var T = readTable_('Posts');
  var p = find_(T, b.postId);
  if (!p) throw err_('not_found');
  if (p.authorId !== viewer.id && viewer.role !== 'admin') throw err_('forbidden');
  T.rows.forEach(function (r) {
    if (r.id === p.id || r.chainOf === p.id || r.repostOf === p.id) setCells_(T, r, { deleted: true });
  });
  return { deleted: p.id };
}

// ───────────────────────── Лайки, репосты, опросы, подтверждения ─────────────────────────
function like_(b, viewer) {
  var isComment = b.kind === 'comment';
  var T = readTable_(isComment ? 'Comments' : 'Posts');
  var r = find_(T, b.id);
  if (!r || r.deleted) throw err_('not_found');
  var was = (r.likedBy || []).indexOf(viewer.id) >= 0;
  var on = !!b.on;
  if (was !== on) {
    setCells_(T, r, { likedBy: setIn_(r.likedBy, viewer.id, on) });
    if (on && r.authorId !== viewer.id) notify_(r.authorId, 'like', viewer.id, isComment ? r.postId : r.id, { comment: isComment });
  }
  return { likes: r.likedBy.length };
}

function repost_(b, viewer) {
  var T = readTable_('Posts');
  var p = find_(T, b.postId);
  if (!p || p.deleted) throw err_('not_found');
  var on = !!b.on;
  var was = (p.repostedBy || []).indexOf(viewer.id) >= 0;
  var created = null;
  if (on && !was) {
    setCells_(T, p, { repostedBy: setIn_(p.repostedBy, viewer.id, true) });
    created = { id: id_(), createdAt: Date.now(), authorId: viewer.id, anon: false, type: 'repost', text: '', images: [],
                quoteId: '', repostOf: p.id, chainOf: '', chainIdx: 0, likedBy: [], repostedBy: [], confirmedBy: [], deleted: false };
    appendRows_(T, [created]);
    if (p.authorId !== viewer.id) notify_(p.authorId, 'repost', viewer.id, p.id, {});
  } else if (!on && was) {
    setCells_(T, p, { repostedBy: setIn_(p.repostedBy, viewer.id, false) });
    T.rows.forEach(function (r) {
      if (r.type === 'repost' && r.repostOf === p.id && r.authorId === viewer.id && !r.deleted) setCells_(T, r, { deleted: true });
    });
  }
  return { repost: created ? publicPost_(created, viewer, null, Date.now()) : null };
}

function vote_(b, viewer) {
  var P = readTable_('Polls');
  var poll = find_(P, b.postId, 'postId');
  if (!poll) throw err_('not_found');
  var votes = poll.votes || {};
  var opt = b.option === null || b.option === undefined ? null : Number(b.option);
  if (opt === null) delete votes[viewer.id];
  else {
    if (!(opt >= 0 && opt < poll.options.length)) throw err_('bad_option');
    votes[viewer.id] = opt;
  }
  setCells_(P, poll, { votes: votes });
  return { poll: pollView_(poll, viewer) };
}

/** Кнопка «Растау» для жалоб. Подтверждение преподавателя даёт бейдж «Оқытушы растады». */
function confirm_(b, viewer) {
  var T = readTable_('Posts');
  var p = find_(T, b.postId);
  if (!p || p.type !== 'complaint') throw err_('not_found');
  var was = (p.confirmedBy || []).indexOf(viewer.id) >= 0;
  var on = !!b.on;
  if (was !== on) {
    setCells_(T, p, { confirmedBy: setIn_(p.confirmedBy, viewer.id, on) });
    if (on && p.authorId !== viewer.id) notify_(p.authorId, 'confirm', viewer.id, p.id, { teacher: viewer.role === 'teacher' });
  }
  return { post: publicPost_(p, viewer, null, Date.now()) };
}

// ───────────────────────── Комментарии (вложенные ветки) ─────────────────────────
function comment_(b, viewer) {
  var text = clean_(b.text, 1000);
  if (!text) throw err_('empty');
  rateLimit_(viewer);
  var posts = readTable_('Posts');
  var post = find_(posts, b.postId);
  if (!post || post.deleted) throw err_('not_found');
  var C = readTable_('Comments');
  var parent = b.parentId ? find_(C, b.parentId) : null;
  if (b.parentId && !parent) throw err_('not_found');
  var c = { id: id_(), postId: post.id, parentId: parent ? parent.id : '', authorId: viewer.id, anon: !!b.anon,
            text: text, createdAt: Date.now(), likedBy: [], deleted: false };
  appendRows_(C, [c]);
  var to = parent ? parent.authorId : post.authorId;
  if (to !== viewer.id) notify_(to, 'reply', b.anon ? '' : viewer.id, post.id, { anon: !!b.anon });
  return { comment: publicComment_(c, viewer) };
}

function deleteComment_(b, viewer) {
  var C = readTable_('Comments');
  var c = find_(C, b.id);
  if (!c) throw err_('not_found');
  if (c.authorId !== viewer.id && viewer.role !== 'admin') throw err_('forbidden');
  setCells_(C, c, { deleted: true });
  return { deleted: c.id };
}

// ───────────────────────── Администрация / Студкеңес ─────────────────────────
function ticketFor_(b, viewer) {
  requireAdmin_(viewer);
  var T = readTable_('Posts');
  var p = find_(T, b.postId);
  if (!p || !p.ticketNum || p.deleted) throw err_('not_found');
  return { T: T, p: p };
}

function setStatus_(b, viewer) {
  var x = ticketFor_(b, viewer), p = x.p;
  var flow = p.type === 'lost' ? LOST_FLOW : TICKET_FLOW;
  if (flow.indexOf(b.status) < 0) throw err_('bad_status');
  var resolvedAt = SOLVED.indexOf(b.status) >= 0
    ? (SOLVED.indexOf(p.status) >= 0 && p.resolvedAt ? p.resolvedAt : Date.now())
    : null;
  if (p.status !== b.status) {
    setCells_(x.T, p, { status: b.status, resolvedAt: resolvedAt });
    notify_(p.authorId, 'status', viewer.id, p.id, { status: b.status, num: p.ticketNum });
  }
  return { post: publicPost_(p, viewer, null, Date.now()) };
}

function setDeadline_(b, viewer) {
  var x = ticketFor_(b, viewer);
  var dl = b.deadline === null || b.deadline === '' ? null : Number(b.deadline);
  if (dl !== null && isNaN(dl)) throw err_('bad_deadline');
  setCells_(x.T, x.p, { deadline: dl });
  return { post: publicPost_(x.p, viewer, null, Date.now()) };
}

function setOfficial_(b, viewer) {
  var x = ticketFor_(b, viewer);
  var text = clean_(b.text, 1500);
  if (!text) throw err_('empty');
  setCells_(x.T, x.p, { officialText: text, officialBy: viewer.id, officialAt: Date.now() });
  notify_(x.p.authorId, 'official', viewer.id, x.p.id, { num: x.p.ticketNum });
  return { post: publicPost_(x.p, viewer, null, Date.now()) };
}

// ───────────────────────── Уведомления ─────────────────────────
function notify_(to, type, fromId, postId, payload) {
  if (!to || to === fromId) return;
  var N = readTable_('Notifications');
  appendRows_(N, [{ id: id_(), to: to, type: type, fromId: fromId || '', postId: postId || '', payload: payload || {},
                    read: false, createdAt: Date.now() }]);
}

function markRead_(b, viewer) {
  var N = readTable_('Notifications');
  var col = N.head.indexOf('read') + 1;
  var toCol = N.head.indexOf('to');
  var last = N.sh.getLastRow();
  if (last < 2) return { read: 0 };
  var range = N.sh.getRange(2, col, last - 1, 1);
  var all = N.sh.getRange(2, 1, last - 1, N.head.length).getValues();
  var vals = range.getValues();
  var n = 0;
  all.forEach(function (r, i) {
    if (String(r[toCol]) === viewer.id && vals[i][0] !== true) { vals[i][0] = true; n++; }
  });
  if (n) range.setValues(vals);
  return { read: n };
}

// ───────────────────────── Демо-данные ─────────────────────────
function seedDemo_() {
  var U = readTable_('Users');
  if (U.rows.length) return;
  var now = Date.now();
  var users = [
    ['u1', 'Айгерім Серікова', 'aigerim_ik923', 'student', 'ИК-923', 'Ақпараттық жүйелер, 3-курс 📚', 330, DEMO_TOKENS.student],
    ['u2', 'Дамир Ахметов', 'damir.a', 'student', 'ПО-22', 'Болашақ бағдарламашы 💻', 205, 'demo-u2'],
    ['u3', 'Мадина Жұмабай', 'madina_zh', 'student', 'ИК-923', 'Студкеңес мүшесі 🏐', 18, 'demo-u3'],
    ['u4', 'Артём Ким', 'artem.kim', 'student', 'ЭК-21', 'Экономика, 2-курс 📷', 150, 'demo-u4'],
    ['t1', 'Ерлан Қасымов', 'erlan_kassymov', 'teacher', 'Информатика оқытушысы', 'Консультация — сенбі, 312', 255, DEMO_TOKENS.teacher],
    ['t2', 'Гүлнар Төлеуова', 'gulnar.t', 'teacher', 'Физика оқытушысы', 'Физика — бәрі туралы ғылым ⚛️', 42, 'demo-t2'],
    ['a1', 'Студкеңес', 'studkenes', 'admin', 'Студенттік кеңес', 'Өтініштер 3 жұмыс күнінде қаралады', 175, DEMO_TOKENS.admin],
    ['a2', 'Колледж әкімшілігі', 'college_admin', 'admin', 'Ресми аккаунт', 'Ресми жаңалықтар', 220, 'demo-a2']
  ].map(function (u) {
    return { id: u[0], name: u[1], handle: u[2], role: u[3], group: u[4], bio: u[5], hue: u[6], token: u[7],
             following: u[0] === 'u1' ? ['a1', 't1'] : ['a1'], createdAt: now - 30 * D };
  });
  appendRows_(U, users);

  var fake = function (n) { var a = []; for (var i = 0; i < n; i++) a.push('s' + i); return a; };
  var base = { anon: false, images: [], quoteId: '', repostOf: '', chainOf: '', chainIdx: 0, repostedBy: [], ticketNum: null,
               category: '', building: '', floor: '', room: '', status: '', deadline: null, resolvedAt: null, confirmedBy: [],
               officialText: '', officialBy: '', officialAt: null, deleted: false };
  var post = function (o) { var r = {}; Object.keys(base).forEach(function (k) { r[k] = base[k]; }); Object.keys(o).forEach(function (k) { r[k] = o[k]; }); return r; };
  var tk = function (num, cat, b, f, room, status) { return { ticketNum: num, category: cat, building: b, floor: f, room: room, status: status }; };
  var merge = function (a, b) { Object.keys(b).forEach(function (k) { a[k] = b[k]; }); return a; };

  var posts = [
    post(merge({ id: 't0001', type: 'lost', authorId: 'u3', createdAt: now - 12 * D, likedBy: fake(19), text: 'Спорт залда көк AirPods қабы табылды 🎧', resolvedAt: now - 12 * D + 20 * H }, tk(1, 'lost', 'gym', '1', 'Зал', 'returned'))),
    post(merge({ id: 't0002', type: 'complaint', authorId: 'u1', createdAt: now - 10 * D, likedBy: fake(27), text: '312-аудиторияда 4 орындық сынған. #жиһаз', resolvedAt: now - 10 * D + 72 * H, deadline: now - 7 * D, confirmedBy: fake(6), officialText: 'Орындықтар жөнделді, екеуі ауыстырылды.', officialBy: 'a1', officialAt: now - 10 * D + 72 * H }, tk(2, 'furniture', 'main', '3', '312', 'resolved'))),
    post(merge({ id: 't0003', type: 'idea', authorId: 'u2', createdAt: now - 8 * D, likedBy: fake(310), text: 'Предлагаю отменить первую пару по понедельникам 😴 #ұсыныс', officialText: 'Кесте стандартқа сай бекітілген, бірақ 1-пара 9:00-ге ауыстырылды.', officialBy: 'a2', officialAt: now - 7 * D }, tk(3, 'idea', 'main', '1', '', 'rejected'))),
    post(merge({ id: 't0004', type: 'complaint', authorId: 'u4', createdAt: now - 6 * D, likedBy: fake(44), text: 'На 3 этаже в туалете неделю не работает кран. #санузел', resolvedAt: now - 6 * D + 50 * H, deadline: now - 3 * D, confirmedBy: fake(9), officialText: 'Кран ауыстырылды. Рахмет!', officialBy: 'a2', officialAt: now - 6 * D + 50 * H }, tk(4, 'wc', 'main', '3', 'WC', 'resolved'))),
    post(merge({ id: 't0005', type: 'complaint', authorId: 'u3', createdAt: now - 4 * D, likedBy: fake(98), text: '206-кабинетте жылу жоқ 🥶 Таңертең +14°C, сабақта күртешемен отырамыз. #жылу', deadline: now - 1 * D, confirmedBy: fake(22).concat(['t2']) }, tk(5, 'heat', 'main', '2', '206', 'review'))),
    post(merge({ id: 't0006', type: 'idea', authorId: 'u1', createdAt: now - 3 * D, likedBy: fake(156), text: 'Ұсыныс: кітапхананың оқу залында розеткалары бар үстелдер жасайық 🔌 #ұсыныс #кітапхана', deadline: now + 20 * D, officialText: 'Ұсыныс қабылданды ✅ Желтоқсанның 10-на дейін 6 розетка блогы орнатылады.', officialBy: 'a1', officialAt: now - 2 * D }, tk(6, 'idea', 'main', '3', 'Кітапхана', 'accepted'))),
    post(merge({ id: 't0007', type: 'lost', authorId: 't2', createdAt: now - 2 * D, likedBy: fake(12), text: '108-кабинетте қара қолшатыр қалып қойыпты ☂️ Иесі — физика кафедрасына келіңіз.' }, tk(7, 'lost', 'main', '1', '108', 'found'))),
    post(merge({ id: 't0008', type: 'complaint', authorId: 'u4', anon: true, createdAt: now - 26 * H, likedBy: fake(37), text: '№2 корпустың артындағы қоқыс жәшіктері үш күннен бері толы.', deadline: now + 2 * D, confirmedBy: fake(14) }, tk(8, 'cleaning', 'b2', '1', 'Аула', 'accepted'))),
    post({ id: 'p_chain', type: 'talk', authorId: 't1', createdAt: now - 6 * H, likedBy: fake(118), text: 'Сессияға 3 апта қалды. Дайындық бойынша 3 кеңес 🧵 #сессия #ИК923' }),
    post({ id: 'p_chain1', type: 'talk', authorId: 't1', chainOf: 'p_chain', chainIdx: 1, createdAt: now - 6 * H + 1, likedBy: fake(54), text: '1/3 Билеттерді бүгіннен бөліп алыңыз: күніне 3 сұрақ — 3 аптада бәрі бітеді.' }),
    post({ id: 'p_chain2', type: 'talk', authorId: 't1', chainOf: 'p_chain', chainIdx: 2, createdAt: now - 6 * H + 2, likedBy: fake(49), text: '2/3 Сенбі сайын 312-аудиторияда консультация, 10:00-де.' }),
    post({ id: 'p_chain3', type: 'talk', authorId: 't1', chainOf: 'p_chain', chainIdx: 3, createdAt: now - 6 * H + 3, likedBy: fake(77), text: '3/3 Ұйқы — ең жақсы шпаргалка 😴' }),
    post({ id: 'p_anon', type: 'talk', authorId: 'u2', anon: true, createdAt: now - 4 * H, likedBy: fake(132), text: 'Подслушано 👀 Говорят, после субботника будет пицца для всех групп. Кто идёт? #субботник' }),
    post({ id: 'p_quote', type: 'talk', authorId: 'u4', createdAt: now - 3 * H, likedBy: fake(41), quoteId: 't0005', text: 'В 204-м так же, подтверждаю! Сидим в куртках на паре по 1С 🥶 #жылу' }),
    post({ id: 'p_news', type: 'talk', authorId: 'a2', createdAt: now - 2 * H, likedBy: fake(87), text: '📣 25 қараша — «Ашық есік күні»! Еріктілер керек. Тіркелу — Студкеңес бөлмесінде (115). #ісшара' }),
    post({ id: 'p_poll', type: 'talk', authorId: 'u3', createdAt: now - 90 * 60 * 1000, likedBy: fake(64), text: 'Асханада ең дәмді не? 🍽️ Студкеңес мәзірді жаңартқысы келеді — дауыс беріңіздер! #асхана' }),
    post(merge({ id: 't0009', type: 'lost', authorId: 'u2', createdAt: now - 5 * H, likedBy: fake(23), text: 'Студенттік билетім жоғалды 😢 Дамир Ахметов, ПО-22. Асхана маңында түсіп қалған сияқты. #жоғалдым' }, tk(9, 'lost', 'main', '1', 'Асхана', 'searching')))
  ];
  appendRows_(readTable_('Posts'), posts);
  PropertiesService.getScriptProperties().setProperty('TICKET_SEQ', '9');

  var votes = {}, counts = [34, 21, 47, 12], k = 0;
  counts.forEach(function (c, i) { for (var j = 0; j < c; j++) votes['s' + (k++)] = i; });
  appendRows_(readTable_('Polls'), [{ postId: 'p_poll', options: ['Палау', 'Манты', 'Самса + шай', 'Үйден әкелемін 😅'], votes: votes }]);

  var c = function (id, postId, parentId, authorId, text, ago) {
    return { id: id, postId: postId, parentId: parentId, authorId: authorId, anon: false, text: text, createdAt: now - ago, likedBy: [], deleted: false };
  };
  appendRows_(readTable_('Comments'), [
    c('c1', 'p_poll', '', 'u1', 'Самса + шай — классика 😂', 60 * 60e3),
    c('c2', 'p_poll', 'c1', 'u2', 'Келісемін, бірақ үзілісте кезек ұзын 🙃', 50 * 60e3),
    c('c3', 'p_poll', '', 't1', 'Мен үйден әкелемін 🙂', 40 * 60e3),
    c('c4', 't0005', '', 't2', 'Растаймын, 206-да таңертең +14°.', 3 * D),
    c('c5', 't0009', '', 'u4', 'Асхана кассасына сұрап көр', 4 * H),
    c('c6', 't0009', 'c5', 'u2', 'Рахмет, барып көремін! 🙏', 3 * H),
    c('c7', 'p_chain', '', 'u1', 'Рахмет, ағай! Мок-тестті қайдан аламыз?', 5 * H),
    c('c8', 'p_chain', 'c7', 't1', 'Moodle-ге жүктедім, «ИК-923» курсында.', 5 * H - 600e3)
  ]);

  appendRows_(readTable_('Notifications'), [
    { id: 'n1', to: 'u1', type: 'reply', fromId: 'u2', postId: 'p_poll', payload: {}, read: false, createdAt: now - 50 * 60e3 },
    { id: 'n2', to: 'u1', type: 'official', fromId: 'a1', postId: 't0006', payload: { num: 6 }, read: false, createdAt: now - 2 * D },
    { id: 'n3', to: 'a1', type: 'ticket', fromId: 'u2', postId: 't0009', payload: { num: 9 }, read: false, createdAt: now - 5 * H },
    { id: 'n4', to: 't1', type: 'reply', fromId: 'u1', postId: 'p_chain', payload: {}, read: false, createdAt: now - 5 * H }
  ]);
}
