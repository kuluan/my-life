/**
 * TimelineEdit.js — menu tương tác đầy đủ cho một timeline entry.
 *
 * Luồng: bấm nút → bot sửa CHÍNH tin nhắn menu thành câu hỏi → user gõ giá trị
 * ở ô chat bình thường → bot cập nhật, sửa tin nhắn về lại menu. Không sinh tin
 * rác, không cần lệnh đặc biệt.
 *
 * Trạng thái "đang chờ nhập" lưu ở CacheService theo chatId (TTL 15 phút),
 * gồm {field, id, msgId} — msgId để sửa đúng tin nhắn menu ban đầu.
 */

var PENDING_TTL_SEC = 900;

// Nhãn + câu hỏi theo từng trường sửa được.
var TL_FIELDS = {
  title: { icon: "✏️", label: "Tên", ask: "Nhập <b>tên hoạt động</b> mới:" },
  note: { icon: "📝", label: "Ghi chú", ask: "Nhập <b>ghi chú</b> (gõ <code>-</code> để xoá ghi chú):" },
  start: { icon: "🕐", label: "Giờ bắt đầu", ask: "Nhập <b>giờ bắt đầu</b> (vd <code>8:30</code>, <code>8h30</code>, <code>0830</code>):" },
  end: { icon: "🕑", label: "Giờ kết thúc", ask: "Nhập <b>giờ kết thúc</b> (vd <code>17:00</code>; gõ <code>-</code> để mở lại):" },
  date: { icon: "📅", label: "Ngày", ask: "Nhập <b>ngày</b> (vd <code>30/07</code>, <code>hôm qua</code>, <code>2 ngày trước</code>):" }
};

// ---------- trạng thái chờ nhập ----------

function setPending_(chatId, obj) {
  CacheService.getScriptCache().put("pend_" + chatId, JSON.stringify(obj), PENDING_TTL_SEC);
}
function getPending_(chatId) {
  var v = CacheService.getScriptCache().get("pend_" + chatId);
  return v ? JSON.parse(v) : null;
}
function clearPending_(chatId) {
  CacheService.getScriptCache().remove("pend_" + chatId);
}

// ---------- hiển thị ----------

/** Tóm tắt một entry để hiện trên menu. */
function renderTimelineEntry_(b) {
  var running = !b.end_at;
  return "🕒 <b>" + esc_(b.title) + "</b>\n" +
    "📅 " + b.date + "\n" +
    "⏱ " + b.start_at + (running ? "… <i>(đang chạy)</i>" : "–" + b.end_at + " · " + fmtDuration_(b.duration_min)) +
    (b.category ? "\n🏷 " + esc_(b.category) : "") +
    (b.note ? "\n📝 " + esc_(b.note) : "");
}

/**
 * Inline keyboard đầy đủ cho entry — chỉ các nút hành động thực sự; mỗi thao tác sửa tự lưu
 * ngay sau khi user nhập xong (applyTimelineEdit_), không có bước "xác nhận & lưu" riêng.
 * @param {string} [backDate] Nếu entry được mở từ danh sách /timeline của ngày này, đính kèm
 *   ngày đó vào callback_data (action:id:backDate) để "Xoá" quay lại đúng danh sách.
 */
function timelineMenu_(b, backDate) {
  var id = b.id;
  var suf = backDate ? (":" + backDate) : "";
  var rows = [
    [btn("✏️ Sửa tên", "te:" + id + suf), btn("📝 Ghi chú", "tn:" + id + suf)],
    [btn("🕐 Giờ bắt đầu", "tb:" + id + suf), btn("🕑 Giờ kết thúc", "tf:" + id + suf)],
    [btn("📅 Đổi ngày", "tdate:" + id + suf), btn("🗑️ Xoá", "lx:" + id + suf)]
  ];
  if (!b.end_at) rows.push([btn("⏹️ Kết thúc ngay", "ls:" + id)]);
  return rows;
}

/** Gửi entry kèm menu (dùng khi vừa bắt đầu / vừa hoàn thành / vừa ghi khoảng). */
function sendTimelineCard_(chatId, id, header) {
  var b = findById_(SHEET_TIMELINE, id);
  if (!b) { sendMessage(chatId, "⚠️ Không tìm thấy hoạt động."); return; }
  sendMessage(chatId, (header ? header + "\n\n" : "") + renderTimelineEntry_(b), timelineMenu_(b));
}

