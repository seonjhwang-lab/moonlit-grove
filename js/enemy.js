/* ==========================================================================
   enemy.js — 모슬링(MOSSLING) 행동
   PHASE 6 범위:
     - 상태 머신: IDLE → WANDER → CHASE → (HIT) → WANDER ... → DEAD
     - 감지 반경(히스테리시스 포함) / 추격 / 자기 구역 배회
     - 기존 collision.js 를 그대로 재사용하는 세계 좌표 이동
     - MG.Combat.getAttackHitbox() 를 그대로 소비하는 검 판정 (재설계 없음)
     - 같은 스윙(attackId)이 한 프레임 이상 지속돼도 같은 모슬링을 한 번만 때린다
     - HP 3 / 피격 시 넉백+플래시 / 처치 시 축소·페이드 후 제거
   버그 수정 (Gemini 리뷰):
     - CHASE 진입 조건에 홈 리쉬(HOME_LEASH_HARD) 검사를 추가해 "홈에서 너무 먼데
       플레이어가 근처" 상황에서 CHASE↔WANDER 가 매 프레임 떨리던 문제를 없앴다.
     - 이동 충돌(footRect, 발치만)과 전투 판정(getHurtbox, 몸통 전체)을 분리했다.
       칼이 눈으로는 몸통에 닿아도 발치 6px 상자만으로 판정해 헛스윙처럼 보이던
       문제를 고쳤다. moveWithCollision/findClearSpot 은 여전히 footRect 를 쓴다.
   플레이어 체력/피해/넉백은 이 Phase의 범위가 아니다 (모슬링은 플레이어를 때리지 않는다).
   ========================================================================== */
