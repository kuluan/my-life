# Domain: Task + Timeline

> Spec domain đầu tiên của My-life. Quyết định nền: [architecture.md](architecture.md). Bot: [../bots/task-timeline](../bots/task-timeline).

Task (việc có kế hoạch) + Timeline (nhật ký thời gian thực) là **một domain**, một workbook, một bot.

## Workbook `LP — Task & Timeline 2026`
Google Sheet riêng, **không đụng** `GEN LEDGER`. 4 tab:

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
| `schedule` | `daily` · `weekly:Mon,Wed,Fri` · `monthly:1,15` |
| `category` | Thuộc `Config` |
| `active` | `TRUE`/`FALSE` |
| `current_streak` | Chuỗi hiện tại |
| `longest_streak` | Kỷ lục |
| `last_done_date` | Ngày hoàn thành gần nhất |
| `streak_saves` | Số 🛟 còn lại (tối đa 3) |
| `created_at` | |

### Tab `Config`
Danh sách **category cố định** (một cột `category`), feed vào prompt Gemini để phân loại nhất quán. User sửa list bất kỳ lúc nào.

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
| Xem hôm nay | `/tasks` → list + nút ▶️ Bắt đầu · ✅ Xong · 🗑 Xóa |
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

### Việc lặp / streak
| Ý định | Cú pháp |
|---|---|
| Tạo | `/repeat Tập gym daily` · `/repeat Đi chợ weekly:Sun` |
| Xem streak | `/streak` → 🔥 chuỗi · kỷ lục · số 🛟 |
| Bật/tắt/xóa | nút · `dừng lặp tập gym` |

### Hệ thống
`/start` (chào + tóm tắt) · `/help` (hướng dẫn) · menu slash command đồng bộ router.
