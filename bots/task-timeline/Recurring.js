/**
 * Recurring.js — việc lặp (chu kỳ) + streak + sinh task hằng ngày.
 *
 * Chu kỳ hỗ trợ (dạng chuẩn lưu trong cột `schedule`):
 *   daily · weekly:Mon,Wed · monthly:1,15 · yearly:MM-DD
 * Người dùng gõ kiểu gì cũng được ("hàng tuần T2", "mỗi năm 30/07"…) —
 * normalizeSchedule_() quy về dạng chuẩn trước khi ghi.
 */

/**
 * Thêm định nghĩa việc lặp.
 * intent.streak (tuỳ chọn): chuỗi ngày đã duy trì sẵn — hiểu là "tính đến hôm nay, hôm nay đã xong",
 * nên đặt last_done_date = hôm nay và KHÔNG tạo task todo cho hôm nay nữa.
 */
function recurringAdd(chatId, intent) {
  var title = (intent.title || "").trim();
  var schedule = normalizeSchedule_(intent.schedule);
  if (!title) {
    recurringWizardStart(chatId); // chưa rõ tên → mở trợ lý từng bước
    return;
  }
  if (!schedule) {
    recurringWizardCycle(chatId, title); // có tên, chưa rõ chu kỳ → hỏi chu kỳ bằng nút
    return;
  }
  var cat = normalizeCategory_(intent.category);
  var streak = Math.max(0, parseInt(intent.streak, 10) || 0);
  var res = createRecurringDef_(title, schedule, cat, streak);
  sendMessage(chatId, recurringCreatedText_(title, schedule, cat, streak, res));
}

/**
 * Ghi định nghĩa việc lặp xuống sheet + sinh task hôm nay nếu tới hạn.
 * Tách khỏi I/O Telegram để cả câu tự nhiên lẫn trợ lý nút bấm dùng chung (và test được).
 * @return {{id:string, today:string, todayCreated:boolean}}
 */
function createRecurringDef_(title, schedule, category, streak) {
  var today = todayStr_();
  var id = nextId_(SHEET_RECURRING, "R");
  appendRow_(SHEET_RECURRING, {
    id: id, title: title, schedule: schedule, category: category || "", active: true,
    current_streak: streak, longest_streak: streak,
    last_done_date: streak > 0 ? today : "",
    streak_saves: MAX_STREAK_SAVES,
    created_at: fmtDateTime_(now_())
  });
  var todayCreated = false;
  if (isScheduled_(schedule, today) && streak === 0) {
    todayCreated = ensureTaskForRecurring_({ id: id, title: title, category: category || "" }, today);
  }
  return { id: id, today: today, todayCreated: todayCreated };
}

/** Câu thông báo sau khi tạo việc lặp (dùng chung cho mọi lối tạo). */
function recurringCreatedText_(title, schedule, category, streak, res) {
  var msg = "🔁 Đã tạo việc lặp <b>" + esc_(title) + "</b>\n" +
    scheduleIcon_(schedule) + " " + esc_(scheduleLabel_(schedule)) +
    (category ? " · 🏷️ " + esc_(category) : "");
  if (streak > 0) {
    msg += "\n🔥 Chuỗi hiện tại: <b>" + streak + "</b> (tính hôm nay " + res.today + " là đã xong)." +
      "\n   Hoàn thành ngày mai sẽ thành " + (streak + 1) + ".";
  }
  if (res.todayCreated) {
    msg += "\n📋 Đã thêm vào task hôm nay — xem bằng /tasks.";
  } else {
    var nxt = nextScheduled_(schedule, res.today);
    if (nxt) msg += "\n📅 Lần tới: " + fmtDayVi_(nxt);
  }
  return msg;
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
  var addBtn = [[btn("➕ Thêm việc chu kỳ", "rcnew")]];
  var rows = readRows_(SHEET_RECURRING).filter(isActive_);
  if (!rows.length) {
    sendMessage(chatId, "📭 Chưa có việc chu kỳ nào.\nTạo bằng nút bên dưới, hoặc <code>/repeat tập gym hàng ngày</code>.", addBtn);
    return;
  }
  var lines = rows.map(function (r) {
    var saves = (r.streak_saves != null && r.streak_saves !== "") ? r.streak_saves : MAX_STREAK_SAVES;
    return "🔥 <b>" + esc_(r.title) + "</b> — chuỗi " + (Number(r.current_streak) || 0) +
      " (kỷ lục " + (Number(r.longest_streak) || 0) + ") · 🛟 " + saves +
      "\n   " + scheduleIcon_(r.schedule) + " " + esc_(scheduleLabel_(r.schedule)) +
      (r.last_done_date ? " · gần nhất " + fmtDayVi_(r.last_done_date) : "");
  });
  sendMessage(chatId, "📈 <b>Việc chu kỳ &amp; streak</b>\n" + lines.join("\n"), addBtn);
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

// ---------------------------------------------------------------------------
// Bộ xử lý chu kỳ: hàng ngày / hàng tuần / hàng tháng / hàng năm
// ---------------------------------------------------------------------------

var WD_KEYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]; // index = Date.getDay()
var WD_VI = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
var WD_ORDER = [1, 2, 3, 4, 5, 6, 0]; // thứ tự hiển thị T2 → CN

