export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages requerido' });
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