/** Mở menu đầy đủ của 1 entry ngay trong tin nhắn danh sách (bấm chọn từ /timeline). */
function openTimelineEntryFromList_(chatId, msgId, id, backDate, callbackId) {
  var b = findById_(SHEET_TIMELINE, id);
  if (!b) { if (callbackId) answerCallbackQuery(callbackId, "Không tìm thấy"); return; }
  editMessageText(chatId, msgId, renderTimelineEntry_(b), timelineMenu_(b, backDate));
  if (callbackId) answerCallbackQuery(callbackId, "");
}

/** Vẽ lại menu vào đúng tin nhắn cũ. */
function refreshTimelineCard_(chatId, msgId, id, note, backDate) {
  var b = findById_(SHEET_TIMELINE, id);
  if (!b) { editMessageText(chatId, msgId, "🗑 Hoạt động đã bị xoá."); return; }
  editMessageText(chatId, msgId, renderTimelineEntry_(b) + (note ? "\n\n" + note : ""), timelineMenu_(b, backDate));
}

// ---------- xử lý nút ----------

/** Bấm nút sửa một trường → hỏi giá trị ngay trên tin nhắn menu. */
function askTimelineEdit_(chatId, msgId, id, field, callbackId, backDate) {
  var b = findById_(SHEET_TIMELINE, id);
  if (!b) { if (callbackId) answerCallbackQuery(callbackId, "Không tìm thấy"); return; }
  var f = TL_FIELDS[field];
  setPending_(chatId, { field: field, id: id, msgId: msgId, backDate: backDate || "" });
  editMessageText(chatId, msgId,
    renderTimelineEntry_(b) + "\n\n" + f.icon + " " + f.ask,
    [[btn("↩️ Huỷ", "tcancel:" + id + (backDate ? ":" + backDate : ""))]]);
  if (callbackId) answerCallbackQuery(callbackId, f.label);
}

/** Huỷ chờ nhập, quay lại menu. */
function cancelTimelineEdit_(chatId, msgId, id, callbackId, backDate) {
  clearPending_(chatId);
  refreshTimelineCard_(chatId, msgId, id, "", backDate);
  if (callbackId) answerCallbackQuery(callbackId, "Đã huỷ");
}

// ---------- áp dụng giá trị user gõ ----------

/**
 * Áp dụng text user vừa gõ cho trường đang chờ. Gọi từ routeMessage_.
 * @return {boolean} true nếu đã tiêu thụ tin nhắn này.
 */
function applyTimelineEdit_(chatId, pend, text) {
  var b = findById_(SHEET_TIMELINE, pend.id);
  if (!b) { clearPending_(chatId); sendMessage(chatId, "⚠️ Hoạt động không còn tồn tại."); return true; }

  var res = buildTimelinePatch_(b, pend.field, text);
  if (res.err) { // giữ nguyên trạng thái chờ để user nhập lại
    var f = TL_FIELDS[pend.field];
    editMessageText(chatId, pend.msgId,
      renderTimelineEntry_(b) + "\n\n⚠️ " + res.err + "\n" + f.icon + " " + f.ask,
      [[btn("↩️ Huỷ", "tcancel:" + pend.id + (pend.backDate ? ":" + pend.backDate : ""))]]);
    return true;
  }

  clearPending_(chatId);
  updateRow_(SHEET_TIMELINE, b._row, res.patch);
  refreshTimelineCard_(chatId, pend.msgId, pend.id,
    "✅ <i>Đã cập nhật " + TL_FIELDS[pend.field].label.toLowerCase() + ".</i>", pend.backDate);
  return true;
}

/**
 * Logic thuần: dựng patch từ giá trị user gõ (tách khỏi I/O để test được).
 * @return {{patch: Object, err: string}}
 */
