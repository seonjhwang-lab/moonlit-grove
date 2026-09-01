/* ==========================================================================
   combat.js — 공격 상태 진행 / 히트박스 / 디버그 시각화
   PHASE 5 범위:
     - 공격 지속시간 / 쿨다운을 델타타임으로 진행 (프레임수 의존 없음)
     - 방향은 공격 시작 순간의 facing 에 고정된다 (스윙 도중 방향 전환 없음)
     - 히트박스는 플레이어의 "월드" 좌표 기준으로 계산한다 (화면 좌표 아님) —
       PHASE 6 에서 모슬링과의 충돌 판정이 그대로 재사용한다.
   PHASE 6 범위:
     - player.attackId 를 스윙마다 1씩 올린다. enemy.js 는 모슬링별로
       "마지막으로 맞은 attackId" 를 기억해두고 비교하는 방식으로 같은 스윙이
       한 모슬링을 여러 프레임에 걸쳐 중복으로 때리지 못하게 막는다
       (프레임 타이밍이 아니라 스윙 단위 식별자로 판정하기 위함).
   상태 자체(attacking/attackFacing/attackT/cooldownT/attackId)는 player.js 가
   들고 있고, 이 파일은 그 상태를 "어떻게 진행시키고 어떻게 히트박스로 변환할지"만
   담당한다.
   ========================================================================== */
