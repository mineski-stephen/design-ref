# Motion

Motion is short, eased and purposeful: it shows where something came from,
where it went, or that something is happening. It never decorates.

## Tokens

| Token | Value | Use |
| ----- | ----- | --- |
| `--ease` | `cubic-bezier(.22, 1, .36, 1)` | Everything: entries, hovers, menus, dialogs, folds |
| `--spring` | `cubic-bezier(.34, 1.56, .64, 1)` | Only tiny delights: the brand mark on hover, the "Copied!" badge |
| `--t-fast` | .15s | Color, border and background changes |
| `--t` | .25s | Disclosure arrows, small movements |
| `--t-slow` | .5s | Brand-mark tilt |

Typical durations: hover 150 ms; menu 180 ms; dialog 300 ms; toast 350 ms;
view change 400 ms; list stagger 40 ms per item (max 12 items); highlight 3.2 s;
fold-away 220 ms.

## The keyframes (in mineski-base.css)

| Name | What | Where |
| ---- | ---- | ----- |
| `rise` | fade in + 10px up | views, `.is-entering`, banners, disclosure content, record cards (staggered) |
| `fade` | opacity | dialog backdrop |
| `modalIn` | fade + 12px up + 97% scale | dialogs |
| `menuIn` | fade + 4px down + 98% | menus, popovers |
| `toastIn` | fade + 14px up + 97% | toasts |
| `badgeIn` / `badgeOut` | pop up / float away | "Copied!" badge |
| `spin` | **-90° → 270°**, linear | spinners: one full even turn, no jump at the loop point |
| `shimmer` | gradient sweep | skeletons |
| `glow` | brand ring that fades | `.is-new` cards |
| `landed` | brand-soft background that fades | `.is-new` table rows |
| `ping` | expanding ring | `.dot.is-warn` (waking up) |
| `urgent` | soft danger halo | `.badge-urgent` (due today) |
| `bob` | small float | the big loader's art while working |

## Rules

- **Animate on entry, never on every render.** Add `.is-entering` the first time
  a list renders or when an item comes back; re-renders from typing in search
  must not re-animate. Don't animate the whole document when one bullet changes;
  move the DOM in place.
- **No decorative loops.** Infinite animations are allowed only when they
  carry meaning that is happening now: spinners, skeleton shimmer, the
  waking-up ping, the urgent halo, the loader art while a task runs. A
  pulsing call-to-action or a floating illustration is not allowed.
- **No lingering transforms on views**: a `transform` left on a container traps
  `position: fixed` children (menus, bottom bars). Use `animation … backwards`.
- **Hover**: color, border and shadow changes; record cards may lift 3 px with a
  brand band sliding in on top. Buttons don't jump; they press down 1 px on `:active`.
- **Celebrate rarely**: confetti once, for a real milestone (the first save of
  a new record). Never for routine actions.
- **Reduced motion**: all animations and transitions drop to ~0 ms, scroll
  stops smoothing, decorative art hides. **Spinners keep turning** (slowly, 1.6 s):
  a frozen spinner reads as a hang. Confetti is skipped.
