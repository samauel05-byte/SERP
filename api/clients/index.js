const supabase = require('../../lib/supabase');
const { authenticate } = require('../../lib/auth');
const { getTenant, requireTenant } = require('../../lib/tenant');

const clean = (value, max = 180) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';
const digits = value => clean(value, 32).replace(/\D/g, '');
const clientKey = ({ legal_name, rnc, cedula }) => (rnc || cedula || legal_name.toLocaleLowerCase('es-DO').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')).slice(0, 180);

function normalizeClient(input) {
  const legal_name = clean(input?.legal_name || input?.nombre || input?.razon_social);
  const rnc = digits(input?.rnc);
  const cedula = digits(input?.cedula);
  const email = clean(input?.email, 254).toLowerCase();
  const phone = clean(input?.phone || input?.telefono, 48);
  if (legal_name.length < 2) return { error: 'El nombre o razón social es obligatorio.' };
  if (rnc && ![9, 11].includes(rnc.length)) return { error: 'El RNC debe tener 9 u 11 dígitos.' };
  if (cedula && cedula.length !== 11) return { error: 'La cédula debe tener 11 dígitos.' };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'El correo no es válido.' };
  const client = { legal_name, rnc: rnc || null, cedula: cedula || null, email: email || null, phone: phone || null };
  client.client_key = clientKey(client);
  if (client.client_key.length < 2) return { error: 'No se pudo identificar el cliente.' };
  return { client };
}

module.exports = async (req, res) => {
  const session = await authenticate(req);
  if (!session) return res.status(401).json({ error: 'No autorizado' });
  if (session.role !== 'admin' && !session.access_clientes) return res.status(403).json({ error: 'Sin acceso al módulo Clientes.' });
  try {
    const tenantId = await getTenant(session);
    if (!requireTenant(res, tenantId)) return;

    if (req.method === 'GET') {
      const { data, error } = await supabase.from('direct_clients')
        .select('id, legal_name, rnc, cedula, email, phone, status, source, created_at, updated_at')
        .eq('tenant_id', tenantId).order('legal_name').limit(1000);
      if (error) throw error;
      return res.json({ ok: true, clients: data || [] });
    }

    if (req.method === 'POST') {
      if (session.role !== 'admin') return res.status(403).json({ error: 'Solo administradores pueden crear clientes.' });
      const result = normalizeClient(req.body);
      if (result.error) return res.status(400).json({ error: result.error });
      const { data, error } = await supabase.from('direct_clients').insert({
        ...result.client, tenant_id: tenantId, created_by: session.userId, source: 'manual',
      }).select('id, legal_name, rnc, cedula, email, phone, status, source, created_at, updated_at').single();
      if (error?.code === '23505') return res.status(409).json({ error: 'Ese cliente ya existe en esta empresa.' });
      if (error) throw error;
      return res.status(201).json({ ok: true, client: data });
    }
    return res.status(405).end();
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Error al gestionar clientes.' });
  }
};

module.exports.normalizeClient = normalizeClient;
