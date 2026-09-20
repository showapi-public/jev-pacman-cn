# Design system

The UI is a dark, Linear-school data tool: near-black canvas, surfaces stacked by
luminance, whisper-thin translucent borders, and exactly one chromatic chrome
accent. Game colours are **data**, not chrome.

## Where things live

| Layer | File | Owns |
| --- | --- | --- |
| Tokens + reset + shell + primitives | `app/globals.css` | `:root` tokens, `body`, `.page`/`.header`/`.layout`/`.stack`, `.panel*`, `.label`/`.value`/`.mono`/`.muted`/`.chip`/`.dot`/`.banner`, `.btn`/`.segmented`/`.seed-input`, `.tabs`/`.tab`, `.legend*`, `kbd`, `.state-json`, `.event-log` |
| One module per data panel | `components/*.module.css` | that panel's layout only, prefix per component (`dp-`, `df-`, `mp-`, `hud-`) |

## Rules

0. **The canvas is the one exception to rule 1**: `lib/game/render.ts` keeps its
   colours as literals because a canvas cannot read CSS custom properties while
   drawing. They mirror the `--pacman` / `--maze-wall` / `--pellet` /
   `--ghost-*` tokens — change both together.
1. **No raw colour values outside `app/globals.css`.** Always `var(--token)`.
2. **11px is the floor** for text. Body is 13px, KPIs 19px, the one hero value 34px.
3. Every number is `var(--font-mono)` + `font-variant-numeric: tabular-nums`, so
   values that tick do not shift the layout.
4. Semantic HTML first (`table`, `dl`, `ol`, `button`, `label`), ARIA only to fill
   gaps. Interactive elements are real `<button>`s with a hover state and inherit
   the global `:focus-visible` ring.
5. Motion: transitions list exact properties (`background`, `color`, `transform`),
   120–180ms, `transform`/`opacity` only, and `prefers-reduced-motion` is handled
   globally — never `transition: all`.
6. No emoji, no icon fonts, no drop shadows. Depth is one luminance step
   (`--bg-panel` → `--bg-elevated`) plus a hairline border.
7. Empty states name the next action ("Press Start — the first decision appears at
   the first junction"), never "nothing here".
8. Colour meaning is fixed: indigo = interactive chrome; emerald = applied/healthy;
   amber = the agent is thinking (and Pac-Man himself); red = failure; violet =
   frightened ghost; grey = idle/neutral.

## Tokens

Surfaces `--bg-canvas --bg-panel --bg-elevated --bg-inset --bg-hover --bg-active` ·
text `--text-primary --text-secondary --text-tertiary --text-quaternary` (use
tertiary at the smallest sizes: quaternary fails AA contrast on panels) ·
structure `--border-subtle --border-standard --border-strong --divider` ·
accent `--accent --accent-hover --accent-soft --accent-fg --focus-ring` ·
status `--status-ok(-soft) --status-warn(-soft) --status-bad(-soft)` ·
data `--pacman --maze-wall --ghost-blinky --ghost-pinky --ghost-inky --ghost-clyde
--ghost-frightened` · radii `--r-xs … --r-xl --r-pill` (outer radius = inner +
padding) · spacing `--s-1 … --s-8` (8px rhythm) · type `--font-sans --font-mono
--fs-micro --fs-body --fs-title --fs-kpi --fs-hero` · motion `--dur-fast --dur --ease`.

## Colour assignment per panel

| Element | Token |
| --- | --- |
| Selected direction, Pac-Man, lives | `--pacman` |
| Other directions' bars | `--text-quaternary` on `--bg-inset` |
| APPLIED / answer in hand | `--status-ok` |
| ASKING JEV / fallback warning | `--status-warn` |
| STALE / TIMEOUT / ERROR / INVALID | `--status-bad` |
| Frightened ghosts | `--ghost-frightened` |
| Anything clickable | `--accent` |

## The playful layer

The app is a working arcade cabinet whose player happens to be a model. The chrome
stays restrained (one accent, hairline borders, no decoration); the *game* is allowed
to be loud. The delight thesis, in one sentence:

> The cabinet reacts to play — chomp, sparks, shake and a short synthesized voice —
> and every wait is spent showing the decision being made, never blocking, never faking.

Rules that keep it honest:

- **Sound is consensual.** Nothing plays before a user gesture (Start or the Sound
  switch). The switch is always visible, remembers itself, and a browser that blocks
  audio just gets a silent cabinet — no errors, no console noise.
- **Motion only when invited.** `prefers-reduced-motion` removes shake, particles,
  popups and confetti; the score flash and the decision panel keep working, so no
  information is motion-only.
- **Truthful waiting.** The pulsing ring on the maze appears only while a decision
  request is genuinely in flight, at the junction being asked about. It is not a
  progress bar and it never guesses.
- **One system, not a grab bag.** Every effect lives in `lib/game/juice.ts` (particles,
  popups, trauma shake, hit-stop, flash) and is triggered from engine events. Nothing
  in `lib/game` knows about React; nothing in `components` decides game state.
- **Canvas owns its palette.** `lib/game/render.ts` mirrors the CSS tokens as literals
  and is the only file allowed to hard-code colour — the canvas cannot read CSS
  variables at draw time.
- **Discovery, not gating.** The Konami code (↑↑↓↓←→←→BA) turns on neon mode: a
  hue-cycled maze and a badge, nothing else. No feature hides behind it.

## Verification

```bash
npx tsc --noEmit          # no output
npx vitest run            # 87 passed
npm run build             # production build
npx lighthouse http://localhost:3000 --only-categories=accessibility,best-practices \
  --preset=desktop --chrome-flags="--headless=new"   # a11y 100 is the target
```
