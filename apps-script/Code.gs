/**
 * شارك العقارية — استقبال العملاء من الموقع وتوزيعهم على تبويبات قوقل شيت
 *
 * كل إدخال يُضاف في:
 *   1) تبويب نوعه (تسجيل عميل جديد / رغبة استثمار / طلب تسويق / طلبات الشراء / تسجيل الاهتمام)
 *   2) تبويب «العملاء قاعدة البيانات» (كل العملاء في مكان واحد)
 *   3) إذا كان العميل مرتبط بعرض: تبويب خاص بالعرض نفسه (عرض - اسم العرض)
 * والطلبات (type = request) تُضاف في تبويب «الطلبات».
 * وعند نشر عرض في الموقع (type = offer) يُنشأ تبويبه ويُضاف لتبويب «العروض».
 * وكل إعلان (type = promo) له تبويب «إعلان - العنوان» ويُضاف لتبويب «الإعلانات»، والمسجلين منه ينزلون فيه.
 * التبويب يُنشأ تلقائياً بالعناوين إذا ما كان موجود.
 *
 * طريقة التركيب: انظر apps-script/README.md
 */

var MASTER_SHEET = 'العملاء قاعدة البيانات';
var REQUESTS_SHEET = 'الطلبات';
var OFFERS_SHEET = 'العروض';
var SCRIPT_VERSION = 4;
var PROMOS_SHEET = 'الإعلانات';
var ERRORS_SHEET = 'سجل الأخطاء';

var TYPE_TO_SHEET = {
  'عميل اتصال':   'تسجيل عميل جديد',
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
  'project-booking':  'الموقع — طلب حجز في مشروع',
  'project-interest': 'الموقع — اهتمام بمشروع',
  website:  'الموقع'
};

var CLIENT_HEADERS = ['التاريخ', 'النوع', 'الاسم', 'الجوال', 'الاهتمام', 'العرض', 'الملاحظة', 'الموظف', 'المصدر', 'المعرف'];
var PROMO_INDEX_HEADERS = ['رقم الإعلان', 'عنوان الإعلان', 'رابط الإعلان', 'عدد المسجلين', 'التبويب', 'تاريخ الإنشاء'];
var OFFER_INDEX_HEADERS = ['رقم العرض', 'اسم العرض', 'النوع', 'المدينة', 'الحي', 'السعر', 'رابط صفحة الهبوط', 'عدد المهتمين', 'التبويب', 'تاريخ النشر'];
var REQUEST_HEADERS = ['التاريخ', 'اسم العميل', 'الجوال', 'الموظف', 'الطلب', 'الميزانية', 'المنطقة', 'المدينة', 'الحي', 'الملاحظات', 'المستندات', 'المعرف'];

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var got = readPayload_(e);
    var data = got.data;
    // صيغة قديمة: {sheet, record}
    if (data.record && typeof data.record === 'object') {
      var rec = data.record; rec.sheet = rec.sheet || data.sheet; data = rec;
    }
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    if (data.type === 'offer') {
      var osh = ensureOfferSheet_(ss, data.offerId, data.title, data);
      return json_({ ok: true, sheet: osh.getName() });
    }

    if (data.type === 'promo') {
      var psh = ensurePromoSheet_(ss, data.promoId, data.title, data);
      return json_({ ok: true, sheet: psh.getName() });
    }

    if (data.type === 'request') {
      appendRow_(ss, REQUESTS_SHEET, REQUEST_HEADERS, [
        data.date || now_(), data.clientName || '', phoneText_(data.phone), data.employeeName || '',
        data.title || '', data.budget || '', data.region || '', data.city || '', data.neighborhood || '',
        data.notes || '', data.documents || '', data.id || ''
      ], data.id);
      return json_({ ok: true, sheet: REQUESTS_SHEET });
    }

    if (!data.name && !data.phone) {
      logError_(ss, 'وصل طلب بدون اسم ورقم', got.raw, e);
      return json_({ ok: false, error: 'empty payload' });
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
    var offerTitle = data.offerTitle || data.offerName || data.offer || '';
    var offerSheet = null;
    if (data.offerId || offerTitle) {
      offerSheet = ensureOfferSheet_(ss, data.offerId || '', offerTitle, null);
      appendRow_(ss, offerSheet.getName(), CLIENT_HEADERS, row, data.id);
      updateOfferIndex_(ss, data.offerId || '', offerTitle, null, offerSheet);
    }
    var promoSheet = null;
    if (data.promoId) {
      promoSheet = ensurePromoSheet_(ss, data.promoId, data.promoTitle || '', null);
      appendRow_(ss, promoSheet.getName(), CLIENT_HEADERS, row, data.id);
      updatePromoIndex_(ss, data.promoId, data.promoTitle || '', null, promoSheet);
    }
    return json_({ ok: true, sheet: sheetName, offerSheet: offerSheet ? offerSheet.getName() : '', promoSheet: promoSheet ? promoSheet.getName() : '' });
  } catch (err) {
    try { logError_(SpreadsheetApp.getActiveSpreadsheet(), String(err), (e && e.postData && e.postData.contents) || '', e); } catch (x) {}
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  // doPostOk = false معناها فيه ملف ثاني في المشروع فيه doPost قديمة تغطي على هذي
  return json_({ ok: true, service: 'shark-clients', version: SCRIPT_VERSION, doPostOk: String(doPost).indexOf('readPayload_') > -1 });
}

