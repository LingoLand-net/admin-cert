/* Lingo‑Ville Admin Upload — uses shared LVAuth */
(function () {
  const CFG = window.ADMIN_CONFIG;
  const state = { token: null, uploading: false, lastUrl: null };

  const $ = (id) => document.getElementById(id);
  const show = (el) => el.classList.remove('hidden');
  const hide = (el) => el.classList.add('hidden');

  // Use the shared API wrapper
  const api = (action, payload) => window.LVAuth.api(action, payload);

  function showForm() {
    show($('uploadScreen'));
    hide($('successScreen'));
    if (!$('issuer').value) $('issuer').value = CFG.DEFAULT_ISSUER;
    if (!$('issueDate').value) $('issueDate').value = new Date().toISOString().slice(0, 10);
  }
  function showSuccess(url) {
    hide($('uploadScreen'));
    show($('successScreen'));
    state.lastUrl = url;
    const a = $('liveUrl');
    a.textContent = url; a.href = url;
  }

  // ---- Cloudinary upload with progress ----
  function uploadToCloudinary(url, formData, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText)); }
          catch { reject(new Error('PARSE_ERROR')); }
        } else {
          const msg = xhr.getResponseHeader('x-cld-error') || `HTTP ${xhr.status}`;
          reject(new Error('UPLOAD_FAILED: ' + msg));
        }
      };
      xhr.onerror = () => reject(new Error('NETWORK_ERROR'));
      xhr.send(formData);
    });
  }

  async function uploadPdf(file, folder, baseName) {
    const sig = await api('signUpload', { token: state.token, folder });
    const fd = new FormData();
    const named = new File([file], `${baseName}.pdf`, { type: 'application/pdf' });
    fd.append('file', named);
    fd.append('api_key', sig.apiKey);
    fd.append('timestamp', sig.timestamp);
    fd.append('folder', sig.folder);
    fd.append('signature', sig.signature);
    const endpoint = `https://api.cloudinary.com/v1_1/${sig.cloudName}/raw/upload`;
    const result = await uploadToCloudinary(endpoint, fd, (p) => {
      const pct = Math.round(p * 100);
      $('progressBar').style.width = pct + '%';
      $('progressLabel').textContent = `Uploading ${baseName}.pdf — ${pct}%`;
    });
    if (!result.secure_url) throw new Error('NO_SECURE_URL');
    return { url: result.secure_url, publicId: result.public_id };
  }

  function resetProgress() {
    $('progressBar').style.width = '0%';
    $('progressLabel').textContent = 'Uploading…';
    hide($('progressWrap'));
  }
  function setProgress(t) { show($('progressWrap')); $('progressLabel').textContent = t; }

  // ---- Submit ----
  $('uploadForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (state.uploading) return;

    const err = $('formError'); hide(err);

    const certId = $('certId').value.trim().toLowerCase();
    const studentName = $('studentName').value.trim();
    const course = $('course').value.trim();
    const level = $('level').value.trim();
    const issueDate = $('issueDate').value;
    const issuer = $('issuer').value.trim() || CFG.DEFAULT_ISSUER;
    const email = $('email').value.trim();
    const notify = $('notifyEmail').checked;
    const certFile = $('certFile').files[0];
    const reportFile = $('reportFile').files[0];

    if (!/^[a-z0-9]+(-[a-z0-9]+){2,4}$/.test(certId)) {
      err.textContent = 'Invalid Certificate ID format.'; show(err); return;
    }
    if (!certFile) { err.textContent = 'Certificate PDF is required.'; show(err); return; }
    if (certFile.size > CFG.MAX_FILE_MB * 1024 * 1024) { err.textContent = 'Certificate PDF too large.'; show(err); return; }
    if (reportFile && reportFile.size > CFG.MAX_FILE_MB * 1024 * 1024) { err.textContent = 'Report PDF too large.'; show(err); return; }

    state.uploading = true;
    const submitBtn = $('submitBtn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> Uploading…';

    try {
      setProgress('Uploading certificate…');
      const cert = await uploadPdf(certFile, CFG.CERT_FOLDER, certId);

      let report = { url: '', publicId: '' };
      if (reportFile) {
        setProgress('Uploading report…');
        report = await uploadPdf(reportFile, CFG.REPORT_FOLDER, `${certId}-report`);
      }

      setProgress('Saving record…');
      await api('registerCert', {
        token: state.token,
        data: {
          CertID: certId, StudentName: studentName, Course: course, Level: level,
          IssueDate: issueDate, Issuer: issuer, Email: email,
          CertURL: cert.url, CertPublicID: cert.publicId,
          ReportURL: report.url, ReportPublicID: report.publicId,
          Status: 'active', Notify: notify
        }
      });

      const liveUrl = CFG.PREVIEW_BASE_URL.replace(/\/$/, '') + '/' + certId;
      showSuccess(liveUrl);

    } catch (ex) {
      let msg = ex.message || 'Upload failed.';
      if (msg.includes('DUPLICATE_CERT_ID')) msg = 'This Certificate ID already exists.';
      err.textContent = msg; show(err);
    } finally {
      state.uploading = false;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Upload Certificate';
      resetProgress();
    }
  });

  $('resetBtn').addEventListener('click', () => {
    $('uploadForm').reset();
    $('issuer').value = CFG.DEFAULT_ISSUER;
    $('issueDate').value = new Date().toISOString().slice(0, 10);
    hide($('formError')); resetProgress();
  });

  $('copyUrlBtn').addEventListener('click', async () => {
    if (!state.lastUrl) return;
    try {
      await navigator.clipboard.writeText(state.lastUrl);
      const b = $('copyUrlBtn'); const o = b.textContent;
      b.textContent = 'Copied!'; setTimeout(() => b.textContent = o, 1500);
    } catch (_) {}
  });

  $('uploadAnotherBtn').addEventListener('click', () => {
    $('uploadForm').reset();
    $('issuer').value = CFG.DEFAULT_ISSUER;
    $('issueDate').value = new Date().toISOString().slice(0, 10);
    resetProgress();
    showForm();
  });

  // ---- Boot ----
  window.LVAuth.requireAuth((token) => {
    state.token = token;
    showForm();
  });
})();