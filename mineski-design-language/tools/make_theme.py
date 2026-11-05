#!/usr/bin/env python3
"""
make_theme.py - generate a Mineski tool theme (brand + tinted neutrals, light and dark).

Every Mineski internal tool shares one stylesheet (assets/mineski-base.css). What
makes a tool *its own* is a single brand color and greys tinted toward that hue
(Fetch: warm yellow-greys, Polaris: cool indigo-greys). This script derives the
whole token set from one hex value and checks every text pair against WCAG AA,
nudging values until they pass.

Usage
  python make_theme.py "#0E8F7E" --name Tide                # prints CSS
  python make_theme.py "#0E8F7E" --name Tide -o theme.css   # writes a file
  python make_theme.py "#0E8F7E" --tint 0.4                 # quieter greys (0..1, default 0.55)
  python make_theme.py "#0E8F7E" --report                   # contrast table only

Standard library only. Python 3.8+.
"""
import argparse
import colorsys
import sys

# ---------------------------------------------------------------- color math
def hex_to_rgb(h):
    h = h.strip().lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if len(h) != 6:
        raise ValueError(f"not a hex color: {h!r}")
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def rgb_to_hex(c):
    return "#" + "".join(f"{max(0, min(255, round(v * 255))):02X}" for v in c)


def hls(hexv):
    r, g, b = hex_to_rgb(hexv)
    return colorsys.rgb_to_hls(r, g, b)


def from_hls(h, l, s):
    return rgb_to_hex(colorsys.hls_to_rgb(h % 1, max(0, min(1, l)), max(0, min(1, s))))


