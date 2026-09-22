# MOONLIT GROVE — AI HANDOFF

## CURRENT STATE

Project:

달빛 숲의 수호자 / Moonlit Grove

Current Version:

v0.1.11

Current Phase:

Phase 12 (FEEDBACK) — **STEP 1 COMPLETE (+ 모바일 키보드 수정 2차)**
폼 + LocalStorage. 실기 Android 테스트/영상 피드백을 두 차례 반영했다.

현재 키보드 대응 방식 (FIX 2 — 이것이 최종):
* **무대도 #game-root 도 건드리지 않는다.** 완료 오버레이의 `bottom` 만 키보드
  높이만큼 키워서 아래쪽을 잘라내고, 짧아진 만큼은 오버레이 자신의
  `overflow-y:auto` 가 내부 스크롤로 감당한다. 위쪽이 제자리에 붙어 있으므로
  완료 문구가 튀어오르지 않는다.
* `scrollIntoView` 는 `block:'nearest'`, 기본(즉시) 동작으로 **한 번만**.
  이미 보이면 아무 일도 하지 않는다.
* viewport meta 의 `interactive-widget` 은 **도로 뺐다**.

**build.sh 에 대한 중요한 사실:** `artifact.html` 에는 viewport meta 가 아예
들어가지 않는다(Artifact 호스트가 자체 head 를 씌운다). 그리고 `dist/index.html`
용 meta 는 build.sh 48행이 **하드코딩**한다 — `index.html` 의 meta 는 복사되지
않는다. 그래서 폰에서 아티팩트로 테스트할 때 meta 변경은 아무 영향이 없다.
meta 로 뭔가를 고치려 한다면 build.sh 도 같이 고쳐야 한다.

Fix (실기 피드백 반영):

* **증상** — 완료 화면의 textarea 를 누르면 소프트 키보드가 입력창과 제출
  버튼을 덮었다.
* **원인** — 크기가 아니라 *위치* 문제였다. `Game.resize()` 는 이미
  `visualViewport` 를 보고 무대를 올바르게 줄이고 있었지만, `#game-root` 가
  `position: fixed; inset: 0` 이라 여전히 레이아웃 뷰포트(키보드에 줄지 않는
  812px) 전체를 차지한다. 줄어든 무대를 그 812px 한가운데에 앉히니 무대
  아래쪽 —입력창과 제출 버튼이 있는 부분— 이 키보드 뒤로 들어갔다.
* **고친 방법 (3가지, 모두 최소)**
  1. viewport meta 에 `interactive-widget=resizes-content` 추가. 키보드가
     레이아웃 뷰포트까지 줄이게 하는 표준 방법이며, 이것만으로 `#game-root`
     와 `100dvh` 가 키보드 위 영역에 맞춰지고 기존 리사이즈 로직이 그대로
     무대를 앉힌다. (Chrome Android 108+)
  2. `interactive-widget` 미지원 브라우저(iOS Safari 등)용 폴백 —
     `Feedback.syncKeyboardInset()` 이 입력 중일 때만 `#game-root` 를
     visualViewport 에 직접 맞춘다. 지원 브라우저에서는 `innerHeight` 도 같이
     줄어 gap 이 0 이므로 **저절로 아무 일도 하지 않는다**(이중 보정 없음).
  3. focus 시 `scrollIntoView({block:'center'})` 로 입력창을 보이는 영역
     가운데로 올린다. 완료 화면이 이미 스크롤 컨테이너라 새 구조가 필요 없었다.
* 저장 구조(`moonlit-grove-feedback`, `{rating, comment}` 배열)와 완료 화면
  게임 로직, `restartSession()` 은 **하나도 바뀌지 않았다.**

Implemented (Phase 12 Step 1):
Step 1 = input UI on the completion screen and LocalStorage persistence.
**No JSON export, no download, no admin view, no server/API** — later.

Implemented (Phase 12 Step 1):

* **`js/feedback.js` is no longer a stub.** `MG.Feedback` now has
  `init()` / `setRating()` / `submit()` / `save()` / `load()` / `resetForm()`.
* **Two fields only**: `rating` (1-5, or `null` if not chosen) and `comment`
  (free text, may be empty). **The design doc defines no feedback items** —
  see the changelog note — so these two were chosen by the user rather than
  invented, and nothing else was added. No timestamp, no version, no id:
  the record is exactly `{rating, comment}`.
* **Key `moonlit-grove-feedback`, value is an array, appended to.** There was
  no pre-existing key anywhere in the codebase and the doc names none. Records
  accumulate because "친구 피드백" implies more than one friend — overwriting
  would let the second playtester erase the first.
* **No required fields**, because the doc defines none. Submitting with nothing
  filled in is allowed and stores `{rating: null, comment: ""}`.
* **One submission per session**, and `UI.hideComplete()` resets the form for
  the next run — so `restartSession()` itself was not touched. Stored records
  are never cleared by restarting.
* **Storage failure degrades quietly**: everything is in try/catch, `save()`
  returns false, and the status line says so instead of throwing.

Previously: Phase 11 (PROTOTYPE COMPLETION) — **STEP 3 COMPLETE** — 루프가 닫혔다
Step 1 = detection. Step 2 = the completion screen. Step 3 = the way out.
No feedback system, no LocalStorage, no JSON export, no inventory —
those are Phase 12.

Implemented (Phase 11 Step 3) — one button, one listener, zero new logic:

* **`#btn-complete-restart` ("다시 모험하기")** inside `#overlay-complete`,
  using the title screen's `.ui-button` class verbatim — so **no CSS was
  written at all** for this step. It sits where the title screen puts its
  button (문구 → 버튼 → 버전).
* **The click handler is the third copy of a pattern already used twice**
  (`#btn-start`, `#hud-restart`): one `click` listener, `preventDefault()`,
  `Audio.unlock()`, then the existing call. No pointer/key input was added.
* **It calls `MG.Game.restartSession()` and nothing else.** Hiding the screen,
  removing `body.mg-complete`, resetting treasure/bridge/Moski/player and
  unfreezing gameplay were all already inside `restartSession()` from Steps
  1-2 — no initialisation code was duplicated.
* **Double-click guard:** the handler returns early unless
  `MG.Game.gameComplete` is true. The first click clears it, so every
  subsequent click is a no-op.

Implemented (Phase 11 Step 2) — a display layer and nothing else:

* **`#overlay-complete`** reuses the title screen's `.overlay` /
  `.overlay-inner` markup and flex centring. `z-index: 50` puts it above every
  HUD layer (the highest was the toast at 20), so nothing shows through.
* **The wording comes from GAME_DESIGN.md.** The doc has *no* completion-screen
  spec, so the screen quotes the line ch.2 ("핵심 게임 경험") names as the final
  emotion of this exact loop: **"드디어 저곳에 도착했다."** The three items listed
  under it (모스키 / 덩굴 다리 / 달빛 조각) are the completion conditions
  themselves, not invented rewards.
* **`MG.UI.showComplete()` / `hideComplete()` / `isCompleteVisible()`** — pure
  visibility, same shape as the existing title/victory helpers. `showComplete()`
  calls `hideToast()` first so the reward toast is never left half-covered
  (the restart prompt already does this, PHASE 9.1).
* **A 1.6s beat before it appears.** Opening the chest fires the lid animation,
  particles and the "달빛 조각을 획득했다!" toast all at once; covering that
  instantly would hide the reward the player just earned. Measured: screen
  appears at 1.62s.
* **Gameplay freezes once the screen is up** — `Game.update()` returns early
  (keeping `updateCamera()`), so there is no further progression and the
  completion event cannot fire twice. Rendering continues, so the forest stays
  as the backdrop. `body.mg-complete` hides the touch controls through the same
  class-gating rule the title screen uses.

Implemented (Phase 11 Step 1) — one latch and two functions, all in game.js:

* **`MG.Game.gameComplete`** — a derived latch, not a fourth progress state.
  It is computed from the three that already existed:
  `MG.Companion.recruited`, `MG.Game.bridgeActivated`,
  `MG.Map.treasure.state === 'OPEN'`.
* **`MG.Game.isPrototypeComplete()`** — pure read of those three, changes
  nothing, safe to call any number of times.
* **`MG.Game.checkPrototypeComplete()`** — evaluates and latches. Once true it
  returns true without re-evaluating, so the completion cannot be undone.
* **One call site**: inside `updateTreasure()`, immediately after the chest
  becomes `'OPEN'` (right after the existing particles + toast). Nothing else
  in the game calls it.
* `restartSession()` clears it; death/respawn does not touch it — same
  lifetime rule as `moonstoneFound` / `cleansed` / `bridgeActivated`.

Previously: Phase 10 (VINE BRIDGE) — **STEP 3 COMPLETE** — 보물 상자까지 열린다
Step 1 = environment. Step 2 = ability + bridge + collision.
Step 3 = treasure chest interaction + reward state.
The completion screen is NOT implemented (that remains Phase 11).

Implemented (Phase 10 Step 3):

* **`Map.treasure.state`: `'CLOSED' -> 'OPENING' -> 'OPEN'`** with an `openT`
  animation clock. Opening is idempotent — `openTreasure()` returns
  immediately unless the state is exactly `CLOSED`.
* **`Game.updateTreasure(dt)`** joins the existing update chain beside
  `updateMoonstone` / `updateCleansing`. Opening requires
  `bridgeActivated === true`, `state === 'CLOSED'`, player alive, and a
  28px/38px hysteresis ring — the same numbers as the Moski interaction, so
  the button feels identical wherever it appears.
* **The existing `#btn-interact` is reused, with no second button.** This is
  safe *structurally*, not just by luck: `companion.js` drives that button
  only inside its `RECRUITABLE` branch, and the chest requires
  `bridgeActivated`, which implies Moski is already `FOLLOWING`. The two
  conditions cannot both hold. (They are also 880px apart, against a 28px
  range.)
* **The lid actually rotates.** `drawTreasure` translates to the back hinge
  and rotates up to 105 degrees, so opening is real geometry rather than a
  swapped sprite. Open chests show the empty interior plus a slow moonlight
  glow, and the closed-chest glint fades out.
* **`MG.Audio.playTreasureOpen()`** — a short filtered-noise creak sweeping
  420→1500Hz, then two very bright notes (A6→E7). Deliberately unlike the
  Moonstone arpeggio, the recruitment triad, and the bridge swell.

Previously implemented (Phase 10 Step 2):

* **`MG.Input.abilityPressed`** — desktop `KeyQ` and the new mobile
  `#btn-ability`, built on exactly the same 1-frame edge pattern as
  `attackPressed` / `interactPressed`.
* **Availability is four conditions**, checked every frame in
  `Companion.canUseAbility()`: recruited, state FOLLOWING, bridge not yet
  built, player alive — plus a 50px/62px hysteresis ring around the anchor.
  Q outside those conditions does nothing at all.
* **`BRIDGING` state**, 1.00s: Moski leaves Luka, travels to the anchor at
  170px/s (measured arrival at **0.22s**, well before the vines finish), the
  bridge grows, then Moski returns to FOLLOWING. Luka stays fully
  controllable the whole time — no modal, no input lock.
* **The collision change is real, and it is a solid split.** On completion
  `Map.setBridgeOpen(true)` removes the single `water: true` solid and pushes
  **two** segments (y 0–565 and y 591–810), leaving a 26px gap at the
  crossing. `collision.js` was not touched — player.js and enemy.js re-read
  `MG.Map.solids` every call, so mutating the array in place is enough.
  No teleport, no invisible trigger.
* **The bridge renders between water and entities**, via a new
  `Map.renderBridge()` called right after `renderWater()`. It is deliberately
  *not* in the Y-sort queue: it is a surface you stand on, so it must never
  occlude Luka or Moski.

Previously implemented (Phase 10 Step 1) — three data points and two draw functions:

