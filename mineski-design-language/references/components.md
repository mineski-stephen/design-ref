# Components

Every component lives in `assets/mineski-base.css`; behavior helpers live in
`assets/ui.js`. See them all rendered in `examples/showcase.html`. Icons:
`<span class="i" data-icon="name" aria-hidden="true"></span>` then `fillIcons()`
(or `ic("name")` in JS). Text built in JS goes through `h()`, never `innerHTML`.

---

## Buttons

```html
<button type="button" class="btn btn-primary"><span class="i" data-icon="save" aria-hidden="true"></span> <span class="label">Save to Lark Base</span></button>
<button type="button" class="btn">Download PDF</button>
<button type="button" class="btn btn-tonal">Push</button>
<button type="button" class="btn btn-ghost">Cancel</button>
<button type="button" class="btn btn-danger"><span class="label">Delete…</span></button>
```

| Variant | Use | Rule |
| ------- | --- | ---- |
| `.btn-primary` | The one main action of the view | **One per view.** Brand fill, brand shadow |
| `.btn` (default) | Secondary actions | White/surface with a line border |
| `.btn-tonal` | The repeated main action on many list items (Polaris "Push") | Avoids a wall of brand fills |
| `.btn-ghost` | Cancel, Ignore, Discard, low-emphasis actions | No border until hover |
| `.btn-danger` | Only the confirm button in a delete dialog | Never on a page or card |
| `.btn-sm` / `.btn-lg` | Toolbars & rows / the landing CTA and login | 32px / 40px / 48px tall |
| `.btn-block` | Stacked actions in a side panel | Left-aligned icon + label |
| `.icon-btn` | Refresh, Open in Lark, Settings | Needs `aria-label` and `title`. `.icon-sm`, `.plain` |
| `.linkish` | An inline text action ("Open Settings", "Try again") | |

States (set from JS):

- **Busy**: `busy(btn, true, "Saving…")` → disabled, spinner replaces the icon
  (a button without an icon gets a spinner in front of its label), label says
  what's happening. Requires the text in `<span class="label">`.
- **Done**: `flashDone(btn, "Saved")` → green for 2 s, then restores.
- **Copied**: `popBadge(btn, "Copied!")` → a green bubble pops above the button
  (add `class="has-badge"`).
- **Disabled**: 50% opacity, `not-allowed`. If the reason isn't obvious, put
  it in the `title` (on a wrapper span, since disabled buttons don't show
  tooltips) or a hint next to it.
- **Short labels**: `<span class="label">Copy for group chat</span><span class="label-short">Copy</span>`
  swaps at ≤420px.

Labels are verbs that say what happens: "Save to Lark Base", "Copy for group
chat", "Push", "Log in with Lark", "Try again", "Open Settings", "Yes, delete
permanently". Never "Submit", "OK", "Process", "Go". Add "…" when the button
opens a further step ("Delete…").

## Fields

```html
<label class="field"><span>Client <em>(optional)</em></span>
  <input type="text" placeholder="e.g. Acme Gaming"></label>

<div class="field"><span class="field-label" id="reqLabel">Requirement type</span>
  <div class="chips" role="radiogroup" aria-labelledby="reqLabel">
    <button type="button" class="chip-opt" role="radio" aria-checked="true">RFP</button>
    <button type="button" class="chip-opt" role="radio" aria-checked="false">RFQ</button>
  </div>
  <p class="hint">Note: the brief asks for a proposal and a quotation.</p></div>

<label class="search"><span class="i" data-icon="search" aria-hidden="true"></span>
  <span class="sr-only">Search briefs</span><input type="search" placeholder="Search client, project…"></label>

<label class="select"><span class="sr-only">Sort</span><select>…</select></label>
```

- Labels sit above fields, 13px/700. Mark optional fields "(optional)" in
  `<em>`, never mark required ones with asterisks (most are required).
- Placeholders are examples ("e.g. INV-1680"), never the label.
- Invalid: `aria-invalid="true"` + a `<small>` that says how to fix it.
- **Choice chips** (`.chip-opt`) for 2-6 fixed options (radio or `aria-pressed`
  for multi). Use the backend's exact labels. A `<select>` for more. For a
  single choice use `role="radiogroup"` + `role="radio"` / `aria-checked` (never
  `aria-pressed` on a radio) and call `radioKeys(group)` once, so arrow keys,
  Home and End work and only the chosen chip is a tab stop.
