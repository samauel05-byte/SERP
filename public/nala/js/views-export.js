/* Exportar DGII 606/607: vista previa → aceptar advertencias → generar
   (instantánea única para pantalla, TXT y Excel) → descargar → registrar
   envío y resultado de la DGII. Generado, enviado y aceptado son estados
   distintos: NALA nunca marca una exportación como aceptada por sí sola. */
(function () {
  const { esc, money, int, period } = NALA;
  const EXTRA_COLUMNS = [['x_line', 'Línea'], ['x_counterpart', 'Proveedor / Cliente'], ['x_currency', 'Moneda original'], ['x_invoice', 'ID factura NALA'], ['x_batch', 'Lote'], ['x_warnings', 'Advertencias aceptadas']];

  function linesTable(snapshot, { limit = 1000 } = {}) {
    const cols = snapshot.columns;
    const amountIdx = cols.map((c, i) => (c.type === 'amount' ? i : -1)).filter(i => i >= 0);
    return `<div class="table-wrap" style="max-height:60vh"><table><tr><th>#</th>${cols.map(c => `<th class="${c.type === 'amount' ? 'num' : ''}">${esc(c.label)}</th>`).join('')}<th></th></tr>
      ${snapshot.lines.slice(0, limit).map(l => `<tr><td class="muted">${l.line_no}</td>${l.values.map((v, i) => `<td class="${cols[i].type === 'amount' ? 'num' : 'mono'}">${cols[i].type === 'amount' && v ? money(v) : esc(v)}</td>`).join('')}
        <td><a class="btn sm" href="#/auditoria/${l.invoice_id}">Abrir</a></td></tr>`).join('')}
      <tr><th>Total</th>${cols.map((c, i) => `<th class="num">${amountIdx.includes(i) ? money(snapshot.totals[c.key]) : ''}</th>`).join('')}<th></th></tr></table></div>
      ${snapshot.lines.length > limit ? `<p class="muted">Mostrando ${limit} de ${snapshot.lines.length} líneas; el TXT y el Excel incluyen todas.</p>` : ''}`;
  }

  async function newExport(root, params) {
    const s = NALA.state;
    const clientId = params.client || s.client;
    const fmt = params.format || s.format || '606';
    const per = params.period || s.period;
    const batches = clientId ? (await NALA.api('GET', `batches?client_id=${clientId}&period=${per}&format=${fmt}`)).batches : [];
    const chosen = (params.batches || '').split(',').filter(Boolean);
    root.innerHTML = `<div class="stack"><div class="card"><h2>Nueva exportación</h2>
      <div class="row"><label class="f" style="min-width:280px"><span>Empresa</span><select id="e-client">${NALA.clientOptions(clientId, { includeAll: !clientId, allLabel: '— Elegir empresa —' })}</select></label>
        <label class="f"><span>Formato</span><select id="e-format"><option value="606" ${fmt === '606' ? 'selected' : ''}>606 · Compras</option><option value="607" ${fmt === '607' ? 'selected' : ''}>607 · Ventas</option></select></label>
        <label class="f"><span>Período</span><input type="month" id="e-period" value="${per.slice(0, 4)}-${per.slice(4)}"></label>
        <label class="f"><span>Alcance</span><select id="e-scope"><option value="period" ${!chosen.length ? 'selected' : ''}>Consolidar el mes</option><option value="batches" ${chosen.length ? 'selected' : ''}>Lotes seleccionados</option></select></label>
        <button class="btn primary" id="e-preview">Previsualizar</button></div>
      <div id="e-batches" style="margin-top:8px;${chosen.length ? '' : 'display:none'}">${batches.length ? batches.map(b => `<label style="margin-right:14px"><input type="checkbox" class="e-b" value="${b.id}" ${chosen.includes(b.id) ? 'checked' : ''}> ${esc(b.name)} <span class="muted">(${int(b.summary?.approved)} aprobados)</span></label>`).join('') : '<span class="muted">No hay lotes de esta empresa, formato y período.</span>'}</div></div>
      <div id="e-result"></div></div>`;
    const read = () => ({ client_id: root.querySelector('#e-client').value, format: root.querySelector('#e-format').value, period: root.querySelector('#e-period').value.replace('-', ''),
      batch_ids: root.querySelector('#e-scope').value === 'batches' ? [...root.querySelectorAll('.e-b:checked')].map(x => x.value) : undefined });
    const reload = () => { const r = read(); NALA.go(`#/exportar?nueva=1&${new URLSearchParams({ client: r.client_id, format: r.format, period: r.period })}`); };
    ['#e-client', '#e-format', '#e-period'].forEach(sel => root.querySelector(sel).addEventListener('change', reload));
    root.querySelector('#e-scope').addEventListener('change', e => { root.querySelector('#e-batches').style.display = e.target.value === 'batches' ? '' : 'none'; });
    root.querySelector('#e-preview').addEventListener('click', async () => {
      const body = read();
      if (!body.client_id) return NALA.toast('Elija la empresa.', 'err');
      if (body.batch_ids && !body.batch_ids.length) return NALA.toast('Seleccione al menos un lote.', 'err');
      const out = root.querySelector('#e-result'); out.innerHTML = '<div class="card empty">Calculando instantánea…</div>';
      try { renderPreview(out, body, await NALA.api('POST', 'exports/preview', body)); } catch (e) { out.innerHTML = `<div class="card empty">⚠️ ${esc(e.message)}</div>`; }
    });
    if (params.auto && clientId) root.querySelector('#e-preview').click();
  }

  function renderPreview(out, body, preview) {
    const snap = preview.snapshot;
    out.innerHTML = `<div class="stack">
      <div class="card"><h2>Vista previa · ${esc(snap.file_name)}<span class="spacer"></span><span class="muted">Esquema ${esc(snap.schema_version)} · reglas ${esc(snap.rules_version)}</span></h2>
        <div class="mono" style="margin-bottom:10px">Encabezado: <b>${esc(`${snap.format}|${snap.header.rnc}|${snap.header.period}|${snap.header.count}`)}</b></div>
        <div class="grid kpis"><div class="kpi"><div class="label">Líneas</div><div class="value">${int(snap.lines.length)}</div></div>
          <div class="kpi"><div class="label">Excluidas</div><div class="value">${int(snap.excluded.length)}</div></div>
          ${Object.entries(snap.totals).filter(([k]) => ['total_monto_facturado', 'monto_facturado', 'itbis', 'itbis_retenido', 'isr_retenido'].includes(k)).map(([k, v]) => `<div class="kpi"><div class="label">${esc(snap.columns.find(c => c.key === k)?.label || k)}</div><div class="value" style="font-size:16px">${money(v)}</div></div>`).join('')}</div></div>
      ${snap.errors.length ? `<div class="card"><h2>Errores críticos (bloquean la exportación)</h2><div class="stack" style="gap:6px">${snap.errors.map(e => `<div class="issue critical"><span class="ico">✕</span>${esc(e.message)}${e.invoice_id ? ` <a class="btn sm" href="#/auditoria/${e.invoice_id}">Abrir</a>` : ''}</div>`).join('')}</div></div>` : ''}
      ${snap.warnings.length ? `<div class="card"><h2>Advertencias (deben aceptarse una por una)</h2><div class="stack" style="gap:6px">${snap.warnings.map(w => `<label class="issue warning"><input type="checkbox" class="acc" value="${esc(w.code)}"> <span>${esc(w.message)}${w.lines?.length ? ` <span class="muted">· líneas ${w.lines.slice(0, 12).join(', ')}${w.lines.length > 12 ? '…' : ''}</span>` : ''}</span></label>`).join('')}
        <label class="f"><span>Motivo para exportar con advertencias</span><textarea id="acc-reason" rows="2"></textarea></label></div></div>` : ''}
      ${snap.consumer_summary ? `<div class="card"><h2>Resumen de Facturas de Consumo (para el módulo de la Oficina Virtual)</h2><p>${int(snap.consumer_summary.count)} NCF · Monto facturado RD$ ${money(snap.consumer_summary.monto_facturado)} · ITBIS RD$ ${money(snap.consumer_summary.itbis)}. <span class="muted">Las facturas de consumo menores de RD$250,000 no van en el TXT.</span></p></div>` : ''}
      ${snap.excluded.length ? `<details class="card"><summary><b>Comprobantes no incluidos (${snap.excluded.length})</b></summary><div class="stack" style="gap:4px;margin-top:8px">${snap.excluded.map(x => `<div><a href="#/auditoria/${x.invoice_id}">${x.invoice_id.slice(0, 8)}</a> — ${esc(x.reason)}</div>`).join('')}</div></details>` : ''}
      ${preview.txt_check ? `<div class="card"><h2>Estructura del TXT ${preview.txt_check.valid ? '<span class="badge ok">Válida</span>' : '<span class="badge crit">Con problemas</span>'}</h2>
        <pre class="mono" style="white-space:pre-wrap;background:var(--surface-2);padding:8px;border-radius:8px">${esc(preview.txt_preview || '')}${snap.lines.length > 5 ? '\n…' : ''}</pre>${preview.txt_check.problems.map(p => `<div class="issue critical">${esc(p)}</div>`).join('')}
        <p class="muted">Delimitador "|", fechas AAAAMMDD, montos con punto y 2 decimales, códigos según la herramienta oficial, líneas CRLF, codificación ASCII.</p></div>` : ''}
      <div class="card"><h2>Líneas (mismo orden que el TXT y el Excel)</h2>${snap.lines.length ? linesTable(snap) : '<div class="empty">Sin líneas.</div>'}</div>
      <div class="row"><button class="btn primary" id="gen" ${snap.errors.length || !NALA.can('export') ? 'disabled' : ''}>Generar TXT y Excel</button>
        ${!NALA.can('export') ? '<span class="muted">Su rol no permite generar exportaciones.</span>' : ''}</div></div>`;
    out.querySelector('#gen')?.addEventListener('click', async () => {
      const accepted = [...out.querySelectorAll('.acc:checked')].map(x => x.value);
      if (accepted.length !== snap.warnings.length) return NALA.toast('Acepte cada advertencia antes de exportar.', 'err');
      const reason = out.querySelector('#acc-reason')?.value.trim() || '';
      if (snap.warnings.length && reason.length < 5) return NALA.toast('Indique el motivo (mín. 5 caracteres).', 'err');
      try {
        const r = await NALA.api('POST', 'exports', { ...body, accepted_warnings: accepted, reason, preview_fingerprint: preview.fingerprint });
        NALA.toast('Exportación generada', 'ok'); NALA.go(`#/exportar/${r.export.id}`);
      } catch (e) {
        if (e.status === 409) { NALA.toast(e.message, 'err'); out.innerHTML = ''; } else NALA.fail(e);
      }
    });
  }

  async function download(exp, type, columns) {
    const qs = new URLSearchParams({ type, ...(columns ? { columns: columns.join(',') } : {}) });
    const r = await NALA.api('GET', `exports/${exp.id}/download?${qs}`);
    if (r.base64) {
      const bin = Uint8Array.from(atob(r.base64), c => c.charCodeAt(0));
      NALA.downloadBlob(new Blob([bin], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), r.file_name);
    } else {
      const blob = await (await fetch(r.url)).blob();
      NALA.downloadBlob(blob, r.file_name);
    }
  }

  async function customExcel(exp) {
    const settings = (await NALA.api('GET', 'settings')).settings;
    const templates = (settings.excel_templates || []).filter(t => t.format === exp.format);
    const all = [...EXTRA_COLUMNS, ...exp.snapshot.columns.map(c => [c.key, c.label])];
    const cols = await NALA.modal({ title: 'Excel personalizado', okText: 'Descargar', wide: true,
      body: `${templates.length ? `<label class="f" style="margin-bottom:8px"><span>Plantilla guardada</span><select id="tpl"><option value="">—</option>${templates.map((t, i) => `<option value="${i}">${esc(t.name)}</option>`).join('')}</select></label>` : ''}
        <p class="muted" style="margin-bottom:8px">La plantilla oficial queda protegida; aquí elige columnas para su propio análisis. Los datos provienen de la misma instantánea.</p>
        <div class="grid cols-2">${all.map(([k, l]) => `<label><input type="checkbox" class="col" value="${k}" checked> ${esc(l)}</label>`).join('')}</div>`,
      onOk: m => { const v = [...m.querySelectorAll('.col:checked')].map(x => x.value); if (!v.length) throw new Error('Elija al menos una columna.'); return v; } });
    if (cols) await download(exp, 'custom', cols);
  }
  document.addEventListener('change', e => {
    if (e.target.id !== 'tpl') return;
    const i = e.target.value; if (i === '') return;
    NALA.api('GET', 'settings').then(({ settings }) => {
      const fmtTemplates = (settings.excel_templates || []).filter(t => t.format === document.querySelector('[data-export-format]')?.dataset.exportFormat);
      const t = fmtTemplates[Number(i)]; if (!t) return;
      document.querySelectorAll('.modal .col').forEach(c => { c.checked = t.columns.includes(c.value); });
    });
  });

  async function detail(root, id) {
    const { export: exp } = await NALA.api('GET', `exports/${id}`);
    const steps = [['generated', 'Archivo generado', exp.created_at], ['submitted', 'Enviado a la DGII (Oficina Virtual)', exp.submitted_at], [exp.status === 'rejected' ? 'rejected' : 'accepted', exp.status === 'rejected' ? 'Rechazado por la DGII' : 'Aceptado por la DGII', exp.result_at]];
    const canSubmit = NALA.can('submit');
    root.innerHTML = `<div class="stack" data-export-format="${exp.format}">
      <div class="card"><h2>${esc(exp.file_name)} ${NALA.badge(exp.status)}<span class="spacer"></span><button class="btn" data-href="#/exportar">← Exportaciones</button></h2>
        <div class="muted">${esc(NALA.clientName(exp.client_id))} · ${exp.format} · ${period(exp.period)} · ${exp.scope === 'period' ? 'consolidado del mes' : `${exp.batch_ids.length} lote(s)`} · ${int(exp.line_count)} líneas · SHA-256 TXT <span class="mono">${esc(exp.txt_sha256.slice(0, 16))}…</span></div>
        <div class="row" style="margin-top:12px;gap:18px">${steps.map(([k, label, at]) => `<div><span class="badge ${at ? (k === 'rejected' ? 'crit' : 'ok') : ''}">${at ? '✓' : '○'} ${esc(label)}</span><div class="muted">${at ? NALA.dateTime(at) : 'pendiente'}</div></div>`).join('<span class="muted">→</span>')}</div>
        ${exp.submission_reference ? `<p style="margin-top:8px">Referencia OFV: <b class="mono">${esc(exp.submission_reference)}</b></p>` : ''}${exp.result_notes ? `<p>Resultado: ${esc(exp.result_notes)}</p>` : ''}
        ${exp.status === 'superseded' ? `<div class="issue warning" style="margin-top:8px"><span class="ico">!</span>Reemplazada: ${esc(exp.superseded_reason || '')}</div>` : ''}
        ${exp.accepted_warnings?.length ? `<p class="muted" style="margin-top:8px">Advertencias aceptadas: ${exp.accepted_warnings.map(esc).join(', ')} · motivo: ${esc(exp.acceptance_reason || '')}</p>` : ''}
        <div class="row" style="margin-top:12px"><button class="btn primary" id="d-txt">Descargar TXT</button><button class="btn" id="d-xlsx">Excel (plantilla oficial)</button><button class="btn" id="d-custom">Excel personalizado</button>
          ${canSubmit && exp.status === 'generated' ? '<button class="btn" id="s-sub">Registrar envío a DGII</button>' : ''}
          ${canSubmit && exp.status === 'submitted' ? '<button class="btn ok" id="s-acc">Registrar aceptación</button><button class="btn danger" id="s-rej">Registrar rechazo</button>' : ''}
          ${canSubmit && ['generated', 'rejected'].includes(exp.status) ? '<button class="btn" id="s-sup">Marcar como reemplazada</button>' : ''}</div>
        <p class="muted" style="margin-top:8px">NALA genera el archivo; el envío se hace en la Oficina Virtual de la DGII y su resultado se consulta en "Consulta Envíos". Registre aquí cada paso.</p></div>
      ${exp.snapshot.consumer_summary ? `<div class="card"><h2>Resumen de Facturas de Consumo</h2>${int(exp.snapshot.consumer_summary.count)} NCF · RD$ ${money(exp.snapshot.consumer_summary.monto_facturado)} · ITBIS RD$ ${money(exp.snapshot.consumer_summary.itbis)}</div>` : ''}
      <div class="card"><h2>Líneas exportadas</h2>${linesTable(exp.snapshot)}</div></div>`;
    root.querySelectorAll('[data-href]').forEach(el => el.addEventListener('click', () => NALA.go(el.dataset.href)));
    const guard = fn => async () => { try { await fn(); } catch (e) { NALA.fail(e); } };
    root.querySelector('#d-txt').addEventListener('click', guard(() => download(exp, 'txt')));
    root.querySelector('#d-xlsx').addEventListener('click', guard(() => download(exp, 'xlsx')));
    root.querySelector('#d-custom').addEventListener('click', guard(() => customExcel(exp)));
    const setStatus = async (status, body) => { await NALA.api('POST', `exports/${exp.id}/status`, { status, ...body }); NALA.toast('Estado actualizado', 'ok'); NALA.route(); };
    root.querySelector('#s-sub')?.addEventListener('click', guard(async () => {
      const r = await NALA.modal({ title: 'Registrar envío a la DGII', okText: 'Registrar',
        body: '<div class="fields"><label class="f"><span>Fecha de envío</span><input type="date" id="sd"></label><label class="f"><span>Referencia / número de recepción</span><input id="sr"></label></div>',
        onOk: m => ({ submitted_at: m.querySelector('#sd').value || null, reference: m.querySelector('#sr').value }) });
      if (r) await setStatus('submitted', r);
    }));
    root.querySelector('#s-acc')?.addEventListener('click', guard(async () => { const notes = await NALA.askReason('Registrar aceptación de la DGII', { label: 'Detalle (ej. "Completado" en Consulta Envíos)', min: 0, okText: 'Registrar' }); if (notes !== null) await setStatus('accepted', { notes }); }));
    root.querySelector('#s-rej')?.addEventListener('click', guard(async () => { const notes = await NALA.askReason('Registrar rechazo de la DGII', { label: 'Errores informados por la DGII', okText: 'Registrar' }); if (notes) await setStatus('rejected', { notes }); }));
    root.querySelector('#s-sup')?.addEventListener('click', guard(async () => { const notes = await NALA.askReason('Marcar como reemplazada', { okText: 'Marcar' }); if (notes) await setStatus('superseded', { notes }); }));
  }

  async function list(root) {
    const s = NALA.state;
    const qs = new URLSearchParams(Object.entries({ client_id: s.client, period: s.period, format: s.format }).filter(([, v]) => v));
    const { exports } = await NALA.api('GET', `exports?${qs}`);
    root.innerHTML = `<div class="stack"><div class="row"><button class="btn primary" id="new">+ Nueva exportación</button><span class="muted">${s.client ? esc(NALA.clientName(s.client)) : 'Todas las empresas'} · ${period(s.period)}</span></div>
      ${exports.length ? `<div class="table-wrap"><table><tr><th>Archivo</th><th>Empresa</th><th>Alcance</th><th>Estado</th><th class="num">Líneas</th><th>Generado</th><th>Enviado</th></tr>
        ${exports.map(e => `<tr class="clickable" data-id="${e.id}"><td class="mono">${esc(e.file_name)}</td><td>${esc(NALA.clientName(e.client_id))}</td><td>${e.scope === 'period' ? 'Mes' : `${e.batch_ids.length} lote(s)`}</td><td>${NALA.badge(e.status)}</td><td class="num">${int(e.line_count)}</td><td>${NALA.dateTime(e.created_at)}</td><td>${NALA.dateTime(e.submitted_at)}</td></tr>`).join('')}</table></div>`
        : '<div class="card empty">No hay exportaciones en este alcance.</div>'}</div>`;
    root.querySelector('#new').addEventListener('click', () => NALA.go('#/exportar?nueva=1'));
    root.querySelectorAll('tr[data-id]').forEach(tr => tr.addEventListener('click', () => NALA.go(`#/exportar/${tr.dataset.id}`)));
  }

  NALA.views.exportar = {
    title: 'Exportar DGII 606/607',
    render(root, { id, params }) { if (id) return detail(root, id); return params.nueva ? newExport(root, params) : list(root); },
  };
})();
