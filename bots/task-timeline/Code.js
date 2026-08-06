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
    rememberChatId_(chatId); // để trigger nhắc nhở biết gửi về đâu
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

  // Đang chờ user nhập giá trị (menu timeline hoặc trợ lý tạo việc chu kỳ) → tiêu thụ tin này.
  // Gõ lệnh (bắt đầu bằng "/") thì huỷ chờ và xử lý như bình thường.
  var pend = getPending_(chatId);
  if (pend) {
    if (text.charAt(0) !== "/") {
      if (pend.kind === REC_KIND) applyRecurringWizardInput_(chatId, pend, text);
      else applyTimelineEdit_(chatId, pend, text);
      return;
    }
    clearPending_(chatId);
  }

  // Slash deterministic (không tốn Gemini).
  if (lower === "/start") { sendMessage(chatId, start()); return; }
  if (lower === "/help") { sendMessage(chatId, help()); return; }
  if (lower === "/tasks") { listTasks(chatId, todayStr_()); return; }
  if (lower === "/timeline" || lower === "/tl") { timelineList(chatId, todayStr_()); return; }
  if (lower === "/streak" || lower === "/repeats") { streakView(chatId); return; }
  if (lower === "/repeat") { recurringWizardStart(chatId); return; } // trợ lý từng bước

  // "/timeline <tham số>" / "/tl <tham số>": ưu tiên khớp "tuần ..." (xem tóm tắt cả tuần) rồi
  // đến ngày đơn (30/07, hôm qua, 2026-07-30...) — cả hai deterministic, không tốn Gemini. Nếu
  // không khớp gì (vd tên hoạt động, "/tl code app") → rơi xuống Gemini như cũ (timeline_start).
  var tlMatch = text.match(/^\/(timeline|tl)\s+(.+)$/i);
  if (tlMatch) {
    var tlArg = tlMatch[2].trim();
    var tlMonday = parseWeekArg_(tlArg);
    if (tlMonday) { timelineWeek(chatId, tlMonday); return; }
    var tlDate = parseDateInput_(tlArg);
    if (tlDate) { timelineList(chatId, tlDate); return; }
  }

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
  var msgId = cq.message.message_id;
  var cbId = cq.id;
  var data = String(cq.data || "");
  var parts = data.split(":");
  var action = parts[0];
  var id = parts[1] || "";
  // extra: ngày của danh sách /timeline mà entry được mở từ đó — dùng để quay lại đúng danh
  // sách sau khi sửa/xoá (mục 3 tính năng "xem timeline theo ngày kèm menu"). Rỗng nếu không có.
  var extra = parts[2] || "";

  switch (action) {
    case "ts": startTimelineForTask(chatId, id, cbId); break;   // task ▶️ bắt đầu
    case "td": completeTaskById(chatId, id, cbId); break;        // task ✅ xong
    case "tx": askDeleteTask(chatId, id, cbId); break;          // task 🗑 hỏi
    case "txok": deleteTaskConfirmed(chatId, id, cbId); break;   // task xoá xác nhận
    case "ls": timelineStopById(chatId, id, "", cbId); break;    // timeline ⏹️ kết thúc
    case "lx": askDeleteTimeline(chatId, id, cbId, extra); break;      // timeline 🗑 hỏi
    case "lxok": deleteTimelineConfirmed(chatId, id, cbId, extra, msgId); break; // timeline xoá xác nhận
    // --- menu tương tác của timeline entry (TimelineEdit.js) ---
    case "te": askTimelineEdit_(chatId, msgId, id, "title", cbId, extra); break;
    case "tn": askTimelineEdit_(chatId, msgId, id, "note", cbId, extra); break;
    case "tb": askTimelineEdit_(chatId, msgId, id, "start", cbId, extra); break;
    case "tf": askTimelineEdit_(chatId, msgId, id, "end", cbId, extra); break;
    case "tdate": askTimelineEdit_(chatId, msgId, id, "date", cbId, extra); break;
    case "tcancel": cancelTimelineEdit_(chatId, msgId, id, cbId, extra); break;
    // --- xem /timeline theo ngày: chọn 1 entry từ danh sách để mở menu đầy đủ ---
    case "tlpick": openTimelineEntryFromList_(chatId, msgId, id, extra, cbId); break;
    // --- xem /timeline theo tuần: chọn 1 ngày để mở chi tiết ngày đó ---
    case "tlwd": openTimelineDayFromWeek_(chatId, msgId, id, cbId); break;
    // --- trợ lý tạo việc chu kỳ (RecurringAdd.js) ---
    case "rcnew": answerCallbackQuery(cbId, ""); recurringWizardStart(chatId); break;
    case "rcd": recWizardPickCycle_(chatId, msgId, "daily", cbId); break;
    case "rcw": recWizardPickCycle_(chatId, msgId, "weekly", cbId); break;
    case "rcm": recWizardPickCycle_(chatId, msgId, "monthly", cbId); break;
    case "rcy": recWizardPickCycle_(chatId, msgId, "yearly", cbId); break;
    case "rcwt": recWizardToggleDay_(chatId, msgId, id, cbId); break;
    case "rcwok": recWizardWeekDone_(chatId, msgId, cbId); break;
    case "rccancel": recWizardCancel_(chatId, msgId, cbId); break;
    case "keep": answerCallbackQuery(cbId, "👍 Ok, tiếp tục nhé"); break;  // nhắc nhở: vẫn đang làm
    case "tlview": answerCallbackQuery(cbId, ""); timelineList(chatId, todayStr_()); break;
    case "cancel": answerCallbackQuery(cbId, "Đã huỷ"); break;
    default: answerCallbackQuery(cbId, "");
  }
}