* **The blocked gap already existed and was reused unchanged.** `RIVER`
  ({x:1000, y:0, w:130, h:810}) is already a full-height solid with
  `water: true`. A BFS over the real collision data (21,117 nodes from spawn)
  confirms the east bank is unreachable — max reachable x is **990** against
  a river edge at 1000, and there is no bypass anywhere on the map. Nothing
  about the river or collision.js was touched.
* **`MG.Map.treasure` at (1150, 578)** — a chest that is visible and inert.
  Not a solid, no interaction, no reward. `state: 'CLOSED'` is a placeholder
  nobody writes to yet.
* **`MG.Map.vineAnchor` at (984, 578)** — a weathered stump wrapped in
  dormant vines with faint violet runes, on the west bank. Purely a landmark:
  no interaction, no collision, no ability.
* **`MG.Game.bridgeActivated = false`** — an inert flag, reset by
  `restartSession()`. Nothing sets it true.

**The chest coordinate is the important finding.** The old map.js comment
claimed the bank view spans x 754–1234, and placed the treasure glade centre
at x=1200 accordingly. That comment predates the portrait conversion: the
camera is 360px wide now, not 640, so standing at the bank actually shows
**x 814–1174**. A chest at 1200 would have been off-screen — silently
breaking GAME_DESIGN.md's core requirement that the player sees the treasure
*before* finding Moski. 1150 puts it on screen with 15px to spare.

Previously: Phase 9 (MOSKI COMPANION) — **COMPLETE + UI 폴리시**
Steps 1-4 done (input & UI / entity & TRAPPED / recruitment / following),
plus a two-issue UI fix from real-phone playtest feedback.
(implemented and verified by Claude Code)

Fixed in the polish pass (two player-reported bugs, nothing else):

* **Recruitment message was clipped on a real phone.** `.hud-toast` carried
  `white-space: nowrap` from when toasts were short. The Phase 9 message is
  20 characters and simply cannot fit one line at 21px inside `max-width`.
  The container now wraps; the wording (fixed by GAME_DESIGN.md) is untouched.
* **The attack button showed through the title screen on touch devices.**
  Touch controls were gated only on `mg-touch`, never on game state, so they
  existed from boot. Desktop hid them by accident (no `mg-touch`), which is
  why this only ever appeared on a phone. Now also gated on `mg-playing`,
  toggled by `Game.init()` (TITLE) and `Game.startAdventure()` (PLAY) — game
  state, not a timer.

Implemented (Phase 9 Step 4) — Moski now actually follows Luka:

* **Damped steering, nothing more.** Per frame: find the anchor behind Luka,
  ease toward it with `1 - exp(-10 * dt)`, then enforce separation. No
  physics engine, no pathfinding, no A*, no allocations.
* **Anchor** is `player - facing * (18 x / 13 y)` — shorter on Y because of
  the top-down perspective. Steady-state trail measured 31.7px horizontally
  and 26.7px vertically while running, settling to ~18px at rest.
* **A 6px deadzone** stops all movement once close, and the step eases toward
  the *deadzone boundary* rather than the exact anchor. Measured drift while
  Luka stands still: **exactly 0 over 2 seconds**.
* **Separation is a position constraint, not a force** — see the changelog
  note; this was changed after measurement proved the damped version let
  Moski reach 3.2px from Luka's centre (i.e. inside him) on a direction
  reversal.
* **Speed cap 150px/s.** Without it Moski briefly hit 390px/s closing a gap,
  which read as a cursor snapping rather than a creature running.
* **Damage / death / respawn are all observed, never injected.** A rising
  edge of `Player.hitFlashT` triggers a small visual hop; `Player.state ===
  'DEAD'` makes Moski hold position instead of chasing a corpse; the
  `DEAD → ALIVE` transition snaps it behind the respawned Luka. **player.js
  was not modified at all.**

Previously implemented (Phase 9 Step 3) — the discovery loop:

* **State machine** `TRAPPED → RECRUITABLE → RECRUITING → FOLLOWING`, all
  inside `companion.js`. `FOLLOWING` is a *state only* — actual follow
  movement is Step 4 and was deliberately not written.
* **Recruitment condition = the clearing is secured.** A Mossling counts as
  belonging to the clearing by its **home** (`homeX/homeY`), not its current
  position. Home never changes, so the check is completely immune to the
  player luring the guard out and recruiting without killing it — a chasing
  Mossling can legitimately be 260px from home, so a live-position test would
  have been trivially exploitable, and would also flicker at the boundary.
* **Clearing radius is read from map data, not copied.** `map.js` now exposes
  `GLADES` read-only; `companion.js` looks up the `[300, 235, r]` entry at
  `init()` and gets 138. There is still exactly one definition of the
  clearing geometry.
* **The Step 2 overlap is genuinely fixed, not hidden.** `enemy.js`
  `SPAWN_SPOTS` had `{x:300, y:235}` — identical to Moski. Moved to
  `{x:300, y:320}`: one value, one entry. Count stays 9, no enemy added or
  removed, AI and combat untouched. Verified: 85px from Moski, so with the
  46px wander leash it never gets closer than 39px, and never further than
  131px from the clearing centre (radius 138) — it stays the clearing's
  guardian, which is what its original comment said it was for.
* **Prompt gating** uses the project's hysteresis idiom (28px enter / 38px
  leave, same shape as the restart prompt's 70/92) so the button cannot
  flicker on the boundary. It requires RECRUITABLE **and** in range **and**
  the player alive — never merely "Moski exists".
* **0.8s rescue event**, not a cutscene: 0.00–0.25 vines loosen and glow,
  0.25–0.55 vines fly apart (14 existing `'reward'` particles, no new
  particle type), 0.55–0.80 a one-shot eased hop toward Luka. The hop target
  is computed **once** at 0.55s — re-aiming every frame would already be the
  Step 4 follow algorithm.
* **`MG.Audio.playCompanionRecruit()`** — E5-A5-C#6 rising triad plus a
  highpassed sparkle, deliberately different from `playReward()`'s C-E-G-C so
  the Moonstone and the rescue do not sound identical. Same `if (!this.ctx)
  return;` + try/catch guard as every other cue.

Previously implemented (Phase 9 Step 2) — an entity that is, deliberately, scenery:

* **`MG.Companion`** in `js/companion.js` — one entity, not a framework.
  `init()` / `update(dt)` / `collect(out, cam)` / `renderOne(ctx, m)` plus
  three private drawing helpers. Starts `state:'TRAPPED'`, `recruited:false`
  at the fixed world position **(300, 235)** — the centre of map.js's
  `GLADES` entry `[300, 235, 138]`, which is already commented there as
  "작은 공터 (PHASE 9 에서 모스키가 나타날 곳)".
* **It is structurally inert.** It is not in `MG.Enemy.list` (so combat and
  enemy AI cannot see it), not in `MG.Map.solids` (so it never blocks Luka),
  has no `hp` and no `getHurtbox`. `update()` contains no code that changes
  `x`/`y` — that absence *is* the guarantee it never leaves the clearing.
* **Visually it is the opposite of a Mossling.** Mossling = three overlapping
  lobes, warm moss green, yellow-green wary eyes. Moski = one smooth droplet,
  cool teal/mint, leaf ears, soft slow blink, hovering off the ground with a
  lightened shadow. Measured on-screen body colour: Moski `rgb(90,106,103)`
  vs Mossling `rgb(88,114,57)` — the blue channel (103 vs 57) is the
  discriminator, colour distance 47.
* **The vines read as magic, not plants.** Violet (`#7b4fc0`) — a hue that
  appears nowhere else in the forest — drawn as regular ellipse bands with
  pulsing rune pixels, two strands *behind* the body and two *across* it so
  the binding has real depth.
* **Y-sorted like everything else.** `collect()` pushes
  `{y, kind:'companion', obj}` into the existing `props` queue with the same
  40px cull margin as `Enemy.collect`. Measured in the clearing: index 19 of
  55, with 35 props drawn after it — it is genuinely occluded by nearer
  trees, not pasted on top.

**Nothing else was implemented.** No recruitment, no following, no companion
AI, no Vine Bridge, no Q ability, no treasure, no save state. Nothing reads
`MG.Input.interactPressed` yet, and Moski does not react to E.

Previously implemented (Phase 9 Step 1) — input plumbing only:

* **`MG.Input.interactPressed`** — a 1-frame edge flag built on exactly the
  same pattern as `attackPressed`. Keyboard `KeyE` (per GAME_DESIGN.md
  "E: 상호작용") produces the edge via `_eWasDown`, the mobile button sets
  `_interactRequested`; `update()` ORs them and clears the request flag every
  frame, consumed or not.
* **`#btn-interact`** — a mobile button inside the existing `#touch-layer`,
  right after `#btn-attack`. `hidden` by default; it is wired with the same
  Pointer Events + `setPointerCapture` structure as the attack button, so the
  two have independent `pointerId`s and can be held at the same time.
* **`.interact-button` CSS** — sits directly above the attack button, offset
  by `6% + clamp(58px,17vmin,84px) + 14px`, so the 14px gap is preserved at
  every screen size because both buttons scale on the same `vmin` clamp. It
  is added to the `body:not(.mg-touch)` hide list, and carries its own
  `[hidden] { display: none; }` rule (required — like `.joystick-base`, it
  declares its own `display`, which would otherwise defeat the `hidden`
  attribute).
* **`MG.UI.showInteract()` / `hideInteract()` / `isInteractVisible()`** —
  visibility only. They contain no knowledge of *what* is being interacted
  with; a later step decides that and calls them.

**Nothing else was implemented.** No Moski entity, rendering, recruitment,
following, companion AI, Vine Bridge, Q ability, or treasure access. Nothing
reads `interactPressed` yet — it is a foundation waiting for Step 2.

Previously implemented (Phase 9.3 — final polish, v0.1.11):

* **The climax speaks once.** Striking the Moonstone used to fire the toast
  "달의 돌을 발견했다" *and* the victory line "숲이 정화되었다" at the same
  moment, splitting the most important beat in the game across two pieces of
  text. The single `showToast()` call in `activateMoonstone()` is gone. The
  toast **system** is untouched and still fully callable — verified at runtime
  by calling `MG.UI.showToast()` directly after the change.
* **No version number during play.** `#hud-version` is hidden with one CSS
  rule. The element stays in the DOM and `ui.js` still writes
  `'v' + MG.Game.VERSION` into it, so version tracking is intact; the player
  now sees the version only on the title screen (`.game-version`). The
  top-right corner of the gameplay HUD is empty.

Previously implemented (Phase 9.2):

* **One persistent chain, forever.** The entire ambient bed is exactly three
  nodes — a looping `BufferSource` (reusing the *existing* 0.2s noise buffer
  from the SFX code, played at `playbackRate 0.35` so the loop period
  stretches to ~0.57s and stops sounding like a loop), a `lowpass` filter
  (`Q 0.8`), and a `gain`. They are created once in `startAmbience()` and
  never replaced. Mode changes only *ramp parameters* on these same nodes.
* **No LFO, no interval loop, no per-frame audio work.** Wind drift is a
  ±10% filter ramp piggy-backed onto the cricket scheduler
  (`nudgeAmbientWind()`), so nothing extra runs between chirps.
* **Crickets are self-rescheduling one-shots.** Each chirp is 2 oscillators
  + 2 gains that call `osc.stop()` on themselves and get garbage collected;
  a single `setTimeout` handle (`_cricketTimer`) is alive at any moment.
* **Two modes on the same nodes.** `MG.Audio.setAmbientMode('forest' |
  'cleansed')` ramps filter frequency and gain over 2s.
  `MG.Game.startCleansing()` switches to `cleansed`;
  `MG.Game.restartSession()` switches back to `forest`.
* **Tab-hidden safety.** A `visibilitychange` listener registered once in
  `Audio.init()` fades the bed to silence and clears the cricket timer when
  hidden, and restores on return. It is idempotent (`_ambientHidden` dedupe),
  and `setAmbientMode()` deliberately skips the gain ramp while hidden so a
  mode change cannot resurrect audio in a background tab.
