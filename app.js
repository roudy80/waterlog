// WaterLog — Field Reading Tracker
// All data stored in localStorage. Photos compressed to ~100KB before saving.

const STORE_KEY = 'waterlog_v1';

// ── State ──────────────────────────────────────────────────────────────────────
let state = loadState();
let currentPhoto = null; // base64 string of compressed photo

// ── Persistence ────────────────────────────────────────────────────────────────
function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || { sites: [], readings: [] };
  } catch { return { sites: [], readings: [] }; }
}

function saveState() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

// ── Navigation ─────────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => showView(btn.dataset.view));
});

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`view-${name}`).classList.add('active');
  const navBtn = document.querySelector(`[data-view="${name}"]`);
  if (navBtn) navBtn.classList.add('active');

  if (name === 'dashboard') renderDashboard();
  if (name === 'new-reading') initNewReadingForm();
  if (name === 'export') renderExport();
}

// ── Dashboard ──────────────────────────────────────────────────────────────────
function renderDashboard() {
  const container = document.getElementById('site-cards');
  const empty = document.getElementById('no-readings');

  if (state.readings.length === 0) {
    container.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  // Group latest reading per site
  const siteMap = {};
  state.readings.forEach(r => {
    if (!siteMap[r.site] || r.timestamp > siteMap[r.site].latest.timestamp) {
      siteMap[r.site] = {
        latest: r,
        count: 0
      };
    }
    siteMap[r.site].count++;
  });

  const sites = Object.entries(siteMap).sort((a, b) => b[1].latest.timestamp - a[1].latest.timestamp);

  container.innerHTML = sites.map(([site, data]) => {
    const r = data.latest;
    const ago = timeAgo(r.timestamp);
    return `
      <div class="site-card" onclick="showSiteHistory('${escHtml(site)}')">
        <div class="site-card-left">
          <h3>${escHtml(site)}</h3>
          <div class="card-meta">${ago}</div>
          ${r.notes ? `<div class="card-meta" style="font-style:italic">${escHtml(r.notes.slice(0,50))}${r.notes.length > 50 ? '…' : ''}</div>` : ''}
        </div>
        <div class="site-card-right">
          <div class="reading-value">${r.value}</div>
          <div class="reading-unit">${escHtml(r.unit)}</div>
          <div class="reading-count">${data.count} reading${data.count !== 1 ? 's' : ''}</div>
        </div>
      </div>
    `;
  }).join('');
}

// ── Site History ───────────────────────────────────────────────────────────────
function showSiteHistory(site) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('view-site-history').classList.add('active');

  document.getElementById('history-site-name').textContent = site;

  const readings = state.readings
    .filter(r => r.site === site)
    .sort((a, b) => b.timestamp - a.timestamp);

  const list = document.getElementById('history-list');

  if (readings.length === 0) {
    list.innerHTML = '<p style="color:#888;text-align:center;padding:40px">No readings for this site.</p>';
    return;
  }

  // Build chart data (oldest first, last 10)
  const chartReadings = [...readings].reverse().slice(-10);
  const vals = chartReadings.map(r => parseFloat(r.value)).filter(v => !isNaN(v));
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const range = maxV - minV || 1;

  const barsHtml = vals.length > 1 ? `
    <div class="mini-chart">
      <div class="mini-chart-title">Last ${vals.length} readings trend</div>
      <div class="bars">
        ${chartReadings.map((r, i) => {
          const h = Math.max(4, ((parseFloat(r.value) - minV) / range) * 44);
          return `<div class="bar" style="height:${h}px">
            <div class="bar-tooltip">${r.value} ${r.unit}<br>${new Date(r.timestamp).toLocaleDateString()}</div>
          </div>`;
        }).join('')}
      </div>
    </div>
  ` : '';

  list.innerHTML = readings.map(r => `
    <div class="history-item">
      <div class="history-item-body">
        ${r.photo
          ? `<img class="history-thumb" src="${r.photo}" alt="Reading photo" onclick="openLightbox('${r.id}')">`
          : `<div class="history-no-photo">&#128167;</div>`}
        <div class="history-meta">
          <div class="history-value">${r.value} <span class="history-unit">${escHtml(r.unit)}</span></div>
          <div class="history-date">${new Date(r.timestamp).toLocaleString()}</div>
          ${r.notes ? `<div class="history-notes">${escHtml(r.notes)}</div>` : ''}
        </div>
      </div>
      ${barsHtml && readings.indexOf(r) === 0 ? barsHtml : ''}
    </div>
  `).join('');
}

document.getElementById('back-btn').addEventListener('click', () => showView('dashboard'));

// ── Lightbox ───────────────────────────────────────────────────────────────────
function openLightbox(readingId) {
  const r = state.readings.find(r => r.id === readingId);
  if (!r?.photo) return;
  document.getElementById('lightbox-img').src = r.photo;
  document.getElementById('lightbox').style.display = 'flex';
}
document.getElementById('lightbox-close').addEventListener('click', () => {
  document.getElementById('lightbox').style.display = 'none';
});
document.getElementById('lightbox').addEventListener('click', e => {
  if (e.target === e.currentTarget) e.currentTarget.style.display = 'none';
});

// ── New Reading Form ───────────────────────────────────────────────────────────
function initNewReadingForm() {
  // Populate site dropdown
  const sel = document.getElementById('site-select');
  const currentVal = sel.value;
  sel.innerHTML = '<option value="">— select a site —</option>' +
    state.sites.map(s => `<option value="${escHtml(s)}"${s === currentVal ? ' selected' : ''}>${escHtml(s)}</option>`).join('');

  // Update timestamp display
  updateTimestamp();
}

function updateTimestamp() {
  document.getElementById('form-time').textContent = new Date().toLocaleString();
}

// Add new site button
const addSiteBtn = document.getElementById('add-site-btn');
const newSiteName = document.getElementById('new-site-name');
const siteSelect = document.getElementById('site-select');

addSiteBtn.addEventListener('click', () => {
  const visible = newSiteName.style.display !== 'none';
  newSiteName.style.display = visible ? 'none' : 'block';
  addSiteBtn.textContent = visible ? '+' : '✓';
  if (!visible) newSiteName.focus();
  else if (newSiteName.value.trim()) {
    const name = newSiteName.value.trim();
    if (!state.sites.includes(name)) {
      state.sites.push(name);
      saveState();
    }
    // add to select and select it
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    siteSelect.appendChild(opt);
    siteSelect.value = name;
    newSiteName.value = '';
    newSiteName.style.display = 'none';
    addSiteBtn.textContent = '+';
  }
});

// Custom unit
document.getElementById('reading-unit').addEventListener('change', function() {
  document.getElementById('custom-unit').style.display = this.value === 'custom' ? 'block' : 'none';
});

// Photo capture
const photoInput = document.getElementById('photo-input');
const cameraBtn = document.getElementById('camera-btn');
const photoPreview = document.getElementById('photo-preview');
const removePhotoBtn = document.getElementById('remove-photo-btn');

cameraBtn.addEventListener('click', () => photoInput.click());

photoInput.addEventListener('change', async () => {
  const file = photoInput.files[0];
  if (!file) return;
  currentPhoto = await compressImage(file, 1200, 0.75);
  photoPreview.src = currentPhoto;
  photoPreview.style.display = 'block';
  cameraBtn.style.display = 'none';
  removePhotoBtn.style.display = 'block';
});

removePhotoBtn.addEventListener('click', () => {
  currentPhoto = null;
  photoPreview.src = '';
  photoPreview.style.display = 'none';
  cameraBtn.style.display = 'flex';
  removePhotoBtn.style.display = 'none';
  photoInput.value = '';
});

// Form submit
document.getElementById('reading-form').addEventListener('submit', e => {
  e.preventDefault();

  const site = siteSelect.value || newSiteName.value.trim();
  if (!site) { showToast('Please select or enter a site name'); return; }

  const rawUnit = document.getElementById('reading-unit').value;
  const unit = rawUnit === 'custom'
    ? (document.getElementById('custom-unit').value.trim() || 'custom')
    : rawUnit;

  const value = document.getElementById('reading-value').value;
  if (!value) { showToast('Please enter a reading value'); return; }

  // Save site if new
  if (!state.sites.includes(site)) { state.sites.push(site); }

  const reading = {
    id: crypto.randomUUID(),
    site,
    value: parseFloat(value),
    unit,
    notes: document.getElementById('reading-notes').value.trim(),
    photo: currentPhoto,
    timestamp: Date.now()
  };

  state.readings.push(reading);

  try {
    saveState();
  } catch (err) {
    // localStorage full — save without photo
    reading.photo = null;
    state.readings[state.readings.length - 1] = reading;
    saveState();
    showToast('Saved (photo dropped — storage full)');
    resetForm();
    return;
  }

  showToast('Reading saved!');
  resetForm();
  showView('dashboard');
});

function resetForm() {
  document.getElementById('reading-form').reset();
  currentPhoto = null;
  photoPreview.src = '';
  photoPreview.style.display = 'none';
  cameraBtn.style.display = 'flex';
  removePhotoBtn.style.display = 'none';
  photoInput.value = '';
  document.getElementById('custom-unit').style.display = 'none';
  newSiteName.style.display = 'none';
  addSiteBtn.textContent = '+';
}

// ── Export ─────────────────────────────────────────────────────────────────────
function renderExport() {
  const bytes = new Blob([localStorage.getItem(STORE_KEY) || '']).size;
  document.getElementById('storage-used').textContent =
    bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes/1024).toFixed(1)} KB` : `${(bytes/1048576).toFixed(1)} MB`;
}

document.getElementById('export-csv-btn').addEventListener('click', () => {
  if (state.readings.length === 0) { showToast('No readings to export'); return; }

  const rows = [['Site', 'Value', 'Unit', 'Notes', 'Date', 'Time']];
  state.readings
    .sort((a, b) => a.timestamp - b.timestamp)
    .forEach(r => {
      const d = new Date(r.timestamp);
      rows.push([
        r.site,
        r.value,
        r.unit,
        r.notes || '',
        d.toLocaleDateString(),
        d.toLocaleTimeString()
      ]);
    });

  const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `waterlog-export-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV downloaded!');
});

document.getElementById('clear-photos-btn').addEventListener('click', () => {
  if (!confirm('Remove all photos? Readings and values stay.')) return;
  state.readings.forEach(r => { r.photo = null; });
  saveState();
  showToast('Photos cleared');
  renderExport();
});

document.getElementById('clear-all-btn').addEventListener('click', () => {
  if (!confirm('Delete ALL readings and sites? This cannot be undone.')) return;
  state = { sites: [], readings: [] };
  saveState();
  showToast('All data cleared');
  showView('dashboard');
});

// ── Helpers ────────────────────────────────────────────────────────────────────
function compressImage(file, maxDim = 1200, quality = 0.75) {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = url;
  });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  const hr  = Math.floor(diff / 3600000);
  const day = Math.floor(diff / 86400000);
  if (min < 1)  return 'just now';
  if (min < 60) return `${min}m ago`;
  if (hr  < 24) return `${hr}h ago`;
  return `${day}d ago`;
}

let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
}

// ── Init ───────────────────────────────────────────────────────────────────────
renderDashboard();
