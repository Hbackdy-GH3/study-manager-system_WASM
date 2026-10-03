/* Cloudflare Pages Function: topic files in R2.
   Needs on the Pages project: R2 binding FILES, and variables SUPABASE_URL, SUPABASE_ANON_KEY.
   Optional: ILOVEPDF_PUBLIC_KEY (compress big PDFs), ILOVEPDF_USER_MONTHLY (PDFs per user per month, default 30),
   USER_QUOTA_MB (storage limit per user, no limit when empty).
   GET /api/files?status=1 (no login) shows which of these are set, without showing their values.
   Every request carries the user's Supabase token; files are stored under <user id>/<topic id>/<file id>.

   GET    /api/files                    list all files of the user
   GET    /api/files?topic=3&id=abc     download one file
   PUT    /api/files?topic=3&id=abc     upload (body = file, headers X-File-Name, X-Added, Content-Type)
   DELETE /api/files?topic=3&id=abc     delete one file
   DELETE /api/files?topic=3            delete all files of a topic
   DELETE /api/files                    delete all files of the user */

const MAX_BYTES = 50 * 1024 * 1024;
const PDF_MIN = 2 * 1024 * 1024;
const PDF_MAX = 25 * 1024 * 1024;

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

async function userId(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const res = await fetch(env.SUPABASE_URL.replace(/\/$/, '') + '/auth/v1/user', {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: auth }
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user && user.id ? user.id : null;
}

async function listKeys(bucket, prefix) {
  const out = [];
  let cursor;
  do {
    const page = await bucket.list({ prefix, cursor, include: ['customMetadata', 'httpMetadata'] });
    out.push(...page.objects);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return out;
}

function monthKey(uid) {
  const d = new Date();
  return '_meta/' + uid + '/pdf-' + d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}

async function pdfCount(bucket, uid) {
  const obj = await bucket.get(monthKey(uid));
  if (!obj) return 0;
  return parseInt(await obj.text(), 10) || 0;
}

async function compressPdf(body, name, env) {
  const api = env.ILOVEPDF_TEST_BASE || 'https://api.ilovepdf.com';
  const host = (server) => (env.ILOVEPDF_TEST_BASE ? env.ILOVEPDF_TEST_BASE : 'https://' + server);
  const auth = await fetch(api + '/v1/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ public_key: env.ILOVEPDF_PUBLIC_KEY })
  });
  if (!auth.ok) return { note: 'iLovePDF key rejected, error ' + auth.status };
  const token = (await auth.json()).token;
  const headers = { Authorization: 'Bearer ' + token };
  const start = await fetch(api + '/v1/start/compress/in', { headers });
  if (!start.ok) return { note: 'iLovePDF start failed, error ' + start.status };
  const task = await start.json();
  if (typeof task.remaining_credits === 'number' && task.remaining_credits < 10) return { note: 'monthly compression credits used up' };
  const form = new FormData();
  form.append('task', task.task);
  form.append('file', new Blob([body], { type: 'application/pdf' }), name);
  const up = await fetch(host(task.server) + '/v1/upload', { method: 'POST', headers, body: form });
  if (!up.ok) return { note: 'iLovePDF upload failed, error ' + up.status };
  const upJson = await up.json();
  const proc = await fetch(host(task.server) + '/v1/process', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task: task.task,
      tool: 'compress',
      compression_level: 'recommended',
      files: [{ server_filename: upJson.server_filename, filename: name }]
    })
  });
  if (!proc.ok) return { note: 'iLovePDF process failed, error ' + proc.status };
  const dl = await fetch(host(task.server) + '/v1/download/' + task.task, { headers });
  if (!dl.ok) return { note: 'iLovePDF download failed, error ' + dl.status };
  const out = await dl.arrayBuffer();
  fetch(host(task.server) + '/v1/task/' + task.task, { method: 'DELETE', headers }).catch(() => {});
  return { buf: out };
}

async function deletePrefix(bucket, prefix) {
  const objs = await listKeys(bucket, prefix);
  for (let i = 0; i < objs.length; i += 1000) {
    await bucket.delete(objs.slice(i, i + 1000).map((o) => o.key));
  }
  return objs.length;
}

