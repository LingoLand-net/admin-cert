/* Lingo‑Ville — control panel logic */
(function () {
  let allCerts = [];

  const LIST_CACHE_KEY = 'lv_certlist_v1';
  const LIST_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  // ---------- Cache helpers ----------
  function readListCache() {
    try {
      const raw = localStorage.getItem(LIST_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.certs) || !parsed.at) return null;
      if (Date.now() - parsed.at > LIST_CACHE_TTL_MS) {
        localStorage.removeItem(LIST_CACHE_KEY);
        return null;
      }
      return parsed.certs;
    } catch (_) { return null; }
  }

  function writeListCache(certs) {
    try {
      localStorage.setItem(
        LIST_CACHE_KEY,
        JSON.stringify({ certs, at: Date.now() })
      );
    } catch (_) { /* best effort */ }
  }

  function clearListCache() {
    try { localStorage.removeItem(LIST_CACHE_KEY); } catch (_) {}
  }

  // ---------- Helpers ----------
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function statusPill(status) {
    const s = (status || 'active').toLowerCase();
    if (s === 'active')  return '<span class="px-2 py-1 rounded-full text-xs font-bold bg-teal-50 text-teal-700">Active</span>';
    if (s === 'revoked') return '<span class="px-2 py-1 rounded-full text-xs font-bold bg-red-50 text-red-600">Revoked</span>';
    if (s === 'pending') return '<span class="px-2 py-1 rounded-full text-xs font-bold bg-yellow-50 text-yellow-700">Pending</span>';
    return `<span class="px-2 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600">${escapeHtml(status)}</span>`;
  }

  function fmtDate(d) {
    if (!d) return '—';
    try {
      const dt = (d instanceof Date) ? d : new Date(d);
      if (isNaN(dt.getTime())) return String(d);
      return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (_) { return String(d); }
  }

  function renderStats() {
    const total = allCerts.length;
    const active = allCerts.filter(c => (c.Status || 'active').toLowerCase() === 'active').length;
    const revoked = allCerts.filter(c => (c.Status || '').toLowerCase() === 'revoked').length;
    const reports = allCerts.filter(c => c.ReportURL).length;
    document.getElementById('statTotal').textContent = total;
    document.getElementById('statActive').textContent = active;
    document.getElementById('statRevoked').textContent = revoked;
    document.getElementById('statReports').textContent = reports;
  }

  function applyFilters() {
    const q = document.getElementById('filterInput').value.trim().toLowerCase();
    const st = document.getElementById('statusFilter').value.toLowerCase();

    const rows = allCerts.filter(c => {
      if (st && (c.Status || 'active').toLowerCase() !== st) return false;
      if (!q) return true;
      const hay = [c.CertID, c.StudentName, c.Course, c.Level, c.Issuer, c.Email]
        .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });

    const tbody = document.getElementById('tableBody');
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-slate-400">No matching certificates.</td></tr>`;
    } else {
      tbody.innerHTML = rows.map(c => `
        <tr class="border-t border-slate-100 hover:bg-slate-50/70">
          <td class="px-5 py-3 font-mono text-xs text-teal-700 break-all">${escapeHtml(c.CertID || '')}</td>
          <td class="px-5 py-3 font-semibold">${escapeHtml(c.StudentName || '')}</td>
          <td class="px-5 py-3 hidden md:table-cell">${escapeHtml(c.Course || '')}</td>
          <td class="px-5 py-3 hidden md:table-cell">${escapeHtml(c.Level || '')}</td>
          <td class="px-5 py-3 hidden sm:table-cell text-slate-500">${fmtDate(c.IssueDate)}</td>
          <td class="px-5 py-3">${statusPill(c.Status)}</td>
          <td class="px-5 py-3 text-right">
            <button data-delete="${escapeHtml(c.CertID)}"
                    class="delete-btn text-xs px-2.5 py-1 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 hover:border-red-400 transition">
              Delete
            </button>
          </td>
        </tr>
      `).join('');
    }
    document.getElementById('listMeta').textContent =
      `Showing ${rows.length} of ${allCerts.length} certificates.`;
  }

  // ---------- Delete flow (optimistic) ----------
  async function onDeleteClick(certId) {
    const idx = allCerts.findIndex(c => (c.CertID || '').toLowerCase() === certId.toLowerCase());
    if (idx === -1) return;
    const removed = allCerts[idx];

    const hasReport = !!removed.ReportURL;
    const msg =
      `Delete "${certId}"?\n\n` +
      `This will permanently remove:\n` +
      `• The Sheet row\n` +
      `• The certificate PDF on Cloudinary` +
      (hasReport ? `\n• The report PDF on Cloudinary` : '') +
      `\n\nThis cannot be undone.`;

    if (!window.confirm(msg)) return;

    // ---- Optimistic: remove from UI immediately ----
    allCerts.splice(idx, 1);
    renderStats();
    applyFilters();
    clearListCache(); // list state changed

    try {
      const res = await window.LVAuth.api('deleteCert', {
        token: window.LVAuth.getToken(),
        certId
      });

      if (res.warning) window.alert(res.warning);

      // Silently refetch in the background to make sure our local view
      // matches the server (in case another admin edited the sheet meanwhile).
      load({ background: true });
    } catch (ex) {
      if (ex.message === 'AUTH_RELOAD') return;
      // Rollback
      allCerts.splice(idx, 0, removed);
      renderStats();
      applyFilters();
      window.alert('Delete failed: ' + ex.message);
    }
  }

  document.getElementById('tableBody').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-delete]');
    if (!btn) return;
    onDeleteClick(btn.dataset.delete);
  });

  // ---------- Load (with cache + stale-while-revalidate) ----------
  async function load(opts = {}) {
    const { background = false } = opts;
    const tbody = document.getElementById('tableBody');

    // First-pass: render cached data instantly if we're not already in background mode
    if (!background) {
      const cached = readListCache();
      if (cached) {
        allCerts = cached.slice().reverse();
        renderStats();
        applyFilters();
        // Then refresh silently in the background
        return load({ background: true });
      }
      // No cache → show loading placeholder
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-slate-400">Loading…</td></tr>`;
    }

    try {
      const { certs } = await window.LVAuth.api('listCerts', {
        token: window.LVAuth.getToken()
      });
      writeListCache(certs || []);
      allCerts = (certs || []).slice().reverse();
      renderStats();
      applyFilters();
    } catch (ex) {
      if (ex.message === 'AUTH_RELOAD') return;
      if (!background) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-red-500">Failed to load: ${escapeHtml(ex.message)}</td></tr>`;
      }
    }
  }

  // ---------- Boot ----------
  window.LVAuth.requireAuth(() => {
    load();
    document.getElementById('refreshBtn')?.addEventListener('click', () => load());
    document.getElementById('filterInput')?.addEventListener('input', applyFilters);
    document.getElementById('statusFilter')?.addEventListener('change', applyFilters);
  });
})();