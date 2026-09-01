/* ==========================================================================
   ui.js — HUD / 오버레이 / 상호작용 프롬프트
   v0.1.1 PORTRAIT CONVERSION:
     - 세로 모드를 막던 전체화면 경고/일시정지 로직을 완전히 제거했다.
       세로가 이제 기본 플레이 방향이므로 더 이상 "차단해야 할 상태"가 아니다.
     - updateOrientationAndLayout() 이 방향 판별 + 레이아웃 재계산을
       한 곳에서 담당한다. 게임을 멈추거나 화면을 가리는 부수효과는 없다.
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
      this.el.version = document.getElementById('hud-version');
      this.el.hearts = document.getElementById('hud-hearts');

      if (this.el.version && MG.Game) {
        this.el.version.textContent = 'v' + MG.Game.VERSION;
      }

      // PHASE 7: 부팅 시점의 초기 체력을 곧바로 표시한다 (이후로는 HP가 실제로
      // 바뀔 때만 player.js 가 다시 호출한다 — 매 프레임 갱신하지 않는다)
      if (MG.Player) this.renderHearts(MG.Player.hp, MG.Player.maxHp);

      var self = this;

      if (this.el.startBtn) {
        // click 하나만 사용 (터치에서도 안정적으로 동작하며 중복 발화가 없다)
        this.el.startBtn.addEventListener('click', function (e) {
          e.preventDefault();
          if (MG.Audio && MG.Audio.unlock) MG.Audio.unlock();
          if (MG.Game) MG.Game.startAdventure();
        });
      }

      // 방향/레이아웃 변화 감지: matchMedia + resize 양쪽을 모두 사용해 기기별 차이를 흡수
      this._onOrientationEvent = function () { self.updateOrientationAndLayout(); };
      global.addEventListener('resize', this._onOrientationEvent);
      global.addEventListener('orientationchange', function () {
        // iOS는 orientationchange 직후 크기 갱신이 늦는 경우가 있어 한 프레임 늦춘다
        global.setTimeout(self._onOrientationEvent, 120);
        global.setTimeout(self._onOrientationEvent, 400);
      });
      if (global.visualViewport) {
        global.visualViewport.addEventListener('resize', this._onOrientationEvent);
      }
      if (global.matchMedia) {
        var mq = global.matchMedia('(orientation: portrait)');
        if (mq.addEventListener) mq.addEventListener('change', this._onOrientationEvent);
        else if (mq.addListener) mq.addListener(this._onOrientationEvent);
      }

      this.updateOrientationAndLayout();
    },

    /* 방향 판별 + 레이아웃 재계산을 한 곳에서 처리한다.
       세로/가로 어느 쪽이든 게임은 항상 플레이 가능해야 하므로,
       여기서 MG.Game.paused 를 건드리거나 #game-root 를 숨기지 않는다.
       resize/orientationchange/visualViewport 어디서 불러도 안전하다. */
    updateOrientationAndLayout: function () {
      var portrait = global.innerHeight >= global.innerWidth;
      this.isPortrait = portrait;
      document.body.classList.toggle('mg-portrait', portrait);
      document.body.classList.toggle('mg-landscape', !portrait);

      if (MG.Game && MG.Game.resize) MG.Game.resize();
    },

    showTitle: function () {
      if (this.el.title) this.el.title.hidden = false;
    },

    hideTitle: function () {
      if (this.el.title) this.el.title.hidden = true;
    },

    /* game.js 의 resize() 에서 호출 — 화면 픽셀 크기 전달.
       ResizeObserver 경유이므로 resize 이벤트가 오지 않는 환경에서도 방향 클래스가
       동기화된다. (주의: 여기서 다시 Game.resize() 를 호출하면 무한 루프가 되므로
       방향 클래스 갱신만 하고 레이아웃 재계산은 하지 않는다) */
    onResize: function (/* w, h */) {
      var portrait = global.innerHeight >= global.innerWidth;
      this.isPortrait = portrait;
      document.body.classList.toggle('mg-portrait', portrait);
      document.body.classList.toggle('mg-landscape', !portrait);
    },

    /* PHASE 7: #hud-hearts 를 하트 이모지로 채운다. UI 프레임워크 없이 문자열
       하나만 다시 그리며, HP가 실제로 바뀐 순간에만(player.js 쪽에서) 호출된다 —
       매 렌더 프레임마다 갱신하지 않는다. */
    renderHearts: function (hp, maxHp) {
      if (!this.el.hearts) this.el.hearts = document.getElementById('hud-hearts');
      if (!this.el.hearts) return;

      var full = Math.max(0, Math.min(maxHp, hp));
      var str = '';
      for (var i = 0; i < maxHp; i++) str += (i < full) ? '❤️' : '🤍';

      if (this.el.hearts.textContent !== str) this.el.hearts.textContent = str;
    }
  };

  MG.UI = UI;
})(window);
