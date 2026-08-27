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
   PHASE 6.1 범위 (전투 손맛 / 밀도 / 위협감 — 플레이어 피드백 반영):
     - 피격 플래시를 넉백 지속시간(0.14s)과 분리해 0.08s 짜리 짧고 뚜렷한
       "맞은 그 프레임" 플래시로 만들었다 (FLASH_DURATION).
     - 타격 성공 시 MG.Game.hitStop() 을 호출해 아주 짧은 히트스탑을 건다.
     - 타격 파티클을 밝은 "스파크"(피격)와 기존 이끼색 "포프"(처치)로 구분했다.
     - 모슬링을 3마리 → 9마리로 늘렸다 (숲 전역에 분산 배치).
     - CHASE 안에 윈드업→돌진 하위 단계를 추가했다 (플레이어 체력/피해는 여전히 없음 —
       순전히 "움직여서 피해야 하는" 압박용 연출). 새 상태를 추가한 게 아니라
       기존 CHASE 상태 내부의 하위 단계(chasePhase)로만 구현했다.
   PHASE 6.2 범위 (윈드업/돌진 가독성 + 접촉 피드백 — 플레이어 피드백 반영):
     - 윈드업을 훨씬 더 세게 텔레그래프한다: 더 크게 웅크리고, 플레이어 쪽으로
       살짝 기울고(facingSign 활용), 호박색 경고 링이 눈 깜빡임과 함께 펄스한다.
     - 돌진 중엔 잔상(스트레치 트레일)을 남겨 "쭉 뻗어나간다"는 느낌을 준다.
     - 돌진이 실제로 플레이어 몸(허트박스)에 닿으면 — 여전히 체력/데미지는 없이 —
       MG.Player.onContactHit() 을 호출해 살짝 밀려남 + 짧은 붉은 플래시 +
       아주 짧은 히트스탑 + 전용 접촉음을 재생한다. 조작(조이스틱/공격)은
       전혀 막지 않는다. 한 번의 돌진(lunge)당 최대 한 번만 발동하도록
       lungeContactDone 플래그로 추적한다 — 매 프레임 겹쳐 있어도 중복 발동하지 않는다.
   플레이어 체력/피해/넉백(수치적 데미지)은 여전히 이 Phase의 범위가 아니다.
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

  var FLASH_DURATION = 0.08;           // 초 — 피격 플래시 (넉백과 별개, 훨씬 짧고 또렷하게)
  var HITSTOP_DURATION = 0.045;        // 초 — 타격 성공 시 game.js 에 거는 히트스탑

  // CHASE 중 위협감을 주는 윈드업→돌진. 새 상태가 아니라 CHASE 의 하위 단계다.
  var LUNGE_TRIGGER_DIST = 55;         // 이 거리 안까지 접근하면 윈드업 시작
  var WINDUP_DURATION = 0.20;          // 초 — 제자리에서 웅크리는 예비 동작 (0.18~0.25 권장)
  var LUNGE_DURATION = 0.17;           // 초 — 돌진 지속시간 (0.15~0.20 권장)
  var LUNGE_DIST = 21;                 // 세계 픽셀 — 돌진 거리 (18~25 권장)
  var LUNGE_COOLDOWN = 0.8;            // 초 — 돌진 한 번 끝나면 다음 윈드업까지 대기

  /* PHASE 6.2 POLISH: 두 캐릭터의 스프라이트가 서로 뚫고 들어가/겹쳐 보이는 문제를
     막기 위한 최소 분리 거리. 새 물리 엔진 없이, 기존 허트박스 크기(getHurtbox())
     에서 그대로 유도한다 — 플레이어 허트박스 폭 12(반폭 6), 모슬링 허트박스 폭 12
     (반폭 6). 두 반폭의 합(12)이 "몸이 맞닿는" 대략적인 경계선이다.
       CHASE_STOP_DIST   — 평소 추격 중 더 이상 다가오지 않고 멈추는 거리.
                           경계선(12)보다 살짝 밖에 둬서 스프라이트가 겹치지 않게 한다.
       LUNGE_CONTACT_DIST — 돌진이 이 거리까지 오면 더 이상 파고들지 않고 멈춘다.
                           경계선(12)보다 살짝 안쪽이라 허트박스가 실제로 겹쳐서
                           기존 checkPlayerContact() 판정이 정상적으로 발동한다. */
  var PLAYER_HURT_HALF_W = 6;          // MG.Player.getHurtbox().w(12) 의 절반
  var ENEMY_HURT_HALF_W  = 6;          // 아래 getHurtbox().w(12) 의 절반 (본인)
  var CHASE_STOP_DIST    = PLAYER_HURT_HALF_W + ENEMY_HURT_HALF_W + 3;  // = 15
  var LUNGE_CONTACT_DIST = PLAYER_HURT_HALF_W + ENEMY_HURT_HALF_W - 3;  // = 9

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
    hitFlash:  'rgba(255, 255, 255, 0.75)',
    spark:     '#fff3c4'   // 피격 파티클 — 처치 파티클(이끼 초록)과 구분되는 밝은 불빛
  };

  /* PHASE 6.1: 3마리 → 9마리로 밀도를 늘렸다. map.js 의 공터/길 반경(나무가 자라지
     않는 구간) 안에서만 골라 절차적 나무 배치와 절대 겹치지 않게 했고, 서로 60유닛
     이상 떨어뜨려 한 화면(카메라 360x640)에 아홉 마리가 한꺼번에 몰리지 않게 했다.
     그래도 향후 맵 데이터가 바뀔 경우를 대비해 init() 에서 한 번 더 충돌 검사 후
     막혀 있으면 주변으로 살짝 밀어낸다(findClearSpot). */
  var SPAWN_SPOTS = [
    // 시작 숲 근처 (2)
    { x: 420, y: 690 },   // 시작 지점에서 이어지는 숲길 근처
    { x: 260, y: 650 },   // 시작 공터 반대편 가장자리
    // 주 통로를 따라 (2)
    { x: 640, y: 700 },   // 흙길 중간 지점
    { x: 820, y: 668 },   // 흙길이 물가로 꺾이기 전
    // 숲 더 깊은 곳 (3)
    { x: 700, y: 400 },   // 숲 탐험 중간 공터
    { x: 634, y: 560 },   // 북쪽 갈림길 초입
    { x: 598, y: 430 },   // 갈림길을 따라 더 깊은 숲
    // 또 다른 트인 공간 (2)
    { x: 300, y: 235 },   // 북쪽 작은 공터 (PHASE 9 모스키 공터와 동일 — 설계 의도)
    { x: 962, y: 646 }    // 물가 — 막힌 보물이 보이는 지점 근처
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

        // PHASE 6.1: CHASE 내부 하위 단계 (새 최상위 상태가 아니다)
        chasePhase: 'approach',   // approach | windup | lunge
        chaseSubT: 0,
        lungeDX: 0, lungeDY: 0,
        lungeCooldownT: 0,
        lungeContactDone: false,  // PHASE 6.2: 이번 돌진에서 이미 플레이어에게 닿았는가

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

        // PHASE 6.2: 플레이어 접촉은 "돌진 중"에만 의미가 있다 (그냥 스쳐 지나가는
        // 평상시 추격 중 몸이 스치는 것까지 매번 반응하면 오히려 정신없다) —
        // lungeContactDone 가드로 이 돌진 동안 한 번만 발동한다.
        if (e.state === 'CHASE' && e.chasePhase === 'lunge' && !e.lungeContactDone) {
          this.checkPlayerContact(e, player);
        }
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
        e.chasePhase = 'approach';
        e.chaseSubT = 0;
      }
    },

    /* PHASE 6.1: CHASE 는 이제 세 하위 단계를 순환한다.
         approach — 플레이어를 향해 평소 속도로 접근한다.
         windup   — LUNGE_TRIGGER_DIST 안까지 붙으면 제자리에서 잠깐 웅크린다
                    (이동 없음 — 플레이어가 "온다"를 읽고 피할 시간을 준다).
         lunge    — 웅크림이 끝난 순간의 방향으로 짧고 빠르게 돌진한 뒤 approach 로
                    돌아가고, 쿨다운 동안은 다시 윈드업하지 않는다.
       플레이어를 때리지는 않는다 — 그저 움직여서 반응하게 만드는 압박 연출이다. */
    updateChase: function (e, dt, player) {
      if (e.lungeCooldownT > 0) e.lungeCooldownT -= dt;

      var dx = player.x - e.x, dy = player.y - e.y;
      var dist = Math.sqrt(dx * dx + dy * dy);

      if (e.chasePhase === 'windup') {
        e.chaseSubT -= dt;
        if (e.chaseSubT <= 0) {
          e.chasePhase = 'lunge';
          e.chaseSubT = LUNGE_DURATION;
          e.lungeContactDone = false; // 새 돌진 시작 — 접촉 판정을 다시 허용한다
          var d = dist || 1;
          e.lungeDX = dx / d;
          e.lungeDY = dy / d;
        }
        return; // 웅크리는 동안은 움직이지 않는다 — 예비 동작을 읽을 시간
      }

      if (e.chasePhase === 'lunge') {
        e.chaseSubT -= dt;

        // PHASE 6.2 POLISH: 직전 프레임에 접촉이 이미 확정됐다면(checkPlayerContact
        // 가 발동해 lungeContactDone 이 true 가 됐다면) 더 이상 파고들지 않고 바로
        // 끝낸다. 그렇지 않으면 넉백으로 막 벌어진 거리를 같은 돌진이 곧바로 다시
        // 따라가 메꿔버려 "접촉 후에는 떨어져 있어야 한다"는 의도가 깨진다.
        if (e.lungeContactDone) {
          e.chasePhase = 'approach';
          e.lungeCooldownT = LUNGE_COOLDOWN;
          return;
        }

        var lungeSpeed = LUNGE_DIST / LUNGE_DURATION;
        var stepX = e.lungeDX * lungeSpeed * dt;
        var stepY = e.lungeDY * lungeSpeed * dt;

        // PHASE 6.2 POLISH: 이번 프레임 이동이 플레이어를 뚫고 지나가 버릴 만큼
        // 크면(플레이어가 가만히 있거나 돌진 시작 시점에 이미 가까웠던 경우),
        // LUNGE_CONTACT_DIST 지점에서 멈추도록 이번 스텝만 줄인다. 그 지점은
        // 허트박스가 이미 겹치는 거리라 아래의 기존 접촉 판정이 그대로 발동한다.
        var curDist = Math.sqrt(dx * dx + dy * dy);
        var stepLen = Math.sqrt(stepX * stepX + stepY * stepY);
        var reachedContact = (curDist - stepLen) < LUNGE_CONTACT_DIST;
        if (reachedContact && stepLen > 0.0001) {
          var allowed = Math.max(0, curDist - LUNGE_CONTACT_DIST);
          var k = allowed / stepLen;
          stepX *= k;
          stepY *= k;
        }

        this.moveWithCollision(e, stepX, stepY);
        if (Math.abs(e.lungeDX) > 0.2) e.facingSign = e.lungeDX > 0 ? 1 : -1;
        if (reachedContact || e.chaseSubT <= 0) {
          e.chasePhase = 'approach';
          e.lungeCooldownT = LUNGE_COOLDOWN;
        }
        return;
      }

      // approach (기본 하위 단계)
      if (dist < 0.001) return;
      if (dist <= LUNGE_TRIGGER_DIST && e.lungeCooldownT <= 0) {
        e.chasePhase = 'windup';
        e.chaseSubT = WINDUP_DURATION;
        return;
      }

      // PHASE 6.2 POLISH: 돌진 쿨다운이 남아있으면 윈드업으로 넘어가지 못한 채
      // 계속 다가오기만 해서 플레이어 위치에 완전히 겹쳐버릴 수 있었다.
      // CHASE_STOP_DIST 안까지 오면 더 다가오지 않고 그 거리에서 플레이어를
      // 바라보며 멈춘다 — 쿨다운이 끝나면 이 상태에서 바로 윈드업으로 전환된다.
      if (dist <= CHASE_STOP_DIST) {
        if (Math.abs(dx) > 0.5) e.facingSign = dx > 0 ? 1 : -1;
        return;
      }

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
      e.hitFlashT = Math.max(0, e.hitFlashT - dt); // 즉사 타격의 플래시도 끝까지 재생되게 한다
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

    /* PHASE 6.1: "칼이 닿았다" 는 확신을 주기 위한 타격 확인 시퀀스.
       요구된 순서 그대로: 접촉 → 플래시 → 스파크 → 타격음 → 짧은 히트스탑 → 넉백.
       (넉백 자체의 값/지속시간은 PHASE 6 그대로 — 여기서 건드리지 않는다) */
    applyHit: function (e, player) {
      e.lastHitAttackId = player.attackId;
      e.hp -= 1;

      var dx = e.x - player.x, dy = e.y - player.y;
      var dist = Math.sqrt(dx * dx + dy * dy) || 1;
      var nx = dx / dist, ny = dy / dist;

      e.hitFlashT = FLASH_DURATION;               // A. 플래시 (짧고 또렷하게, 넉백과 무관)
      this.spawnParticles(e.x, e.y, 4, nx, ny, 'spark'); // B. 임팩트 스파크

      if (e.hp <= 0) {
        e.state = 'DEAD';
        e.deathT = DEATH_DURATION;
        e.knockVX = 0; e.knockVY = 0;
        this.spawnParticles(e.x, e.y, 6, nx, ny, 'moss');
        if (MG.Audio && MG.Audio.playEnemyDefeat) MG.Audio.playEnemyDefeat();
      } else {
        e.state = 'HIT';
        e.stateT = KNOCKBACK_DURATION;             // E. 넉백 (기존 값 그대로)
        e.knockVX = nx * (KNOCKBACK_DIST / KNOCKBACK_DURATION);
        e.knockVY = ny * (KNOCKBACK_DIST / KNOCKBACK_DURATION);
        if (MG.Audio && MG.Audio.playEnemyHit) MG.Audio.playEnemyHit(); // D. 타격음
      }

      if (MG.Game && MG.Game.hitStop) MG.Game.hitStop(HITSTOP_DURATION); // C. 히트스탑
    },

    /* PHASE 6.2: 돌진이 플레이어 몸에 실제로 닿았는지 — 이동 충돌(footRect)이 아니라
       전투용 허트박스끼리 겹치는지로 판정한다(검 판정과 같은 방식, 새 물리 없음).
       체력/데미지는 없다 — MG.Player.onContactHit() 이 순수 연출만 재생한다. */
    checkPlayerContact: function (e, player) {
      if (!MG.Player || !MG.Player.getHurtbox) return;

      var hurt = this.getHurtbox(e);
      var pHurt = MG.Player.getHurtbox();
      if (!MG.Collision.overlaps(hurt.x, hurt.y, hurt.w, hurt.h, pHurt.x, pHurt.y, pHurt.w, pHurt.h)) return;

      e.lungeContactDone = true;
      MG.Player.onContactHit(e.x, e.y);

      var dx = player.x - e.x, dy = player.y - e.y;
      var dist = Math.sqrt(dx * dx + dy * dy) || 1;
      this.spawnParticles(player.x, player.y, 3, dx / dist, dy / dist, 'contact');
    },

    /* ------------------------------------------------------------ 파티클 */
    /* type: 'spark'(모슬링 피격 — 밝은 불빛) | 'moss'(처치 — 기존 이끼색 포프) |
             'contact'(PHASE 6.2: 돌진이 플레이어에 닿음 — 옅은 붉은빛) */
    spawnParticles: function (x, y, count, nx, ny, type) {
      var spdBase = 22, spdRand = 26, lifeBase = 0.22, lifeRand = 0.12, maxLife = 0.34;
      if (type === 'spark') { spdBase = 30; spdRand = 30; lifeBase = 0.14; lifeRand = 0.08; maxLife = 0.22; }
      else if (type === 'contact') { spdBase = 20; spdRand = 18; lifeBase = 0.12; lifeRand = 0.06; maxLife = 0.18; }

      for (var i = 0; i < count; i++) {
        var ang = Math.atan2(ny, nx) + (Math.random() - 0.5) * 2.4;
        var spd = spdBase + Math.random() * spdRand;
        this.particles.push({
          x: x, y: y - 8,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          life: lifeBase + Math.random() * lifeRand,
          maxLife: maxLife,
          type: type || 'moss'
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
      var leanX = 0;
      var windupProgress = 0; // 0~1, 링/눈 펄스에서 재사용

      // PHASE 6.1/6.2: 윈드업/돌진을 몸짓으로 강하게 텔레그래프한다.
      // "윈드업이 잘 안 보인다" 피드백을 받아 6.1 대비 훨씬 크게 웅크리고,
      // 플레이어 쪽으로 살짝 기울며(facingSign 방향), 아래에서 호박색 경고
      // 링까지 더해 세 가지 신호(크기+기울기+색)가 동시에 나가도록 했다.
      if (e.state === 'CHASE' && e.chasePhase === 'windup') {
        windupProgress = 1 - Math.max(0, Math.min(1, e.chaseSubT / WINDUP_DURATION));
        scale *= 1 - 0.30 * windupProgress;               // 6.1: 0.16 → 6.2: 0.30 (훨씬 크게 웅크림)
        leanX = e.facingSign * 2.4 * windupProgress;        // 플레이어(진행) 방향으로 기울기
      } else if (e.state === 'CHASE' && e.chasePhase === 'lunge') {
        scale *= 1.22;
      }

      var bob = (e.state === 'CHASE' || e.state === 'WANDER')
        ? Math.abs(Math.sin(e.animT * 7)) * 1.2
        : Math.sin(e.animT * 1.8) * 0.5;
      var topY = y - bob;
      var bx = x + leanX;   // 윈드업 중 몸통 상단이 진행 방향으로 기우는 위치 (발은 x 에 고정)

      // PHASE 6.2: 돌진 스트레치 트레일 — 튀어나온 방향의 반대편에 옅은 잔상을
      // 한 장 남겨 "쭉 뻗어나간다"는 모션을 보탠다 (칼 트레일과 같은 발상).
      if (e.state === 'CHASE' && e.chasePhase === 'lunge') {
        var trailBack = 3.2;
        ctx.save();
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = C.bodyDark;
        ctx.beginPath();
        ctx.arc(x - e.lungeDX * trailBack, topY - e.lungeDY * trailBack, 4.4 * scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 그림자
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.beginPath();
      ctx.ellipse(Math.round(x), Math.round(y + 1), 6 * scale, 2.2 * scale, 0, 0, Math.PI * 2);
      ctx.fill();

      // PHASE 6.2: 윈드업 경고 링 — 호박색(위협 신호 색)으로 눈 깜빡임과 같은
      // 박자로 펄스한다. 크기/기울기와 별개의 세 번째 신호라서 놓치기 어렵다.
      if (windupProgress > 0) {
        var ringPulse = 0.5 + 0.5 * Math.sin(e.animT * 20);
        ctx.save();
        ctx.globalAlpha = (0.25 + 0.35 * ringPulse) * Math.min(1, windupProgress * 2.2);
        ctx.strokeStyle = '#ffb347';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(bx, topY - 5 * scale, (6.5 + ringPulse * 1.2) * scale, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // 몸통 — 원 세 개를 겹쳐 뭉툭한 이끼 덩어리 실루엣을 만든다 (나무보다 훨씬 작다)
      var lobes = [
        [bx - 3.5 * scale, topY - 3 * scale, 4.2 * scale],
        [bx + 3.5 * scale, topY - 2.6 * scale, 3.8 * scale],
        [bx,                topY - 6 * scale, 4.6 * scale]
      ];
      ctx.fillStyle = C.bodyDark;
      for (var i = 0; i < lobes.length; i++) {
        ctx.beginPath();
        ctx.arc(lobes[i][0], lobes[i][1], lobes[i][2], 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = C.bodyMid;
      ctx.beginPath();
      ctx.arc(bx - 1 * scale, topY - 7 * scale, 3.6 * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.bodyLight;
      ctx.beginPath();
      ctx.arc(bx - 2.4 * scale, topY - 8.4 * scale, 1.9 * scale, 0, Math.PI * 2);
      ctx.fill();

      // 이끼 잎/잔가지 텍스처
      ctx.fillStyle = C.tuft;
      ctx.fillRect(Math.round(bx - 4.6 * scale), Math.round(topY - 9.5 * scale), 2, 2);
      ctx.fillRect(Math.round(bx + 3.4 * scale), Math.round(topY - 8.5 * scale), 2, 2);

      // 눈 — 살짝 이동 방향 쪽으로 치우치고, 추격 중엔 더 밝게 빛난다.
      // 윈드업 중엔 더 빠르고 급하게 깜빡여 "곧 돌진한다"는 경고로 읽히게 한다.
      var glow;
      if (e.state === 'CHASE' && e.chasePhase === 'windup') {
        glow = 0.55 + 0.45 * Math.sin(e.animT * 20);
      } else if (e.state === 'CHASE') {
        glow = 0.75 + 0.25 * Math.sin(e.animT * 9);
      } else {
        glow = 0.45 + 0.2 * Math.sin(e.animT * 2.2);
      }
      var eyeDX = e.facingSign * 1.1 * scale;
      ctx.fillStyle = 'rgba(234, 255, 176, ' + glow.toFixed(2) + ')';
      ctx.fillRect(Math.round(bx - 1.6 * scale + eyeDX), Math.round(topY - 6.2 * scale), 1, 1);
      ctx.fillRect(Math.round(bx + 1.2 * scale + eyeDX), Math.round(topY - 6.2 * scale), 1, 1);
      ctx.fillStyle = C.eyeCore;
      ctx.fillRect(Math.round(bx - 1.6 * scale + eyeDX), Math.round(topY - 6.0 * scale), 1, 1);
      ctx.fillRect(Math.round(bx + 1.2 * scale + eyeDX), Math.round(topY - 6.0 * scale), 1, 1);

      // 피격 플래시 (PHASE 6.1: 넉백과 분리된 짧고 또렷한 플래시)
      if (e.hitFlashT > 0) {
        var flashAlpha = e.hitFlashT / FLASH_DURATION;
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
        if (p.type === 'spark') {
          // 피격 스파크 — 밝고 짧게, 처치 포프와 확실히 구분되는 색
          ctx.fillStyle = 'rgba(255, 244, 196, ' + a.toFixed(2) + ')';
          ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
          ctx.fillStyle = 'rgba(255, 255, 255, ' + (a * 0.6).toFixed(2) + ')';
          ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y), 1, 1);
          ctx.fillRect(Math.round(p.x) + 1, Math.round(p.y), 1, 1);
        } else if (p.type === 'contact') {
          // PHASE 6.2: 접촉 파티클 — player.js 의 붉은 플래시와 같은 계열 색
          ctx.fillStyle = 'rgba(255, 140, 140, ' + a.toFixed(2) + ')';
          ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
        } else {
          ctx.fillStyle = 'rgba(210, 240, 170, ' + a.toFixed(2) + ')';
          ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
        }
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
      var phaseTxt = e.state === 'CHASE' ? '/' + e.chasePhase : '';
      ctx.fillText(e.state + phaseTxt + ' hp=' + e.hp, e.x - 16, e.y - 20);
      ctx.restore();
    }
  };

  MG.Enemy = Enemy;
})(window);
