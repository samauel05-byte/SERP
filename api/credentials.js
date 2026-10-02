const db = require('../lib/db');
const supabase = require('../lib/supabase');
const { authenticate } = require('../lib/auth');

const EVENTS = new Set(['open', 'login_ok', 'login_failed']);

// Portal entries and login results (history + "contraseña por actualizar").
// Any Direct user records their own entries; only administrators read the
// whole history. Company names never reach the server: they are encrypted, so
// the browser resolves credential ids to names.
async function recordEvent(session, body) {
  const credentialId = String(body.credential_id || '').slice(0, 200);
  const institution = String(body.institution || '').slice(0, 40);
  const event = String(body.event || '');
  if (!credentialId || !institution || !EVENTS.has(event)) return { status: 400, body: { error: 'Evento no válido' } };
  if (Array.isArray(session.companies_direct) && session.role !== 'admin' && !session.companies_direct.includes(credentialId)) {
    return { status: 403, body: { error: 'Sin acceso a esa empresa' } };
  }
  const { error } = await supabase.from('direct_access_events').insert({
    tenant_id: session.tenantId, user_id: session.userId, username: session.username || null,
    credential_id: credentialId, institution, event, detail: body.detail ? String(body.detail).slice(0, 300) : null,
  });
  if (error) throw error;
  return { status: 200, body: { ok: true } };
}

async function listEvents(session, q) {
  if (session.role !== 'admin') return { status: 403, body: { error: 'Solo administradores' } };
  let query = supabase.from('direct_access_events').select('id, user_id, username, credential_id, institution, event, detail, created_at')
    .eq('tenant_id', session.tenantId).order('created_at', { ascending: false }).limit(Math.min(Number(q.limit) || 300, 1000));
  if (q.user) query = query.eq('user_id', q.user);
  if (q.institution) query = query.eq('institution', q.institution);
  const { data, error } = await query;
  if (error) throw error;
  return { status: 200, body: { ok: true, events: data || [] } };
}

// Latest login result per credential, and this user's recent entries.
async function loginStatus(session) {
  const [{ data: results, error }, { data: mine, error: mineError }] = await Promise.all([
    supabase.from('direct_access_events').select('credential_id, event, created_at').eq('tenant_id', session.tenantId)
      .in('event', ['login_ok', 'login_failed']).order('created_at', { ascending: false }).limit(3000),
    supabase.from('direct_access_events').select('credential_id, institution, created_at').eq('tenant_id', session.tenantId)
      .eq('user_id', session.userId).eq('event', 'open').order('created_at', { ascending: false }).limit(60),
  ]);
  if (error) throw error;
  if (mineError) throw mineError;
  const allowed = Array.isArray(session.companies_direct) && session.role !== 'admin' ? new Set(session.companies_direct) : null;
  const status = {};
  for (const r of results || []) {
    if (status[r.credential_id] || (allowed && !allowed.has(r.credential_id))) continue;
    status[r.credential_id] = { result: r.event === 'login_ok' ? 'ok' : 'failed', at: r.created_at };
  }
  const recent = [];
  for (const r of mine || []) if (!recent.some(x => x.credential_id === r.credential_id)) recent.push(r);
  return { status: 200, body: { ok: true, status, recent: recent.slice(0, 12) } };
}

module.exports = async (req, res) => {
  const session = await authenticate(req);
  if (!session) return res.status(401).json({ error: 'No autorizado' });
  if (session.role !== 'admin' && !session.access_direct) {
    return res.status(403).json({ error: 'Sin acceso a Direct' });
  }
  const portals = session.role === 'admin' ? null : session.portals_direct;
  const companies = session.role === 'admin' ? null : session.companies_direct;
  try {
    if (req.query.events === '1' || req.query.event === '1' || req.query.status === '1') {
      if (!session.tenantId) return res.status(409).json({ error: 'Falta la migración de empresas' });
      const out = req.method === 'POST' ? await recordEvent(session, req.body || {})
        : req.query.status === '1' ? await loginStatus(session) : await listEvents(session, req.query);
      return res.status(out.status).json(out.body);
    }
    if (req.method === 'GET') {
      if (req.query.poll === '1') {
        const since = parseInt(req.query.since, 10) || 0;
        const updates = await db.getCredentialsSince(session.tenantId, since, portals, companies);
        return res.json({ ok: true, updates, serverTime: Date.now() });
      }
      const credentials = await db.getCredentials(session.tenantId, portals, companies);
      return res.json({ ok: true, credentials });
    }
    if (req.method === 'POST') {
      if (session.role !== 'admin') return res.status(403).json({ error: 'Solo administradores' });
      const { credentials } = req.body || {};
      if (!Array.isArray(credentials) || credentials.length === 0) {
        return res.status(400).json({ error: 'Se requiere un array de credenciales' });
      }
      for (const c of credentials) {
        if (!c.id || !c.institution || !c.iv || !c.ct) {
          return res.status(400).json({ error: 'Cada credencial requiere id, institution, iv, ct' });
        }
      }
      const count = await db.upsertCredentials(session.tenantId, credentials);
      return res.json({ ok: true, count });
    }
    res.status(405).end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
