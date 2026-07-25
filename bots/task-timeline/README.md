# Bot: Task + Timeline

Bot Telegram cho domain Task + Timeline. Spec: [../../docs/task-timeline.md](../../docs/task-timeline.md).

## Cấu trúc code (dự kiến)
| File | Vai trò |
|---|---|
| `Config.js` | `APP_VERSION`, `getConfig()` đọc Script Properties |
| `Setup.js` | `setup()` tạo workbook + 5 tab (kể cả `Whitelist`) + header + trigger; `setWebhook()`, `setupBotCommands()` |
| `Telegram.js` | Gửi tin, sửa tin, answerCallback, dựng inline keyboard |
| `Gemini.js` | `parseMessage()` → JSON intent |
| `Code.js` | `doPost()` webhook + router; `help()`; `start()` |
| `Tasks.js` | Thêm/list/hoàn thành/hoãn/ghi chú/xóa task |
| `Timeline.js` | Bắt đầu/kết thúc/khoảng/list/xóa timeline |
| `Recurring.js` | Việc lặp + streak + sinh task theo trigger |

> Trạng thái: 🚧 đang xây. Bắt đầu từ `Setup.js` (tạo workbook + schema) rồi tới router và từng luồng.

## Thiết lập lần đầu (user làm)
1. **Tạo bot Telegram**: chat `@BotFather` → `/newbot` → lấy **token**.
2. **Lấy Gemini API key**: https://aistudio.google.com/apikey
3. **Tạo dự án Apps Script**: https://script.google.com → New project. Copy **Script ID** (Project Settings).
4. **Nối clasp** (máy dev):
   ```bash
   npm i -g @google/clasp   # nếu chưa có
   clasp login
   cp .clasp.json.example .clasp.json   # điền scriptId
   clasp push
   ```
5. **Set Script Properties** (GAS Editor → Project Settings → Script Properties):
   - `TELEGRAM_BOT_TOKEN` = token BotFather
   - `GEMINI_API_KEY` = key Gemini
   - `SPREADSHEET_ID` = (để trống lần đầu; `setup()` tạo workbook rồi ghi lại vào đây)
6. Chạy `setup()` trong GAS Editor (bật popup ủy quyền OAuth) → tạo workbook + tab + trigger.
   Chạy thêm `setupRegistry()` → tạo workbook `LP — Registry` (sheet Features + ChangeLog).
7. **Deploy webhook**: Deploy → New deployment → Web app (execute as me, access anyone). Lưu **deployment ID** + URL vào phần dưới.
8. Chạy `setWebhook()` để trỏ Telegram về URL `/exec`, và `setupBotCommands()` để đẩy menu lệnh.

## Deployment ID (duy nhất — không tạo mới)
```
DEPLOYMENT_ID = AKfycbwu-BnaS3JeT2r5nXLUKBBYPCZA8DYeSc7n2CaT8MeIUdGu4e7VJNq6HtrsJuCxyAqR
WEBHOOK_URL   = https://script.google.com/macros/s/AKfycbwu-BnaS3JeT2r5nXLUKBBYPCZA8DYeSc7n2CaT8MeIUdGu4e7VJNq6HtrsJuCxyAqR/exec
```
> Deploy lại khi chạm webhook — **đè đúng ID này**, KHÔNG tạo deployment mới:
> ```bash
> clasp push && clasp deploy -i AKfycbwu-BnaS3JeT2r5nXLUKBBYPCZA8DYeSc7n2CaT8MeIUdGu4e7VJNq6HtrsJuCxyAqR -d "vX.Y.Z - mô tả"
> ```
> Xem [../../CLAUDE.md](../../CLAUDE.md) mục 5.
