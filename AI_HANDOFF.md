# MOONLIT GROVE — AI HANDOFF

## CURRENT STATE

Project:

달빛 숲의 수호자 / Moonlit Grove

Current Version:

v0.1.5

Current Phase:

Phase 6.2 — Combat Readability & Threat Feedback — **COMPLETE** (implemented
and verified by Claude Code, refining 6.1 based on further player feedback)

Implemented (Phase 6.2):

* **Sword readability, round 2** (feedback: "still hard to understand" after
  6.1): the reach-fan gradient now brightens toward the *outer edge* instead
  of the center (a shockwave-style cue for "here's the boundary"), plus a
  crisp stroked arc traced exactly at the swing's reach — still a curved
  line following the blade, not a rectangle, so it doesn't read as a debug
  hitbox. Trail alpha pushed up again (0.18/0.36/0.62/1.0, was 0.12/0.26/0.48/1.0).
* **Wind-up, made much bolder** (feedback: "difficult to notice"): shrink
  nearly doubled (0.16→0.30 of body size), added a directional lean toward
  the player (`facingSign`-based), and a pulsing amber warning ring (`#ffb347`,
  alpha 0.25–0.60) distinct from the existing eye-flicker — three independent
  signals (size + lean + color) instead of one. Verified by pixel-diffing the
  same screen coordinates in windup vs. approach — confirmed both the size
  change and a genuine warm-color shift, not just a lucky screenshot angle.
* **Lunge stretch trail**: a faded body-color ghost circle trails behind the
  lunge direction (same technique as the sword's blade trail) for a "shot
  forward" read. Timing/distance constants (~0.20s windup, ~0.17s lunge,
  ~21 units) intentionally unchanged from 6.1 — this pass only touched
  visibility, not values.
* **Player contact feedback** (new — was invisible before): when a lunge's
  hurtbox overlaps the player's new `MG.Player.getHurtbox()`, `enemy.js`
  calls `MG.Player.onContactHit()`, which pushes the player 5 world units
  away (existing `MG.Collision.moveAndCollide`), sets an 0.08s red flash
  overlay, calls the existing `MG.Game.hitStop()` at 0.04s, and plays a new
  `MG.Audio.playPlayerContact()` (low sine "thud", distinct from both the
  sword-swing whoosh and the enemy-hit "탁"). **Still no player HP, no
  damage value, no game over** — purely a "the enemy reached me" signal.
  Guarded by a per-lunge `e.lungeContactDone` flag (reset only when a new
  lunge starts), verified to fire exactly once across 20 overlapping frames
  and never fire during ordinary (non-lunge) chase contact. Movement/attack
  input confirmed fully responsive on the very next frame after a contact
  (no stun, no input gating added anywhere in this feature).

Previously implemented (Phase 6.1 — unchanged this pass):

* **Attack readability**: `Player.drawAttackSwing()` (`js/player.js`) now also
  fills a soft translucent fan from the pivot out to the same 14px reach as
  `combat.js`'s hitbox, growing as the swing progresses — the player sees
  roughly how far the sword reaches without a debug rectangle. Blade trail
  went from 2 ghost steps to 3 (more visible), and the blade itself is drawn
  the full 14px reach instead of ~9px.
* **Hit confirmation** (all on `enemy.js:applyHit()`, same successful hit):
  flash decoupled from knockback into its own `FLASH_DURATION=0.08s` (was
  tied to the 0.14s knockback before); 4 bright "spark" particles
  (`type:'spark'`, distinct color from the green death "poof") at the hit
  point; `MG.Game.hitStop(0.045s)` — new method in `game.js`, implemented as
  a dt-scale (×0.06) inside the RAF `_step` closure for exactly one brief
  window, not a hard pause, so touch/keyboard events (which arrive
  independently of the loop) are never blocked and cooldown timers just tick
  very slowly rather than freezing; `playEnemyHit()` in `audio.js` got a
  short noise "click" layered under the existing tone for more of a
  "탁" transient. Knockback values themselves untouched.
* **Miss vs hit**: miss already produced zero flash/spark/sound/hitstop by
  construction (all four only fire from inside `applyHit`, which only runs
  on a confirmed AABB overlap) — verified directly rather than assumed.
* **Density**: 3 → 9 Mosslings, distributed 2 near start / 2 along the main
  path / 3 deeper forest / 2 other open areas, using the same glade/path-
  corridor-safe placement approach as Phase 6 (all 9 spawned with zero
  `findClearSpot` nudging needed).
