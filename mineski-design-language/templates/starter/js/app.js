/* Relay - the page shell: state, routes, views. A working example of every core
   Mineski pattern. The "backend" here is simulated (localStorage + delays) so the
   starter runs anywhere; replace `api` with real calls through your proxy.

   Patterns shown (see references/patterns.md):
   - the landing screen is the task; one primary button per view
   - staged, honest loader with Cancel that keeps the input
   - draft autosave + "resume your unsaved request"
   - edit-in-place document, pre-filled choice with a "Note:" reason
   - confirm sheet before writing; success toast; land on the list with the new item highlighted
   - list: search, sort, skeletons, ⋯ menu + right-click, Done section with Undo, two-step delete
   - Settings: Light/Dark/System, live connection status with fix-it buttons, Advanced only on localhost */

import { APP, SERVICE, PRIORITIES, STAGES } from "./config.js";
import { $, $$, h, ic, fillIcons, toast, busy, popBadge, copyText, flash, openMenu, confirmSheet,
         confirmDanger, initTheme, radioKeys, store, recall, fmt, sleep, confetti } from "./ui.js";

const K = (k) => `${APP.key}.${k}`;
const isLocal = /^(localhost|127\.0\.0\.1|\[::1\]|.+\.localhost)$/.test(location.hostname);

/* ============================== simulated backend ============================== */
const SEED = [
  { id: "r1", title: "Booth design for the Manila esports expo", client: "Acme Gaming", priority: "Urgent", due: Date.now() + 2 * 864e5,
    points: ["3 × 3 m booth, two demo stations", "Brand guide attached by the client", "Needs a quote by Friday"], done: false, filed: Date.now() - 864e5 },
  { id: "r2", title: "Caster lineup for the regional finals", client: "Northwind", priority: "Normal", due: Date.now() + 9 * 864e5,
    points: ["Two English casters, one Filipino", "Three match days"], done: false, filed: Date.now() - 3 * 864e5 },
  { id: "r3", title: "Sponsor recap deck", client: "Globex", priority: "Low", due: null,
    points: ["Use last season's numbers", "Keep it to ten slides"], done: false, filed: Date.now() - 6 * 864e5 },
  { id: "r4", title: "Venue walkthrough notes", client: "Initech", priority: "Normal", due: Date.now() - 4 * 864e5,
    points: ["Power at every table", "Load-in from 6 AM"], done: true, filed: Date.now() - 12 * 864e5 },
];
const db = () => recall("local", K("db")) || (store("local", K("db"), SEED), SEED);
const api = {
  async list() { await sleep(700); return db(); },
  async save(item) {
    await sleep(900);
    const all = db().filter((x) => x.id !== item.id);
    store("local", K("db"), [item, ...all]);
    return item;
  },
  async setDone(id, done) { await sleep(300); store("local", K("db"), db().map((x) => (x.id === id ? { ...x, done } : x))); },
  async remove(id) { await sleep(800); store("local", K("db"), db().filter((x) => x.id !== id)); },
};

/* ============================== state ============================== */
const S = {
  items: recall("local", K("cache")),   // last list, shown instantly while it refreshes
  loading: false, loadError: null, loadedAt: 0,
  doc: null,                            // the record being viewed or edited
  highlight: null,                      // id to highlight when the list renders
  run: null,                            // the long task in flight
  service: "unknown",                   // unknown | waking | awake | down
};

