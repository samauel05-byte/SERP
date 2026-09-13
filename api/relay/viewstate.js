const { authenticate } = require('../../lib/auth');

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const session = await authenticate(req);
  if (!session || (session.role !== 'admin' && !session.access_direct)) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url requerida' });

  const allowed = [
    'tss.gob.do', 'www.tss.gob.do', 'suir.gob.do', 'www.suir.gob.do',
    'dgii.gov.do', 'www.dgii.gov.do', 'oficinavirtual.dgii.gov.do',
    'ovi.mt.gob.do', 'mt.gob.do', 'www.mt.gob.do',
    'sisaril.mt.gob.do', 'sisaril.gob.do', 'www.sisaril.gob.do',
    'virtual.sisalril.gob.do',
    'cardnet.com.do', 'www.cardnet.com.do',
  ];
  const isAllowed = candidate => candidate.protocol === 'https:' && allowed.some(h => candidate.hostname === h || candidate.hostname.endsWith('.' + h));
  let target;
  try {
    target = new URL(url);
  } catch {
    return res.status(400).json({ error: 'URL inválida' });
  }

  if (!isAllowed(target)) {
    return res.status(403).json({ error: 'Portal no permitido' });
  }

  try {
    let response;
    for (let redirects = 0; redirects <= 3; redirects++) {
      response = await fetch(target.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'es-DO,es;q=0.9,en;q=0.8',
      },
        redirect: 'manual',
      });
      if (response.status < 300 || response.status >= 400) break;
      const location = response.headers.get('location');
      if (!location) return res.status(502).json({ error: 'Redirección inválida del portal' });
      target = new URL(location, target);
      if (!isAllowed(target)) return res.status(403).json({ error: 'Redirección a portal no permitido' });
      if (redirects === 3) return res.status(502).json({ error: 'Demasiadas redirecciones del portal' });
    }

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