function buildTimelinePatch_(b, field, text) {
  var raw = String(text).trim();
  var patch = {}, err = "";

  switch (field) {
    case "title":
      if (!raw) err = "Tên không được để trống.";
      else patch.title = raw;
      break;
    case "note":
      patch.note = (raw === "-") ? "" : raw;
      break;
    case "start":
      var s = parseTimeInput_(raw);
      if (!s) err = "Giờ không hợp lệ. Ví dụ: <code>8:30</code>, <code>8h30</code>, <code>0830</code>.";
      else patch.start_at = s;
      break;
    case "end":
      if (raw === "-") { patch.end_at = ""; patch.duration_min = ""; }
      else {
        var e = parseTimeInput_(raw);
        if (!e) err = "Giờ không hợp lệ. Ví dụ: <code>17:00</code>, <code>17h</code>.";
        else patch.end_at = e;
      }
      break;
    case "date":
      var d = parseDateInput_(raw);
      if (!d) err = "Ngày không hợp lệ. Ví dụ: <code>30/07</code>, <code>hôm qua</code>, <code>2 ngày trước</code>.";
      else patch.date = d;
      break;
    default:
      err = "Trường không hỗ trợ.";
  }

  // Tính lại thời lượng khi giờ thay đổi và entry đã đóng.
  if (!err && patch.duration_min === undefined) {
    var ns = patch.start_at || b.start_at;
    var ne = (patch.end_at !== undefined) ? patch.end_at : b.end_at;
    if (ns && ne) patch.duration_min = diffMinutes_(ns, ne);
  }
  return { patch: patch, err: err };
}

// ---------- parser giá trị ----------

/** "8:30" · "8h30" · "8h" · "0830" · "8" → "08:30". Trả "" nếu sai. */
function parseTimeInput_(s) {
  var t = String(s || "").trim().toLowerCase().replace(/\s+/g, "").replace(/g$/, "");
  var h, mi, m;
  if ((m = t.match(/^(\d{1,2})[:h.](\d{1,2})$/))) { h = +m[1]; mi = +m[2]; }
  else if ((m = t.match(/^(\d{1,2})h$/))) { h = +m[1]; mi = 0; }
  else if ((m = t.match(/^(\d{1,2})(\d{2})$/))) { h = +m[1]; mi = +m[2]; }
  else if ((m = t.match(/^(\d{1,2})$/))) { h = +m[1]; mi = 0; }
  else return "";
  if (isNaN(h) || isNaN(mi) || h > 23 || mi > 59) return "";
  return ("0" + h).slice(-2) + ":" + ("0" + mi).slice(-2);
}

/** "30/07" · "30/7/2026" · "2026-07-30" · "hôm qua" · "2 ngày trước" → "yyyy-MM-dd". "" nếu sai. */
function parseDateInput_(s) {
  var t = String(s || "").trim().toLowerCase();
  var today = todayStr_();
  if (/^(hôm nay|hom nay|nay|today)$/.test(t)) return today;
  if (/^(hôm qua|hom qua|qua|yesterday)$/.test(t)) return addDays_(today, -1);
  if (/^(hôm kia|hom kia)$/.test(t)) return addDays_(today, -2);
  if (/^(ngày mai|ngay mai|mai|tomorrow)$/.test(t)) return addDays_(today, 1);

  var m = t.match(/^(\d+)\s*(ngày|ngay)\s*(trước|truoc)$/);
  if (m) return addDays_(today, -parseInt(m[1], 10));
  m = t.match(/^(\d+)\s*(ngày|ngay)\s*(nữa|nua|sau)$/);
  if (m) return addDays_(today, parseInt(m[1], 10));

  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;

  m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?$/);
  if (m) {
    var d = parseInt(m[1], 10), mo = parseInt(m[2], 10);
    var y = m[3] ? parseInt(m[3], 10) : parseInt(today.slice(0, 4), 10);
    if (y < 100) y += 2000;
    if (d < 1 || d > 31 || mo < 1 || mo > 12) return "";
    return y + "-" + ("0" + mo).slice(-2) + "-" + ("0" + d).slice(-2);
  }
  return "";
}

// ---------- test (không cần Telegram) ----------

/**
 * Test tích hợp luồng sửa: tạo entry thật → áp từng loại sửa qua buildTimelinePatch_
 * (chính hàm production dùng) → ghi Sheet → đọc lại đối chiếu → xoá sạch.
 * Không gửi tin Telegram. `clasp run testTimelineEditFlow`
 */
