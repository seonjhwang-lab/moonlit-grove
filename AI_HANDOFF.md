# MOONLIT GROVE — AI HANDOFF

## CURRENT STATE

Project:

달빛 숲의 수호자 / Moonlit Grove

Current Version:

v0.1.1

Current Phase:

Portrait Conversion

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

# CURRENT ISSUE

The original implementation was landscape-first.

Original logical canvas:

480 × 270

Original aspect ratio:

16:9

Portrait mode previously:

* displayed orientation warning
* hid the game root
* paused the game

This behavior is being removed.

---

# CURRENT TASK

## Portrait Conversion v0.1.1

Goal:

Make the game fully playable on smartphones in portrait mode.

Primary target:

9:16

Suggested logical canvas:

360 × 640

The exact logical size may be adjusted if needed.

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

Do NOT implement:

* Phase 5 combat
* enemy combat AI
* damage
* companion
* treasure
* quests
* bosses
* multiple maps

Those belong to later phases.

---

# CURRENT NEXT PHASE

After Portrait Conversion is stable:

## Phase 5

Real-time sword combat

*

First enemy:

Mossling

Expected systems:

* sword swing
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

Portrait mobile conversion.

---

# HANDOFF STATUS

Current owner:

AI-assisted development workflow

Current task:

Portrait Conversion v0.1.1

Next owner:

Claude Code / Gemini CLI / ChatGPT depending on task

Before beginning new work:

Read:

* GAME_DESIGN.md
* AI_HANDOFF.md
