const supabase = require('../../lib/supabase');
const { authenticate } = require('../../lib/auth');

module.exports = async (req, res) => {
  const session = await authenticate(req);
  if (!session) return res.status(401).json({ error: 'No autorizado' });

  try {
    if (req.method === 'GET') {
      const { rnc, anio } = req.query;
      if (!rnc) return res.status(400).json({ error: 'rnc requerido' });

      if (anio) {
        const { data, error } = await supabase
          .from('ir2_resumen')
          .select('*')
          .eq('rnc', rnc)
          .eq('anio', parseInt(anio))
          .maybeSingle();
        if (error) throw error;
        return res.json({ ok: true, record: data || null });
      } else {
        const { data, error } = await supabase
          .from('ir2_resumen')
          .select('rnc, anio, nombre, updated_at')
          .eq('rnc', rnc)
          .order('anio', { ascending: false });
        if (error) throw error;
        return res.json({ ok: true, records: data || [] });
      }
    }

    if (req.method === 'POST') {
      const { rnc, anio, nombre, data } = req.body || {};
      if (!rnc || !anio) return res.status(400).json({ error: 'rnc y anio requeridos' });

      const { data: saved, error } = await supabase
        .from('ir2_resumen')
        .upsert(
          { rnc, anio: parseInt(anio), nombre: nombre || '', data: data || {}, updated_at: new Date().toISOString() },
          { onConflict: 'rnc,anio' }
        )
        .select()
        .single();
      if (error) throw error;
      return res.json({ ok: true, record: saved });
    }

    if (req.method === 'DELETE') {
      const { rnc, anio } = req.query;
      if (!rnc || !anio) return res.status(400).json({ error: 'rnc y anio requeridos' });
      const { error } = await supabase
        .from('ir2_resumen')
        .delete()
        .eq('rnc', rnc)
        .eq('anio', parseInt(anio));
      if (error) throw error;
      return res.json({ ok: true });
    }

    res.status(405).end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
