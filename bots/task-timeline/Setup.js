/**
 * Setup.js — khởi tạo hạ tầng của bot.
 * Chạy setup() MỘT LẦN trong GAS Editor để tạo workbook + tab + trigger,
 * bật popup uỷ quyền OAuth. An toàn khi chạy lại (idempotent).
 */

/**
 * Tạo/đảm bảo workbook + 4 tab + header + seed Config + trigger hằng ngày.
 * Ghi SPREADSHEET_ID vào Script Properties để các lần sau dùng lại đúng file.
 * @return {string} URL workbook.
 */
function setup() {
  var ss = getOrCreateSpreadsheet_();
  ensureSheets_(ss);
  ensureDailyTrigger_();
  var url = ss.getUrl();
  Logger.log("Setup xong. SPREADSHEET_ID = " + ss.getId());
  Logger.log("Workbook URL: " + url);
  return url;
}

/** Mở workbook theo SPREADSHEET_ID, tạo mới nếu chưa có/không mở được. */
function getOrCreateSpreadsheet_() {
  var cfg = getConfig();
  if (cfg.spreadsheetId) {
    try {
      return SpreadsheetApp.openById(cfg.spreadsheetId);
    } catch (e) {
      Logger.log("SPREADSHEET_ID cũ không mở được, sẽ tạo workbook mới: " + e);
    }
  }
  var ss = SpreadsheetApp.create(WORKBOOK_NAME);
  ss.setSpreadsheetTimeZone(TIMEZONE);
  setSpreadsheetId(ss.getId());
  Logger.log("Đã tạo workbook mới: " + ss.getId());
  return ss;
}

/** Đảm bảo đủ 6 tab đúng thứ tự + header + seed + format. */
function ensureSheets_(ss) {
  var order = [SHEET_TASKS, SHEET_TIMELINE, SHEET_RECURRING, SHEET_CONFIG, SHEET_WHITELIST, SHEET_LOGS];
  order.forEach(function (name, idx) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    ss.setActiveSheet(sh);
    ss.moveActiveSheet(idx + 1);
    ensureHeader_(sh, HEADERS[name]);
  });

  // Xoá tab mặc định "Sheet1" nếu Apps Script tạo kèm.
  var def = ss.getSheetByName("Sheet1");
  if (def && order.indexOf("Sheet1") === -1) ss.deleteSheet(def);

  seedConfig_(ss);
  seedWhitelist_(ss);
  annotateTimeline_(ss);
}

/** Ghi header (đậm, nền xám, freeze hàng 1). Idempotent. */
function ensureHeader_(sh, headers) {
  sh.getRange(1, 1, 1, headers.length)
    .setValues([headers])
    .setFontWeight("bold")
    .setBackground("#f0f0f0");
  sh.setFrozenRows(1);
}

/** Seed danh sách category mặc định nếu tab Config đang trống. */
function seedConfig_(ss) {
  var sh = ss.getSheetByName(SHEET_CONFIG);
  if (sh.getLastRow() < 2) {
    var rows = DEFAULT_CATEGORIES.map(function (c) { return [c]; });
    sh.getRange(2, 1, rows.length, 1).setValues(rows);
  }
}

/** Seed nick Telegram whitelist mặc định nếu tab Whitelist đang trống. */
function seedWhitelist_(ss) {
  var sh = ss.getSheetByName(SHEET_WHITELIST);
  if (sh.getLastRow() < 2) {
    var now = fmtDateTime_(new Date());
    var rows = DEFAULT_WHITELIST.map(function (u) { return [u, "", now]; });
    sh.getRange(2, 1, rows.length, 3).setValues(rows);
  }
}

/** Ghi chú cột duration_min (công thức set khi thêm dòng trong Timeline.js). */
function annotateTimeline_(ss) {
  var sh = ss.getSheetByName(SHEET_TIMELINE);
  var col = HEADERS[SHEET_TIMELINE].indexOf("duration_min") + 1;
  sh.getRange(1, col).setNote("duration_min = (end_at - start_at) * 24 * 60 — set tự động khi ghi dòng.");
}

/** Tạo trigger chạy dailyJob mỗi ngày lúc DAILY_JOB_HOUR (giờ VN). Không tạo trùng. */
function ensureDailyTrigger_() {
  var handler = "dailyJob";
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === handler) return;
  }
  ScriptApp.newTrigger(handler)
    .timeBased()
    .atHour(DAILY_JOB_HOUR)
    .everyDays(1)
    .inTimezone(TIMEZONE)
    .create();
}

/**
 * dailyJob — chạy bởi trigger hằng ngày: sinh task từ Recurring active tới hạn.
 * Logic đầy đủ ở Recurring.js (materializeRecurringForToday). Guard để setup chạy
 * được ngay cả khi Recurring.js chưa tồn tại.
 */
function dailyJob() {
  if (typeof materializeRecurringForToday === "function") {
    materializeRecurringForToday();
  } else {
    Logger.log("dailyJob: chưa có materializeRecurringForToday(), bỏ qua.");
  }
  // Đồng bộ lại Registry (Danh mục tính năng + Nhật ký thay đổi) cho user xem.
  if (typeof syncRegistry === "function") {
    try { syncRegistry(); } catch (e) { Logger.log("dailyJob syncRegistry lỗi: " + e); }
  }
  flushLogs_(); // dailyJob có thể gửi tin nhắn → đẩy log đang đệm xuống Sheet
}

/** Hàm test chạy trong GAS Editor — không cần Telegram. */
function testSetup() {
  var url = setup();
  Logger.log("testSetup OK → " + url);
}
