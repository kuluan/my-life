/**
 * Store.js — lớp truy cập Google Sheets + tiện ích ngày giờ / id / chuỗi.
 * Mọi handler dùng chung. Header cột lấy từ HEADERS (Config.js).
 */

var _ssCache_ = null;
/** Mở Spreadsheet, cache trong 1 lần thực thi để tránh mở lại nhiều lần/request (giảm độ trễ). */
function ss_() {
  if (!_ssCache_) _ssCache_ = SpreadsheetApp.openById(getConfig().spreadsheetId);
  return _ssCache_;
}
function sheet_(name) { return ss_().getSheetByName(name); }

/** Chống xử lý trùng khi Telegram gửi lại (retry) cùng 1 update_id. Nhớ trong 10 phút. */
function isDuplicateUpdate_(updateId) {
  var cache = CacheService.getScriptCache();
  var key = "upd_" + updateId;
  if (cache.get(key)) return true;
  cache.put(key, "1", 600);
  return false;
}

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

/** Test dedup update_id — gọi qua `clasp run testDedup`. Kỳ vọng: first=false, second=true. */
function testDedup() {
  var id = "test-" + new Date().getTime();
  var first = isDuplicateUpdate_(id);
  var second = isDuplicateUpdate_(id);
  var result = "first=" + first + " second=" + second;
  Logger.log(result);
  return result;
}

/** Công cụ debug: đọc N dòng cuối tab Logs, gọi qua `clasp run debugReadLogs -p '[20]'`. */
function debugReadLogs(limit) {
  var rows = readRows_(SHEET_LOGS);
  return JSON.stringify(rows.slice(-(limit || 20)));
}

var _logBuffer_ = [];

/**
 * Đưa 1 dòng giao tiếp vào bộ đệm. KHÔNG ghi Sheet ngay — flushLogs_() ghi tất cả
 * bằng một thao tác duy nhất ở cuối request, để webhook phản hồi Telegram nhanh nhất.
 */
function appendLog_(chatId, username, direction, text) {
  _logBuffer_.push([fmtDateTime_(new Date()), chatId || "", username || "", direction, text]);
}

/** Ghi toàn bộ log đang đệm xuống tab Logs (1 thao tác). Lỗi log không làm gãy luồng chính. */
function flushLogs_() {
  if (!_logBuffer_.length) return;
  var rows = _logBuffer_;
  _logBuffer_ = [];
  try {
    var sh = sheet_(SHEET_LOGS);
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, HEADERS[SHEET_LOGS].length).setValues(rows);
  } catch (e) {
    Logger.log("flushLogs_ lỗi: " + e);
  }
}

/**
 * Kiểm tra nick Telegram (không phân biệt @ và hoa/thường) có trong tab Whitelist.
 * Danh sách được cache 5 phút để webhook không phải đọc Sheet mỗi request —
 * sửa tab Whitelist có hiệu lực chậm nhất sau 5 phút (hoặc gọi clearWhitelistCache()).
 */
function isWhitelisted_(username) {
  if (!username) return false;
  var uname = String(username).toLowerCase().replace(/^@/, "");
  return getWhitelist_().indexOf(uname) >= 0;
}

function getWhitelist_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get("whitelist");
  if (cached) return JSON.parse(cached);
  var list = readRows_(SHEET_WHITELIST).map(function (r) {
    return String(r.username || "").toLowerCase().replace(/^@/, "");
  }).filter(String);
  cache.put("whitelist", JSON.stringify(list), 300);
  return list;
}

/** Xoá cache whitelist để áp dụng ngay thay đổi trên tab Whitelist. */
function clearWhitelistCache() {
  CacheService.getScriptCache().remove("whitelist");
  return "Đã xoá cache whitelist.";
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
