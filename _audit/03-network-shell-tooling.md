# Audit 03: networking, resilience, configuration, app shell, storage, hosting, dev tooling, testing, documentation

> **Historical (Oct 2026).** This audit describes Fetch and Polaris *before* the systems-parity
> work. Its file:line references and findings are out of date: both tools were changed to meet
> `../mineski-systems-design/SKILL.md`. For the current state and what is still open, see that
> guide and `SYSTEMS-PARITY.md` at the workspace root.

Fetch (`fetch/`) vs Polaris (`polaris/`), measured against the shared language in
`design-ref/mineski-design-language/` (mainly `references/tech-shell.md`,
`references/principles.md` rules 7, 12, 13, `references/feedback-and-states.md`
"A sleeping service" / "Ad blocker", and `templates/starter/`).

Read-only audit. Root-level legacy copies `fetch/*.js`, `fetch/styles.css` were ignored
except where they matter for hosting. Visual design was not re-audited.

**How it was checked**

- Every file in `fetch/js/`, `polaris/js/` (net, auth, app, config, storage call sites),
  both `index.html`, `fetch/render/gemini-pdf/*` (proxy, auth, Dockerfile, render.yaml,
  README, tests), `fetch/tools/*`, `polaris/tests/*`, `polaris/package.json`, all
  `.claude/launch.json` files (root, fetch, polaris, starter), all three READMEs.
- Shared assets are byte-identical across tools and the skill (SHA-256 of `ui.js`,
  `icons.js`, `mineski-base.css` all match `design-ref/.../assets/`).
- Tests were run (no files written; Python with `-B`):
  - `fetch/render/gemini-pdf`: `python -B -m unittest discover -s tests` → **44 tests, OK**.
  - `polaris`: `node tests/sync.test.mjs` → **29 tests, 29 pass**. (`npm test` = `node --test tests/`
    fails in this sandbox only with `spawn EPERM`, because the runner spawns a child process.)
- Live probe of the public roots on 2026-10-15 (GET only):
  - `https://gemini-pdf-6wp4.onrender.com/` →
    `{"service":"gemini-brief-proxy","version":"1.4.0",...,"login":{"provider":"lark","required":true},"schema_version":1}`.
    The 1.3.0 drift described in the brief has since been fixed by a redeploy; the
    mechanism that let it happen is unchanged (see section 2.6).
  - `https://lark-proxy-dwiw.onrender.com/` →
    `{"service":"lark-cors-proxy","endpoints":["/health","/token","/proxy?url=<lark_url>"],"allowed_hosts":[...]}`:
    **no version field**, and the public `/token` endpoint is still listed.

---

## 0. Executive summary

1. **Polaris has the right networking core; Fetch has two half-cores.** Polaris's `js/net.js`
   (wake loop with exponential backoff, read retries incl. 502/503/504, ad-blocker detection,
   observable `conn` state, `describe(err)`) is the best existing implementation of the
   tech-shell rules. Fetch implements the wake/blocker logic only for the Gemini proxy
   (`fetch/js/extract.js:23-91`); its Lark proxy traffic (`fetch/js/lark.js:38-51`,
   `fetch/js/auth.js:51-67`) has **no wake loop, no read retry, no blocker detection and no
   connection state**. A cold Lark proxy answering 502 shows as "Lark error 502: HTTP 502".
2. **Timeouts are inconsistent and partly unsafe.** Polaris reads have *no* timeout
   (`net.js:47-50`, default `timeout = 0`; `app.js:53` never passes one). Fetch aborts
   *writes* after 75 s (`lark.js:38`, used by `create`/`update`/`setDone`/`remove`), which
   makes the outcome of a slow write ambiguous.
3. **No proxy reports a compatible version to the page, and the page doesn't ask.**
   Fetch's ping accepts any JSON with `service === "gemini-brief-proxy"` or `status === "ok"`
   (`extract.js:42`). The plain `GET /` ping sends no custom headers, so a deploy whose CORS
   lacks `Authorization` still looks "Awake"; only the real upload fails, as a generic
   "Couldn't reach the extraction service" (`extract.js:223-224`). The Lark proxy has no
   version at all. A standard is proposed in 2.8.
4. **Configuration is split three ways in Polaris.** Proxy URL lives in `net.js:12`,
   Lark app id/scopes in `auth.js:11,15`, the Open API base in both `auth.js:17` and
   `ops.js:13`; plus hard-coded copies in `tests/lark-node.mjs:8` and `tests/e2e.html:37`.
   Fetch keeps all of it in `config.js:10-54`. Polaris has `ENV_LABEL` and the top-bar
   badges; Fetch has neither (`fetch/index.html` has no `#envBadge`/`#overrideBadge`;
   `c.OVERRIDDEN` is computed at `settings.js:62` and never used).
5. **Dev overrides differ.** Fetch: Settings > Advanced (Gemini URL, Lark URL, table link)
   plus `?gemini=`/`?lark=`/`?reset` link overrides; no badge. Polaris: one proxy field,
   stored **raw** (not JSON) in `polaris.proxyOverride`, with a red badge; no link override.
6. **Storage naming drifts**: `fetch.auth.token` vs `polaris.token`; `polaris.proxyOverride`
   is the only raw (non-JSON) key in either tool. Fetch has a model inline migration script
   (`fetch/index.html:5-53`); Polaris has none.
7. **Port conflict and origin mismatch in dev tooling.** Port 9123 is used by Polaris
   (`polaris/.claude/launch.json:7`, root launch `:10`) **and** Fetch's `web-lark-login`
   (`fetch/.claude/launch.json:13`); Fetch also runs on 8770 (fetch launch) and 8771 (root
   launch), while its README registers `http://localhost:8770/` as the Lark redirect URL
   (`fetch/README.md:136`). `localhost` and `127.0.0.1` are different origins (different
   storage, different redirect-URL entries).
