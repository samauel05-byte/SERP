const supabase = require('../lib/supabase');
const { authenticate } = require('../lib/auth');
const { requireTenant } = require('../lib/tenant');

module.exports = async (req, res) => {
  const session = await authenticate(req);
  if (!session) return res.status(401).json({ error: 'No autorizado' });
  if (!requireTenant(res, session.tenantId)) return;
  if (req.method !== 'GET') return res.status(405).end();
  const { data, error } = await supabase
    .from('direct_tenants')
    .select('id, name, slug')
    .eq('id', session.tenantId)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Empresa contable no encontrada' });
  return res.json({ ok: true, tenant: data });
};
