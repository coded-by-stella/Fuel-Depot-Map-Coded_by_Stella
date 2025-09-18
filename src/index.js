/* Fuel Depot Map — clean build by coded_by_stella */

const LITER_PER_BARREL = 200;

const STORE = {
  SITES: "ff_sites_clean_sites",
  HISTORY: "ff_sites_clean_history",
};

/* App state */
const state = {
  sites: [],
  history: [],
  selected: null,
  map: null,
  markers: {},
  preview: null,
};

/* DOM helpers */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const fmt = (n) => new Intl.NumberFormat().format(n);
const uuid = () => Math.random().toString(36).slice(2, 10);

/* Toast */
function toast(msg, ms = 1800) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

/* Escape HTML */
function escapeHtml(s) {
  return (
    s?.replace(
      /[&<>"']/g,
      (m) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[m])
    ) || ""
  );
}

/* Storage */
function load() {
  try {
    state.sites = JSON.parse(localStorage.getItem(STORE.SITES) || "[]");
  } catch {
    state.sites = [];
  }
  try {
    state.history = JSON.parse(localStorage.getItem(STORE.HISTORY) || "[]");
  } catch {
    state.history = [];
  }
}
function save() {
  localStorage.setItem(STORE.SITES, JSON.stringify(state.sites));
  localStorage.setItem(STORE.HISTORY, JSON.stringify(state.history));
}

/* Map + layers */
function initMap() {
  const map = L.map("map", { zoomControl: true });
  state.map = map;

  const osm = L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 19,
    }
  ).addTo(map);

  const satellite = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { attribution: "Tiles &copy; Esri", maxZoom: 19 }
  );

  const terrain = L.tileLayer(
    "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    {
      attribution: "&copy; OpenTopoMap, OSM, SRTM",
      maxZoom: 17,
    }
  );

  L.control
    .layers(
      { Street: osm, Satellite: satellite, Terrain: terrain },
      {},
      { position: "topleft" }
    )
    .addTo(map);

  map.setView([59.2, 9.6], 6);

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        map.setView([latitude, longitude], 12);
        L.circleMarker([latitude, longitude], {
          radius: 6,
          color: "#00b3ff",
          fillColor: "#00b3ff",
          fillOpacity: 0.6,
        })
          .addTo(map)
          .bindTooltip("You are here");
      },
      () => {},
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  }

  map.on("click", (ev) => {
    const { lat, lng } = ev.latlng;
    setSelectedCoords(lat, lng);
    const near = findNearestSite(lat, lng, 30);
    const input = $("#siteName");
    if (input) input.value = near ? near.name || "" : "";
  });

  map.on("popupopen", bindPopupEvents);

  state.sites.forEach(upsertMarker);
  applyDeepLink();
}

/* Geo helpers */
const toRad = (d) => (d * Math.PI) / 180;
function distanceM(aLat, aLng, bLat, bLng) {
  const R = 6371000;
  const dLat = toRad(bLat - aLat),
    dLng = toRad(bLng - aLng);
  const aa =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(aa));
}
function findNearestSite(lat, lng, thresholdM = 25) {
  let best = null,
    bestD = Infinity;
  for (const s of state.sites) {
    const d = distanceM(lat, lng, s.lat, s.lng);
    if (d < thresholdM && d < bestD) {
      best = s;
      bestD = d;
    }
  }
  return best;
}
const getSiteById = (id) => state.sites.find((s) => s.id === id) || null;

