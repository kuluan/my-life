/**
 * Release.js — báo tin phát hành qua Telegram sau mỗi lần deploy thành công.
 *
 * Vì sao đặt ở GAS thay vì gọi thẳng Telegram API trong shell:
 * TELEGRAM_BOT_TOKEN nằm trong Script Properties và PHẢI ở nguyên đó
 * (CLAUDE.md mục 6) — script shell không được chạm vào token.
 * `release.sh` chỉ gọi `clasp run notifyRelease` sau khi deploy + push xong.
 *
 * Chat nhận tin dùng lại getReminderChatId_() (Reminder.js): đọc BOT_CHAT_ID
 * ở Script Properties, thiếu thì suy ra từ tab Logs — nên KHÔNG hardcode
 * chat id cá nhân vào repo.
 */

/** Soạn nội dung tin phát hành. Hàm thuần để test được (không I/O). */
function buildReleaseMessage_(version, description, when) {
  return "🚀 <b>My-life " + esc_(version) + " deployed</b>" +
    "\n📋 " + esc_(description) +
    "\n⏰ " + when;
}

/**
 * Gửi thông báo phát hành.
 * @param {string} version      vd "v0.1.11" (bỏ trống → lấy APP_VERSION hiện tại).
 * @param {string} description  mô tả ngắn của release.
 * @return {string} kết quả (để release.sh in ra).
 */
function notifyRelease(version, description) {
  try {
    var v = String(version || APP_VERSION || "").trim();
    if (!v) return "LỖI: thiếu version";
    var desc = String(description || "").trim() || "(không có mô tả)";
    var chatId = getReminderChatId_();
    if (!chatId) return "LỖI: chưa biết chat_id (nhắn bot 1 tin rồi thử lại)";
    var when = Utilities.formatDate(new Date(), TIMEZONE, "HH:mm dd/MM/yyyy");
    sendMessage(chatId, buildReleaseMessage_(v, desc, when));
    Logger.log("notifyRelease → " + v + " | " + desc);
    return "đã gửi thông báo " + v;
  } finally {
    flushLogs_();
  }
}

/** Test soạn tin (không gửi). `clasp run testReleaseMessage` */
function testReleaseMessage() {
  var out = [], fail = 0;
  function check(name, got, want) {
    var ok = got === want;
    if (!ok) fail++;
    out.push((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "\n  got  = " + JSON.stringify(got) + "\n  want = " + JSON.stringify(want)));
  }
  check("định dạng 3 dòng",
    buildReleaseMessage_("v9.9.9", "mô tả thử", "07:00 31/07/2026"),
    "🚀 <b>My-life v9.9.9 deployed</b>\n📋 mô tả thử\n⏰ 07:00 31/07/2026");
  check("escape ký tự HTML trong mô tả",
    buildReleaseMessage_("v1.0.0", "fix <script> & lỗi", "08:00 01/08/2026"),
    "🚀 <b>My-life v1.0.0 deployed</b>\n📋 fix &lt;script&gt; &amp; lỗi\n⏰ 08:00 01/08/2026");
  var r = out.join("\n") + "\n→ " + (out.length - fail) + "/" + out.length + " PASS";
  Logger.log(r);
  return r;
}
