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

  var Game = {
    VERSION: '0.1.6',
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
      this.updateCamera();
      if (DEBUG_MOBILE_LAYOUT) this.updateDebugPanel();
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

      // 나무/바위/모슬링/플레이어를 발 높이(y) 순으로 그려 앞뒤 관계를 만든다
      var props = MG.Map.collectProps([], cam);
      if (MG.Enemy && MG.Enemy.collect) MG.Enemy.collect(props, cam);
      if (MG.Player) {
        props.push({ y: MG.Player.y, kind: 'player' });
      }
      props.sort(function (a, b) { return a.y - b.y; });

      for (var i = 0; i < props.length; i++) {
        if (props[i].kind === 'player') {
          if (MG.Player.render) MG.Player.render(ctx);
        } else if (props[i].kind === 'enemy') {
          MG.Enemy.renderOne(ctx, props[i].obj);
        } else {
          MG.Map.renderProp(ctx, props[i]);
        }
      }

      if (MG.Enemy && MG.Enemy.renderParticles) MG.Enemy.renderParticles(ctx);

      MG.Map.renderFireflies(ctx, cam, t);

      // DEBUG_COMBAT 이 true 일 때만 그려진다 (combat.js 내부에서 조기 반환) —
      // 카메라 변환이 아직 적용된 상태여야 히트박스가 월드 좌표와 정확히 겹친다.
      if (MG.Combat && MG.Combat.renderDebug) MG.Combat.renderDebug(ctx, MG.Player);

      ctx.restore();

      this.drawVignette(ctx);
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

    /* 화면 가장자리 비네트 — 배경/플레이어 위에 항상 마지막으로 덮는다 */
    drawVignette: function (ctx) {
      var W = INTERNAL_W, H = INTERNAL_H;
      var vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, W, H);
    }
  };

  MG.Game = Game;
})(window);