* **Starts only after a real gesture.** `startAmbience()` is called from
  `unlock()` — and *outside* its try/catch, so an ambience failure can never
  null the context and take the SFX down with it.
* Measured: ambient peak amplitude **0.018** vs sword swing **0.319** — the
  bed sits at ~5.7% of the loudest SFX. See the tuning note below.

Previously implemented (Phase 9.1):

* **Return-home restart prompt** — once `MG.Game.cleansed` is true and the
  player *voluntarily* walks back within 70px of `MG.Map.spawn` (200, 590),
  a one-line "다시 모험하기" fades in. Leaving past 92px fades it out; the
  two different radii are deliberate hysteresis (same idiom as the Mossling
  `DETECT_RADIUS`/`LEAVE_RADIUS`) so it never flickers on the boundary —
  measured 0 toggles over 400 frames circling at r=78.
* **It can never appear immediately after cleansing** — not by a timer, but
  by geometry: activation happens beside the Moonstone (700, 400), which is
  ~520px from spawn. The player is free to wander the peaceful grove for as
  long as they like.
* **`MG.Game.restartSession()`** — the central reset. Reuses the existing
  entry points (`Player.init()`, `Enemy.init()`, `Input.reset()`) instead of
  duplicating init logic. **Order matters:** `Enemy.init()` early-returns
  while `cleansed` is true (that's what keeps enemies from returning after a
  post-cleansing death), so `cleansed` must be cleared *first* or the
  Mosslings never come back.
* **No page reload** — `location.reload()` is not used anywhere; verified
  `location.href` is unchanged across a restart.
* **Input path is the existing one** — the prompt is a `<button>` so it picks
  up the `#ui-layer button { pointer-events: auto }` rule and a plain `click`
  listener, exactly like the "모험 시작" button. No new interaction layer.

Implemented (Phase 8.1):

* **Moonstone Guard (8.1-A)** — 4 of the *existing* 9 spawn spots were moved
  into a diagonal ring around the stone (51–58px out, ≥66px apart, all inside
  the existing glade). No new enemy type, no new AI, no dynamic spawning —
  only position plus a tighter per-enemy leash (`wanderLeash` 46→20,
  `homeLeash` 260→120). Speed, damage, lunge and knockback are untouched.
* **The Cleansing (8.1-B)** — `MG.Game.cleansed`, a wave that expands from the
  stone over 1.0s dissolving Mosslings *in the order the front reaches them*
  (guards at ~0.1s, distant roamers at 0.6–0.9s) using the existing `DEAD`
  state and `moss`/`reward` particles. `Enemy.init()` returns early once
  cleansed, so respawn never repopulates.
* **Atmosphere contrast (8.1-C)** — `Game.atmosphere` eases 0→1 over 1.4s;
  vignette 0.68→0.34 and a thin cool/moonlight overlay swap. Measured:
  average screen luminance 42.5 → 68.1, vignette corner 32.2 → 68.9.
* **Closure** — `#hud-victory` ("숲이 정화되었다"), `pointer-events: none`, one
  line, 92px clear of the toast and far from both thumb zones. It was
  originally permanent; a follow-up polish pass made it self-dismiss —
  0.7s fade in → 2.7s fully readable → 0.7s fade out → `hidden`
  (~4.1s total). That is purely a DOM/visual change: `MG.Game.cleansed`,
  the Moonstone's ACTIVE state, the brightened atmosphere/vignette and the
  cleared enemy list are all untouched when the text goes away, and the
  `FADE` constant in `UI.showVictory()` must stay in sync with the 700ms
  `transition` on `.hud-victory` in style.css.

> Note: this header block had been left at v0.1.5 / Phase 6.2 while the
> v0.1.6 polish passes only updated `VERSION HISTORY` and `HANDOFF STATUS`
> below. It is now current again — keep all three in sync going forward.

Implemented (Phase 8):

* **The Moonstone** — the game's first real objective, at (700, 400) in the
  existing middle clearing. No terrain was moved: that spot is inside the
  pre-existing `GLADES` entry `[700, 400, 112]` (so `buildProps()` plants no
  trees there), the nearest rock is 119.6px away, the nearest tree 125.1px,
  and the river is far off. Reachability from spawn (200, 590) was *proved*
  by BFS over the real collision data, not assumed.
* **Sword-only activation** — `MG.Game.updateMoonstone()` consumes the
  existing `MG.Combat.getAttackHitbox()` (null outside the active window) and
  `MG.Collision.overlaps()`. Walking into it, merely pressing attack, or
  standing nearby never activate it. No second attack system.
* **One-time reward** — full heal + hearts refresh, `MG.Audio.playReward()`,
  a moonlight particle burst (reusing the existing particle array with a new
  `'reward'` type), and a temporary `#hud-toast`.
* **Two visual states** — IDLE pulses softly; ACTIVE settles into a steadier,
  brighter glow with a completion ring and three orbiting motes. Verified by
  pixel sampling, not eyeballing (see VERSION HISTORY below).

Not implemented (deliberately out of scope):

* No quest framework, item system, generic interactable framework, inventory,
  save system (localStorage/server), minimap, quest arrow, or compass.

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

## v0.1.6

Phase 7 — player HP & survival. Mossling contact now does real damage
instead of pure feedback. `js/player.js`: added `hp`/`maxHp`/`invulnT`/
`state`('ALIVE'|'DEAD')/`deathT`. `onContactHit()` gained a guard
(`invulnT > 0 || state === 'DEAD'` → no-op) at the top, then — after the
existing Phase 6.2 knockback/flash/hit-stop/sound run unchanged — applies
`hp -= 1`, sets `invulnT = 1.2`, updates the HUD, and calls `die()` if
`hp <= 0`. Because the guard sets `invulnT` synchronously inside the same
call, two Mosslings contacting on the same frame can only ever deal one
HP of damage (verified explicitly — see completion report). Invulnerability
never blocks input: movement/attack/joystick all keep working through the
1.2s window; the only visible sign is the sprite blinking (alpha
alternating 1.0/0.2 every 0.1s via `Math.floor(animT / 0.1) % 2`), layered
under the existing short red contact-flash rather than replacing it.
Death (`hp <= 0`): `state = 'DEAD'`, `attacking`/`moving` forced false,
`deathT = 1.5`; `Player.update()` now branches on `state` first and fully
ignores movement/attack input while dead (the RAF loop itself is never
paused — only Player's own input handling short-circuits). Render path
gained `renderDeath()`, which reuses the existing `drawFront/Back/Side`
calls under a canvas `scale()`+`globalAlpha` transform (no new art) for a
simple shrink/collapse/fade. After `deathT` runs out, `respawn()` resets
position to the existing `MG.Map.spawn` (no hardcoded coordinate),
restores `hp`/`invulnT`(a fresh 1.2s grace window)/`state`, and calls the
existing `MG.Enemy.init()` verbatim to rebuild the whole Mossling roster
from `SPAWN_SPOTS` — reusing Phase 6's own reset mechanism rather than
inventing a new one. `js/enemy.js`: smallest-safe addition — when
`MG.Player.state === 'DEAD'`, any Mossling still in `CHASE` is dropped
back to `WANDER` (via the existing `pickWanderTarget()`) instead of
clustering on the corpse, and the lunge-contact check is skipped entirely
while the player is dead (redundant with the `onContactHit` guard, but
avoids pointless `lungeContactDone`/particle churn). `js/ui.js`: new
`renderHearts(hp, maxHp)` fills `#hud-hearts` with a ❤️/🤍 string,
event-driven only (called from `onContactHit`/`die`/`respawn`/boot, never
per render frame). `js/combat.js` and `js/collision.js` untouched.
Portrait 360×640, camera, map, sword hitbox/timing, mobile input paths all
unchanged in behavior. Completed by Claude Code.

### v0.1.6 폴리시 — 관대한 검 판정

Version unchanged (still v0.1.6) — real-device feedback said the sword felt
"too precise" on touch, so `js/combat.js`'s hitbox grew modestly:
`REACH` 14→15 (+7%), `WIDE` 15→17 (+13%) → effective area +21.4% (within
the requested 15–25% band). Weighted toward `WIDE` deliberately — on
touch, facing/lateral misalignment is the more common miss than distance
misjudgment. `player.js`'s visual swing `reach` constant was bumped to 15
in lockstep so the blade's drawn arc still matches the hitbox depth
exactly (only the width now silently exceeds the drawn blade — the
intentional "slightly more forgiving than it looks" mismatch called for
in the spec). `GAP`, `ATTACK_DURATION`, `ATTACK_COOLDOWN`,
`HITBOX_ACTIVE_FROM/TO`, and `getAttackHitbox()`'s structure are all
untouched — this was a pure constant-tuning pass, not a redesign.
Verified via direct geometry sweeps (old-vs-new hit/miss boundary
comparison across all 4 directions) plus full integrated swings
(`startAttack` → stepped through `ATTACK_DURATION` → HP check) for
direct/off-center/outside/very-close/behind-player/two-enemies-at-the-edge
cases — all matched spec expectations exactly. No aim assist, snapping,
or auto-targeting added. Completed by Claude Code.

### v0.1.6 폴리시 — 소프트 어택 어시스트

Version unchanged (still v0.1.6). Real-device feedback: even with the
forgiving hitbox, combat still felt too dependent on precise facing. New
rule, strictly post-hit only: `js/enemy.js`'s `checkSwordHit()` now
returns whether it actually applied a hit; `Enemy.update()` collects every
Mossling hit **this frame** into `hitThisFrame`, and — only if that list
is non-empty — picks the closest one and calls
`MG.Player.applyAttackAssist(x, y)` once. A miss never populates the
list, so a miss can never trigger a correction (verified explicitly).
`js/player.js` gained two fields (`attackAssistFacing`,
`attackAssistT`) and `ATTACK_ASSIST_HOLD = 0.10`s. `applyAttackAssist()`
applies the exact 4-direction dominant-axis rule from the spec
(`abs(dx)>abs(dy)` → left/right, else up/down) and sets `this.facing`
immediately — but since `update()` already skips facing changes entirely
while `attacking` is true, the correction is invisible until the swing's
own animation finishes on its own schedule; nothing about
`attackT`/`ATTACK_DURATION`/the hitbox itself was touched.
`attackAssistT` only ticks down while `!attacking` (so the full 0.10s
hold is spent after the swing ends, not partially eaten by swing tail),
and while it's still counting down, the movement-facing block is skipped
too — movement itself (position) is never gated, only which way the
sprite briefly keeps facing. Reset points: new attack start, hold
reaching 0, `die()`, and `respawn()` (verified all four). `combat.js` was
not touched — `getAttackHitbox()`/timings are byte-for-byte the same as
after the forgiving-hitbox pass. Optional `DEBUG_ATTACK_ASSIST` flag
added (default `false`, draws a small text readout near the player when
enabled, nothing when not). Completed by Claude Code.

### v0.1.6 폴리시 — 어택 어시스트 강화

Version unchanged (still v0.1.6). One-constant change per real-device
feedback that the correction "felt too weak": `ATTACK_ASSIST_HOLD` 0.10 →
0.18s in `js/player.js` (spec cap was 0.20s). Nothing else about the
architecture changed — same strict "only after a confirmed hit, closest
actual target, 4-direction dominant-axis, never touches
`ATTACK_DURATION`/`ATTACK_COOLDOWN`/`getAttackHitbox()`" rules as the
prior pass. Re-verified the full A–H test matrix (direct hit, off-center
flip, miss, nearby-but-not-hit, two-hits-closest-wins, behind-player,
move-during-hold, hold-expiration) against the new duration: measured
post-swing hold window was 0.183s (11 frames at 60fps — the same ~3ms
frame-quantization overshoot pattern seen elsewhere in this project, not
a bug), facing stayed held for that entire window while movement kept
working every single frame (verified with constant joystick input
throughout), and normal movement-facing resumed exactly on schedule once
the timer hit zero. Completed by Claude Code.

### v0.1.6 폴리시 — 어택 어시스트 재강화 (모바일 체감)

Version unchanged (still v0.1.6). Same single-constant pattern again:
"0.18초도 거의 안 느껴진다"는 실기기 피드백을 받아 `ATTACK_ASSIST_HOLD`
0.18 → 0.24초 (스펙 상한 0.25초 이내). 측정된 스윙-이후 유지 구간은 60fps
프레임 반올림 때문에 0.250초로 찍히지만(15프레임 × 1/60s), 실제 설정값은
정확히 0.24초로 확인됨(`applyAttackAssist()` 호출 직후 피크값 직접 측정) —
이 프로젝트 전반에서 반복돼온 것과 같은 프레임 양자화 오차일 뿐 로직 문제
아님. 연속 공격 케이스(§7)도 별도 검증: 이론상 현재 타이밍
(`ATTACK_DURATION`=0.22s + `ATTACK_COOLDOWN`=0.30s ≈ 0.52s 뒤에야 다음
스윙 가능)에서는 새 어시스트 유지시간(0.24s)이 다음 스윙보다 먼저
자연스럽게 끝나버려 "이전 홀드 도중 새로 명중" 상황이 정상적인 쿨다운
준수 플레이로는 사실상 재현되지 않는다 — 그래도 `applyAttackAssist()` 는
호출될 때마다 이전 상태와 무관하게 무조건 새로 덮어쓰므로(가드 없음),
아직 0.10s 남은 이전 홀드 도중 강제로 새 명중을 호출해도 즉시 새 방향/
풀타이머로 갱신됨을 직접 확인했다 — "이전 타겟이 새 타겟을 막지 않는다"
요구사항이 코드 레벨에서 항상 성립함을 증명. 나머지 아키텍처(대상 선정/
판정/스윙)는 완전히 동일. Completed by Claude Code.

### v0.1.6 폴리시 — 어택 어시스트 렌더 분리 (실제 버그 수정)

Version unchanged (still v0.1.6). A read-only audit (previous pass) found
the assist logic was firing correctly on every hit but was **invisible**
until the swing animation fully finished: `Player.render()` used a single
`renderFacing = this.attacking ? this.attackFacing : this.facing` for
both the body pose *and* the sword-swing overlay, so the corrected
`this.facing` had zero visible effect for the remainder of the swing
(up to ~0.16s after the hit, since a hit can land as early as 28% into
the 0.22s swing). Real, verified fix: `render()` now uses two separate
variables — `bodyFacing = this.facing` (always, feeds
`drawFront`/`drawBack`/`drawSide`) and `swordFacing = this.attackFacing`
(feeds `drawAttackSwing()` only) — so the body visibly turns toward the
hit target the instant `applyAttackAssist()` fires, while the blade
itself keeps swinging along its original locked arc, exactly matching
the spec's own worked example (facing right, sword continues right,
body turns down). Verified via draw-call spies on the real `render()`
call (not just state inspection) at both desktop and a 375×812 mobile
viewport: body pose and sword direction diverge correctly during the
post-hit swing tail, movement/joystick input keeps working throughout,
and the hold/expiration timing is untouched. No hitbox, timing, target
selection, or `hitThisFrame` logic was touched — this was purely
`Player.render()`'s direction routing. Completed by Claude Code.

