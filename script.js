document.addEventListener('DOMContentLoaded', function () {

  // ══════════════════════════════════════
  // State
  // ══════════════════════════════════════
  let geoData = null;
  let geoJsonLayer = null;
  let allParcels = [];
  let activeFilter = 'all';
  let selectedParcelId = null;
  let maxArea = 0;
  let exportMap = null;

  // ══════════════════════════════════════
  // Map Setup
  // ══════════════════════════════════════
  const map = L.map('map', { zoomControl: false, attributionControl: true }).setView([-0.835055, 35.22935], 14);

  const tileLayers = {
    streets: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OSM', maxZoom: 19 }),
    satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri', maxZoom: 19, crossOrigin: true }),
    topo: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenTopoMap', maxZoom: 17 })
  };

  let currentTileLayer = tileLayers.streets;
  currentTileLayer.addTo(map);

  // ══════════════════════════════════════
  // Helpers
  // ══════════════════════════════════════
  function getColor(ha) {
    if (ha < 0.25) return { fill: '#fef3c7', stroke: '#d97706', cls: 'sm', label: 'Small' };
    if (ha <= 1) return { fill: '#dbeafe', stroke: '#2563eb', cls: 'md', label: 'Medium' };
    return { fill: '#ede9fe', stroke: '#7c3aed', cls: 'lg', label: 'Large' };
  }

  function fmt(n) { return n.toLocaleString(); }
  function fmtKES(n) { return 'KES ' + n.toLocaleString(); }

  // ══════════════════════════════════════
  // Load GeoJSON
  // ══════════════════════════════════════
  fetch('data/Koimeret_Registration_Parcels.geojson')
    .then(r => r.json())
    .then(data => {
      geoData = data;
      allParcels = data.features.map(f => ({
        id: f.properties.id,
        parcelId: f.properties.parcel_id,
        area: f.properties.Area,
        ha: f.properties['(Ha)']
      }));
      maxArea = Math.max(...allParcels.map(p => p.ha));

      const totalHa = allParcels.reduce((s, p) => s + p.ha, 0);
      document.getElementById('totalParcels').textContent = allParcels.length;
      document.getElementById('totalArea').textContent = totalHa.toFixed(1);
      document.getElementById('avgArea').textContent = (totalHa / allParcels.length).toFixed(2);

      geoJsonLayer = L.geoJSON(data, {
        style: f => {
          const c = getColor(f.properties['(Ha)']);
          return { fillColor: c.fill, fillOpacity: 0.4, color: c.stroke, weight: 1.5 };
        },
        onEachFeature: (feature, layer) => {
          const p = feature.properties;
          layer.bindTooltip('Parcel ' + Math.round(p.parcel_id) + ' — ' + p['(Ha)'].toFixed(3) + ' Ha', {
            sticky: true, className: 'parcel-tooltip', direction: 'top', offset: [0, -10]
          });
          layer.on('click', () => selectParcel(p.parcel_id));
          layer.on('mouseover', e => {
            if (p.parcel_id !== selectedParcelId) {
              layer.setStyle({ weight: 3, fillOpacity: 0.6 });
            }
            layer.bringToFront();
          });
          layer.on('mouseout', () => {
            if (p.parcel_id !== selectedParcelId) {
              const c = getColor(p['(Ha)']);
              layer.setStyle({ weight: 1.5, fillOpacity: 0.4 });
            }
          });
        }
      }).addTo(map);

      map.fitBounds(geoJsonLayer.getBounds(), { padding: [20, 20] });
      renderList(allParcels);
      document.getElementById('loadingOverlay').classList.add('hidden');
      setTimeout(() => document.getElementById('mapTooltip').classList.remove('visible'), 4000);
    })
    .catch(err => {
      console.error('Error:', err);
      document.getElementById('loadingOverlay').classList.add('hidden');
    });

  // ══════════════════════════════════════
  // Render Parcel List
  // ══════════════════════════════════════
  function renderList(parcels) {
    const list = document.getElementById('parcelList');
    document.getElementById('filteredCount').textContent = parcels.length + ' shown';

    if (!parcels.length) {
      list.innerHTML = '<div style="padding:40px;text-align:center;color:#9ca3af;font-size:13px;">No parcels match</div>';
      return;
    }

    const sorted = [...parcels].sort((a, b) => a.parcelId - b.parcelId);
    const frag = document.createDocumentFragment();

    sorted.forEach(p => {
      const c = getColor(p.ha);
      const el = document.createElement('div');
      el.className = 'parcel-item' + (p.parcelId === selectedParcelId ? ' active' : '');
      el.dataset.pid = p.parcelId;
      el.innerHTML = `
        <div class="pi pi-${c.cls}"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg></div>
        <div class="p-info"><div class="pid">Parcel ${Math.round(p.parcelId)}</div><div class="area">${p.ha.toFixed(3)} Ha &middot; ${fmt(p.area)} m&sup2;</div></div>
        <span class="p-badge b-${c.cls}">${c.label}</span>`;
      el.addEventListener('click', () => selectParcel(p.parcelId));
      frag.appendChild(el);
    });

    list.innerHTML = '';
    list.appendChild(frag);
  }

  // ══════════════════════════════════════
  // Select Parcel
  // ══════════════════════════════════════
  function selectParcel(parcelId) {
    selectedParcelId = parcelId;

    // Reset styles
    geoJsonLayer.eachLayer(layer => {
      const c = getColor(layer.feature.properties['(Ha)']);
      layer.setStyle({ fillColor: c.fill, fillOpacity: 0.4, color: c.stroke, weight: 1.5 });
    });

    // Highlight
    let target = null;
    geoJsonLayer.eachLayer(layer => {
      if (layer.feature.properties.parcel_id === parcelId) {
        layer.setStyle({ fillColor: '#22c55e', fillOpacity: 0.6, color: '#15803d', weight: 3 });
        layer.bringToFront();
        target = layer;
      }
    });

    if (target) map.fitBounds(target.getBounds(), { padding: [80, 80], maxZoom: 17 });

    // Update list
    document.querySelectorAll('.parcel-item').forEach(el => {
      el.classList.toggle('active', parseFloat(el.dataset.pid) === parcelId);
    });
    const activeEl = document.querySelector('.parcel-item.active');
    if (activeEl) activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    showDetail(parcelId);
  }

  // ══════════════════════════════════════
  // Detail Panel
  // ══════════════════════════════════════
  function showDetail(parcelId) {
    const p = allParcels.find(x => x.parcelId === parcelId);
    if (!p) return;
    const c = getColor(p.ha);
    const pct = Math.min((p.ha / maxArea) * 100, 100);

    const panel = document.getElementById('detailPanel');
    panel.classList.add('visible');
    document.getElementById('detailTitle').textContent = 'Parcel ' + Math.round(p.parcelId);

    document.getElementById('detailBody').innerHTML = `
      <div class="d-card">
        <h3>Parcel Information</h3>
        <div class="d-row"><span class="label">Parcel ID</span><span class="value">${Math.round(p.parcelId)}</span></div>
        <div class="d-row"><span class="label">Record ID</span><span class="value">${p.id}</span></div>
        <div class="d-row"><span class="label">Area (m&sup2;)</span><span class="value">${fmt(p.area)} m&sup2;</span></div>
        <div class="d-row"><span class="label">Area (Hectares)</span><span class="value">${p.ha.toFixed(4)} Ha</span></div>
        <div class="d-row"><span class="label">Area (Acres)</span><span class="value">${(p.ha * 2.471).toFixed(4)} Ac</span></div>
        <div class="d-row"><span class="label">Classification</span><span class="p-badge b-${c.cls}">${c.label}</span></div>
        <div class="d-row"><span class="label">Location</span><span class="value">Koimeret, Bomet</span></div>
      </div>
      <div class="d-card">
        <h3>Relative Size (vs ${maxArea.toFixed(2)} Ha largest)</h3>
        <div class="area-bar-wrap"><div class="area-bar" style="width:${pct}%"></div></div>
      </div>
      <div class="d-actions">
        <button class="btn btn-primary" onclick="window._zoomParcel(${parcelId})"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>Zoom</button>
        <button class="btn btn-outline" onclick="window._copyInfo(${parcelId})"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>Copy</button>
        <button class="btn btn-outline" onclick="window._exportParcel(${parcelId})"><svg viewBox="0 0 24 24"><path d="M6 9V2h12v7"/><rect x="6" y="14" width="12" height="8"/></svg>Export</button>
      </div>`;
  }

  window._zoomParcel = pid => {
    geoJsonLayer.eachLayer(l => {
      if (l.feature.properties.parcel_id === pid) map.fitBounds(l.getBounds(), { padding: [60, 60], maxZoom: 18 });
    });
  };

  window._copyInfo = pid => {
    const p = allParcels.find(x => x.parcelId === pid);
    if (!p) return;
    navigator.clipboard.writeText(`Parcel ${Math.round(p.parcelId)} | ${p.ha.toFixed(4)} Ha | ${fmt(p.area)} m2 | ${(p.ha * 2.471).toFixed(4)} Ac | Koimeret, Bomet County`);
  };

  window._exportParcel = pid => {
    // Navigate to export page and populate
    navigateTo('export');
    document.getElementById('exportParcelInput').value = Math.round(pid);
    setTimeout(() => generateExport(pid), 200);
  };

  document.getElementById('detailBack').addEventListener('click', () => {
    document.getElementById('detailPanel').classList.remove('visible');
  });

  document.getElementById('detailExport').addEventListener('click', () => {
    if (selectedParcelId) window._exportParcel(selectedParcelId);
  });

  // ══════════════════════════════════════
  // Search
  // ══════════════════════════════════════
  const searchInput = document.getElementById('searchInput');
  const suggestionsEl = document.getElementById('suggestions');

  searchInput.addEventListener('input', function () {
    const val = this.value.trim();
    if (!val) { suggestionsEl.classList.remove('visible'); return; }
    const matches = allParcels.filter(p => Math.round(p.parcelId).toString().includes(val)).slice(0, 12);
    if (!matches.length) { suggestionsEl.classList.remove('visible'); return; }

    suggestionsEl.innerHTML = matches.map(p => `
      <div class="suggestion-item" data-pid="${p.parcelId}">
        <span class="s-pid">Parcel ${Math.round(p.parcelId)}</span>
        <span class="s-area">${p.ha.toFixed(3)} Ha</span>
      </div>`).join('');

    suggestionsEl.querySelectorAll('.suggestion-item').forEach(el => {
      el.addEventListener('click', function () {
        const pid = parseFloat(this.dataset.pid);
        searchInput.value = Math.round(pid);
        suggestionsEl.classList.remove('visible');
        selectParcel(pid);
      });
    });
    suggestionsEl.classList.add('visible');
  });

  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const match = allParcels.find(p => Math.round(p.parcelId).toString() === searchInput.value.trim());
      if (match) { suggestionsEl.classList.remove('visible'); selectParcel(match.parcelId); }
    }
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.search-box')) suggestionsEl.classList.remove('visible');
  });

  // ══════════════════════════════════════
  // Filters
  // ══════════════════════════════════════
  function filterParcels(parcels, filter) {
    if (filter === 'small') return parcels.filter(p => p.ha < 0.25);
    if (filter === 'medium') return parcels.filter(p => p.ha >= 0.25 && p.ha <= 1);
    if (filter === 'large') return parcels.filter(p => p.ha > 1);
    return parcels;
  }

  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', function () {
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      this.classList.add('active');
      activeFilter = this.dataset.filter;
      renderList(filterParcels(allParcels, activeFilter));

      geoJsonLayer.eachLayer(layer => {
        const ha = layer.feature.properties['(Ha)'];
        const vis = activeFilter === 'all' ||
          (activeFilter === 'small' && ha < 0.25) ||
          (activeFilter === 'medium' && ha >= 0.25 && ha <= 1) ||
          (activeFilter === 'large' && ha > 1);
        if (vis) {
          const c = getColor(ha);
          layer.setStyle({ fillColor: c.fill, fillOpacity: 0.4, color: c.stroke, weight: 1.5, opacity: 1 });
        } else {
          layer.setStyle({ fillOpacity: 0.05, opacity: 0.15, weight: 0.5 });
        }
      });
    });
  });

  // ══════════════════════════════════════
  // Map Controls
  // ══════════════════════════════════════
  document.getElementById('zoomIn').addEventListener('click', () => map.zoomIn());
  document.getElementById('zoomOut').addEventListener('click', () => map.zoomOut());
  document.getElementById('fitBounds').addEventListener('click', () => {
    if (geoJsonLayer) map.fitBounds(geoJsonLayer.getBounds(), { padding: [20, 20] });
  });

  document.getElementById('sidebarToggle').addEventListener('click', () => {
    document.getElementById('parcelSidebar').classList.toggle('collapsed');
    setTimeout(() => map.invalidateSize(), 300);
  });

  document.getElementById('layerBtn').addEventListener('click', () => {
    document.getElementById('layerDropdown').classList.toggle('visible');
  });

  document.querySelectorAll('.layer-opt').forEach(opt => {
    opt.addEventListener('click', function () {
      document.querySelectorAll('.layer-opt').forEach(o => o.classList.remove('active'));
      this.classList.add('active');
      map.removeLayer(currentTileLayer);
      currentTileLayer = tileLayers[this.dataset.layer];
      currentTileLayer.addTo(map);
      document.getElementById('layerDropdown').classList.remove('visible');
    });
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.layer-select')) document.getElementById('layerDropdown').classList.remove('visible');
  });

  // ══════════════════════════════════════
  // Navigation
  // ══════════════════════════════════════
  function navigateTo(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('page-' + page).classList.add('active');
    document.querySelector(`.nav-item[data-page="${page}"]`).classList.add('active');

    // Close mobile nav
    document.getElementById('sidebarNav').classList.remove('open');

    // Re-invalidate map if parcel page
    if (page === 'parcels') setTimeout(() => map.invalidateSize(), 100);
    if (page === 'dashboard') renderDashboard();
  }

  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => navigateTo(item.dataset.page));
  });

  document.getElementById('navToggle').addEventListener('click', () => {
    document.getElementById('sidebarNav').classList.toggle('open');
  });

  // ══════════════════════════════════════
  // Dashboard Charts
  // ══════════════════════════════════════
  let chartsRendered = false;

  function renderDashboard() {
    if (chartsRendered || !allParcels.length) return;
    chartsRendered = true;

    const totalHa = allParcels.reduce((s, p) => s + p.ha, 0);
    document.getElementById('dTotalParcels').textContent = allParcels.length;
    document.getElementById('dTotalHa').textContent = totalHa.toFixed(1);
    document.getElementById('dAvgHa').textContent = (totalHa / allParcels.length).toFixed(3);
    document.getElementById('dLargest').textContent = maxArea.toFixed(2);

    // Distribution histogram
    const bins = [0, 0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 5];
    const binLabels = [];
    const binCounts = [];
    for (let i = 0; i < bins.length; i++) {
      const lo = bins[i];
      const hi = bins[i + 1] || Infinity;
      binLabels.push(hi === Infinity ? `>${lo}` : `${lo}-${hi}`);
      binCounts.push(allParcels.filter(p => p.ha >= lo && p.ha < hi).length);
    }

    new Chart(document.getElementById('chartDistribution'), {
      type: 'bar',
      data: {
        labels: binLabels,
        datasets: [{ label: 'Parcels', data: binCounts, backgroundColor: '#2d8a56', borderRadius: 6 }]
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });

    // Classification pie
    const small = allParcels.filter(p => p.ha < 0.25).length;
    const medium = allParcels.filter(p => p.ha >= 0.25 && p.ha <= 1).length;
    const large = allParcels.filter(p => p.ha > 1).length;

    new Chart(document.getElementById('chartClassification'), {
      type: 'doughnut',
      data: {
        labels: ['Small (<0.25 Ha)', 'Medium (0.25-1 Ha)', 'Large (>1 Ha)'],
        datasets: [{ data: [small, medium, large], backgroundColor: ['#f59e0b', '#3b82f6', '#8b5cf6'] }]
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });

    // Top 10
    const top10 = [...allParcels].sort((a, b) => b.ha - a.ha).slice(0, 10);
    new Chart(document.getElementById('chartTop10'), {
      type: 'bar',
      data: {
        labels: top10.map(p => 'P' + Math.round(p.parcelId)),
        datasets: [{ label: 'Ha', data: top10.map(p => p.ha), backgroundColor: '#8b5cf6', borderRadius: 6 }]
      },
      options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } } }
    });
  }

  // ══════════════════════════════════════
  // Official Search
  // ══════════════════════════════════════
  document.getElementById('officialSearchBtn').addEventListener('click', function () {
    const val = document.getElementById('officialSearchInput').value.trim();
    const p = allParcels.find(x => Math.round(x.parcelId).toString() === val);
    const card = document.getElementById('searchResultCard');
    const body = document.getElementById('searchResultBody');

    if (!p) {
      card.style.display = 'block';
      body.innerHTML = '<div style="padding:20px;text-align:center;color:#ef4444;font-weight:600;">Parcel not found</div>';
      return;
    }

    const c = getColor(p.ha);
    const searchType = document.getElementById('searchType').value;

    let html = `
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        <tr style="background:var(--bg);">
          <td style="padding:10px 14px;font-size:12px;color:var(--text-muted);font-weight:600;border:1px solid var(--border);width:40%;">Parcel ID</td>
          <td style="padding:10px 14px;font-size:14px;font-weight:600;border:1px solid var(--border);">${Math.round(p.parcelId)}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;font-size:12px;color:var(--text-muted);font-weight:600;border:1px solid var(--border);">Record ID</td>
          <td style="padding:10px 14px;border:1px solid var(--border);">${p.id}</td>
        </tr>
        <tr style="background:var(--bg);">
          <td style="padding:10px 14px;font-size:12px;color:var(--text-muted);font-weight:600;border:1px solid var(--border);">Area</td>
          <td style="padding:10px 14px;border:1px solid var(--border);">${p.ha.toFixed(4)} Ha (${fmt(p.area)} m&sup2;)</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;font-size:12px;color:var(--text-muted);font-weight:600;border:1px solid var(--border);">Classification</td>
          <td style="padding:10px 14px;border:1px solid var(--border);"><span class="p-badge b-${c.cls}">${c.label}</span></td>
        </tr>
        <tr style="background:var(--bg);">
          <td style="padding:10px 14px;font-size:12px;color:var(--text-muted);font-weight:600;border:1px solid var(--border);">Location</td>
          <td style="padding:10px 14px;border:1px solid var(--border);">Koimeret, Bomet County</td>
        </tr>
      </table>`;

    if (searchType === 'full') {
      html += `
        <div style="border:1px dashed #d1d5db;border-radius:8px;padding:16px;margin-bottom:12px;background:#fafafa;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#9ca3af;font-weight:600;margin-bottom:6px;">Registered Owner</div>
          <div style="font-size:13px;color:#9ca3af;font-style:italic;">Ownership data requires backend integration with the National Land Registry.</div>
        </div>
        <div style="border:1px dashed #d1d5db;border-radius:8px;padding:16px;background:#fafafa;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#9ca3af;font-weight:600;margin-bottom:6px;">Encumbrances &amp; Charges</div>
          <div style="font-size:13px;color:#9ca3af;font-style:italic;">Encumbrance records require backend integration.</div>
        </div>`;
    }

    card.style.display = 'block';
    body.innerHTML = html;
  });

  // ══════════════════════════════════════
  // Stamp Duty Calculator
  // ══════════════════════════════════════
  document.getElementById('calcBtn').addEventListener('click', function () {
    const val = parseFloat(document.getElementById('calcValue').value);
    if (isNaN(val) || val <= 0) return;

    const loc = document.getElementById('calcLocation').value;
    const rate = loc === 'municipality' ? 0.04 : 0.02;
    const duty = val * rate;

    document.getElementById('crValue').textContent = fmtKES(val);
    document.getElementById('crRate').textContent = (rate * 100) + '%';
    document.getElementById('crDuty').textContent = fmtKES(Math.round(duty));
    document.getElementById('calcResult').style.display = 'block';
  });

  // ══════════════════════════════════════
  // Export / Print — Parcel Document
  // ══════════════════════════════════════
  function generateExport(parcelIdNum) {
    const pid = typeof parcelIdNum === 'number' ? parcelIdNum :
      parseFloat(document.getElementById('exportParcelInput').value.trim());
    const p = allParcels.find(x => Math.round(x.parcelId) === Math.round(pid));

    if (!p) {
      document.getElementById('exportPreview').innerHTML = '<div class="export-empty"><p style="color:#ef4444;font-weight:600;">Parcel not found</p></div>';
      document.getElementById('exportActions').style.display = 'none';
      return;
    }

    const c = getColor(p.ha);
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
    const refId = 'KLI-' + Math.round(p.parcelId) + '-' + now.getFullYear();

    // Populate hidden export template
    document.getElementById('exportDate').textContent = dateStr;
    document.getElementById('exportDocTitle').textContent = 'PARCEL INFORMATION REPORT';
    document.getElementById('exportDocRef').textContent = 'Ref: ' + refId;
    document.getElementById('expParcelId').textContent = Math.round(p.parcelId);
    document.getElementById('expRecordId').textContent = p.id;
    document.getElementById('expAreaSqm').textContent = fmt(p.area) + ' m\u00B2';
    document.getElementById('expAreaHa').textContent = p.ha.toFixed(4) + ' Ha';
    document.getElementById('expAreaAc').textContent = (p.ha * 2.471).toFixed(4) + ' Ac';
    document.getElementById('expClass').textContent = c.label + ' (' + (p.ha < 0.25 ? '<0.25 Ha' : p.ha <= 1 ? '0.25-1 Ha' : '>1 Ha') + ')';
    document.getElementById('expDocId').textContent = refId;

    // Build preview inside visible area
    const preview = document.getElementById('exportPreview');
    preview.innerHTML = '';

    // Clone the template
    const clone = document.getElementById('exportDoc').cloneNode(true);
    clone.style.position = 'relative';
    clone.style.left = '0';
    preview.appendChild(clone);

    // Create a mini map in the preview
    const mapContainer = clone.querySelector('#exportMapContainer');
    if (mapContainer) {
      const miniMapDiv = mapContainer.querySelector('#exportMap') || document.createElement('div');
      miniMapDiv.id = 'previewMap';
      miniMapDiv.style.width = '100%';
      miniMapDiv.style.height = '100%';

      setTimeout(() => {
        if (exportMap) { exportMap.remove(); exportMap = null; }

        exportMap = L.map(miniMapDiv, { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(exportMap);

        // Find the feature and add it
        const feature = geoData.features.find(f => f.properties.parcel_id === p.parcelId);
        if (feature) {
          const parcelLayer = L.geoJSON(feature, {
            style: { fillColor: '#22c55e', fillOpacity: 0.4, color: '#15803d', weight: 3 }
          }).addTo(exportMap);

          // Add all other parcels faintly for context
          L.geoJSON(geoData, {
            style: f => {
              if (f.properties.parcel_id === p.parcelId) return { fillOpacity: 0, opacity: 0 };
              return { fillColor: '#e5e7eb', fillOpacity: 0.2, color: '#9ca3af', weight: 0.5 };
            }
          }).addTo(exportMap);

          // Add parcel label
          const center = parcelLayer.getBounds().getCenter();
          L.marker(center, {
            icon: L.divIcon({
              className: '',
              html: `<div style="background:#15803d;color:#fff;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:700;font-family:Inter,sans-serif;white-space:nowrap;">Parcel ${Math.round(p.parcelId)}</div>`,
              iconAnchor: [40, 12]
            })
          }).addTo(exportMap);

          exportMap.fitBounds(parcelLayer.getBounds(), { padding: [40, 40] });
        }
      }, 100);
    }

    document.getElementById('exportActions').style.display = 'flex';
  }

  document.getElementById('generateExportBtn').addEventListener('click', () => generateExport());

  // Download PNG
  document.getElementById('downloadPNG').addEventListener('click', function () {
    const el = document.getElementById('exportPreview').firstElementChild;
    if (!el) return;

    // Wait for tiles to load
    this.textContent = 'Generating...';
    setTimeout(() => {
      html2canvas(el, { scale: 2, useCORS: true, allowTaint: true, logging: false }).then(canvas => {
        const link = document.createElement('a');
        link.download = `Parcel_${document.getElementById('expParcelId').textContent}_Koimeret.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        this.innerHTML = '<svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2;"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download PNG';
      });
    }, 1000);
  });

  // Download PDF
  document.getElementById('downloadPDF').addEventListener('click', function () {
    const el = document.getElementById('exportPreview').firstElementChild;
    if (!el) return;

    this.textContent = 'Generating...';
    setTimeout(() => {
      html2canvas(el, { scale: 2, useCORS: true, allowTaint: true, logging: false }).then(canvas => {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const imgData = canvas.toDataURL('image/png');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`Parcel_${document.getElementById('expParcelId').textContent}_Koimeret.pdf`);
        this.innerHTML = '<svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2;"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> Download PDF';
      });
    }, 1000);
  });

  // Export from search result
  document.getElementById('exportSearchResult').addEventListener('click', function () {
    const val = document.getElementById('officialSearchInput').value.trim();
    const p = allParcels.find(x => Math.round(x.parcelId).toString() === val);
    if (p) window._exportParcel(p.parcelId);
  });

  // Export from header button
  document.getElementById('exportPageBtn').addEventListener('click', () => navigateTo('export'));

  // Login button placeholder
  document.getElementById('loginBtn').addEventListener('click', () => {
    alert('User authentication requires a backend system.\n\nThis will be implemented when the system is connected to the National Land Registry backend.');
  });

  // ══════════════════════════════════════
  // Keyboard Shortcuts
  // ══════════════════════════════════════
  document.addEventListener('keydown', e => {
    if (e.key === '/' && !e.target.closest('input, select, textarea')) {
      e.preventDefault();
      navigateTo('parcels');
      searchInput.focus();
    }
    if (e.key === 'Escape') {
      suggestionsEl.classList.remove('visible');
      searchInput.blur();
      document.getElementById('layerDropdown').classList.remove('visible');
      document.getElementById('sidebarNav').classList.remove('open');
    }
  });

});