* **Threat without player damage**: added a windup→lunge sub-phase inside
  the existing `CHASE` state (`e.chasePhase`: `approach|windup|lunge` — not
  a new top-level state). Within 55 world units, freezes in place for
  ~0.20s (readable coil — measured 0.217s due to frame quantization, within
  the 0.18–0.25s ask) with a fast eye-flicker warning, then locks a
  direction and dashes ~21 units over ~0.18s (measured 0.183s, within
  15–20s... i.e. 0.15–0.20s ask), then an 0.8s cooldown before it can
  wind up again. Still never touches player HP/damage — purely a movement
  threat.

Previously implemented (Phase 6, unchanged this pass):

* Mossling enemy (`js/enemy.js`, was an empty stub before Phase 6)
* state machine: IDLE ↔ WANDER (leashed to home, ~46 units) → CHASE (on player within
  135 units) → WANDER (hysteresis: gives up beyond 175 units, or if pulled >260 units
  from home) ; HIT (knockback) and DEAD (fade+shrink, then removed) interrupt any state
* sword integration consumes the existing `MG.Combat.getAttackHitbox()` unchanged —
  enemy.js only added a `player.attackId` counter (bumped once per swing in
  `combat.js:startAttack`) so each Mossling can remember "already hit by swing #N" and
  never take more than 1 HP per swing, verified for real (7-8 active-window frames,
  exactly 1 HP lost)
* HP 3, 1 damage/hit, knockback ~30 world units over 0.14s (via the existing
  `MG.Collision.moveAndCollide`, so it stops naturally against trees/rocks), hit flash,
  tiny particle burst on hit (3) and death (6), death fade+shrink over 0.35s then spliced
  out of the array
* Mosslings collide with trees/rocks/water using the exact same
  `MG.Collision.moveAndCollide` player already uses — no second physics system
* rendered through the same world-space camera transform and y-sorted alongside
  trees/player in `game.js`'s existing props loop (`MG.Enemy.collect`/`renderOne`)
* `DEBUG_ENEMY` (const, default `false`, top of `enemy.js`) — independent of
  `DEBUG_COMBAT`, which is untouched
* `playEnemyHit()` / `playEnemyDefeat()` added to `audio.js` (same try/catch-safe
  procedural pattern as the Phase 5 sword sound)
* Player has no HP/damage/knockback — Mosslings never affect the player (not
  implemented, per scope)

Previously implemented (Phase 5):

* sword attack (SPACE on desktop, existing bottom-right button on mobile)
* directional attack (locked to facing at the moment the swing starts)
* attack timing (0.22s duration / 0.30s cooldown, delta-time based, not frame-count based)
* attack cooldown (spam-proof — verified a press during cooldown does not restart the swing)
* attack hitbox (`MG.Combat.getAttackHitbox()`, world-space, active only mid-swing)
* mobile attack input (existing Phase 3 button + pointer id, unchanged)
* desktop attack input (SPACE, reused existing key-blocking)
* sword visual animation (rotating blade + 2-ghost trail + brief tip glint)
* attack sound (procedural noise-burst "whoosh" via Web Audio, fails silently if unavailable)

Not implemented (by design — later phases):

* player HP / damage / invincibility (Mosslings do not and cannot hurt the player yet)
* companion / Moski
* treasure
* Vine Bridge
* boss
* multiple enemy types
* enemy attacks, XP, loot, enemy health bars

Next:

Phase 7 — Player HP / damage / knockback / invincibility / game over

---

## COMPLETED PHASES

### Phase 1

HTML5 Canvas foundation

* HTML structure
* Canvas
* responsive stage
* title screen
* initial UI

### Phase 2

Player

* LUKA
* 8-direction movement
* 4-direction facing
* walking animation
* keyboard movement

### Phase 3

Mobile input

* Pointer Events
* floating virtual joystick
* attack button placeholder
* unified input axis
* independent pointer IDs
* keyboard + touch input

### Phase 4

Forest world

* forest map
* world rendering
* player-camera relationship
* world collision
* map boundaries
* trees
* rocks
* water
* paths
* environmental structure

---

# CURRENT IMPLEMENTATION

Existing architecture:

```text
index.html
style.css

js/
  main.js
  game.js
  player.js
  input.js
  map.js
  collision.js
  combat.js
  enemy.js
  companion.js
  feedback.js
  audio.js
  ui.js
```

The project uses:

HTML

CSS

Vanilla JavaScript

HTML5 Canvas

No game framework.

---

# IMPORTANT ARCHITECTURE

Main initialization flow:

```text
main.js
 ↓
Audio
 ↓
Input
 ↓
Game
 ↓
Map
 ↓
Player
 ↓
UI
```

Player movement flow:

