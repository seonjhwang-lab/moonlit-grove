/* ==========================================================================
   game.js — 게임 루프 / 전체 게임 상태 / 캔버스 반응형 스케일
   PHASE 1 범위:
     - 내부 해상도 480x270 (16:9) 캔버스 설정
     - 화면비를 유지하는 반응형 레터박스 스케일
     - 상태 머신(BOOT / TITLE / PLAY)의 뼈대
     - 델타타임 기반 메인 루프
     - PHASE 4 이전 임시 배경 렌더
   ========================================================================== */
(function (global) {
  'use strict';

  var MG = global.MG = global.MG || {};

  var INTERNAL_W = 480;   // 내부 해상도 (16:9)
  var INTERNAL_H = 270;
  var MAX_DT = 0.05;      // 탭 전환 후 큰 점프 방지 (초)

  var Game = {
    VERSION: '0.1.0',
    WIDTH: INTERNAL_W,
    HEIGHT: INTERNAL_H,

    canvas: null,
    ctx: null,
    stage: null,

    state: 'BOOT',        // BOOT | TITLE | PLAY
    running: false,
    paused: false,        // 세로 방향 경고 등으로 인한 일시정지
    time: 0,              // 누적 경과 시간(초)
    frame: 0,
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
       16:9 비율을 유지하면서 뷰포트 안에 최대 크기로 맞춘다.
       남는 영역은 레터박스(배경색)로 남는다. */
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
          self.update(dt);
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
      // PHASE 5 이후: 적 / 동료 / 전투 갱신이 여기에 들어간다.
      if (MG.Input && MG.Input.update) MG.Input.update(dt);
      if (MG.Player && MG.Player.update) MG.Player.update(dt);
      this.updateCamera();
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

      // 나무/바위/플레이어를 발 높이(y) 순으로 그려 앞뒤 관계를 만든다
      var props = MG.Map.collectProps([], cam);
      if (MG.Player) {
        props.push({ y: MG.Player.y, kind: 'player' });
      }
      props.sort(function (a, b) { return a.y - b.y; });

      for (var i = 0; i < props.length; i++) {
        if (props[i].kind === 'player') {
          if (MG.Player.render) MG.Player.render(ctx);
        } else {
          MG.Map.renderProp(ctx, props[i]);
        }
      }

      MG.Map.renderFireflies(ctx, cam, t);

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
