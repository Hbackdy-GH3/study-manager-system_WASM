/* Topic attachments.
   Without an account: Blobs in the browser's IndexedDB.
   Logged in: files live in Cloudflare R2 behind /api/files (see functions/api/files.js). */

var fileDb = null;
var fileCounts = {};
var MAX_FILE_MB = 50;
var remoteList = null;

function useCloudFiles() {
  return typeof Cloud !== 'undefined' && Cloud.isCloud();
}
function filesReady() {
  return useCloudFiles() || !!fileDb;
}

function openFileDb() {
  if (fileDb) return Promise.resolve();
  try {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
  } catch (e) {}
  return new Promise(function (resolve) {
    var req;
    try {
      req = indexedDB.open('study-files', 1);
    } catch (e) {
      resolve();
      return;
    }
    req.onupgradeneeded = function () {
      var store = req.result.createObjectStore('files', { keyPath: 'key', autoIncrement: true });
      store.createIndex('topic', 'topicId');
    };
    req.onsuccess = function () { fileDb = req.result; resolve(); };
    req.onerror = function () { fileDb = null; resolve(); };
  });
}

function fileStore(mode) {
  return fileDb.transaction('files', mode).objectStore('files');
}

function txDone(tx) {
  return new Promise(function (resolve, reject) {
    tx.oncomplete = function () { resolve(); };
    tx.onerror = function () { reject(tx.error); };
    tx.onabort = function () { reject(tx.error); };
  });
}

/* ---------- browser storage (IndexedDB) ---------- */

function idbAll() {
  return openFileDb().then(function () {
    if (!fileDb) return [];
    return new Promise(function (resolve) {
      var out = [];
      var req = fileStore('readonly').openCursor();
      req.onsuccess = function () {
        var c = req.result;
        if (c) {
          out.push(c.value);
          c.continue();
        } else {
          resolve(out);
        }
      };
      req.onerror = function () { resolve(out); };
    });
  });
}

function idbClear() {
  return openFileDb().then(function () {
    if (!fileDb) return;
    var tx = fileDb.transaction('files', 'readwrite');
    tx.objectStore('files').clear();
    return txDone(tx);
  });
}

function idbAdd(topicId, list) {
  var tx = fileDb.transaction('files', 'readwrite');
  var now = Date.now();
  list.forEach(function (f, i) {
    tx.objectStore('files').add({
      topicId: topicId,
      name: f.name,
      type: f.type || 'application/octet-stream',
      size: f.size,
      added: now + i,
      blob: f
    });
  });
  return txDone(tx);
}

function idbDeleteKeys(keys) {
  if (!fileDb || keys.length === 0) return Promise.resolve();
  var tx = fileDb.transaction('files', 'readwrite');
  keys.forEach(function (k) { tx.objectStore('files').delete(k); });
  return txDone(tx);
}

/* ---------- cloud storage (R2 through /api/files) ---------- */

function filesApi() {
  return (window.SM_CONFIG && SM_CONFIG.filesApi) || '/api/files';
}

function remoteRequest(query, opts) {
  opts = opts || {};
  return Cloud.token().then(function (t) {
    var headers = { Authorization: 'Bearer ' + t };
    Object.keys(opts.headers || {}).forEach(function (k) { headers[k] = opts.headers[k]; });
    return fetch(filesApi() + (query ? '?' + query : ''), { method: opts.method || 'GET', headers: headers, body: opts.body });
  }).then(function (res) {
    if (!res.ok) {
      return res.text().then(function (t) {
        var msg = '';
        try { msg = JSON.parse(t).error || ''; } catch (e) {}
        throw { status: res.status, message: msg || 'File server error ' + res.status };
      });
    }
    return res;
  });
}

function newFileId() {
  var a = new Uint8Array(10);
  crypto.getRandomValues(a);
  return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
}

