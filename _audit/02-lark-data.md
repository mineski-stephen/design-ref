# Audit 02: Lark Base data access (reads, writes, data integrity)

> **Historical (Oct 2026).** This audit describes Fetch and Polaris *before* the systems-parity
> work. Its file:line references and findings are out of date: both tools were changed to meet
> `../mineski-systems-design/SKILL.md`. For the current state and what is still open, see that
> guide and `SYSTEMS-PARITY.md` at the workspace root.

Scope: how **Fetch** (`fetch/js/lark.js`, `app.js`, `config.js`, `settings.js`, `settings-view.js`,
`brief.js`, `tools/setup_lark_table.py`) and **Polaris** (`polaris/js/ops.js`, `sync.js`, `net.js`,
`config.js`, `app.js`, `inbox.js`, `collections.js`, `tests/*`) talk to Lark Base / Bitable.
Root-level `fetch/*.js` legacy copies and UI design are out of scope.
This was a read-only audit. Line numbers are from the files as they stand now.

The house standard in `design-ref/mineski-design-language/references/tech-shell.md:74-90` already says:
read tables in full, check columns, types and options on load, idempotent creates, re-check before
writing, read back after, `describe(err)`, `ENV_LABEL`, `?preview`. **Polaris follows it almost
everywhere. Fetch follows almost none of the data-integrity parts.** Most recommendations below
therefore mean "Fetch adopts Polaris's pattern". There are also about eight things where Fetch is
ahead and Polaris should adopt it (see §12).

---

## 0. Headline findings

1. **Fetch has no schema check.** A renamed or retyped column fails silently on read: `cellText()` of a
   missing field is `""`. "Done" then reads as not done everywhere, and a missing "Brief JSON" silently
   falls back to the readable columns (`fetch/js/lark.js:162-186`). On write it fails with 1254045, and
   the message tells end users to run a Python script (`lark.js:29`). Polaris checks names, types and
   options on every load and switches off only the affected pushes (`polaris/js/ops.js:166-229`,
   `app.js:57-67`, `inbox.js:61-64`).
2. **Fetch rewrites the whole row on every save, with no re-read, no conflict check and no read-back.**
   `update()` sends every readable column plus the JSON (`lark.js:238-242`, `toFields` at `102-140`), even
   when only Next Steps changed. Anything changed in Lark since the list loaded is overwritten:
   Next Steps, Attachments, Requirement, VAT, or any readable column. This happens even though Fetch
   already reads `Last Modified` (`lark.js:203`) and could detect it. Polaris re-reads before every
   write, writes only the changed cells, and reads back and compares (`ops.js:283-391`,
   `sync.js:873-905`).
3. **Fetch writes placeholders as data.** Empty readable columns get `"Not specified"` (`lark.js:99`,
   `118`). Normalizing invents values that are then saved: `date_filed` falls back to today and
   `project_title` to "Untitled Project" (`brief.js:57`, `60`). Requirement/VAT values Lark holds that
   Fetch doesn't recognise are **cleared** on save (`lark.js:129-135` together with `matchChoice`
   returning `""`, `lark.js:155-159`). Polaris's builders never write blanks (`sync.js:341-344`,
   `375-378`, `554`).
4. **Polaris lacks some things Fetch has:** the `bitablePerm` extra on attachment uploads, which
   advanced-permission Bases need (`lark.js:251` vs `net.js:114-119`); a timeout and login-ended
   detection on uploads; a client token that survives a reload (`app.js:562` stores it in the
   localStorage draft vs `inbox.js:266`/`471`, memory only); a message for 1254302; two extra
   dead-token codes (99991661/99991663); a setup/repair script; and a stale-while-revalidate list cache.
5. **The code that should be shared is about 80% already written in Polaris** (`net.js` +
   `ops.js` reads/writes + `sync.js` cell helpers and `verifyWritten`). §11 proposes the shared
   `lark/` module API.

---

## 1. How tables are identified and configured

### 1.1 Table references

| | Fetch | Polaris |
|---|---|---|
| Form | Three separate constants: `LARK_APP_TOKEN`, `LARK_TABLE_ID`, `LARK_TABLE_URL` (`fetch/js/config.js:25-28`), plus `LARK_API_BASE` (`:24`). The URL and the IDs can drift apart. | One full link per table in `TABLE_LINKS` (`polaris/js/config.js:10-20`), parsed once at boot with `parseBaseLink` (`polaris/js/app.js:18`, `ops.js:22-28`) into `{app, table, url}`. |
| Duplicates | Hard-coded again in `tools/setup_lark_table.py:27-28` (`APP_TOKEN`, `TABLE_ID`), and the column list is duplicated between `lark.js:14-22` (`FIELD`) and `setup_lark_table.py:39-69` (`FIELDS`), "keep in sync" by hand (`setup:17`, `lark.js:8`). | A single source. The Node tools re-use `TABLE_LINKS` and `parseBaseLink` (`tests/lark-node.mjs:5-6`, `42-43`). |
| Parser | `parseLarkTable` (`fetch/js/settings.js:30-40`) accepts `/base/` **and `/wiki/`** paths. A wiki node token is *not* a Bitable app token, so a wiki link would be accepted and then fail at runtime (91402/1254040). It requires https but doesn't check the `tbl` prefix. | `parseBaseLink` accepts `/base/` only and requires `^tbl…` (`ops.js:24-26`). It throws on a bad link (boot fails loudly). It doesn't check the protocol. |
| Tenant host | `mineskiglobal.sg.larksuite.com` (`config.js:28`) | `mineskiglobal.larksuite.com` (`config.js:11-19`), same Base `NP7Tbj…`. |
| API base | `cfg().LARK_API_BASE` (`config.js:24`) | `OPEN_API` const (`ops.js:13`), but `net.js:120` hard-codes the upload URL again. |

**Match:** no.
**Standard:** one link per table in `config.js` (`TABLE_LINKS = { key: "https://…/base/<app>?table=<tbl>&view=<vew>" }`),
parsed by one shared `parseBaseLink` that accepts `/base/` only (with a specific error for `/wiki/`:
"open the Base itself, not the wiki page") and requires `tbl…`. Derive the app token, table id and
"Open in Lark" URL from the link. Setup scripts and Node checks import or read the same file, so
there is never a second copy. *Why:* the link is what people copy from the address bar, and three
hand-maintained constants plus a Python copy already show drift risk (two tenant hostnames, two
column lists).

### 1.2 Environment label (test copy vs production)

| | Fetch | Polaris |
|---|---|---|
| Label | None. There is no notion of a test copy. | `ENV_LABEL` (`config.js:8`), shown as a header badge (`app.js:160-161`) and in Settings (`app.js:450-452`). |
| Guard for destructive tests | n/a (no e2e) | `runE2E` refuses unless `ENV_LABEL === "Test copy"` (`tests/e2e-core.js:66-69`, `241`). |
| Going live | README "Move to a different table": edit three constants and the setup script (`fetch/README.md:650-651`) | README "Going live" (`polaris/README.md:317-326`): swap links, set `ENV_LABEL`, run `check:live`. |