// Nhận dạng loại chu kỳ từ cách viết tiếng Việt lẫn tiếng Anh.
var SCHED_KINDS = [
  { kind: "daily", re: /^(daily|every ?day|(hàng|hằng|hang|mỗi|moi) ?(ngày|ngay))/ },
  { kind: "weekly", re: /^(weekly|(hàng|hằng|hang|mỗi|moi) ?(tuần|tuan))/ },
  { kind: "monthly", re: /^(monthly|(hàng|hằng|hang|mỗi|moi) ?(tháng|thang))/ },
  { kind: "yearly", re: /^(yearly|annually|(hàng|hằng|hang|mỗi|moi) ?(năm|nam))/ }
];

function pad2_(n) { return ("0" + n).slice(-2); }
function daysInMonth_(year, month1) { return new Date(year, month1, 0).getDate(); }

/** "yyyy-MM-dd" → "dd/MM" cho dễ đọc trên Telegram. */
function fmtDayVi_(dateStr) {
  var m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? (m[3] + "/" + m[2]) : String(dateStr || "");
}

/**
 * Quy mọi cách viết chu kỳ về dạng chuẩn: "daily" | "weekly:Mon,Wed" | "monthly:1,15" | "yearly:MM-DD".
 * Thiếu tham số thì lấy mốc của hôm nay (vd "hàng tuần" → thứ của hôm nay).
 * @return {string} "" nếu không nhận ra chu kỳ nào.
 */
function normalizeSchedule_(raw) {
  var s = String(raw || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!s) return "";
  var head = s, arg = "";
  var c = s.indexOf(":");
  if (c >= 0) { head = s.slice(0, c).trim(); arg = s.slice(c + 1).trim(); }

  for (var i = 0; i < SCHED_KINDS.length; i++) {
    var def = SCHED_KINDS[i];
    if (!def.re.test(head)) continue;
    if (!arg) arg = head.replace(def.re, "").trim(); // vd "hàng tuần t2" → arg = "t2"
    var today = parseDateStr_(todayStr_());
    if (def.kind === "daily") return "daily";
    if (def.kind === "weekly") {
      var days = parseWeekdayList_(arg);
      if (!days.length) days = [WD_KEYS[today.getDay()]];
      return "weekly:" + days.join(",");
    }
    if (def.kind === "monthly") {
      var md = parseMonthDays_(arg);
      if (!md.length) md = [today.getDate()];
      return "monthly:" + md.join(",");
    }
    var ym = parseYearDay_(arg);
    return "yearly:" + (ym || todayStr_().slice(5));
  }
  return "";
}

// Tên thứ viết bằng chữ → index Date.getDay(). "thứ hai" = 1 … "thứ bảy" = 6.
var VI_DAY_WORDS = { "hai": 1, "ba": 2, "tư": 3, "tu": 3, "bốn": 3, "bon": 3, "năm": 4, "nam": 4, "sáu": 5, "sau": 5, "bảy": 6, "bay": 6 };

/**
 * Gom cụm thứ viết bằng chữ ("chủ nhật", "thứ ba") thành token liền ("cn", "t3")
 * TRƯỚC khi tách theo dấu phẩy/khoảng trắng — nếu không, "thứ ba" bị xé làm đôi và mất nghĩa.
 */
function normWeekdayText_(s) {
  return String(s || "").toLowerCase()
    .replace(/(chủ|chu)\s*(nhật|nhat)/g, "cn")
    .replace(/(thứ|thu)\s*(hai|ba|tư|tu|bốn|bon|năm|nam|sáu|sau|bảy|bay)/g, function (all, _p, w) {
      return "t" + (VI_DAY_WORDS[w] + 1);
    })
    .replace(/(thứ|thu)\s*([2-7])/g, "t$2");
}

/** "t2, T4" · "mon,wed" · "thứ ba" · "2 4" → ["Mon","Wed"] (thứ tự T2→CN, bỏ trùng). */
function parseWeekdayList_(arg) {
  var out = [];
  normWeekdayText_(arg).split(/[,;\/\s]+/).forEach(function (tok) {
    var d = parseWeekday_(tok);
    if (d >= 0 && out.indexOf(WD_KEYS[d]) < 0) out.push(WD_KEYS[d]);
  });
  out.sort(function (a, b) {
    return WD_ORDER.indexOf(WD_KEYS.indexOf(a)) - WD_ORDER.indexOf(WD_KEYS.indexOf(b));
  });
  return out;
}

