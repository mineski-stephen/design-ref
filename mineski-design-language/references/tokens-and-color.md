# Tokens and color

Everything visual is a CSS custom property. Components in `mineski-base.css`
read tokens only; a tool's look comes from **one theme file** loaded before it.

```
css/theme.css         ← brand + tinted neutrals, light and dark (generated per tool)
css/mineski-base.css  ← shared tokens (semantic, shadows, radii, motion) + all components
css/app.css           ← this tool's few extra styles, tokens only
```

## Theme tokens (per tool)

Generate with `python tools/make_theme.py "#HEX" --name Tool -o css/theme.css`.

| Token | Use it for | Never use it for |
| ----- | ---------- | ---------------- |
| `--brand` | Primary button fill, counts, the active progress, the top glow, small accents (section underline, list markers) | Large backgrounds, body text, status meaning |
| `--brand-hover` | Primary button hover | |
| `--brand-strong` | Border of solid brand fills | |
| `--on-brand` | Text/icons on `--brand` (white for dark brands, ink for light brands like yellow) | |
| `--brand-soft` | Selected tab, selected chip, tonal button, avatar initials, hover row highlight, empty-state art | Status badges when the hue is close to amber (Fetch) |
| `--on-brand-soft` | Text/icons on `--brand-soft` | |
| `--brand-text` | Links, brand-colored text and icons on surfaces (AA on `--surface` and `--bg`) | |
| `--focus` | Focus ring and focused input border (3:1 against `--bg`) | |
| `--bg` | Page background (barely tinted) | Cards |
| `--surface` | Cards, inputs, menus, dialogs | |
| `--surface-2` | Insets inside cards: summary lists, table headers, hover rows, code chips, segmented control track | |
| `--surface-3` | Raised in dark mode (toasts). In light mode it equals ink | |
| `--ink` | Headings, primary text | |
| `--ink-2` | Body text in dense places, strong meta | |
| `--muted` | Secondary text, hints, labels, inactive tabs, icons (AA on `--bg` and `--surface-2`) | Anything the user must read to act |
| `--line` | Card borders, dividers | |
| `--line-2` | Input and button borders, dashed separators, skeleton shimmer | |
| `--shadow-rgb` | Shadow tint (the ink, as `r, g, b`) | |
| `--brand-rgb` | Brand as `r, g, b` for translucent glows | |
| `--glow` | The single radial glow at the top of the page | |
| `--toast-bg` / `--toast-fg` | Toasts: dark ink in light mode, a raised surface in dark mode | |
| `--font` | The tool's font family | |

**Three text colors only:** `--ink`, `--ink-2`, `--muted`. Plus `--brand-text`
for links and semantic colors for status.

### How the neutrals are tinted

Greys lean toward the brand hue (Fetch: warm yellow-grey; Polaris: cool
indigo-grey). That single choice makes a tool feel like itself without adding
color. The generator uses fixed lightness ladders from Fetch and Polaris and a
`--tint` (0 to 1, default 0.55; warm hues are automatically toned down because
yellow reads more saturated). Light: `bg` L≈96%, `surface` white, `surface-2`
97.5%, `line` 91%, `line-2` 85%, `muted` ≈43%, `ink-2` ≈25%, `ink` ≈10%.
Dark: `bg` 7%, `surface` 11%, `surface-2` 13%, `line` 19%, `line-2` 25%,
`muted` 63%, `ink-2` 82%, `ink` 94%.

## Shared tokens (in mineski-base.css, same for every tool)

### Semantic colors

Each has a solid (text, icons, dots) and a soft tint (backgrounds). Dark mode
re-tunes them (lighter solids, translucent tints) rather than inverting.

| Token | Light | Dark | Meaning |
| ----- | ----- | ---- | ------- |
| `--ok` / `--ok-soft` | `#17734A` / `#E2F3E9` | `#5BD69A` / 12% | Done, connected, won, saved |
| `--warn` / `--warn-soft` | `#8A5300` / `#FFF2D9` | `#FFC266` / 12% | Needs attention, waking up, due soon, setup needed, notes |
| `--danger` / `--danger-soft` | `#B42318` / `#FDECEA` | `#FF8A80` / 12% | Errors, blocked, overdue, destructive |
| `--danger-solid` | `#D92D20` | same | Fill of the one "Delete" button |
| `--info` / `--info-soft` | `#1F5BD6` / `#E8EFFE` | `#93B4FF` / 12% | In progress, neutral information |
| `--violet` / `--violet-soft` | `#6D28D9` / `#F0EAFF` | `#C4A8FF` / 12% | A fifth status when needed (e.g. Submitted) |

Status mapping used across tools: **New** → brand-soft (or muted for amber
brands), **In progress** → info, **Submitted** → violet, **Won / Done /
Approved** → ok, **Lost / Declined / Archived** → muted, **Rejected / Failed**
→ danger, **Due soon** → warn, **Due today / overdue (open)** → danger (pulsing
`.badge-urgent` only for today), **past / none** → muted.

### Shape

| Token | Value | Use |
| ----- | ----- | --- |
| `--r-xs` | 6px | `code`, `kbd`, identifier chips |
| `--r-sm` | 10px | Buttons, inputs, menu items, small notes |
| `--r` | 14px | Callouts, toasts, menus, large buttons, summary lists |
| `--r-lg` | 20px | Cards, tables |
| `--r-xl` | 28px | Hero task card, dialogs, big loader |
| `--r-pill` | 999px | Badges, chips, counts, the top nav, session pill |

### Elevation

| Token | Use |
| ----- | --- |
| `--shadow-sm` | Resting cards, buttons, inputs in toolbars, nav |
| `--shadow-md` | Hovered cards, the hero task card, suggestion lists |
| `--shadow-lg` | Dialogs, menus, toasts, the big loader |
| `--shadow-brand` | Under the primary button only |

Shadows are soft and tinted with the ink in light mode; pure black in dark mode.
Never use hard shadows or borders thicker than 1 px (except the 3 px focus ring
and the 4 px brand band on a hovered record card).

## Rules

- **Never hard-code a color in a component.** If a tool needs a new color
  role, add a token to `app.css` with both light and dark values.
- **Dark tokens are defined twice**: under `:root[data-theme="dark"]` and under
  `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }`.
  The generator does this for you.
- **The brand is not a status color.** Don't color "success" with the brand,
  and don't use the brand for a warning. Brands may not be red or green
  (they'd read as danger or success); the generator warns.
- **Printed/PDF output stays light**, and a shareable "paper" document (Fetch's
  brief) may stay white in dark mode, with its own `--p-*` tokens.
- **Contrast**: body text ≥ 7:1 on bg; muted ≥ 4.5:1 on bg and surface-2; text
  on brand ≥ 4.5:1; focus ring ≥ 3:1. Run the generator's report after any change.
- **Selection** uses the brand at about 32% (`::selection`).
- `color-scheme: light | dark` is set in the theme so native controls match.
