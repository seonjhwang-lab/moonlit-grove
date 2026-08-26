/* ==========================================================================
   ui.js — HUD / 오버레이 / 상호작용 프롬프트
   PHASE 1 범위:
     - 타이틀 오버레이 표시 및 "모험 시작" 버튼
     - 세로(portrait) 방향 경고 오버레이
     - 화면 크기 변화 훅
   ========================================================================== */
(function (global) {
  'use strict';

  var MG = global.MG = global.MG || {};

  var UI = {
    el: {},
    isPortrait: false,

    init: function () {
      this.el.title = document.getElementById('overlay-title');
      this.el.startBtn = document.getElementById('btn-start');
      this.el.orientation = document.getElementById('overlay-orientation');
      this.el.version = document.getElementById('hud-version');

      if (this.el.version && MG.Game) {
        this.el.version.textContent = 'v' + MG.Game.VERSION;
      }

      var self = this;

      if (this.el.startBtn) {
        // click 하나만 사용 (터치에서도 안정적으로 동작하며 중복 발화가 없다)
        this.el.startBtn.addEventListener('click', function (e) {
          e.preventDefault();
          if (MG.Audio && MG.Audio.unlock) MG.Audio.unlock();
          if (MG.Game) MG.Game.startAdventure();
        });
      }

      // 방향 감지: matchMedia + resize 양쪽을 모두 사용해 기기별 차이를 흡수
      this._checkOrientation = function () { self.updateOrientation(); };
      global.addEventListener('resize', this._checkOrientation);
      global.addEventListener('orientationchange', function () {
        // iOS는 orientationchange 직후 크기 갱신이 늦는 경우가 있어 한 프레임 늦춘다
        global.setTimeout(self._checkOrientation, 120);
        global.setTimeout(self._checkOrientation, 400);
      });
      if (global.matchMedia) {
        var mq = global.matchMedia('(orientation: portrait)');
        if (mq.addEventListener) mq.addEventListener('change', this._checkOrientation);
        else if (mq.addListener) mq.addListener(this._checkOrientation);
      }

      this.updateOrientation();
    },

    /* 세로로 들면 경고를 띄우고 게임을 일시정지한다 */
    updateOrientation: function () {
      var portrait = global.innerHeight > global.innerWidth;
      this.isPortrait = portrait;

      if (this.el.orientation) this.el.orientation.hidden = !portrait;
      document.body.classList.toggle('mg-portrait', portrait);

      // 세로일 때는 게임을 멈춘다 (경고 오버레이가 화면을 덮는다)
      if (MG.Game) MG.Game.paused = portrait;
    },

    showTitle: function () {
      if (this.el.title) this.el.title.hidden = false;
    },

    hideTitle: function () {
      if (this.el.title) this.el.title.hidden = true;
    },

    /* game.js 의 resize() 에서 호출 — 화면 픽셀 크기 전달.
       ResizeObserver 경유이므로 resize 이벤트가 오지 않는 환경에서도 방향이 동기화된다.
       (주의: 여기서 Game.resize() 를 다시 호출하면 무한 루프가 된다) */
    onResize: function (/* w, h */) {
      this.updateOrientation();
      // PHASE 3 이후: 조이스틱 / 버튼 배치 재계산이 여기에 들어간다.
    }
  };

  MG.UI = UI;
})(window);
