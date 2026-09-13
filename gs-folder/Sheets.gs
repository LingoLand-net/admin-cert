/**
 * Lingo‑Ville — Sheet data layer
 */

const SHEET_NAME = 'Certificates';
const HEADERS = [
  'CertID', 'StudentName', 'Course', 'Level', 'IssueDate', 'Issuer',
  'Email', 'CertURL', 'CertPublicID', 'ReportURL', 'ReportPublicID',
  'Status', 'CreatedAt', 'UpdatedAt', 'CreatedBy'
];

/** Run once manually to create/repair the Certificates tab. */
function initSheet() {
  const sheet = getSheet();
  Logger.log('Sheet ready: ' + sheet.getName());
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#00aba5').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 180);
    sheet.setColumnWidth(2, 200);
    sheet.setColumnWidth(8, 300);
    sheet.setColumnWidth(10, 300);
  }
  return sheet;
}

function findRowByCertId(certId) {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const needle = String(certId || '').trim().toLowerCase();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toLowerCase() === needle) return i + 1;
  }
  return -1;
}

function appendCertRecord(record) {
  const sheet = getSheet();
  const row = HEADERS.map(h => record[h] !== undefined ? record[h] : '');
  sheet.appendRow(row);
  return row;
}