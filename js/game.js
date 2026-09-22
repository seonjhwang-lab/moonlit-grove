/* ==========================================================================
   game.js — 게임 루프 / 전체 게임 상태 / 캔버스 반응형 스케일
   v0.1.1 PORTRAIT CONVERSION:
     - 내부 해상도를 세로형 360x640 (9:16) 로 전환 (기존 480x270 16:9 폐기)
     - resize() 의 비율-맞춤 로직 자체는 해상도에 무관하게 동작하므로
       INTERNAL_W/H 상수만 바꾸면 카메라·렌더 파이프라인이 함께 따라온다
     - 상태 머신(BOOT / TITLE / PLAY)의 뼈대
     - 델타타임 기반 메인 루프
   ========================================================================== */
(function (global) {
  'use strict';

  var MG = global.MG = global.MG || {};

  // v0.1.1: 모바일 세로 플레이가 기본 화면이다 (9:16).
  // 데스크톱에서는 이 세로 무대가 화면 중앙에 최대 크기로 축소 표시된다 (style.css 참고).
  var INTERNAL_W = 360;
  var INTERNAL_H = 640;
  var MAX_DT = 0.05;      // 탭 전환 후 큰 점프 방지 (초)

  // 개발용 디버그 오버레이. true 로 바꾸면 화면 크기/카메라/입력 상태를 표시한다.
  var DEBUG_MOBILE_LAYOUT = false;

  // PHASE 6.1: 타격이 성공했을 때 아주 짧게 게임 진행을 슬로우모션으로 늦춰
  // "탁 걸리는" 손맛을 준다. 완전히 멈추면(dt=0) 애니메이션/타이머가 이상하게
  // 얼어붙을 수 있어 0에 아주 가깝지만 0은 아닌 배율을 쓴다 — 그래서 이동/공격
  // 쿨다운 등 기존 타이밍 코드를 손대지 않고도 "거의 정지"처럼 보인다.
  var HITSTOP_SCALE = 0.06;

  /* PHASE 8.1: 정화(THE CLEANSING) 연출 상수.
     파동은 화면(360x640)의 대각 절반(~367)보다 넉넉히 크게 퍼져 맵 위 남은
     모슬링까지 닿는다. 게임을 멈추지 않고, 컷신도 없다 — 그냥 짧고 강한
     한 번의 파동이다. */
  var CLEANSE_DURATION = 1.0;      // 초 — 파동이 다 퍼지는 데 걸리는 시간
  var CLEANSE_MAX_RADIUS = 560;    // 월드 픽셀 — 가장 먼 스폰 지점까지 덮는다
  var CLEANSE_FLASH = 0.18;        // 초 — 활성화 순간의 짧은 화면 섬광
  var ATMOSPHERE_FADE = 1.4;       // 초 — 숲이 밝아지는 데 걸리는 시간

  /* PHASE 9.1: 정화가 끝난 뒤, 플레이어가 스스로 처음 출발했던 공터로 돌아오면
     "다시 모험하기"를 조용히 권한다. 강제하지 않는다 — 정화된 숲을 마음껏
     돌아다니다가 돌아왔을 때만 나타난다.
     경계에서 문구가 깜빡이지 않도록 들어올 때와 나갈 때 반경을 다르게 둔다
     (모슬링 감지의 DETECT_RADIUS/LEAVE_RADIUS 와 같은 히스테리시스 방식). */
  var RESTART_ENTER_RADIUS = 70;   // 이 안으로 들어오면 문구가 뜬다
  var RESTART_LEAVE_RADIUS = 92;   // 이 밖으로 나가야 사라진다

  /* PHASE 10 STEP 3: 보물 상자.
     사거리는 모스키 상호작용(28/38)과 같은 값을 쓴다 — 같은 버튼, 같은 입력,
     같은 체감이어야 하기 때문이다. 경계에서 깜빡이지 않도록 히스테리시스도 동일. */
  var TREASURE_ENTER = 28;
  var TREASURE_LEAVE = 38;
  var TREASURE_OPEN_TIME = 0.55;   // 초 — 뚜껑이 열리는 연출 (게임은 멈추지 않는다)

  var Game = {
    VERSION: '0.1.11',
    WIDTH: INTERNAL_W,
    HEIGHT: INTERNAL_H,
    DEBUG_MOBILE_LAYOUT: DEBUG_MOBILE_LAYOUT,

    canvas: null,
    ctx: null,
    stage: null,

    state: 'BOOT',        // BOOT | TITLE | PLAY
    running: false,
    paused: false,        // 세로 방향 경고 등으로 인한 일시정지
    time: 0,              // 누적 경과 시간(초)
    frame: 0,
    hitStopT: 0,           // PHASE 6.1: 남은 히트스탑 시간(실시간 초)

    /* PHASE 8: 첫 게임 목표(달의 돌) 진행 플래그. 퀘스트 프레임워크가 아니라
       불린 하나다. 이번 세션 동안만 유지되며(로컬스토리지/서버 저장 없음),
       사망/부활로는 절대 되돌아가지 않는다 — Player.respawn() 은 모슬링만
       MG.Enemy.init() 으로 되돌리고 이 값은 건드리지 않기 때문이다. */
    moonstoneFound: false,
    /* PHASE 10 STEP 1: 덩굴 다리의 상태 자리만 만들어 둔다.
       이 단계에서는 누구도 true 로 바꾸지 않는다 — 능력(STEP 2)이 생기면
       그때 이 플래그를 켜고, 그때 비로소 강의 충돌을 걷어내게 된다.
       지금은 항상 false 이며, 따라서 강은 계속 막혀 있다. */
    bridgeActivated: false,

    // PHASE 10 STEP 3: 상자 상호작용 버튼 상태 캐시 (DOM 을 매 프레임 건드리지
    // 않기 위한 것 — companion.js 의 _promptShown 과 같은 방식)
    _treasureInRange: false,
    _treasurePromptShown: false,

    /* PHASE 8.1-B: 숲이 정화되었는가. moonstoneFound 와 마찬가지로 이번
       세션 동안만 유지되는 불린 하나이며, 사망/부활로 절대 되돌아가지
       않는다(Player.respawn() 은 이 값을 건드리지 않는다). 저장 시스템 없음. */
    cleansed: false,

    // 정화 파동이 퍼지는 동안에만 존재하는 임시 상태 { t, x, y }
    cleanse: null,

    // 0 = 정화 전(어둡고 무겁게) → 1 = 정화 후(달빛이 든 것처럼 밝게)
    atmosphere: 0,

    // PHASE 9.1: "다시 모험하기" 문구가 지금 떠 있는가 (DOM 을 매 프레임
    // 건드리지 않고 상태가 바뀔 때만 갱신하기 위한 캐시)
    _restartPromptShown: false,

    _lastTs: 0,
    _rafId: 0,

    /* ---------------------------------------------------------------- init */
    init: function () {
      this.canvas = document.getElementById('game-canvas');
      if (!this.canvas) {
        console.error('[MG] game-canvas 를 찾을 수 없습니다.');
        return false;
      }
      this.stage = document.getElementById('stage');
      this.root = document.getElementById('game-root');
      this.ctx = this.canvas.getContext('2d', { alpha: false });

      this.canvas.width = INTERNAL_W;
      this.canvas.height = INTERNAL_H;
      this.ctx.imageSmoothingEnabled = false;

      // 화면 크기 / 방향 변화 대응
      var self = this;
      this._onResize = function () { self.resize(); };
      global.addEventListener('resize', this._onResize);
      global.addEventListener('orientationchange', this._onResize);
      if (global.visualViewport) {
        global.visualViewport.addEventListener('resize', this._onResize);
      }
      // 컨테이너 크기가 늦게 확정되는 환경(임베드 뷰 등)까지 확실히 따라간다
      if (global.ResizeObserver && this.root) {
        this._ro = new global.ResizeObserver(this._onResize);
        this._ro.observe(this.root);
      }

      // 안전망: 일부 모바일 브라우저는 주소창 접힘/회전 시 resize 이벤트를 누락한다.
      this._pollId = global.setInterval(function () {
        var v = self.viewportSize();
        if (v.w > 0 && v.h > 0 && (v.w !== self._lastVW || v.h !== self._lastVH)) self.resize();
      }, 500);

      this.resize();
      this.state = 'TITLE';
      // PHASE 9 폴리시: 타이틀 동안에는 조작 컨트롤을 숨긴다(style.css 의
      // body:not(.mg-playing) 규칙). 상태와 함께 켜고 끄므로 타이머가 필요 없다.
      document.body.classList.remove('mg-playing');
      this.start();
      return true;
    },

    /* 현재 사용 가능한 화면 크기.
       모바일 브라우저의 주소창/키보드 변화는 visualViewport 가 더 정확하다. */
    viewportSize: function () {
      var w = (this.root && this.root.clientWidth) || global.innerWidth || 0;
      var h = (this.root && this.root.clientHeight) || global.innerHeight || 0;
      var vvp = global.visualViewport;
      if (vvp && vvp.width > 0 && vvp.height > 0) {
        w = Math.min(w, vvp.width);
        h = Math.min(h, vvp.height);
      }
      return { w: w, h: h };
    },

    /* -------------------------------------------------------------- resize
       내부 해상도 비율(9:16)을 유지하면서 뷰포트 안에 최대 크기로 맞춘다.
       세로로 긴 화면(휴대폰)에서는 거의 꽉 차고, 가로로 넓은 화면(데스크톱)에서는
       세로 무대가 가운데 놓이고 좌우에 여백(배경색)이 남는다. 비율 계산 자체는
       INTERNAL_W/H 값에 무관하므로 해상도를 바꿔도 이 로직은 그대로 쓸 수 있다. */
    resize: function () {
      if (!this.stage) return;

      var v = this.viewportSize();
      var vw = v.w, vh = v.h;

      // 레이아웃이 아직 확정되지 않았으면(크기 0) 다음 프레임에 다시 시도
      if (vw <= 0 || vh <= 0) {
        var self0 = this;
        global.requestAnimationFrame(function () { self0.resize(); });
        return;
      }

      var ratio = INTERNAL_W / INTERNAL_H;
      var w = vw;
      var h = Math.round(w / ratio);
      if (h > vh) {
        h = vh;
        w = Math.round(h * ratio);
      }

      this.stage.style.width = w + 'px';
      this.stage.style.height = h + 'px';
      this._lastVW = vw;
      this._lastVH = vh;

      this.scale = w / INTERNAL_W;   // 화면 픽셀 : 내부 픽셀 비율 (터치 좌표 변환용)

      if (MG.UI && MG.UI.onResize) MG.UI.onResize(w, h);
    },

    /* --------------------------------------------------------------- 루프 */
    start: function () {
      if (this.running) return;
      this.running = true;
      this._lastTs = 0;
      var self = this;
      this._step = function (ts) {
        self._rafId = global.requestAnimationFrame(self._step);
        if (!self._lastTs) self._lastTs = ts;
        var dt = (ts - self._lastTs) / 1000;
        self._lastTs = ts;
        if (dt > MAX_DT) dt = MAX_DT;

        if (!self.paused) {
          self.time += dt;
          self.frame++;

          // 히트스탑: 남은 시간은 "실시간"으로 줄어들지만(다음 프레임엔 반드시
          // 풀린다), 이번 프레임에 게임플레이로 넘기는 dt 는 크게 축소한다.
          // 입력 이벤트(pointerdown 등)는 루프와 무관하게 계속 들어오므로
          // 터치/키보드 반응성에는 영향이 없다.
          var gameplayDt = dt;
          if (self.hitStopT > 0) {
            self.hitStopT -= dt;
            gameplayDt = dt * HITSTOP_SCALE;
          }
          self.update(gameplayDt);
        }
        self.render();
      };
      this._rafId = global.requestAnimationFrame(this._step);
    },

    stop: function () {
      this.running = false;
      if (this._rafId) global.cancelAnimationFrame(this._rafId);
      this._rafId = 0;
    },

    /* PHASE 6.1: 타격 성공 시 enemy.js 가 호출한다. 아주 짧은 지속시간을 기대한다
       (권장 0.03~0.06초). 같은 프레임에 여러 히트가 겹쳐도 시간이 계속 늘어나지
       않도록(작업 중첩 방지) 더 긴 쪽으로만 갱신한다. */
    hitStop: function (duration) {
      this.hitStopT = Math.max(this.hitStopT, duration);
    },

    /* 타이틀 화면에서 "모험 시작"을 눌렀을 때 */
    startAdventure: function () {
      this.state = 'PLAY';
      // PHASE 9 폴리시: 여기서부터 조작 컨트롤이 나타난다 (타이틀에서는 숨겨져 있었다)
      document.body.classList.add('mg-playing');
      if (MG.UI && MG.UI.hideTitle) MG.UI.hideTitle();
    },

    /* 카메라 — 맵이 화면보다 크므로 플레이어를 따라가되 맵 밖은 보여주지 않는다 */
    camera: { x: 0, y: 0, w: INTERNAL_W, h: INTERNAL_H },

    updateCamera: function () {
      var cam = this.camera;
      cam.w = INTERNAL_W;
      cam.h = INTERNAL_H;

      if (!MG.Player || !MG.Map) return;

      cam.x = Math.round(MG.Player.x - INTERNAL_W / 2);
      cam.y = Math.round(MG.Player.y - INTERNAL_H / 2);

      var maxX = MG.Map.WIDTH - INTERNAL_W;
      var maxY = MG.Map.HEIGHT - INTERNAL_H;
      if (cam.x < 0) cam.x = 0;
      if (cam.y < 0) cam.y = 0;
      if (cam.x > maxX) cam.x = maxX;
      if (cam.y > maxY) cam.y = maxY;
    },

    /* -------------------------------------------------------------- update */
    update: function (dt) {
      // PHASE 7 이후: 동료 갱신이 여기에 들어간다. 공격 상태 자체는
      // player.js 의 update() 안에서 combat.js 를 통해 함께 진행된다.
      if (MG.Input && MG.Input.update) MG.Input.update(dt);
      if (MG.Player && MG.Player.update) MG.Player.update(dt);
      if (MG.Enemy && MG.Enemy.update) MG.Enemy.update(dt);
      if (MG.Companion && MG.Companion.update) MG.Companion.update(dt);  // PHASE 9 STEP 2
      this.updateMoonstone(dt);
      this.updateCleansing(dt);
      this.updateTreasure(dt);        // PHASE 10 STEP 3
      this.updateRestartPrompt();
      this.updateCamera();
      if (DEBUG_MOBILE_LAYOUT) this.updateDebugPanel();
    },

    /* PHASE 8: 달의 돌 — 오직 "실제 검 히트박스가 겹쳤을 때"만 활성화된다.
       걸어서 부딪히거나, 공격 버튼만 누르거나, 근처에 있다는 것만으로는
       절대 발동하지 않는다 — 기존 전투 규칙을 그대로 따르기 위해
       MG.Combat.getAttackHitbox() 가 null 이 아닐 때(=판정 활성 구간)의
       사각형만 본다. 사전 타겟팅(findPreAttackTarget)은 모슬링 목록만
       훑으므로 달의 돌을 겨냥하는 일도 없다(설계상 그대로 둔다). */
    updateMoonstone: function (dt) {
      if (!MG.Map || !MG.Map.moonstone) return;
      var m = MG.Map.moonstone;

      if (m.state === 'ACTIVE') {
        m.activeT += dt;   // 연출용 경과 시간일 뿐 — 게임 로직은 아니다
        return;
      }
      if (this.moonstoneFound) return;          // 이미 끝난 목표 (이중 안전장치)
      if (!MG.Player || MG.Player.state === 'DEAD') return;
      if (!MG.Combat || !MG.Combat.getAttackHitbox || !MG.Collision) return;

      var box = MG.Combat.getAttackHitbox(MG.Player);
      if (!box) return;                          // 스윙 중이라도 판정 구간이 아니면 무시

      var hit = MG.Map.getMoonstoneHitbox();
      if (!MG.Collision.overlaps(box.x, box.y, box.w, box.h, hit.x, hit.y, hit.w, hit.h)) return;

      this.activateMoonstone();
    },

    /* PHASE 8: 단 한 번만 실행되는 보상 시퀀스.
       체력 회복 → 하트 UI 갱신 → 보상음 → 파티클 → 토스트.
       플레이어의 위치/이동/사망 상태는 건드리지 않는다. */
    activateMoonstone: function () {
      if (this.moonstoneFound) return;
      this.moonstoneFound = true;

      var m = MG.Map.moonstone;
      m.state = 'ACTIVE';
      m.activeT = 0;

      // A. 체력을 가득 채우고 하트를 즉시 갱신한다 (회복 아이템이 아니라 즉시 보상)
      if (MG.Player) {
        MG.Player.hp = MG.Player.maxHp;
        if (MG.UI && MG.UI.renderHearts) MG.UI.renderHearts(MG.Player.hp, MG.Player.maxHp);
      }

      // B. 보상음 (오디오 실패가 게임을 막지 않는다 — audio.js 내부에서 try/catch)
      if (MG.Audio && MG.Audio.playReward) MG.Audio.playReward();

      // C. 돌을 중심으로 짧고 밝은 빛 폭발 (기존 파티클 시스템 재사용)
      if (MG.Enemy && MG.Enemy.spawnParticles) {
        MG.Enemy.spawnParticles(m.x, m.y - 4, 18, 0, -1, 'reward');
      }

      // D. PHASE 9.3: 여기서 '달의 돌을 발견했다' 토스트를 띄우지 않는다.
      //    돌을 치는 순간 곧바로 정화가 시작되므로, 토스트와 '숲이 정화되었다'가
      //    한 화면에 겹쳐 뜨면서 가장 중요한 순간의 메시지가 둘로 쪼개졌다.
      //    이 결말에서는 '숲이 정화되었다' 하나만 남긴다.
      //    (MG.UI.showToast 자체는 그대로 살아 있다 — 다른 이벤트에서 쓸 수 있다.)

      // E. PHASE 8.1: 그리고 숲 전체가 정화된다 — 이 게임의 결말.
      this.startCleansing(m.x, m.y);
    },

    /* PHASE 10 STEP 3: 보물 상자 — 덩굴 다리를 놓은 뒤에만 열 수 있다.

       상호작용 버튼은 새로 만들지 않고 모스키가 쓰던 #btn-interact 를 그대로
       쓴다. 두 주인이 버튼을 두고 다투지 않는 이유는 구조적이다:
       companion.js 는 오직 RECRUITABLE 상태에서만 버튼을 매 프레임 제어하는데,
       상자는 bridgeActivated 를 요구하고 그건 모스키가 이미 FOLLOWING 이라는
       뜻이다. 두 조건은 동시에 참이 될 수 없다(게다가 모스키 공터와 상자는
       880px 떨어져 있어 사거리 28px 가 겹칠 수도 없다). */
    updateTreasure: function (dt) {
      if (!MG.Map || !MG.Map.treasure) return;
      var tr = MG.Map.treasure;

      // 열리는 중 — 연출만 진행하고 상호작용은 받지 않는다(중복 개봉 차단)
      if (tr.state === 'OPENING') {
        tr.openT += dt;
        if (tr.openT >= TREASURE_OPEN_TIME) {
          tr.openT = TREASURE_OPEN_TIME;
          tr.state = 'OPEN';
          if (MG.Enemy && MG.Enemy.spawnParticles) {
            MG.Enemy.spawnParticles(tr.x, tr.y - 10, 14, 0, -1, 'reward');
          }
          if (MG.UI && MG.UI.showToast) MG.UI.showToast('달빛 조각을 획득했다!');
        }
        return;
      }

      // 이미 열었으면 끝이다 — 다시 열리지 않는다
      if (tr.state !== 'CLOSED') { this.hideTreasurePrompt(); return; }

      // 다리가 놓이기 전에는 상자에 대한 버튼도 E 도 전혀 반응하지 않는다
      if (!this.bridgeActivated) {
        this._treasureInRange = false;
        this.hideTreasurePrompt();
        return;
      }

      var p = MG.Player;
      if (!p || p.state === 'DEAD') {
        this._treasureInRange = false;
        this.hideTreasurePrompt();
        return;
      }

      var dx = p.x - tr.x, dy = p.y - tr.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (!this._treasureInRange && dist <= TREASURE_ENTER) this._treasureInRange = true;
      else if (this._treasureInRange && dist > TREASURE_LEAVE) this._treasureInRange = false;

      if (this._treasureInRange) this.showTreasurePrompt();
      else this.hideTreasurePrompt();

      if (this._treasureInRange && MG.Input && MG.Input.interactPressed) {
        this.openTreasure();
      }
    },

    /* 상자를 연다. 멱등이다 — CLOSED 가 아니면 아무 일도 하지 않는다. */
    openTreasure: function () {
      var tr = MG.Map && MG.Map.treasure;
      if (!tr || tr.state !== 'CLOSED') return;

      tr.state = 'OPENING';
      tr.openT = 0;
      this.hideTreasurePrompt();          // 버튼은 즉시 사라진다

      if (MG.Audio && MG.Audio.playTreasureOpen) MG.Audio.playTreasureOpen();
      if (MG.Enemy && MG.Enemy.spawnParticles) {
        MG.Enemy.spawnParticles(tr.x, tr.y - 12, 8, 0, -1, 'reward');
      }
    },

    showTreasurePrompt: function () {
      if (this._treasurePromptShown) return;
      this._treasurePromptShown = true;
      if (MG.UI && MG.UI.showInteract) MG.UI.showInteract();
    },

    hideTreasurePrompt: function () {
      if (!this._treasurePromptShown) return;
      this._treasurePromptShown = false;
      if (MG.UI && MG.UI.hideInteract) MG.UI.hideInteract();
    },

    /* PHASE 8.1-B: 정화 시작. 게임을 멈추지 않고(컷신 없음) 아주 짧은
       히트스탑만 걸어 "쿵" 하는 무게를 준다 — 기존 hitStop() 은 dt 배율만
       낮출 뿐 입력을 막지 않으므로 조작권은 계속 플레이어에게 있다. */
    startCleansing: function (x, y) {
      if (this.cleansed) return;
      this.cleansed = true;
      this.cleanse = { t: 0, x: x, y: y };

      this.hitStop(0.08);

      // PHASE 9.2: 숲의 공기도 함께 바뀐다 — 새 소리를 켜는 게 아니라,
      // 이미 깔려 있던 앰비언스 한 겹의 값만 2초에 걸쳐 옮긴다.
      if (MG.Audio && MG.Audio.setAmbientMode) MG.Audio.setAmbientMode('cleansed');

      if (MG.UI && MG.UI.showVictory) MG.UI.showVictory('숲이 정화되었다');
    },

    /* PHASE 9.1: 정화가 끝난 뒤 "다시 모험하기" 문구를 띄울지 정한다.
       조건은 두 가지뿐이다 — 이미 정화되었고(cleansed), 플레이어가 처음
       출발했던 공터(MG.Map.spawn) 근처로 스스로 돌아왔을 때.
       정화 직후에는 플레이어가 달의 돌(700,400) 옆에 있어 스폰(200,590)에서
       430px 넘게 떨어져 있으므로, 구조적으로 곧바로 뜨지 않는다 — 정화된 숲을
       원하는 만큼 돌아다닌 뒤 돌아왔을 때만 나타난다.
       DOM 은 상태가 바뀌는 순간에만 건드린다(매 프레임 접근하지 않는다). */
    updateRestartPrompt: function () {
      var show = false;

      if (this.cleansed && !this.cleanse && MG.Map && MG.Map.spawn &&
          MG.Player && MG.Player.state !== 'DEAD') {
        var sp = MG.Map.spawn;
        var d = Math.hypot(MG.Player.x - sp.x, MG.Player.y - sp.y);
        // 히스테리시스: 들어올 땐 70, 나갈 땐 92 — 경계에서 깜빡이지 않는다
        show = this._restartPromptShown ? (d <= RESTART_LEAVE_RADIUS)
                                        : (d <= RESTART_ENTER_RADIUS);
      }

      if (show === this._restartPromptShown) return;
      this._restartPromptShown = show;

      if (!MG.UI) return;
      if (show) {
        // 실제 플레이에서 둘이 동시에 뜰 일은 없지만(토스트는 달의 돌 옆에서만,
        // 이 문구는 스폰 근처에서만 뜬다), 화면 위치가 가까우므로 혹시 남아 있는
        // 토스트가 있으면 먼저 치운다 — 어차피 지난 알림이다.
        if (MG.UI.hideToast) MG.UI.hideToast();
        if (MG.UI.showRestartPrompt) MG.UI.showRestartPrompt('다시 모험하기');
      } else {
        if (MG.UI.hideRestartPrompt) MG.UI.hideRestartPrompt();
      }
    },

    /* PHASE 9.1: 세션 리셋 — 브라우저를 새로고침하지 않고 처음 상태로 되돌린다.
       초기화 로직을 새로 쓰지 않고 기존 진입점(Player.init / Enemy.init /
       Input.reset)을 그대로 재사용한다. 저장/불러오기는 없다.
       순서가 중요하다: Enemy.init() 은 cleansed 가 true 면 모슬링을 만들지 않고
       조기 반환하므로(정화 후 부활에서 적이 돌아오지 않게 하는 장치),
       반드시 cleansed 를 먼저 내린 뒤에 호출해야 한다. */
    restartSession: function () {
      // 1) 정화/목표 상태를 먼저 되돌린다
      this.cleansed = false;
      this.cleanse = null;
      this.atmosphere = 0;
      this.moonstoneFound = false;
      this.bridgeActivated = false;   // PHASE 10 STEP 1: 재시작이면 다리도 처음 상태로
      if (MG.Map && MG.Map.resetBridge) MG.Map.resetBridge();  // 강이 다시 완전히 막힌다
      // PHASE 10 STEP 3: 상자도 다시 닫힌다 (새 세션에서 다시 열 수 있어야 한다).
      // 저장 상태를 새로 만들지 않는다 — 이번 세션 동안만 유지되는 값이다.
      if (MG.Map && MG.Map.treasure) {
        MG.Map.treasure.state = 'CLOSED';
        MG.Map.treasure.openT = 0;
      }
      this._treasureInRange = false;
      this._treasurePromptShown = false;
      this.hitStopT = 0;

      // 2) 달의 돌을 다시 잠들게 한다
      if (MG.Map && MG.Map.moonstone) {
        MG.Map.moonstone.state = 'IDLE';
        MG.Map.moonstone.activeT = 0;
      }

      // 3) 플레이어와 모슬링 — 기존 초기화 함수를 그대로 쓴다
      //    (Player.init 이 위치/HP/공격/무적/어시스트 상태를 모두 되돌리고,
      //     Enemy.init 이 9마리를 원래 스폰 지점에 다시 배치한다)
      if (MG.Player && MG.Player.init) MG.Player.init();
      if (MG.Enemy && MG.Enemy.init) MG.Enemy.init();
      // PHASE 9 STEP 3: 모스키도 기존 init() 을 그대로 재사용해 다시 묶인다
      // (TRAPPED / recruited=false / 300,235). 새 저장 상태를 만들지 않는다.
      if (MG.Companion && MG.Companion.init) MG.Companion.init();
      if (MG.Enemy && MG.Enemy.particles) MG.Enemy.particles.length = 0;

      // 4) 문구를 누르느라 눌려 있던 입력이 남지 않도록 정리한다
      if (MG.Input && MG.Input.reset) MG.Input.reset();

      // PHASE 9.2: 숲의 공기도 처음 상태로 되돌린다 (앰비언스를 껐다 켜지
      // 않는다 — 같은 체인의 값만 되돌아간다)
      if (MG.Audio && MG.Audio.setAmbientMode) MG.Audio.setAmbientMode('forest');

      // 5) UI 정리 — 승리 문구/토스트/재시작 문구를 모두 즉시 내린다
      this._restartPromptShown = false;
      if (MG.UI) {
        if (MG.UI.hideRestartPrompt) MG.UI.hideRestartPrompt(true);
        if (MG.UI.hideVictory) MG.UI.hideVictory();
        if (MG.UI.hideToast) MG.UI.hideToast();
        if (MG.UI.renderHearts && MG.Player) MG.UI.renderHearts(MG.Player.hp, MG.Player.maxHp);
      }

      // 타이틀로 되돌아가지 않는다 — 곧바로 다시 플레이한다
      this.state = 'PLAY';
    },

    /* 파동을 퍼뜨리고(=닿는 순서대로 모슬링을 정화하고) 숲을 서서히 밝힌다. */
    updateCleansing: function (dt) {
      // 분위기 전환은 파동이 끝난 뒤에도 계속 이어진다
      if (this.cleansed && this.atmosphere < 1) {
        this.atmosphere = Math.min(1, this.atmosphere + dt / ATMOSPHERE_FADE);
      }

      var c = this.cleanse;
      if (!c) return;

      c.t += dt;
      var radius = Math.min(1, c.t / CLEANSE_DURATION) * CLEANSE_MAX_RADIUS;

      // 파동 앞면이 닿은 모슬링부터 차례로 사라진다 (enemy.js 의 기존 사망 연출)
      if (MG.Enemy && MG.Enemy.cleanseAt) MG.Enemy.cleanseAt(c.x, c.y, radius);

      if (c.t >= CLEANSE_DURATION) this.cleanse = null;
    },

    /* v0.1.1: DEBUG_MOBILE_LAYOUT 이 true 일 때만 동작하는 개발용 정보 패널.
       화면 크기 / 캔버스 논리 해상도 / 방향 / 카메라 크기 / 입력값을 보여준다. */
    updateDebugPanel: function () {
      var el = document.getElementById('debug-panel');
      if (!el) return;
      el.hidden = false;
      var v = this.viewportSize();
      var axis = (MG.Input && MG.Input.axis) || { x: 0, y: 0 };
      var joyActive = !!(MG.Input && MG.Input._joyPointerId !== null && MG.Input._joyPointerId !== undefined);
      el.textContent =
        'viewport: ' + Math.round(v.w) + ' x ' + Math.round(v.h) + '\n' +
        'canvas(logical): ' + INTERNAL_W + ' x ' + INTERNAL_H + '\n' +
        'orientation: ' + (v.w >= v.h ? 'landscape' : 'portrait') + '\n' +
        'camera: ' + this.camera.w + ' x ' + this.camera.h +
          ' @ (' + this.camera.x + ', ' + this.camera.y + ')\n' +
        'input: x=' + axis.x.toFixed(2) + ' y=' + axis.y.toFixed(2) + '\n' +
        'joystick active: ' + joyActive;
    },

    /* -------------------------------------------------------------- render */
    render: function () {
      var ctx = this.ctx;
      if (!ctx) return;

      if (!MG.Map || !MG.Map.ground) {
        // 맵이 준비되지 않았을 때의 안전한 대체 화면
        this.drawPlaceholderScene(ctx);
        if (MG.Player && MG.Player.render) MG.Player.render(ctx);
        this.drawVignette(ctx);
        return;
      }

      var cam = this.camera;
      var t = this.time;

      ctx.save();
      ctx.translate(-cam.x, -cam.y);

      MG.Map.renderGround(ctx);
      MG.Map.renderWater(ctx, cam, t);
      // PHASE 10 STEP 2: 다리는 물 바로 위, 엔티티보다 아래에 깔린다.
      // (올라서는 바닥이므로 루카/모스키를 가려서는 안 된다)
      if (MG.Map.renderBridge) MG.Map.renderBridge(ctx, cam, t);

      // 나무/바위/모슬링/플레이어를 발 높이(y) 순으로 그려 앞뒤 관계를 만든다
      var props = MG.Map.collectProps([], cam);
      if (MG.Enemy && MG.Enemy.collect) MG.Enemy.collect(props, cam);
      if (MG.Companion && MG.Companion.collect) MG.Companion.collect(props, cam);  // PHASE 9 STEP 2
      if (MG.Player) {
        props.push({ y: MG.Player.y, kind: 'player' });
      }
      props.sort(function (a, b) { return a.y - b.y; });

      for (var i = 0; i < props.length; i++) {
        if (props[i].kind === 'player') {
          if (MG.Player.render) MG.Player.render(ctx);
        } else if (props[i].kind === 'enemy') {
          MG.Enemy.renderOne(ctx, props[i].obj);
        } else if (props[i].kind === 'companion') {
          MG.Companion.renderOne(ctx, props[i].obj);   // PHASE 9 STEP 2
        } else {
          MG.Map.renderProp(ctx, props[i]);
        }
      }

      if (MG.Enemy && MG.Enemy.renderParticles) MG.Enemy.renderParticles(ctx);

      MG.Map.renderFireflies(ctx, cam, t);

      // PHASE 8.1: 정화 파동은 월드 좌표에 그린다 (카메라 변환이 아직 살아있는
      // 이 지점이어야 돌을 중심으로 정확히 퍼진다)
      this.renderCleanseWave(ctx);

      // DEBUG_COMBAT 이 true 일 때만 그려진다 (combat.js 내부에서 조기 반환) —
      // 카메라 변환이 아직 적용된 상태여야 히트박스가 월드 좌표와 정확히 겹친다.
      if (MG.Combat && MG.Combat.renderDebug) MG.Combat.renderDebug(ctx, MG.Player);

      ctx.restore();

      this.drawAtmosphere(ctx);   // PHASE 8.1-C: 정화 전/후 공기감
      this.drawVignette(ctx);
      this.drawCleanseFlash(ctx); // 활성화 순간의 아주 짧은 섬광 (맨 위)
    },

    /* PHASE 8.1: 달의 돌에서 퍼져나가는 정화 파동. 새 파티클 엔진이 아니라
       캔버스 원 두어 개다 — 안쪽은 옅게 채워 "지나간 자리"를, 앞면은 또렷한
       테두리로 "지금 지나가는 곳"을 보여준다. 세로 화면에서도 한눈에 읽힌다. */
    renderCleanseWave: function (ctx) {
      var c = this.cleanse;
      if (!c) return;

      var p = Math.min(1, c.t / CLEANSE_DURATION);
      var r = p * CLEANSE_MAX_RADIUS;
      var fade = 1 - p;                 // 퍼질수록 옅어진다
      if (r <= 1) return;

      ctx.save();

      // 파동이 훑고 지나간 안쪽 — 은은한 달빛이 남는다
      var inner = Math.max(0, r - 52);
      var g = ctx.createRadialGradient(c.x, c.y, inner, c.x, c.y, r);
      g.addColorStop(0, 'rgba(190, 226, 255, 0)');
      g.addColorStop(0.72, 'rgba(202, 232, 255, ' + (0.16 * fade).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(238, 249, 255, ' + (0.36 * fade).toFixed(3) + ')');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.fill();

      // 파동 앞면 — 두꺼운 테두리 + 안쪽에 가는 흰 선을 겹쳐 속도감을 준다
      ctx.strokeStyle = 'rgba(226, 244, 255, ' + (0.85 * fade).toFixed(3) + ')';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255, 255, 255, ' + (0.55 * fade).toFixed(3) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(c.x, c.y, Math.max(1, r - 6), 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    },

    /* 활성화 직후 아주 짧게 화면 전체를 밝히는 섬광 (0.18초). 게임을 멈추지
       않으며, 알파가 낮아 눈이 부시지 않는다. */
    drawCleanseFlash: function (ctx) {
      var c = this.cleanse;
      if (!c || c.t > CLEANSE_FLASH) return;
      var a = (1 - c.t / CLEANSE_FLASH) * 0.30;
      ctx.fillStyle = 'rgba(226, 242, 255, ' + a.toFixed(3) + ')';
      ctx.fillRect(0, 0, INTERNAL_W, INTERNAL_H);
    },

    /* PHASE 8.1-C: 정화 전/후의 공기감 대비.
       색을 통째로 바꾸지 않고 아주 얇은 레이어 하나만 덮는다 —
       정화 전에는 차갑게 눌러 무겁게, 정화 후에는 달빛으로 살짝 들어올린다. */
    drawAtmosphere: function (ctx) {
      var W = INTERNAL_W, H = INTERNAL_H;
      var a = this.atmosphere;

      if (a < 0.999) {
        // 정화 전 — 푸른기 도는 어둠으로 살짝 가라앉힌다
        ctx.fillStyle = 'rgba(6, 14, 24, ' + (0.18 * (1 - a)).toFixed(3) + ')';
        ctx.fillRect(0, 0, W, H);
      }
      if (a > 0.001) {
        // 정화 후 — 위에서 달빛이 스며든 것처럼 옅게 밝힌다
        var lift = ctx.createLinearGradient(0, 0, 0, H);
        lift.addColorStop(0, 'rgba(186, 216, 255, ' + (0.15 * a).toFixed(3) + ')');
        lift.addColorStop(1, 'rgba(186, 216, 255, ' + (0.05 * a).toFixed(3) + ')');
        ctx.fillStyle = lift;
        ctx.fillRect(0, 0, W, H);
      }
    },

    /* PHASE 4에서 실제 숲 맵(map.js)으로 교체될 임시 분위기 배경.
       캔버스 렌더링/스케일 검증용이며 게임 로직은 포함하지 않는다. */
    drawPlaceholderScene: function (ctx) {
      var W = INTERNAL_W, H = INTERNAL_H, t = this.time;

      // 밤 숲 바닥 그라데이션
      var sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0.0, '#132a24');
      sky.addColorStop(0.45, '#1b3a2a');
      sky.addColorStop(1.0, '#25492f');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      // 달빛 웅덩이
      var moon = ctx.createRadialGradient(W * 0.5, H * 0.36, 6, W * 0.5, H * 0.36, H * 0.75);
      moon.addColorStop(0, 'rgba(190, 220, 255, 0.20)');
      moon.addColorStop(1, 'rgba(190, 220, 255, 0)');
      ctx.fillStyle = moon;
      ctx.fillRect(0, 0, W, H);

      // 바닥 풀 결(가로 스트로크) — 정적인 패턴
      ctx.fillStyle = 'rgba(20, 60, 38, 0.35)';
      for (var y = 0; y < H; y += 6) {
        var off = ((y * 37) % 11) - 5;
        ctx.fillRect(off, y, W, 1);
      }

      // 떠다니는 숲의 빛(반딧불) — 애니메이션 동작 확인용
      for (var i = 0; i < 14; i++) {
        var seed = i * 12.9898;
        var fx = (Math.sin(seed) * 0.5 + 0.5) * W;
        var fy = (Math.cos(seed * 1.7) * 0.5 + 0.5) * H;
        var drift = Math.sin(t * 0.6 + i) * 9;
        var bob = Math.cos(t * 0.9 + i * 1.3) * 6;
        var glow = 0.35 + 0.35 * Math.sin(t * 2.2 + i);
        ctx.fillStyle = 'rgba(206, 244, 168, ' + glow.toFixed(3) + ')';
        ctx.fillRect(Math.round(fx + drift), Math.round(fy + bob), 2, 2);
      }
    },

    /* 화면 가장자리 비네트 — 배경/플레이어 위에 항상 마지막으로 덮는다.
       PHASE 8.1-C: 정화 전에는 더 좁고 짙게(압박감), 정화 후에는 더 넓고
       옅게(트인 느낌) 바뀐다. atmosphere 가 0→1 로 서서히 움직이므로
       전환도 뚝 끊기지 않고 자연스럽게 이어진다. */
    drawVignette: function (ctx) {
      var W = INTERNAL_W, H = INTERNAL_H;
      var a = this.atmosphere;
      var inner = H * (0.30 + 0.14 * a);   // 0.30 → 0.44 (밝아질수록 가장자리만 남는다)
      var edge = 0.68 - 0.34 * a;          // 0.68 → 0.34

      var vig = ctx.createRadialGradient(W / 2, H / 2, inner, W / 2, H / 2, H * 0.95);
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, 'rgba(0,0,0,' + edge.toFixed(3) + ')');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, W, H);
    }
  };

  MG.Game = Game;
})(window);
