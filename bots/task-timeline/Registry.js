/**
 * Registry.js — Danh mục tính năng (Features) + Nhật ký thay đổi (ChangeLog).
 *
 * NGUỒN SỰ THẬT = 2 mảng FEATURES / CHANGELOG bên dưới (git-track, dễ review).
 * setupRegistry() tạo workbook "LP — Registry"; syncRegistry() đổ 2 mảng xuống
 * Google Sheet để user xem trên điện thoại. dailyJob() gọi syncRegistry() mỗi ngày.
 *
 * >>> MỌI AI khi thực hiện thay đổi theo yêu cầu user PHẢI:
 *     1) Thêm 1 dòng LÊN ĐẦU mảng CHANGELOG (thời gian, nội dung yêu cầu, domain, agent, version).
 *     2) Cập nhật FEATURES nếu tính năng thêm/đổi/bỏ.
 *     Xem CLAUDE.md mục 5.1.
 */

var REGISTRY_WORKBOOK_NAME = "LP — Registry";
var SHEET_FEATURES = "Features";
var SHEET_CHANGELOG = "ChangeLog";

var REG_FEATURE_HEADERS = ["domain", "feature", "description", "commands", "status", "since_version"];
var REG_CHANGELOG_HEADERS = ["time", "request", "domain", "agent", "version", "commit"];

// ---------- NGUỒN SỰ THẬT: DANH MỤC TÍNH NĂNG ----------
// status: live | planned | deprecated
var FEATURES = [
  ["task-timeline", "Thêm task", "Thêm việc có kế hoạch: tiêu đề, ngày, ưu tiên, category", "thêm task ... · /task", "live", "v0.1.0"],
  ["task-timeline", "Xem task theo ngày", "Liệt kê task todo/doing kèm nút thao tác", "/tasks · xem task <ngày>", "live", "v0.1.0"],
  ["task-timeline", "Hoàn thành / hoãn / ghi chú / xóa task", "Thao tác task qua nút hoặc câu tự nhiên", "nút ✅🗑 · xong X · hoãn X · note X:", "live", "v0.1.0"],
  ["task-timeline", "Timeline bắt đầu / kết thúc", "Ghi hoạt động thời gian thực, hỗ trợ lùi giờ", "bắt đầu X · xong X · nút ⏹️", "live", "v0.1.0"],
  ["task-timeline", "Timeline khoảng trọn", "Ghi 1 khoảng có giờ bắt đầu–kết thúc", "X từ 20:00 đến 21:30", "live", "v0.1.0"],
  ["task-timeline", "Xem timeline + tổng thời lượng", "Danh sách block trong ngày + tổng phút theo category", "/timeline · /tl", "live", "v0.1.0"],
  ["task-timeline", "Liên kết Task ↔ Timeline", "Bắt đầu từ task → mở timeline; kết thúc → tự hoàn thành task", "nút ▶️ dưới task", "live", "v0.1.0"],
  ["task-timeline", "Việc lặp + streak", "Định nghĩa việc lặp, đếm chuỗi, 3 lượt cứu streak", "/repeat ... daily · /streak · dừng lặp X", "live", "v0.1.0"],
  ["task-timeline", "Tự sinh task lặp hằng ngày", "Trigger 5h sáng tạo task cho việc lặp tới hạn", "(tự động)", "live", "v0.1.0"],
  ["registry", "Danh mục tính năng & Nhật ký thay đổi", "2 sheet cho user xem tính năng hiện có và lịch sử yêu cầu", "(sheet)", "live", "v0.1.0"],
  ["task-timeline", "Whitelist bảo mật", "Chỉ nick Telegram có trong tab Whitelist mới dùng được bot; chặn ngay ở webhook doPost", "(tự động, quản lý qua tab Whitelist)", "live", "v0.1.1"],
  ["repo", "clasp run (Execution API)", "AI tự chạy hàm cần OAuth (setup/syncRegistry/testGeminiParse/setWebhook...) từ CLI, không cần user bấm Run trong GAS Editor", "(hạ tầng dev, không phải lệnh bot)", "live", "v0.1.2"],
  ["task-timeline", "Nhật ký giao tiếp (Logs)", "Ghi lại mọi tin nhắn/callback vào và mọi phản hồi bot gửi ra vào tab Logs để xem lại khi cần", "(tự động, xem tab Logs)", "live", "v0.1.3"],
  ["task-timeline", "Chống trùng lặp update_id", "Bỏ qua update Telegram gửi lại (retry) trong 10 phút — tránh bot trả lời lặp khi webhook chậm", "(tự động, bên trong doPost)", "live", "v0.1.4"],
  ["task-timeline", "Công cụ chẩn đoán webhook", "Xem trạng thái hàng đợi Telegram, đọc log gần nhất, gắn lại webhook khi kẹt", "clasp run debugWebhookInfo / debugReadLogs / resetWebhookDropPending", "live", "v0.1.5"],
  ["task-timeline", "Mục tiêu hằng ngày kèm streak sẵn có", "Tạo việc lặp bằng câu tự nhiên và khai báo luôn chuỗi ngày đang duy trì; sửa lại chuỗi khi cần", "mục tiêu học Duolingo mỗi ngày, hôm nay là ngày 928 · đặt chuỗi X là N", "live", "v0.1.6"]
];

