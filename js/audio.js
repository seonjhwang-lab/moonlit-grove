/* ==========================================================================
   audio.js — 사운드 관리 (합성 효과음)
   PHASE 5 범위: 검 휘두르는 소리.
   PHASE 6 범위: 모슬링 피격 / 처치 소리.
     - 브라우저 자동재생 정책 때문에 AudioContext 는 사용자 제스처 이후에만
       만들 수 있다 (unlock() 은 ui.js 의 "모험 시작" 클릭에서 이미 호출된다).
     - 오디오 실패가 게임 진행을 막아서는 안 된다 — 모든 단계를 try/catch 로
       감싸고, 실패 시 조용히 무음으로 넘어간다.
   나머지 효과음(영입/다리/상자 등)은 해당 기능이 생기는 Phase에서 같은 패턴으로 추가한다.
   ========================================================================== */
(function (global) {
  'use strict';
  var MG = global.MG = global.MG || {};

  /* PHASE 9.2: 앰비언스(밤 숲 공기) 설정.
     "음악"이 아니라 "방 톤"이다 — 플레이어가 소리가 켜졌다고 의식하면 실패다.
     그래서 효과음(검 0.5 / 피격 0.22 / 접촉 0.26)의 10~15% 수준으로만 깐다.
     모드는 두 개뿐이고, 모드가 바뀌어도 노드를 새로 만들지 않는다 —
     이미 있는 체인의 값만 2초에 걸쳐 옮긴다(setAmbientMode 참고). */
  var AMBIENT_FADE = 2.0;       // 초 — 모드 전환 / 페이드인에 걸리는 시간
  var AMBIENT = {
    forest: {
      windFreq: 320,            // Hz — 낮게 눌러 "멀리서 움직이는 공기"로
      windGain: 0.035,
      cricketWave: 'sine',
      cricketFreq: 4400,        // 건조하고 조심스러운 밤벌레
      cricketGain: 0.02,
      cricketDecay: 0.05,       // 초 (0.03~0.08 범위)
      cricketMin: 4.0,          // 초 — 다음 울음까지 최소/최대 간격
      cricketMax: 8.0
    },
    cleansed: {
      windFreq: 620,            // 더 열리고 가벼운 공기
      windGain: 0.025,          // 정화 후에는 일부러 더 조용하다
      cricketWave: 'triangle',  // 사인보다 살짝 부드럽게
      cricketFreq: 3600,
      cricketGain: 0.015,
      cricketDecay: 0.08,       // 여운이 조금 더 길다
      cricketMin: 6.0,          // 더 느긋하게 운다
      cricketMax: 11.0
    }
  };

  var Audio = {
    ctx: null,
    unlocked: false,
    _noiseBuffer: null,

    /* PHASE 9.2: 앰비언스는 "단 하나"만 존재한다.
       _ambient 가 null 이 아니면 이미 돌고 있다는 뜻이며, 어떤 경로로도
       두 번째 체인을 만들지 않는다(가시성 토글/재시작/모드 변경 모두). */
    _ambient: null,             // { src, filter, gain } — 지속 노드는 이 셋뿐
    _ambientMode: 'forest',
    _cricketTimer: null,        // 밤벌레 자체 예약 타이머 (항상 최대 1개)
    _ambientHidden: false,      // 탭이 가려져 앰비언스를 죽여둔 상태인가

    /* main.js 부팅 시 호출된다. 여기서는 AudioContext 를 만들지 않는다 —
       사용자 제스처 없이 생성하면 대부분의 브라우저가 suspended 상태로 묶어둔다.
       PHASE 9.2: 가시성 리스너만 여기서 한 번 등록한다(노드는 만들지 않는다).
       unlock() 에서 등록하면 재호출 시 리스너가 중복될 수 있다. */
    init: function () {
      var self = this;
      try {
        document.addEventListener('visibilitychange', function () {
          self._onAmbientVisibility();
        });
      } catch (e) {
        // 리스너 등록 실패도 게임을 막지 않는다
      }
    },

    /* 사용자의 첫 탭/클릭(예: "모험 시작" 버튼)에서 호출해야 한다. */
    unlock: function () {
      if (this.unlocked) return;
      try {
        var Ctx = global.AudioContext || global.webkitAudioContext;
        if (!Ctx) return;
        this.ctx = new Ctx();
        this._noiseBuffer = this._buildNoiseBuffer();
        if (this.ctx.state === 'suspended' && this.ctx.resume) this.ctx.resume();
        this.unlocked = true;
      } catch (e) {
        this.ctx = null; // 오디오 없이도 게임은 계속된다
      }

      // PHASE 9.2: 앰비언스는 오직 이 시점(=실제 제스처로 unlock 이 성공한 뒤)에만
      // 시작된다. try 블록 밖에 두어, 혹시 실패하더라도 위에서 만든 ctx 를
      // 날려버리지 않게 한다(효과음은 계속 나와야 한다).
      if (this.unlocked) this.startAmbience();
    },

    _buildNoiseBuffer: function () {
      var len = Math.floor(this.ctx.sampleRate * 0.2);
      var buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      return buf;
    },

    /* ==================================================== PHASE 9.2 앰비언스 */

    /* 지속되는 "숲의 숨" 한 겹을 만든다. 지속 노드는 정확히 셋뿐이다:
         노이즈 소스(루프) → 로우패스 필터 → 게인 → 스피커
       이미 돌고 있으면 아무것도 하지 않는다 — 어떤 경로로 몇 번을 불러도
       두 번째 체인은 생기지 않는다. 새 노이즈 버퍼도 만들지 않고 기존
       _noiseBuffer 를 그대로 재사용한다. */
    startAmbience: function () {
      if (!this.ctx || !this._noiseBuffer) return;
      if (this._ambient) return;                 // 이미 하나 있다 — 절대 중복 생성 금지

      try {
        var ctx = this.ctx;
        var now = ctx.currentTime;
        var cfg = AMBIENT[this._ambientMode] || AMBIENT.forest;

        var src = ctx.createBufferSource();
        src.buffer = this._noiseBuffer;
        src.loop = true;
        // 0.2초짜리 짧은 버퍼를 그대로 반복하면 주기가 규칙적으로 들린다.
        // 재생 속도를 낮춰 반복 주기를 늘리고 스펙트럼도 함께 낮춰,
        // 아래 로우패스와 합쳐지면 "화이트노이즈"가 아니라 먼 공기처럼 들린다.
        src.playbackRate.value = 0.35;

        var filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.Q.value = 0.8;
        // setValueAtTime 대신 .value 로 직접 넣는다 — 즉시 반영되므로 이후
        // setAmbientMode() 가 "현재 값"을 읽어 이어붙일 때 기본값(350Hz)이
        // 잘못 잡히지 않는다.
        filter.frequency.value = cfg.windFreq;

        var gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(cfg.windGain, now + AMBIENT_FADE);

        src.connect(filter).connect(gain).connect(ctx.destination);
        src.start(now);

        this._ambient = { src: src, filter: filter, gain: gain };
        this._ambientHidden = false;
        this.scheduleNextCricket();
      } catch (e) {
        this._ambient = null;   // 실패해도 게임은 그대로 진행된다
      }
    },

    /* 앰비언스를 완전히 내린다. 평상시 흐름에서는 쓰지 않는다(모드만 바꾼다) —
       오디오를 통째로 정리해야 하는 예외 상황을 위한 대칭 함수다. */
    stopAmbience: function () {
      if (this._cricketTimer) {
        global.clearTimeout(this._cricketTimer);
        this._cricketTimer = null;
      }
      var a = this._ambient;
      this._ambient = null;
      if (!a) return;
      try {
        a.src.stop();
        a.src.disconnect();
        a.filter.disconnect();
        a.gain.disconnect();
      } catch (e) {
        // 이미 정리된 노드일 수 있다 — 조용히 넘어간다
      }
    },

    /* 'forest' | 'cleansed' — 노드를 다시 만들지 않고, 살아있는 체인의 값만
       AMBIENT_FADE(2초)에 걸쳐 부드럽게 옮긴다. 몇 번을 불러도 노드 수는
       그대로다. 아직 앰비언스가 시작되기 전이라면 모드만 기억해 두었다가
       startAmbience() 가 그 모드로 시작한다. */
    setAmbientMode: function (mode) {
      if (mode !== 'forest' && mode !== 'cleansed') return;
      this._ambientMode = mode;

      var a = this._ambient;
      if (!a || !this.ctx) return;

      try {
        var cfg = AMBIENT[mode];
        var now = this.ctx.currentTime;

        a.filter.frequency.cancelScheduledValues(now);
        a.filter.frequency.setValueAtTime(a.filter.frequency.value, now);
        a.filter.frequency.linearRampToValueAtTime(cfg.windFreq, now + AMBIENT_FADE);

        // 탭이 가려져 있는 동안에는 음량을 건드리지 않는다(무음을 유지해야 한다).
        // 다시 보이게 될 때 _onAmbientVisibility() 가 현재 모드 음량으로 올린다.
        if (!this._ambientHidden) {
          a.gain.gain.cancelScheduledValues(now);
          a.gain.gain.setValueAtTime(a.gain.gain.value, now);
          a.gain.gain.linearRampToValueAtTime(cfg.windGain, now + AMBIENT_FADE);
        }
      } catch (e) {
        // 값 전환 실패는 무시한다 — 소리만 이전 상태로 남을 뿐이다
      }
    },

    /* 밤벌레 예약 — setInterval 로 영원히 도는 대신, 한 번 울 때마다 다음 시각을
       무작위로 다시 잡는 자체 예약 방식이다. 타이머는 언제나 최대 하나이고,
       탭이 가려지면 아예 예약하지 않는다. */
    scheduleNextCricket: function () {
      if (!this.ctx || !this._ambient) return;
      if (this._ambientHidden) return;
      if (this._cricketTimer) return;            // 스케줄러 중복 방지

      var self = this;
      var cfg = AMBIENT[this._ambientMode] || AMBIENT.forest;
      var wait = (cfg.cricketMin + Math.random() * (cfg.cricketMax - cfg.cricketMin)) * 1000;

      this._cricketTimer = global.setTimeout(function () {
        self._cricketTimer = null;
        self.playAmbientCricket();
        self.nudgeAmbientWind();
        self.scheduleNextCricket();              // 다음 울음을 새로 예약한다
      }, wait);
    },

    /* 아주 짧은 두 번의 펄스로 "찌-찍" 하는 밤벌레 하나. 매번 새로 만들고
       stop() 으로 스스로 끝나므로 노드가 쌓이지 않는다(브라우저가 회수한다).
       보통 동시에 존재하는 울음은 하나뿐이다. */
    playAmbientCricket: function () {
      if (!this.ctx || this._ambientHidden) return;

      try {
        var ctx = this.ctx;
        var cfg = AMBIENT[this._ambientMode] || AMBIENT.forest;
        var now = ctx.currentTime;

        for (var i = 0; i < 2; i++) {
          var start = now + i * 0.055;

          var osc = ctx.createOscillator();
          osc.type = cfg.cricketWave;
          // 두 번째 펄스를 살짝 높여 기계적으로 반복되는 느낌을 없앤다
          osc.frequency.setValueAtTime(cfg.cricketFreq * (i === 0 ? 1 : 1.02), start);

          var g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, start);
          g.gain.exponentialRampToValueAtTime(cfg.cricketGain, start + 0.006);
          g.gain.exponentialRampToValueAtTime(0.0001, start + cfg.cricketDecay);

          osc.connect(g).connect(ctx.destination);
          osc.start(start);
          osc.stop(start + cfg.cricketDecay + 0.02);
        }
      } catch (e) {
        // 무음으로 넘어간다
      }
    },

    /* 바람 필터를 아주 살짝 흔든다. 전용 LFO 오실레이터를 상시로 두지 않기 위해,
       이미 돌고 있는 밤벌레 예약에 얹어 가끔 한 번씩만 값을 옮긴다.
       (지속 노드를 늘리지 않으면서 루프의 규칙성을 덮는 최소한의 변화) */
    nudgeAmbientWind: function () {
      var a = this._ambient;
      if (!a || !this.ctx || this._ambientHidden) return;
      try {
        var cfg = AMBIENT[this._ambientMode] || AMBIENT.forest;
        var now = this.ctx.currentTime;
        var target = cfg.windFreq * (0.9 + Math.random() * 0.2);   // ±10%
        a.filter.frequency.cancelScheduledValues(now);
        a.filter.frequency.setValueAtTime(a.filter.frequency.value, now);
        a.filter.frequency.linearRampToValueAtTime(target, now + 3.0);
      } catch (e) {
        // 무시한다
      }
    },

    /* 탭이 가려지면 앰비언스를 무음으로 내리고 밤벌레 예약을 멈춘다.
       다시 보이면 원래 음량으로 올리고 예약을 되살린다 — 이때도 노드는
       새로 만들지 않는다(같은 체인의 게인만 오르내린다). */
    _onAmbientVisibility: function () {
      if (!this.ctx || !this._ambient) return;   // 아직 시작 전이면 할 일이 없다

      var hidden = !!document.hidden;
      if (hidden === this._ambientHidden) return;
      this._ambientHidden = hidden;

      try {
        var cfg = AMBIENT[this._ambientMode] || AMBIENT.forest;
        var now = this.ctx.currentTime;
        var g = this._ambient.gain.gain;
        g.cancelScheduledValues(now);
        g.setValueAtTime(g.value, now);
        g.linearRampToValueAtTime(hidden ? 0.0001 : cfg.windGain, now + 0.35);
      } catch (e) {
        // 무시한다
      }

      if (hidden) {
        if (this._cricketTimer) {
          global.clearTimeout(this._cricketTimer);
          this._cricketTimer = null;
        }
      } else {
        this.scheduleNextCricket();
      }
    },

    /* 검 휘두르는 소리 — 화이트노이즈를 대역통과 필터로 빠르게 쓸어내려
       저작권 걱정 없는 절차적 "휙" 소리를 합성한다. */
    playSwordSwing: function () {
      if (!this.ctx || !this._noiseBuffer) return;
      try {
        var ctx = this.ctx;
        var now = ctx.currentTime;

        var src = ctx.createBufferSource();
        src.buffer = this._noiseBuffer;

        var filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.Q.value = 0.9;
        filter.frequency.setValueAtTime(3200, now);
        filter.frequency.exponentialRampToValueAtTime(700, now + 0.14);

        var gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.5, now + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

        src.connect(filter).connect(gain).connect(ctx.destination);
        src.start(now);
        src.stop(now + 0.2);
      } catch (e) {
        // 무음으로 넘어간다 — 오디오 실패가 게임플레이를 막지 않는다
      }
    },

    /* 모슬링 피격 — 짧고 높은 "톡" 소리. 오실레이터 피치를 빠르게 떨어뜨려
       타격감을 준다 (검 소리와 겹쳐도 구분되도록 노이즈 대신 톤을 사용).
       PHASE 6.1: "탁/착" 하고 걸리는 맛을 더하려고, 톤 앞에 아주 짧은 노이즈
       클릭을 한 겹 더 얹었다 — 타악기의 어택 성분처럼 순간적인 "딱" 임팩트를 준다. */
    playEnemyHit: function () {
      if (!this.ctx) return;
      try {
        var ctx = this.ctx;
        var now = ctx.currentTime;

        // 클릭 레이어 (아주 짧은 노이즈, 어택 성분)
        if (this._noiseBuffer) {
          var click = ctx.createBufferSource();
          click.buffer = this._noiseBuffer;
          var clickFilter = ctx.createBiquadFilter();
          clickFilter.type = 'highpass';
          clickFilter.frequency.value = 1200;
          var clickGain = ctx.createGain();
          clickGain.gain.setValueAtTime(0.28, now);
          clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);
          click.connect(clickFilter).connect(clickGain).connect(ctx.destination);
          click.start(now);
          click.stop(now + 0.03);
        }

        // 톤 레이어 (기존 — 피치가 빠르게 떨어지는 짧은 사각파)
        var osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(180, now + 0.08);

        var gain = ctx.createGain();
        gain.gain.setValueAtTime(0.22, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.1);
      } catch (e) {
        // 무음으로 넘어간다
      }
    },

    /* 모슬링 처치 — 노이즈가 낮은 쪽으로 흩어지며 잦아드는 "풋" 소리.
       모스(이끼) 생명체가 흩어져 사라지는 이미지에 맞춘 절차적 효과음. */
    playEnemyDefeat: function () {
      if (!this.ctx || !this._noiseBuffer) return;
      try {
        var ctx = this.ctx;
        var now = ctx.currentTime;

        var src = ctx.createBufferSource();
        src.buffer = this._noiseBuffer;

        var filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.Q.value = 0.7;
        filter.frequency.setValueAtTime(1800, now);
        filter.frequency.exponentialRampToValueAtTime(220, now + 0.26);

        var gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.35, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

        src.connect(filter).connect(gain).connect(ctx.destination);
        src.start(now);
        src.stop(now + 0.3);
      } catch (e) {
        // 무음으로 넘어간다
      }
    },

    /* PHASE 8: 달의 돌 활성화 보상음 — 지금까지의 효과음(짧은 타격/둔탁한 접촉)과
       완전히 구분되는, 밝고 울림 있는 상승 아르페지오. 다섯 번째 음까지 차례로
       쌓아 "해냈다"는 신호를 준다. 다른 소리보다 길지만(약 1초) 게임 진행을
       막지 않으며, 오디오가 실패해도 조용히 넘어간다. */
    playReward: function () {
      if (!this.ctx) return;
      try {
        var ctx = this.ctx;
        var now = ctx.currentTime;

        // C5 - E5 - G5 - C6 (밝은 장3화음 + 옥타브) — 차례로 겹쳐 울린다
        var notes = [523.25, 659.25, 783.99, 1046.50];
        for (var i = 0; i < notes.length; i++) {
          var start = now + i * 0.09;

          var osc = ctx.createOscillator();
          osc.type = 'triangle';                    // 사각파보다 부드럽고 종소리에 가깝다
          osc.frequency.setValueAtTime(notes[i], start);

          var gain = ctx.createGain();
          gain.gain.setValueAtTime(0.0001, start);
          gain.gain.exponentialRampToValueAtTime(0.20, start + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.75);

          osc.connect(gain).connect(ctx.destination);
          osc.start(start);
          osc.stop(start + 0.8);
        }

        // 맨 위에 얹는 짧은 반짝임 — 노이즈를 높게 깎아 "샤랑" 하는 결을 준다
        if (this._noiseBuffer) {
          var shimmer = ctx.createBufferSource();
          shimmer.buffer = this._noiseBuffer;

          var hp = ctx.createBiquadFilter();
          hp.type = 'highpass';
          hp.frequency.setValueAtTime(2600, now);
          hp.frequency.exponentialRampToValueAtTime(6000, now + 0.5);

          var sGain = ctx.createGain();
          sGain.gain.setValueAtTime(0.0001, now);
          sGain.gain.exponentialRampToValueAtTime(0.10, now + 0.06);
          sGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);

          shimmer.connect(hp).connect(sGain).connect(ctx.destination);
          shimmer.start(now);
          shimmer.stop(now + 0.62);
        }
      } catch (e) {
        // 무음으로 넘어간다 — 오디오 실패가 게임플레이를 막지 않는다
      }
    },

    /* PHASE 6.2: 모슬링 돌진이 플레이어에 닿았을 때 — 검 타격음(사각파, 밝고 높음)
       이나 처치음(노이즈, 길게 잦아듦)과는 확실히 다른, 둔탁하고 낮은 "퍽" 톤을
       사인파로 만든다. 데미지가 아니라 "닿았다"는 신호일 뿐이라 자극적이지 않게. */
    playPlayerContact: function () {
      if (!this.ctx) return;
      try {
        var ctx = this.ctx;
        var now = ctx.currentTime;

        var osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(85, now + 0.10);

        var gain = ctx.createGain();
        gain.gain.setValueAtTime(0.26, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.13);
      } catch (e) {
        // 무음으로 넘어간다
      }
    }
  };

  MG.Audio = Audio;
})(window);