function testTimelineEditFlow() {
  var out = [], fail = 0;
  function check(name, got, want) {
    var ok = String(got) === String(want);
    if (!ok) fail++;
    out.push((ok ? "PASS " : "FAIL ") + name + " = " + JSON.stringify(got) + (ok ? "" : " ≠ " + JSON.stringify(want)));
  }
  var id = createTimelineBlock_("2000-01-01", "TEST_EDIT_TAM", "08:00", "", "", "");
  try {
    // 1) sửa tên
    var b = findById_(SHEET_TIMELINE, id);
    var r = buildTimelinePatch_(b, "title", "  Tên mới  ");
    updateRow_(SHEET_TIMELINE, b._row, r.patch);
    check("title", findById_(SHEET_TIMELINE, id).title, "Tên mới");

    // 2) đặt giờ kết thúc → duration tự tính (08:00→09:30 = 90)
    b = findById_(SHEET_TIMELINE, id);
    r = buildTimelinePatch_(b, "end", "9h30");
    updateRow_(SHEET_TIMELINE, b._row, r.patch);
    b = findById_(SHEET_TIMELINE, id);
    check("end_at", b.end_at, "09:30");
    check("duration", b.duration_min, 90);

    // 3) sửa giờ bắt đầu → duration tính lại (07:00→09:30 = 150)
    r = buildTimelinePatch_(b, "start", "0700");
    updateRow_(SHEET_TIMELINE, b._row, r.patch);
    b = findById_(SHEET_TIMELINE, id);
    check("start_at", b.start_at, "07:00");
    check("duration sau khi sửa", b.duration_min, 150);

    // 4) đổi ngày sang "hôm qua"
    r = buildTimelinePatch_(b, "date", "hôm qua");
    updateRow_(SHEET_TIMELINE, b._row, r.patch);
    check("date", findById_(SHEET_TIMELINE, id).date, addDays_(todayStr_(), -1));

    // 5) ghi chú, rồi xoá ghi chú bằng "-"
    b = findById_(SHEET_TIMELINE, id);
    updateRow_(SHEET_TIMELINE, b._row, buildTimelinePatch_(b, "note", "ghi chú thử").patch);
    check("note", findById_(SHEET_TIMELINE, id).note, "ghi chú thử");
    b = findById_(SHEET_TIMELINE, id);
    updateRow_(SHEET_TIMELINE, b._row, buildTimelinePatch_(b, "note", "-").patch);
    check("note xoá", findById_(SHEET_TIMELINE, id).note, "");

    // 6) mở lại entry bằng "-" ở giờ kết thúc
    b = findById_(SHEET_TIMELINE, id);
    updateRow_(SHEET_TIMELINE, b._row, buildTimelinePatch_(b, "end", "-").patch);
    b = findById_(SHEET_TIMELINE, id);
    check("end_at mở lại", b.end_at, "");
    check("duration xoá", b.duration_min, "");

    // 7) giá trị sai → báo lỗi, KHÔNG đổi dữ liệu
    check("giờ sai báo lỗi", !!buildTimelinePatch_(b, "start", "99:99").err, true);
    check("ngày sai báo lỗi", !!buildTimelinePatch_(b, "date", "linh tinh").err, true);
    check("tên trống báo lỗi", !!buildTimelinePatch_(b, "title", "   ").err, true);
  } finally {
    var last = findById_(SHEET_TIMELINE, id);
    if (last) deleteRow_(SHEET_TIMELINE, last._row); // dọn sạch dữ liệu test
  }
  var res = out.join("\n") + "\n→ " + (out.length - fail) + "/" + out.length + " PASS (đã xoá entry test)";
  Logger.log(res);
  return res;
}