function remoteUpload(topicId, blob, name, type, added) {
  var id = newFileId();
  var when = added || Date.now();
  var isPdf = type === 'application/pdf' || /\.pdf$/i.test(name);
  var headers = { 'Content-Type': type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(name), 'X-Added': String(when) };
  if (isPdf && blob.size >= 2 * 1024 * 1024) headers['X-Compress'] = '1';
  return remoteRequest('topic=' + topicId + '&id=' + id, { method: 'PUT', headers: headers, body: blob }).then(function (res) {
    return res.json().catch(function () { return {}; });
  }).then(function (j) {
    var size = j.size || blob.size;
    var rec = { key: topicId + '/' + id, id: id, topicId: topicId, name: name, type: type || 'application/octet-stream', size: size, added: when };
    var why = j.note || (j.version ? '' : 'server is on the old version, redeploy it');
    rec.note = j.compressed ? name + ': ' + fileSizeText(blob.size) + ' → ' + fileSizeText(size)
      : (headers['X-Compress'] && why ? name + ' uploaded as is (' + why + ')' : '');
    if (remoteList) remoteList.push(rec);
    if (remoteUsage) remoteUsage.used += size;
    return rec;
  });
}

function loadRemoteList() {
  return remoteRequest('').then(function (res) { return res.json(); }).then(function (j) {
    remoteUsage = j.usage || null;
    remoteList = (j.files || []).map(function (f) {
      return { key: f.topicId + '/' + f.id, id: f.id, topicId: f.topicId, name: f.name, type: f.type, size: f.size, added: f.added };
    });
    return remoteList;
  });
}

/* ---------- shrinking photos before saving ---------- */

var IMG_MAX_SIDE = 2560;
var IMG_MIN_BYTES = 300 * 1024;
var remoteUsage = null;

function canvasBlob(canvas, type, quality) {
  return new Promise(function (resolve) {
    try {
      canvas.toBlob(function (b) { resolve(b); }, type, quality);
    } catch (e) {
      resolve(null);
    }
  });
}

/* returns a smaller File, or null to keep the original */
function compressImage(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < IMG_MIN_BYTES || typeof createImageBitmap !== 'function') {
    return Promise.resolve(null);
  }
  var isPng = file.type === 'image/png';
  return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () {
    return createImageBitmap(file);
  }).then(function (bmp) {
    var scale = Math.min(1, IMG_MAX_SIDE / Math.max(bmp.width, bmp.height));
    var w = Math.max(1, Math.round(bmp.width * scale));
    var h = Math.max(1, Math.round(bmp.height * scale));
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (!isPng) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();
    return canvasBlob(canvas, 'image/webp', isPng ? 0.92 : 0.86).then(function (b) {
      if (b && b.type === 'image/webp') return b;
      if (isPng) return null;
      return canvasBlob(canvas, 'image/jpeg', 0.88);
    });
  }).then(function (b) {
    if (!b || b.size > file.size * 0.85) return null;
    var ext = b.type === 'image/webp' ? '.webp' : '.jpg';
    var name = file.name.replace(/\.(png|jpe?g|webp)$/i, '') + ext;
    return new File([b], name, { type: b.type, lastModified: Date.now() });
  }).catch(function () {
    return null;
  });
}

function prepareFiles(list) {
  var out = [];
  var notes = [];
  var chain = Promise.resolve();
  list.forEach(function (f, i) {
    chain = chain.then(function () {
      if (/^image\//.test(f.type) && f.size >= IMG_MIN_BYTES) {
        toast('Shrinking photo ' + (i + 1) + ' of ' + list.length + '…');
      }
      return compressImage(f).then(function (small) {
        if (small) {
          notes.push(f.name + ': ' + fileSizeText(f.size) + ' → ' + fileSizeText(small.size));
          out.push(small);
        } else {
          out.push(f);
        }
      });
    });
  });
  return chain.then(function () { return { files: out, notes: notes }; });
}

function usageText() {
  if (!useCloudFiles() || !remoteUsage) return '';
  var used = fileSizeText(remoteUsage.used);
  return remoteUsage.quota ? 'Using ' + used + ' of ' + fileSizeText(remoteUsage.quota) : 'Using ' + used + ' of storage';
}

