/* Accounts and cloud sync (Supabase). The C code keeps reading and writing the
   same three files; this module downloads them before wasm_init and uploads
   them after every change. Without an account everything stays in the browser. */

var Cloud = (function () {
  var cfg = window.SM_CONFIG || {};
  var BASE = String(cfg.supabaseUrl || '').replace(/\/$/, '');
  var KEY = cfg.supabaseKey || '';
  var PATHS = { data: '/data/data.txt', queue: '/data/queue_data.txt', plan: '/data/plan_data.txt' };
  var LS = { mode: 'sm_mode', session: 'sm_session', owner: 'sm_owner', sync: 'sm_sync' };

  var fsRef = null;
  var onDone = null;
  var started = false;
  var session = lsGet(LS.session);
  var syncInfo = lsGet(LS.sync) || { base: null, dirty: false };
  var lastTexts = null;
  var status = 'synced';
  var lastSyncAt = 0;
  var pushTimer = null;
  var pushing = false;
  var again = false;
  var refreshing = null;
  var authContext = 'start';

  /* ---------- small helpers ---------- */

  function lsGet(k) {
    try {
      var v = localStorage.getItem(k);
      return v === null ? null : JSON.parse(v);
    } catch (e) {
      return null;
    }
  }
  function lsSet(k, v) {
    try {
      if (v === null || v === undefined) localStorage.removeItem(k);
      else localStorage.setItem(k, JSON.stringify(v));
    } catch (e) {}
  }
  function saveSync() { lsSet(LS.sync, syncInfo); }
  function mode() { return lsGet(LS.mode); }
  function isCloud() { return mode() === 'cloud' && !!session; }
  function uid() { return session && session.user ? session.user.id : null; }
  function email() { return session && session.user ? session.user.email : ''; }
  function h(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function setLoading(text) {
    var el = document.querySelector('#loading .muted');
    if (el) el.textContent = text;
    var l = document.getElementById('loading');
    if (l) l.hidden = false;
  }

  /* ---------- files on the emscripten FS ---------- */

  function readF(p) {
    try {
      return fsRef.readFile(p, { encoding: 'utf8' });
    } catch (e) {
      return '';
    }
  }
  function readTexts() { return { data: readF(PATHS.data), queue: readF(PATHS.queue), plan: readF(PATHS.plan) }; }
  function writeTexts(t) {
    fsRef.writeFile(PATHS.data, t.data || '');
    fsRef.writeFile(PATHS.queue, t.queue || '');
    fsRef.writeFile(PATHS.plan, t.plan || '');
  }
  function rowTexts(row) { return { data: row.data_txt || '', queue: row.queue_txt || '', plan: row.plan_txt || '' }; }
  function same(a, b) { return !!a && !!b && a.data === b.data && a.queue === b.queue && a.plan === b.plan; }
  function topicCount(text) { return String(text || '').split('\n').filter(function (l) { return l.trim() !== ''; }).length; }
  function flushFs() {
    return new Promise(function (resolve) { fsRef.syncfs(false, function () { resolve(); }); });
  }

  /* ---------- network ---------- */

  function request(path, opts) {
    opts = opts || {};
    var headers = { apikey: KEY, 'Content-Type': 'application/json' };
    Object.keys(opts.headers || {}).forEach(function (k) { headers[k] = opts.headers[k]; });
    return fetch(BASE + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
    }).catch(function () {
      throw { offline: true, message: 'Can’t reach the server. Check your internet connection.' };
    }).then(function (res) {
      return res.text().then(function (t) {
        var j = null;
        try { j = t ? JSON.parse(t) : null; } catch (e) { j = null; }
        return { status: res.status, ok: res.ok, json: j };
      });
    });
  }
  function errText(j) {
    if (!j) return '';
    return j.msg || j.error_description || j.message || j.error || '';
  }
  function errCode(j) {
    if (!j) return '';
    return j.error_code || j.code || j.error || '';
  }

  function saveSession(j, user) {
    var u = user || j.user || {};
    session = {
      access_token: j.access_token,
      refresh_token: j.refresh_token,
      expires_at: j.expires_at ? j.expires_at * 1000 : Date.now() + (parseInt(j.expires_in, 10) || 3600) * 1000,
      user: { id: u.id, email: u.email }
    };
    lsSet(LS.session, session);
  }
  function clearSession() {
    session = null;
    lsSet(LS.session, null);
  }

  function token() {
    if (!session) return Promise.reject({ auth: true, message: 'You are not logged in.' });
    if (session.expires_at - 60000 > Date.now()) return Promise.resolve(session.access_token);
    if (!refreshing) {
      refreshing = request('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        body: { refresh_token: session.refresh_token }
      }).then(function (r) {
        refreshing = null;
        if (r.ok && r.json && r.json.access_token) {
          saveSession(r.json, r.json.user || session.user);
          return session.access_token;
        }
        if (r.status >= 400 && r.status < 500) throw { auth: true, message: 'Your session ended. Log in again.' };
        throw { offline: true, message: 'The server had a problem. Try again in a moment.' };
      }, function (e) {
        refreshing = null;
        throw e;
      });
    }
    return refreshing;
  }

  function authed(path, opts) {
    return token().then(function (t) {
      opts = opts || {};
      opts.headers = opts.headers || {};
      opts.headers.Authorization = 'Bearer ' + t;
      return request(path, opts);
    }).then(function (r) {
      if (r.status === 401) throw { auth: true, message: 'Your session ended. Log in again.' };
      return r;
    });
  }

  /* ---------- the study_data row ---------- */

  function fetchRow(fields) {
    return authed('/rest/v1/study_data?select=' + (fields || '*') + '&user_id=eq.' + uid()).then(function (r) {
      if (!r.ok) throw { message: errText(r.json) || 'Server error ' + r.status };
      return (r.json && r.json[0]) || null;
    });
  }
  function insertRow(t) {
    return authed('/rest/v1/study_data', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: { user_id: uid(), data_txt: t.data, queue_txt: t.queue, plan_txt: t.plan, updated_at: new Date().toISOString() }
    }).then(function (r) {
      if (r.status === 409) return { row: null };
      if (!r.ok) throw { message: errText(r.json) || 'Server error ' + r.status };
      return { row: (r.json && r.json[0]) || null };
    });
  }
  function updateRow(t, base) {
    var q = '/rest/v1/study_data?user_id=eq.' + uid() + (base ? '&updated_at=eq.' + encodeURIComponent(base) : '');
    return authed(q, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: { data_txt: t.data, queue_txt: t.queue, plan_txt: t.plan, updated_at: new Date().toISOString() }
    }).then(function (r) {
      if (!r.ok) throw { message: errText(r.json) || 'Server error ' + r.status };
      return { row: (r.json && r.json[0]) || null };
    });
  }
  function saveTexts(t, row, force) {
    if (!row) {
      return insertRow(t).then(function (r) {
        if (r.row) return r.row;
        return fetchRow().then(function (fresh) { return updateRow(t, null).then(function (u) { return u.row || fresh; }); });
      });
    }
    return updateRow(t, force ? null : row.updated_at).then(function (r) { return r.row; });
  }
  function accepted(t, row) {
    lastTexts = t;
    syncInfo = { base: row ? row.updated_at : null, dirty: false };
    saveSync();
    lastSyncAt = Date.now();
    setStatus('synced');
  }
  function takeServer(row) {
    var t = rowTexts(row);
    writeTexts(t);
    accepted(t, row);
  }

  /* ---------- starting the app ---------- */

  window.addEventListener('hashchange', function () {
    if (/access_token=|error_description=/.test(location.hash)) location.reload();
  });

  function gate(fs, done) {
    fsRef = fs;
    onDone = done;
    var link = readLink();
    if (link && link.error) {
      showAuth('login', link.error);
      return;
    }
    if (link && link.access_token) {
      setLoading('Signing you in…');
      request('/auth/v1/user', { headers: { Authorization: 'Bearer ' + link.access_token } }).then(function (r) {
        if (!r.ok || !r.json || !r.json.id) throw { message: 'This link is no longer valid. Log in or ask for a new link.' };
        var oldUid = uid();
        saveSession(link, r.json);
        lsSet(LS.mode, 'cloud');
        if (oldUid && oldUid !== uid()) lsSet(LS.owner, lsGet(LS.owner) === oldUid ? 'other' : lsGet(LS.owner));
        if (link.type === 'recovery') {
          showAuth('newpass');
        } else {
          afterLogin();
        }
      }).catch(function (e) {
        showAuth('login', e.message);
      });
      return;
    }
    if (mode() === 'local') {
      if (lsGet(LS.owner) === null) lsSet(LS.owner, 'local');
      finish();
      return;
    }
    if (mode() === 'cloud' && session) {
      afterLogin();
      return;
    }
    showAuth('login');
  }

  function readLink() {
    var raw = location.hash.replace(/^#/, '');
    var q = location.search.replace(/^\?/, '');
    var src = raw.indexOf('access_token=') !== -1 || raw.indexOf('error') !== -1 ? raw : (q.indexOf('error') !== -1 ? q : '');
    if (!src) return null;
    var out = {};
    src.split('&').forEach(function (p) {
      var i = p.indexOf('=');
      if (i > 0) out[decodeURIComponent(p.slice(0, i))] = decodeURIComponent(p.slice(i + 1).replace(/\+/g, ' '));
    });
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
    if (out.error || out.error_code) {
      var d = out.error_description || '';
      if (/expired|invalid/i.test(d + out.error_code)) d = 'This link has expired or was already used. Log in, or ask for a new link.';
      return { error: d || 'Something went wrong with that link. Please log in.' };
    }
    if (!out.access_token) return null;
    return out;
  }

  function finish() {
    var a = document.getElementById('auth');
    if (a) a.hidden = true;
    var fn = onDone;
    onDone = null;
    if (fn) fn();
  }

  function afterLogin() {
    lsSet(LS.mode, 'cloud');
    setLoading('Loading your account…');
    hideAuth();
    fetchRow().then(reconcile).then(function () {
      return flushFs();
    }).then(finish).catch(function (e) {
      if (e && e.auth) {
        clearSession();
        showAuth('login', e.message);
        return;
      }
      if (lsGet(LS.owner) === uid()) {
        setStatus('offline');
        finish();
        return;
      }
      showAuth('retry', (e && e.message) || 'Could not load your account.');
    });
  }

  function reconcile(row) {
    var owner = lsGet(LS.owner);
    var local = readTexts();
    var localCount = topicCount(local.data);
    var serverCount = row ? topicCount(row.data_txt) : 0;
    if (owner === uid()) {
      if (syncInfo.dirty) {
        if (!row) return pushStart(local, null);
        if (row.updated_at === syncInfo.base) return pushStart(local, row);
        if (same(local, rowTexts(row))) { accepted(local, row); return; }
        return askConflict(row, local, true);
      }
      if (row) { takeServer(row); return; }
      if (localCount > 0) return pushStart(local, null);
      accepted(local, null);
      return;
    }
    if (owner === 'local' || owner === null) {
      if (localCount > 0 && serverCount > 0) return askFirstLogin(row, localCount, serverCount);
      if (localCount > 0) return uploadLocal(row, local);
      return clearLocalFiles().then(function () {
        if (row) takeServer(row);
        else { writeTexts({ data: '', queue: '', plan: '' }); accepted({ data: '', queue: '', plan: '' }, null); }
        lsSet(LS.owner, uid());
      });
    }
    return clearLocalFiles().then(function () {
      syncInfo = { base: null, dirty: false };
      if (row) takeServer(row);
      else { writeTexts({ data: '', queue: '', plan: '' }); accepted({ data: '', queue: '', plan: '' }, null); }
      lsSet(LS.owner, uid());
    });
  }

  function pushStart(t, row) {
    setLoading('Saving your changes…');
    return saveTexts(t, row, false).then(function (saved) {
      if (saved) { accepted(t, saved); return; }
      return fetchRow().then(function (fresh) {
        if (fresh && !same(t, rowTexts(fresh))) return askConflict(fresh, t, true);
        accepted(t, fresh);
      });
    });
  }

  function uploadLocal(row, local) {
    setLoading('Uploading this browser’s topics to your account…');
    return uploadLocalFiles(true).then(function () {
      return saveTexts(local, row, true);
    }).then(function (saved) {
      accepted(local, saved);
      lsSet(LS.owner, uid());
    });
  }

  function askFirstLogin(row, localCount, serverCount) {
    document.getElementById('loading').hidden = true;
    return openDialog(
      '<h2>Which topics do you want to keep?</h2>' +
      '<p>This browser has <b>' + localCount + '</b> topic' + (localCount === 1 ? '' : 's') + '. Your account has <b>' + serverCount + '</b>.</p>' +
      '<p class="muted small">The one you don’t choose will be replaced. Export a backup first if you want to keep both.</p>' +
      '<div class="choice-list">' +
      '<button class="choice" data-close="account"><b>Use my account’s topics</b><span>' + serverCount + ' topics from the cloud. This browser’s copy is removed.</span></button>' +
      '<button class="choice" data-close="upload"><b>Upload this browser’s topics</b><span>' + localCount + ' topics from here replace what is in your account.</span></button>' +
      '</div>'
    ).then(function (r) {
      if (r.value === 'upload') return uploadLocal(row, readTexts());
      return clearLocalFiles().then(function () {
        takeServer(row);
        lsSet(LS.owner, uid());
      });
    });
  }

  function askConflict(row, local, beforeBoot) {
    var l = document.getElementById('loading');
    if (l) l.hidden = true;
    return openDialog(
      '<h2>Changed on another device</h2>' +
      '<p>This device has changes that were not saved to your account yet, and your account was changed somewhere else in the meantime.</p>' +
      '<div class="choice-list">' +
      '<button class="choice" data-close="server"><b>Use the account’s version</b><span>Your account now has ' + topicCount(row.data_txt) + ' topics. This device’s unsaved changes are dropped.</span></button>' +
      '<button class="choice" data-close="local"><b>Keep this device’s version</b><span>This device has ' + topicCount(local.data) + ' topics. It replaces the account’s version.</span></button>' +
      '</div>'
    ).then(function (r) {
      if (r.value === 'local') {
        setStatus('syncing');
        return updateRow(local, null).then(function (u) { accepted(local, u.row); });
      }
      takeServer(row);
      lsSet(LS.owner, uid());
      if (!beforeBoot) {
        return flushFs().then(function () {
          try { sessionStorage.setItem('sm_note', 'Loaded the latest version from your account'); } catch (e) {}
          location.reload();
        });
      }
    });
  }

  /* ---------- while the app runs ---------- */

  function afterBoot() {
    if (started) return;
    started = true;
    var box = document.getElementById('account');
    if (box) {
      box.addEventListener('click', function (e) {
        var b = e.target.closest('[data-acc]');
        if (!b) return;
        var a = b.dataset.acc;
        if (a === 'signin') showAuth('login', '', 'fromLocal');
        if (a === 'signout') signOut();
        if (a === 'relogin') showAuth('login', 'Your session ended. Log in again to keep syncing.', 'relogin');
        if (a === 'retry') { if (syncInfo.dirty) push(); else checkRemote(); }
        if (a === 'menu') accountDialog();
      });
    }
    window.addEventListener('online', function () { if (isCloud()) { if (syncInfo.dirty) push(); else checkRemote(); } });
    window.addEventListener('offline', function () { if (isCloud()) setStatus('offline'); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') checkRemote();
    });
    setInterval(function () {
      if (isCloud() && syncInfo.dirty && !pushing) push();
    }, 30000);
    if (isCloud()) {
      if (!lastTexts && !syncInfo.dirty) lastTexts = readTexts();
      if (syncInfo.dirty) push();
    }
    renderAccount();
  }

  function onPersist() {
    if (!isCloud() || !fsRef) return;
    var t = readTexts();
    if (lastTexts && same(t, lastTexts)) return;
    syncInfo.dirty = true;
    saveSync();
    setStatus(navigator.onLine === false ? 'offline' : 'saving');
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 1200);
  }

  function push() {
    if (!isCloud()) return;
    if (pushing) { again = true; return; }
    var t = readTexts();
    if (lastTexts && same(t, lastTexts)) {
      syncInfo.dirty = false;
      saveSync();
      setStatus('synced');
      return;
    }
    pushing = true;
    setStatus('saving');
    var job;
    if (syncInfo.base) {
      job = updateRow(t, syncInfo.base).then(function (r) { return r.row; });
    } else {
      job = insertRow(t).then(function (r) { return r.row; });
    }
    job.then(function (row) {
      if (row) { accepted(t, row); return; }
      return fetchRow().then(function (fresh) {
        if (!fresh) return insertRow(t).then(function (r) { if (r.row) accepted(t, r.row); else throw { message: 'Could not save.' }; });
        if (same(t, rowTexts(fresh))) { accepted(t, fresh); return; }
        setStatus('conflict');
        return askConflict(fresh, t, false);
      });
    }).catch(function (e) {
      if (e && e.auth) {
        setStatus('expired');
      } else {
        setStatus(e && e.offline ? 'offline' : 'error');
      }
    }).then(function () {
      pushing = false;
      if (again) { again = false; push(); }
    });
  }

  function checkRemote() {
    if (!isCloud() || pushing || status === 'expired') return;
    if (syncInfo.dirty) { push(); return; }
    fetchRow('updated_at').then(function (row) {
      if (!row || row.updated_at === syncInfo.base) {
        if (status !== 'synced') setStatus('synced');
        return;
      }
      return fetchRow().then(function (full) {
        if (!full) return;
        if (syncInfo.dirty) { push(); return; }
        if (same(readTexts(), rowTexts(full))) { accepted(readTexts(), full); return; }
        takeServer(full);
        return flushFs().then(function () {
          try { sessionStorage.setItem('sm_note', 'Updated with changes from another device'); } catch (e) {}
          location.reload();
        });
      });
    }).catch(function (e) {
      if (e && e.auth) setStatus('expired');
      else if (e && e.offline) setStatus('offline');
    });
  }

  function setStatus(s) {
    status = s;
    renderAccount();
  }

  function statusText() {
    if (status === 'saving') return 'Saving…';
    if (status === 'offline') return 'Offline. Changes sync when you’re back online.';
    if (status === 'error') return 'Couldn’t sync. Trying again soon.';
    if (status === 'conflict') return 'Changed on another device';
    if (status === 'expired') return 'Session ended. Log in to keep syncing.';
    return 'All changes synced';
  }
  function statusClass() {
    if (status === 'synced') return 'ok';
    if (status === 'saving') return 'busy';
    return 'warn';
  }

  function renderAccount() {
    var box = document.getElementById('account');
    if (!box) return;
    if (isCloud()) {
      box.innerHTML =
        '<div class="acc-full"><p class="acc-email" title="' + h(email()) + '">' + h(email()) + '</p>' +
        '<p class="acc-status ' + statusClass() + '"><i></i><span>' + statusText() + '</span></p>' +
        '<div class="acc-btns">' +
        (status === 'expired' ? '<button class="btn btn-teal btn-sm" data-acc="relogin">Log in</button>' : '') +
        (status === 'error' || status === 'offline' ? '<button class="btn btn-quiet btn-sm" data-acc="retry">Try now</button>' : '') +
        '<button class="btn btn-quiet btn-sm" data-acc="signout">Sign out</button></div></div>' +
        '<button class="acc-mini ' + statusClass() + '" data-acc="menu" aria-label="Account: ' + h(email()) + ', ' + statusText() + '"><i></i>' + h((email()[0] || '?').toUpperCase()) + '</button>';
    } else {
      box.innerHTML =
        '<div class="acc-full"><p class="acc-email">No account</p>' +
        '<p class="acc-status warn"><i></i><span>Saved only in this browser</span></p>' +
        '<div class="acc-btns"><button class="btn btn-teal btn-sm" data-acc="signin">Log in to sync</button></div></div>' +
        '<button class="acc-mini warn" data-acc="menu" aria-label="Not logged in"><i></i>?</button>';
    }
  }

  function accountDialog() {
    if (!isCloud()) {
      openDialog('<h2>No account</h2><p>Your topics are saved only in this browser. Log in or sign up to use them on any device.</p>' +
        '<div class="dlg-actions wrap"><button class="btn btn-quiet" data-close="export">Export backup</button><button class="btn btn-quiet" data-close="import">Import</button><button class="btn btn-teal" data-close="signin">Log in to sync</button></div>'
      ).then(function (r) {
        if (r.value === 'signin') showAuth('login', '', 'fromLocal');
        backupAction(r.value);
      });
      return;
    }
    openDialog('<h2>Account</h2><dl class="details"><dt>Email</dt><dd>' + h(email()) + '</dd><dt>Sync</dt><dd>' + statusText() + '</dd></dl>' +
      '<div class="dlg-actions wrap"><button class="btn btn-quiet" data-close="export">Export backup</button><button class="btn btn-quiet" data-close="import">Import</button>' +
      (status === 'expired' ? '<button class="btn btn-teal" data-close="relogin">Log in</button>' : '<button class="btn btn-quiet" data-close="sync">Sync now</button>') + '</div>' +
      '<div class="dlg-actions"><button class="btn btn-danger spacer" data-close="signout">Sign out</button><button class="btn btn-teal" data-close="cancel">Close</button></div>'
    ).then(function (r) {
      backupAction(r.value);
      if (r.value === 'signout') signOut();
      if (r.value === 'sync') { if (syncInfo.dirty) push(); else checkRemote(); }
      if (r.value === 'relogin') showAuth('login', 'Your session ended. Log in again to keep syncing.', 'relogin');
    });
  }

  function backupAction(v) {
    if (v === 'export' && typeof exportData === 'function') exportData();
    if (v === 'import') document.getElementById('import-file').click();
  }

  function signOut() {
    var warn = syncInfo.dirty ? '<p class="error">Some changes have not reached your account yet. If you sign out now they are lost.</p>' : '';
    openDialog('<h2>Sign out?</h2><p>Your topics stay safe in your account. This browser’s copy is removed, so log in again to see them here.</p>' + warn +
      '<div class="dlg-actions"><button class="btn btn-quiet" data-close="cancel">Cancel</button><button class="btn btn-danger" data-close="ok">Sign out</button></div>'
    ).then(function (r) {
      if (r.value !== 'ok') return;
      setLoading('Signing out…');
      var t = session ? session.access_token : null;
      var bye = t ? request('/auth/v1/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + t } }).catch(function () {}) : Promise.resolve();
      bye.then(function () {
        writeTexts({ data: '', queue: '', plan: '' });
        return flushFs();
      }).then(clearLocalFiles).then(function () {
        clearSession();
        lsSet(LS.sync, null);
        lsSet(LS.owner, null);
        lsSet(LS.mode, null);
        location.reload();
      });
    });
  }

  /* ---------- local files <-> cloud files ---------- */

  function clearLocalFiles() {
    if (typeof idbClear !== 'function') return Promise.resolve();
    return idbClear().catch(function () {});
  }

  function uploadLocalFiles(replace) {
    if (typeof idbAll !== 'function') return Promise.resolve();
    return idbAll().then(function (list) {
      var chain = replace ? remoteRequest('', { method: 'DELETE' }).catch(function () {}) : Promise.resolve();
      list.forEach(function (f, i) {
        chain = chain.then(function () {
          setLoading('Uploading files ' + (i + 1) + ' of ' + list.length + '…');
          return remoteUpload(f.topicId, f.blob, f.name, f.type, f.added);
        });
      });
      return chain.then(function () { return clearLocalFiles(); });
    });
  }

  /* ---------- login screen ---------- */

  function hideAuth() {
    var a = document.getElementById('auth');
    if (a) a.hidden = true;
  }

  function showAuth(view, message, context) {
    authContext = context || (onDone ? 'start' : authContext);
    var l = document.getElementById('loading');
    if (l) l.hidden = true;
    var a = document.getElementById('auth');
    if (!a) {
      a = document.createElement('section');
      a.id = 'auth';
      a.className = 'auth';
      document.body.appendChild(a);
    }
    a.hidden = false;
    renderAuth(view, message || '');
  }

  function field(id, label, type, ac, extra) {
    return '<div class="field"><label for="' + id + '">' + label + '</label><input id="' + id + '" type="' + type + '" autocomplete="' + ac + '"' + (extra || '') + '></div>';
  }

  function renderAuth(view, message, note) {
    var a = document.getElementById('auth');
    var inApp = authContext === 'fromLocal' || authContext === 'relogin';
    var body;
    var tabs = view === 'login' || view === 'signup'
      ? '<div class="tabs auth-tabs" role="tablist"><button type="button" role="tab" data-view="login" aria-pressed="' + (view === 'login') + '">Log in</button><button type="button" role="tab" data-view="signup" aria-pressed="' + (view === 'signup') + '">Sign up</button></div>'
      : '';
    if (view === 'login') {
      body = '<form class="form" data-form="login" novalidate>' +
        field('au-email', 'Email', 'email', 'email', ' inputmode="email" autofocus') +
        field('au-pass', 'Password', 'password', 'current-password') +
        '<button type="button" class="btn-link auth-forgot" data-view="forgot">Forgot password?</button>' +
        '<button class="btn btn-teal btn-block" type="submit">Log in</button></form>';
    } else if (view === 'signup') {
      body = '<form class="form" data-form="signup" novalidate>' +
        field('au-email', 'Email', 'email', 'email', ' inputmode="email" autofocus') +
        field('au-pass', 'Password', 'password', 'new-password', ' minlength="8"') +
        '<p class="hint">At least 8 characters.</p>' +
        '<button class="btn btn-teal btn-block" type="submit">Create account</button></form>';
    } else if (view === 'forgot') {
      body = '<h2>Reset your password</h2><p class="muted">Enter your email and we’ll send you a link to set a new password.</p>' +
        '<form class="form" data-form="forgot" novalidate>' + field('au-email', 'Email', 'email', 'email', ' inputmode="email" autofocus') +
        '<button class="btn btn-teal btn-block" type="submit">Send reset link</button></form>' +
        '<button type="button" class="btn-link" data-view="login">Back to log in</button>';
    } else if (view === 'newpass') {
      body = '<h2>Set a new password</h2><p class="muted">For ' + h(email()) + '</p>' +
        '<form class="form" data-form="newpass" novalidate>' + field('au-pass', 'New password', 'password', 'new-password', ' minlength="8" autofocus') +
        '<p class="hint">At least 8 characters.</p><button class="btn btn-teal btn-block" type="submit">Save password</button></form>';
    } else if (view === 'sent') {
      body = '<h2>Check your email</h2><p>' + h(note || '') + '</p>' +
        '<button type="button" class="btn btn-teal btn-block" data-view="login">Back to log in</button>';
    } else {
      body = '<h2>Couldn’t load your account</h2><p class="muted">' + h(message) + '</p>' +
        '<button type="button" class="btn btn-teal btn-block" data-act-auth="retry">Try again</button>';
      message = '';
    }
    var foot;
    if (authContext === 'relogin') {
      foot = '<button type="button" class="btn-link" data-act-auth="close">Not now</button>';
    } else if (authContext === 'fromLocal') {
      foot = '<button type="button" class="btn-link" data-act-auth="close">Back to the app</button>';
    } else if (view === 'retry') {
      foot = '<button type="button" class="btn-link" data-act-auth="signout">Log out</button>';
    } else if (view === 'newpass') {
      foot = '';
    } else {
      foot = '<div class="auth-or"><span>or</span></div><button type="button" class="btn btn-quiet btn-block" data-act-auth="local">Use without account</button>' +
        '<p class="hint auth-hint">Without an account your topics stay only in this browser. You can log in later to sync them.</p>';
    }
    a.innerHTML = '<div class="auth-card">' +
      '<p class="brand">study<span>/</span>manager</p>' +
      (view === 'login' || view === 'signup' ? '<p class="auth-lead">' + (view === 'login' ? 'Log in to see your topics on any device.' : 'Create an account to keep your topics in sync.') + '</p>' : '') +
      tabs + body +
      '<p class="error" id="au-err" role="alert">' + h(message) + '</p>' +
      foot + '</div>';
    if (inApp) a.classList.add('over');
    else a.classList.remove('over');
    a.querySelectorAll('[data-view]').forEach(function (b) {
      b.addEventListener('click', function () {
        var em = a.querySelector('#au-email');
        var keep = em ? em.value : '';
        renderAuth(b.dataset.view, '');
        var em2 = a.querySelector('#au-email');
        if (em2 && keep) em2.value = keep;
      });
    });
    a.querySelectorAll('[data-act-auth]').forEach(function (b) {
      b.addEventListener('click', function () {
        var act = b.dataset.actAuth;
        if (act === 'local') {
          var owner = lsGet(LS.owner);
          lsSet(LS.mode, 'local');
          clearSession();
          lsSet(LS.sync, null);
          if (owner === null || owner === 'local') {
            lsSet(LS.owner, 'local');
            finish();
            return;
          }
          writeTexts({ data: '', queue: '', plan: '' });
          lsSet(LS.owner, 'local');
          clearLocalFiles().then(function () { return flushFs(); }).then(function () {
            if (onDone) finish();
            else location.reload();
          });
        }
        if (act === 'close') {
          hideAuth();
          renderAccount();
        }
        if (act === 'retry') afterLogin();
        if (act === 'signout') {
          clearSession();
          lsSet(LS.mode, null);
          renderAuth('login', '');
        }
      });
    });
    var form = a.querySelector('form');
    if (form) form.addEventListener('submit', function (e) { e.preventDefault(); submitAuth(form.dataset.form, form); });
    var first = a.querySelector('[autofocus]');
    if (first) first.focus();
  }

  function authError(t) {
    var el = document.getElementById('au-err');
    if (el) el.textContent = t;
  }
  function busy(form, on, label) {
    var b = form.querySelector('button[type=submit]');
    if (!b) return;
    if (on) { b.dataset.label = b.textContent; b.textContent = label; b.disabled = true; }
    else { b.textContent = b.dataset.label || b.textContent; b.disabled = false; }
  }
  function redirectUrl() { return location.origin + location.pathname; }

  function submitAuth(kind, form) {
    var emEl = form.querySelector('#au-email');
    var pwEl = form.querySelector('#au-pass');
    var em = emEl ? emEl.value.trim() : '';
    var pw = pwEl ? pwEl.value : '';
    authError('');
    if (emEl && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { authError('Enter a valid email address.'); emEl.focus(); return; }
    if (pwEl && kind !== 'login' && pw.length < 8) { authError('Use at least 8 characters for the password.'); pwEl.focus(); return; }
    if (pwEl && kind === 'login' && !pw) { authError('Enter your password.'); pwEl.focus(); return; }

    if (kind === 'login') {
      busy(form, true, 'Logging in…');
      request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: em, password: pw } }).then(function (r) {
        if (r.ok && r.json && r.json.access_token) {
          loggedIn(r.json);
          return;
        }
        busy(form, false);
        var code = errCode(r.json);
        var txt = errText(r.json);
        if (code === 'email_not_confirmed' || /not confirmed/i.test(txt)) authError('Confirm your email first. Open the link we sent to ' + em + '.');
        else if (r.status === 429) authError('Too many tries. Wait a minute and try again.');
        else if (r.status === 400 || code === 'invalid_credentials') authError('Wrong email or password.');
        else authError(txt || 'Could not log in. Try again.');
      }).catch(function (e) { busy(form, false); authError(e.message); });
    }

    if (kind === 'signup') {
      busy(form, true, 'Creating account…');
      request('/auth/v1/signup?redirect_to=' + encodeURIComponent(redirectUrl()), { method: 'POST', body: { email: em, password: pw } }).then(function (r) {
        busy(form, false);
        if (r.ok && r.json && r.json.access_token) { loggedIn(r.json); return; }
        var u = r.json && (r.json.user || r.json);
        if (r.ok && u && u.identities && u.identities.length === 0) { authError('This email already has an account. Log in instead.'); return; }
        if (r.ok) {
          renderAuth('sent', '', 'We sent a link to ' + em + '. Open it to confirm your account, then you’re logged in.');
          return;
        }
        var code = errCode(r.json);
        var txt = errText(r.json);
        if (code === 'user_already_exists' || /already registered|already exists/i.test(txt)) authError('This email already has an account. Log in instead.');
        else if (code === 'weak_password' || /password/i.test(txt)) authError(txt || 'Choose a stronger password.');
        else if (r.status === 429 || code === 'over_email_send_rate_limit') authError('Too many sign ups right now. Try again in a little while.');
        else authError(txt || 'Could not create the account. Try again.');
      }).catch(function (e) { busy(form, false); authError(e.message); });
    }

    if (kind === 'forgot') {
      busy(form, true, 'Sending…');
      request('/auth/v1/recover?redirect_to=' + encodeURIComponent(redirectUrl()), { method: 'POST', body: { email: em } }).then(function (r) {
        busy(form, false);
        if (r.status === 429) { authError('Too many requests. Wait a minute and try again.'); return; }
        renderAuth('sent', '', 'If ' + em + ' has an account, a link to set a new password is on its way.');
      }).catch(function (e) { busy(form, false); authError(e.message); });
    }

    if (kind === 'newpass') {
      busy(form, true, 'Saving…');
      authed('/auth/v1/user', { method: 'PUT', body: { password: pw } }).then(function (r) {
        busy(form, false);
        if (!r.ok) { authError(errText(r.json) || 'Could not save the password.'); return; }
        afterLogin();
      }).catch(function (e) { busy(form, false); authError(e.message); });
    }
  }

  function loggedIn(j) {
    var before = uid();
    saveSession(j);
    lsSet(LS.mode, 'cloud');
    if (authContext === 'relogin' && before === uid()) {
      hideAuth();
      setStatus('saving');
      push();
      return;
    }
    if (onDone) {
      afterLogin();
      return;
    }
    setLoading('Loading your account…');
    hideAuth();
    persist().then(function () { location.reload(); });
  }

  return {
    gate: gate,
    afterBoot: afterBoot,
    onPersist: onPersist,
    isCloud: isCloud,
    token: token,
    push: push,
    status: function () { return status; },
    _info: function () { return { mode: mode(), owner: lsGet(LS.owner), sync: syncInfo, status: status, uid: uid() }; }
  };
})();
