# Brand and identity

Each tool gets three personality dials. Everything else is shared, including
the font (Plus Jakarta Sans), the top bar, the nav and the Settings page.

| Dial | Rule |
| ---- | ---- |
| **Name** | One short, friendly English word with a metaphor for the job (Fetch: a dog fetching a brief; Polaris: the star that guides the Universe). Not an acronym, not "Mineski X", not "Tool". The page title is "Name · Mineski". |
| **Brand hue** | One hue no other tool uses (registry below), turned into a full theme by `tools/make_theme.py`. |
| **App icon** | Drawn to the recipe below. |

## Hue registry

Keep this table up to date when a tool claims a slot. Pick hues far apart on
the wheel so tools are told apart at a glance in a browser's tab bar.

| Hue | Brand | Text on brand | Status | Tool |
| --- | ----- | ------------- | ------ | ---- |
| Yellow (Mineski yellow) | `#FFC800` | dark ink | **taken** | Fetch |
| Indigo | `#4B3FE0` | white | **taken** | Polaris |
| Teal | `#0B7D6E` | white | free: `assets/themes/slot-teal.css` | |
| Berry | `#C2256F` | white | **taken** | Suppliers |
| Tangerine | `#FF8A3D` | dark ink | free: `assets/themes/slot-tangerine.css` | |
| Red, green | - | - | **never** (read as danger / success) | |
| Sky blue | - | - | avoid (reads as info) | |

To use a free slot: copy its file to `css/theme.css` and add the tool to this table. For another hue:
`python tools/make_theme.py "#HEX" --name Tool -o css/theme.css`.
Fix every FAIL and NOTE it prints (it suggests a darker shade for muddy
mid-tones). Mineski yellow is the company color; keep it for Fetch and for
company-wide surfaces, not for new tools.

## App icon recipe

Both existing icons follow the same recipe, which is what makes them read as
a set on a phone's home screen:

- **Canvas** 1024 × 1024, a rounded square tile `rx="184"` filling it.
- **Tile**: a pale, warm-or-cool tint related to the brand (Fetch `#FFDEAF`
  peach, Polaris `#E9E6FF` lavender).
- **Subject**: one bold, flat, instantly readable silhouette that is the
  tool's metaphor (a dog carrying a letter; a ringed planet), filling about
  60-70% of the tile, in a **deep ink** (navy / deep indigo: Fetch `#153872`,
  Polaris `#1F1A5C`/`#4B3FE0`), with at most two shades of it for depth.
- **Accent**: exactly one small **orange** detail (Fetch's letter `#F58D36`,
  Polaris's star `#FFA41B`). Orange is the shared family accent.
- No text, no gradients, no outlines, no drop shadows inside the icon, no
  thin details that vanish at 32px.
- Test at 32px (favicon) and 180px (home screen) on light and dark backgrounds.
- Export `tool-icon.svg` plus 32, 180 and 512 px PNGs. The SVG has
  `role="img"` and a `<title>`.

The icon appears: favicon, top-bar brand mark (34px, 8px radius, small
shadow), the login card (88px, 20px radius, medium shadow), the manifest, and
the README (96px, right-aligned). Retired artwork is never reused.

## Manifest

```json
{ "name": "Relay", "short_name": "Relay", "description": "One sentence on the job.",
  "start_url": "./", "scope": "./", "display": "standalone",
  "background_color": "<light --bg>", "theme_color": "<--brand>",
  "icons": [ 180 png, 512 png, svg "any" ] }
```

## Loader art (optional personality)

A tool may have one piece of character art for its long-task loader (Fetch's
running dog). Keep it flat, in `--ink` with the orange accent, animated only
while the task runs, and hidden under reduced motion. Elsewhere, use icons
from `icons.js` only.
