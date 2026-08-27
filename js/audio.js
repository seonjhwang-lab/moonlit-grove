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

  var Audio = {
    ctx: null,
    unlocked: false,
    _noiseBuffer: null,

    /* main.js 부팅 시 호출된다. 여기서는 AudioContext 를 만들지 않는다 —
       사용자 제스처 없이 생성하면 대부분의 브라우저가 suspended 상태로 묶어둔다. */
    init: function () {},

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
    },

    _buildNoiseBuffer: function () {
      var len = Math.floor(this.ctx.sampleRate * 0.2);
      var buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      return buf;
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
