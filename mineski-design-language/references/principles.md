# Principles

Fourteen rules distilled from building Fetch and Polaris, including the
mistakes that were fixed along the way. Each has a **why**, so you can judge
edge cases instead of copying surface details.

The user: a busy BD, account-management, finance or operations colleague, not a
developer. They open the tool to get one job done, often between meetings,
sometimes on a phone, and paste the result into a Lark group chat or table.

---

## 1. One job per screen, and the job is obvious

- The landing screen **is** the task: Fetch opens on the upload box; Polaris
  opens on the inbox of things to push. No hero section, marketing copy, feature
  list, "How it works", eyebrow chips or decorative subtitles.
- Each view has **one primary action**, the only filled brand-color button.
  Secondary actions are outline (`.btn`), tonal (`.btn-tonal`) or quiet (`.btn-ghost`).
- Hash routes (`#/`, `#/items`, `#/items/:id`, `#/settings`) so Back works,
  views are linkable, and a reload lands in the same place. After login, return
  to the route the person asked for.

**Why:** chips, eyebrows, subtitles and helper texts were removed on request
several times. Each felt like decoration between the user and the task.
When in doubt, remove the text; if the screen stops being clear, put it back shorter.

## 2. Show exactly what will happen before it happens

- A write to a shared system (Lark Base, the Universe) goes through a
  **confirm sheet** that shows what will be written: a summary list of
  fields, or **before → after** for each changed cell (`.written`, "Was empty.").
- The confirm button repeats the action ("Save to Lark", "Push to the Universe"),
  never "OK" or "Confirm".
- Anything the person typed in a sheet is kept if they cancel and reopen it.

**Why:** these tools write into tables the whole company relies on. People
trust a tool that shows its work, and catch mistakes before they spread.

## 3. Verify, then say what was confirmed

- Re-read the destination just before a write; if someone else already did it,
  write nothing and say so ("Someone else already did this. The list refreshed.").
- Make creates idempotent (a `client_token`), so a retry can't make a duplicate.
- Read every write back and compare. The success toast says what was
  confirmed ("All 15 fields checked in Lark."), or lists what didn't land, with
  an "Open in Lark" link.

**Why:** "Saved" that turns out to be wrong is worse than an error. Polaris's
read-back caught real mismatches (option labels, rounding) that would otherwise
have gone unnoticed.

## 4. Copy: short, plain, human, consistent

See `copy-and-voice.md`. In short: write like a helpful colleague; labels say what
happens; no em-dashes anywhere (UI or generated output); the backend's own option
labels, exactly; errors say what happened **and** what to do, with a button for
it; never brand output as "AI".

## 5. Generated content is short, scannable and editable

- AI output is concise: bullets of about 12 words or fewer, one idea each, no
  filler. Enforce it in the prompt **and** the schema; don't rely on the UI to trim.
- Pre-fill or pre-select what the model detected and add a one-line reason
  prefixed with `Note:` when it helps the user check it.
- Show the result **as the final document** (what will be shared) and make it
  editable in place (`contenteditable="plaintext-only"`). No separate edit form.
- Lists reorder with visible drag handles that move the DOM in place. Never
  re-render the whole document (it flashes and loses scroll).
- Optional or sensitive sections are separate blocks with a show/hide toggle,
  and hidden sections are left out of every export.
- Backend-only data (next steps, attachments, classification) lives in side
  cards beside the document, not in it.
- Every export (PDF, chat text, Markdown, the Lark row) comes from **one model**,
  so they always agree.

## 6. Feedback: every action answers within 100 ms

Busy label on the button, a toast, a "Copied!" badge, or an optimistic list
change. Toasts carry **Undo** wherever reversal is possible. Success fades;
errors stay. New or just-saved items are highlighted where they land. Details in
`feedback-and-states.md`.

## 7. Waiting is honest, calm and never frozen

- Long tasks show **real stages** ticked off as they finish, and an estimate
  that is honest. When it runs out: "Still working. Complex briefs take a little
  longer…". Never loop back or show a fake 99%.
