# Audit 01: Lark login, identity and session handling

> **Historical (Oct 2026).** This audit describes Fetch and Polaris *before* the systems-parity
> work. Its file:line references and findings are out of date: both tools were changed to meet
> `../mineski-systems-design/SKILL.md`. For the current state and what is still open, see that
> guide and `SYSTEMS-PARITY.md` at the workspace root.

Read-only audit of **Fetch** (`fetch/`) and **Polaris** (`polaris/`), with
`fetch/tech/lark-user-login/` as prior art. UI look is out of scope (see
`design-ref/mineski-design-language/`); this covers behaviour, storage, error
handling and security.

**Files read:** `fetch/js/auth.js`, `settings.js`, `settings-view.js`, `app.js`, `extract.js`,
`lark.js`, `config.js`, `fetch/index.html`, `fetch/render/gemini-pdf/lark_auth.py`,
`gemini_proxy.py`, `fetch/README.md`, `fetch/tools/setup_lark_table.py`;
`polaris/js/auth.js`, `net.js`, `app.js`, `inbox.js`, `collections.js`, `ui.js`,
`polaris/index.html`, `polaris/README.md`, `polaris/tests/preview-shim.js`, `lark-node.mjs`,
`e2e.html`; `fetch/tech/lark-user-login/index.html` + `README.md`; design-language
`references/tech-shell.md`, `principles.md`, `feedback-and-states.md`, `patterns.md`.

Paths are relative to the repo root. `F:` is Fetch, `P:` is Polaris, `PA:` is the prior art
(`fetch/tech/lark-user-login/index.html` unless noted).

---

## 0. Top findings (by priority)

1. **The user-login model can be bypassed at the proxy.** The shared Lark proxy hands out
   *app* tokens to anyone who asks: `GET /token` (documented in `fetch/README.md:571-576`, used by
   `fetch/tools/setup_lark_table.py:13,98`). It also appears to add the app credentials to
   `auth/v3/tenant_access_token/internal`: `polaris/tests/lark-node.mjs:10-17` posts an **empty
   body `{}`** through `/proxy` and expects a tenant token back. Fetch's README says that token can
   read **and write** the briefs Base. Polaris's README says the app can *read* Polaris's Bases
   (`polaris/README.md:344`), which means Universe and Collections financial data. The proxy URL
   is in public JS. Lock this down before anything else (§S1). *(The proxy's source isn't in this
   workspace, so this is inferred from its callers.)*
2. **Fetch leaves `?code=` in the address bar for the whole token exchange.** It strips the code
   only *after* `finishLogin` resolves (`F: js/app.js:1368-1370`), even though the comment says "at
   once". Polaris strips it *before* the exchange (`P: js/app.js:553`), and so does the prior art
   (`PA:1094`). A reload during a slow exchange replays a spent code.
3. **Fetch's code exchange has no proxy wake-up and no timeout** (`F: js/auth.js:51-67,121-128`).
   If the proxy is asleep, the user gets an endless spinner or a 502, and the single-use code is
   lost. Polaris waits with `wake()`, then gives the exchange a 45 s limit
   (`P: js/auth.js:82-86`) and shows a "waking up" message on the busy screen
   (`P: js/app.js:527-531`).
4. **The dead-token code lists disagree.** There are four of them:
   - Fetch `lark.js:23`: `{20005, 99991661, 99991663, 99991668, 99991677}`
   - Fetch `auth.js:157`: `{20005, 99991668, 99991677}`
   - Polaris `net.js:205`: `{20005, 99991668, 99991677}`
   - `lark_auth.py:40`: adds `99991671`

   As a result, Polaris shows "Lark said: … (code 99991663)" instead of ending the session.
5. **Polaris never clears the cached profile on a new login** (`P: js/auth.js:94-99`). Fetch does
   (`F: js/auth.js:142`). If someone uses "Log in again" and picks another Lark account, Polaris
   keeps showing the previous person's name and avatar.
6. **The write-time guard has gaps in both tools.**
   - Fetch checks only extraction (2 min, `app.js:485`) and save (1 min, `app.js:987`). It doesn't
     check *Mark done* (`app.js:1206`) or *Delete* (`app.js:1238-1244`).
   - Polaris checks push (`inbox.js:752`) and invoice-details save (`collections.js:177`), but not
     the optimistic *Ignore/Undo* write (`inbox.js:219-255`).
7. **The session clock can end the session while a write is still running.** Both tools'
   `tickSession` call `sessionEnded` as soon as fewer than 30 s remain.
   - Polaris: `sessionEnded` sets `S.data = null` (`app.js:212`). A push that is still in flight
     then crashes in `afterPush` (`app.js:315-318` reads `d.universe`), and the catch block shows
     "Nothing was written" in a closed sheet, even though Lark *did* write.
   - Fetch guards only extraction (`app.js:138`), not saves.
8. **A failed "Log in again" fails silently in both tools while the old token is still valid.**
   `loginNote` is set (`F: app.js:1371`, `P: app.js:556`), but the user is routed to a work view
   where that note is never shown.
9. **Only Polaris checks scope:** `canWrite()` (`P: auth.js:31-34`) plus a read-only banner
   (`P: inbox.js:65-68`). Fetch has neither and finds out at save time (99991679).
10. **Only Fetch has a server-side token check:** `lark_auth.py`, which runs user_info plus a
    table probe, caches by SHA-256, fails closed and never logs headers. It's the right pattern
    for any future Mineski service that accepts a Lark user token.
11. **Fetch never shows that an override is active.** It computes `c.OVERRIDDEN`
    (`F: settings.js:62`), but nothing reads it, and a `?lark=` override never appears anywhere.
    Polaris shows a top-bar override badge (`P: app.js:162`, `index.html:55`), which the design
    checklist requires.

---

## A. OAuth flow

### A1. Where the app id, scopes and endpoints come from
- **Fetch:** `cfg()` from `js/config.js:15,19-20,24`:
  - `LARK_PROXY_URL`
  - `LARK_APP_ID = "cli_aab0716138b8ded3"`
  - `LARK_SCOPES = "bitable:app"`
  - `LARK_API_BASE = "https://open.larksuite.com/open-apis"`

  `AUTHORIZE_URL` is hard-coded in `js/auth.js:24`.