/* Parse "lat,lng" or "lat lng" */
function parseCoords(text) {
  if (!text) return null;
  const s = text.trim().replace(/[\s,]+/g, ",");
  const [a, b] = s.split(",");
  if (!a || !b) return null;
  const lat = parseFloat(a);
  const lng = parseFloat(b);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/* Marker + popup */
function barrelDivIcon(count = 0) {
  const html = `
    <div class="barrel-icon-wrap">
      <div class="barrel-emoji">🛢️</div>
      <div class="marker-label">${count}</div>
    </div>`;
  return L.divIcon({
    html,
    className: "barrel-icon",
    iconSize: [28, 32],
    iconAnchor: [14, 28],
  });
}
function sitePopupHtml(site) {
  const liters = site.barrels * LITER_PER_BARREL;
  const name = site.name
    ? `<div><strong>${escapeHtml(site.name)}</strong></div>`
    : "";
  return `
    ${name}
    <div>Barrels: <strong>${fmt(site.barrels)}</strong></div>
    <div>Liters: <strong>${fmt(liters)}</strong></div>
    <div class="popup-coords">${site.lat.toFixed(6)}, ${site.lng.toFixed(
    6
  )}</div>
    <div class="popup-actions" data-site="${site.id}">
      <div class="row"><input type="number" min="1" step="1" value="1" class="pop-qty" /></div>
      <div class="row">
        <button class="secondary pop-deposit">Deposit</button>
        <button class="secondary pop-withdraw">Withdraw</button>
        <button class="ghost pop-share">Share</button>
        <button class="danger pop-delete">Delete</button>
      </div>
    </div>`;
}
function upsertMarker(site) {
  const existing = state.markers[site.id];
  if (existing) {
    existing.setIcon(barrelDivIcon(site.barrels));
    existing.setLatLng([site.lat, site.lng]);
    existing.bindPopup(sitePopupHtml(site));
    return existing;
  }
  const m = L.marker([site.lat, site.lng], {
    icon: barrelDivIcon(site.barrels),
  });
  m.addTo(state.map);
  m.bindPopup(sitePopupHtml(site));
  m.on("click", () => {
    setSelectedCoords(site.lat, site.lng);
    const input = $("#siteName");
    if (input) input.value = site.name || "";
  });
  state.markers[site.id] = m;
  return m;
}

/* Popup actions */
function bindPopupEvents(e) {
  const el = e.popup.getElement();
  if (!el) return;
  const actions = el.querySelector(".popup-actions");
  if (!actions) return;

  const siteId = actions.getAttribute("data-site");
  const site = getSiteById(siteId);
  if (!site) return;

  const qtyEl = actions.querySelector(".pop-qty");
  actions.querySelector(".pop-deposit")?.addEventListener("click", () => {
    const q = Math.max(1, parseInt(qtyEl.value, 10) || 1);
    fastOp(site, "deposit", q);
  });
  actions.querySelector(".pop-withdraw")?.addEventListener("click", () => {
    const q = Math.max(1, parseInt(qtyEl.value, 10) || 1);
    fastOp(site, "withdraw", q);
  });
  actions
    .querySelector(".pop-delete")
    ?.addEventListener("click", () => deleteSite(site.id));
  actions
    .querySelector(".pop-share")
    ?.addEventListener("click", () => copyShareLink(site));
}
function fastOp(site, action, qty) {
  const operator = $("#operator")?.value?.trim() || "crew";
  const name = site.name || "";
  applyOperation({ action, operator, qty, name, lat: site.lat, lng: site.lng });
  state.map?.closePopup();
}

/* Renderers */
function renderTotals() {
  const totalBarrels = state.sites.reduce((a, s) => a + s.barrels, 0);
  const totalLiters = totalBarrels * LITER_PER_BARREL;
  $("#totalBarrels").textContent = fmt(totalBarrels);
  $("#totalLiters").textContent = fmt(totalLiters);
}
function renderHistory() {
  const wrap = $("#historyList");
  if (!wrap) return;
  wrap.innerHTML = "";
  if (state.history.length === 0) {
    wrap.classList.add("empty");
    wrap.innerHTML = `<p class="muted">No operations yet.</p>`;
    return;
  }
  wrap.classList.remove("empty");
  for (const op of [...state.history].sort((a, b) => b.ts - a.ts)) {
    const el = document.createElement("div");
    const liters = op.qty * LITER_PER_BARREL;
    el.className = "log";
    el.innerHTML = `
      <div><span class="strong">${op.action.toUpperCase()}</span> ${fmt(
      op.qty
    )} barrel(s) • ${fmt(liters)} L</div>
      <div class="meta">${new Date(op.ts).toLocaleString()} • ${escapeHtml(
      op.operator
    )}${op.siteName ? ` • ${escapeHtml(op.siteName)}` : ""}</div>
      <div class="meta">${op.lat.toFixed(6)}, ${op.lng.toFixed(6)}</div>`;
    wrap.appendChild(el);
  }
}
function renderSitesList(filter = "") {
  const list = $("#sitesList");
  if (!list) return;
  list.innerHTML = "";

  const sites = state.sites
    .slice()
    .sort(
      (a, b) =>
        b.barrels - a.barrels || (a.name || "").localeCompare(b.name || "")
    )
    .filter(
      (s) =>
        !filter || (s.name || "").toLowerCase().includes(filter.toLowerCase())
    );

  if (sites.length === 0) {
    list.innerHTML = `<p class="muted">No sites.</p>`;
    return;
  }

  for (const s of sites) {
    const low = s.barrels === 0;
    const el = document.createElement("div");
    el.className = "site-item";
    el.innerHTML = `
      <div class="site-main">
        <div class="site-name">
          <input class="site-name-input" value="${escapeHtml(
            s.name || ""
          )}" placeholder="Site name" />
          ${low ? `<span class="badge-low">empty</span>` : ``}
        </div>
        <div class="site-meta">${s.lat.toFixed(6)}, ${s.lng.toFixed(6)} • ${fmt(
      s.barrels
    )} barrel(s)</div>
        <div class="site-actions">
          <button class="mini secondary site-center">Center</button>
          <input class="mini site-qty" type="number" min="1" step="1" value="1" />
          <button class="mini secondary site-dep">Deposit</button>
          <button class="mini secondary site-wdr">Withdraw</button>
          <button class="mini ghost site-share">Share</button>
          <button class="mini danger site-del">Delete</button>
        </div>
      </div>
      <div></div>`;
    list.appendChild(el);

    const nameInput = el.querySelector(".site-name-input");
    nameInput.addEventListener("change", () => {
      s.name = nameInput.value.trim();
      save();
      state.markers[s.id]?.bindPopup(sitePopupHtml(s));
      renderHistory();
    });

    el.querySelector(".site-center").addEventListener("click", () => {
      state.map?.setView([s.lat, s.lng], 14);
      state.markers[s.id]?.openPopup();
    });

    const qtyEl = el.querySelector(".site-qty");
    el.querySelector(".site-dep").addEventListener("click", () => {
      const q = Math.max(1, parseInt(qtyEl.value, 10) || 1);
      fastOp(s, "deposit", q);
      renderSitesList(filter);
    });
    el.querySelector(".site-wdr").addEventListener("click", () => {
      const q = Math.max(1, parseInt(qtyEl.value, 10) || 1);
      fastOp(s, "withdraw", q);
      renderSitesList(filter);
    });
    el.querySelector(".site-share").addEventListener("click", () =>
      copyShareLink(s)
    );
    el.querySelector(".site-del").addEventListener("click", () => {
      deleteSite(s.id);
      renderSitesList(filter);
    });
  }
}
function renderAll() {
  state.sites.forEach(upsertMarker);
  renderTotals();
  renderHistory();
  renderSitesList($("#siteFilter")?.value || "");
}

/* Coords + preview */
function setSelectedCoords(lat, lng) {
  state.selected = { lat, lng };
  $("#latVal").textContent = lat.toFixed(6);
  $("#lngVal").textContent = lng.toFixed(6);
  updatePreviewMarker();
}
function updatePreviewMarker() {
  if (!state.map || !state.selected) return;
  if (state.preview) {
    state.preview.setLatLng([state.selected.lat, state.selected.lng]);
    return;
  }
  const icon = L.divIcon({
    html: `<div class="preview-emoji">🛢️</div>`,
    className: "preview-barrel",
    iconSize: [22, 24],
    iconAnchor: [11, 22],
  });
  state.preview = L.marker([state.selected.lat, state.selected.lng], {
    icon,
  }).addTo(state.map);
}

/* Geocoding + suggestions */
async function geocodeToCoords(query) {
  if (!query || !query.trim()) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
    query
  )}&countrycodes=no&limit=1&addressdetails=0`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !data.length) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}
const debounce = (fn, ms) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};
async function addressSuggestions(query) {
  if (!query || query.trim().length < 3) return [];
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
    query
  )}&countrycodes=no&limit=8&addressdetails=0`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return [];
    const data = await res.json();
    return data.map((d) => d.display_name);
  } catch {
    return [];
  }
}