async function serverStatus(env) {
  const out = {
    version: 'compress-3',
    r2: !!env.FILES,
    supabase: !!(env.SUPABASE_URL && env.SUPABASE_ANON_KEY),
    compressKey: !!env.ILOVEPDF_PUBLIC_KEY,
    userMonthly: parseInt(env.ILOVEPDF_USER_MONTHLY || '30', 10) || 30,
    quotaMB: parseInt(env.USER_QUOTA_MB || '0', 10) || 0,
    ilovepdf: 'not set'
  };
  if (!env.ILOVEPDF_PUBLIC_KEY) return out;
  try {
    const auth = await fetch((env.ILOVEPDF_TEST_BASE || 'https://api.ilovepdf.com') + '/v1/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ public_key: env.ILOVEPDF_PUBLIC_KEY })
    });
    if (!auth.ok) {
      out.ilovepdf = 'key rejected, error ' + auth.status;
      return out;
    }
    const token = (await auth.json()).token;
    const start = await fetch((env.ILOVEPDF_TEST_BASE || 'https://api.ilovepdf.com') + '/v1/start/compress/in', { headers: { Authorization: 'Bearer ' + token } });
    if (!start.ok) {
      out.ilovepdf = 'start failed, error ' + start.status;
      return out;
    }
    const task = await start.json();
    out.ilovepdf = 'ok';
    out.credits = task.remaining_credits;
  } catch (e) {
    out.ilovepdf = 'could not reach iLovePDF';
  }
  return out;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'GET' && new URL(request.url).searchParams.get('status') === '1') {
    return json(await serverStatus(env));
  }
  if (!env.FILES || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return json({ error: 'File storage is not set up on the server.' }, 500);
  }
  let uid;
  try {
    uid = await userId(request, env);
  } catch (e) {
    return json({ error: 'Could not check your login. Try again.' }, 502);
  }
  if (!uid) return json({ error: 'Log in again to use files.' }, 401);

  const url = new URL(request.url);
  const topic = url.searchParams.get('topic');
  const id = url.searchParams.get('id');
  if (topic !== null && !/^\d{1,9}$/.test(topic)) return json({ error: 'Bad topic.' }, 400);
  if (id !== null && !/^[a-f0-9]{8,40}$/.test(id)) return json({ error: 'Bad file id.' }, 400);
  if (id !== null && topic === null) return json({ error: 'Bad request.' }, 400);

  const userPrefix = uid + '/';
  const method = request.method;

  const quota = (parseInt(env.USER_QUOTA_MB || '0', 10) || 0) * 1024 * 1024;

  if (method === 'GET' && topic === null) {
    const objs = await listKeys(env.FILES, userPrefix);
    const used = objs.reduce((n, o) => n + o.size, 0);
    const files = objs.map((o) => {
      const parts = o.key.split('/');
      const meta = o.customMetadata || {};
      return {
        topicId: parseInt(parts[1], 10),
        id: parts[2],
        name: meta.name || parts[2],
        type: (o.httpMetadata && o.httpMetadata.contentType) || 'application/octet-stream',
        size: o.size,
        added: parseInt(meta.added, 10) || new Date(o.uploaded).getTime()
      };
    });
    return json({ files, usage: { used, quota } });
  }

  if (method === 'GET' && id !== null) {
    const obj = await env.FILES.get(userPrefix + topic + '/' + id);
    if (!obj) return json({ error: 'File not found.' }, 404);
    const name = (obj.customMetadata && obj.customMetadata.name) || id;
    const headers = new Headers();
    headers.set('Content-Type', (obj.httpMetadata && obj.httpMetadata.contentType) || 'application/octet-stream');
    headers.set('Content-Length', String(obj.size));
    headers.set('Content-Disposition', "inline; filename*=UTF-8''" + encodeURIComponent(name));
    headers.set('Cache-Control', 'private, no-store');
    headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(obj.body, { headers });
  }

  if (method === 'PUT' && id !== null) {
    const length = parseInt(request.headers.get('Content-Length') || '0', 10);
    if (length > MAX_BYTES) return json({ error: 'Files can be up to 50 MB.' }, 413);
    const body = await request.arrayBuffer();
    if (body.byteLength > MAX_BYTES) return json({ error: 'Files can be up to 50 MB.' }, 413);
    let name = request.headers.get('X-File-Name') || id;
    try { name = decodeURIComponent(name); } catch (e) {}
    name = name.slice(0, 200);
    const added = String(parseInt(request.headers.get('X-Added') || '', 10) || Date.now());
    const type = request.headers.get('Content-Type') || 'application/octet-stream';

    if (quota) {
      const objs = await listKeys(env.FILES, userPrefix);
      const used = objs.reduce((n, o) => n + o.size, 0);
      if (used + body.byteLength > quota) {
        return json({ error: 'Storage full. You can store up to ' + Math.round(quota / 1048576) + ' MB of files. Delete some files first.' }, 413);
      }
    }

    let stored = body;
    let note = '';
    const wantPdf = request.headers.get('X-Compress') === '1' && (type === 'application/pdf' || /\.pdf$/i.test(name));
    if (wantPdf && !env.ILOVEPDF_PUBLIC_KEY) {
      note = 'ILOVEPDF_PUBLIC_KEY is not set on the server';
    } else if (wantPdf && body.byteLength < PDF_MIN) {
      note = 'it is under 2 MB';
    } else if (wantPdf && body.byteLength > PDF_MAX) {
      note = 'it is over 25 MB';
    } else if (wantPdf) {
      const limit = parseInt(env.ILOVEPDF_USER_MONTHLY || '30', 10) || 30;
      const count = await pdfCount(env.FILES, uid);
      if (count >= limit) {
        note = 'your monthly PDF compression limit is used up';
      } else {
        try {
          const r = await compressPdf(body, name, env);
          if (r.buf) {
            await env.FILES.put(monthKey(uid), String(count + 1));
            if (r.buf.byteLength <= body.byteLength * 0.9) stored = r.buf;
            else note = 'it was already small';
          } else {
            note = r.note;
          }
        } catch (e) {
          note = 'could not reach iLovePDF';
        }
      }
    }

    await env.FILES.put(userPrefix + topic + '/' + id, stored, {
      httpMetadata: { contentType: type },
      customMetadata: { name, added, original: String(body.byteLength) }
    });
    return json({ ok: true, version: 'compress-3', size: stored.byteLength, originalSize: body.byteLength, compressed: stored !== body, note });
  }

  if (method === 'DELETE') {
    if (id !== null) {
      await env.FILES.delete(userPrefix + topic + '/' + id);
      return json({ ok: true, deleted: 1 });
    }
    const n = await deletePrefix(env.FILES, topic !== null ? userPrefix + topic + '/' : userPrefix);
    return json({ ok: true, deleted: n });
  }

  return json({ error: 'Method not allowed.' }, 405);
}
