/**
 * Store.js — lớp truy cập Google Sheets + tiện ích ngày giờ / id / chuỗi.
 * Mọi handler dùng chung. Header cột lấy từ HEADERS (Config.js).
 */

function ss_() { return SpreadsheetApp.openById(getConfig().spreadsheetId); }
function sheet_(name) { return ss_().getSheetByName(name); }

/** Đọc toàn bộ data rows thành mảng object theo header; kèm _row (số hàng sheet, 1-based). */
function readRows_(name) {
  var sh = sheet_(name);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0];
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    if (row.join("") === "") continue; // bỏ hàng trống hoàn toàn
    var obj = { _row: r + 1 };
    for (var c = 0; c < headers.length; c++) obj[headers[c]] = row[c];
    out.push(obj);
  }
  return out;
}

/** Thêm 1 dòng theo thứ tự header. Trả object kèm _row. */
function appendRow_(name, obj) {
  var sh = sheet_(name);
  var row = HEADERS[name].map(function (h) {
    return (obj[h] === undefined || obj[h] === null) ? "" : obj[h];
  });
  sh.appendRow(row);
  obj._row = sh.getLastRow();
  return obj;
}

/** Cập nhật vài trường của một hàng (theo _row). patch: {field:value}. */
function updateRow_(name, rowIdx, patch) {
  var sh = sheet_(name);
  var headers = HEADERS[name];
  Object.keys(patch).forEach(function (k) {
    var col = headers.indexOf(k);
    if (col >= 0) sh.getRange(rowIdx, col + 1).setValue(patch[k]);
  });
}

/** Xoá một hàng theo _row. */
function deleteRow_(name, rowIdx) { sheet_(name).deleteRow(rowIdx); }

/** Tìm hàng theo id. */
function findById_(name, id) {
  var rows = readRows_(name);
  for (var i = 0; i < rows.length; i++) if (String(rows[i].id) === String(id)) return rows[i];
  return null;
}

/** Sinh id kế tiếp dạng PREFIX-0001. */
function nextId_(name, prefix) {
  var max = 0;
  readRows_(name).forEach(function (r) {
    var m = String(r.id).match(/(\d+)\s*$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return prefix + "-" + ("0000" + (max + 1)).slice(-4);
}

/** Danh mục hợp lệ đọc từ tab Config (cột category). */
function getCategories_() {
  var cats = readRows_(SHEET_CONFIG).map(function (r) { return String(r.category).trim(); }).filter(String);
  return cats.length ? cats : DEFAULT_CATEGORIES.slice();
}

/** Chuẩn hoá category: chỉ nhận nếu nằm trong danh mục; ngược lại "". */
function normalizeCategory_(cat) {
  if (!cat) return "";
  var cats = getCategories_();
  for (var i = 0; i < cats.length; i++) if (cats[i].toLowerCase() === String(cat).toLowerCase()) return cats[i];
  return "";
}

// ---- ngày giờ ----
function now_() { return new Date(); }
function todayStr_() { return Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd"); }
function fmtDateTime_(d) { return Utilities.formatDate(d, TIMEZONE, "yyyy-MM-dd HH:mm"); }
function fmtTimeNow_() { return Utilities.formatDate(new Date(), TIMEZONE, "HH:mm"); }

/** Chuẩn hoá "HH:mm" (nhận "8:00","20:5"...). Trả "" nếu sai. */
function normTime_(t) {
  if (!t) return "";
  var m = String(t).match(/^(\d{1,2}):(\d{1,2})$/);
  if (!m) return "";
  var h = parseInt(m[1], 10), mi = parseInt(m[2], 10);
  if (h > 23 || mi > 59) return "";
  return ("0" + h).slice(-2) + ":" + ("0" + mi).slice(-2);
}

/** Số phút giữa 2 "HH:mm" (end - start); nếu end < start coi như qua nửa đêm. */
function diffMinutes_(start, end) {
  var s = String(start).split(":"), e = String(end).split(":");
  var sm = parseInt(s[0], 10) * 60 + parseInt(s[1], 10);
  var em = parseInt(e[0], 10) * 60 + parseInt(e[1], 10);
  var d = em - sm;
  if (d < 0) d += 24 * 60;
  return d;
}

/** Escape HTML cho parse_mode HTML. */
function esc_(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Khớp gần đúng theo tên (lowercase, chứa nhau). */
function matchName_(candidate, target) {
  var a = String(candidate || "").toLowerCase().trim();
  var b = String(target || "").toLowerCase().trim();
  if (!a || !b) return false;
  return a.indexOf(b) >= 0 || b.indexOf(a) >= 0;
}