**Match:** no. **Standard:** every tool has `ENV_LABEL` in `config.js`. It is non-empty for test copies,
shown in the header, and required by any script that writes. Fetch should get a test copy of the
briefs table (the setup script can create one).

### 1.3 Override mechanisms

| | Fetch | Polaris |
|---|---|---|
| Proxy URL | Saved setting (localhost only) plus a `?lark=` per-tab session override (localhost URLs only); `?reset` clears it (`settings.js:56-73`). | `polaris.proxyOverride` in localStorage, honoured only on a local page (`net.js:13-28`), with a header badge while active (`app.js:162`). |
| Table | Saved `larkTable` link (localhost only) replaces app/table/url (`settings.js:60-61`; UI `settings-view.js:159-175`). | None at runtime: edit `config.js`. |
| Visibility | `c.OVERRIDDEN` is computed (`settings.js:62`) but **never displayed**. Only `GEMINI_OVERRIDDEN` is shown (`app.js:529`, `settings-view.js:78`). A local table override shows no badge. | The override badge is always visible (`app.js:162`). |
| Cache on switch | Clears the brief cache only if `LARK_TABLE_ID` changed (`settings-view.js:164-167`, `app.js:1315-1321`). A different app token with the same table id isn't detected, and the cache key (`fetch.briefsCache`) isn't scoped to the table. | No data cache. |

**Match:** partly (both limit overrides to localhost). **Standard:** overrides only on localhost; every
active override shows a badge (proxy *and* table); any cache key includes `app:table`. A runtime table
override is fine for developers but must show the badge, or people may think they are on production.

---

## 2. Transport: the request wrapper

| Aspect | Fetch | Polaris | Match |
|---|---|---|---|
| Wrapper | `api(path, body)`: always POST, always `…/apps/{cfg app}/tables/{cfg table}{path}` (`lark.js:74-84`). It is bound to *one* table and can't call `/fields` (GET) or another table. | `lark(method, url, {token, body, read, timeout})` (`net.js:68-104`), wrapped by `call(method, url, body)` (`app.js:49-54`). Any URL and any method. All ops take `call` as a parameter, so Node passes a direct caller (`tests/lark-node.mjs:20-38`). | no |
| Methods | The comment says the proxy forwards POST only (`lark.js:6`, `272`), but the proxy now forwards GET too (`fetch/README.md:140`). The comment is stale. | GET for `/fields` (`ops.js:136`), POST for everything else. | — |
| Timeout | 75 s on everything, *including writes* (`lark.js:38-51`); 180 s for uploads (`lark.js:258`). | Writes never time out, deliberately (`net.js:43-45`). `call()` passes no timeout for reads either (`app.js:53`), so reads rely on retries. Wake pings use 20 s (`net.js:144`). | no |
| Read retries | None. A cold proxy gives an error plus a "Try again" link (`app.js:1085-1090`), and a 5 s "waking up" hint (`app.js:1072-1074`). | Reads retry after 1.5/3/6/12/20 s on network errors and 502/503/504 (`net.js:75-90`), and up to 2× after 1254290/99991400 (`net.js:101`). `batch_get`/`search` POSTs count as reads (`app.js:52`). Writes are never retried. | no |
| Wake / cold start | `warmup()` fires one GET `/` and forgets it (`lark.js:86-89`, `app.js:1402`). | `wake()` loops up to 3 min with backoff and connection state (`net.js:133-161`). `loadData` waits for it (`app.js:239-243`). | no |
| Ad-blocker detection | None in `lark.js` | Two instant failures while online count as blocked (`net.js:56-58`), with a host-specific message (`net.js:167-170`). | no |
| Non-JSON / proxy bodies | `res.json()` failure becomes `{code: status, msg: "HTTP n"}`, shown as `Lark error 502: HTTP 502` (`lark.js:43`, `55`). A proxy body without `code` gives `Lark error undefined: unknown`. | Raw text kept (`net.js:92-97`); proxy bodies without `code` are told apart (`net.js:98-99`, `177-179`). | no |
| Error object | `LarkError(friendlyMessage, code)`, translated *at throw time* (`lark.js:34-36`, `53-56`). | `LarkError(msg, {network, status, json, raw})` keeps the raw response; `describe(err)` translates *at display time* (`net.js:30-32`, `164-203`). | no |
| Dead login | `AUTH_CODES = {20005, 99991661, 99991663, 99991668, 99991677}` makes `auth.ended()` fire an event (`lark.js:23`, `68-72`); a missing token too (`lark.js:59-66`). | `isDeadToken` = `{20005, 99991668, 99991677}` (`net.js:205`), checked by each caller (`app.js:258`, `inbox.js:248`, `796`, `collections.js:204`, `228`). | partial |
| Write scope check | None | `auth.canWrite()` checks the token scope includes `bitable:app` (`polaris/js/auth.js:30-34`); pushes are disabled with a "log in again" note (`inbox.js:65-68`). | no |

**Standard:** a shared `createLarkClient()` (§11) with Polaris's `lark()` semantics: any method and URL;
reads retried with backoff (network errors, 502/503/504, rate limits); writes never retried
automatically; raw errors kept and translated by `describe()` at the edge. Add Fetch's union of dead-token codes
(`20005, 99991661, 99991663, 99991668, 99991677`) and one `onAuthEnded` hook so callers can't forget
to check. On timeouts, use a long but finite write timeout (about 90 s) and report it as **"may or
may not have been saved; retrying is safe"**, not as a failure. This only holds because creates use a
`client_token` and updates are idempotent. Polaris's infinite write wait can leave a sheet busy
forever on a stuck connection, and Fetch's message implies nothing happened.

---

## 3. Reads

### 3.1 Endpoints used

| Endpoint | Fetch | Polaris |
|---|---|---|
| `POST …/records/search` | `listAll` (`lark.js:212`); setup script (`setup:130`) | `loadRecords` (`ops.js:152-154`) |
| `GET …/fields` | Setup script only (`setup:129`) | `loadFields` on every load (`ops.js:132-144`, `213`), and again before `loadUniverse` (`ops.js:279`) |
| `POST …/records/batch_get` | — | `getRecord` for read-back and re-reads (`ops.js:258-266`). The comment explains why not `GET …/records/{id}` (display format, numbers as text). |
| `GET …/records/{id}` | — | Deliberately avoided (`ops.js:258-260`, `README:421-423`) |
| `GET …/records` (list) | — | — |

### 3.2 Pagination and page size

