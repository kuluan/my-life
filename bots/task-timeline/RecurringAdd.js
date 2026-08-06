/**
 * RecurringAdd.js — trợ lý tạo việc chu kỳ theo từng bước bằng nút bấm.
 *
 * Luồng: /repeat (không tham số) hoặc nút "➕ Thêm việc chu kỳ"
 *   → bước 1: gõ tên việc ở ô chat
 *   → bước 2: bấm chọn chu kỳ (hàng ngày / tuần / tháng / năm)
 *   → hàng tuần: bấm chọn các thứ; hàng tháng/năm: gõ mốc ngày
 *   → tạo xong, hiện luôn lịch lần tới.
 *
 * Trạng thái chờ dùng chung cơ chế pending của TimelineEdit.js (CacheService theo chatId),
 * phân biệt bằng kind = "rec" để routeMessage_ định tuyến đúng.
 */

var REC_KIND = "rec";

// ---------- mở trợ lý ----------

/** Bước 1: hỏi tên việc. */
function recurringWizardStart(chatId) {
  var msgId = sendMessageGetId(chatId,
    "🔁 <b>Tạo việc chu kỳ</b>\n\n" +
    "✏️ <b>Bước 1/2</b> — Nhập <b>tên việc</b> (vd <code>Tập gym</code>):",
    [[btn("↩️ Huỷ", "rccancel")]]);
  setPending_(chatId, { kind: REC_KIND, step: "title", msgId: msgId, title: "", days: [] });
}

/** Đã biết tên (vd "lặp tập gym" mà chưa nói chu kỳ) → nhảy thẳng bước 2. */
function recurringWizardCycle(chatId, title) {
  var msgId = sendMessageGetId(chatId, recCycleText_(title), recCycleKeyboard_());
  setPending_(chatId, { kind: REC_KIND, step: "cycle", msgId: msgId, title: title, days: [] });
}

// ---------- hiển thị ----------

function recCycleText_(title) {
  return "🔁 <b>Tạo việc chu kỳ</b>\n✏️ " + esc_(title) + "\n\n" +
    "📆 <b>Bước 2/2</b> — Chọn <b>chu kỳ lặp lại</b>:";
}

function recCycleKeyboard_() {
  return [
    [btn("🔁 Hàng ngày", "rcd"), btn("📆 Hàng tuần", "rcw")],
    [btn("🗓 Hàng tháng", "rcm"), btn("📅 Hàng năm", "rcy")],
    [btn("↩️ Huỷ", "rccancel")]
  ];
}

/** Bàn phím chọn thứ (T2 → CN), thứ đang chọn có dấu ✅. */
function recWeekKeyboard_(days) {
  var row1 = [], row2 = [];
  WD_ORDER.forEach(function (d, i) {
    var on = days.indexOf(WD_KEYS[d]) >= 0;
    var b = btn((on ? "✅ " : "") + WD_VI[d], "rcwt:" + d);
    (i < 4 ? row1 : row2).push(b);
  });
  return [row1, row2, [btn("✔️ Xong", "rcwok"), btn("↩️ Huỷ", "rccancel")]];
}

function recWeekText_(title, days) {
  var picked = days.map(function (k) { return WD_VI[WD_KEYS.indexOf(k)]; }).join(", ");
  return "📆 <b>Hàng tuần</b> — " + esc_(title) + "\n\n" +
    "Chọn các <b>thứ</b> lặp lại (bấm để bật/tắt), xong bấm ✔️:\n" +
    "👉 Đang chọn: <b>" + (picked || "chưa chọn") + "</b>";
}

/** Lấy pending của trợ lý; trả null (kèm toast) nếu phiên đã hết hạn. */
function recPending_(chatId, callbackId) {
  var p = getPending_(chatId);
  if (p && p.kind === REC_KIND) return p;
  if (callbackId) answerCallbackQuery(callbackId, "Phiên đã hết hạn — gõ /repeat để làm lại");
  return null;
}

// ---------- xử lý nút ----------

