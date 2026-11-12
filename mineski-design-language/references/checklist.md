# Review checklist

Run this before calling a page done. Check in **light and dark**, at **375px
and desktop**, and with the **keyboard only**.

## Identity and tokens
- [ ] Loads `theme.css` then `mineski-base.css`; `app.css` is short and uses tokens only (search it for `#` and `rgb(`).
- [ ] Brand hue is registered in `brand-and-identity.md` and not used by another tool; not red or green.
- [ ] `make_theme.py --report` passes with no FAIL.
- [ ] Plus Jakarta Sans (the family font) in `--font`, loaded with the exact link from `typography-and-layout.md`.
- [ ] Icon follows the recipe; favicon, 180 and 512 PNGs, manifest, `theme-color` per scheme; title "Name · Mineski".
- [ ] Only icons from `icons.js` (or new ones in the same 24px / 2px round style).

## Layout and hierarchy
- [ ] The landing screen is the task; no hero, chips, eyebrows or filler copy.
- [ ] One primary button per view; repeated item actions are tonal.
- [ ] Hash routes; Back works; reload lands in the same place; title updates per view.
- [ ] Widths and breakpoints as in `typography-and-layout.md`; no horizontal scroll at 375px.
- [ ] One hero card per view, nothing stacked directly under it; no ghost button alone at the start of a row.
- [ ] A side panel taller than the window can be scrolled to its end without scrolling the whole page down.

## Family consistency (compare with Fetch at the same window width)
Open this tool and Fetch side by side at 1600px and at 375px. Small mismatches
here are what make tools feel like strangers.
- [ ] The top bar spans the same 1200px: the brand's left edge and the avatar's right edge line up with Fetch's. `--maxw` is not overridden; only a side-by-side workspace (≥1280px) widens its own `main`, up to 1600px.
- [ ] Top-right order: override badge · pill nav (destinations, then the gear inside it) · session pill · avatar. No separate gear button.
- [ ] Page titles and the Settings column start at the same x as Fetch's (left-aligned, not centered); Settings has no Back link.
- [ ] Settings cards in order: Account · Appearance · tool-specific · Connections · This browser.
- [ ] "Log out" is a small ghost button with the `logout` icon; "Log in again" a small plain button.
- [ ] Connection rows: dot · name + "State · host" · a plain `.btn-sm` fix-it button.
- [ ] Times from `fmt.time` ("3:54 PM"), durations from `fmt.duration` ("1h 59m", "45m"); no hand-written formatters.
- [ ] The same label for the same thing ("Log in again", "Wake up", "Refresh", "Clear local data", "Saved in this browser only.").
- [ ] The same icon for the same action in every tool (gear, clock, logout, external, refresh).
- [ ] Shared rules live in `mineski-base.css`, not copied into one tool's `app.css`.
- [ ] Rows with an icon (file lists, chips, menu items) start flush left: icon · text (grows) · actions on the right. Style the text by class (`.file-name`), never with a bare `li span` rule: icons are `<span class="i">` too and would stretch.

## Copy
- [ ] Labels say what happens; no "Submit" / "OK".
- [ ] No em-dashes anywhere, including generated output.
- [ ] Backend option labels used exactly.
- [ ] Every error says what happened and what to do, with a button.
- [ ] No "AI" labels; pre-filled choices explained with `Note:`.
- [ ] Dates "Oct 14, 2026", money with 2 decimals, tabular figures in tables.

## Feedback
- [ ] Every click answers within 100 ms (busy label, toast, badge, optimistic change).
- [ ] Reversible actions have Undo; success fades, errors and warnings stay.
- [ ] Writes show what will be written first, then what was confirmed. A sheet that writes to a row shows the row beside the form (`components.md`, Dialogs), not a "Will be written" list.
- [ ] No captions for what the screen already shows (`copy-and-voice.md` rule 3): read every sentence and delete the ones a person wouldn't miss.
- [ ] A list worked through item by item uses the push queue (`patterns.md`): Push closes the sheet at once, the next item gets the keyboard, failures collect in one toast and on the queue page.
- [ ] New or saved items are highlighted where they land.
- [ ] Loaders are staged and honest; "Still working…" after the estimate; no countdown for wake-ups; Cancel keeps input.
- [ ] Spinners turn smoothly (-90° → 270°).
- [ ] Permanent delete: two steps, focus on Cancel, 900 ms lock, safer alternative offered.
- [ ] Empty, no-match and all-done states are specific; filtered lists say what's not shown.

## Resilience
- [ ] Works with zero setup; no secrets in the page or repo.
- [ ] Styles and modules load with `?v=` (import map lists every module); the boot watchdog is in place.
- [ ] `css/mineski-base.css`, `js/ui.js` and `js/icons.js` are byte-identical to the skill's `assets/` (no per-tool edits).
- [ ] Services woken on load; reads retried during cold start; ad blockers detected and explained.
- [ ] Drafts autosaved and resumable; tab close warns mid-task; old data normalized.
- [ ] Storage wrapped in try/catch; page works in a private window.
- [ ] Dev overrides only on localhost and visible while active; "Test copy" badge when not live.
- [ ] Session time shown, warned at 5 minutes, writes refused under 1 minute, return to the same route after login.

## Accessibility and devices
- [ ] Visible focus ring everywhere (3:1); everything reachable and operable by keyboard.
- [ ] Dialogs are `<dialog>` with focus on the safe choice; Escape closes; toasts usable while a dialog is open.
- [ ] Menus: arrows, Escape, close on outside click / scroll / resize / navigation.
- [ ] No interactive element nested inside another (no button inside a link).
- [ ] Every `id` in `index.html` is used once (`npm run check:shell` checks): a label, heading and field sharing an id silently breaks the field.
- [ ] Back links are `<a class="back">` and only navigate; nothing that discards work looks like Back.
- [ ] At 375px with every nav link showing (logged in, a record open), the avatar is still on screen.
- [ ] Icon-only buttons have `aria-label` and `title`; decorative icons are `aria-hidden`.
- [ ] Inputs, selects and API-key fields 16px on phones; tap targets ≥32px; hover-only affordances partly visible on touch.
- [ ] Choice chips and segmented controls: `role="radiogroup"` with `radioKeys()` (arrow keys work).
- [ ] AA contrast in both themes, including toasts, menus, badges, disabled hints.
- [ ] Reduced motion: no movement except slow spinners; confetti skipped.
- [ ] Print / PDF output is light and contains only the content, and Ctrl+P gives the same result as the page's own button.

## Hand-over
- [ ] README for the team, including a troubleshooting table of real messages.
- [ ] `CHANGELOG.md` logs the release, and the top bar shows the same `APP.version` (`.brand-ver`).
- [ ] `.claude/launch.json` runs `tools/serve.py` on the tool's registered `127.0.0.1` port.
- [ ] The backend passes the `mineski-systems-design` checklist (section 12): login, safe writes, services, storage, tests.
