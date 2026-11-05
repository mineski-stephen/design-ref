# Mineski web tools: design language and systems design

How every Mineski internal web tool looks, behaves and works underneath,
distilled from **Fetch** (project brief extractor) and **Polaris** (Universe
updater), so every new tool feels and works like part of the same family.

## What's here

| Path | For |
| ---- | --- |
| `mineski-design-language/` | **The interface skill**: tokens, components, copy, feedback, motion, the page shell, a starter tool and a showcase. Start with its `SKILL.md`. |
| `mineski-systems-design/` | **The systems skill**: Lark login, Lark Base reads and writes, networking, proxies, storage, ports, testing and deployment. The other half of every tool. Start with its `SKILL.md`. |
| `_audit/` | The evidence behind the systems skill: line-by-line audits of Fetch and Polaris **as they were before** the systems-parity work (Oct 2026). Historical; the skill describes the current state. |

At the workspace root:

| File | For |
| ---- | --- |
| `FETCH-CHANGES.md`, `POLARIS-CHANGES.md` | The independent design review of each tool (historical) |
| `FETCH-PLAN.md`, `POLARIS-PLAN.md` | The plans that moved each tool onto the design language (done) |
| `SYSTEMS-PARITY.md` | What each tool changed to meet the systems design, and what is still open |

## Using the skills

**In Claude Code**, install both as skills so agents pick them up automatically:

- for one project: copy `mineski-design-language/` and `mineski-systems-design/` to `<project>/.claude/skills/`
  (Fetch and Polaris already carry copies; refresh them when the skills change)
- for every project on this computer: copy them to `~/.claude/skills/`

Then ask for the work normally ("build an internal tool that…", "add a settings
page…", "save this to Lark"); the skills trigger on internal Mineski tools. You
can also point an agent at either `SKILL.md` directly.

**To look at the design language**, serve the folder and open the showcase and the starter:

```bash
python -m http.server 9140 --bind 127.0.0.1 --directory mineski-design-language
```

- http://127.0.0.1:9140/examples/showcase.html: every component, switchable between the Fetch, Polaris and spare themes, light and dark
- http://127.0.0.1:9140/templates/starter/: a complete working example tool (simulated backend)

**To start a new tool**: copy `mineski-design-language/templates/starter/`, pick
a free hue in `references/brand-and-identity.md` (or generate one with
`tools/make_theme.py`), claim a port in `mineski-systems-design` (section 8.3),
and follow both `SKILL.md` files.

## Keeping it consistent

- The skill folders are the single source of truth. Tools copy
  `assets/mineski-base.css`, `assets/ui.js`, `assets/icons.js` and
  `tools/serve.py` unedited (only `PORT` changes in `serve.py`); improvements go
  back into the skill, then out to every tool. Each tool's `npm run check:shell`
  checks the copies are byte-identical.
- When a tool claims a hue, add it to the registry in
  `mineski-design-language/references/brand-and-identity.md`; when it claims a
  port, add it to `mineski-systems-design` section 8.3.
