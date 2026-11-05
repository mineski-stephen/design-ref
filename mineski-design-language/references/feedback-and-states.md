# Feedback and states

The person must never wonder "did that work?". Every click changes something
on screen within 100 ms, and every result says what happened.

## The feedback ladder (pick the lightest that's clear)

| Situation | Feedback |
| --------- | -------- |
| Copied something | `popBadge(btn, "Copied!")` on the button, or a 2.2 s success toast "Copied 2026TEG-P0155." for an identifier |
| Toggled a local choice (chip, theme) | The control's own state change. Nothing else |
| A quick backend action (mark Done, Ignore) | **Optimistic** change first, then a success toast with **Undo**; roll back + error toast if the backend refuses |
| A write that takes a moment (save, push, delete) | `busy(btn, true, "Saving…")` (spinner + label), then a toast saying what was confirmed; land on the result and `flash()` it |
| Many writes reviewed one after another (an inbox of pushes) | **A push queue** (`patterns.md`): the sheet closes at once, the item leaves its list, the queue's count goes up; no toast per success, the peek's row ticks and slides out instead; one sticky toast only for what needs a look |
| A long task (extraction, full table load) | A staged loader (below) |
| Something broke | A toast or callout that says what happened **and** what to do, with the button for it |

## Toasts

`toast(message, { type, detail, action, onAction, link, timeout })` from ui.js.

| Type | Icon | Stays | Use |
| ---- | ---- | ----- | --- |
| `success` | check (green) | 4.5 s; **8 s if it has an action** (Undo, View) | Something finished |
| `info` | info | 4.5 s | Neutral news ("Cancelled. Your text is still here.") |
| `warn` | alert (amber) | **until dismissed** | Done, but check something ("Check these in Lark: …") |
| `error` | alert, red background | **until dismissed** | Failed; always with what to do and usually "Try again" |

- Bottom center, max 3 stacked (oldest drops), dismiss ×, `role="status"`
  (`alert` for errors). Inside an open dialog they move to the top of it.
- **Message**: one sentence, past tense, names the thing: "Pushed
  2026TEG-P0155 to the Universe.", "“Q3 deck” moved to Done.".
- **Detail**: what was verified or what to do: "All 15 fields checked in
  Lark.", "Log in again, then push it.".
- **Action**: one verb: Undo, View, Try again, Log in again. **Link**: "Open in Lark".
- Light mode: dark ink toast. Dark mode: a raised surface (`--surface-3`) so it
  stands out from cards. Errors use a deep red background in both.

## Busy, done and disabled buttons

- While a request runs the button is disabled, shows a spinner in place of its
  icon and a present-participle label: "Saving…", "Deleting…", "Pushing…",
  "Logging you in…". Restore the label after.
- Don't disable the primary button without saying why nearby (a hint such as
  "Paste a message to get started.").
- A sheet's Cancel is disabled while its action runs; the backdrop and Escape
  don't close it.

## Optimistic updates with rollback

```js
x.done = true; render();                       // 1. change the UI now
try { await api.setDone(x.id, true);           // 2. tell the backend
      toast("“X” moved to Done.", { type: "success", action: "Undo", onAction: () => setDone(x, false) }); }
catch (e) { x.done = false; render();           // 3. roll back and say why
      toast("Couldn't update “X”.", { type: "error", detail: describe(e), action: "Try again", onAction: … }); }
```

A card leaving a list folds away (`collapse(el)`) so the ones below slide up;
a card coming back (Undo) enters (`.is-entering`) and is highlighted (`flash()`).
Keep a `working` set so a card with a write in flight is dimmed (`.is-working`)
and can't be clicked twice.

## Highlight where things land

After a save, navigate to where the item now lives, scroll it into view and
flash it (`.is-new`: a brand ring that fades over about 3 s; table rows get a
brand-soft background that fades). "You land on All briefs, with your new brief highlighted."

## Waiting

**Short (under ~1 s)**: nothing, or a spinner in the button.

**Loading a list**: skeletons on the first load; afterwards show the cached
list instantly and refresh quietly ("Refreshing…" in the status line, the
refresh icon spins). Say when it was updated ("Updated 4:44 PM").