### v0.1.6 폴리시 — 사전 공격 타겟팅 (Pre-Attack Targeting)

Version unchanged (still v0.1.6). New, independent layer that runs
*before* the swing starts (complements, does not replace, the existing
post-hit Soft Attack Assist which still runs unchanged after a real hit).
New read-only query in `js/enemy.js`: `Enemy.findPreAttackTarget(px, py,
facing)` — scans `this.list` for enemies in `IDLE`/`WANDER`/`CHASE`
(excludes `HIT`/`DEAD`), rejects anything beyond `PRE_ATTACK_TARGET_RADIUS`
(28px) or outside a `PRE_ATTACK_CONE_HALF_ANGLE` (50°, matching the
sword's own 100° visual sweep) around the facing vector, and rejects
anything whose dominant 4-axis direction isn't the current facing or one
of its two adjacent directions (so a `right`-facing player can never be
pulled toward `left` — no 180°s). Ranks same-direction targets above
adjacent-direction ones unconditionally (a farther directly-ahead enemy
always beats a closer off-axis one), then closest distance, then lowest
`enemy.id` as the final deterministic tiebreak (never array order).
`js/player.js`'s attack-trigger block in `update()` calls it once, right
before `MG.Combat.startAttack(this)`, and sets `this.facing` to the
result's direction if one was found — `startAttack()` itself (in
`combat.js`, untouched) then locks that into `attackFacing` exactly as it
already did. Verified the pre-attack-selected direction is exactly what
ends up in `attackFacing` and that the resulting swing actually connects
with the picked target (not just a facing coincidence) — confirmed via a
genuine direction change (`right`→`down`) that both fired correctly and
landed a real hit. Verified the fallback path (no eligible target →
`null` → current facing preserved, identical to pre-existing behavior)
under a realistic repeated-attack-while-moving mobile pattern. `combat.js`,
hitbox geometry, `ATTACK_DURATION`/`ATTACK_COOLDOWN`, and the existing
post-hit assist's own logic/constants are all untouched — full Phase 7 +
combat regression suite re-verified passing (HP, invulnerability, death/
respawn cycle, one-hit-per-swing, contact/knockback/lunge, 9-Mossling
reset). Completed by Claude Code.

---

# HANDOFF STATUS

Current owner:

AI-assisted development workflow

Current task:

Phase 12 Step 1 (feedback form + LocalStorage) — done, stable, v0.1.11.

**Read the stored feedback with** `MG.Feedback.load()` in the console — it
returns the array. That is the whole "read it back" path for now; turning it
into a file is Phase 12's next step.

Previously: Phase 11 Step 3 (restart from the completion screen) — done.

**The prototype loop is now closed end to end and replayable without a
reload:** 달의 돌 → 정화 → 모스키 영입 → 추종 → 덩굴 다리 → 도강 →
보물 상자 → 완료 화면 → 다시 모험하기 → 처음부터.

What is left of the original plan: **Phase 12** (feedback form / LocalStorage /
JSON export — `feedback.js` is still the only TODO stub in the codebase), and
the long-term expansions in GAME_DESIGN.md ch.12-13.

Previously: Phase 11 Step 1 (completion detection) — done, stable, v0.1.11.

**Git note:** the whole Phase 9 + Phase 10 body of work was committed by the
user on 2026-09-22 as `c6bbae4 feat: complete companion and vine bridge
prototype loop` (13 files, +5383). Phase 11 Step 1 (`js/game.js`, +41/-0) is
the only uncommitted change as of this writing.

**For Phase 11 Step 2 (completion screen):** read `MG.Game.gameComplete`, or
call `MG.Game.isPrototypeComplete()` if you want the live condition rather
than the latch. Do not add a fourth state — the latch already flips at exactly
the right moment and survives death/respawn.

Previously: Phase 10 Step 3 (treasure chest) — done, stable, still v0.1.11.

**The whole prototype arc now plays end to end:** 달의 돌 → 정화 →
모스키 발견 → 영입 → 추종 → 강둑 → 덩굴 다리 → 도강 → 보물 상자 →
"달빛 조각을 획득했다!".

**Phase 11 is untouched.** No completion screen, no inventory, no item
system, no quest tracking. The three completion conditions the original
design names (Moski recruited / bridge built / chest opened) are all
observable as `MG.Companion.recruited`, `MG.Game.bridgeActivated`, and
`MG.Map.treasure.state === 'OPEN'` — a completion screen can read those
three booleans without any new state.

**One behaviour worth knowing:** the ability does not require Moski to be
near the anchor, only Luka. In practice Moski is always 18-32px behind Luka
so it arrives at 0.22s of a 1.0s build, but if a future feature ever
teleports Luka, the bridge could finish before Moski catches up.

**For Step 2, the crossing is already surveyed:**
* Anchor (984, 578) → chest (1150, 578) is a straight horizontal line, so a
  bridge is an axis-aligned span; the river is 130px wide between x=1000 and
  x=1130.
* The player can walk to x=994.5 (foot box 11px against the river edge). The
  anchor sits 22.8px from where they naturally stand, deliberately — at 986
  it was hidden behind Luka's sprite, confirmed by screenshot.
* Activating the bridge means removing/overriding the one solid with
  `water: true` in `MG.Map.solids` for the crossing band only, and setting
  `MG.Game.bridgeActivated = true`. Do not rebuild all solids; do not touch
  collision.js.

Phase 9 complete (Steps 1-4 + UI polish) — stable.

**One thing deliberately left alone:** the heart HUD is still faintly visible
behind the title overlay. It is HUD, not a control, and the polish task named
exactly two issues — so it was not touched. If it should also hide on the
title screen, add `#hud-hearts` to the `body:not(.mg-playing)` rule in
style.css; that is the whole change.

**Phase 9 (모스키 동료 영입) is now functionally complete**: discover →
secure the clearing → interact → rescue → follow. Phase 10 (덩굴 다리,
동료 능력, Q 키, 보물) remains entirely unimplemented.

**Two things a future step must not break:**
* Moski is still absent from `MG.Enemy.list` and `MG.Map.solids`, and
  `Player.moveAndCollide()` is never called for it. That absence is what
  keeps the sword, enemy AI, and player collision from ever seeing it.
* Moski does not collide with trees or rocks — it drifts over them. This is
  deliberate (it hovers, and the spec forbade obstacle pathfinding in this
  step). If it ever needs to respect terrain, that is a design decision, not
  a bug fix.

**Note for whoever does Step 2:** `MG.Input.interactPressed` exists and is
correct, but nothing consumes it yet. When you wire it up, read it in
`MG.Game.update()` alongside the other per-frame checks, and drive
`MG.UI.showInteract()` / `hideInteract()` from proximity the same way
`updateRestartPrompt()` drives the restart prompt — including its hysteresis
idiom (enter/leave radii), which exists precisely to stop a prompt flickering
on the boundary.

**One open tuning question for the next pass:** the spec suggested the bed
should sit around 10–15% of gameplay SFX loudness, but the spec's own
recommended `windGain` of 0.035 measures at 5.7% of the sword swing, because
the 320Hz lowpass removes most of the noise energy. 0.035 was kept — erring
quiet is the safe direction, and this is an aesthetic call that needs a real
phone speaker to judge. If it turns out to be inaudible on device, raise
`AMBIENT.forest.windGain` to ~0.06 (and `cleansed` to ~0.045) to land inside
the stated band. That is a two-number change in `js/audio.js`.

### Phase 12 STEP 1 FIX 2 — 키보드 UX 최종 (버전 유지: v0.1.11)

실기 영상에서 나온 증상: 키보드가 오르면 화면 전체가 크게 움직이고, 한 박자
늦게 더 스크롤되면서 "드디어 저곳에 도착했다." 와 완료 정보가 밖으로 밀려남.

**원인은 전부 1차 수정에서 내가 넣은 것들이었다.**

1. `syncKeyboardInset()` 이 `#game-root` 의 top/height 를 바꾸고 `Game.resize()`
   를 불렀다. 무대는 9:16 비율 고정이라 높이가 줄면 **폭까지 같이 줄어든다**
   (375x667 -> 264x470). 입력창은 보였지만 게임 화면 전체가 축소·재배치되는
   것이 "화면이 위아래로 크게 이동한다" 의 정체였다.
2. `scrollIntoView({block:'center', behavior:'smooth'})` 를 200ms·450ms 에 **두
   번** 불렀다. center 는 입력창을 한가운데로 끌어오므로 위쪽 내용이 그만큼
   밖으로 밀리고, smooth 두 번이 겹쳐 "시간이 지나면서 더 스크롤된다" 로 보였다.
