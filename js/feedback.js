/* ==========================================================================
   feedback.js — 피드백 화면 / LocalStorage
   PHASE 12 STEP 1 범위: 입력 UI + LocalStorage 저장/읽기.
     - JSON 내보내기 / 다운로드 / 관리자 화면 / 서버 전송은 이 단계에 없다.

   항목에 대하여:
     GAME_DESIGN.md 에는 Phase 12 절이 없다. 문서 전체에서 피드백을 언급하는
     곳은 개발 원칙 9 "친구 피드백을 적극적으로 반영한다" 한 줄뿐이고, 평가
     항목·질문·저장 키·구조·필수 조건은 어디에도 정의되어 있지 않다.
     그래서 항목은 임의로 늘리지 않고 사용자가 직접 정한 둘만 받는다:
       · rating  — 재미 점수 1~5 (선택하지 않으면 null)
       · comment — 자유 의견 (빈 문자열 가능)
     문서에 없는 필수 조건을 만들지 않으므로 둘 다 비어 있어도 저장된다.
     날짜/시간/버전 같은 필드도 문서에 없으므로 넣지 않는다.

   저장 구조에 대하여:
     기존 저장 키가 코드에 전혀 없었고 문서도 이름을 주지 않아, 프로젝트 이름을
     딴 'moonlit-grove-feedback' 을 쓴다. 값은 레코드 배열이며 제출할 때마다
     뒤에 덧붙인다 — 덮어쓰면 친구 두 번째 사람의 의견이 첫 번째를 지운다.

   ── 모바일 키보드에 대하여 (PHASE 12 ROOT-CAUSE FIX) ──────────────────────
     이 파일에는 키보드 관련 계산이 한 줄도 없다. 일부러 그렇게 했다.

     처음에는 폼이 완료 화면(#game-root 안, position:fixed) 안에 있었다.
     html/body 가 overflow:hidden + touch-action:none 이라 문서가 스크롤될 수
     없었고, 안드로이드 Chrome 이 "포커스된 입력을 문서 스크롤로 끌어올리는"
     기본 동작을 할 방법이 없었다. 그래서 visualViewport 로 #game-root 를 옮기고
     Game.resize() 를 부르고 scrollIntoView 로 끌어당기는 보정을 얹었는데,
     무대가 9:16 비율 고정이라 높이가 줄면 폭까지 줄어 화면 전체가 출렁였다.

     지금은 피드백 화면이 #game-root 바깥의 평범한 문서 흐름 요소이고, 열려 있는
     동안만 body 스크롤이 열린다(style.css 의 body.mg-feedback). 키보드 대응은
     브라우저가 알아서 한다 — 그래서 여기서 할 일이 없다.

   LocalStorage 는 시크릿 모드/차단 설정에서 예외를 던질 수 있다. 오디오와 같은
   원칙으로, 실패해도 게임은 그대로 진행된다 — 조용히 false 를 돌려줄 뿐이다.
   ========================================================================== */
