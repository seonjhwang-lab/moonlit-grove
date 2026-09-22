/* ==========================================================================
   companion.js — 모스키(MOSKI)
   PHASE 9 STEP 2: 엔티티 + 갇힌(TRAPPED) 상태의 모습
   PHASE 9 STEP 3: 영입 조건 + 구출 이벤트
   PHASE 9 STEP 4: 실제 추종 이동

   상태 흐름:
     TRAPPED      공터에 모슬링이 살아 있는 동안. 덩굴에 묶여 있다.
     RECRUITABLE  공터가 정리됨. 가까이 가면 상호작용 버튼이 뜬다.
     RECRUITING   0.8초짜리 구출 연출 중 (덩굴이 풀리고 → 부서지고 → 폴짝).
     FOLLOWING    영입 완료. 루카 뒤를 부드럽게 따라다닌다.
     BRIDGING     덩굴 다리를 놓는 1초 동안. 앵커로 가서 다리를 만든 뒤
                  다시 FOLLOWING 으로 돌아온다.

   의도적으로 하지 않은 것들 (PHASE 11 이후):
     · 보물 상자 열기, 보상, 아이템/인벤토리, 완료 화면

   설계 메모:
     · 범용 "동료 프레임워크"를 만들지 않는다. 모스키 하나뿐이다.
     · 적이 아니다 — MG.Enemy.list 에 들어가지 않으므로 전투 판정과
       AI 대상에서 구조적으로 제외된다.
     · 충돌체가 아니다 — MG.Map.solids 에 등록하지 않으므로 루카의
       이동을 막지 않는다.
   ========================================================================== */
