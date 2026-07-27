/**
 * Recurring.js — việc lặp + streak + sinh task hằng ngày.
 */

/**
 * Thêm định nghĩa việc lặp.
 * intent.streak (tuỳ chọn): chuỗi ngày đã duy trì sẵn — hiểu là "tính đến hôm nay, hôm nay đã xong",
 * nên đặt last_done_date = hôm nay và KHÔNG tạo task todo cho hôm nay nữa.
 */
function recurringAdd(chatId, intent) {
  var title = (intent.title || "").trim();
  var schedule = (intent.schedule || "").trim();
  if (!title || !schedule) {
    sendMessage(chatId, "⚠️ Cần tên + lịch. Ví dụ: <code>/repeat tập gym daily</code> hoặc <code>đi chợ weekly:Sun</code>");
    return;
  }
  var cat = normalizeCategory_(intent.category);
  var streak = Math.max(0, parseInt(intent.streak, 10) || 0);
  var today = todayStr_();
  var id = nextId_(SHEET_RECURRING, "R");
  appendRow_(SHEET_RECURRING, {
    id: id, title: title, schedule: schedule, category: cat, active: true,
    current_streak: streak, longest_streak: streak,
    last_done_date: streak > 0 ? today : "",
    streak_saves: MAX_STREAK_SAVES,
    created_at: fmtDateTime_(now_())
  });
  var msg = "🔁 Đã tạo việc lặp <b>" + esc_(title) + "</b> · " + esc_(schedule) + (cat ? " · " + cat : "");
  if (streak > 0) {
    msg += "\n🔥 Chuỗi hiện tại: <b>" + streak + "</b> (tính hôm nay " + today + " là đã xong)." +
      "\n   Hoàn thành ngày mai sẽ thành " + (streak + 1) + ".";
  }
  if (isScheduled_(schedule, today) && streak === 0) {
    ensureTaskForRecurring_({ id: id, title: title, category: cat }, today);
    msg += "\n📋 Đã thêm vào task hôm nay.";
  }
  sendMessage(chatId, msg);
}

/** Đặt lại chuỗi cho một việc lặp đã có (khai báo streak sẵn có / sửa sai). */
function streakSet(chatId, intent) {
  var target = (intent.target || intent.title || "").trim();
  var n = parseInt(intent.streak, 10);
  if (!target || isNaN(n) || n < 0) {
    sendMessage(chatId, "⚠️ Cần tên việc lặp + số chuỗi. Ví dụ: <code>đặt chuỗi Duolingo là 928</code>");
    return;
  }
  var rows = readRows_(SHEET_RECURRING);
  for (var i = 0; i < rows.length; i++) {
    if (matchName_(rows[i].title, target)) {
      var today = todayStr_();
      var longest = Math.max(Number(rows[i].longest_streak) || 0, n);
      updateRow_(SHEET_RECURRING, rows[i]._row, {
        current_streak: n, longest_streak: longest, last_done_date: n > 0 ? today : ""
      });
      sendMessage(chatId, "🔥 <b>" + esc_(rows[i].title) + "</b> — chuỗi đặt thành <b>" + n + "</b>" +
        " (kỷ lục " + longest + ")" +
        (n > 0 ? "\n   Tính hôm nay " + today + " là đã xong; ngày mai hoàn thành sẽ thành " + (n + 1) + "." : ""));
      return;
    }
  }
  sendMessage(chatId, "⚠️ Không thấy việc lặp khớp \"" + esc_(target) + "\". Xem danh sách bằng /streak.");
}

function streakView(chatId) {
  var rows = readRows_(SHEET_RECURRING).filter(isActive_);
  if (!rows.length) { sendMessage(chatId, "📭 Chưa có việc lặp nào. Tạo bằng <code>/repeat tập gym daily</code>."); return; }
  var lines = rows.map(function (r) {
    var saves = (r.streak_saves != null && r.streak_saves !== "") ? r.streak_saves : MAX_STREAK_SAVES;
    return "🔥 <b>" + esc_(r.title) + "</b> — chuỗi " + (Number(r.current_streak) || 0) +
      " (kỷ lục " + (Number(r.longest_streak) || 0) + ") · 🛟 " + saves +
      "\n   " + esc_(r.schedule) + (r.last_done_date ? " · gần nhất " + r.last_done_date : "");
  });
  sendMessage(chatId, "📈 <b>Việc lặp &amp; streak</b>\n" + lines.join("\n"));
}

function recurringStop(chatId, target) {
  var rows = readRows_(SHEET_RECURRING);
  for (var i = 0; i < rows.length; i++) {
    if (matchName_(rows[i].title, target)) {
      updateRow_(SHEET_RECURRING, rows[i]._row, { active: false });
      sendMessage(chatId, "⏸️ Đã dừng lặp <b>" + esc_(rows[i].title) + "</b> (streak giữ nguyên).");
      return;
    }
  }
  sendMessage(chatId, "⚠️ Không thấy việc lặp khớp \"" + esc_(target) + "\".");
}