3. viewport meta 의 `interactive-widget=resizes-content` 도 같은 무대 축소를
   일으킨다 — 다만 **아티팩트에는 이 meta 가 들어가지 않으므로** 실기 영상의
   원인은 1번과 2번이었다(아래 build.sh 항목 참고).

**고친 방식:** 무대를 손대지 않고 오버레이만 잘라낸다. 오버레이는
`position:absolute; inset:0` 이므로 `bottom` 만 키우면 위는 고정된 채 아래만
짧아진다. 375x812 에서 키보드 342px 기준으로 계산하면 무대 아래끝 739.5 −
보이는 끝 470 = **270px** 이 정확히 잘려나가고, 남은 397px 안에서 내부 스크롤로
rating → textarea → 피드백 보내기 까지 닿는다. 오버레이가 지나치게 납작해지지
않도록 최소 120px 는 남긴다.

**build.sh 관련 발견:** `artifact.html` 에는 viewport meta 가 전혀 없고
(Artifact 호스트가 head 를 제공), `dist/index.html` 의 meta 는 build.sh 48행에
하드코딩되어 있어 `index.html` 을 고쳐도 반영되지 않는다. meta 로 모바일 동작을
바꾸려면 세 곳(index.html / build.sh / 아티팩트 한계)을 함께 봐야 한다.

검증(하네스, 무대 375x667 이 812 화면 중앙에 있다고 가정): 키보드 470px 기준
오버레이 `bottom:270px` 정확히 적용, `#game-root` 와 무대는 **스타일이 전혀
붙지 않음**; `scrollIntoView` 는 `block:'nearest'` 로 1회; 키보드를 내리면
`bottom` 이 깨끗이 제거됨; 극단적으로 낮은 뷰포트(150px)에서도 오버레이 높이
120px 확보; `UI.hideComplete()`(재시작 경로)에서도 반드시 해제; 저장 레코드는
여전히 `{rating, comment}` 두 필드에 키도 동일; 게임 이동 42px 정상이고
오버레이·루트에 잔여 스타일 없음.

**실기 재확인 필요.** 브라우저 패널이 이 세션 내내 렌더링하지 못해(Claude 창
최소화/숨김) 키보드가 실제로 올라온 화면은 여전히 보지 못했다. 이 문제는 실기
영상에서만 드러났으므로 같은 기기에서의 재확인이 유일한 진짜 검증이다.

### Phase 12 STEP 1 FIX — 모바일 소프트 키보드 가림 (버전 유지: v0.1.11)

실기 Android 테스트에서 나온 문제. **크기가 아니라 위치 문제였다는 점이 핵심.**

`Game.resize()` 는 `viewportSize()` 안에서 이미 `visualViewport.height` 를 함께
보고 있어서, 키보드가 올라오면 무대를 제대로 작게 만든다. 문제는 그 다음이다:
`#game-root` 가 `position: fixed; inset: 0` 이라 **레이아웃** 뷰포트 전체를
차지하는데, 안드로이드 기본값(`resizes-visual`)에서는 키보드가 레이아웃
뷰포트를 줄이지 않는다. 그래서 470px 짜리 무대가 812px 박스 한가운데,
즉 y≈171~641 에 놓이고 키보드는 y≈470 부터 덮는다 — 무대 아래 171px,
정확히 입력창과 제출 버튼이 있는 부분이 가려진다.

그래서 고칠 곳은 스크롤이나 textarea 위치가 아니라 **컨테이너가 어느 뷰포트를
기준으로 삼는가** 였다. `interactive-widget=resizes-content` 한 줄이 그 기준을
바꿔주고, 나머지(무대 재배치, 오버레이 스크롤)는 이미 있던 코드가 한다.

폴백을 따로 둔 이유는 iOS Safari 가 아직 `interactive-widget` 을 모르기
때문이다. 두 방식이 겹쳐 이중으로 보정하지 않는다는 것을 실제로 확인했다 —
지원 브라우저에서는 `innerHeight - visualViewport.height` 가 0 이 되어 폴백의
조건(`gap > 80`)이 성립하지 않는다.

검증(하네스): 미지원 시나리오에서 focus + visualViewport 470px → `#game-root`
가 `height:470px; top:0px` 로 고정되고, blur 후 원래대로 복귀; 지원 시나리오
(innerHeight 도 470) 에서는 폴백이 스타일을 전혀 건드리지 않음;
`scrollIntoView` 가 `block:'center'` 로 1회 호출; 키보드가 올라간 상태에서
`UI.hideComplete()`(= restartSession 경로)를 타도 보정이 반드시 해제됨;
저장 레코드는 여전히 `{rating, comment}` 필드 둘뿐이고 키도 동일; 점수 버튼
동작 유지; 게임 이동 42px 정상이며 `#game-root` 에 잔여 스타일 없음.

**여전히 실기 확인 필요.** 브라우저 패널이 이 세션 내내 렌더링하지 못해
(Claude 창 최소화/숨김) 실제 키보드가 올라온 화면은 보지 못했다. 이 수정은
실기에서 나온 문제이므로 **같은 기기에서 재확인하는 것이 유일한 진짜 검증**이다.

### Phase 12 STEP 1 — 피드백 폼 + LocalStorage (버전 유지: v0.1.11)

**The design doc does not specify a feedback system.** Searching all 409 lines
of GAME_DESIGN.md for 피드백/설문/평가/저장 returns exactly one hit, and it is a
development principle rather than a feature spec:

> 14. 개발 원칙 — 9. 친구 피드백을 적극적으로 반영한다.

There is no Phase 12 section, no evaluation items, no questions, no storage key,
no data shape, no overwrite-vs-append rule and no required-field rule. The only
other signal was `feedback.js`'s own header naming the three pieces ("피드백 폼 /
LocalStorage / JSON 내보내기"), which is how the step boundary was drawn.

Because the task forbade inventing evaluation items, the form's contents were
**asked rather than assumed**; the user chose 재미 점수 1~5 + 자유 의견. Every
remaining undefined decision is recorded here so the next person knows these
were judgement calls, not requirements:

* key `moonlit-grove-feedback` (project name — no key existed, none specified)
* array, appended (a second friend must not erase the first)
* record is `{rating, comment}` and nothing else (the task forbade adding
  fields like 날짜/시간 that the doc does not mention)
* no required fields (the doc defines none, so none were invented)

**Why the form resets in `UI.hideComplete()` rather than `restartSession()`.**
The step forbade changing `restartSession()`'s structure. `hideComplete()` is
already called by it and is the natural owner of "the overlay's contents go
back to their initial state when it is put away" — so `game.js` needed no
change at all this step.

**A layout note.** The completion screen is now much taller. `.overlay-complete`
gained `overflow-y: auto` with `align-items: flex-start` + `margin: auto` on the
inner block — with `align-items: center` an overflowing panel has its top cut
off and unreachable. `touch-action: pan-y` is needed too, because `body` sets
`touch-action: none` for the game.

Verified by harness: form appears with the completion screen; submitting stores
exactly `[{"rating":4,"comment":"..."}]` with fields `comment,rating` only;
repeat submits add nothing; the raw string survives and re-parses (the
"refresh" check); empty submission is accepted and stores
`{rating:null, comment:""}`; a second submission appends and keeps the first;
re-clicking a score deselects it; with `localStorage` throwing, `submit()`
returns false without throwing and the status line explains. After
다시 모험하기: game fully reset (treasure CLOSED, Moski TRAPPED, bridge off,
river one solid, HP 5, 9 Mosslings) while the stored feedback survives and the
form is blank again. Regression: movement 42/-42, sword 3→2, Mossling CHASE +
damage, Moonstone → cleansing unchanged. Console clean across four loads, with
no `[MG] 초기화 실패` — confirming `Feedback.init()` runs in the real browser.
Bundle contains no `.download`, `Blob`, `createObjectURL`, `fetch`,
`XMLHttpRequest` or `sendBeacon` (the `JSON.stringify` present is LocalStorage
serialisation, not file export).

