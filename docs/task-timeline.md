# Domain: Task + Timeline

> Spec domain đầu tiên của My-life. Quyết định nền: [architecture.md](architecture.md). Bot: [../bots/task-timeline](../bots/task-timeline).

Task (việc có kế hoạch) + Timeline (nhật ký thời gian thực) là **một domain**, một workbook, một bot.

## Workbook `LP — Task & Timeline 2026`
Google Sheet riêng, **không đụng** `GEN LEDGER`. 6 tab:

### Tab `Tasks`
| Cột | Ý nghĩa |
|---|---|
| `id` | Mã task, vd `T-0001` |
| `created_at` | Thời điểm tạo |
| `date` | Ngày dự kiến (YYYY-MM-DD) |
| `title` | Tên việc |
| `status` | `todo` / `doing` / `done` / `dropped` |
| `priority` | `cao` / `vừa` / `thấp` |
| `category` | Thuộc danh sách tab `Config` |
| `note` | Ghi chú |
| `started_at` | Lúc bấm ▶️ / bắt đầu |
| `completed_at` | Lúc hoàn thành |
| `repeat` | `Recurring.id` nếu sinh từ việc lặp; trống nếu việc một lần |

### Tab `Timeline`
| Cột | Ý nghĩa |
|---|---|
| `id` | Mã block, vd `L-0007` |
| `date` | Ngày |
| `title` | Hoạt động |
| `start_at` | Giờ bắt đầu |
| `end_at` | Giờ kết thúc |
| `duration_min` | Phút — **công thức** `=(end-start)*24*60` |
| `category` | Thuộc danh sách tab `Config` |
| `task_id` | Link `Tasks.id`; trống = hoạt động rời |
| `note` | Ghi chú |

### Tab `Recurring` (việc lặp + streak)
| Cột | Ý nghĩa |
|---|---|
| `id` | Mã, vd `R-0003` |
| `title` | Tên việc lặp |
| `schedule` | `daily` · `weekly:Mon,Wed,Fri` · `monthly:1,15` · `yearly:MM-DD` (dạng chuẩn do `normalizeSchedule_()` quy về; user gõ "hàng tuần T7", "mỗi năm 30/07"… đều được) |
| `category` | Thuộc `Config` |
| `active` | `TRUE`/`FALSE` |
| `current_streak` | Chuỗi hiện tại |
| `longest_streak` | Kỷ lục |
| `last_done_date` | Ngày hoàn thành gần nhất |
| `streak_saves` | Số 🛟 còn lại (tối đa 3) |
| `created_at` | |

### Tab `Config`
Danh sách **category cố định** (một cột `category`), feed vào prompt Gemini để phân loại nhất quán. User sửa list bất kỳ lúc nào.

### Tab `Whitelist` (bảo mật)
| Cột | Ý nghĩa |
|---|---|
| `username` | Nick Telegram (không `@`, không phân biệt hoa/thường) được phép dùng bot |
| `note` | Ghi chú tuỳ ý |
| `added_at` | Thời điểm thêm |

Bot chặn ngay ở `doPost`: nick không có trong tab này → nhận thông báo "không có quyền", mọi lệnh khác đều bị bỏ qua. Seed mặc định: `k4luan`. User tự thêm/xoá dòng trực tiếp trên Sheet (điện thoại) để cấp/thu quyền — không cần deploy lại.

### Tab `Logs` (nhật ký giao tiếp)
| Cột | Ý nghĩa |
|---|---|
| `timestamp` | Thời điểm ghi log |
| `chat_id` | Chat Telegram liên quan |
| `username` | Nick người gửi (trống nếu dòng `out`) |
| `direction` | `in` (tin nhắn/callback từ user, kể cả bị chặn whitelist) hoặc `out` (bot trả lời) |
| `text` | Nội dung |

Ghi tự động ở `doPost` (mọi tin nhắn/callback vào) và `sendMessage`/`editMessageText` (mọi phản hồi bot gửi ra) — để user xem lại lịch sử giao tiếp trên Sheet khi cần kiểm tra. Lỗi ghi log không làm gãy luồng chính (bọc try/catch).

