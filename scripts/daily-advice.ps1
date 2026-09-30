<#
星詠みメッセージを作り直し、送るところまで1回で済ませる（Windows用）。

Windows の「タスク スケジューラ」から毎日1回呼ぶことを想定している。
登録のしかたは management/10_Operations/星詠みの毎日更新.md を参照。

    手で試す:  powershell -ExecutionPolicy Bypass -File scripts\daily-advice.ps1
    確認だけ:  powershell -ExecutionPolicy Bypass -File scripts\daily-advice.ps1 -DryRun

── なぜ「作る」だけでは足りないか ──
星詠みはファイルとしてリポジトリに入っている。作っただけでは手元にしか無く、
コミットして送るまで、サロンの画面は変わらない（ISSUE-059）。
このスクリプトは「作る → コミット → 送る」を1本にしてある。

── 触るものを絞ってある ──
コミットするのは product/data/advice の下だけ。他に書きかけのものがあっても
巻き込まない。枝も、指定したもの以外に居るときは何もせずに止まる。
#>

param(
    # 送り先の枝。ここに送ったものが配られる。
    [string]$Branch = 'main',
    # 送り先の名前。この環境では GitLab を使っている。
    [string]$Remote = 'origin',
    # 星詠みを作るモデル。軽いモデルは長い読み物に向かない（ISSUE-055）
    [string]$Model = 'claude-sonnet-5',
    # 作りも送りもせず、何をするかだけ出す
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

# このファイルの1つ上＝リポジトリの一番上
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

# 記録を残す。うまくいかなかった日を後から追えるようにするため。
$logDir = Join-Path $repo 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir 'daily-advice.log'

function Say($msg) {
    $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    Write-Host $line
    Add-Content -Path $log -Value $line -Encoding UTF8
}

function Fail($msg) {
    Say "NG   $msg"
    exit 1
}

Say "---- 開始 ----"

# 1. 居る枝を確かめる。ここを飛ばすと、作業中の枝に勝手に積んでしまう。
$current = (git rev-parse --abbrev-ref HEAD).Trim()
if ($current -ne $Branch) {
    Fail "いまの枝は '$current' です。'$Branch' に移ってから実行してください（何もしていません）"
}

# 2. 先に相手側を取り込む。送るときにぶつかるのを避けるため。
#    書きかけのものは --autostash が預かって、あとで戻す。
Say "取り込み中: $Remote/$Branch"
git pull --rebase --autostash $Remote $Branch 2>&1 | ForEach-Object { Say "     $_" }
if ($LASTEXITCODE -ne 0) { Fail "取り込みに失敗しました。手で直してから、もう一度実行してください" }

# 3. 作り直す。期限が来ていない期間は、呼んでも飛ばされる。
$env:CLAUDE_MODEL = $Model
if ($DryRun) {
    Say "（確認のみ）いまの状態:"
    node scripts/refresh-advice.js --status 2>&1 | ForEach-Object { Say "     $_" }
    Say "---- 確認のみで終了 ----"
    exit 0
}

Say "作成中（モデル: $Model）"
node scripts/refresh-advice.js 2>&1 | ForEach-Object { Say "     $_" }
$genExit = $LASTEXITCODE

# 4. 星詠みのファイルだけを拾う。他のものは触らない。
git add product/data/advice
$staged = git diff --cached --name-only
if (-not $staged) {
    Say "変わりはありません（更新サイクルの中でした）"
    if ($genExit -ne 0) { Fail "作成中に失敗した期間があります。上の記録を確認してください" }
    Say "---- 終了 ----"
    exit 0
}
Say "変わったファイル: $($staged -join ', ')"

$today = Get-Date -Format 'yyyy-MM-dd'
git commit -m "chore(advice): refresh readings for $today" | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "コミットに失敗しました" }

# 5. 送る。ここまでやって、はじめてサロンの画面が変わる。
#    回線の都合で落ちることがあるので、間を空けて何度か試す。
$pushed = $false
foreach ($wait in @(0, 2, 4, 8, 16)) {
    if ($wait -gt 0) { Say "${wait}秒待って、もう一度送ります"; Start-Sleep -Seconds $wait }
    git push $Remote $Branch 2>&1 | ForEach-Object { Say "     $_" }
    if ($LASTEXITCODE -eq 0) { $pushed = $true; break }
}
if (-not $pushed) { Fail "送信に失敗しました。コミットは手元に残っています" }

Say "送信しました（$Remote/$Branch）"
if ($genExit -ne 0) { Fail "送りましたが、作成中に失敗した期間があります" }
Say "---- 終了 ----"
