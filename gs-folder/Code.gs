/**
 * Lingo‑Ville Admin Upload — main router
 */

const TOKEN_TTL = 21600; // 6 hours (max for CacheService)
const LIST_CACHE_KEY = 'list_certs_v1';
const LIST_CACHE_TTL = 30; // seconds

function doGet(e) {
  try {
    const action = e && e.parameter ? e.parameter.action : null;

    if (action === 'getCert') {
      const data = getCert(e.parameter.id);
      return jsonResponse({ status: 'success', data });
    }

    return jsonResponse({ status: 'success', message: 'Lingo-Ville public endpoint live.' });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.message || String(err) });
  }
}

function getCert(certId) {
  if (!certId) throw new Error('MISSING_CERT_ID');

  const normalized = String(certId).trim().toLowerCase();
  const cacheKey = 'cert_' + normalized;
  const cache = CacheService.getScriptCache();

  const hit = cache.get(cacheKey);
  if (hit) {
    const parsed = JSON.parse(hit);
    if (parsed && parsed.__not_found) throw new Error('CERT_NOT_FOUND');
    return parsed;
  }

  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) {
    cache.put(cacheKey, JSON.stringify({ __not_found: true }), 60);
    throw new Error('CERT_NOT_FOUND');
  }

  const headers = data[0];
  const idx = {
    CertID:      headers.indexOf('CertID'),
    StudentName: headers.indexOf('StudentName'),
    Course:      headers.indexOf('Course'),
    Level:       headers.indexOf('Level'),
    IssueDate:   headers.indexOf('IssueDate'),
    Issuer:      headers.indexOf('Issuer'),
    CertURL:     headers.indexOf('CertURL'),
    ReportURL:   headers.indexOf('ReportURL'),
    Status:      headers.indexOf('Status')
  };
  if (idx.CertID === -1) throw new Error('SCHEMA_ERROR');

  for (let i = 1; i < data.length; i++) {
    const rowCertId = String(data[i][idx.CertID] || '').trim().toLowerCase();
    if (rowCertId === normalized) {
      const result = {
        CertID:      String(data[i][idx.CertID] || ''),
        StudentName: String(data[i][idx.StudentName] || ''),
        Course:      String(data[i][idx.Course] || ''),
        Level:       String(data[i][idx.Level] || ''),
        IssueDate:   data[i][idx.IssueDate] instanceof Date
                       ? data[i][idx.IssueDate].toISOString()
                       : String(data[i][idx.IssueDate] || ''),
        Issuer:      String(data[i][idx.Issuer] || 'Lingo-Ville Language Centre'),
        CertURL:     String(data[i][idx.CertURL] || ''),
        ReportURL:   String(data[i][idx.ReportURL] || ''),
        Status:      String(data[i][idx.Status] || 'active').toLowerCase()
      };
      cache.put(cacheKey, JSON.stringify(result), 300);
      return result;
    }
  }

  cache.put(cacheKey, JSON.stringify({ __not_found: true }), 60);
  throw new Error('CERT_NOT_FOUND');
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('EMPTY_REQUEST');
    }
    const body = JSON.parse(e.postData.contents);
    const data = route(body);
    return jsonResponse({ status: 'success', data });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.message || String(err) });
  }
}

function route(body) {
  const action = body.action;
  switch (action) {
    case 'verifyPin':
      return verifyPin(body.pin);

    case 'signUpload':
      return signUpload(body.token, body.folder);

    case 'registerCert': {
      const result = registerCert(body.token, body.data);
      // Bust the list cache so the dashboard sees the new cert immediately.
      try { CacheService.getScriptCache().remove(LIST_CACHE_KEY); } catch (_) {}
      return result;
    }

    case 'listCerts':
      return listCertsCached(body.token);

    case 'deleteCert': {
      const result = deleteCert(body.token, body.certId);
      // Bust both the list cache and the individual cert cache.
      try { CacheService.getScriptCache().remove(LIST_CACHE_KEY); } catch (_) {}
      return result;
    }

    default:
      throw new Error('INVALID_ACTION');
  }
}

/**
 * Cached wrapper around Sheets.gs#listCerts.
 * 30-second TTL — plenty for a dashboard that a handful of admins refresh.
 */
function listCertsCached(token) {
  requireToken(token);
  const cache = CacheService.getScriptCache();
  const hit = cache.get(LIST_CACHE_KEY);
  if (hit) {
    try { return JSON.parse(hit); } catch (_) { /* fall through */ }
  }
  const fresh = listCerts(token);
  try { cache.put(LIST_CACHE_KEY, JSON.stringify(fresh), LIST_CACHE_TTL); } catch (_) {}
  return fresh;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------------- Auth ---------------- */

function verifyPin(pin) {
  const expected = PropertiesService.getScriptProperties().getProperty('ADMIN_PIN');
  if (!expected) throw new Error('ADMIN_PIN_NOT_SET');
  if (!pin || String(pin) !== String(expected)) throw new Error('INVALID_PIN');
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put('tok_' + token, 'ok', TOKEN_TTL);
  return { token };
}

function requireToken(token) {
  if (!token) throw new Error('NO_TOKEN');
  const hit = CacheService.getScriptCache().get('tok_' + token);
  if (!hit) throw new Error('TOKEN_EXPIRED');
}

function deleteCert(token, certId) {
  requireToken(token);
  if (!certId) throw new Error('MISSING_CERT_ID');

  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idx = {
    certId:         headers.indexOf('CertID'),
    certPublicId:   headers.indexOf('CertPublicID'),
    reportPublicId: headers.indexOf('ReportPublicID')
  };
  if (idx.certId === -1) throw new Error('SCHEMA_MISSING_CERTID');

  const needle = String(certId).trim().toLowerCase();
  let found = null;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idx.certId]).trim().toLowerCase() === needle) {
      found = {
        row: i + 1,
        certPublicId:   idx.certPublicId   !== -1 ? String(data[i][idx.certPublicId]   || '') : '',
        reportPublicId: idx.reportPublicId !== -1 ? String(data[i][idx.reportPublicId] || '') : ''
      };
      break;
    }
  }
  if (!found) throw new Error('PROFILE_NOT_FOUND');

  const certDestroy = found.certPublicId
    ? cloudinaryDestroy(found.certPublicId)
    : { ok: false, result: 'missing-public-id' };

  const reportDestroy = found.reportPublicId
    ? cloudinaryDestroy(found.reportPublicId)
    : { ok: false, result: 'no-report' };

  sheet.deleteRow(found.row);

  // Bust the individual cert cache so the public page reflects the deletion.
  try { CacheService.getScriptCache().remove('cert_' + needle); } catch (_) {}

  return {
    certId: needle,
    certFile: certDestroy.result,
    reportFile: reportDestroy.result,
    warning: (!certDestroy.ok && found.certPublicId)
      ? 'Cert file not confirmed deleted on Cloudinary — check manually.'
      : null
  };
}

/* ---------------- Warm-up ---------------- */

function keepWarm() {
  return true;
}