- **Polaris:** constants in `js/auth.js:11,15-17` (`APP_ID`, `SCOPES`, `AUTHORIZE_URL`, `OPEN_API`).
  The proxy is `HOSTED_PROXY` in `js/net.js:12`.
- **Match:** same values (same Lark app, same scope), stored in different places.
- **Standard:** keep these in **`js/config.js`**, as the tech-shell says ("links, labels… the
  hosted proxy URL"). The shared auth module should receive them as configuration
  (`{appId, scopes, proxyBase}`) and never hard-code them. Keep `AUTHORIZE_URL`/`OPEN_API` as
  module constants, because they're the same for every tool.

### A2. Authorize URL and parameters
- **Fetch:** `js/auth.js:89-93`. Uses `accounts.larksuite.com/open-apis/authen/v1/authorize` with
  `client_id, redirect_uri, scope, state, code_challenge, code_challenge_method=S256`; `+` is
  rewritten to `%20`.
- **Polaris:** `js/auth.js:60-64`, identical.
- **Match:** yes. Both are byte-for-byte copies of the prior art (`PA:558-566`).
- **Standard:** keep as is. Neither tool sends `prompt`, so "Log in again" can't force Lark's
  account picker. That's acceptable; just document it.

### A3. PKCE generation
- **Fetch:** `js/auth.js:70-74` (`b64url`), `83-85`. The verifier is 32 random bytes, which
  b64url-encodes to 43 chars (the RFC 7636 minimum). The challenge is SHA-256 via `crypto.subtle`.
  The state is 16 random bytes.
- **Polaris:** `js/auth.js:41-45,54-56`, identical.
- **Match:** yes.
- **Standard:** keep as is. The comment in both (`F:81-82`, `P:52-53`) gives the right reason:
  the proxy adds the secret for anyone, so the verifier is the only thing that binds the code to
  this tab.

### A4. State check and pending-login storage
- **Fetch:** `js/auth.js:86-88` stores `{state, verifier, returnTo}` in sessionStorage
  `fetch.auth.pending` and fails with a clear message if storage is blocked. In `finishLogin`
  (`110-111`) it reads the pending value and deletes it immediately, then checks `error` first
  (`113-117`) and then the state (`118-120`): "That login started in another tab. Log in again
  here."
- **Polaris:** `js/auth.js:57-59,70-80`, identical except for the key (`polaris.pending`).
- **Match:** yes.
- **Standard:** keep as is. Two small hardenings:
  1. Accept `returnTo` only if it matches `^#\/[\w\-\/%.]*$`. It comes from the tab's own
     storage, so this is defence in depth only.
  2. Add a `createdAt` to the pending object and reject anything older than about 10 minutes.
     Lark's code lives 5 minutes, so a stale pending value only produces confusing errors.

### A5. Redirect URI computation
- **Fetch:** `js/auth.js:23`: `location.origin + location.pathname.replace(/index\.html?$/i, "")`.
- **Polaris:** `js/auth.js:14`, identical.
- **Match:** yes.
- **Standard:** keep as is. The query (Fetch's `?lark=`/`?gemini=` test parameters) is dropped, and
  that's fine because Fetch keeps those in sessionStorage (`F: settings.js:66`). Document the
  registered dev addresses for each tool. They currently differ: Fetch uses
  `http://localhost:8770/` (`fetch/README.md:136`) and Polaris uses `http://127.0.0.1:9123/`
  (`polaris/README.md:298`). The secure-context messages also differ: Fetch says "localhost"
  (`auth.js:79`) and Polaris says "127.0.0.1" (`auth.js:50`). Pick one host convention for all
  tools, or register both hosts for each.

### A6. "Redirect not registered" (20029) probe
- **Fetch:** `js/auth.js:170-186`. It first returns a "file" message for non-http(s) pages. Then
  it sends `GET {proxy}/proxy?url=open.larksuite.com/…/authen/v1/authorize?client_id&redirect_uri&scope`
  with `cache:"no-store"` and searches the HTML for `"code":\s*(\d+)`:
  - `20029` produces the "isn't registered … Security Settings > Redirect URLs" message;
  - any other code together with `errorPage` produces "Lark rejected a test login (code N)";
  - a network failure gives `null` ("can't tell").

  It runs once per page load (`app.js:107-113`).
- **Polaris:** `js/auth.js:121-137`, the same logic without `cache:"no-store"`. It runs once
  (`app.js:190-197`) and also calls `wake()` (`app.js:192`).
- **Match:** yes, apart from the cache option and the wake call.
- **Standard:** Polaris's version (wake on the login screen) plus Fetch's `cache:"no-store"`.
  Also fix a gap that both share: if the proxy was asleep, the probe gives up ("can't tell") and
  is **never retried**, because `redirectChecked` is already true. Run the probe *after*
  `wake()` resolves (`await wake(); redirectProblem()`), and re-run it whenever the login view is
  shown again after a failure. The prior art showed a "Checking…" line and a "✓ registered" line
  (`PA:504,525`). A UI decision, but useful in dev.

### A7. Secure-context check
- **Fetch:** `js/auth.js:78-80`: "Logging in needs https (or http://localhost)."
- **Polaris:** `js/auth.js:49-51`: "…https (or http://127.0.0.1)…"
- **Match:** same logic, different wording.
- **Standard:** use one message in the shared module, naming the tool via config.

### A8. Handling `?code=` / `?error=` on boot
- **Fetch:** `js/app.js:1364-1372` shows the busy view and *awaits* `auth.finishLogin` first. Only
  after that does it call `history.replaceState(… pathname + returnTo)`. The `?code` stays visible
  and reloadable during the exchange. Because the pending entry is already consumed, a reload
  ends in "That login started in another tab".
- **Polaris:** `js/app.js:546-556` shows the busy view, then calls
  `history.replaceState(null, "", pathname + hash)` **before** the exchange (comment at
  `551-552`), and calls `replaceState` again with `returnTo` afterwards.
- **Match:** **no.**
- **Standard:** **Polaris's** order: strip the code synchronously before any `await`. The prior
  art does the same (`PA:1094`). Put the whole sequence in one shared `auth.handleRedirect()` so
  no tool can get the order wrong.

### A9. Token exchange
- **Fetch:** `js/auth.js:121-128`:
  - `POST {proxy}/proxy?url=${LARK_API_BASE}/authen/v2/oauth/token` with
    `{grant_type:"authorization_code", client_id, code, redirect_uri, code_verifier}`;
    there's no `client_secret`, because the proxy adds it.
  - Transport is `larkJSON` (`51-67`): plain `fetch`, `cache:"no-store"`, **no timeout, no wake**.
  - An HTTP error without a JSON body produces "The Lark connection answered with an error
    (HTTP n)".
- **Polaris:** `js/auth.js:81-93`:
  - The same request, but first `if (!await wake()) throw …network`, then
    `lark(…, {timeout: 45000})`.
  - It never retries, which is correct for a single-use code (`net.js:75`: `read=false` means no
    retries).
- **Match:** **no.**
- **Standard:** **Polaris's**. Wake first, then send exactly once with a timeout, and never retry.
  Lark's code is valid for 5 minutes and is single-use ([Feishu docs: Get
  user_access_token](https://open.feishu.cn/document/authentication-management/access-token/get-user-access-token?lang=en-US)).
  `wake()` can take up to 3 minutes, so keep `wake` capped at about 3 min and the exchange at
  45 s. That keeps the total under 5 min.

### A10. Login error mapping
| Code | Fetch (`js/auth.js:96-105,131-135`) | Polaris (`js/net.js:177-186`) | Prior art (`PA:428-448`) |
|---|---|---|---|
| proxy says `{"error":"not found"}` | "doesn't support logging in. Check its address in Settings." (`131-133`) | same idea (`177-179`) | `PROXY_OUTDATED` |
| 20001, 20002 | "couldn't complete the login. Try again in a moment." | **not mapped** (generic "Lark said: …") | on the token step, 20001/20002/20063 mean the "proxy is missing the secret" |
| 20003, 20004, 20065 | "code expired or was already used" | same | same |
| 20049 | "login check failed, probably another tab" | same | "PKCE check failed" |
| 20071 | "came back to a different address" | same | same, plus the URI |
| 20010 | "account isn't allowed to use this app yet. Ask the app admin" | same | same |
| 20005 / 99991668 / 99991677 | not on the login path (see B7) | "Your login has ended. Log in again." | same |
| 99991679 | in `lark.js:27` | "missing a permission … Log out, then log in again." | names the missing scopes from `permission_violations` |
| `?error=access_denied` | "Login cancelled. Fetch needs your OK…" (`114-115`) | "Login cancelled. Polaris needs your OK…" (`74-75`) | same |
| other `?error=` | "Lark couldn't log you in (x). Try again." | same | same |

- **Match:** mostly. Polaris is missing 20001/20002. Neither shows Lark's `error_description` on
  `?error=`.
- **Standard:** one `AUTH_MESSAGES` table in the shared module, taken as the union of the three.
  Use the prior art's diagnosis for 20001/20002/20063 ("The connection service couldn't complete
  the login (its Lark app settings may be wrong). Try again; if it keeps happening, tell the
  admin.") and keep the tool name as a parameter. Use `j.error_description || j.msg` as the
  fallback detail. Have the 99991679 message list `permission_violations[].subject` when present,
  as the prior art does (`PA:443-448`).

### A11. Return-to-route after login
- **Fetch:**
  - Login screen: `returnTo = location.hash` unless it's `#/login`, defaulting to `#/`
    (`app.js:102`).
  - Session end: same, via `showLogin`.
  - "Log in again" (Settings, the 5-min toast): `login(location.hash)` (`app.js:174,183`,
    `settings-view.js:35`).
  - After the exchange: `res.returnTo || location.hash || "#/"` (`app.js:1370`).
- **Polaris:**
  - Login screen: `S.returnTo = location.hash || "#/briefs"` (`app.js:106`).
  - Session end: `S.returnTo = location.hash` (`app.js:214`).
  - After the exchange: `returnTo` unless it's empty or `#/`, then `#/briefs` (`app.js:555`).
  - A boot with no hash is replaced by `#/briefs` (`557-558`).
- **Match:** yes in substance; only the default route differs, which is correct per tool.
- **Standard:** `handleRedirect({defaultRoute})` in the shared module, with the `returnTo`
  validation from A4.

---

## B. Session

### B1. Token storage
| | Fetch | Polaris |
|---|---|---|
| Token key | `fetch.auth.token` (`auth.js:25`) | `polaris.token` (`auth.js:19`) |
| Pending key | `fetch.auth.pending` | `polaris.pending` |
| Profile key | `fetch.auth.user` | `polaris.user` |
| Area | sessionStorage | sessionStorage |
| Token JSON | `{access_token, scope, expires_at}` (`auth.js:137-141`) | same (`auth.js:94-98`) |
| Profile JSON | `{name, avatar, email}` (`auth.js:161`) | same (`auth.js:113`) |
| Helpers | `store`/`recall` from `ui.js` (JSON, never throw) | same (`ui.js:54-63`) |
| Legacy migration | `bx.auth.*` → `fetch.auth.*` (`index.html:49`) | – |

- **Match:** the format is identical, the keys differ.
- **Standard:** keep **sessionStorage** (`tech-shell.md:69`). Name keys
  `<tool>.auth.{token,pending,user}` (Fetch's pattern, grouped and self-describing); this means
  migrating Polaris's three keys and updating `polaris/tests/preview-shim.js:16-19` and
  `tests/e2e.html:38`. Don't share one key across tools (see S4). `expires_at` is computed
  client-side from `Date.now() + expires_in` (default 7200), which avoids clock-skew problems.
  Keep that.

### B2. Validity and expiry check
- **Fetch:** `auth.js:30-33` treats the token as valid only if more than 30 s remain. `msLeft`
  and `endsAt` use the raw expiry (`36-37`); `token()` returns the string or `""` (`34`).
- **Polaris:** `auth.js:23-29`, identical (no `token()` helper; `app.js:92` builds one).
- **Match:** yes.
- **Standard:** keep the 30 s grace, and export both `currentToken()` and `token()`.

### B3. Session clock and pill
- **Fetch:**
  - `tickSession` runs every 20 s (`app.js:1390`) and on `visibilitychange` (`1391`).
  - `renderHeader` (`146-163`) writes `#sessionLeft` with `fmt.duration`, sets `.is-low` under
    10 min (`98`), and fills in the title and aria-label "Logged in for X more, until T".
  - The Settings line is "Logged in until T · X left" (`settings-view.js:23,184-187`).
- **Polaris:** a 20 s interval (`app.js:544`), `visibilitychange` (`536-538`), `renderHeader`
  (`158-182`), the same thresholds and strings (`23,171-174`), and the Settings line
  (`459-461,490-491`).
- **Match:** yes, including copy.
- **Standard:** move it into the shared module as `startClock({onTick,onWarn,onEnd})`. Both
  tools have the same 20 s interval, visibility hook, 10-min low and 5-min warning.

### B4. 5-minute warning
- **Fetch:** `app.js:171-176`: `type:"error"`, `timeout:0` (sticky), "Your Lark login ends at T.
  Log in again to keep working without a break." with an action "Log in again". `warnedLow` is
  reset on session end (`135`).
- **Polaris:** `app.js:492-497`: `type:"warn"` with `detail`, default timeout, "Your login ends
  at T." plus the detail "Log in again to keep working without a break." `warnedLow` is never
  reset, which doesn't matter in practice because every login reloads the page.
- **Match:** **no** (type, copy and stickiness).
- **Standard:** use **Polaris's copy and type**, which match `feedback-and-states.md:145`
  exactly, together with **Fetch's `timeout: 0`**. The warning is time-critical and actionable,
  and a timed toast can expire while the tab is in the background. Reset `warnedLow` on session
  end (Fetch).

### B5. Refusing writes under 1 min and long tasks under 2 min
- **Fetch:**
  - `ensureLoginTime(ms, what)` (`app.js:180-186`) shows the toast "Your Lark login is about to
    end, so Fetch didn't {what}. Log in again first." with the action "Log in again".
  - It's used for extraction at 2 min (`485`) and save at 1 min (`987`).
  - **Not used** for *Mark done* (`1206`) or *Delete* (`1244`).
- **Polaris:**
  - `ensureTime()` (`app.js:220-226`) is fixed at 60 s and shows "Your login is about to end, so
    this wasn't sent." with the detail "Log in again, then push it." (matches the design spec).
  - It's used by push (`inbox.js:752`) and details save (`collections.js:177`).
  - **Not used** by Ignore/Undo (`inbox.js:219`).
- **Match:** partly. Fetch's helper is generic; Polaris has the spec's copy.
- **Standard:** use `auth.ensureTime(ms = 60_000, {detail})` with **Fetch's parameterised
  duration** and **Polaris's spec copy**. Call it on **every** write, however small (delete,
  done, ignore), and use 2 min for long tasks (extraction, multi-file uploads).

### B6. A login that ends during an action
- **Fetch:**
  - **Extraction:**
    - If there's no token, `extract.js:198-201` calls `auth.ended()` and rejects with
      `login_expired`.
    - If the service answers `login_*`, `extract.js:219` calls `auth.ended(msg)`, so
      `sessionEnded` runs. Because `S.job` is still set, it only clears the session
      (`app.js:138`).
    - The catch in `startExtraction` (`581-583`) then calls `sessionEnded` with "…Your typed text
      is kept; files need to be added again", and `showLoaderError` shows the login headings
      (`602-616`).
  - **Lark calls:** `lark.js:59-66` (`token()`) and `68-72` (`checkAuth`) call `auth.ended()`,
    which dispatches `AUTH_ENDED` (`auth.js:44-46`). The listener (`app.js:1389`) runs
    `sessionEnded`, which closes every open `dialog` (`132`) and the menu, then shows login
    (except in Settings).
  - **Draft and compose text survive:** the draft is in localStorage, the compose text in
    sessionStorage (`app.js:279-285`).
- **Polaris:**
  - `call()` rejects with a synthetic `99991677` when there's no token (`app.js:49-54`).
  - Every caller checks `isDeadToken` and calls `sessionEnded`:
    - `app.js:258` (load), `306` (Universe refresh), `563` (profile);
    - `inbox.js:248` (ignore, after rolling back), `796` (push, closes the sheet);
    - `collections.js:204,228`.
  - `sessionEnded` (`app.js:209-217`) closes dialogs and **clears `S.data`, `S.lists` and
    `S.user`**.
- **Match:** same goal, different wiring. Fetch uses one event; Polaris checks at seven call sites.
- **Standard:** a **merge**:
  1. The shared `lark()` detects dead-token codes centrally and emits `auth.ended(message)`, as
     Fetch does, so a new call site can't forget. It still throws an error with
     `err.deadToken = true`, so callers can roll back optimistic UI first, as Polaris's ignore
     does.
  2. Add an **in-flight write guard**: `auth.track(promise)`, or `beginWrite()`/`endWrite()`. The
     clock must not end the session while a write is running. The 30 s grace is client-side; Lark
     still accepts the token until it really expires. If the clock fires mid-write, defer
     `sessionEnded` until the write settles. Today Polaris can null `S.data` under an in-flight
     push and then report "Nothing was written" for a write that happened (finding 7). Fetch has
     this guard for extraction only (`app.js:138`).
  3. Like Polaris, don't clear loaded data on session end in a way that crashes in-flight
     continuations. Either null-check in `afterPush`, or clear data only after `inFlight === 0`.

### B7. Which codes count as "login is dead"
| Where | Codes |
|---|---|
| Fetch `lark.js:23` | 20005, 99991661, 99991663, 99991668, 99991677 |
| Fetch `auth.js:157` (`loadUser`) | 20005, 99991668, 99991677 |
| Polaris `net.js:205`, `net.js:185` | 20005, 99991668, 99991677 |
| Prior art `PA:342` | 20005, 99991668, 99991677 |
| `lark_auth.py:40` | 20005, 99991661, 99991663, 99991668, 99991677, 99991671 |

- **Match:** **no.**
- **Standard:** one exported `DEAD_TOKEN_CODES = {20005, 99991661, 99991663, 99991668, 99991671,
  99991677}`, the widest set (Lark's "missing / invalid / expired access token" family),
  mirrored in `lark_auth.py`. Note that Polaris's `uploadToBase(…, ctx.token())`
  (`inbox.js:742`, `collections.js:190`) can send `Bearer undefined`. Lark answers that with
  99991661, which Polaris doesn't treat as dead today.

### B8. Session-ended handling
- **Fetch:** `sessionEnded(message)` (`app.js:129-140`):
  - clears the session, closes dialogs and menus, sets the note (default "Your Lark login has
    ended. Log in again to keep going."), resets `warnedLow` and re-renders the header;
  - in Settings it repaints Settings; during an extraction it returns early;
  - otherwise it shows login. The briefs cache in localStorage is **kept**.
- **Polaris:** `sessionEnded(message)` (`app.js:209-217`):
  - clears the session, closes dialogs, and clears `S.data`, `S.lists`, `S.user`, `S.loadError`;
  - default note "Your login ended after about 2 hours. Log in again to keep going." (the
    spec's copy);
  - in Settings it stays put; otherwise it shows login.
- **Boot with an expired token:** both set "Your login ended after about 2 hours…" and clear the
  session (`F: app.js:1413-1416`, `P: app.js:564-567`).
- **Match:** mostly. Copy differs: Fetch's default for event-driven ends doesn't match the spec,
  while its clock-driven message (`app.js:168`) does.
- **Standard:** use the shared `onEnded` handler with the spec copy as the default, Fetch's
  in-flight guard (generalised as in B6), and Polaris's clearing of in-memory data.

### B9. Logout
- **Fetch:** the `logout()` hook (`app.js:1328-1337`):
  - clears `S.briefs`, `S.briefsAt` and `S.edits`, and **removes the localStorage briefs
    cache** (`cacheBriefs()` writes `null`);
  - calls `sessionEnded("You've logged out of Fetch. You're still logged in to Lark itself.")`,
    then `go("#/")`;
  - keeps the draft (`fetch.draft`, localStorage) and the compose text (sessionStorage).
- **Polaris:** an inline handler (`app.js:416-418`) calls `sessionEnded("You've logged out of
  Polaris. You're still logged in to Lark itself.")`, then sets `location.hash = "#/"`. Data was
  only ever in memory.
- **Shared limitation:** logout is **local-only**. The token stays valid at Lark until it expires
  (no revoke call), so a copied token keeps working for up to 2 h.
- **Match:** yes in behaviour and copy.
- **Standard:** `auth.logout({message})` in the shared module, which calls the tool's `onLogout`
  hook for tool data. Fetch is right to clear its cache. Also clear `fetch.composeText` and offer
  to keep or discard the draft, because the next person on a shared computer will see the resume
  banner after logging in. Document that logout doesn't revoke the token.

### B10. "Log in again" while still logged in
- **Both:** start a full OAuth round trip (a page navigation).
  - **Success:** Fetch replaces the token and clears the cached user (`auth.js:137-142`). Polaris
    replaces the token but **keeps `polaris.user`** (`auth.js:94-99`), so a different account
    shows the old name and avatar (finding 5).
  - **Failure:** the old token is still valid, so routing goes to the work view and the note is
    never shown (`F: app.js:1371`, `P: app.js:556`, finding 8).
- **Standard:**
  1. `finishLogin` always clears the cached profile (Fetch).
  2. If `!res.ok && currentToken()`, show the message as an error toast instead of a hidden note.

### B11. Multiple tabs
- **Both:** the token lives in sessionStorage, so each tab needs its own login (one click if the
  Lark browser session exists). A login started in tab A and finished in tab B fails the state
  check with "started in another tab" (`F: auth.js:118-120`, `P: auth.js:78-80`). Logging out in
  one tab doesn't affect others: there's no `storage` event or BroadcastChannel. "Duplicate tab"
  copies sessionStorage, and with it the token.
- **Match:** yes. This is documented in Fetch (`fetch/README.md:126-129`) but not in Polaris.
- **Standard:** keep per-tab sessions, as the spec says. Add the one-paragraph explanation to
  Polaris's README.

### B12. User profile (name and avatar)
- **Fetch:** `loadUser()` (`auth.js:150-164`):
  - returns the cache if present; otherwise sends `GET /authen/v1/user_info` once, with **no
    retry while the proxy wakes**;
  - on a non-zero code it returns `null` and calls `ended()` for dead codes;
  - it's started at boot (`app.js:1412`) and errors are swallowed;
  - `auth.user()` (`165`) is a synchronous read used for the header (`156`), the save summary
    "Filed by" (`975`) and the `filedBy` field written to Lark (`994`).
- **Polaris:** `loadUser()` (`auth.js:106-116`):
  - uses `lark(…, {read:true})`, which **retries while the proxy wakes** (`net.js:75`);
  - the result goes into `S.user`;
  - at boot (`app.js:560-563`), dead-token errors end the session and others are ignored.
- **Shared behaviour:** the avatar uses `referrerpolicy="no-referrer"` in both (`F:
  index.html:109`, `settings-view.js:30`; `P: index.html:64`, `app.js:408`). Neither tool reloads
  the profile if the first attempt fails; the initials show "?" until a reload.
- **Match:** same shape, different robustness.
- **Standard:** use Polaris's retrying read plus Fetch's synchronous `auth.user()` accessor and
  its cache clear on login. Retry `loadUser` once after `wake()` succeeds if it returned null.
  Fetch writes `filedBy` from the profile, so if the profile is missing at save time, load it
  before saving instead of writing `""`.

### B13. Scope and write-permission check
- **Fetch:** none. A token without `bitable:app` fails at save time with 99991679, which shows
  "Your login is missing a permission Fetch needs. Log out, then log in again." (`lark.js:27`).
- **Polaris:** `canWrite()` (`auth.js:31-34`), where an empty `scope` means "Lark didn't say, let
  it decide". It gates writes through `canWriteFor`/`canWriteNow` (`app.js:67-68`) and shows a
  banner: "Your login can only read the tables. Log in again to allow pushing."
  (`inbox.js:65-68`). The prior art has the same check (`PA:824-827`).
- **Match:** **no.**
- **Standard:** **Polaris's**, exposed as `auth.hasScope(s)` and `auth.canWrite()`. Fetch should
  disable Save/Done/Delete with the same banner.

### B14. Unsaved work across a re-login
Logging in is a full-page navigation, so anything held only in memory is lost.
- **Fetch keeps:** the draft (localStorage) and the compose text (sessionStorage).
- **Fetch loses:**
  - the picked files (stated in the message, `app.js:582`);
  - `S.edits`, the unsaved edits to saved briefs. The comment at `app.js:127-128` says "edits
    are kept in memory", but they don't survive the redirect. The `beforeunload` prompt
    (`1419-1421`) at least warns.
  - attachment tokens already uploaded during a failed save.
- **Polaris loses:** `S.drafts`, which holds what was typed in push sheets.
- **Standard:** before `startLogin`, save serialisable in-progress state to sessionStorage
  through an `onBeforeLogin` hook, and restore it after login. This meets
  `feedback-and-states.md:149-150` ("return to the same route with drafts intact"). Longer term,
  a **popup login** (the authorize page in a window that `postMessage`s the code back to the
  opener) would keep in-memory state, including `File` objects. It needs a fallback to a full
  redirect on phones and when popups are blocked.

---

## C. Downstream use of the user token

### C1. The Lark proxy
- **Fetch:**
  - Data calls use `lark.js` `api()` (`74-84`): every call is a **POST** to
    `{proxy}/proxy?url=…` with `Authorization: Bearer <token>`, a 75 s timeout, no retry, and an
    auth check on every response.
  - Uploads (`245-265`) are multipart with a 180 s timeout.
  - Login and profile calls go through the separate `larkJSON` (`auth.js:51-67`).
- **Polaris:**
  - Everything goes through `net.js` `lark()` (`68-104`), which:
    - retries reads with backoff while the proxy wakes (`75,86-90`);
    - retries rate limits once (`101`);
    - detects blockers after two quick failures (`56-58`);
    - takes an optional timeout (`47-63`).
  - `uploadToBase` (`110-128`) has **no timeout**.
  - `wake()` (`134-161`) runs one shared loop for 3 minutes.
- **Match:** **no.** There are two transports in Fetch and one stronger one in Polaris.
- **Standard:** **Polaris's `net.js`** becomes the shared transport. Fetch's `lark.js` keeps only
  its data mapping and calls the shared `lark()`. Add a timeout on uploads (Fetch's 180 s).

### C2. Fetch's Gemini proxy (the only non-Lark consumer)
- **Browser side:** `extract.js:196-206` sends `Authorization: Bearer <user token>` on the XHR to
  `{GEMINI_PROXY_URL}/extract`. A `login_required`, `login_expired` or `login_invalid` answer ends
  the session (`219`).
- **Server side, `lark_auth.py`:**
  - `bearer()` (`72-77`) accepts 20-4096 chars with no spaces.
  - `verify()` (`79-100`) caches by **SHA-256 of the token** (`88`) for `ttl=300` s
    (`LARK_AUTH_CACHE_S`, `gemini_proxy.py:129`), prunes past 2000 entries (`97-99`) and never
    caches failures.
  - `_check()` (`110-133`):
    1. `GET /authen/v1/user_info`: a dead code gives 401 `login_expired`, any other non-zero code
       gives 401 `login_invalid`;
    2. `GET /bitable/v1/apps/{base}/tables/{table}/fields?page_size=1`: a NO_ACCESS code (`42`)
       gives 403 `not_authorized`, any other non-zero code gives 503 `auth_unavailable`.
  - It **fails closed** when Lark can't be reached (`102-108`).
- **Server side, `gemini_proxy.py`:**
  - The origin and auth checks happen before the body is read (`431-439`), so strangers can't
    spend the shared key.
  - Rate limiting is per `open_id` (`450`).
  - Request logging never includes headers or bodies (`497-500`).
  - `REQUIRE_LARK_LOGIN` defaults to true (`128`).
- **Polaris:** n/a (no service of its own).
- **Observations:**
  - The cache entry ignores token expiry. A token checked 1 s before it expires is trusted for
    300 s more, so access removal and expiry both take effect only within 5 min (documented at
    `fetch/README.md:117`). That's acceptable because the browser never sends a token with under
    30 s left. Only a stolen token benefits.
  - Concurrent first requests with the same token each call Lark (no single-flight). Minor.
  - `int(info.get("code", -1) or 0)` (`112,123`) treats `"code": null` as success. Lark doesn't
    send that, but `-1` would be safer than `or 0`.
  - The probe checks *read* access to one table, so "authorised" means "can see the briefs".
    That's the intended rule.
  - The user token carries full `bitable:app` rights over every Base the person can open, and
    it's handed to the Gemini service. It's Mineski's own service and never logs the token, but
    keep it that way: a narrower scope isn't possible with one Lark app shared by both tools.
- **Standard:** make `lark_auth.py` the **reference implementation** for any Mineski service that
  accepts a Lark user token, copied unedited like `mineski-base.css`. Suggested tweaks:
  - share `DEAD_TOKEN` with the browser list (B7);
  - add a single-flight lock per key;
  - replace `or 0` with an explicit `None` check.

---

## S. Security

### S1. App-token endpoints on the shared proxy (critical)
- `GET {proxy}/token` returns an app token to anyone (`fetch/README.md:571-576`;
  `fetch/tools/setup_lark_table.py:98-99` reads `tenant_access_token`/`app_access_token` from it).
- `POST {proxy}/proxy?url=…/auth/v3/tenant_access_token/internal` with body `{}` returns a tenant
  token (`polaris/tests/lark-node.mjs:10-17`). That only works if the proxy adds the app id and
  secret to that endpoint as well.
- **Impact:** anyone can skip both tools' logins.
  - Fetch's briefs Base can be read and written (`fetch/README.md:573`).
  - Polaris's Bases can be read (`polaris/README.md:344`).
  - The proxy URL and app id are in the public JS, and the proxy's CORS isn't restricted unless
    `ALLOWED_ORIGIN` is set (`fetch/README.md:575`).
- **Standard:**
  1. On the proxy, add the secret **only** on `/authen/v2/oauth/token` (for the
     `authorization_code` grant and, if adopted, `refresh_token`). Never add it to
     `tenant_access_token`/`app_access_token`.
  2. Remove `GET /token`, or protect it with a separate admin secret.
  3. Let admin scripts (`setup_lark_table.py`, `polaris/tests/lark-node.mjs`) read
     `LARK_APP_SECRET` from the environment and call Lark directly. CORS doesn't apply to them.
  4. Restrict `/proxy?url=` targets to `open.larksuite.com` / `accounts.larksuite.com`, so a
     caller can't make the proxy forward a Bearer token anywhere.
  5. Set `ALLOWED_ORIGIN` to the Pages origin plus the registered localhost addresses.

  (The proxy source isn't in this workspace; check these against `tech/lark-proxy`.)

### S2. Tokens and codes in URLs and referrers
- **Tokens:** never in a URL in either tool. They're sent only in `Authorization` headers to the
  proxy and (Fetch) the Gemini service. `/proxy?url=` carries only Lark API URLs.
- **The login code:** briefly in the address bar. Fetch keeps it during the exchange (A8). It's
  single-use and PKCE-bound, so the risk is low, but strip it first anyway.
- **Referrer:** neither page sets a referrer policy. Browsers default to
  `strict-origin-when-cross-origin`, so cross-origin requests made while `?code=` is in the URL
  (Google Fonts, the proxy) get only the origin. **Standard:** add
  `<meta name="referrer" content="strict-origin-when-cross-origin">` (or `no-referrer`) to the
  head boilerplate so it doesn't depend on browser defaults.

### S3. Service-address overrides on hosted pages
- **Fetch:**
  - Saved overrides (Gemini URL, Lark proxy URL, table) apply only when the page is local
    (`settings.js:49,56`), and must be `https:` or local `http:` (`45-47`,
    `settings-view.js:161-162`).
  - `?gemini=`/`?lark=` apply only on a local page **and** only if the value is itself a local
    URL (`settings.js:63-71`); `?reset` clears them.
  - **No visible indicator** for the Lark override (`OVERRIDDEN` is unused, `settings.js:62`).
    The Gemini override appears only in Settings text (`settings-view.js:78`) and loader errors
    (`app.js:529`).
- **Polaris:**
  - `proxyOverride()` applies only if `isLocalPage()` (`net.js:15-20`). Any `http(s)://` value is
    accepted (`app.js:508`), and the Advanced box is hidden off-localhost (`app.js:453`).
  - A visible top-bar badge shows when an override is active (`app.js:162`, `index.html:55`).
- **Prior art (do not copy):** the proxy override is honoured on **any host** and kept in
  localStorage (`PA:360-363,1084`). A hosted copy could be pointed at a token-collecting proxy.
- **Match:** both are safe off-localhost. Fetch is stricter on values; Polaris is better on
  visibility.
- **Standard:** one shared `isLocalPage()`. Accept overrides only there, require
  `https:`/local `http:` (Fetch's `isServiceUrl`), and **always show the override badge**
  (Polaris) for every overridden service.

### S4. A shared origin on GitHub Pages
Every project site under `https://<user>.github.io/` shares one origin (`fetch/README.md:392`
touches on this). Any other page on that origin can read `sessionStorage` in the same tab,
including the prior-art demo if it's hosted there, and can read all `localStorage` (Fetch's
cached briefs, Gemini key and draft). **Standard:** host the tools under a dedicated
user/org (or a custom domain) that serves nothing else. Don't put experiments on the same
origin. Keep per-tool key prefixes, but don't treat them as isolation.

### S5. XSS exposure
Tokens in sessionStorage can be read by any script on the page. Both tools build the DOM with
`h()` and `textContent`. Error text from Lark (`j.msg`) is shown as text, and messages from
`?error=` go through `textContent`. **Standard:** add a CSP `<meta>`:
- `connect-src 'self'` plus the proxy and Gemini-service hosts (and
  `generativelanguage.googleapis.com` for Fetch's *Test key*);
- `img-src 'self' data: blob: https:`;
- `script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com`.

`'unsafe-inline'` is unavoidable while the head uses inline scripts and `document.write`.
`connect-src` alone already blocks exfiltrating the token to an arbitrary host.

### S6. Gemini proxy origin allow-list
`ALLOWED_ORIGINS` defaults to `*` (`gemini_proxy.py:41,113`). The Lark check is the real gate, so
this is defence in depth. **Standard:** set it on Render to the Pages origin plus localhost.

### S7. Polaris preview shim
`tests/preview-shim.js:16-19` overwrites `polaris.token` and `polaris.user` with a fake login.
It loads only on `localhost|127.0.0.1` with `?preview` (`index.html:38-40`), and `tests/` isn't
deployed (`polaris/README.md:309`). It's safe; it just clobbers a real login in the same tab, as
the README notes. If keys move to `polaris.auth.*` (B1), update it.

### S8. Fetch's briefs cache in localStorage
Fetch's `fetch.briefsCache` (`app.js:45-46,1054-1055`) keeps client brief data indefinitely and
is cleared only on explicit logout or *Clear local data*. A tab close or a session expiry leaves
it in place. Polaris keeps data in memory only. **Standard:** clear tool data caches on
`sessionEnded` too, or document this clearly in "Security and privacy".

---

## D. A shared auth module

Most of `fetch/js/auth.js` and `polaris/js/auth.js` is identical line for line (PKCE, `b64url`,
state, redirect URI, probe, storage, the 30 s grace, `msLeft`/`endsAt`, `loadUser`). The session
clock, `ensureTime`, `sessionEnded`, `renderHeader`'s pill and avatar block, and `initials()` are
also copied between the two `app.js` files. Following the design-language model (files copied
**unedited** into each tool), add to `design-ref/mineski-design-language/assets/`:

- **`lark-net.js`**, based on Polaris's `net.js`:
  - `HOSTED_PROXY` comes from config;
  - `isLocalPage`, `proxyOverride`/`setProxyOverride`, `proxyBase`, `proxyHost`, `viaProxy`;
  - `LarkError`, `lark(method, url, {token, body, read, timeout})` with central dead-token
    detection calling `auth.ended`;
  - `uploadToBase(file, appToken, token, {extra, timeout})` (Fetch's `bitablePerm` `extra` for
    advanced-permission Bases, `lark.js:251`);
  - `wake()`, `conn`, `onConn`;
  - `describe(err, {appName})` with the shared code table (A10, B7) and tool-specific codes
    added via a hook.
- **`lark-auth.js`**:

```js
import { createAuth } from "./lark-auth.js";
export const auth = createAuth({
  appId, scopes,                // from config.js
  keyPrefix: "fetch",           // → fetch.auth.token / .pending / .user
  appName: "Fetch",             // for messages
  defaultRoute: "#/",
  toast,                        // ui.js toast, for ensureTime / warnings
});

// session
auth.currentToken()      // {access_token, scope, expires_at} | null  (30 s grace)
auth.token()             // string | ""
auth.hadSession(); auth.msLeft(); auth.endsAt();
auth.hasScope("bitable:app"); auth.canWrite();
auth.clearSession();

// login
auth.REDIRECT_URI
auth.startLogin(returnTo)             // validates returnTo, stores {state, verifier, returnTo, createdAt}
auth.handleRedirect()                 // boot: if ?code/?error → strip URL first, wake(), finishLogin(),
                                      //   replaceState(returnTo|defaultRoute); resolves {handled, ok, message}
auth.finishLogin(params)              // lower level; always clears cached profile
auth.redirectProblem()                // 20029 probe (no-store), call after wake()

// identity
auth.loadUser({ force })              // retrying read; caches in <prefix>.auth.user
auth.user()                           // sync cached {name, avatar, email} | null
auth.initials(name)

// lifecycle
auth.onEnded(fn) / auth.ended(message)            // "lark:auth-ended" event
auth.startClock({ onTick, onWarn, onEnd,           // 20 s + visibilitychange; low <10 min,
                  lowMs, warnMs })                 //   warn at 5 min (sticky warn toast), end at grace
auth.ensureTime(ms = 60000, { what })              // spec copy; false + toast if too little time
auth.track(promise)                                // in-flight write: clock defers onEnd until settled
auth.logout({ message, onLogout })
auth.onBeforeLogin(fn)                             // serialise drafts to sessionStorage before redirect

// constants
auth.DEAD_TOKEN_CODES; auth.isDeadToken(errOrJson); auth.AUTH_MESSAGES
```

The tool-specific parts stay in each app: the header and Settings DOM (or a shared `renderPill`
helper), what "clear data" means, and the routes. On the server, `lark_auth.py` becomes the
shared reference for any proxy that accepts user tokens (C2).

---

## E. Parity gaps

**Fetch should adopt from Polaris:**
1. Strip `?code=` from the URL **before** the exchange (`P: app.js:553`). (A8)
2. Run `wake()` before the code exchange, with a 45 s timeout and a "waking up" busy message
   (`P: auth.js:82-86`, `app.js:527-531`). (A9)
3. Wake the proxy from the login screen (`P: app.js:192`), then run the redirect probe. (A6)
4. Use retrying reads for `user_info` and all Lark reads, plus blocker detection
   (`P: net.js:68-104`). (B12, C1)
5. Check scope with `canWrite()` and show the read-only banner (`P: auth.js:31-34`,
   `inbox.js:65-68`). (B13)
6. Show a top-bar override badge for any service override (`P: app.js:162`). (S3)
7. Use the spec copy for the warning toast ("Your login ends at T.", warn type) and the refusal
   toast ("…so this wasn't sent."). (B4, B5)
8. Clear in-memory and cached tool data on every session end, not just logout. (B8, S8)

**Polaris should adopt from Fetch:**
1. Clear the cached profile on every new login (`F: auth.js:142`). (B10)
2. Use the full dead-token set, including 99991661 and 99991663 (`F: lark.js:23`). (B7)
3. Map 20001/20002 login errors (`F: auth.js:103-104`). (A10)
4. Detect auth endings centrally with an `AUTH_ENDED` event (`F: auth.js:20,44-46`,
   `app.js:1389`) instead of seven `isDeadToken` call sites. (B6)
5. Defer the session end while long work runs (`F: app.js:138`), extended to writes. (B6)
6. Use a parameterised `ensureLoginTime(ms, what)` (`F: app.js:180-186`), with 2 min for long or
   multi-upload work. (B5)
7. Make the 5-minute warning sticky (`timeout: 0`, `F: app.js:174`). (B4)
8. Add `cache: "no-store"` on the redirect probe and login calls (`F: auth.js:52,177`). (A6)
9. Use `<tool>.auth.*` key naming (`F: auth.js:25`). (B1)
10. Add a README note on per-tab login (`fetch/README.md:126-129`). (B11)

**Both tools:**
1. Close the proxy's app-token holes (S1).
2. Call `ensureTime` on every write: Fetch Done/Delete, Polaris Ignore/Undo. (B5)
3. Re-run the redirect probe after the proxy wakes. (A6)
4. Surface a failed "Log in again" as a toast when the old token is still valid. (B10)
5. Keep unsaved work across a re-login (`onBeforeLogin`; a popup login later). (B14)
6. Add explicit referrer and CSP metas (S2, S5), and host on an origin that serves nothing
   else (S4).
7. Validate `returnTo` and expire stale pending logins (A4).
8. Optional, later: request `offline_access` to get a `refresh_token` from
   `/authen/v2/oauth/token` ([Feishu
   docs](https://open.feishu.cn/document/authentication-management/access-token/get-user-access-token?lang=en-US)),
   so long sessions survive past 2 h without a redirect. It needs the proxy to add the secret on
   the `refresh_token` grant, and the refresh token would live in sessionStorage (a bigger blast
   radius under XSS). Not recommended until S1 and S5 are done.
