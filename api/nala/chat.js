import auth from '../../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = await auth.authenticate(req);
  if (!session) return res.status(401).json({ error: 'No autorizado' });
  if (session.role !== 'admin' && !session.access_nala) {
    return res.status(403).json({ error: 'Sin acceso a NALA' });
  }

  const { messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages requerido' });
  }
  if (messages.length > 20 || messages.some(m => !m || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string') || messages.reduce((size, m) => size + m.content.length, 0) > 30000) {
    return res.status(400).json({ error: 'Mensaje inválido o demasiado extenso.' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key no configurada' });

  const systemMsg = {
    role: 'system',
    content: `Eres NALA, un asistente de contabilidad especializado en República Dominicana.
Ayudas con: ITBIS (IVA), DGII, TSS, formularios 606/607/608/IT-1/IR-2/IR-17,
retenciones, nómina, Tesorería de Seguridad Social, Ministerio de Trabajo,
declaraciones juradas, y normativa tributaria dominicana.
Responde siempre en español, de forma clara y práctica.
Si el usuario pregunta algo fuera de contabilidad dominicana, redirígelo al tema principal.`,
  };

  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 1024,
        messages: [systemMsg, ...messages.map(m => ({ role: m.role, content: m.content }))],
      }),
    });

    if (!r.ok) {
      const err = await r.text();
      return res.status(r.status).json({ error: err });
    }

    const data = await r.json();
    const reply = data.choices?.[0]?.message?.content || '';
    res.json({ reply });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
