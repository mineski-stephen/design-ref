# Copy and voice

Write like a helpful colleague sitting next to the person: short, plain,
specific, warm without being cute. The copy is part of the design; most of
what makes Fetch and Polaris feel related is how they talk.

## Rules

1. **Say what happens.** Buttons are verbs naming the result: "Save to Lark
   Base", "Copy for group chat", "Download PDF", "Push", "Log in with Lark",
   "Mark as Done", "Yes, delete permanently". Never "Submit", "OK", "Process",
   "Continue", "Go", "Click here".
2. **Short.** One idea per sentence. Cut "please", "successfully", "simply",
   "just", "in order to". If a screen is clear without a sentence, delete it.
3. **No captions for what the screen already shows.** A queue doesn't need a
   line saying it's a queue; an empty field doesn't need "Blank"; a highlighted
   change doesn't need "Was X. Edited here."; a list's purpose doesn't need a
   lede. Keep text that carries a fact the person can't see or work out by
   using the page: a limit ("PDF or image, up to 10 MB."), a reason something is
   off, what went wrong and what to do, a `Note:` about pre-filled data. Too many
   sentences is a failure of the design, not extra help.
4. **No em-dashes**, in the UI or in generated output. Use a hyphen, a
   colon, a full stop, or rewrite. ("Waking up the service. This can take up to a minute.")
5. **The team's own words, exactly.** Option labels, statuses and column names
   match the backend letter for letter: "VAT Inc." / "VAT Ex.", "RFP / RFQ /
   RFI", "For Invoicing", "Pending Invoice Request Approval", "Universe", "PAR",
   "ANDON", "BD", "AM". If Lark shows a value, the page shows the same words.
6. **Errors say what happened and what to do**, then offer the button:
   "Lark says your account can't open or edit this Base. Ask its owner for edit
   access." Never blame the person; never show a raw code alone.
7. **Don't label AI.** No "AI", "Gemini says", sparkle badges on results.
   Pre-fill what was detected and explain it in one line starting with
   `Note:` ("Note: the brief asks for a proposal and a quotation.").
8. **Specific and named.** Put the thing's name in the message: "Pushed
   2026TEG-P0155 to the Universe.", "“Booth design” moved to Done.". Curly quotes
   around titles; identifiers bare.
9. **Honest about time.** "Usually about 5 seconds.", "This can take up to a
   minute.", "Still working. Complex briefs take a little longer…". Never promise
   what you can't measure.
10. **Kind when there's nothing.** "Every brief is in the Universe. Nice work!"
   Specific when filtering: "No open briefs match “acme”."
11. **Sentence case** everywhere (titles, buttons, tabs), except proper nouns
    and the backend's own labels. Uppercase only via CSS for small section labels.

## Formats

| Thing | Format | Example |
| ----- | ------ | ------- |
| Date | `Mon D, YYYY` | Oct 14, 2026 |
| Date + relative | `Due Oct 16, 2026 · in 2 days` | today / tomorrow / in 3 days / 2 days ago |
| Time | `h:mm AM` | 4:30 PM |
| Duration | `1h 05m`, `12m` (always `fmt.duration`: no spaces, never "1 h 05 min") | session pill, "1h 42m left" |
| Money | currency code or ₱, thousands separators, 2 decimals | PHP 1,250,000.00 · ₱80,000.00 |
| Short money (summaries only) | ₱1.2M, ₱80K | |
| Counts | numerals, pluralized | 1 brief · 12 briefs · 1,204 rows |
| Separators | ` · ` (middle dot with spaces) | Connected · 5 tables · 3,410 rows |
| Missing values | "Not specified" (italic, muted) in documents; "-" in tables and facts; "None" for empty identifiers | |
| Ellipsis | "…" (one character) for in-progress labels and buttons that open a further step | Saving… · Delete… |
| Placeholders | an example, starting "e.g." or "…or type / paste" | e.g. INV-1680 |

## String library

Reuse these; adapt nouns to the tool.

**Login**
- Title: the tool name. Lede: the version ("v1.9.2"), filled from `APP.version`, no tagline.
- Button: "Log in with Lark". Hint: "You'll stay logged in for about 2 hours."
- Busy view: "Logging you in…"
- Ended: "Your login ended after about 2 hours. Log in again to keep going."
- Ended in another tab or tool: "Your login ended in another tab. Log in again to keep going."
- Logged out (the login is shared, so it covers every tool): "You've logged out of every Mineski tool in this browser. You're still logged in to Lark itself."
- Redirect missing: "This address (…) isn't registered on the Lark app."