/* ---------- one interface for the rest of the app ---------- */

function allFileRecords() {
  if (useCloudFiles()) {
    if (remoteList) return Promise.resolve(remoteList.slice());
    return loadRemoteList().then(function (l) { return l.slice(); }).catch(function () { return []; });
  }
  return idbAll();
}

function filesFor(topicId) {
  return allFileRecords().then(function (list) {
    var out = list.filter(function (f) { return f.topicId === topicId; });
    out.sort(function (a, b) { return a.added - b.added; });
    return out;
  });
}

function refreshFileCounts() {
  return allFileRecords().then(function (list) {
    fileCounts = {};
    list.forEach(function (f) { fileCounts[f.topicId] = (fileCounts[f.topicId] || 0) + 1; });
  });
}

/* removes files whose topic no longer exists (for example after a topic was deleted elsewhere) */
function cleanOrphanFiles() {
  var ids = {};
  state.topics.forEach(function (t) { ids[t.id] = true; });
  return allFileRecords().then(function (list) {
    var orphans = list.filter(function (f) { return !ids[f.topicId]; });
    if (orphans.length === 0) return;
    if (useCloudFiles()) {
      var topics = {};
      orphans.forEach(function (f) { topics[f.topicId] = true; });
      return Promise.all(Object.keys(topics).map(function (t) { return deleteTopicFiles(parseInt(t, 10)); }));
    }
    return idbDeleteKeys(orphans.map(function (f) { return f.key; }));
  }).catch(function () {});
}

