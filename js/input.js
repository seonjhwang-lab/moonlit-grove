/* ==========================================================================
   input.js — 키보드 / 터치 입력
   PHASE 1 범위: 키 상태 추적과 정규화된 이동 axis
   PHASE 3 범위: 모바일 가상 조이스틱(좌하단) + 공격 버튼 플레이스홀더(우하단)
     - Pointer Events 로 터치/마우스를 동일하게 처리한다
     - 조이스틱은 터치 영역 안 아무 곳이나 짚으면 그 자리에 즉시 나타나는
       "플로팅" 방식이라 반응이 즉각적이다
     - 공격 버튼은 시각적 눌림 상태와 1프레임 엣지 트리거만 제공한다.
       실제 공격 판정(히트박스/데미지)은 PHASE 5 combat.js 의 몫이다.
   ========================================================================== */
(function (global) {
  'use strict';

  var MG = global.MG = global.MG || {};

  // 게임에서 사용하는 키만 브라우저 기본 동작(스크롤 등)을 막는다
  var BLOCKED = {
    ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, Space: 1
  };

  var JOY_RADIUS = 40;   // 조이스틱 최대 이동 반경(px, 화면 좌표)
  var JOY_DEADZONE = 6;  // 중심 부근 흔들림 무시 반경(px)

  var Input = {
    keys: {},                  // code -> true/false
    axis: { x: 0, y: 0 },      // 정규화된 이동 입력 (-1 ~ 1), 키보드/터치 통합
    attackPressed: false,      // 공격 버튼이 "이번 프레임에" 눌렸는지 (1프레임 엣지)
    hasTouch: false,

    _joyPointerId: null,
    _joyOriginX: 0,
    _joyOriginY: 0,
    _touchAxis: { x: 0, y: 0 },
    _attackPointerId: null,
    _attackRequested: false,

    init: function () {
      var self = this;

      global.addEventListener('keydown', function (e) {
        if (e.repeat) return;
        self.keys[e.code] = true;
        if (BLOCKED[e.code]) e.preventDefault();
      });

      global.addEventListener('keyup', function (e) {
        self.keys[e.code] = false;
        if (BLOCKED[e.code]) e.preventDefault();
      });

      // 탭 전환 시 키가 눌린 채로 남지 않게 초기화
      global.addEventListener('blur', function () { self.reset(); });
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) self.reset();
      });

      this.hasTouch = ('ontouchstart' in global) || navigator.maxTouchPoints > 0;
      document.body.classList.toggle('mg-touch', this.hasTouch);

      if (this.hasTouch) this.initTouchControls();
    },

    reset: function () {
      this.keys = {};
      this.axis.x = 0;
      this.axis.y = 0;
      this._touchAxis.x = 0;
      this._touchAxis.y = 0;
      this._joyPointerId = null;
      this._attackPointerId = null;
      this._attackRequested = false;
      this.hideJoystick();
      this.setAttackPressedVisual(false);
    },

    isDown: function (code) {
      return !!this.keys[code];
    },

    /* -------------------------------------------------------- 터치 컨트롤 */
    initTouchControls: function () {
      var self = this;
      this.el = {
        zone: document.getElementById('joystick-zone'),
        base: document.getElementById('joystick-base'),
        knob: document.getElementById('joystick-knob'),
        attackBtn: document.getElementById('btn-attack')
      };
      if (!this.el.zone || !this.el.attackBtn) return;

      this.el.zone.addEventListener('pointerdown', function (e) {
        if (self._joyPointerId !== null) return; // 이미 다른 손가락이 조작 중
        self._joyPointerId = e.pointerId;
        self._joyOriginX = e.clientX;
        self._joyOriginY = e.clientY;
        self.showJoystickAt(e.clientX, e.clientY);
        self.updateJoystick(e.clientX, e.clientY);
        if (self.el.zone.setPointerCapture) {
          try { self.el.zone.setPointerCapture(e.pointerId); } catch (err) {}
        }
        e.preventDefault();
      });

      this.el.zone.addEventListener('pointermove', function (e) {
        if (e.pointerId !== self._joyPointerId) return;
        self.updateJoystick(e.clientX, e.clientY);
        e.preventDefault();
      });

      var releaseJoystick = function (e) {
        if (e.pointerId !== self._joyPointerId) return;
        self._joyPointerId = null;
        self._touchAxis.x = 0;
        self._touchAxis.y = 0;
        self.hideJoystick();
      };
      this.el.zone.addEventListener('pointerup', releaseJoystick);
      this.el.zone.addEventListener('pointercancel', releaseJoystick);

      // 공격 버튼: 시각적 눌림 상태 + 1프레임 엣지 트리거
      this.el.attackBtn.addEventListener('pointerdown', function (e) {
        if (self._attackPointerId !== null) return;
        self._attackPointerId = e.pointerId;
        self._attackRequested = true;
        self.setAttackPressedVisual(true);
        if (self.el.attackBtn.setPointerCapture) {
          try { self.el.attackBtn.setPointerCapture(e.pointerId); } catch (err) {}
        }
        e.preventDefault();
      });

      var releaseAttack = function (e) {
        if (e.pointerId !== self._attackPointerId) return;
        self._attackPointerId = null;
        self.setAttackPressedVisual(false);
      };
      this.el.attackBtn.addEventListener('pointerup', releaseAttack);
      this.el.attackBtn.addEventListener('pointercancel', releaseAttack);
    },

    showJoystickAt: function (x, y) {
      if (!this.el || !this.el.base) return;
      this.el.base.style.left = x + 'px';
      this.el.base.style.top = y + 'px';
      this.el.base.hidden = false;
    },

    hideJoystick: function () {
      if (!this.el || !this.el.base || !this.el.knob) return;
      this.el.base.hidden = true;
      this.el.knob.style.transform = 'translate(0px, 0px)';
    },

    updateJoystick: function (x, y) {
      var dx = x - this._joyOriginX;
      var dy = y - this._joyOriginY;
      var dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < JOY_DEADZONE) {
        this._touchAxis.x = 0;
        this._touchAxis.y = 0;
        if (this.el && this.el.knob) this.el.knob.style.transform = 'translate(0px, 0px)';
        return;
      }

      var clamped = Math.min(dist, JOY_RADIUS);
      var nx = dx / dist;
      var ny = dy / dist;
      var kx = nx * clamped;
      var ky = ny * clamped;

      this._touchAxis.x = kx / JOY_RADIUS;
      this._touchAxis.y = ky / JOY_RADIUS;

      if (this.el && this.el.knob) {
        this.el.knob.style.transform = 'translate(' + kx.toFixed(1) + 'px, ' + ky.toFixed(1) + 'px)';
      }
    },

    setAttackPressedVisual: function (pressed) {
      if (this.el && this.el.attackBtn) {
        this.el.attackBtn.classList.toggle('is-pressed', pressed);
      }
    },

    /* 매 프레임 이동 입력을 갱신 (player.js 가 axis 를, 이후 combat.js 가
       attackPressed 를 사용한다) */
    update: function () {
      var kx = 0, ky = 0;
      if (this.isDown('KeyA') || this.isDown('ArrowLeft'))  kx -= 1;
      if (this.isDown('KeyD') || this.isDown('ArrowRight')) kx += 1;
      if (this.isDown('KeyW') || this.isDown('ArrowUp'))    ky -= 1;
      if (this.isDown('KeyS') || this.isDown('ArrowDown'))  ky += 1;

      // 대각선 이동이 빨라지지 않도록 정규화
      if (kx !== 0 && ky !== 0) {
        var inv = Math.SQRT1_2;
        kx *= inv;
        ky *= inv;
      }

      var joyActive = this._joyPointerId !== null;
      this.axis.x = joyActive ? this._touchAxis.x : kx;
      this.axis.y = joyActive ? this._touchAxis.y : ky;

      var spaceEdge = this.isDown('Space') && !this._spaceWasDown;
      this._spaceWasDown = this.isDown('Space');

      this.attackPressed = this._attackRequested || spaceEdge;
      this._attackRequested = false;
    }
  };

  MG.Input = Input;
})(window);
