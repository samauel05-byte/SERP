/* Guía central de empresas — autocompletado nombre ↔ RNC en todo el sistema.
 *
 * Fuente única: /api/clients (la lista de clientes de la firma, aislada por
 * tenant). Cualquier módulo (Estimación, IR-2, CAMI…) incluye este archivo y
 * conecta su par de campos «nombre» + «RNC» con SERP_EMPRESAS.attach(...).
 *
 * - Al elegir/escribir el nombre de una empresa conocida → rellena el RNC.
 * - Al escribir un RNC conocido → rellena el nombre (si está vacío).
 * - Normaliza: quita el prefijo «GENERALES » (artefacto de importación) y
 *   deduplica por nombre, tomando el RNC de la fila que lo tenga.
 *
 * Usa el token de sesión de sessionStorage (mismo origen) y respeta la sesión
 * única por equipo (X-Direct-Session). No maneja credenciales ni texto cifrado.
 */
(function () {
  const API = '/api/clients';
  const tok = () => { try { return sessionStorage.getItem('dtoken') || ''; } catch (e) { return ''; } };
  const sess = () => { try { return localStorage.getItem('direct_session_id') || ''; } catch (e) { return ''; } };
  const onlyDigits = s => String(s || '').replace(/\D/g, '');
  const cleanName = s => String(s || '').replace(/^GENERALES\s+/i, '').trim();
  const escAttr = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let _cache = null, _loading = null;

  // Une filas crudas en una lista limpia y única: {nombre, rnc, cedula}.
  function normalize(rows) {
    const map = new Map();
    (rows || []).forEach(r => {
      const nombre = cleanName(r.legal_name || r.nombre || r.razon_social || '');
      if (!nombre) return;
      const key = nombre.toLocaleLowerCase('es');
      const rnc = onlyDigits(r.rnc || '');
      const cedula = onlyDigits(r.cedula || '');
      const cur = map.get(key);
      if (!cur) map.set(key, { nombre, rnc, cedula });
      else { if (!cur.rnc && rnc) cur.rnc = rnc; if (!cur.cedula && cedula) cur.cedula = cedula; }
    });
    return [...map.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }

  function load(force) {
    if (_cache && !force) return Promise.resolve(_cache);
    if (_loading) return _loading;
    const t = tok();
    if (!t) return Promise.resolve(_cache || []);
    const h = { Authorization: 'Bearer ' + t };
    const s = sess(); if (s) h['X-Direct-Session'] = s;
    _loading = fetch(API, { headers: h })
      .then(r => r.ok ? r.json() : { clients: [] })
      .then(j => { _cache = normalize(j.clients || []); _loading = null; return _cache; })
      .catch(() => { _loading = null; return _cache || []; });
    return _loading;
  }

  function ensureDatalist() {
    let dl = document.getElementById('serp-empresas-dl');
    if (!dl) { dl = document.createElement('datalist'); dl.id = 'serp-empresas-dl'; (document.body || document.documentElement).appendChild(dl); }
    return dl;
  }
  function fillDatalist(list) {
    ensureDatalist().innerHTML = list.map(e => '<option value="' + escAttr(e.nombre) + '">' + (e.rnc ? 'RNC ' + escAttr(e.rnc) : '') + '</option>').join('');
  }

  // Conecta un par de campos (nombre, rnc). Acepta ids o elementos; cualquiera
  // de los dos puede ser nulo. opts.onPick(empresa) se llama al emparejar.
  function attach(nameSel, rncSel, opts) {
    opts = opts || {};
    const nameEl = typeof nameSel === 'string' ? document.getElementById(nameSel) : nameSel;
    const rncEl = typeof rncSel === 'string' ? document.getElementById(rncSel) : rncSel;
    if (!nameEl && !rncEl) return;
    const fire = el => { try { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {} };
    return load().then(list => {
      fillDatalist(list);
      const byName = new Map(list.map(e => [e.nombre.toLocaleLowerCase('es'), e]));
      const byRnc = new Map(list.filter(e => e.rnc).map(e => [e.rnc, e]));
      if (nameEl) {
        if (!nameEl.getAttribute('list')) nameEl.setAttribute('list', 'serp-empresas-dl');
        nameEl.addEventListener('input', () => {
          const e = byName.get(nameEl.value.trim().toLocaleLowerCase('es'));
          if (!e) return;
          if (rncEl && e.rnc && onlyDigits(rncEl.value) !== e.rnc) { rncEl.value = e.rnc; fire(rncEl); }
          if (opts.onPick) try { opts.onPick(e); } catch (x) {}
        });
      }
      if (rncEl) {
        rncEl.addEventListener('input', () => {
          const e = byRnc.get(onlyDigits(rncEl.value));
          if (!e) return;
          if (nameEl && !nameEl.value.trim()) { nameEl.value = e.nombre; fire(nameEl); }
          if (opts.onPick) try { opts.onPick(e); } catch (x) {}
        });
      }
      return list;
    });
  }

  window.SERP_EMPRESAS = { load, attach, normalize, cleanName, refresh: () => load(true) };
})();
