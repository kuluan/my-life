#!/usr/bin/env bash
#
# release.sh — chạy phần đuôi của quy trình 10 bước (docs/handoff.md) một mạch:
#   test → clasp push → clasp deploy (đè đúng ID) → git commit + push → báo Telegram.
#
# Dùng:
#   ./release.sh <version> "<mô tả ngắn>" [domain]
#   ./release.sh v0.1.11 "thông báo release qua Telegram"
#
# QUAN TRỌNG:
# - Thông báo Telegram CHỈ gửi khi deploy VÀ push đều thành công (set -e + kiểm tra).
# - Token Telegram không đi qua script này; việc gửi do hàm GAS notifyRelease() lo.
# - KHÔNG tự bump version hay sửa Registry — đó là việc phải làm trước khi chạy script
#   (CLAUDE.md mục 4 & 5.1), script chỉ kiểm tra là bạn đã làm.

set -euo pipefail

VERSION="${1:-}"
DESC="${2:-}"
DOMAIN="${3:-task-timeline}"
CLASP_USER="${CLASP_USER:-run}"

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOT_DIR="$REPO_DIR/bots/$DOMAIN"

die() { echo "❌ $*" >&2; exit 1; }

[ -n "$VERSION" ] || die "Thiếu version. Dùng: ./release.sh v0.1.11 \"mô tả\" [domain]"
[ -n "$DESC" ]    || die "Thiếu mô tả. Dùng: ./release.sh v0.1.11 \"mô tả\" [domain]"
[ -d "$BOT_DIR" ] || die "Không thấy thư mục bot: $BOT_DIR"

echo "📦 Release $VERSION — domain: $DOMAIN"

# --- 0. Version trong code phải khớp version release (chặn quên bump) ---
CODE_VERSION="$(grep -oE 'APP_VERSION = "[^"]+"' "$BOT_DIR/Config.js" | head -1 | sed 's/.*"\(.*\)"/\1/')"
[ "$CODE_VERSION" = "$VERSION" ] || \
  die "APP_VERSION trong Config.js là '$CODE_VERSION' nhưng bạn release '$VERSION'. Bump version trước (CLAUDE.md mục 4)."

# --- 1. Registry phải có dòng CHANGELOG cho version này (chặn quên, CLAUDE.md 5.1) ---
grep -q "\"$VERSION\"" "$BOT_DIR/Registry.js" || \
  die "Registry.js chưa có dòng CHANGELOG cho $VERSION. Cập nhật Registry trước (CLAUDE.md mục 5.1)."

# --- 2. Test bắt buộc: cú pháp + trùng tên hàm (CLAUDE.md mục 3) ---
echo "🧪 node --check..."
for f in "$BOT_DIR"/*.js; do node --check "$f" >/dev/null || die "Lỗi cú pháp: $f"; done

DUPES="$(cd "$BOT_DIR" && grep -hoE '^function [A-Za-z0-9_]+' ./*.js | sort | uniq -d || true)"
[ -z "$DUPES" ] || die "Có hàm trùng tên:\n$DUPES"
echo "   ✓ cú pháp OK, không trùng tên hàm"

# --- 3. Lấy deployment ID từ README của bot (nguồn sự thật duy nhất) ---
DEPLOY_ID="$(grep -oE 'DEPLOYMENT_ID = [A-Za-z0-9_-]+' "$BOT_DIR/README.md" | head -1 | awk '{print $3}')"
[ -n "$DEPLOY_ID" ] || die "Không đọc được DEPLOYMENT_ID trong $BOT_DIR/README.md"

# --- 4. Push code + deploy đè đúng ID (CẤM tạo deployment mới) ---
echo "⬆️  clasp push..."
( cd "$BOT_DIR" && clasp push >/dev/null ) || die "clasp push thất bại"

echo "🚀 clasp deploy -i $DEPLOY_ID..."
( cd "$BOT_DIR" && clasp deploy -i "$DEPLOY_ID" -d "$VERSION - $DESC" ) || die "clasp deploy thất bại"

# --- 5. Commit + push git ---
cd "$REPO_DIR"
if [ -n "$(git status --porcelain)" ]; then
  echo "📝 Các file sẽ commit:"
  git status --short
  git add -A
  git commit -q -m "$VERSION - $DESC" || die "git commit thất bại"
else
  echo "ℹ️  Không có thay đổi mới để commit (code đã commit trước đó)."
fi

echo "⬆️  git push..."
git push -q origin master || die "git push thất bại"

# --- 6. Chỉ tới đây (deploy + push đều OK) mới báo Telegram ---
echo "📣 Gửi thông báo Telegram..."
( cd "$BOT_DIR" && clasp -u "$CLASP_USER" run notifyRelease -p "[\"$VERSION\",\"$DESC\"]" ) \
  || echo "⚠️  Deploy & push ĐÃ thành công, nhưng gửi thông báo lỗi (kiểm tra: clasp -u $CLASP_USER run debugReminderStatus)"

echo "✅ Release $VERSION hoàn tất."