**Multi-step load**: `.loader` with real stages, each a dot → spinner → green
check, with real counts ("300 of 812"). Title names what's happening ("Reading the tables…").

**The long task** (`.loader.big`, its own view):
- The title names the current stage ("Reading the brief…"), the sub-line gives
  an honest estimate ("Usually about 5 seconds."). An estimate may self-calibrate
  from past runs in this browser.
- When the estimate is used up: "Still working. Complex briefs take a little
  longer…". Never reset, loop or show 99%.
- Real upload progress if there's an upload.
- **Cancel** always; cancelling returns to the input with everything kept and
  says so. Warn before closing the tab mid-task (`beforeunload`).
- On error the loader turns into the error: red icon, the message, and buttons
  ("Try again" primary, "Open Settings" if it's a setup problem, "Back to my files").
  One automatic retry is fine for transient errors, shown with a visible countdown.
- Tool personality is welcome here: Fetch's loader is the Fetch dog running.

**A sleeping service (cold start)**: start waking it on page load. If it's
still asleep after about 1.2 s, show "Waking up the connection…" with "It sleeps
when nobody's using it. This can take up to a minute." and a spinner. **No
countdown.** Retry reads with backoff for about 3 minutes, then say
"Unreachable (no answer for 3 minutes)" with Try again.

**Ad blocker**: two network failures in under 600 ms while online → stop
retrying and show the red banner naming the host to allow, with Reload.

## Errors

- Turn every failure into one plain sentence (a `describe(err)` function per
  tool, mapping backend codes): what happened + what to do. Never a raw code
  alone; add the code in brackets at the end only when it helps support.
- Put the fix next to the message: "Open Settings", "Log in again", "Go to the
  brief", "Open in Lark", "Try again".
- Where it appears: in the dialog that failed (`.form-error`, dialog stays
  open), in the list (`.callout-err` with Try again), as an error toast for
  background actions, or as the loader's error state.
- Configuration problems (a renamed Lark column) switch off only the affected
  actions and list exactly what doesn't match.

## Empty and "nothing to do"

- Nothing yet: `.empty` with art, a title ("No briefs yet"), one sentence
  ("Extract your first brief and save it. It'll show up here for the whole
  team.") and the primary action.
- Nothing matches: "No open briefs match “acme”."
- All done: "Every brief is in the Universe. Nice work!".
- Under a filtered list, what's not shown and why: "Not shown: 233 already in
  the Universe · 24 ignored."

## Destructive actions

| Kind | Example | Pattern |
| ---- | ------- | ------- |
| Reversible | Mark Done, Ignore, Discard draft | One click, optimistic, toast with Undo (8 s) |
| Writes to a shared table | Save, Push, Update a row | Confirm sheet showing what will be written; no Undo needed |
| Permanent | Delete a record from Lark | `confirmDanger()`: two steps |

`confirmDanger()` behavior: step 1 "Delete “Title”?" + one sentence of
consequence + the safer alternative ("Mark it Done instead if you might need
it again.") + a summary list of the item; button "Delete…". Step 2 "Are you
absolutely sure?" + "“Title” will be permanently deleted. This cannot be
undone."; button "Yes, delete permanently". Focus on Cancel each step; the
confirm button locks for 900 ms each step; red only here. Afterwards a success
toast "Deleted “Title”." and the item leaves the list.

## Sessions (Lark login)

- Top bar: the time left on the login ("1h 42m"), amber under 10 minutes.
- At 5 minutes left: a warn toast "Your login ends at 4:30 PM." with "Log in again".
- Don't start a write with under a minute left (or a long task with under 2):
  "Your login is about to end, so this wasn't sent." + Log in again.
- When it ends: the login screen with "Your login ended after about 2 hours.
  Log in again to keep going.", and after login return to the same route with
  drafts intact.

## Drafts

Autosave the work in progress locally (typed text in `sessionStorage`, the
draft document in `localStorage`). Next visit: a banner "You have an unsaved
brief: **Title**" with "Open it" and "Discard" (Discard has Undo). Unsaved
edits to a saved record are flagged on its card ("• unsaved edits").
