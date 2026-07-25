# Kiến trúc & quyết định nền móng

> Quy tắc tổng ở [../CLAUDE.md](../CLAUDE.md). File này ghi **vì sao** hệ thống được thiết kế như hiện tại.

## Bối cảnh
Life Planner hệ cũ (`life-planner`): web MPA 8 trang + Cloud Functions + Firestore + bot `KuAllin-Bot` (Telegram trên Apps Script). Web ít tương tác, khó sửa dữ liệu, khó tạo báo cáo nhanh. → Viết lại theo hướng **Google Sheets-first + chatbot**.

## Các quyết định đã chốt (2026-07-25)

| # | Quyết định | Lý do |
|---|---|---|
| 1 | **DB = Google Sheets, mỗi domain một workbook riêng** (không gộp 1 master) | Dễ xem/pivot/sửa trên điện thoại; mỗi mảng gọn một file; lỗi thì sửa tay trực tiếp |
| 2 | **File "chi tiêu 2026" = `GEN LEDGER` hệ cũ** (`1hyR4pqlAyuB5ryRsAiCWLAQwD4o2I3LCz8MW81KKMe0`) | Giữ làm dữ liệu tài chính xuyên suốt; hệ mới **chỉ đọc**, chưa đụng |
| 3 | **Chatbot = bot Telegram mới hoàn toàn, token riêng, mỗi domain một bot** | Chạy song song, không đụng bot cũ; dễ bật/tắt; ngắt bot cũ khi hệ mới ổn |
| 4 | **Domain viết trước = Task + Timeline** (gộp 1 domain) | Mảng tương tác nhiều, chứng minh mô hình Sheets + bot trước khi nhân rộng |
| 5 | **Repo mới `My-life`, tách hoàn toàn hệ cũ** | Code sạch, rule chặt chẽ riêng; thay thế dần chứ không refactor tại chỗ |

## Nguyên tắc song song
Hệ mới và hệ cũ chạy đồng thời. Không tính năng nào của hệ cũ bị sửa/ngắt bởi agent — user tự ngắt khi hệ mới thay thế xong. Xem cảnh báo ở [../CLAUDE.md](../CLAUDE.md) mục 0.

## Chuẩn kỹ thuật chung cho mọi bot
- Timezone: `Asia/Ho_Chi_Minh`.
- Bí mật (token, API key, spreadsheet id) → **Script Properties**, không hardcode/commit.
- `setup()` trong bot tự tạo & format workbook (tái lập được, không tạo tay).
- Parser ngôn ngữ tự nhiên bằng **Gemini** (xem từng domain), có ràng buộc danh mục từ tab `Config`.
