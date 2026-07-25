# My-life

Life Planner **thế hệ 2** — viết mới hoàn toàn, chạy **song song** hệ cũ (`life-planner`) rồi thay thế dần.

## Triết lý
- **DB = Google Sheets**, mỗi domain một workbook riêng → dữ liệu dễ xem / pivot / sửa ngay trên điện thoại.
- **Tương tác chính = chatbot Telegram**, mỗi domain một bot riêng trên Google Apps Script.
- Không web app, không Firestore, không Cloud Functions.

## Cấu trúc repo
```
My-life/
├─ CLAUDE.md              # nguồn quy tắc DUY NHẤT cho AI agent (đọc trước)
├─ AGENTS.md / GEMINI.md / .cursorrules   # con trỏ về CLAUDE.md
├─ docs/
│  ├─ architecture.md     # quyết định nền móng
│  └─ task-timeline.md    # spec domain đầu tiên
└─ bots/
   └─ task-timeline/      # bot Telegram domain Task + Timeline (Apps Script)
```

## Trạng thái
| Domain | Bot | Trạng thái |
|---|---|---|
| Task + Timeline | `bots/task-timeline` | 🚧 đang xây |
| Tài chính (chi tiêu 2026) | — | ⏳ giữ ở hệ cũ, làm sau |

> Quy tắc làm việc & deploy: xem [CLAUDE.md](CLAUDE.md).