- **Picker** (`.picker-box` + `.chip` + `.suggest`) for people and tags: chips
  with ×, typeahead list with frequent choices first (`.suggest-head` group labels).
- **Segmented control** (`.seg`, `role="radiogroup"`) for 2-4 mutually
  exclusive modes such as Appearance.
- Secrets (API keys): `type="password"`, `.mono`, a show/hide `.icon-btn` (`eye`).
- Dates: written "Oct 14, 2026". Let people type a date or pick one; store
  what the backend expects.

## Cards and surfaces

```html
<section class="card card-pad"> <h2>Next steps</h2> … </section>
<div class="card hero-card"> the main task (upload box, compose) </div>
```

- `.card`: surface, 1px line, 20px radius, small shadow. The default container.
- `.hero-card`: the single task card on a landing screen (28px radius, medium
  shadow, no border).
- `.card-head` (title + right-aligned pill or button), `.card-sub` for one line of explanation.
- Don't nest cards. Inside a card use `.summary-list`, `--surface-2` insets, or dividers.

## Badges, pills, identifiers

```html
<span class="badge badge-ok">Won</span>
<span class="badge badge-warn"><span class="i" data-icon="clock"></span>Due Oct 16 · in 2 days</span>
<span class="pill is-ok">Using the shared key</span>
<button class="code">2026TEG-P0155</button>      <!-- copyable(code, { cls: "code", label: "project code" }) -->
<button class="copy">202608240082</button>       <!-- copyable(no, { label: "request number" }) -->
```

- `.badge` + `badge-brand | ok | warn | err | info | violet | muted | urgent`
  for status and due dates (mapping in `tokens-and-color.md`).
- `.pill` (+ `is-ok | is-warn | is-err`) for a setting's state, top-right of a settings card.
- `.count` for numbers in nav and tabs (hidden when empty).
- `.env` ("Test copy") and `.override-badge` ("Proxy override") in the top bar.
- Identifiers are **click to copy** everywhere via `copyable()`, with a toast
  "Copied 2026TEG-P0155.".

## Callouts and banners

```html
<div class="callout callout-err" role="alert"><span class="i" data-icon="alert"></span>
  <div><p><b>Fetch can't reach its extraction service.</b> An ad blocker … is probably blocking it.</p>
       <p>Allow <code>host</code> in your blocker, then reload.</p></div>
  <button type="button" class="btn btn-sm">Reload</button></div>

<a class="banner callout callout-warn" href="#/settings/key"><span class="i" data-icon="alert"></span>
  <div><b>Setup needed:</b> add your Gemini API key to start extracting briefs.</div>
  <span class="go">Open Settings <span class="i" data-icon="arrowRight"></span></span></a>
```

- Inline messages in a view: `callout` (+ `-err | -warn | -info | -ok`).
  Bold lead-in sentence, then what to do, then the button that does it.
- `.banner` positions a callout at the top of `main` (820px wide) for
  page-level states: ad blocker (err), setup needed (warn, whole bar is a link),
  resume an unsaved draft (plain, with "Open it" primary + "Discard" ghost).
- `.notes` list inside a work item for per-item notes (warn tint) and blockers
  (`.is-plain`, with a "Go to …" link).
- `.form-error` inside a dialog for a failed submit (the dialog stays open).

## Lists of records

**Work items** (an inbox to act on), one column:

```html
<div class="cards">
  <article class="card item" data-id="…">
    <div class="item-head"><button class="code">2026TEG-P0155</button><span class="badge badge-ok">Approved</span><span class="item-date">Oct 14, 2026</span></div>
    <h3>Regional finals production</h3>
    <p class="item-meta"><b>PHP 1,250,000.00</b> · AM Ana R.</p>
    <ul class="notes"><li>Note: looks like "…", already in the Universe. If it's the same project, ignore this one.</li></ul>
    <div class="item-actions"><button class="btn btn-ghost">Ignore</button><button class="btn btn-tonal">Push</button></div>
  </article>
</div>
<p class="hidden-note">Not shown: 233 already in the Universe · 24 ignored.</p>
```

Actions sit bottom-right (full width, equal on phones). While a write is in
flight the card gets `.is-working`. A card that leaves folds away with
`collapse(el)`; one that comes back (Undo) gets `.is-entering` and `flash()`.

**Record cards** (a library to browse), a grid where the whole card opens the record:

