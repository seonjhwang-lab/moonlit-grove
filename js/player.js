/* ==========================================================================
   player.js — 플레이어(LUKA) 이동 / 방향 / 걷기 애니메이션
   PHASE 2 범위:
     - 부드러운 8방향 이동 (input.js 의 정규화된 axis 사용)
     - 4방향 facing (상/하/좌/우) — 공격 방향(PHASE 5)의 기준이 된다
     - 캔버스 경계 클램프 (PHASE 4 전까지 임시 경계. 실제 맵 충돌은 collision.js)
     - 절차적으로 그린 원본 캐릭터 (이끼/덩굴 숲 탐험가, 둥근 여행 가방)
   체력(PHASE 7), 공격(PHASE 5), 상호작용(PHASE 9)은 아직 다루지 않는다.
   ========================================================================== */
(function (global) {
  'use strict';

  var MG = global.MG = global.MG || {};

  var SPEED = 84;          // 내부 픽셀/초
  var FOOT_W = 11;         // 충돌 상자 (발치) — 캐릭터 전체가 아니라 발만 막는다
  var FOOT_H = 6;
  var STEP_FREQ = 9;        // 걷기 사이클 속도
  var IDLE_FREQ = 1.6;      // 정지 시 미세한 흔들림 속도

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

    FOOT_W: FOOT_W,
    FOOT_H: FOOT_H,

    init: function () {
      var spawn = (MG.Map && MG.Map.spawn) || { x: 200, y: 706 };
      this.x = spawn.x;
      this.y = spawn.y;
      this.facing = 'down';
      this.moving = false;
      this.animT = 0;
    },

    update: function (dt) {
      this.animT += dt;

      var axis = (MG.Input && MG.Input.axis) || { x: 0, y: 0 };
      var canMove = MG.Game && MG.Game.state === 'PLAY';
      var ax = canMove ? axis.x : 0;
      var ay = canMove ? axis.y : 0;

      this.moving = (ax !== 0 || ay !== 0);

      if (this.moving) {
        // 대각선 이동이 더 빠르지 않도록 input.js 에서 이미 정규화되어 있다
        var dx = ax * SPEED * dt;
        var dy = ay * SPEED * dt;

        var solids = (MG.Map && MG.Map.solids) || [];
        if (MG.Collision && solids.length) {
          var res = MG.Collision.moveAndCollide(this.x, this.y, FOOT_W, FOOT_H, dx, dy, solids);
          this.x = res.x;
          this.y = res.y;
        } else {
          this.x += dx;
          this.y += dy;
        }

        if (Math.abs(ax) > Math.abs(ay)) {
          this.facing = ax > 0 ? 'right' : 'left';
        } else {
          this.facing = ay > 0 ? 'down' : 'up';
        }
      }
    },

    /* ---------------------------------------------------------- render */
    render: function (ctx) {
      var cx = this.x;
      var feetY = this.y;

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

      if (this.facing === 'down') this.drawFront(ctx, cx, topY, stepOffset);
      else if (this.facing === 'up') this.drawBack(ctx, cx, topY, stepOffset);
      else this.drawSide(ctx, cx, topY, stepOffset, this.facing === 'right');
    },

    /* 정면(아래를 바라봄) */
    drawFront: function (ctx, cx, feetY, step) {
      var lHair = -1, rHair = 1; // 미사용 방지용 참조 없음(가독성 주석)

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

      // 검(허리에 소지, 전투 전이므로 정지 상태)
      rect(ctx, cx - 7, feetY - 10, 2, 6, C.swordShade);
      rect(ctx, cx - 8, feetY - 11, 3, 2, C.hilt);

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
    drawBack: function (ctx, cx, feetY, step) {
      // 다리
      rect(ctx, cx - 4, feetY - 5 - Math.max(0, step), 3, 5, C.tunicShade);
      rect(ctx, cx + 1, feetY - 5 + Math.max(0, -step), 3, 5, C.tunicShade);

      // 망토 (등 전체를 덮는 주 실루엣)
      rect(ctx, cx - 6, feetY - 16, 12, 11, C.cape);
      rect(ctx, cx - 6, feetY - 7, 12, 2, C.capeShade);

      // 팔
      rect(ctx, cx - 7, feetY - 13, 2, 6, C.tunicShade);
      rect(ctx, cx + 5, feetY - 13, 2, 6, C.tunicShade);

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
    drawSide: function (ctx, cx, feetY, step, facingRight) {
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

      // 앞팔 + 검(허리 소지)
      rect(ctx, cx + dir * 3, feetY - 13, 2, 6, C.tunic);
      rect(ctx, cx + dir * 4, feetY - 10, 2, 5, C.swordShade);
      rect(ctx, cx + dir * 3, feetY - 11, 3, 2, C.hilt);

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
    }
  };

  MG.Player = Player;
})(window);