/* Ops */
function applyOperation({ action, operator, qty, name, lat, lng }) {
  let site = findNearestSite(lat, lng, 25);
  if (!site) {
    site = { id: uuid(), name: name?.trim() || "", lat, lng, barrels: 0 };
    state.sites.push(site);
  } else if (name && name.trim() && name.trim() !== site.name) {
    site.name = name.trim();
  }

  const delta = action === "withdraw" ? -qty : qty;
  site.barrels = Math.max(0, site.barrels + delta);

  save();
  upsertMarker(site);
  if (state.preview) {
    state.preview.remove();
    state.preview = null;
  }
  renderTotals();

  state.history.push({
    ts: Date.now(),
    action,
    operator,
    qty,
    siteId: site.id,
    siteName: site.name || "",
    lat: site.lat,
    lng: site.lng,
  });
  save();
  renderHistory();
  renderSitesList($("#siteFilter")?.value || "");

  toast(
    `${action === "withdraw" ? "Withdrew" : "Deposited"} ${qty} barrel(s) @ ${
      site.name || "site"
    }`
  );
}
function deleteSite(siteId) {
  const idx = state.sites.findIndex((s) => s.id === siteId);
  if (idx === -1) return;
  const s = state.sites[idx];
  state.sites.splice(idx, 1);
  save();
  state.markers[s.id]?.remove();
  delete state.markers[s.id];
  renderTotals();
  renderSitesList($("#siteFilter")?.value || "");
  toast("Site deleted");
}

