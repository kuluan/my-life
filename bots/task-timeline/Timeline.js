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

/** True nếu block đã đóng và end_at "nhỏ hơn" start_at → qua nửa đêm, kéo sang ngày hôm sau. */
function isCrossDayBlock_(b) {
  return !!(b.start_at && b.end_at && b.end_at < b.start_at);
}

/**
 * Lấy các block hiển thị cho ngày `date`, gồm cả block thuộc đúng ngày ĐÓ (`same`, kể cả loại
 * qua nửa đêm — sẽ hiện tiếp ở ngày hôm sau) và phần "đuôi" của block bắt đầu từ hôm qua nhưng
 * kéo sang ngày này (`carried`, đã kết thúc qua nửa đêm HOẶC còn đang chạy dở từ hôm qua).
 * Mỗi block chỉ có 1 cột `date` (ngày bắt đầu) nên phần carried được đánh dấu `_carriedFromPrevDay`
 * để renderer biết hiển thị đúng phần (chỉ đuôi, không lặp lại phần đầu đã hiện ở ngày hôm qua).
 */
function getTimelineRowsForDate_(date) {
  var all = readRows_(SHEET_TIMELINE);
  var prevDate = addDays_(date, -1);
  var same = all.filter(function (b) { return String(b.date) === date; });
  var carried = all.filter(function (b) {
    if (String(b.date) !== prevDate) return false;
    return !b.end_at || isCrossDayBlock_(b);
  }).map(function (b) {
    var c = {}; for (var k in b) c[k] = b[k];
    c._carriedFromPrevDay = true;
    return c;
  });
  return same.concat(carried);
}

/**
 * Cách hiển thị 1 block khi xem ngày `date` (icon/khung giờ/ghi chú) — tách riêng phần đầu/đuôi
 * cho block qua nửa đêm để mỗi ngày chỉ hiện đúng phần thuộc về ngày đó (mục cross-day).
 */
function timelineDisplayForDate_(b, carried) {
  if (carried) { // đuôi của block bắt đầu hôm qua, kéo sang ngày đang xem
    return {
      icon: "🌙",
      time: "…" + (b.end_at ? "–" + b.end_at : ""),
      note: b.end_at ? "từ hôm qua" : "từ hôm qua, đang chạy",
      durationLabel: b.end_at ? ((Number(b.duration_min) || 0) + "p") : ""
    };
  }
  if (isCrossDayBlock_(b)) { // đầu của block, còn phần đuôi rơi vào ngày mai
    return { icon: "🌙", time: b.start_at + "–…", note: "sang hôm sau", durationLabel: "" };
  }
  var open = !b.end_at;
  return {
    icon: open ? "▶️" : "•",
    time: b.start_at + (b.end_at ? "–" + b.end_at : "…"),
    note: "",
    durationLabel: open ? "" : ((Number(b.duration_min) || 0) + "p")
  };
}

/**
 * Tổng phút + phân bổ theo category + danh sách hoạt động đã đóng (title/minutes, dùng để xếp
 * "hoạt động nổi bật nhất" ở /timeline tuần) cho 1 tập rows (từ getTimelineRowsForDate_). Chỉ
 * tính entry "gốc" của ngày đó — bỏ qua phần carried từ hôm qua và entry còn đang chạy, để không
 * đếm đôi block qua nửa đêm (nhất quán giữa xem theo ngày và xem theo tuần).
 */
function summarizeTimelineRows_(rows) {
  var total = 0, byCat = {}, items = [];
  rows.forEach(function (b) {
    if (b._carriedFromPrevDay || !b.end_at) return;
    var mins = Number(b.duration_min) || 0;
    total += mins;
    var c = b.category || "Khác";
    byCat[c] = (byCat[c] || 0) + mins;
    items.push({ title: b.title, minutes: mins });
  });
  return { total: total, byCat: byCat, items: items };
}

/**
 * Dựng nội dung + inline keyboard (1 nút/entry, để chọn mở menu sửa) cho danh sách 1 ngày.
 * Dùng chung cho /timeline (slash + NL) và khi quay lại danh sách sau khi sửa/xoá.
 */
