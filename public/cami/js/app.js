const API = "";  // same origin; change to http://localhost:5000 for separate dev

const $ = id => document.getElementById(id);

let charts = {};

// ── Toast ────────────────────────────────────────────────────────────────────
function toast(msg, type = "info") {
  const el = $("toast");
  el.textContent = msg;
  el.className = "show" + (type === "error" ? " error" : "");
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = ""; }, 3500);
}

// ── Format helpers ────────────────────────────────────────────────────────────
function fmt(n) {
  if (n == null) return "—";
  return new Intl.NumberFormat("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function fmtRD(n) { return "RD$ " + fmt(n); }
function fmtPct(n) { return n.toFixed(2) + "%"; }

// ── Upload ────────────────────────────────────────────────────────────────────
const dropzone = $("upload-section");
const fileInput = $("file-input");

dropzone.addEventListener("dragover",  e => { e.preventDefault(); dropzone.classList.add("drag-over"); });
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag-over"));
dropzone.addEventListener("drop", e => {
  e.preventDefault();
  dropzone.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});
dropzone.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => { if (fileInput.files[0]) handleFile(fileInput.files[0]); });

function handleFile(file) {
  const allowed = ["csv", "xlsx", "xls"];
  const ext = file.name.split(".").pop().toLowerCase();
  if (!allowed.includes(ext)) { toast("Formato no soportado. Use CSV o Excel.", "error"); return; }
  if (file.size > 20 * 1024 * 1024) { toast("El archivo supera 20 MB.", "error"); return; }
  showLoader(true);
  $("dashboard").style.display = "none";
  uploadFile(file);
}

async function uploadFile(file) {
  const form = new FormData();
  form.append("file", file);
  try {
    const res = await fetch(API + "/api/upload", { method: "POST", body: form });
    const data = await res.json();
    showLoader(false);
    if (!res.ok || data.error) { toast(data.error || "Error procesando el archivo.", "error"); return; }
    renderDashboard(data, file.name);
  } catch (e) {
    showLoader(false);
    toast("No se pudo conectar con el servidor.", "error");
  }
}

function showLoader(on) {
  $("loader").style.display = on ? "block" : "none";
  $("upload-section").style.display = on ? "none" : "block";
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderDashboard(data, filename) {
  const { summary, charts: ch, columns, preview } = data;

  // KPIs
  $("kpi-registros").textContent = summary.total_registros.toLocaleString("es-DO");
  $("kpi-monto").textContent     = fmtRD(summary.monto_total);
  $("kpi-itbis").textContent     = fmtRD(summary.itbis_total);
  $("kpi-retenido").textContent  = fmtRD(summary.itbis_retenido);
  $("kpi-tasa").textContent      = fmtPct(summary.tasa_efectiva);

  // File info bar
  const fi = $("file-info");
  fi.style.display = "flex";
  $("fi-name").textContent = filename;

  // Charts
  destroyCharts();
  renderMonthly(ch.monthly);
  renderTipo(ch.by_tipo);
  renderServiciosBienes(ch.servicios_bienes);
  renderTopRNC(ch.top_rnc);

  // Table
  renderTable(columns, preview);

  $("dashboard").style.display = "block";
  $("dashboard").scrollIntoView({ behavior: "smooth" });
  toast(`✓ ${summary.total_registros} registros cargados`, "info");
}

// ── Charts ────────────────────────────────────────────────────────────────────
const PALETTE = ["#1a56db","#0e9f6e","#ff8800","#f05252","#7c3aed","#0891b2","#c026d3","#b45309"];

function destroyCharts() {
  Object.values(charts).forEach(c => c.destroy());
  charts = {};
}

function makeChart(id, type, labels, values, label, color) {
  const ctx = $(id);
  if (!ctx || !labels || !labels.length) { ctx && (ctx.parentElement.style.display = "none"); return; }
  ctx.parentElement.style.display = "";
  charts[id] = new Chart(ctx, {
    type,
    data: {
      labels,
      datasets: [{
        label,
        data: values,
        backgroundColor: Array.isArray(color) ? color : color,
        borderColor: type === "line" ? color : undefined,
        borderWidth: type === "line" ? 2 : 0,
        fill: type === "line",
        tension: 0.4,
        pointRadius: 4,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: type !== "bar" } },
      scales: ["bar","line"].includes(type) ? {
        y: { beginAtZero: true, ticks: { callback: v => "RD$ " + v.toLocaleString() } },
      } : undefined,
    },
  });
}

function renderMonthly(ch) {
  makeChart("chart-monthly", "line", ch.labels, ch.values, "ITBIS facturado", "#1a56db");
}

function renderTipo(ch) {
  if (!ch || !ch.labels || !ch.labels.length) return;
  charts["chart-tipo"] = new Chart($("chart-tipo"), {
    type: "doughnut",
    data: {
      labels: ch.labels,
      datasets: [{ data: ch.values, backgroundColor: PALETTE, borderWidth: 2 }],
    },
    options: { responsive: true, plugins: { legend: { position: "bottom", labels: { boxWidth: 12 } } } },
  });
}

function renderServiciosBienes(ch) {
  if (!ch || !ch.labels || !ch.labels.length || (ch.values[0] === 0 && ch.values[1] === 0)) {
    $("chart-sb").parentElement.style.display = "none"; return;
  }
  charts["chart-sb"] = new Chart($("chart-sb"), {
    type: "doughnut",
    data: {
      labels: ch.labels,
      datasets: [{ data: ch.values, backgroundColor: ["#1a56db","#0e9f6e"], borderWidth: 2 }],
    },
    options: { responsive: true, plugins: { legend: { position: "bottom", labels: { boxWidth: 12 } } } },
  });
}

function renderTopRNC(ch) {
  if (!ch || !ch.labels || !ch.labels.length) {
    $("chart-rnc").parentElement.style.display = "none"; return;
  }
  charts["chart-rnc"] = new Chart($("chart-rnc"), {
    type: "bar",
    data: {
      labels: ch.labels,
      datasets: [{ label: "Monto total", data: ch.values, backgroundColor: "#1a56db" }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { x: { ticks: { callback: v => "RD$ " + v.toLocaleString() } } },
    },
  });
}

// ── Table ─────────────────────────────────────────────────────────────────────
function renderTable(columns, rows) {
  const head = $("table-head");
  const body = $("table-body");
  head.innerHTML = "";
  body.innerHTML = "";

  const tr = document.createElement("tr");
  columns.forEach(c => {
    const th = document.createElement("th");
    th.textContent = c;
    tr.appendChild(th);
  });
  head.appendChild(tr);

  rows.forEach(row => {
    const tr = document.createElement("tr");
    columns.forEach(c => {
      const td = document.createElement("td");
      const val = row[c];
      td.textContent = val == null ? "" : val;
      td.title = val == null ? "" : String(val);
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });
}

// ── Reset ─────────────────────────────────────────────────────────────────────
$("btn-clear").addEventListener("click", () => {
  destroyCharts();
  $("dashboard").style.display = "none";
  $("file-info").style.display = "none";
  $("upload-section").style.display = "block";
  fileInput.value = "";
});