| | Fetch | Polaris |
|---|---|---|
| Page size | 500 (`lark.js:212`); the setup script uses 100 (`setup:109`) | `PAGE_SIZE = 500` ("Lark's max for search", `ops.js:14`); fields 100 (`ops.js:136`) |
| Runaway guard | 40 pages, then **silently stops** (`lark.js:211`) | `MAX_PAGES = 200`, then **throws** (`ops.js:15`, `163`) |
| `has_more` without `page_token` | Silently stops (`lark.js:216`), so the list is truncated | Throws (`ops.js:159`) |
| Throttle | none | 120 ms between pages (`ops.js:16`, `161`) |
| Progress | `onProgress(count)` (`lark.js:215`; unused by `app.js:1075`) | `onPage(n, total)`, rendered as per-table staged progress (`ops.js:157`, `app.js:244-249`) |

**Standard:** Polaris's `loadRecords`. Never return a partial table as if it were complete, because
a truncated list looks like "missing rows" and can lead to duplicate creates.

### 3.3 Full table vs views; field names vs ids

| | Fetch | Polaris |
|---|---|---|
| View | None (full table) (`lark.js:212`) | None, explicitly: "views filter rows…" (`ops.js:146-147`) |
| Columns requested | All (no `field_names`) | Only the spec's `read` list, filtered to columns that exist, because Lark rejects unknown names (`ops.js:218-222`, `278-280`). `"*"` means all, because Lark caps `field_names` at 50 (`ops.js:102`, `219`). |
| `automatic_fields` | `false` (`lark.js:213`) | `false` (`ops.js:154`) |
| Field identity | **Names** everywhere (`FIELD` map, `lark.js:14-22`) | **Names** everywhere (`schemaSpec`, `ops.js:45-126`) |
| Sort | None; relies on "Lark returns oldest first" and reverses (`app.js:1077`) | None from Lark; all ordering is done in pure code (`sync.js:198`, `583-610`) |

**Match:** yes on full table and names; no on column selection.
**Standard:** full table, no view, `automatic_fields:false`, names (not ids), request only the spec's
columns that exist (falling back to all past 50). *Why names:* they're readable in code and errors,
and the load-time schema check (§5) turns a rename into a clear message instead of silent breakage.
If renames become frequent, the schema check can map name to `field_id` and write by id, but that is
not needed today. Don't rely on Lark's implicit order; sort client-side by a real field.

---

## 4. Value formats (read and write)

