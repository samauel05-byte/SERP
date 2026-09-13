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
  'virtual.sisalril.gob.do',
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
const WORKER_ORIGIN = 'https://portal-rd-relay.samauel05.workers.dev';
const SPA_PROXY_HOSTS = new Set(['ovi.mt.gob.do', 'virtual.sisalril.gob.do']);

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
  var launchedFromSerp = !!hash;
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
      const cacheKey = new Request('https://cache.proxy/v2/' + encodeURIComponent(targetUrl));
      let html;
      const cached = request.method === 'GET' ? await cacheStorage.match(cacheKey) : null;
      if (cached) {
        html = await cached.text();
      } else {
        try {
          const forwardHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'es-DO,es;q=0.9,en;q=0.8',
          };
          const portalCookie = request.headers.get('Cookie');
          if (portalCookie) forwardHeaders.Cookie = portalCookie;
          if (request.method === 'POST' && request.headers.get('Content-Type')) forwardHeaders['Content-Type'] = request.headers.get('Content-Type');
          // DGII redirects its WebForms POST. Buffer the body once so the
          // runtime can safely retransmit it after that redirect.
          const postBody = request.method === 'POST' ? await request.arrayBuffer() : undefined;
          const portalRes = await fetch(targetUrl, {
            method: request.method === 'POST' ? 'POST' : 'GET',
            headers: forwardHeaders,
            body: postBody,
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
            try {
              const actionUrl = new URL(action, targetUrl).href;
              return pre + WORKER_ORIGIN + '/proxy?url=' + encodeURIComponent(actionUrl) + post;
            } catch { return m; }
          });
          if (request.method === 'GET') await cacheStorage.put(cacheKey, new Response(cachedHtml, {
            headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=120' }
          }));
          html = cachedHtml;
        } catch(e) {
          return new Response(`Error al obtener el portal: ${e.message}`, { status: 502 });
        }
      }

      try {
        const hostname = target.hostname;
        const isSPA = SPA_PROXY_HOSTS.has(hostname);

        // SPA portals (React): bypass cache, inject fetch/XHR interceptor, forward cookies
        if (isSPA) {
          let spaRes;
          let spaHtml;
          try {
            spaRes = await fetch(targetUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'es-DO,es;q=0.9,en;q=0.8',
              },
              redirect: 'follow',
            });
            spaHtml = await spaRes.text();
          } catch(e) {
            return new Response(`Error al obtener el portal: ${e.message}`, { status: 502 });
          }

          // Inject base href so relative URLs in HTML load from OVI
          const spaOrigin = target.origin;
          if (/<head(\s[^>]*)?>/i.test(spaHtml)) {
            spaHtml = spaHtml.replace(/<head(\s[^>]*)?>/i, (m, a) => `<head${a||''}><base href="${spaOrigin}/">`);
          } else {
            spaHtml = `<base href="${spaOrigin}/">` + spaHtml;
          }

          // Inject fetch/XHR interceptor at top of <head> so it runs before React loads
          const interceptor = `<script>(function(){
  var R='${WORKER_ORIGIN}';
  var O='${spaOrigin}';
  function proxyUrl(u){
    if(!u) return null;
    var s=String(u);
    if(s.charAt(0)==='/') return R+'/api-proxy?url='+encodeURIComponent(O+s);
    if(s.indexOf(O)===0) return R+'/api-proxy?url='+encodeURIComponent(s);
    return null;
  }
  var _f=window.fetch;
  window.fetch=function(input,init){
    var url=typeof input==='string'?input:(input&&input.url?input.url:String(input));
    var p=proxyUrl(url);
    if(p) return _f(p,Object.assign({},init||{},{credentials:'include'}));
    return _f.apply(this,arguments);
  };
  var _X=window.XMLHttpRequest;
  function XHRProxy(){
    var x=new _X();
    var _o=x.open.bind(x);
    x.open=function(m,u){
      var p=proxyUrl(String(u));
      return _o(m,p||u,arguments[2],arguments[3],arguments[4]);
    };
    return x;
  }
  XHRProxy.prototype=_X.prototype;
  window.XMLHttpRequest=XHRProxy;
})();<\/script>`;
          spaHtml = spaHtml.replace(/<head(\s[^>]*)?>/i, (m) => m + interceptor);

          // Inject autofill script — waitAndRun polls until React renders the form
          const spaAutofill = `<script>
(function(){
  var hash=location.hash.slice(1);
  if(!hash) return;
  var p; try{p=JSON.parse(decodeURIComponent(atob(hash)));}catch(e){return;}
  function fill(el,val){
    if(!el||val===undefined) return;
    try{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,val);}catch(e){}
    el.value=val;
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
    el.dispatchEvent(new Event('blur',{bubbles:true}));
  }
  function run(){
    var visible=Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="password"])'));
    // OVI renders RNC/Cédula, then Usuario/Correo, then Contraseña.
    // Its field names change between releases, so preserve the actual order
    // as a safe fallback when the name selectors are absent.
    var uEl=document.querySelector('[name="usuario"],[name="user"],[name="username"],[name="email"]')||visible[(p.cedula&&visible.length>1)?1:0];
    var pEl=document.querySelector('[name="contrasena"],[name="clave"],[name="password"]')||document.querySelector('input[type="password"]');
    if(p.cedula && visible.length>1) fill(visible[0],p.cedula);
    fill(uEl,p.user||'');
    fill(pEl,p.pass||'');
    var btn=document.querySelector('button[type="submit"],input[type="submit"]');
    setTimeout(function(){
      if(btn){btn.click();}
      else if(pEl){pEl.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:13,bubbles:true}));}
    },800);
  }
  function waitAndRun(n){
    if(document.querySelector('input[type="password"]')){run();return;}
    if(n>0) setTimeout(function(){waitAndRun(n-1);},400);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){waitAndRun(30);});
  else waitAndRun(30);
})();
<\/script>`;
          spaHtml = spaHtml.includes('</body>') ? spaHtml.replace('</body>', spaAutofill + '</body>') : spaHtml + spaAutofill;

          // Forward Set-Cookie headers from OVI (strip Domain so they store on workers.dev)
          const spaRespHeaders = new Headers({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
          let spaCookies = [];
          try { spaCookies = spaRes.headers.getAll('set-cookie'); } catch(e) {
            const c = spaRes.headers.get('set-cookie');
            if (c) spaCookies = [c];
          }
          for (const cookie of spaCookies) {
            let c = cookie.replace(/;\s*[Dd]omain=[^;]*/g, '');
            c = c.replace(/;\s*[Ss]ame[Ss]ite=None/gi, '; SameSite=Lax');
            if (!/SameSite=/i.test(c)) c += '; SameSite=Lax';
            spaRespHeaders.append('Set-Cookie', c);
          }
          return new Response(spaHtml, { headers: spaRespHeaders });
        }

        // Autofill script: reads credentials from URL hash, fills form, auto-submits
        // hostname is injected at request time so each portal gets its own config
        const autofillScript = `<script>
(function(){
  var hash = location.hash.slice(1);
  // DGII posts the first form to a new relay URL. Keep the encrypted-in-URL
  // payload only for this browser tab, then remove it from the URL before
  // posting. This prevents the login script from starting over on every page.
  try {
    if(hash) sessionStorage.setItem('serp-relay-autofill-payload', hash);
    else hash = sessionStorage.getItem('serp-relay-autofill-payload') || '';
  } catch(e) {}
  if(!hash) return;
  var p; try { p = JSON.parse(decodeURIComponent(atob(hash))); } catch(e){ return; }
  var dgiiFlowKey = 'serp-dgii-first-submit-' + (p.flow || hash);
  // A URL received directly from SERP starts a new login, even in an older
  // browser tab whose previous session state still exists. The card page is
  // loaded without a hash, so it keeps the one-time submission marker.
  if(launchedFromSerp){
    try { sessionStorage.removeItem(dgiiFlowKey); } catch(e) {}
  }
  function hasSubmittedDgiiFirstPage(){
    try { return sessionStorage.getItem(dgiiFlowKey) === '1'; } catch(e) { return false; }
  }
  function markDgiiFirstPageSubmitted(){
    try { sessionStorage.setItem(dgiiFlowKey, '1'); } catch(e) {}
  }

  // Per-portal field name maps
  var PORTALS = {
    'oficinavirtual.dgii.gov.do':{ user:['ctl00$ContentPlaceHolder1$txtUsuario','txtUsuario'], pass:['ctl00$ContentPlaceHolder1$txtPassword','txtPassword'], tarjeta:['ctl00$ContentPlaceHolder1$txtTarjeta','ctl00$ContentPlaceHolder1$txtCodigoTarjeta','txtTarjeta','txtCodigoTarjeta','tarjeta','codigoTarjeta','codigo'], submit:['ctl00$ContentPlaceHolder1$btnEntrar','btnEntrar'] },
    'www.dgii.gov.do':           { user:['ctl00$ContentPlaceHolder1$txtUsuario','txtUsuario'], pass:['ctl00$ContentPlaceHolder1$txtPassword','txtPassword'], tarjeta:['ctl00$ContentPlaceHolder1$txtTarjeta','ctl00$ContentPlaceHolder1$txtCodigoTarjeta','txtTarjeta','txtCodigoTarjeta','tarjeta','codigoTarjeta','codigo'], submit:['ctl00$ContentPlaceHolder1$btnEntrar','btnEntrar'] },
    'dgii.gov.do':               { user:['ctl00$ContentPlaceHolder1$txtUsuario','txtUsuario'], pass:['ctl00$ContentPlaceHolder1$txtPassword','txtPassword'], tarjeta:['ctl00$ContentPlaceHolder1$txtTarjeta','ctl00$ContentPlaceHolder1$txtCodigoTarjeta','txtTarjeta','txtCodigoTarjeta','tarjeta','codigoTarjeta','codigo'], submit:['ctl00$ContentPlaceHolder1$btnEntrar','btnEntrar'] },
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
  function requestedCardPosition(){
    // DGII renders text such as: "Favor introducir el código número: 3 de su tarjeta".
    // Read labels and tooltip attributes too; DGII sometimes renders its hint
    // outside the visible form text.
    var text = ((document.body && (document.body.innerText || document.body.textContent)) || '') + ' ' +
      Array.from(document.querySelectorAll('[title],[data-original-title],[aria-label]')).map(function(el){
        return el.getAttribute('title') || el.getAttribute('data-original-title') || el.getAttribute('aria-label') || '';
      }).join(' ');
    var match = text.match(/c[oó]digo\\s*(?:(?:n[uú]mero|n[ºo]\\.?)(?:\\s*(?:de|#))?)?\\s*:?\\s*(\\d{1,3})/i);
    var position = match ? parseInt(match[1], 10) : 0;
    if(position > 0){
      // DGII replaces the request with only an error after a failed attempt.
      // Retain the exact requested position so the retry still targets the
      // same cell in the code card.
      try { sessionStorage.setItem('serp-dgii-card-position', String(position)); } catch(e) {}
      return position;
    }
    if(/c[oó]digo\s+introducido\s+es\s+incorrecto/i.test(text)){
      try {
        var previous = parseInt(sessionStorage.getItem('serp-dgii-card-position') || '0', 10);
        return previous > 0 ? previous : 0;
      } catch(e) {}
    }
    return 0;
  }
  function cardCodeForPosition(codes, position){
    if(!position) return '';
    // Flatten again here even when the payload is an array: mobile browsers
    // may preserve the whole Excel cell as a single array item.
    var raw = Array.isArray(codes) ? codes : [codes];
    var list = [];
    raw.forEach(function(value){
      String(value || '').split(/[;,|\\r\\n]+/).forEach(function(code){
        code = code.trim();
        if(code) list.push(code);
      });
    });
    // Return one token only. A comma/newline in the result means it is not a
    // valid single card position and must never be submitted as the full card.
    var selected = String(list[position - 1] || '').trim();
    return /^[^,;|\\r\\n]+$/.test(selected) ? selected : '';
  }
  function cardInput(cfg){
    var el = cfg && cfg.tarjeta ? q(cfg.tarjeta) : null;
    function isCardTextField(input){
      if(!input || input.tagName !== 'INPUT') return false;
      return !/^(hidden|password|submit|button|image|checkbox|radio|file)$/i.test(input.type || 'text');
    }
    if(isCardTextField(el)) return el;
    var inputs = Array.from(document.querySelectorAll('input')).filter(isCardTextField);
    var matched = inputs.find(function(input){
      var label = input.labels && input.labels.length ? Array.from(input.labels).map(function(l){return l.textContent;}).join(' ') : '';
      var descriptor = [input.name,input.id,input.placeholder,label].filter(Boolean).join(' ');
      return /(tarjeta|c[oó]digo.*tarjeta|token)/i.test(descriptor);
    });
    if(matched) return matched;
    // DGII's markup occasionally omits a usable id/name for Tarjeta. Once its
    // prompt is present, the card input is always the final visible non-password
    // field (Usuario, then Tarjeta); this avoids relying on its changing markup.
    if('${hostname}'.indexOf('dgii.gov.do') !== -1 && requestedCardPosition() > 0) {
      return inputs.length ? inputs[inputs.length - 1] : null;
    }
    return null;
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
    if(cfg && cfg.tarjeta){
      // dgiiCodes is a positional card: item 1 is the code for position 1, etc.
      // A single tarjeta value remains supported for portals that do not use a code card.
      var cardCode = p.tarjeta || '';
      if(p.dgiiCodes){
        cardCode = cardCodeForPosition(p.dgiiCodes, requestedCardPosition());
      }
      if(cardCode) {
        var cardEl = cardInput(cfg);
        if(cardEl) { cardEl.value=''; fill(cardEl, cardCode); }
      }
    }
    var btn = (cfg && cfg.submit) ? q(cfg.submit) : null;
    if(!btn) btn = document.querySelector('input[type="submit"]') || document.querySelector('button[type="submit"]');
    setTimeout(function(){
      if(btn) {
        // The following DGII page stays on the relay. Its temporary tab-local
        // payload is used only if it asks for a code-card position.
        if('${hostname}'.indexOf('dgii.gov.do') !== -1 && !requestedCardPosition()) markDgiiFirstPageSubmitted();
        btn.click();
      } else if(pEl) {
        // Fallback: press Enter on the password field
        pEl.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:13,bubbles:true}));
        pEl.dispatchEvent(new KeyboardEvent('keypress',{key:'Enter',keyCode:13,bubbles:true}));
      }
    }, 180);
  }

  // DGII may render its card prompt after the password field. Do not submit
  // until both its input and the requested card code are available.
  function waitAndRun(remaining) {
    var pEl = document.querySelector('input[type="password"]');
    var isDgii = '${hostname}'.indexOf('dgii.gov.do') !== -1;
    if (pEl && !isDgii) { run(); return; }
    if (pEl && isDgii) {
      var cfg = PORTALS['${hostname}'];
      var position = requestedCardPosition();
      var code = p.dgiiCodes ? cardCodeForPosition(p.dgiiCodes, position) : (p.tarjeta || '');
      var cardField = cardInput(cfg);
      // DGII has two consecutive screens. The first only has Usuario/Clave;
      // submit it immediately. On the second screen it requests a position
      // from the code card, and only then wait for that exact card value.
      // A client without a card must submit the first form once only. If DGII
      // returns another password page without requesting a numbered card code,
      // it is a normal server response, not an instruction to submit again.
      if (!position && !hasSubmittedDgiiFirstPage()) { run(); return; }
      if (cardField && code) { run(); return; }
    }
    if (remaining > 0) setTimeout(function(){ waitAndRun(remaining - 1); }, 150);
    // DGII must never be submitted without the requested position on the card.
    else if (pEl && !isDgii) run();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', function(){ waitAndRun(100); });
  else waitAndRun(100);
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

    // /api-proxy — server-side proxy for SPA API calls to avoid CORS
    // Browser (at workers.dev) sends same-origin requests here; we forward to the real portal
    if (reqUrl.pathname === '/api-proxy') {
      const targetUrl = reqUrl.searchParams.get('url');
      if (!targetUrl) return new Response('Missing url', { status: 400 });

      let target;
      try { target = new URL(targetUrl); } catch { return new Response('URL inválida', { status: 400 }); }

      if (!ALLOWED_HOSTS.some(h => target.hostname === h || target.hostname.endsWith('.' + h))) {
        return new Response('Portal no permitido', { status: 403 });
      }

      // Forward browser headers to OVI, replacing host/origin/referer with OVI's values
      const fwdHeaders = {};
      const skip = new Set(['host','origin','referer','cf-ray','cf-connecting-ip','cf-ipcountry','cf-visitor','x-forwarded-for','x-real-ip','x-forwarded-proto','cdn-loop']);
      for (const [k, v] of request.headers.entries()) {
        if (!skip.has(k.toLowerCase())) fwdHeaders[k] = v;
      }
      fwdHeaders['Host'] = target.host;
      fwdHeaders['Origin'] = target.origin;
      fwdHeaders['Referer'] = target.origin + '/';
      fwdHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

      let body = null;
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        body = await request.arrayBuffer();
      }

      try {
        const apiRes = await fetch(targetUrl, {
          method: request.method,
          headers: fwdHeaders,
          body,
          redirect: 'manual',
        });

        const respHeaders = new Headers();
        const skipResp = new Set(['content-encoding','transfer-encoding','connection','content-security-policy','x-frame-options','strict-transport-security']);

        for (const [k, v] of apiRes.headers.entries()) {
          const kl = k.toLowerCase();
          if (skipResp.has(kl) || kl === 'set-cookie') continue;
          if (kl === 'location') {
            try {
              const absLoc = new URL(v, targetUrl).href;
              const locHost = new URL(absLoc).hostname;
              if (ALLOWED_HOSTS.some(h => locHost === h || locHost.endsWith('.' + h))) {
                respHeaders.set('Location', WORKER_ORIGIN + '/api-proxy?url=' + encodeURIComponent(absLoc));
              } else {
                respHeaders.set('Location', v);
              }
            } catch { respHeaders.set('Location', v); }
          } else {
            respHeaders.append(k, v);
          }
        }

        // Rewrite Set-Cookie: strip Domain so cookies store on workers.dev, fix SameSite
        let setCookies = [];
        try { setCookies = apiRes.headers.getAll('set-cookie'); } catch(e) {
          const c = apiRes.headers.get('set-cookie');
          if (c) setCookies = [c];
        }
        for (const cookie of setCookies) {
          let c = cookie.replace(/;\s*[Dd]omain=[^;]*/g, '');
          c = c.replace(/;\s*[Ss]ame[Ss]ite=None/gi, '; SameSite=Lax');
          if (!/SameSite=/i.test(c)) c += '; SameSite=Lax';
          respHeaders.append('Set-Cookie', c);
        }

        return new Response(apiRes.body, { status: apiRes.status, headers: respHeaders });
      } catch(e) {
        return new Response(`Proxy error: ${e.message}`, { status: 502 });
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
