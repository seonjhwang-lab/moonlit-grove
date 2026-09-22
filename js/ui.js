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
      this.el.toast = document.getElementById('hud-toast');     // PHASE 8
      this.el.victory = document.getElementById('hud-victory'); // PHASE 8.1
      this.el.restart = document.getElementById('hud-restart'); // PHASE 9.1
      this.el.interact = document.getElementById('btn-interact'); // PHASE 9 STEP 1
      this.el.ability = document.getElementById('btn-ability');   // PHASE 10 STEP 2

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

      /* PHASE 9.1: "다시 모험하기" — 새 입력 레이어를 만들지 않고 "모험 시작"
         버튼과 완전히 같은 경로를 쓴다(#ui-layer button 은 style.css 에서
         이미 pointer-events: auto 이고, click 하나면 터치/데스크톱 모두에서
         중복 없이 안정적으로 동작한다). */
      if (this.el.restart) {
        this.el.restart.addEventListener('click', function (e) {
          e.preventDefault();
          if (MG.Audio && MG.Audio.unlock) MG.Audio.unlock();
          if (MG.Game && MG.Game.restartSession) MG.Game.restartSession();
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
    },

    /* PHASE 8: 잠깐 떴다 저절로 사라지는 알림. 퀘스트 로그도, 상시 목표
       패널도 아니다 — 문자열 하나를 넣고 CSS 트랜지션으로 페이드인/아웃만
       한다. pointer-events 는 style.css 에서 none 이라 조작을 절대 가리지
       않는다. 연속 호출되면 이전 타이머를 지우고 새로 시작한다. */
    showToast: function (text, holdMs) {
      if (!this.el.toast) this.el.toast = document.getElementById('hud-toast');
      if (!this.el.toast) return;

      var el = this.el.toast;
      var self = this;

      if (this._toastHold) global.clearTimeout(this._toastHold);
      if (this._toastHide) global.clearTimeout(this._toastHide);

      el.textContent = text;
      el.hidden = false;
      // 숨김 상태에서 바로 클래스를 붙이면 트랜지션이 생략되는 브라우저가 있어
      // 레이아웃을 한 번 강제로 확정시킨 뒤 보이게 한다.
      void el.offsetWidth;
      el.classList.add('is-visible');

      var hold = holdMs || 2200;   // 페이드(0.35s) + 유지 + 페이드(0.4s) ≈ 3초
      this._toastHold = global.setTimeout(function () {
        el.classList.remove('is-visible');
        self._toastHide = global.setTimeout(function () { el.hidden = true; }, 400);
      }, hold);
    },

    /* PHASE 8.1: 완료 문구. 별도 메뉴/화면이 아니라 기존 HUD 위에 얹는 텍스트
       한 줄이며, pointer-events: none 이라 조작(조이스틱/공격 버튼)을 절대
       가리지 않는다.
       PHASE 8.1 폴리시: 예전에는 화면에 영구히 남았지만, 이제 토스트와 같은
       방식으로 스스로 사라진다 — 부드럽게 나타나 약 2.7초간 또렷하게 머문 뒤
       0.7초에 걸쳐 사라지고 hidden 으로 완전히 빠진다.
       중요: 이건 순수하게 DOM/표시 문제다. 여기서 MG.Game.cleansed / 달의 돌
       상태 / 밝아진 분위기 / 비네트 / 정리된 적 등 정화 상태는 절대 건드리지
       않는다 — 글자만 사라지고 세계는 그대로 정화된 채 남는다. */
    showVictory: function (text, holdMs) {
      if (!this.el.victory) this.el.victory = document.getElementById('hud-victory');
      if (!this.el.victory) return;

      var el = this.el.victory;
      var self = this;

      // 반복 호출돼도 이전 타이머가 겹쳐 "보이는 채로 멈추는" 일이 없도록 정리한다
      if (this._victoryHold) global.clearTimeout(this._victoryHold);
      if (this._victoryHide) global.clearTimeout(this._victoryHide);

      el.textContent = text;
      el.hidden = false;
      void el.offsetWidth;          // 숨김 → 표시 전환에서 페이드가 생략되지 않도록
      el.classList.add('is-visible');

      // style.css 의 transition 과 맞춘 값 (페이드 0.7초)
      var FADE = 700;
      var hold = holdMs || 2700;    // 완전히 또렷한 상태로 머무는 시간
      this._victoryHold = global.setTimeout(function () {
        el.classList.remove('is-visible');                       // 0.7초 페이드아웃 시작
        self._victoryHide = global.setTimeout(function () {
          el.hidden = true;                                      // 완전히 사라진다
        }, FADE + 50);
      }, FADE + hold);              // 페이드인이 끝난 뒤부터 유지 시간을 센다
    },

    /* PHASE 9.1: 승리 문구를 예약된 타이머까지 포함해 즉시 내린다.
       (세션 리셋 때 호출된다 — 남은 타이머가 나중에 엉뚱하게 발화하면
        다음 판의 승리 문구를 일찍 지워버릴 수 있다) */
    hideVictory: function () {
      if (this._victoryHold) global.clearTimeout(this._victoryHold);
      if (this._victoryHide) global.clearTimeout(this._victoryHide);
      this._victoryHold = null;
      this._victoryHide = null;

      var el = this.el.victory || document.getElementById('hud-victory');
      if (!el) return;
      el.classList.remove('is-visible');
      el.hidden = true;
    },

    /* 토스트도 같은 이유로 타이머까지 정리하고 즉시 내린다. */
    hideToast: function () {
      if (this._toastHold) global.clearTimeout(this._toastHold);
      if (this._toastHide) global.clearTimeout(this._toastHide);
      this._toastHold = null;
      this._toastHide = null;

      var el = this.el.toast || document.getElementById('hud-toast');
      if (!el) return;
      el.classList.remove('is-visible');
      el.hidden = true;
    },

    /* PHASE 9.1: "다시 모험하기" 문구를 띄운다. 스스로 사라지지 않는다 —
       game.js 가 플레이어가 시작 공터를 벗어나는 순간 내린다. */
    showRestartPrompt: function (text) {
      if (!this.el.restart) this.el.restart = document.getElementById('hud-restart');
      if (!this.el.restart) return;

      var el = this.el.restart;
      if (this._restartHide) { global.clearTimeout(this._restartHide); this._restartHide = null; }

      el.textContent = text;
      el.hidden = false;
      void el.offsetWidth;          // 숨김 → 표시 전환에서 페이드가 생략되지 않도록
      el.classList.add('is-visible');
    },

    /* immediate=true 면 페이드 없이 즉시 감춘다(세션 리셋용). */
    hideRestartPrompt: function (immediate) {
      if (!this.el.restart) this.el.restart = document.getElementById('hud-restart');
      if (!this.el.restart) return;

      var el = this.el.restart;
      if (this._restartHide) { global.clearTimeout(this._restartHide); this._restartHide = null; }
      el.classList.remove('is-visible');

      if (immediate) { el.hidden = true; return; }
      // 페이드아웃(style.css 의 500ms)이 끝난 뒤에 DOM 에서 뺀다
      this._restartHide = global.setTimeout(function () { el.hidden = true; }, 550);
    },

    /* PHASE 9 STEP 1: 모바일 상호작용 버튼의 표시 여부만 담당한다.
       여기에는 '무엇과' 상호작용하는지에 대한 지식이 전혀 없다 — 그건 이후
       단계에서 게임 로직이 판단해 이 헬퍼를 부른다.
       나타날 때만 짧게 페이드인하고, 숨길 때는 지연 없이 즉시 hidden 으로 뺀다.
       (컨트롤이므로 사라지는 중에 탭이 먹히면 안 된다 — 문구용 페이드아웃과
        다르게 다뤄야 하는 지점이다) */
    showInteract: function () {
      if (!this.el.interact) this.el.interact = document.getElementById('btn-interact');
      var el = this.el.interact;
      if (!el || !el.hidden) return;

      el.hidden = false;
      void el.offsetWidth;          // 숨김 → 표시 전환에서 페이드가 생략되지 않도록
      el.classList.add('is-visible');
    },

    hideInteract: function () {
      if (!this.el.interact) this.el.interact = document.getElementById('btn-interact');
      var el = this.el.interact;
      if (!el) return;

      el.classList.remove('is-visible');
      el.classList.remove('is-pressed');
      el.hidden = true;

      // 버튼이 눌린 채로 사라졌을 때를 대비해 입력 쪽 눌림 상태도 정리한다
      if (MG.Input && MG.Input.setInteractPressedVisual) {
        MG.Input._interactPointerId = null;
        MG.Input.setInteractPressedVisual(false);
      }
    },

    isInteractVisible: function () {
      if (!this.el.interact) this.el.interact = document.getElementById('btn-interact');
      return !!(this.el.interact && !this.el.interact.hidden);
    },

    /* PHASE 10 STEP 2: 능력 버튼. 상호작용 버튼과 완전히 같은 규칙이다 —
       표시 여부만 담당하고, 무엇을 할 수 있는지는 companion.js 가 판단한다.
       나타날 때만 짧게 페이드인하고, 숨길 때는 지연 없이 즉시 뺀다
       (사라지는 중인 버튼이 탭을 먹으면 안 된다). */
    showAbility: function () {
      if (!this.el.ability) this.el.ability = document.getElementById('btn-ability');
      var el = this.el.ability;
      if (!el || !el.hidden) return;

      el.hidden = false;
      void el.offsetWidth;
      el.classList.add('is-visible');
    },

    hideAbility: function () {
      if (!this.el.ability) this.el.ability = document.getElementById('btn-ability');
      var el = this.el.ability;
      if (!el) return;

      el.classList.remove('is-visible');
      el.classList.remove('is-pressed');
      el.hidden = true;

      if (MG.Input && MG.Input.setAbilityPressedVisual) {
        MG.Input._abilityPointerId = null;
        MG.Input.setAbilityPressedVisual(false);
      }
    },

    isAbilityVisible: function () {
      if (!this.el.ability) this.el.ability = document.getElementById('btn-ability');
      return !!(this.el.ability && !this.el.ability.hidden);
    }
  };

  MG.UI = UI;
})(window);