## Liên kết Task ↔ Timeline
- Nút ▶️ dưới task → tạo dòng `Timeline` gắn `task_id`, task chuyển `doing` + `started_at`.
- Đóng block đó (nút ⏹️ / `stop`) → task tự `done` + `completed_at`; nếu task thuộc việc lặp → cập nhật streak.

## Streak
- Hoàn thành **đúng lịch liền kề** → `current_streak++`, cập nhật `longest_streak`, `last_done_date`.
- **Bỏ lỡ** một mốc → tiêu 1 `streak_saves` (tối đa 3) để giữ chuỗi; hết save → reset về 1.
- **Trigger hằng ngày** của bot tự sinh Task (`status=todo`, `repeat=<Recurring.id>`) cho các Recurring `active` tới hạn hôm nay.

## Parser
**Gemini NL làm chính** (giống bot cũ). Bot đưa danh sách category (tab `Config`) + ngày hôm nay vào prompt; Gemini trả JSON: `intent` + các trường (title, date, time, category, schedule…). Slash command và vài mẫu rõ (giờ `HH:MM`, khoảng `từ…đến`) vẫn được ưu tiên khi khớp chắc.

## Bề mặt lệnh (slash + gõ tự nhiên; mỗi item có nút bấm)

### Task
| Ý định | Cú pháp |
|---|---|
| Thêm | `/task Đưa con đi học ngày mai` · `thêm task họp team 28/7 !cao #Việc` |
| Xem hôm nay | `/tasks` → tách 2 nhóm: **🔁 việc chu kỳ** (kèm nhãn chu kỳ + 🔥 streak) và **▫️ việc một lần**; mỗi dòng có nút ▶️ Bắt đầu · ✅ Xong · 🗑 Xóa |
| Xem theo ngày | `/tasks ngày mai` · `/tasks 2026-07-28` |
| Hoàn thành | nút ✅ · `xong đón con` · reply tin task |
| Hoãn/đổi ngày | `hoãn đón con sang mai` |
| Ghi chú | reply tin task · `note đón con: nhớ mang cặp` |
| Xóa | nút 🗑 · `xóa task đón con` (xác nhận) |

### Timeline
| Ý định | Cú pháp |
|---|---|
| Bắt đầu | `bắt đầu code app` · `/tl code app` · `code app lúc 20:00` |
| Kết thúc | nút ⏹️ · `xong code app` · `stop` · `xong code app lúc 21:30` |
| Thêm khoảng trọn | `code app từ 20:00 đến 21:30` · `/tl đọc sách 20:00 - 21:30` |
| Xem | `/timeline` / `/tl` → list block + tổng thời lượng theo category |
| Xem theo ngày | `/timeline hôm qua` |
| Xóa | nút 🗑 · `xóa timeline code app` (xác nhận) |

### Task chu kỳ (việc lặp) / streak
| Ý định | Cú pháp |
|---|---|
| Tạo bằng trợ lý | `/repeat` (không tham số) → nhập tên → bấm chọn 🔁 Hàng ngày / 📆 Hàng tuần (bấm chọn thứ T2–CN) / 🗓 Hàng tháng / 📅 Hàng năm |
| Tạo bằng một câu | `/repeat Tập gym hàng ngày` · `/repeat Đi chợ hàng tuần T7` · `/repeat Đóng tiền nhà hàng tháng ngày 1` · `/repeat Giỗ ông hàng năm 30/07` |
| Xem danh sách | `/repeats` · `/streak` → 🔥 chuỗi · kỷ lục · số 🛟 · nhãn chu kỳ |
| Bật/tắt/xóa | nút · `dừng lặp tập gym` |

Mốc ngày vượt số ngày của tháng được **kẹp về ngày cuối** (`monthly:31` rơi vào 28/02, `yearly:02-29` rơi vào 28/02 năm không nhuận) để không mất mốc.

### Hệ thống
`/start` (chào + tóm tắt) · `/help` (hướng dẫn) · menu slash command đồng bộ router.
