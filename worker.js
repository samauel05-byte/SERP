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
  'api.mt.gob.do',
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
    // /r/<host>/<path> — portal assets (stylesheets and what they reference:
    // fonts, background images) served from the relay origin. Path form keeps
    // relative url(...) references inside the CSS on the relay as well.
    if (reqUrl.pathname.startsWith('/r/') && (request.method === 'GET' || request.method === 'HEAD')) {
      const m = reqUrl.pathname.match(/^\/r\/([^/]+)(\/.*)$/);
      if (!m || !ALLOWED_HOSTS.some(h => m[1] === h || m[1].endsWith('.' + h))) return new Response('Recurso no permitido', { status: 403 });
      const assetUrl = 'https://' + m[1] + m[2] + reqUrl.search;
      // A reload of an app screen (its address is under /r/) must open the
      // app again through the proxy, not its bare file.
      if (request.headers.get('Sec-Fetch-Dest') === 'document') {
        return Response.redirect(WORKER_ORIGIN + '/proxy?url=' + encodeURIComponent(assetUrl), 302);
      }
      const assetCache = caches.default;
      const assetKey = new Request('https://cache.proxy/asset/' + encodeURIComponent(assetUrl));
      const hit = await assetCache.match(assetKey);
      if (hit) return hit;
      let assetRes;
      try {
        assetRes = await fetch(assetUrl, { headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
          'Accept': request.headers.get('Accept') || '*/*',
          'Referer': 'https://' + m[1] + '/',
        } });
      } catch (e) { return new Response('No se pudo obtener el recurso', { status: 502 }); }
      const assetHeaders = new Headers({ 'Access-Control-Allow-Origin': '*', 'Cache-Control': assetRes.ok ? 'public, max-age=86400' : 'no-store' });
      const assetType = assetRes.headers.get('content-type');
      if (assetType) assetHeaders.set('Content-Type', assetType);
      let assetBody = assetRes.body;
      if (/text\/css/i.test(assetType || '')) {
        // Root-relative and absolute portal URLs inside the CSS ("/OFV/...",
        // "https://www.dgii.gov.do/...") also go through /r/<host>.
        const host = m[1];
        assetBody = (await assetRes.text())
          .replace(/(url\(\s*["']?|@import\s+["'])\/(?!\/)/gi, (all, pre) => pre + '/r/' + host + '/')
          .replace(/(url\(\s*["']?|@import\s+["'])https?:\/\/([^/"')\s]+)\//gi, (all, pre, h) => ALLOWED_HOSTS.some(a => h === a || h.endsWith('.' + a)) ? pre + '/r/' + h + '/' : all);
      }
      if (/\/appconfig[^/]*\.json$/i.test(m[2])) {
        // OVI (ABP) builds its own links, styles and the page it opens after
        // login from appBaseUrl. Point it at the relay so the app stays inside
        // it with its session, instead of jumping to the bare portal.
        const host = m[1];
        assetBody = (await assetRes.text()).replace(/("appBaseUrl"\s*:\s*")https:\/\/([^"/]+)\/?"/, (all, pre, h) =>
          ALLOWED_HOSTS.some(a => h === a || h.endsWith('.' + a)) ? pre + WORKER_ORIGIN + '/r/' + h + '"' : all);
        assetHeaders.set('Cache-Control', 'no-store');
      }
      const out = new Response(assetBody, { status: assetRes.status, headers: assetHeaders });
      if (assetRes.ok) await assetCache.put(assetKey, out.clone());
      return out;
    }

    if (reqUrl.pathname === '/proxy') {
      const targetUrl = reqUrl.searchParams.get('url');
      const rawFlow = reqUrl.searchParams.get('flow') || '';
      // The flow is not a credential; it scopes portal cookies to one client
      // tab so opening a second company cannot inherit the first company's
      // DGII session.
      let portalFlow = /^[A-Za-z0-9_-]{6,120}$/.test(rawFlow) ? rawFlow : '';
      let flowCookiePrefix = portalFlow ? 'serp_' + portalFlow + '_' : '';
      if (!targetUrl) return new Response('Missing url parameter', { status: 400 });

      let target;
      try { target = new URL(targetUrl); } catch { return new Response('URL inválida', { status: 400 }); }

      if (!ALLOWED_HOSTS.some(h => target.hostname === h || target.hostname.endsWith('.' + h))) {
        return new Response('Portal no permitido', { status: 403 });
      }

      // A popup or page the portal opens without our flow parameter must stay
      // in the same session: fall back to the last flow used for this portal
      // in this browser (remembered in a relay cookie).
      const lastFlowName = 'serp_lastflow_' + portalKey(target.hostname);
      if (!portalFlow) {
        const remembered = (request.headers.get('Cookie') || '').split(';').map(v => v.trim()).find(v => v.startsWith(lastFlowName + '='));
        const value = remembered ? remembered.slice(lastFlowName.length + 1) : '';
        if (/^[A-Za-z0-9_-]{6,120}$/.test(value)) { portalFlow = value; flowCookiePrefix = 'serp_' + portalFlow + '_'; }
      }
      const lastFlowCookie = portalFlow ? lastFlowName + '=' + portalFlow + '; Path=/; HttpOnly; Secure; SameSite=Lax' : '';

      // Cache the raw login page HTML (without autofill script) for 2 minutes
      // so repeat opens of slow government portals are nearly instant.
      const cacheStorage = caches.default;
      // A DGII login page establishes a session cookie. Serving a cached copy
      // would omit that cookie and make a valid login return to the same form.
      const canCachePage = request.method === 'GET' && !target.hostname.endsWith('dgii.gov.do') && !portalFlow;
      const cacheKey = new Request('https://cache.proxy/v2/' + encodeURIComponent(targetUrl));
      let html;
      let relaySetCookies = [];
      const cached = canCachePage ? await cacheStorage.match(cacheKey) : null;
      if (cached) {
        html = await cached.text();
      } else {
        try {
          const forwardHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'es-DO,es;q=0.9,en;q=0.8',
            'Referer': targetUrl,
            'Origin': target.origin,
          };
          const portalCookie = request.headers.get('Cookie');
          if (portalCookie) {
            if (flowCookiePrefix) {
              const scopedCookies = portalCookie.split(';').map(v => v.trim()).filter(v => v.startsWith(flowCookiePrefix)).map(v => v.slice(flowCookiePrefix.length));
              if (scopedCookies.length) forwardHeaders.Cookie = scopedCookies.join('; ');
            } else {
              forwardHeaders.Cookie = portalCookie;
            }
          }
          if (request.method === 'POST' && request.headers.get('Content-Type')) forwardHeaders['Content-Type'] = request.headers.get('Content-Type');
          // ASP.NET UpdatePanels post in the background and expect DGII's
          // compact "delta" answer; without this header DGII returns a full page.
          const msAjax = request.headers.get('X-MicrosoftAjax');
          if (msAjax) forwardHeaders['X-MicrosoftAjax'] = msAjax;
          // DGII redirects its WebForms POST. Buffer the body once so the
          // runtime can safely retransmit it after that redirect.
          const postBody = request.method === 'POST' ? await request.arrayBuffer() : undefined;
          const portalRes = await fetch(targetUrl, {
            method: request.method === 'POST' ? 'POST' : 'GET',
            headers: forwardHeaders,
            body: postBody,
            redirect: 'manual',
          });
          try {
            relaySetCookies = typeof portalRes.headers.getSetCookie === 'function'
              ? portalRes.headers.getSetCookie()
              : (portalRes.headers.getAll ? portalRes.headers.getAll('set-cookie') : []);
          } catch(e) {
            const cookie = portalRes.headers.get('set-cookie');
            if(cookie) relaySetCookies = [cookie];
          }
          // With redirect:'manual' we intercept every redirect and send the browser
          // to the proxy URL for the target. This preserves Set-Cookie headers that
          // redirect:'follow' would swallow (e.g. the ASP.NET session cookie DGII
          // sets on the login POST 302 redirect — without this the browser never
          // receives the session cookie and DGII shows the login page again).
          if (portalRes.status >= 300 && portalRes.status < 400) {
            const locationHdr = portalRes.headers.get('location');
            if (locationHdr) {
              try {
                const absLoc = new URL(locationHdr, targetUrl).href;
                const locHost = new URL(absLoc).hostname;
                const locIsAllowed = ALLOWED_HOSTS.some(h => locHost === h || locHost.endsWith('.' + h));
                const rdrTarget = locIsAllowed
                  ? WORKER_ORIGIN + '/proxy?url=' + encodeURIComponent(absLoc) + (portalFlow ? '&flow=' + encodeURIComponent(portalFlow) : '')
                  : absLoc;
                const rdrHeaders = new Headers({ 'Location': rdrTarget, 'Cache-Control': 'no-store' });
                if (lastFlowCookie) rdrHeaders.append('Set-Cookie', lastFlowCookie);
                for (const cookie of relaySetCookies) {
                  let c = String(cookie).replace(/;\s*Domain=[^;]*/gi, '').replace(/;\s*Path=[^;]*/gi, '') + '; Path=/';
                  if (flowCookiePrefix) c = c.replace(/^([^=;]+)/, flowCookiePrefix + '$1');
                  c = c.replace(/;\s*SameSite=None/gi, '; SameSite=Lax');
                  if (!/SameSite=/i.test(c)) c += '; SameSite=Lax';
                  rdrHeaders.append('Set-Cookie', c);
                }
                return new Response(null, { status: portalRes.status, headers: rdrHeaders });
              } catch(e) {}
            }
          }
          const portalType = portalRes.headers.get('content-type') || '';
          if (msAjax || (portalType && !/text\/html|application\/xhtml/i.test(portalType))) {
            const rawHeaders = new Headers({ 'Cache-Control': 'no-store' });
            if (lastFlowCookie) rawHeaders.append('Set-Cookie', lastFlowCookie);
            if (portalType) rawHeaders.set('Content-Type', portalType);
            const disposition = portalRes.headers.get('content-disposition');
            if (disposition) rawHeaders.set('Content-Disposition', disposition);
            for (const cookie of relaySetCookies) rawHeaders.append('Set-Cookie', relayCookie(cookie, flowCookiePrefix));
            return new Response(portalRes.body, { status: portalRes.status, headers: rawHeaders });
          }
          html = await portalRes.text();

          // Cache raw HTML (before autofill injection) for 2 minutes
          // The page's own URL, not the site root: relative paths such as
          // "Seguridad/SolicitarClave.aspx" or "imagenes/logo.png" resolve
          // exactly as they do on the portal.
          const baseHref = targetUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
          let cachedHtml = html;
          if (cachedHtml.match(/<head(\s[^>]*)?>/i)) {
            cachedHtml = cachedHtml.replace(/<head(\s[^>]*)?>/i, (m, a) => `<head${a || ''}><base href="${baseHref}">`);
          } else {
            cachedHtml = `<base href="${baseHref}">` + cachedHtml;
          }
          // Stylesheets load through the relay (path form /r/<host>/<path>): the
          // fonts and images they reference then resolve to the relay too, so
          // the browser accepts DGII's icon fonts, which it blocks cross-site.
          cachedHtml = cachedHtml.replace(/<link\b[^>]*>/gi, tag => {
            if (!/\brel=["']?stylesheet/i.test(tag)) return tag;
            return tag.replace(/(\bhref=["'])([^"']+)(["'])/i, (m, pre, href, post) => {
              try {
                const abs = new URL(href.replace(/&amp;/gi, '&'), targetUrl);
                if (!/^https?:$/.test(abs.protocol) || !ALLOWED_HOSTS.some(h => abs.hostname === h || abs.hostname.endsWith('.' + h))) return m;
                return pre + WORKER_ORIGIN + '/r/' + abs.hostname + abs.pathname + abs.search + post;
              } catch { return m; }
            });
          });
          cachedHtml = cachedHtml.replace(/(<form\b[^>]+\baction=["'])([^"']+)(["'])/gi, (m, pre, action, post) => {
            try {
              const actionUrl = new URL(action.replace(/&amp;/gi, '&'), targetUrl).href;
              return pre + WORKER_ORIGIN + '/proxy?url=' + encodeURIComponent(actionUrl) + (portalFlow ? '&flow=' + encodeURIComponent(portalFlow) : '') + post;
            } catch { return m; }
          });
          // Iframes written in the page (notices, documents) load through the relay.
          cachedHtml = cachedHtml.replace(/(<iframe\b[^>]*\bsrc=["'])([^"']+)(["'])/gi, (m, pre, src, post) => {
            try {
              const abs = new URL(src.replace(/&amp;/gi, '&'), targetUrl);
              if (!/^https?:$/.test(abs.protocol) || !ALLOWED_HOSTS.some(h => abs.hostname === h || abs.hostname.endsWith('.' + h))) return m;
              return pre + WORKER_ORIGIN + '/proxy?url=' + encodeURIComponent(abs.href) + (portalFlow ? '&flow=' + encodeURIComponent(portalFlow) : '') + post;
            } catch { return m; }
          });
          // DGII's menus navigate with inline onclick='location.href="/OFV/..."'.
          // Browsers do not allow location.href to be intercepted, and with the
          // DGII <base> those clicks would leave the proxy without the session
          // (DGII then asks to log in again). Point them at __serpLoc instead,
          // which the navigation script below routes through the proxy.
          cachedHtml = cachedHtml
            .replace(/\b(?:window\.|document\.|self\.|top\.)?location\.href\s*=(?!=)/g, '__serpLoc.href=')
            .replace(/\b(?:window\.|document\.|self\.|top\.)?location\.(assign|replace)\s*\(/g, '__serpLoc.$1(');
          // Rewrite <meta http-equiv="refresh"> redirect URLs so they go through the proxy
          cachedHtml = cachedHtml.replace(/(<meta\b[^>]+\bhttp-equiv=["']refresh["'][^>]*\bcontent=["'][^"']*;\s*url=)([^"' >]+)/gi, (m, pre, url) => {
            try {
              const absUrl = new URL(url.trim(), targetUrl).href;
              const uh = new URL(absUrl).hostname;
              if (ALLOWED_HOSTS.some(h => uh === h || uh.endsWith('.' + h))) {
                return pre + WORKER_ORIGIN + '/proxy?url=' + encodeURIComponent(absUrl) + (portalFlow ? '&flow=' + encodeURIComponent(portalFlow) : '');
              }
            } catch {}
            return m;
          });
          if (canCachePage) await cacheStorage.put(cacheKey, new Response(cachedHtml, {
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

        // DGII includes a third-party chat widget registered only for
        // dgii.gov.do. When served through the relay its global may be absent.
        // Define a harmless fallback before DGII's scripts run; do not strip
        // arbitrary inline scripts because the login form is also generated
        // by DGII inline markup.
        if (hostname === 'dgii.gov.do' || hostname.endsWith('.dgii.gov.do')) {
          const chatGuard = '<script>window.DigiWebchatWidget=window.DigiWebchatWidget||function(){};</' + 'script>';
          html = /<head(\s[^>]*)?>/i.test(html)
            ? html.replace(/<head(\s[^>]*)?>/i, m => m + chatGuard)
            : chatGuard + html;
        }

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

          // Relative URLs (the app's module scripts, chunks, styles, fonts)
          // load through the relay's asset route. Loaded straight from the
          // portal, the browser blocks module scripts cross-site and the app
          // never renders its login form.
          const spaOrigin = target.origin;
          const spaBase = WORKER_ORIGIN + '/r/' + hostname + '/';
          if (/<head(\s[^>]*)?>/i.test(spaHtml)) {
            spaHtml = spaHtml.replace(/<head(\s[^>]*)?>/i, (m, a) => `<head${a||''}><base href="${spaBase}">`);
          } else {
            spaHtml = `<base href="${spaBase}">` + spaHtml;
          }
          spaHtml = spaHtml.replace(/<base\s+href=["']\/["']\s*\/?>/gi, '');

          // Inject fetch/XHR interceptor at top of <head> so it runs before React loads
          const interceptor = `<script>(function(){
  var R='${WORKER_ORIGIN}';
  var O='${spaOrigin}';
  // The app's router reads the page path. Show it the portal's own path
  // under the asset base, so it opens the same screen (e.g. account/login).
  try{
    var B='/r/${hostname}';
    var T=new URL(new URLSearchParams(location.search).get('url')||O+'/');
    if(location.pathname.indexOf(B)!==0) history.replaceState(history.state,'',B+T.pathname+T.search+location.hash);
  }catch(e){}
  window.__serpRelayErrors=[];
  window.__serpRelayRequests=[];
  var _serpConsoleError=console.error.bind(console);
  console.error=function(){try{window.__serpRelayErrors.push({message:Array.prototype.map.call(arguments,function(a){return a&&a.message?a.message:String(a);}).join(' '),source:'console',line:0});}catch(e){}return _serpConsoleError.apply(console,arguments);};
  window.addEventListener('error',function(e){window.__serpRelayErrors.push({message:String(e.message||''),source:String(e.filename||''),line:e.lineno||0});});
  window.addEventListener('unhandledrejection',function(e){window.__serpRelayErrors.push({message:String((e.reason&&e.reason.message)||e.reason||'Unhandled rejection'),source:'promise',line:0});});
  function proxyUrl(u){
    if(!u) return null;
    var s=String(u);
    if(s.charAt(0)==='/') return R+'/api-proxy?url='+encodeURIComponent(O+s);
    if(s.indexOf(O)===0) return R+'/api-proxy?url='+encodeURIComponent(s);
    // OVI serves its application at ovi.mt.gob.do but authenticates through
    // the separate public API domain. Keep that request same-origin too.
    if(s.indexOf('https://api.mt.gob.do')===0) return R+'/api-proxy?url='+encodeURIComponent(s);
    return null;
  }
  var _f=window.fetch;
  window.fetch=function(input,init){
    var url=typeof input==='string'?input:(input&&input.url?input.url:String(input));
    var p=proxyUrl(url);
    if(p) return _f(p,Object.assign({},init||{},{credentials:'include'})).then(function(r){window.__serpRelayRequests.push({url:url,status:r.status});return r;},function(e){window.__serpRelayRequests.push({url:url,error:String(e)});throw e;});
    return _f.apply(this,arguments);
  };
  var _X=window.XMLHttpRequest;
  function XHRProxy(){
    var x=new _X();
    var _o=x.open.bind(x);
    x.open=function(m,u){
      var p=proxyUrl(String(u));
      x.addEventListener('loadend',function(){window.__serpRelayRequests.push({url:String(u),status:x.status});},{once:true});
      // Pass only the arguments the app passed: an explicit undefined
      // "async" argument turns the request synchronous.
      var a=Array.prototype.slice.call(arguments); a[1]=p||u;
      return _o.apply(null,a);
    };
    return x;
  }
  XHRProxy.prototype=_X.prototype;
  // Keep XMLHttpRequest.DONE and the other constants: apps compare
  // readyState with them and never finish loading without them.
  try{Object.setPrototypeOf(XHRProxy,_X);}catch(e){}
  ['UNSENT','OPENED','HEADERS_RECEIVED','LOADING','DONE'].forEach(function(k,i){try{if(XHRProxy[k]!==i)Object.defineProperty(XHRProxy,k,{value:i});}catch(e){}});
  window.XMLHttpRequest=XHRProxy;
})();<\/script>`;
          spaHtml = spaHtml.replace(/<head(\s[^>]*)?>/i, (m) => m + interceptor);

          // Inject autofill script — waitAndRun polls until React renders the form
          const spaAutofill = `<script>
(function(){
  // Show error overlay if the portal hasn't rendered a password input within 30s
  setTimeout(function(){
    if(!document.querySelector('input[type="password"]')){
      var d=document.createElement('div');
      d.style.cssText='position:fixed;inset:0;background:rgba(15,23,42,.92);display:flex;align-items:center;justify-content:center;z-index:99999;font-family:system-ui,sans-serif';
      d.innerHTML='<div style="background:#1e293b;color:#e2e8f0;border-radius:12px;padding:32px 28px;max-width:360px;text-align:center"><div style="font-size:32px;margin-bottom:12px">⚠️</div><h3 style="margin:0 0 8px;font-size:17px">Portal no disponible</h3><p style="margin:0 0 18px;font-size:13px;color:#94a3b8">El portal del Ministerio de Trabajo tardó demasiado en cargar. Puede estar en mantenimiento o con problemas de conexión.</p><button onclick="window.close()" style="background:#6366f1;color:#fff;border:none;border-radius:8px;padding:8px 20px;cursor:pointer;font-size:13px">Cerrar</button></div>';
      document.body.appendChild(d);
    }
  }, 30000);
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
    if(p.tarjeta){
      var tEl=document.querySelector('[name="tarjeta"],[name="token"],[name="codigo"],[name="codigoTarjeta"]');
      if(!tEl){ var allInputs=Array.from(document.querySelectorAll('input:not([type=hidden]):not([type=submit])')); tEl=allInputs.find(function(i){return /(tarjeta|token|c[oó]digo)/i.test(i.name+' '+i.id+' '+(i.placeholder||''));}) || null; }
      if(tEl) fill(tEl, p.tarjeta);
    }
    var btn=document.querySelector('button[type="submit"],input[type="submit"]');
    setTimeout(function(){
      if(btn){btn.click();}
      else if(pEl){pEl.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:13,bubbles:true}));}
    },400);
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
          try {
            spaCookies = typeof spaRes.headers.getSetCookie === 'function'
              ? spaRes.headers.getSetCookie()
              : (spaRes.headers.getAll ? spaRes.headers.getAll('set-cookie') : []);
          } catch(e) {
            const c = spaRes.headers.get('set-cookie');
            if (c) spaCookies = [c];
          }
          for (const cookie of spaCookies) {
            let c = cookie.replace(/;\s*[Dd]omain=[^;]*/g, '').replace(/;\s*[Pp]ath=[^;]*/g, '') + '; Path=/';
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
  var launchedFromSerp = !!hash;
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
  var dgiiCardSubmitKey = 'serp-dgii-card-submit-' + (p.flow || hash);
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
  function hasSubmittedDgiiCard(position){
    try { return sessionStorage.getItem(dgiiCardSubmitKey) === String(position); } catch(e) { return false; }
  }
  function markDgiiCardSubmitted(position){
    try { sessionStorage.setItem(dgiiCardSubmitKey, String(position)); } catch(e) {}
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
  // DGII rejects a wrong code with "Acceso denegado: El código introducido no
  // es válido" (older wording: "... es incorrecto").
  function dgiiCardRejected(text){
    return /c[oó]digo\\s+introducido\\s+(?:no\\s+es\\s+v[aá]lido|es\\s+incorrecto)/i.test(text || ((document.body && document.body.innerText) || ''));
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
    if(dgiiCardRejected(text)){
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
    // A configured selector names the exact field — accept any INPUT type, including password.
    if(el && el.tagName === 'INPUT') return el;
    function isCardTextField(input){
      if(!input || input.tagName !== 'INPUT') return false;
      // Include password-type inputs: DGII's code card field is type=password
      return !/^(hidden|submit|button|image|checkbox|radio|file)$/i.test(input.type || 'text');
    }
    var inputs = Array.from(document.querySelectorAll('input')).filter(isCardTextField);
    // DGII's labels are table cells rather than HTML <label> elements. Prefer
    // the input in the row whose visible text explicitly says “Tarjeta”.
    var rowMatched = inputs.find(function(input){
      var row = input.closest && input.closest('tr');
      return row && /tarjeta/i.test(row.textContent || '');
    });
    if(rowMatched) return rowMatched;
    var matched = inputs.find(function(input){
      var label = input.labels && input.labels.length ? Array.from(input.labels).map(function(l){return l.textContent;}).join(' ') : '';
      var descriptor = [input.name,input.id,input.placeholder,label].filter(Boolean).join(' ');
      return /(tarjeta|c[oó]digo.*tarjeta|token)/i.test(descriptor);
    });
    if(matched) return matched;
    // Never guess a DGII field from its position. A wrong guess can put a
    // card code in Usuario or overwrite another value.
    return null;
  }

  function run(){
    var cfg = PORTALS['${hostname}'];
    var isDgii = '${hostname}'.indexOf('dgii.gov.do') !== -1;
    var cardPosition = isDgii ? requestedCardPosition() : 0;
    var uEl = cfg ? q(cfg.user) : null;
    var pEl = cfg ? q(cfg.pass) : null;
    // Generic fallback if portal-specific selectors don't match
    if(!uEl) uEl = document.querySelector('input[type="text"],input[type="email"]');
    if(!pEl) pEl = document.querySelector('input[type="password"]');
    // The code-card screen is a different step. Its Usuario/Clave values are
    // already retained by DGII; on that screen write only into Tarjeta.
    if(!isDgii || !cardPosition){
      fill(uEl, p.user||'');
      fill(pEl, p.pass||'');
    }
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
        cardCode = cardCodeForPosition(p.dgiiCodes, cardPosition);
      }
      if(cardCode) {
        var cardEl = cardInput(cfg);
        if(cardEl) { cardEl.value=''; fill(cardEl, cardCode); }
      }
    }
    var btn = (cfg && cfg.submit) ? q(cfg.submit) : null;
    if(!btn) btn = document.querySelector('input[type="submit"]') || document.querySelector('button[type="submit"]') || document.querySelector('button:not([type="button"])');
    setTimeout(function(){
      if(btn) {
        // The following DGII page stays on the relay. Its temporary tab-local
        // payload is used only if it asks for a code-card position.
        if(isDgii && !cardPosition) markDgiiFirstPageSubmitted();
        if(isDgii && cardPosition) markDgiiCardSubmitted(cardPosition);
        if(isDgii && cardPosition){ try { sessionStorage.setItem('serp-dgii-last-card', JSON.stringify({ position: cardPosition, code: (cardInput(cfg) || {}).value || '' })); } catch(e) {} }
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
      // DGII rejected a code. Do not try again on our own: repeated wrong codes
      // can lock the company's access. Leave the page as DGII shows it.
      if (dgiiCardRejected()) { if (position || remaining <= 0) return; }
      // Send one card attempt only. If DGII rejects it, leave the page still
      // instead of repeatedly submitting the same value.
      if (cardField && code && !hasSubmittedDgiiCard(position)) { run(); return; }
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

        // Intercept <a href> link clicks that point to allowed portals and route
        // them through the proxy so the session cookies (stored on workers.dev)
        // are forwarded on every navigation — without this, clicking any menu
        // link (e.g. DGII "Envío") would take the browser directly to the portal
        // domain with no session cookies, causing an immediate logout.
        const navInterceptor = `<script>(function(){
  var W='${WORKER_ORIGIN}';
  var F=${JSON.stringify(portalFlow)};
  var HOSTS=${JSON.stringify(ALLOWED_HOSTS)};
  // The page is served at workers.dev/proxy?url=<portal-url>.
  // Relative hrefs must resolve against the REAL portal base, not location.href.
  var sp=new URLSearchParams(location.search);
  var BASE=sp.get('url')||location.href;
  function isAllowed(host){return HOSTS.some(function(h){return host===h||host.endsWith('.'+h);});}
  function proxyHref(href){
    try{
      var u=new URL(href,BASE);
      if(!isAllowed(u.hostname)) return null;
      return W+'/proxy?url='+encodeURIComponent(u.href)+(F?'&flow='+encodeURIComponent(F):'');
    }catch(e){return null;}
  }
  // Capture raw assign/replace BEFORE any patching so we can call them without recursion
  var _assign=window.location.assign.bind(window.location);
  var _replace=window.location.replace.bind(window.location);
  // Intercept <a href> clicks (capturing phase so it runs before any onclick)
  document.addEventListener('click',function(e){
    var el=e.target;
    while(el&&el.tagName!=='A') el=el.parentElement;
    if(!el||!el.getAttribute) return;
    var href=el.getAttribute('href');
    // DGII buttons are <a href="#"> with the real action in an onclick. With
    // the DGII <base>, "#" points at the portal page itself, so following it
    // reloaded the same page and cancelled the button's own navigation.
    // Cancel only the "#" jump; the button's handlers still run.
    if(href&&href.charAt(0)==='#'){
      e.preventDefault();
      var id=href.slice(1),t=id&&(document.getElementById(id)||document.getElementsByName(id)[0]);
      if(t&&t.scrollIntoView) t.scrollIntoView();
      return;
    }
    if(!href||/^(javascript:|mailto:|tel:)/i.test(href)) return;
    var p=proxyHref(href);
    if(!p) return;
    e.preventDefault();
    e.stopPropagation();
    _assign(p);
  },true);
  // Inline page code calls __serpLoc instead of location (rewritten by the relay).
  window.__serpLoc={
    get href(){return BASE;},
    set href(v){var p=proxyHref(String(v));_assign(p||String(v));},
    assign:function(v){var p=proxyHref(String(v));_assign(p||String(v));},
    replace:function(v){var p=proxyHref(String(v));_replace(p||String(v));},
    toString:function(){return BASE;}
  };
  // location.assign/replace are unforgeable in modern browsers: redefining
  // them throws. Keep trying for old engines, but never let the error stop
  // the form and window.open protection below from being installed.
  try{Object.defineProperty(window.location,'assign',{configurable:true,writable:true,value:function(href){var p=proxyHref(href);_assign(p||href);}});}catch(e){}
  try{Object.defineProperty(window.location,'replace',{configurable:true,writable:true,value:function(href){var p=proxyHref(href);_replace(p||href);}});}catch(e){}
  // Catch-all where the Navigation API exists (Chrome, Edge, Android): any
  // other navigation that would leave the proxy for the portal is sent back
  // through it, so the session cookies travel with it. POSTs are covered by
  // the form patches below.
  try{
    if(window.navigation&&navigation.addEventListener){
      navigation.addEventListener('navigate',function(e){
        try{
          if(!e.cancelable||e.hashChange||e.downloadRequest||e.formData) return;
          var u=new URL(e.destination.url);
          if(u.origin===location.origin||!isAllowed(u.hostname)) return;
          // A jump to an anchor of this same page is not a navigation.
          var here=new URL(BASE,location.href);
          if(u.hash&&u.href.split('#')[0]===here.href.split('#')[0]){e.preventDefault();return;}
          var p=proxyHref(u.href); if(!p) return;
          e.preventDefault(); _assign(p);
        }catch(ex){}
      });
    }
  }catch(e){}
  // Patch Location.prototype.href setter — catches window.location.href='...' used by ASP.NET WebForms __doPostBack and menu scripts
  try{
    var _lp=Location.prototype;
    var _hd=Object.getOwnPropertyDescriptor(_lp,'href');
    if(_hd&&_hd.set){
      var _origSet=_hd.set;
      Object.defineProperty(_lp,'href',{configurable:true,get:_hd.get,set:function(href){var p=proxyHref(String(href));_origSet.call(this,p||href);}});
    }
  }catch(e){}
  // Patch window.open — catches new-tab/window navigations that bypass the proxy
  try{
    var _origOpen=window.open;
    window.open=function(url,target,features){
      if(url&&typeof url==='string'&&!/^(javascript:|#|mailto:|tel:|about:|blob:)/i.test(url)){
        var p=proxyHref(url);
        if(p) return _origOpen.call(window,p,target,features);
      }
      return _origOpen.apply(window,arguments);
    };
  }catch(e){}
  // Rewrite a form's action to go through the proxy (used by both submit paths below)
  function rewriteFormAction(form){
    var action=form.getAttribute('action')||'';
    if(!action||/^(javascript:|#)/i.test(action)) return;
    try{
      var u=new URL(action,BASE);
      if(isAllowed(u.hostname)) form.action=W+'/proxy?url='+encodeURIComponent(u.href)+(F?'&flow='+encodeURIComponent(F):'');
    }catch(ex){}
  }
  // Intercept user-initiated form submits (fires the submit event)
  document.addEventListener('submit',function(e){
    var form=e.target;
    if(form&&form.tagName==='FORM') rewriteFormAction(form);
  },true);
  // Patch HTMLFormElement.prototype.submit — ASP.NET __doPostBack calls form.submit() directly
  // which DOES NOT fire the submit event, so the listener above would never catch it.
  try{
    var _origFormSubmit=HTMLFormElement.prototype.submit;
    HTMLFormElement.prototype.submit=function(){
      rewriteFormAction(this);
      _origFormSubmit.call(this);
    };
  }catch(e){}
  try{
    var _origRequestSubmit=HTMLFormElement.prototype.requestSubmit;
    if(_origRequestSubmit) HTMLFormElement.prototype.requestSubmit=function(){
      rewriteFormAction(this);
      return _origRequestSubmit.apply(this,arguments);
    };
  }catch(e){}
})();<\/script>`;
        // DGII's login page runs window.sessionStorage.clear() on load. Through
        // the relay that storage is the autofill's: the company payload kept
        // for the next screen (the code-card step) was erased, so the card was
        // never filled. Keep the relay's own "serp-" keys when the page clears.
        // Patched on Storage.prototype: assigning sessionStorage.clear directly is
        // ignored by Safari/iOS (it stores a "clear" item instead).
        const storageGuard = `<script>(function(){try{var P=Storage.prototype,c=P.clear;P.clear=function(){if(this!==window.sessionStorage)return c.call(this);var keep={},i,k;for(i=0;i<this.length;i++){k=this.key(i);if(k&&k.indexOf('serp-')===0)keep[k]=this.getItem(k);}c.call(this);for(k in keep)this.setItem(k,keep[k]);};}catch(e){}})();<\/script>`;
        // DGII opens notices and documents in windows (colorbox iframes) whose
        // src points at dgii.gov.do. Loaded from there they carry no session
        // (the cookies live on the relay) and DGII refuses to be framed, so the
        // window came up blank. Route iframe sources through the relay too.
        const frameRelay = `<script>(function(){try{
  var W='${WORKER_ORIGIN}',F=${JSON.stringify(portalFlow)},H=${JSON.stringify(ALLOWED_HOSTS)};
  var B=new URLSearchParams(location.search).get('url')||location.href;
  function px(v){try{var u=new URL(String(v),B);if(u.origin===location.origin||!/^https?:$/.test(u.protocol))return null;
    if(!H.some(function(h){return u.hostname===h||u.hostname.endsWith('.'+h);}))return null;
    return W+'/proxy?url='+encodeURIComponent(u.href)+(F?'&flow='+encodeURIComponent(F):'');}catch(e){return null;}}
  var d=Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype,'src');
  if(d&&d.set)Object.defineProperty(HTMLIFrameElement.prototype,'src',{configurable:true,enumerable:d.enumerable,get:d.get,set:function(v){var p=px(v);d.set.call(this,p||v);}});
  var sa=Element.prototype.setAttribute;
  Element.prototype.setAttribute=function(n,v){if(this.tagName==='IFRAME'&&String(n).toLowerCase()==='src'){var p=px(v);if(p)v=p;}return sa.call(this,n,v);};
}catch(e){}})();<\/script>`;
        html = html.replace(/<head(\s[^>]*)?>/i, (m) => m + storageGuard + frameRelay + navInterceptor);

        const responseHeaders = new Headers({
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        // The browser is on workers.dev, so strip DGII's Domain attribute.
        // The relay forwards this cookie back to DGII on the next request.
        for (const cookie of relaySetCookies) responseHeaders.append('Set-Cookie', relayCookie(cookie, flowCookiePrefix));
        if (lastFlowCookie) responseHeaders.append('Set-Cookie', lastFlowCookie);
        return new Response(html, { headers: responseHeaders });
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
          let c = cookie.replace(/;\s*[Dd]omain=[^;]*/g, '').replace(/;\s*[Pp]ath=[^;]*/g, '') + '; Path=/';
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
    // This route answers Direct's background requests with JSON. A browser
    // tab that lands here (a page navigation) must see the portal instead of
    // that JSON: send it to the proxied page, keeping the flow if present.
    const isNavigation = request.headers.get('Sec-Fetch-Mode') === 'navigate'
      || request.headers.get('Sec-Fetch-Dest') === 'document'
      || (!request.headers.get('Sec-Fetch-Mode') && /text\/html/i.test(request.headers.get('Accept') || ''));
    if (isNavigation && request.method === 'GET') {
      let portal = null;
      try { portal = targetUrl ? new URL(targetUrl) : null; } catch {}
      if (portal && /^https?:$/.test(portal.protocol) && ALLOWED_HOSTS.some(h => portal.hostname === h || portal.hostname.endsWith('.' + h))) {
        const flow = searchParams.get('flow');
        const to = WORKER_ORIGIN + '/proxy?url=' + encodeURIComponent(portal.href) + (flow && /^[A-Za-z0-9_-]{6,120}$/.test(flow) ? '&flow=' + encodeURIComponent(flow) : '');
        return new Response(null, { status: 302, headers: { Location: to, 'Cache-Control': 'no-store' } });
      }
    }
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

// The browser is on workers.dev, so a portal cookie loses its Domain, is
// scoped to the launch's flow and is sent back to the portal by the relay.
// DGII lives on several hostnames (www.dgii.gov.do, dgii.gov.do, ...): one key per portal.
function portalKey(hostname) {
  const parts = String(hostname).toLowerCase().split('.');
  return parts.slice(-3).join('_').replace(/[^a-z0-9_]/g, '');
}

function relayCookie(cookie, flowCookiePrefix) {
  let c = String(cookie).replace(/;\s*Domain=[^;]*/gi, '').replace(/;\s*Path=[^;]*/gi, '') + '; Path=/';
  if (flowCookiePrefix) c = c.replace(/^([^=;]+)/, flowCookiePrefix + '$1');
  return c;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': CORS_ORIGIN,
    },
  });
}
