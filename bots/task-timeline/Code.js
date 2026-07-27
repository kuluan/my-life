/**
 * Code.js — webhook doPost + router + help/start + thiết lập webhook & menu.
 * Đồng bộ 4 vị trí lệnh: help() · setupBotCommands() · start() · router (CLAUDE.md mục 5).
 */

/**
 * doPost — điểm vào webhook Telegram.
 *
 * ⚠️ TUYỆT ĐỐI KHÔNG `return ContentService.createTextOutput(...)` ở đây.
 * Trả về nội dung khiến Apps Script đáp 302 redirect sang script.googleusercontent.com;
 * Telegram coi 302 là phản hồi sai, không bao giờ xác nhận đã giao, retry mãi một update
 * và CHẶN toàn bộ tin phía sau (bot trả lời 1 tin rồi tắc). Trả về rỗng → Apps Script
 * đáp thẳng 200, Telegram chấp nhận. (Đã trả giá bằng sự cố ngày 2026-07-27.)
 */
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (data.update_id !== undefined && isDuplicateUpdate_(data.update_id)) {
      Logger.log("doPost: bỏ qua update_id trùng (Telegram gửi lại) — " + data.update_id);
      return;
    }
    var from = (data.callback_query && data.callback_query.from) || (data.message && data.message.from);
    var chatId = (data.message && data.message.chat && data.message.chat.id) ||
      (data.callback_query && data.callback_query.message && data.callback_query.message.chat.id);
    var inboundText = data.callback_query ? ("[callback] " + (data.callback_query.data || "")) : (data.message && data.message.text);
    appendLog_(chatId, from && from.username, "in", inboundText);
    if (!isWhitelisted_(from && from.username)) {
      Logger.log("doPost: từ chối (không whitelist) — " + JSON.stringify(from));
      if (data.callback_query) {
        answerCallbackQuery(data.callback_query.id, "🔒 Bạn không có quyền dùng bot này.");
      } else if (data.message && data.message.chat) {
        sendMessage(data.message.chat.id, "🔒 Bot này chỉ phục vụ người dùng được cấp quyền.");
      }
      return;
    }
    if (data.callback_query) {
      handleCallback_(data.callback_query);
    } else if (data.message && data.message.text) {
      routeMessage_(data.message);
    }
  } catch (err) {
    Logger.log("doPost error: " + err + " | " + (e && e.postData ? e.postData.contents : ""));
  } finally {
    flushLogs_(); // ghi log 1 lần ở cuối, kể cả khi có lỗi
  }
  return;
}

function routeMessage_(message) {
  var chatId = message.chat.id;
  var text = String(message.text).trim();
  var lower = text.toLowerCase();

  // Slash deterministic (không tốn Gemini).
  if (lower === "/start") { sendMessage(chatId, start()); return; }
  if (lower === "/help") { sendMessage(chatId, help()); return; }
  if (lower === "/tasks") { listTasks(chatId, todayStr_()); return; }
  if (lower === "/timeline" || lower === "/tl") { timelineList(chatId, todayStr_()); return; }
  if (lower === "/streak") { streakView(chatId); return; }

  // Còn lại (kể cả slash có tham số, và mọi câu tự nhiên) → Gemini.
  var intent = geminiParse(text, getCategories_());
  if (!intent || !intent.intent) { sendMessage(chatId, "🤔 Chưa hiểu ý. Gõ /help để xem cú pháp."); return; }
  dispatchIntent_(chatId, intent);
}

function dispatchIntent_(chatId, i) {
  switch (i.intent) {
    case "task_add": addTaskFromIntent(chatId, i); break;
    case "task_list": listTasks(chatId, i.date || todayStr_()); break;
    case "task_complete": completeTaskByTarget(chatId, i.target || i.title); break;
    case "task_postpone": postponeTask(chatId, i); break;
    case "task_note": noteTask(chatId, i); break;
    case "task_delete": deleteTaskByTarget(chatId, i.target || i.title); break;
    case "timeline_start": timelineStart(chatId, i); break;
    case "timeline_stop": timelineStop(chatId, i); break;
    case "timeline_range": timelineRange(chatId, i); break;
    case "timeline_list": timelineList(chatId, i.date || todayStr_()); break;
    case "timeline_delete": deleteTimelineByTarget(chatId, i.target || i.title); break;
    case "recurring_add": recurringAdd(chatId, i); break;
    case "streak_view": streakView(chatId); break;
    case "streak_set": streakSet(chatId, i); break;
    case "recurring_stop": recurringStop(chatId, i.target || i.title); break;
    case "help": sendMessage(chatId, help()); break;
    default: sendMessage(chatId, "🤔 Chưa hiểu ý. Gõ /help để xem cú pháp.");
  }
}

function handleCallback_(cq) {
  var chatId = cq.message.chat.id;
  var cbId = cq.id;
  var data = String(cq.data || "");
  var idx = data.indexOf(":");
  var action = idx >= 0 ? data.slice(0, idx) : data;
  var id = idx >= 0 ? data.slice(idx + 1) : "";

  switch (action) {
    case "ts": startTimelineForTask(chatId, id, cbId); break;   // task ▶️ bắt đầu
    case "td": completeTaskById(chatId, id, cbId); break;        // task ✅ xong
    case "tx": askDeleteTask(chatId, id, cbId); break;          // task 🗑 hỏi
    case "txok": deleteTaskConfirmed(chatId, id, cbId); break;   // task xoá xác nhận
    case "ls": timelineStopById(chatId, id, "", cbId); break;    // timeline ⏹️ kết thúc
    case "lx": askDeleteTimeline(chatId, id, cbId); break;      // timeline 🗑 hỏi
    case "lxok": deleteTimelineConfirmed(chatId, id, cbId); break; // timeline xoá xác nhận
    case "cancel": answerCallbackQuery(cbId, "Đã huỷ"); break;
    default: answerCallbackQuery(cbId, "");
  }
}