**Still unseen.** Third step running with the browser pane unable to render
(Claude's window minimized/hidden), so the form's appearance, spacing and tap
targets on 375×812 and desktop were reasoned, not observed. This one is the
most worth checking on a device, since it is the first screen with a text
input.

### Phase 11 STEP 3 — 완료 화면의 "다시 모험하기" (버전 유지: v0.1.11)

The smallest step in the project so far: **`index.html` +6, `js/ui.js` +19,
and no CSS whatsoever.** The button reuses `.ui-button` (the title screen's
"모험 시작"), which already carries `min-height: 48px` and the pressed state,
so there was nothing to style.

**Nothing was re-initialised.** The handler's entire body is a guard, an
`Audio.unlock()` and `MG.Game.restartSession()`. Everything the spec listed as
required after the click — screen hidden, `body.mg-complete` removed, treasure
CLOSED, bridge off, Moski TRAPPED, `gameComplete` false, player controllable —
was already inside `restartSession()` from Steps 1 and 2. Adding any of it
again would have created a second source of truth for the reset.

**The guard is worth keeping.** `if (!MG.Game.gameComplete) return;` looks
redundant because hiding the overlay already stops further clicks. But a
harness run with two listeners deliberately attached to the same button (a
double `UI.init()`) still produced exactly **one** `restartSession()` call —
the guard, not the DOM, is what makes that safe. In the real boot path there is
exactly one listener, verified.

Verified: completion screen up → click → `gameComplete` false, overlay hidden,
`mg-complete` removed, treasure CLOSED/openT 0, bridge false with the river
back to a single solid, Moski TRAPPED and unrecruited, HP 5 at (200,590), 9
Mosslings, `state` PLAY — and the player moves again (42px), so the Step 2
freeze releases. Five rapid clicks → `restartSession()` called once. Clicking
while not complete does nothing. A full second playthrough (영입 → 다리 →
상자 → 완료 화면 → 다시 모험하기) behaves identically to the first. Regression:
movement 42/-42, sword 3→2, Mossling CHASE + damage, respawn HP 5/5 at
(200,590), Moonstone → cleansing (atmosphere 1, all dissolved). Console clean
across three loads. No new key input (KeyE/KeyQ/Space counts unchanged), no
localStorage, no JSON export, `feedback.js` untouched.

**Still unseen.** As in Step 2, the browser pane would not render this session
(the tool reports Claude's window as minimized/hidden), so the button's
appearance, spacing and tap size on 375×812 and desktop were not observed —
only reasoned from the `.ui-button` class the title screen already uses. Worth
a glance on a real phone.

### Phase 11 STEP 2 — 프로토타입 완료 화면 (버전 유지: v0.1.11)

**The design doc has no completion screen.** Searching GAME_DESIGN.md for
완료/보상/엔딩 turns up nothing describing one — the arc simply ends at
"보물 획득" (ch.11). Rather than invent an ending, the screen quotes the one
sentence the document does supply for this exact moment, in ch.2:

> "드디어 저곳에 도착했다."

and lists the three completion conditions as evidence (모스키 / 덩굴 다리 /
달빛 조각 — all existing in-game terms). Nothing new was written into the
fiction.

**Why the screen waits 1.6 seconds.** The chest opening is a busy moment: lid
rotation, 14 reward particles, and the "달빛 조각을 획득했다!" toast. Dropping a
full-screen scrim on top of that immediately means the player never sees the
thing they just earned. The delay runs on the existing dt loop
(`_completeDelayT`), not a new timer system.

**Why gameplay freezes rather than just being covered.** The overlay's
`pointer-events: auto` already blocks the touch buttons, but keyboard movement
on desktop would still run underneath. Returning early from `Game.update()`
settles it in one place and also guarantees requirement 10 — no further
progression and no second completion event. Verified: 240 frames with a
movement input held produced **0.00px** of movement for Luka, Moski and every
Mossling, and `showComplete()` was called **0** more times over 300 further
frames.

**Testing note (unchanged from Step 1).** The browser pane could not render
this session — the tool reports Claude's window as minimized/hidden, which
stops the page drawing, so eval, screenshots, `get_page_text` and resize all
time out while page loads and console reads keep working. Behaviour was
therefore verified with the Node harness that drives the real modules through
`Game.update()`. **The completion screen's layout has not been seen rendered** —
its centring comes from the `.overlay` class the title screen has used since
v0.1.1, and its text sizing uses the same `clamp()` + `word-break: keep-all`
approach measured on the toast, but that is reasoning, not observation. Worth
a look on a real phone.

Verified: screen hidden at boot and through the whole run until the chest
opens; appears at 1.62s after `gameComplete` latches; stays up indefinitely;
`restartSession()` hides it, removes `body.mg-complete`, restores the river to
a single solid, the chest to CLOSED, Moski to TRAPPED, and movement works
again (42px) — the freeze releases. Regression: movement 42/-42, sword 3→2,
Mossling CHASE + damage, respawn HP 5/5 at (200,590), Moonstone → cleansing
(atmosphere 1, all dissolved). Console clean across three loads. No new button
(`btn-start` / `btn-attack` / `btn-interact` / `btn-ability` unchanged), no
localStorage, no JSON export, `feedback.js` untouched (0 lines).

### Phase 11 STEP 1 — 프로토타입 완료 감지 (버전 유지: v0.1.11)

Deliberately the smallest possible change: **one file, +41 lines, 0 deletions.**
No existing line was modified — combat, movement, companion, bridge and chest
logic are byte-identical.

**Why a latch and not a per-frame check.** Evaluating the three conditions
every frame would also work (none of them ever goes back to false on its own),
but a latch states the intent: completion is an event that happens once, at the
moment the chest opens. `checkPrototypeComplete()` short-circuits on
`gameComplete`, so once it is true nothing can un-complete the prototype —
verified by forcing `treasure.state` back to `'CLOSED'` and confirming the
latch held.

**Why check all three when only the chest can be the trigger.** At the OPEN
transition the other two are already true by construction (the chest requires
the bridge; the bridge requires recruitment). The full check is therefore a
restatement of the contract in code rather than a filter — and it keeps the
completion honest if some later step ever opens the chest by another path.
Verified: with recruitment alone → false, recruitment + bridge → false, all
three → true.

**Testing note.** The browser pane's `javascript_exec` channel was unresponsive
for this whole session (console reads and page loads worked; eval, screenshot
and resize timed out). Rather than skip the behavioural tests, they were run
through a Node harness that loads the real `js/*.js` modules against a DOM/
canvas stub and drives `update()` frame by frame — the harness lives in the
session scratchpad, not in the repo. Rendering was not exercised that way, but
this step adds no rendering.

Verified end to end: gameComplete stays false through 영입 → 다리 → 도강 →
상자 접근, flips to true on the frame the chest reaches OPEN (0.55s open
animation), and stays true across 300 further frames and a death/respawn.
Restart clears it along with the chest (CLOSED, openT 0), the bridge (river
back to a single solid) and Moski (TRAPPED). Death before opening leaves
recruitment intact and completion false; the exact respawn frame still gives
HP 5/5 at (200, 590) after 1.52s. Regression: movement 42/-42, sword 3→2,
Mossling CHASE + damage 5→3, Moonstone → cleansing (atmosphere 1, all
dissolved), and the full bridge/chest/completion chain still works after
cleansing. Console clean at both desktop and 375×812. No completion screen, no
inventory, no feedback/localStorage code — the only `LocalStorage` string in
the bundle is the untouched Phase 12 header comment in `feedback.js`.

### Phase 10 STEP 3 — 보물 상자 개봉 (버전 유지: v0.1.11)

**The interesting question here was button ownership, not the chest.** The
interact button already had an owner: `companion.js` drives it every frame
while Moski is `RECRUITABLE`. Adding a second per-frame writer is how you get
a button that flickers because two systems disagree.

It turned out no arbitration is needed, and the reason is worth writing down:
the chest requires `bridgeActivated`, which can only be true if Moski is
`FOLLOWING`, and `companion.js` touches the button only in the `RECRUITABLE`
branch. The states are mutually exclusive by construction, so the chest can
own the button freely whenever it is eligible. `game.js` keeps its own
`_treasurePromptShown` cache mirroring companion's `_promptShown`, so neither
side writes to the DOM on a frame where nothing changed. If a future
interactable ever *can* coexist with another, this reasoning stops holding and
real arbitration becomes necessary — do not assume it stays free.

**The lid is real geometry.** Rather than draw a second 'open chest' sprite,
`drawTreasure` translates the canvas to the hinge at (x, y-10) and rotates the
same lid rectangle by up to 1.83 rad. One code path covers closed, every frame
of opening, and open.

**The chest is deliberately not a solid.** The spec preferred that unless
walking through looked wrong; it does not, because Y-sorting already puts Luka
in front of it when he stands below its foot line. Making it solid would mean
touching `buildSolids` and remembering to rebuild it on restart, for no visible
gain.

Verified at runtime: before the bridge exists the button never appears for the
chest and E does nothing even standing on top of it; after the bridge, the
button appears at 26px, holds to 34px on the way out and hides at 40px; E and
the mobile button each open it exactly once (audio called once across three
repeat presses, and again after it is OPEN); the animation runs 0.50s; 8
particles at the crack plus 14 at the reveal; the toast fires once with
exactly "달빛 조각을 획득했다!" and fits on one line at 375×812 (262×56, not
clipped, clear of the joystick). Player death leaves the chest OPEN with the
bridge active and Moski recruited; `restartSession()` returns it to CLOSED with
`openT` 0 and clears the prompt cache. Regression: movement, sword (3→2),
Mossling chase and damage, Moski recruitment/following (31.7px), vine bridge
(2 water segments), Moonstone → cleansing all unchanged. No inventory, no
completion screen, no item database anywhere in the bundle. Console errors: 0.

### Phase 10 STEP 2 — 덩굴 다리 능력 (버전 유지: v0.1.11)

**The collision approach is the part to understand.** The river was one solid
spanning the whole map height. Rather than teach `collision.js` about bridge
state (a change rippling through every collision query), `setBridgeOpen(true)`
splits that one rectangle into two — above and below the crossing — and the
gap between them *is* the walkable bridge. `collision.js` never learns the
bridge exists. This works because `player.js` and `enemy.js` both do
`var solids = (MG.Map && MG.Map.solids) || []` on every call, so editing the
array in place takes effect on the next frame. `resetBridge()` puts the single
full-height solid back on session restart.

Measured: before activation the crossing is blocked; it stays blocked through
the entire build and only opens on the completion frame; afterwards the player
walks across (990 → 1130, stepwise, no teleport) while y = 200/400/520/640/700
all still stop dead at x = 994.5. Two water segments, y 0–565 and y 591–810.

**Why the bridge is not Y-sorted.** Every other world object goes through
`collectProps`. The bridge does not, on purpose: it is a floor. If it were
sorted by its own y it would draw *over* Luka whenever he stood slightly above
its centre line. It is drawn immediately after the water instead — above the
river, below everything that walks on it.

**A testing note for whoever comes next.** Two of my early runs looked like
bugs and were not. Parking Luka next to the anchor for 10 seconds let the
water's-edge Mossling kill him, and `canUseAbility()` correctly refused to
arm while `Player.state === 'DEAD'`. And teleporting Luka to the bank (rather
than walking) leaves Moski hundreds of pixels behind, so it cannot reach the
anchor during the build. Both are artifacts of driving the game from the
console; neither reproduces in real play.

Verified at runtime: Q and the mobile button each trigger exactly once (audio
called once across three repeat presses); build lasts 1.00s; Moski travels at
170px/s max with no frame step over 2.83px; on completion `bridge.built` and
`Game.bridgeActivated` both become true, the button hides, further Q does
nothing, and the toast fires once with "덩굴 다리가 완성되었다."; Moski
returns to FOLLOWING and follows Luka across (31.8px trail). Player death
preserves the bridge and recruitment; restart returns the river to a single
solid, Moski to TRAPPED, and hides the button. The bridge works identically
after cleansing (independent of `Game.cleansed`). Button layout at 375×812:
ability 224–280, attack 294–358 (14px gap), interact 302–358 at a different
height — no pair overlaps, 18px clear of the joystick zone; landscape
812×375 likewise. Regression: movement, sword (3→2), Mossling chase and
damage, Moonstone → cleansing all unchanged. Chest state never changes and
there is no open/inventory function anywhere. Console errors: 0.

### Phase 10 STEP 1 — 막힌 강 / 보이는 보물 / 덩굴 앵커 (버전 유지: v0.1.11)

This step was mostly an audit, and the audit found one thing that mattered.

**The stale comment.** `map.js` documented the treasure glade at x=1200 with
the reasoning "the bank view spans x 754–1234, so the treasure must sit
inside it." That arithmetic was correct for a 640px-wide camera. The portrait
conversion (v0.1.1) made the camera 360px and nobody revisited the note. The
real span from the bank is x 814–1174, measured. Had the chest been placed at
the documented spot it would never have appeared on screen, and the whole
emotional premise of Phase 10 — *"I saw this before and couldn't reach it"* —
would have quietly failed. The comment has been corrected in place so the
next person does not repeat it.

**What was deliberately NOT changed:** the river, the paths, the Moonstone
area, the glades, and every collision primitive. The blocked gap the design
asks for already existed and is genuinely impassable — proven by BFS over the
real solids, not by inspection. Re-cutting the map to match the original
Prototype 0.1 sketch would have destroyed a working world for no gain.

**Why the anchor moved.** It was first placed at (986, 600), which is 4px
from where the player stands at the bank — a screenshot showed it completely
hidden behind Luka. (984, 578) keeps it at the water's edge and on the chest's
line while sitting clear of the sprite.

Verified at runtime: BFS 21,117 nodes still cannot reach the east bank
(max x 990) and no bypass exists; neither prop is a solid and the anchor does
not block the bank; from the bank both are on screen together (anchor at
screen x=170, chest at x=336) with the river between them; both are
measurably distinct from grass (anchor Δ19 with 20 violet rune px, chest Δ28
with 218 wood px, grass has 0 of either); both enter the existing Y-sort
queue. Q does nothing; there is no ability button (only btn-attack and
btn-interact); no bridge solid exists; swinging the sword at the anchor
changes nothing. Regression: movement, sword (3→2), Mossling chase + damage
(5→3), Moski recruitment and following (31.7px trail), Moonstone → cleansing
(all dissolved, atmosphere 0→1), restart all unchanged — and the bridge flag
is still false after cleansing and after restart. Console errors: 0.

### Phase 9 UI 폴리시 — 문구 잘림 / 타이틀 화면 버튼 (버전 유지: v0.1.11)

Two real-phone bugs. Both root causes are worth remembering:

1. **`white-space: nowrap` on `.hud-toast` was a leftover assumption.** It was
   fine when the only toast was the short 달의 돌 notice. The Phase 9
   recruitment line is 20 characters, which at the clamped 21px font needs
   ~445px — far past the container, so it clipped. Removing nowrap alone was
   not enough: the toast is absolutely positioned, so it shrink-to-fits, and
   with `word-break: keep-all` it collapsed to the width of the longest 어절
   and stacked **five** short lines. The fix that actually works is
   `width: max-content` **plus** `max-width: 84%` — ask for the unwrapped
   width first, then clamp, so the box fills the space it is allowed and
   wraps only inside it. Measured 2 lines at 375px, 375×86px box.
   `word-break: keep-all` is what keeps Korean from breaking mid-word.
   `.hud-victory` and `.hud-restart` still use nowrap on purpose — both are
   short and must stay on one line.
2. **Touch controls had no lifecycle at all.** `body:not(.mg-touch)` was the
   only thing hiding them, so on any touch device the sword button was live
   from the first paint, behind the title. Desktop looked correct purely by
   accident. The fix adds `mg-playing` to the same hide rule and toggles it
   where the state already changes — `Game.init()` removes it, 
   `startAdventure()` adds it. No timers, no new input layer, and the rule
   matrix was verified for all four class combinations.

Verified at runtime: fresh 375×812 load shows title only (attack, joystick,
joystick-base and interact all `display:none`); after 모험 시작 the attack
button and joystick zone return and both respond; the recruitment message
renders the exact string once, unclipped, 2 lines at 375×812 (315×86 box),
2 lines in landscape (177×54, 13px) and 2 lines on desktop 1280×800
(378×86), always inside the stage and clear of the joystick zone; CSS rule
matrix correct for touch/desktop x title/play; Moski following unchanged
(31.7px trail while running, 0 jitter once settled, restart returns it to
TRAPPED at 300,235); keyboard move/Space/E all still work. Console errors: 0.

### Phase 9 STEP 4 — 모스키 추종 이동 (버전 유지: v0.1.11)

**The one thing worth reading here: separation had to become a constraint.**

The first implementation pushed Moski out of Luka with a damped force, the
same exponential shape as the follow steering. It looked reasonable and it
was wrong. Measured on a hard direction reversal, Moski reached **3.2px from
Luka's centre** — well inside his body. The reason is that three things pull
it inward at once on a reversal: the anchor has jumped to the far side, the
damped push only resolves ~23% of the overlap per frame, and Luka is walking
*into* Moski at 84px/s. The force loses.

Replacing it with a position constraint — project onto the 13px circle every
frame — fixed it exactly. The feared jitter never appeared, because the
incoming motion is already smooth, so the projected point moves smoothly too.
It also produced the behaviour the spec actually wanted for free: Moski now
*rides around* the circle to reach the far side instead of cutting through.
Measured during a reversal, its Y offset traces 0 → -6.4 → -10.2 → -6.8 → -2
while separation holds at exactly 13.0 — a real arc.

The second measured fix was a **150px/s speed cap**. Uncapped, the damping
briefly moved Moski at 390px/s (6.5px per frame) when closing a large gap.
That is not a creature, it is a cursor. 150 keeps it faster than Luka (84)
so it can still catch up, without ever looking like it teleports — verified
at exactly 2.5px/frame maximum afterwards.

A note on `snapBehindPlayer()`: it is called in exactly one place, the
`DEAD → ALIVE` transition. Do not reach for it anywhere else — every other
placement must be smooth, and a snap is precisely what the spec forbade.

Verified at runtime: follows correctly up/down/left/right/diagonal (always on
the far side from the facing direction); 0 drift over 2s while idle; max
speed 150px/s and minimum separation exactly 13.0 through both a hard
reversal and eight rapid direction changes; placed exactly on Luka it
resolves to 13.0 in a single frame while Luka walks on unimpeded (56px);
attacking beside Moski leaves it FOLLOWING and it does not flee; player
damage triggers the hop and preserves recruitment; during death Moski moves
**0px** and stays recruited; on respawn it appears 13px behind the respawned
Luka rather than at the death site; restart returns it to TRAPPED at
(300,235). Regression: movement, sword (hp 3→2), Mossling chase + damage
(5→3), Moonstone → cleansing (all dissolved, atmosphere 0→1), joystick,
attack button all unchanged; Y-sort index 21 of 52 with 0 violations; camera
still follows Luka only. Mobile 375×812 and landscape 812×375 both verified,
including recruitment via the mobile button and following driven by the real
joystick. Console errors: 0.

### Phase 9 STEP 3 — 모스키 영입 + 구출 이벤트 (버전 유지: v0.1.11)

Four decisions worth understanding before changing any of this:

1. **"Clearing secured" is judged by home, not by current position.** This is
   the single most load-bearing choice in the step. Mosslings chase up to
   260px from home, so testing live positions would let a player lure the
   guard away and recruit Moski without ever fighting — and would make the
   state flicker whenever the guard wandered across the radius. Home
   coordinates never change, so the test is stable and unexploitable.
2. **The clearing radius is not written down twice.** `map.js` exposes
   `GLADES`; `companion.js` looks up its own glade and caches the radius in
   `init()`. If the clearing is ever resized, only map.js changes. The
   hardcoded 138 in companion.js is a fallback for "map data unreadable",
   not a second definition.
3. **The hop target is computed once, on purpose.** At t=0.55s the code
   snapshots a point 16px in front of Luka and eases to it. Recomputing that
   each frame would be follow steering, which belongs to Step 4. If Step 4
   replaces the settle, delete the snapshot rather than extending it.
4. **The overlap fix was a data change, not a rendering trick.** One entry in
   `SPAWN_SPOTS` moved 85px south. The guard is still inside the clearing at
   every point of its wander, so the scene still reads as "a Mossling guards
   this clearing" — which is what that spawn was always for.

Verified at runtime: 0 enemies at (300,235) with the count still 9; killing
the 8 unrelated Mosslings leaves Moski TRAPPED; killing the clearing guard
makes it RECRUITABLE; the button is hidden at 60/40/33px, appears at 27px,
stays visible at 33px on the way out (hysteresis) and hides at 39px; E and
the mobile button each trigger exactly once (audio called once across four
repeat presses); the event runs 0.82s; vine pixels measured 103 → **0**
(the residual 16 violet px in frame are background firefly motes, confirmed
identical with Moski removed from the render); the toast fires once with the
exact string; final state FOLLOWING / recruited true. Player death preserves
FOLLOWING + recruited; `restartSession()` returns Moski to TRAPPED at
(300,235). Moski still absent from `MG.Enemy.list` and `MG.Map.solids` after
recruitment. Regression: movement, sword (hp 3→2), Mossling chase + damage
(5→3), Moonstone → cleansing (all dissolved, atmosphere 0→1), joystick and
attack button all unchanged. Console errors: 0.

### Phase 9 STEP 2 — 모스키 엔티티 + 갇힌 상태 (버전 유지: v0.1.11)

Three notes for whoever writes Step 3:

1. **`update()` has no movement code, and that is the design.** Rather than
   guarding position with an `if (state === 'TRAPPED') return;`, there is
   simply nothing that writes `x`/`y`. When you add following in Step 3, add
   it behind a state check so TRAPPED keeps that property by construction.
2. **Moski is not an enemy and not a solid — keep it that way.** It stays out
   of `MG.Enemy.list` and `MG.Map.solids`, which is *why* the sword cannot
   hit it, enemy AI ignores it, and Luka walks straight through. If a future
   step wants Moski to block movement or take a hit, that is a real design
   change, not a bug fix.
3. **The render hook is a `kind` branch, nothing more.** `game.js` gained
   three one-line hooks (update, collect, a `kind === 'companion'` branch)
   and `main.js` one `init()` call. The render architecture, the camera, and
   the props queue were not touched.

Verified at runtime, not by inspection: `init()` restores all six fields
exactly; rendering proven by differential frame comparison (344 px / 21.5%
of a 40×40 region change when Moski is drawn, 46 teal body px + 118 violet
vine px); idle animation moves 328 px over 0.4s while `x`/`y` stay exactly
(300, 235); sword swing beside it leaves state/position untouched and Luka
walks through it; E fires its edge but changes nothing on Moski; the interact
button stays hidden even standing next to it. Regression: movement, sword
(hp 3→2), Mossling chase + contact damage (5→3), Moonstone → cleansing (9
Mosslings dissolved, atmosphere 0→1), restart prompt and restart all
unchanged, with Moski still TRAPPED afterwards. Verified in both desktop and
mobile landscape (812×375). Console errors: 0.

### Phase 9 STEP 1 — 상호작용 입력 / UI 토대 (버전 유지: v0.1.11)

Foundation only. Three things to know:

1. **`interactPressed` is computed, never latched.** `update()` recomputes it
   from `_interactRequested || eEdge` every frame and immediately clears
   `_interactRequested`. There is no "consume" call to make — read it during
   the frame and it is gone by the next one. This mirrors `attackPressed`
   exactly; do not invent a different contract for it.
2. **`.interact-button[hidden] { display: none; }` is load-bearing.** The
   button sets `display: flex` itself, which beats the `hidden` attribute's
   UA style. Without that rule the button would be visible from boot. The
   same rule already exists for `.joystick-base` for the same reason — if you
   add another touch control, it needs one too.
3. **`hideInteract()` hides instantly, on purpose.** Text elements (toast,
   victory, restart prompt) fade out on a timer before going `hidden`. A
   *control* must not do that — a button that is still on screen while fading
   can absorb a tap the game no longer expects. Show fades in; hide is
   immediate, and it also clears the pressed visual and
   `MG.Input._interactPointerId`.

Verified at runtime: E fires exactly one frame per press, ignores
`e.repeat`, re-fires after release; `reset()` clears every interaction field;
holding E does not affect movement (moved 35px right, 35px up) and does not
trigger an attack; Space still attacks and does not interact; the sword still
lands (모슬링 hp 3→2). Mobile 375×812: button hidden by default
(`display: none`, height 0), appears only via `showInteract()`, 56×56 tap
target with a measured **14px** gap above the attack button and **96px**
clear of the joystick zone; a tap sets the edge for exactly one frame;
attack button and joystick behave identically; both buttons can be held
simultaneously on independent pointer ids. Landscape 812×375 unchanged, with
the same 14px gap when shown. Console clean.

### v0.1.11 — PHASE 9.3: 마지막 폴리시 (출시 전)

Two deliberately tiny changes. Both are worth understanding before anyone
"tidies" them away:

1. **The discovery toast was removed at the call site, not in the system.**
   `js/ui.js` still has a complete, working `showToast()`/`hideToast()` pair
   — it is simply no longer called by anything. That is intentional: the
   toast is the right tool for a future non-climactic event, and deleting it
   would mean rewriting it later. If you add a toast back, do not add one to
   `activateMoonstone()` — that moment belongs to `숲이 정화되었다` alone.
2. **`#hud-version { display: none; }` is the whole of fix #2.** The element
   and `ui.js`'s write to it are deliberately left in place so the version
   still flows from `MG.Game.VERSION` into the DOM (useful for debugging, and
   it keeps a single source of truth). Do not "clean up" by deleting the
   element or the ui.js line — flip the CSS rule instead if you ever want the
   HUD version back.

Note that the title screen's `Prototype 0.1.11` is a hardcoded literal in
`index.html`, not driven by `VERSION`. That is pre-existing, and the version
bump procedure (a single sed across `index.html` + the `VERSION` constant +
cache-busters) already keeps it in sync. Left as-is on purpose — this pass
was not the place to change version plumbing.

Regression tested at runtime after the change: movement, sword hit (모슬링
hp 3→2), contact damage (5→3 with hearts rendering ❤️❤️❤️🤍🤍), death →
respawn at exactly (200, 590) with full HP after 1.50s, Moonstone activation,
cleansing wave, all 9 Mosslings dissolved, atmosphere 0→1, victory text
appearing and hiding itself by ~4.5s, restart prompt hysteresis, restart
reset, and combat after restart. `showToast` was called **0** times across
the entire climax and the toast element was visible for **0** frames.
Mobile 375×812: title version visible, gameplay HUD version absent, no
horizontal overflow, 64px attack button, 65px restart tap target. Console
clean.

### v0.1.10 — PHASE 9.2: 숲의 앰비언스 (경량 절차적 환경음)

Three things worth knowing before touching `js/audio.js` again:

1. **The node budget is the whole design.** Mobile browsers throttle audio
   graphs hard, so the rule here is: three persistent nodes, and everything
   else is a short-lived one-shot that stops itself. If you add a layer, ramp
   a parameter on the existing chain rather than adding an oscillator that
   runs forever. The reason there is no wind LFO is exactly this.
2. **`startAmbience()` sits outside `unlock()`'s try/catch on purpose.**
   `unlock()` sets `this.ctx = null` in its catch as the "no audio, game still
   runs" fallback. If ambience were inside that block, a failure while
   building the bed would null the context and silently kill every sound
   effect too. Keep it separated.
3. **Reuse `this._noiseBuffer`.** The 0.2s white-noise buffer already exists
   for the sword/hit SFX. The bed loops that same buffer at a slowed
   `playbackRate` instead of allocating a second, longer one — cheaper, and
   the pitch-shift is what gives the wind its low character.

Verified at runtime, not by inspection: zero nodes before the start button;
exactly 1 BufferSource + 1 filter + 1 gain after it; five repeated
`unlock()`/`startAmbience()` calls created **0** additional nodes; 60 cricket
intervals sampled (forest 4.0–7.9s, cleansed 6.0–10.7s) were all distinct;
mode switches and repeated visibility toggles created no new persistent nodes
and left the chain object identical; console clean throughout.

### v0.1.9 — PHASE 9.1: 다시 모험하기 (세션 소프트 리셋)

Closes the 2–3 minute loop so it can be replayed without refreshing the
browser. Two notes for whoever touches this next:

1. **`restartSession()` order is load-bearing.** `Enemy.init()` bails out
   early when `MG.Game.cleansed` is true — that early return is what stops
   Mosslings reappearing after a post-cleansing death. So the reset clears
   `cleansed` *before* calling `Enemy.init()`, otherwise a restart would
   silently produce an empty forest. Verified: all 9 return, with the 4
   guards back at their exact formation distances (51/51.2/58/58.1 from the
   stone).
2. **The prompt is a real `<button>`, on purpose.** The spec discouraged
   "buttons" in the sense of menus/panels; a semantic button styled as a
   floating one-line pill was chosen because `#ui-layer button` already has
   `pointer-events: auto` and the "모험 시작" button already proves a plain
   `click` listener is reliable on touch without double-firing. Tap target
   is 65px tall (well above the 44px comfort minimum) and sits at 26% —
   clear of the joystick zone (bottom 45%) and the attack button.

Also added `UI.hideVictory()` / `UI.hideToast()`, which clear their pending
timers before hiding — without that, a timer left over from the previous run
could fire mid-way through the next one and dismiss its victory text early.
`updateRestartPrompt()` additionally dismisses any lingering toast when the
prompt appears; the two can't actually coexist in real play (their trigger
locations are ~520px apart) but they sit close enough on screen that the
guard is cheaper than the caveat.

### v0.1.8 — PHASE 8.1: 정화 (완결된 마이크로 어드벤처)

Turns the Phase 8 objective into a full loop: explore → guarded clearing →
activate → cleansing wave → brighter forest → closure. Two design notes
worth keeping in mind before editing this again:

1. **Difficulty comes from placement, never from numbers.** The guards use
   exactly the same `CHASE_SPEED`/damage/lunge constants as every other
   Mossling; only `wanderLeash`/`homeLeash` differ (per-enemy, defaulting
   to the old globals so untouched enemies behave identically). Measured:
   guards drift at most 68px from the stone over 20s, and a player who
   simply stands in the clearing drops 5→1 HP in 7s — dangerous but
   survivable, and retreating works because the guards leash back.
2. **The wave is a renderer, not a system.** `renderCleanseWave()` is two
   arcs plus a radial gradient drawn inside the existing camera transform;
   dissolving reuses the existing `DEAD` state so `updateDead()` and the
   existing list-removal handle cleanup. Nothing new was added to the
   particle engine beyond the `'reward'` type already introduced in 8.0.

Verification notes: wave visibility was measured differentially (same frame
rendered with and without the wave) rather than by an absolute brightness
threshold — an initial check using a fixed threshold wrongly reported the
wave invisible because it draws semi-transparently over a dark forest; the
differential test shows it changes 46.6% of screen pixels. The victory line
also initially wrapped to two lines and collided with the toast; fixed with
`white-space: nowrap` plus moving the toast 22%→30%.

### v0.1.7 — PHASE 8: 달의 돌 (첫 게임 목표)

The game's first actual objective. New in `js/map.js`: `Map.moonstone`
(`{x:700, y:400, state:'IDLE'|'ACTIVE', activeT}`), a 16×9 collision solid
pushed into the existing `solids` array, `getMoonstoneHitbox()` (16×18,
same convention as `Enemy.getHurtbox()`), `drawMoonstone()`, a 14-firefly
cluster around the stone, and a `'moonstone'` entry in the existing
y-sorted `collectProps()`/`renderProp()` path. New in `js/game.js`:
`moonstoneFound` (one boolean, not a quest framework),
`updateMoonstone(dt)` and `activateMoonstone()`. New elsewhere:
`MG.Audio.playReward()` (C-E-G-C triangle arpeggio + filtered-noise
shimmer, ~1s, fully try/catch'd), `MG.UI.showToast()` + `#hud-toast` +
its CSS, and a `'reward'` particle type reusing the existing particle
array/update/render path rather than adding a second system.

Three things worth knowing before touching this again:

1. **Activation is strictly sword-only, by construction.** It reads
   `MG.Combat.getAttackHitbox()`, which returns `null` outside the
   `HITBOX_ACTIVE_FROM/TO` window — so walking into the stone, merely
   pressing attack, or standing next to it can never trigger it
   (explicitly tested: 3 simulated seconds of walking straight into it
   left `state:'IDLE'`). Pre-attack targeting was deliberately *not*
   extended to the stone — `findPreAttackTarget()` still only scans
   `MG.Enemy.list`, so targeting can never "aim at" the objective.
2. **A Mossling used to spawn on this exact spot.** `SPAWN_SPOTS` in
   `enemy.js` contains `{x:700, y:400}` — the same clearing. No data was
   changed to resolve it: because `main.js` runs `Map.init()` before
   `Enemy.init()`, the moonstone's solid is already in `Map.solids` when
   the existing `findClearSpot()` runs, so that Mossling is pushed ~8px
   aside automatically. All 9 Mosslings still spawn. The emergent result
   — one Mossling standing beside the objective — reads as a guardian and
   was left as-is.
3. **Persistence is session-only and survives death by construction.**
   `Player.respawn()` calls `MG.Enemy.init()` but never touches `MG.Map`
   or `MG.Game.moonstoneFound`, and `Map.init()` only ever runs once at
   boot — so IDLE-before-death stays IDLE and ACTIVE-after-death stays
   ACTIVE with no extra bookkeeping. No localStorage, no server save.

Verification notes: the stone's visual distinctness was checked by
sampling canvas pixels rather than by eye — the stone region differs from
adjacent grass by an average of 68.9 per-pixel channel units (97 moonlight
-blue pixels vs 0 in grass), and IDLE vs ACTIVE differ by 71.2 at an
identical animation phase (max luminance 229 → 250.7). Reachability from
spawn was proved by BFS over the real `solids` data (path found, 28705
nodes explored). CSS transitions do not visibly advance in this headless
test environment (`document.hidden === true`, so the page never
composites) — the toast's *target* styles were verified instead
(`opacity` 0 → 1 with `.is-visible`), along with its full timer sequence.

### v0.1.6 폴리시 — 사전 타겟팅 강화 (거리 가중 우선순위)

Version unchanged (still v0.1.6). `js/enemy.js`'s `findPreAttackTarget()`:
`PRE_ATTACK_TARGET_RADIUS` 28→40px, `PRE_ATTACK_CONE_HALF_ANGLE` 50→70°
(140° total). More importantly, the selection rule changed from a hard
tier (same-direction *always* beats adjacent-direction regardless of
distance) to a distance score: `score = dist + (sameDir ? 0 :
ADJACENT_DIR_PENALTY)` with `ADJACENT_DIR_PENALTY = 6` (~15% of the
radius) — same-direction still wins when distances are close, but a
significantly closer adjacent-direction target now wins outright
(verified the exact threshold: adjacent wins strictly below `same-dir
dist − 6`, ties go to same-direction via lowest-id). Two real conflicts
were found and resolved while implementing this, both worth knowing
about before touching this function again:

1. **Cone must be measured against each candidate's own classified
   direction axis, not the raw facing vector.** A candidate whose
   dominant axis is one of the two *adjacent* directions is by
   definition up to 90° from facing — no cone value ≤90° measured from
   facing can ever admit a purely-perpendicular target (e.g. an enemy
   directly below a `right`-facing player), yet accepting exactly that
   case is a hard requirement. Measuring the cone from the candidate's
   *own* `dir` axis instead works cleanly: same-direction candidates are
   always ≤45° from their axis (so the cone never binds), and adjacent-
   direction candidates are also always ≤45° from *their* axis — so at
   70° the cone is a deliberate no-op safety net, not a real filter. This
   is fine/intended: the direction-adjacency check (same + adjacent
   only, opposite always excluded) is what actually enforces "no 180°s";
   the cone constant exists for future-proofing if it's ever narrowed
   below 45° again.
2. **Targeting radius (40px) now exceeds the actual (unchanged, per
   instructions) sword hitbox's real reach in every direction** —
   measured directly against `getAttackHitbox()`: ~23.5px left/right,
   ~19.5px down, ~27.5px up (asymmetric because `getAttackHitbox()`
   anchors to `player.y - 10`, the waist, not the feet). A stationary
   attack at the outer edge of the new 40px search radius can therefore
   correctly re-aim `attackFacing` toward a real nearby target and still
   whiff, because pre-attack targeting only ever influences *direction*,
   never the hitbox itself (explicitly out of scope). In realistic
   mobile play — the player moving toward what they're attacking while
   tapping, not frozen in place — the ~0.7×`SPEED` movement during the
   swing consistently closes this gap; verified all three of the spec's
   worked examples (A/B/E) connect when combined with matching movement
   input, and only the artificially-stationary case whiffs. Not treated
   as a bug — flagging it as the honest edge case it is.

### v0.1.6 폴리시 — 히트박스 인지 타겟팅 (실제로 닿는 후보만 남긴다)

Version unchanged (still v0.1.6). Directly closes the "stationary
whiff" edge case documented right above this entry. `js/combat.js`
gained `computeHitboxGeometry(px, py, dir)` — the exact same `REACH`/
`WIDE`/`GAP`/waist-offset math `getAttackHitbox()` already used,
factored out into a pure function that takes no attack state at all
(no `attacking`/`attackT`/`attackFacing` needed). `getAttackHitbox()`
now just calls it after its existing `isHitboxActive()` gate — same
constants, same behavior, zero duplication. `js/enemy.js`'s
`findPreAttackTarget()` calls this new function for every candidate
that already passed the radius/direction/cone filters, and rejects
any candidate whose classified direction's hitbox wouldn't actually
overlap its hurtbox — only real, currently-reachable candidates ever
reach the distance-scoring step. `PRE_ATTACK_TARGET_RADIUS` (40) stays
as the broad candidate-search net; it is explicitly not the acceptance
radius anymore. Verified with a **stationary player** (the prior
pass's known gap) across close-direct, close-adjacent, outer-edge,
beyond-real-reach, no-target, behind-player, multiple-candidates, and
HIT/DEAD-exclusion cases, plus all 4 facings — every case that gets
redirected now actually connects with zero movement, and the
previously-broken "outer-edge"/"beyond-reach" cases now correctly
decline to redirect at all rather than aiming-then-missing. Full
mobile (joystick+attack simultaneous, movement never blocked) and
Phase 7 (HP/invuln/death/respawn/enemy-reset) regressions re-verified
passing. `getAttackHitbox()`'s contract, `ATTACK_DURATION`/
`ATTACK_COOLDOWN`/`HITBOX_ACTIVE_FROM`/`TO`/`REACH`/`WIDE`/`GAP` values
are all byte-for-byte unchanged. Completed by Claude Code.

Next owner:

Claude Code / Gemini CLI / ChatGPT depending on task

Before beginning new work:

Read:

* GAME_DESIGN.md
* AI_HANDOFF.md