| Cell type | Fetch read | Fetch write | Polaris read | Polaris write | Standard |
|---|---|---|---|---|---|
| **Text** (segments) | `cellText()` joins segment `text ?? name ?? link` with `""` (`lark.js:143-149`) | Plain string (`lark.js:105-122`) | `plain()` detects real segment arrays and joins with `""`; other arrays use `", "` (`sync.js:13-30`); `clean()` normalizes CRLF and trims (`:33`) | Plain string, CRLF→LF, trimmed (`sync.js:362`, `554`) | Polaris `plain/clean`. Fetch's `cellText` turns multi-value arrays like `["a","b"]` into `"ab"`. |
| **Number** | n/a (Budget is text) | n/a | `num()`; formula/lookup `{type, value:[n]}` via `numOf` (`sync.js:54-56`) | JS number (`sync.js:352`, `844`) | Polaris. Never use `GET /records/{id}`, which returns numbers as text (`ops.js:258-260`). |
| **Date** | `fromMs(ms)`: `ms + tz`, then ISO day (`lark.js:98`) | `toMs(iso)`: `Date.UTC − tz` (`lark.js:93-97`); Due `null` clears, Filed omitted when null (`:137-138`) | `num()` ms; `dayStart(ms, h)` (`sync.js:87-90`); `parseDay` for typed dates (`:98-118`) | ms at local midnight (`sync.js:358`, `inbox.js:738`) | Same model in both (midnight in the Base's offset). Unify on **one** constant: Fetch `LARK_TZ_OFFSET_MINUTES: 480` "Asia/Singapore" (`fetch/js/config.js:29-30`), Polaris `utcOffsetHours: 8` "Asia/Manila" (`polaris/js/config.js:61-62`). Same value, different unit and label. Use `LARK_TZ_OFFSET_MINUTES` with shared `toLarkDay/fromLarkDay`. |
| **Single select** | Label → key via loose `matchChoice` (`lark.js:155-159`) | Label from `config.js` (`lark.js:126-131`). Unknown options are auto-created by Lark. | `clean()` | `matchOption(value, options)`, which always writes the *option's own name* so a write "can never create a new option" (`sync.js:120-127`, `841`, `848`) | Polaris. Writes go through `matchOption` against the options read on load. |
| **Multi select** | `[].concat(v).map(cellText)` (`lark.js:195-199`) | `[label]` for VAT (`:132-135`); free strings for Next Steps (`:127`), where creating new options is *intended* (`config.js:32-33`) | array of names | names via `matchOption` (`sync.js:386-387`, `392`, `398`) | Polaris, plus an explicit **`openOptions`** list in the spec for columns where creating new options is allowed (Fetch's Next Steps). |
| **Person** | not used: "Filed By" is a *text* name (`lark.js:124`, `setup:58`) | `filedBy` name string | `people()` gives `{id, name, short, email}` (`sync.js:38-45`) | `[{id}]` open_id (`sync.js:332`) | Polaris. Fetch should change "Filed By" to a Person field, or add `Created By` (type 1003), so it can be filtered and survives name changes. |
| **Attachment** | `{token, name, size, url\|tmp_url}` (`lark.js:200-202`) | `[{file_token}]`, full replacement list (`lark.js:136`) | `{file_token, name, size}` (`sync.js:934-935`) | `[{file_token}]` only when the list changed (`sync.js:975-976`) | Write the full keep-list, but only when it changed, after a re-read (see §6.3). Don't cache `url`/`tmp_url`: they expire. Fetch caches them (`app.js:1055`). |
| **URL** | n/a | n/a | `plain()` gives `.text`; `{link,text}` (`sync.js:25`, `396-397`) | `{link, text}` (`sync.js:397`) | Polaris |
| **Checkbox / boolean** | "Done" is a **single select Yes/No** (`setup:67`); read `=== "yes"` (`lark.js:197`) | `"Yes"`/`"No"` (`lark.js:128`, `269`) | `=== true` (`sync.js:164`, `214`) | `true/false` (`ops.js:394-397`) | Use a checkbox for new boolean flags. Fetch's Done can stay a select (it's in use), but it must be declared in the spec with options `Yes`/`No`. |
| **Formula / lookup / auto** | Last Modified (1002) read as ms (`lark.js:203`) | never | `{type, value}` via `plain/numOf` | never: `COMPUTED` filter (`ops.js:37-38`, `320-323`) | Polaris `writableOnly` |
| **Blank test** | `B.isMissing` treats "Not specified" as blank (`brief.js:18`) | — | `isBlank` (zero isn't blank; empty segments, people, files) (`sync.js:450-461`) | — | Polaris `isBlank` for Lark values; Fetch's `isMissing` is model-level only. |

---

## 5. Schema / column checks on load

| | Fetch | Polaris |
|---|---|---|
| Runtime check | **None.** It never calls `/fields` at runtime. | `loadEverything` calls `/fields` for every table (`ops.js:208-229`), then `checkSchema` checks name, type, optional-column type and required select options (`ops.js:166-191`), and `checkNeeded` checks columns only one push kind needs (`ops.js:194-201`). |
| Spec | Implicit in `toFields`/`fromRecord` | Declarative `schemaSpec(rules)`: `read`, `index`, `fields{name:type}`, `optional`, `options`, `neededBy` (`ops.js:45-126`) |
| What happens on mismatch | Read: silently empty values (e.g. every brief "not done", `lark.js:197`; JSON fallback `:165-186`). Write: 1254045 with "Run tools/setup_lark_table.py --apply" (`lark.js:29`), developer instructions shown to end users. | Per-table and per-kind gating: `problemsFor(kind)` / `canWriteFor(kind)` (`app.js:57-67`), so only the affected pushes go off. Problems are listed in a callout (`inbox.js:61-64`) and in Settings (`app.js:433`). The Invoices edit button is disabled (`collections.js:62`, `106`). |
| Offline/CI check | Setup script dry run: names and types only; a type mismatch is just a printed warning (`setup:142-150`); select options are never checked or added on existing fields. | `npm run check:live`: schema, plus every card's payload validated against live options (`tests/check-live.mjs:28-29`, `45-55`). |
| Repair | `setup_lark_table.py --apply` creates missing columns and renames the primary; `--prune` removes empty columns and blank rows (`setup:135-178`) | None (reports only) |

**Match:** no. **Standard:** one declarative spec per table (Polaris's shape plus `openOptions`)
drives three things:
1. **Runtime check on load.** Gate only the affected actions and show the problems in plain words.
   In Fetch: if "Brief JSON", "Done" or "Status" is wrong, switch saving and Done/Delete off and say
   so; reading can continue.
2. **A Node `check:live`** that is read-only and runs the same check plus payload validation.
3. **An optional setup/repair script** (dry run by default) that creates missing columns and missing
   select options, and never deletes data without `--prune`.

*Why:* a rename in Lark is the most likely way these tools get broken by someone else. Polaris's
approach turns it into a clear message instead of bad data.

---

## 6. Write safety

### 6.1 Endpoints

| | Fetch | Polaris |
|---|---|---|
| Create | `POST …/records?client_token=` (`lark.js:234`) | `POST …/records?client_token=` (`ops.js:249-256`); throws if no record is returned |
| Update | `POST …/records/batch_update` (1 record) (`lark.js:239`, `269`) | same (`ops.js:269-271`) |
| Delete | `POST …/records/batch_delete` (`lark.js:273-282`) | never deletes |
| Upload | `POST /drive/v1/medias/upload_all` (`lark.js:245-265`) | same (`net.js:110-128`) |

### 6.2 Idempotency (`client_token`)

| | Fetch | Polaris |
|---|---|---|
| Token | A UUID made when the draft is created and **stored in the localStorage draft** (`app.js:562`), passed to `create` (`app.js:1001`). It survives reloads and crashes. | `newClientToken()` per open sheet (`inbox.js:471`), kept in `S.drafts` when the sheet is cancelled (`inbox.js:266`). **In memory only**, so it is lost on reload. |
| Applies to | Create only | Creates (Universe, ANDON, Collections); updates are naturally idempotent |
| Retry-after-success risk | If the create landed but the response was lost and the user edits and saves again with the same token, Lark returns the *first* record and the edits are silently not saved. | Same risk in principle. It is mitigated because the pre-write re-read throws `AlreadyDone` (`ops.js:297-298`). |

**Match:** partial. **Standard:** a token per *intended create*, persisted with the draft (Fetch's
approach) so a reload-then-retry can't duplicate. Pair it with Polaris's pre-write re-check. After a
create returns, compare the returned record with the payload (read-back, §6.5). If they differ (the
idempotent-replay case), `update` the record with the current payload.

### 6.3 Re-read before write and conflict detection

| Write | Fetch | Polaris |
|---|---|---|
| New record | No duplicate check (relies only on `client_token`, same user) | Re-reads the destination's lean index and throws `AlreadyDone` if the code or PAR is already there (`ops.js:296-298`, `326-328`, `340-346`) |
| Update an existing row | **No re-read, no conflict detection.** It writes the full model (`lark.js:238-242`). `Last Modified` is read (`lark.js:203`) but never compared. | Collections: re-reads and checks `expect: {status, ir}` still holds, and that no other row took the request (`ops.js:351-360`, built at `sync.js:866-870`). PAR: re-reads the row's PAR and appends to the *fresh* value (`ops.js:305-313`). Audit: re-reads the row and writes only cells that are still blank, reporting `skipped` (`ops.js:382-391`). |
| Flag toggles | `setDone` writes blindly (`lark.js:268-270`) | `setIgnore` writes blindly (`ops.js:394-397`), which is fine for a single boolean. |
| Finance edits | — | `saveInvoiceDetails` has **no re-read** (`ops.js:374-377`). The patch is diffed against the row *as loaded* (`sync.js:969-977`), so untouched cells are safe but the same cell edited by two people is last-writer-wins. |

**Gaps found in Polaris:** `fillGaps` always keeps `VAT%` even if someone filled it meanwhile
(`ops.js:384`, `k === "VAT%" ||`), and the amount was computed with the sheet's VAT. If the re-read
shows a non-blank VAT% that differs, it should stop (`AlreadyDone`) rather than overwrite.
`saveInvoiceDetails` should re-read and refuse if any field it is about to change no longer equals the
loaded "before" value.

**Standard:** every update is a **safe update**:
`re-read (batch_get) → check expectations (fields being changed still equal their loaded values,
or Last Modified unchanged) → write only the changed cells → read back`. On a mismatch, write nothing,
refresh, and say what changed (Polaris's `AlreadyDone` with detail, `ops.js:235-237`, `inbox.js:788-794`).
For Fetch: keep `Last Modified` (or the fields themselves) from the opened record. On save, `batch_get`
it, and if `Last Modified` moved, compare the cells Fetch would write. If someone edited Next Steps,
Attachments, Status, Due Date, Requirement or VAT in Lark, show "Changed in Lark since you opened it"
and offer to reload or overwrite.

### 6.4 Only changed cells; never blank

| | Fetch | Polaris |
|---|---|---|
| Changed cells only | **No.** Every save sends ~20 readable columns plus JSON (`lark.js:102-140`, `238-242`), even when only extras changed (`app.js:1010-1011`). | Yes: `invoiceDetailsPatch` (`sync.js:967-977`), `collectionsChange` (only differing cells, `sync.js:852-865`), `fillGaps` (only still-blank cells). |
| Never blank | **No.** `"Not specified"` goes into empty list columns and Submission Details (`lark.js:99`, `118`). Questions is `""` (`:120`). Requirement `""` writes `null` (clears) (`:130`), VAT `""` writes `[]` (clears) (`:134`). Due `null` clears (`:137`). Filed By `""` (`:124`). | Yes: `put()` skips null, empty and `[]` (`sync.js:341-344`, `375-378`). `auditPatch` never writes a blank (`sync.js:554`). Clearing only happens on purpose: `null` for a user-cleared invoice field (`sync.js:971`, `974`) and for a withdrawn request (`sync.js:854`). `check-live` asserts no blanks (`check-live.mjs:47`). |
| Placeholder values saved as data | `normalize` turns a missing filed date into **today** and a missing title into "Untitled Project" (`brief.js:57`, `60`). These are then written back by `toFields`. | n/a |
| Unknown select values | Requirement/VAT values not in `config.js` read as `""` (`lark.js:155-159`, `198-199`), and the next save **clears them** (`lark.js:129-135`). | Reads raw; writes only matched options. |

**Standard:** build the full intended row, diff it against the row as last read (`diffPatch(before,
after)`), and send only the differences. Treat `null` as an explicit user clear, never as a default.
Never write UI placeholders ("Not specified", "Untitled Project", today's date) into Lark unless the
user typed them. If a select value isn't recognised, keep it: leave the cell out of the patch.

### 6.5 Read-back verification

| | Fetch | Polaris |
|---|---|---|
| After create | Trusts the create response (`lark.js:235`), and `app.js:1002` overwrites parts of it with local values. | `readBack` via `batch_get` plus `verifyWritten` (`ops.js:283-292`, `sync.js:877-905`) |
| After update | The response is ignored (`app.js:1010`; comment at `:1020`) | `readBack` on every update (`ops.js:313-315`, `362-364`, `376`, `390`, `397`) |
| Comparison | — | Format-aware: multi-select by names, attachments by tokens, people by ids, numbers ±0.005, booleans, text via `clean` (`sync.js:886-905`) |
| Reporting | — | A read-back failure is not an exception (`readBackError`). Mismatches are listed field by field: `sent "x", Lark has "y"`, with "Open in Lark" (`app.js:349-359`, `379-384`, `collections.js:212-218`, `inbox.js:241-244`). Success says "All N fields checked in Lark." |

**Standard:** Polaris's `readBack` and `verifyWritten` for every write, shared. Fetch's JSON column
(see §7) needs one extra comparison: parse the read-back JSON and compare `fingerprint` (`app.js:27`).

### 6.6 Optimistic updates and rollback

| | Fetch | Polaris |
|---|---|---|
| Flag toggle | `toggleDone`: optimistic, rolls back on error, toast with Undo (`app.js:1201-1216`) | `ignore()`: optimistic, rolls back with the reason, Undo, plus a read-back warning (`inbox.js:219-255`), with an in-flight guard (`S.working`, `:220`, `238`) |
| Saves/pushes | Not optimistic. The local list is upserted after success (`app.js:1046-1052`, `1007`, `1021-1022`). | Not optimistic. The local copy is updated after success, then the destination is **re-read from Lark** (`app.js:314-366`, `refreshUniverse` `:300-309`, `collections.refresh` `collections.js:223-232`). |
| Delete | After two confirmations; local removal after Lark succeeds (`app.js:1236-1253`) | n/a |
| In-flight guard | `S.briefsLoading` for loads only; the save dialog blocks double submit (`app.js:956-959`). Done has no in-flight guard. | `S.working` per card; sheet `busy` (`inbox.js:750`, `263-264`) |

**Match:** mostly. **Standard:** optimistic only for single-cell flags (Done/Ignore), with an
in-flight guard, rollback, Undo, and a read-back warning. Saves are pessimistic and followed by a
re-read of the affected rows. Fetch should add the in-flight guard and read-back to `toggleDone`, and
re-read the saved record (`batch_get`) instead of rebuilding it locally.

### 6.7 Partial failures

| Situation | Fetch | Polaris |
|---|---|---|
| Upload fails in a multi-file save | **Skips** the file, saves the row anyway, then shows "Saved, but these files weren't attached" (`app.js:802-818`, `1003`, `1019`) | **Aborts** before writing; tokens already uploaded stay on the sheet, so a retry doesn't re-upload (`inbox.js:732-747`, `collections.js:186-191`) |
| Write OK, read-back fails | n/a | Reported as a warning, not an error (`ops.js:283-292`) |
| Error message | The error text, and the button becomes "Try again" (`app.js:1036-1042`) | **"Nothing was written."** plus `describe(err)` on *any* error (`inbox.js:798`). That is inaccurate after a network failure or timeout on a create, which may have landed. |

**Standard:** upload first (keeping tokens on the item, as both do). If any upload fails, *stop* and
offer **"Save without these files"** or **"Try again"**, so nothing is skipped without the person
choosing it. After a failed write, use "Nothing was written" only when Lark actually replied with an
error code. For network failures or timeouts say "Polaris/Fetch couldn't confirm the save. Trying
again is safe" (true because of `client_token` and idempotent updates).

### 6.8 Deletes

Fetch only: `batch_delete` (`lark.js:273-282`), with two confirmations (`app.js:1236-1245`) and
1254302/91403 mapped to "not allowed to delete; mark Done instead" (`lark.js:277-279`). Polaris
doesn't delete. **Standard:** deletes are rare and always need `confirmDanger`. Keep Fetch's pattern.
Consider snapshotting the row (fields plus JSON) into the toast so "Undo" can re-create it (minus
attachments).

---

## 7. Data model, source of truth, normalization

| | Fetch | Polaris |
|---|---|---|
| Source of truth | A **"Brief JSON" text column** with the full model, `schema_version: 1` (`lark.js:122`, `brief.js:56`). The readable columns are a projection. On read, JSON wins, then readable columns are the fallback (`lark.js:161-186`). Exceptions: **Due Date column wins** over JSON (`:187-188`); Status, Done, Next Steps, Requirement, VAT and Attachments are column-only (`:192-202`). Documented in `fetch/README.md:288-296`. | **The Lark cells are the truth.** Raw records are kept as read (`app.js:250`); all derivation is in pure functions in `sync.js`. |
| Lark edits to readable columns | Ignored on read and **overwritten on next save** (documented, `README:293-295`) | n/a |
| Normalization of old data | `B.normalize` coerces any shape to v1 (`brief.js:50-80`); drafts are re-normalized (`app.js:660`). There is **no forward-version guard**: a newer `schema_version` would be silently downgraded on save. | Normalizes on read: codes (`sync.js:72-77`), dates (`:87-118`), people (`:38-45`), options (`:120-127`). |
| Mapping location | `toFields`/`fromRecord` in `lark.js`, together with network code and imports of `auth.js`/`settings.js` (DOM/`location` at import, `settings.js:49`, `111`), so it can't be imported in Node. | Builders and readers in `sync.js` (no DOM, no network). Network in `ops.js`, which takes `call` as a parameter. |

**Standard:**
- JSON-in-a-column is legitimate for Fetch (a rich nested document that Lark can't model), but
  declare which columns are *projections* (written from JSON, overwritten) and which are *owned by
  Lark* (Status, Done, Due Date, Next Steps, Requirement, VAT, Attachments). Never overwrite an owned
  column unless the user changed it on the page (§6.4).
- Add `if (raw.schema_version > KNOWN) → read-only + message` to `normalize`, so an older cached page
  can't downgrade data written by a newer one. This matters because the page is a static site cached
  in browsers.
- Move `toFields`/`fromRecord`/`cellText`/`matchChoice` into a pure `fetch/js/rows.js` (config passed
  in, no imports of `auth`/`settings`). Keep `lark.js` for I/O only. This mirrors `sync.js`/`ops.js`.

---

## 8. Testability, fixtures, preview, live checks, e2e, setup

| | Fetch | Polaris |
|---|---|---|
| Pure modules | `brief.js` is pure (`brief.js:1-4`); `lark.js` mapping is not importable in Node (§7) | `sync.js` pure (`sync.js:1-8`); `ops.js` pure except `fetch` via injected `call` (`ops.js:1-7`) |
| Offline unit tests | **None** for JS (only `render/gemini-pdf/tests/test_proxy.py` for the Python proxy) | `npm test` runs `tests/sync.test.mjs` (≈30 tests with real-data quirks: segments, URL fields, formula values, people, messy codes, `verifyWritten`…) (`sync.test.mjs:16-28`, `406`, `572`). Gaps: `checkSchema`, `loadRecords` paging/guards and `push*` re-check logic aren't unit-tested with a fake `call`. |
| Live read-only check | None (the setup dry run is partial) | `npm run check:live` (`tests/check-live.mjs`): schema, card lists, every payload's types, options and canonical codes, Collections change consistency |
| Preview / fixture mode | None | `?preview` on localhost loads `tests/preview-shim.js` (`index.html:37-39`), which intercepts `fetch` and answers from a gitignored snapshot (`make-preview-fixture.mjs`). Writes are simulated in memory and converted to read format (`preview-shim.js:43-55`, `92-104`), with a red badge (`:108-114`). Minor: the shim ignores `client_token`. |
| E2E | None | `tests/e2e-core.js`: snapshots every stored field, pushes one of each kind, re-pushes expecting `AlreadyDone`, then asserts the before/after diff is *exactly* the intended cells (`e2e-core.js:197-227`). Guarded by `ENV_LABEL` (`:66`). Runs in the browser as the user (`e2e.html`) or in Node (`e2e.mjs`, with `--yes`). |
| Node Lark access | Python setup script with a token from proxy `GET /token` (`setup:97-102`) | `lark-node.mjs`: tenant token via the proxy, then direct calls with the same `call` shape (`lark-node.mjs:10-38`) |
| Setup / repair | `setup_lark_table.py` (create missing, rename primary, optional prune; dry run by default) (`setup:120-178`) | None |

**Standard:** every tool has (a) pure mapping modules with `node --test` fixtures from real Lark
payloads, (b) `check:live` (read-only), (c) `?preview` with a gitignored snapshot, and (d) an
`ENV_LABEL`-guarded e2e that asserts the exact diff. Spec-driven setup/repair is optional but
recommended. Fetch's highest-value additions: unit tests for `rows.js` (round-trip
`fromRecord(toFields(m))`, the legacy row with no JSON, unknown select values, the Due Date override),
and an e2e "create, update extras, toggle Done, delete" against a test copy, asserting nothing else
changed.

---

## 9. Caching of lists

| | Fetch | Polaris |
|---|---|---|
| Business data in storage | **Yes**: `fetch.briefsCache`, the whole mapped list in localStorage (`app.js:45-46`, `1054-1055`), shown instantly and refreshed in the background (`app.js:1255-1266`) | **No**. Data is in memory only (`app.js:26-46`); only view prefs are stored (`app.js:21`) |
| Stale time | Reload on opening All briefs if older than **30 s** (`app.js:1258`); always reloads once per page load (`briefsAt = 0`) | Re-loads quietly when the tab returns after **5 min** (`app.js:22`, `536-543`); re-reads the destination after every push (`app.js:360-365`) |
| Manual refresh | Refresh button (`app.js:1300`), Settings (`settings-view.js:157`) | Refresh button (`inbox.js:40`), Settings (`app.js:445`) |
| Cleared on | Logout (`app.js:1328-1334`), "Clear local data" with Undo (`:1338-1358`), table change (`:1317-1321`). **Not on session expiry** (`sessionEnded`, `app.js:129-140`), so the list stays in localStorage after the login ends. | Session end clears memory (`app.js:209-217`) |
| Cache key scope | Not per table (`fetch.briefsCache`) | n/a |
| Contents | Includes attachment `url`/`tmp_url` (they expire) (`lark.js:202`) | n/a |
| Size | Unbounded; localStorage is ~5 MB, so a full list of JSON briefs can hit the quota (the `store()` failure is silent) | n/a |

**Standard:** caching the *list* for instant paint is allowed (tech-shell storage table, line 68), but:
key = `<tool>.cache.<app>:<table>`; envelope `{v, at, schemaHash, rows}`; show "Updated N min ago
· Refreshing…" while it revalidates; never write to Lark from cached data without a re-read (§6.3);
clear on **any** session end, not only logout (shared computers); drop volatile URLs. Stale times:
revalidate on page load, on returning to the view after 30–60 s, and on tab visibility after 5 min.
That combines both tools' rules.

---

## 10. Error mapping (Lark codes → user messages)

| Code | Meaning | Fetch (`lark.js`) | Polaris (`net.js describe`) | Recommended |
|---|---|---|---|---|
| network / abort | — | "Couldn't reach the Lark service…" / "took too long…" (`:45-47`) | "can't reach its connection service (host)…" (`:171-173`) | Polaris (names the host). Add "may have been saved; retrying is safe" for writes. |
| blocked | ad blocker | — | `:167-170` | Polaris |
| proxy non-JSON / HTTP | — | "Lark error 502: HTTP 502" (`:43`, `55`) | "answered with an error (HTTP n)" (`:200`) | Polaris |
| proxy `{error:"not found"}` | old proxy | (auth.js:131 only) | `:177-179` | Polaris |
| 20005, 99991668, 99991677 | token invalid / expired | auth ended (`:23`) | `:185`, `isDeadToken` `:205` | both, as one set |
| 99991661, 99991663 | token missing / invalid | auth ended (`:23`) | **not mapped** (generic) | add to the shared dead-token set |
| 99991679 | scope missing | `:27` | `:186` | same text, OK |
| 91403 | no access to Base | `:26`; delete-specific (`:277-279`) | `:187` | same idea, OK |
| 91402, 1254003, 1254040 | Base not found / wrong token | — | `:188` ("check js/config.js") | Polaris, worded for end users ("Fetch is pointed at a Base that doesn't exist. Tell the tool owner.") |
| 1254004, 1254041 | table not found | — | `:189` | Polaris |
| 1254045 | field name not found | "Run tools/setup_lark_table.py --apply" (`:29`) | "A column … doesn't exist: {msg}" (`:190`) | Polaris (includes the column name); keep script hints in the README |
| 1254006, 1254043 | record not found | 1254043 only (`:28`) | `:191` | Polaris |
| 1254060–1254068 | value doesn't fit column type | — | `:195` | Polaris |
| 1254290 | too many requests | message only (`:30`) | message plus read retry (`:193`, `101`) | Polaris |
| 99991400 | rate limit (frequency) | — | message plus read retry (`:193`, `101`) | Polaris |
| 1254291 | write conflict | "Someone else is editing this row…" (`:31`) | "Lark is busy writing to this table…" (`:192`) | Either; also auto-retry *once* for writes (safe: conflict means not applied). Verify against Lark docs. |
| **1254302** | advanced-permission role denies | `:25`; delete-specific (`:277-279`) | **not mapped**, so it falls to "Lark said: … (code 1254302)" | Fetch's message; add to the shared table |
| syncTable message | synced read-only table | — | `:196-199` | Polaris |
| upload 413 / too large | — | `:260-262` | pre-check 10 MB (`:111-113`) | both: pre-check *and* map 413 |
| 20003/20004/20065, 20049, 20071, 20010, 20001/20002 | login codes | `fetch/js/auth.js:97-104` | `net.js:181-184` (no 20001/20002) | one shared table |

**Structure.** Fetch translates when it throws (`lark.js:53-56`): the raw `code`/`msg` is kept but the
message is fixed, and each call site special-cases codes (`lark.js:277`). Polaris keeps the raw error
and translates at display time (`net.js:164-203`). **Standard:** Polaris's structure, with a shared
`describe(err, ctx)` where `ctx = {app: "Fetch", proxyHost, tableTitle, onDelete?}`. Codes not in the
table fall through to "Lark said: {msg} (code n)", as Polaris does (`net.js:201-202`). The shared table
should be unit-tested so every code above has a message.

---

## 11. Proposed shared module: `lark/`

Polaris already has the right split. The shared module is mostly a generalized copy of `net.js` and
the table-agnostic half of `ops.js` and `sync.js`. Distribute it the way `ui.js`/`icons.js` already are:
the canonical copy lives in `design-ref/mineski-design-language/assets/lark/`, and an **unedited copy**
goes into each tool's `js/lark/` (`polaris/README.md:397` pattern). Add a test that hashes the copies,
because the two GitHub Pages sites may not share an origin.

```
lark/client.js    transport (browser)
  createLarkClient({ proxyBase: () => string, token: () => string|null,
                     onAuthEnded: (err) => void, writeTimeoutMs = 90000 })
    .call(method, url, body?, { read? })        → JSON (code 0) | throws LarkError
        // read = GET or /records/(search|batch_get): retried (network, 502-504, 1254290, 99991400)
        // writes: never retried; timeout → LarkError{ uncertain: true }
    .upload(file, { appToken, tableId, maxBytes = 10 MB }) → file_token
        // sends extra.bitablePerm.tableId (Fetch lark.js:251), 180 s timeout, 413 mapping
    .wake() → Promise<boolean>     .conn     .onConn(fn)
    .viaProxy(url)                 // for auth.js
lark/node.js      tenantToken({ proxy }), makeCall(token)      (tests/lark-node.mjs today)

lark/tables.js    I/O on one table; every function takes `call`
  OPEN_API, parseBaseLink(link) → { app, table, view, url }   (rejects /wiki/, requires tbl…)
  loadFields(call, t)
  loadRecords(call, t, fieldNames?|"*", onPage?)   // 500/page, 120 ms gap, throws on truncation
  getRecords(call, t, ids) / getRecord(call, t, id) // batch_get only
  createRecord(call, t, fields, clientToken)
  updateRecord(call, t, id, fields)
  deleteRecords(call, t, ids)
  newClientToken()

lark/schema.js    pure
  FIELD_TYPES, TYPE_NAMES, COMPUTED_TYPES
  checkSchema(title, fields, spec) → string[]      // fields, optional, options
  checkNeeded(title, fields, spec) → {kind: string[]}
  selectOptions(field), optionsOf(fields), writableOnly(payload, fields)
  presentColumns(spec, fields) → names to request
  // spec: { fields:{name:type}, optional?, options?:{name:[...]}, openOptions?:[name],
  //         read?:[names]|"*", index?:[names], neededBy?:{kind:[names]} }

lark/cells.js     pure (from sync.js)
  plain, clean, num, numOf, people, userRefs, isBlank, matchOption,
  toLarkDay(iso, offsetMin), fromLarkDay(ms, offsetMin), dayStart(ms, offsetMin), parseDay(text, offsetMin)

lark/verify.js    pure + one I/O helper
  verifyWritten(expected, actualFields) → [{field, want, got}]
  diffPatch(beforeFields, afterFields) → only changed cells (null = explicit clear)
  readBack(call, t, id, written) → { mismatches, readBackError }
  safeUpdate(call, t, id, patch, { expect?: (freshFields) => true | "reason",
                                   onlyBlank?: string[] })
      → { written, skipped, mismatches, readBackError } | throws AlreadyDone
  safeCreate(call, t, fields, clientToken, { unique?: (freshIndex) => true | "reason" })
  class AlreadyDone

lark/errors.js    pure
  class LarkError, DEAD_TOKEN_CODES, isDeadToken(err), isUncertain(err)
  describe(err, { app, proxyHost, tableTitle }) → one sentence
```

Each tool keeps only its own **domain** module: Fetch `rows.js` (`toFields`/`fromRecord` plus
`brief.js`), Polaris `sync.js` (cards, builders). Each also keeps a **spec** (Fetch: the columns from
`setup_lark_table.py:39-69` with `openOptions: ["Next Steps"]`; Polaris: `schemaSpec`). A shared
`tools/lark_setup.py` (or `node tools/setup.mjs`) can read a JSON export of the spec to create or
repair columns and options for any tool.

---

## 12. Concrete defects and risks found (by severity)

**High (silent data loss or corruption)**
1. Fetch update overwrites concurrent Lark edits to Next Steps, Attachments, Requirement, VAT and
   all readable columns. There is no re-read, and the `Last Modified` it already reads is never
   compared (`lark.js:203`, `238-242`; `app.js:1010`).
2. Fetch clears Requirement/VAT when Lark holds an option name that isn't in `config.js`
   (`lark.js:129-135`, `155-159`, `198-199`; `app.js:1291`).
3. Fetch `listAll` silently truncates on the page guard or a missing `page_token` (`lark.js:211`, `216`).
4. Fetch has no schema check. A renamed "Done" column makes every brief look active, and a renamed
   "Brief JSON" silently switches to the lossy fallback (`lark.js:165-197`).

**Medium**
5. Fetch writes placeholders ("Not specified", today's date, "Untitled Project") into Lark
   (`lark.js:99`, `118`; `brief.js:57`, `60`).
6. Fetch has no forward guard on `schema_version` (`brief.js:56`). An old cached page would downgrade
   newer JSON.
7. Polaris `fillGaps` overwrites a `VAT%` someone filled meanwhile (`ops.js:384`).
8. Polaris `saveInvoiceDetails` has no re-read (`ops.js:374-377`).
9. Polaris shows "Nothing was written" for network failures and timeouts on creates (`inbox.js:798`).
   Polaris writes have no timeout (`net.js:43-45`; `app.js:53`), so a stuck write can hang the sheet.
10. Polaris uploads lack `extra.bitablePerm` (`net.js:114-119` vs Fetch `lark.js:251`), a timeout and a
    dead-token check (`net.js:120-127`).
11. Fetch's brief cache survives session expiry (`app.js:129-140`) and isn't keyed by table.

**Low**
12. Fetch `parseLarkTable` accepts `/wiki/` tokens (`settings.js:33`).
13. Fetch `OVERRIDDEN` is computed but never shown (`settings.js:62`).
14. Stale comment: "proxy only forwards POST" (`lark.js:6`, `272`) vs `fetch/README.md:140`.
15. `fetch/README.md:286` says uploads use the `drive:drive` scope, but `LARK_SCOPES` is `"bitable:app"`
    (`config.js:20`). Check which is true and fix the README or the scope.
16. Polaris doesn't map 1254302 or 99991661/99991663 (`net.js:180-205`).
17. The two tools use different tenant hosts in links (`sg.` vs none) and different offset units.
18. Both Node paths get app tokens from the public proxy (`setup:97-102` `/token`; `lark-node.mjs:10-17`).
    This is out of scope here, but noted in `fetch/README.md:571-576` as a known exposure.

---

## 13. Parity gaps: what each tool should adopt from the other

### Fetch should adopt from Polaris
1. **A load-time schema check** (names, types, required options) from a declarative spec, with
   affected actions gated and problems listed (`ops.js:45-229`; `app.js:57-67`; `inbox.js:61-64`).
2. **A re-read before update plus conflict detection** (`ops.js:340-391`), using `Last Modified` or a
   compare of the fields being written.
3. **Only changed cells written; no blanks or placeholders written** (`sync.js:341-344`, `554`,
   `967-977`).
4. **Read-back verification** after create, update and Done (`ops.js:283-292`, `sync.js:877-905`),
   with "All N fields checked in Lark" or a mismatch list (`app.js:349-359`).
5. **Select writes through `matchOption`** against live options, so writes never create options by
   accident; Next Steps is declared as `openOptions` (`sync.js:120-127`).
6. **A generic request wrapper**: any method or table, reads retried with backoff, rate-limit retry,
   a proper non-JSON/proxy-body split, raw errors kept and translated by `describe()` at display
   time (`net.js:68-104`, `164-203`).
7. **Wake loop, connection state and ad-blocker detection** (`net.js:46-63`, `133-161`).
8. **The full error table**: 91402/1254003/1254040, 1254004/1254041, 1254006, 1254060-68, 99991400,
   syncTable, and 1254045 including the column name (`net.js:180-199`).
9. **Pagination that throws on truncation**, a 120 ms page gap, and per-table progress
   (`ops.js:148-164`).
10. **One link per table** in `config.js`, parsed by `parseBaseLink` (`polaris/js/config.js:10-20`,
    `ops.js:22-28`), plus `ENV_LABEL` and a header badge (`app.js:160-161`).
11. **Pure mapping split from I/O** (`sync.js`/`ops.js` with injected `call`), plus `node --test`
    fixtures from real payloads (`tests/sync.test.mjs`).
12. **`check:live`** (read-only), **`?preview`** with a gitignored snapshot, and an **`ENV_LABEL`-guarded
    e2e** that asserts the exact before/after diff (`tests/check-live.mjs`, `preview-shim.js`,
    `e2e-core.js`).
13. **A write-scope check** (`canWrite`, `polaris/js/auth.js:30-34`) with a "log in again to allow
    saving" note.
14. **A post-save re-read** of the affected row instead of rebuilding it locally (`app.js:360-365`).
15. **Clear cached data on any session end**, not only logout (`app.js:209-217`).
16. **An in-flight guard** on per-row actions (Done) (`inbox.js:220`, `238`, `253`).

### Polaris should adopt from Fetch
1. **The `bitablePerm` extra on attachment uploads** (`lark.js:251`) for advanced-permission Bases,
   plus an upload timeout (180 s, `lark.js:258`), a login-ended check (`lark.js:259`) and 413 mapping
   (`lark.js:260-262`).
2. **A client token that survives a reload**: store it with the sheet draft in local or session
   storage (`app.js:562` vs `inbox.js:266`, `471`).
3. **A finite write timeout** reported as "couldn't confirm; retrying is safe" (`lark.js:38-51`, but
   with honest wording) instead of waiting forever.
4. **The 1254302 message** (`lark.js:25`) and the **99991661/99991663** dead-token codes (`lark.js:23`).
5. **A spec-driven setup/repair script** (dry run by default; create missing columns and options;
   prune only on request) (`setup_lark_table.py:120-178`). Polaris can currently only report problems.
6. **An optional stale-while-revalidate list cache** for an instant first paint on phones
   (`app.js:45-46`, `1255-1266`), following the §9 rules (keyed by table, cleared on session end, never
   written from without a re-read).
7. **A single dead-login event** (`auth.ended()` fired inside the wrapper, `lark.js:68-72`) instead of
   `isDeadToken` checks repeated at about six call sites (`app.js:258`, `306`; `inbox.js:248`, `796`;
   `collections.js:204`, `228`).
8. **A consistent re-check in every update path**: Polaris's own `saveInvoiceDetails` and the `VAT%`
   bypass in `fillGaps` miss it (§6.3). This isn't a Fetch feature, but it is a parity gap within
   Polaris.