/** يقرأ البيانات سواء وصلت كنموذج (data=...) أو JSON مباشر أو حقول منفصلة */
function readPayload_(e) {
  var raw = '';
  if (e && e.parameter && e.parameter.data) raw = e.parameter.data;
  else if (e && e.postData && e.postData.contents) raw = e.postData.contents;
  var data = {};
  try { data = JSON.parse(raw || '{}'); } catch (x) { data = {}; }
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch (x) { data = {}; } }
  if (!data || typeof data !== 'object') data = {};
  if (!Object.keys(data).length && e && e.parameter) {
    Object.keys(e.parameter).forEach(function (k) { if (k !== 'data') data[k] = e.parameter[k]; });
  }
  return { data: data, raw: raw };
}

function logError_(ss, msg, raw, e) {
  var sh = ss.getSheetByName(ERRORS_SHEET);
  if (!sh) { sh = ss.insertSheet(ERRORS_SHEET); sh.setRightToLeft(true); sh.appendRow(['التاريخ', 'الخطأ', 'البيانات الواصلة', 'نوع المحتوى']); sh.setFrozenRows(1); }
  sh.appendRow([now_(), msg, String(raw || JSON.stringify((e && e.parameter) || {})).slice(0, 5000), (e && e.postData && e.postData.type) || '']);
}