/* ============================== routes ============================== */
function route() {
  const [, a = "", b] = location.hash.match(/^#\/?([a-z]*)\/?([^/]*)/) || [];
  if (a === "items" && b) return showItem(decodeURIComponent(b));
  if (a === "items") return showItems();
  if (a === "settings") return showView("settings"), renderSettings();
  if (S.run) return showView("working");
  showView("compose");
  renderCompose();
}
function showView(name) {
  for (const v of $$(".view")) v.classList.toggle("active", v.dataset.view === name);
  const nav = { compose: "compose", working: "compose", item: "items", items: "items", settings: "settings" }[name];
  for (const a of $$(".nav a")) {
    if (a.dataset.nav === nav) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  }
  document.title = `${{ compose: "New request", working: "Working…", item: S.doc ? S.doc.title : "Request", items: "All requests", settings: "Settings" }[name]} · ${APP.name}`;
  window.scrollTo(0, 0);
}

/* ============================== compose ============================== */
function renderCompose() {
  const draft = recall("local", K("draft"));
  $("#resumeBanner").hidden = !draft;
  if (draft) $("#resumeTitle").textContent = draft.title;
  updateHint();
}
function updateHint() {
  const text = $("#reqText").value.trim();
  $("#createBtn").disabled = !text;
  $("#composeHint").textContent = text ? `${fmt.plural(text.split(/\s+/).length, "word")}. Ready when you are.` : "Paste a message to get started.";
}
$("#reqText").addEventListener("input", () => { store("session", K("typed"), $("#reqText").value); updateHint(); });
$("#reqText").value = recall("session", K("typed")) || "";
$("#resumeOpen").addEventListener("click", () => { S.doc = recall("local", K("draft")); location.hash = `#/items/${S.doc.id}`; });
$("#resumeDiscard").addEventListener("click", () => {
  const draft = recall("local", K("draft"));
  store("local", K("draft"));
  $("#resumeBanner").hidden = true;
  toast("Draft discarded.", { action: "Undo", onAction: () => { store("local", K("draft"), draft); renderCompose(); } });
});
$("#createBtn").addEventListener("click", startRun);

/* ============================== the long task ============================== */
async function startRun() {
  const text = $("#reqText").value.trim();
  if (!text) return;
  const run = (S.run = { cancelled: false, started: Date.now() });
  showView("working");
  const list = $("#stages");
  list.replaceChildren(...STAGES.map((s) => h("li", { "data-stage": s.id }, h("span", { class: "slot" }), s.label)));
  const total = STAGES.reduce((n, s) => n + s.ms, 0);
  $("#stageSub").textContent = `Usually about ${Math.round(total / 1000)} seconds.`;
  const late = setTimeout(() => { if (S.run === run) $("#stageSub").textContent = "Still working. Longer requests take a little longer…"; }, total + 1500);
  try {
    for (const s of STAGES) {
      const li = list.querySelector(`[data-stage="${s.id}"]`);
      li.className = "current";
      li.firstChild.replaceWith(h("span", { class: "spinner" }));
      $("#stageLabel").textContent = `${s.label}…`;
      await sleep(s.ms);
      if (run.cancelled) return;
      li.className = "done";
      li.firstChild.replaceWith(ic("check"));
    }
    S.doc = draftFrom(text);
    store("local", K("draft"), S.doc);
    S.run = null;
    location.hash = `#/items/${S.doc.id}`;
  } finally {
    clearTimeout(late);
    if (S.run === run) S.run = null;
  }
}
$("#cancelBtn").addEventListener("click", () => {
  if (S.run) S.run.cancelled = true;
  S.run = null;
  route();
  toast("Cancelled. Your text is still here.");
});

/* A pretend extraction: pre-fill, never label it "AI"; explain choices with "Note:". */
function draftFrom(text) {
  const lines = text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  const urgent = /\b(asap|urgent|today|tomorrow)\b/i.exec(text);
  return {
    id: "d" + Date.now().toString(36), title: (lines[0] || "New request").slice(0, 70), client: "",
    priority: urgent ? "Urgent" : "Normal", why: urgent ? `Note: the request says "${urgent[0]}".` : "",
    points: lines.slice(1, 6).map((l) => l.split(/\s+/).slice(0, 12).join(" ")), due: null, done: false,
    filed: Date.now(), unsaved: true,
  };
}

/* ============================== a record ============================== */
function showItem(id) {
  if (!S.doc || S.doc.id !== id) S.doc = (S.items || []).find((x) => x.id === id) || null;
  if (!S.doc) { location.hash = "#/items"; toast("That request isn't in the list any more.", { type: "warn" }); return; }
  showView("item");
  renderItem();
}
function ed(tag, value, placeholder, onInput) {
  const el = h(tag, { class: "ed", contenteditable: "plaintext-only", spellcheck: "true", "data-placeholder": placeholder }, value);
  el.addEventListener("input", () => { onInput(el.textContent.trim()); keepDraft(); });
  el.addEventListener("keydown", (e) => { if (e.key === "Enter" && tag !== "li") { e.preventDefault(); el.blur(); } });
  return el;
}
function keepDraft() { if (S.doc.unsaved) store("local", K("draft"), S.doc); }
function renderItem() {
  const d = S.doc;
  $("#itemMeta").textContent = d.unsaved ? "Not saved yet" : `Filed ${fmt.day(d.filed)}`;
  $("#itemDoc").replaceChildren(
    h("p", { class: "kicker" }, "Request summary"),
    h("h2", null, ed("span", d.title, "Add a title", (v) => { d.title = v; })),
    h("p", { class: "muted" }, ed("span", d.client, "Client not specified", (v) => { d.client = v; })),
    h("section", null, h("h3", null, "Key points"),
      h("ul", null, d.points.map((p, i) => h("li", null, ed("span", p, "Add a point", (v) => { d.points[i] = v; }))))));
  $("#prioChips").replaceChildren(...PRIORITIES.map((p) => h("button", { type: "button", class: "chip-opt", role: "radio",
    "aria-checked": String(d.priority === p), onclick: () => { d.priority = p; d.why = ""; keepDraft(); renderItem(); } }, p)));
  $("#prioWhy").hidden = !d.why;
  $("#prioWhy").textContent = d.why;
  const save = $("#saveBtn");
  save.querySelector(".label").textContent = d.unsaved ? "Save to Lark Base" : "Save changes";
}
$("#copyBtn").addEventListener("click", async () => {
  const d = S.doc;
  const text = [`*${d.title}*`, d.client && `Client: ${d.client}`, `Priority: ${d.priority}`, ...d.points.map((p) => `• ${p}`)].filter(Boolean).join("\n");
  if (await copyText(text)) popBadge($("#copyBtn"), "Copied!");
  else toast("Couldn't copy. Select the text and copy it by hand.", { type: "error" });
});
$("#saveBtn").addEventListener("click", async () => {
  const d = S.doc, first = d.unsaved;
  const ok = await confirmSheet({
    title: first ? "Save this request to Lark?" : "Save your changes to Lark?",
    sub: first ? "It'll be added as a new row in the team's requests table." : "The row in Lark will be updated.",
    icon: "save", confirm: "Save to Lark", busyText: "Saving…",
    body: h("dl", { class: "summary-list" },
      h("dt", null, "Title"), h("dd", null, d.title),
      h("dt", null, "Client"), h("dd", { class: d.client ? null : "is-empty" }, d.client || "Not specified"),
      h("dt", null, "Priority"), h("dd", null, d.priority)),
    run: () => api.save({ ...d, unsaved: false }),
  });
  if (!ok) return;
  if (first) store("local", K("draft"));
  d.unsaved = false;
  S.highlight = d.id;
  S.items = null;
  if (first) { confetti($("#saveBtn")); $("#reqText").value = ""; store("session", K("typed")); }
  toast(first ? "Saved to Lark." : "Changes saved.", { type: "success", detail: `“${d.title}” is in the team's list.` });
  location.hash = "#/items";
});

/* ============================== the list ============================== */
async function showItems() {
  showView("items");
  renderItems();
  if (!S.items || Date.now() - S.loadedAt > 30000) await loadItems();
}
async function loadItems() {
  if (S.loading) return;
  S.loading = true; S.loadError = null;
  $("#refreshBtn").classList.add("is-busy");
  renderItems();
  try {
    S.items = await api.list();
    S.loadedAt = Date.now();
    store("local", K("cache"), S.items);
  } catch (e) {
    S.loadError = e;
  } finally {
    S.loading = false;
    $("#refreshBtn").classList.remove("is-busy");
    renderItems();
  }
}
function renderItems() {
  const grid = $("#grid"), status = $("#listStatus");
  const open = (S.items || []).filter((x) => !x.done);
  $("#itemCount").textContent = S.items ? String(open.length) : "";
  status.classList.toggle("is-error", !!S.loadError);
  status.replaceChildren(...(S.loadError ? [ic("alert"), "Couldn't load the list. ", h("button", { type: "button", class: "linkish", onclick: loadItems }, "Try again")]
    : S.loading && S.items ? [h("span", { class: "spinner" }), "Refreshing…"]
    : S.loadedAt ? [`Updated ${fmt.time(S.loadedAt)}`] : []));
  if (!S.items) {   // first load: skeletons in the shape of the cards
    grid.replaceChildren(...[0, 1, 2].map(() => h("div", { class: "rcard is-skeleton", "aria-hidden": "true" },
      h("span", { class: "sk sk-chip" }), h("span", { class: "sk sk-title" }), h("span", { class: "sk sk-line" }), h("span", { class: "sk sk-line short" }))));
    $("#doneGroup").hidden = true;
    return;
  }
  const q = $("#search").value.trim().toLowerCase();
  const by = { new: (a, b) => b.filed - a.filed, due: (a, b) => (a.due || 9e15) - (b.due || 9e15), az: (a, b) => a.title.localeCompare(b.title) }[$("#sort").value];
  const match = (x) => !q || `${x.title} ${x.client} ${x.priority}`.toLowerCase().includes(q);
  const list = open.filter(match).sort(by);
  const done = S.items.filter((x) => x.done && match(x)).sort((a, b) => b.filed - a.filed);
  if (!S.items.length) {
    grid.replaceChildren(h("div", { class: "empty" }, h("div", { class: "empty-art", "aria-hidden": "true" }, ic("inbox")),
      h("h2", null, "No requests yet"), h("p", null, "Create your first request and save it. It'll show up here for the whole team."),
      h("a", { class: "btn btn-primary", href: "#/" }, ic("sparkles"), "Create a request")));
  } else if (!list.length) {
    grid.replaceChildren(h("div", { class: "empty small" }, h("p", null, q ? `No open requests match “${q}”.` : "Every request is marked as done. Nice work!")));
  } else {
    grid.replaceChildren(...list.map(card));
  }
  $("#doneGroup").hidden = !done.length;
  $("#doneCount").textContent = done.length;
  $("#doneGrid").replaceChildren(...done.map(card));
  if (S.highlight) {
    const el = $(`[data-id="${S.highlight}"]`);
    S.highlight = null;
    if (el) flash(el);
  }
}
const TONE = { Urgent: "badge-err", Normal: "badge-info", Low: "badge-muted" };
let entered = false;
function card(x, i) {
  const el = h("a", { class: `rcard${x.done ? " is-done" : ""}${entered ? "" : " is-entering"}`, href: `#/items/${x.id}`,
                      "data-id": x.id, style: `--i:${Math.min(i, 12)}` },
    h("div", { class: "rcard-top" },
      h("span", { class: `badge ${TONE[x.priority]}` }, x.priority),
      h("span", { class: `badge ${x.due && x.due < Date.now() + 3 * 864e5 && !x.done ? "badge-warn" : "badge-muted"}` }, ic("clock"),
        x.due ? `Due ${fmt.day(x.due)} · ${fmt.relDays(x.due)}` : "No due date")),
    h("h3", null, x.title),
    h("p", { class: "rcard-sub" }, x.client || "Client not specified"),
    h("p", { class: "rcard-body" }, x.points.slice(0, 2).join(" · ")),
    h("div", { class: "rcard-foot" }, `Filed ${fmt.day(x.filed)}`));
  // The ⋯ button sits beside the link, not inside it: a button inside <a> is invalid.
  const more = h("button", { type: "button", class: "more-btn", "aria-label": `More actions for ${x.title}`, "aria-haspopup": "menu", title: "More actions",
    onclick: (e) => { e.preventDefault(); openMenu(menuFor(x), { anchor: e.currentTarget }); } }, ic("dots"));
  const wrap = h("div", { class: "rcard-wrap" }, el, more);
  wrap.addEventListener("contextmenu", (e) => { e.preventDefault(); openMenu(menuFor(x), { x: e.clientX, y: e.clientY }); });
  return wrap;
}
const menuFor = (x) => [
  { label: "Open", icon: "open", onSelect: () => { location.hash = `#/items/${x.id}`; } },
  { label: x.done ? "Mark as Not Done" : "Mark as Done", icon: x.done ? "undoneCircle" : "doneCircle", onSelect: () => setDone(x, !x.done) },
  "-",
  { label: "Delete…", icon: "trash", danger: true, onSelect: () => remove(x) },
];
async function setDone(x, done) {   // optimistic: change first, roll back if the backend refuses
  x.done = done;
  renderItems();
  try {
    await api.setDone(x.id, done);
    toast(done ? `“${x.title}” moved to Done.` : `“${x.title}” is back in the list.`, { type: "success", action: "Undo", onAction: () => setDone(x, !done) });
  } catch (e) {
    x.done = !done;
    renderItems();
    toast(`Couldn't update “${x.title}”.`, { type: "error", detail: e.message, action: "Try again", onAction: () => setDone(x, done) });
  }
}
async function remove(x) {
  const ok = await confirmDanger({
    what: x.title,
    details: [["Title", x.title], ["Client", x.client], ["Filed", fmt.day(x.filed)]],
    consequence: "This removes it from the Lark Base for everyone.",
    safer: "Mark it Done instead if you might need it again.",
    run: () => api.remove(x.id),
  });
  if (!ok) return;
  S.items = S.items.filter((y) => y.id !== x.id);
  store("local", K("cache"), S.items);
  renderItems();
  toast(`Deleted “${x.title}”.`, { type: "success" });
}
$("#search").addEventListener("input", renderItems);
$("#sort").addEventListener("change", renderItems);
$("#refreshBtn").addEventListener("click", loadItems);

/* ============================== settings ============================== */
function renderSettings() {
  const svc = { awake: ["is-ok", "Awake"], waking: ["is-warn", "Waking up… This can take up to a minute."],
                down: ["is-err", "Unreachable (no answer for 3 minutes)"], unknown: ["", "Not checked yet"] }[S.service];
  const base = S.items ? ["is-ok", `Connected · ${fmt.plural(S.items.length, "request")}`] : ["", "Not loaded yet"];
  $("#connList").replaceChildren(
    h("li", null, h("span", { class: `dot ${svc[0]}` }), h("span", { class: "status-text" }, h("b", null, "Relay service"), h("span", null, svc[1])),
      h("button", { type: "button", class: "btn btn-sm", onclick: wake }, S.service === "down" ? "Try again" : "Wake up")),
    h("li", null, h("span", { class: `dot ${base[0]}` }), h("span", { class: "status-text" }, h("b", null, "Lark Base"), h("span", null, base[1])),
      h("button", { type: "button", class: "btn btn-sm", onclick: async () => { await loadItems(); renderSettings(); } }, "Refresh")));
  $("#advanced").hidden = !isLocal;
  $("#svcInput").placeholder = SERVICE.hosted;
  $("#svcInput").value = recall("local", K("svc")) || "";
}
async function wake() {   // wake the sleeping service early, so it's ready when needed
  S.service = "waking";
  if ($("[data-view=settings].active")) renderSettings();
  await sleep(1500);
  S.service = "awake";
  if ($("[data-view=settings].active")) renderSettings();
}
$("#svcSave").addEventListener("click", () => {
  const v = $("#svcInput").value.trim();
  if (v && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\b/.test(v)) return toast("Only a localhost address can be used here.", { type: "error" });
  store("local", K("svc"), v || undefined);
  $("#overrideBadge").hidden = !v;
  toast(v ? "Using that service on this computer." : "Using the hosted service.", { type: "success" });
});
$("#svcReset").addEventListener("click", () => { store("local", K("svc")); $("#svcInput").value = ""; $("#overrideBadge").hidden = true; toast("Using the hosted service.", { type: "success" }); });
$("#clearLocal").addEventListener("click", () => {
  ["draft", "cache"].forEach((k) => store("local", K(k)));
  store("session", K("typed"));
  S.items = null;
  toast("Cleared this browser's draft and cached list.", { type: "success" });
});
$("#reloadBtn").addEventListener("click", () => location.reload());

/* ============================== start ============================== */
fillIcons();
initTheme($("#themeSeg"), K("theme"));
radioKeys($("#prioChips"));
$("#appVersion").textContent = `v${APP.version}`;   // the running version, beside the name
$("#appVersion").title = `${APP.name} version ${APP.version}`;
$("#envBadge").hidden = !APP.envLabel;
$("#envBadge").textContent = APP.envLabel;
$("#overrideBadge").hidden = !(isLocal && recall("local", K("svc")));
window.addEventListener("hashchange", route);
window.addEventListener("beforeunload", (e) => { if (S.run) { e.preventDefault(); e.returnValue = ""; } });
route();
wake();                                   // do work early: wake the service and prefetch the list
loadItems().finally(() => { setTimeout(() => { entered = true; }, 50); });
document.documentElement.dataset.booted = "";   // the boot watchdog in index.html stands down
