/**
 * Telegram.js — wrapper gọn cho Telegram Bot API.
 * Token đọc từ Script Properties (Config.js). Không hardcode.
 */

function tgApiUrl_(method) {
  return "https://api.telegram.org/bot" + getConfig().telegramToken + "/" + method;
}

/** Gọi Bot API, trả về object JSON (hoặc {ok:false} nếu lỗi). */
function tgCall_(method, payload) {
  var res = UrlFetchApp.fetch(tgApiUrl_(method), {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  try {
    return JSON.parse(res.getContentText());
  } catch (e) {
    Logger.log("tgCall_ " + method + " lỗi parse: " + res.getContentText());
    return { ok: false };
  }
}

/** Gửi tin (HTML). keyboard: mảng 2 chiều các nút inline (hoặc null). */
function sendMessage(chatId, text, keyboard) {
  var payload = {
    chat_id: chatId,
    text: text,
    parse_mode: "HTML",
    disable_web_page_preview: true
  };
  if (keyboard) payload.reply_markup = { inline_keyboard: keyboard };
  return tgCall_("sendMessage", payload);
}

/** Gửi tin và trả message_id (để lưu/liên kết sau). */
function sendMessageGetId(chatId, text, keyboard) {
  var r = sendMessage(chatId, text, keyboard);
  return (r && r.result) ? r.result.message_id : null;
}

/** Sửa nội dung + keyboard của một tin đã gửi. */
function editMessageText(chatId, messageId, text, keyboard) {
  var payload = {
    chat_id: chatId,
    message_id: messageId,
    text: text,
    parse_mode: "HTML",
    disable_web_page_preview: true
  };
  if (keyboard) payload.reply_markup = { inline_keyboard: keyboard };
  return tgCall_("editMessageText", payload);
}

/** Trả lời callback (tắt spinner trên nút; text hiện toast nếu có). */
function answerCallbackQuery(callbackId, text) {
  return tgCall_("answerCallbackQuery", { callback_query_id: callbackId, text: text || "" });
}

/** Dựng 1 nút inline. */
function btn(text, data) {
  return { text: text, callback_data: data };
}