/** تبويب خاص لكل عرض. يُحفظ ربط رقم العرض بالتبويب، فلو تغيّر اسم العرض أو التبويب يبقى نفس التبويب */
function ensureOfferSheet_(ss, offerId, title, info) {
  var props = PropertiesService.getDocumentProperties();
  var key = 'offer:' + (offerId || ('name:' + title));
  var sh = null;
  var savedId = props.getProperty(key);
  if (savedId) {
    sh = ss.getSheets().filter(function (x) { return String(x.getSheetId()) === savedId; })[0] || null;
  }
  if (!sh) {
    var base = ('عرض - ' + (title || offerId || 'بدون اسم')).replace(/[:\\\/?*\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
    if (base.length > 80) base = base.slice(0, 80).trim();
    var name = base;
    if (ss.getSheetByName(name) && offerId) name = (base + ' ' + offerId).slice(0, 99);
    sh = ss.getSheetByName(name) || ss.insertSheet(name);
    sh.setRightToLeft(true);
    if (sh.getLastRow() === 0) {
      sh.appendRow(CLIENT_HEADERS);
      sh.getRange(1, 1, 1, CLIENT_HEADERS.length).setFontWeight('bold').setBackground('#c8a96e').setFontColor('#1a1000');
      sh.setFrozenRows(1);
    }
    sh.setTabColor('#c8a96e');
    props.setProperty(key, String(sh.getSheetId()));
  }
  updateOfferIndex_(ss, offerId, title, info, sh);
  return sh;
}

/** تبويب خاص لكل إعلان، بنفس فكرة تبويبات العروض */
function ensurePromoSheet_(ss, promoId, title, info) {
  var props = PropertiesService.getDocumentProperties();
  var key = 'promo:' + promoId;
  var sh = null;
  var savedId = props.getProperty(key);
  if (savedId) {
    sh = ss.getSheets().filter(function (x) { return String(x.getSheetId()) === savedId; })[0] || null;
  }
  if (!sh) {
    var base = ('إعلان - ' + (title || promoId)).replace(/[:\\\/?*\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
    if (base.length > 80) base = base.slice(0, 80).trim();
    var name = base;
    if (ss.getSheetByName(name)) name = (base + ' ' + promoId).slice(0, 99);
    sh = ss.getSheetByName(name) || ss.insertSheet(name);
    sh.setRightToLeft(true);
    if (sh.getLastRow() === 0) {
      sh.appendRow(CLIENT_HEADERS);
      sh.getRange(1, 1, 1, CLIENT_HEADERS.length).setFontWeight('bold').setBackground('#c8a96e').setFontColor('#1a1000');
      sh.setFrozenRows(1);
    }
    sh.setTabColor('#5b8def');
    props.setProperty(key, String(sh.getSheetId()));
  }
  updatePromoIndex_(ss, promoId, title, info, sh);
  return sh;
}

/** تبويب «الإعلانات»: صف لكل إعلان مع رابطه وعدد المسجلين */
function updatePromoIndex_(ss, promoId, title, info, promoSheet) {
  var idx = ss.getSheetByName(PROMOS_SHEET);
  if (!idx) { idx = ss.insertSheet(PROMOS_SHEET); idx.setRightToLeft(true); }
  if (idx.getLastRow() === 0) {
    idx.appendRow(PROMO_INDEX_HEADERS);
    idx.getRange(1, 1, 1, PROMO_INDEX_HEADERS.length).setFontWeight('bold').setBackground('#c8a96e').setFontColor('#1a1000');
    idx.setFrozenRows(1);
  }
  var last = idx.getLastRow();
  var rowNum = 0;
  if (last > 1) {
    var hit = idx.getRange(2, 1, last - 1, 1).createTextFinder(String(promoId)).matchEntireCell(true).findNext();
    if (hit) rowNum = hit.getRow();
  }
  if (!rowNum) {
    idx.appendRow([promoId, title || '', '', 0, '', now_()]);
    rowNum = idx.getLastRow();
  }
  if (info) idx.getRange(rowNum, 2, 1, 2).setValues([[title || '', info.url || '']]);
  idx.getRange(rowNum, 4).setValue(Math.max(0, promoSheet.getLastRow() - 1));
  idx.getRange(rowNum, 5).setFormula('=HYPERLINK("#gid=' + promoSheet.getSheetId() + '","' + promoSheet.getName().replace(/"/g, '') + '")');
}

/** تبويب «العروض»: صف لكل عرض مع رابط صفحة الهبوط وعدد المهتمين */
function updateOfferIndex_(ss, offerId, title, info, offerSheet) {
  var idx = ss.getSheetByName(OFFERS_SHEET);
  if (!idx) { idx = ss.insertSheet(OFFERS_SHEET); idx.setRightToLeft(true); }
  if (idx.getLastRow() === 0) {
    idx.appendRow(OFFER_INDEX_HEADERS);
    idx.getRange(1, 1, 1, OFFER_INDEX_HEADERS.length).setFontWeight('bold').setBackground('#c8a96e').setFontColor('#1a1000');
    idx.setFrozenRows(1);
  }
  var key = offerId || title;
  var last = idx.getLastRow();
  var rowNum = 0;
  if (last > 1) {
    var hit = idx.getRange(2, offerId ? 1 : 2, last - 1, 1).createTextFinder(String(key)).matchEntireCell(true).findNext();
    if (hit) rowNum = hit.getRow();
  }
  if (!rowNum) {
    idx.appendRow([offerId || '', title || '', '', '', '', '', '', 0, '', now_()]);
    rowNum = idx.getLastRow();
  }
  if (info) {
    idx.getRange(rowNum, 1, 1, 7).setValues([[offerId || '', title || '', info.offerType || '', info.city || '', info.district || '', info.price || '', info.url || '']]);
  }
  idx.getRange(rowNum, 8).setValue(Math.max(0, offerSheet.getLastRow() - 1));
  idx.getRange(rowNum, 9).setFormula('=HYPERLINK("#gid=' + offerSheet.getSheetId() + '","' + offerSheet.getName().replace(/"/g, '') + '")');
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
  appendRowHeadersOnly_(ss, OFFERS_SHEET, OFFER_INDEX_HEADERS);
  appendRowHeadersOnly_(ss, PROMOS_SHEET, PROMO_INDEX_HEADERS);
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
