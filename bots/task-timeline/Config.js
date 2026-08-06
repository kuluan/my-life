/**
 * Config.js — hằng số & truy cập Script Properties.
 * Bí mật (token, api key, spreadsheet id) KHÔNG hardcode ở đây — đọc từ Script Properties.
 * Xem CLAUDE.md mục 6 (bảo mật).
 */

// Version — chỉ bump PATCH mỗi lần deploy (CLAUDE.md mục 4).
var APP_VERSION = "v0.1.16";

// Tên workbook DB của domain này.
var WORKBOOK_NAME = "LP — Task & Timeline 2026";

// Tên các tab.
var SHEET_TASKS = "Tasks";
var SHEET_TIMELINE = "Timeline";
var SHEET_RECURRING = "Recurring";
var SHEET_CONFIG = "Config";
var SHEET_WHITELIST = "Whitelist";
var SHEET_LOGS = "Logs";

// Header chuẩn từng tab (thứ tự cột là hợp đồng — không đổi tuỳ tiện).
var HEADERS = {
  "Tasks": ["id", "created_at", "date", "title", "status", "priority", "category", "note", "started_at", "completed_at", "repeat"],
  "Timeline": ["id", "date", "title", "start_at", "end_at", "duration_min", "category", "task_id", "note"],
  "Recurring": ["id", "title", "schedule", "category", "active", "current_streak", "longest_streak", "last_done_date", "streak_saves", "created_at"],
  "Config": ["category"],
  "Whitelist": ["username", "note", "added_at"],
  "Logs": ["timestamp", "chat_id", "username", "direction", "text"]
};

// Category seed lần đầu vào tab Config (user sửa sau tuỳ ý).
var DEFAULT_CATEGORIES = ["Gia đình", "Công việc", "Dev", "Sức khỏe", "Học tập", "Cá nhân", "Khác"];

// Nick Telegram (không @, không phân biệt hoa/thường) được phép dùng bot — seed lần đầu vào tab Whitelist.
var DEFAULT_WHITELIST = ["k4luan"];

// Trạng thái task hợp lệ.
var TASK_STATUS = { TODO: "todo", DOING: "doing", DONE: "done", DROPPED: "dropped" };

// Số streak-save tối đa (bỏ lỡ vẫn cứu được chuỗi).
var MAX_STREAK_SAVES = 3;

// Giờ chạy trigger sinh task lặp hằng ngày (giờ VN).
var DAILY_JOB_HOUR = 5;

// Khung giờ nhắc nhở timeline mỗi 60 phút (giờ VN, bao gồm cả 2 đầu).
var REMINDER_START_HOUR = 6;
var REMINDER_END_HOUR = 21;

var TIMEZONE = "Asia/Ho_Chi_Minh";

// URL /exec của deployment web app duy nhất (khớp DEPLOYMENT_ID trong README).
var WEBHOOK_EXEC_URL = "https://script.google.com/macros/s/AKfycbwu-BnaS3JeT2r5nXLUKBBYPCZA8DYeSc7n2CaT8MeIUdGu4e7VJNq6HtrsJuCxyAqR/exec";

/** Đọc cấu hình runtime từ Script Properties. */
function getConfig() {
  var props = PropertiesService.getScriptProperties();
  return {
    telegramToken: props.getProperty("TELEGRAM_BOT_TOKEN") || "",
    geminiApiKey: props.getProperty("GEMINI_API_KEY") || "",
    spreadsheetId: props.getProperty("SPREADSHEET_ID") || "",
    botChatId: props.getProperty("BOT_CHAT_ID") || ""
  };
}

/** Ghi lại SPREADSHEET_ID sau khi setup() tạo workbook. */
function setSpreadsheetId(id) {
  PropertiesService.getScriptProperties().setProperty("SPREADSHEET_ID", id);
}
