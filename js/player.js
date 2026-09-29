/* ==========================================================================
   player.js — 플레이어(LUKA) 이동 / 방향 / 걷기 애니메이션 / 검 공격
   PHASE 2 범위:
     - 부드러운 8방향 이동 (input.js 의 정규화된 axis 사용)
     - 4방향 facing (상/하/좌/우) — 공격 방향의 기준이 된다
     - 절차적으로 그린 원본 캐릭터 (이끼/덩굴 숲 탐험가, 둥근 여행 가방)
   PHASE 5 범위:
     - 공격 상태(attacking/attackFacing/attackT/cooldownT)를 들고,
       진행/판정은 combat.js 에 위임한다 (state 는 여기, 로직은 combat.js)
     - 공격 중에는 이동은 가능하지만 느려지고, facing 전환은 멈춘다
       (스윙 도중 캐릭터가 다른 방향을 보지 않도록)
     - 몸통 렌더링 위에 검 스윙 오버레이를 덧그린다
   체력(PHASE 7), 상호작용(PHASE 9)은 아직 다루지 않는다.
   ========================================================================== */
(function (global) {
  'use strict';

  var MG = global.MG = global.MG || {};

  var SPEED = 84;          // 내부 픽셀/초
  var FOOT_W = 11;         // 충돌 상자 (발치) — 캐릭터 전체가 아니라 발만 막는다
  var FOOT_H = 6;
  var STEP_FREQ = 9;        // 걷기 사이클 속도
  var IDLE_FREQ = 1.6;      // 정지 시 미세한 흔들림 속도

  // PHASE 6.2: 모슬링 돌진이 플레이어에게 닿았을 때의 피드백 (체력/데미지 없음 —
  // "적이 나에게 닿았다"만 전달하는 연출용 수치).
  var CONTACT_FLASH_DURATION = 0.08;   // 초 (권장 0.06~0.10)
  var CONTACT_KNOCKBACK_DIST = 5;      // 세계 픽셀 (권장 4~6)
  var CONTACT_HITSTOP = 0.04;          // 초 (권장 0.03~0.05)

  // PHASE 7: 체력 / 생존. 데미지는 접촉당 고정 1, 방어/속성/치명타 없음 — 단순하게 유지.
  var MAX_HP = 5;
  var INVULN_DURATION = 1.2;   // 초 — 피격 후 무적 시간 (조작은 전혀 막지 않는다)
  var BLINK_INTERVAL = 0.1;    // 초 — 무적 중 깜빡임 주기
  var BLINK_ALPHA_LOW = 0.2;
  var DEATH_DURATION = 1.5;    // 초 — 사망 연출 지속시간(페이드 + 붕괴)
  var DEATH_SHRINK = 0.3;      // 사망 진행도 100%일 때 가로 축소 비율
  var DEATH_COLLAPSE = 0.65;   // 사망 진행도 100%일 때 세로 압축 비율

  // PHASE 7 SOFT ATTACK ASSIST: 검이 실제로 맞춘 순간에만 그 방향으로 facing 을
  // 보정한다. 조준 보조/락온이 아니라 "방금 맞춘 적을 자연스럽게 바라본다"는
  // 시각적 마무리일 뿐이다 — 공격을 시작하거나 빗나갔을 때는 절대 개입하지
  // 않는다. MOBILE COMBAT FEEL TUNING: "0.18초도 거의 안 느껴진다"는 실기기
  // 피드백을 받아 0.18 → 0.24초로 다시 늘렸다(상한 0.25초 이내). 여전히
  // 순수하게 "얼마나 오래 붙잡고 있는가"만의 문제다 — 대상 선정 규칙/판정/
  // 스윙 자체는 이전 패스와 완전히 동일하다. applyAttackAssist() 는 호출될
  // 때마다 무조건 새로 방향+타이머를 덮어쓰므로(아래 참고), 이 유지시간 안에
  // 다시 명중하면 이전 보정이 새 보정을 막지 않고 즉시 갱신된다.
  var ATTACK_ASSIST_HOLD = 0.24;   // 초 — 명중 직후 보정된 facing 을 유지하는 시간 (0.18 → 0.24)
  var DEBUG_ATTACK_ASSIST = false; // true 로 바꾸면 선택된 대상/보정 방향/타이머를 표시

  // STEP 9-2b: 스프라이트 시트 렌더링. 이미지가 아직 로드되지 않았거나 실패하면
  // 기존 절차적 렌더링(drawFront/drawBack/drawSide)을 그대로 fallback 으로 쓴다.
  // base64 로 인라인하는 이유: 파일 경로(dist/, Claude Artifact 등 여러 배포
  // 형태)마다 상대경로가 달라지는 문제 없이, build.sh 번들에도 그대로 실려
  // 어디서든 같은 방식으로 로드된다.
  var SPRITE_COLS = 4;
  var SPRITE_FRAME_W = 32;
  var SPRITE_FRAME_H = 32;
  var SPRITE_FOOT_ROW = 30;   // 스프라이트 안에서 발이 닿는 픽셀 행(0-index, 31행은 투명 여백)

  var SPRITE_FRAME_INDEX = {
    down:  { false: 0, true: 1 },
    up:    { false: 2, true: 3 },
    left:  { false: 4, true: 5 },
    right: { false: 6, true: 7 }
  };

  var spriteImage = new Image();
  var spriteCanvas = null;   // 검을 지운 시트 — 준비되면 drawSprite() 가 이걸 대신 그린다
  // STEP 4-3b: 위 시트에서 검의 "빈 윤곽선"까지 마저 지운 시트. 다이너에서만 쓴다.
  var spriteCanvasNoSword = null;
  var spriteReady = false;
  spriteImage.onload = function () {
    try {
      spriteCanvas = stripBakedSword(spriteImage);
    } catch (e) {
      spriteCanvas = null;   // 실패해도 원본 이미지(검 포함)로라도 그린다 — 캐릭터가 안 보이는 것보다는 낫다
    }
    try {
      if (spriteCanvas) spriteCanvasNoSword = stripSwordOutline(spriteCanvas);
    } catch (e2) {
      spriteCanvasNoSword = null;   // 실패하면 다이너에서도 spriteCanvas 로 그린다
    }
    spriteReady = true;
  };
  spriteImage.onerror = function () { spriteReady = false; };
  spriteImage.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAABACAYAAADS1n9/AAAAAXNSR0IArs4c6QAAA/1JREFUeJztnb1uGkEQxwfkwj0Sgo7CnSVw5yJKl8hSmiRVqBxXKdMgqHmAVHmAFKlwk48mEko6ROMOS06Vgu4iJJ7hXMCS43K3N7s3uwO386swLPuf3Zvbmxtu1gCCIIRLDduw2ejEJh2v1kt036LPp39i0ulZC9fuz1+TXkWfU79ubY1QCcQBAsfoEvDl0xjVrvsC184Ubv0qYuQAVCQDGupgyae+utZir82HqG91CUifYTZn3HQ+g+l8ZiPPrq84a5lP/qHpWznA/Y+x9m/XcOtXCe9BYLPRiZXnXz156lte9FP6RjEAd3DFre/q/p5THxWAmGahFOkAJ+19ugDIVpNKn8KWYxh/7gqQNqDd7xmJR5NF6WhXaUaThXf9UMavjQHa/Z6xcN73bc++MpTVD2H8kgkMHKeJoGiy2L327f2ij9N36gDPXr5y2b3oE+g7dYCL0zsAAHj+/hbAs/eLPk4f7QDn9w9G4pFR62ym168BAKA7WbDoJ6nq+LUOkDTAhuu37zbf9+z5VPohjB+9Ajx0z83Uf9tNmmK1XtZalzcA21sY3/ppqjr+XAdIG2CmvqF1eePd66n0Qxm/11SoLaLvTl8SQYGDjgGyHjzQPZFC+csVpv+sNqu1HxuOefyyAgSOOEDgiAMEjjhA4KCDQF1Q4/pRKUz/nDaEMH5BEAShchSmCjFpSJe/dHHr6+C2jUIfFQTqyo98BB/c+jq4bSurL7eBgSMOEDioS4CuLt9HuRa3vg5u28rqywoQOGgH4D7TuPVN4LbVRB+dCnZZg4+pYTumPQC4bdXpp+f6JOtN9ybuG8RZL+8b7u1xYL9KKK4VFS36SHZk2WDyHNwxJYIoi0RN5yhLu75aL2vqzJvOZ7tOm41OjBWgqGUv0x+1PqVmch65Dr6ufWYMkNVYVyYdWRZOKLZOGKuNi5RDYuvjy+rbYmKTCyct0k/OH+QUiNbh3wHYawQE9fGhk54/jgrhIg4mD5DlhNFkwXZ2V4Hk/BWWh2ctw5yTnyxt/vX9G5sdZeDeH6BUeTjHAUg64XA0gJ8f32z0vajTw70/AKY8fO8SkFyGh6MBXJze7ToRzFHzNxwNAA7s2q8g2R+AshZfrQKQyGh9uB170zeB26Yi/WR5OOTkS/5zgLwDIJiDOQDc0OwPQFyLryYKXR9PrI+F26YifUx5eKYDqLTh1eevABabJFLQbHTiY85BtPs9UPMHDGd/u9+DNvRi2N6N5OmTbVV6LP8kiQpu+6j0DyYRJPCgjQHy6tLT77t4+rWoJj79OeVeAFiy5sH1XgE67bzPQDM/sgIEjjhA4IgDBI44QOBog8C84MVHyVORBndJWJ4Nvuzi3K9AqBCPGBETB77xlgsAAAAASUVORK5CYII=';

  // STEP 9-2c: 스프라이트에 원래 그려져 있던 검(허리에 찬 칼)을 지운다.
  // 공격 중엔 drawAttackSwing() 이 유일한 검이어야 하므로, idle/walk 스프라이트에
  // 남아있는 baked-in 검이 겹쳐 보이면 "칼을 두 자루 든 것"처럼 보였다.
  //
  // 실제 시트(player-spritesheet.png)를 8프레임 전부 픽셀 단위로 조사한 결과,
  // 검(날 + 자루)에만 쓰이는 색 3개(#cfd8e3 날, #5a6270 날 그림자, #8a6a3a 손잡이)를
  // 확인했다 — 이 3색은 8프레임 어디에서도 몸(피부/머리/튜닉/그림자)에는 쓰이지
  // 않는다. 이 색만 지우면 검 테두리(윤곽선 색 #161320)만 빈 껍데기로 남으므로,
  // "몸의 실제 채색과 맞닿지 않은 윤곽선 픽셀"까지 함께 지운다 — 몸의 윤곽선은
  // 반드시 몸 채색과 맞닿아 있으므로 이 조건으로는 절대 잘못 지워지지 않는다
  // (PowerShell로 8프레임 전부 시뮬레이션해 몸 실루엣이 그대로 남는 것을 먼저
  // 확인했다). 원본 애니메이션 파일(.aseprite)은 건드리지 않는다 — 로드된
  // PNG를 한 번(로드 시) 복사해 이 처리를 적용한 별도 캔버스에만 반영한다.
  var SPRITE_OUTLINE_COLOR = '161320';
  var SPRITE_SWORD_COLORS = { 'cfd8e3': true, '5a6270': true, '8a6a3a': true };
  var SPRITE_BODY_FILL_COLORS = { '3a2b20': true, 'e8c9a0': true, '2f6b4f': true, '5a3d24': true };

  function hex2(n) {
    var s = n.toString(16);
    return s.length < 2 ? '0' + s : s;
  }

  /* 프레임 하나(w x h, 시트 안 절대좌표 ox,oy)에서 검 색상과, 몸에 닿지 않은
     검 전용 윤곽선을 찾아 알파를 0으로 만든다. 프레임 경계 밖은 절대 보지
     않는다(옆 프레임과 잘못 이어붙지 않도록). */
  function cleanFrameSword(cctx, ox, oy, w, h) {
    var imgData = cctx.getImageData(ox, oy, w, h);
    var data = imgData.data;

    function colorAt(x, y) {
      var i = (y * w + x) * 4;
      if (data[i + 3] === 0) return null;
      return hex2(data[i]) + hex2(data[i + 1]) + hex2(data[i + 2]);
    }

    var remove = new Uint8Array(w * h);
    var x, y, dx, dy;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        var c0 = colorAt(x, y);
        if (c0 && SPRITE_SWORD_COLORS[c0]) remove[y * w + x] = 1;
      }
    }

    var changed = true;
    while (changed) {
      changed = false;
      for (y = 0; y < h; y++) {
        for (x = 0; x < w; x++) {
          var idx = y * w + x;
          if (remove[idx]) continue;
          if (colorAt(x, y) !== SPRITE_OUTLINE_COLOR) continue;

          var touchesBody = false;
          for (dy = -1; dy <= 1 && !touchesBody; dy++) {
            for (dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              var nx = x + dx, ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
              var nc = colorAt(nx, ny);
              if (nc && SPRITE_BODY_FILL_COLORS[nc]) { touchesBody = true; break; }
              if (nc === SPRITE_OUTLINE_COLOR && !remove[ny * w + nx]) { touchesBody = true; break; }
            }
          }
          if (!touchesBody) { remove[idx] = 1; changed = true; }
        }
      }
    }

    for (var p = 0; p < w * h; p++) {
      if (remove[p]) data[p * 4 + 3] = 0;
    }
    cctx.putImageData(imgData, ox, oy);
  }

  function stripBakedSword(img) {
    var canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    var cctx = canvas.getContext('2d');
    cctx.drawImage(img, 0, 0);

    var cols = Math.floor(canvas.width / SPRITE_FRAME_W);
    var rows = Math.floor(canvas.height / SPRITE_FRAME_H);
    for (var fr = 0; fr < rows; fr++) {
      for (var fc = 0; fc < cols; fc++) {
        cleanFrameSword(cctx, fc * SPRITE_FRAME_W, fr * SPRITE_FRAME_H, SPRITE_FRAME_W, SPRITE_FRAME_H);
      }
    }
    return canvas;
  }

  /* STEP 4-3b: 위의 stripBakedSword 는 칼날/손잡이의 "채움"만 지웠고, 칼을
     둘러싼 윤곽선(#161320)은 남겼다 — 화면에서는 몸 오른쪽에 속이 빈 칼 모양이
     그대로 보였다(다이너에서 "칼이 아직 보인다"의 정체). 안전지대에서는 그
     윤곽선 잔재도 없어야 하므로, 몸의 실제 채색(피부/머리/튜닉/그림자)과 8방향으로
     한 칸도 맞닿지 않은 윤곽선 픽셀을 모두 지운 두 번째 시트를 만든다.
     몸의 윤곽선은 항상 몸 채색과 맞닿아 있으므로 지워지지 않는다(손 옆의
     윤곽선도 손 채색과 맞닿아 남는다). 연쇄 제거가 아니라 픽셀마다 독립적인
     판정이라 결과가 순서에 의존하지 않는다. 숲(바깥)은 기존 시트를 그대로
     써서 겉모습이 전혀 바뀌지 않는다. */
  function cleanFrameOutline(cctx, ox, oy, w, h) {
    var imgData = cctx.getImageData(ox, oy, w, h);
    var data = imgData.data;

    function colorAt(x, y) {
      var i = (y * w + x) * 4;
      if (data[i + 3] === 0) return null;
      return hex2(data[i]) + hex2(data[i + 1]) + hex2(data[i + 2]);
    }

    // 몸의 좌우 범위(채색이 있는 가장 왼쪽/오른쪽 열). 칼은 항상 몸 옆으로 튀어나와
    // 있으므로, 이 범위 "밖"에 있는 윤곽선만 후보로 삼는다 — 걷기 프레임에서 두 다리
    // 사이의 어두운 틈(자기 윤곽선 없이 4칸 폭으로 이어진 #161320)처럼 범위 "안"에
    // 있는 픽셀은 채색과 맞닿지 않아도 몸의 일부라 지우면 안 된다.
    // 범위는 프레임 전체가 아니라 그 줄 위아래 3줄 안에서만 잰다: 걷기 자세에서는
    // 앞다리 장화가 한 칸 더 넓어 프레임 전체 범위를 쓰면 손 옆의 칼 윤곽선이
    // "몸 안"으로 잘못 분류됐다.
    var rowMin = [], rowMax = [];
    var x, y, dx, dy;
    for (y = 0; y < h; y++) {
      var mn = w, mx = -1;
      for (x = 0; x < w; x++) {
        var fc0 = colorAt(x, y);
        if (fc0 && SPRITE_BODY_FILL_COLORS[fc0]) {
          if (x < mn) mn = x;
          if (x > mx) mx = x;
        }
      }
      rowMin.push(mn);
      rowMax.push(mx);
    }

    var drop = [];
    for (y = 0; y < h; y++) {
      var winMin = w, winMax = -1;
      for (var wy = Math.max(0, y - 3); wy <= Math.min(h - 1, y + 3); wy++) {
        if (rowMin[wy] < winMin) winMin = rowMin[wy];
        if (rowMax[wy] > winMax) winMax = rowMax[wy];
      }
      for (x = 0; x < w; x++) {
        if (colorAt(x, y) !== SPRITE_OUTLINE_COLOR) continue;
        if (x >= winMin - 1 && x <= winMax + 1) continue;   // 몸의 좌우 범위 안 — 건드리지 않는다
        var touchesFill = false;
        for (dy = -1; dy <= 1 && !touchesFill; dy++) {
          for (dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            var nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            var nc = colorAt(nx, ny);
            if (nc && SPRITE_BODY_FILL_COLORS[nc]) { touchesFill = true; break; }
          }
        }
        if (!touchesFill) drop.push((y * w + x) * 4 + 3);
      }
    }
    for (var k = 0; k < drop.length; k++) data[drop[k]] = 0;
    cctx.putImageData(imgData, ox, oy);
  }

  function stripSwordOutline(src) {
    var canvas = document.createElement('canvas');
    canvas.width = src.width;
    canvas.height = src.height;
    var cctx = canvas.getContext('2d');
    cctx.drawImage(src, 0, 0);

    var cols = Math.floor(canvas.width / SPRITE_FRAME_W);
    var rows = Math.floor(canvas.height / SPRITE_FRAME_H);
    for (var fr = 0; fr < rows; fr++) {
      for (var fc = 0; fc < cols; fc++) {
        cleanFrameOutline(cctx, fc * SPRITE_FRAME_W, fr * SPRITE_FRAME_H, SPRITE_FRAME_W, SPRITE_FRAME_H);
      }
    }
    return canvas;
  }

  // LUKA 고유 팔레트 — 기존 판타지 캐릭터와 겹치지 않는 배색
  var C = {
    skin:        '#e8b98a',
    hair:        '#3b2a20',
    hairShade:   '#241a14',
    tunic:       '#2e6b6e',   // 청록 (링의 초록 튜닉과 구분되는 색)
    tunicShade:  '#1c4547',
    cape:        '#9a3f3f',   // 따뜻한 다갈색 망토
    capeShade:   '#712d2d',
    satchel:     '#b98a52',   // 둥근 여행 가방
    satchelShade:'#8a6236',
    sword:       '#dbe2e8',
    swordShade:  '#8f98a3',
    hilt:        '#5b3a22',
    outline:     'rgba(10, 8, 6, 0.55)'
  };

  function rect(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
  }

  var Player = {
    x: 0, y: 0,             // 발 중심 좌표 (내부 해상도 기준)
    facing: 'down',         // 'up' | 'down' | 'left' | 'right'
    moving: false,
    animT: 0,

    // PHASE 5: 공격 상태. 진행/판정은 combat.js 가 담당하고 여기서는 값만 들고 있는다.
    attacking: false,
    attackFacing: 'down',   // 공격이 시작된 순간의 facing 에 고정
    attackT: 0,             // 현재 스윙 경과 시간(초)
    cooldownT: 0,           // 다음 공격까지 남은 대기 시간(초)
    attackId: 0,            // PHASE 6: 스윙마다 1씩 증가 — 모슬링의 중복 피격 방지용 식별자

    hitFlashT: 0,            // PHASE 6.2: 모슬링 돌진에 닿았을 때의 짧은 플래시 (체력 아님)

    // PHASE 7: 체력 / 생존 상태
    hp: MAX_HP,
    maxHp: MAX_HP,
    invulnT: 0,             // 남은 무적 시간(초) — 0 초과면 추가 피해를 받지 않는다
    state: 'ALIVE',         // 'ALIVE' | 'DEAD'
    deathT: 0,              // 사망 연출 남은 시간(초)

    // PHASE 7 SOFT ATTACK ASSIST: 명중 직후에만 잠깐 쓰는 최소 상태.
    attackAssistFacing: null,  // 마지막으로 보정된 방향(디버그/참고용, 렌더에는 facing 을 그대로 쓴다)
    attackAssistT: 0,          // 남은 보정 유지 시간(초)

    FOOT_W: FOOT_W,
    FOOT_H: FOOT_H,

    init: function () {
      var spawn = (MG.Map && MG.Map.spawn) || { x: 200, y: 706 };
      this.x = spawn.x;
      this.y = spawn.y;
      this.facing = 'down';
      this.moving = false;
      this.animT = 0;
      this.attacking = false;
      this.attackFacing = 'down';
      this.attackT = 0;
      this.cooldownT = 0;
      this.attackId = 0;
      this.hitFlashT = 0;

      this.hp = MAX_HP;
      this.maxHp = MAX_HP;
      this.invulnT = 0;
      this.state = 'ALIVE';
      this.deathT = 0;

      this.attackAssistFacing = null;
      this.attackAssistT = 0;
    },

    /* 전투용 허트박스 — enemy.js 의 getHurtbox() 와 같은 개념(발치 이동 충돌과는
       별개). 모슬링의 돌진이 "몸에 닿았는지" 판정할 때 사용한다. */
    getHurtbox: function () {
      return { x: this.x - 6, y: this.y - 16, w: 12, h: 16 };
    },

    /* PHASE 7 SOFT ATTACK ASSIST: 검이 실제로 모슬링을 맞춘 프레임에만
       enemy.js 가 호출한다(맞은 대상 중 가장 가까운 것 하나만, 이미 걸러서 넘어옴).
       기존 4방향 규칙 그대로 지배축을 골라 facing 을 그 즉시 그 방향으로
       맞추고, 잠깐 유지한다. 스윙 자체(진행도/지속시간/판정)는 전혀 건드리지
       않는다 — attacking 이 true 인 동안은 어차피 update() 가 facing 을
       움직임으로 갱신하지 않으므로, 스윙 중엔 그저 "고정된 값이 바뀔 뿐"이고
       스윙이 끝난 뒤에야 이 보정이 실제로 눈에 보인다. */
    applyAttackAssist: function (targetX, targetY) {
      if (this.state === 'DEAD') return;

      var dx = targetX - this.x, dy = targetY - this.y;
      var dir;
      if (Math.abs(dx) > Math.abs(dy)) dir = dx > 0 ? 'right' : 'left';
      else dir = dy > 0 ? 'down' : 'up';

      this.facing = dir;
      this.attackAssistFacing = dir;
      this.attackAssistT = ATTACK_ASSIST_HOLD;
    },

    /* PHASE 6.2: 모슬링 돌진이 닿았을 때 enemy.js 가 호출한다.
       체력/데미지는 없다 — "적이 닿았다" 를 알리는 순수 연출: 살짝 밀려나고,
       짧게 붉게 번쩍이고, 아주 잠깐 히트스탑이 걸리고, 소리가 난다.
       조이스틱/공격 입력은 이 흐름에서 전혀 건드리지 않으므로 즉시 조작 가능하다. */
    onContactHit: function (fromX, fromY) {
      // PHASE 7: 무적 중이거나 이미 사망했으면 아무 효과도 없다 — 같은 프레임에
      // 모슬링 여러 마리가 동시에 닿아도, 아래에서 invulnT 를 세우는 순간 이후로는
      // (같은 프레임 안에서도) 더 이상 HP 가 깎이지 않는다.
      if (this.invulnT > 0 || this.state === 'DEAD') return;

      var dx = this.x - fromX, dy = this.y - fromY;
      var dist = Math.sqrt(dx * dx + dy * dy) || 1;
      var nx = dx / dist, ny = dy / dist;

      var solids = (MG.Map && MG.Map.solids) || [];
      if (MG.Collision && solids.length) {
        var res = MG.Collision.moveAndCollide(
          this.x, this.y, FOOT_W, FOOT_H,
          nx * CONTACT_KNOCKBACK_DIST, ny * CONTACT_KNOCKBACK_DIST, solids
        );
        this.x = res.x;
        this.y = res.y;
      } else {
        this.x += nx * CONTACT_KNOCKBACK_DIST;
        this.y += ny * CONTACT_KNOCKBACK_DIST;
      }

      // PHASE 6.2 연출은 그대로 유지 — 여기 이후로 체력 로직을 "얹는다"
      this.hitFlashT = CONTACT_FLASH_DURATION;
      if (MG.Game && MG.Game.hitStop) MG.Game.hitStop(CONTACT_HITSTOP);
      if (MG.Audio && MG.Audio.playPlayerContact) MG.Audio.playPlayerContact();

      // PHASE 7: 실제 체력 피해
      this.hp = Math.max(0, this.hp - 1);
      this.invulnT = INVULN_DURATION;
      if (MG.UI && MG.UI.renderHearts) MG.UI.renderHearts(this.hp, this.maxHp);

      if (this.hp <= 0) this.die();
    },

    /* PHASE 7: HP 가 0 이 되는 순간 호출된다. 게임 오버 메뉴 없이, 짧은 사망
       연출만 재생하고 자동으로 리스폰한다(update() 의 DEAD 분기 참고). */
    die: function () {
      this.state = 'DEAD';
      this.hp = 0;
      this.attacking = false;
      this.moving = false;
      this.deathT = DEATH_DURATION;

      // PHASE 7 SOFT ATTACK ASSIST: 사망 중엔 보정이 무의미하므로 즉시 지운다.
      this.attackAssistFacing = null;
      this.attackAssistT = 0;
    },

    /* PHASE 7: 사망 연출이 끝난 뒤 호출된다. 기존 맵 스폰 지점을 그대로 쓰고,
       모슬링도 기존 init() 으로 초기 상태로 되돌린다(새 세이브 시스템 없음). */
    respawn: function () {
      var spawn = (MG.Map && MG.Map.spawn) || { x: 200, y: 706 };
      this.x = spawn.x;
      this.y = spawn.y;
      this.facing = 'down';
      this.attackFacing = 'down';
      this.moving = false;
      this.animT = 0;
      this.attacking = false;
      this.attackT = 0;
      this.cooldownT = 0;
      this.hitFlashT = 0;

      this.hp = this.maxHp;
      this.invulnT = INVULN_DURATION;   // 부활 직후 잠깐의 안전 시간
      this.state = 'ALIVE';
      this.deathT = 0;

      // PHASE 7 SOFT ATTACK ASSIST: 부활 후엔 이전 목숨의 보정 상태가 남아있으면 안 된다.
      this.attackAssistFacing = null;
      this.attackAssistT = 0;

      if (MG.UI && MG.UI.renderHearts) MG.UI.renderHearts(this.hp, this.maxHp);
      if (MG.Enemy && MG.Enemy.init) MG.Enemy.init();
    },

    update: function (dt) {
      this.animT += dt;
      this.hitFlashT = Math.max(0, this.hitFlashT - dt);

      // PHASE 7: 사망 중엔 이동/공격 입력을 완전히 무시하고 사망 연출만 진행한다.
      // 전역 루프는 계속 돌아간다 — 여기서만 조기 반환할 뿐 게임 자체는 멈추지 않는다.
      if (this.state === 'DEAD') {
        this.deathT -= dt;
        if (this.deathT <= 0) this.respawn();
        return;
      }

      if (this.invulnT > 0) this.invulnT = Math.max(0, this.invulnT - dt);

      // PHASE 7 SOFT ATTACK ASSIST: 보정 유지 타이머는 스윙이 끝난 뒤에만
      // 줄어든다 — 스윙 중엔 어차피 facing 이 갱신되지 않으므로(아래 참고),
      // "명중 이후" 구간에서만 실제로 유지 시간이 소모되게 하기 위함이다.
      if (!this.attacking && this.attackAssistT > 0) {
        this.attackAssistT = Math.max(0, this.attackAssistT - dt);
        if (this.attackAssistT <= 0) this.attackAssistFacing = null;
      }

      var canMove = MG.Game && MG.Game.state === 'PLAY';

      // 공격 타이머 진행 (시작 여부와 무관하게 매 프레임 돌아간다)
      if (MG.Combat && MG.Combat.advance) MG.Combat.advance(this, dt);

      // 공격 입력: PLAY 상태에서만, 그리고 스팸 방지(공격 중/쿨다운 중엔 무시)
      if (canMove && MG.Input && MG.Input.attackPressed &&
          MG.Combat && MG.Combat.canAttack && MG.Combat.canAttack(this)) {
        // PHASE 7 SOFT ATTACK ASSIST: 새 스윙이 시작되면 이전 스윙에서 남은
        // 보정 상태를 지운다 — 낡은 타겟 방향이 새 공격에 스며들지 않게 한다.
        this.attackAssistFacing = null;
        this.attackAssistT = 0;

        // PRE-ATTACK TARGETING (v0.1.6 모바일 전투 폴리시): startAttack() 이
        // 곧바로 이 순간의 facing 을 attackFacing 으로 고정하므로, 반드시
        // startAttack() 보다 먼저 실행해야 한다. 근처에 적당한 대상이 없으면
        // preTarget 은 null 이고, 기존처럼 현재 facing 그대로 공격한다.
        if (MG.Enemy && MG.Enemy.findPreAttackTarget) {
          var preTarget = MG.Enemy.findPreAttackTarget(this.x, this.y, this.facing);
          if (preTarget) this.facing = preTarget.direction;
        }

        MG.Combat.startAttack(this);
      }

      var axis = (MG.Input && MG.Input.axis) || { x: 0, y: 0 };
      var ax = canMove ? axis.x : 0;
      var ay = canMove ? axis.y : 0;

      this.moving = (ax !== 0 || ay !== 0);

      if (this.moving) {
        // 공격 중에는 완전히 멈추지 않되 느려진다 (모바일에서도 계속 조작 가능해야 한다)
        var speedMul = (this.attacking && MG.Combat) ? MG.Combat.MOVE_MULTIPLIER : 1;

        // 대각선 이동이 더 빠르지 않도록 input.js 에서 이미 정규화되어 있다
        var dx = ax * SPEED * speedMul * dt;
        var dy = ay * SPEED * speedMul * dt;

        var solids = (MG.Map && MG.Map.solids) || [];
        if (MG.Collision && solids.length) {
          var res = MG.Collision.moveAndCollide(this.x, this.y, FOOT_W, FOOT_H, dx, dy, solids);
          this.x = res.x;
          this.y = res.y;
        } else {
          this.x += dx;
          this.y += dy;
        }

        // 공격 중에는 facing 을 고정한다 — 스윙 도중 캐릭터가 방향을 바꾸면
        // "이 스윙은 끝까지 한 방향" 이라는 규칙이 시각적으로 깨진다.
        // PHASE 7 SOFT ATTACK ASSIST: attackAssistT 가 남아있는 동안도 마찬가지로
        // 잠깐 facing 갱신을 건너뛴다 — 그래도 이동 자체(ax/ay 기반 위치 이동)는
        // 위에서 이미 정상적으로 처리됐으므로 움직임은 전혀 막히지 않는다.
        if (!this.attacking && this.attackAssistT <= 0) {
          if (Math.abs(ax) > Math.abs(ay)) {
            this.facing = ax > 0 ? 'right' : 'left';
          } else {
            this.facing = ay > 0 ? 'down' : 'up';
          }
        }
      }
    },

    /* ---------------------------------------------------------- render */
    render: function (ctx) {
      var cx = this.x;
      var feetY = this.y;

      // PHASE 7: 사망 중엔 완전히 다른(단순한) 연출 경로를 탄다 — 걷기/공격
      // 애니메이션과 무관하게 그 자리에서 페이드+붕괴만 보여준다.
      if (this.state === 'DEAD') {
        this.renderDeath(ctx, cx, feetY);
        return;
      }

      var stepPhase = Math.sin(this.animT * STEP_FREQ);
      var bob, stepOffset;

      if (this.moving) {
        bob = Math.abs(stepPhase) * 1.4;
        stepOffset = stepPhase * 2.2;
      } else {
        bob = Math.sin(this.animT * IDLE_FREQ) * 0.4;
        stepOffset = 0;
      }

      // 부드러운 그림자 (지면에 고정, 발 위치 기준)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
      ctx.beginPath();
      ctx.ellipse(Math.round(cx), Math.round(feetY + 1), 5, 2, 0, 0, Math.PI * 2);
      ctx.fill();

      var topY = feetY - bob;

      // PHASE 7 SOFT ATTACK ASSIST — VISUAL RENDER FIX: 몸(포즈)과 검(스윙)은
      // 서로 다른 방향 값을 쓴다. 검은 반드시 스윙이 시작된 순간의 방향
      // (attackFacing) 그대로 끝까지 그려야 한다 — "스윙 궤적은 절대 바뀌지
      // 않는다"는 기존 규칙 그대로. 반면 몸(포즈)은 항상 facing 을 그대로
      // 따라간다 — 그래야 명중으로 facing 이 보정된 그 순간, 검이 원래
      // 방향으로 계속 휘두르는 동안에도 몸은 즉시 맞춘 대상 쪽으로 돌아서는
      // 모습이 눈에 보인다. (이전엔 attacking 중엔 둘 다 attackFacing 을
      // 같이 써서, 보정된 facing 이 스윙이 끝날 때까지 화면에 전혀 반영되지
      // 않았다.)
      var bodyFacing = this.facing;
      var swordFacing = this.attackFacing;

      // PHASE 7: 무적 중엔 몸(과 스윙)만 빠르게 깜빡인다 — 팔레트는 바꾸지 않고
      // 캔버스 알파만 주기적으로 낮춘다. 그림자/피격 플래시는 깜빡임과 무관하게
      // 항상 그대로 보인다(무적 여부를 알리는 신호는 몸 쪽에만 필요하다).
      var blinking = this.invulnT > 0;
      if (blinking) {
        var phase = Math.floor(this.animT / BLINK_INTERVAL) % 2 === 0;
        ctx.save();
        ctx.globalAlpha = phase ? 1.0 : BLINK_ALPHA_LOW;
      }

      // STEP 4-3b: 다이너는 칼이 없는 안전지대다 — 구역 하나가 유일한 기준이다.
      // 스윙 그리기와 절차적 폴백의 허리 칼(attacking 인자가 true 면 안 그린다)을
      // 여기서 함께 막는다. 스프라이트 쪽은 drawSprite() 가 같은 기준으로 시트를 고른다.
      var inDiner = !!(MG.Map && MG.Map.zone === 'diner');
      var swordHidden = this.attacking || inDiner;

      if (spriteReady) {
        // STEP 9-2b: 걷기 애니메이션은 이제 프레임 자체(IDLE/WALK)가 표현하므로
        // 절차적 경로의 bob(상하 흔들림)은 스프라이트에는 적용하지 않는다 —
        // 발 위치는 항상 feetY(this.y) 그대로다.
        this.drawSprite(ctx, cx, feetY);
      } else if (bodyFacing === 'down') this.drawFront(ctx, cx, topY, stepOffset, swordHidden);
      else if (bodyFacing === 'up') this.drawBack(ctx, cx, topY, stepOffset, swordHidden);
      else this.drawSide(ctx, cx, topY, stepOffset, bodyFacing === 'right', swordHidden);

      if (this.attacking && MG.Combat && !inDiner) {
        var progress = this.attackT / MG.Combat.ATTACK_DURATION;
        this.drawAttackSwing(ctx, cx, topY, swordFacing, progress);
      }

      if (blinking) ctx.restore();

      // PHASE 6.2: 모슬링 접촉 플래시 — 팔레트를 바꾸지 않는 옅은 오버레이라
      // 잠깐 번쩍이고 사라진다 (체력 시스템이 아니라 순수 연출)
      if (this.hitFlashT > 0) {
        var flashA = (this.hitFlashT / CONTACT_FLASH_DURATION) * 0.55;
        ctx.fillStyle = 'rgba(255, 80, 80, ' + flashA.toFixed(2) + ')';
        ctx.beginPath();
        ctx.ellipse(Math.round(cx), Math.round(topY - 11), 8, 12, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // PHASE 7 SOFT ATTACK ASSIST: 기본값 false — 켜면 보정 방향/남은 유지
      // 시간만 짧은 텍스트로 표시한다(디버그 전용, 평소엔 아무것도 그리지 않는다).
      if (DEBUG_ATTACK_ASSIST && this.attackAssistT > 0) {
        ctx.save();
        ctx.font = '6px monospace';
        ctx.fillStyle = '#ffd76a';
        ctx.fillText(
          'assist=' + this.attackAssistFacing + ' t=' + this.attackAssistT.toFixed(2),
          cx - 20, topY - 30
        );
        ctx.restore();
      }
    },

    /* STEP 9-2b: 스프라이트 시트에서 facing × moving 에 해당하는 32x32 프레임
       하나를 잘라 그대로(스케일 없이) 그린다. 시트의 30행이 시각적 발 위치이므로
       dy = feetY - SPRITE_FOOT_ROW 로 맞추면 기존 발 앵커(this.y)와 일치한다. */
    drawSprite: function (ctx, cx, feetY) {
      var entry = SPRITE_FRAME_INDEX[this.facing] || SPRITE_FRAME_INDEX.down;
      var idx = entry[this.moving] !== undefined ? entry[this.moving] : entry[false];
      var col = idx % SPRITE_COLS;
      var row = Math.floor(idx / SPRITE_COLS);
      var sx = col * SPRITE_FRAME_W;
      var sy = row * SPRITE_FRAME_H;
      var dx = Math.round(cx - SPRITE_FRAME_W / 2);
      var dy = Math.round(feetY - SPRITE_FOOT_ROW);
      // 다이너(안전지대)에서는 칼의 빈 윤곽선까지 지운 시트를 쓴다(STEP 4-3b).
      // 그 시트가 없으면(처리 실패 시) 기존 시트로, 그것도 없으면 원본이라도.
      var inDiner = !!(MG.Map && MG.Map.zone === 'diner');
      var source = (inDiner && spriteCanvasNoSword) || spriteCanvas || spriteImage;
      ctx.drawImage(source, sx, sy, SPRITE_FRAME_W, SPRITE_FRAME_H, dx, dy, SPRITE_FRAME_W, SPRITE_FRAME_H);
    },

    /* PHASE 7: 사망 연출 — 새 아트 없이 기존 drawFront/Back/Side 를 캔버스
       변환(스케일+알파)만으로 "가라앉듯 사라지는" 느낌으로 재사용한다.
       걷기/공격 애니메이션은 죽는 순간의 방향으로 완전히 멈춘다. */
    renderDeath: function (ctx, cx, feetY) {
      var p = 1 - Math.max(0, this.deathT) / DEATH_DURATION; // 0(방금 사망) -> 1(연출 끝)
      var alpha = Math.max(0, 1 - p);
      var shrinkX = 1 - DEATH_SHRINK * p;
      var collapseY = 1 - DEATH_COLLAPSE * p;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
      ctx.beginPath();
      ctx.ellipse(Math.round(cx), Math.round(feetY + 1), 5, 2, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(cx, feetY);
      ctx.scale(shrinkX, collapseY);
      ctx.translate(-cx, -feetY);

      var renderFacing = this.attackFacing || this.facing;
      if (renderFacing === 'down') this.drawFront(ctx, cx, feetY, 0, false);
      else if (renderFacing === 'up') this.drawBack(ctx, cx, feetY, 0, false);
      else this.drawSide(ctx, cx, feetY, 0, renderFacing === 'right', false);

      ctx.restore();
    },

    /* 정면(아래를 바라봄) */
    drawFront: function (ctx, cx, feetY, step, attacking) {

      // 망토 (몸통 뒤로 살짝 보임)
      rect(ctx, cx - 6, feetY - 15, 3, 9, C.capeShade);
      rect(ctx, cx + 3, feetY - 15, 3, 9, C.capeShade);

      // 다리 (걷기 사이클에 따라 번갈아 이동)
      rect(ctx, cx - 4, feetY - 5 - Math.max(0, step), 3, 5, C.tunicShade);
      rect(ctx, cx + 1, feetY - 5 + Math.max(0, -step), 3, 5, C.tunicShade);

      // 몸통(튜닉)
      rect(ctx, cx - 5, feetY - 14, 10, 10, C.tunic);
      rect(ctx, cx - 5, feetY - 6, 10, 2, C.tunicShade);

      // 여행 가방 (허리 오른쪽, 둥근 실루엣)
      ctx.fillStyle = C.satchel;
      ctx.beginPath();
      ctx.arc(Math.round(cx + 5), Math.round(feetY - 9), 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.satchelShade;
      ctx.fillRect(Math.round(cx + 4), Math.round(feetY - 8), 3, 1);

      // 검(허리에 소지, 공격 중이 아닐 때만 — 공격 중엔 drawAttackSwing 이 대신 그린다)
      if (!attacking) {
        rect(ctx, cx - 7, feetY - 10, 2, 6, C.swordShade);
        rect(ctx, cx - 8, feetY - 11, 3, 2, C.hilt);
      }

      // 팔
      rect(ctx, cx - 6, feetY - 13, 2, 6, C.tunic);
      rect(ctx, cx + 4, feetY - 13, 2, 6, C.tunic);

      // 머리
      ctx.fillStyle = C.skin;
      ctx.beginPath();
      ctx.arc(Math.round(cx), Math.round(feetY - 18), 4, 0, Math.PI * 2);
      ctx.fill();

      // 머리카락 (앞머리 + 옆 볼륨, 오리지널 헤어스타일)
      rect(ctx, cx - 4, feetY - 22, 8, 3, C.hair);
      rect(ctx, cx - 5, feetY - 20, 2, 4, C.hair);
      rect(ctx, cx + 3, feetY - 20, 2, 4, C.hair);

      // 눈
      rect(ctx, cx - 2, feetY - 18, 1, 1, C.outline);
      rect(ctx, cx + 1, feetY - 18, 1, 1, C.outline);
    },

    /* 뒷모습(위를 바라봄) */
    drawBack: function (ctx, cx, feetY, step, attacking) {
      // 다리
      rect(ctx, cx - 4, feetY - 5 - Math.max(0, step), 3, 5, C.tunicShade);
      rect(ctx, cx + 1, feetY - 5 + Math.max(0, -step), 3, 5, C.tunicShade);

      // 망토 (등 전체를 덮는 주 실루엣)
      rect(ctx, cx - 6, feetY - 16, 12, 11, C.cape);
      rect(ctx, cx - 6, feetY - 7, 12, 2, C.capeShade);

      // 팔
      rect(ctx, cx - 7, feetY - 13, 2, 6, C.tunicShade);
      rect(ctx, cx + 5, feetY - 13, 2, 6, C.tunicShade);

      // 검자루(같은 손 — 정면 idle 검의 반대쪽. 정면에서 오른손이 화면 왼쪽(cx-7)에
      // 보이므로, 몸을 반대로 돌린 뒷모습에서는 같은 오른손이 화면 오른쪽에 보인다.
      // 칼날은 망토에 가려지므로 손잡이만 살짝 내비친다. 공격 중엔 drawAttackSwing 이 대신 그린다)
      if (!attacking) {
        rect(ctx, cx + 6, feetY - 12, 3, 2, C.hilt);
      }

      // 머리 (뒤통수 + 머리카락 전체)
      ctx.fillStyle = C.skin;
      ctx.beginPath();
      ctx.arc(Math.round(cx), Math.round(feetY - 18), 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.hair;
      ctx.beginPath();
      ctx.arc(Math.round(cx), Math.round(feetY - 19), 4, 0, Math.PI * 2);
      ctx.fill();
      rect(ctx, cx - 4, feetY - 15, 8, 3, C.hairShade);
    },

    /* 옆모습 (facingRight=true 면 오른쪽, false 면 왼쪽으로 좌우 반전) */
    drawSide: function (ctx, cx, feetY, step, facingRight, attacking) {
      var dir = facingRight ? 1 : -1;

      // 망토 (진행 방향 반대쪽으로 흩날림)
      rect(ctx, cx - dir * 6, feetY - 16, 4, 10, C.capeShade);

      // 뒷다리 / 앞다리
      rect(ctx, cx - dir * 2 - 1, feetY - 5 - Math.max(0, step), 3, 5, C.tunicShade);
      rect(ctx, cx + dir * 1 - 1, feetY - 5 + Math.max(0, -step), 3, 5, C.tunicShade);

      // 몸통
      rect(ctx, cx - 4, feetY - 14, 8, 10, C.tunic);
      rect(ctx, cx - 4, feetY - 6, 8, 2, C.tunicShade);

      // 여행 가방 (등 쪽)
      ctx.fillStyle = C.satchel;
      ctx.beginPath();
      ctx.arc(Math.round(cx - dir * 4), Math.round(feetY - 10), 3, 0, Math.PI * 2);
      ctx.fill();

      // 앞팔
      rect(ctx, cx + dir * 3, feetY - 13, 2, 6, C.tunic);

      // 검(허리 소지, 공격 중이 아닐 때만)
      if (!attacking) {
        rect(ctx, cx + dir * 4, feetY - 10, 2, 5, C.swordShade);
        rect(ctx, cx + dir * 3, feetY - 11, 3, 2, C.hilt);
      }

      // 머리
      ctx.fillStyle = C.skin;
      ctx.beginPath();
      ctx.arc(Math.round(cx), Math.round(feetY - 18), 4, 0, Math.PI * 2);
      ctx.fill();

      // 앞머리 (진행 방향 쪽으로 쏠린 헤어스타일)
      rect(ctx, cx - 4, feetY - 22, 8, 3, C.hair);
      rect(ctx, cx + dir * 3, feetY - 21, 2, 4, C.hair);

      // 눈 (진행 방향 쪽에 1개만 — 옆얼굴)
      rect(ctx, cx + dir * 2, feetY - 18, 1, 1, C.outline);
    },

    /* PHASE 5 검 스윙 / PHASE 6.1 가독성 보강.
       정적인 칼이 아니라 호를 그리며 휘두르는 느낌을 주기 위해, 매 프레임
       현재 진행도(progress 0~1)에서의 칼날 각도와 잔상용 이전 각도 여러 개를
       옅게 겹쳐 그린다. 추가로 스윙이 "지금까지 쓸고 지나간 부채꼴"을 옅게
       채워, 칼날이 스쳐가는 순간의 궤적뿐 아니라 "대략 이만큼 닿는다"는
       사거리 자체가 눈에 남도록 한다 (PHASE 6.1: 사거리 가독성 피드백 —
       DEBUG_COMBAT 의 사각형 판정 표시와는 다른, 항상 켜져 있는 연출용 효과).
       dir 은 combat.js 의 히트박스 방향과 같은 값을 쓴다 (up/down/left/right). */
    drawAttackSwing: function (ctx, cx, feetY, dir, progress) {
      var t = progress < 0 ? 0 : (progress > 1 ? 1 : progress);

      // 방향별 기준각(캔버스 기준: 0=오른쪽, +=시계방향) + 칼을 쥔 손 근처 피벗.
      // 항상 "같은 손"(정면 idle 기준 화면 왼쪽 = LUKA 의 오른손)에서 칼이 나가야
      // 공격이 시작될 때 손이 바뀐 것처럼 보이지 않는다. down 은 drawFront 의 idle
      // 검(cx-7 부근)과, up 은 drawBack 의 idle 손잡이(cx+6 부근, 몸이 반대로 돌아
      // 있으므로 반대쪽)와 같은 쪽으로 맞춘다. left/right 는 drawSide 의 "전방 팔"
      // 관례를 그대로 따르므로(이미 같은 쪽) 여기서 바꾸지 않는다.
      var baseAngle, pivotX, pivotY;
      if (dir === 'right') { baseAngle = 0;              pivotX = cx + 5;  pivotY = feetY - 10; }
      else if (dir === 'left') { baseAngle = Math.PI;    pivotX = cx - 5;  pivotY = feetY - 10; }
      else if (dir === 'down') { baseAngle = Math.PI / 2; pivotX = cx - 5; pivotY = feetY - 10; }
      else /* up */             { baseAngle = -Math.PI / 2; pivotX = cx + 5; pivotY = feetY - 12; }

      var sweep = (100 * Math.PI) / 180;   // 전체로 휘두르는 각도(호)
      var startAngle = baseAngle - sweep / 2;
      var reach = 15;   // PHASE 7 COMBAT POLISH: combat.js 의 REACH 와 시각적으로 맞춘 사거리 (14 → 15px)
      var px = Math.round(pivotX), py = Math.round(pivotY);

      // 사거리 가늠용 부채꼴 — 지금까지 스윙이 쓸고 지나간 만큼만 채워서
      // "칼이 도달하는 범위" 를 그 자체로 보여준다. PHASE 6.2: "그래도 사거리를
      // 알기 어렵다" 피드백을 받아 두 가지를 더했다 — (1) 가운데보다 바깥쪽
      // (=사거리 경계)이 더 밝은 그라데이션으로 바꿔 "여기까지 닿는다"는 경계
      // 자체가 눈에 띄게 했고, (2) 그 경계를 따라 또렷한 호 선을 하나 그었다.
      // 사각형이 아니라 칼의 궤적을 따르는 곡선이라 디버그 히트박스처럼 보이지 않는다.
      ctx.save();
      ctx.translate(px, py);

      var grad = ctx.createRadialGradient(0, 0, 0, 0, 0, reach);
      grad.addColorStop(0, 'rgba(230, 245, 255, 0.05)');
      grad.addColorStop(0.65, 'rgba(230, 245, 255, 0.10)');
      grad.addColorStop(1, 'rgba(235, 248, 255, 0.30)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, reach, startAngle, startAngle + sweep * t);
      ctx.closePath();
      ctx.fill();

      // 사거리 경계선 — 스친 구간만큼만 또렷하게
      ctx.strokeStyle = 'rgba(240, 250, 255, 0.65)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, reach, startAngle, startAngle + sweep * t);
      ctx.stroke();

      ctx.restore();

      function bladeAt(p, alpha) {
        var ang = startAngle + sweep * p;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(ang);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = C.hilt;
        ctx.fillRect(0, -1, 3, 2);
        ctx.fillStyle = C.sword;
        ctx.fillRect(3, -1, reach - 3, 2);
        ctx.fillStyle = C.swordShade;
        ctx.fillRect(3, 0, reach - 3, 1);
        ctx.restore();
      }

      // 잔상(더 많고 더 또렷하게) → 현재 위치 순으로 그려야 잔상이 뒤에 깔린다.
      // PHASE 6.1/6.2: "블레이드 트레일이 잘 안 보인다" 피드백이 반복돼 알파를
      // 다시 한 번 끌어올렸다.
      bladeAt(Math.max(0, t - 0.40), 0.18);
      bladeAt(Math.max(0, t - 0.26), 0.36);
      bladeAt(Math.max(0, t - 0.13), 0.62);
      bladeAt(t, 1);

      // 스윙 중간(가장 강하게 뻗는 순간) 칼끝에 짧은 섬광 — 타격감용, 적 명중 이펙트 아님
      var mid = 0.5, midWindow = 0.14;
      if (Math.abs(t - mid) < midWindow) {
        var glintAlpha = 1 - Math.abs(t - mid) / midWindow;
        var ang = startAngle + sweep * t;
        var tipX = pivotX + Math.cos(ang) * reach;
        var tipY = pivotY + Math.sin(ang) * reach;
        ctx.fillStyle = 'rgba(255, 255, 255, ' + (glintAlpha * 0.8).toFixed(2) + ')';
        ctx.fillRect(Math.round(tipX), Math.round(tipY), 1, 1);
      }
    }
  };

  MG.Player = Player;
})(window);
