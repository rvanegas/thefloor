#!/bin/bash
#
# Draws the link-preview card — server/public/og.png, 1200x630.
#
# This is the image Telegram, Slack, iMessage and the rest show when any of
# this server's addresses is pasted into a conversation. One card for the whole
# site: the pages differ in their title and description, which is what a reader
# of a pasted link actually reads, and a bespoke image each would be four more
# things to keep true for a difference nobody would notice.
#
#   assets/marketing/og-card.sh          writes server/public/og.png
#
# **Rename the output if you change the drawing.** The route serves /assets/
# with a week's cache and the filename is not hashed — and preview caches are
# far stickier than a browser's, several never re-fetching at all. A stale card
# is the one kind of stale asset nobody can clear for the reader.
#
# ── Why it is drawn here rather than exported from a design tool ─────────────
#
# It is nine shapes and four lines of text in the app's own palette, and a
# script that redraws it in a second beats a binary somebody has to find the
# source of. If the card ever wants real design — a screenshot, a composed
# layout — that is the moment to retire this and keep the export instead.
#
# ── The two things that are not obvious ─────────────────────────────────────
#
# **The face is San Francisco, by file path.** planning/STYLE.md: "There is no
# font family. The system face everywhere." ImageMagick lists no fonts on this
# machine, so it is named by its path rather than by a family name that would
# resolve to nothing and silently fall back.
#
# **Bold is drawn with a stroke, because SFNS.ttf ships no bold cut** that
# ImageMagick can select — `-weight 700` against a variable font renders
# regular, with no warning. A 0.9px stroke in the fill colour thickens the
# glyphs to about a semibold without closing the counters; Arial Bold was the
# only true bold available and is not this app's typeface.
#
# Colours are the light palette from app/src/ui/theme.ts, which is the source
# of truth — `text`, `textMuted` — plus the two brand colours from the mark.
set -euo pipefail

cd "$(dirname "$0")/../.."
out=server/public/og.png

SF=/System/Library/Fonts/SFNS.ttf
[ -f "$SF" ] || { echo "No $SF — this script is macOS-only." >&2; exit 1; }
command -v magick >/dev/null || { echo "ImageMagick not installed." >&2; exit 1; }

magick -size 1200x630 xc:"#FFFFFF" \
  `# The diagonal, which is the mark's own form at page scale.` \
  -fill "#5B6478" -draw "polygon 1200,0 1200,630 470,630" \
  -fill "#F2A93B" -draw "polygon 1200,0 470,630 392,630" \
  `# The mark itself: the same two triangles, 64px, top left.` \
  -stroke none \
  -fill "#F2A93B" -draw "polygon 80,76 144,76 80,140" \
  -fill "#5B6478" -draw "polygon 144,76 144,140 80,140" \
  `# Wordmark and headline, stroke-thickened — see the note above.` \
  -font "$SF" -pointsize 34 -fill "#12151A" \
  -stroke "#12151A" -strokewidth 0.6 -annotate +168+122 "The Floor" \
  -pointsize 74 -strokewidth 0.9 -annotate +80+300 "It’s a group chat," \
  -pointsize 74 -strokewidth 0.9 -annotate +80+386 "but voice." \
  `# The two quiet lines, at the app's textMuted.` \
  -stroke none -pointsize 30 -fill "#5A6474" \
  -annotate +80+472 "Group voice on your own time." \
  -annotate +80+514 "Nothing rings." \
  -depth 8 -strip "$out"

echo "→ $out  $(magick identify -format '%wx%h, %b' "$out")"
