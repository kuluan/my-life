# CLAUDE.md — My-life

Nguồn quy tắc **DUY NHẤT** cho mọi AI Coding Agent (Claude, Gemini, Cursor, Antigravity…) khi làm việc trên repo **My-life**. `AGENTS.md`, `GEMINI.md`, `.cursorrules` chỉ là con trỏ về đây. Đọc hết file này trước khi sửa bất cứ thứ gì.

---

## 0. Bối cảnh & nguyên tắc tối thượng

**My-life** là Life Planner **thế hệ 2**, viết mới hoàn toàn — không kế thừa code hệ cũ.

- **DB = Google Sheets.** Mỗi domain một workbook riêng (nhiều file, tách theo domain). Dữ liệu phải **dễ xem / pivot / sửa trực tiếp trên điện thoại**.
- **Tương tác chính = chatbot Telegram.** Mỗi domain một bot riêng, chạy trên **Google Apps Script** (quản lý bằng `clasp`).
- **KHÔNG** web app, **KHÔNG** Firestore, **KHÔNG** Cloud Functions. Nếu một yêu cầu có vẻ cần web/DB khác → dừng lại, hỏi user, không tự thêm hạ tầng.

> [!WARNING]
> **Nguyên tắc song song (BẮT BUỘC).** My-life chạy **song song** hệ cũ (repo `life-planner` cạnh bên). TUYỆT ĐỐI **không** sửa, không deploy, không đụng: repo `life-planner`, `KuAllin-Bot`, web MPA, Firestore, Cloud Functions của hệ cũ — từ repo này. Việc thay thế/ngắt tính năng hệ cũ do **user tự làm** khi hệ mới đã ổn.
>
> Ngoại lệ **đọc-only**: khi domain tài chính tới lượt, được **đọc** file chi tiêu 2026 (`GEN LEDGER`, spreadsheet `1hyR4pqlAyuB5ryRsAiCWLAQwD4o2I3LCz8MW81KKMe0`) làm dữ liệu tham chiếu — **chỉ đọc, không ghi**.

---

## 1. Kiến trúc

| Thành phần | Nguồn để sửa | Deploy bằng |
|---|---|---|
| **Bot mỗi domain** | `bots/<domain>/*.js` (Apps Script: webhook `doPost`, router lệnh, handler) | `clasp push`; chạm `doPost`/webhook → thêm `clasp deploy` đè đúng ID |
| **Workbook (DB)** | Tạo & format bởi hàm `setup()` **trong bot** (không tạo tay để tái lập được) | — (chạy `setup()` một lần trong GAS Editor) |
| **Docs / spec** | `docs/*.md` | — |

Domain đầu tiên đang xây: **`bots/task-timeline`** — xem [docs/task-timeline.md](docs/task-timeline.md). Tổng quan quyết định nền: [docs/architecture.md](docs/architecture.md).

---

## 2. Quy trình Agent (đúng thứ tự)

0. **`git pull`** trước khi phân tích/sửa.
1. Hiểu yêu cầu + xác định domain/bot liên quan.
2. Đọc code liên quan, implement trên file **nguồn** (không sửa file build/copy).
3. **TEST / verify (BẮT BUỘC)** — mục 3. CẤM deploy nếu chưa test xong hoặc còn lỗi.
4. **Bump version PATCH** nếu ảnh hưởng production — mục 4.
5. **Ghi release note** (`CHANGELOG.md` của bot tương ứng).
6. **Deploy** — mục 5.
7. **Commit + push** `master`.

---

## 3. Kiểm thử & chất lượng (BẮT BUỘC trước deploy) — QUY TẮC SỐ 1

> [!WARNING]
> Một thay đổi chỉ **"xong"** khi tính năng vừa sửa **VÀ** các luồng cơ bản liên quan đã được **test thực tế** và chạy tốt.
>
> **CẤM:** deploy/commit khi chưa test; báo "đã xong" mà chưa verify; giả định "code đúng nên chắc chạy". Agent **tự chứng minh** tính năng chạy, **không** đẩy việc test cho user.

1. **Test cái vừa sửa**: thực thi đúng luồng, xác nhận output — không suy đoán từ đọc code.
2. **Test hồi quy**: kiểm lại các luồng cơ bản liên quan; sửa code dùng chung (router, parser, helper Sheets…) → phạm vi test rộng hơn.
3. **Có lỗi → sửa hết rồi mới deploy.**
4. **Không tự test được** một luồng (vd cần Telegram thật) → **nói rõ phần nào chưa verify**, không im lặng coi như xong.
5. **Báo cáo trung thực**: đã test gì, kết quả ra sao; fail thì nói fail kèm log.

**Apps Script cụ thể:**
- Viết hàm test chạy được trong **GAS Editor** không cần Telegram (vd `testParse()`, `testSetup()`, `testCreateTask()`) và chạy chúng trước khi nối webhook.
- Sau `clasp push` + `clasp deploy`: test **luồng lệnh thật qua Telegram**.
- **Router lệnh phải KHỚP** `help()` + `setupBotCommands()` + `start()`. Không để lệch.

---

## 4. Version (`vMAJOR.MINOR.PATCH`)

> [!WARNING]
> Agent **CHỈ được tự tăng PATCH** (số cuối), mỗi lần deploy +1. **TUYỆT ĐỐI không tự tăng MAJOR/MINOR** — chỉ khi user yêu cầu (khi đó PATCH reset 0).

Mỗi bot giữ version riêng trong hằng `APP_VERSION` (đầu `Config.js` của bot) và `CHANGELOG.md`.

---

## 5. Deploy (Apps Script per-bot)

```bash
cd bots/<domain> && clasp push          # cập nhật code trong project
```

> [!WARNING]
> **Webhook Telegram gọi bản đã `clasp deploy`, KHÔNG phải bản `clasp push`.** Sửa code chạm luồng `doPost`/webhook → **phải `clasp deploy` đè đúng deployment ID duy nhất** của bot (ghi trong `bots/<domain>/README.md`). **CẤM tạo deployment mới làm đổi URL webhook.**

**Thêm/sửa lệnh bot → đồng bộ 4 vị trí:** `help()` · `setupBotCommands()` · `start()` · router trong `doPost`. Sau khi deploy có lệnh mới → gọi URL action đẩy slash command lên Telegram (ghi trong README của bot).

**OAuth scopes:** **CẤM khai báo `oauthScopes` tĩnh** trong `appsscript.json` — luôn để auto-detect. Thêm service Google mới (SpreadsheetApp, UrlFetchApp…) → chạy thủ công một hàm test trong GAS Editor để bật popup ủy quyền, tránh webhook lỗi quyền.

---

## 6. Bảo mật & bí mật (chặt chẽ)

- **Token Telegram, Gemini API key, Spreadsheet ID → lưu trong Script Properties.** CẤM hardcode trong code, CẤM commit lên git.
- `.clasp.json` (chứa `scriptId`) **không commit** — đã có trong `.gitignore`. Dùng `.clasp.json.example` làm mẫu.
- Không log ra token/khoá. Không đưa dữ liệu cá nhân vào URL.

---

## 7. Ngôn ngữ

Luôn trả lời bằng **tiếng Việt** (giữ thuật ngữ tiếng Anh chuyên ngành). Comment code có thể tiếng Anh. Text mới hiển thị cho user khớp giọng văn tiếng Việt hiện có.