function buildTimelineListView_(date) {
  var rows = getTimelineRowsForDate_(date);
  if (!rows.length) return { text: "📭 Chưa có hoạt động nào ngày <b>" + date + "</b>.", keyboard: null };
  // Block kéo từ hôm qua lên đầu (đang chạy/kết thúc trước khi ngày mới bắt đầu bất kỳ hoạt động nào khác).
  rows.sort(function (a, b) {
    var ka = (a._carriedFromPrevDay ? "0_" : "1_") + a.start_at;
    var kb = (b._carriedFromPrevDay ? "0_" : "1_") + b.start_at;
    return ka.localeCompare(kb);
  });
  var sum = summarizeTimelineRows_(rows);
  var total = sum.total, byCat = sum.byCat;
  var lines = rows.map(function (b) {
    var d = timelineDisplayForDate_(b, !!b._carriedFromPrevDay);
    return d.icon + " " + d.time + " <b>" + esc_(b.title) + "</b>" +
      (d.durationLabel ? " (" + d.durationLabel + ")" : "") +
      (d.note ? " <i>(" + d.note + ")</i>" : "");
  });
  var sumLines = Object.keys(byCat).map(function (c) { return "  · " + esc_(c) + ": " + byCat[c] + "p"; });
  var text = "🕒 <b>Timeline " + date + "</b>\n" + lines.join("\n") +
    "\n\n⏱️ Tổng: " + total + " phút" + (sumLines.length ? "\n" + sumLines.join("\n") : "") +
    "\n\n👇 Chọn 1 hoạt động để sửa/xoá:";
  var keyboard = rows.map(function (b) {
    var d = timelineDisplayForDate_(b, !!b._carriedFromPrevDay);
    var label = d.time + (d.durationLabel ? " · " + d.durationLabel : "") + " · " + b.title +
      (d.note ? " (" + d.note + ")" : "");
    if (label.length > 60) label = label.slice(0, 57) + "...";
    return [btn(label, "tlpick:" + b.id + ":" + date)];
  });
  return { text: text, keyboard: keyboard };
}

function timelineList(chatId, dateStr) {
  var date = dateStr || todayStr_();
  var view = buildTimelineListView_(date);
  sendMessage(chatId, view.text, view.keyboard);
}

// ---------- xem theo tuần (/timeline tuần này · tuần trước · tuần dd/mm) ----------

var WEEKDAY_LABELS_ = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

/** "2026-07-28" → "28/07". */
function fmtDM_(dateStr) {
  var p = String(dateStr).split("-");
  return p[2] + "/" + p[1];
}

/** Thứ Hai (yyyy-MM-dd) của tuần chứa `dateStr`, theo quy ước tuần bắt đầu từ Thứ Hai. */
function mondayOfWeek_(dateStr) {
  var d = parseDateStr_(dateStr);
  var dow = d.getDay(); // 0=CN..6=T7
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return Utilities.formatDate(d, TIMEZONE, "yyyy-MM-dd");
}

/**
 * Phân tích tham số "tuần ..." của "/timeline <tham số>": "tuần này/tuần" · "tuần trước" ·
 * "tuần sau" · "tuần 28/07" (một ngày bất kỳ trong tuần muốn xem, dùng parseDateInput_).
 * @return {string|null} Thứ Hai (yyyy-MM-dd) của tuần đó, hoặc null nếu không khớp mẫu "tuần ...".
 */
function parseWeekArg_(raw) {
  var t = String(raw || "").trim().toLowerCase();
  var m = t.match(/^tu[aầ]n\s*(.*)$/);
  if (!m) return null;
  var rest = (m[1] || "").trim();
  if (rest === "" || rest === "này" || rest === "nay") return mondayOfWeek_(todayStr_());
  if (rest === "trước" || rest === "truoc") return mondayOfWeek_(addDays_(todayStr_(), -7));
  if (rest === "sau" || rest === "tới" || rest === "toi") return mondayOfWeek_(addDays_(todayStr_(), 7));
  var d = parseDateInput_(rest);
  return d ? mondayOfWeek_(d) : null;
}