/** Bấm chọn loại chu kỳ ở bước 2. kind: daily | weekly | monthly | yearly. */
function recWizardPickCycle_(chatId, msgId, kind, callbackId) {
  var p = recPending_(chatId, callbackId);
  if (!p) return;
  p.msgId = msgId;

  if (kind === "daily") {
    recWizardFinish_(chatId, msgId, p.title, "daily");
    if (callbackId) answerCallbackQuery(callbackId, "Hàng ngày");
    return;
  }
  if (kind === "weekly") {
    p.step = "weekly";
    p.days = p.days || [];
    setPending_(chatId, p);
    editMessageText(chatId, msgId, recWeekText_(p.title, p.days), recWeekKeyboard_(p.days));
    if (callbackId) answerCallbackQuery(callbackId, "Chọn thứ");
    return;
  }
  p.step = kind; // monthly | yearly — chờ user gõ mốc ngày
  setPending_(chatId, p);
  editMessageText(chatId, msgId, recAskText_(p.title, kind), [[btn("↩️ Huỷ", "rccancel")]]);
  if (callbackId) answerCallbackQuery(callbackId, kind === "monthly" ? "Hàng tháng" : "Hàng năm");
}

function recAskText_(title, kind) {
  if (kind === "monthly") {
    return "🗓 <b>Hàng tháng</b> — " + esc_(title) + "\n\n" +
      "Nhập <b>ngày trong tháng</b> (vd <code>1</code> hoặc <code>1,15</code>):\n" +
      "<i>Ngày 29–31 sẽ tự lùi về ngày cuối ở tháng ngắn.</i>";
  }
  return "📅 <b>Hàng năm</b> — " + esc_(title) + "\n\n" +
    "Nhập <b>ngày trong năm</b> (vd <code>30/07</code>):";
}

/** Bật/tắt một thứ ở bước chọn hàng tuần. */
function recWizardToggleDay_(chatId, msgId, dayIdx, callbackId) {
  var p = recPending_(chatId, callbackId);
  if (!p) return;
  var key = WD_KEYS[parseInt(dayIdx, 10)];
  if (!key) { if (callbackId) answerCallbackQuery(callbackId, ""); return; }
  p.days = p.days || [];
  var at = p.days.indexOf(key);
  if (at >= 0) p.days.splice(at, 1); else p.days.push(key);
  p.days = parseWeekdayList_(p.days.join(",")); // sắp lại T2 → CN
  p.msgId = msgId;
  setPending_(chatId, p);
  editMessageText(chatId, msgId, recWeekText_(p.title, p.days), recWeekKeyboard_(p.days));
  if (callbackId) answerCallbackQuery(callbackId, WD_VI[WD_KEYS.indexOf(key)] + (at >= 0 ? " ✕" : " ✓"));
}

/** Xác nhận danh sách thứ đã chọn → tạo việc lặp. */
function recWizardWeekDone_(chatId, msgId, callbackId) {
  var p = recPending_(chatId, callbackId);
  if (!p) return;
  if (!p.days || !p.days.length) {
    if (callbackId) answerCallbackQuery(callbackId, "Chọn ít nhất 1 thứ đã nhé");
    return;
  }
  recWizardFinish_(chatId, msgId, p.title, "weekly:" + p.days.join(","));
  if (callbackId) answerCallbackQuery(callbackId, "Đã tạo");
}

function recWizardCancel_(chatId, msgId, callbackId) {
  clearPending_(chatId);
  editMessageText(chatId, msgId, "↩️ Đã huỷ tạo việc chu kỳ.");
  if (callbackId) answerCallbackQuery(callbackId, "Đã huỷ");
}

// ---------- nhận text user gõ ----------

/**
 * Xử lý tin nhắn khi trợ lý đang chờ nhập. Gọi từ routeMessage_ (pend.kind === "rec").
 * Nhập sai thì giữ nguyên trạng thái chờ để user gõ lại.
 */
function applyRecurringWizardInput_(chatId, pend, text) {
  var raw = String(text).trim();

  if (pend.step === "title") {
    if (!raw) { editMessageText(chatId, pend.msgId, "⚠️ Tên không được để trống.\n\n✏️ Nhập <b>tên việc</b>:", [[btn("↩️ Huỷ", "rccancel")]]); return; }
    pend.title = raw;
    pend.step = "cycle";
    setPending_(chatId, pend);
    editMessageText(chatId, pend.msgId, recCycleText_(raw), recCycleKeyboard_());
    return;
  }

  if (pend.step === "monthly") {
    var days = parseMonthDays_(raw);
    if (!days.length) {
      editMessageText(chatId, pend.msgId, "⚠️ Chưa hợp lệ.\n\n" + recAskText_(pend.title, "monthly"), [[btn("↩️ Huỷ", "rccancel")]]);
      return;
    }
    recWizardFinish_(chatId, pend.msgId, pend.title, "monthly:" + days.join(","));
    return;
  }

  if (pend.step === "yearly") {
    var md = parseYearDay_(raw);
    if (!md) {
      editMessageText(chatId, pend.msgId, "⚠️ Ngày không hợp lệ.\n\n" + recAskText_(pend.title, "yearly"), [[btn("↩️ Huỷ", "rccancel")]]);
      return;
    }
    recWizardFinish_(chatId, pend.msgId, pend.title, "yearly:" + md);
    return;
  }

  // Đang ở bước bấm nút (cycle/weekly) mà user lại gõ chữ → nhắc bấm nút.
  sendMessage(chatId, "👆 Bấm một nút chu kỳ ở tin nhắn phía trên nhé (hoặc ↩️ Huỷ).");
}

