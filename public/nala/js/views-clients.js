/* Empresas clientes y Consulta RNC. */
(function () {
  const { esc } = NALA;

  async function clientModal(client = null) {
    const c = client || { settings: {} };
    const cat = NALA.state.me.catalogs; const st = c.settings || {};
    return NALA.modal({
      title: client ? 'Editar empresa cliente' : 'Registrar empresa cliente', okText: 'Guardar', wide: true,
      body: `<div class="fields">
        <label class="f full"><span>Razón social</span><input id="c-name" value="${esc(c.legal_name || '')}" maxlength="180"></label>
        <label class="f"><span>RNC</span><div class="row" style="flex-wrap:nowrap"><input id="c-rnc" value="${esc(c.rnc || '')}" inputmode="numeric" style="flex:1"><button class="btn sm" type="button" id="c-check">Consultar DGII</button></div></label>
        <label class="f"><span>Cédula</span><input id="c-ced" value="${esc(c.cedula || '')}" inputmode="numeric"></label>
        <div class="full muted" id="c-rnc-result"></div>
        <label class="f"><span>Correo</span><input id="c-email" value="${esc(c.email || '')}"></label>
        <label class="f"><span>Teléfono</span><input id="c-phone" value="${esc(c.phone || '')}"></label>
        ${client ? `<label class="f"><span>Estado</span><select id="c-status"><option value="active" ${c.status !== 'inactive' ? 'selected' : ''}>Activa</option><option value="inactive" ${c.status === 'inactive' ? 'selected' : ''}>Inactiva</option></select></label>` : ''}
        <div class="full" style="margin-top:6px"><b>Configuración contable</b> <span class="muted">(valores sugeridos al extraer; siempre los confirma un humano)</span></div>
        <label class="f"><span>606 · Tipo de bienes y servicios</span><select id="c-tbs">${NALA.catalogOptions(cat.tipoBienesServicios, st.default_tipo_bienes_servicios)}</select></label>
        <label class="f"><span>607 · Tipo de ingreso</span><select id="c-ti">${NALA.catalogOptions(cat.tipoIngreso, st.default_tipo_ingreso)}</select></label>
        <label class="f"><span>606 · Subtotal sin desglose va a</span><select id="c-split"><option value="">Decide el auditor</option><option value="servicios" ${st.default_split === 'servicios' ? 'selected' : ''}>Servicios</option><option value="bienes" ${st.default_split === 'bienes' ? 'selected' : ''}>Bienes</option></select></label>
        <label class="f"><span>Cierre fiscal</span><select id="c-cierre"><option value="">—</option>${['03', '06', '09', '12'].map(m => `<option ${st.cierre_fiscal === m ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
        <label class="f"><span>Régimen</span><input id="c-reg" value="${esc(st.regimen || '')}" placeholder="Normal, RST…"></label>
        <label class="f"><span>Actividad</span><input id="c-act" value="${esc(st.actividad || '')}"></label>
        <label class="f full"><span>Formatos que reporta</span><div class="row">${['606', '607'].map(f => `<label><input type="checkbox" class="c-fmt" value="${f}" ${(st.formatos || ['606', '607']).includes(f) ? 'checked' : ''}> ${f}</label>`).join('')}</div></label>
        <label class="f full"><span>Notas</span><textarea id="c-notes" rows="2">${esc(st.notas || '')}</textarea></label>
      </div>`,
      onOk: async m => {
        const v = id => m.querySelector(id)?.value ?? '';
        const body = { legal_name: v('#c-name'), rnc: v('#c-rnc'), cedula: v('#c-ced'), email: v('#c-email'), phone: v('#c-phone'),
          settings: { default_tipo_bienes_servicios: v('#c-tbs') || null, default_tipo_ingreso: v('#c-ti') || null, default_split: v('#c-split') || null, cierre_fiscal: v('#c-cierre') || null,
            regimen: v('#c-reg'), actividad: v('#c-act'), notas: v('#c-notes'), formatos: [...m.querySelectorAll('.c-fmt:checked')].map(x => x.value) } };
        if (client) body.status = v('#c-status');
        const r = client ? await NALA.api('PATCH', `clients/${client.id}`, body) : await NALA.api('POST', 'clients', body);
        NALA.toast('Empresa guardada', 'ok');
        return r.client;
      },
    });
  }

  function wireRncCheck() {
    // Delegated: the modal is created asynchronously.
    document.addEventListener('click', async e => {
      if (e.target.id !== 'c-check') return;
      const out = document.getElementById('c-rnc-result');
      const val = document.getElementById('c-rnc').value || document.getElementById('c-ced').value;
      out.textContent = 'Consultando…';
      try {
        const r = await NALA.api('GET', `rnc/${encodeURIComponent(val)}`);
        out.innerHTML = rncSummary(r, true);
        out.querySelector('[data-use-name]')?.addEventListener('click', ev => { document.getElementById('c-name').value = ev.target.dataset.useName; });
      } catch (err) { out.textContent = err.message; }
    });
  }
  wireRncCheck();

  function rncSummary(r, compact = false) {
    const s = r.structure; const o = r.official;
    const structure = s.structureValid ? `<span class="badge ok">Estructura válida · ${s.kind === 'rnc' ? 'RNC (9)' : 'Cédula (11)'}</span>` : `<span class="badge crit">Estructura inválida</span> ${esc(s.message)}`;
    const digit = s.structureValid ? (s.checkDigitValid ? '<span class="badge ok">Dígito verificador correcto</span>' : '<span class="badge warn">Dígito verificador no coincide</span>') : '';
    let official = '<span class="badge">Sin consulta oficial</span>';
    if (o?.status === 'ok' && o.found) official = `<span class="badge ok">DGII: ${esc(o.data.estado || 'inscrito')}</span> <b>${esc(o.data.nombre || '')}</b>${compact ? ` <button class="btn sm" type="button" data-use-name="${esc(o.data.nombre || '')}">Usar nombre</button>` : ''}`;
    else if (o?.status === 'ok') official = `<span class="badge crit">DGII: ${esc(o.data?.message || 'No inscrito')}</span>`;
    else if (o?.status === 'unavailable') official = `<span class="badge warn">DGII no disponible</span> ${esc(o.message)}`;
    return `${structure} ${digit}<br>${official}${o?.fetched_at ? ` <span class="muted">· ${esc(o.source)} · ${NALA.dateTime(o.fetched_at)}${o.cached ? ' (caché)' : ''}</span>` : ''}`;
  }

  NALA.views.clientes = {
    title: 'Empresas clientes',
    async render(root) {
      const canManage = NALA.can('clients_manage');
      root.innerHTML = `<div class="stack"><div class="row"><label class="f" style="flex:1;min-width:220px"><span>Buscar</span><input id="cq" placeholder="Nombre, RNC o cédula"></label>
        <label class="f"><span>Estado</span><select id="cs"><option value="">Todas</option><option value="active">Activas</option><option value="inactive">Inactivas</option></select></label>
        ${canManage ? '<button class="btn primary" id="cnew">+ Registrar empresa</button>' : ''}</div><div id="ctable"></div></div>`;
      const load = async () => {
        const qs = new URLSearchParams({ q: root.querySelector('#cq').value, status: root.querySelector('#cs').value });
        const { clients } = await NALA.api('GET', `clients?${qs}`);
        const cat = NALA.state.me.catalogs;
        root.querySelector('#ctable').innerHTML = clients.length ? `<div class="table-wrap"><table><tr><th>Empresa</th><th>RNC / Cédula</th><th>Estado</th><th>Configuración contable</th><th>Origen</th><th></th></tr>
          ${clients.map(c => `<tr><td><b>${esc(c.legal_name)}</b>${c.email ? `<div class="muted">${esc(c.email)}</div>` : ''}</td><td class="mono">${esc(c.rnc || c.cedula || '—')}</td>
            <td>${c.status === 'inactive' ? '<span class="badge">Inactiva</span>' : '<span class="badge ok">Activa</span>'}</td>
            <td class="muted">${c.settings?.default_tipo_bienes_servicios ? `606: ${esc(cat.tipoBienesServicios[c.settings.default_tipo_bienes_servicios])}` : '606: —'}<br>${c.settings?.default_tipo_ingreso ? `607: ${esc(cat.tipoIngreso[c.settings.default_tipo_ingreso])}` : '607: —'}</td>
            <td>${esc(c.source)}</td><td class="num"><button class="btn sm" data-use="${c.id}">Activar</button> ${canManage ? `<button class="btn sm" data-edit="${c.id}">Editar</button>` : ''}</td></tr>`).join('')}</table></div>`
          : '<div class="card empty">No hay empresas que coincidan.</div>';
        root.querySelectorAll('[data-use]').forEach(b => b.addEventListener('click', () => { NALA.setScope({ client: b.dataset.use }); NALA.go('#/empresa'); }));
        root.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', async () => {
          const saved = await clientModal(clients.find(c => c.id === b.dataset.edit));
          if (saved) { await NALA.loadClients(); load(); }
        }));
      };
      let timer;
      root.querySelector('#cq').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 250); });
      root.querySelector('#cs').addEventListener('change', load);
      root.querySelector('#cnew')?.addEventListener('click', async () => { const saved = await clientModal(); if (saved) { await NALA.loadClients(); load(); } });
      await load();
    },
  };

  NALA.views.rnc = {
    title: 'Consulta RNC',
    async render(root, { params }) {
      root.innerHTML = `<div class="stack" style="max-width:760px">
        <div class="card"><h2>Consulta de RNC o cédula</h2>
          <p class="muted" style="margin-bottom:10px">NALA distingue tres cosas: la <b>estructura</b> (cantidad de dígitos), el <b>dígito verificador</b> (algoritmo de las herramientas DGII) y la <b>consulta oficial</b> a la DGII (Consulta RNC de dgii.gov.do). Sólo la consulta oficial indica si el contribuyente está inscrito y su estado.</p>
          <form class="row" id="rf"><label class="f" style="flex:1"><span>RNC o cédula</span><input id="rv" inputmode="numeric" placeholder="101010632" value="${esc(params.id || '')}"></label><button class="btn primary">Consultar</button></form></div>
        <div id="rres"></div></div>`;
      const run = async refresh => {
        const v = root.querySelector('#rv').value.trim(); if (!v) return;
        const out = root.querySelector('#rres'); out.innerHTML = '<div class="card empty">Consultando a la DGII…</div>';
        try {
          const r = await NALA.api('GET', `rnc/${encodeURIComponent(v)}${refresh ? '?refresh=1' : ''}`);
          const s = r.structure; const o = r.official;
          const rows = o?.status === 'ok' && o.found ? Object.entries(o.data).map(([k, val]) => `<tr><th style="position:static">${esc(k.replace(/_/g, ' '))}</th><td>${esc(val)}</td></tr>`).join('') : '';
          const known = (NALA.state.clients || []).find(c => c.rnc === s.digits || c.cedula === s.digits);
          out.innerHTML = `<div class="grid cols-2">
            <div class="card"><h2>1 · Estructura</h2>${s.structureValid ? `<span class="badge ok">Válida</span> ${s.kind === 'rnc' ? 'RNC de 9 dígitos (Tipo Id 1)' : 'Cédula de 11 dígitos (Tipo Id 2)'}` : `<span class="badge crit">Inválida</span> ${esc(s.message)}`}</div>
            <div class="card"><h2>2 · Dígito verificador</h2>${s.structureValid ? (s.checkDigitValid ? '<span class="badge ok">Correcto</span>' : '<span class="badge warn">No coincide</span> <span class="muted">Puede ser un error de digitación; confirme con la consulta oficial.</span>') : '<span class="muted">No aplica</span>'}</div></div>
            <div class="card" style="margin-top:12px"><h2>3 · Consulta oficial DGII<span class="spacer"></span>${s.structureValid ? '<button class="btn sm" id="rrefresh">Consultar de nuevo</button>' : ''}</h2>
              ${!o ? '<span class="muted">No se consulta una identificación con estructura inválida.</span>'
                : o.status === 'unavailable' ? `<div class="issue warning"><span class="ico">!</span><div>${esc(o.message)}${o.stale ? `<br>Último dato guardado (${NALA.dateTime(o.stale.fetched_at)}): ${o.stale.found ? esc(o.stale.data?.nombre) : 'no inscrito'}` : ''}<br>NALA no marca el RNC como verificado sin respuesta oficial.</div></div>`
                : o.found ? `<div class="table-wrap"><table>${rows}</table></div>` : `<div class="issue critical"><span class="ico">✕</span>${esc(o.data?.message || 'No inscrito')}</div>`}
              ${o?.fetched_at ? `<p class="muted" style="margin-top:8px">Fuente: <a href="${esc(o.source_url)}" target="_blank" rel="noopener">${esc(o.source)}</a> · ${NALA.dateTime(o.fetched_at)}${o.cached ? ' · resultado guardado (máx. 24 h)' : ''}</p>` : ''}
              ${o?.found && !known && NALA.can('clients_manage') ? `<button class="btn primary" id="radd" style="margin-top:8px">Registrar como empresa cliente</button>` : ''}
              ${known ? `<p style="margin-top:8px">Ya registrada como <b>${esc(known.legal_name)}</b>.</p>` : ''}
            </div>`;
          out.querySelector('#rrefresh')?.addEventListener('click', () => run(true));
          out.querySelector('#radd')?.addEventListener('click', async () => {
            await NALA.api('POST', 'clients', { legal_name: o.data.nombre, [s.kind === 'rnc' ? 'rnc' : 'cedula']: s.digits });
            await NALA.loadClients(); NALA.toast('Empresa registrada', 'ok'); run(false);
          });
        } catch (e) { out.innerHTML = `<div class="card empty">⚠️ ${esc(e.message)}</div>`; }
      };
      root.querySelector('#rf').addEventListener('submit', e => { e.preventDefault(); run(false); });
      if (params.id) run(false);
    },
  };
})();