function isActive_(r) { return r.active === true || String(r.active).toUpperCase() === "TRUE"; }

/** schedule có rơi vào dateStr không. */
function isScheduled_(schedule, dateStr) {
  var d = parseDateStr_(dateStr);
  if (!d) return false;
  var s = String(schedule || "").trim().toLowerCase();
  if (s === "daily") return true;
  var wk = s.match(/^weekly:(.+)$/);
  if (wk) {
    var names = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    var set = wk[1].split(",").map(function (x) { return x.trim().toLowerCase().slice(0, 3); });
    return set.indexOf(names[d.getDay()]) >= 0;
  }
  var mo = s.match(/^monthly:(.+)$/);
  if (mo) {
    var days = mo[1].split(",").map(function (x) { return parseInt(x.trim(), 10); });
    return days.indexOf(d.getDate()) >= 0;
  }
  return false;
}

function parseDateStr_(dateStr) {
  var m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
}

function addDays_(dateStr, n) {
  var d = parseDateStr_(dateStr);
  d.setDate(d.getDate() + n);
  return Utilities.formatDate(d, TIMEZONE, "yyyy-MM-dd");
}

/** Occurrence lịch ngay trước dateStr (quét lùi tối đa 400 ngày). null nếu không có. */
function prevScheduled_(schedule, dateStr) {
  for (var i = 1; i <= 400; i++) {
    var cand = addDays_(dateStr, -i);
    if (isScheduled_(schedule, cand)) return cand;
  }
  return null;
}

/** Đếm số occurrence lịch nằm strictly giữa (fromDate, toDate). */
function missedBetween_(schedule, fromDate, toDate) {
  var count = 0, cursor = addDays_(fromDate, 1), guard = 0;
  while (cursor < toDate && guard < 800) {
    if (isScheduled_(schedule, cursor)) count++;
    cursor = addDays_(cursor, 1);
    guard++;
  }
  return count;
}

/** Cập nhật streak khi hoàn thành 1 task lặp. Trả message tóm tắt. */
function updateStreakOnComplete_(recId, doneDate) {
  var r = findById_(SHEET_RECURRING, recId);
  if (!r) return "";
  var last = r.last_done_date ? String(r.last_done_date) : "";
  var cur = Number(r.current_streak) || 0;
  var longest = Number(r.longest_streak) || 0;
  var saves = (r.streak_saves != null && r.streak_saves !== "") ? Number(r.streak_saves) : MAX_STREAK_SAVES;
  var msg;
  if (last === String(doneDate)) return ""; // đã tính mốc này
  if (!last) {
    cur = 1; msg = "🔥 Bắt đầu chuỗi: 1";
  } else {
    var prev = prevScheduled_(r.schedule, doneDate);
    if (prev && last === prev) {
      cur += 1; msg = "🔥 Chuỗi " + cur;
    } else {
      var missed = missedBetween_(r.schedule, last, doneDate);
      if (missed <= saves) {
        saves -= missed; cur += 1;
        msg = "🛟 Dùng " + missed + " cứu, giữ chuỗi " + cur + " (còn " + saves + " 🛟)";
      } else {
        cur = 1; msg = "💔 Lỡ " + missed + " mốc, chuỗi reset về 1";
      }
    }
  }
  if (cur > longest) longest = cur;
  updateRow_(SHEET_RECURRING, r._row, {
    current_streak: cur, longest_streak: longest, last_done_date: doneDate, streak_saves: saves
  });
  return msg;
}

/** Đảm bảo có task cho recurring vào 1 ngày (không tạo trùng). Trả true nếu vừa tạo. */
function ensureTaskForRecurring_(rec, dateStr) {
  var existing = readRows_(SHEET_TASKS).filter(function (t) {
    return String(t.repeat) === String(rec.id) && String(t.date) === dateStr;
  });
  if (existing.length) return false;
  appendRow_(SHEET_TASKS, {
    id: nextId_(SHEET_TASKS, "T"), created_at: fmtDateTime_(now_()), date: dateStr, title: rec.title,
    status: TASK_STATUS.TODO, priority: "", category: rec.category || "", note: "",
    started_at: "", completed_at: "", repeat: rec.id
  });
  return true;
}

/** Trigger hằng ngày: sinh task cho các recurring active tới hạn hôm nay. */
function materializeRecurringForToday() {
  var today = todayStr_();
  var recs = readRows_(SHEET_RECURRING).filter(function (r) { return isActive_(r) && isScheduled_(r.schedule, today); });
  var created = 0;
  recs.forEach(function (r) {
    if (ensureTaskForRecurring_({ id: r.id, title: r.title, category: r.category }, today)) created++;
  });
  Logger.log("materializeRecurringForToday: tạo " + created + " task cho " + today);
  return created;
}
