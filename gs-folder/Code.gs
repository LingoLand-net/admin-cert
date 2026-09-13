/**
 * Lingo‑Ville Admin Upload — main router
 * Deploy as: Execute as Me, Access: Anyone
 */

const TOKEN_TTL = 21600; // 6 hours (max for CacheService)

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

  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) throw new Error('CERT_NOT_FOUND');

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

  const needle = String(certId).trim().toLowerCase();
  for (let i = 1; i < data.length; i++) {
    const rowCertId = String(data[i][idx.CertID] || '').trim().toLowerCase();
    if (rowCertId === needle) {
      return {
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
    }
  }
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
    case 'verifyPin':     return verifyPin(body.pin);
    case 'signUpload':    return signUpload(body.token, body.folder);
    case 'registerCert':  return registerCert(body.token, body.data);
    case 'listCerts':     return listCerts(body.token);
    case 'deleteCert':    return deleteCert(body.token, body.certId);
    default: throw new Error('INVALID_ACTION');
  }
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

  // Destroy files first — if this fails, we still want the row gone
  // so the admin can clean up manually instead of being stuck.
  const certDestroy = found.certPublicId
    ? cloudinaryDestroy(found.certPublicId)
    : { ok: false, result: 'missing-public-id' };

  const reportDestroy = found.reportPublicId
    ? cloudinaryDestroy(found.reportPublicId)
    : { ok: false, result: 'no-report' };

  // Delete the row
  sheet.deleteRow(found.row);

  return {
    certId: needle,
    certFile: certDestroy.result,
    reportFile: reportDestroy.result,
    warning: (!certDestroy.ok && found.certPublicId)
      ? 'Cert file not confirmed deleted on Cloudinary — check manually.'
      : null
  };
}