/** Test parser giờ/ngày. `clasp run testEditParsers` — kỳ vọng tất cả PASS. */
function testEditParsers() {
  var today = todayStr_();
  var y = parseInt(today.slice(0, 4), 10);
  var cases = [
    ["time", "8:30", "08:30"], ["time", "8h30", "08:30"], ["time", "0830", "08:30"],
    ["time", "17h", "17:00"], ["time", "9", "09:00"], ["time", "25:00", ""], ["time", "abc", ""],
    ["date", "30/07", y + "-07-30"], ["date", "5/8/2025", "2025-08-05"],
    ["date", "2026-07-30", "2026-07-30"], ["date", "hôm nay", today],
    ["date", "hôm qua", addDays_(today, -1)], ["date", "2 ngày trước", addDays_(today, -2)],
    ["date", "linh tinh", ""]
  ];
  var out = [], fail = 0;
  cases.forEach(function (c) {
    var got = c[0] === "time" ? parseTimeInput_(c[1]) : parseDateInput_(c[1]);
    var ok = got === c[2];
    if (!ok) fail++;
    out.push((ok ? "PASS" : "FAIL") + " " + c[0] + "(" + c[1] + ") = " + JSON.stringify(got) +
      (ok ? "" : " ≠ " + JSON.stringify(c[2])));
  });
  var r = out.join("\n") + "\n→ " + (cases.length - fail) + "/" + cases.length + " PASS";
  Logger.log(r);
  return r;
}

/**
 * Test menu timeline entry KHÔNG còn nút "✅ Xác nhận & lưu" (đã bỏ, mỗi sửa tự lưu ngay) và
 * vẫn đủ đúng các nút hành động thực sự. `clasp run testTimelineMenuNoConfirm`
 */
function testTimelineMenuNoConfirm() {
  var out = [], fail = 0;
  function check(name, got, want) {
    var ok = String(got) === String(want);
    if (!ok) fail++;
    out.push((ok ? "PASS " : "FAIL ") + name + " = " + JSON.stringify(got) + (ok ? "" : " ≠ " + JSON.stringify(want)));
  }
  var id = createTimelineBlock_("2000-01-05", "TEST_MENU_OPEN", "08:00", "", "", ""); // đang chạy
  var id2 = createTimelineBlock_("2000-01-05", "TEST_MENU_CLOSED", "08:00", "09:00", "", ""); // đã đóng
  try {
    var bOpen = findById_(SHEET_TIMELINE, id);
    var flatOpen = [].concat.apply([], timelineMenu_(bOpen));
    var dataOpen = flatOpen.map(function (b) { return b.callback_data.split(":")[0]; });
    check("entry đang chạy: không còn nút tok", dataOpen.indexOf("tok") >= 0, false);
    check("entry đang chạy: không còn text 'Xác nhận'", flatOpen.some(function (b) { return b.text.indexOf("Xác nhận") >= 0; }), false);
    check("entry đang chạy: đủ 7 nút (6 sửa/xoá + kết thúc ngay)", flatOpen.length, 7);
    check("entry đang chạy: có nút kết thúc ngay (ls)", dataOpen.indexOf("ls") >= 0, true);
    ["te", "tn", "tb", "tf", "tdate", "lx"].forEach(function (a) {
      check("entry đang chạy: có nút " + a, dataOpen.indexOf(a) >= 0, true);
    });

    var bClosed = findById_(SHEET_TIMELINE, id2);
    var flatClosed = [].concat.apply([], timelineMenu_(bClosed));
    var dataClosed = flatClosed.map(function (b) { return b.callback_data.split(":")[0]; });
    check("entry đã đóng: không còn nút tok", dataClosed.indexOf("tok") >= 0, false);
    check("entry đã đóng: không có nút kết thúc ngay (ls)", dataClosed.indexOf("ls") >= 0, false);
    check("entry đã đóng: đủ 6 nút (không có kết thúc ngay/tok)", flatClosed.length, 6);

    // backDate vẫn được giữ trên các nút còn lại (để xoá vẫn quay lại đúng danh sách)
    var flatBack = [].concat.apply([], timelineMenu_(bClosed, "2000-01-05"));
    var lxBtn = flatBack.filter(function (b) { return b.callback_data.indexOf("lx:") === 0; })[0];
    check("nút Xoá vẫn giữ backDate khi có", lxBtn.callback_data, "lx:" + id2 + ":2000-01-05");
  } finally {
    [id, id2].forEach(function (rid) {
      var b = findById_(SHEET_TIMELINE, rid);
      if (b) deleteRow_(SHEET_TIMELINE, b._row);
    });
  }
  var res = out.join("\n") + "\n→ " + (out.length - fail) + "/" + out.length + " PASS (đã xoá entry test)";
  Logger.log(res);
  return res;
}
