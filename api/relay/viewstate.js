export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url requerida' });

  let target;
  try {
    target = new URL(url);
  } catch {
    return res.status(400).json({ error: 'URL inválida' });
  }

  // Only allow Dominican government/banking portals
  const allowed = [
    'tss.gob.do', 'www.tss.gob.do',
    'dgii.gov.do', 'www.dgii.gov.do',
    'oficinavirtual.dgii.gov.do',
    'sisaril.mt.gob.do', 'www.mt.gob.do',
    'cardnet.com.do', 'www.cardnet.com.do',
  ];
  if (!allowed.some(h => target.hostname === h || target.hostname.endsWith('.' + h))) {
    return res.status(403).json({ error: 'Portal no permitido' });
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'es-DO,es;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Portal respondió ${response.status}` });
    }

    const html = await response.text();

    // Extract all hidden inputs (ViewState, EventValidation, etc.)
    const hiddenFields = [];
    const hiddenRe = /<input[^>]+type=["']?hidden["']?[^>]*>/gi;
    const nameRe = /name=["']([^"']+)["']/i;
    const valueRe = /value=["']([^"']*)["']/i;

    let match;
    while ((match = hiddenRe.exec(html)) !== null) {
      const tag = match[0];
      const nm = nameRe.exec(tag);
      const vl = valueRe.exec(tag);
      if (nm) {
        hiddenFields.push({ name: nm[1], value: vl ? vl[1] : '' });
      }
    }

    // Auto-detect visible text inputs (username field)
    const textRe = /<input[^>]+type=["']?text["']?[^>]*>/gi;
    let userField = null;
    while ((match = textRe.exec(html)) !== null) {
      const tag = match[0];
      const nm = nameRe.exec(tag);
      if (nm) { userField = nm[1]; break; } // first text input = username
    }

    // Auto-detect password input
    const passRe = /<input[^>]+type=["']?password["']?[^>]*>/gi;
    let passField = null;
    while ((match = passRe.exec(html)) !== null) {
      const tag = match[0];
      const nm = nameRe.exec(tag);
      if (nm) { passField = nm[1]; break; } // first password input = password
    }

    // Auto-detect submit button
    let submitField = null;
    const submitRe = /<input[^>]+type=["']?submit["']?[^>]*>/gi;
    while ((match = submitRe.exec(html)) !== null) {
      const nm = nameRe.exec(match[0]);
      if (nm) { submitField = nm[1]; break; }
    }

    // Extract form action and resolve to absolute URL
    const formActionMatch = /<form[^>]+action=["']([^"']+)["']/i.exec(html);
    const formAction = formActionMatch ? formActionMatch[1] : null;
    let resolvedAction = url;
    if (formAction) {
      try { resolvedAction = new URL(formAction, url).toString(); } catch { resolvedAction = url; }
    }

    return res.json({ hiddenFields, formAction: resolvedAction, userField, passField, submitField });
  } catch (e) {
    return res.status(502).json({ error: `No se pudo conectar al portal: ${e.message}` });
  }
}