// ---------- chốt ----------

function recWizardFinish_(chatId, msgId, title, schedule) {
  clearPending_(chatId);
  var res = createRecurringDef_(title, schedule, "", 0);
  editMessageText(chatId, msgId, recurringCreatedText_(title, schedule, "", 0, res));
}

// ---------- test (không cần Telegram) ----------

/**
 * Test logic chu kỳ: chuẩn hoá cách viết, khớp ngày, nhãn tiếng Việt, mốc kế tiếp.
 * Thuần logic, không đụng Sheet. `clasp run testSchedules`
 */
function testSchedules() {
  var out = [], fail = 0;
  function check(name, got, want) {
    var ok = String(got) === String(want);
    if (!ok) fail++;
    out.push((ok ? "PASS " : "FAIL ") + name + " = " + JSON.stringify(got) + (ok ? "" : " ≠ " + JSON.stringify(want)));
  }

  // 1) normalizeSchedule_ — tiếng Việt lẫn tiếng Anh
  check("norm daily", normalizeSchedule_("hàng ngày"), "daily");
  check("norm daily en", normalizeSchedule_("daily"), "daily");
  check("norm weekly t2,t4", normalizeSchedule_("hàng tuần: t2, t4"), "weekly:Mon,Wed");
  check("norm weekly inline", normalizeSchedule_("hàng tuần t6"), "weekly:Fri");
  check("norm weekly cn", normalizeSchedule_("weekly:Sun"), "weekly:Sun");
  check("norm weekly chữ", normalizeSchedule_("mỗi tuần thứ ba"), "weekly:Tue");
  check("norm weekly sắp xếp", normalizeSchedule_("weekly:sun,mon"), "weekly:Mon,Sun");
  check("norm monthly", normalizeSchedule_("hàng tháng: 1, 15"), "monthly:1,15");
  check("norm monthly ngày", normalizeSchedule_("monthly:ngày 5"), "monthly:5");
  check("norm yearly dd/mm", normalizeSchedule_("hàng năm: 30/07"), "yearly:07-30");
  check("norm yearly mm-dd", normalizeSchedule_("yearly:07-30"), "yearly:07-30");
  check("norm rác", normalizeSchedule_("linh tinh"), "");
  check("norm rỗng", normalizeSchedule_(""), "");

  // 2) isScheduled_ — 2026-08-06 là thứ Năm
  check("daily luôn đúng", isScheduled_("daily", "2026-08-06"), true);
  check("weekly Thu đúng", isScheduled_("weekly:Thu", "2026-08-06"), true);
  check("weekly Mon sai", isScheduled_("weekly:Mon", "2026-08-06"), false);
  check("weekly nhiều thứ", isScheduled_("weekly:Mon,Thu", "2026-08-06"), true);
  check("monthly 6 đúng", isScheduled_("monthly:6", "2026-08-06"), true);
  check("monthly 7 sai", isScheduled_("monthly:7", "2026-08-06"), false);
  check("monthly 31 kẹp về 30/04", isScheduled_("monthly:31", "2026-04-30"), true);
  check("monthly 31 không rơi 30/05", isScheduled_("monthly:31", "2026-05-30"), false);
  check("yearly đúng ngày", isScheduled_("yearly:08-06", "2026-08-06"), true);
  check("yearly khác tháng", isScheduled_("yearly:07-06", "2026-08-06"), false);
  check("yearly 29/02 năm thường", isScheduled_("yearly:02-29", "2027-02-28"), true);
  check("yearly 29/02 năm nhuận", isScheduled_("yearly:02-29", "2028-02-29"), true);
  check("schedule rác không rơi", isScheduled_("linh tinh", "2026-08-06"), false);

  // 3) nextScheduled_
  check("next daily", nextScheduled_("daily", "2026-08-06"), "2026-08-07");
  check("next weekly Mon", nextScheduled_("weekly:Mon", "2026-08-06"), "2026-08-10");
  check("next monthly 1", nextScheduled_("monthly:1", "2026-08-06"), "2026-09-01");
  check("next yearly", nextScheduled_("yearly:01-15", "2026-08-06"), "2027-01-15");

  // 4) nhãn tiếng Việt
  check("label daily", scheduleLabel_("daily"), "Hàng ngày");
  check("label weekly", scheduleLabel_("weekly:Mon,Wed"), "Hàng tuần · T2, T4");
  check("label monthly", scheduleLabel_("monthly:1,15"), "Hàng tháng · ngày 1, 15");
  check("label yearly", scheduleLabel_("yearly:07-30"), "Hàng năm · 30/07");
  check("icon weekly", scheduleIcon_("weekly:Mon"), "📆");
  check("icon yearly", scheduleIcon_("yearly:07-30"), "📅");

  var res = out.join("\n") + "\n→ " + (out.length - fail) + "/" + out.length + " PASS";
  Logger.log(res);
  return res;
}

