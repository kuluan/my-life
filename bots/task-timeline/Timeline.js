/**
 * Timeline.js — nhật ký thời gian thực + liên kết task.
 */

/** Tạo block, trả id. end/duration để trống nếu chưa kết thúc. */
function createTimelineBlock_(date, title, start, end, cat, taskId) {
  var id = nextId_(SHEET_TIMELINE, "L");
  appendRow_(SHEET_TIMELINE, {
    id: id, date: date, title: title, start_at: start, end_at: end,
    duration_min: (start && end) ? diffMinutes_(start, end) : "",
    category: cat || "", task_id: taskId || "", note: ""
  });
  return id;
}

/**
 * Bắt đầu 1 block (từ NL). Không gắn task.
 * Nhận cả `time` ("lúc 10:00") lẫn `start_time` ("từ 10:00" — parser xếp vào ô khoảng),
 * nếu không có giờ nào thì lấy giờ hiện tại.
 */
function timelineStart(chatId, intent) {
  var title = (intent.title || "").trim();
  if (!title) { sendMessage(chatId, "⚠️ Bắt đầu việc gì? Ví dụ: <code>bắt đầu code app</code>"); return; }
  var start = normTime_(intent.time) || normTime_(intent.start_time) || fmtTimeNow_();
  var cat = normalizeCategory_(intent.category);
  var id = createTimelineBlock_(intent.date || todayStr_(), title, start, "", cat, "");
  sendTimelineCard_(chatId, id, "▶️ <b>Đã bắt đầu</b>");
}

/** Tìm block đang mở (end trống) khớp target, hoặc mở gần nhất nếu không có target. */
function findOpenBlock_(target) {
  var open = readRows_(SHEET_TIMELINE).filter(function (b) { return !b.end_at; });
  if (!open.length) return null;
  if (target) {
    for (var i = open.length - 1; i >= 0; i--) if (matchName_(open[i].title, target)) return open[i];
    return null;
  }
  return open[open.length - 1];
}

function timelineStopById(chatId, id, time, callbackId) {
  var b = findById_(SHEET_TIMELINE, id);
  if (!b) { if (callbackId) answerCallbackQuery(callbackId, "Không tìm thấy"); return; }
  if (b.end_at) { if (callbackId) answerCallbackQuery(callbackId, "Block đã kết thúc"); return; }
  finishBlock_(chatId, b, time, callbackId);
}

function timelineStop(chatId, intent) {
  var b = findOpenBlock_(intent.target || intent.title);
  if (!b) { sendMessage(chatId, "⚠️ Không có hoạt động đang chạy để kết thúc."); return; }
  // "xong X lúc 11:30" → time; "xong X đến 11:30" → end_time. Nhận cả hai.
  finishBlock_(chatId, b, intent.time || intent.end_time, null);
}

function finishBlock_(chatId, b, time, callbackId) {
  var end = normTime_(time) || fmtTimeNow_();
  var dur = diffMinutes_(b.start_at, end);
  updateRow_(SHEET_TIMELINE, b._row, { end_at: end, duration_min: dur });
  var extra = "";
  if (b.task_id) {
    var t = findById_(SHEET_TASKS, b.task_id);
    if (t && t.status !== TASK_STATUS.DONE) {
      updateRow_(SHEET_TASKS, t._row, { status: TASK_STATUS.DONE, completed_at: fmtDateTime_(now_()) });
      extra = "\n✅ Đã hoàn thành task <b>" + esc_(t.title) + "</b>";
      if (t.repeat) { var sm = updateStreakOnComplete_(t.repeat, String(t.date) || todayStr_()); if (sm) extra += "\n" + sm; }
    }
  }
  if (callbackId) answerCallbackQuery(callbackId, "⏹️ Kết thúc");
  sendTimelineCard_(chatId, b.id, "⏹️ <b>Đã kết thúc</b>" + extra);
}

