# Relay (starter)

<img src="img/tool-icon.svg" alt="Relay logo" width="96" align="right">

A working example of a Mineski internal tool, built only from the shared design
language (`mineski-design-language`). Copy this folder to start a new tool.

**Its backend is simulated** (localStorage plus delays) so it runs anywhere.
Replace `api` in `js/app.js` with real calls through your proxy.

## Run it

```bash
python tools/serve.py
```

Open http://127.0.0.1:9126/. `tools/serve.py` disables caching and serves `.js`
as JavaScript (plain `python -m http.server` can break module scripts on
Windows). 9126 is a placeholder: claim the next free port in the registry in
`mineski-systems-design` (section 8.3), set `PORT` in `tools/serve.py` and
`.claude/launch.json`, and register `http://127.0.0.1:<port>/` on the Lark app.

## Make it yours

1. Rename: `index.html` (title, description, brand name, aria labels),
   `manifest.webmanifest`, `js/config.js` (`APP.name`, `APP.key`).
2. Theme: pick a free hue slot or generate one, then save it as `css/theme.css`
   (see `references/brand-and-identity.md`). Update the Google Fonts link and
   both `theme-color` metas.
3. Icon: redraw `img/tool-icon.svg` to the icon recipe and export 32 / 180 / 512 px PNGs.
4. Replace the views' content with your task, keeping the patterns.
5. Replace the simulated backend following `mineski-systems-design` (Lark
   login, the shared Lark client, safe writes, `package.json` scripts and
   tests). It is the other half of every tool; run its checklist too.
6. Rewrite this README for the team: what it does, using it, settings,
   deploying, troubleshooting (the real messages people see).

Never edit `css/mineski-base.css`, `js/ui.js` or `js/icons.js` per tool; put
tool-only styles in `css/app.css` (tokens only).

## Files

| File | Purpose |
| ---- | ------- |
| `index.html` | The page: top bar, views, toasts host, the cache-busting loader |
| `css/theme.css` | Brand and neutrals, light and dark (generated) |
| `css/mineski-base.css` | The shared stylesheet (copied, unedited) |
| `css/app.css` | Relay-only styles |
| `js/config.js` | Names, the version, labels, stages, the hosted service URL |
| `CHANGELOG.md` | Every change and version update, newest first; its top entry matches `APP.version` |
| `js/app.js` | State, routes and views |
| `js/ui.js`, `js/icons.js` | Shared helpers and icons (copied, unedited) |
| `tools/serve.py` | The local dev server (no caching, correct JavaScript types), copied from the skill's `tools/` |
| `.claude/launch.json` | Runs `tools/serve.py` for Claude Code's preview |
