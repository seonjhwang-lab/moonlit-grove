#!/usr/bin/env bash
# ==========================================================================
# build.sh — index.html + style.css + js/*.js 를 하나의 파일로 번들링한다.
#
# 출력 2종:
#   dist/index.html   완전한 독립 실행 문서 (정적 호스팅에 그대로 배포 가능)
#   artifact.html      Claude Artifact 게시용 (<!DOCTYPE>/<html>/<head>/<body> 제외,
#                       게시 시점에 자동으로 감싸진다)
#
# PHASE 진행 중 파일이 늘어나도 이 스크립트만 다시 실행하면 최신 번들이 나온다.
# ==========================================================================
set -euo pipefail
cd "$(dirname "$0")"

JS_FILES=(
  js/audio.js js/collision.js js/map.js js/input.js js/combat.js
  js/player.js js/enemy.js js/companion.js js/feedback.js js/ui.js
  js/game.js js/main.js
)

FONT_LINKS='<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap" rel="stylesheet" />'

# index.html <body> ~ </body> 내용을 추출하고, js/*.js 를 불러오는 <script src> 줄은 제거한다
# (같은 내용을 아래에서 인라인 <script> 로 대체하기 때문)
BODY_INNER="$(awk '/<body>/{f=1;next}/<\/body>/{f=0}f' index.html \
  | grep -v '<script src="js/')"

STYLE_CSS="$(cat style.css)"

JS_BUNDLE=""
for f in "${JS_FILES[@]}"; do
  JS_BUNDLE+=$(printf '\n/* ---- %s ---- */\n' "$f")
  JS_BUNDLE+=$'\n'
  JS_BUNDLE+="$(cat "$f")"
  JS_BUNDLE+=$'\n'
done

mkdir -p dist

# -------------------------------------------------------------- dist/index.html
{
  echo '<!DOCTYPE html>'
  echo '<html lang="ko">'
  echo '<head>'
  echo '<meta charset="UTF-8" />'
  echo '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />'
  echo '<meta name="theme-color" content="#0b1410" />'
  echo '<meta name="apple-mobile-web-app-capable" content="yes" />'
  echo '<meta name="mobile-web-app-capable" content="yes" />'
  echo '<meta name="description" content="달빛 숲의 수호자 — Moonlit Grove Prototype 0.1.0" />'
  echo '<title>달빛 숲의 수호자</title>'
  echo "$FONT_LINKS"
  echo '<style>'
  echo "$STYLE_CSS"
  echo '</style>'
  echo '</head>'
  echo '<body>'
  echo "$BODY_INNER"
  echo '<script>'
  echo "$JS_BUNDLE"
  echo '</script>'
  echo '</body>'
  echo '</html>'
} > dist/index.html

# -------------------------------------------------------------- artifact.html
# (Artifact 호스팅이 <!doctype>/<head>/<body> 골격을 자동으로 씌우므로 내용만 작성)
{
  echo '<title>달빛 숲의 수호자</title>'
  echo "$FONT_LINKS"
  echo '<style>'
  echo "$STYLE_CSS"
  echo '</style>'
  echo "$BODY_INNER"
  echo '<script>'
  echo "$JS_BUNDLE"
  echo '</script>'
} > artifact.html

echo "빌드 완료:"
wc -c dist/index.html artifact.html
