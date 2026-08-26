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
    },

    update: function (dt) {
      this.animT += dt;

      var canMove = MG.Game && MG.Game.state === 'PLAY';

      // 공격 타이머 진행 (시작 여부와 무관하게 매 프레임 돌아간다)
      if (MG.Combat && MG.Combat.advance) MG.Combat.advance(this, dt);

      // 공격 입력: PLAY 상태에서만, 그리고 스팸 방지(공격 중/쿨다운 중엔 무시)
      if (canMove && MG.Input && MG.Input.attackPressed &&
          MG.Combat && MG.Combat.canAttack && MG.Combat.canAttack(this)) {
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
        if (!this.attacking) {
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

      // 공격 중에는 스윙이 시작된 순간의 방향을 그대로 그린다 (facing 이 아니라 attackFacing)
      var renderFacing = this.attacking ? this.attackFacing : this.facing;

      if (renderFacing === 'down') this.drawFront(ctx, cx, topY, stepOffset, this.attacking);
      else if (renderFacing === 'up') this.drawBack(ctx, cx, topY, stepOffset, this.attacking);
      else this.drawSide(ctx, cx, topY, stepOffset, renderFacing === 'right', this.attacking);

      if (this.attacking && MG.Combat) {
        var progress = this.attackT / MG.Combat.ATTACK_DURATION;
        this.drawAttackSwing(ctx, cx, topY, renderFacing, progress);
      }
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

    /* PHASE 5: 검 스윙 오버레이.
       정적인 칼이 아니라 호를 그리며 휘두르는 느낌을 주기 위해, 매 프레임
       현재 진행도(progress 0~1)에서의 칼날 각도 하나와 잔상용 이전 각도
       두 개를 옅게 겹쳐 그린다 (빠른 스윙일수록 잔상이 뚜렷해 보인다).
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

      function bladeAt(p, alpha) {
        var ang = startAngle + sweep * p;
        ctx.save();
        ctx.translate(Math.round(pivotX), Math.round(pivotY));
        ctx.rotate(ang);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = C.hilt;
        ctx.fillRect(0, -1, 3, 2);
        ctx.fillStyle = C.sword;
        ctx.fillRect(3, -1, 9, 2);
        ctx.fillStyle = C.swordShade;
        ctx.fillRect(3, 0, 9, 1);
        ctx.restore();
      }

      // 잔상 (옅게) → 현재 위치 (또렷하게) 순으로 그려야 잔상이 뒤에 깔린다
      bladeAt(Math.max(0, t - 0.32), 0.16);
      bladeAt(Math.max(0, t - 0.16), 0.32);
      bladeAt(t, 1);

      // 스윙 중간(가장 강하게 뻗는 순간) 칼끝에 짧은 섬광 — 타격감용, 적 명중 이펙트 아님
      var mid = 0.5, midWindow = 0.14;
      if (Math.abs(t - mid) < midWindow) {
        var glintAlpha = 1 - Math.abs(t - mid) / midWindow;
        var ang = startAngle + sweep * t;
        var tipX = pivotX + Math.cos(ang) * 12;
        var tipY = pivotY + Math.sin(ang) * 12;
        ctx.fillStyle = 'rgba(255, 255, 255, ' + (glintAlpha * 0.8).toFixed(2) + ')';
        ctx.fillRect(Math.round(tipX), Math.round(tipY), 1, 1);
      }
    }
  };

  MG.Player = Player;
})(window);
