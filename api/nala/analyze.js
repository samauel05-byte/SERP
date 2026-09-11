export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { base64, mimeType, pdfText } = req.body || {};
  if (!base64 && !pdfText) return res.status(400).json({ error: 'archivo requerido' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key no configurada' });

  const systemPrompt = `Eres un asistente experto en comprobantes fiscales de República Dominicana.
Tu tarea es extraer los datos de comprobantes fiscales para los formularios 606 y 607 de la DGII.

Extrae EXACTAMENTE estos campos:
- ncf: Número de Comprobante Fiscal (formato B-XXXXXXXXXXX o similar, 13 dígitos)
- rnc: RNC o Cédula del emisor (sin guiones, solo números)
- nombre: Nombre o razón social del emisor
- tipo: Código del tipo de NCF (01=Crédito Fiscal, 02=Consumidor Final, 03=Nota Débito, 04=Nota Crédito, 11=Compras al por menor, 14=Gubernamental)
- fecha: Fecha del comprobante en formato YYYYMMDD
- monto: Monto total facturado SIN ITBIS (número, sin símbolos)
- itbis: Monto del ITBIS (número, sin símbolos). Si dice EXENTO o no aplica, pon 0
- total: Monto total CON ITBIS (número, sin símbolos)

Responde ÚNICAMENTE con un objeto JSON válido con esos campos exactos.
Si no puedes leer algún campo, usa null.
No incluyas explicaciones, solo el JSON.`;

  let messages;

  if (base64 && mimeType && mimeType.startsWith('image/')) {
    messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: systemPrompt },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}`, detail: 'high' } },
        ],
      },
    ];
  } else {
    const content = pdfText || base64;
    messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Extrae los datos de este comprobante fiscal:\n\n${content}` },
    ];
  }

  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: base64 && mimeType?.startsWith('image/') ? 'gpt-4o' : 'gpt-4o-mini',
        max_tokens: 512,
        messages,
        response_format: { type: 'json_object' },
      }),
    });

    if (!r.ok) {
      const err = await r.text();
      return res.status(r.status).json({ error: err });
    }

    const data = await r.json();
    const raw = data.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw);
    res.json({ data: parsed });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
