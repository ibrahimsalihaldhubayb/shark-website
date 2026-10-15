/**
 * شارك العقارية — استقبال العملاء من الموقع وتوزيعهم على تبويبات قوقل شيت
 *
 * كل إدخال يُضاف في:
 *   1) تبويب نوعه (عملاء الاتصال / رغبة استثمار / طلب تسويق / طلبات الشراء / تسجيل الاهتمام)
 *   2) تبويب «العملاء قاعدة البيانات» (كل العملاء في مكان واحد)
 * والطلبات (type = request) تُضاف في تبويب «الطلبات».
 * التبويب يُنشأ تلقائياً بالعناوين إذا ما كان موجود.
 *
 * طريقة التركيب: انظر apps-script/README.md
 */

var MASTER_SHEET = 'العملاء قاعدة البيانات';
var REQUESTS_SHEET = 'الطلبات';

var TYPE_TO_SHEET = {
  'عميل اتصال':   'عملاء الاتصال',
  'رغبة استثمار': 'رغبة استثمار',
  'عرض عقار':     'طلب تسويق',
  'طلب تسويق':    'طلب تسويق',
  'طلب شراء':     'طلبات الشراء',
  'تسجيل اهتمام': 'تسجيل الاهتمام',
  'اهتمام بعرض':  'تسجيل الاهتمام'
};

var SOURCE_LABELS = {
  employee: 'موظف (صفحة الإضافة)',
  client:   'لوحة الإدارة',
  invest:   'الموقع — رغبة استثمار',
  marketing:'الموقع — طلب تسويق',
  interest: 'الموقع — اهتمام بعرض',
  landing:  'صفحة هبوط',
  promo:    'إعلان ترويجي',
  website:  'الموقع'
};

var CLIENT_HEADERS = ['التاريخ', 'النوع', 'الاسم', 'الجوال', 'الاهتمام', 'العرض', 'الملاحظة', 'الموظف', 'المصدر', 'المعرف'];
var REQUEST_HEADERS = ['التاريخ', 'اسم العميل', 'الجوال', 'الموظف', 'الطلب', 'الميزانية', 'المنطقة', 'المدينة', 'الحي', 'الملاحظات', 'المستندات', 'المعرف'];

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    // صيغة قديمة: {sheet, record}
    if (data.record && typeof data.record === 'object') {
      var rec = data.record; rec.sheet = rec.sheet || data.sheet; data = rec;
    }
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    if (data.type === 'request') {
      appendRow_(ss, REQUESTS_SHEET, REQUEST_HEADERS, [
        data.date || now_(), data.clientName || '', phoneText_(data.phone), data.employeeName || '',
        data.title || '', data.budget || '', data.region || '', data.city || '', data.neighborhood || '',
        data.notes || '', data.documents || '', data.id || ''
      ], data.id);
      return json_({ ok: true, sheet: REQUESTS_SHEET });
    }

    var type = data.type || (data.source === 'promo' ? 'تسجيل اهتمام' : 'عميل اتصال');
    var sheetName = TYPE_TO_SHEET[type] || data.sheet || MASTER_SHEET;
    var row = [
      data.date || now_(), type, data.name || '', phoneText_(data.phone), data.interest || '',
      data.offer || data.offerName || data.offerTitle || '', data.note || '', data.employee || '',
      SOURCE_LABELS[data.source] || data.source || '', data.id || ''
    ];
    appendRow_(ss, sheetName, CLIENT_HEADERS, row, data.id);
    if (sheetName !== MASTER_SHEET) appendRow_(ss, MASTER_SHEET, CLIENT_HEADERS, row, data.id);
    return json_({ ok: true, sheet: sheetName });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return json_({ ok: true, service: 'shark-clients' });
}

/** يضيف صفاً، ويتجاهل التكرار إذا نفس المعرف موجود (عند إعادة الإرسال بعد انقطاع الإنترنت) */
function appendRow_(ss, name, headers, row, id) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.setRightToLeft(true);
  }
  if (sh.getLastRow() === 0) {
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#c8a96e').setFontColor('#1a1000');
    sh.setFrozenRows(1);
  }
  if (id) {
    var idCol = headers.length;
    var last = sh.getLastRow();
    if (last > 1) {
      var found = sh.getRange(2, idCol, last - 1, 1).createTextFinder(String(id)).matchEntireCell(true).findNext();
      if (found) return;
    }
  }
  sh.appendRow(row);
}

/** يحفظ الجوال كنص حتى ما يضيع الصفر في البداية */
function phoneText_(p) {
  p = String(p || '').trim();
  return p ? "'" + p : '';
}

function now_() {
  return Utilities.formatDate(new Date(), 'Asia/Riyadh', 'yyyy/MM/dd HH:mm');
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/** شغّلها مرة وحدة من المحرر لإنشاء كل التبويبات بالعناوين */
function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var names = [MASTER_SHEET];
  Object.keys(TYPE_TO_SHEET).forEach(function (k) { if (names.indexOf(TYPE_TO_SHEET[k]) < 0) names.push(TYPE_TO_SHEET[k]); });
  names.forEach(function (n) { appendRowHeadersOnly_(ss, n, CLIENT_HEADERS); });
  appendRowHeadersOnly_(ss, REQUESTS_SHEET, REQUEST_HEADERS);
}

function appendRowHeadersOnly_(ss, name, headers) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.setRightToLeft(true);
  if (sh.getLastRow() === 0) {
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#c8a96e').setFontColor('#1a1000');
    sh.setFrozenRows(1);
  }
}
