const ALLOWED_HOSTS = [
  'oficinavirtual.dgii.gov.do',
  'www.dgii.gov.do',
  'dgii.gov.do',
  'www.tss.gob.do',
  'tss.gob.do',
  // TSS redirect target
  'suir.gob.do',
  'www.suir.gob.do',
  // Ministerio de Trabajo (OVI)
  'ovi.mt.gob.do',
  'mt.gob.do',
  'www.mt.gob.do',
  // SISARIL / SISALRIL
  'sisaril.mt.gob.do',
  'sisaril.gob.do',
  'www.sisaril.gob.do',
  'portal.sisaril.gob.do',
  'cardnet.com.do',
  'www.cardnet.com.do',
  // Azul
  'azul.com.do',
  'www.azul.com.do',
  'ecommerce.azul.com.do',
  // IDOPPRIL
  'idoppril.gov.do',
  'www.idoppril.gov.do',
  'idoppril.gob.do',
  'www.idoppril.gob.do',
  // ONAPI
  'onapi.gov.do',
  'www.onapi.gov.do',
  'onapi.gob.do',
  'www.onapi.gob.do',
  // Formalízate
  'formalizate.gob.do',
  'www.formalizate.gob.do',
  'formalizate.gov.do',
  // Cámara de Comercio
  'camarasantodomingo.do',
  'www.camarasantodomingo.do',
  'camarasd.org.do',
  'www.camarasd.org.do',
  // Citrus
  'citrus.com.do',
  'www.citrus.com.do',
  'portal.citrus.com.do',
  // SISALRIL (alternate)
  'sisalril.gov.do',
  'www.sisalril.gov.do',
];
const CORS_ORIGIN = 'https://direct-save.vercel.app';