8. **Testing is lopsided.** Polaris: offline unit tests, read-only live check, browser and
   Node e2e, fixture-backed `?preview`. Fetch page: no JS tests, no preview, no e2e (the
   proxy has 44 good unit tests). Neither has lint or a shell self-check (e.g. "every
   `js/*.js` is in the import map").
9. **Security gap outside both repos:** the shared Lark proxy hands out app tokens to
   anyone (`GET /token`, still listed live; and `tenant_access_token/internal` via
   `/proxy`, which Polaris's Node checks rely on, `tests/lark-node.mjs:10-18`). Fetch's
   README already flags `/token` (`fetch/README.md:571-576`).
10. **READMEs** both carry most of the template's content but neither follows its order;
    Polaris lacks Settings, "How it's built", Design decisions, Security and Maintenance
    sections; several statements are stale (listed in 9.3).

---

## 1. Proxy communication

### 1.1 Base URLs: where they are defined

| | Fetch | Polaris | Match? |
|---|---|---|---|
| Lark proxy | `fetch/js/config.js:15` `LARK_PROXY_URL` | `polaris/js/net.js:12` `HOSTED_PROXY` | No (different module) |
| Second proxy | `config.js:12` `GEMINI_PROXY_URL` | n/a | n/a |
| Lark Open API base | `config.js:24` `LARK_API_BASE` | `polaris/js/ops.js:13` and `polaris/js/auth.js:17` (duplicated) | No |
| Lark authorize URL | `fetch/js/auth.js:24` | `polaris/js/auth.js:16` | Same value, both hard-coded in auth.js |
| Lark app id / scopes | `config.js:19-20` | `polaris/js/auth.js:11,15` | No |
| Copies elsewhere | `fetch/tools/setup_lark_table.py:25`, blocker banner default `fetch/index.html:120` | `polaris/tests/lark-node.mjs:8` (env `LARK_PROXY` fallback), `polaris/tests/e2e.html:37`, banner default `polaris/index.html:75` | Both duplicate |
| Trailing slash normalised | `settings.js:72-73` | `net.js:26` | Yes |
| Effective URL accessor | `cfg().X` rebuilt on change (`settings.js:53-75`) | `proxyBase()` (`net.js:26`) | Same idea |

**Recommended standard:** every service address and Lark constant lives in `js/config.js`
(`SERVICES`, `LARK` objects, section 3.5). Modules read the *effective* address through one
accessor (`cfg().services.lark` or `service.url()`), never a module constant. Node tools
import `config.js` instead of re-typing the URL. Banner hosts are filled from config at
boot (Fetch already overwrites `#blockHost` on status, `app.js:1393-1396`; Polaris on
`onConn`, `app.js:523-525`).

### 1.2 How requests are wrapped

| Call | Fetch | Polaris |
|---|---|---|
| Lark API (bitable) | `fetch()` + `AbortController`, **75 s for every call incl. writes** (`lark.js:38-51`, `api()` `:74-84`). Non-JSON body becomes `{code: status}` (`:43`) | `fetch()` via `send()`; `AbortController` only if `timeout` is passed (`net.js:47-63`); **reads and writes pass none** (`app.js:49-54`) |
| Login code exchange | `fetch()` no timeout, no wake first (`auth.js:51-67`, `:122-128`) | `wake()` first, then `lark(..., {timeout: 45000})` (`polaris/js/auth.js:82-92`) |
| user_info | no retry, no timeout (`fetch/js/auth.js:150-164`) | `read: true` retries (`polaris/js/auth.js:111`) |
| Redirect-URL probe | `fetch(…, {cache:"no-store"})` (`fetch/js/auth.js:177`) | `fetch()` without `no-store` (`polaris/js/auth.js:128`) |
| Wake ping | Gemini: `fetch("/", no-store)` + 90 s abort (`extract.js:32-57`, `:67`). Lark: `fetch("/")` fire-and-forget, result ignored (`lark.js:86-89`, called `app.js:1402`) | `send("/", GET, 20000)` (`net.js:144`) |
| Long task | `XMLHttpRequest` POST `/extract`, 6 min timeout, `responseType = "json"`, abort handle (`extract.js:190-230`) | n/a |
| Attachment upload | `fetch()` multipart, 180 s abort (`lark.js:245-265`) | `fetch()` multipart, no timeout (`net.js:110-128`) |
| Error type | `LarkError(message, code)` with the friendly sentence built inside lark.js (`lark.js:34-56`); `ExtractError(message, code, status, retryAfter)` (`extract.js:182-187`) | `LarkError(message, {network, status, json, raw})` carrying raw facts; the sentence comes later from `describe()` (`net.js:30-32`, `:164-203`) |

Observations:

- Fetch mixes transport and copy: messages are produced at the call site, so the same
  network failure reads differently in three places (`lark.js:45-47`, `auth.js:62`,
  `extract.js:223`). Polaris keeps facts on the error and words in one `describe()`; this
  is what `tech-shell.md:87` asks for.
- A write aborted at 75 s (Fetch) may still land in Lark. Creates are protected by
  `client_token` (`lark.js:231-236`), `batch_update` is idempotent in effect, but
  `batch_delete` and attachment uploads are not; the message ("Lark took too long… try
  again", `lark.js:46`) invites a blind retry.
- Polaris reads with no timeout can hang on a stuck TCP connection (the comment at
  `net.js:43-45` acknowledges this; only wake, reads during login, and the code exchange
  get one).
- Polaris says "Nothing was written." for *any* push error (`inbox.js:798`), including a
  network error after the request was sent, where that may not be true.

**Recommended standard (shared `net.js`, section 9.1):**

| Kind | Timeout | Auto-retry | On timeout |
|---|---|---|---|
| Wake ping `GET /` | 20 s per attempt | loop ≤ 3 min, backoff 2 s × 1.6 to 15 s | keep looping |
| Read (GET, `records/search`, `batch_get`, user_info, fields) | 60 s | yes: network errors and 502/503/504 with the backoff schedule, once after a Lark rate limit (1254290, 99991400) | retry, then "Unreachable (no answer …)" |
| Write (create/update/delete) | none client-side below 120 s; if it does time out, say "Lark didn't confirm in time. Refresh before trying again." | **never** | re-check the destination before allowing Retry (creates keep their `client_token`) |
| Upload (Lark media, `/extract`) | 180 s (Lark media), server budget + margin (`/extract`: 6 min vs `REQUEST_TIMEOUT` 280 s, OK) | never; keep the returned `file_token` on the item so a retry doesn't re-upload (Fetch `app.js:811`, Polaris `inbox.js:742` both do) | error with Try again |

Use `fetch()` everywhere except uploads that show progress (XHR, 1.7).

### 1.3 Waking sleeping Render services (ping `/`, not `/health`)

| | Fetch | Polaris | Match? |
|---|---|---|---|
| Path pinged | `/` for both services (`extract.js:36`, `lark.js:88`), with the reason in comments (`extract.js:28-31`, `lark.js:87`) | `/` (`net.js:132`, `:144`) | Yes |
| What counts as awake | HTTP 200 **and** JSON content type **and** `service === "gemini-brief-proxy"` or `status === "ok"` (`extract.js:38-42`); Render's HTML "starting" page counts as not ready | any `res.ok` (`net.js:145`); a 4xx means "down (answered HTTP n)" immediately (`:146`) | No |
| When | page load (`app.js:1401-1402`), Settings open if down/unknown (`settings-view.js:113`), tab visible again and not fresh (`app.js:1403-1405`), before extraction if not fresh (`app.js:507-537`) | login screen first render (`app.js:192`), boot (`app.js:568`), before every load (`app.js:239-241`), before the login code exchange (`auth.js:85`) | Similar intent |
| Freshness window | 4 min (`extract.js:18`, `:71`) | 60 s (`net.js:135`) | No |
| Lark proxy woken with status | No (fire-and-forget) | Yes | **Gap in Fetch** |
| Proxy's own docs | proxy docstring still says `/health` "also used by the page to wake the service" (`gemini_proxy.py:19`); proxy README says "The page pings `/health`" (`render/gemini-pdf/README.md:292`) | n/a | Stale docs |

**Recommended standard:** ping `GET /` (never `/health`, which filter lists block as
`||onrender.com/health`; Render's own health check keeps `/health`). "Awake" means a 2xx
JSON body whose `service` equals the expected name (Fetch's stricter rule, so a wrong
address or Render's HTML interstitial isn't mistaken for success). Read the version from
that same response (section 2.8). Freshness 60 s for the Lark proxy (cheap, shared), up to
4 min for a single-purpose proxy is fine; make it a per-service option.

### 1.4 Cold-start retry with backoff (~3 min, reads only)

| | Fetch (Gemini) | Fetch (Lark) | Polaris (Lark) |
|---|---|---|---|
| Wake loop | `ensureAwake(180000)`: one shared loop, fixed 3 s sleep between 90 s pings (`extract.js:74-91`) | none | `wake()`: one shared loop, 180 s budget, backoff 2 s × 1.6 capped at 15 s, 20 s per ping (`net.js:133-161`) |
| Read retry | n/a (the only call is `/extract`) | none; a slow list shows "Waking up the Lark connection…" after **5 s** (`app.js:1072-1074`) | waits `[1.5, 3, 6, 12, 20] s` on network error or 502/503/504 for `read` calls (`net.js:75-90`) after `wake()` already succeeded |
| "Waking" shown after | 1.2 s (`app.js:509`) | 5 s | 1.2 s (`net.js:140`, `app.js:240`) |
| Writes retried | no (one deliberate auto-retry of `/extract` on `upstream_unavailable`, with visible countdown, `app.js:619-631`, allowed by `feedback-and-states.md:91`) | no | no |
| Gives up with | `warm.state = "down"`, `error` e.g. "no answer within 90 s" (`extract.js:51-53`, `:86`) | the 75 s abort message | `conn.proxy = "down"`, `detail: "no answer for 3 minutes"` (`net.js:150`) |
| Stops early if blocked | yes (`extract.js:81`) | n/a | yes (`net.js:81`, `:148`) |
| Dead code | `coldLeft()` and `COLD_START_S` exported, never used (`extract.js:17`, `:94`, `:232`), a leftover of the seconds countdown the principles forbid (`principles.md:89-91`) | | |

**Recommended standard:** Polaris's schedule (exponential to 15 s, 3 min budget, 20 s ping
timeout, "waking" after 1.2 s), applied to **every** proxy a tool uses; reads retried only
after a successful wake; never retry writes. Remove `coldLeft`.

### 1.5 Ad-blocker detection (two instant failures)

| | Fetch | Polaris | Spec |
|---|---|---|---|
| Threshold | `TypeError` within **1500 ms** while `navigator.onLine !== false` (`extract.js:48`) | any thrown `fetch` within **600 ms** while online (`net.js:56`) | 600 ms (`feedback-and-states.md:100`) |
| Count | `fastFails` per Gemini ping, reset on any non-instant failure (`extract.js:49`) | module-global `quickFails`, reset on **any** successful request (`net.js:46`, `:53`) | two |
| Which traffic | Gemini pings only; Lark traffic never trips it | all proxy traffic (one proxy) | all services |
| Result | `warm.blocked` → red `#blockNote` banner naming the Gemini host (`app.js:1393-1396`, `index.html:116-123`), Settings line (`settings-view.js:70-71`), extraction error text (`app.js:524-526`) | `conn.blocked` → banner (`app.js:125`, `:523-525`), Settings (`:428`), `describe()` first branch (`net.js:167-170`) | banner + Settings + describe |
| Cleared by | next successful ping (`extract.js:43`) | successful wake/read (`net.js:91`, `:145`) or saving/resetting the override (`app.js:511`, `:519`) | |

**Recommended standard:** 600 ms, counted **per service** (a blocker usually targets one
host; a per-service counter names the right host in the banner), only for thrown network
errors (HTTP responses never count), cleared by that service's next success. When more
than one service is blocked, the banner lists every host.

### 1.6 Connection status model exposed to Settings

| | Fetch | Polaris | Starter |
|---|---|---|---|
| Service state | `warm = {state: unset/unknown/waking/warm/down, since, at, configured, error, blocked, fastFails, promise, loop}` (`extract.js:20-24`), broadcast as DOM event `fetch:status` (`:11`, `:25`) | `conn = {proxy: unknown/waking/awake/down, blocked, detail, checkedAt}` + `onConn(fn)` subscription (`net.js:35-41`) | `S.service` unknown/waking/awake/down (`app.js:52`) |
| Lark data state | derived by app hook `larkStatus()` → out/loading/ok/error/unknown (`app.js:1312-1314`) | derived in `renderSettings()` (`app.js:432-437`) | derived |
| Lark proxy state | **none** | `conn` | n/a |
| Settings rows | "Extraction service" + "Lark Base" (`fetch/index.html:379-390`, painted `settings-view.js:63-93`) | "Connection service" + "Lark tables" + one row per table with Open in Lark (`polaris/js/app.js:438-449`) | "Relay service" + "Lark Base" |
| Copy | "Awake · using the shared Gemini key", "Waking up… free servers sleep when idle (up to a minute)", "Can't reach it (reason). Fetch will keep trying…" (`settings-view.js:65-73`) | "Awake", "Waking up… This can take up to a minute.", "Unreachable (detail)" (`app.js:428-431`) = `copy-and-voice.md:103` | = Polaris |
| Host shown | yes, ` · host` (`settings-view.js:75-77`) | yes, ` · host` (`app.js:440`) | no |
| Fix-it buttons | Wake up / Refresh (`index.html:383`, `:388`) | Wake up ↔ Try again, Refresh (`app.js:441-445`) | Wake up ↔ Try again |
| Naming | `warm` | `awake` | `awake` |

**Recommended standard:** one shape per service, produced by the shared `net.js`:

```js
service.status = {
  state: "unset" | "unknown" | "waking" | "awake" | "down" | "blocked" | "outdated",
  detail: "",          // the bracketed reason: "no answer for 3 minutes", "answered HTTP 404", "v1.3.0, needs 1.4.0"
  version: "",         // from GET /
  info: {},            // the rest of GET / (e.g. Fetch's `configured`, `login.required`)
  checkedAt: 0,
}
service.on(fn)          // subscribe; returns unsubscribe
```

Settings renders one row per service from `status` (label, dot, copy from
`copy-and-voice.md:103`, host, and the version when awake: "Awake · v1.4.0"), plus the
tool's own data row. Fetch gains a "Connection service" (Lark proxy) row.

### 1.7 Upload progress

| | Fetch | Polaris |
|---|---|---|
| Long upload with progress | XHR `upload.onprogress` → percentage beside "Uploading files" (`extract.js:209-210`, `app.js:398-399`, `:443`), `upload.onload` marks the stage done (`:210`, `:546`) | n/a |
| Lark attachments | `fetch()` (no progress) (`lark.js:245-265`) | `fetch()` (no progress) (`net.js:110-128`) |
| `extra.bitablePerm` for advanced-permission Bases | sent (`lark.js:251`) | **not sent** (`net.js:114-119`) |
| Size cap | `LARK_ATTACH_MAX_MB: 10` in config (`config.js:49`) | `MAX_UPLOAD_BYTES` constant in net.js (`net.js:109`) |

**Recommended standard:** a shared `upload()` built on XHR returning `{promise, abort}`
with `onProgress`, used for any upload that can take more than ~2 s (`feedback-and-states.md:86`
"Real upload progress if there's an upload"). Lark media uploads always send `extra`
with `bitablePerm` (harmless on normal Bases, required on advanced-permission ones). The
cap comes from config and must match the Lark proxy's `MAX_BODY_BYTES`.

### 1.8 Turning failures into sentences

| | Fetch | Polaris |
|---|---|---|
| Lark codes | `FRIENDLY` map in lark.js (`lark.js:24-32`), `LOGIN_ERRORS` in auth.js (`auth.js:96-105`), `AUTH_CODES` (`lark.js:23`) | one `describe(err)` (`net.js:164-203`) incl. login codes, ranges (1254060-68), synced-table detection |
| Old-proxy detection | `j.error === "not found"` on the token exchange → "doesn't support logging in" (`auth.js:131-133`) | same check in `describe()` (`net.js:177-179`) |
| Dead-token detection | `AUTH_CODES` (5 codes) (`lark.js:23`) and a 3-code list in `loadUser` (`auth.js:157`) | `isDeadToken` (3 codes) (`net.js:205`) |
| Proxy (`/extract`) codes | handled by the proxy's own messages + per-code titles (`app.js:602-616`) | n/a |

**Recommended standard:** one shared Lark code table (login, dead token, permission, rate
limit, missing column/table) inside the shared module; each tool's `describe(err)` first
asks `net.describeNet(err)` (blocked / unreachable / outdated / timeout), then the shared
Lark table, then tool-specific codes. Dead-token codes: use the union
`{20005, 99991661, 99991663, 99991668, 99991677}` that Fetch and the proxy's
`lark_auth.DEAD_TOKEN` already use (`lark_auth.py:40` adds 99991671).

---

## 2. Fetch's Gemini proxy (`fetch/render/gemini-pdf`)

### 2.1 Structure

| File | Role |
|---|---|
| `gemini_proxy.py` (531 lines) | HTTP server (`ThreadingHTTPServer`, HTTP/1.1, stdlib), routing, CORS, rate limit, multipart, error mapping (`:320-500`), `main()` (`:503-527`) |
| `lark_auth.py` | verifies the Lark user token: `user_info` + a `fields?page_size=1` probe on the briefs table; SHA-256-keyed cache, fail-closed (`lark_auth.py:1-27`, `:79-133`) |
| `gemini_client.py`, `brief_spec.py`, `extractors.py`, `prompt.md` | Gemini calls with fallback/cooldown, schema + normalize, file conversion, prompt |
| `Dockerfile` | `python:3.12-slim`, non-root user, **explicit COPY list** (`Dockerfile:15`), `HEALTHCHECK` on `/health` (`:25-26`) |
| `render.yaml` | Blueprint: docker, `healthCheckPath: /health`, free plan, 4 env vars (`render.yaml:4-19`) |
| `tests/test_proxy.py` | 44 offline tests, Gemini and Lark mocked |
| `.dockerignore`, `.gitignore` | keep tests/docs/`.env` out of the image and repo |

Strong points worth copying to any future proxy: one narrow job, never leaks tracebacks
(`gemini_proxy.py:421-423`), logs one line per request without bodies or file names
(`:497-500`), finds the shared key under several names but logs only names (`:80-106`,
`:514-521`), SIGTERM handled (`:508-510`), the login is checked before the body is read
(`:434-439`).

Risk: the Dockerfile's explicit file list means a new module that isn't added to line 15
crashes the service at boot on Render while every local test passes.

### 2.2 Environment variables

Documented in the docstring (`gemini_proxy.py:30-49`) and the README table
(`render/gemini-pdf/README.md:219-237`): `GEMINI_API_KEY` (+ aliases, secret files),
`GEMINI_MODEL`, `GEMINI_FALLBACK_MODELS`, `MAX_FALLBACKS`, `REQUIRE_LARK_LOGIN`,
`LARK_BASE_TOKEN`, `LARK_TABLE_ID`, `LARK_AUTH_CACHE_S`, `ALLOWED_ORIGINS`,
`MAX_UPLOAD_MB`, `MAX_FILES`, `INLINE_BUDGET_MB`, `RATE_LIMIT_PER_HOUR`,
`MAX_CONCURRENT`, `REQUEST_TIMEOUT`, `TZ_OFFSET_HOURS`, `PORT`.

- `render.yaml` sets only 4 of them (`:11-19`); the rest rely on code defaults. Fine, but
  `LARK_BASE_TOKEN`/`LARK_TABLE_ID` default to Fetch's live table in code
  (`gemini_proxy.py:126-127`), so a test deployment silently authorises against production.
- Limits must be kept in sync by hand with the page (`config.js:51-53` "keep in sync with
  the proxy's MAX_UPLOAD_MB / MAX_FILES"; README `:239`). The proxy already publishes them
  in `GET /` (`gemini_proxy.py:405-406`); the page could read them instead.

### 2.3 CORS

- `_cors()` (`gemini_proxy.py:326-336`): `Access-Control-Allow-Origin` `*` or the echoed
  origin with `Vary: Origin`; methods `GET, POST, OPTIONS`; allowed headers
  `Content-Type, Authorization, X-Gemini-Api-Key`; exposes `Retry-After`; max-age 86400.
- `ALLOWED_ORIGINS` parsed at `:113`, default `*` (`render.yaml:18-19` "tighten to your
  page's origin once it's hosted"); enforced again server-side for `/extract`
  (`:431-433`, `403 forbidden_origin`). README documents `null` for `file://` (`:229`).
- Test coverage exists for the header that drifted: `test_cors_allows_authorization_header`
  (`tests/test_proxy.py:461-464`) and the user-key header (`:477-484`). The repo was right;
  the deployment was old.
- Preflight results are cached (`Access-Control-Max-Age: 86400`; browsers cap it, Chromium at
  2 h, Firefox at 24 h), so a browser that cached the old service's preflight can keep failing
  for a while after the fix. Worth knowing when diagnosing "still broken after redeploy".

### 2.4 Rate limits and abuse controls

- Per-user sliding hour window keyed by Lark `open_id`, or client IP without login
  (`gemini_proxy.py:154-176`, `:449-453`), `429 rate_limited` + `Retry-After`.
- Concurrency semaphore `MAX_CONCURRENT` (4), waits 60 s then `503 busy` + `Retry-After: 30`
  (`:139`, `:464-466`).
- Upload cap checked from `Content-Length` and while reading chunked bodies (`:360-379`).
- IP comes from the first `X-Forwarded-For` entry (`:356-358`): spoofable, but only used
  when login isn't required.
- The page honours `Retry-After` for the one automatic retry (`extract.js:221`,
  `app.js:622`).

### 2.5 Versioning and the `/` status endpoint

- `VERSION = "1.4.0"` constant (`gemini_proxy.py:70`), also in `server_version` (`:322`).
- `GET /` (`:396-408`) returns service, version, model, configured, `shared_key` (source and a
  fix-it hint, never the key), endpoints, login policy, limits, `schema_version`. Good.
- `GET /health` (`:393-395`) returns status/configured/login_required, **no version**.
- Missing from `/`: the deployed commit, the CORS allow-list/allowed headers, and `GET /`
  itself in `endpoints`. No test covers `/` (only `/health`, `tests/test_proxy.py:428-431`).
- Upgrade notes live in the README in reverse order and contradict each other
  ("Updating to v1.4" at `:266-274`, then "Updating the existing deployment (v1.1)" saying
  the version should be `"1.2.0"` at `:276-287`). There is no CHANGELOG.

### 2.6 How the deployed version drifted (live 1.3.0 vs repo 1.4.0)

The chain that allowed it, all still present:

1. **Deploy is a separate, manual act from publishing the page.** The README tells operators
   to push this folder to its own repo (`render/gemini-pdf/README.md:247-248`) and, for 1.4,
   to redeploy "at the same time as you re-upload the page" (`:268-271`). Nothing enforces
   the order or records which repo/branch Render builds from.
2. **The page never checks the version.** `ping()` accepts any `gemini-brief-proxy`
   (`extract.js:42`); `configured` is the only field read.
3. **The ping can't see CORS problems.** A simple `GET /` needs no preflight, so the old
   service looked "Awake". The real request adds `Authorization`, the preflight fails, XHR
   reports `onerror`, and the user reads "Couldn't reach the extraction service. Check your
   connection…" (`extract.js:223-224`): the wrong diagnosis.
4. **Render's health check uses `/health`**, which is fine on any version, so Render
   reported the old service healthy.
5. **The preflight cache** (2.3) can prolong the symptom after a fix.

### 2.7 The shared Lark proxy (not in this workspace)

- Source referenced as `tech/lark-proxy` (`fetch/README.md:55`, `:394`); not present here.
  Both tools depend on it for every Lark call and for login.
- Live root lists `/health`, `/token`, `/proxy?url=` and `allowed_hosts`; **no version**.
- `GET /token` returns an app token to anyone (`fetch/README.md:571-576`); Fetch's
  `tools/setup_lark_table.py:13` still uses it.
- `/proxy` forwards `auth/v3/tenant_access_token/internal` with the app secret added: Polaris's
  Node checks get an app token this way with no credentials (`polaris/tests/lark-node.mjs:10-18`).
  That is a second public path to an app-level token that can read and write every Base the
  app can.
- Body limit 10 MB (`fetch/js/config.js:47-49`, `polaris/js/net.js:107-109`), known only from comments.

### 2.8 Recommended standard for every proxy

**A. `GET /` is the version and compatibility endpoint** (no auth, `Cache-Control: no-store`,
CORS `*` for this path even when `ALLOWED_ORIGINS` is restricted, so the page can always
diagnose):

```json
{
  "service": "gemini-brief-proxy",
  "version": "1.4.0",
  "api": 1,
  "commit": "a1b2c3d",
  "endpoints": ["GET /", "GET /health", "POST /extract"],
  "features": ["lark-login", "user-key"],
  "cors": { "origins": "*", "allow_headers": ["Content-Type", "Authorization", "X-Gemini-Api-Key"] },
  "limits": { "max_upload_mb": 50, "max_files": 10, "rate_limit_per_hour": 60 },
  "login": { "provider": "lark", "required": true }
}
```

- `version`: semver; minor for additive changes (a new accepted header, endpoint, field),
  major for anything an older page can't use (`api` = major).
- `commit`: from Render's `RENDER_GIT_COMMIT` (set for Git-backed services), else a Docker
  build arg; it ties the running service to a repo commit.
- `cors.allow_headers` is read from the same constant `_cors()` uses, so it can't lie.
- `GET /health` stays minimal for Render only; pages never call it.
- The Lark proxy adopts the same shape (`"service": "lark-cors-proxy"`, `version`,
  `features: ["user-login","get-forwarding"]`), which replaces the ad-hoc
  `error === "not found"` sniffing in both tools.

**B. The page checks compatibility on every wake.** In config:

```js
export const SERVICES = {
  gemini: { url: "https://gemini-pdf-6wp4.onrender.com", service: "gemini-brief-proxy", min: "1.4.0",
            headers: ["Authorization", "X-Gemini-Api-Key"] },
  lark:   { url: "https://lark-proxy-dwiw.onrender.com", service: "lark-cors-proxy", min: "1.0.0" },
};
```

`net.js` compares `version` with `min` (and `api` major), and checks that every name in
`headers` is in `cors.allow_headers`. If not: `state = "outdated"`, `detail = "v1.3.0, needs 1.4.0"`;
Settings shows "Out of date (v1.3.0, needs 1.4.0). Ask the admin to redeploy it."; only the
actions that need it are switched off, with that sentence. Optional belt and braces: one
`GET /` carrying the required header names with dummy values triggers the real preflight;
if the plain ping worked and this one throws, the CORS rules are wrong (not a blocker, not
offline).

**C. Deploy checklist (put it in every proxy README, "Deploying" section):**

1. Bump `VERSION` (semver rule above) and add a CHANGELOG entry (newest first) saying what a
   page needs from this version.
2. Run the unit tests (`python -B -m unittest discover -s tests`), including a test that
   `GET /` reports `VERSION` and the allowed headers, and a test that the Dockerfile copies
   every module the server imports (or switch to `COPY *.py prompt.md ./`).
3. Commit and push to **the repo and branch Render deploys from**, written at the top of
   the README ("Deployed from: <repo> · branch `main` · root `fetch/render/gemini-pdf` · auto-deploy on").
   Prefer deploying from this workspace's repo with a Root Directory over a copied repo.
4. If env vars changed, use **Save, rebuild, and deploy** (README already warns, `:408`).
5. Verify: `GET /` shows the new `version` and `commit`; an `OPTIONS` preflight with
   `Access-Control-Request-Headers: authorization,x-gemini-api-key` returns them in
   `Access-Control-Allow-Headers`; `/health` is 200.
6. Only then publish a page change that raises `SERVICES.x.min` (proxy first, page second;
   each proxy release must keep accepting the previous page).
7. Smoke test from the hosted page: Settings > Connections reads "Awake · v1.4.0"; run one
   real action.
8. Rollback: Render > Rollback to previous deploy; the page's `min` must not require the
   rolled-back version.

---

## 3. Configuration

### 3.1 `config.js` shape

| | Fetch `js/config.js` | Polaris `js/config.js` | Starter `js/config.js` |
|---|---|---|---|
| Export style | one `CONFIG` object, UPPER_SNAKE keys (`:10-54`) | named exports `ENV_LABEL`, `TABLE_LINKS`, `RULES`, `UNIVERSE_VIEW` (`:8-73`) | `APP {name, key, envLabel}`, `SERVICE {hosted}`, domain constants (`:4-22`) |
| Service URLs | yes (`:12`, `:15`) | **no** (net.js) | yes |
| Lark app id / scopes / API base | yes (`:19-24`) | **no** (auth.js, ops.js) | n/a |
| Tables | token + id + url separately (`:25-28`) | links only, parsed at load (`:10-20`, parsed `app.js:18`) | n/a |
| Tool key / name | no (hard-coded `"fetch."` prefixes everywhere) | no (hard-coded `"polaris."`) | `APP.key` |
| Limits | `MAX_UPLOAD_MB`, `MAX_FILES`, `LARK_ATTACH_MAX_MB` | in net.js | n/a |
| Business rules | option labels, VAT, next steps (`:32-45`) | `RULES` (`:22-66`) | `PRIORITIES`, `STAGES` |
| Lark host in links | `mineskiglobal.sg.larksuite.com` (`:28`) | `mineskiglobal.larksuite.com` (`:11-19`) | |

Fetch layers per-browser settings on top through `settings.js` (`cfg()` rebuilt on change,
`settings.js:1-13`, `:51-75`); Polaris reads config modules directly plus `proxyOverride()`.

### 3.2 `ENV_LABEL` / "Test copy"

- Polaris: `ENV_LABEL = ""` (`config.js:8`) drives the top-bar badge (`app.js:160-161`,
  `index.html:52`) and a sentence in Settings (`app.js:450-452`). The e2e check refuses to
  run unless `ENV_LABEL === "Test copy"` (`tests/e2e.html:54`, `tests/e2e-core.js:1-2`):
  a display string doubles as a safety gate. Switching environments means hand-editing five
  links (`README.md:319-322`).
- Fetch: no env label and no badge element. A developer can point Fetch at another table
  through Advanced (`settings.js:60-61`) and nothing in the top bar says so.

### 3.3 Developer overrides

| | Fetch | Polaris | Starter |
|---|---|---|---|
| Settings > Advanced | Gemini URL, Lark URL, Lark table link (`index.html:391-401`, `settings-view.js:159-175`), shown only on a local page (`settings-view.js:107`) | proxy URL only (`index.html:205-216`, `app.js:453-456`, `:506-522`) | one URL |
| Applies only on localhost | yes: saved values ignored on hosted pages (`settings.js:56`) | yes: `proxyOverride()` returns "" off localhost (`net.js:17-20`) | yes |
| Validation | https anywhere, or http to localhost (`settings.js:45-47`) | must start with `http://` or `https://` (`app.js:508`) | localhost only |
| Storage | `localStorage fetch.settings` (JSON) | `localStorage polaris.proxyOverride` (**raw string**) (`net.js:19`, `:23`) | `relay.svc` (JSON) |
| Link override | `?gemini=` / `?lark=` (local page **and** local target), tab-scoped in sessionStorage, `?reset` clears (`settings.js:63-71`) | none | none |
| Visible while active | only text in the Settings line and the loader error, and only for `?gemini=` (`settings-view.js:77-78`, `app.js:529`); no `LARK_OVERRIDDEN`; `c.OVERRIDDEN` unused (`settings.js:62`) | red "Proxy override" badge (`index.html:55`, `app.js:162`) | red "Service override" badge |
| localhost regex | `localhost|127.0.0.1|[::1]|*.localhost` (`settings.js:43`) | same (`net.js:15`); the preview loader uses a narrower one (`index.html:38`) | same |

**Recommended standard:** one shared `settings.js` (9.2). Overrides only on a local page;
values must be https, or http to localhost (Fetch's rule: lets a developer test a staging
Render deploy from localhost). Sources: Settings > Advanced (persisted) and `?<service>=`
links (tab-scoped, `?reset` clears), both producing **one** red top-bar badge whose title
lists what is overridden ("Lark proxy: http://localhost:8001 (from the link)"). Same label
in every tool (pick one: the starter's "Service override" is generic enough for two proxies).
A table/environment override also shows the env badge.

### 3.4 Secrets policy

- Neither page contains a secret. App id, Base/table tokens and proxy URLs are public
  identifiers. Both READMEs say so (`fetch/README.md:377-381`, `:549-551`).
- Fetch stores the user's own Gemini key in `localStorage` inside `fetch.settings`
  (`settings.js:109`), sent only to the proxy (`extract.js:205-206`) and to Google on
  Test key (`settings.js:90`); documented with the shared-computer caveat
  (`fetch/README.md:552-557`). Acceptable as an opt-in; storing it in its own key
  (`fetch.geminiKey`) would let "reset settings" and "remove key" be independent.
- Lark tokens live in `sessionStorage` in both (`fetch/js/auth.js:25`, `polaris/js/auth.js:19`), never in URLs; `?code=` is
  stripped (`fetch/js/app.js:1370`; Polaris strips it *before* the exchange, `app.js:551-553`,
  which is safer on reload).
- Preview fixture with real data is git-ignored (`polaris/.gitignore:2`).
- **Gap:** the Lark proxy's public token minting (2.7). Recommended: protect `/token` and
  block `tenant_access_token`/`app_access_token` in `/proxy` unless a server-side admin
  header is present; Node tools read the app secret from a git-ignored local `.env` instead.

### 3.5 Recommended config pattern

```js
/* <Tool>: everything a maintainer may change. No secrets: the site is public. */
export const APP = { name: "Polaris", key: "polaris", env: "live" };   // env: "live" | "test"
export const ENV_LABEL = APP.env === "test" ? "Test copy" : "";        // derived, never a gate

export const SERVICES = {                                               // hosted defaults (see 2.8 B)
  lark: { url: "https://lark-proxy-dwiw.onrender.com", service: "lark-cors-proxy", min: "1.0.0" },
};
export const LARK = {
  appId: "cli_aab0716138b8ded3", scopes: "bitable:app",
  api: "https://open.larksuite.com/open-apis",
  authorize: "https://accounts.larksuite.com/open-apis/authen/v1/authorize",
  tzOffsetMinutes: 480, maxUploadMb: 10,
};
export const TABLES = {                                                 // links, parsed at load
  live: { universe: "https://…/base/…?table=…", /* … */ },
  test: { universe: "https://…/base/…?table=…", /* … */ },
};
export const RULES = { /* business rules, option labels exactly as Lark spells them */ };
```

Gates (e2e "test copy only") check `APP.env === "test"`, not a label. A localhost-only
`?env=test` link override (badge shown) replaces hand-editing links.

---

## 4. App shell

### 4.1 `index.html` loader, import map, cache busting

| Item | Fetch `index.html` | Polaris `index.html` | Starter | Match? |
|---|---|---|---|---|
| `<head>` order | charset → **migration script** → no-cache metas → viewport (`:4-58`) | charset → no-cache metas → viewport (`:4-9`) = spec (`tech-shell.md:32`) | spec | Fetch deviates (harmless; the migration must precede the theme script, which it still would after the metas) |
| Theme script | `fetch.theme` (`:72`) | `polaris.theme` (`:22`) | `relay.theme` | Yes |
| Build id global | `window.APP_BUILD` (`:78`) | `window.POLARIS_BUILD` (`:28`) | `APP_BUILD` | No |
| Import-map file list | 12 files, complete (`:79-80`; matches `fetch/js/`) | 12 files, complete (`:29-30`; matches `polaris/js/`) | 4 | Yes, but hand-maintained |
| CSS with `?v=` | theme, base, app (`:83-85`) | same (`:33-35`) | same | Yes |
| Icons | `?v=1.2.1` manual (`:64-66`, `:96`, `:128`) | no version (`:14-16`) | none | No |
| Dev-only loader hook | none | `?preview` on localhost injects `tests/preview-shim.js` (`:37-40`) | none | Polaris only |
| Module entry | `document.write` of `js/app.js?v=` (`:447`) | same (`:291`) | same | Yes |
| `main` id / skip link | `main#app`, skip to `#app` (`:91`, `:115`) | `main#main` (`:45`, `:70`) = spec (`tech-shell.md:51`) | `#main` | No |
| Top-bar badges | none | `#envBadge`, `#overrideBadge` (`:52`, `:55`) | both | Fetch missing |
| Blocker banner | `#blockNote` (`:116-123`) | `#blockNote` (`:71-78`) | same | Yes |

### 4.2 Boot watchdog

Identical in both and the starter: 8 s, `data-booted`, banner + Reload, prepended to main
(`fetch/index.html:435-445`, `polaris/index.html:279-289`). Fetch sets `data-booted`
after wiring, before the async login finish (`fetch/js/app.js:1407`); Polaris at the end
of module evaluation, while `init()` runs (`polaris/js/app.js:571`). Both satisfy
`tech-shell.md:45-49`. Match.

### 4.3 Module layout

| Concern | Fetch | Polaris |
|---|---|---|
| Transport + wake + blocker | split: `extract.js` (Gemini, also file prep and ETA), `lark.js` (Lark, also field mapping), `auth.js` (own `larkJSON`) | `net.js` only |
| Login | `auth.js` (191 lines) | `auth.js` (137 lines); nearly identical PKCE flow, `finishLogin`, `redirectProblem` |
| Config/settings | `config.js` + `settings.js` (cfg layering) + `settings-view.js` | `config.js`; settings view inside `app.js` (`:403-482`) |
| Pure logic (Node-testable) | `brief.js` (pure, but untested); `lark.js` mapping imports `auth.js`/`settings.js`, which read `location` at import, so it can't load in Node | `sync.js` (pure, 29 tests), `ops.js` takes `call()` injected, so the Node checks reuse it unchanged |
| Views | `app.js` (1426 lines: compose, processing, result, briefs, menus, settings hooks), `doc.js`, `pdf.js` | `app.js` (shell), `inbox.js`, `universe.js`, `collections.js`, `polaris-ui.js` |

### 4.4 State object and routing

| | Fetch | Polaris | Spec |
|---|---|---|---|
| State | `S` (`app.js:34-43`) | `S` (`app.js:26-46`) | one `S` |
| Render model | per-view imperative `show*()` + targeted paints (`showView` `:65-77`) | one `render()` deriving views from `S` (`:122-152`), modules render their parts | `render()` from `S` (`tech-shell.md:56`) |
| Routes | `#/`, `#/result`, `#/briefs`, `#/briefs/<id>`, `#/settings` (+ `/key`) (`:4-9`, `:81-90`) | table `ROUTES` (`:98-99`): `#/briefs` default, `pars`, `invoices`, `andon`, `audit`, `universe`, `collections`, `settings` | hash routes |
| Default | `#/` compose | rewrites empty hash to `#/briefs` (`:557-558`) | `#/` |
| Login gate | every route but settings (`:84`) | same (`:103-107`) | same |
| Return after login | `loginState.returnTo` (`:102`) via PKCE pending state | `S.returnTo` (`:106`) | yes |
| `document.title` per view | not updated (always "Fetch · Mineski") | not updated | updated (`starter app.js:71`, `tech-shell.md:33`) |
| `beforeunload` | job running or unsaved edits (`:1419-1421`) | **none** (a push can be in flight, `S.working`) | required mid-task (`feedback-and-states.md:88`) |

### 4.5 Event wiring between modules

- Fetch: DOM `CustomEvent`s on `document`: `fetch:status` (`extract.js:11`),
  `fetch:settings` (`settings.js:18`), `fetch:auth-ended` (`auth.js:20`); and a `hooks`
  object injected into the Settings view (`settings-view.js:13`, `:118-119`,
  `app.js:1311-1359`). `app.js` also dispatches `fetch:status` itself to repaint Settings
  for Lark (`app.js:28`, `:1097-1099`), overloading the event's meaning.
- Polaris: a `ctx` object passed to view factories (`app.js:75-95`) and an `onConn()`
  subscription (`net.js:37`, `app.js:523-533`); dead logins return as errors checked with
  `isDeadToken` and handled by `ctx.sessionEnded`.

**Recommended standard:** Polaris's pattern: view modules are factories taking `ctx`;
shared modules expose small subscriptions (`service.on(fn)`, `settings.on(fn)`,
`auth.onEnded(fn)`) instead of global DOM events. It is explicit, greppable and testable.

### 4.6 Shell recommendations

- Same build global (`APP_BUILD`) and `main#main` everywhere.
- Drop the manual `?v=1.2.1` on icons (favicons are cached by browsers regardless) or put
  them through the same `?v=` build id; pick one.
- Add a check (7.5) that the import-map list equals `ls js/*.js`; a forgotten file still
  loads, but without `?v=`, which silently reintroduces stale code.
- Preview hook in the loader (Polaris) is a good generic pattern: keep it, use the shared
  `isLocal` regex.
- Polaris: add `beforeunload` while `S.working.size > 0`.
- Both: set `document.title` per view.

---

## 5. Storage

### 5.1 Key inventory

| Key | Area | Format | Written at | Cleared by "Clear local data" |
|---|---|---|---|---|
| `fetch.theme` | local | JSON string | `ui.js initTheme` via `settings-view.js:120` | no |
| `fetch.settings` | local | JSON `{geminiUrl, larkUrl, larkTable, geminiKey}` | `settings.js:20`, `:77-84` | no |
| `fetch.draft` | local | JSON draft | `app.js:38`, `:649`, `:655` | yes |
| `fetch.briefsCache` | local | JSON array of records | `app.js:45`, `:1055` | yes (also on logout, `:1328-1336`) |
| `fetch.etaFactor` | local | JSON number | `extract.js:160`, `:175` | yes |
| `fetch.auth.token` / `.pending` / `.user` | session | JSON | `auth.js:25` | no |
| `fetch.composeText` | session | JSON string | `app.js:280` | no |
| `fetch.override.gemini` / `.lark` | session | JSON string | `settings.js:65-67` | no |
| `polaris.theme` | local | JSON string | `app.js:19`, `:502` | no |
| `polaris.tab` | local | JSON string | `app.js:19`, `:112` | no |
| `polaris.auditHidden` | local | JSON array | `inbox.js:315` | yes |
| `polaris.uniSort`, `polaris.uniCollapsed` | local | JSON | `universe.js:11` | yes |
| `polaris.colSort`, `polaris.colCollapsed` | local | JSON | `collections.js:12` | yes |
| `polaris.proxyOverride` | local | **raw string** (`localStorage.getItem/setItem` directly) | `net.js:13`, `:19`, `:23`; also read raw by `tests/e2e.html:36` | no |
| `polaris.token` / `.pending` / `.user` | session | JSON | `auth.js:19` | no |

All other access goes through `store()`/`recall()` (`ui.js:54-63`, try/catch, JSON). The raw
key is the one place a shared helper would break it: `recall()` on a raw URL throws in
`JSON.parse` and returns `null`.

### 5.2 Drafts and caches

- Fetch autosaves the extraction draft (debounced 400 ms, `app.js:652-656`), offers Resume
  (`index.html:155-160`, `app.js:296-298`), keeps typed text across the login redirect in
  sessionStorage (`app.js:278-285`), normalises old drafts on open (`app.js:660`).
- Fetch caches the briefs list in localStorage for instant display (`app.js:45-46`,
  `:1054-1060`), refreshed when older than 30 s (`:1258`). It is cleared on logout, but not
  when a session just expires, so client data persists on that computer.
- Polaris keeps data only in memory (`S.data`), reloads on return after 5 min
  (`app.js:22`, `:536-543`); push-sheet text is kept per card in memory (`S.drafts`,
  `app.js:43`).

### 5.3 Clear local data

- Fetch: one click with Undo restoring draft, files, cache, edits and ETA factor
  (`app.js:1338-1358`); copy says key and login are kept (`index.html:406`).
- Polaris: `LOCAL_KEYS` list (`app.js:21`) cleared with Undo (`:465-482`); not `polaris.tab`
  or the override (reasonable).
- Starter: `["draft","cache"]` + typed text (`starter app.js:351-356`).
  Same behaviour, three implementations.

### 5.4 Migrations

- Fetch: inline `<head>` script moves `bx.*` → `fetch.*`, fixed per-key formats, new key
  wins, old key removed only after the copy reads back equal, safe on every load, dated with
  a removal window (`fetch/index.html:5-53`; README `:448-451`). Model implementation.
- Polaris: none. Needed if the override key changes (5.5).

### 5.5 Recommended storage standard

- Keys `<tool>.<name>`; login keys `<tool>.auth.token|pending|user` (Fetch's naming; Polaris
  renaming costs at most one re-login since they're tab-scoped, no migration needed).
- Everything JSON through `store()`/`recall()`. Move Polaris's override into
  `polaris.settings = { larkUrl }` with a dated inline migration in Fetch's style
  (raw `polaris.proxyOverride` → `polaris.settings.larkUrl`), and update `tests/e2e.html:36`.
- Each tool declares `LOCAL_DATA_KEYS` once; a shared `clearLocal(keys)` returns an undo
  function. Caches of business data (Fetch's briefs list) are also dropped when the session
  ends, not only on Log out.
- Normalise everything read back (both already validate shapes, e.g. Polaris `app.js:28`,
  `universe.js:22-23`).

---

## 6. Hosting

| | Fetch | Polaris |
|---|---|---|
| Target | GitHub Pages from repo root, documented (`README.md:359-387`) | any static host, "upload the folder" (`README.md:305-313`) |
| `.nojekyll` | present (`fetch/.nojekyll`) | absent. Note: without it Jekyll skips dotfiles, which happens to keep `tests/.preview-fixture.json` unpublished if ever committed; adding `.nojekyll` makes the `.gitignore` the only guard |
| Extra published files | `render/`, `tools/`, `tech/` demo pages, and the legacy root `*.js`/`styles.css` that the README says to delete "in the next release" (`README.md:167-168`) | `tests/` incl. `preview-shim.js`, `e2e.html` (harmless: localhost/login/env gated) |
| Redirect URLs | `http://localhost:8770/` + Pages URL (`README.md:136`) | `http://127.0.0.1:9123/` + Pages URL (`README.md:298-299`, `:310-311`) |
| Same Lark app | yes, `cli_aab0716138b8ded3` (`config.js:19`) | yes (`auth.js:11`) |

**Recommended:** both repos publish only the site (or accept extras explicitly); delete
Fetch's legacy root files; standardise local origins on `127.0.0.1:<port>` and register one
fixed port per tool on the shared Lark app (7.1).

---

## 7. Dev tooling and testing

### 7.1 `launch.json` ports

| Config | File:line | Command | Port | Notes |
|---|---|---|---|---|
| fetch "web" | `fetch/.claude/launch.json:5-8` | `tools/serve_web.py 8770` | 8770 | no `url`; README's registered redirect is `localhost:8770` |
| fetch "web-lark-login" | `fetch/.claude/launch.json:11-15` | `tools/serve_web.py 9123` | **9123** | exists because `127.0.0.1:9123` is registered on the shared Lark app |
| fetch "gemini-local" | `fetch/.claude/launch.json:18-21` | `render/gemini-pdf/gemini_proxy.py 8000` | 8000 | |
| polaris "page" | `polaris/.claude/launch.json:5-9` | `python -m http.server 9123` | **9123** | |
| root "polaris" | `.claude/launch.json:5-17` | `http.server 9123 --directory polaris` | **9123** | |
| root "fetch" | `.claude/launch.json:20-26` | `fetch/tools/serve_web.py 8771` | 8771 | not a registered redirect; login stops at Lark error 20029 (the login screen will say so, `auth.js:170-186`) |
| starter | `templates/starter/.claude/launch.json:7` | `http.server 9123` | 9123 | every new tool inherits the clash |
| design-ref showcase | `design-ref/README.md:30` | `http.server 9140` | 9140 | |

**Conflict: yes.** Fetch (login config) and Polaris both want 9123; they can't run side by
side, and when run one after the other they share the `127.0.0.1:9123` origin's storage
(prefixes keep keys apart, but it's fragile). Fetch has three page ports in use (8770,
8771, 9123) for one app.

**Recommended port registry** (add to `tech-shell.md`, register each `http://127.0.0.1:<port>/`
on the Lark app): Polaris 9123, Fetch 9124, starter/new tools 9125+, Gemini proxy local 8000,
Lark proxy local 8001 (already Fetch's convention, `config.js:7`), showcase 9140. Always
`127.0.0.1`, never `localhost`.

### 7.2 Serve scripts

- Fetch `tools/serve_web.py`: `ThreadingHTTPServer` on 127.0.0.1, `Cache-Control: no-store`,
  explicit MIME types for `.js/.mjs/.css/.webmanifest` because a Windows registry entry can
  make Python serve `.js` as `text/plain` and module scripts then refuse to run
  (`serve_web.py:17-25`). It prints `http://localhost:<port>` (`:31`) while binding
  127.0.0.1 (`:32`).
- Polaris and the starter: `python -m http.server` (no cache control, default MIME map),
  so on an affected Windows machine the page shows "couldn't start".

**Recommended:** one shared `tools/serve.py` (Fetch's script, generalised: `--port`,
`--dir`, prints the 127.0.0.1 URL), used by every `launch.json`, `package.json` `serve`
script and the starter.

### 7.3 `package.json` scripts

- Polaris (`package.json:6-12`): `serve`, `test` (`node --test tests/`), `check:live`,
  `check:e2e`, `preview:fixture`. No dependencies. Good.
- Fetch: no `package.json`; proxy tests are a Python command in two READMEs.

**Recommended:** every tool has a dependency-free `package.json` with the same script names:
`serve`, `test` (offline), `check:live` (read-only against Lark), `check:proxy` (the live
`GET /` version check, 2.8), `check:shell` (7.5), optionally `check:e2e`,
`preview:fixture`. Fetch: `"test:proxy": "cd render/gemini-pdf && python -B -m unittest discover -s tests"`.

### 7.4 Tests that exist

| | Fetch | Polaris |
|---|---|---|
| Offline unit (page logic) | none (`brief.js` normalise/dates/markdown are pure but untested) | `tests/sync.test.mjs` 29 tests of the transfer rules with real-data quirks (all pass) |
| Proxy unit | 44 tests (`render/gemini-pdf/tests/test_proxy.py`, all pass); README still says "32" (`README.md:335`); no test for `GET /` or the Dockerfile COPY list | n/a |
| Live read-only | `tools/setup_lark_table.py` dry run shows the column plan (`:9-11`); its `FIELDS` must be kept in sync by hand with `js/lark.js` `FIELD` (`setup_lark_table.py:17`, README `:646-648`) | `tests/check-live.mjs`: schema, card lists, every payload, using the page's own `ops.js`/`sync.js` (`:1-8`); exit code on failure (`:135-136`) |
| E2E (writes) | none | browser `tests/e2e.html` (as the user; two-click arm `:58-64`) and Node `tests/e2e.mjs` (`--yes` required, `:11-14`); refuses unless test copy |
| Preview mode | none | `?preview` + `tests/preview-shim.js` + `npm run preview:fixture`: fake login, Lark answered from a git-ignored snapshot, writes simulated, red badge (`preview-shim.js:1-19`, `:57-114`) |
| Lint / typecheck | none | none |

Issues in Polaris's test tooling:
- `e2e.html` hard-codes the proxy and reads the raw override (`:36-37`), ignores the
  localhost rule, and is titled "Universe Updater" (`:6`, the old name).
- `preview-shim.js` hard-codes `127.0.0.1:9123` in its wake-URL heuristic (`:59`); patches
  `fetch` only (an XHR upload path would escape it).
- `lark-node.mjs` depends on the proxy minting tenant tokens without credentials (2.7).

### 7.5 Recommendations

1. **Fetch gets Polaris's test layers:** extract pure mapping (`lark.js` `toFields`/`fromRecord`,
   `brief.js`) into Node-importable modules (no `location` at import), add
   `tests/brief.test.mjs` with fixtures from real rows; a `check:live` that imports the
   page's `FIELD` map and compares it with the table's columns (replacing the hand-synced
   list in `setup_lark_table.py`); a `?preview` mode with a canned `/extract` response
   (synthetic brief, safe to commit) and a git-ignored briefs snapshot.
2. **Shared preview shim** core: intercept `fetch` and XHR for `/proxy?url=` and for the
   tool's own proxy endpoints; inject a fake session; show the badge; never ship the fixture.
3. **Proxy tests:** add `GET /` (version, allowed headers match `_cors()`), Dockerfile
   COPY completeness, and an `OPTIONS` test asserting the full allow-header list.
4. **No lint dependency needed**; a `check:shell` script (`node tools/check-shell.mjs`)
   covers what has actually gone wrong: import-map list = `js/*.js`; shared assets
   byte-equal to `design-ref/.../assets/`; boot watchdog present and `data-booted` set in
   `app.js`; `node --check` on every module; no secret-shaped strings (`AIza…`,
   `app_secret`) in the site files.

---

## 8. Documentation

### 8.1 READMEs against the `tech-shell.md` template (`:100-105`)

| Template section (in order) | Fetch `README.md` | Polaris `README.md` |
|---|---|---|
| 1. What it does, for whom, with the icon | yes, icon (`:1-20`); title has an em dash (`:1`) | text yes (`:1-18`), **no icon** |
| 2. Contents | yes (`:24-39`) | yes (`:22-36`), omits "The Collections view" (`:251`) |
| 3. Using it (numbered) | yes but 9th section (`:398-430`) | yes, first (`:40-66`) |
| 4. What it reads and writes | "What gets extracted", "The Lark table" (`:186-316`) | "What shows up as a card", "What gets written", "The audit" (`:70-236`) |
| 5. Settings | yes, with storage keys (`:434-454`) | **missing** (one bullet in Using, `:63-66`) |
| 6. How it's built (diagram) | yes, first (`:43-89`), plus layout tree (`:145-182`) | **missing** (Files table only) |
| 7. Running locally | yes (`:458-482`) | yes (`:292-301`) |
| 8. Deploying | yes (`:318-394`) | "Hosting it for phones" + "Going live" (`:305-326`) |
| 9. Design decisions | yes (`:486-543`) | **missing** (one note, stale, `:401-403`) |
| 10. Security and privacy | yes (`:547-578`) | **missing** |
| 11. Known limits | yes (`:582-598`) | yes (`:407-423`) |
| 12. Troubleshooting table | yes, "Symptom / Fix", 22 rows (`:602-627`) | yes, "You see / What to do", 16 rows (`:356-375`) |
| 13. Maintenance recipes | yes (`:631-652`) | partly in Going live |
| 14. Files | layout tree (`:145-182`) | table (`:379-399`) |
| Tests | proxy only, in Local development (`:478-482`) | yes (`:330-352`) |

### 8.2 Troubleshooting tables

- Column headers differ; the template asks for "the exact messages people see → what to
  do", which is Polaris's "You see | What to do" wording.
- Fetch rows quote messages in prose ("Yellow 'Setup needed' bar…"); Polaris quotes the exact
  UI text in italics. Polaris's style is easier to search.
- Missing rows, both: "Out of date (v…, needs …)" (after 2.8); "Service override" badge
  showing; preview badge. Fetch: Lark-proxy blocked (no such message exists yet). Polaris:
  "couldn't start" (boot watchdog) and "Users see an old version" (Fetch has both,
  `:626-627`).

### 8.3 Stale or inconsistent statements

| Where | Says | Reality |
|---|---|---|
| `fetch/render/gemini-pdf/gemini_proxy.py:19` | `/health` "also used by the page to wake the service" | the page pings `/` (`extract.js:36`) |
| `fetch/render/gemini-pdf/README.md:292` | "The page pings `/health`" | `/` |
| `fetch/render/gemini-pdf/README.md:335` | "32 offline tests" | 44 |
| `fetch/render/gemini-pdf/README.md:276-284` | after updating, version should be `"1.2.0"` | 1.4.0; sections out of order |
| `fetch/README.md:94` | Polaris is `tech/universe-updater` | it's `polaris/` here |
| `fetch/README.md:339` | "this v1.1" | |
| `fetch/README.md:588-590` | estimate includes the wake-up time | `estimate()` returns `cold: 0` (`extract.js:168`); the loader shows a separate wake phase |
| `fetch/README.md:136`, `:470` | redirect `http://localhost:8770/` | launch configs use 8770, 8771 and 9123 |
| `fetch/README.md:613` | open `/health` to check | fine for humans; `/` also shows the version |
| `polaris/README.md:401-403` | "one deliberate difference: JavaScript modules instead of classic scripts" | the language now uses modules (`tech-shell.md:25-26`) |
| `polaris/README.md:43` | clock "turns yellow" | amber per `principles.md:165` |
| `polaris/tests/e2e.html:6` | "Universe Updater" | Polaris |
| `fetch/js/config.js:6-8` | documents the link overrides | fine; Polaris has no equivalent |

---

## 9. Candidates for shared modules

All copied unedited into each tool like `ui.js`/`icons.js`, with improvements going back to
`design-ref/mineski-design-language/assets/` first.

### 9.1 `net.js`: services, wake, retry, blocker, describe, upload

```js
import { createService, larkClient, upload, NetError, describeNet, isLocalPage } from "./net.js";

const lark = createService({
  id: "lark", label: "Connection service",
  url: () => cfg().services.lark.url,          // effective URL (override-aware)
  expect: { service: "lark-cors-proxy", min: "1.0.0", headers: ["Authorization"] },
  freshMs: 60_000, pingTimeoutMs: 20_000, wakeBudgetMs: 180_000, fastFailMs: 600,
});
lark.status;                 // { state, detail, version, info, checkedAt } (section 1.6)
lark.on(fn);                 // → unsubscribe
await lark.wake({ force });  // shared loop, backoff 2 s ×1.6 → 15 s; true when awake & compatible
lark.host();

const call = larkClient(lark, { token: () => auth.token(), onDeadToken: () => auth.end() });
await call("POST", url, body, { read: true });   // read: retries (network, 502-504, rate limit); 60 s timeout
                                                 // write: never retried, no early abort
const { promise, abort } = upload(lark, "/proxy?url=" + enc(mediaUrl), formData,
                                  { headers, onProgress, timeoutMs: 180_000 });   // XHR
describeNet(err);            // "blocked" / "unreachable" / "outdated" / "timeout" sentence, or null
```

Replaces: Polaris `net.js` (most of it), Fetch `extract.js:20-94` + `lark.js:38-51,86-89` +
`auth.js:49-67`. Fetch's Gemini proxy becomes a second `createService` whose `info.configured`
feeds the key pill.

### 9.2 `settings.js`: config layering and overrides

```js
import { createSettings } from "./settings.js";
const settings = createSettings({ key: APP.key, defaults: { SERVICES, TABLES, ENV: APP.env },
                                  overridable: ["services.lark", "services.gemini", "env"] });
settings.cfg();          // effective config (rebuilt on change)
settings.get(); settings.set(patch);
settings.overrides();    // [{ what: "Lark proxy", value, source: "settings" | "link" }] → the one badge
settings.on(fn);
```

Implements: localhost-only, https-or-local-http validation, `?<service>=` and `?reset`
tab-scoped link overrides, JSON storage under `<tool>.settings`.

### 9.3 `auth.js`: Lark OAuth + PKCE

```js
const auth = createAuth({ key: APP.key, name: APP.name, lark: LARK, service: larkService });
auth.startLogin(returnTo); await auth.finishLogin(params);   // wakes first, 45 s exchange timeout, strips ?code before
auth.currentToken(); auth.token(); auth.msLeft(); auth.endsAt(); auth.canWrite();
auth.loadUser(); auth.user(); auth.redirectProblem(); auth.clearSession();
auth.onEnded(fn); auth.end(message);
```

Both `auth.js` files are the same flow already; Polaris's version is more robust (wake,
timeout, early `?code` removal, `canWrite`), Fetch's has the user cache accessor and the
`ended` broadcast.

### 9.4 Session clock and top-bar badges (shell helper)

`renderHeader()` (session pill, amber under 10 min, avatar/initials), `tickSession()`
(20 s, 5-minute warning, end on time), `ensureTime(ms)`, env and override badges: near
duplicates in `fetch/js/app.js:146-186` and `polaris/js/app.js:158-182`, `:219-226`,
`:484-498`. A small `shell.js` with `mountHeader({auth, settings, envLabel})`.

### 9.5 `tools/serve.py`, `tools/check-shell.mjs`, `preview-shim` core

Sections 7.2, 7.5. Live in the skill (`design-ref/mineski-design-language/tools/`) and are
copied with the starter.

### 9.6 Storage helpers

Add to `ui.js`: `clearLocal(keys) → undo()`; document the inline migration template from
`fetch/index.html:5-53` in `tech-shell.md`.

---

## 10. Recommended standards at a glance

| Aspect | Standard |
|---|---|
| Base URLs | in `config.js` `SERVICES`/`LARK`; one effective-URL accessor; Node tools import config |
| Transport | `fetch()`; XHR only for uploads with progress; errors carry facts, `describe()` makes words |
| Timeouts | ping 20 s; reads 60 s; writes no early abort; uploads 180 s |
| Wake | `GET /` (never `/health`); awake = 2xx JSON with the expected `service`; wake every proxy the tool uses on load, on Settings open, on return to the tab |
| Cold start | backoff 2 s × 1.6 to 15 s, ≤ 3 min; "Waking up…" after 1.2 s, no countdown; reads retried only after wake; writes never |
| Ad blocker | 2 thrown failures < 600 ms while online, per service; banner names every blocked host |
| Status model | `{state: unset/unknown/waking/awake/down/blocked/outdated, detail, version, info, checkedAt}` + `on()` |
| Upload progress | XHR `onProgress` for every upload that can exceed ~2 s; Lark media always sends `extra.bitablePerm` |
| Proxy version | `GET /` with `version`, `api`, `commit`, `features`, `cors.allow_headers`, `limits`; page checks `min`; "Out of date" state; deploy checklist (2.8 C) |
| Config | `APP {name,key,env}`, derived `ENV_LABEL`, `SERVICES`, `LARK`, `TABLES {live,test}`, `RULES` |
| Overrides | localhost only; https or local http; Settings + `?<service>=` links; one red badge listing them |
| Secrets | none in pages or repos; personal keys opt-in per browser; proxies never mint tokens publicly |
| Shell | spec `<head>` order, `APP_BUILD`, `main#main`, import map checked by script, watchdog, `?preview` hook, per-view `document.title`, `beforeunload` mid-task |
| State/routing | one `S`, one `render()`, route table, return-to after login |
| Wiring | factories with `ctx`; subscriptions over global DOM events |
| Storage | `<tool>.<name>`, JSON only, `<tool>.auth.*` in session, `LOCAL_DATA_KEYS` + undo, inline dated migrations, caches of business data dropped at session end |
| Dev | `127.0.0.1` only, port registry, shared no-cache `serve.py`, same `package.json` script names |
| Tests | offline pure-logic tests, read-only live check importing page modules, preview with fixture, e2e gated on `env === "test"`, proxy unit tests incl. `/` and Dockerfile, `check:shell` |
| Docs | template order; "You see / What to do" table with exact UI strings; "Deployed from" line + CHANGELOG in proxy READMEs |

---

## 11. Parity gaps

### Fetch should adopt from Polaris

1. A single transport module (`net.js`) for **all** Lark proxy traffic, with observable
   connection state, `wake()` before loading the list and before the login code exchange,
   read retries on network errors and 502/503/504, one retry after Lark rate limits, and
   ad-blocker detection for the Lark proxy host (today: `lark.js:38-51`, `auth.js:51-67`,
   `lark.js:86-89` fire-and-forget).
2. A "Connection service" (Lark proxy) row in Settings > Connections with Awake / Waking up /
   Unreachable (detail) / Blocked, and the version.
3. Facts-on-errors + one `describe(err)` instead of messages built at each call site.
4. "Waking up…" for the list after 1.2 s, not 5 s (`app.js:1072`).
5. Exponential backoff in the wake loop and a 20 s ping timeout (`extract.js:67`, `:84`).
6. Ad-blocker threshold 600 ms (`extract.js:48`).
7. `ENV_LABEL` (+ `#envBadge`) and the red override badge (`#overrideBadge`); use the computed
   `OVERRIDDEN` flag (`settings.js:62`) and add a Lark link-override flag.
8. Strip `?code` from the address *before* the token exchange (Polaris `app.js:551-553`).
9. `redirectProblem`/login flow waits for the proxy and times out the exchange (Polaris
   `auth.js:82-92`).
10. Offline Node tests of pure logic, a read-only `check:live` built from the page's own
    field map, a `?preview` mode with fixtures, and an e2e against a test copy.
11. A dependency-free `package.json` with `serve`/`test`/`check:*` scripts.
12. View modules as `ctx` factories and subscriptions instead of `document` CustomEvents and
    the `hooks` bag; a single `render()` from `S`.
13. `main#main` (not `#app`), `<head>` order per spec, `APP_BUILD` kept.
14. README: "You see / What to do" troubleshooting with exact strings; template order
    (Using it first).

### Polaris should adopt from Fetch

1. Request timeouts on reads (today none, `net.js:47-50`, `app.js:53`) and on uploads.
2. Stricter "awake" check: 2xx **JSON** with the expected `service` name (`extract.js:38-42`
   vs `net.js:145`).
3. All service URLs and Lark constants in `config.js` (`net.js:12`, `auth.js:11,15,17`,
   `ops.js:13`, `tests/lark-node.mjs:8`, `tests/e2e.html:37`).
4. Link overrides `?lark=` / `?reset` for quick local testing (`fetch/js/settings.js:63-71`),
   and Fetch's override validation (https or local http, `settings.js:45-47`).
5. JSON storage for the override (`polaris.proxyOverride` is raw) with an inline dated
   migration modelled on `fetch/index.html:5-53`.
6. `beforeunload` while a push is in flight (Fetch `app.js:1419-1421`).
7. Real upload progress (XHR) for invoice attachments, and `extra.bitablePerm` on Lark media
   uploads (`fetch/js/lark.js:251`).
8. `cache: "no-store"` on the redirect probe and wake ping (`fetch/js/auth.js:177`, `lark.js:88`).
9. The no-cache, MIME-safe dev server instead of `python -m http.server`
   (`fetch/tools/serve_web.py:17-25`).
10. Login keys named `polaris.auth.*` (Fetch: `fetch.auth.*`).
11. README sections Fetch has: Settings, How it's built (diagram), Design decisions, Security
    and privacy (incl. the Lark proxy token issue), Maintenance recipes, the app icon at the
    top, and the boot-watchdog / stale-version troubleshooting rows.
12. A separate `env` value for the e2e gate instead of comparing `ENV_LABEL` text
    (`tests/e2e.html:54`), and a `TABLES {live, test}` switch instead of hand-editing links.

### Both should adopt

1. The proxy version standard (`GET /` with `version`/`api`/`commit`/`cors.allow_headers`),
   a compatibility check on every wake with an "Out of date" state, and the deploy checklist
   (2.8). The Lark proxy needs a version field first.
2. Writes never aborted early; after an ambiguous failure, re-check before offering Retry
   (and don't say "Nothing was written" unless the request never left, `polaris/js/inbox.js:798`).
3. Per-service ad-blocker counters and a banner that names every blocked host.
4. One port registry on `127.0.0.1` (Polaris 9123, Fetch 9124, proxies 8000/8001), registered
   on the shared Lark app; fix the 9123 clash and Fetch's 8770/8771/`localhost` mix.
5. `check:shell` (import map complete, shared assets identical, watchdog, `node --check`,
   no secret-shaped strings).
6. Shared `net.js`, `settings.js`, `auth.js`, `shell.js`, `serve.py`, preview-shim core in the
   skill, copied unedited.
7. Per-view `document.title`.
8. Close the Lark proxy's public token paths (`/token`, tenant/app token via `/proxy`); move
   the proxy's source into this workspace so it is versioned and deployed like
   `render/gemini-pdf`.
9. Drop business-data caches when a session ends (Fetch's `fetch.briefsCache`), keep Clear
   local data as a declared key list with Undo.
10. Fix the stale documentation in 8.3, and add a CHANGELOG plus a "Deployed from" line to
    each proxy README.