- Cold starts (sleeping Render services) show a spinner and a sentence ("This
  can take up to a minute"), **not** a seconds countdown: a countdown that hits
  zero and keeps going reads as broken.
- Spinners are perfectly smooth: one full even turn (`-90deg → 270deg`).
- Always offer Cancel; cancelling keeps the input ("Cancelled. Your files are still here.").
- Do work early: on page load wake sleeping services and prefetch the list, so
  they're ready by the time the person needs them.

## 8. Destructive actions are deliberate; everything else is reversible

- Reversible actions (mark Done, Ignore, archive) are **one click with Undo**.
- Permanent actions (delete from Lark) use a modal with **two confirmations**:
  the item's details ("Delete 'Title'?" with client and date filed), then "Are
  you absolutely sure?" with an explicit button ("Yes, delete permanently").
- Focus starts on Cancel; the confirm button is disabled for 900 ms after each
  step so a double-click can't skip a confirmation; the danger color appears
  only here. Suggest the safer alternative in the copy.

## 9. Lists of records help people decide and act

- A card shows exactly what's needed to decide whether to open or act on it:
  title, client, key dates, status, amount, identifiers.
- Search (and sort, when order matters) live in the page header.
- Finished items move to a collapsed **Done** section, never deleted; counts
  show only active items.
- Card actions are available by right-click **and** a visible ⋯ button
  (right-click alone is invisible and doesn't exist on touch). Menus support
  the keyboard and close on outside click, scroll, resize and navigation.
- Say what's hidden and why under a filtered list: "Not shown: 233 already in
  the Universe · 24 ignored".
- When an item is blocked, say why and link to the fix ("Push this project's
  brief first." → **Go to the brief**).
- Identifiers (project codes, request numbers) are click-to-copy everywhere.
- Empty states are friendly and specific ("No open briefs match 'x'.",
  "Every brief is in the Universe. Nice work!").

## 10. One visual language, several personalities

Shared: the font (Plus Jakarta Sans), tokens structure, components, radii,
shadows, spacing, type scale, motion, icons, copy, the top bar and Settings.
Per tool: one brand hue (with greys tinted toward it), one app icon, a name. Calm surfaces: cards on a barely
there background with a single soft glow; a busy or loud background was rejected.
See `tokens-and-color.md` and `brand-and-identity.md`.

## 11. Themes: Light, Dark and System

A segmented control in Settings, default System, saved per browser and applied
by an inline `<head>` script before CSS paints. Dark tokens are re-tuned, not
inverted, and defined twice. Check every component in both themes including
menus, modals, toasts; printed or PDF output stays light.

## 12. Settings are optional, explained and safe

- The tool works with **zero setup**. Shared credentials live on the server
  (Render env). A personal key is an opt-in override, and the UI says which is
  in use ("Using the shared key" / "Using your key").
- Settings show **live connection status** (Awake / Waking up… / Unreachable
  (reason); Connected · N rows) with a fix-it button beside each.
- Developer overrides (alternate service URLs) hide under "Advanced", only work
  on localhost, and show a red badge in the top bar while active, so a stale
  override can't silently trap someone.
- A "Test copy" badge in the top bar whenever the tool points at non-production data.
- Never put secrets in the page or the repo: the site is public.

## 13. Resilience is part of the UX

- **Never serve stale code**: load styles and scripts with a per-load `?v=` build
  query (and an import map for modules).
- **Detect ad blockers**: two instant network failures while online almost
  always mean a blocker. Say so plainly and name the host to allow. Ping `/`,
  not `/health` (filter lists block `onrender.com/health`).
- **Retry cold starts** quietly for about 3 minutes (reads only; never retry
  writes automatically) before saying a service is unreachable, with the reason in brackets.
- **Normalize old data** whenever it's opened, so records saved by older versions still render.
- **Keep unsaved work**: autosave drafts locally, offer "Resume your unsaved…"
  next visit, warn before closing the tab mid-task.
- **Sessions**: show the time left on the login in the top bar (amber in the
  last 10 minutes), warn 5 minutes before the end, refuse to start a write with
  under a minute left, and return to the same page after logging in again.
- Wrap every `localStorage` / `sessionStorage` call in try/catch; the page must work without them.

## 14. Accessible and comfortable on any device

- Visible `:focus-visible` ring (3 px, `--focus`, 3:1 against the background);
  every action reachable by keyboard; `<dialog>` with focus on the safe choice.
- AA contrast in both themes (the theme generator checks it).
- Inputs at 16 px so iOS doesn't zoom; touch targets at least 32 px, 40 px for
  main actions.
- Hover-only affordances (⋯ buttons, drag handles) are partly visible under
  `@media (hover: none)`.
- Responsive at 1280 / 1024 / 640 / 560 / 420 px with a 16 px gutter and no
  horizontal page scroll. Side panels stack under content; dialogs become
  bottom sheets on phones; long button labels swap to short ones.
- Respect `prefers-reduced-motion` (but keep spinners turning, slowly).
