/**
 * Gemini.js — phân tích tin nhắn tự nhiên → JSON intent.
 * Parser chính của bot (CLAUDE.md/domain spec). Ràng buộc category theo tab Config.
 */

var GEMINI_MODEL = "gemini-2.5-flash";

/**
 * Phân tích 1 tin nhắn.
 * @param {string} text  Nội dung người dùng gõ.
 * @param {string[]} categories  Danh mục hợp lệ (đọc từ tab Config).
 * @return {Object|null} JSON intent, hoặc null nếu lỗi.
 */
function geminiParse(text, categories) {
  var apiKey = getConfig().geminiApiKey;
  if (!apiKey) { Logger.log("Gemini: thiếu GEMINI_API_KEY"); return null; }

  var today = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd");
  var cats = (categories && categories.length) ? categories.join(", ") : DEFAULT_CATEGORIES.join(", ");
  var prompt = buildParsePrompt_(text, cats, today);

  var url = "https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL + ":generateContent?key=" + apiKey;
  var payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0, responseMimeType: "application/json" }
  };

  var res = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var data;
  try {
    data = JSON.parse(res.getContentText());
  } catch (e) {
    Logger.log("Gemini: response không phải JSON: " + res.getContentText());
    return null;
  }

  var out = data && data.candidates && data.candidates[0] &&
            data.candidates[0].content && data.candidates[0].content.parts &&
            data.candidates[0].content.parts[0].text;
  if (!out) { Logger.log("Gemini: không có text trả về: " + res.getContentText()); return null; }

  try {
    return JSON.parse(out);
  } catch (e) {
    Logger.log("Gemini: output không phải JSON hợp lệ: " + out);
    return null;
  }
}

/** Dựng prompt phân tích intent. */
function buildParsePrompt_(text, cats, today) {
  return [
    "Bạn là bộ phân tích ý định cho bot quản lý Task + Timeline cá nhân.",
    "Hôm nay là " + today + " (múi giờ Việt Nam). 'hôm nay'=" + today + ".",
    "Danh mục hợp lệ (category): " + cats + ".",
    "",
    "Phân tích tin nhắn và trả về DUY NHẤT một JSON với các trường:",
    "- intent: một trong [task_add, task_list, task_complete, task_postpone, task_note, task_delete, timeline_start, timeline_stop, timeline_range, timeline_list, timeline_delete, recurring_add, streak_view, recurring_stop, help, unknown]",
    "- title: tên việc/hoạt động (string) hoặc null",
    "- date: 'YYYY-MM-DD' nếu suy ra được, ngược lại null",
    "- time: 'HH:MM' cho mốc đơn (bắt đầu/kết thúc tại một thời điểm), null nếu không có",
    "- start_time: 'HH:MM' đầu khoảng (dùng cho 'từ...đến...'), null nếu không",
    "- end_time: 'HH:MM' cuối khoảng, null nếu không",
    "- category: đúng một giá trị trong danh mục hợp lệ, hoặc null",
    "- priority: 'cao' | 'vừa' | 'thấp' hoặc null",
    "- schedule: 'daily' | 'weekly:Mon,Wed,Fri' | 'monthly:1,15' cho việc lặp, null nếu không",
    "- note: ghi chú (string) hoặc null",
    "- target: cụm từ để KHỚP task/hoạt động đã tồn tại (khi hoàn thành/kết thúc/hoãn/xóa), null nếu không",
    "",
    "Quy tắc:",
    "- 'bắt đầu X' → timeline_start; 'xong X'/'stop' → timeline_stop (target=X).",
    "- 'X từ H1 đến H2' → timeline_range.",
    "- 'thêm task X'/'/task X' → task_add. '/tasks' hoặc 'xem task' → task_list.",
    "- 'lặp'/'/repeat' kèm lịch → recurring_add. '/streak' → streak_view.",
    "- Không rõ → intent='unknown'.",
    "Chỉ trả JSON, không kèm giải thích, không markdown.",
    "",
    "Tin nhắn: " + JSON.stringify(text)
  ].join("\n");
}

/** Test trong GAS Editor (cần GEMINI_API_KEY). Không cần Telegram. */
function testGeminiParse() {
  var samples = [
    "bắt đầu code app lúc 20:00",
    "thêm task đưa con đi học ngày mai ưu tiên cao",
    "đọc sách từ 21:00 đến 21:30",
    "xong code app",
    "/repeat tập gym daily"
  ];
  samples.forEach(function (s) {
    Logger.log(s + "  →  " + JSON.stringify(geminiParse(s, DEFAULT_CATEGORIES)));
  });
}