(function (global) {
  'use strict';

  var MG = global.MG = global.MG || {};

  var HP_MAX          = 3;
  var FOOT_W = 9, FOOT_H = 6;          // 충돌 상자 (플레이어와 같은 발치 컨벤션)

  var DETECT_RADIUS   = 135;           // 이 안에 들어오면 추격 시작
  var LEAVE_RADIUS    = 175;           // 이 밖으로 나가면 추격 포기 (히스테리시스)
  var HOME_LEASH_HARD = 260;           // 추격 중이라도 자기 구역에서 이만큼 멀어지면 강제 귀환
  var WANDER_LEASH    = 46;            // 배회 목표점은 홈에서 이 반경 안에서만 뽑는다

  var WANDER_SPEED    = 18;            // 세계 픽셀/초
  var CHASE_SPEED      = 42;            // 플레이어 속도(84)의 절반 — 도망칠 수 있어야 한다

  var IDLE_MIN = 0.9,  IDLE_MAX = 2.2;
  var WANDER_MIN = 1.4, WANDER_MAX = 3.0;

  var KNOCKBACK_DIST = 30;             // 세계 픽셀
  var KNOCKBACK_DURATION = 0.14;       // 초
  var DEATH_DURATION = 0.35;           // 초

  // true 로 바꾸면 감지 반경 / 상태 / HP / 충돌 상자를 그려서 확인할 수 있다
  var DEBUG_ENEMY = false;

  // 나무 캐노피(초록 계열)나 이끼 바위와 구분되도록 살짝 노란기 도는 이끼색을 쓴다
  var C = {
    bodyDark:  '#5c7a3a',
    bodyMid:   '#7c9c4a',
    bodyLight: '#9fbd5e',
    tuft:      '#4a6a2e',
    eye:       '#eaffb0',
    eyeCore:   '#3a2e1a',
    hitFlash:  'rgba(255, 255, 255, 0.75)'
  };

  /* 시작 배치 — "시작 길목 근처 / 숲 깊은 곳 / 다른 트인 공간 근처" 3곳.
     map.js 의 공터/길 반경 안이라 절차적 나무 배치와 절대 겹치지 않는다.
     그래도 향후 맵 데이터가 바뀔 경우를 대비해 init() 에서 한 번 더 충돌 검사 후
     막혀 있으면 주변으로 살짝 밀어낸다. */
  var SPAWN_SPOTS = [
    { x: 420, y: 690 },   // 시작 지점에서 이어지는 숲길 근처
    { x: 700, y: 400 },   // 숲 탐험 중간 공터 (더 깊은 숲)
    { x: 300, y: 235 }    // 북쪽 작은 공터 (PHASE 9 모스키 공터와 동일 — 설계 의도)
  ];

  var Enemy = {
    list: [],
    particles: [],
    DEBUG_ENEMY: DEBUG_ENEMY,

    init: function () {
      this.list = [];
      this.particles = [];
      var solids = (MG.Map && MG.Map.solids) || [];

      for (var i = 0; i < SPAWN_SPOTS.length; i++) {
        var spot = this.findClearSpot(SPAWN_SPOTS[i].x, SPAWN_SPOTS[i].y, solids);
        this.list.push(this.create(spot.x, spot.y, i));
      }
    },

    /* 지정한 자리가 막혀 있으면 나선형으로 조금씩 퍼지며 뚫린 자리를 찾는다 */
    findClearSpot: function (x, y, solids) {
      if (!MG.Collision || !solids.length) return { x: x, y: y };
      if (!MG.Collision.isBlocked(x, y, FOOT_W, FOOT_H, solids)) return { x: x, y: y };

      for (var r = 8; r <= 64; r += 8) {
        for (var a = 0; a < Math.PI * 2; a += Math.PI / 4) {
          var tx = x + Math.cos(a) * r;
          var ty = y + Math.sin(a) * r;
          if (!MG.Collision.isBlocked(tx, ty, FOOT_W, FOOT_H, solids)) return { x: tx, y: ty };
        }
      }
      return { x: x, y: y }; // 최후 수단: 원래 자리 (이런 일은 없어야 정상)
    },

    create: function (x, y, id) {
      return {
        id: id,
        x: x, y: y,
        homeX: x, homeY: y,

        hp: HP_MAX,
        maxHp: HP_MAX,

        state: 'IDLE',       // IDLE | WANDER | CHASE | HIT | DEAD
        stateT: 0,            // 현재 상태에 남은/경과 시간 (상태별로 의미가 다름)
        wanderTX: x, wanderTY: y,

        facingSign: 1,        // 렌더링용 좌우 힌트 (강한 방향성 아트가 아니므로 소소하게만 사용)
        animT: Math.random() * 10,

        knockVX: 0, knockVY: 0,
        hitFlashT: 0,

        deathT: 0,
        scale: 0.92 + Math.random() * 0.16,

        lastHitAttackId: -1
      };
    },

    /* ------------------------------------------------------------ update */
    update: function (dt) {
      if (!MG.Player) return;

      var player = MG.Player;
      var i;

      for (i = 0; i < this.list.length; i++) {
        var e = this.list[i];
        e.animT += dt;

        if (e.state === 'DEAD') {
          this.updateDead(e, dt);
          continue;
        }

        if (e.state === 'HIT') {
          this.updateHit(e, dt);
        } else {
          this.updateDetection(e, player);
          if (e.state === 'CHASE') this.updateChase(e, dt, player);
          else this.updateWanderOrIdle(e, dt);
        }

        // 검 판정은 죽지 않은 모슬링이면 상태와 무관하게 매 프레임 확인한다
        // (IDLE/WANDER/CHASE/HIT 어느 상태에서 맞아도 맞는다 — 죽은 것만 제외)
        this.checkSwordHit(e, player);
      }

      // 사망 완료 → 배열에서 제거
      for (i = this.list.length - 1; i >= 0; i--) {
        if (this.list[i].state === 'DEAD' && this.list[i].deathT <= 0) {
          this.list.splice(i, 1);
        }
      }

      this.updateParticles(dt);
    },

    updateDetection: function (e, player) {
      var dx = player.x - e.x, dy = player.y - e.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var homeDist = Math.hypot(e.x - e.homeX, e.y - e.homeY);

      if (e.state === 'CHASE') {
        if (dist > LEAVE_RADIUS || homeDist > HOME_LEASH_HARD) {
          e.state = 'WANDER';
          this.pickWanderTarget(e);
        }
      } else if (dist <= DETECT_RADIUS && homeDist <= HOME_LEASH_HARD) {
        // homeDist 조건이 없으면: 이미 홈 리쉬 밖으로 밀려난(넉백 등으로) 모슬링이
        // WANDER 로 돌아가는 도중에도 플레이어가 근처면 매 프레임 다시 CHASE 로
        // 튕겨 들어왔다가 즉시 홈 리쉬 초과로 다시 WANDER 로 튕겨나가길 반복해
        // (매 프레임 CHASE↔WANDER 떨림) 홈으로 돌아가지 못하게 된다.
        e.state = 'CHASE';
      }
    },

    updateChase: function (e, dt, player) {
      var dx = player.x - e.x, dy = player.y - e.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.001) return;

      var mx = (dx / dist) * CHASE_SPEED * dt;
      var my = (dy / dist) * CHASE_SPEED * dt;
      this.moveWithCollision(e, mx, my);
      if (Math.abs(dx) > 0.5) e.facingSign = dx > 0 ? 1 : -1;
    },

    updateWanderOrIdle: function (e, dt) {
      if (e.state === 'IDLE') {
        e.stateT -= dt;
        if (e.stateT <= 0) {
          e.state = 'WANDER';
          this.pickWanderTarget(e);
        }
        return;
      }

      // WANDER: 목표점을 향해 천천히 이동, 도착하거나 시간 초과되면 다시 IDLE
      e.stateT -= dt;
      var dx = e.wanderTX - e.x, dy = e.wanderTY - e.y;
      var dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 3 || e.stateT <= 0) {
        e.state = 'IDLE';
        e.stateT = IDLE_MIN + Math.random() * (IDLE_MAX - IDLE_MIN);
        return;
      }

      var mx = (dx / dist) * WANDER_SPEED * dt;
      var my = (dy / dist) * WANDER_SPEED * dt;
      this.moveWithCollision(e, mx, my);
      if (Math.abs(dx) > 0.5) e.facingSign = dx > 0 ? 1 : -1;
    },

    pickWanderTarget: function (e) {
      var ang = Math.random() * Math.PI * 2;
      var r = Math.random() * WANDER_LEASH;
      e.wanderTX = e.homeX + Math.cos(ang) * r;
      e.wanderTY = e.homeY + Math.sin(ang) * r;
      e.stateT = WANDER_MIN + Math.random() * (WANDER_MAX - WANDER_MIN);
    },

    moveWithCollision: function (e, dx, dy) {
      var solids = (MG.Map && MG.Map.solids) || [];
      if (MG.Collision && solids.length) {
        var res = MG.Collision.moveAndCollide(e.x, e.y, FOOT_W, FOOT_H, dx, dy, solids);
        e.x = res.x;
        e.y = res.y;
      } else {
        e.x += dx;
        e.y += dy;
      }
    },

    updateHit: function (e, dt) {
      e.hitFlashT = Math.max(0, e.hitFlashT - dt);
      e.stateT -= dt;

      // 넉백은 순간 충격이 아니라 knockDuration 동안 밀려나는 짧은 이동으로 구현한다 —
      // 그래야 벽/나무에 부딪히면 그 자리에서 자연스럽게 멈춘다 (기존 충돌 재사용)
      if (e.stateT > 0) {
        this.moveWithCollision(e, e.knockVX * dt, e.knockVY * dt);
      } else {
        e.state = 'WANDER';
        this.pickWanderTarget(e);
      }
    },

    updateDead: function (e, dt) {
      e.deathT -= dt;
    },

    /* 전투용 허트박스 — 이동 충돌(footRect, 발치만)과는 별개의 개념이다.
       검은 허리~머리 높이를 스치는데 footRect 는 발 밑 6px 짜리 얇은 판정이라,
       칼날이 눈으로 보기엔 몸통에 꽂혀도 수학적으로는 비껴가는 문제가 있었다.
       drawBody() 의 몸통 로브는 대략 y-10.6 ~ y+1.2, x-7.7 ~ x+7.3 범위를 차지하므로
       그 몸통 전체를 넉넉히 덮는 상자를 따로 둔다. */
    getHurtbox: function (e) {
      return { x: e.x - 6, y: e.y - 12, w: 12, h: 12 };
    },

    /* ------------------------------------------------------ 검 판정 연결 */
    checkSwordHit: function (e, player) {
      if (e.state === 'DEAD') return;
      if (player.attackId === e.lastHitAttackId) return; // 이 스윙으로는 이미 맞았다

      var box = MG.Combat && MG.Combat.getAttackHitbox ? MG.Combat.getAttackHitbox(player) : null;
      if (!box) return;

      var hurt = this.getHurtbox(e);
      if (!MG.Collision.overlaps(box.x, box.y, box.w, box.h, hurt.x, hurt.y, hurt.w, hurt.h)) return;

      this.applyHit(e, player);
    },

    applyHit: function (e, player) {
      e.lastHitAttackId = player.attackId;
      e.hp -= 1;

      var dx = e.x - player.x, dy = e.y - player.y;
      var dist = Math.sqrt(dx * dx + dy * dy) || 1;
      var nx = dx / dist, ny = dy / dist;

      this.spawnParticles(e.x, e.y, 3, nx, ny);

      if (e.hp <= 0) {
        e.state = 'DEAD';
        e.deathT = DEATH_DURATION;
        e.knockVX = 0; e.knockVY = 0;
        this.spawnParticles(e.x, e.y, 6, nx, ny);
        if (MG.Audio && MG.Audio.playEnemyDefeat) MG.Audio.playEnemyDefeat();
      } else {
        e.state = 'HIT';
        e.stateT = KNOCKBACK_DURATION;
        e.hitFlashT = KNOCKBACK_DURATION;
        e.knockVX = nx * (KNOCKBACK_DIST / KNOCKBACK_DURATION);
        e.knockVY = ny * (KNOCKBACK_DIST / KNOCKBACK_DURATION);
        if (MG.Audio && MG.Audio.playEnemyHit) MG.Audio.playEnemyHit();
      }
    },

    /* ------------------------------------------------------------ 파티클 */
    spawnParticles: function (x, y, count, nx, ny) {
      for (var i = 0; i < count; i++) {
        var ang = Math.atan2(ny, nx) + (Math.random() - 0.5) * 2.4;
        var spd = 22 + Math.random() * 26;
        this.particles.push({
          x: x, y: y - 8,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          life: 0.22 + Math.random() * 0.12,
          maxLife: 0.34
        });
      }
    },

    updateParticles: function (dt) {
      for (var i = this.particles.length - 1; i >= 0; i--) {
        var p = this.particles[i];
        p.life -= dt;
        if (p.life <= 0) { this.particles.splice(i, 1); continue; }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.9;
        p.vy *= 0.9;
      }
    },

    /* --------------------------------------------------------- 렌더링 */

    /* game.js 가 y 정렬용으로 수집한다 (map.js 의 collectProps 와 같은 패턴) */
    collect: function (out, cam) {
      for (var i = 0; i < this.list.length; i++) {
        var e = this.list[i];
        if (e.x < cam.x - 40 || e.x > cam.x + cam.w + 40) continue;
        if (e.y < cam.y - 40 || e.y > cam.y + cam.h + 40) continue;
        out.push({ y: e.y, kind: 'enemy', obj: e });
      }
      return out;
    },

    renderOne: function (ctx, e) {
      if (e.state === 'DEAD') {
        var fade = Math.max(0, e.deathT / DEATH_DURATION);
        ctx.save();
        ctx.globalAlpha = fade;
        this.drawBody(ctx, e, e.scale * (0.4 + 0.6 * fade));
        ctx.restore();
      } else {
        this.drawBody(ctx, e, e.scale);
      }

      if (DEBUG_ENEMY) this.drawDebug(ctx, e);
    },

    drawBody: function (ctx, e, scale) {
      var x = e.x, y = e.y;
      var bob = (e.state === 'CHASE' || e.state === 'WANDER')
        ? Math.abs(Math.sin(e.animT * 7)) * 1.2
        : Math.sin(e.animT * 1.8) * 0.5;
      var topY = y - bob;

      // 그림자
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.beginPath();
      ctx.ellipse(Math.round(x), Math.round(y + 1), 6 * scale, 2.2 * scale, 0, 0, Math.PI * 2);
      ctx.fill();

      // 몸통 — 원 세 개를 겹쳐 뭉툭한 이끼 덩어리 실루엣을 만든다 (나무보다 훨씬 작다)
      var lobes = [
        [x - 3.5 * scale, topY - 3 * scale, 4.2 * scale],
        [x + 3.5 * scale, topY - 2.6 * scale, 3.8 * scale],
        [x,                topY - 6 * scale, 4.6 * scale]
      ];
      ctx.fillStyle = C.bodyDark;
      for (var i = 0; i < lobes.length; i++) {
        ctx.beginPath();
        ctx.arc(lobes[i][0], lobes[i][1], lobes[i][2], 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = C.bodyMid;
      ctx.beginPath();
      ctx.arc(x - 1 * scale, topY - 7 * scale, 3.6 * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.bodyLight;
      ctx.beginPath();
      ctx.arc(x - 2.4 * scale, topY - 8.4 * scale, 1.9 * scale, 0, Math.PI * 2);
      ctx.fill();

      // 이끼 잎/잔가지 텍스처
      ctx.fillStyle = C.tuft;
      ctx.fillRect(Math.round(x - 4.6 * scale), Math.round(topY - 9.5 * scale), 2, 2);
      ctx.fillRect(Math.round(x + 3.4 * scale), Math.round(topY - 8.5 * scale), 2, 2);

      // 눈 — 살짝 이동 방향 쪽으로 치우치고, 추격 중엔 더 밝게 빛난다
      var glow = e.state === 'CHASE'
        ? 0.75 + 0.25 * Math.sin(e.animT * 9)
        : 0.45 + 0.2 * Math.sin(e.animT * 2.2);
      var eyeDX = e.facingSign * 1.1 * scale;
      ctx.fillStyle = 'rgba(234, 255, 176, ' + glow.toFixed(2) + ')';
      ctx.fillRect(Math.round(x - 1.6 * scale + eyeDX), Math.round(topY - 6.2 * scale), 1, 1);
      ctx.fillRect(Math.round(x + 1.2 * scale + eyeDX), Math.round(topY - 6.2 * scale), 1, 1);
      ctx.fillStyle = C.eyeCore;
      ctx.fillRect(Math.round(x - 1.6 * scale + eyeDX), Math.round(topY - 6.0 * scale), 1, 1);
      ctx.fillRect(Math.round(x + 1.2 * scale + eyeDX), Math.round(topY - 6.0 * scale), 1, 1);

      // 피격 플래시
      if (e.hitFlashT > 0) {
        var flashAlpha = e.hitFlashT / KNOCKBACK_DURATION;
        ctx.globalAlpha = flashAlpha * 0.8;
        ctx.fillStyle = C.hitFlash;
        for (i = 0; i < lobes.length; i++) {
          ctx.beginPath();
          ctx.arc(lobes[i][0], lobes[i][1], lobes[i][2], 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    },

    renderParticles: function (ctx) {
      for (var i = 0; i < this.particles.length; i++) {
        var p = this.particles[i];
        var a = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = 'rgba(210, 240, 170, ' + a.toFixed(2) + ')';
        ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
      }
    },

    drawDebug: function (ctx, e) {
      ctx.save();
      ctx.strokeStyle = e.state === 'CHASE' ? '#ff8a5a' : 'rgba(150, 200, 255, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(e.x, e.y, DETECT_RADIUS, 0, Math.PI * 2);
      ctx.stroke();

      var r = MG.Collision.footRect(e.x, e.y, FOOT_W, FOOT_H);
      ctx.strokeStyle = '#5affea';
      ctx.strokeRect(Math.round(r.x) + 0.5, Math.round(r.y) + 0.5, r.w, r.h);

      var hurt = this.getHurtbox(e);
      ctx.strokeStyle = '#ff5aa8';
      ctx.strokeRect(Math.round(hurt.x) + 0.5, Math.round(hurt.y) + 0.5, hurt.w, hurt.h);

      ctx.font = '6px monospace';
      ctx.fillStyle = '#5affea';
      ctx.fillText(e.state + ' hp=' + e.hp, e.x - 14, e.y - 20);
      ctx.restore();
    }
  };

  MG.Enemy = Enemy;
})(window);