/** Thêm 1 khoảng trọn vẹn (từ...đến...). */
function timelineRange(chatId, intent) {
  var title = (intent.title || "").trim();
  var s = normTime_(intent.start_time), e = normTime_(intent.end_time);
  if (!title || !s || !e) { sendMessage(chatId, "⚠️ Cần tên + khung giờ. Ví dụ: <code>đọc sách từ 20:00 đến 21:30</code>"); return; }
  var date = intent.date || todayStr_();
  var cat = normalizeCategory_(intent.category);
  var id = createTimelineBlock_(date, title, s, e, cat, "");
  sendTimelineCard_(chatId, id, "🕒 <b>Đã ghi</b>");
}

function timelineList(chatId, dateStr) {
  var date = dateStr || todayStr_();
  var rows = readRows_(SHEET_TIMELINE).filter(function (b) { return String(b.date) === date; });
  rows.sort(function (a, b) { return String(a.start_at).localeCompare(String(b.start_at)); });
  if (!rows.length) { sendMessage(chatId, "📭 Chưa có hoạt động nào ngày <b>" + date + "</b>."); return; }
  var total = 0, byCat = {};
  var lines = rows.map(function (b) {
    var open = !b.end_at;
    if (!open) {
      total += Number(b.duration_min) || 0;
      var c = b.category || "Khác";
      byCat[c] = (byCat[c] || 0) + (Number(b.duration_min) || 0);
    }
    return (open ? "▶️" : "•") + " " + b.start_at + (b.end_at ? "–" + b.end_at : "…") +
      " <b>" + esc_(b.title) + "</b>" + (open ? "" : " (" + b.duration_min + "p)");
  });
  var sumLines = Object.keys(byCat).map(function (c) { return "  · " + esc_(c) + ": " + byCat[c] + "p"; });
  sendMessage(chatId, "🕒 <b>Timeline " + date + "</b>\n" + lines.join("\n") +
    "\n\n⏱️ Tổng: " + total + " phút" + (sumLines.length ? "\n" + sumLines.join("\n") : ""));
}

function askDeleteTimeline(chatId, id, callbackId) {
  var b = findById_(SHEET_TIMELINE, id);
  if (!b) { if (callbackId) answerCallbackQuery(callbackId, "Không tìm thấy"); return; }
  sendMessage(chatId, "🗑 Xoá hoạt động <b>" + esc_(b.title) + "</b> (" + b.start_at + ")?",
    [[btn("Xoá", "lxok:" + id), btn("Huỷ", "cancel")]]);
  if (callbackId) answerCallbackQuery(callbackId, "");
}

function deleteTimelineConfirmed(chatId, id, callbackId) {
  var b = findById_(SHEET_TIMELINE, id);
  if (!b) { if (callbackId) answerCallbackQuery(callbackId, "Không tìm thấy"); return; }
  deleteRow_(SHEET_TIMELINE, b._row);
  if (callbackId) answerCallbackQuery(callbackId, "Đã xoá");
  sendMessage(chatId, "🗑 Đã xoá hoạt động <b>" + esc_(b.title) + "</b>.");
}

function deleteTimelineByTarget(chatId, target) {
  var rows = readRows_(SHEET_TIMELINE);
  for (var i = rows.length - 1; i >= 0; i--) {
    if (matchName_(rows[i].title, target)) { askDeleteTimeline(chatId, rows[i].id, null); return; }
  }
  sendMessage(chatId, "⚠️ Không thấy hoạt động để xoá.");
}

/** Bắt đầu timeline gắn với task (nút ▶️ dưới task). */
function startTimelineForTask(chatId, taskId, callbackId) {
  var t = findById_(SHEET_TASKS, taskId);
  if (!t) { if (callbackId) answerCallbackQuery(callbackId, "Không tìm thấy task"); return; }
  var start = fmtTimeNow_();
  var id = createTimelineBlock_(todayStr_(), t.title, start, "", t.category || "", t.id);
  updateRow_(SHEET_TASKS, t._row, { status: TASK_STATUS.DOING, started_at: fmtDateTime_(now_()) });
  if (callbackId) answerCallbackQuery(callbackId, "▶️ Bắt đầu");
  sendTimelineCard_(chatId, id, "▶️ <b>Đã bắt đầu</b> <i>(kết thúc sẽ tự hoàn thành task)</i>");
}