const SUBMIT_HTML = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Accediendo…</title>
<style>
  :root{color-scheme:light dark}
  body{margin:0;font-family:system-ui,sans-serif;background:#f8fafc;color:#1e293b;display:flex;align-items:center;justify-content:center;min-height:100vh}
  @media(prefers-color-scheme:dark){body{background:#0f172a;color:#e2e8f0}}
  .card{background:white;border-radius:16px;padding:40px 32px;box-shadow:0 4px 24px rgba(0,0,0,.1);text-align:center;max-width:340px;width:90%}
  @media(prefers-color-scheme:dark){.card{background:#1e293b}}
  .spinner{width:48px;height:48px;border:4px solid #e2e8f0;border-top-color:#6366f1;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 20px}
  @keyframes spin{to{transform:rotate(360deg)}}
  h2{margin:0 0 8px;font-size:18px}
  p{margin:0;font-size:14px;color:#64748b}
  .err{color:#ef4444}
</style>
</head>
<body>
<div class="card">
  <div class="spinner" id="sp"></div>
  <h2 id="msg">Iniciando sesión…</h2>
  <p id="sub">Enviando credenciales al portal</p>
</div>
<script>
(function(){
  var hash = location.hash.slice(1);
  if(!hash){
    document.getElementById('sp').style.display='none';
    document.getElementById('msg').textContent='Error';
    document.getElementById('msg').className='err';
    document.getElementById('sub').textContent='No se recibieron datos de acceso.';
    return;
  }
  var p;
  try{ p = JSON.parse(decodeURIComponent(atob(hash))); }
  catch(e){
    document.getElementById('sp').style.display='none';
    document.getElementById('msg').textContent='Error';
    document.getElementById('msg').className='err';
    document.getElementById('sub').textContent='Datos inválidos.';
    return;
  }
  var form = document.createElement('form');
  form.method = 'POST';
  form.action = p.formAction || p.url;
  form.style.display = 'none';
  function add(n,v){
    var i = document.createElement('input');
    i.type='hidden'; i.name=n; i.value=v;
    form.appendChild(i);
  }
  (p.hiddenFields||[]).forEach(function(f){ add(f.name,f.value); });
  if(p.userField) add(p.userField, p.user);
  if(p.passField) add(p.passField, p.pass);
  if(p.submitField) add(p.submitField, 'Entrar');
  if(p.cedula){
    add('ctl00$MainContent$txtrepresentante', p.cedula);
    if(!p.submitField) add('ctl00$MainContent$btLoginRep','Entrar');
  }
  document.body.appendChild(form);
  form.submit();
})();
</script>
</body>
</html>`;

export default {
  async fetch(request) {
    const reqUrl = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': CORS_ORIGIN,
          'Access-Control-Allow-Methods': 'GET, POST',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // /submit — serve an HTML page that auto-submits a form to the portal
    if (reqUrl.pathname === '/submit') {
      return new Response(SUBMIT_HTML, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Access-Control-Allow-Origin': CORS_ORIGIN,
          'Cache-Control': 'no-store',
        },
      });
    }

    // /proxy — fetch portal login page, inject autofill script, return to browser
    // Credentials arrive only in the URL hash (never reaches this server)
    if (reqUrl.pathname === '/proxy') {
      const targetUrl = reqUrl.searchParams.get('url');
      if (!targetUrl) return new Response('Missing url parameter', { status: 400 });

      let target;
      try { target = new URL(targetUrl); } catch { return new Response('URL inválida', { status: 400 }); }

      if (!ALLOWED_HOSTS.some(h => target.hostname === h || target.hostname.endsWith('.' + h))) {
        return new Response('Portal no permitido', { status: 403 });
      }

      // Cache the raw login page HTML (without autofill script) for 2 minutes
      // so repeat opens of slow government portals are nearly instant.
      const cacheStorage = caches.default;
      const cacheKey = new Request('https://cache.proxy/' + encodeURIComponent(targetUrl));
      let html;
      const cached = await cacheStorage.match(cacheKey);
      if (cached) {
        html = await cached.text();
      } else {
        try {
          const portalRes = await fetch(targetUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'es-DO,es;q=0.9,en;q=0.8',
            },
            redirect: 'follow',
          });
          html = await portalRes.text();

          // Cache raw HTML (before autofill injection) for 2 minutes
          const origin2 = target.origin;
          let cachedHtml = html;
          if (cachedHtml.match(/<head(\s[^>]*)?>/i)) {
            cachedHtml = cachedHtml.replace(/<head(\s[^>]*)?>/i, `<head$1><base href="${origin2}/">`);
          } else {
            cachedHtml = `<base href="${origin2}/">` + cachedHtml;
          }
          cachedHtml = cachedHtml.replace(/(<form\b[^>]+\baction=["'])([^"']+)(["'])/gi, (m, pre, action, post) => {
            try { return pre + new URL(action, targetUrl).href + post; } catch { return m; }
          });
          await cacheStorage.put(cacheKey, new Response(cachedHtml, {
            headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=120' }
          }));
          html = cachedHtml;
        } catch(e) {
          return new Response(`Error al obtener el portal: ${e.message}`, { status: 502 });
        }
      }

      try {
        const hostname = target.hostname;

        // Autofill script: reads credentials from URL hash, fills form, auto-submits
        // hostname is injected at request time so each portal gets its own config
        const autofillScript = `<script>
(function(){
  var hash = location.hash.slice(1);
  if(!hash) return;
  var p; try { p = JSON.parse(decodeURIComponent(atob(hash))); } catch(e){ return; }

  // Per-portal field name maps
  var PORTALS = {
    'oficinavirtual.dgii.gov.do':{ user:['ctl00$ContentPlaceHolder1$txtUsuario','txtUsuario'], pass:['ctl00$ContentPlaceHolder1$txtPassword','txtPassword'], submit:['ctl00$ContentPlaceHolder1$btnEntrar','btnEntrar'] },
    'www.dgii.gov.do':           { user:['ctl00$ContentPlaceHolder1$txtUsuario','txtUsuario'], pass:['ctl00$ContentPlaceHolder1$txtPassword','txtPassword'], submit:['ctl00$ContentPlaceHolder1$btnEntrar','btnEntrar'] },
    'dgii.gov.do':               { user:['ctl00$ContentPlaceHolder1$txtUsuario','txtUsuario'], pass:['ctl00$ContentPlaceHolder1$txtPassword','txtPassword'], submit:['ctl00$ContentPlaceHolder1$btnEntrar','btnEntrar'] },
    'www.tss.gob.do':            { user:['ctl00$MainContent$txtrncCedula','txtrncCedula'], pass:['ctl00$MainContent$txtClassRep','txtClassRep'], extra:'ctl00$MainContent$txtrepresentante', submit:['ctl00$MainContent$btLoginRep'] },
    'tss.gob.do':                { user:['ctl00$MainContent$txtrncCedula','txtrncCedula'], pass:['ctl00$MainContent$txtClassRep','txtClassRep'], extra:'ctl00$MainContent$txtrepresentante', submit:['ctl00$MainContent$btLoginRep'] },
    'suir.gob.do':               { user:['rnc','rncCedula','cedula_empresa','codigoEmpresa'], extra:['username','email','usuario','correo','nombre_usuario'], pass:['password','contrasena','clave'], extraFallbackNth:1 },
    'www.suir.gob.do':           { user:['rnc','rncCedula','cedula_empresa','codigoEmpresa'], extra:['username','email','usuario','correo','nombre_usuario'], pass:['password','contrasena','clave'], extraFallbackNth:1 },
    'ovi.mt.gob.do':             { user:['usuario','user','username'], pass:['contrasena','clave','password'], tarjeta:['tarjeta','token','codigo'] },
    'sisaril.mt.gob.do':         { user:['usuario','user','username'], pass:['contrasena','clave','password'], tarjeta:['tarjeta','token','codigo'] },
    'www.mt.gob.do':             { user:['usuario','user','username'], pass:['contrasena','clave','password'], tarjeta:['tarjeta','token','codigo'] },
    'www.cardnet.com.do':        { user:['usuario','user','username','login'], pass:['password','clave'] },
    'cardnet.com.do':            { user:['usuario','user','username','login'], pass:['password','clave'] },
  };

  function q(names){
    for(var i=0;i<names.length;i++){
      var el = document.querySelector('[name="'+names[i]+'"]') || document.getElementById(names[i]);
      if(el) return el;
    }
    return null;
  }
  function fill(el, val){
    if(!el || val===undefined) return;
    try{ Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,val); }catch(e){}
    el.value = val;
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
    el.dispatchEvent(new Event('blur',{bubbles:true}));
  }

  function run(){
    var cfg = PORTALS['${hostname}'];
    var uEl = cfg ? q(cfg.user) : null;
    var pEl = cfg ? q(cfg.pass) : null;
    // Generic fallback if portal-specific selectors don't match
    if(!uEl) uEl = document.querySelector('input[type="text"],input[type="email"]');
    if(!pEl) pEl = document.querySelector('input[type="password"]');
    fill(uEl, p.user||'');
    fill(pEl, p.pass||'');
    if(cfg && cfg.extra && p.cedula){
      var extraEl = Array.isArray(cfg.extra) ? q(cfg.extra) : document.querySelector('[name="'+cfg.extra+'"]');
      // Fallback: nth visible non-password input (for modern forms)
      if(!extraEl && cfg.extraFallbackNth !== undefined){
        var vis = Array.from(document.querySelectorAll('input:not([type=hidden]):not([type=password])'));
        extraEl = vis[cfg.extraFallbackNth] || null;
      }
      fill(extraEl, p.cedula);
    }
    if(cfg && cfg.tarjeta && p.tarjeta){
      fill(q(cfg.tarjeta), p.tarjeta);
    }
    var btn = (cfg && cfg.submit) ? q(cfg.submit) : null;
    if(!btn) btn = document.querySelector('input[type="submit"]') || document.querySelector('button[type="submit"]');
    setTimeout(function(){
      if(btn) {
        btn.click();
      } else if(pEl) {
        // Fallback: press Enter on the password field
        pEl.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:13,bubbles:true}));
        pEl.dispatchEvent(new KeyboardEvent('keypress',{key:'Enter',keyCode:13,bubbles:true}));
      }
    }, 800);
  }

  // Poll until the password field appears (handles SPAs that render the form after JS loads)
  function waitAndRun(remaining) {
    var pEl = document.querySelector('input[type="password"]');
    if (pEl) { run(); return; }
    if (remaining > 0) setTimeout(function(){ waitAndRun(remaining - 1); }, 400);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', function(){ waitAndRun(20); });
  else waitAndRun(20);
})();
<\/script>`;

        html = html.includes('</body>') ? html.replace('</body>', autofillScript + '</body>') : html + autofillScript;

        return new Response(html, {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
          },
        });
      } catch(e) {
        return new Response(`Error al obtener el portal: ${e.message}`, { status: 502 });
      }
    }

    // Default route — fetch portal page and extract hidden fields (ViewState etc.)
    const { searchParams } = reqUrl;
    const targetUrl = searchParams.get('url');
    if (!targetUrl) return json({ error: 'url requerida' }, 400);

    let target;
    try { target = new URL(targetUrl); }
    catch { return json({ error: 'URL inválida' }, 400); }

    if (!ALLOWED_HOSTS.some(h => target.hostname === h || target.hostname.endsWith('.' + h))) {
      return json({ error: 'Portal no permitido' }, 403);
    }

    try {
      const res = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'es-DO,es;q=0.9,en;q=0.8',
        },
        redirect: 'follow',
      });

      if (!res.ok) return json({ error: `Portal respondió ${res.status}` }, res.status);

      const html = await res.text();

      const hiddenFields = [];
      const hiddenRe = /<input[^>]+type=["']?hidden["']?[^>]*>/gi;
      const nameRe = /name=["']([^"']+)["']/i;
      const valueRe = /value=["']([^"']*)["']/i;
      let m;
      while ((m = hiddenRe.exec(html)) !== null) {
        const tag = m[0];
        const nm = nameRe.exec(tag);
        const vl = valueRe.exec(tag);
        if (nm) hiddenFields.push({ name: nm[1], value: vl ? vl[1] : '' });
      }

      let userField = null;
      const textRe = /<input[^>]+type=["']?text["']?[^>]*>/gi;
      while ((m = textRe.exec(html)) !== null) {
        const nm = nameRe.exec(m[0]);
        if (nm) { userField = nm[1]; break; }
      }

      let passField = null;
      const passRe = /<input[^>]+type=["']?password["']?[^>]*>/gi;
      while ((m = passRe.exec(html)) !== null) {
        const nm = nameRe.exec(m[0]);
        if (nm) { passField = nm[1]; break; }
      }

      let submitField = null;
      const submitRe = /<input[^>]+type=["']?submit["']?[^>]*>/gi;
      while ((m = submitRe.exec(html)) !== null) {
        const nm = nameRe.exec(m[0]);
        if (nm) { submitField = nm[1]; break; }
      }

      const actionM = /<form[^>]+action=["']([^"']+)["']/i.exec(html);
      let formAction = targetUrl;
      if (actionM) {
        try { formAction = new URL(actionM[1], targetUrl).toString(); } catch {}
      }

      return json({ hiddenFields, formAction, userField, passField, submitField });
    } catch (e) {
      return json({ error: `No se pudo conectar: ${e.message}` }, 502);
    }
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': CORS_ORIGIN,
    },
  });
}
