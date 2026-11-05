---
name: mineski-systems-design
description: The shared systems design of Mineski's internal web tools (Fetch, Polaris, Suppliers and every tool after them) - how a static page logs in with Lark (one login shared by every tool on the site), talks to Lark Base through the shared proxy, reads and writes tables safely, wakes sleeping Render services, stores data in the browser, runs its own secret-holding proxy, and is tested, served and documented. Use it whenever you build, extend or review the backend, data, login, networking, storage, proxy, testing or deployment side of an internal Mineski tool. Pairs with mineski-design-language (the interface side).
---

# Mineski systems design

The interface of every Mineski tool follows `mineski-design-language`. This guide
is the other half: **how the tools work underneath**, so a new tool starts from
methods that are known to work, and Fetch and Polaris behave the same way.

**Where it came from.** It was distilled from a line-by-line audit of Fetch and
Polaris (Oct 2026; the evidence is in `../_audit/`, which describes the code
*before* this work). Where the two tools disagreed, one standard was chosen.
Both tools were then changed to meet it, and this guide was revised against the
resulting code (Oct 16, 2026). On Nov 5, 2026 the tools started sharing one Lark
login (4.2), through the first shared systems file, `assets/session.js`.
`SYSTEMS-PARITY.md` at the workspace root records what changed and what is still open.

**How to read the pointers.**
- **Reference implementation** names working code you can copy from today
  (`F:` = `fetch/`, `P:` = `polaris/`, `S:` = `suppliers/`). Where several tools
  implement a rule, the better base is named first.
- **Open** marks where a tool still deviates from the rule. The rule is the
  standard; the deviation is a gap to close, not a precedent.
- Section 13 lists the shared modules to extract. The first one exists:
  `assets/session.js` (the shared login), copied unedited into every tool. Until
  the others exist, copy the reference implementation into the new tool.

---

## 1. The shape of every tool

```
 Browser: static page (GitHub Pages, no build step, ES modules)
   │  every Lark call carries the user's own token (Authorization: Bearer)
   ├──────────────▶ Shared Lark proxy (Render)  ──▶ Lark Open API (open.larksuite.com)
   │                adds the app secret ONLY to the OAuth code exchange
   └──────────────▶ Tool proxy (Render), only when the tool needs a secret
                    (e.g. Fetch's Gemini proxy). Checks the Lark token itself.
 Lark Base is the database. There is no other server and no other database.
```

Admin scripts (column setup, live checks, Node e2e) run on a developer's
computer with the Lark app secret from a git-ignored `.env`, and call Lark
directly (section 7.5).

## 2. The non-negotiables

1. **Every Lark call runs as the signed-in person** (user token, never an app
   token in a page), so Lark applies their own permissions.
2. **No secret in a page or a repo.** Secrets live in a proxy's environment or a
   developer's git-ignored `.env`. A proxy never hands out an app token (7.5).
3. **Read tables in full**, never through a view, and **check every column the
   tool uses on load** (name, type, select options). A mismatch switches off only
   the affected actions and says exactly what doesn't match.
4. **Writes are safe**: idempotent creates (`client_token`), re-read before
   writing, write only changed cells, never write blanks or placeholders, read
   back after, and say what Lark confirmed.
5. **Writes are never retried automatically and never reported as "nothing was
   written" unless that is certainly true** (Lark answered with an error, or the
   request never left the browser).
6. **Reads are resilient**: wake sleeping services first, retry reads with
   backoff for about 3 minutes, detect ad blockers, show honest status.
7. **Errors carry facts; one `describe(err)` turns them into one plain sentence**
   at display time.
8. **All configuration in `js/config.js`**: service URLs, Lark app id, scopes,
   table links, environment, business rules. Nothing hard-coded elsewhere.
9. **Developer overrides work only on a local page** and always show a badge.
10. **Storage keys are `<tool>.<name>`, JSON only, through `store()`/`recall()`.**
    One exception: **the login is shared by every tool** under `mineski.auth.*` in
    `localStorage`, through `js/session.js` (4.2). A login in progress and other
    tab-scoped state in `sessionStorage`; everything else in `localStorage`.
11. **Pure logic in pure modules** (no DOM, no network) with offline Node tests;
    network code takes an injected `call()` so Node scripts reuse it unchanged.
12. **Every proxy reports its version at `GET /`, and the page checks it.**

---

## 3. Configuration (`js/config.js`)

One file a maintainer edits. Public identifiers only.

```js
/* <Tool>: everything a maintainer may change. No secrets: the site is public. */
export const APP = { name: "Polaris", key: "polaris", version: "1.0.0", env: "live" };   // env: "live" | "test"
export const ENV_LABEL = APP.env === "test" ? "Test copy" : "";        // display only, never a gate

export const SERVICES = {                                               // hosted defaults
  lark: { url: "https://lark-proxy-dwiw.onrender.com", service: "lark-cors-proxy", min: "1.0.0",
          headers: ["Authorization"] },
  // a tool proxy, if any:
  // gemini: { url: "https://gemini-pdf-6wp4.onrender.com", service: "gemini-brief-proxy", min: "1.4.0",
  //           headers: ["Authorization", "X-Gemini-Api-Key"] },
};
export const LARK = {
  appId: "cli_aab0716138b8ded3", scopes: "bitable:app",
  api: "https://open.larksuite.com/open-apis",
  authorize: "https://accounts.larksuite.com/open-apis/authen/v1/authorize",
  tzOffsetMinutes: 480,            // date-only cells are midnight in the Base's zone (UTC+8)
  maxUploadMb: 20,                 // Lark's upload_all takes up to 20 MiB; the proxy's MAX_BODY_BYTES is above it
};
export const TABLES = {            // one Lark link per table, exactly as copied from the address bar
  live: { briefs: "https://mineskiglobal.larksuite.com/base/<app>?table=<tbl>&view=<vew>" },
  test: { briefs: "" },            // an empty link stops the page at start-up: it never falls back to live
};
export const RULES = { /* business rules; option labels exactly as Lark spells them */ };
```

