---
name: mineski-design-language
description: The shared visual and interaction language of Mineski's internal web tools (Fetch, the project brief extractor, and Polaris, the Universe updater). Use it whenever you design, build, restyle or review any internal Mineski page, tool, dashboard or prototype, so it looks and behaves like part of the same family, even with zero prior context. Provides a drop-in stylesheet, theme generator, icon set, UI helpers, a runnable starter tool, a live component showcase, and the rules behind them (layout, color, type, components, copy, feedback, motion, resilience, accessibility) plus a review checklist.
---

# Mineski design language

Mineski's internal tools are small, fast, single-purpose web pages for busy,
non-technical teams (BD, account management, finance, operations). People open
one to get **one job** done, often between meetings, sometimes on a phone, then
paste the result into a Lark group chat or table. Every rule here serves that person.

Two tools define the family today:

| Tool | Job | Brand | Font | Feel |
| ---- | --- | ----- | ---- | ---- |
| **Fetch** | Turns client briefs into a one-page Project Brief, saved to Lark Base | Mineski yellow `#FFC800`, warm greys | Plus Jakarta Sans | upload box → loader → editable document |
| **Polaris** | Pushes new briefs, PARs and invoices into the Universe / Collections tables | Indigo `#4B3FE0`, cool greys | Plus Jakarta Sans | inbox of cards → confirm sheet → table |

They look different at a glance (color, icon) but are unmistakably related:
same font, top bar, nav, Settings page, structure, components, spacing, radii,
shadows, motion, copy voice and behavior. **A new tool keeps everything shared
and changes only its "personality dials"**: one brand hue, one app icon and a
name.

## How to use this skill

1. **Read this file fully.** Then read the reference files the task touches
   (table below). For a new tool, read all of them; they are short.
2. **Start from the starter**, not a blank page: copy `templates/starter/`
   into the new project. It is a complete, working tool (compose → staged
   loader → editable record → confirm → list with menus, Done section, two-step
   delete → Settings) built only from the shared assets.
3. **Pick the personality dials** (`references/brand-and-identity.md`): a name,
   an unused hue slot, an icon. Generate the theme:
   `python tools/make_theme.py "#HEX" --name "Tool" -o css/theme.css`
   (it checks WCAG AA and refuses red/green brands).
4. **Build with the shared classes** in `assets/mineski-base.css`
   (`references/components.md`). Put only tool-specific styles in `css/app.css`,
   using tokens only, never raw colors.
5. **Write the copy** by `references/copy-and-voice.md`.
6. **Build the backend by `mineski-systems-design`** (the sibling skill): Lark
   login, the shared Lark client, safe writes, proxies, storage, ports, tests.
7. **Run `references/checklist.md`** in light and dark, at 375 px and desktop,
   with the keyboard, plus the systems checklist, before calling it done.

To *see* the language: serve this folder (`python -m http.server 9140 --bind 127.0.0.1`) and open
`examples/showcase.html` (every component, switchable between the Fetch,
Polaris and spare themes and light/dark) and `templates/starter/`.

## Files

