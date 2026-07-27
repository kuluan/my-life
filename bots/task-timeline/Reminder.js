/**
 * Reminder.js — nhắc nhở timeline mỗi 60 phút trong khung REMINDER_START_HOUR..REMINDER_END_HOUR.
 *
 * - Đang có hoạt động chạy dở  → nhắc cập nhật trạng thái (kèm nút Kết thúc / Vẫn đang làm).
 * - Không có hoạt động nào     → nhắc ghi nhanh mình đang làm gì.
 *
 * Chạy bởi trigger theo giờ (ensureHourlyReminderTrigger_, tạo trong setup()).
 */

/** Chat nhận nhắc nhở: Script Properties BOT_CHAT_ID, thiếu thì lấy chat gần nhất trong tab Logs. */
function getReminderChatId_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty("BOT_CHAT_ID");
  if (id) return id;
  var rows = readRows_(SHEET_LOGS);
  for (var i = rows.length - 1; i >= 0; i--) {
    if (rows[i].chat_id) {
      props.setProperty("BOT_CHAT_ID", String(rows[i].chat_id));
      return String(rows[i].chat_id);
    }
  }
  return "";
}

/** Ghi nhớ chat_id để nhắc nhở gửi đúng chỗ (gọi từ doPost, chỉ ghi khi đổi). */
function rememberChatId_(chatId) {
  if (!chatId) return;
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty("BOT_CHAT_ID") !== String(chatId)) {
    props.setProperty("BOT_CHAT_ID", String(chatId));
  }
}

/** 90 → "1h30p"; 45 → "45p". */
function fmtDuration_(mins) {
  var m = Math.max(0, Math.round(Number(mins) || 0));
  if (m < 60) return m + "p";
  var h = Math.floor(m / 60), r = m % 60;
  return h + "h" + (r ? r + "p" : "");
}

/**
 * Trigger mỗi giờ: nhắc nhở timeline nếu đang trong khung giờ cho phép.
 * @return {string} mô tả việc đã làm (để test/log).
 */
function hourlyTimelineReminder() {
  try {
    var hour = Number(Utilities.formatDate(new Date(), TIMEZONE, "H"));
    if (hour < REMINDER_START_HOUR || hour > REMINDER_END_HOUR) {
      return "ngoài khung giờ (" + hour + "h)";
    }
    var chatId = getReminderChatId_();
    if (!chatId) { Logger.log("hourlyTimelineReminder: chưa biết chat_id"); return "thiếu chat_id"; }
    return sendTimelineReminder_(chatId, findOpenBlock_(null));
  } finally {
    flushLogs_();
  }
}

/**
 * Soạn & gửi nội dung nhắc nhở.
 * @param {string} chatId
 * @param {Object|null} open  Block đang mở, hoặc null → nhánh "chưa có hoạt động".
 *        Truyền vào (thay vì tự tra) để test được cả hai nhánh.
 */
function sendTimelineReminder_(chatId, open) {
  var now = fmtTimeNow_();
  if (open) {
    var mins = diffMinutes_(open.start_at, now);
    sendMessage(chatId,
      "⏰ <b>" + esc_(open.title) + "</b> đang chạy " + fmtDuration_(mins) +
      " (từ " + open.start_at + " → giờ là " + now + ")\n" +
      "Cập nhật trạng thái nhé?",
      [[btn("⏹️ Kết thúc", "ls:" + open.id), btn("👍 Vẫn đang làm", "keep:" + open.id)]]);
    return "đã nhắc: đang chạy " + open.id;
  }
  sendMessage(chatId,
    "⏰ <b>" + now + "</b> — chưa có hoạt động nào đang chạy.\n" +
    "Bạn vừa làm gì? Ghi nhanh:\n" +
    "• <code>bắt đầu họp team</code>\n" +
    "• <code>đọc sách từ 14:00 đến 15:00</code>\n" +
    "• Xem lại: /tl",
    [[btn("🕒 Xem timeline hôm nay", "tlview")]]);
  return "đã nhắc: rảnh";
}

/** Tạo trigger nhắc nhở mỗi giờ. Không tạo trùng. */
function ensureHourlyReminderTrigger_() {
  var handler = "hourlyTimelineReminder";
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === handler) return false;
  }
  ScriptApp.newTrigger(handler).timeBased().everyHours(1).create();
  Logger.log("Đã tạo trigger " + handler + " (mỗi giờ).");
  return true;
}

/** Test thủ công: gửi nhắc nhở ngay theo trạng thái thật, bỏ qua ràng buộc khung giờ. */
function testReminderNow() {
  var chatId = getReminderChatId_();
  if (!chatId) return "thiếu chat_id";
  var r = sendTimelineReminder_(chatId, findOpenBlock_(null));
  flushLogs_();
  return r;
}

/** Test riêng nhánh "chưa có hoạt động nào đang chạy". */
function testReminderIdle() {
  var chatId = getReminderChatId_();
  if (!chatId) return "thiếu chat_id";
  var r = sendTimelineReminder_(chatId, null);
  flushLogs_();
  return r;
}

/** Xem trạng thái trigger nhắc nhở (chẩn đoán). */
function debugReminderStatus() {
  var triggers = ScriptApp.getProjectTriggers().map(function (t) {
    return t.getHandlerFunction() + "/" + t.getEventType();
  });
  var open = findOpenBlock_(null);
  return JSON.stringify({
    gio_hien_tai: Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd HH:mm"),
    khung_gio: REMINDER_START_HOUR + "h-" + REMINDER_END_HOUR + "h",
    chat_id_da_biet: !!getReminderChatId_(),
    dang_chay: open ? (open.title + " từ " + open.start_at) : null,
    triggers: triggers
  });
}
