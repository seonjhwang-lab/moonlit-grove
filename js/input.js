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
    interactPressed: false,    // PHASE 9-1: 상호작용(E / 모바일 버튼) 1프레임 엣지
    abilityPressed: false,     // PHASE 10-2: 동료 능력(Q / 모바일 버튼) 1프레임 엣지
    hasTouch: false,

    _joyPointerId: null,
    _joyOriginX: 0,
    _joyOriginY: 0,
    _touchAxis: { x: 0, y: 0 },
    _attackPointerId: null,
    _attackRequested: false,
    _interactPointerId: null,
    _interactRequested: false,
    _eWasDown: false,
    _abilityPointerId: null,
    _abilityRequested: false,
    _qWasDown: false,

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
      // PHASE 9-1: 상호작용 상태도 남김없이 지운다 (탭 전환/블러로 버튼이 눌린
      // 채 남아 다음 프레임에 유령 상호작용이 발생하는 것을 막는다)
      this._interactPointerId = null;
      this._interactRequested = false;
      this._eWasDown = false;
      this.interactPressed = false;
      // PHASE 10-2: 능력 입력도 같은 이유로 남김없이 지운다
      this._abilityPointerId = null;
      this._abilityRequested = false;
      this._qWasDown = false;
      this.abilityPressed = false;
      this.hideJoystick();
      this.setAttackPressedVisual(false);
      this.setInteractPressedVisual(false);
      this.setAbilityPressedVisual(false);
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
        attackBtn: document.getElementById('btn-attack'),
        interactBtn: document.getElementById('btn-interact'),  // PHASE 9 STEP 1
        abilityBtn: document.getElementById('btn-ability')      // PHASE 10 STEP 2
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

      /* PHASE 9 STEP 1: 상호작용 버튼. 공격 버튼과 완전히 같은 Pointer Events
         구조를 쓰고, 키보드 E 와 같은 _interactRequested 플래그를 세운다 —
         새 터치 아키텍처를 만들지 않는다. 평소에는 hidden 이며
         MG.UI.showInteract() 가 불릴 때만 화면에 나타난다. */
      if (this.el.interactBtn) {
        this.el.interactBtn.addEventListener('pointerdown', function (e) {
          if (self._interactPointerId !== null) return;
          self._interactPointerId = e.pointerId;
          self._interactRequested = true;
          self.setInteractPressedVisual(true);
          if (self.el.interactBtn.setPointerCapture) {
            try { self.el.interactBtn.setPointerCapture(e.pointerId); } catch (err) {}
          }
          e.preventDefault();
        });

        var releaseInteract = function (e) {
          if (e.pointerId !== self._interactPointerId) return;
          self._interactPointerId = null;
          self.setInteractPressedVisual(false);
        };
        this.el.interactBtn.addEventListener('pointerup', releaseInteract);
        this.el.interactBtn.addEventListener('pointercancel', releaseInteract);
      }

      /* PHASE 10 STEP 2: 동료 능력 버튼. 공격/상호작용 버튼과 완전히 같은
         Pointer Events 구조이고, 키보드 Q 와 같은 _abilityRequested 를 세운다.
         평소에는 hidden 이며 MG.UI.showAbility() 가 불릴 때만 나타난다. */
      if (this.el.abilityBtn) {
        this.el.abilityBtn.addEventListener('pointerdown', function (e) {
          if (self._abilityPointerId !== null) return;
          self._abilityPointerId = e.pointerId;
          self._abilityRequested = true;
          self.setAbilityPressedVisual(true);
          if (self.el.abilityBtn.setPointerCapture) {
            try { self.el.abilityBtn.setPointerCapture(e.pointerId); } catch (err) {}
          }
          e.preventDefault();
        });

        var releaseAbility = function (e) {
          if (e.pointerId !== self._abilityPointerId) return;
          self._abilityPointerId = null;
          self.setAbilityPressedVisual(false);
        };
        this.el.abilityBtn.addEventListener('pointerup', releaseAbility);
        this.el.abilityBtn.addEventListener('pointercancel', releaseAbility);
      }
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

    setInteractPressedVisual: function (pressed) {
      if (this.el && this.el.interactBtn) {
        this.el.interactBtn.classList.toggle('is-pressed', pressed);
      }
    },

    setAbilityPressedVisual: function (pressed) {
      if (this.el && this.el.abilityBtn) {
        this.el.abilityBtn.classList.toggle('is-pressed', pressed);
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

      /* PHASE 9 STEP 1: 상호작용도 공격과 똑같은 1프레임 엣지다. keydown 핸들러가
         이미 e.repeat 를 걸러내지만, 키를 누르고 있는 동안 매 프레임 발화하지
         않도록 여기서도 눌림 전환만 잡는다. 소비 여부와 무관하게 매 프레임 새로
         계산되므로 플래그가 다음 프레임까지 남지 않는다. */
      var eEdge = this.isDown('KeyE') && !this._eWasDown;
      this._eWasDown = this.isDown('KeyE');

      this.interactPressed = this._interactRequested || eEdge;
      this._interactRequested = false;

      // PHASE 10 STEP 2: 능력도 완전히 같은 1프레임 엣지다.
      var qEdge = this.isDown('KeyQ') && !this._qWasDown;
      this._qWasDown = this.isDown('KeyQ');

      this.abilityPressed = this._abilityRequested || qEdge;
      this._abilityRequested = false;
    }
  };

  MG.Input = Input;
})(window);