/** Dựng nội dung + inline keyboard (1 nút/ngày, để xem chi tiết ngày đó) cho tóm tắt 1 tuần T2→CN. */
function buildTimelineWeekView_(mondayStr) {
  var sundayStr = addDays_(mondayStr, 6);
  var lines = ["📅 <b>Tuần " + fmtDM_(mondayStr) + " – " + fmtDM_(sundayStr) + "</b>", "──────────────────"];
  var keyboard = [];
  for (var i = 0; i < 7; i++) {
    var dateStr = addDays_(mondayStr, i);
    var dayLabel = WEEKDAY_LABELS_[i] + " " + fmtDM_(dateStr);
    var rows = getTimelineRowsForDate_(dateStr);
    if (!rows.length) {
      lines.push(dayLabel + " · — không có dữ liệu");
      keyboard.push([btn(dayLabel + " — trống", "tlwd:" + dateStr)]);
      continue;
    }
    var sum = summarizeTimelineRows_(rows);
    lines.push(dayLabel + " · " + fmtDuration_(sum.total) + " tracked (" + rows.length + " entries)");
    var top = sum.items.slice().sort(function (a, b) { return b.minutes - a.minutes; }).slice(0, 3);
    var restCount = sum.items.length - top.length;
    if (top.length) {
      var line = "  " + top.map(function (it) { return "<b>" + esc_(it.title) + "</b> " + fmtDuration_(it.minutes); }).join(" · ");
      if (restCount > 0) line += " · +" + restCount + " khác";
      lines.push(line);
    }
    keyboard.push([btn(dayLabel + " (" + fmtDuration_(sum.total) + ")", "tlwd:" + dateStr)]);
  }
  return { text: lines.join("\n"), keyboard: keyboard };
}

function timelineWeek(chatId, mondayStr) {
  var view = buildTimelineWeekView_(mondayStr);
  sendMessage(chatId, view.text, view.keyboard);
}

/** Bấm 1 ngày trong tóm tắt tuần → mở chi tiết ngày đó (dùng lại flow /timeline dd/mm) ngay trong tin nhắn. */
function openTimelineDayFromWeek_(chatId, msgId, dateStr, callbackId) {
  var view = buildTimelineListView_(dateStr);
  editMessageText(chatId, msgId, view.text, view.keyboard);
  if (callbackId) answerCallbackQuery(callbackId, "");
}

/** @param {string} [backDate] Ngày danh sách để đính vào nút "Xoá" — quay lại danh sách sau khi xoá. */
function askDeleteTimeline(chatId, id, callbackId, backDate) {
  var b = findById_(SHEET_TIMELINE, id);
  if (!b) { if (callbackId) answerCallbackQuery(callbackId, "Không tìm thấy"); return; }
  sendMessage(chatId, "🗑 Xoá hoạt động <b>" + esc_(b.title) + "</b> (" + b.start_at + ")?",
    [[btn("Xoá", "lxok:" + id + (backDate ? ":" + backDate : "")), btn("Huỷ", "cancel")]]);
  if (callbackId) answerCallbackQuery(callbackId, "");
}

/**
 * @param {string} [backDate] Nếu có (xoá từ danh sách /timeline) → sửa luôn tin nhắn xác nhận
 *   thành danh sách ngày đó thay vì gửi tin "Đã xoá" rời (mục 3, yêu cầu quay lại danh sách).
 * @param {number} [msgId] message_id của tin xác nhận xoá (để sửa tại chỗ khi có backDate).
 */