```html
<div class="grid">
  <div class="rcard-wrap">
    <a class="rcard" href="#/items/ID" data-id="ID">
      <div class="rcard-top"><span class="badge badge-brand">New</span><span class="badge badge-warn">…</span></div>
      <h3>Title</h3><p class="rcard-sub">Client</p><p class="rcard-body">Summary…</p>
      <dl class="facts"><div><dt><span class="i" data-icon="calendar"></span>Event</dt><dd>Nov 2–4</dd></div>…</dl>
      <div class="rcard-foot">Filed Oct 14, 2026 · Stephen L.</div>
    </a>
    <button type="button" class="more-btn" aria-label="More actions for Title" aria-haspopup="menu"><span class="i" data-icon="dots"></span></button>
  </div>
</div>
<details class="done-group"><summary><span class="i" data-icon="doneCircle"></span> Done <span class="done-count">3</span></summary><div class="grid">…</div></details>
```

The ⋯ button sits **beside** the link (never inside `<a>`); right-click on the
wrap opens the same `openMenu()`. Titles clamp to 2 lines, body to 3. First
render staggers in (`.is-entering` with `--i`); re-renders don't animate.
Skeletons (`.rcard.is-skeleton` with `.sk-*`) show the shape while the first load runs.

**Status line** under the header: `.list-status` ("Updated 4:44 PM", "Refreshing…",
or an error with "Try again").

## Tables

```html
<div class="tbl-wrap"><table class="tbl">
  <thead><tr><th><button class="sort-btn">Project <span class="i" data-icon="sortDown"></span></button></th><th class="num">Amount</th></tr></thead>
  <tbody><tr><td class="strong" data-label="">…</td><td class="num" data-label="Amount">1,250,000.00</td></tr></tbody>
</table></div>
```

Sticky header on `--surface-2`, 13.5px rows, numbers right-aligned in tabular
figures, empty cells show a faded "None" or "-". A row that just changed gets
`.is-new` (brand-soft fade). Group rows with a collapsible header and a sum when
the table is long. Below 720px rows stack into mini-cards: give each cell a
`data-label`. An "Open in Lark" `.icon-btn` sits in the table header tools.

## Navigation

See `typography-and-layout.md`. Markup: `.nav > a[aria-current="page"]`, or
`.tabs > a.tab[aria-current="page"]` with a `.count`. Tabs that change the route
are plain links with `aria-current="page"` (no `role="tablist"`/`"tab"`); reserve
`role="tab"` + `aria-selected` for real in-page tab panels with arrow-key
support. Both are styled the same. Anything sticky under the tab strip offsets
by `calc(var(--topbar) + 8px + var(--tabs-h))`.

## Dialogs (sheets)

Use native `<dialog class="modal">` with `showModal()`. Structure:
`.modal-form > .modal-head (.modal-icon?, h2, .modal-sub) + .modal-body + .form-error + .modal-actions`.

