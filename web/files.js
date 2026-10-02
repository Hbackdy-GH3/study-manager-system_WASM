/* Topic attachments: stored as Blobs in their own IndexedDB database, keyed by topic ID */

var fileDb = null;
var fileCounts = {};
var MAX_FILE_MB = 50;

function openFileDb() {
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

function allFileRecords() {
  if (!fileDb) return Promise.resolve([]);
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
}

function filesFor(topicId) {
  if (!fileDb) return Promise.resolve([]);
  return new Promise(function (resolve) {
    var req = fileStore('readonly').index('topic').getAll(topicId);
    req.onsuccess = function () {
      var list = req.result || [];
      list.sort(function (a, b) { return a.added - b.added; });
      resolve(list);
    };
    req.onerror = function () { resolve([]); };
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
  if (!fileDb) return Promise.resolve();
  var ids = {};
  state.topics.forEach(function (t) { ids[t.id] = true; });
  return allFileRecords().then(function (list) {
    var orphans = list.filter(function (f) { return !ids[f.topicId]; });
    if (orphans.length === 0) return;
    var tx = fileDb.transaction('files', 'readwrite');
    orphans.forEach(function (f) { tx.objectStore('files').delete(f.key); });
    return txDone(tx);
  });
}

function addFiles(topicId, files) {
  if (!fileDb) return Promise.reject(new Error('Storage not available'));
  var list = Array.prototype.slice.call(files);
  var tooBig = list.filter(function (f) { return f.size > MAX_FILE_MB * 1024 * 1024; });
  var ok = list.filter(function (f) { return f.size <= MAX_FILE_MB * 1024 * 1024; });
  if (ok.length === 0) return Promise.resolve({ added: 0, tooBig: tooBig.length });
  var tx = fileDb.transaction('files', 'readwrite');
  var now = Date.now();
  ok.forEach(function (f, i) {
    tx.objectStore('files').add({
      topicId: topicId,
      name: f.name,
      type: f.type || 'application/octet-stream',
      size: f.size,
      added: now + i,
      blob: f
    });
  });
  return txDone(tx).then(function () { return { added: ok.length, tooBig: tooBig.length }; });
}

function deleteFile(key) {
  var tx = fileDb.transaction('files', 'readwrite');
  tx.objectStore('files').delete(key);
  return txDone(tx);
}

function deleteTopicFiles(topicId) {
  return filesFor(topicId).then(function (list) {
    if (list.length === 0) return;
    var tx = fileDb.transaction('files', 'readwrite');
    list.forEach(function (f) { tx.objectStore('files').delete(f.key); });
    return txDone(tx);
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
  var url = URL.createObjectURL(f.blob);
  var win = window.open(url, '_blank');
  if (!win) {
    downloadFileBlob(f);
  }
  setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
}

function downloadFileBlob(f) {
  var url = URL.createObjectURL(f.blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = f.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
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
      var u = URL.createObjectURL(f.blob);
      thumbUrls.push(u);
      thumb = '<img class="file-thumb" src="' + u + '" alt="">';
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
  if (!fileDb) {
    toast('File storage is not available in this browser');
    return;
  }
  openDialog(
    '<h2>Files · ' + esc(t.chapter) + '</h2><p class="muted" style="margin:0">' + esc(t.subject) + ' · PDFs, images or any file up to ' + MAX_FILE_MB + ' MB</p>' +
    '<div id="file-box"><div class="empty">Loading...</div></div>' +
    '<label class="drop" id="file-drop"><input type="file" id="file-pick" multiple hidden>' + icon('plus') + '<span><strong>Add files</strong><span class="muted small">Click to choose, or drop files here</span></span></label>' +
    '<div class="dlg-actions"><button class="btn btn-teal" data-close="ok">Done</button></div>',
    function (body) {
      var box = body.querySelector('#file-box');
      var pick = body.querySelector('#file-pick');
      var drop = body.querySelector('#file-drop');
      function load() {
        return filesFor(topicId).then(function (list) {
          box.innerHTML = fileListHtml(list, true);
          bindFileList(box, list, function (f) {
            if (!window.confirm('Delete “' + f.name + '”?')) return;
            deleteFile(f.key).then(load).then(afterFilesChanged);
          });
        });
      }
      function add(files) {
        if (!files || files.length === 0) return;
        addFiles(topicId, files).then(function (r) {
          var msg = plural(r.added, 'file') + ' added';
          if (r.tooBig) msg += ', ' + r.tooBig + ' over ' + MAX_FILE_MB + ' MB skipped';
          toast(msg);
          return load().then(afterFilesChanged);
        }).catch(function () {
          toast('Could not save the file. The browser may be out of storage.');
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
      return blobToDataUrl(f.blob).then(function (data) {
        return { name: f.name, type: f.type, data: data };
      });
    }));
  });
}

function importTopicFiles(topicId, files) {
  if (!fileDb || !Array.isArray(files) || files.length === 0) return Promise.resolve(0);
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