```text
Keyboard / Touch
 ↓
MG.Input.axis
 ↓
MG.Player.update()
 ↓
Player position
 ↓
Collision
```

Do not bypass this architecture without a strong reason.

---

# RESOLVED ISSUE (was landscape-first)

The original implementation was landscape-first.

Original logical canvas:

480 × 270 (16:9)

Portrait mode previously:

* displayed orientation warning
* hid the game root
* paused the game

This behavior has been **removed** (see COMPLETED: PORTRAIT CONVERSION below).

---

# COMPLETED: PORTRAIT CONVERSION v0.1.1

Goal (achieved):

Make the game fully playable on smartphones in portrait mode.

Primary target:

9:16

Logical canvas used:

360 × 640

Files changed: `js/game.js`, `js/ui.js`, `js/style.css` (touch-control sizing +
debug panel + dead orientation-warning CSS removed), `index.html` (canvas
attrs, removed `#overlay-orientation`, added `#debug-panel`), `README.md`.
`js/player.js`, `js/map.js`, `js/collision.js`, `js/input.js` needed **no**
changes — they already worked in terms of `MG.Game.WIDTH/HEIGHT` / generic
camera rects rather than hardcoded 480×270, so the resolution swap alone
carried through the whole pipeline.

Verified (via synthetic Pointer Events + forced viewport sizes, since this
session's browser preview has no screenshot compositing): portrait load with
no rotation warning, camera clamps against the existing 1440×810 map without
exposing outside-world areas, tree/water collision unchanged, joystick +
attack button work simultaneously on independent pointer IDs, orientation
flip portrait→landscape→portrait recalculates layout without reload or
losing player/map state, desktop keyboard still works with the portrait
stage centered (not stretched to 16:9).

Known limitation (Fixed): The existing start-area spawn was previously at (200, 706), close to the map's south edge, which caused the camera to clamp to the bottom edge and render the player very low on screen (84% down). This has been resolved by adjusting the initial spawn point up slightly to (200, 590) while remaining inside the starting glade. The player now appears at a visually pleasing 65% down the screen, solving the framing issue while strictly preserving the existing map layout and camera logic.

---

# COMPLETED: PHASE 5 — REAL-TIME SWORD COMBAT v0.1.2

Goal (achieved):

A directional sword attack the player can trigger without leaving the field
(no battle screen), usable simultaneously with movement on both desktop and
mobile (two-thumb: move + attack at once).

Files changed: `js/combat.js` (was an empty stub — now owns attack timing,
world-space hitbox, and a `DEBUG_COMBAT` debug renderer), `js/audio.js` (was
an empty stub — now a minimal Web-Audio noise-burst "whoosh", fails silently
if audio is unavailable), `js/player.js` (new `attacking`/`attackFacing`/
`attackT`/`cooldownT` fields, movement-speed multiplier while attacking,
facing frozen during the swing, sword-swing render overlay, idle sword hidden
while swinging), `js/game.js` (VERSION → 0.1.2, wired `MG.Combat.renderDebug`
into the world-space render pass), `index.html`/`README.md` (version text).
`js/input.js` needed **no** changes — `MG.Input.attackPressed` already
existed as a one-frame edge trigger from Phase 3 and combat consumes it as-is.
Map/collision/camera untouched.

Key design choices:

* Attack direction locks to `player.facing` the instant the swing starts
  (`attackFacing`), and `facing` itself stops updating from movement input
  while `attacking` is true — so the body and the sword can never point
  different ways mid-swing, even if the player nudges the stick/WASD.
  Movement (position) is NOT frozen, only slowed (`MOVE_MULTIPLIER = 0.7`).
* All timing is delta-time (`ATTACK_DURATION = 0.22s`, `ATTACK_COOLDOWN =
  0.30s`), not frame counts.
* `MG.Combat.getAttackHitbox(player)` returns world-space `{x,y,w,h}` (or
  `null` outside the active window) — Phase 6 can call this directly against
  Mossling AABBs without any coordinate conversion.
* `DEBUG_COMBAT` (const, default `false`, top of `combat.js`) draws the
  hitbox rect + attack/cooldown state text in world space when flipped on.

Verified (synthetic Pointer/Keyboard events, since this session's browser
preview has no screenshot compositing): SPACE starts the attack on the exact
frame pressed; holding SPACE or changing direction mid-swing does not restart
the attack or rotate it; movement distance during a 9-frame attack window was
exactly 0.700× the un-attacked distance (matches `MOVE_MULTIPLIER` exactly);
a second SPACE press during cooldown is ignored (`attacking` stays `false`);
mobile joystick (pointerId 1) and attack button (pointerId 2) held
simultaneously both stay live and independent, and releasing one doesn't
affect the other; debug hitbox rect visually lines up with the rendered
blade (checked via `DEBUG_COMBAT = true` screenshot, reverted after); no new
console errors; v0.1.1 regressions re-checked and still pass (portrait load,
no rotation warning, river/tree collision, camera clamp, no page scroll).

Known limitation: no enemies exist yet, so `getAttackHitbox()` is exercised
by tests/debug only — it has never been checked against a second AABB in
anger. Confirm the exact expected size/reach still feels right once Mossling
exists in Phase 6; the numbers (`REACH=14, WIDE=15, GAP=3`) are a first pass,
not final-tuned.

**Polish fix (same v0.1.2, no version bump):** the down/up swing pivots in
`Player.drawAttackSwing()` (`js/player.js`) originally didn't match the idle
sword's side, so the blade appeared to jump to the other hand when an attack
started facing down. Fixed by pivoting `down` to the same side as
`drawFront()`'s idle sword (`cx-`) and `up` to the mirrored side (`cx+`,
since the back view is the character turned 180°) — and added a small idle
hilt to `drawBack()` (previously drew no sword at all) so the "returns to
the same hand" rule has something to return to when facing up. `left`/
`right` were already consistent (both idle and attack already used the
same front-hand-relative offset) and were not touched. `combat.js` hitbox
math was **not** touched — only the visual pivot in `player.js` moved; if
you're comparing hitbox x/y against pre-fix notes elsewhere, the numbers
are unchanged.

