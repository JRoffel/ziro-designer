#!/bin/sh
# KiCad's source files in the folders our tree mirrors, at the reference tag.
# Run when /home/akshay/kicad-reference moves tag (CLAUDE.md: it tracks the installed kicad).
set -e
REF=${KICAD_REF:-/home/akshay/kicad-reference}
TAG=$(git -C "$REF" describe --tags)
OUT="$(dirname "$0")/$TAG.txt"
git -C "$REF" ls-files -- common libs include thirdparty eeschema pcbnew gerbview cvpcb \
  pcb_calculator pagelayout_editor bitmap2component 3d-viewer utils |
  grep -E '\.(cpp|h|c|hpp|cc)$' > "$OUT"
echo "wrote $OUT ($(wc -l < "$OUT") files)"