function start() {
  return "👋 <b>My-life · Task &amp; Timeline</b> " + APP_VERSION + "\n\n" +
    "• <b>Task</b>: <code>thêm task ...</code> · /tasks\n" +
    "• <b>Timeline</b>: <code>bắt đầu ...</code> · <code>xong ...</code> · /timeline\n" +
    "• <b>Mục tiêu hằng ngày</b>: <code>/repeat ... daily</code> · /streak\n\n" +
    "Gõ /help để xem đầy đủ.";
}

function help() {
  return "<b>HƯỚNG DẪN</b> " + APP_VERSION + "\n\n" +
    "📋 <b>TASK</b>\n" +
    "• Thêm: <code>thêm task đón con ngày mai</code>\n" +
    "• Xem: /tasks · <code>xem task 2026-07-28</code>\n" +
    "• Xong: nút ✅ · <code>xong đón con</code>\n" +
    "• Hoãn: <code>hoãn đón con sang mai</code>\n" +
    "• Ghi chú: <code>note đón con: nhớ mang cặp</code>\n" +
    "• Xoá: nút 🗑 · <code>xóa task đón con</code>\n\n" +
    "🕒 <b>TIMELINE</b>\n" +
    "• Bắt đầu: <code>bắt đầu code app</code> · <code>code app lúc 20:00</code>\n" +
    "• Kết thúc: nút ⏹️ · <code>xong code app</code>\n" +
    "• Khoảng: <code>đọc sách từ 20:00 đến 21:30</code>\n" +
    "• Xem: /timeline · /tl · <code>timeline hôm qua</code>\n" +
    "• Xoá: <code>xóa timeline code app</code>\n\n" +
    "🔁 <b>VIỆC LẶP / MỤC TIÊU HẰNG NGÀY</b>\n" +
    "• Tạo: <code>/repeat tập gym daily</code> · <code>mục tiêu học Duolingo mỗi ngày</code>\n" +
    "• Lịch khác: <code>đi chợ weekly:Sun</code> · <code>đóng tiền monthly:1</code>\n" +
    "• Có sẵn chuỗi: <code>học Duolingo mỗi ngày, hôm nay là ngày 928</code>\n" +
    "• Sửa chuỗi: <code>đặt chuỗi Duolingo là 928</code>\n" +
    "• Xem streak: /streak\n" +
    "• Dừng: <code>dừng lặp tập gym</code>\n\n" +
    "▶️ Bấm <b>Bắt đầu</b> dưới task để mở timeline; kết thúc sẽ tự hoàn thành task.";
}

/** Chạy trong GAS Editor sau khi deploy web app: trỏ webhook Telegram về URL /exec. */
function setWebhook() {
  var url = WEBHOOK_EXEC_URL || ScriptApp.getService().getUrl();
  if (!url) { Logger.log("Chưa deploy web app — không có URL."); return; }
  var r = tgCall_("setWebhook", { url: url });
  Logger.log("setWebhook → " + url + " | " + JSON.stringify(r));
  return r;
}

function deleteWebhook() {
  var r = tgCall_("deleteWebhook", {});
  Logger.log("deleteWebhook | " + JSON.stringify(r));
  return r;
}

/** Debug: xem trạng thái webhook (pending_update_count, lỗi gần nhất...). Gọi qua `clasp run debugWebhookInfo`. */
function debugWebhookInfo() {
  var r = tgCall_("getWebhookInfo", {});
  return JSON.stringify(r);
}

/**
 * Gắn lại webhook và XẢ hàng đợi update đang kẹt (drop_pending_updates).
 * Dùng khi Telegram retry mãi một update cũ khiến tin mới không tới được bot.
 */
function resetWebhookDropPending() {
  var url = WEBHOOK_EXEC_URL || ScriptApp.getService().getUrl();
  if (!url) { return "Chưa deploy web app — không có URL."; }
  var r = tgCall_("setWebhook", { url: url, drop_pending_updates: true });
  Logger.log("resetWebhookDropPending → " + url + " | " + JSON.stringify(r));
  return JSON.stringify(r);
}

/** Đẩy danh sách slash command lên menu Telegram. */
function setupBotCommands() {
  var commands = [
    { command: "tasks", description: "Xem task hôm nay" },
    { command: "timeline", description: "Xem timeline hôm nay" },
    { command: "tl", description: "Xem timeline (phím tắt)" },
    { command: "task", description: "Thêm task" },
    { command: "repeat", description: "Tạo việc lặp / mục tiêu hằng ngày" },
    { command: "streak", description: "Xem streak việc lặp" },
    { command: "help", description: "Hướng dẫn" },
    { command: "start", description: "Giới thiệu" }
  ];
  var r = tgCall_("setMyCommands", { commands: commands });
  Logger.log("setupBotCommands | " + JSON.stringify(r));
  return r;
}