**Landing / compose**
- "Upload your brief files" · "Any format, up to 10 files. Paste screenshots with Ctrl+V." · "…or type / paste the brief here."
- Drop overlay: "Release to add"
- Resume: "You have an unsaved brief: **Title**" [Open it] [Discard]
- Setup: "**Setup needed:** add your Gemini API key to start extracting briefs." → "Open Settings"

**Working**
- Stages: "Waking up the service", "Uploading files", "Reading the brief", "Extracting key details", "Formatting the summary"
- "Estimated wait: about 20 seconds" → "Still working. Complex briefs take a little longer…"
- Cold start: "Waking up the connection…" + "It sleeps when nobody's using it. This can take up to a minute."
- Load: "Reading the tables…" · "Refreshing…" · "Updated 4:44 PM"
- Cancel: "Cancelled. Your files are still here."

**Results and saves**
- "Your brief is ready." · "Click any text to change it."
- Confirm: "Save this brief to Lark?" + "It'll be added as a new row in the team's briefs table." [Cancel] [Save to Lark]
- Done: "Saved to Lark." · "Pushed 2026TEG-P0155 to the Universe." + "All 15 fields checked in Lark."
- Partial: "Check these in Lark: Status: sent “Won”, Lark has “Won - Awaiting CE Signature”" + "Open in Lark"
- Already done: "… is already in the Universe. Someone else already did this."
- Changed underneath: "“Tranche 2” changed since the list was loaded. Nothing was written; the list refreshed."
- Changed in Lark (a save): "Changed in Lark since you opened it: Status, Next Steps." [Reload it] [Save anyway]
- Outcome unknown (timeout or dropped connection after sending): "Fetch couldn't confirm the save. Refresh before trying again." Never "Nothing was written" unless Lark answered with an error.
- Upload failed before a save: "These files didn't upload: …" [Try again] [Save without these files]

**Lists**
- "Not shown: 233 already in the Universe · 24 ignored."
- "Ignored 2026TEG-P0155." [Undo] · "2026TEG-P0155 is back in the list."
- "“Title” moved to Done." [Undo] · "“Title” is back in the list."
- Blocked: "Push this project's brief first." [Go to the brief]
- Note: "Note: looks like “Regional finals” (2026TEG-P0141), already in the Universe. If it's the same project, ignore this one."
- Empty: "No briefs yet" + "Extract your first brief and save it. It'll show up here for the whole team." [Extract a brief]

**Delete**
- "Delete “Title”?" + "This removes the brief from the Lark Base for everyone, including its attachments. Mark it Done instead if you might need it again." [Cancel] [Delete…]
- "Are you absolutely sure?" + "“Title” will be permanently deleted from Lark. This cannot be undone." [Cancel] [Yes, delete permanently]
- "Deleted “Title”."

**Settings**
- Page lede: "Saved in this browser only."
- Key pill: "Key needed" / "Using the shared key" / "Using your key"
- Connections: "Awake · v1.4.0" / "Waking up… This can take up to a minute." / "Unreachable (no answer for 3 minutes)" / "Out of date (v1.3.0, needs 1.4.0). Ask the admin to redeploy it." / "Connected · 5 tables · 3,410 rows" / "Not checked yet"
- Badges: "Test copy" (env), "Overridden" (any developer override; its title lists what), "Preview mode: sample data, nothing is sent anywhere"
- Read-only login: "Your login can only read the tables. Log in again to allow saving."
- Buttons: "Wake up", "Try again", "Refresh", "Open in Lark", "Log in again", "Log out"
- Advanced: "Advanced: service addresses" + "For testing on this computer only. Leave it empty to use the hosted service."
- Browser: "Clear the unsaved draft and the cached list of briefs. Your key and login are kept." [Clear local data]

**Errors**
- Ad blocker: "**Fetch can't reach its extraction service.** An ad blocker or privacy extension is probably blocking it." + "Allow `host` in your blocker (or pause it on this page), then reload." [Reload]
- Network: "Polaris can't reach its connection service (host). It may still be waking up; try again in a moment."
- Login ended mid-write: "Your login is about to end, so this wasn't sent." + "Log in again, then push it."
- Permission: "Lark says your account can't open or edit this Base. Ask its owner for edit access."
- Busy backend: "Lark is getting too many requests. Wait a moment and try again."
- Copy failed: "Couldn't copy. Select 2026TEG-P0155 and copy it by hand."
- Generic last resort: "Something went wrong. Try again."

## Generated output (AI prompts)

Hold generated text to the same voice: bullets of about 12 words or fewer, one
idea each, no filler or hedging, no em-dashes, backend labels exactly, "Not
specified" when absent (never invent). Enforce length and enums in the response
schema, not only in the prompt. The chat-message export is plain text formatted
for a Lark group chat (bold title with `*`, `•` bullets, short lines).
