/**
 * Lingo‑Ville — register a new certificate row (+ optional email)
 */

function registerCert(token, data) {
  requireToken(token);
  if (!data) throw new Error('MISSING_DATA');

  // Required fields
  const required = ['CertID', 'StudentName', 'Course', 'CertURL'];
  for (const k of required) {
    if (!data[k]) throw new Error('MISSING_' + k.toUpperCase());
  }

  // Duplicate guard
  if (findRowByCertId(data.CertID) !== -1) {
    throw new Error('DUPLICATE_CERT_ID');
  }

  const now = new Date().toISOString();
  const record = {
    CertID: String(data.CertID).trim().toLowerCase(),
    StudentName: data.StudentName,
    Course: data.Course,
    Level: data.Level || '',
    IssueDate: data.IssueDate || '',
    Issuer: data.Issuer || 'Lingo-Ville Language Centre',
    Email: data.Email || '',
    CertURL: data.CertURL,
    CertPublicID: data.CertPublicID || '',
    ReportURL: data.ReportURL || '',
    ReportPublicID: data.ReportPublicID || '',
    Status: data.Status || 'active',
    CreatedAt: now,
    UpdatedAt: now,
    CreatedBy: 'admin'
  };

  appendCertRecord(record);

  // Optional email — failure is logged but doesn't roll back the row
  if (data.Notify && record.Email) {
    try {
      sendCertNotification(record);
    } catch (err) {
      console.error('Email notification failed: ' + err.message);
    }
  }

  return { record };
}

function sendCertNotification(record) {
  const previewBase = 'https://cert.lingo-ville.com/#/';
  const url = previewBase + record.CertID;
  const subject = 'Your Lingo‑Ville certificate is ready';
  const htmlBody = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto">
      <h2 style="color:#00aba5">Hello ${escapeHtml_(record.StudentName)},</h2>
      <p>Your certificate for <strong>${escapeHtml_(record.Course)}</strong> (${escapeHtml_(record.Level)}) is now live.</p>
      <p><a href="${url}" style="display:inline-block;padding:10px 16px;background:#00aba5;color:#fff;text-decoration:none;border-radius:8px">View Certificate</a></p>
      <p style="font-size:12px;color:#64748b">Certificate ID: <code>${escapeHtml_(record.CertID)}</code></p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0" />
      <p style="font-size:12px;color:#94a3b8">Lingo‑Ville Language Centre · Sfax, Tunisia</p>
    </div>`;
  MailApp.sendEmail({
    to: record.Email,
    subject: subject,
    htmlBody: htmlBody
  });
}

function escapeHtml_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}