| Path | What it is |
| ---- | ---------- |
| `assets/mineski-base.css` | The shared stylesheet: tokens, base, every component, motion, responsive, print. Never edit per tool; override in `app.css`. |
| `assets/themes/*.css` | Theme token files: `fetch.css`, `polaris.css`, `suppliers.css` (reference only, taken hues), `slot-teal.css`, `slot-tangerine.css` (ready for new tools). |
| `assets/icons.js` | The icon set (24 px grid, 2 px round strokes). ES module. |
| `assets/ui.js` | Behavior helpers: `h()`, `toast()`, `busy()`, `flashDone()`, `popBadge()`, `copyable()`, `openMenu()`, `confirmSheet()`, `confirmDanger()`, `initTheme()`, `collapse()`, `flash()`, `store()/recall()`, `fmt`, `confetti()`. |
| `tools/make_theme.py` | Theme generator + contrast checker (stdlib Python). |
| `tools/serve.py` | The local dev server every tool copies (no caching, correct JavaScript types); set its `PORT`. |
| `templates/starter/` | A runnable example tool to copy (index.html, css/, js/, img/, tools/serve.py, manifest, launch.json). Its backend is simulated. |
| `examples/showcase.html` | Live gallery of every component in every theme. |
| `references/principles.md` | The 14 behavioral principles, each with its why. **Start here.** |
| `references/tokens-and-color.md` | Every token, what it's for, light/dark rules, semantic colors. |
| `references/typography-and-layout.md` | Fonts, type scale, spacing, widths, top bar, breakpoints. |
| `references/components.md` | Every component: when to use it, markup, variants, do/don't. |
| `references/feedback-and-states.md` | Toasts, busy buttons, loaders, waking services, errors, empty states, undo, optimistic updates, destructive actions. |
| `references/motion.md` | Easing, durations, the keyframe set, entry-only animation, reduced motion. |
| `references/copy-and-voice.md` | Voice rules and a library of real strings to reuse. |
| `references/patterns.md` | Page recipes: login, task landing, long task, record view, record list, inbox + sheet, settings. |
| `references/tech-shell.md` | Static-site shell: head boilerplate, cache busting, modules, storage, README. The backend rules are in `mineski-systems-design`. |
| `references/brand-and-identity.md` | Naming, the hue registry, fonts, the app-icon recipe, favicons, manifest. |
| `references/checklist.md` | The review checklist. |

## The non-negotiables (if you remember nothing else)

1. **The landing screen is the task.** No hero, marketing copy, feature list,
   eyebrow chips or "How it works". One primary (filled brand) button per view.
2. **Tokens only.** Components never hard-code a color; one theme file restyles
   everything. One brand color, used for the primary action, focus, selection
   and small highlights. Everything else is neutral or semantic.
3. **Light, Dark and System**, default System, applied in `<head>` before paint,
   dark tokens defined twice (`[data-theme="dark"]` and the media query).
4. **Every action answers within 100 ms**: busy label, toast, badge or
   optimistic change. Reversible actions offer **Undo**; errors **stay** until
   dismissed and say what to do next.
5. **Waiting is honest**: real stages, a truthful estimate that becomes "Still
   working…" instead of a fake 99%, no countdown for cold starts, always Cancel,
   and Cancel keeps the input.
6. **Permanent deletes ask twice**, focus starts on Cancel, the confirm button
   locks for 900 ms per step, and the copy offers the reversible alternative.
7. **Copy is short, plain and human.** Labels say exactly what happens ("Save to
   Lark Base", not "Submit"). No em-dashes. Use the backend's exact option
   labels. Never brand output as "AI"; explain pre-filled choices with `Note:`.
8. **Works with zero setup**; secrets live on the proxy, never in the page.
   Developer overrides only on localhost and always visible while active.
9. **Resilient**: fresh assets on every load, ad-blocker detection, cold-start
   retries, drafts autosaved, old data normalized, `localStorage` wrapped in try/catch.
10. **Accessible and phone-ready**: visible focus ring, keyboard for everything,
    `<dialog>` for modals, AA contrast in both themes, 16 px inputs, works at
    375 px with no horizontal scroll, hover-only affordances partly visible on touch,
    `prefers-reduced-motion` respected.
11. **Static and hand-over-able**: `index.html` at the root, plain CSS, ES
    modules, no build step, GitHub Pages; a README for the team with a
    troubleshooting table of real messages.
12. **Same details everywhere.** Put two tools side by side at the same width:
    the brand, nav, gear, session pill, avatar, page title and Settings cards
    sit at the same positions, in the same order, with the same labels, icons
    and formats ("1h 42m"). See "Family consistency" in `references/checklist.md`.

## When the request is only part of a tool

Even a single dialog, table or settings card must use the shared classes and
tokens, the copy voice and the feedback rules. If the host page is not yet on
the shared stylesheet, include `mineski-base.css` and a theme rather than
recreating styles by hand.

## When something isn't covered

Decide by the principle closest to it (`references/principles.md`), prefer
the simpler and quieter option, reuse an existing component before inventing
one, and if you add a component, build it from tokens and the existing radii,
shadows and type sizes so it looks native. When in doubt, remove text; if the
screen stops being clear, put it back shorter.