function addFiles(topicId, files) {
  var list = Array.prototype.slice.call(files);
  var tooBig = list.filter(function (f) { return f.size > MAX_FILE_MB * 1024 * 1024 && !/^image\//.test(f.type); });
  var candidates = list.filter(function (f) { return tooBig.indexOf(f) === -1; });
  if (candidates.length === 0) return Promise.resolve({ added: 0, tooBig: tooBig.length, notes: [] });
  return prepareFiles(candidates).then(function (prep) {
    var ok = prep.files.filter(function (f) { return f.size <= MAX_FILE_MB * 1024 * 1024; });
    var extra = prep.files.length - ok.length;
    var notes = prep.notes.slice();
    if (ok.length === 0) return { added: 0, tooBig: tooBig.length + extra, notes: notes };
    if (useCloudFiles()) {
      var chain = Promise.resolve();
      var now = Date.now();
      ok.forEach(function (f, i) {
        chain = chain.then(function () {
          if (/pdf$/i.test(f.type) && f.size >= 2 * 1024 * 1024) toast('Uploading and compressing ' + f.name + '…');
          else toast('Uploading ' + (i + 1) + ' of ' + ok.length + '…');
          return remoteUpload(topicId, f, f.name, f.type, now + i).then(function (rec) {
            if (rec.note) notes.push(rec.note);
          });
        });
      });
      return chain.then(function () { return { added: ok.length, tooBig: tooBig.length + extra, notes: notes }; });
    }
    if (!fileDb) return Promise.reject(new Error('Storage not available'));
    return idbAdd(topicId, ok).then(function () { return { added: ok.length, tooBig: tooBig.length + extra, notes: notes }; });
  });
}

function deleteFile(key) {
  if (useCloudFiles()) {
    var parts = String(key).split('/');
    return remoteRequest('topic=' + parts[0] + '&id=' + parts[1], { method: 'DELETE' }).then(function () {
      if (remoteList) {
        remoteList.forEach(function (f) { if (f.key === key && remoteUsage) remoteUsage.used = Math.max(0, remoteUsage.used - f.size); });
        remoteList = remoteList.filter(function (f) { return f.key !== key; });
      }
    });
  }
  return idbDeleteKeys([key]);
}

function deleteTopicFiles(topicId) {
  if (useCloudFiles()) {
    return remoteRequest('topic=' + topicId, { method: 'DELETE' }).then(function () {
      if (remoteList) {
        remoteList.forEach(function (f) { if (f.topicId === topicId && remoteUsage) remoteUsage.used = Math.max(0, remoteUsage.used - f.size); });
        remoteList = remoteList.filter(function (f) { return f.topicId !== topicId; });
      }
    });
  }
  return filesFor(topicId).then(function (list) {
    return idbDeleteKeys(list.map(function (f) { return f.key; }));
  });
}

function getBlob(f) {
  if (f.blob) return Promise.resolve(f.blob);
  return remoteRequest('topic=' + f.topicId + '&id=' + f.id).then(function (res) { return res.blob(); }).then(function (b) {
    if (b.size < 3 * 1024 * 1024) f.blob = b;
    return b;
  });
}

function fileSizeText(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

function fileKind(f) {
  if (f.type.indexOf('image/') === 0) return 'img';
  if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) return 'pdf';
  return 'other';
}

function openFileBlob(f) {
  if (!f.blob) toast('Opening “' + f.name + '”…');
  getBlob(f).then(function (blob) {
    var url = URL.createObjectURL(blob);
    if (!window.open(url, '_blank')) {
      toast('Your browser blocked the new tab, so the file was downloaded instead.');
      downloadFileBlob(f);
    }
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }).catch(function () {
    toast('Could not open the file. Check your internet connection.');
  });
}

function downloadFileBlob(f) {
  getBlob(f).then(function (blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
  }).catch(function () {
    toast('Could not download the file. Check your internet connection.');
  });
}

var thumbUrls = [];
function clearThumbs() {
  thumbUrls.forEach(function (u) { URL.revokeObjectURL(u); });
  thumbUrls = [];
}

function fileListHtml(list, canDelete) {
  clearThumbs();
  if (list.length === 0) return '<div class="empty">No files yet. Add notes, PDFs or photos for this topic.</div>';
  return '<div class="file-list">' + list.map(function (f) {
    var kind = fileKind(f);
    var thumb;
    if (kind === 'img') {
      thumb = '<img class="file-thumb" data-thumb="' + esc(f.key) + '" alt="">';
    } else {
      thumb = '<span class="file-thumb file-' + kind + '">' + (kind === 'pdf' ? 'PDF' : 'FILE') + '</span>';
    }
    return '<div class="file-item">' + thumb +
      '<div class="file-name"><strong>' + esc(f.name) + '</strong><span class="muted small">' + fileSizeText(f.size) + '</span></div>' +
      '<div class="file-btns"><button class="btn btn-outline btn-sm" data-open-file="' + f.key + '">Open</button>' +
      '<button class="btn btn-quiet btn-sm" data-dl-file="' + f.key + '">Download</button>' +
      (canDelete ? '<button class="icon-btn" data-del-file="' + f.key + '" aria-label="Delete ' + esc(f.name) + '">' + icon('trash') + '</button>' : '') +
      '</div></div>';
  }).join('') + '</div>';
}

function bindFileList(box, list, onDelete) {
  function find(key) {
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].key) === String(key)) return list[i];
    }
    return null;
  }
  box.querySelectorAll('[data-thumb]').forEach(function (img) {
    var f = find(img.dataset.thumb);
    if (!f) return;
    getBlob(f).then(function (blob) {
      var u = URL.createObjectURL(blob);
      thumbUrls.push(u);
      img.src = u;
    }).catch(function () {});
  });
  box.querySelectorAll('[data-open-file]').forEach(function (b) {
    b.addEventListener('click', function () { openFileBlob(find(b.dataset.openFile)); });
  });
  box.querySelectorAll('[data-dl-file]').forEach(function (b) {
    b.addEventListener('click', function () { downloadFileBlob(find(b.dataset.dlFile)); });
  });
  box.querySelectorAll('[data-del-file]').forEach(function (b) {
    b.addEventListener('click', function () {
      var f = find(b.dataset.delFile);
      if (f && onDelete) onDelete(f);
    });
  });
}

