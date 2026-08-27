#!/usr/bin/env bash
# 彩球连珠 · 游玩统计：把 nginx 打点日志汇总成一张静态页。
# 装到 ECS 的 /usr/local/bin/，由 cron 每 10 分钟跑一次。
#
# 数据口径（日志一行 = 一分钟真实游戏时间，见 js/beacon.js）：
#   "人"   = 当天出现过的去重匿名 ID。不等于真人数：换浏览器/清数据算两个，
#            一台设备全家轮流玩算一个。
#   "时长" = 该 ID 当天的心跳条数，误差 ±1 分钟（不满一分钟的尾巴丢掉）。
#
# nginx 日志 logrotate 只留 14 天，所以每次都把结果并进一份累积 TSV，
# 历史不随日志轮转丢失。整个流程幂等，重复跑不会重复计。
set -euo pipefail

# 路径都可以用环境变量覆盖，方便拿假数据试跑（见文件末尾注释）
LOG=${LOG:-/var/log/nginx/color-lines-play.log}
DATA=${DATA:-/var/lib/color-lines/daily.tsv} # date \t uid \t minutes \t sessions
OUT=${OUT:-/var/www/color-lines-stats/index.html}
DAYS=${DAYS:-30}

mkdir -p "$(dirname "$DATA")" "$(dirname "$OUT")"
[ -e "$DATA" ] || : >"$DATA"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

TAB=$(printf '\t')

fmt_dur() { # 分钟数 → "1 小时 30 分"
  awk -v m="$1" 'BEGIN {
    m = int(m)
    if (m < 60) printf "%d 分钟", m
    else if (m % 60 == 0) printf "%d 小时", m / 60
    else printf "%d 小时 %d 分", int(m / 60), m % 60
  }'
}

# ---------- 1. 现存日志（含轮转过的）→ 按 日期/匿名ID 汇总 ----------
# uid/sid 的白名单是要紧的：它们来自 URL 参数，谁都能伪造。不卡死就会把
# <script> 之类的东西原样写进下面生成的 HTML 里。
for f in "$LOG" "$LOG".*; do
  [ -e "$f" ] || continue
  case "$f" in
  *.gz) zcat -- "$f" ;;
  *) cat -- "$f" ;;
  esac
done | awk '
  NF >= 3 && $2 ~ /^[0-9a-z]{1,16}$/ && $3 ~ /^[0-9a-z]{1,16}$/ {
    split($1, t, "T")
    key = t[1] "\t" $2
    minutes[key]++
    if (!((key "\t" $3) in seen)) { seen[key "\t" $3] = 1; sessions[key]++ }
  }
  END { for (k in minutes) print k "\t" minutes[k] "\t" sessions[k] }
' | sort >"$TMP/fresh.tsv"

# ---------- 2. 并进累积文件：日志覆盖到的那几天用新值，更早的保留 ----------
# 用 FILENAME 而不是 NR==FNR 判断第一个文件 —— fresh.tsv 为空时
# NR==FNR 会在第二个文件的首行误判成真。
awk -F'\t' -v fresh="$TMP/fresh.tsv" '
  FILENAME == fresh { day[$1] = 1; print; next }
  !($1 in day) { print }
' "$TMP/fresh.tsv" "$DATA" | sort >"$TMP/merged.tsv"
mv "$TMP/merged.tsv" "$DATA"

# ---------- 3. 按天聚合 + 今日明细 ----------
TODAY=$(date +%F)

# 结尾不用 head：pipefail 下 head 提前退出会把 sort 打成 SIGPIPE，整个脚本挂掉
awk -F'\t' '
  { people[$1]++; mins[$1] += $3; sess[$1] += $4; if ($3 + 0 > top[$1]) top[$1] = $3 + 0 }
  END { for (d in people) printf "%s\t%d\t%d\t%d\t%d\n", d, people[d], mins[d], sess[d], top[d] }
' "$DATA" | sort -r | awk -v n="$DAYS" 'NR <= n' >"$TMP/daily.tsv"

awk -F'\t' -v d="$TODAY" '$1 == d { printf "%s\t%d\t%d\n", $2, $3, $4 }' "$DATA" |
  sort -t"$TAB" -k2,2nr >"$TMP/today.tsv"