- **Tables are links**, parsed once at boot by `parseBaseLink()` into
  `{app, table, view, url}`: `/base/` links only (a `/wiki/` link gets "That's a
  wiki page. Open the Base itself and copy its link."), `https:` only, a `tbl…`
  table id required. Never keep the app token, table id and URL as separate
  constants. Reference: `F: js/tables.js` `parseBaseLink`. Open: `P: js/ops.js`
  `parseBaseLink` returns no `view`, has no `/wiki/` or `https:` checks and
  throws a developer message.
- **One tenant host** in links (`mineskiglobal.larksuite.com`). A table may live
  in another Base (Polaris's ANDON); its link says so.
- **Environment**: `APP.env` picks `TABLES.live` or `TABLES.test`. The header
  shows `ENV_LABEL` ("Test copy") whenever it isn't live. Anything that writes in
  a test script checks `APP.env === "test"` (and that the test links are set),
  never the label text. Reference: `F: tests/e2e.mjs`, `P: tests/e2e-core.js`.
- **The date offset is `LARK.tzOffsetMinutes`**, used everywhere a date-only cell
  is read or written. Open: Polaris keeps it as `RULES.utcOffsetHours` and also
  hard-codes `OFFSET_H = 8` in `js/polaris-ui.js`.
- **Node scripts import `config.js`**; nothing re-types a URL, table id or
  column list. Reference: `F: tools/export-spec.mjs` feeds the Python setup
  script the column list from `js/schema.js`.
- Both tools currently have **no test copies** of their tables except Polaris's
  ANDON; until they exist, `env: "test"` refuses to start (by design).

---

## 4. Lark login and session

### 4.1 The flow

```
Log in with Lark ─▶ accounts.larksuite.com/…/authen/v1/authorize
                    client_id, redirect_uri, scope, state, code_challenge (S256)
                 ◀─ back to the page with ?code=…&state=…   (or ?error=…)
 1. strip ?code / ?error from the address bar (history.replaceState) BEFORE any await
 2. wake() the Lark proxy (≤ 3 min, "Waking up the connection…")
 3. POST {proxy}/proxy?url=…/authen/v2/oauth/token
      {grant_type:"authorization_code", client_id, code, redirect_uri, code_verifier}
      no client_secret: the proxy adds it. Exactly once, 45 s timeout, never retried
      (the code is single-use and lives 5 minutes).
 4. store {access_token, scope, expires_at = now + expires_in} as the shared login (4.2);
    clear the cached profile. Every other open tab of every tool hears about it.
 5. replaceState to the route the person asked for (validated, else the default route)
```

- **One function does all five steps** so no tool can get the order wrong:
  `handleRedirect()` returns `{handled, ok, returnTo, message}`. Reference:
  `F: js/auth.js` `handleRedirect`. Open: Polaris splits it (`auth.js`
  `finishLogin` plus the URL stripping in `app.js` `init()`); it works, but the
  shared module uses Fetch's shape.
- **PKCE**: 32 random bytes → base64url verifier (43 chars), SHA-256 challenge
  via `crypto.subtle`; 16 random bytes for `state`. The verifier is what binds
  the code to this tab (the proxy adds the secret for anyone).
- **Pending login** in sessionStorage `<tool>.auth.pending` =
  `{state, verifier, returnTo, createdAt}`. Read it and delete it at once. Check
  `?error` first, then `state` ("That login started in another tab. Log in again
  here."). A pending entry older than 10 minutes gets "That login took too long.
  Log in again."
- **`returnTo`** accepted only if it matches `^#\/[\w\-\/%.]*$`, checked when the
  login starts and when it finishes.
- **Redirect URI** = `location.origin + location.pathname` without `index.html`.
  Every address a tool is opened from (its registered `127.0.0.1` port, the
  Pages URL) is registered on the Lark app under *Security Settings > Redirect URLs*.
- **Redirect check (20029)**: on the login screen, **after `wake()` resolves**,
  probe `GET {proxy}/proxy?url=…/authen/v1/authorize?client_id&redirect_uri&scope`
  with `cache: "no-store"` and search the HTML for `"code": 20029`. Show "This
  address (…) isn't registered on the Lark app." Re-run the probe whenever the
  login screen is shown again after a failure. Reference: `F: js/auth.js`
  `redirectProblem`, `js/app.js` `showLogin`. Open: Polaris probes in parallel
  with the wake and only once.
- **Secure context**: login needs `https:` or `http://127.0.0.1`.

### 4.2 One login for every tool: storage and validity

Every Mineski tool is published on one origin (`https://mineski-stephen.github.io/<tool>/`)
and logs in through the same Lark app with the same scope, so **they share one
login**: log in to any tool and you're logged in to all of them, in every tab,
with one timer. Opening another tool, a new tab or a sharing link never asks again.

| Key (JSON) | Where | Holds |
| ---------- | ----- | ----- |
| `mineski.auth.token` | localStorage, shared by every tool | `{access_token, scope, expires_at}` |
| `mineski.auth.user` | localStorage, shared by every tool | `{name, avatar, email}` (cleared on every new login) |
| `<tool>.auth.pending` | sessionStorage, this tab | `{state, verifier, returnTo, createdAt}` |

- **The shared file `assets/session.js`** (in this skill) stores and announces;
  it decides nothing. API: `KEY`, `readToken()` (well-formed or `null`),
  `writeToken(t)`, `readUser()`, `writeUser(u)`, `clear()`, `isLive(t)` (more than
  30 s left), `adopt(tool)`, `onChange(fn)`. Copy it **unedited** into
  `js/session.js` and list it in the import map; `check:shell` compares it with the
  skill. It has no imports, so Node tests run it (`tests/session.test.mjs`, the
  same file in every tool). Each tool's `js/auth.js` builds the session on it.
- **Write the person before the token** (`writeUser`, or clear it, then
  `writeToken`): other tabs read the person when the token's change reaches them,
  and the token is what they react to. `handleRedirect` clears the person first,
  `adopt` and the preview shims write it first.
- **React only to real changes**: `auth.js` keeps `seen`, the login it last acted
  on (at load, its own login, or an event), apart from `memo` (the last token read,
  for running work). Only `seen` decides whether an event is new, so a plain read
  between another tab's write and its event can't hide the change.
- **Why localStorage**: it is shared by every page on the origin and survives
  closing the tab, and the browser's `storage` event tells every other open tab,
  of any tool, when it changes. The token lasts as long as Lark says (about 2 h)
  wherever it is kept; its `expires_at` is stored with it, so every tab shows the
  same time left. Say in the README that closing the tab doesn't log you out.
- **The login in progress stays in its tab** (`<tool>.auth.pending`), so a login
  finishes where it began and two tabs logging in at once can't mix their PKCE
  verifiers. Whichever finishes last is the login for everyone.
- **Moving an older per-tab login**: `adopt("<tool>")`, called once when
  `auth.js` loads, moves a live `<tool>.auth.token` (and `.user`) from
  sessionStorage into the shared keys, only if it lasts longer than the shared one,
  and deletes the old keys either way. Remove the call with the head migrations
  (9), after about 3 months.
- **Preview mode** sets `window.MINESKI_PREVIEW = true` before the modules load;
  `session.js` then uses `mineski.preview.auth.*`, so a fake login never replaces
  a real one (8.4).
- **Only tools on the same Lark app and scope share it.** A tool with another app
  or wider scopes keeps its own `<tool>.auth.*` keys (a token minted for one app is
  no good to another) and its README says so. The origin is the trust boundary
  (9, 10).
- A token is valid for **new work** only while more than **30 s** remain:
  `currentToken()` returns the object or `null`; `token()` the string or `""`.
- **Work already running may use the token until its real expiry**
  (`workToken()`), so a multi-step save that crosses the 30 s grace isn't cut off
  half way, **even if another tab logs out meanwhile**: `auth.js` remembers the
  last login it saw (`memo`) and hands it out while `track()` has work in flight.
  Call sites use `busyWorking() ? workToken() : currentToken()`. Reference: all
  three `js/auth.js`; `F: js/lark.js` `token()`, `P:`/`S: js/app.js` `call()`.
- Logins last about **2 hours**; there is no refresh token. (Requesting
  `offline_access` for a refresh token is possible later, but only after the proxy
  token holes in 7.5 are closed.)
- **Write scope**: `canWrite()` is true when the token's scope includes
  `bitable:app` (an empty scope means Lark didn't say: let Lark decide). Without
  it, switch writes off with "Your login can only read the tables. Log in again
  to allow saving." Reference: both `js/auth.js` `canWrite`.

### 4.3 The session clock

- Tick every **20 s** and on `visibilitychange`.
- Top bar: the session pill with the time left ("1h 42m"), `.is-low` (amber)
  under **10 minutes**; Settings: "Logged in until 4:30 PM · 1h 42m left".
- At **5 minutes** left: a sticky warn toast "Your login ends at 4:30 PM." with
  detail "Log in again to keep working without a break." and action "Log in again".
- **Before every write**, however small (save, push, Done, Ignore, Undo, delete):
  `ensureTime(60_000)`; before a long task (extraction, more than one upload):
  `ensureTime(120_000)`. If there isn't enough time: "Your login is about to end,
  so this wasn't sent." + "Log in again, then try it." with "Log in again".
- **In-flight guard** `track(work)` with `busyWorking()`, in the auth module:
  while a write or long task runs, neither the clock nor another tab ends the
  session; it ends when the work settles.
- When another tab renews the login, the 5-minute warning closes (keep the close
  function `toast()` returns) and re-arms for the new expiry.
- Reference: `F:`/`S: js/auth.js` (`track`, `busyWorking`, `ensureTime`,
  `startClock`, `relogin`; the clock lives in the auth module, which is where the
  shared module puts it). `P: js/auth.js` has `track`/`busyWorking`; its clock is
  in `js/app.js` (`tickSession`, `ensureTime`), reached by views through `ctx`.

### 4.4 When a login ends

- **Dead-token codes** (one shared set, also in `lark_auth.py`):
  `20005, 99991661, 99991663, 99991668, 99991671, 99991677`
  (both `js/errors.js` `DEAD_TOKEN_CODES`).
- The Lark client detects them centrally and fires the auth module's end
  handler; it still throws (with `err.deadToken = true`) so callers can roll back
  optimistic changes first. No call site checks codes by hand. Reference:
  `F: js/net.js` `setDeadTokenHandler`, `P: js/net.js` `onDeadToken`.
- `sessionEnded`: clear the shared token (every tool's tabs hear it), close every open dialog
  (`dialog[open]` → `close()`; shared sheets resolve `false`), close menus, drop
  in-memory data **and cached business data** (section 9), show the login
  screen with "Your login ended after about 2 hours. Log in again to keep going."
  Settings stays open (it works logged out); a running long task finishes its
  current step first (Fetch's extraction). Open: Fetch's default wording is
  "Your login ended. Log in again to keep going."; Polaris doesn't close menus
  (it has none yet).
- **Across tabs and tools** (`shared.onChange`, turned into events by `auth.js`):

  | Another tab… | This tab |
  | ------------ | -------- |
  | logs in, and this tab wasn't | `onShared({ renewed: false })`: leave the login screen for the route it was going to and load, as after its own login (not while it is finishing its own login, the busy view) |
  | logs in again (a new token) | `onShared({ renewed: true })`: close the "ends at" warning, repaint the time left, reload the profile. If the person changed (e-mail, else name), drop what was loaded for the previous person and load again (`P:`, `S:`) |
  | logs out, or Lark refused the token there | `end(message, { elsewhere: true })`: "Your login ended in another tab. Log in again to keep going."; drop cached business data as Log out would (`S:` drops its saved copy) |
  | lets it expire | `end()` with the usual "ended after about 2 hours" |

  "Ended elsewhere" means the token vanished with more than 30 s left. If work is
  in flight, the end waits until it settles (`track`), and the work finishes with
  the remembered token. A tab never hears its own changes (the `storage` event
  fires in the *other* tabs), so `end()` and `handleRedirect()` handle their own
  tab directly. There is no BroadcastChannel and no "borrow a login from another
  tab" step: the shared storage replaces both (Fetch and Suppliers had them until
  Nov 5, 2026).
- **Unsaved work survives a re-login**: anything that lives only in memory is
  saved before redirecting to Lark (`onBeforeLogin` → sessionStorage, e.g.
  `fetch.edits`), or is already persisted (Polaris's drafts in `polaris.draft`).
- A failed "Log in again" while the old token is still valid shows an error
  toast, not a hidden note.

### 4.5 Logout and identity

- **Log out** (`auth.logout()`) clears the shared login, so it **logs out of every
  Mineski tool in this browser**, plus the tool's cached data, and says "You've
  logged out of every Mineski tool in this browser. You're still logged in to Lark
  itself." Every other open tab ends at once (4.4). It is local only (Lark has no
  revoke call); say so in the README.
- **Profile**: `GET /authen/v1/user_info` as a retried read; cache in the shared
  `mineski.auth.user`, written only if the login hasn't changed meanwhile (another
  tab may have logged in someone else); `auth.user()` returns it synchronously. Retry once after
  `wake()` if the first attempt failed. Avatar `<img referrerpolicy="no-referrer">`.
  If a write needs the person's name (Fetch's "Filed by") and the profile is
  missing, load it first rather than writing `""`. Reference: `F: js/auth.js`
  `loadUser`. Open: Polaris doesn't retry after wake.

### 4.6 Login error messages (one shared table)

| Code / case | Message |
| ----------- | ------- |
| proxy answers `{"error":"not found"}` / outdated | "The connection service doesn't support logging in yet. Ask the admin to update it." |
| 20001, 20002, 20063 | "The connection service couldn't complete the login. Try again; if it keeps happening, tell the admin." |
| 20003, 20004, 20065 | "That login code expired or was already used. Log in again." |
| 20049 | "The login check failed, probably because it started in another tab. Log in again here." |
| 20071 | "Lark sent the login back to a different address. Log in again from this page." |
| 20010 | "Your Lark account isn't allowed to use this app yet. Ask the app admin to add you." |
| 20029 | "This address (…) isn't registered on the Lark app." |
| 99991679 | "Your login is missing a permission <Tool> needs (…). Log out, then log in again." (list `permission_violations[].subject`) |
| dead-token codes | session ends (4.4) |
| `?error=access_denied` | "Login cancelled. <Tool> needs your OK on Lark's page to <do its job>." (Fetch: "read and save briefs"; Polaris: "read and write the tables") |
| other `?error=` | "Lark couldn't log you in (<error_description or error>). Try again." (Open: Polaris omits `error_description`) |
| pending login older than 10 min | "That login took too long. Log in again." |

Reference: `P: js/errors.js` (`BY_CODE`, `MAPPED_CODES`, tested for coverage),
`F: js/errors.js` (`AUTH_MESSAGES`).

---

## 5. Networking

### 5.1 Services and status

Every proxy the tool uses is a **service** with one status object:

```js
const lark = createService({ id: "lark", label: "Connection service", url: () => cfg().larkUrl,
                             def: SERVICES.lark, freshMs: 60_000 });
lark.status = {
  state: "unset" | "unknown" | "waking" | "awake" | "down" | "blocked" | "outdated",
  detail: "",       // the bracketed reason: "no answer for 3 minutes", "v1.3.0, needs 1.4.0"
  version: "",      // from GET /
  info: {},         // the rest of GET / (e.g. Fetch's `configured`)
  checkedAt: 0,
};
lark.on(fn);        // subscribe; returns unsubscribe
lark.wake({ force }); lark.host(); lark.isFresh(); lark.isBlocked();
```

Settings > Connections renders one row per service (dot, label, copy, host,
"Awake · v1.4.0") with a fix-it button (Wake up / Try again / Refresh), plus the
tool's own data row ("Lark Base · Connected · 12 briefs", "Lark tables ·
Connected · 5 tables · 3,410 rows"). An outdated service uses the warn dot.

Reference: `F: js/net.js` `createService` (with `larkService`, `geminiService`,
`onAnyService`, `blockedHosts`), `js/settings-view.js` `serviceLine`; the pure
compatibility verdict `P: js/service.js` `serviceVerdict` (`wrong` / `outdated`
/ `awake`, with `cmpVersion`). Open: Polaris has one `conn` object
(`proxy`, `blocked` flag) instead of `createService`, no `unset`/`blocked`
states, forces wakes by resetting `conn.checkedAt`, and shows "Out of date" with
the error dot.

### 5.2 Waking sleeping services

- Ping **`GET /`**, never `/health` (filter lists block `onrender.com/health`;
  Render's own health check keeps `/health`). `cache: "no-store"`.
- **Awake** = a 2xx **JSON** response whose `service` is the expected name
  (Render's HTML "starting" page and a wrong address are not awake). Then check
  compatibility (7.2): an older `version` or a missing CORS header → `outdated`.
  A 4xx answer stops with "answered HTTP n"; a different service stops with
  "answered, but it isn't this service (check the address)".
- **Loop**: one shared loop per service, 20 s per ping, first wait 2 s, backoff
  ×1.6 capped at 15 s, budget **3 minutes**; "Waking up the connection…" appears
  after **1.2 s**, with "It sleeps when nobody's using it. This can take up to a
  minute." **No countdown.** Gives up as `down` with "Unreachable (no answer for 3
  minutes)" and Try again.
- **When**: on page load (every service the tool uses, also from the login
  screen), on opening Settings if not awake, on returning to the tab when not
  fresh, before a load, before the login code exchange and before the redirect
  probe. Fresh for 60 s (up to 4 min for a single-purpose proxy).
- Reference: `F: js/net.js` `wake`/`ping`. Open: Polaris skips the JSON
  content-type check and doesn't wake on opening Settings.

### 5.3 Requests, timeouts and retries

| Kind | Timeout | Automatic retry | When it fails |
| ---- | ------- | --------------- | ------------- |
| Wake ping `GET /` | 20 s per attempt | the wake loop | `down` after 3 min |
| Read (GET, `records/search`, `records/batch_get`, `fields`, `user_info`) | 60 s | yes, only after the service woke: network errors and 502/503/504 after 1.5 / 3 / 6 / 12 / 20 s; twice after a rate limit (1254290, 99991400) | error with Try again |
| Write (create, update, delete) | 120 s | **never** | see below |
| Login code exchange | 45 s | never | the login message |
| Upload (Lark media) | 180 s | never; keep returned `file_token`s on the item so a retry doesn't re-upload | error with Try again |
| Long tool task (e.g. Fetch's `/extract`) | the proxy's budget + margin (6 min) | at most one automatic retry for a transient upstream error, with a visible countdown | the loader's error state |

**When a write fails:**
- Lark answered with an error code, or the request never left the browser
  (blocked, refused before sending): "Nothing was written." + the reason.
- The request may have landed (network error after sending, timeout, a non-JSON
  or proxy 5xx answer to a write): the error is **`uncertain`**. Say "<Tool>
  couldn't confirm the save. Refresh before trying again.", re-read the
  destination, and tell the person what Lark shows ("It's in Lark." / "It isn't
  there yet, so it's safe to try again."). Never roll back an optimistic change
  on an uncertain outcome; re-read instead.

Reference: `P: js/net.js` `lark` (the widest `uncertain` rule), `js/inbox.js`
`recheck`; `F: js/errors.js` `describeWrite` (adds "Nothing was written." only
when it is certain). Open: Fetch doesn't mark a non-JSON 5xx answer to a write
as uncertain, and `toggleDone` rolls back on an uncertain failure.

- **Which calls are reads** is decided in one place. The standard is an explicit
  `{ read: true }` option on `call(method, url, body, opts)`, set by the table
  helpers (`F: js/tables.js`). Open: Polaris infers reads from the URL in
  `app.js` `call()`.
- Use `fetch()` with `AbortController`; use **XHR for uploads** so they can show
  progress. Reference: `P: js/net.js` `uploadToBase` with the pure helpers in
  `js/errors.js` (`uploadSizeProblem`, `uploadEntries`, `uploadToken`). Open:
  Fetch uploads with `fetch()` (`js/net.js` `larkUpload`), so there is no progress.
- Lark media uploads (`POST /drive/v1/medias/upload_all`) **always** send
  `extra: {"bitablePerm": {"tableId": "<tbl>"}}` (required on advanced-permission
  Bases, harmless elsewhere), check the size against `LARK.maxUploadMb` first and
  map HTTP 413 ("That file is too large…").
- Errors are **facts**: `LarkError(message, {network, status, json, raw,
  uncertain, deadToken})`; words come later from `describe()`.

### 5.4 Ad blockers

Two thrown network errors within **600 ms** while `navigator.onLine` is true
count as blocked. Count **per service** (only thrown errors; HTTP responses never
count), cleared by that service's next success. Stop retrying and show the red
banner at the top of `<main>` naming every blocked host: "**<Tool> can't reach
its connection service.** An ad blocker or privacy extension is probably blocking
it. Allow `host` in your blocker (or pause it on this page), then reload." with
Reload. Reference: `F: js/net.js` (`threw`, `worked`, `blockedHosts`),
`js/app.js` `updateBlockNote`. Open: Polaris counts one global `quickFails`.

### 5.5 `describe(err)`: errors as sentences

One function per tool, built in layers: network facts first (blocked,
unreachable, outdated, uncertain), then the shared Lark code table, then
tool-specific codes. Unknown codes end as "Lark said: <msg> (code n)". Never a raw
code alone; never developer instructions to end users (script names go in the
README).

| Code | Message |
| ---- | ------- |
| network / unreachable | "<Tool> can't reach its connection service (host). It may still be waking up; try again in a moment." |
| proxy non-JSON / HTTP n | "The connection service answered with an error (HTTP n). Try again in a moment." |
| outdated service | "The connection service is out of date (v1.3.0, needs 1.4.0). Ask the admin to redeploy it." |
| 91403 | "Lark says your account can't open or edit this Base. Ask its owner for edit access." |
| 1254302 | "Your account isn't allowed to change this table (its permissions are restricted). Ask the Base owner." (delete: "Your account isn't allowed to delete rows. Mark it Done instead.") |
| 91402, 1254003, 1254040 | "<Tool> is pointed at a Base that doesn't exist. Tell the tool owner." |
| 1254004, 1254041 | "<Tool> is pointed at a table that doesn't exist. Tell the tool owner." |
| 1254045 | "A column <Tool> needs doesn't exist: <name>. Tell the tool owner." |
| 1254006, 1254043 | "That row isn't in Lark any more. The list refreshed." |
| 1254060-1254068 | "Lark didn't accept a value for a column (<msg>)." |
| 1254290, 99991400 | "Lark is getting too many requests. Wait a moment and try again." |
| 1254291 | "Someone else is changing this table right now. Try again in a moment." |
| synced table message | "This table is synced from elsewhere, so it's read-only in Lark." |
| 413 / too large | "That file is too large…" (with the limit) |
| 99991679 | see 4.6 |
| dead-token codes | session ends (4.4) |

Reference: `P: js/errors.js` `describeLark` with the `BY_CODE` map and
`MAPPED_CODES` (a test asserts every listed code has a sentence); `F:
js/errors.js` `describe` + `describeWrite`, the `AlreadyDone` / `WriteBlocked`
error classes, the delete variant and multi-host blocking. The shared module
merges both (section 13).

---

## 6. Lark Base data

### 6.1 Reads

- `POST …/apps/{app}/tables/{tbl}/records/search` with `page_size: 500`,
  `automatic_fields: false`, **no view**, 120 ms between pages, at most 200
  pages, progress per page ("Reading the briefs… 1,500 of 3,410").
- Request only the columns the spec reads that exist (Lark rejects unknown names),
  plus, for a table the tool writes to, its lookups, formulas and links (types
  18-21: read-only, but part of the row people compare against before a write);
  past 50 names, request all. Keep the list used per table (`S.columns`) so a view
  of a row shows only what was read. Reference: `P: js/ops.js` `columnsToRead`.
- Lookups and formulas arrive as `{type, value: [...]}`, where `type` is the
  looked-up column's own type: format by it (a date lookup is a date, not a
  number). Reference: `P: js/sync.js` `cellText`, tested per shape.
- **Never return a partial result**: a missing `page_token` while `has_more`, or
  passing the page guard, **throws** (records and fields alike). A truncated list
  looks like missing rows and causes duplicate creates.
- Single rows (re-reads, read-back): `POST …/records/batch_get`, **never**
  `GET …/records/{id}` (it returns numbers as text and display formats). A
  missing row throws with `notFound` (or returns `null` from a `findRecord`
  variant when absence is expected).
- Don't rely on Lark's order; sort in code by a real field.
- Reference: `F: js/tables.js` (`loadFields`, `loadRecords`, `getRecord`) and
  `js/schema.js` `presentColumns`. Open: Polaris's `ops.js` `loadFields` returns a
  partial list silently instead of throwing.

### 6.2 The table spec and the load-time check

Every table a tool touches has a declarative spec:

```js
{
  title: "Briefs",
  fields: { "Project Title": "text", "Due Date": "date", "Status": "select", … },
  optional: { "IGNORE": "checkbox" },                     // may be missing; actions that need it are off
  options: { "Status": ["New", "In Progress", …] },       // options the tool writes must exist
  openOptions: ["Next Steps"],                             // writes may create new options here (on purpose)
  read: [ … ] | "*",                                       // columns to request
  index: [ … ],                                            // columns the duplicate re-check reads (6.4)
  neededBy: { save: [ … ], done: ["Done"], delete: [] },   // which action needs which column
}
```

On every load: `GET …/fields`, then check names, types and options, and which
actions each problem blocks. Problems switch off **only** the affected actions,
listed in plain words in a callout and in Settings ("Briefs: column “Done” is
missing."). The same spec drives `check:live` (8.4) and the setup/repair script
(create missing columns and options, dry run by default, delete nothing unless
asked).

Reference: `F: js/schema.js` (`COLUMNS` → `tableSpec()`, `checkSchema`,
`checkNeeded`, `checkAll`, `blockers`; `js/ops.js` `readyToWrite` throws
`WriteBlocked`), `P: js/ops.js` (`schemaSpec` for many tables keyed by name, with
`index` lists, `loadEverything`, gating via `app.js` `problemsFor`/`canWriteFor`).
Setup scripts: `F: tools/setup_lark_table.py` (Python, spec from
`tools/export-spec.mjs`), `P: tools/setup.mjs` (Node). The shared module keeps
Fetch's spec shape and Polaris's multi-table support; messages carry the table
title.

### 6.3 Cell values

| Type | Read | Write |
| ---- | ---- | ----- |
| Text | join segments' `text`/`name`/`link`; CRLF → LF; trim (`plain`, `clean`) | plain string |
| Number | number; formulas/lookups `{type, value:[n]}` via `numOf` | JS number |
| Date (date-only) | ms at midnight in the Base's zone; `fromLarkDay(ms, LARK.tzOffsetMinutes)` | `toLarkDay(iso, offset)`; typed dates parsed by `parseDay` |
| Single select | option name | **through `matchOption(value, liveOptions)`**, which writes the option's own name and never creates an option (except `openOptions`) |
| Multi select | array of names | names through `matchOption` |
| Person | `{id, name, email}` (`people`) | `[{id: open_id}]`; prefer a Person (or Created By) column over a typed name |
| Attachment | `{file_token, name, size}`; never keep `url`/`tmp_url` (they expire) | `[{file_token}]` full keep-list, only when it changed |
| URL | `{link, text}` | `{link, text}` |
| Checkbox | `true`/`false` | `true`/`false` (use checkboxes for new flags) |
| Formula, lookup, auto | read only | **never written** (`writableOnly` drops computed types) |
| Blank | `isBlank`: zero is not blank; empty segments, people, files are | — |

Change detection compares canonical values (`canon`, `sameCell`) or a per-cell
fingerprint (`cellSig`) kept with each loaded row.

Reference: `F: js/cells.js` (`plain`, `clean`, `num`, `numOf`, `isBlank`,
`matchOption`, `toLarkDay`, `fromLarkDay`, `canon`, `sameCell`, `cellSig`) and
`js/rows.js` (`toFields` returns skipped values); `P: js/sync.js` (`people`,
`shortName`, `parseDay`, the same `plain`/`clean`/`matchOption`/`isBlank`) and
`js/ops.js` `writableOnly`.

### 6.4 Safe writes

**Create**
1. A `client_token` per intended create, **persisted with the draft** (local
   storage) so a reload-then-retry can't duplicate.
2. If the table has a natural key (a project code, a request number), re-read the
   destination's index; if the item is already there, write nothing and say
   "<thing> is already in the <table>. Someone else already did this."
   (`AlreadyDone`), then refresh. Without a natural key (Fetch's briefs), the
   persisted `client_token` is the only guard; say so in a code comment.
3. `POST …/records?client_token=…`. A create that returns no record is `uncertain`.
4. Read back (`batch_get`) and compare; if the stored record differs from the
   payload (Lark replayed an older attempt with the same token), update the
   differing cells and read back again.

**Update** (`safeUpdate`)
1. Re-read the row (`batch_get`).
2. Check expectations: the cells being changed still equal what the page loaded
   (compare fingerprints or canonical values). If not, write nothing and say what
   changed: "“Q3 deck” changed in Lark since you opened it. Nothing was written."
   + "Status was edited there." with "Reload it" and, where it is safe to offer,
   "Save anyway" (which then writes only the person's own changes).
3. Write **only the changed cells** through `POST …/records/batch_update`.
4. Read back and compare (6.5).

**Rules for every payload**
- **Never write a blank or a placeholder.** Empty values are left out. `null` is
  written only when the person cleared that field on purpose. UI placeholders
  ("Not specified", "Untitled Project", today's date as a default) are never data.
- **An unrecognised select value in Lark is kept**: leave the cell out of the
  patch, and show a `Note:` that it stays unless the person picks one.
- **Columns owned by Lark** (edited by people in Lark: status, due dates, flags)
  are written only when the person changed them on the page.
- **Fill-blanks writes** re-check that each cell is still blank and skip (and
  report) the ones someone filled meanwhile, including derived ones (VAT% goes
  only with its amount, and only if still blank).

**Single-cell flags** (Done, Ignore) write without a re-read; see 6.6.

**Delete**: rare, always `confirmDanger()` (two steps), `ensureTime` before and
inside `run`, `POST …/records/batch_delete`, then "Deleted “Title”." Map
1254302/91403 to "not allowed to delete rows; mark it Done instead."

Reference: `F: js/ops.js` (`createBrief` with the replay fix-up, `updateBrief`),
`js/verify.js` `safeUpdate`, `js/rows.js` (`changedCells`, `leaveBlanksOut`,
the projections/Lark-owned header), `js/app.js` "Save anyway"; `P: js/ops.js`
(`pushBrief`, `pushPar`, `pushAndon`, `pushCollections` with the index re-check,
`saveInvoiceDetails`, `fillGaps`), `js/sync.js` (`fillPlan`,
`invoiceDetailsPatch`, `draftsToJSON`/`draftsFromJSON`). Open: Polaris has no
replay fix-up after a create.

### 6.5 Read-back and confirmation

After every write, `batch_get` the row and compare field by field, format-aware
(multi-select by names, attachments by tokens, people by ids, numbers ±0.005,
text via `clean`). Return the record so the page rebuilds the row from what Lark
stored, not from what it sent.

- Success says what was checked: "Pushed 2026TEG-P0155 to the Universe." + "All
  15 fields checked in Lark."
- Mismatches are a warn toast, not an error: "Check these in Lark: Status: sent
  “Won”, Lark has “Won - Awaiting CE Signature”" (curly quotes) + "Open in Lark".
- A failed read-back after a successful write is a warning too: "Saved, but
  <Tool> couldn't read it back to check it. Check it in Lark."
- After a save, re-read the affected rows and highlight them where they land.

Reference: `F: js/verify.js` (`verifyWritten`, `readBack` returning `{mismatches,
readBackError, record}`), `js/app.js` `readBackNote`; `P: js/app.js` `afterPush`
(re-read and highlight). Open: Polaris's `readBack` is private to `ops.js`,
returns no record, and quotes values with straight quotes.

### 6.6 Optimistic changes

Only for single-cell flags (Done, Ignore): change the UI at once, keep the item in
a `working` set (dimmed, not clickable twice), write, roll back with the reason
if Lark refuses, offer Undo for 8 s, and warn if the read-back disagrees ("Lark
didn't confirm the change to X."). On an **uncertain** failure don't roll back:
say "<Tool> couldn't confirm the change to X." and reload. Saves and pushes are
never optimistic. Reference: `P: js/inbox.js` `ignore`. Open: Fetch's
`toggleDone` rolls back on an uncertain failure.

### 6.7 Partial failures

Upload files first. If any upload fails, stop before writing the row: "These
files didn't upload, so nothing was saved: …" with "Try again" and "Save without
these files" ("Saved without X." afterwards). Never skip a file silently.
Uploaded `file_token`s stay on the item so a retry doesn't re-upload. Reference:
`F: js/app.js` `uploadPending` and the save sheet. Open: Polaris stops at the
first failed upload without offering "Save without these files".

### 6.8 Source of truth and old data

- **The Lark cells are the truth.** A tool may keep a rich document in one JSON
  column (Fetch's "Brief JSON") when Lark can't model it, but it must declare which
  columns are *projections* (written from the JSON) and which are *owned by Lark*
  (never overwritten unless changed on the page). Reference: the header of
  `F: js/rows.js`.
- JSON documents carry `schema_version`. **Normalize old versions on read; refuse
  to save a newer version** than the page knows ("This was saved by a newer version
  of <Tool>. Reload the page to edit it."), so a cached old page can't downgrade
  data. Reference: `F: js/brief.js` `SCHEMA_VERSION`, `isNewer`, `normalize`.
- Mapping (Lark row ↔ model) lives in pure modules (no DOM, no `location`, no
  network) so it is testable in Node. Reference: `F: js/rows.js`, `P: js/sync.js`.

### 6.9 Queued writes

When a person pushes many items in a row, the write may run in a **queue**
instead of the sheet (interface: `mineski-design-language` patterns, "Push
queue"). A queue changes *when* a write runs, never *how*:

- **The same write path.** The queue calls the exact function the sheet would
  (`perform(card, job)`): re-read, `client_token`, read-back, the same errors.
  The payload is computed again when the item runs, from the data loaded then;
  what was computed at Push time is only for display.
- **One at a time, in order.** No parallel writes (they collide on Lark's
  per-table lock, 1254291, and on rate limits), and a dependent item (a PAR
  after its brief) runs after the item it needs.
- **Never sent twice on its own.** Refused by Lark: *failed* ("Nothing was
  written. …") until the person presses Retry. Uncertain: re-read Lark (after any
  load already running), then *done* ("It's in Lark.") or *failed* ("safe to try
  again"); never resent automatically. Dead token: back to *waiting* (Lark refused
  the login, so nothing was written) and the queue stops.
- **Time is checked per item**, not at Push: before each write, `msLeft()` must
  be over 60 s; otherwise the queue stops ("Your login is about to end, so the
  queue stopped.") and keeps its items. Each write runs inside `track()`.
- **Persisted like drafts** (`<tool>.queue`, localStorage, JSON, versioned,
  2-day age limit) so a re-login, which reloads the page, doesn't lose work:
  waiting and failed items with their `client_token` and choices; never finished
  ones, maps, sets or file contents (an item whose file hadn't uploaded is marked
  `lostFiles` and fails with a sentence). An item that was *running* when the
  page closed comes back as *checking* and is settled by a re-read before anything
  else runs. Items resume only after the tables have loaded, matched to their
  card by id and step; an item whose card has gone finishes without writing.
  Pure helpers (`queueToJSON` / `queueFromJSON`) with offline tests.
- **Queued items leave their lists and counts** (the card is hidden while its
  item isn't done) and come back on Remove, with the item's choices restored as
  the card's draft.
- **Re-read the tables once when the queue empties**, not after every write;
  update the local copy after each write so lists and dependent cards move on.
- `beforeunload` warns while items are waiting; the README's storage table lists
  the queue key and says it holds business data for up to 2 days.

Reference: `P: js/queue.js` (runner, peek, page), `js/inbox.js` `perform` /
`preview` / `reopen`, `js/app.js` `afterPush` and `afterQueue`,
`js/sync.js` `queueToJSON` / `queueFromJSON`; the row beside the push sheet is
`js/rowdoc.js` (it shows only the columns `ops.js` `readColumns` says were read).

---

## 7. Tool proxies (Render)

A tool gets its own proxy only to hold a secret (an AI key, an app secret) or to
do work the browser can't. Reference implementation: `fetch/render/gemini-pdf/`
(v1.7.0).

### 7.1 Shape

- **One narrow job** ("extract a brief", not "call Gemini"). Python stdlib
  (`ThreadingHTTPServer`, HTTP/1.1), no framework, a Dockerfile (non-root user,
  `python:3.12-slim`, `COPY *.py <data files> ./` rather than a hand-kept file
  list), `render.yaml`, offline unit tests with every upstream mocked.
- **Order of checks per request**: origin → Lark login → limits → then read the body.
- **Lark login check** (any proxy that accepts the user's token): `lark_auth.py`.
  It calls `user_info`, then probes one table the tool serves (`fields?page_size=1`),
  caches by SHA-256 of the token for 5 minutes, never caches failures, **fails
  closed**, and never logs headers or tokens. Answers `401 login_required |
  login_expired | login_invalid`, `403 not_authorized`, `503 auth_unavailable`.
  (Its messages still name Fetch; make the tool name a parameter before reusing it.)
- **Limits**: per-user hourly rate limit keyed by Lark `open_id` (`429` +
  `Retry-After`), a concurrency cap (`503 busy` + `Retry-After`), an upload cap
  checked from `Content-Length` and while reading.
- **Errors**: JSON `{"error": {"code": "<code>", "message": "<one plain
  sentence>"}}`; never a traceback. Logs: one line per request, no bodies, no file
  names, no headers.
- **Secrets** from environment variables (and Render secret files); `GET /` may
  say *where* a key was found, never the key. Environment-specific values (table
  ids) are **required** variables (the service refuses to start without them),
  not defaults pointing at production.

### 7.2 `GET /`: version and compatibility

```json
{
  "service": "gemini-brief-proxy",
  "version": "1.7.0",
  "api": 1,
  "commit": "a1b2c3d",
  "endpoints": ["GET /", "GET /health", "POST /extract"],
  "features": ["lark-login", "user-key", "evidence"],
  "cors": { "origins": "*", "allow_headers": ["Content-Type", "Authorization", "X-Gemini-Api-Key"] },
  "limits": { "max_upload_mb": 50, "max_files": 10, "rate_limit_per_hour": 60 },
  "login": { "provider": "lark", "required": true }
}
```

- No auth, `Cache-Control: no-store`, CORS open for this path so the page can
  always diagnose. A tool proxy may add its own fields (Fetch's: `model`,
  `configured`, `shared_key`, `schema_version`).
- `version` is semver; `api` is the major version (bump only when an older page
  can't use it). `commit` from `RENDER_GIT_COMMIT`. `cors.allow_headers` comes
  from the same constant the CORS code uses (`ALLOW_HEADERS`), so it can't lie.
- `GET /health` stays minimal for Render's health check only.
- **The page checks it on every wake**: `version ≥ SERVICES.x.min` and every name
  in `SERVICES.x.headers` is in `cors.allow_headers`; otherwise the service is
  `outdated`, Settings shows "Out of date (v1.3.0, needs 1.4.0). Ask the admin to
  redeploy it." and only the actions that need it are switched off. (A plain
  `GET /` needs no CORS preflight, so without this check an old proxy whose CORS
  lacks `Authorization` looks "Awake" and every real request fails as "can't
  reach". This happened to Fetch in Oct 2026.)
- Pages read limits (`max_upload_mb`, `max_files`) from `GET /` instead of copying
  them. Reference: `F: js/extract.js` `limits`.
- Reference for the page side: `F: js/errors.js` `incompatible`, `P: js/service.js`
  `serviceVerdict`. Open: `SERVICES.lark.min` is `""` in Fetch (the Lark proxy
  reports no version yet, so only its `service` name can be checked) and
  `"1.0.0"` in Polaris; make them the same once the proxy reports a version.

### 7.3 CORS

`ALLOWED_ORIGINS` = the Pages origin plus the registered `127.0.0.1` addresses
(never `*` once hosted); enforced again server-side on the real endpoints.
Methods `GET, POST, OPTIONS`; allowed headers listed once in code and tested
(`test_preflight_lists_every_allowed_header`); `Access-Control-Max-Age` at most
2 hours (Chromium caps it there anyway). Browsers cache preflights, so a fixed
deploy can look broken for a while in a browser that cached the old one. Open:
the Gemini proxy still defaults `ALLOWED_ORIGINS` to `*` and sends
`Max-Age: 86400`.

### 7.4 Deploying a proxy (checklist for its README)

1. Bump `VERSION` and add a CHANGELOG entry (newest first) saying what a page needs.
2. Run the unit tests, including: `GET /` reports `VERSION` and the allowed
   headers; an `OPTIONS` preflight returns every allowed header; the Docker image
   copies every module the server imports.
3. Push to **the repo and branch Render deploys from**, written at the top of the
   README ("Deployed from: <repo> · branch `main` · root `<path>` · auto-deploy on").
   Prefer deploying from this workspace's repo with a Root Directory over a copy.
4. If environment variables changed (or became required): set them first, then
   *Save, rebuild, and deploy*.
5. Verify live: `GET /` shows the new `version` and `commit`; an `OPTIONS` request
   with `Access-Control-Request-Headers: authorization,…` lists them; `/health` is
   200. `npm run check:proxy` does the first two.
6. Only then publish a page that raises `SERVICES.x.min` (proxy first, page second;
   every proxy release keeps accepting the previous page).
7. Smoke test from the hosted page: Settings > Connections says "Awake · vX"; run
   one real action.
8. Rollback: Render > Rollback; the page's `min` must not require the rolled-back version.

Reference: `fetch/render/gemini-pdf/README.md` ("Deploy checklist", "Deployed
from" line, still to be confirmed against Render) and `CHANGELOG.md`.

### 7.5 The shared Lark proxy

Every tool depends on it for every Lark call and for login, so it follows 7.1-7.4
too, and these rules:

- It adds the app secret **only** to `POST /authen/v2/oauth/token` (the
  `authorization_code` grant). It **never** adds credentials to
  `tenant_access_token` / `app_access_token` requests, and has **no public
  `/token` endpoint**.
- It forwards only to `open.larksuite.com` / `accounts.larksuite.com`.
- It forwards `GET` and `POST`, passes `Authorization` through, and caps bodies at
  30 MiB (`MAX_BODY_BYTES`): room for Lark's 20 MiB one-shot upload (`LARK.maxUploadMb`).
- Its source lives in this workspace and it reports `GET /` like any proxy
  (`"service": "lark-cors-proxy"`, with a `version`).
- Admin scripts read `LARK_APP_ID` / `LARK_APP_SECRET` from the environment or a
  git-ignored `.env` (template `.env.example`), get a tenant token directly from
  `auth/v3/tenant_access_token/internal`, and call Lark directly; they never get
  tokens from the proxy. Reference: `F: tests/lark-node.mjs` (reads
  `tools/.env`), `P: tests/lark-node.mjs` (`credentials`, `tenantToken`,
  `makeCall`; reads `.env`), `F: tools/setup_lark_table.py`.
- **Status (Oct 2026): open.** The live proxy still lists `/token` and adds the
  secret to tenant-token requests, so anyone can get an app token that reads and
  writes the Bases. No admin script depends on it any more; close it now. Its
  source isn't in this workspace yet. `F: tests/check-proxy.mjs` fails while
  `/token` is listed.

---

## 8. App shell, state and tooling

### 8.1 Shell

Follow `mineski-design-language/references/tech-shell.md` (head order, theme
script, cache-busting loader with an import map listing **every** module, module
entry, boot watchdog). Additionally:

- One build global `APP_BUILD`; `main#main`; per-view `document.title`
  ("All briefs · Fetch", "Briefs · Polaris").
- `<meta name="referrer" content="strict-origin-when-cross-origin">` and a CSP
  `<meta>` with `default-src 'self'` and a `connect-src` that lists only `'self'`,
  the proxies, any API the page calls directly, and `http://127.0.0.1:*` for local
  overrides (this alone stops a token being sent anywhere else). Reference:
  `P: index.html`. Open: Fetch's CSP sets only `connect-src` (no `default-src`);
  both still allow `http://localhost:*`.
- A localhost-only `?preview` hook in the loader (8.4).
- `beforeunload` warns while a long task or a write is in flight.

### 8.2 State, routes and wiring

- One state object `S`; `render()` derives the DOM from it; view modules
  re-render only their part. Hash routes from a route table; the default route is
  the tool's main task; Settings opens logged out.
- **View modules are factories that take a `ctx`** (`{S, call, render, toast,
  sessionEnded, track, ensureTime, …}`); shared modules expose **subscriptions**
  (`service.on`, `settings.on`, `auth.onEnded`, `auth.onShared`) rather than global DOM events.
  Reference: `P: js/app.js` `ctx` with `createInbox`, `createUniverse`,
  `createCollections` and the `ROUTES` table. Open: Fetch's only factory is
  `createSettingsView`; compose, result and the briefs list are still inside a
  1,750-line `app.js` with a hand-written `route()`.
- Pure logic (rules, mapping, normalizing, building payloads) in pure modules;
  network code receives `call(method, url, body, opts)` as a parameter, so Node
  scripts pass a direct caller. Reference: `F: js/tables.js`, `js/ops.js`,
  `js/verify.js`, `js/rows.js`; `P: js/sync.js`, `js/ops.js`.

### 8.3 Local development

| Port (always `http://127.0.0.1:<port>/`) | Use |
| ---------------------------------------- | --- |
| 9123 | Polaris |
| 9124 | Fetch |
| 9125 | Suppliers |
| 9126+ | each new tool (the starter uses 9126 as a placeholder; claim one and add it here) |
| 9140 | design-language showcase |
| 8000 | Fetch's Gemini proxy, locally |
| 8001 | the Lark proxy, locally |

- Register each tool's address on the Lark app's Redirect URLs. Use `127.0.0.1`,
  never `localhost` (they are different origins, with different storage and
  different redirect entries).
- Serve with the shared server, `mineski-design-language/tools/serve.py`, copied
  unedited into `<tool>/tools/serve.py` with only `PORT` set:
  `Cache-Control: no-store` and explicit `.js` → `text/javascript` (some Windows
  machines serve `.js` as `text/plain`, and module scripts then refuse to run).
  It also refuses to start on a port that's taken (on Windows, Python's default
  SO_REUSEADDR lets a second server share the port, and the browser then gets
  "didn't send any data" from whichever one Windows picks) and keeps serving if its
  console goes away. Not `python -m http.server`.
- `.claude/launch.json` runs `tools/serve.py` on the tool's port; `npm run serve`
  does the same.
- Dev overrides: Settings > Advanced (persisted in `<tool>.settings`) and
  `?<service>=<url>` links (tab-scoped in sessionStorage `<tool>.override.<service>`,
  `?reset` clears), accepted only on a local page and only for `https:` or local
  `http:` addresses. Every active override, including a table or environment
  override, shows one red top-bar badge ("Overridden") whose title lists what is
  overridden. Reference: `F: js/settings.js` (`cfg`, `on`, Lark, Gemini and table
  overrides), `P: js/settings.js` (Lark only). Open: Fetch's badge says "Override".

### 8.4 Testing

Every tool has a dependency-free `package.json` with the same script names:

| Script | What it does |
| ------ | ------------ |
| `serve` | the shared dev server on the tool's port |
| `test` | offline tests of the pure modules, with fixtures from real Lark payloads and an in-memory fake Lark for the write paths |
| `check:live` | read-only, against the configured tables: the schema check, plus building every payload the page would write and validating it against live options |
| `check:proxy` | `GET /` of every service: version ≥ `min`, required headers allowed (and an `OPTIONS` preflight); fails if the Lark proxy lists `/token` |
| `check:shell` | import map lists every `js/*.js` and every import points at a listed module; shared assets (and `theme.css`) byte-identical to the design language, `js/session.js` to this skill's `assets/session.js`; watchdog, `main#main`, referrer and CSP metas present; `node --check` on every module; no secret-shaped strings in any publishable file; no em-dashes in UI strings |
| `check:e2e` | writes to the **test copy only** (refuses unless `APP.env === "test"` and the test links are set): snapshot every field, do one of each write, redo each (expect "already done"), and assert the before/after diff is exactly the intended cells |
| `setup` | the spec-driven setup/repair script, dry run by default |
| `preview:fixture` | saves a git-ignored, read-only snapshot for `?preview` |
| `test:proxy` | the tool proxy's unit tests, if it has one |

- Check scripts live in `tools/` (`check-shell.mjs`, `check-proxy.mjs`); tests,
  fakes and fixtures in `tests/`. Open: Fetch keeps its check scripts in `tests/`.
- **Preview mode** (`?preview` on localhost): a shim intercepts `fetch` and XHR
  to the proxies, answers reads from a snapshot (git-ignored when it holds real
  data) or a committed synthetic fixture, simulates writes in memory, fakes a
  session (`window.MINESKI_PREVIEW = true`, so under `mineski.preview.auth.*`,
  never over a real login) and shows a red "Preview mode" badge. Reference: `P: tests/preview-shim.js`,
  `tests/make-preview-fixture.mjs`. **Open: Fetch has no preview mode at the
  moment** (it was added during the parity work, then removed).
- Reference for the rest: `P: tools/check-shell.mjs`, `tools/check-proxy.mjs`
  (the better bases: preflight, import targets, theme, metas), `tests/sync.test.mjs`,
  `tests/check-live.mjs`, `tests/e2e-core.js` + `e2e.html` (the e2e runs in the
  browser as the person, because the Lark app itself can't edit those Bases);
  `F: tests/fake-lark.mjs`, `tests/ops.test.mjs`, `tests/run-all.mjs`,
  `render/gemini-pdf/tests/`.

---

## 9. Browser storage

| What | Where | Key |
| ---- | ----- | --- |
| Theme, tab, view preferences | localStorage | `<tool>.theme`, `<tool>.tab`, `<tool>.uniSort`, … |
| Developer overrides and personal settings | localStorage | `<tool>.settings` (one JSON object) |
| Drafts (with their `client_token`) | localStorage | `<tool>.draft` (versioned, with an age limit) |
| Cached business data (optional) | localStorage | `<tool>.cache.<app>:<table>` = `{v, at, rows}` |
| Login, shared by every tool (4.2) | localStorage | `mineski.auth.token`, `mineski.auth.user` (through `js/session.js` only) |
| Login in progress | sessionStorage | `<tool>.auth.pending` |
| Typed-but-unsaved text, unsaved edits, tab-scoped overrides | sessionStorage | `<tool>.composeText`, `<tool>.edits`, `<tool>.override.<service>` |

- **JSON only**, through `store()`/`recall()` (never throw; the page works in a
  private window). No raw strings.
- **Cached business data** is allowed for an instant first paint ("Updated 4 min
  ago · Refreshing…"), but: keyed by table, without volatile URLs, used only while
  logged in, revalidated on load and on return, **never used as the basis for a
  write without a re-read**, and **dropped whenever a session ends**, not only on
  logout (shared computers). Reference: `F: js/app.js` (`dropCache`,
  `fetch.cache.<app>:<table>`). Polaris keeps no cache, on purpose.
- **Clear local data**: each tool declares its local-data keys once (a
  `LOCAL_KEYS` list); one click clears them with Undo; the login and theme are
  kept, and the toast says so. Reference: `P: js/app.js` `LOCAL_KEYS`,
  `F: js/app.js` `clearLocal`.
- **Renaming a key** uses a dated, idempotent inline migration as the first script
  in `<head>`: a fixed format per key (never guessed from the value), the new key
  wins, the old key is removed only after a verified copy, and the block is
  deleted after about 3 months. Reference: `F: index.html` (`bx.*` → `fetch.*`,
  remove after January 2027), `P: index.html` (`polaris.proxyOverride` →
  `polaris.settings`, login keys → `polaris.auth.*`; tested in
  `tests/tools.test.mjs`).
- Per-tool prefixes keep keys apart but are **not isolation**: every site on one
  `github.io` origin can read them, and the login is shared across the origin on
  purpose (4.2). Publish only Mineski tools on it (a dedicated account or a custom
  domain), never anyone else's page.

---

## 10. Security summary

- No secrets in pages or repos; personal keys (Fetch's Gemini key) are opt-in, per
  browser, sent only to their own service (and to Google for "Test key"), and
  removable in Settings.
- Admin secrets only in a git-ignored `.env`, with a committed `.env.example`.
- Tokens only in `Authorization` headers to the proxies, never in a URL; strip
  `?code` before the exchange; referrer policy and CSP metas (8.1).
- Overrides only on a local page, validated, always badged.
- Proxies: login check before reading bodies, fail closed, no token in logs,
  origin allow-list, rate limits; the shared Lark proxy never mints app tokens
  (still open, 7.5).
- **One login per origin**: the token in `mineski.auth.token` can be read by any
  script on the origin and lasts until it expires (about 2 hours), even after the
  tab closes; Log out clears it for every tool. So only Mineski tools are published
  on that origin, every tool keeps its CSP (`connect-src` limits where a token can
  be sent), and the README says that closing the tab doesn't log you out.
- Drop cached client data on session end; document what stays in the browser in
  the README's "Security and privacy".

---

## 11. Documentation

Each tool's README follows the order in `tech-shell.md` ("README for the team"),
with the icon at the top, and includes: Settings (with the storage keys), How it's
built (a diagram like section 1, or "How it works"), Testing (the `package.json`
scripts and what each needs), Security and privacy (including the login shared by
every tool, that closing the tab doesn't log you out, and that Log out is local
and logs out of every tool), and a **Troubleshooting** table headed "You see | What to do"
quoting the exact UI strings (including "couldn't start", "Out of date", the
override and preview badges, and "users see an old version"). Each proxy README
starts with its "Deployed from" line, keeps a CHANGELOG, and carries the deploy
checklist (7.4). Reference: both tools' READMEs (Oct 2026).

### 11.1 Versions and the changelog

Every tool has one version, **`APP.version` in `js/config.js`** (semver), and a
**`CHANGELOG.md`** at the tool's root that logs every change and version update,
newest first:

```markdown
## 1.1.0 · Nov 3, 2026

- Briefs can be marked Done from the list.
```

- **Every release** bumps `APP.version` and adds an entry with the same number and
  the date, in the team's words (what changed for them, not the code). Patch for
  fixes, minor for new features or behaviour, major when people must relearn
  something or old data or links stop working. Fetch and Polaris start at 1.0.0
  ("Initial release", Oct 16, 2026).
- **The top bar shows it** beside the name: `<span class="brand-ver"
  id="appVersion">` (shared style in `mineski-base.css`), filled with
  `v${APP.version}` at start-up, with the title "<Tool> version 1.0.0". It is
  quiet (muted, 11.5px) and stays on small phones, where the name hides, so
  anyone can check at a glance which version they're running.
- **`check:shell` fails** if `APP.version` and the newest `## x.y.z` entry in
  `CHANGELOG.md` differ, or the top bar has no `#appVersion`.
- A tool proxy keeps its own version and CHANGELOG (7.2, 7.4); the page's
  `CHANGELOG.md` notes when a release needs a newer proxy.
- Reference: `F:`/`P: js/config.js`, `CHANGELOG.md`, `js/app.js` `renderHeader`,
  `F: tests/check-shell.mjs`, `P: tools/check-shell.mjs`.

---

## 12. Review checklist

- [ ] All config in `js/config.js`; tables as links through `parseBaseLink`; `APP.env` + Test copy badge; the date offset only in `LARK`; Node scripts import it.
- [ ] `APP.version` shown in the top bar (`#appVersion`) and matching the newest entry in `CHANGELOG.md` (11.1).
- [ ] Login: one `handleRedirect` (strip `?code` first, wake, 45 s single exchange), pending expires, `returnTo` validated, profile cleared on login, redirect probe after wake and again after a failure.
- [ ] Session: 30 s grace for new work, `workToken` for running work, clock 20 s + visibility, amber < 10 min, sticky warning at 5 min, `ensureTime` on **every** write, `track` around writes, shared dead-token set.
- [ ] Shared login (4.2, 4.4): `js/session.js` copied unedited and in the import map, `adopt("<tool>")` at load, `onShared` handled (login screen → in, renewal → warning closed, person changed → data dropped), ended elsewhere → `end(…, { elsewhere })` after running work, Log out says "every Mineski tool", preview under `mineski.preview.auth.*`.
- [ ] `canWrite()` gates writes with a read-only notice.
- [ ] Every service through `createService`: `GET /` ping, strict JSON awake test, version/CORS compatibility, 3-minute backoff wake, status row in Settings (wakes when Settings opens).
- [ ] Reads retried after wake; writes never retried; `uncertain` outcomes re-checked, never rolled back, never called "nothing was written".
- [ ] Ad-blocker detection per service; banner names the host(s).
- [ ] Schema spec checked on load; affected actions off with a plain list naming the table.
- [ ] Paging (records and fields) throws on truncation; `batch_get` for single rows.
- [ ] Creates: persisted `client_token`, duplicate re-check when there's a natural key, replay fix-up. Updates: `safeUpdate` (re-read, expectations, changed cells only). Never blanks or placeholders. Selects via `matchOption`; unknown values kept.
- [ ] Read-back after every write, returning the stored record; "All N fields checked" or a mismatch list.
- [ ] A write queue (if any) follows 6.9: same write path, one at a time, never resent automatically, time checked per item, persisted with tokens, uncertain items re-read.
- [ ] Uploads over XHR with progress, `bitablePerm`, size check; a failed upload stops the save and offers "Save without these files".
- [ ] `describe(err)` covers the shared code table (with a coverage test).
- [ ] Storage: `<tool>.*`, JSON only, caches dropped at session end, `LOCAL_KEYS` + Clear local data with Undo, dated migrations for renamed keys.
- [ ] Proxy (if any): narrow job, `lark_auth.py`, limits, `GET /` standard, nested error JSON, CORS list tested, origins and max-age set, Dockerfile `COPY *.py`, CHANGELOG + "Deployed from".
- [ ] Dev: registered `127.0.0.1` port, the shared `tools/serve.py`, `package.json` scripts, `check:shell` passes, `.env.example` committed.
- [ ] Tests: offline pure-logic tests with a fake Lark, `check:live`, `check:proxy`, `?preview`, e2e on a test copy.
- [ ] README per section 11.

---

## 13. Shared modules (roadmap)

Like `ui.js` and `icons.js`, these live in this skill's `assets/` and are copied
**unedited** into each tool's `js/`; improvements go back to the skill first, and
`check:shell` compares the copies. The first one exists: **`session.js`**, the
shared login (Nov 5, 2026). The tools implement nearly all the others
separately, so extraction is mostly a merge; the table names the better base and
what to merge in from the other tool.

| Module | API (summary) | Better base | Merge in from the other tool |
| ------ | ------------- | ----------- | ---------------------------- |
| `lark/net.js` | `createService({id, label, url, def, freshMs})` → `.status`, `.on`, `.wake`, `.host`, `.isFresh`, `.isBlocked`; `onAnyService`, `blockedHosts`; `lark(method, url, {token, body, read, timeout})`; `upload(url, form, {token, onProgress, timeout})` (XHR); `setDeadTokenHandler`; `LarkError` | Fetch `js/net.js` | Polaris: XHR `uploadToBase` + `uploadEntries`/`uploadToken`/`uploadSizeProblem`, `serviceVerdict`/`cmpVersion` (`js/service.js`), the wider `uncertain` rule |
| `session.js` | `KEY`, `readToken`, `writeToken`, `readUser`, `writeUser`, `clear`, `isLive`, `adopt`, `onChange` (4.2) | **done**: `mineski-systems-design/assets/session.js` | — |
| `lark/auth.js` | `createAuth({…})` → `handleRedirect`, `startLogin`, `currentToken`, `token`, `workToken`, `busyWorking`, `msLeft`, `endsAt`, `canWrite`, `loadUser`, `user`, `redirectProblem`, `startClock`, `ensureTime`, `track`, `relogin`, `logout`, `onEnded`/`end`, `onShared`, `onBeforeLogin` (built on `session.js`) | Fetch `js/auth.js` (Suppliers' is the same shape) | Suppliers: the proxy's "origin not allowed" check in `redirectProblem`; Polaris: move its clock out of `app.js` |
| `lark/tables.js` | `parseBaseLink`, `loadFields`, `loadRecords`, `getRecord`, `findRecord`, `createRecord`, `updateRecord`, `deleteRecords`, `newClientToken`, `tableUrl` (all take `call` with an explicit `{read}`) | Fetch `js/tables.js` | Polaris: `findRecord` (returns `null`); `createRecord` with no record → `uncertain` |
| `lark/schema.js` | spec shape of 6.2; `checkSchema`, `checkNeeded`, `checkAll`, `blockers`, `presentColumns`, `writableOnly`, `selectOptions`, `optionsOf` | Fetch `js/schema.js` | Polaris: several tables keyed by name, `index` lists, table title in messages |
| `lark/cells.js` | `plain`, `clean`, `num`, `numOf`, `people`, `shortName`, `isBlank`, `matchOption`, `toLarkDay`, `fromLarkDay`, `parseDay`, `canon`, `sameCell`, `cellSig` | Fetch `js/cells.js` | Polaris `js/sync.js`: `people`, `shortName`, `parseDay` (switch its offset from hours to minutes) |
| `lark/verify.js` | `verifyWritten`, `readBack` (returns the record), `safeUpdate`, `diffPatch`, `safeCreate` | Fetch `js/verify.js` | Write `diffPatch` (from Fetch `rows.changedCells`, Polaris `invoiceDetailsPatch`) and `safeCreate` (Polaris's index re-check + Fetch's replay fix-up) |
| `lark/errors.js` | `describe(err, {app, host, blocked, redirect, deleting})`, `describeWrite`, `DEAD_TOKEN_CODES`, `MAPPED_CODES`, `isDeadToken`, `isUncertain`, `AlreadyDone`, `WriteBlocked` | Polaris `js/errors.js` (the `BY_CODE` table) | Fetch: `describeWrite`, the error classes, the delete variant, 413, `notFound`, multi-host blocking; align the context keys (`redirect` vs `address`, `blocked` list vs flag) |
| `settings.js` | `createSettings({key, defaults, overridable})` → `cfg`, `get`, `set`, `overrides`, `on` | Fetch `js/settings.js` | generalise over every service in `SERVICES` |
| `shell.js` | `mountHeader({auth, settings, envLabel})`: session pill, avatar, env and override badges | both `js/app.js` | — |
| `tools/serve.py` | the dev server | **done**: `mineski-design-language/tools/serve.py` | — |
| `tools/check-shell.mjs`, `tools/check-proxy.mjs` | 8.4 | Polaris `tools/` | Fetch: the em-dash and `/token` checks, every service in `SERVICES` |
| Preview shim core | 8.4 | Polaris `tests/preview-shim.js` | XHR interception for uploads |
| `lark_auth.py` (server) | `LarkAuth(base_token, table_id, required, ttl).verify(header)` | Fetch `render/gemini-pdf/lark_auth.py` | make the tool name in its messages a parameter |

Each tool keeps only its domain modules (Fetch: brief model, row mapping, the
document, sources and evidence; Polaris: the transfer rules, inbox, tables), its
table specs and `config.js`.
