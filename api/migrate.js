const supabase = require('../lib/supabase');

// Temporary migration endpoint — DELETE after use
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const results = [];

  // Step 1: Check if 'tipo' column already exists
  const { error: checkErr } = await supabase
    .from('ir2_resumen')
    .select('tipo')
    .limit(1);

  if (!checkErr) {
    return res.json({ ok: true, message: 'Columna tipo ya existe — migración no necesaria.' });
  }

  const columnMissing = checkErr.message?.includes('tipo') || checkErr.code === 'PGRST200';
  results.push({ check: checkErr.message });

  if (!columnMissing) {
    return res.status(500).json({ ok: false, step: 'check', error: checkErr.message });
  }

  // Step 2: Try via Supabase Management API (needs project ref + management token)
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const match = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/);
  const projectRef = match?.[1];

  if (projectRef) {
    const sqlStatements = [
      `ALTER TABLE ir2_resumen ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'ir2'`,
      `UPDATE ir2_resumen SET tipo = 'ir2' WHERE tipo IS NULL OR tipo = ''`,
      `ALTER TABLE ir2_resumen DROP CONSTRAINT IF EXISTS ir2_resumen_rnc_anio_key`,
      `ALTER TABLE ir2_resumen ADD CONSTRAINT ir2_resumen_rnc_anio_tipo_key UNIQUE (rnc, anio, tipo)`,
    ];

    for (const sql of sqlStatements) {
      try {
        // Try Supabase Management API (requires PAT, service role key likely won't work)
        const mgmtRes = await fetch(
          `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({ query: sql }),
          }
        );
        const body = await mgmtRes.json();
        results.push({ sql: sql.slice(0, 60), status: mgmtRes.status, result: body });
        if (!mgmtRes.ok) {
          return res.status(500).json({ ok: false, results, hint: 'Ejecuta el SQL manualmente en el panel de Supabase → SQL Editor.' });
        }
      } catch (e) {
        results.push({ sql: sql.slice(0, 60), error: e.message });
        return res.status(500).json({ ok: false, results, hint: 'Ejecuta el SQL manualmente en el panel de Supabase → SQL Editor.' });
      }
    }

    return res.json({ ok: true, message: 'Migración ejecutada correctamente.', results });
  }

  return res.status(500).json({ ok: false, error: 'No se pudo extraer el project ref de SUPABASE_URL.', supabaseUrl });
};
