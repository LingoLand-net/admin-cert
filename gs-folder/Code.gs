/**
 * Lingo‑Ville Admin Upload — main router
 * Deploy as: Execute as Me, Access: Anyone
 */

const TOKEN_TTL = 21600; // 6 hours (max for CacheService)

function doGet() {
  return jsonResponse({ status: 'success', message: 'Lingo-Ville admin endpoint live.' });
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