---

# PORTRAIT CONVERSION REQUIREMENTS

Must preserve:

* Phase 4 map
* player
* collision
* camera
* mobile joystick
* pointer events
* keyboard controls

Must change:

* canvas logical resolution
* camera viewport
* portrait blocking logic
* stage sizing
* HUD positioning
* mobile controls positioning
* touch coordinate mapping if required

---

# DO NOT IMPLEMENT YET

Phase 5 (sword attack) and Phase 6 (Mossling enemy) are both done — see
COMPLETED: PHASE 5 / COMPLETED: PHASE 6 above.

Do NOT implement:

* player HP / damage / invincibility
* companion / Moski
* treasure
* quests
* bosses
* multiple enemy types
* multiple maps

Those belong to later phases.

---

# CURRENT NEXT PHASE

After Phase 6 (Mossling enemy) is stable:

## Phase 7

Player HP / damage / knockback / invincibility / game over

Expected systems (superseded notes from the original Phase 6 planning — the
enemy-side half of this list, sword swing/hitbox/enemy HP/knockback/defeat,
is now done; what's left is the player-side half):
* directional hitbox
* enemy HP
* damage
* knockback
* enemy defeat
* player damage
* temporary invincibility

---

# KNOWN DESIGN DIRECTION

The long-term game combines:

* classic top-down action adventure
* real-time field combat
* companion creature discovery
* environmental puzzle solving
* ability-gated exploration

The central design principle:

> Discover a place you cannot access, obtain a companion ability, then return and unlock it.

---

# AI DEVELOPMENT RULES

Before changing code:

1. Read GAME_DESIGN.md.
2. Read this file.
3. Inspect current implementation.
4. Preserve working functionality.
5. Make the smallest appropriate change.
6. Test the result.

After meaningful work:

Update this file with:

* current version
* completed features
* current task
* known issues
* next task

---

# VERSION HISTORY

## v0.1.0

Phase 1–4 prototype.

## v0.1.1

Portrait mobile conversion. Landscape 480×270 (16:9) → portrait 360×640 (9:16).
Orientation-blocking overlay/pause removed. Phase 1–4 systems (map, player,
collision, camera, joystick, keyboard) preserved unchanged in logic; only
resolution/camera constants and UI positioning changed. Completed by Claude Code.

## v0.1.2

Phase 5 — real-time sword combat. Directional attack (SPACE / existing mobile
button), 0.22s swing / 0.30s cooldown (delta-time, not frame-count), 0.7×
movement speed while attacking, facing locked to the swing's starting
direction, world-space `MG.Combat.getAttackHitbox()` ready for Phase 6,
procedural swing sound. No enemies, no damage, no HP — attack-only. Map,
collision, camera, and portrait layout untouched. Completed by Claude Code.

## v0.1.3

Phase 6 — Mossling enemy. Exactly 3 Mosslings (`js/enemy.js`, was an empty
stub), IDLE/WANDER/CHASE/HIT/DEAD state machine, detection 135 / leave 175
world units (hysteresis), chase speed 42 (half player speed), HP 3 / 1 dmg
per hit consuming the existing `MG.Combat.getAttackHitbox()` unchanged
(only addition: `player.attackId` counter in `combat.js` so one swing can't
multi-hit one Mossling), knockback ~30 units / 0.14s via the existing
`MG.Collision.moveAndCollide`, death fade+shrink 0.35s then removed. Player
has no HP — Mosslings cannot damage the player (out of scope, Phase 7).
Portrait layout, camera, map, collision, sword combat all unchanged in
behavior. Completed by Claude Code. (Later committed to GitHub outside this
handoff's own tracking — confirmed still-committed baseline as of v0.1.4.)

## v0.1.4

Phase 6.1 — combat feel / hit feedback / enemy density, refining Phase 6 on
player feedback (not a new numbered phase). Sword reach now has a visible
fan + longer/more-visible trail. Successful hits get a decoupled 0.08s
flash, 4 bright spark particles, an 0.045s dt-scaled hit-stop
(`MG.Game.hitStop()`), and a punchier hit sound — all absent on a miss,
verified directly. Mosslings 3 → 9, same safe-placement approach as Phase 6.
Added windup→lunge as a sub-phase of the existing CHASE state (not a new
state) for threat without player damage — still no player HP. Two bug fixes
from a Gemini review (CHASE-entry home-leash check, dedicated combat
hurtbox separate from the movement footRect) from the v0.1.3→v0.1.4 gap are
already folded into `enemy.js` and this document's Phase 6 section above.
Portrait layout, camera, map, collision, movement, mobile controls
unchanged in behavior. Completed by Claude Code.

## v0.1.5

Phase 6.2 — combat readability & threat feedback, refining 6.1 on further
player feedback (not a new numbered phase; timing/damage values from 6.1
unchanged). Sword reach fan brightens toward its outer edge + gained a
traced boundary arc; trail alpha raised again. Wind-up shrink nearly
doubled and gained a directional lean + pulsing amber ring — pixel-diff
verified, not just eyeballed. Lunge gained a stretch-trail ghost. New:
player contact feedback — `MG.Player.getHurtbox()` / `onContactHit()`
(5-unit knockback, 0.08s red flash, 0.04s hit-stop, distinct
`playPlayerContact()` sound), gated per-lunge by `e.lungeContactDone` so it
fires at most once per dash — still zero player HP/damage/game-over.
Portrait layout, camera, map, collision, sword/enemy timing values, mobile
controls all unchanged in behavior. Completed by Claude Code.

### v0.1.5 폴리시 — 플레이어/모슬링 겹침 수정

Version number unchanged (still v0.1.5) — this was a same-version bug fix,
not a new phase. Root cause: `updateChase()`'s `approach` sub-phase had no
lower bound on closing distance (only exited toward `windup`, never toward
"stop"), and the `lunge` sub-phase always traveled the full fixed
`LUNGE_DIST` regardless of how close the player already was — so a
mossling with its dash on cooldown could walk fully onto the player's
position, and a lunge could dash straight through/past the player. Fixed
in `enemy.js` only, with two new constants derived from the existing
`getHurtbox()` sizes (not arbitrary): `CHASE_STOP_DIST` (=15, approach
now freezes just outside hurtbox-touch range instead of closing to zero)
and `LUNGE_CONTACT_DIST` (=9, comfortably inside touch range so the
existing hurtbox-overlap contact check still fires reliably). The lunge
step is clamped to stop at `LUNGE_CONTACT_DIST` instead of overshooting,
and — importantly — once `e.lungeContactDone` is set true, the lunge ends
immediately on the next frame rather than continuing to close the
distance the contact knockback just opened up (an early version of this
fix didn't do that, and the mossling would chase the knocked-back player
right back into contact range within the same dash — caught via browser
trace testing, not by the isolated Node unit tests, since those didn't
simulate `MG.Player.onContactHit()`'s knockback). `LUNGE_DIST`/
`LUNGE_DURATION`/`WINDUP_DURATION`/`LUNGE_TRIGGER_DIST`/`checkPlayerContact()`
values and the sword hitbox are all untouched. Completed by Claude Code.

---

# HANDOFF STATUS

Current owner:

AI-assisted development workflow

Current task:

Phase 6.2 + overlap-fix polish, v0.1.5 — done, stable. Not yet committed
to git this pass (verified locally; a commit was intentionally not made —
see git status/diff in the completion report). Next task is Phase 7
(player HP/damage/knockback/invincibility/game over), not started.

Next owner:

Claude Code / Gemini CLI / ChatGPT depending on task

Before beginning new work:

Read:

* GAME_DESIGN.md
* AI_HANDOFF.md