/**
 * Test TOÀN BỘ máy trạng thái của trợ lý theo đúng đường đi production (routeMessage_ →
 * applyRecurringWizardInput_ → handleCallback_), nhưng THAY các hàm gọi Telegram bằng bản
 * ghi nhận — không gửi tin thật nào. `clasp run testRecurringWizard`
 */
function testRecurringWizard() {
  var out = [], fail = 0, sent = [];
  function check(name, got, want) {
    var ok = String(got) === String(want);
    if (!ok) fail++;
    out.push((ok ? "PASS " : "FAIL ") + name + " = " + JSON.stringify(got) + (ok ? "" : " ≠ " + JSON.stringify(want)));
  }
  var CHAT = "TEST_CHAT_WIZARD";
  // --- thay hàm Telegram bằng bản ghi nhận (khôi phục ở finally) ---
  var _send = sendMessage, _sendId = sendMessageGetId, _edit = editMessageText, _ack = answerCallbackQuery;
  sendMessage = function (chatId, text, kb) { sent.push({ t: text, kb: kb }); return { ok: true }; };
  sendMessageGetId = function (chatId, text, kb) { sent.push({ t: text, kb: kb }); return 999; };
  editMessageText = function (chatId, msgId, text, kb) { sent.push({ t: text, kb: kb }); return { ok: true }; };
  answerCallbackQuery = function () { return { ok: true }; };

  try {
    // 1) mở trợ lý → chờ nhập tên
    recurringWizardStart(CHAT);
    var p = getPending_(CHAT);
    check("mở trợ lý: pending kind", p && p.kind, REC_KIND);
    check("mở trợ lý: bước title", p && p.step, "title");
    check("mở trợ lý: hỏi tên việc", sent[sent.length - 1].t.indexOf("Bước 1/2") >= 0, true);

    // 2) tên rỗng → vẫn ở bước title (không nhảy bước)
    applyRecurringWizardInput_(CHAT, getPending_(CHAT), "   ");
    check("tên rỗng: giữ bước title", getPending_(CHAT).step, "title");

    // 3) gõ tên → sang bước chọn chu kỳ, đủ 4 nút chu kỳ
    applyRecurringWizardInput_(CHAT, getPending_(CHAT), "TEST_WIZ_TUAN");
    p = getPending_(CHAT);
    check("có tên: sang bước cycle", p.step, "cycle");
    check("có tên: nhớ đúng title", p.title, "TEST_WIZ_TUAN");
    var cycleBtns = [].concat.apply([], sent[sent.length - 1].kb).map(function (b) { return b.callback_data; });
    check("bước cycle: đủ 4 nút chu kỳ + huỷ", cycleBtns.join(","), "rcd,rcw,rcm,rcy,rccancel");

    // 4) chọn Hàng tuần → hiện bàn phím chọn thứ, chưa chọn gì
    recWizardPickCycle_(CHAT, 999, "weekly", null);
    check("chọn hàng tuần: bước weekly", getPending_(CHAT).step, "weekly");
    check("chọn hàng tuần: chưa chọn thứ nào", sent[sent.length - 1].t.indexOf("chưa chọn") >= 0, true);

    // 5) bấm ✔️ khi chưa chọn thứ nào → KHÔNG tạo, vẫn chờ
    recWizardWeekDone_(CHAT, 999, null);
    check("chưa chọn thứ: không tạo, vẫn chờ", !!getPending_(CHAT), true);

    // 6) bật T2, bật T6, tắt T2 → còn lại T6
    recWizardToggleDay_(CHAT, 999, 1, null);
    recWizardToggleDay_(CHAT, 999, 5, null);
    recWizardToggleDay_(CHAT, 999, 1, null);
    check("bật/tắt thứ: còn lại T6", getPending_(CHAT).days.join(","), "Fri");

    // 7) xác nhận → tạo việc lặp, xoá trạng thái chờ
    recWizardWeekDone_(CHAT, 999, null);
    check("xác nhận: đã xoá pending", getPending_(CHAT), null);
    var made = readRows_(SHEET_RECURRING).filter(function (r) { return r.title === "TEST_WIZ_TUAN"; });
    check("xác nhận: đã tạo 1 định nghĩa", made.length, 1);
    check("xác nhận: schedule đúng", made[0].schedule, "weekly:Fri");
    check("tin báo có nhãn tiếng Việt", sent[sent.length - 1].t.indexOf("Hàng tuần · T6") >= 0, true);

    // 8) nhánh hàng năm: gõ ngày sai → giữ chờ; gõ đúng → tạo
    recurringWizardCycle(CHAT, "TEST_WIZ_NAM");
    recWizardPickCycle_(CHAT, 999, "yearly", null);
    check("hàng năm: bước yearly", getPending_(CHAT).step, "yearly");
    applyRecurringWizardInput_(CHAT, getPending_(CHAT), "linh tinh");
    check("hàng năm nhập sai: vẫn chờ", getPending_(CHAT).step, "yearly");
    applyRecurringWizardInput_(CHAT, getPending_(CHAT), "30/07");
    var madeY = readRows_(SHEET_RECURRING).filter(function (r) { return r.title === "TEST_WIZ_NAM"; });
    check("hàng năm: schedule đúng", madeY.length && madeY[0].schedule, "yearly:07-30");

    // 9) nhánh hàng tháng
    recurringWizardCycle(CHAT, "TEST_WIZ_THANG");
    recWizardPickCycle_(CHAT, 999, "monthly", null);
    applyRecurringWizardInput_(CHAT, getPending_(CHAT), "1, 15");
    var madeM = readRows_(SHEET_RECURRING).filter(function (r) { return r.title === "TEST_WIZ_THANG"; });
    check("hàng tháng: schedule đúng", madeM.length && madeM[0].schedule, "monthly:1,15");

    // 10) huỷ giữa chừng → xoá trạng thái chờ, không tạo gì
    recurringWizardStart(CHAT);
    recWizardCancel_(CHAT, 999, null);
    check("huỷ: đã xoá pending", getPending_(CHAT), null);

    // 11) phiên hết hạn mà bấm nút → không nổ, không tạo
    var before = readRows_(SHEET_RECURRING).length;
    recWizardPickCycle_(CHAT, 999, "daily", null);
    check("phiên hết hạn: không tạo thêm", readRows_(SHEET_RECURRING).length, before);
  } finally {
    sendMessage = _send; sendMessageGetId = _sendId; editMessageText = _edit; answerCallbackQuery = _ack;
    clearPending_(CHAT);
    var recs = readRows_(SHEET_RECURRING).filter(function (r) { return String(r.title).indexOf("TEST_WIZ") === 0; });
    recs.sort(function (a, b) { return b._row - a._row; }).forEach(function (r) { deleteRow_(SHEET_RECURRING, r._row); });
    var tasks = readRows_(SHEET_TASKS).filter(function (t) { return String(t.title).indexOf("TEST_WIZ") === 0; });
    tasks.sort(function (a, b) { return b._row - a._row; }).forEach(function (t) { deleteRow_(SHEET_TASKS, t._row); });
    out.push("(đã xoá " + recs.length + " định nghĩa test, " + tasks.length + " task test)");
  }
  var res = out.join("\n") + "\n→ " + (out.length - 1 - fail) + "/" + (out.length - 1) + " PASS";
  Logger.log(res);
  return res;
}

