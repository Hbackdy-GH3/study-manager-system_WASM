/* Cloudflare Pages Function: topic files in R2.
   Needs on the Pages project: R2 binding FILES, and variables SUPABASE_URL, SUPABASE_ANON_KEY.
   Every request carries the user's Supabase token; files are stored under <user id>/<topic id>/<file id>.

   GET    /api/files                    list all files of the user
   GET    /api/files?topic=3&id=abc     download one file
   PUT    /api/files?topic=3&id=abc     upload (body = file, headers X-File-Name, X-Added, Content-Type)
   DELETE /api/files?topic=3&id=abc     delete one file
   DELETE /api/files?topic=3            delete all files of a topic
   DELETE /api/files                    delete all files of the user */

const MAX_BYTES = 50 * 1024 * 1024;

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

async function deletePrefix(bucket, prefix) {
  const objs = await listKeys(bucket, prefix);
  for (let i = 0; i < objs.length; i += 1000) {
    await bucket.delete(objs.slice(i, i + 1000).map((o) => o.key));
  }
  return objs.length;
}

export async function onRequest(context) {
  const { request, env } = context;
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

  if (method === 'GET' && topic === null) {
    const objs = await listKeys(env.FILES, userPrefix);
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
    return json({ files });
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
    await env.FILES.put(userPrefix + topic + '/' + id, body, {
      httpMetadata: { contentType: request.headers.get('Content-Type') || 'application/octet-stream' },
      customMetadata: { name, added }
    });
    return json({ ok: true, size: body.byteLength });
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