/* Share link + deep link */
function buildShareLink(site) {
  const url = new URL(window.location.href);
  url.searchParams.set("site", site.id);
  url.hash = `#${site.lat.toFixed(6)},${site.lng.toFixed(6)},14`;
  return url.toString();
}
async function copyShareLink(site) {
  const link = buildShareLink(site);
  try {
    await navigator.clipboard.writeText(link);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = link;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  toast("Share link copied");
}
function applyDeepLink() {
  const p = new URLSearchParams(window.location.search);
  const siteId = p.get("site");
  if (siteId) {
    const s = getSiteById(siteId);
    if (s) {
      state.map?.setView([s.lat, s.lng], 14);
      state.markers[s.id]?.openPopup();
      return;
    }
  }
  if (window.location.hash.startsWith("#")) {
    const [la, ln, z] = window.location.hash.slice(1).split(",");
    const lat = parseFloat(la),
      lng = parseFloat(ln),
      zoom = z ? parseInt(z, 10) : 12;
    if (Number.isFinite(lat) && Number.isFinite(lng))
      state.map?.setView([lat, lng], zoom);
  }
}

/* Export */
function buildSitesTableHtml() {
  const rows = state.sites
    .map(
      (s) => `
    <tr>
      <td>${escapeHtml(s.name || "")}</td>
      <td>${s.lat.toFixed(6)}, ${s.lng.toFixed(6)}</td>
      <td>${fmt(s.barrels)}</td>
      <td>${fmt(s.barrels * LITER_PER_BARREL)}</td>
    </tr>`
    )
    .join("");
  return `<table><thead><tr><th>Name</th><th>Coords</th><th>Barrels</th><th>Liters</th></tr></thead><tbody>${
    rows || `<tr><td colspan="4">No sites</td></tr>`
  }</tbody></table>`;
}
function buildHistoryTableHtml() {
  const rows = [...state.history]
    .sort((a, b) => b.ts - a.ts)
    .map(
      (op) => `
    <tr>
      <td>${new Date(op.ts).toLocaleString()}</td>
      <td>${escapeHtml(op.action)}</td>
      <td>${fmt(op.qty)}</td>
      <td>${escapeHtml(op.operator)}</td>
      <td>${escapeHtml(op.siteName || "")}</td>
      <td>${op.lat.toFixed(6)}, ${op.lng.toFixed(6)}</td>
    </tr>`
    )
    .join("");
  return `<table><thead><tr><th>Time</th><th>Action</th><th>Qty</th><th>Operator</th><th>Site</th><th>Coords</th></tr></thead><tbody>${
    rows || `<tr><td colspan="6">No history</td></tr>`
  }</tbody></table>`;
}
function downloadBlob(filename, mime, data) {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
function exportWord() {
  const html = `<!doctype html><html><head><meta charset="UTF-8"></head><body>
  <h2>Fuel Sites</h2>${buildSitesTableHtml()}
  <h2>Operations History</h2>${buildHistoryTableHtml()}
  </body></html>`;
  downloadBlob("fuel-report.doc", "application/msword", html);
}
function exportExcel() {
  const html = `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
  <head><meta charset="UTF-8"></head><body>
  <h3>Fuel Sites</h3>${buildSitesTableHtml()}
  <h3>Operations History</h3>${buildHistoryTableHtml()}
  </body></html>`;
  downloadBlob("fuel-report.xls", "application/vnd.ms-excel", html);
}
function exportPdf() {
  const w = window.open("", "_blank");
  if (!w) return toast("Popup blocked");
  w.document
    .write(`<!doctype html><html><head><meta charset="UTF-8"><title>Fuel Report</title>
  <style>body{font-family:Arial,Helvetica,sans-serif;padding:20px}h2{margin:8px 0}
  table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:6px;font-size:12px}</style>
  </head><body>
  <h2>Fuel Sites</h2>${buildSitesTableHtml()}
  <h2>Operations History</h2>${buildHistoryTableHtml()}
  <script>window.onload=()=>window.print();<\/script>
  </body></html>`);
  w.document.close();
}

/* UI bindings */
function bindUI() {
  const opForm = $("#opForm");
  if (opForm) {
    opForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const actionEl = opForm.querySelector("#action");
      const operatorEl = opForm.querySelector("#operator");
      const qtyEl = opForm.querySelector("#qty");
      const nameEl = opForm.querySelector("#siteName");
      const latEl = $("#latVal");
      const lngEl = $("#lngVal");
      if (!actionEl || !operatorEl || !qtyEl || !nameEl || !latEl || !lngEl)
        return toast("Missing form elements");

      const action = actionEl.value === "withdraw" ? "withdraw" : "deposit";
      const operator = operatorEl.value.trim();
      const qtyNum = parseInt(qtyEl.value, 10);
      const qty = Number.isFinite(qtyNum) && qtyNum > 0 ? qtyNum : 1;
      const name = nameEl.value;

      let latTxt = latEl.textContent;
      let lngTxt = lngEl.textContent;

      // 1) Fallback: se l'utente ha scritto coordinate manuali
      const coordInput = $("#coordInput");
      if (
        (!latTxt || latTxt === "—" || !lngTxt || lngTxt === "—") &&
        coordInput?.value.trim()
      ) {
        const coordsFromText = parseCoords(coordInput.value.trim());
        if (coordsFromText) {
          setSelectedCoords(coordsFromText.lat, coordsFromText.lng);
          state.map?.setView([coordsFromText.lat, coordsFromText.lng], 14);
          latTxt = $("#latVal").textContent;
          lngTxt = $("#lngVal").textContent;
          toast("Coordinates set from input");
        }
      }

      // 2) Fallback: geocoding da address
      if (
        (!latTxt || latTxt === "—" || !lngTxt || lngTxt === "—") &&
        name &&
        name.trim()
      ) {
        const coords = await geocodeToCoords(name.trim());
        if (coords) {
          setSelectedCoords(coords.lat, coords.lng);
          state.map?.setView([coords.lat, coords.lng], 14);
          latTxt = $("#latVal").textContent;
          lngTxt = $("#lngVal").textContent;
          toast("Coordinates set from address");
        }
      }

      if (!latTxt || latTxt === "—" || !lngTxt || lngTxt === "—")
        return toast("Set coordinates");
      if (!operator) return toast("Operator is required.");

      applyOperation({
        action,
        operator,
        qty,
        name,
        lat: parseFloat(latTxt),
        lng: parseFloat(lngTxt),
      });
    });
  }

  // GPS
  $("#useMyLocation")?.addEventListener("click", () => {
    if (!navigator.geolocation) return toast("Geolocation not available");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setSelectedCoords(lat, lng);
        state.map?.setView([lat, lng], 13);
        toast("Using your GPS position");
      },
      (err) => {
        toast(
          {
            1: "Permission denied",
            2: "Position unavailable",
            3: "Request timed out",
          }[err.code] || "Could not get GPS position"
        );
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  });

  // Copy coords
  $("#copyCoords")?.addEventListener("click", async () => {
    const lat = $("#latVal").textContent,
      lng = $("#lngVal").textContent;
    if (lat === "—" || lng === "—") return toast("No coordinates to copy");
    const text = `${lat}, ${lng}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    toast("Coordinates copied");
  });

  // Pin from address
  $("#pinFromAddress")?.addEventListener("click", async () => {
    const name = $("#siteName").value.trim();
    if (!name) return toast("Enter an address or place name");
    const coords = await geocodeToCoords(name);
    if (!coords) return toast("Address not found (Norway)");
    setSelectedCoords(coords.lat, coords.lng);
    state.map?.setView([coords.lat, coords.lng], 14);
    toast("Pinned from address");
  });

  // Pin from coordinates
  $("#pinFromCoords")?.addEventListener("click", () => {
    const txt = $("#coordInput")?.value.trim() || "";
    const coords = parseCoords(txt);
    if (!coords) return toast('Invalid coordinates. Use "lat,lng".');
    setSelectedCoords(coords.lat, coords.lng);
    state.map?.setView([coords.lat, coords.lng], 14);
    toast("Pinned from coordinates");
  });
  $("#coordInput")?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const txt = e.currentTarget.value.trim();
    const coords = parseCoords(txt);
    if (!coords) return toast('Invalid coordinates. Use "lat,lng".');
    setSelectedCoords(coords.lat, coords.lng);
    state.map?.setView([coords.lat, coords.lng], 14);
    toast("Pinned from coordinates");
  });

  // Address suggestions + change
  const addrInput = $("#siteName");
  const addrList = $("#addrList");
  if (addrInput && addrList) {
    const handleAddr = debounce(async () => {
      const q = addrInput.value.trim();
      if (q.length < 3) {
        addrList.innerHTML = "";
        return;
      }
      const opts = await addressSuggestions(q);
      addrList.innerHTML = opts
        .map((v) => `<option value="${escapeHtml(v)}"></option>`)
        .join("");
    }, 300);
    addrInput.addEventListener("input", handleAddr);

    addrInput.addEventListener("change", async () => {
      const q = addrInput.value.trim();
      const coords = await geocodeToCoords(q);
      if (coords) {
        setSelectedCoords(coords.lat, coords.lng);
        state.map?.setView([coords.lat, coords.lng], 14);
        toast("Coordinates set from address");
      }
    });
  }

  // Sites filter
  $("#siteFilter")?.addEventListener("input", (e) =>
    renderSitesList(e.target.value || "")
  );

  // Export
  $("#exportWord")?.addEventListener("click", exportWord);
  $("#exportExcel")?.addEventListener("click", exportExcel);
  $("#exportPdf")?.addEventListener("click", exportPdf);
  $("#exportJson")?.addEventListener("click", () => {
    downloadBlob(
      "fuel-depot-demo.json",
      "application/json",
      JSON.stringify({ sites: state.sites, history: state.history }, null, 2)
    );
  });

  // Clear all
  $("#clearAll")?.addEventListener("click", () => {
    if (!confirm("Clear all demo data?")) return;
    localStorage.removeItem(STORE.SITES);
    localStorage.removeItem(STORE.HISTORY);
    state.sites = [];
    state.history = [];
    Object.values(state.markers).forEach((m) => m.remove());
    state.markers = {};
    if (state.preview) {
      state.preview.remove();
      state.preview = null;
    }
    renderAll();
    toast("Demo data cleared");
  });
}

// ===== Footer hooks =====
$("#backToTop")?.addEventListener("click", (e) => {
  e.preventDefault();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

$("#shareTotals")?.addEventListener("click", async (e) => {
  e.preventDefault();
  const totalBarrels = state.sites.reduce((a, s) => a + s.barrels, 0);
  const totalLiters = totalBarrels * LITER_PER_BARREL;
  const text = `Fuel totals — Barrels: ${totalBarrels}, Liters: ${totalLiters.toLocaleString()}`;
  try {
    await navigator.clipboard.writeText(text + "\n" + window.location.href);
    toast("Totals copied to clipboard");
  } catch {
    toast("Copy failed");
  }
});

/* Boot */
load();
document.addEventListener("DOMContentLoaded", () => {
  initMap();
  bindUI();
  renderAll();
  const y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();
});