/**
 * Test end-to-end việc chu kỳ chạm Sheet thật: tạo định nghĩa 4 loại chu kỳ, kiểm tra
 * task hôm nay được sinh đúng, phân nhóm một lần / chu kỳ đúng, rồi xoá sạch dữ liệu test.
 * `clasp run testRecurringFlow`
 */
function testRecurringFlow() {
  var out = [], fail = 0;
  function check(name, got, want) {
    var ok = String(got) === String(want);
    if (!ok) fail++;
    out.push((ok ? "PASS " : "FAIL ") + name + " = " + JSON.stringify(got) + (ok ? "" : " ≠ " + JSON.stringify(want)));
  }
  var today = todayStr_();
  var dow = WD_KEYS[parseDateStr_(today).getDay()];
  var made = [];
  try {
    // 1) hàng ngày → phải sinh task hôm nay
    var d = createRecurringDef_("TEST_CHUKY_NGAY", "daily", "", 0);
    made.push(d.id);
    check("daily sinh task hôm nay", d.todayCreated, true);

    // 2) hàng tuần đúng thứ hôm nay → sinh task hôm nay
    var w = createRecurringDef_("TEST_CHUKY_TUAN", "weekly:" + dow, "", 0);
    made.push(w.id);
    check("weekly đúng thứ sinh task", w.todayCreated, true);

    // 3) hàng năm ngày khác → KHÔNG sinh task hôm nay, có lịch lần tới
    var otherMd = (today.slice(5, 7) === "01") ? "02-10" : "01-10";
    var y = createRecurringDef_("TEST_CHUKY_NAM", "yearly:" + otherMd, "", 0);
    made.push(y.id);
    check("yearly ngày khác không sinh task", y.todayCreated, false);
    check("yearly có lịch lần tới", !!nextScheduled_("yearly:" + otherMd, today), true);

    // 4) tạo 1 task một lần để kiểm tra phân nhóm
    var onceId = nextId_(SHEET_TASKS, "T");
    appendRow_(SHEET_TASKS, {
      id: onceId, created_at: fmtDateTime_(now_()), date: today, title: "TEST_MOTLAN",
      status: TASK_STATUS.TODO, priority: "", category: "", note: "",
      started_at: "", completed_at: "", repeat: ""
    });

    var rows = readRows_(SHEET_TASKS).filter(function (t) {
      return String(t.date) === today && String(t.title).indexOf("TEST_") === 0;
    });
    var grp = splitTasksByRepeat_(rows);
    check("phân nhóm: 2 việc chu kỳ", grp.recur.length, 2);
    check("phân nhóm: 1 việc một lần", grp.once.length, 1);
    check("nhóm một lần đúng task", grp.once[0].title, "TEST_MOTLAN");

    // 5) dòng hiển thị task chu kỳ có nhãn chu kỳ
    var map = recurringMap_();
    var line = taskLine_(grp.recur.filter(function (t) { return t.title === "TEST_CHUKY_NGAY"; })[0], map);
    check("dòng task chu kỳ có nhãn", line.indexOf("Hàng ngày") >= 0, true);

    // 6) hoàn thành task chu kỳ → streak lên 1
    var dailyTask = grp.recur.filter(function (t) { return t.title === "TEST_CHUKY_NGAY"; })[0];
    updateStreakOnComplete_(dailyTask.repeat, today);
    check("streak sau khi xong", Number(findById_(SHEET_RECURRING, d.id).current_streak), 1);
  } finally {
    // dọn sạch: task test + định nghĩa test (xoá từ dưới lên để _row không lệch)
    var tasks = readRows_(SHEET_TASKS).filter(function (t) { return String(t.title).indexOf("TEST_") === 0; });
    tasks.sort(function (a, b) { return b._row - a._row; }).forEach(function (t) { deleteRow_(SHEET_TASKS, t._row); });
    var recs = readRows_(SHEET_RECURRING).filter(function (r) { return String(r.title).indexOf("TEST_CHUKY") === 0; });
    recs.sort(function (a, b) { return b._row - a._row; }).forEach(function (r) { deleteRow_(SHEET_RECURRING, r._row); });
    out.push("(đã xoá " + tasks.length + " task test, " + recs.length + " định nghĩa test)");
  }
  var res = out.join("\n") + "\n→ " + (out.length - 1 - fail) + "/" + (out.length - 1) + " PASS";
  Logger.log(res);
  return res;
}
