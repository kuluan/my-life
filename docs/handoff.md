# HANDOFF — My-life (bối cảnh cho AI agent tiếp nhận)

> File này giúp **một phiên Claude MỚI** (kể cả máy "dispatch" khác) nắm toàn bộ dự án trong ~2 phút và sẵn sàng code tính năng user yêu cầu từ điện thoại.
> Quy tắc chi tiết: [../CLAUDE.md](../CLAUDE.md). Quyết định nền: [architecture.md](architecture.md). Spec domain đầu: [task-timeline.md](task-timeline.md).
> **Bắt đầu bằng `git pull`.**

## 1. Dự án là gì
My-life = Life Planner **thế hệ 2**, viết mới **song song** hệ cũ (repo `life-planner`). DB = **Google Sheets** (mỗi domain 1 workbook), tương tác qua **chatbot Telegram** trên Google Apps Script. Không web/Firestore. User xem/sửa dữ liệu trên điện thoại qua Google Sheets, ra lệnh qua bot.

## 2. Repo & hạ tầng
- GitHub (private): `https://github.com/kuluan/my-life` — nhánh `master`.
- Local (máy dev): `/Users/nguyenluan/Documents/Developer/Code with AI Agents/My-life`
- `clasp` đã cài + đã login trên máy dev. `git` push qua HTTPS (credential keychain).

## 3. Đang có gì (LIVE)
Domain **task-timeline** — bot Telegram **đã deploy, webhook đã set, đang chạy**.

| Thứ | Giá trị |
|---|---|
| Apps Script script ID | `1-gV1RUVsxnwhxfd4GRKHN6lU_fIjBpWHUp2UYQTz1pKiWFvDgkIlaT-N` |
| Web app deployment ID (DUY NHẤT — không tạo mới) | `AKfycbwu-BnaS3JeT2r5nXLUKBBYPCZA8DYeSc7n2CaT8MeIUdGu4e7VJNq6HtrsJuCxyAqR` |
| Webhook URL | `https://script.google.com/macros/s/AKfycbwu-BnaS3JeT2r5nXLUKBBYPCZA8DYeSc7n2CaT8MeIUdGu4e7VJNq6HtrsJuCxyAqR/exec` |
| Workbook Task&Timeline | `15u10AscA1u7npGxIeg3MUcFnj25JUNO4hnC-Je6nDMU` (tab Tasks/Timeline/Recurring/Config) |
| Workbook Registry | `1L5MxhZFgc3b-DCt-5Uk93KV7Zxv7ec87Qsq4RtWm12w` (tab Features/ChangeLog) |

**Bí mật (KHÔNG có trong repo, nằm ở Script Properties):** `TELEGRAM_BOT_TOKEN`, `GEMINI_API_KEY`, `SPREADSHEET_ID`, `REGISTRY_SPREADSHEET_ID`.

## 4. Code layout — `bots/task-timeline/`
| File | Vai trò |
|---|---|
| `Config.js` | `APP_VERSION`, hằng schema (HEADERS), category mặc định, `getConfig()`, URL webhook |
| `Setup.js` | `setup()` tạo workbook+tab+trigger; `dailyJob()` (sinh task lặp + syncRegistry); `testSetup()` |
| `Store.js` | Đọc/ghi Sheets (`readRows_/appendRow_/updateRow_/deleteRow_/nextId_/findById_`) + util ngày giờ, khớp tên, escape |
| `Gemini.js` | `geminiParse()` NL→JSON intent; `buildParsePrompt_` (taxonomy intent); `testGeminiParse()` |
| `Telegram.js` | Bot API: `sendMessage/editMessageText/answerCallbackQuery/btn` |
| `Tasks.js` | Thêm/list/hoàn thành/hoãn/note/xóa task |
| `Timeline.js` | Bắt đầu/kết thúc/khoảng/list/xóa + `startTimelineForTask` |
| `Recurring.js` | Việc lặp, streak (`updateStreakOnComplete_`), `materializeRecurringForToday` |
| `Code.js` | `doPost` router, `dispatchIntent_`, `handleCallback_`, `help()/start()`, `setWebhook()/setupBotCommands()` |
| `Registry.js` | `FEATURES`/`CHANGELOG` (nguồn sự thật) + `setupRegistry()/syncRegistry()` |

Parser = **Gemini NL là chính**. Thêm ý định mới = sửa `buildParsePrompt_` (Gemini.js) + `dispatchIntent_` (Code.js) + handler + đồng bộ `help()`/`setupBotCommands()`/`start()`.

## 5. Quy trình thêm 1 tính năng (khi user yêu cầu từ điện thoại)
1. `git pull` trong repo.
2. Xác định domain. Sửa file **nguồn** trong `bots/<domain>/` (không sửa file build).
3. Thêm intent → cập nhật **4 vị trí lệnh** đồng bộ: router/prompt, `help()`, `setupBotCommands()`, `start()`.
4. **TEST:** `node --check *.js`; kiểm trùng tên hàm (`grep -hoE '^function [A-Za-z0-9_]+' *.js | sort | uniq -d`); nếu chạm parser, nhờ user chạy `testGeminiParse()`.
5. Bump `APP_VERSION` PATCH (Config.js) nếu ảnh hưởng production.
6. **Cập nhật Registry (BẮT BUỘC):** thêm 1 dòng đầu `CHANGELOG` + cập nhật `FEATURES` trong `Registry.js` (CLAUDE.md mục 5.1).
7. **Phát hành một lệnh:** `./release.sh vX.Y.Z "mô tả"` — tự làm: kiểm version ↔ Registry, `node --check` + trùng tên hàm, `clasp push`, `clasp deploy` đè đúng ID, commit + push `master`, rồi **báo tin Telegram** (chỉ khi deploy + push đều OK). Xem CLAUDE.md mục 5.2.
8. Chạy `syncRegistry()` (`clasp -u run run syncRegistry`) để cập nhật sheet Registry.
9. Kiểm tra đã nhận tin `🚀 My-life vX.Y.Z deployed` trên Telegram.
10. Nhờ user test luồng thật qua Telegram.

> Deploy tay (không dùng script) thì nhớ gọi `clasp -u run run notifyRelease -p '["vX.Y.Z","mô tả"]'`.

## 6. Giới hạn của AI qua CLI (quan trọng)
- **KHÔNG chạy được hàm GAS** (`clasp run` cần deploy "API executable" — chưa bật). Các hàm cần OAuth (`setup`, `testGeminiParse`, `syncRegistry`, `setWebhook`, `setupBotCommands`) **phải nhờ user bấm Run** trong GAS Editor.
- **KHÔNG xử lý token/secret** của user (chỉ hướng dẫn user tự set Script Properties).
- **KHÔNG đụng hệ cũ** (`life-planner`, KuAllin-Bot, web, Firestore). Được **đọc** GEN LEDGER khi domain tài chính tới lượt.

## 7. Việc tiếp theo / backlog
- ✅ Bot task-timeline đã deploy — **cần test thực tế qua Telegram** (9 kịch bản: thêm task, /tasks, ▶️/⏹️, bắt đầu/xong, khoảng giờ, /timeline, /repeat, /streak, kiểm sheet).
- ⏳ Domain **tài chính** (đọc GEN LEDGER `1hyR4pqlAyuB5ryRsAiCWLAQwD4o2I3LCz8MW81KKMe0`) — làm sau.
- 💡 (Tùy chọn) Bật `clasp run` (API executable) để AI tự chạy sync/test, giảm phụ thuộc user bấm Run.