T_PEOPLE=$(awk -F'\t' -v d="$TODAY" '$1 == d { print $2; f = 1 } END { if (!f) print 0 }' "$TMP/daily.tsv")
T_MINS=$(awk -F'\t' -v d="$TODAY" '$1 == d { print $3; f = 1 } END { if (!f) print 0 }' "$TMP/daily.tsv")
T_AVG=$(awk -v p="$T_PEOPLE" -v m="$T_MINS" 'BEGIN { print p ? int(m / p + 0.5) : 0 }')
MAX=$(awk -F'\t' 'BEGIN { m = 1 } $3 + 0 > m { m = $3 + 0 } END { print m }' "$TMP/daily.tsv")

# ---------- 4. 生成页面（先写同目录临时文件再 mv，避免被读到半截） ----------
PAGE="$OUT.tmp"

cat >"$PAGE" <<'HTML'
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="robots" content="noindex, nofollow" />
<title>彩球连珠 · 游玩统计</title>
<style>
:root {
  --bg: #1a1714; --bg-2: #221d17; --panel: #241f19; --line: #3a322a;
  --text: #efe7db; --muted: #a99e8d; --accent: #c8a35c; --accent-2: #ddbd7c;
  --serif: 'Songti SC', 'STSong', Georgia, 'Times New Roman', 'SimSun', serif;
  --sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}
* { box-sizing: border-box; }
html { background: var(--bg); }
body {
  margin: 0; padding: 28px 20px 56px; color: var(--text); font-family: var(--sans);
  background: radial-gradient(1100px 560px at 50% -12%, var(--bg-2), var(--bg) 70%);
  -webkit-font-smoothing: antialiased;
}
.wrap { max-width: 860px; margin: 0 auto; }
h1 { font-family: var(--serif); font-size: 26px; font-weight: 600; margin: 0 0 4px; letter-spacing: .04em; }
h1 .dot { color: var(--accent); }
.sub { color: var(--muted); font-size: 13px; margin-bottom: 28px; }
h2 { font-family: var(--serif); font-size: 17px; font-weight: 600; margin: 34px 0 12px; color: var(--accent-2); letter-spacing: .04em; }
.hero { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 18px 16px; text-align: center; }
.card .k { color: var(--muted); font-size: 12px; letter-spacing: .1em; margin-bottom: 8px; }
.card .v { font-family: var(--serif); font-size: 30px; color: var(--accent-2); line-height: 1.1; }
.card .u { color: var(--muted); font-size: 12px; margin-left: 3px; }
.chart { display: flex; align-items: flex-end; gap: 4px; height: 170px; padding: 8px 2px 0; overflow-x: auto; }
/* max-width 是要紧的：只有一两天数据时，不加会被 flex 拉成一整块板子 */
.bar { flex: 1 1 20px; max-width: 46px; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; height: 100%; }
.bar b { font-size: 10px; color: var(--muted); font-weight: 400; margin-bottom: 3px; }
.bar i { display: block; width: 100%; height: var(--h); min-height: 2px; border-radius: 4px 4px 0 0;
         background: linear-gradient(180deg, var(--accent-2), var(--accent)); }
.bar s { font-size: 10px; color: var(--muted); text-decoration: none; margin-top: 5px; white-space: nowrap; }
.scroll { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { padding: 9px 10px; text-align: right; border-bottom: 1px solid var(--line); white-space: nowrap; }
th { color: var(--muted); font-weight: 400; font-size: 12px; letter-spacing: .08em; }
th:first-child, td:first-child { text-align: left; }
tbody tr:hover { background: rgba(200, 163, 92, .06); }
td.hi { color: var(--accent-2); }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; color: var(--muted); }
.empty { color: var(--muted); font-size: 14px; padding: 18px 0; }
.note { margin-top: 40px; padding-top: 18px; border-top: 1px solid var(--line); color: var(--muted); font-size: 12px; line-height: 1.9; }
.note b { color: var(--text); font-weight: 500; }
@media (max-width: 560px) {
  .hero { grid-template-columns: 1fr; }
  .card { display: flex; align-items: baseline; justify-content: space-between; text-align: left; padding: 14px 16px; }
  .card .k { margin: 0; }
}
</style>
</head>
<body>
<div class="wrap">
HTML