// ---------- NGUỒN SỰ THẬT: NHẬT KÝ THAY ĐỔI (mới nhất lên đầu) ----------
var CHANGELOG = [
  ["2026-07-27 11:32", "Fix: '/tl <việc> từ 10:00' bị ghi nhầm giờ hiện tại — timelineStart giờ nhận cả start_time, timelineStop nhận cả end_time; prompt phân biệt rõ 'từ H1' (bắt đầu) với 'từ H1 đến H2' (khoảng trọn)", "task-timeline", "Claude Opus 5", "v0.1.7", ""],
  ["2026-07-27 11:18", "Thêm mục tiêu hằng ngày bằng câu tự nhiên ('mục tiêu học Duolingo mỗi ngày') và khai báo được chuỗi sẵn có ('hôm nay là ngày 928'); thêm lệnh sửa chuỗi 'đặt chuỗi X là N'", "task-timeline", "Claude Opus 5", "v0.1.6", ""],
  ["2026-07-27 11:06", "Fix bot tắc không trả lời: doPost trả ContentService khiến Apps Script đáp 302, Telegram không xác nhận đã giao nên retry mãi 1 update và chặn mọi tin sau. Bỏ giá trị trả về → đáp 200. Kèm tối ưu tốc độ: gộp ghi Logs 1 lần + cache whitelist 5 phút", "task-timeline", "Claude Opus 5", "v0.1.5", ""],
  ["2026-07-27 10:33", "Fix sự cố bot spam trả lời lặp: thêm chống trùng lặp theo update_id (Telegram retry do webhook chậm) + cache Spreadsheet handle giảm độ trễ", "task-timeline", "Claude Sonnet 5", "v0.1.4", ""],
  ["2026-07-27 10:35", "Thêm tab Logs: ghi lại mọi giao tiếp vào/ra với bot (tin nhắn, callback, phản hồi) để xem lại khi cần kiểm tra", "task-timeline", "Claude Sonnet 5", "v0.1.3", ""],
  ["2026-07-27 10:20", "Bật clasp run (Execution API): thêm executionApi + oauthScopes tường minh vào appsscript.json, tạo OAuth client riêng (project GCP 37826454403) — AI tự chạy setup()/syncRegistry()/... không cần user bấm Run trong GAS Editor nữa", "repo", "Claude Sonnet 5", "v0.1.2", ""],
  ["2026-07-25 11:30", "Thêm bảo mật whitelist: bot chỉ trả lời nick Telegram có trong tab Whitelist (workbook Task&Timeline); seed sẵn k4luan; chặn tại doPost", "task-timeline", "Claude Sonnet 5", "v0.1.1", ""],
  ["2026-07-25 11:08", "Tạo file handoff tóm tắt dự án để máy Claude 'dispatch' pull repo là sẵn sàng code tính năng yêu cầu từ điện thoại", "repo", "Claude Opus 4.8", "v0.1.0", ""],
  ["2026-07-25 10:55", "Thêm Registry: sheet Danh mục tính năng + Nhật ký thay đổi + rule bắt buộc AI cập nhật", "registry", "Claude Opus 4.8", "v0.1.0", ""],
  ["2026-07-25 10:45", "Xây bot task-timeline: workbook 4 tab, parser Gemini, Task/Timeline/Recurring + streak, deploy webhook", "task-timeline", "Claude Opus 4.8", "v0.1.0", ""],
  ["2026-07-25 10:20", "Khởi tạo repo My-life mới + rule CLAUDE.md chặt chẽ + docs kiến trúc (viết mới song song hệ cũ)", "repo", "Claude Opus 4.8", "-", ""]
];

// ---------- SHEET ----------

function registrySs_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty("REGISTRY_SPREADSHEET_ID");
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) { Logger.log("Registry ID cũ lỗi, tạo mới: " + e); }
  }
  var ss = SpreadsheetApp.create(REGISTRY_WORKBOOK_NAME);
  ss.setSpreadsheetTimeZone(TIMEZONE);
  props.setProperty("REGISTRY_SPREADSHEET_ID", ss.getId());
  Logger.log("Đã tạo Registry workbook: " + ss.getId());
  return ss;
}

/** Tạo workbook Registry + 2 tab + đổ dữ liệu. Chạy 1 lần trong GAS Editor. */
function setupRegistry() {
  var ss = registrySs_();
  ensureRegSheet_(ss, SHEET_FEATURES, REG_FEATURE_HEADERS);
  ensureRegSheet_(ss, SHEET_CHANGELOG, REG_CHANGELOG_HEADERS);
  var def = ss.getSheetByName("Sheet1");
  if (def) ss.deleteSheet(def);
  syncRegistry();
  Logger.log("setupRegistry OK → " + ss.getUrl());
  return ss.getUrl();
}

function ensureRegSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold").setBackground("#f0f0f0");
  sh.setFrozenRows(1);
  return sh;
}

/** Đổ FEATURES + CHANGELOG từ code xuống sheet (ghi đè vùng dữ liệu, giữ header). */
function syncRegistry() {
  var ss = registrySs_();
  writeRegBlock_(ss, SHEET_FEATURES, REG_FEATURE_HEADERS, FEATURES);
  writeRegBlock_(ss, SHEET_CHANGELOG, REG_CHANGELOG_HEADERS, CHANGELOG);
  Logger.log("syncRegistry OK: " + FEATURES.length + " tính năng, " + CHANGELOG.length + " thay đổi.");
}

function writeRegBlock_(ss, name, headers, rows) {
  var sh = ss.getSheetByName(name) || ensureRegSheet_(ss, name, headers);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, headers.length).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
}
