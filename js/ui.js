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
      this.el.meat = document.getElementById('hud-meat'); // LAZY DINER STEP 2
      this.el.ramen = document.getElementById('hud-ramen'); // LAZY DINER STEP 3
      this.el.toast = document.getElementById('hud-toast');     // PHASE 8
      this.el.victory = document.getElementById('hud-victory'); // PHASE 8.1
      this.el.restart = document.getElementById('hud-restart'); // PHASE 9.1
      this.el.interact = document.getElementById('btn-interact'); // PHASE 9 STEP 1
      this.el.ability = document.getElementById('btn-ability');   // PHASE 10 STEP 2
      this.el.complete = document.getElementById('overlay-complete'); // PHASE 11 STEP 2
      this.el.completeRestart = document.getElementById('btn-complete-restart'); // PHASE 11 STEP 3
      // LAZY DINER STEP 4-1: 손님과의 짧은 대화 상자
      this.el.speechLayer = document.getElementById('speech-layer');   // STEP 4-3b: 전체 화면 탭 받이
      this.el.speech = document.getElementById('speech-box');
      this.el.speechName = document.getElementById('speech-name');
      this.el.speechText = document.getElementById('speech-text');

      if (this.el.version && MG.Game) {
        this.el.version.textContent = 'v' + MG.Game.VERSION;
      }

      // PHASE 7: 부팅 시점의 초기 체력을 곧바로 표시한다 (이후로는 HP가 실제로
      // 바뀔 때만 player.js 가 다시 호출한다 — 매 프레임 갱신하지 않는다)
      if (MG.Player) this.renderHearts(MG.Player.hp, MG.Player.maxHp);
      // LAZY DINER STEP 2: 고기도 같은 방식 — 부팅 시 한 번, 이후로는 값이
      // 바뀔 때만(game.js 의 addMeat/restartSession) 다시 그린다.
      if (MG.Game) this.renderMeat(MG.Game.meat);
      // LAZY DINER STEP 3: 요리 결과물도 같은 방식으로 부팅 시 한 번 그린다.
      if (MG.Game) this.renderRamen(MG.Game.meatRamen);

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

      /* PHASE 11 STEP 3: 완료 화면의 "다시 모험하기".
         위의 두 버튼과 완전히 같은 click 경로이고, 하는 일도 기존
         MG.Game.restartSession() 하나를 부르는 것뿐이다 — 화면을 내리고
         body 클래스를 떼고 보물/다리/모스키/플레이어를 되돌리는 일은 이미
         restartSession() 안에 다 있으므로 여기서 다시 쓰지 않는다.

         gameComplete 를 먼저 보는 이유: 버튼을 빠르게 연타해도 첫 클릭이
         gameComplete 를 false 로 내리므로 두 번째부터는 조용히 무시된다
         (restartSession 이 두 번 돌아 상태가 꼬이지 않는다). */
      if (this.el.completeRestart) {
        this.el.completeRestart.addEventListener('click', function (e) {
          e.preventDefault();
          if (!MG.Game || !MG.Game.gameComplete) return;
          if (MG.Audio && MG.Audio.unlock) MG.Audio.unlock();
          if (MG.Game.restartSession) MG.Game.restartSession();
        });
      }

      /* LAZY DINER STEP 4-3b: 화면 어디를 눌러도 다음 줄로 — 대화가 열려 있는
         동안에만 존재하는 투명 레이어 하나가 pointerdown 을 받는다.
         click 이 아니라 pointerdown 만 쓰는 이유: 손가락을 뗀 뒤 브라우저가 보내는
         합성 click 은 "손가락 아래에 그때 있던 요소"로 가는데, 상호작용 버튼으로
         대화를 열었다면 그 버튼은 이미 사라지고 레이어가 그 자리에 있다 — click 을
         들으면 대화를 연 그 터치가 첫 줄에서 곧장 둘째 줄로 넘겨버릴 수 있다.
         pointerdown 은 "새로 눌렀을 때"만 발생하므로 그 위험이 없다.
         데스크톱의 E 입력은 customer.js 가 별도로 처리하고 둘 다 advanceSpeech()
         하나로 모인다(가드는 거기에 있다). */
      if (this.el.speechLayer) {
        this.el.speechLayer.addEventListener('pointerdown', function (e) {
          e.preventDefault();
          self.advanceSpeech();
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

    /* LAZY DINER STEP 2: #hud-meat 를 숫자로 채운다. hearts 와 완전히 같은
       패턴 — 값이 바뀐 순간에만 호출된다(매 프레임 갱신하지 않는다). */
    renderMeat: function (n) {
      if (!this.el.meat) this.el.meat = document.getElementById('hud-meat');
      if (!this.el.meat) return;

      var str = '🍖 ' + n;
      if (this.el.meat.textContent !== str) this.el.meat.textContent = str;
    },

    /* LAZY DINER STEP 3: #hud-ramen 을 숫자로 채운다. renderMeat 와 완전히
       같은 패턴이다. */
    renderRamen: function (n) {
      if (!this.el.ramen) this.el.ramen = document.getElementById('hud-ramen');
      if (!this.el.ramen) return;

      var str = '🍜 ' + n;
      if (this.el.ramen.textContent !== str) this.el.ramen.textContent = str;
    },

    /* LAZY DINER STEP 4-1: 손님과의 짧은 대화 상자. 일반 다이얼로그 엔진이
       아니다 — 한 줄씩 보여주고, 탭이나 E 입력으로 다음 줄로 넘기고, 마지막
       줄에서 onDone 을 부르며 스스로 닫힌다. 분기/조건/선택지는 없다.
       _speech 가 null 이 아니면 "지금 열려 있다"는 뜻이다. */
    _speech: null,

    /* STEP 4-3b 입력 가드(밀리초).
       OPEN_GUARD — 대화가 열린 직후에는 다음 줄로 넘기지 않는다. 대화를 연 그
         입력(버튼 탭/E)이 곧바로 둘째 줄로 새는 것을 막는 두 번째 안전장치다.
         (첫 번째 안전장치는 구조 자체다: 레이어는 열린 뒤에 생기므로 그 터치의
         pointerdown 을 받을 수 없고, click 은 아예 듣지 않는다.)
       ADVANCE_GAP — 한 번 넘긴 뒤 아주 짧은 시간 안의 추가 입력은 무시한다.
         같은 프레임에 pointerdown 이 여러 번 들어와도(멀티터치/연타) 한 줄만
         진행된다. 사람이 일부러 누르는 속도(> 200ms)에는 영향이 없다. */
    OPEN_GUARD_MS: 250,
    ADVANCE_GAP_MS: 120,

    _now: function () {
      return (global.performance && global.performance.now) ? global.performance.now() : Date.now();
    },

    showSpeech: function (name, lines, onDone) {
      if (!this.el.speech) this.el.speech = document.getElementById('speech-box');
      if (!this.el.speechLayer) this.el.speechLayer = document.getElementById('speech-layer');
      if (!this.el.speech || !this.el.speechLayer || !lines || !lines.length) return;

      var now = this._now();
      this._speech = { lines: lines, index: 0, onDone: onDone || null, openedAt: now, lastAdvanceAt: now };
      if (this.el.speechName) this.el.speechName.textContent = name || '';
      if (this.el.speechText) this.el.speechText.textContent = lines[0];

      // 대화 중에는 토스트가 겹쳐 보이면 안 된다(요구사항) — 열리는 순간 한 번 치운다.
      if (this.hideToast) this.hideToast();

      // 조작이 대화로 완전히 넘어간다. 눌려 있던 조이스틱/버튼 상태는 여기서 비운다 —
      // 조이스틱 영역이 손가락이 닿은 채로 숨겨지면 pointerup 을 못 받아
      // 대화가 끝난 뒤에도 조이스틱이 "이미 다른 손가락이 쓰는 중"으로 남을 수 있다.
      if (MG.Input && MG.Input.reset) MG.Input.reset();
      document.body.classList.add('mg-talking');

      this.el.speechLayer.hidden = false;
      this.el.speech.hidden = false;
    },

    /* 다음 줄로. 마지막 줄이었다면 닫고 onDone 을 한 번만 부른다.
       onDone 은 "끝까지 들었을 때"만 불린다 — hideSpeech() 로 중간에
       닫히는 경우(구역 전환/재시작)에는 절대 불리지 않는다.
       레이어 탭, 대화 상자 탭, E 입력, 상호작용 버튼 — 모든 진행 경로가 여기로
       모이므로 입력 가드도 여기 한 곳에 있다. */
    advanceSpeech: function () {
      var s = this._speech;
      if (!s) return;

      var now = this._now();
      if (now - s.openedAt < this.OPEN_GUARD_MS) return;
      if (now - s.lastAdvanceAt < this.ADVANCE_GAP_MS) return;
      s.lastAdvanceAt = now;

      s.index += 1;
      if (s.index >= s.lines.length) {
        var onDone = s.onDone;
        this._closeSpeechDom();
        if (onDone) onDone();      // 조작이 복구된 뒤에 단서 토스트가 뜬다
        return;
      }
      if (this.el.speechText) this.el.speechText.textContent = s.lines[s.index];
    },

    isSpeechOpen: function () {
      return !!this._speech;
    },

    /* 상태와 화면을 함께 닫는다(mg-talking 도 여기서 뗀다). */
    _closeSpeechDom: function () {
      this._speech = null;
      document.body.classList.remove('mg-talking');
      if (this.el.speechLayer) this.el.speechLayer.hidden = true;
      if (this.el.speech) this.el.speech.hidden = true;
    },

    /* 중간에 강제로 닫는다(구역 전환/재시작 전용) — onDone 을 부르지 않는다. */
    hideSpeech: function () {
      if (!this.el.speechLayer) this.el.speechLayer = document.getElementById('speech-layer');
      if (!this.el.speech) this.el.speech = document.getElementById('speech-box');
      if (!this._speech && !document.body.classList.contains('mg-talking')) return;
      this._closeSpeechDom();
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
    showInteract: function (icon) {
      if (!this.el.interact) this.el.interact = document.getElementById('btn-interact');
      var el = this.el.interact;
      if (!el) return;

      // LAZY DINER STEP 4-3a: 무엇과 상호작용하는지에 따라 아이콘만 바꾼다
      // (예: 손님에게 라면을 건넬 수 있으면 🍜). 인자가 없으면 기본 👋 —
      // 모스키/보물상자/화로 호출은 그대로 기본값을 받는다. 이미 보이는
      // 버튼의 아이콘도 바뀌어야 하므로 아래 조기 반환보다 먼저 갱신한다.
      var label = icon || '👋';
      if (el.textContent !== label) el.textContent = label;

      if (!el.hidden) return;

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
    },

    /* PHASE 11 STEP 2: 프로토타입 완료 화면.
       표시만 담당한다 — 완료 여부는 MG.Game.gameComplete 가 이미 알고 있고,
       여기서는 그 결과를 화면에 올릴 뿐이다. 새 상태도, 버튼도 만들지 않는다.

       토스트를 먼저 내리는 이유: 상자를 열면 "달빛 조각을 획득했다!" 가 떠 있는데
       그 위로 완료 화면이 덮이면 문구가 반쯤 가려진 채 남는다. 이미 재시작 문구가
       같은 이유로 hideToast() 를 부르고 있다(PHASE 9.1) — 같은 방식을 따른다. */
    showComplete: function () {
      if (!this.el.complete) this.el.complete = document.getElementById('overlay-complete');
      var el = this.el.complete;
      if (!el || !el.hidden) return;              // 이미 떠 있으면 아무 것도 하지 않는다

      if (this.hideToast) this.hideToast();

      el.hidden = false;
      void el.offsetWidth;          // 숨김 → 표시 전환에서 페이드가 생략되지 않도록
      el.classList.add('is-visible');
      document.body.classList.add('mg-complete');
    },

    /* 세션 재시작에서만 불린다 — 즉시 걷어낸다(페이드 없이). */
    hideComplete: function () {
      if (!this.el.complete) this.el.complete = document.getElementById('overlay-complete');
      document.body.classList.remove('mg-complete');
      /* PHASE 12 STEP 1: 화면을 치울 때 피드백 폼도 처음 상태로 되돌린다.
         (저장된 기록은 그대로 둔다 — 다시 모험한다고 지워지면 안 된다)
         여기서 하면 restartSession() 구조를 건드리지 않아도 된다. */
      if (MG.Feedback && MG.Feedback.resetForm) MG.Feedback.resetForm();
      var el = this.el.complete;
      if (!el) return;
      el.classList.remove('is-visible');
      el.hidden = true;
    },

    isCompleteVisible: function () {
      if (!this.el.complete) this.el.complete = document.getElementById('overlay-complete');
      return !!(this.el.complete && !this.el.complete.hidden);
    }
  };

  MG.UI = UI;
})(window);