{
  echo "<h1>彩球连珠 <span class=\"dot\">·</span> 游玩统计</h1>"
  echo "<div class=\"sub\">更新于 $(date '+%Y-%m-%d %H:%M')　·　每 10 分钟自动刷新一次数据</div>"

  echo '<div class="hero">'
  echo "  <div class=\"card\"><div class=\"k\">今天有人玩</div><div class=\"v\">${T_PEOPLE}<span class=\"u\">人</span></div></div>"
  echo "  <div class=\"card\"><div class=\"k\">今天总时长</div><div class=\"v\">$(fmt_dur "$T_MINS")</div></div>"
  echo "  <div class=\"card\"><div class=\"k\">人均</div><div class=\"v\">$(fmt_dur "$T_AVG")</div></div>"
  echo '</div>'

  echo "<h2>最近 ${DAYS} 天</h2>"
  if [ -s "$TMP/daily.tsv" ]; then
    echo '<div class="chart">'
    sort "$TMP/daily.tsv" | awk -F'\t' -v max="$MAX" '{
      printf "<div class=\"bar\" title=\"%s\"><b>%d</b><i style=\"--h:%.1f%%\"></i><s>%s</s></div>\n",
             $1, $3, $3 * 100 / max, substr($1, 6)
    }'
    echo '</div>'

    echo '<div class="scroll"><table>'
    echo '<thead><tr><th>日期</th><th>人数</th><th>总时长</th><th>人均</th><th>局数</th><th>玩最久的</th></tr></thead><tbody>'
    awk -F'\t' '{
      avg = int($3 / $2 + 0.5)
      printf "<tr><td>%s</td><td>%d</td><td class=\"hi\">%d 分</td><td>%d 分</td><td>%d</td><td>%d 分</td></tr>\n",
             $1, $2, $3, avg, $4, $5
    }' "$TMP/daily.tsv"
    echo '</tbody></table></div>'
  else
    echo '<div class="empty">还没有数据。等有人开局玩满一分钟，这里就会出现第一行。</div>'
  fi

  echo '<h2>今天各人明细</h2>'
  if [ -s "$TMP/today.tsv" ]; then
    echo '<div class="scroll"><table>'
    echo '<thead><tr><th>匿名 ID</th><th>时长</th><th>开局次数</th></tr></thead><tbody>'
    awk -F'\t' '{
      printf "<tr><td class=\"mono\">%s</td><td class=\"hi\">%d 分</td><td>%d</td></tr>\n", $1, $2, $3
    }' "$TMP/today.tsv"
    echo '</tbody></table></div>'
  else
    echo '<div class="empty">今天还没人玩。</div>'
  fi

  cat <<'HTML'
<div class="note">
  <b>怎么算的</b>　页面每玩满一分钟发一个心跳，服务器只记一行时间戳。只在游戏页、
  页面可见、且两分钟内有操作时才计时 —— 挂机、切到别的标签页、看复盘都不算。<br />
  <b>“人”不等于真人数</b>　同一个人换浏览器或清了本地数据会变成新 ID，
  一台设备全家轮流玩则算一个人。<br />
  <b>误差</b>　±1 分钟，每人每次不满一分钟的尾巴会丢掉。<br />
  <b>隐私</b>　只记一个随机匿名 ID，不记 IP、不记设备型号，发出去的单文件离线版完全不联网。
</div>
</div>
</body>
</html>
HTML
} >>"$PAGE"

chmod 644 "$PAGE"
mv "$PAGE" "$OUT"
echo "统计页已更新：$OUT（累积数据 $(wc -l <"$DATA") 行）"

# 拿假数据试跑：
#   LOG=/tmp/t.log DATA=/tmp/t.tsv OUT=/tmp/t.html ./color_lines_stats.sh
# 假日志一行的样子（时间 / 匿名ID / 会话ID）：
#   2026-08-27T21:03:11+08:00 a1b2c3d4 x9y8z7