def luminance(hexv):
    def ch(v):
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = map(ch, hex_to_rgb(hexv))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    la, lb = luminance(a), luminance(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def mix(a, b, t):
    """t of a over (1 - t) of b."""
    ca, cb = hex_to_rgb(a), hex_to_rgb(b)
    return rgb_to_hex(tuple(x * t + y * (1 - t) for x, y in zip(ca, cb)))


def rgba(hexv, alpha):
    r, g, b = (round(v * 255) for v in hex_to_rgb(hexv))
    return f"rgba({r}, {g}, {b}, {alpha:g})"


def shift_l(hexv, dl):
    h, l, s = hls(hexv)
    return from_hls(h, l + dl, s)


def darken_until(hexv, against, target, step=-0.01):
    """Move lightness until contrast(hexv, against) >= target."""
    h, l, s = hls(hexv)
    c = hexv
    for _ in range(120):
        if contrast(c, against) >= target:
            return c
        l += step
        if l <= 0 or l >= 1:
            break
        c = from_hls(h, l, s)
    return c


lighten_until = lambda hexv, against, target: darken_until(hexv, against, target, step=0.01)

# ---------------------------------------------------------------- neutrals
# Lightness / saturation ladders taken from Fetch and Polaris. Saturation is
# scaled by --tint: 0 = pure grey, 1 = as rich as Polaris.
LIGHT = {  # name: (lightness, saturation at tint 1)
    "bg":        (0.962, 0.34),
    "surface":   (1.000, 0.00),
    "surface-2": (0.975, 0.45),
    "ink":       (0.095, 0.40),
    "ink-2":     (0.245, 0.24),
    "muted":     (0.430, 0.14),
    "line":      (0.910, 0.24),
    "line-2":    (0.848, 0.24),
}
DARK = {
    "bg":        (0.072, 0.44),
    "surface":   (0.108, 0.37),
    "surface-2": (0.134, 0.33),
    "surface-3": (0.200, 0.28),   # raised: toasts, tooltips in dark mode
    "ink":       (0.944, 0.40),
    "ink-2":     (0.824, 0.28),
    "muted":     (0.628, 0.18),
    "line":      (0.188, 0.29),
    "line-2":    (0.248, 0.26),
}


def neutrals(hue, tint, ladder):
    return {k: from_hls(hue, l, s * tint) for k, (l, s) in ladder.items()}


# ---------------------------------------------------------------- theme
def build(brand, tint=0.55):
    brand = rgb_to_hex(hex_to_rgb(brand))
    hue, bl, bs = hls(brand)
    # Yellow-ish hues look far more saturated than blues at the same HSL
    # saturation, so warm hues get a lighter tint (Fetch's greys are subtle).
    warm = 0.08 <= hue <= 0.22
    t = tint * (0.6 if warm else 1.0)

    L = neutrals(hue, t, LIGHT)
    D = neutrals(hue, t, DARK)
    notes = []

    # muted text must pass AA on bg and surface-2 (the darkest place it sits)
    for pal, fn in ((L, darken_until), (D, lighten_until)):
        for key, target in (("muted", 4.6), ("ink-2", 9.0)):
            for back in ("bg", "surface-2"):
                pal[key] = fn(pal[key], pal[back], target)

    white = "#FFFFFF"
    light_brand = contrast(white, brand) < 4.5          # e.g. yellow: dark text on it
    on_brand = L["ink"] if light_brand else white
    if light_brand and contrast(on_brand, brand) < 4.5:
        on_brand = "#111111"

    # ---- light mode brand tokens
    lt = {}
    lt["brand"] = brand
    lt["brand-hover"] = shift_l(brand, +0.06) if light_brand else shift_l(brand, -0.05)
    lt["brand-strong"] = shift_l(brand, -0.05)          # borders of solid brand fills
    lt["on-brand"] = on_brand
    lt["brand-soft"] = mix(brand, white, 0.20 if light_brand else 0.10)
    bt = darken_until(brand, white, 4.6)
    bt = darken_until(bt, lt["brand-soft"], 4.6)
    lt["brand-text"] = bt                                # links, brand-colored text, icons
    lt["on-brand-soft"] = darken_until(bt, lt["brand-soft"], 7.0)
    lt["focus"] = brand if contrast(brand, L["bg"]) >= 3 else bt

    # ---- dark mode brand tokens
    dk = {}
    if light_brand:
        dk["brand"] = brand
        dk["brand-hover"] = shift_l(brand, +0.06)
        dk["brand-strong"] = shift_l(brand, -0.05)
        dk["on-brand"] = on_brand
    else:
        b2 = shift_l(brand, +0.06)
        if contrast(white, b2) < 4.5:
            b2 = brand
        dk["brand"] = b2
        dk["brand-hover"] = shift_l(b2, +0.05)
        dk["brand-strong"] = b2
        dk["on-brand"] = white
    dk["brand-soft"] = rgba(brand, 0.13 if light_brand else 0.16)
    soft_dark = mix(brand, D["surface"], 0.16)           # what brand-soft looks like on a card
    dk["brand-text"] = lighten_until(dk["brand"], D["surface"], 7.0)
    dk["on-brand-soft"] = lighten_until(dk["brand-text"], soft_dark, 8.0)
    dk["focus"] = dk["brand-text"]

    # ---- extras
    glow_l = 0.09 if light_brand else 0.10
    glow_d = 0.05 if light_brand else 0.14

    # ---- report
    checks = [
        ("light", "ink on bg", L["ink"], L["bg"], 7),
        ("light", "ink-2 on bg", L["ink-2"], L["bg"], 7),
        ("light", "muted on bg", L["muted"], L["bg"], 4.5),
        ("light", "muted on surface-2", L["muted"], L["surface-2"], 4.5),
        ("light", "on-brand on brand", lt["on-brand"], lt["brand"], 4.5),
        ("light", "on-brand on brand-hover", lt["on-brand"], lt["brand-hover"], 4.5),
        ("light", "brand-text on surface", lt["brand-text"], L["surface"], 4.5),
        ("light", "brand-text on bg", lt["brand-text"], L["bg"], 4.5),
        ("light", "on-brand-soft on brand-soft", lt["on-brand-soft"], lt["brand-soft"], 4.5),
        ("light", "focus ring vs bg (non-text)", lt["focus"], L["bg"], 3),
        ("dark", "ink on bg", D["ink"], D["bg"], 7),
        ("dark", "muted on bg", D["muted"], D["bg"], 4.5),
        ("dark", "muted on surface-2", D["muted"], D["surface-2"], 4.5),
        ("dark", "on-brand on brand", dk["on-brand"], dk["brand"], 4.5),
        ("dark", "brand-text on surface", dk["brand-text"], D["surface"], 4.5),
        ("dark", "on-brand-soft on brand-soft", dk["on-brand-soft"], soft_dark, 4.5),
        ("dark", "focus ring vs bg (non-text)", dk["focus"], D["bg"], 3),
    ]
    report = [(m, name, round(contrast(a, b), 2), need) for m, name, a, b, need in checks]
    failing = [r for r in report if r[2] < r[3]]
    if failing:
        notes.append("Some pairs fail AA: pick a different brand shade or hue.")
    if light_brand and contrast(on_brand, brand) < 7:
        darker = darken_until(brand, white, 4.6)
        notes.append(f"Mid-tone brand: dark text on it looks muddy. Prefer {darker} "
                     "(the same hue, dark enough for white text).")
    if 0.07 <= hue <= 0.15:
        notes.append("Hue is close to the warning amber: brand-soft and warn-soft will look alike. "
                     "Never use brand-soft for a status badge (use badge-muted for 'New').")
    if 0.0 <= hue < 0.04 or hue > 0.96:
        notes.append("Red brands read as 'danger'. Pick another hue.")
    if 0.25 <= hue <= 0.42:
        notes.append("Green brands read as 'success'. Pick another hue.")
    return dict(brand=brand, hue=hue, light=L, dark=D, lt=lt, dk=dk, light_brand=light_brand,
                glow_l=glow_l, glow_d=glow_d, report=report, notes=notes)


ORDER_BRAND = ["brand", "brand-hover", "brand-strong", "on-brand", "brand-soft",
               "brand-text", "on-brand-soft", "focus"]
ORDER_N = ["bg", "surface", "surface-2", "surface-3", "ink", "ink-2", "muted", "line", "line-2"]


def block(theme, mode, indent):
    pad = " " * indent
    n = theme["light"] if mode == "light" else theme["dark"]
    b = theme["lt"] if mode == "light" else theme["dk"]
    out = []
    for k in ORDER_BRAND:
        out.append(f"{pad}--{k}: {b[k]};")
    out.append("")
    for k in ORDER_N:
        if k in n:
            out.append(f"{pad}--{k}: {n[k]};")
    if mode == "light":
        out.append(f"{pad}--surface-3: {n['ink']};")
    out.append("")
    ink = n["ink"]
    rgb = lambda hexv: ", ".join(str(round(v * 255)) for v in hex_to_rgb(hexv))
    if mode == "light":
        out.append(f"{pad}--shadow-rgb: {rgb(ink)};          /* shadows are tinted with the ink */")
        out.append(f"{pad}--brand-rgb: {rgb(theme['brand'])};")
        out.append(f"{pad}--glow: rgba(var(--brand-rgb), {theme['glow_l']});")
        out.append(f"{pad}--toast-bg: {ink};")
        out.append(f"{pad}--toast-fg: {n['bg']};")
        out.append(f"{pad}color-scheme: light;")
    else:
        out.append(f"{pad}--glow: rgba(var(--brand-rgb), {theme['glow_d']});")
        out.append(f"{pad}--toast-bg: {n['surface-3']};")
        out.append(f"{pad}--toast-fg: {n['ink']};")
        out.append(f"{pad}color-scheme: dark;")
    return "\n".join(out)


def css(theme, name, font="Plus Jakarta Sans"):
    lines = [
        f"/* {name} - theme tokens for assets/mineski-base.css",
        f"   Generated by tools/make_theme.py from brand {theme['brand']}.",
        "   Load this file BEFORE mineski-base.css. Edit by re-running the generator. */",
        "",
        ":root {",
        f'  --font: "{font}"; /* the one family font; load it from Google Fonts in index.html */',
        block(theme, "light", 2),
        "}",
        "",
        ':root[data-theme="dark"] {',
        block(theme, "dark", 2),
        "}",
        "@media (prefers-color-scheme: dark) {",
        '  :root:not([data-theme="light"]) {',
        block(theme, "dark", 4),
        "  }",
        "}",
        "",
    ]
    return "\n".join(lines)


def print_report(theme, stream=sys.stderr):
    print(f"\nContrast report for {theme['brand']} "
          f"({'light brand: dark text on it' if theme['light_brand'] else 'dark brand: white text on it'})",
          file=stream)
    for mode, name, ratio, need in theme["report"]:
        flag = "ok " if ratio >= need else "FAIL"
        print(f"  {flag} {mode:5} {name:34} {ratio:5.2f}  (needs {need})", file=stream)
    for n in theme["notes"]:
        print(f"  NOTE: {n}", file=stream)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("brand", help='brand color, e.g. "#0E8F7E"')
    ap.add_argument("--name", default="Tool", help="tool name for the file header")
    ap.add_argument("--font", default="Plus Jakarta Sans", help="the family font; leave as is (see typography-and-layout.md)")
    ap.add_argument("--tint", type=float, default=0.55, help="how much the greys lean toward the brand hue, 0..1")
    ap.add_argument("-o", "--out", help="write CSS to this file instead of stdout")
    ap.add_argument("--report", action="store_true", help="print only the contrast report")
    a = ap.parse_args()
    theme = build(a.brand, a.tint)
    print_report(theme)
    if a.report:
        return
    text = css(theme, a.name, a.font)
    if a.out:
        with open(a.out, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
        print(f"\nWrote {a.out}", file=sys.stderr)
    else:
        print(text)
    if any(r[2] < r[3] for r in theme["report"]):
        sys.exit(1)


if __name__ == "__main__":
    main()