**A sheet that writes to a row: pair it with the row.** `<dialog class="modal pair">`
holds two cards side by side, tops aligned, each only as tall as its own content
(up to the screen): the form
(`.modal-form.pair-form`, 500px: only what needs a person) and the **row document**
(`.pair-doc.row-doc`: the destination row as it will be after the write). This
replaces any "Will be written" list. The row document is a filled-in form, not a
table: a kicker (table name, "· New row" for a create), the row's title, a meta
line (code · status), then every column as label-over-value in two columns
(`.doc-field`: an 11px uppercase label, the value in a `--surface-2` box like a
read-only input; long text spans both columns). Cells the write changes are
`--brand-soft` with the old value struck through (`del`); empty cells are empty
boxes, never "Blank"; a new row highlights nothing (there's nothing to compare).
The row's header stays put and its fields scroll in `.doc-body`, inset from the
card's edge so the scrollbar never crosses the rounded corners. A click on the
backdrop (or the gap between the cards) is Cancel, but only when the click also
started there, so a text selection dragged out of a field doesn't close it.
It re-renders on every change in the form. Lookups and formulas show what Lark
has, formatted like the column they look up (a new row has none yet, so they're
left out). Show only columns the tool actually read or writes, so nothing looks
blank just because it wasn't loaded. At ≤960px
it moves under the form's fields inside the one sheet (`.is-inline`), and at
≤480px the fields go to one column.

- `confirmSheet({...})` in ui.js builds a confirm-before-write sheet: icon,
  question title ("Save this brief to Lark?"), one sentence of consequence,
  a `.summary-list` or `.written` before/after body, Cancel (ghost, focused) +
  the action (primary, named for the action). Errors show in the sheet; it stays open.
- `confirmDanger({...})` is the two-step delete (see `feedback-and-states.md`).
- Close on Escape and backdrop click (unless busy), keeping what was typed, exactly like Cancel. On ≤640px dialogs become
  bottom sheets with full-width buttons.
- Closing a sheet from code (`dialog.close()`, e.g. when the login ends) makes
  `confirmSheet` / `confirmDanger` resolve `false` and remove themselves, so
  `document.querySelectorAll("dialog[open]").forEach((d) => d.close())` is safe.
- Toasts move inside an open dialog automatically (ui.js), because the page
  behind a modal can't be clicked.

## Menus

`openMenu(items, { anchor })` or `{ x, y }` for right-click (calling it again
for the same open anchor closes it, so the ⋯ button toggles). Items: icon +
label, a `"-"` separator, the destructive item last, red, with "…". Keyboard:
arrows, Home/End, Escape returns focus to the anchor. One menu at a time; closes
on outside click, scroll, resize and route change. A "More options" disclosure
in a side panel uses `<details class="card more">` with `.menu-item` buttons.

## Toasts

`toast(message, { type, detail, action, onAction, link, timeout })`. Details
and timings in `feedback-and-states.md`. The message is one short sentence
that says what happened; `detail` adds what was confirmed or what to do.

## Loading

- `.spinner` (inline, brand-tinted) for short waits and inside buttons.
- `.loader` + `.loader-title` + `.stages` for multi-step loads in a list
  (each stage: slot dot → spinner → green check, with "300 of 812" counts).
- `.loader.big` for the long task screen (art, title that names the current
  stage, an honest sub-line, stages, Cancel).
- Skeletons (`.sk`) for the first load of a list.

## Empty states

`.empty` (+ `.empty-art` with an icon, `h2`, one sentence, the primary action)
for "nothing yet"; `.empty.small` (one sentence) for "nothing matches" and
"all done". Be specific and kind: "No open briefs match 'acme'.", "Every brief
is in the Universe. Nice work!".

## Settings parts

`.settings > section.card.set-card` with `h2`, optional `.set-head` with a
`.pill`, `.set-sub`. Card order is fixed (see `patterns.md`).

- **Account**: `.account` with `.avatar`, name, "Logged in until 4:30 PM · 1h 42m
  left" (from `fmt.time` and `fmt.duration`), then `.account-actions`:
  `.btn.btn-sm` "Log in again" and `.btn.btn-sm.btn-ghost` "Log out" **with the
  `logout` icon** before the label. Logged out: one sentence on what logging in
  is for, "A login lasts about 2 hours.", and a primary "Log in with Lark".
- **Connections**: `.status-list > li` with a `.dot` (`is-ok | is-warn |
  is-err`), `.status-text` (b + span: state · host) and a fix-it
  **`.btn.btn-sm`** ("Wake up", "Try again", "Refresh"). Plain, not tonal or
  ghost: tonal is reserved for a repeated action on list items.
- **Advanced**: `<details class="advanced">` (localhost only).
- **This browser**: a ghost "Clear local data" with one sentence on what is and isn't cleared.

## Top bar parts

Left: `.brand` (mark + name + `.brand-ver` + `.env`). `.brand-ver` is the
running version ("v1.0.0", muted, filled from `APP.version`); it stays beside the
mark on small phones, where the name hides. Right (`.top-right`), always in this
order: `.override-badge` · `.nav` (destinations, then the gear `.nav-icon`) ·
`.session-pill` (clock + `fmt.duration`, e.g. "1h 42m", `.is-low` amber under 10
minutes, links to Settings, `aria-label` "Logged in for 1h 42m more, until 4:30
PM") · `.me` avatar (Lark picture or `.avatar-initials`, links to Settings).
The gear is never a separate `.icon-btn`, and the avatar is always last.

## The shareable document (when the output is a document)

A white "paper" (always light, even in dark mode) with: a 8px brand band on
top, an uppercase kicker, a large title, a meta line with brand-colored `·`
separators, an optional TL;DR on brand-soft with a 4px brand left border,
sections headed by small uppercase titles with a 40px brand underline, bullet
markers in the brand, label/value tables on a faint label column, and a quiet
footer. Text is editable in place (`.ed`: brand-tinted hover, brand ring on
focus, italic placeholder when empty). See `templates/starter/css/app.css` `.doc`
for the themed version and Fetch's `.paper` for the always-white one.