function start() {
  return "👋 <b>My-life · Task &amp; Timeline</b> " + APP_VERSION + "\n\n" +
    "• <b>Task một lần</b>: <code>thêm task ...</code> · /tasks\n" +
    "• <b>Task chu kỳ</b> (ngày/tuần/tháng/năm): /repeat · /streak\n" +
    "• <b>Timeline</b>: <code>bắt đầu ...</code> · <code>xong ...</code> · /timeline\n\n" +
    "Gõ /help để xem đầy đủ.";
}

function help() {
  return "<b>HƯỚNG DẪN</b> " + APP_VERSION + "\n\n" +
    "📋 <b>TASK</b> — /tasks tách sẵn <b>🔁 việc chu kỳ</b> và <b>▫️ việc một lần</b>\n" +
    "• Thêm (một lần): <code>thêm task đón con ngày mai</code>\n" +
    "• Xem: /tasks · <code>xem task 2026-07-28</code>\n" +
    "• Xong: nút ✅ · <code>xong đón con</code>\n" +
    "• Hoãn: <code>hoãn đón con sang mai</code>\n" +
    "• Ghi chú: <code>note đón con: nhớ mang cặp</code>\n" +
    "• Xoá: nút 🗑 · <code>xóa task đón con</code>\n\n" +
    "🕒 <b>TIMELINE</b>\n" +
    "• Bắt đầu: <code>bắt đầu code app</code> · <code>code app lúc 20:00</code>\n" +
    "• Kết thúc: nút ⏹️ · <code>xong code app</code>\n" +
    "• Khoảng: <code>đọc sách từ 20:00 đến 21:30</code>\n" +
    "• Xem: /timeline · /tl · <code>/timeline hôm qua</code> · <code>/timeline 30/07</code>\n" +
    "   → bấm vào 1 dòng trong danh sách để mở menu sửa/xoá; mỗi lần sửa tự lưu ngay, xoá xong tự quay lại danh sách\n" +
    "• Xem theo tuần: <code>/timeline tuần này</code> · <code>/timeline tuần trước</code> · <code>/timeline tuần 28/07</code>\n" +
    "   → tóm tắt từng ngày (tổng giờ · hoạt động nổi bật), bấm 1 ngày để xem chi tiết\n" +
    "• Xoá: <code>xóa timeline code app</code>\n" +
    "• <b>Menu sửa</b>: mỗi hoạt động vừa tạo/kết thúc đều kèm nút\n" +
    "   ✏️ tên · 📝 ghi chú · 🕐 giờ bắt đầu · 🕑 giờ kết thúc · 📅 ngày · 🗑️ xoá\n" +
    "   Bấm nút → bot hỏi → gõ giá trị vào ô chat là xong.\n" +
    "• <b>Nhập bù ngày khác</b>: bấm 📅 rồi gõ <code>30/07</code> · <code>hôm qua</code> · <code>2 ngày trước</code>\n" +
    "   (hoặc ghi thẳng: <code>họp team hôm qua từ 9:00 đến 10:00</code>)\n\n" +
    "🔁 <b>TASK CHU KỲ (việc lặp)</b>\n" +
    "• <b>Cách dễ nhất</b>: gõ /repeat → nhập tên → bấm chọn chu kỳ\n" +
    "   🔁 Hàng ngày · 📆 Hàng tuần (bấm chọn thứ) · 🗓 Hàng tháng · 📅 Hàng năm\n" +
    "• Gõ thẳng một câu:\n" +
    "   <code>/repeat tập gym hàng ngày</code>\n" +
    "   <code>/repeat đi chợ hàng tuần T7</code>\n" +
    "   <code>/repeat đóng tiền nhà hàng tháng ngày 1</code>\n" +
    "   <code>/repeat giỗ ông hàng năm 30/07</code>\n" +
    "• Có sẵn chuỗi: <code>học Duolingo mỗi ngày, hôm nay là ngày 928</code>\n" +
    "• Sửa chuỗi: <code>đặt chuỗi Duolingo là 928</code>\n" +
    "• Xem danh sách + streak: /streak (hoặc /repeats)\n" +
    "• Dừng: <code>dừng lặp tập gym</code>\n" +
    "→ Task chu kỳ tự sinh vào /tasks đúng ngày tới hạn, nằm ở nhóm 🔁 riêng.\n\n" +
    "⏰ <b>NHẮC NHỞ TỰ ĐỘNG</b>\n" +
    "• Mỗi 60 phút, từ " + REMINDER_START_HOUR + "h đến " + REMINDER_END_HOUR + "h\n" +
    "• Đang có hoạt động → nhắc cập nhật (nút ⏹️ Kết thúc · 👍 Vẫn đang làm)\n" +
    "• Không có → nhắc ghi nhanh đang làm gì\n\n" +
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
    { command: "task", description: "Thêm task một lần" },
    { command: "repeat", description: "Thêm task chu kỳ (ngày/tuần/tháng/năm)" },
    { command: "repeats", description: "Danh sách task chu kỳ" },
    { command: "streak", description: "Xem streak việc chu kỳ" },
    { command: "help", description: "Hướng dẫn" },
    { command: "start", description: "Giới thiệu" }
  ];
  var r = tgCall_("setMyCommands", { commands: commands });
  Logger.log("setupBotCommands | " + JSON.stringify(r));
  return r;
}
