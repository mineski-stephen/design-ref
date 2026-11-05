# Page patterns

Recipes for the screens these tools are made of. `templates/starter/`
implements compose → long task → record → list → settings; Polaris is the
reference for the inbox + sheet + table pattern.

## Choosing the shape of a tool

| The job is… | Shape | Example |
| ----------- | ----- | ------- |
| Turn an input into an output to review and share | **Task landing → long task → record view**, plus a list of saved records | Fetch |
| Work through a queue of things to do | **Inbox of work items → confirm sheet**, with the destination table beside it | Polaris |
| Browse and look things up | **Record list (grid or table) → record view** | Fetch "All briefs" |
| Change a few options | A **Settings**-style page of cards | every tool |

Routes: `#/` (the task or the inbox), `#/items`, `#/items/:id`, `#/settings`.
Settings opens even when logged out.

## Login (Lark)

Centered card, 440px: the app icon at 88px (20px radius, medium shadow), the
tool name as h1, one-line lede, "Log in with Lark" (`.btn-primary.btn-lg`), a
hint about session length, and callouts for problems (login ended = warn; this
address isn't a registered redirect = err, checked on load). Wake the services
while this screen is showing. After login, a busy view "Logging you in…", then
return to the route that was asked for.

## Task landing (the first screen)

- No page title visible (an `sr-only` h1), at most one muted lede line
  saying what goes in ("PDF, Word, PowerPoint, Excel, screenshots, e-mails - or
  just paste the text.").
- Banners above the task when they apply: ad blocker, setup needed, resume draft.
- The task in one `.hero-card` (820px): drop zone + file chips + textarea, or a form.
  Paste (Ctrl+V) and drag-and-drop work anywhere on the page; a full-card
  "Release to add" overlay while dragging.
- Below it a bar: a live hint on the left ("3 files · 120 words. Ready when you
  are."), the primary button on the right ("Extract brief", large, with an icon),
  disabled until there's input. On phones the bar stacks, button full width.

## Long task

Its own view with `.loader.big`: tool art (personality welcome), the current
stage as the title, an honest estimate line, the stage list, Cancel. On
completion go straight to the result. On error the same card shows the error
and its fixes. See `feedback-and-states.md`.

## Record view (document + side panel)

- Top: `.back` link ("New brief" or "All briefs", whichever they came from) and
  a muted meta line on the right ("Not saved yet" / "Filed Oct 14, 2026 by …").
- An optional warn callout for things to check.
- `.split`: the document (the thing that gets shared, editable in place) and a
  320px sticky side panel of cards:
  1. **Actions card**: the primary action (Save to Lark Base / Save changes),
     then secondary block buttons (Copy for group chat, Download PDF).
  2. **Classification cards** for backend-only fields as choice chips, each with
     a `Note:` reason when pre-filled.
  3. Lists the person may add to (next steps, attachments) with a small add form.
  4. `<details class="card more">` "More options" for rare exports and resets
     ("Copy as Markdown", "Undo all my edits", "Open the Lark table").
  5. Optionally a preview of the export (the group-chat bubble).
- ≤1024px the panel stacks below; ≤640px the Actions card may become a fixed
  bottom bar with short labels (Save / Copy / PDF), and toasts sit above it.

## Record list

Header (`.page-head`): h1 + a muted source line ("Fetched from Lark Base"),
tools on the right: search, sort `<select>` when order matters, refresh
`.icon-btn`, "Open in Lark" `.icon-btn`. A `.list-status` line. Then the
grid (`.rcard`) or table (`.tbl`); a collapsed Done group under it. Skeletons
on first load; cached list shown instantly afterwards. Cards: ⋯ + right-click
menu (Open · Mark as Done · Delete…).

## Inbox + confirm sheet (a work queue)

- A sticky `.tabs` strip, one tab per kind of work, each with a count.
- Per tab: search + refresh, "Updated 4:44 PM", a callout if pushing is off
  (and why), the staged loader on first load, the `.cards` list of `.item`s,
  an empty note, and "Not shown: …".
- Each item: identifier chip (copyable) + status badge + date; title; one meta
  line (amount in bold, people); notes and blockers; actions right-aligned:
  `Ignore` (ghost, Undo-able) and `Push` (tonal).
- **Push** opens a paired sheet (`components.md`, Dialogs): the few fields that
  need a person on the left (pickers with frequent choices first, chips for
  VAT), the destination row on the right, updating live, and the action named on
  the button. The sheet keeps what was typed if cancelled.
- After a push: the sheet closes at once, the card folds away (`collapse`),
  the next card's main button takes the keyboard, and the write goes to the
  **push queue** (below). A tool without a queue (one write at a time) instead
  waits in the sheet, toasts what Lark confirmed and highlights the row in the table.
- The destination table sits beside the list only where there's room (≥1280px).
  Narrower screens show the list alone: no tab for the table.

## Push queue (many writes, reviewed one after another)

When people work down a long list (hundreds of audit cards), waiting for each
write blocks them. The queue takes the waiting instead. Polaris is the reference.

- **The Queue nav item** sits after the main destination in the pill nav
  (`Data Audit · Queue · gear`), hidden when logged out. Its `.count` is what is
  still waiting; a second, red `.count.count-bad` shows what didn't go through.
  `aria-label` "Queue: 5 waiting, 1 failed".
- **The peek**: hovering (or keyboard-focusing) the Queue item shows a small
  popover (320px, `--surface`, `--shadow-md`, 100 ms delay, a hover bridge so it
  doesn't close on the way down) with the **next five** in run order: the one
  being sent first, with a spinner and its live status ("Uploading 40%"), then
  the waiting ones with a grey slot dot. When one lands, its row turns
  `--ok-soft` with a green check for about 450 ms, then `collapse()`s and the
  next slides up. Head: "5 waiting", with a "Paused" and a red "1 failed" badge
  when they apply; footer "+12 more" only when there are more. Status text only
  where the icon isn't enough (the running one's progress, "Failed"). Hidden
  when the queue is empty, and never on touch screens (`hover: none`): a tap
  opens the queue page.
- **The queue page** (`#/queue`, a nav destination, the inbox's 760px column):
  `h1` "Queue" with **Pause / Resume**, **Retry all N** and **Clear finished** as
  page tools, then **Failed** · **Waiting** · **Finished** as `.subhead` sections
  of the inbox's own `.card.item` cards (code chip, state badge, time; title; the
  action as meta; the reason or result; actions to the right of the title on
  ≥560px so a long queue stays short: **Remove** · **Edit** · **Retry** (tonal)
  on failed, **Remove** on waiting, **Open in Lark** on finished). Empty: "The
  queue is empty." No lede, no explanation of what a queue is.
- **Copy**: "5 waiting", "Failed", "Check in Lark", "It's in Lark.", "1 push
  didn't go through." (one sticky toast for all failures and warnings, replaced
  as it changes, with **Open queue**). Never a toast per success.
- Leaving the page with pushes waiting asks first (`beforeunload`).

## Settings

Order: **Account** (if there's a login) · **Appearance** (System / Light /
Dark) · tool-specific setup (Fetch's Gemini API key) · **Connections** (status
rows with fix-it buttons; Advanced on localhost only) · **This browser** (clear
local data). The shared cards come first and sit in the same place in every
tool, so people find them without looking.

Layout, the same in every tool: `<section class="view">` (no `.narrow`), a
`.page-head` with only `h1` "Settings" and the lede "Saved in this browser
only.", then the 720px `.settings` column, **left-aligned** with the brand. No
Back link (the gear in the nav shows Settings is open; the other nav items lead
back). Deep links to a card (`#/settings/key`) scroll to it and focus its field.

## Top bar contents by state

| State | Right side |
| ----- | ---------- |
| Logged out | (override badge) · nav with only the gear |
| Logged in | (`Test copy` env badge by the name) · (override badge) · nav (destinations + gear) · session pill · avatar |
| Phone ≤420px | brand mark · nav (compact) · avatar (session pill hides) |
