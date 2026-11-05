# Typography and layout

## Fonts

**Every tool uses Plus Jakarta Sans**, from Google Fonts, weights 400-800 plus
400 italic (for placeholders), with the system stack as fallback
(`--font-fallback` in the base). The font is part of the family, not a
per-tool choice: tools are told apart by hue, icon and name, never by type.
`--font` in every theme is `"Plus Jakarta Sans"`, and every `index.html` loads
it with exactly this link:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&display=swap">
```

Don't use any other family, a serif or a display face. Monospace (`--mono`,
the system mono stack) is only for identifiers, codes, keys and URLs.

## Type scale

Body is **15px / 1.5**. Headings are bold, tight (negative letter-spacing) and
use `clamp()` where they're large. Numbers in tables, amounts, counts and
timers use tabular figures (`.num` / `font-variant-numeric: tabular-nums`).

| Role | Size | Weight | Letter-spacing | Class / where |
| ---- | ---- | ------ | -------------- | ------------- |
| Login title | `clamp(30px, 5vw, 38px)` | 800 | -.035em | `.login-card h1` |
| Page title | `clamp(26px, 3.4vw, 34px)` | 800 | -.03em | `.page-head h1` |
| Document title | `clamp(22px, 3vw, 32px)` | 800 | -.025em | the shareable document |
| Empty-state title | 21px | 800 | -.02em | `.empty h2` |
| Dialog title | 20px | 800 | -.02em | `.modal-head h2` |
| Brand name (top bar) | 20px (18 on phones) | 800 | -.03em | `.brand-name` |
| Card / section title | 16-17px | 700-800 | -.01em | `.card h2`, `.item h3`, `.rcard h3` |
| Body | 15px | 400 | 0 | |
| Buttons | 14px (13 small, 15.5 large) | 700 | 0 | `.btn` |
| Meta, hints, secondary | 13-13.5px | 400-600 | 0 | `.hint`, `.item-meta`, `.set-sub` |
| Badges, small notes | 12-12.5px | 700 | 0 | `.badge` |
| Section label | 11-12px, UPPERCASE | 800 | .06em (up to .16em for document kickers) | `.subhead`, `dt` |
| Inputs | **16px** | 400 | 0 | so iOS doesn't zoom on focus |

Line length: keep paragraphs under about 42ch in empty states and dialogs, 34ch
on the login card. Don't use italics except for placeholders and "Not specified".
Weights: 400 body, 600 for emphasized meta, 700 for labels and buttons, 800 for
titles and section labels. Never 300.

## Spacing

There's no numeric spacing scale; the systems use a small set of recurring values:

- **4 / 6 / 8 px** inside controls (icon-to-label gap 6-8, chip gaps 6).
- **10 / 12 / 14 px** between related items (card list gap 10, grid gap 16,
  field gap 6, stack gap 14).
- **18-22 px** card padding (`.card-pad` 18×20, `.set-card` 20×22, dialog 24).
- **26-34 px** between page sections; 28 px top padding on page headers.
- **96-120 px** bottom padding on `main`, so the last item clears toasts and phone bars.

## Page structure

```
<body>
  <a class="skip">            skip link
  <div class="bg">            the single top glow
  <header class="topbar">     sticky, 60px (56 on phones), blurred, 1px bottom line
    .brand (mark 34px + name 20/800 + optional .env badge)
    .top-right (override badge · nav or icon buttons · session pill · avatar · settings)
  <main id="main">            max-width var(--maxw) 1200px (side-by-side workspace up to 1600px), 16px gutter
    banners (.banner.callout: ad blocker, setup needed, resume draft)
    <section class="view" data-view="…">   one visible at a time
  <div class="toasts">        bottom center
  <dialog class="modal">      sheets and confirmations
```

### Widths

| Content | Max width |
| ------- | --------- |
| Page (top bar and every view) | 1200px (`--maxw`). Never change `--maxw` in a tool: the top bar is sized from it, so a wider value makes that tool's top bar wider than the others'. |
| Side-by-side workspace (≥1280px only) | up to 1600px, set on that view's `main` only (`main:has(.workspace.active) { max-width: 1600px; }`). The one view allowed past 1200px, because the destination table needs the room; the top bar stays at 1200px. |
| A single task (upload box, compose) | 820px (`.mid`) |
| Settings | 720px (`.settings`), **left-aligned** under the brand, never centered |
| A single column of work items | 760px (`.narrow`) |
| Big loader card | 540px |
| Login card | 440px |
| Dialog | 520px (`.modal.wide` 640px); a paired sheet (`.modal.pair`) up to 1120px: form 500px + row document |
| Record + side panel | `minmax(0, 1fr) 320px`, 28px gap (`.split`) |
| Card grid | `repeat(auto-fill, minmax(290px, 1fr))`, 16px gap (`.grid`) |

### Navigation

- **Every tool has the pill nav** in the top bar (`.nav`): one link per main
  destination (1 to 4, active item ink-filled, a count badge for the main list),
  and **the Settings gear is always the last item inside it** (`a.nav-icon`,
  `aria-label="Settings"`). Never a separate gear button outside the nav.
  Fetch: New brief · All briefs · gear. Polaris: Data Audit · gear.
  Destinations that need a login are hidden while logged out; the gear stays.
- **A workspace with several lists of work** adds a sticky tab strip *under*
  the top bar (`.tabs`, active tab is brand-soft with a brand count), inside
  that nav destination. Polaris's Data Audit: Briefs · PARs · Invoices · ANDON
  · Audit. On ≥1280px the list and its destination table may sit side by side,
  each scrolling on its own, so a pushed item can be seen landing; this view alone
  may grow to 1600px (see Widths) while the top bar stays at 1200px. Below
  1280px there's no room for the table: show the list alone, with no tab for it. The strip is `--tabs-h` (50px) tall; a sticky table
  header under it sits at `calc(var(--topbar) + 8px + var(--tabs-h) + 6px)`,
  never a hard-coded number. Tabs are links with `aria-current="page"`.
- The brand (mark + name) links home. On ≤420px the name hides; the mark carries the brand.
- A **Back** link (`.back`) belongs on a *detail* view (one record), naming
  where it goes ("All briefs"). Settings has **no** Back link: it is a nav
  destination, and the nav is the way back.

### Breakpoints

| Width | What changes |
| ----- | ------------ |
| ≥1280px | Optional side-by-side workspace panes |
| ≤1024px | `.split` side panel stacks under the content |
| ≤720px | Tables become stacked rows with `data-label`s |
| ≤640px | Top bar 56px; dialogs become bottom sheets with full-width buttons; page tools go full width; a document view may move its main actions to a fixed bottom bar |
| ≤560px | Tab strips scroll sideways (the page never does) |
| ≤420px | Brand name hides; session pill hides; long button labels swap to `.label-short` |
| `(hover: none)` | ⋯ buttons and drag handles show at 45-70% opacity; no hover transforms |

Always check 375px wide: no horizontal scroll, nothing cut off, tap targets ≥32px.