(function (global) {
  'use strict';

  var MG = global.MG = global.MG || {};

  /* map.js 의 GLADES 중 [300, 235, 138] — "작은 공터 (PHASE 9 에서 모스키가
     나타날 곳)" 의 정중앙이다. 플레이어 위치와 무관한 고정 좌표다. */
  var HOME_X = 300;
  var HOME_Y = 235;

  /* 공터 반지름은 map.js 가 이미 갖고 있는 값을 그대로 읽는다(아래
     resolveClearingRadius). 지형 정의를 여기에 복사해 두 번째 진실을
     만들지 않기 위함이다. map.js 를 읽지 못할 때만 쓰는 대비값. */
  var FALLBACK_CLEARING_R = 138;

  /* 상호작용 사거리. 게임 안의 다른 근접 판정(game.js 의 재시작 문구
     70/92)과 같은 히스테리시스 관용구를 쓴다 — 경계에서 버튼이 깜빡이지
     않게 하는 것이 목적이다. */
  var INTERACT_ENTER = 28;
  var INTERACT_LEAVE = 38;

  /* ---------------------------------------------------- STEP 4 추종 이동 */
  /* 루카는 84px/s 로 걷고 발 충돌상자는 11x6 이다. 이 수치들은 그 규모에
     맞춰 잡았다 — 지수 감쇠의 정상상태 지연은 (속도 / 응답값) 이므로,
     아래 값이면 달리는 동안 앵커에서 약 8px 더 뒤처지고, 멈추면 앵커로
     조용히 모인다. */
  var FOLLOW_BACK_X = 18;        // 좌우를 볼 때 뒤로 물러나는 거리
  var FOLLOW_BACK_Y = 13;        // 위아래를 볼 때 (탑다운 원근상 세로는 더 짧게)
  var FOLLOW_RESPONSE = 10;      // 클수록 빠르게 따라붙는다 (지연 = 84/10 ≈ 8px)
  var FOLLOW_DEADZONE = 6;       // 이 안에 들어오면 아예 움직이지 않는다 (미세 떨림 제거)
  var MIN_SEPARATION = 13;       // 루카 안으로 파고들지 않는 최소 시각 거리
  var DAMAGE_REACT_TIME = 0.30;  // 루카가 맞았을 때의 짧은 화들짝 (연출 전용)
  /* 모스키가 낼 수 있는 최고 속도. 루카(84px/s)보다는 빨라야 따라붙지만,
     상한이 없으면 멀리 떨어졌을 때 순간적으로 390px/s 까지 튀어서 생물이
     아니라 커서처럼 보인다 — 실측으로 확인하고 넣은 값이다. */
  var FOLLOW_MAX_SPEED = 150;    // px/s

  /* ------------------------------------------------ PHASE 10 STEP 2 덩굴 다리 */
  /* 능력 사거리. 상호작용(28/38)보다 넉넉하다 — 강둑 앞에서 자연스럽게 서면
     닿아야 하기 때문이다. 경계에서 버튼이 깜빡이지 않도록 여기서도 같은
     히스테리시스 관용구를 쓴다. */
  var ABILITY_ENTER = 50;
  var ABILITY_LEAVE = 62;
  var BRIDGE_DURATION = 1.00;    // 초 — 전체 건설 시간
  var BRIDGE_MOSKI_SPEED = 170;  // px/s — 앵커로 가는 속도(순간이동 금지)

  /* 바라보는 방향 -> 단위 벡터. 매 프레임 객체를 만들지 않기 위한 상수 표다. */
  var FACE_DIR = {
    up:    { x: 0, y: -1 },
    down:  { x: 0, y: 1 },
    left:  { x: -1, y: 0 },
    right: { x: 1, y: 0 }
  };

  /* 구출 연출 타임라인 (초) */
  var RECRUIT_DURATION = 0.80;
  var VINE_LOOSEN_END  = 0.25;   // 0.00~0.25 덩굴이 느슨해지며 빛난다
  var VINE_BREAK_END   = 0.55;   // 0.25~0.55 덩굴이 부서진다
  //                                0.55~0.80 모스키가 루카 쪽으로 폴짝

  /* 모스링(이끼 초록 #5c7a3a~#9fbd5e)과 절대 헷갈리지 않도록 청록/민트 계열로
     완전히 다른 색역을 쓴다. 덩굴은 자연물처럼 보이면 안 되므로 숲에 존재하지
     않는 보라색을 골랐다 — "마법에 묶여 있다"가 색만으로 읽힌다. */
  var C = {
    bodyDark:  '#1f6e63',
    bodyMid:   '#3aa892',
    bodyLight: '#6fd8bb',
    leaf:      '#8ae8c6',
    leafDark:  '#3f9c85',
    eye:       '#f2fffb',
    eyeGlow:   '234, 255, 248',
    vine:      '#7b4fc0',
    vineDark:  '#4a2b7d',
    rune:      '208, 176, 255'
  };

  var Companion = {
    x: HOME_X,
    y: HOME_Y,
    state: 'TRAPPED',
    recruited: false,
    animT: 0,
    stateT: 0,

    _clearingR: FALLBACK_CLEARING_R,
    _inRange: false,        // 히스테리시스가 적용된 "상호작용 가능" 상태
    _promptShown: false,
    _brokeVines: false,     // 덩굴 파편 파티클을 한 번만 터뜨리기 위한 빗장
    _hop: null,             // {fromX, fromY, toX, toY} — 폴짝 한 번의 시작/끝

    /* STEP 4: 추종용 상태. 전부 스칼라라 프레임마다 객체를 만들지 않는다. */
    _wasPlayerDead: false,  // 사망 -> 부활 전이를 잡기 위한 이전 프레임 값
    _prevHitFlash: 0,       // 루카 피격을 감지하기 위한 이전 프레임 값
    _reactT: 0,             // 피격 반응 남은 시간 (렌더에만 쓰인다)
    _moveT: 0,              // 0~1, 지금 얼마나 움직이고 있는가 (애니메이션용)
    _abilityInRange: false, // PHASE 10-2: 히스테리시스가 적용된 능력 사용 가능 상태
    _abilityShown: false,

    /* 항상 갇힌 초기 상태로 되돌린다. 부팅 시 main.js 가, 세션 재시작 시
       game.js 의 restartSession() 이 부른다. */
    init: function () {
      this.x = HOME_X;
      this.y = HOME_Y;
      this.state = 'TRAPPED';
      this.recruited = false;
      this.animT = 0;
      this.stateT = 0;
      this._inRange = false;
      this._brokeVines = false;
      this._hop = null;
      this._wasPlayerDead = false;
      this._prevHitFlash = 0;
      this._reactT = 0;
      this._moveT = 0;
      this._abilityInRange = false;
      this._clearingR = this.resolveClearingRadius();
      this.hidePrompt();
      this.hideAbility();
      return true;
    },

    /* 공터 반지름을 map.js 의 GLADES 에서 찾아온다 — 지형의 진실은 한 곳에만
       있어야 한다. 못 찾으면 대비값을 쓴다(게임이 멈추지는 않는다). */
    resolveClearingRadius: function () {
      var g = MG.Map && MG.Map.GLADES;
      if (g) {
        for (var i = 0; i < g.length; i++) {
          if (g[i][0] === HOME_X && g[i][1] === HOME_Y) return g[i][2];
        }
      }
      return FALLBACK_CLEARING_R;
    },

    /* --------------------------------------------------------------- 갱신 */
    update: function (dt) {
      this.animT += dt;
      this.stateT += dt;

      if (this.state === 'TRAPPED') {
        if (this.isClearingSecured()) this.setState('RECRUITABLE');

      } else if (this.state === 'RECRUITABLE') {
        this.updatePrompt();
        if (this._inRange && MG.Input && MG.Input.interactPressed) {
          this.beginRecruit();
        }

      } else if (this.state === 'RECRUITING') {
        this.updateRecruiting();

      } else if (this.state === 'FOLLOWING') {
        this.updateFollowing(dt);
        this.updateAbility();

      } else if (this.state === 'BRIDGING') {
        this.updateBridging(dt);
      }
    },

    /* ------------------------------------------ PHASE 10 STEP 2 덩굴 다리 */
    /* 능력 버튼은 "모스키가 있어서"가 아니라 "지금 여기서 다리를 놓을 수 있어서"
       뜬다. 네 조건이 모두 맞아야 한다: 영입됨 + FOLLOWING + 아직 다리가 없음
       + 앵커 근처. 하나라도 어긋나면 버튼도 사라지고 Q 도 아무 일을 하지 않는다. */
    canUseAbility: function () {
      if (!this.recruited || this.state !== 'FOLLOWING') return false;
      if (MG.Game && MG.Game.bridgeActivated) return false;
      var p = MG.Player;
      if (!p || p.state === 'DEAD') return false;
      return true;
    },

    updateAbility: function () {
      if (!this.canUseAbility()) { this._abilityInRange = false; this.hideAbility(); return; }

      var a = MG.Map && MG.Map.vineAnchor;
      var p = MG.Player;
      if (!a) { this._abilityInRange = false; this.hideAbility(); return; }

      var dx = p.x - a.x, dy = p.y - a.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (!this._abilityInRange && dist <= ABILITY_ENTER) this._abilityInRange = true;
      else if (this._abilityInRange && dist > ABILITY_LEAVE) this._abilityInRange = false;

      if (this._abilityInRange) this.showAbility(); else this.hideAbility();

      if (this._abilityInRange && MG.Input && MG.Input.abilityPressed) {
        this.beginBridge();
      }
    },

    showAbility: function () {
      if (this._abilityShown) return;
      this._abilityShown = true;
      if (MG.UI && MG.UI.showAbility) MG.UI.showAbility();
    },

    hideAbility: function () {
      if (!this._abilityShown) return;
      this._abilityShown = false;
      if (MG.UI && MG.UI.hideAbility) MG.UI.hideAbility();
    },

    /* 다리 놓기 시작. 컷신이 아니다 — 루카는 그동안에도 자유롭게 움직이고
       검도 그대로 쓸 수 있다. 모스키만 잠시 따라다니기를 멈춘다. */
    beginBridge: function () {
      if (this.state !== 'FOLLOWING') return;        // 중복 진입 차단
      if (MG.Game && MG.Game.bridgeActivated) return; // 이미 놓았다

      this.setState('BRIDGING');
      this.hideAbility();
      if (MG.Map && MG.Map.bridge) MG.Map.bridge.t = 0;
      if (MG.Audio && MG.Audio.playVineBridge) MG.Audio.playVineBridge();
    },

    updateBridging: function (dt) {
      var M = MG.Map;
      var a = M && M.vineAnchor;
      if (!a) { this.setState('FOLLOWING'); return; }

      // 모스키가 앵커로 "걸어서" 간다 (순간이동하지 않는다)
      var dx = a.x - this.x, dy = a.y - this.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d > 2) {
        var step = Math.min(d, BRIDGE_MOSKI_SPEED * dt);
        this.x += (dx / d) * step;
        this.y += (dy / d) * step;
        this._moveT = 1;
      } else {
        this._moveT += (0 - this._moveT) * (1 - Math.exp(-6 * dt));
      }

      // 건설 진행도 — map.js 의 renderBridge 가 이 값 하나로 가닥/바닥/빛을 만든다
      var t = Math.min(1, this.stateT / BRIDGE_DURATION);
      if (M.bridge) M.bridge.t = t;

      // 덩굴 가닥이 뻗기 시작하는 순간과 바닥이 깔리는 순간에만 파티클을 뿌린다
      // (기존 파티클 시스템 그대로 — 새 엔진을 만들지 않는다)
      if (!this._sparkA && this.stateT >= 0.20) {
        this._sparkA = true;
        if (MG.Enemy && MG.Enemy.spawnParticles) {
          MG.Enemy.spawnParticles(a.x + 6, a.y - 2, 10, 1, 0, 'moss');
        }
      }
      if (!this._sparkB && this.stateT >= 0.55) {
        this._sparkB = true;
        if (MG.Enemy && MG.Enemy.spawnParticles) {
          var midX = (M.RIVER.x + M.RIVER.w / 2);
          MG.Enemy.spawnParticles(midX, M.BRIDGE_Y - 2, 12, 0, -1, 'moss');
        }
      }

      if (this.stateT >= BRIDGE_DURATION) {
        // 다리가 "눈에 보이게 완성된 뒤"에야 통행이 열린다
        if (M.bridge) { M.bridge.built = true; M.bridge.t = 1; }
        if (M.setBridgeOpen) M.setBridgeOpen(true);
        if (MG.Game) MG.Game.bridgeActivated = true;

        if (MG.Enemy && MG.Enemy.spawnParticles) {
          MG.Enemy.spawnParticles(M.RIVER.x + M.RIVER.w / 2, M.BRIDGE_Y - 2, 16, 0, -1, 'reward');
        }
        if (MG.UI && MG.UI.showToast) MG.UI.showToast('덩굴 다리가 완성되었다.');

        this._sparkA = false;
        this._sparkB = false;
        this.setState('FOLLOWING');   // 곧바로 다시 루카를 따라간다
      }
    },

    /* ------------------------------------------------- STEP 4 추종 이동 */
    /* 물리 엔진도, 길찾기도, A* 도 아니다. 매 프레임 하는 일은
         (1) 루카 뒤의 목표점을 구하고
         (2) 지수 감쇠로 그쪽으로 조금 다가가고
         (3) 너무 붙었으면 부드럽게 밀어내는 것
       셋뿐이다. 새 배열도, 새 객체도 만들지 않는다. */
    updateFollowing: function (dt) {
      var p = MG.Player;
      if (!p) return;

      // --- 부활 감지: 사망 -> 생존 전이. game.js 가 Player.update() 를 먼저
      //     돌리므로, 부활한 그 프레임에 이미 새 좌표가 들어와 있다. player.js
      //     에 훅을 넣지 않고 상태 전이만 관찰하면 된다. ---
      var dead = (p.state === 'DEAD');
      if (this._wasPlayerDead && !dead) {
        this.snapBehindPlayer(p);      // 죽은 자리에서 맵을 가로질러 날아오지 않는다
      }
      this._wasPlayerDead = dead;

      // --- 사망 중: 옛 목표를 계속 쫓지 않는다. 그 자리에 머물며 떠 있는다. ---
      if (dead) {
        this._moveT += (0 - this._moveT) * (1 - Math.exp(-6 * dt));
        return;
      }

      // --- 루카 피격 반응: 전투 코드에 손대지 않고 결과 상태만 관찰한다.
      //     hitFlashT 는 onContactHit 에서만 올라가므로 상승 edge 가 곧 피격이다. ---
      if (p.hitFlashT > this._prevHitFlash) this._reactT = DAMAGE_REACT_TIME;
      this._prevHitFlash = p.hitFlashT;
      if (this._reactT > 0) this._reactT = Math.max(0, this._reactT - dt);

      // --- (1) 루카 뒤의 목표점 ---
      var d = FACE_DIR[p.facing] || FACE_DIR.down;
      var ax = p.x - d.x * FOLLOW_BACK_X;
      var ay = p.y - d.y * FOLLOW_BACK_Y;

      // --- (2) 지수 감쇠로 다가간다. 목표점에 정확히 붙는 대신 데드존
      //     경계까지만 좁혀서, 가까워졌을 때 미세하게 떠는 일이 없게 한다.
      //     감쇠는 절대 목표를 지나치지 않으므로 진동도 생기지 않는다. ---
      var dx = ax - this.x, dy = ay - this.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var moved = 0;

      if (dist > FOLLOW_DEADZONE) {
        var f = 1 - Math.exp(-FOLLOW_RESPONSE * dt);
        var step = (dist - FOLLOW_DEADZONE) * f;
        var maxStep = FOLLOW_MAX_SPEED * dt;       // 생물답게 — 순간이동처럼 보이지 않게
        if (step > maxStep) step = maxStep;
        this.x += (dx / dist) * step;
        this.y += (dy / dist) * step;
        moved = step;
      }

      // --- (3) 소프트 분리. 루카는 절대 밀지 않는다 — 모스키만 비켜난다.
      //     방향을 홱 바꿔 앵커가 반대편으로 건너뛸 때, 이 밀어내기가 직선
      //     통과를 막아 루카를 돌아가는 호를 만든다. ---
      var sx = this.x - p.x, sy = this.y - p.y;
      var sd = Math.sqrt(sx * sx + sy * sy);
      if (sd < MIN_SEPARATION) {
        if (sd < 0.0001) { sx = 0; sy = 1; sd = 1; }   // 완전히 겹친 예외
        // 감쇠로 "서서히" 밀어내면 방향 반전 순간에 당기는 힘과 루카의 이동을
        // 둘 다 이기지 못해 실측 3.2px 까지 파고들었다(= 루카 몸 안). 그래서
        // 위치 제약으로 바꾸어 반지름 13px 원 밖으로 즉시 투영한다. 들어오는
        // 움직임 자체가 이미 부드럽기 때문에 투영된 위치도 연속적이라 떨림이
        // 생기지 않고, 오히려 루카를 돌아 나가는 호가 자연스럽게 만들어진다.
        moved += (MIN_SEPARATION - sd);
        this.x = p.x + (sx / sd) * MIN_SEPARATION;
        this.y = p.y + (sy / sd) * MIN_SEPARATION;
      }

      // --- 애니메이션용 이동량. 움직일 때 조금 더 크게 흔들린다(L 항). ---
      var target = Math.min(1, (moved / Math.max(dt, 0.0001)) / 60);
      this._moveT += (target - this._moveT) * (1 - Math.exp(-8 * dt));
    },

    /* 부활 직후처럼 "지금 즉시 루카 옆에 있어야" 할 때만 쓴다. 평상시
       추종은 절대 이 함수를 쓰지 않는다(순간이동처럼 보이면 안 된다). */
    snapBehindPlayer: function (p) {
      var d = FACE_DIR[p.facing] || FACE_DIR.down;
      this.x = p.x - d.x * FOLLOW_BACK_X;
      this.y = p.y - d.y * FOLLOW_BACK_Y;
      this._moveT = 0;
      this._reactT = 0;
      this._prevHitFlash = p.hitFlashT;
    },

    setState: function (next) {
      if (this.state === next) return;
      this.state = next;
      this.stateT = 0;
      if (next !== 'RECRUITABLE') this.hidePrompt();
      if (next !== 'FOLLOWING') { this._abilityInRange = false; this.hideAbility(); }
      if (next === 'BRIDGING') { this._sparkA = false; this._sparkB = false; }
    },

    /* 공터가 정리되었는가.
       "현재 위치"가 아니라 "집(homeX/homeY)"으로 소속을 판정한다. 모슬링을
       공터 밖으로 유인해 두고 죽이지 않은 채 영입하는 우회를 막기 위해서다
       (추격 중인 모슬링은 집에서 최대 260px 까지 벗어날 수 있으므로 현재
       위치로 재면 유인만으로 조건이 충족돼 버린다). 집 좌표는 절대 바뀌지
       않으므로 이 판정은 유인에 완전히 면역이고, 경계에서 깜빡이지도 않는다. */
    isClearingSecured: function () {
      var list = (MG.Enemy && MG.Enemy.list) || [];
      var r2 = this._clearingR * this._clearingR;
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        if (e.state === 'DEAD') continue;
        var hx = (e.homeX !== undefined) ? e.homeX : e.x;
        var hy = (e.homeY !== undefined) ? e.homeY : e.y;
        var dx = hx - HOME_X, dy = hy - HOME_Y;
        if (dx * dx + dy * dy <= r2) return false;   // 아직 이 공터의 모슬링이 살아 있다
      }
      return true;
    },

    /* 상호작용 버튼은 "모스키가 존재해서"가 아니라 "지금 상호작용할 수 있어서"
       뜬다. RECRUITABLE + 사거리 안 + 플레이어 생존, 세 조건이 모두 맞을 때만. */
    updatePrompt: function () {
      var p = MG.Player;
      if (!p || p.state === 'DEAD') { this.hidePrompt(); this._inRange = false; return; }

      var dx = p.x - this.x, dy = p.y - this.y;
      var dist = Math.sqrt(dx * dx + dy * dy);

      if (!this._inRange && dist <= INTERACT_ENTER) this._inRange = true;
      else if (this._inRange && dist > INTERACT_LEAVE) this._inRange = false;

      if (this._inRange) this.showPrompt();
      else this.hidePrompt();
    },

    showPrompt: function () {
      if (this._promptShown) return;
      this._promptShown = true;
      if (MG.UI && MG.UI.showInteract) MG.UI.showInteract();
    },

    hidePrompt: function () {
      if (!this._promptShown) return;
      this._promptShown = false;
      if (MG.UI && MG.UI.hideInteract) MG.UI.hideInteract();
    },

    /* ------------------------------------------------------- 구출 이벤트 */
    /* 컷신 프레임워크가 아니다. 게임은 계속 돌아가고, 여기서 하는 일은
       0.8초 동안 자기 상태 하나를 진행시키는 것뿐이다. */
    beginRecruit: function () {
      if (this.state !== 'RECRUITABLE') return;   // 중복 진입 차단

      this.setState('RECRUITING');
      this._brokeVines = false;
      this._hop = null;
      this.hidePrompt();                          // 버튼은 즉시 사라진다

      if (MG.Audio && MG.Audio.playCompanionRecruit) MG.Audio.playCompanionRecruit();
    },

    updateRecruiting: function () {
      var t = this.stateT;

      // 0.25초 — 덩굴이 부서지는 순간. 파티클은 딱 한 번만 터진다.
      if (!this._brokeVines && t >= VINE_LOOSEN_END) {
        this._brokeVines = true;
        if (MG.Enemy && MG.Enemy.spawnParticles) {
          // 기존 파티클 시스템을 그대로 쓴다 — 새 타입도, 새 엔진도 만들지 않는다
          MG.Enemy.spawnParticles(this.x, this.y - 1, 14, 0, -1, 'reward');
        }
      }

      // 0.55초 — 루카 쪽으로 폴짝. 목표 지점은 이 순간 딱 한 번만 계산한다
      // (매 프레임 다시 겨냥하면 그건 이미 추종 로직이다 — STEP 4 의 몫).
      if (!this._hop && t >= VINE_BREAK_END) {
        var p = MG.Player;
        var tx = this.x, ty = this.y;
        if (p) {
          var dx = p.x - this.x, dy = p.y - this.y;
          var d = Math.sqrt(dx * dx + dy * dy) || 1;
          var settle = Math.max(0, d - 16);       // 루카 앞 16px 쯤에 내려앉는다
          tx = this.x + (dx / d) * settle;
          ty = this.y + (dy / d) * settle;
        }
        this._hop = { fromX: this.x, fromY: this.y, toX: tx, toY: ty };
      }

      if (this._hop) {
        var hp = Math.min(1, (t - VINE_BREAK_END) / (RECRUIT_DURATION - VINE_BREAK_END));
        var e = 1 - (1 - hp) * (1 - hp);          // ease-out
        this.x = this._hop.fromX + (this._hop.toX - this._hop.fromX) * e;
        this.y = this._hop.fromY + (this._hop.toY - this._hop.fromY) * e;
      }

      if (t >= RECRUIT_DURATION) {
        this.setState('FOLLOWING');
        this.recruited = true;
        if (MG.UI && MG.UI.showToast) MG.UI.showToast('모스키가 당신을 따라오기로 했습니다!');
      }
    },

    /* --------------------------------------------------------------- 수집 */
    /* game.js 의 Y 정렬 큐에 자신을 넣는다. 모슬링(Enemy.collect)과 완전히
       같은 형식/컬링 여유(40px)를 쓰므로 나무·바위·플레이어와 발 높이(y)
       기준으로 자연스럽게 앞뒤가 정해진다 — 항상 위에 그려지지 않는다. */
    collect: function (out, cam) {
      if (this.x < cam.x - 40 || this.x > cam.x + cam.w + 40) return out;
      if (this.y < cam.y - 40 || this.y > cam.y + cam.h + 40) return out;
      out.push({ y: this.y, kind: 'companion', obj: this });
      return out;
    },

    renderOne: function (ctx, m) {
      m = m || this;
      this.drawBody(ctx, m);
    },

    /* --------------------------------------------------------------- 그리기 */
    drawBody: function (ctx, m) {
      var x = m.x, y = m.y;

      // 구출 연출 진행도 — 덩굴이 얼마나 풀렸는가 (0 묶임 → 1 완전히 사라짐)
      var loosen = 0, breakP = 0;
      if (m.state === 'RECRUITING') {
        loosen = Math.min(1, m.stateT / VINE_LOOSEN_END);
        if (m.stateT > VINE_LOOSEN_END) {
          breakP = Math.min(1, (m.stateT - VINE_LOOSEN_END) / (VINE_BREAK_END - VINE_LOOSEN_END));
        }
      } else if (m.state === 'FOLLOWING') {
        loosen = 1; breakP = 1;
      }
      var freed = breakP >= 1;

      // 풀려난 뒤에는 더 가볍게 떠오른다 — 자유로워졌다는 걸 몸짓으로 보여준다.
      // STEP 4: 따라 움직이는 동안에는 세로 흔들림이 조금 더 커지고 빨라지고,
      // 멈추면 다시 잔잔해진다(_moveT 가 0~1 사이를 부드럽게 오간다).
      var mv = m._moveT || 0;
      var hoverAmp = (freed ? 2.1 : 1.3) + mv * 1.1;
      var hoverSpd = (freed ? 2.6 : 1.6) + mv * 3.4;
      var hover = Math.sin(m.animT * hoverSpd) * hoverAmp;

      // STEP 4: 루카가 맞았을 때의 짧은 화들짝 — 위로 살짝 튀었다가 가라앉는다.
      // 전투에 개입하지 않는 순수 연출이며, 추종 좌표는 건드리지 않는다.
      var react = 0;
      if (m._reactT > 0) {
        var rp = m._reactT / 0.30;                 // 1 -> 0
        react = -Math.sin(rp * Math.PI) * 3.4;
      }

      // 폴짝 뛰는 동안의 포물선
      var hopArc = 0;
      if (m.state === 'RECRUITING' && m._hop) {
        var hp = Math.min(1, (m.stateT - VINE_BREAK_END) / (RECRUIT_DURATION - VINE_BREAK_END));
        hopArc = -Math.sin(hp * Math.PI) * 6;
      }

      var breath = 1 + Math.sin(m.animT * 2.4) * 0.04;
      var topY = y - 7 + hover + hopArc + react;

      // 바닥 그림자 — 떠 있는 만큼 옅고 작아진다 (부유감을 만드는 값싼 신호)
      var lift = (hover + hoverAmp) / (hoverAmp * 2) + (-hopArc / 12) + (-react / 7);
      lift = Math.max(0, Math.min(1.4, lift));
      ctx.save();
      ctx.globalAlpha = Math.max(0.06, 0.30 - 0.14 * lift);
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.ellipse(Math.round(x), Math.round(y + 1),
                  (5.2 - 0.9 * lift), (1.9 - 0.4 * lift), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 뒤쪽 덩굴 — 몸통보다 먼저 그려 "감고 있다"는 앞뒤 관계를 만든다
      if (!freed) this.drawVines(ctx, x, topY, m.animT, true, loosen, breakP);

      // 은은한 청록 오라 (몸통 뒤). 풀려난 직후에는 잠깐 더 밝게 빛난다.
      var auraPulse = 0.5 + 0.5 * Math.sin(m.animT * 1.9);
      var auraBoost = (m.state === 'RECRUITING' && breakP > 0) ? breakP * 0.9 : 0;
      ctx.save();
      ctx.globalAlpha = 0.10 + 0.06 * auraPulse + 0.18 * auraBoost;
      ctx.fillStyle = C.bodyLight;
      ctx.beginPath();
      ctx.arc(x, topY, 9.5 + auraPulse * 1.2 + auraBoost * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 잎 모양 귀 — 모슬링의 잔가지 텍스처와 달리 좌우 대칭의 또렷한 실루엣
      var earFlap = Math.sin(m.animT * (freed ? 3.4 : 1.6)) * (freed ? 0.9 : 0.5);
      ctx.fillStyle = C.leafDark;
      this.drawLeaf(ctx, x - 4.6, topY - 3.2 + earFlap, -1);
      this.drawLeaf(ctx, x + 4.6, topY - 3.2 - earFlap, 1);
      ctx.fillStyle = C.leaf;
      this.drawLeaf(ctx, x - 4.4, topY - 3.6 + earFlap, -1);
      this.drawLeaf(ctx, x + 4.4, topY - 3.6 - earFlap, 1);

      // 몸통 — 모슬링은 원 세 개를 겹친 울퉁불퉁한 덩어리지만, 모스키는
      // 매끈한 물방울 하나다. 실루엣만으로 둘이 구분된다.
      var r = 5.4 * breath;
      ctx.fillStyle = C.bodyDark;
      ctx.beginPath();
      ctx.arc(x, topY, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.bodyMid;
      ctx.beginPath();
      ctx.arc(x, topY - 0.5, r - 1.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.bodyLight;
      ctx.beginPath();
      ctx.arc(x - 1.6, topY - 1.9, r * 0.42, 0, Math.PI * 2);
      ctx.fill();

      // 눈 — 갇혀 있을 땐 느리고 여리게, 풀려난 뒤엔 또렷하게 빛난다
      var eyeGlow = freed
        ? 0.80 + 0.20 * Math.sin(m.animT * 3.2)
        : 0.55 + 0.30 * Math.sin(m.animT * 1.4);
      ctx.fillStyle = 'rgba(' + C.eyeGlow + ', ' + eyeGlow.toFixed(2) + ')';
      ctx.fillRect(Math.round(x - 2.2), Math.round(topY - 0.8), 2, 2);
      ctx.fillRect(Math.round(x + 0.6), Math.round(topY - 0.8), 2, 2);
      ctx.fillStyle = C.eye;
      ctx.fillRect(Math.round(x - 2.0), Math.round(topY - 0.6), 1, 1);
      ctx.fillRect(Math.round(x + 0.8), Math.round(topY - 0.6), 1, 1);

      // 앞쪽 덩굴 — 몸통 위를 가로질러 지나가야 비로소 "묶여 있다"로 읽힌다
      if (!freed) this.drawVines(ctx, x, topY, m.animT, false, loosen, breakP);
    },

    /* 잎 귀 하나. dir 이 -1 이면 왼쪽, 1 이면 오른쪽으로 뻗는다. */
    drawLeaf: function (ctx, cx, cy, dir) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, 3.0, 1.5, dir * -0.5, 0, Math.PI * 2);
      ctx.fill();
    },

    /* 마법 덩굴. back=true 면 몸통 뒤, false 면 몸통 앞을 지나는 가닥들이다.
       평범한 식물이 아니라 "구속"으로 보이도록, 규칙적인 나선 + 보라색 룬
       점멸을 쓴다. 발자국은 작게 유지해 공터를 가리지 않는다.

       loosen(0~1): 구출 시작 직후 고리가 살짝 벌어지며 룬이 밝아진다.
       breakP(0~1): 고리가 바깥으로 흩어지며 사라진다. 새 파티클 엔진을
       만들지 않고, 이 엔티티가 자기 덩굴을 직접 그려 부순다. */
    drawVines: function (ctx, x, topY, t, back, loosen, breakP) {
      var pulse = 0.5 + 0.5 * Math.sin(t * 2.1 + (back ? 0 : Math.PI * 0.5));
      var strands = back
        ? [{ ry: -3.2, tilt: 0.35 }, { ry: 3.4, tilt: -0.28 }]
        : [{ ry: 0.2, tilt: -0.12 }, { ry: -6.0, tilt: 0.5 }];

      var fade = 1 - breakP;
      if (fade <= 0) return;

      ctx.save();
      ctx.lineCap = 'round';

      for (var i = 0; i < strands.length; i++) {
        var s = strands[i];
        // 풀리면 고리가 벌어지고, 부서지면 바깥으로 흩어진다
        var spread = 1 + loosen * 0.18 + breakP * 1.5;
        var rx = (8.2 - i * 0.8) * spread;
        var ry = 2.6 * spread;
        var tilt = s.tilt + breakP * (i % 2 ? -0.9 : 0.9);   // 흩어지며 회전한다
        var cy = topY + s.ry * (1 + breakP * 1.2);

        ctx.globalAlpha = (back ? 0.75 : 0.95) * fade;
        ctx.strokeStyle = C.vineDark;
        ctx.lineWidth = 2.0 * fade;
        ctx.beginPath();
        ctx.ellipse(x, cy, rx, ry, tilt, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = C.vine;
        ctx.lineWidth = 1.0 * fade;
        ctx.beginPath();
        ctx.ellipse(x, cy, rx, ry, tilt, 0, Math.PI * 2);
        ctx.stroke();

        // 룬 — 덩굴 좌우 끝에 박힌 작은 빛점. 풀리는 동안 더 밝게 맥동한다.
        var runeA = ((back ? 0.35 : 0.55) + 0.35 * pulse + loosen * 0.45) * fade;
        ctx.globalAlpha = Math.min(1, runeA);
        ctx.fillStyle = 'rgb(' + C.rune + ')';
        var ox = Math.cos(tilt) * rx, oy = Math.sin(tilt) * rx;
        ctx.fillRect(Math.round(x - ox), Math.round(cy - oy), 1, 1);
        ctx.fillRect(Math.round(x + ox), Math.round(cy + oy), 1, 1);
      }

      ctx.restore();
    }
  };

  MG.Companion = Companion;
})(window);
