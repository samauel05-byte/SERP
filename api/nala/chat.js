export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages requerido' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key no configurada' });

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: `Eres NALA, un asistente de contabilidad especializado en República Dominicana.
Ayudas con: ITBIS (IVA), DGII, TSS, formularios 606/607/608/IT-1/IR-2/IR-17,
retenciones, nómina, Tesorería de Seguridad Social, Ministerio de Trabajo,
declaraciones juradas, y normativa tributaria dominicana.
Responde siempre en español, de forma clara y práctica.
Si el usuario pregunta algo fuera de contabilidad dominicana, redirígelo al tema principal.`,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      }),
    });

    if (!r.ok) {
      const err = await r.text();
      return res.status(r.status).json({ error: err });
    }

    const data = await r.json();
    const text = data.content?.[0]?.text || '';
    res.json({ reply: text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