function filesDialog(topicId) {
  var t = topicById(topicId);
  if (!t) return;
  if (!filesReady()) {
    toast('File storage is not available in this browser');
    return;
  }
  openDialog(
    '<h2>Files · ' + esc(t.chapter) + '</h2><p class="muted" style="margin:0">' + esc(t.subject) + ' · PDFs, images or any file up to ' + MAX_FILE_MB + ' MB. Photos are shrunk without losing sharpness' + (useCloudFiles() ? ', big PDFs are compressed' : '') + '.</p>' +
    '<div id="file-box"><div class="empty">Loading...</div></div>' +
    '<label class="drop" id="file-drop"><input type="file" id="file-pick" multiple hidden>' + icon('plus') + '<span><strong>Add files</strong><span class="muted small">Click to choose, or drop files here</span></span></label>' +
    '<div class="dlg-actions"><button class="btn btn-teal" data-close="ok">Done</button></div>',
    function (body) {
      var box = body.querySelector('#file-box');
      var pick = body.querySelector('#file-pick');
      var drop = body.querySelector('#file-drop');
      function load() {
        return filesFor(topicId).then(function (list) {
          box.innerHTML = fileListHtml(list, true) + (usageText() ? '<p class="hint">' + usageText() + '</p>' : '');
          bindFileList(box, list, function (f) {
            if (!window.confirm('Delete “' + f.name + '”?')) return;
            deleteFile(f.key).then(load).then(afterFilesChanged).catch(function () {
              toast('Could not delete the file. Check your internet connection.');
            });
          });
        });
      }
      function add(files) {
        if (!files || files.length === 0) return;
        addFiles(topicId, files).then(function (r) {
          var msg = plural(r.added, 'file') + ' added';
          if (r.tooBig) msg += ', ' + r.tooBig + ' over ' + MAX_FILE_MB + ' MB skipped';
          if (r.notes && r.notes.length) msg += '. ' + r.notes.join('. ');
          toast(msg);
          return load().then(afterFilesChanged);
        }).catch(function (e) {
          toast(useCloudFiles() ? 'Could not upload: ' + ((e && e.message) || 'check your internet connection') : 'Could not save the file. The browser may be out of storage.');
          load();
        });
      }
      pick.addEventListener('change', function () {
        add(pick.files);
        pick.value = '';
      });
      drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('over'); });
      drop.addEventListener('dragleave', function () { drop.classList.remove('over'); });
      drop.addEventListener('drop', function (e) {
        e.preventDefault();
        drop.classList.remove('over');
        add(e.dataTransfer.files);
      });
      load();
    }
  ).then(function () {
    clearThumbs();
  });
}

function afterFilesChanged() {
  return refreshFileCounts().then(function () {
    if (typeof onFilesChanged === 'function') onFilesChanged();
  });
}

/* backup helpers */
function blobToDataUrl(blob) {
  return new Promise(function (resolve, reject) {
    var r = new FileReader();
    r.onload = function () { resolve(String(r.result)); };
    r.onerror = function () { reject(r.error); };
    r.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl, type) {
  var comma = dataUrl.indexOf(',');
  var bin = atob(dataUrl.slice(comma + 1));
  var bytes = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: type || 'application/octet-stream' });
}

function filesForExport(topicId) {
  return filesFor(topicId).then(function (list) {
    return Promise.all(list.map(function (f) {
      return getBlob(f).then(blobToDataUrl).then(function (data) {
        return { name: f.name, type: f.type, data: data };
      });
    }));
  });
}

function importTopicFiles(topicId, files) {
  if (!filesReady() || !Array.isArray(files) || files.length === 0) return Promise.resolve(0);
  return filesFor(topicId).then(function (have) {
    var names = {};
    have.forEach(function (f) { names[f.name] = true; });
    var blobs = [];
    files.forEach(function (f) {
      if (!f || typeof f.name !== 'string' || typeof f.data !== 'string' || names[f.name]) return;
      try {
        var b = dataUrlToBlob(f.data, f.type);
        blobs.push(new File([b], f.name, { type: b.type }));
      } catch (e) {}
    });
    if (blobs.length === 0) return 0;
    return addFiles(topicId, blobs).then(function (r) { return r.added; });
  });
}