function deleteTimelineConfirmed(chatId, id, callbackId, backDate, msgId) {
  var b = findById_(SHEET_TIMELINE, id);
  if (!b) { if (callbackId) answerCallbackQuery(callbackId, "Không tìm thấy"); return; }
  deleteRow_(SHEET_TIMELINE, b._row);
  if (callbackId) answerCallbackQuery(callbackId, "Đã xoá");
  if (backDate && msgId) {
    var view = buildTimelineListView_(backDate);
    editMessageText(chatId, msgId, "🗑 Đã xoá <b>" + esc_(b.title) + "</b>.\n\n" + view.text, view.keyboard);
  } else {
    sendMessage(chatId, "🗑 Đã xoá hoạt động <b>" + esc_(b.title) + "</b>.");
  }
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

// ---------- test (không cần Telegram) ----------

/**
 * Test buildTimelineListView_ (xem /timeline theo ngày kèm nút chọn entry) và regex phân tích
 * tham số ngày của "/timeline <arg>" trong routeMessage_. Không gửi tin Telegram.
 * `clasp run testTimelineListView`
 */
function testTimelineListView() {
  var out = [], fail = 0;
  function check(name, got, want) {
    var ok = String(got) === String(want);
    if (!ok) fail++;
    out.push((ok ? "PASS " : "FAIL ") + name + " = " + JSON.stringify(got) + (ok ? "" : " ≠ " + JSON.stringify(want)));
  }
  var date = "2000-01-03";
  var id1 = createTimelineBlock_(date, "TEST_LIST_A", "08:00", "09:30", "", "");
  var id2 = createTimelineBlock_(date, "TEST_LIST_B", "10:00", "", "", ""); // đang chạy (chưa kết thúc)
  try {
    var view = buildTimelineListView_(date);
    check("text chứa entry A", view.text.indexOf("TEST_LIST_A") >= 0, true);
    check("text chứa entry B", view.text.indexOf("TEST_LIST_B") >= 0, true);
    check("số dòng keyboard = số entry", view.keyboard.length, 2);
    check("mỗi dòng 1 nút", view.keyboard[0].length, 1);
    check("callback_data entry A", view.keyboard[0][0].callback_data, "tlpick:" + id1 + ":" + date);
    check("callback_data entry B", view.keyboard[1][0].callback_data, "tlpick:" + id2 + ":" + date);
    check("label kèm tên hoạt động A", view.keyboard[0][0].text.indexOf("TEST_LIST_A") >= 0, true);

    // ngày trống (không liền kề ngày nào có dữ liệu test, kể cả entry B đang mở ở trên
    // — B vẫn mở nên sẽ "kéo" sang ngày kế tiếp 2000-01-04 theo đúng logic cross-day mới,
    // nên ở đây dùng hẳn 1 ngày xa để chắc chắn trống) → không có keyboard, có text báo trống
    var empty = buildTimelineListView_("1998-01-01");
    check("ngày trống: keyboard null", empty.keyboard, null);
    check("ngày trống: có báo trống", empty.text.indexOf("Chưa có hoạt động") >= 0, true);

    // regex "/timeline <arg>" / "/tl <arg>" dùng trong routeMessage_ + parseDateInput_
    var m1 = "/timeline 30/07".match(/^\/(timeline|tl)\s+(.+)$/i);
    check("regex khớp /timeline 30/07", !!m1, true);
    check("parse ngày từ '30/07'", parseDateInput_(m1[2].trim()), todayStr_().slice(0, 4) + "-07-30");
    var m2 = "/tl hôm qua".match(/^\/(timeline|tl)\s+(.+)$/i);
    check("parse '/tl hôm qua'", parseDateInput_(m2[2].trim()), addDays_(todayStr_(), -1));
    var m3 = "/tl code app".match(/^\/(timeline|tl)\s+(.+)$/i);
    check("'/tl code app' KHÔNG parse được thành ngày (→ rơi xuống Gemini)", parseDateInput_(m3[2].trim()), "");
  } finally {
    [id1, id2].forEach(function (id) {
      var b = findById_(SHEET_TIMELINE, id);
      if (b) deleteRow_(SHEET_TIMELINE, b._row);
    });
  }
  var res = out.join("\n") + "\n→ " + (out.length - fail) + "/" + out.length + " PASS (đã xoá entry test)";
  Logger.log(res);
  return res;
}

/**
 * Test entry qua nửa đêm (vd ngủ 23:00→06:30) hiện ở CẢ HAI ngày khi xem /timeline.
 * `clasp run testTimelineCrossDayView`
 */
function testTimelineCrossDayView() {
  var out = [], fail = 0;
  function check(name, got, want) {
    var ok = String(got) === String(want);
    if (!ok) fail++;
    out.push((ok ? "PASS " : "FAIL ") + name + " = " + JSON.stringify(got) + (ok ? "" : " ≠ " + JSON.stringify(want)));
  }
  var day1 = "2000-02-10", day2 = "2000-02-11";
  // A: đã kết thúc, qua nửa đêm (23:00 ngày 1 → 06:30 ngày 2)
  var idA = createTimelineBlock_(day1, "TEST_CROSS_SLEEP", "23:00", "06:30", "", "");
  // B: chưa kết thúc, bắt đầu tối ngày 1, còn đang chạy dở sang ngày 2
  var idB = createTimelineBlock_(day1, "TEST_CROSS_OPEN", "23:30", "", "", "");
  // C: hoạt động bình thường trong ngày 2, không liên quan cross-day
  var idC = createTimelineBlock_(day2, "TEST_DAY2_NORMAL", "07:00", "08:00", "", "");
  try {
    // ---- Ngày 1 (ngày gốc): A hiện dạng "23:00–…" (chưa xong trong ngày), B hiện bình thường ----
    var v1 = buildTimelineListView_(day1);
    check("ngày 1: có 2 entry (A, B)", v1.keyboard.length, 2);
    check("ngày 1: A hiện 23:00–… (giấu giờ kết thúc)", v1.text.indexOf("23:00–…") >= 0, true);
    check("ngày 1: A KHÔNG lộ giờ kết thúc 06:30", v1.text.indexOf("06:30") >= 0, false);
    check("ngày 1: A có ghi chú sang hôm sau", v1.text.indexOf("sang hôm sau") >= 0, true);
    check("ngày 1: B hiện bình thường, không note cross-day", v1.text.indexOf("23:30…") >= 0, true);
    check("ngày 1: tổng chỉ tính A đã đóng (450p), B đang chạy không tính", v1.text.indexOf("Tổng: 450 phút") >= 0, true);

    // ---- Ngày 2 (ngày kế tiếp): A hiện phần đuôi "…–06:30", B hiện "đang chạy từ hôm qua", C bình thường ----
    var v2 = buildTimelineListView_(day2);
    check("ngày 2: có 3 entry (A đuôi, B đuôi, C)", v2.keyboard.length, 3);
    check("ngày 2: thứ tự — carried (A,B) trước, rồi C", JSON.stringify(v2.keyboard.map(function (r) { return r[0].callback_data; })),
      JSON.stringify(["tlpick:" + idA + ":" + day2, "tlpick:" + idB + ":" + day2, "tlpick:" + idC + ":" + day2]));
    check("ngày 2: A hiện …–06:30 (giấu giờ bắt đầu 23:00)", v2.text.indexOf("…–06:30") >= 0, true);
    check("ngày 2: A KHÔNG lộ giờ bắt đầu 23:00", v2.text.indexOf("23:00") >= 0, false);
    check("ngày 2: A có ghi chú từ hôm qua", v2.text.indexOf("từ hôm qua") >= 0, true);
    check("ngày 2: B (còn đang chạy) có ghi chú từ hôm qua, đang chạy", v2.text.indexOf("từ hôm qua, đang chạy") >= 0, true);
    check("ngày 2: C hiện bình thường 07:00–08:00", v2.text.indexOf("07:00–08:00") >= 0, true);
    check("ngày 2: tổng chỉ tính C (60p), không đếm đôi A", v2.text.indexOf("Tổng: 60 phút") >= 0, true);

    // ---- Ngày trước ngày 1 hoàn toàn trống: không bị "kéo" gì từ đâu ra ----
    var vEmpty = buildTimelineListView_("2000-02-09");
    check("ngày trước đó trống", vEmpty.keyboard, null);
  } finally {
    [idA, idB, idC].forEach(function (id) {
      var b = findById_(SHEET_TIMELINE, id);
      if (b) deleteRow_(SHEET_TIMELINE, b._row);
    });
  }
  var res = out.join("\n") + "\n→ " + (out.length - fail) + "/" + out.length + " PASS (đã xoá entry test)";
  Logger.log(res);
  return res;
}

/**
 * Test xem /timeline theo tuần: mondayOfWeek_, parseWeekArg_, buildTimelineWeekView_.
 * `clasp run testTimelineWeekView`
 */
function testTimelineWeekView() {
  var out = [], fail = 0;
  function check(name, got, want) {
    var ok = String(got) === String(want);
    if (!ok) fail++;
    out.push((ok ? "PASS " : "FAIL ") + name + " = " + JSON.stringify(got) + (ok ? "" : " ≠ " + JSON.stringify(want)));
  }

  // mondayOfWeek_: luôn ra Thứ Hai (getDay()===1), không vượt quá ngày gốc, cách tối đa 6 ngày.
  ["2026-07-27", "2026-07-28", "2026-07-29", "2026-07-30", "2026-07-31", "2026-08-01", "2026-08-02"].forEach(function (d) {
    var mon = mondayOfWeek_(d);
    check("mondayOfWeek_(" + d + ") là Thứ Hai", parseDateStr_(mon).getDay(), 1);
    check("mondayOfWeek_(" + d + ") <= ngày gốc", mon <= d, true);
  });
  var aMonday = mondayOfWeek_(todayStr_());
  check("mondayOfWeek_ idempotent với chính Thứ Hai", mondayOfWeek_(aMonday), aMonday);

  // parseWeekArg_
  check("'tuần này'", parseWeekArg_("tuần này"), mondayOfWeek_(todayStr_()));
  check("'tuan nay' (không dấu)", parseWeekArg_("tuan nay"), mondayOfWeek_(todayStr_()));
  check("'tuần' (không hậu tố = tuần này)", parseWeekArg_("tuần"), mondayOfWeek_(todayStr_()));
  check("'tuần trước'", parseWeekArg_("tuần trước"), mondayOfWeek_(addDays_(todayStr_(), -7)));
  check("'tuần sau'", parseWeekArg_("tuần sau"), mondayOfWeek_(addDays_(todayStr_(), 7)));
  check("'tuần 28/07'", parseWeekArg_("tuần 28/07"), mondayOfWeek_(parseDateInput_("28/07")));
  check("'code app' (không phải 'tuần ...') → null", parseWeekArg_("code app"), null);
  check("'tuần abc' (hậu tố không parse được thành ngày) → null", parseWeekArg_("tuần abc"), null);

  // buildTimelineWeekView_: dữ liệu test rải trong 1 tuần cố định (xa dữ liệu thật) — Thứ Hai
  // có 4 entry (để kiểm top 3 + "+1 khác"), Thứ Ba trống hẳn.
  var mon = mondayOfWeek_("2000-03-08"); // Thứ Hai thật của tuần chứa 2000-03-08 (không hardcode thứ)
  var tue = addDays_(mon, 1);
  var idA = createTimelineBlock_(mon, "TEST_WK_A", "08:00", "09:00", "", ""); // 60p
  var idB = createTimelineBlock_(mon, "TEST_WK_B", "09:00", "09:30", "", ""); // 30p
  var idC = createTimelineBlock_(mon, "TEST_WK_C", "09:30", "09:50", "", ""); // 20p
  var idD = createTimelineBlock_(mon, "TEST_WK_D", "09:50", "10:00", "", ""); // 10p, nhỏ nhất → rơi khỏi top 3
  try {
    var view = buildTimelineWeekView_(mon);
    check("tiêu đề tuần đúng khoảng ngày", view.text.indexOf(fmtDM_(mon) + " – " + fmtDM_(addDays_(mon, 6))) >= 0, true);
    check("keyboard đủ 7 ngày", view.keyboard.length, 7);
    check("nút ngày 1 = Thứ Hai test", view.keyboard[0][0].callback_data, "tlwd:" + mon);
    check("nút ngày 2 = Thứ Ba test", view.keyboard[1][0].callback_data, "tlwd:" + tue);
    check("Thứ Hai: tổng 2h (120p), 4 entries", view.text.indexOf(fmtDuration_(120) + " tracked (4 entries)") >= 0, true);
    check("Thứ Hai: top 3 gồm A (60p)", view.text.indexOf("TEST_WK_A") >= 0, true);
    check("Thứ Hai: top 3 gồm B (30p)", view.text.indexOf("TEST_WK_B") >= 0, true);
    check("Thứ Hai: top 3 gồm C (20p)", view.text.indexOf("TEST_WK_C") >= 0, true);
    check("Thứ Hai: D bị đẩy khỏi top 3", view.text.indexOf("TEST_WK_D") >= 0, false);
    check("Thứ Hai: có ghi +1 khác", view.text.indexOf("+1 khác") >= 0, true);
    check("Thứ Ba: báo trống", view.text.indexOf(WEEKDAY_LABELS_[1] + " " + fmtDM_(tue) + " · — không có dữ liệu") >= 0, true);
  } finally {
    [idA, idB, idC, idD].forEach(function (id) {
      var b = findById_(SHEET_TIMELINE, id);
      if (b) deleteRow_(SHEET_TIMELINE, b._row);
    });
  }

  var res = out.join("\n") + "\n→ " + (out.length - fail) + "/" + out.length + " PASS (đã xoá entry test)";
  Logger.log(res);
  return res;
}
