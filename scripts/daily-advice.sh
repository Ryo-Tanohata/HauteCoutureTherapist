#!/usr/bin/env bash
# 星詠みメッセージを作り直し、送るところまで1回で済ませる（Mac / Linux用）。
# Windows は scripts/daily-advice.ps1 のほうを使う。中身は同じ。
#
#   手で試す:  bash scripts/daily-advice.sh
#   確認だけ:  bash scripts/daily-advice.sh --dry-run
#
# cron に入れる例（毎朝6時）:
#   0 6 * * * cd /path/to/HauteCoutureTherapist && bash scripts/daily-advice.sh
set -uo pipefail

BRANCH="${ADVICE_BRANCH:-main}"
REMOTE="${ADVICE_REMOTE:-origin}"
MODEL="${CLAUDE_MODEL:-claude-sonnet-5}"
DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

cd "$(dirname "$0")/.." || exit 1
mkdir -p logs
LOG="logs/daily-advice.log"

say() { local l; l="[$(date '+%Y-%m-%d %H:%M:%S')] $*"; echo "$l"; echo "$l" >> "$LOG"; }
fail() { say "NG   $*"; exit 1; }

say "---- 開始 ----"

# 居る枝を確かめる。飛ばすと、作業中の枝に勝手に積んでしまう。
current="$(git rev-parse --abbrev-ref HEAD)"
[ "$current" = "$BRANCH" ] || fail "いまの枝は '$current' です。'$BRANCH' に移ってから実行してください（何もしていません）"

say "取り込み中: $REMOTE/$BRANCH"
git pull --rebase --autostash "$REMOTE" "$BRANCH" 2>&1 | while read -r l; do say "     $l"; done
[ "${PIPESTATUS[0]}" -eq 0 ] || fail "取り込みに失敗しました。手で直してから、もう一度実行してください"

export CLAUDE_MODEL="$MODEL"
if [ "$DRY_RUN" -eq 1 ]; then
    say "（確認のみ）いまの状態:"
    node scripts/refresh-advice.js --status 2>&1 | while read -r l; do say "     $l"; done
    say "---- 確認のみで終了 ----"
    exit 0
fi

say "作成中（モデル: $MODEL）"
node scripts/refresh-advice.js 2>&1 | while read -r l; do say "     $l"; done
gen_exit="${PIPESTATUS[0]}"

# 星詠みのファイルだけを拾う。他のものは触らない。
git add product/data/advice
staged="$(git diff --cached --name-only)"
if [ -z "$staged" ]; then
    say "変わりはありません（更新サイクルの中でした）"
    [ "$gen_exit" -eq 0 ] || fail "作成中に失敗した期間があります。上の記録を確認してください"
    say "---- 終了 ----"
    exit 0
fi
say "変わったファイル: $(echo "$staged" | tr '\n' ' ')"

git commit -q -m "chore(advice): refresh readings for $(date '+%Y-%m-%d')" || fail "コミットに失敗しました"

pushed=0
for wait in 0 2 4 8 16; do
    [ "$wait" -gt 0 ] && { say "${wait}秒待って、もう一度送ります"; sleep "$wait"; }
    if git push "$REMOTE" "$BRANCH" 2>&1 | while read -r l; do say "     $l"; done; [ "${PIPESTATUS[0]}" -eq 0 ]; then
        pushed=1; break
    fi
done
[ "$pushed" -eq 1 ] || fail "送信に失敗しました。コミットは手元に残っています"

say "送信しました（$REMOTE/$BRANCH）"
[ "$gen_exit" -eq 0 ] || fail "送りましたが、作成中に失敗した期間があります"
say "---- 終了 ----"
