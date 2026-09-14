const supabase = require('../../lib/supabase');
const { authenticate } = require('../../lib/auth');

module.exports = async (req, res) => {
  const session = await authenticate(req);
  if (!session) return res.status(401).json({ error: 'No autorizado' });
  const requestedType = req.method === 'POST' ? req.body?.tipo : req.query?.tipo;
  const isEstimate = requestedType === 'estimacion';
  const allowed = session.role === 'admin' || (isEstimate ? session.access_estimacion : session.access_ir2);
  if (!allowed) {
    return res.status(403).json({ error: isEstimate ? 'Sin acceso a Estimación Fiscal' : 'Sin acceso a IR-2' });
  }

  try {
    if (req.method === 'GET') {
      const { rnc, anio, tipo = 'ir2' } = req.query;
      if (!rnc) return res.status(400).json({ error: 'rnc requerido' });

      if (anio) {
        const { data, error } = await supabase
          .from('ir2_resumen')
          .select('*')
          .eq('rnc', rnc)
          .eq('anio', parseInt(anio))
          .eq('tipo', tipo)
          .maybeSingle();
        if (error) throw error;
        return res.json({ ok: true, record: data || null });
      } else {
        const { data, error } = await supabase
          .from('ir2_resumen')
          .select('rnc, anio, nombre, tipo, updated_at')
          .eq('rnc', rnc)
          .eq('tipo', tipo)
          .order('anio', { ascending: false });
        if (error) throw error;
        return res.json({ ok: true, records: data || [] });
      }
    }

    if (req.method === 'POST') {
      const { rnc, anio, nombre, data, tipo = 'ir2' } = req.body || {};
      if (!rnc || !anio) return res.status(400).json({ error: 'rnc y anio requeridos' });

      const { data: saved, error } = await supabase
        .from('ir2_resumen')
        .upsert(
          { rnc, anio: parseInt(anio), nombre: nombre || '', tipo, data: data || {}, updated_at: new Date().toISOString() },
          { onConflict: 'rnc,anio,tipo' }
        )
        .select()
        .single();
      if (error) throw error;
      return res.json({ ok: true, record: saved });
    }

    if (req.method === 'DELETE') {
      const { rnc, anio, tipo = 'ir2' } = req.query;
      if (!rnc || !anio) return res.status(400).json({ error: 'rnc y anio requeridos' });
      const { error } = await supabase
        .from('ir2_resumen')
        .delete()
        .eq('rnc', rnc)
        .eq('anio', parseInt(anio))
        .eq('tipo', tipo);
      if (error) throw error;
      return res.json({ ok: true });
    }

    res.status(405).end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