/** Một token thứ (đã gom bằng normWeekdayText_) → index 0..6 (CN=0). -1 nếu không nhận ra. */
function parseWeekday_(tok) {
  var t = String(tok || "").trim().toLowerCase().replace(/\./g, "");
  if (!t) return -1;
  if (/^(cn|sun|sunday|t8)$/.test(t)) return 0;
  var m = t.match(/^t\s*([2-7])$/); // t2 … t7
  if (m) return parseInt(m[1], 10) - 1;
  if (/^[2-7]$/.test(t)) return parseInt(t, 10) - 1; // "2" = T2
  var eng = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(t.slice(0, 3));
  return eng >= 0 ? eng : -1;
}

/** "1, 15" · "ngày 1" → [1,15] (1..31, tăng dần, bỏ trùng). */
function parseMonthDays_(arg) {
  var out = [];
  String(arg || "").replace(/ngày|ngay/g, " ").split(/[,;\/\s]+/).forEach(function (tok) {
    var n = parseInt(tok, 10);
    if (n >= 1 && n <= 31 && out.indexOf(n) < 0) out.push(n);
  });
  out.sort(function (a, b) { return a - b; });
  return out;
}

/** "30/07" · "07-30" · "2026-07-30" → "07-30". "" nếu sai. */
function parseYearDay_(arg) {
  var t = String(arg || "").trim();
  if (!t) return "";
  var m = t.match(/^(\d{1,2})-(\d{1,2})$/); // dạng MM-DD
  if (m) {
    var mo = parseInt(m[1], 10), d = parseInt(m[2], 10);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return pad2_(mo) + "-" + pad2_(d);
  }
  var full = parseDateInput_(t); // 30/07 · 30/7/2026 · hôm nay…
  return full ? full.slice(5) : "";
}

/**
 * schedule có rơi vào dateStr không.
 * Mốc ngày vượt quá số ngày của tháng (monthly:31, yearly:02-29) được kẹp về ngày cuối tháng
 * để không bị "mất" mốc ở tháng ngắn / năm không nhuận.
 */
function isScheduled_(schedule, dateStr) {
  var d = parseDateStr_(dateStr);
  if (!d) return false;
  var s = String(schedule || "").trim().toLowerCase();
  if (s === "daily") return true;

  var wk = s.match(/^weekly:(.+)$/);
  if (wk) return parseWeekdayList_(wk[1]).indexOf(WD_KEYS[d.getDay()]) >= 0;

  var mo = s.match(/^monthly:(.+)$/);
  if (mo) {
    var dim = daysInMonth_(d.getFullYear(), d.getMonth() + 1);
    var days = parseMonthDays_(mo[1]).map(function (n) { return Math.min(n, dim); });
    return days.indexOf(d.getDate()) >= 0;
  }

  var yr = s.match(/^yearly:(\d{1,2})-(\d{1,2})$/);
  if (yr) {
    var ym = parseInt(yr[1], 10), yd = parseInt(yr[2], 10);
    if (d.getMonth() + 1 !== ym) return false;
    return d.getDate() === Math.min(yd, daysInMonth_(d.getFullYear(), ym));
  }
  return false;
}

/** Occurrence lịch gần nhất SAU dateStr (quét tối đa 400 ngày). "" nếu không có. */
function nextScheduled_(schedule, dateStr) {
  for (var i = 1; i <= 400; i++) {
    var cand = addDays_(dateStr, i);
    if (isScheduled_(schedule, cand)) return cand;
  }
  return "";
}

/** Nhãn tiếng Việt của chu kỳ: "Hàng tuần · T2, T4". */
function scheduleLabel_(schedule) {
  var s = String(schedule || "").trim().toLowerCase();
  if (s === "daily") return "Hàng ngày";
  var wk = s.match(/^weekly:(.+)$/);
  if (wk) {
    var names = parseWeekdayList_(wk[1]).map(function (k) { return WD_VI[WD_KEYS.indexOf(k)]; });
    return "Hàng tuần · " + (names.length ? names.join(", ") : "?");
  }
  var mo = s.match(/^monthly:(.+)$/);
  if (mo) {
    var days = parseMonthDays_(mo[1]);
    return "Hàng tháng · ngày " + (days.length ? days.join(", ") : "?");
  }
  var yr = s.match(/^yearly:(\d{1,2})-(\d{1,2})$/);
  if (yr) return "Hàng năm · " + pad2_(parseInt(yr[2], 10)) + "/" + pad2_(parseInt(yr[1], 10));
  return String(schedule || "");
}

/** Icon theo loại chu kỳ (dùng trong danh sách task cho dễ phân biệt). */
function scheduleIcon_(schedule) {
  var s = String(schedule || "").trim().toLowerCase();
  if (s.indexOf("weekly") === 0) return "📆";
  if (s.indexOf("monthly") === 0) return "🗓";
  if (s.indexOf("yearly") === 0) return "📅";
  return "🔁";
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
