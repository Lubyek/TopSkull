#!/usr/bin/env bash
# Готовит картинки для сайта из исходников с прозрачным фоном (assets/source/):
#   head.png  — гарнитура;  setup.png — ПК и геймпад рядом (делится на два изображения).
# Результат: assets/head.webp, assets/pc.webp, assets/pad.webp. Нужен только ImageMagick.
# Использование: tools/prepare_assets.sh [папка с исходниками] [выходная папка]
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${1:-$HERE/assets/source}"
OUT="${2:-$HERE/assets}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT"

# Обрезка по рамке объекта: полупрозрачные «хвосты» (альфа < 50 %) игнорируются.
trim_solid() { # in out
  local box
  box="$(magick "$1" -alpha extract -threshold 50% -format '%@' info:)"
  magick "$1" -crop "$box" +repage "$2"
}

save() { # in out высота
  magick "$1" -resize "x$3" -define webp:alpha-quality=100 -quality 86 "$2"
  identify -format "$(basename "$2") %wx%h %b\n" "$2"
}

# ---------- гарнитура ----------
trim_solid "$SRC/head.png" "$TMP/head.png"
save "$TMP/head.png" "$OUT/head.webp" 900

# ---------- ПК и геймпад: делим по пустому зазору между ними ----------
W="$(identify -format '%w' "$SRC/setup.png")"
H="$(identify -format '%h' "$SRC/setup.png")"
GAP=878   # середина пустой полосы между ПК и геймпадом (для кадра 1536x1024)
magick "$SRC/setup.png" -crop "${GAP}x${H}+0+0" +repage "$TMP/pc_raw.png"
magick "$SRC/setup.png" -crop "$((W - GAP))x${H}+${GAP}+0" +repage "$TMP/pad_raw.png"
trim_solid "$TMP/pc_raw.png" "$TMP/pc.png"
save "$TMP/pc.png" "$OUT/pc.webp" 900

# Чёрная кнопка с логотипом PS (центр 330,757 в правой половине) закрашивается нейтральным серым.
magick "$TMP/pad_raw.png" -fill 'rgb(212,214,219)' -draw "circle 330,762 330,790" \
  -fill 'rgb(226,228,232)' -draw "circle 330,762 330,785" "$TMP/pad_logo.png"
trim_solid "$TMP/pad_logo.png" "$TMP/pad.png"
magick "$TMP/pad.png" -resize 640x -define webp:alpha-quality=100 -quality 86 "$OUT/pad.webp"
identify -format "pad.webp %wx%h %b\n" "$OUT/pad.webp"