(function (global) {
  'use strict';
  var MG = global.MG = global.MG || {};

  var STORAGE_KEY = 'moonlit-grove-feedback';

  var Feedback = {
    KEY: STORAGE_KEY,

    el: {},
    rating: null,      // 1~5 또는 null (선택 안 함)
    submitted: false,  // 이번 세션에서 이미 보냈는가

    /* main.js 부팅 시 호출된다. DOM 이 준비된 뒤여야 하므로 UI.init() 다음이다. */
    init: function () {
      var self = this;
      this.el.screen = document.getElementById('feedback-screen');
      this.el.openBtn = document.getElementById('btn-open-feedback');
      this.el.backBtn = document.getElementById('btn-feedback-back');
      this.el.ratingRow = document.getElementById('feedback-rating');
      this.el.comment = document.getElementById('feedback-comment');
      this.el.submit = document.getElementById('btn-feedback-submit');
      this.el.status = document.getElementById('feedback-status');

      // 완료 화면의 "피드백 남기기"
      if (this.el.openBtn) {
        this.el.openBtn.addEventListener('click', function (e) {
          e.preventDefault();
          self.open();
        });
      }

      // "완료 화면으로 돌아가기"
      if (this.el.backBtn) {
        this.el.backBtn.addEventListener('click', function (e) {
          e.preventDefault();
          self.close();
        });
      }

      if (this.el.ratingRow) {
        // 점수 버튼 — 기존 버튼들과 같은 click 경로다(새 입력 방식을 만들지 않는다).
        var btns = this.el.ratingRow.querySelectorAll('.rating-btn');
        for (var i = 0; i < btns.length; i++) {
          btns[i].addEventListener('click', function (e) {
            e.preventDefault();
            if (self.submitted) return;
            var v = parseInt(this.getAttribute('data-score'), 10);
            // 같은 점수를 다시 누르면 선택 해제 (필수 항목이 아니므로 취소할 수 있어야 한다)
            self.setRating(self.rating === v ? null : v);
          });
        }
      }

      if (this.el.submit) {
        this.el.submit.addEventListener('click', function (e) {
          e.preventDefault();
          self.submit();
        });
      }

      this.resetForm();
      return true;
    },

    /* ------------------------------------------------------- 화면 열고 닫기 */
    /* 게임 상태는 건드리지 않는다 — gameComplete / restartSession / 캔버스
       어느 것도 여기서 손대지 않는다. 보여주고 감추는 것이 전부다. */
    open: function () {
      if (!this.el.screen) return;
      this.el.screen.hidden = false;
      document.body.classList.add('mg-feedback');   // 이 동안만 문서 스크롤 허용
      if (global.scrollTo) global.scrollTo(0, 0);
    },

    close: function () {
      if (!this.el.screen) return;
      this.el.screen.hidden = true;
      document.body.classList.remove('mg-feedback');
      if (global.scrollTo) global.scrollTo(0, 0);
    },

    isOpen: function () {
      return !!(this.el.screen && !this.el.screen.hidden);
    },

    /* --------------------------------------------------------------- 입력 */
    setRating: function (v) {
      this.rating = v;
      if (!this.el.ratingRow) return;
      var btns = this.el.ratingRow.querySelectorAll('.rating-btn');
      for (var i = 0; i < btns.length; i++) {
        var on = parseInt(btns[i].getAttribute('data-score'), 10) === v;
        btns[i].classList.toggle('is-selected', on);
        btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
      }
    },

    /* 제출 — 한 세션에 한 번만 받는다(연타해도 레코드가 여러 개 쌓이지 않는다).
       화면은 닫지 않는다. 저장되었다는 것을 확인한 뒤 스스로 돌아가게 둔다. */
    submit: function () {
      if (this.submitted) return false;

      var comment = this.el.comment ? String(this.el.comment.value || '') : '';
      var ok = this.save({ rating: this.rating, comment: comment });

      this.submitted = true;
      if (this.el.submit) this.el.submit.hidden = true;
      if (this.el.status) {
        this.el.status.textContent = ok
          ? '피드백이 저장되었습니다. 고맙습니다!'
          : '이 브라우저에서는 저장할 수 없었습니다. 그래도 고맙습니다!';
        this.el.status.hidden = false;
      }
      if (this.el.comment) this.el.comment.blur();   // 키보드를 내려 결과가 보이게
      return ok;
    },

    /* ------------------------------------------------------- 저장 / 읽기 */
    /* 기존 기록 뒤에 하나 덧붙인다. 실패하면 false — 게임은 계속된다. */
    save: function (record) {
      try {
        var list = this.load();
        list.push(record);
        global.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        return true;
      } catch (e) {
        return false;
      }
    },

    /* 저장된 기록 전체를 배열로 돌려준다. 없거나 읽을 수 없으면 빈 배열. */
    load: function () {
      try {
        var raw = global.localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        var parsed = JSON.parse(raw);
        return Object.prototype.toString.call(parsed) === '[object Array]' ? parsed : [];
      } catch (e) {
        return [];
      }
    },

    /* 완료 화면이 내려갈 때(=세션 재시작) 폼을 처음 상태로 되돌리고 화면도 닫는다.
       저장된 기록은 건드리지 않는다 — 다시 모험한다고 해서 친구가 남긴 의견이
       지워지면 안 된다. */
    resetForm: function () {
      this.submitted = false;
      this.setRating(null);
      if (this.el.comment) this.el.comment.value = '';
      if (this.el.submit) this.el.submit.hidden = false;
      if (this.el.status) this.el.status.hidden = true;
      this.close();
    }
  };

  MG.Feedback = Feedback;
})(window);
