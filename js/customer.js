/* ==========================================================================
   customer.js — LAZY DINER: 첫 번째 손님 "The Inspector"
   STEP 4-1: 고기라면을 제공하면 짧은 이야기를 들려주고 세계 단서를 남긴다.
   STEP 4-3a: 카운터 다이너 — 좌석 번호(seat)로 자리를 잡고, 정면을 보는
     큰 실루엣 + "…" 대기 표시 + 카운터 위 자리(매트/젓가락/유리병)를 그린다.
     제공하는 순간 그 자리에 김이 나는 라면 그릇이 놓인다.
   설계:
     - authored data(DEFS)와 runtime state(list)를 분리한다 — 손님이 늘어나도
       DEFS 에 항목(과 seat 번호)만 추가하면 된다. base class/registry/event
       bus 는 만들지 않는다.
     - companion.js 와 같은 update/collect/renderOne 구조를 그대로 따른다.
   의도적으로 하지 않은 것들:
     · 두 번째 손님, 등장/퇴장, 호감도, 선호 음식, NPC 간 관계, 분기 대사,
       초상화, 저장/불러오기, 엔딩 로직, 범용 flags 시스템.
   ========================================================================== */
(function (global) {
  'use strict';

  var MG = global.MG = global.MG || {};

  /* ------------------------------------------------------- authored data */
  var DEFS = [
    {
      id: 'inspector',
      name: '손님',
      seat: 2,                                  // MG.Map.dinerSeats 의 가운데 자리
      hungryLine: '…먹을 거 없으면 말 걸지 마.',
      afterLine: '…라면, 나쁘지 않았어.',
      // STEP 5: 단서를 들은 뒤 문을 나서려는 플레이어에게 건네는 작별 한 줄.
      // 처음엔 "말 걸지 마" 라던 사람이 처음으로 "또" 를 말한다.
      farewellLine: '…라면. 또 끓여.',
      chapters: [
        [
          '(국물 냄새를 오래 맡는다)',
          '…물. 어디서 떠 왔어?',
          '(대답을 기다리지 않고 한 모금 마신다)',
          '끓였네. …됐어.',
          '예전에 물 검사하던 사람이야.',
          '마지막으로 기록한 샘플이 이상했어. 수치가 너무 깨끗했거든.',
          '기계가 고장 난 줄 알았지. 그래서 다시 안 갔어.',
          '…북쪽 저수지. 아직 거기 있으려나.'
        ]
      ]
    }
  ];

  /* serve point 기준 상호작용 사거리. 좌석 간격이 52px 이라 24+24 < 52 —
     훗날 손님이 여럿 앉아도 이웃 좌석의 진입 사거리가 겹치지 않는다.
     플레이어가 주방 통로에서 카운터 앞에 서면 serve point 까지 약 17px. */
  var INTERACT_ENTER = 24;
  var INTERACT_LEAVE = 32;

  var ICON_SERVE = '🍜';   // 이 손님에게 지금 라면을 건넬 수 있을 때

  var CLUE_THOUGHT = '북쪽 저수지… 정말 깨끗한 곳이 남아 있다면?';

  var C = {
    outline:   '#161320',
    skin:      '#e0b48c',
    skinShade: '#c29470',
    hair:      '#b9b5ae',   // 옅은 회색 — 나이 든, 무뚝뚝한 인상
    hairShade: '#8e8a85',
    coat:      '#5f7384',   // 바랜 청회색 — 나무 바닥/카운터와 확실히 분리된다
    coatDark:  '#465565',
    scarf:     '#3b2f3a',
    bubble:    '#f2f7ea',
    mat:       '#6b3a2e',
    matEdge:   '#8a4e3c',
    chopstick: '#e8d7b0',
    bowl:      '#ece4d2',
    bowlShade: '#b8ac94',
    broth:     '#c98a3a',
    noodle:    '#f3dc9a',
    vialGlass: '#a8c4c9',
    vialCap:   '#3a3128',
    vialGlint: '#ffffff'
  };

  var Customer = {
    list: [],

    /* main.js 부팅 시, 그리고 restartSession() 에서 호출된다 — 항상 DEFS 로
       완전히 새로 만든다(Enemy.init()/Companion.init() 과 같은 방식). */
    init: function () {
      this.list = [];
      for (var i = 0; i < DEFS.length; i++) {
        this.list.push({
          def: DEFS[i],
          state: 'WAITING',      // WAITING | SERVED
          chapter: 0,
          _inRange: false,
          _promptShown: false,
          _promptIcon: null
        });
      }
    },

    /* 이 손님이 앉은 좌석 — map.js 의 dinerSeats 를 그대로 읽는다. */
    seatOf: function (c) {
      var seats = MG.Map && MG.Map.dinerSeats;
      return (seats && c) ? seats[c.def.seat] : null;
    },

    /* ------------------------------------------------------------ update */
    /* 게임의 상호작용 입력(interactPressed)을 손님과 대화 상자 둘 다가
       나눠 쓴다. 같은 프레임 안에서 "대화를 연다"와 "다음 줄로 넘긴다"가
       동시에 처리되지 않도록, 이 함수는 처음에 "지금 대화가 열려 있는가"를
       한 번만 확인하고 그 결과로 완전히 다른 두 갈래 중 하나만 탄다. */
    update: function () {
      var speechOpen = !!(MG.UI && MG.UI.isSpeechOpen && MG.UI.isSpeechOpen());
      var c = this.list[0];

      if (speechOpen) {
        if (c) this.hidePrompt(c);
        if (MG.Input && MG.Input.interactPressed && MG.UI && MG.UI.advanceSpeech) {
          MG.UI.advanceSpeech();
        }
        return;
      }

      var p = MG.Player;
      if (!p || p.state === 'DEAD' || !c) return;

      var seat = this.seatOf(c);
      if (!seat) return;

      var dx = p.x - seat.serveX, dy = p.y - seat.serveY;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (!c._inRange && dist <= INTERACT_ENTER) c._inRange = true;
      else if (c._inRange && dist > INTERACT_LEAVE) c._inRange = false;

      if (c._inRange) this.showPrompt(c); else this.hidePrompt(c);

      if (c._inRange && MG.Input && MG.Input.interactPressed) {
        this.interact(c);
      }
    },

    /* 지금 라면을 건넬 수 있으면 🍜, 아니면 버튼 기본 아이콘. 사거리 안에
       있는 동안 아이콘이 바뀌어야 할 수도 있으므로(예: 제공 직후) 캐시된
       아이콘과 다를 때도 다시 부른다 — DOM 은 값이 바뀔 때만 건드린다. */
    showPrompt: function (c) {
      var canServe = c.state === 'WAITING' && !!(MG.Game && MG.Game.meatRamen > 0);
      var icon = canServe ? ICON_SERVE : null;
      // 상호작용 버튼은 화로/보물/모스키와 함께 쓰는 공유 버튼이다. 같은 프레임에
      // 다른 주인이 뒤늦게 hideInteract() 를 부르면 캐시만 믿다가는 버튼이 다시
      // 뜨지 않는다 — 실제로 숨겨져 있으면 다시 띄운다.
      var visible = !!(MG.UI && MG.UI.isInteractVisible && MG.UI.isInteractVisible());
      if (c._promptShown && c._promptIcon === icon && visible) return;
      c._promptShown = true;
      c._promptIcon = icon;
      if (MG.UI && MG.UI.showInteract) MG.UI.showInteract(icon);
    },

    hidePrompt: function (c) {
      if (!c._promptShown) return;
      c._promptShown = false;
      c._promptIcon = null;
      if (MG.UI && MG.UI.hideInteract) MG.UI.hideInteract();
    },

    /* CASE A: WAITING + meatRamen > 0 — 제공하고 이야기를 시작한다.
       CASE B: WAITING + meatRamen === 0 — 재료가 없다는 토스트만.
       CASE C: SERVED — 이미 먹었다는 짧은 토스트만.
       meatRamen 은 성공했을 때만 줄어든다. state/chapter 는 제공하는 이 순간
       즉시 확정한다 — 대화 도중 구역을 나가거나 재시작해도 진행 상태가
       어긋나지 않게 하려는 것이다. SERVED 가 되는 순간부터 카운터에 그릇이
       그려진다(renderCounterItems). */
    interact: function (c) {
      if (c.state === 'SERVED') {
        if (MG.UI && MG.UI.showToast) MG.UI.showToast(c.def.afterLine);
        return;
      }

      if (!MG.Game || MG.Game.meatRamen < 1) {
        if (MG.UI && MG.UI.showToast) MG.UI.showToast(c.def.hungryLine);
        return;
      }

      MG.Game.meatRamen -= 1;
      if (MG.UI && MG.UI.renderRamen) MG.UI.renderRamen(MG.Game.meatRamen);

      var lines = c.def.chapters[c.chapter] || c.def.chapters[c.def.chapters.length - 1];
      c.state = 'SERVED';
      c.chapter += 1;
      this.hidePrompt(c);

      if (MG.UI && MG.UI.showSpeech) {
        MG.UI.showSpeech(c.def.name, lines, function () {
          if (MG.Game) MG.Game.clueHeard = true;
          if (MG.UI && MG.UI.showToast) MG.UI.showToast(CLUE_THOUGHT);
        });
      }
    },

    /* STEP 5: 작별 한 줄을 기존 대화 상자로 연다 — 새 대화 시스템이 아니다.
       한 줄짜리 대사라 탭/E 한 번이면 닫히고, 그때(끝까지 넘겼을 때만) onDone 이
       불린다. 열지 못했으면 false — 호출한 쪽이 엔딩이 멈춰 서지 않도록 처리한다. */
    farewell: function (onDone) {
      var c = this.list[0];
      if (!c || !c.def.farewellLine || !MG.UI || !MG.UI.showSpeech) return false;
      MG.UI.showSpeech(c.def.name, [c.def.farewellLine], onDone);
      return !!(MG.UI.isSpeechOpen && MG.UI.isSpeechOpen());
    },

    /* --------------------------------------------------------------- 수집 */
    /* game.js 의 Y 정렬 큐에 자신을 넣는다 — companion.js 와 같은 패턴.
       다이너 좌표에만 존재하므로 바깥에 있는 동안은 카메라 컬링만으로
       자연히 화면에서 빠진다. */
    collect: function (out, cam) {
      var c = this.list[0];
      var seat = this.seatOf(c);
      if (!seat) return out;
      if (seat.x < cam.x - 40 || seat.x > cam.x + cam.w + 40) return out;
      if (seat.feetY < cam.y - 60 || seat.feetY > cam.y + cam.h + 40) return out;
      out.push({ y: seat.feetY, kind: 'customer', obj: c });
      return out;
    },

    /* --------------------------------------------------------------- 그리기 */
    /* 카운터 너머에 앉아 카메라(남쪽)를 보는 정면 상반신. 플레이어 스프라이트와
       비슷한 크기(머리 12px, 어깨 20px)에 같은 #161320 윤곽선을 둘러
       모바일에서도 "사람이 앉아 있다"가 한눈에 읽히게 한다. 하반신은
       카운터 뒤라 그리지 않는다. WAITING 이면 머리 위에 "…" 말풍선. */
    renderOne: function (ctx, c) {
      var seat = this.seatOf(c);
      if (!seat) return;

      var sx = Math.round(seat.x), sy = Math.round(seat.feetY);
      var t = (MG.Game && MG.Game.time) || 0;

      // 몸통(코트) — 윤곽선 먼저, 그 안을 채운다
      ctx.fillStyle = C.outline;
      ctx.fillRect(sx - 11, sy - 15, 22, 16);
      ctx.fillStyle = C.coat;
      ctx.fillRect(sx - 10, sy - 14, 20, 14);
      ctx.fillStyle = C.coatDark;
      ctx.fillRect(sx - 1, sy - 12, 2, 12);        // 여밈
      ctx.fillRect(sx - 10, sy - 3, 20, 3);        // 아랫단 그늘

      // 카운터 위에 올린 두 손
      ctx.fillStyle = C.outline;
      ctx.fillRect(sx - 9, sy - 3, 6, 4);
      ctx.fillRect(sx + 3, sy - 3, 6, 4);
      ctx.fillStyle = C.skin;
      ctx.fillRect(sx - 8, sy - 2, 4, 2);
      ctx.fillRect(sx + 4, sy - 2, 4, 2);

      // 목도리
      ctx.fillStyle = C.outline;
      ctx.fillRect(sx - 7, sy - 17, 14, 4);
      ctx.fillStyle = C.scarf;
      ctx.fillRect(sx - 6, sy - 16, 12, 2);

      // 머리 — 12x11
      ctx.fillStyle = C.outline;
      ctx.fillRect(sx - 7, sy - 29, 14, 13);
      ctx.fillStyle = C.skin;
      ctx.fillRect(sx - 6, sy - 28, 12, 11);
      ctx.fillStyle = C.skinShade;
      ctx.fillRect(sx - 6, sy - 19, 12, 2);

      // 머리카락 — 옆머리 + 앞머리 + 위로 올려 묶은 쪽머리
      ctx.fillStyle = C.hair;
      ctx.fillRect(sx - 6, sy - 28, 12, 3);
      ctx.fillRect(sx - 6, sy - 25, 2, 5);
      ctx.fillRect(sx + 4, sy - 25, 2, 5);
      ctx.fillStyle = C.hairShade;
      ctx.fillRect(sx - 6, sy - 26, 12, 1);
      ctx.fillStyle = C.outline;
      ctx.fillRect(sx - 4, sy - 34, 8, 6);
      ctx.fillStyle = C.hair;
      ctx.fillRect(sx - 3, sy - 33, 6, 4);

      // 찌푸린 눈썹 + 눈 + 꾹 다문 입
      ctx.fillStyle = C.outline;
      ctx.fillRect(sx - 4, sy - 24, 3, 1);
      ctx.fillRect(sx + 1, sy - 24, 3, 1);
      ctx.fillRect(sx - 3, sy - 22, 1, 2);
      ctx.fillRect(sx + 2, sy - 22, 1, 2);
      ctx.fillRect(sx - 1, sy - 19, 3, 1);

      // WAITING — "…" 말풍선 (천천히 떠 있다)
      if (c.state === 'WAITING') {
        var by = sy - 46 + Math.round(Math.sin(t * 2.4));
        ctx.fillStyle = C.outline;
        ctx.fillRect(sx - 8, by - 1, 16, 9);
        ctx.fillRect(sx - 2, by + 8, 3, 2);
        ctx.fillStyle = C.bubble;
        ctx.fillRect(sx - 7, by, 14, 7);
        ctx.fillRect(sx - 1, by + 7, 1, 2);
        ctx.fillStyle = C.outline;
        ctx.fillRect(sx - 4, by + 3, 2, 2);
        ctx.fillRect(sx - 1, by + 3, 2, 2);
        ctx.fillRect(sx + 2, by + 3, 2, 2);
      }
    },

    /* 카운터 위의 자리: 매트 + 젓가락 + 유리병, SERVED 면 김이 나는 라면 그릇.
       y 정렬과 무관하게 모든 오브젝트 위에 그린다(game.js 가 소품을 다 그린 뒤
       호출한다) — 카운터 앞에 선 플레이어의 머리가 그릇을 가리면 "라면이
       놓였다"는 가장 중요한 피드백이 사라지기 때문이다. */
    renderCounterItems: function (ctx) {
      var c = this.list[0];
      var seat = this.seatOf(c);
      if (!seat) return;

      var x = Math.round(seat.serveX), y = Math.round(seat.serveY);
      var t = (MG.Game && MG.Game.time) || 0;

      // 매트
      ctx.fillStyle = C.mat;
      ctx.fillRect(x - 9, y - 6, 18, 10);
      ctx.fillStyle = C.matEdge;
      ctx.fillRect(x - 9, y - 6, 18, 1);

      // 젓가락 (매트 오른쪽)
      ctx.fillStyle = C.chopstick;
      ctx.fillRect(x + 11, y - 6, 1, 10);
      ctx.fillRect(x + 13, y - 6, 1, 10);

      // 긁힌 유리병 — 매트 왼쪽, 4x7 + 반짝임
      ctx.fillStyle = C.outline;
      ctx.fillRect(x - 17, y - 8, 6, 10);
      ctx.fillStyle = C.vialGlass;
      ctx.fillRect(x - 16, y - 6, 4, 7);
      ctx.fillStyle = C.vialCap;
      ctx.fillRect(x - 16, y - 7, 4, 1);
      ctx.fillStyle = C.vialGlint;
      ctx.fillRect(x - 15, y - 5, 1, 2);
      ctx.fillStyle = C.outline;
      ctx.fillRect(x - 13, y - 3, 1, 1);     // 긁힌 자국

      if (c.state !== 'SERVED') return;

      // 라면 그릇
      ctx.fillStyle = C.outline;
      ctx.fillRect(x - 7, y - 5, 14, 8);
      ctx.fillStyle = C.bowl;
      ctx.fillRect(x - 6, y - 4, 12, 6);
      ctx.fillStyle = C.bowlShade;
      ctx.fillRect(x - 6, y + 1, 12, 1);
      ctx.fillStyle = C.broth;
      ctx.fillRect(x - 5, y - 4, 10, 2);
      ctx.fillStyle = C.noodle;
      ctx.fillRect(x - 3, y - 4, 2, 1);
      ctx.fillRect(x + 1, y - 3, 3, 1);

      // 김 — 픽셀 세 개가 천천히 올라가며 옅어진다
      for (var i = 0; i < 3; i++) {
        var phase = (t * 0.9 + i * 0.33) % 1;
        ctx.globalAlpha = 0.75 * (1 - phase);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - 4 + i * 4, Math.round(y - 7 - phase * 8), 1, 2);
      }
      ctx.globalAlpha = 1;
    }
  };

  MG.Customer = Customer;
})(window);
