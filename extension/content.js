// Content script — runs on each portal login page and fills the form

const PORTALS = {
  'dgii.gov.do': {
    user: ['ctl00$ContentPlaceHolder1$txtUsuario', 'txtUsuario', 'usuario', 'user', 'username'],
    pass: ['ctl00$ContentPlaceHolder1$txtPassword', 'txtPassword', 'password', 'clave', 'contrasena'],
    tarjeta: ['ctl00$ContentPlaceHolder1$txtTarjeta', 'ctl00$ContentPlaceHolder1$txtCodigoTarjeta', 'txtTarjeta', 'txtCodigoTarjeta', 'tarjeta', 'codigoTarjeta', 'codigo'],
    submit: ['ctl00$ContentPlaceHolder1$btnEntrar', 'btnEntrar'],
  },
  'tss.gob.do': {
    user: ['ctl00$MainContent$txtrncCedula', 'txtrncCedula', 'usuario', 'user'],
    pass: ['ctl00$MainContent$txtClassRep', 'password', 'clave'],
    extra: { 'ctl00$MainContent$txtrepresentante': 'cedula' },
    submit: ['ctl00$MainContent$btLoginRep'],
  },
  'suir.gob.do': {
    user: ['ctl00$MainContent$txtrncCedula', 'txtrncCedula'],
    pass: ['ctl00$MainContent$txtClassRep', 'txtClassRep'],
    extra: { 'ctl00$MainContent$txtrepresentante': 'cedula' },
    submit: ['ctl00$MainContent$btLoginRep'],
  },
  'ovi.mt.gob.do': {
    user: ['userNameOrEmailAddress', 'usuario', 'username', 'email'],
    pass: ['password', 'contrasena', 'clave'],
    submit: ['LoginButton', 'btnLogin', 'login'],
  },
  'virtual.sisalril.gob.do': {
    user: ['email', 'correo', 'username', 'usuario'],
    pass: ['password', 'contrasena', 'clave'],
    submit: ['login', 'btnLogin', 'submit'],
  },
  'mt.gob.do': {
    user: ['usuario', 'user', 'username'],
    pass: ['password', 'clave', 'contrasena'],
  },
  'cardnet.com.do': {
    user: ['usuario', 'user', 'username', 'login'],
    pass: ['password', 'clave', 'contrasena'],
  },
};

function getPortalKey() {
  const host = location.hostname;
  return Object.keys(PORTALS).find(k => host === k || host.endsWith('.' + k));
}

function findField(candidates) {
  for (const name of candidates) {
    const el = document.querySelector(`[name="${CSS.escape(name)}"]`)
           || document.querySelector(`#${CSS.escape(name)}`);
    if (el) return el;
  }
  // Fallback: find by type
  return null;
}

function fillField(el, value) {
  if (!el) return;
  const nativeInput = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
  nativeInput?.set?.call(el, value);
  el.value = value;
  el.dispatchEvent(new Event('input',  { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function requestedCardPosition() {
  const text = document.body?.innerText || '';
  const match = text.match(/c[oó]digo\s*(?:n[uú]mero|n[ºo]\.?)?\s*:?\s*(\d{1,3})/i);
  const position = match ? parseInt(match[1], 10) : 0;
  return position > 0 ? position : 0;
}

function cardCodeForPosition(codes, position) {
  const values = Array.isArray(codes) ? codes : String(codes || '').split(/[,;|\n]+/);
  return position ? String(values[position - 1] || '').trim() : '';
}

function tryFill(creds) {
  const key = getPortalKey();
  if (!key) return false;
  const cfg = PORTALS[key];

  const userEl = findField(cfg.user)
    || document.querySelector('input[type="text"]')
    || document.querySelector('input:not([type="password"]):not([type="hidden"]):not([type="submit"])');
  const passEl = findField(cfg.pass)
    || document.querySelector('input[type="password"]');

  if (!userEl && !passEl) return false;

  fillField(userEl, creds.username || creds.user || '');
  fillField(passEl, creds.password || creds.pass || '');

  if (cfg.tarjeta) {
    const code = creds.dgiiCodes
      ? cardCodeForPosition(creds.dgiiCodes, requestedCardPosition())
      : creds.tarjeta;
    if (code) fillField(findField(cfg.tarjeta), code);
  }

  if (cfg.extra && creds.cedula) {
    for (const [fieldName, credKey] of Object.entries(cfg.extra)) {
      const el = document.querySelector(`[name="${CSS.escape(fieldName)}"]`);
      fillField(el, creds[credKey] || '');
    }
  }

  // Auto-submit if configured
  if (cfg.submit) {
    const btn = findField(cfg.submit)
      || document.querySelector('input[type="submit"]')
      || document.querySelector('button[type="submit"]');
    if (btn) setTimeout(() => btn.click(), 300);
  }
  return true;
}

// Listen for fill command from popup
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'FILL_FORM' && msg.creds) {
    const ok = tryFill(msg.creds);
    if (!ok) {
      // Show a small toast if no form found
      const d = document.createElement('div');
      d.style.cssText = 'position:fixed;top:16px;right:16px;z-index:999999;background:#ef4444;color:#fff;padding:10px 16px;border-radius:8px;font-size:14px;font-family:system-ui';
      d.textContent = 'Llave Maestra: no se encontró formulario de login';
      document.body.appendChild(d);
      setTimeout(() => d.remove(), 3000);
    }
  }
});

// Auto-fill if credentials are already loaded in extension storage
chrome.storage.session.get(['pendingFill'], (data) => {
  if (data.pendingFill) {
    const key = getPortalKey();
    if (key && data.pendingFill[key]) {
      setTimeout(() => tryFill(data.pendingFill[key]), 800);
      chrome.storage.session.remove('pendingFill');
    }
  }
});
