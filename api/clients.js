const supabase = require('../lib/supabase');
const { authenticate } = require('../lib/auth');
const { getTenant, requireTenant } = require('../lib/tenant');

const clean = (value, max = 180) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';
const digits = value => clean(value, 32).replace(/\D/g, '');
const clientKey = ({ legal_name, rnc, cedula }) => (rnc || cedula || legal_name.toLocaleLowerCase('es-DO').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')).slice(0, 180);

function normalizeClient(input) {
  const legal_name = clean(input?.legal_name || input?.nombre || input?.razon_social);
  const rnc = digits(input?.rnc); const cedula = digits(input?.cedula);
  const email = clean(input?.email, 254).toLowerCase(); const phone = clean(input?.phone || input?.telefono, 48);
  if (legal_name.length < 2) return { error: 'El nombre o razón social es obligatorio.' };
  if (rnc && ![9, 11].includes(rnc.length)) return { error: 'El RNC debe tener 9 u 11 dígitos.' };
  if (cedula && cedula.length !== 11) return { error: 'La cédula debe tener 11 dígitos.' };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'El correo no es válido.' };
  const client = { legal_name, rnc: rnc || null, cedula: cedula || null, email: email || null, phone: phone || null };
  client.client_key = clientKey(client);
  return client.client_key.length < 2 ? { error: 'No se pudo identificar el cliente.' } : { client };
}

module.exports = async (req, res) => {
  const session = await authenticate(req);
  if (!session) return res.status(401).json({ error: 'No autorizado' });
  try {
    const tenantId = await getTenant(session);
    if (!requireTenant(res, tenantId)) return;
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('direct_clients').select('id, legal_name, rnc, cedula, email, phone, status, source, created_at, updated_at').eq('tenant_id', tenantId).order('legal_name').limit(1000);
      if (error) throw error;
      return res.json({ ok: true, clients: data || [] });
    }
    if (req.method !== 'POST') return res.status(405).end();
    if (session.role !== 'admin') return res.status(403).json({ error: 'Solo administradores pueden modificar clientes.' });

    if (Array.isArray(req.body?.clients)) {
      const rows = req.body.clients;
      const fileName = typeof req.body?.fileName === 'string' ? req.body.fileName.trim().slice(0, 255) : 'importacion.xlsx';
      if (!rows.length || rows.length > 5000) return res.status(400).json({ error: 'El archivo debe contener entre 1 y 5,000 clientes.' });
      const errors = [], unique = new Map();
      rows.forEach((row, index) => {
        const result = normalizeClient(row);
        if (result.error) return errors.push({ row: index + 2, error: result.error });
        if (unique.has(result.client.client_key)) return errors.push({ row: index + 2, error: 'Cliente duplicado dentro del archivo.' });
        unique.set(result.client.client_key, result.client);
      });
      if (errors.length) return res.status(400).json({ error: 'Corrige el archivo antes de importarlo.', errors: errors.slice(0, 50) });
      const keys = [...unique.keys()];
      const { data: existing, error: existingError } = await supabase.from('direct_clients').select('client_key').eq('tenant_id', tenantId).in('client_key', keys);
      if (existingError) throw existingError;
      const existingKeys = new Set((existing || []).map(row => row.client_key));
      const toInsert = [...unique.values()].filter(client => !existingKeys.has(client.client_key)).map(client => ({ ...client, tenant_id: tenantId, created_by: session.userId, source: 'excel' }));
      if (toInsert.length) { const { error } = await supabase.from('direct_clients').insert(toInsert); if (error) throw error; }
      const summary = { total_rows: rows.length, imported_rows: toInsert.length, duplicate_rows: rows.length - toInsert.length, invalid_rows: 0 };
      const { error: auditError } = await supabase.from('direct_client_imports').insert({ tenant_id: tenantId, uploaded_by: session.userId, file_name: fileName, status: 'completed', ...summary });
      if (auditError) throw auditError;
      return res.json({ ok: true, ...summary });
    }

    const result = normalizeClient(req.body);
    if (result.error) return res.status(400).json({ error: result.error });
    const { data, error } = await supabase.from('direct_clients').insert({ ...result.client, tenant_id: tenantId, created_by: session.userId, source: 'manual' }).select('id, legal_name, rnc, cedula, email, phone, status, source, created_at, updated_at').single();
    if (error?.code === '23505') return res.status(409).json({ error: 'Ese cliente ya existe en esta empresa.' });
    if (error) throw error;
    return res.status(201).json({ ok: true, client: data });
  } catch (error) { return res.status(500).json({ error: error.message || 'Error al gestionar clientes.' }); }
};
