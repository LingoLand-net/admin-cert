/**
 * Lingo‑Ville — Cloudinary signed uploads
 * Uses SHA‑256 HMAC signatures (Apps Script supports HMAC-SHA256 natively).
 */

function getCloudinaryConfig() {
  const p = PropertiesService.getScriptProperties();
  const cfg = {
    cloudName: p.getProperty('CLOUDINARY_CLOUD_NAME'),
    apiKey: p.getProperty('CLOUDINARY_API_KEY'),
    apiSecret: p.getProperty('CLOUDINARY_API_SECRET')
  };
  if (!cfg.cloudName || !cfg.apiKey || !cfg.apiSecret) {
    throw new Error('CLOUDINARY_NOT_CONFIGURED');
  }
  return cfg;
}

function signUpload(token, folder) {
  requireToken(token);
  const cfg = getCloudinaryConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const params = {
    timestamp: timestamp,
    folder: folder || 'lingoville/certs'
  };
  const signature = computeHmacSha256(params, cfg.apiSecret);
  return {
    signature: signature,
    timestamp: timestamp,
    apiKey: cfg.apiKey,
    cloudName: cfg.cloudName,
    folder: params.folder
  };
}

function computeHmacSha256(params, secret) {
  const keys = Object.keys(params).sort();
  const toSign = keys.map(k => k + '=' + params[k]).join('&');
  const bytes = Utilities.computeHmacSha256Signature(toSign, secret);
  return bytes.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}