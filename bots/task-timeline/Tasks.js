/**
 * Tasks.js — thêm / list / hoàn thành / hoãn / ghi chú / xóa task.
 */

/** Nút thao tác dưới mỗi task. */
function taskButtons_(id) {
  return [[btn("▶️ Bắt đầu", "ts:" + id), btn("✅ Xong", "td:" + id), btn("🗑", "tx:" + id)]];
}

function addTaskFromIntent(chatId, intent) {
  var title = (intent.title || "").trim();
  if (!title) { sendMessage(chatId, "⚠️ Chưa rõ tên task. Ví dụ: <code>thêm task đón con lúc 17h</code>"); return; }
  var date = intent.date || todayStr_();
  var cat = normalizeCategory_(intent.category);
  var id = nextId_(SHEET_TASKS, "T");
  appendRow_(SHEET_TASKS, {
    id: id, created_at: fmtDateTime_(now_()), date: date, title: title,
    status: TASK_STATUS.TODO, priority: intent.priority || "", category: cat,
    note: intent.note || "", started_at: "", completed_at: "", repeat: ""
  });
  var extra = [];
  if (cat) extra.push("🏷️ " + cat);
  if (intent.priority) extra.push("⚡" + intent.priority);
  sendMessage(chatId,
    "✅ Đã thêm task <b>" + esc_(title) + "</b>\n📅 " + date + (extra.length ? " · " + extra.join(" · ") : ""),
    taskButtons_(id));
}

function listTasks(chatId, dateStr) {
  var date = dateStr || todayStr_();
  var rows = readRows_(SHEET_TASKS).filter(function (t) {
    return String(t.date) === date && (t.status === TASK_STATUS.TODO || t.status === TASK_STATUS.DOING);
  });
  if (!rows.length) { sendMessage(chatId, "📭 Không có task nào cho <b>" + date + "</b>."); return; }
  sendMessage(chatId, "📋 <b>Task ngày " + date + "</b> (" + rows.length + ")");
  rows.forEach(function (t) {
    var mark = t.status === TASK_STATUS.DOING ? "⏳" : "▫️";
    var line = mark + " <b>" + esc_(t.title) + "</b>";
    if (t.priority) line += " ⚡" + esc_(t.priority);
    if (t.category) line += " · " + esc_(t.category);
    if (t.note) line += "\n   📝 " + esc_(t.note);
    sendMessage(chatId, line, taskButtons_(t.id));
  });
}

/** Tìm task chưa done khớp target (ưu tiên hôm nay). */
function findTaskByTarget_(target) {
  var rows = readRows_(SHEET_TASKS).filter(function (t) {
    return t.status === TASK_STATUS.TODO || t.status === TASK_STATUS.DOING;
  });
  var today = todayStr_();
  var todays = rows.filter(function (t) { return String(t.date) === today; });
  var pool = todays.concat(rows.filter(function (t) { return String(t.date) !== today; }));
  for (var i = 0; i < pool.length; i++) if (matchName_(pool[i].title, target)) return pool[i];
  return null;
}

function completeTaskById(chatId, id, callbackId) {
  var t = findById_(SHEET_TASKS, id);
  if (!t) { reply_(chatId, callbackId, "⚠️ Không tìm thấy task."); return; }
  if (t.status === TASK_STATUS.DONE) { if (callbackId) answerCallbackQuery(callbackId, "Task đã hoàn thành"); return; }
  updateRow_(SHEET_TASKS, t._row, { status: TASK_STATUS.DONE, completed_at: fmtDateTime_(now_()) });
  var streakMsg = t.repeat ? updateStreakOnComplete_(t.repeat, String(t.date) || todayStr_()) : "";
  if (callbackId) answerCallbackQuery(callbackId, "✅ Hoàn thành");
  sendMessage(chatId, "✅ Đã hoàn thành <b>" + esc_(t.title) + "</b>" + (streakMsg ? "\n" + streakMsg : ""));
}

function completeTaskByTarget(chatId, target) {
  if (!target) { sendMessage(chatId, "⚠️ Chưa rõ task nào. Ví dụ: <code>xong đón con</code>"); return; }
  var t = findTaskByTarget_(target);
  if (!t) { sendMessage(chatId, "⚠️ Không thấy task khớp \"" + esc_(target) + "\"."); return; }
  completeTaskById(chatId, t.id, null);
}

function postponeTask(chatId, intent) {
  var t = findTaskByTarget_(intent.target || intent.title);
  if (!t) { sendMessage(chatId, "⚠️ Không thấy task để hoãn."); return; }
  if (!intent.date) { sendMessage(chatId, "⚠️ Hoãn sang ngày nào? Ví dụ: <code>hoãn đón con sang mai</code>"); return; }
  updateRow_(SHEET_TASKS, t._row, { date: intent.date });
  sendMessage(chatId, "📅 Đã hoãn <b>" + esc_(t.title) + "</b> sang " + intent.date, taskButtons_(t.id));
}

function noteTask(chatId, intent) {
  var t = findTaskByTarget_(intent.target || intent.title);
  if (!t) { sendMessage(chatId, "⚠️ Không thấy task để ghi chú."); return; }
  updateRow_(SHEET_TASKS, t._row, { note: intent.note || "" });
  sendMessage(chatId, "📝 Đã cập nhật ghi chú cho <b>" + esc_(t.title) + "</b>.", taskButtons_(t.id));
}

function askDeleteTask(chatId, id, callbackId) {
  var t = findById_(SHEET_TASKS, id);
  if (!t) { reply_(chatId, callbackId, "⚠️ Không tìm thấy task."); return; }
  sendMessage(chatId, "🗑 Xoá task <b>" + esc_(t.title) + "</b>?", [[btn("Xoá", "txok:" + id), btn("Huỷ", "cancel")]]);
  if (callbackId) answerCallbackQuery(callbackId, "");
}

function deleteTaskConfirmed(chatId, id, callbackId) {
  var t = findById_(SHEET_TASKS, id);
  if (!t) { reply_(chatId, callbackId, "⚠️ Không tìm thấy task."); return; }
  deleteRow_(SHEET_TASKS, t._row);
  if (callbackId) answerCallbackQuery(callbackId, "Đã xoá");
  sendMessage(chatId, "🗑 Đã xoá task <b>" + esc_(t.title) + "</b>.");
}

function deleteTaskByTarget(chatId, target) {
  var t = findTaskByTarget_(target);
  if (!t) { sendMessage(chatId, "⚠️ Không thấy task để xoá."); return; }
  askDeleteTask(chatId, t.id, null);
}

/** Trả lời qua callback toast nếu có, ngược lại gửi tin. */
function reply_(chatId, callbackId, text) {
  if (callbackId) answerCallbackQuery(callbackId, text);
  else sendMessage(chatId, text);
}
