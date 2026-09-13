const supabase = require('../../lib/supabase');
const { authenticate } = require('../../lib/auth');
const { getTenant, requireTenant } = require('../../lib/tenant');
const { normalizeClient } = require('./index');

module.exports = async (req, res) => {
  const session = await authenticate(req);
  if (!session) return res.status(401).json({ error: 'No autorizado' });
  if (session.role !== 'admin' && !session.access_clientes) return res.status(403).json({ error: 'Sin acceso al módulo Clientes.' });
  if (req.method !== 'POST') return res.status(405).end();
  if (session.role !== 'admin') return res.status(403).json({ error: 'Solo administradores pueden importar clientes.' });

  try {
    const tenantId = await getTenant(session);
    if (!requireTenant(res, tenantId)) return;
    const rows = Array.isArray(req.body?.clients) ? req.body.clients : [];
    const fileName = typeof req.body?.fileName === 'string' ? req.body.fileName.trim().slice(0, 255) : 'importacion.xlsx';
    if (!rows.length || rows.length > 5000) return res.status(400).json({ error: 'El archivo debe contener entre 1 y 5,000 clientes.' });

    const errors = [];
    const unique = new Map();
    rows.forEach((row, index) => {
      const result = normalizeClient(row);
      if (result.error) return errors.push({ row: index + 2, error: result.error });
      if (unique.has(result.client.client_key)) return errors.push({ row: index + 2, error: 'Cliente duplicado dentro del archivo.' });
      unique.set(result.client.client_key, result.client);
    });
    if (errors.length) return res.status(400).json({ error: 'Corrige el archivo antes de importarlo.', errors: errors.slice(0, 50) });

    const keys = [...unique.keys()];
    const { data: existing, error: existingError } = await supabase.from('direct_clients')
      .select('client_key').eq('tenant_id', tenantId).in('client_key', keys);
    if (existingError) throw existingError;
    const existingKeys = new Set((existing || []).map(row => row.client_key));
    const toInsert = [...unique.values()].filter(client => !existingKeys.has(client.client_key)).map(client => ({
      ...client, tenant_id: tenantId, created_by: session.userId, source: 'excel',
    }));

    if (toInsert.length) {
      const { error } = await supabase.from('direct_clients').insert(toInsert);
      if (error) throw error;
    }
    const summary = { total_rows: rows.length, imported_rows: toInsert.length, duplicate_rows: rows.length - toInsert.length, invalid_rows: 0 };
    const { error: auditError } = await supabase.from('direct_client_imports').insert({
      tenant_id: tenantId, uploaded_by: session.userId, file_name: fileName, status: 'completed', ...summary,
    });
    if (auditError) throw auditError;
    return res.json({ ok: true, ...summary });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo importar el archivo.' });
  }
};