(function (global) {
  'use strict';
  var MG = global.MG = global.MG || {};

  var ATTACK_DURATION = 0.22;   // 초 — 스윙 전체 지속시간
  var ATTACK_COOLDOWN  = 0.30;  // 초 — 스윙이 끝난 뒤 다음 공격까지 대기
  var MOVE_MULTIPLIER  = 0.7;   // 공격 중 이동속도 배율 (0.65~0.75 권장 범위)

  // 스윙 지속시간 중 실제로 타격 판정이 살아있는 구간 (앞뒤로 예비/회수 동작을 남긴다)
  var HITBOX_ACTIVE_FROM = 0.28;  // attackT/ATTACK_DURATION 비율 (0~1)
  var HITBOX_ACTIVE_TO   = 0.82;

  // PHASE 7 COMBAT POLISH: "칼이 눈에 보이는 것보다 더 정확해야 맞는다"는
  // 모바일 피드백을 반영해 판정을 살짝 더 관대하게 늘렸다(REACH +7%, WIDE +13%
  // → 유효 면적 약 +21%, 목표였던 15~25% 구간 안). 터치에서 실제로 어긋나기
  // 쉬운 건 "거리"보다 "좌우 정렬"이라 WIDE 쪽에 더 무게를 실었다. 사거리
  // (REACH)는 player.js 의 시각적 칼끝 길이와 그대로 맞춰 눈에 보이는 만큼만
  // 더 뻗게 하고, 폭(WIDE)만 칼날보다 약간 더 넓게 둬 "칼끝보다 훨씬 멀리서도
  // 맞는다"가 아니라 "칼보다 판정이 살짝 넓다" 쪽의 위화감만 남긴다.
  var REACH = 15;   // 전방으로 뻗는 길이 (14 → 15)
  var WIDE  = 17;   // 진행축과 수직인 폭 (15 → 17, 몸통 폭 ~12보다 살짝 넓게)
  var GAP   = 3;    // 몸에서 살짝 띄우는 간격 (칼이 몸 밖에서 시작하는 느낌) — 변경 없음

  // true 로 바꾸면 히트박스 사각형과 공격 상태 텍스트를 월드 위에 그려서 확인할 수 있다
  var DEBUG_COMBAT = false;

  var Combat = {
    ATTACK_DURATION: ATTACK_DURATION,
    ATTACK_COOLDOWN: ATTACK_COOLDOWN,
    MOVE_MULTIPLIER: MOVE_MULTIPLIER,
    DEBUG_COMBAT: DEBUG_COMBAT,

    /* player.js 가 매 프레임 호출해 공격/쿨다운 타이머를 진행시킨다.
       공격을 "시작할지"는 판단하지 않는다 — 그건 입력을 아는 player.js 의 몫이다. */
    advance: function (player, dt) {
      if (player.attacking) {
        player.attackT += dt;
        if (player.attackT >= ATTACK_DURATION) {
          player.attacking = false;
          player.attackT = 0;
          player.cooldownT = ATTACK_COOLDOWN;
        }
      } else if (player.cooldownT > 0) {
        player.cooldownT -= dt;
        if (player.cooldownT < 0) player.cooldownT = 0;
      }
    },

    /* 지금 새 공격을 시작할 수 있는 상태인가 (스팸 방지) */
    canAttack: function (player) {
      return !player.attacking && player.cooldownT <= 0;
    },

    /* 공격을 시작한다 — 방향을 이 순간의 facing 에 고정한다 */
    startAttack: function (player) {
      player.attacking = true;
      player.attackFacing = player.facing;
      player.attackT = 0;
      player.attackId = (player.attackId || 0) + 1;
      if (MG.Audio && MG.Audio.playSwordSwing) MG.Audio.playSwordSwing();
    },

    /* 현재 스윙 진행도(0~1) 중 실제로 타격 판정이 살아있는 구간인가 */
    isHitboxActive: function (player) {
      if (!player.attacking) return false;
      var p = player.attackT / ATTACK_DURATION;
      return p >= HITBOX_ACTIVE_FROM && p <= HITBOX_ACTIVE_TO;
    },

    /* PRE-ATTACK TARGETING (HITBOX-AWARE): 실제 공격 상태(attacking/attackT/
       attackFacing)와 무관하게, "이 위치에서 이 방향으로 휘두르면 히트박스가
       어디에 놓이는가"만 계산하는 순수 함수. getAttackHitbox() 와 완전히 같은
       상수(REACH/WIDE/GAP)를 그대로 재사용하므로 두 값이 어긋날 일이 없다 —
       공격 판정 자체(활성 구간 여부 등)는 여기서 전혀 건드리지 않는다. */
    computeHitboxGeometry: function (px, py, dir) {
      var cx = px;
      var cy = py - 10;   // 대략 몸통 중심 높이 (발이 아니라 허리 쯤)
      var w, h, x, y;

      if (dir === 'up') {
        w = WIDE; h = REACH;
        x = cx - w / 2; y = cy - GAP - h;
      } else if (dir === 'down') {
        w = WIDE; h = REACH;
        x = cx - w / 2; y = cy + GAP;
      } else if (dir === 'left') {
        w = REACH; h = WIDE;
        x = cx - GAP - w; y = cy - h / 2;
      } else { // right
        w = REACH; h = WIDE;
        x = cx + GAP; y = cy - h / 2;
      }
      return { x: x, y: y, w: w, h: h };
    },

    /* 플레이어의 공격 히트박스를 월드 좌표로 반환한다.
       활성 구간이 아니면 null (PHASE 6 에서 "null 이면 판정 없음"으로 바로 쓸 수 있다). */
    getAttackHitbox: function (player) {
      if (!this.isHitboxActive(player)) return null;
      return this.computeHitboxGeometry(player.x, player.y, player.attackFacing);
    },

    /* DEBUG_COMBAT 이 true 일 때만 game.js 가 (카메라 변환이 적용된 상태로) 호출한다. */
    renderDebug: function (ctx, player) {
      if (!DEBUG_COMBAT || !player) return;

      ctx.save();
      ctx.font = '6px monospace';
      ctx.fillStyle = '#baffc9';
      ctx.fillText(
        'facing=' + player.facing +
        ' atk=' + player.attacking +
        ' atkFacing=' + player.attackFacing +
        ' cd=' + player.cooldownT.toFixed(2),
        player.x - 26, player.y - 36
      );

      var box = this.getAttackHitbox(player);
      if (box) {
        ctx.strokeStyle = '#ff5a5a';
        ctx.lineWidth = 1;
        ctx.strokeRect(Math.round(box.x) + 0.5, Math.round(box.y) + 0.5, box.w, box.h);
      }
      ctx.restore();
    }
  };

  MG.Combat = Combat;
})(window);
