/* ==========================================================================
   map.js — 달빛 숲 — 초입 : 레이아웃 데이터와 렌더링
   PHASE 4 범위:
     - 화면(v0.1.1 기준 360x640)보다 큰 맵(1440x810) + 지형 데이터
     - 나무 / 바위 / 물 / 풀 / 꽃 / 흙길
     - 충돌 사각형 목록 제공 (collision.js 가 소비)
     - 지면은 오프스크린 캔버스에 한 번만 굽고(bake) 매 프레임 blit 한다
     - 나무/바위는 플레이어와 y 정렬해야 하므로 매 프레임 그린다 (game.js 가 정렬)
   PHASE 10 STEP 1: 보물 상자 + 덩굴 앵커를 '배치만' 한다.
     - 상자는 강 건너에 보이기만 하고 열 수 없다 (상호작용 없음).
     - 앵커는 순수한 표식이다 (능력/상호작용 없음 — STEP 2 의 몫).
   ========================================================================== */
(function (global) {
  'use strict';

  var MG = global.MG = global.MG || {};

  var MAP_W = 1440;
  var MAP_H = 810;

  /* 남북으로 흐르는 물길 — 오른쪽 보물 지역을 완전히 갈라놓는다.
     PHASE 10 의 덩굴 다리가 생기기 전에는 건널 수 없다. */
  var RIVER = { x: 1000, y: 0, w: 130, h: MAP_H };

  /* PHASE 10 STEP 1: 덩굴 다리가 이어줄 두 지점.

     좌표를 이렇게 잡은 이유(실측 근거):
     · 서안에서 걸어갈 수 있는 한계는 x=994.5 다(발 상자 11px + 강 x=1000).
       그 자리에 서면 카메라(360px 폭)가 보여주는 범위는 x 814~1174 뿐이다.
     · 그래서 상자는 강 동안(1130)에서 20px 만 떨어진 1150 에 둔다. 여기서만
       "강 건너에 무언가 있다"가 실제로 화면에 들어온다(오른쪽 여백 16px).
       GLADES 의 보물 공터 중심(1200)에 두면 화면 밖이라 보이지 않는다 —
       그 자리를 정하던 시절의 주석은 카메라가 640px 이던 때의 계산이다.
     · 앵커는 맞은편 상자와 같은 높이(y=578)의 물가에 둔다. 두 점이 한 직선
       위에 있어야 "여기서 저기로 다리가 놓인다"가 한눈에 읽힌다.
     · 앵커의 x 를 물가 끝(994)이 아니라 984 로 조금 물린 이유: 처음엔 986,600
       에 뒀더니 플레이어가 강둑에 서는 자리와 4px 밖에 안 떨어져 루카 스프라이트
       뒤에 완전히 가려졌다(실제로 화면을 찍어 확인했다). 지금 위치는 강둑에
       섰을 때 22.8px 떨어져 있어 "옆에 있는 표식"으로 또렷하게 보인다.
     · 앵커는 물가 모슬링의 집(962,646)에서 71px 떨어져 있다 — 배회 반경 46
       밖이라 서로 겹치지 않는다. 가장 가까운 나무는 47px, 바위는 198px. */
  var VINE_ANCHOR_X = 984;
  var VINE_ANCHOR_Y = 578;
  var TREASURE_X = 1150;
  var TREASURE_Y = 578;

  /* PHASE 10 STEP 2: 덩굴 다리.
     건널목은 앵커와 같은 높이(578)에 놓이고, 위아래로 BRIDGE_HALF 만큼만
     열린다. 플레이어 발 상자가 11x6 이므로 26px 폭이면 y 571~591 사이에
     설 수 있어(20px 통로) 넉넉하면서도 "강 전체가 열린 것"처럼 보이지 않는다. */
  var BRIDGE_Y = VINE_ANCHOR_Y;
  var BRIDGE_HALF = 13;

  /* 흙길: 시작 지점에서 동쪽 물가까지 이어지는 주 통로 */
  var PATH_MAIN = [
    [200, 700], [420, 716], [640, 700], [820, 668], [962, 646]
  ];
  /* 갈림길: 주 통로 중간에서 북쪽 공터(모스키 발견 장소)로 */
  var PATH_BRANCH = [
    [620, 704], [634, 560], [598, 430], [470, 330], [318, 252]
  ];

  /* 나무가 자라지 않는 열린 공간 (중심x, 중심y, 반지름) */
  var GLADES = [
    [200, 700, 122],   // 시작 지점
    [700, 400, 112],   // 숲 탐험 중간 공터
    [300, 235, 138],   // 작은 공터 (PHASE 9 에서 모스키가 나타날 곳)
    [962, 646, 92],    // 물가 — 건너편이 보이는 자리
    /* 강 건너 보물 지역.
       주의: 예전 주석은 강둑에서 x 754~1234 가 보인다고 적혀 있었지만, 그건
       카메라가 640px 이던 가로 시절의 계산이다. 세로 전환 뒤 카메라는 360px 라
       실제로는 x 814~1174 만 보인다(실측). 이 공터는 나무가 자라지 않는 구역을
       정의할 뿐이고, 실제로 보여야 하는 상자는 위쪽 TREASURE_X 로 따로 잡는다. */
    [1200, 636, 116]
  ];

  /* 바위 — 손으로 배치해 통로를 막지 않게 한다 */
  var ROCK_SPOTS = [
    [286, 616], [520, 762], [742, 512], [560, 236],
    [868, 738], [402, 452], [1216, 742], [1332, 520], [126, 330]
  ];

  /* PHASE 8: 달의 돌(MOONSTONE) — 게임의 첫 목표.
     자리는 GLADES 의 "숲 탐험 중간 공터"(700,400) 정중앙이다. 이 공터는
     buildProps() 가 나무를 아예 심지 않는 반경이고, 가장 가까운 바위는
     (742,512)로 110px 넘게 떨어져 있으며, 강(x 1000~1130)과도 무관하다 —
     즉 지형을 하나도 바꾸지 않고 그대로 놓을 수 있다. 스폰(200,590)에서
     PATH_MAIN → PATH_BRANCH 갈림길을 타고 자연스럽게 도달한다.
     좌표 규약은 나무/바위와 같다: (x, y)는 "땅에 닿는 발치" 기준이다. */
  var MOONSTONE_X = 700;
  var MOONSTONE_Y = 400;

  // 충돌 상자 — 걸어서 통과하지는 못하되, 검이 닿기 쉽도록 작게 잡는다
  // (큰 투명 벽이 되지 않도록 발치 주변만 막는다).
  var MOONSTONE_SOLID_W = 16;
  var MOONSTONE_SOLID_H = 9;

  // 검 상호작용 상자 — 모슬링의 getHurtbox() 와 같은 개념(발치 충돌과 별개로
  // "몸통"을 덮는다). 결정 자체가 차지하는 높이를 넉넉히 감싸, 네 방향
  // 어디서 휘둘러도 기존 검 히트박스(허리 높이 기준)와 정상적으로 겹친다.
  var MOONSTONE_HIT_W = 16;
  var MOONSTONE_HIT_H = 18;

  var PALETTE = {
    grassDark:  '#17351f',
    grassMid:   '#1e4527',
    grassLight: '#2a5c33',
    dirt:       '#5a4630',
    dirtLight:  '#6d573c',
    waterDeep:  '#123a4d',
    waterMid:   '#17506a',
    waterEdge:  '#2f7d8f',
    trunk:      '#4a3423',
    trunkDark:  '#33241a',
    leafDark:   '#1c4a30',
    leafMid:    '#276b3c',
    leafLight:  '#39894a',
    rock:       '#5c6672',
    rockLight:  '#78838f',
    rockMoss:   '#3f7a44',
    flower:     ['#e8d26a', '#dd7ba6', '#cfe4ff']
  };

  /* 결정적 난수 — 새로고침해도 항상 같은 숲이 나오도록 */
  function makeRng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /* 점과 선분(폴리라인) 사이의 최단 거리 — 길 주변을 비워두는 데 사용 */
  function distToPolyline(px, py, pts) {
    var best = Infinity;
    for (var i = 0; i < pts.length - 1; i++) {
      var ax = pts[i][0], ay = pts[i][1];
      var bx = pts[i + 1][0], by = pts[i + 1][1];
      var dx = bx - ax, dy = by - ay;
      var len2 = dx * dx + dy * dy;
      var t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
      t = t < 0 ? 0 : (t > 1 ? 1 : t);
      var cx = ax + t * dx, cy = ay + t * dy;
      var d = Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy));
      if (d < best) best = d;
    }
    return best;
  }

  var Map = {
    WIDTH: MAP_W,
    HEIGHT: MAP_H,
    RIVER: RIVER,
    /* PHASE 9 STEP 3: 공터 정의를 읽기용으로 공개한다. companion.js 가 모스키
       공터의 반지름을 알아야 하는데, 그 값을 저쪽에 복사해 두면 지형의 진실이
       두 곳이 된다. 여기서 그대로 읽어가게 한다 (동작 변화 없음). */
    GLADES: GLADES,

    trees: [],
    rocks: [],
    fireflies: [],
    solids: [],          // 충돌 사각형 {x, y, w, h} (좌상단 기준)
    ground: null,        // 미리 구워둔 지면 캔버스

    /* PHASE 8: 달의 돌. state 는 'IDLE' | 'ACTIVE' 두 가지뿐이고,
       진행 플래그(MG.Game.moonstoneFound)와 짝을 이룬다. 여기(Map)는 좌표와
       충돌/렌더 데이터만 들고, "언제 활성화되는가"는 game.js 가 판단한다.
       activeT 는 활성화 이후 연출용 경과 시간(초)일 뿐 게임 로직이 아니다. */
    /* PHASE 10 STEP 1: 강 건너에 보이기만 하는 보물 상자.
       이 단계에서 이것은 순수한 풍경이다 — 열리지 않고, 상호작용도 없고,
       충돌체도 아니다(어차피 강이 막고 있다). state 는 STEP 3 이후를 위한
       자리만 잡아둔 것이며 지금은 아무도 바꾸지 않는다. */
    /* PHASE 10 STEP 3: state 는 'CLOSED' -> 'OPENING' -> 'OPEN' 세 가지다.
       openT 는 뚜껑이 열리는 연출용 경과 시간(초)일 뿐 게임 로직이 아니다.
       "언제 열리는가"는 game.js 의 updateTreasure() 가 판단한다 —
       달의 돌과 완전히 같은 역할 분담이다. */
    treasure: { x: TREASURE_X, y: TREASURE_Y, state: 'CLOSED', openT: 0 },

    /* PHASE 10 STEP 1: 덩굴 앵커 — 다리가 자라날 자리.
       지금은 표식일 뿐이다. 상호작용도, 능력도, 충돌도 없다.
       모스키의 덩굴과 같은 보라색을 쓰는 것은 의도적이다 — 모스키를 얻은 뒤
       플레이어가 "저기서 저 색을 봤다"를 스스로 연결하게 하려는 것이다. */
    vineAnchor: { x: VINE_ANCHOR_X, y: VINE_ANCHOR_Y },

    /* PHASE 10 STEP 2: 덩굴 다리 상태.
       built  — 완성되어 영구히 남아 있는가
       t      — 0~1 건설 진행도(연출 전용). companion.js 가 채운다. */
    bridge: { built: false, t: 0 },
    BRIDGE_Y: BRIDGE_Y,
    BRIDGE_HALF: BRIDGE_HALF,

    moonstone: { x: MOONSTONE_X, y: MOONSTONE_Y, state: 'IDLE', activeT: 0 },

    /* 플레이어 시작 위치 (player.js 가 참조) */
    spawn: { x: 200, y: 590 },

    init: function () {
      this.buildProps();
      this.buildSolids();
      this.buildFireflies();
      this.bakeGround();
    },

    /* ------------------------------------------------------- 오브젝트 배치 */
    buildProps: function () {
      var rng = makeRng(20260826);
      this.trees = [];
      this.rocks = [];

      var step = 62;
      for (var gy = 24; gy < MAP_H - 10; gy += step) {
        for (var gx = 24; gx < MAP_W - 10; gx += step) {
          var x = gx + (rng() - 0.5) * 40;
          var y = gy + (rng() - 0.5) * 40;

          // 물속에는 나무가 없다 (물가에서 약간 띄운다)
          if (x > RIVER.x - 26 && x < RIVER.x + RIVER.w + 26) continue;

          // 열린 공터 안에는 나무가 없다
          var inGlade = false;
          for (var i = 0; i < GLADES.length; i++) {
            var g = GLADES[i];
            var ddx = x - g[0], ddy = y - g[1];
            if (ddx * ddx + ddy * ddy < g[2] * g[2]) { inGlade = true; break; }
          }
          if (inGlade) continue;

          // 길 위에도 나무가 없다
          if (distToPolyline(x, y, PATH_MAIN) < 48) continue;
          if (distToPolyline(x, y, PATH_BRANCH) < 44) continue;

          // 맵 가장자리는 항상 빽빽하게 채워 공간을 닫고,
          // 안쪽은 일부를 비워 자연스럽게 만든다
          var nearEdge = (x < 78 || x > MAP_W - 78 || y < 78 || y > MAP_H - 78);
          if (!nearEdge && rng() > 0.82) continue;

          this.trees.push({
            x: Math.round(x),
            y: Math.round(y),
            scale: 0.82 + rng() * 0.42,
            tint: rng()
          });
        }
      }

      for (var r = 0; r < ROCK_SPOTS.length; r++) {
        this.rocks.push({
          x: ROCK_SPOTS[r][0],
          y: ROCK_SPOTS[r][1],
          scale: 0.85 + rng() * 0.4
        });
      }
    },

    buildFireflies: function () {
      var rng = makeRng(77123);
      this.fireflies = [];
      for (var i = 0; i < 90; i++) {
        this.fireflies.push({
          x: rng() * MAP_W,
          y: rng() * MAP_H,
          phase: rng() * Math.PI * 2,
          speed: 0.5 + rng() * 0.8
        });
      }

      /* PHASE 8: 달의 돌 주변에만 반딧불을 의도적으로 조금 모아 둔다.
         미니맵/퀘스트 화살표 같은 UI 를 붙이지 않고, 이미 숲 전체에 있는
         연출 요소를 그대로 써서 "저기 뭔가 있다"를 자연스럽게 흘린다.
         (같은 fireflies 배열에 넣으므로 렌더/컬링 경로도 기존 그대로다) */
      var m = this.moonstone;
      for (var j = 0; j < 14; j++) {
        var ang = rng() * Math.PI * 2;
        var rad = 14 + rng() * 34;   // 돌에 너무 붙지도, 흩어지지도 않게
        this.fireflies.push({
          x: m.x + Math.cos(ang) * rad,
          y: m.y + Math.sin(ang) * rad * 0.7,   // 살짝 납작하게 — 바닥에 깔린 느낌
          phase: rng() * Math.PI * 2,
          speed: 0.4 + rng() * 0.5
        });
      }
    },

    /* --------------------------------------------------------- 충돌 데이터 */
    buildSolids: function () {
      var s = [];

      // 맵 바깥으로 나가지 못하게 막는 테두리
      var T = 16;
      s.push({ x: -T, y: -T, w: MAP_W + T * 2, h: T });          // 위
      s.push({ x: -T, y: MAP_H, w: MAP_W + T * 2, h: T });       // 아래
      s.push({ x: -T, y: -T, w: T, h: MAP_H + T * 2 });          // 왼쪽
      s.push({ x: MAP_W, y: -T, w: T, h: MAP_H + T * 2 });       // 오른쪽

      // 물 — 통과 불가
      s.push({ x: RIVER.x, y: RIVER.y, w: RIVER.w, h: RIVER.h, water: true });

      // 나무 밑동 (캐노피가 아니라 밑동만 막아야 자연스럽다)
      for (var i = 0; i < this.trees.length; i++) {
        var t = this.trees[i];
        var tw = Math.round(13 * t.scale);
        s.push({ x: t.x - tw / 2, y: t.y - 5, w: tw, h: 8 });
      }

      // 바위
      for (var r = 0; r < this.rocks.length; r++) {
        var k = this.rocks[r];
        var rw = Math.round(20 * k.scale);
        s.push({ x: k.x - rw / 2, y: k.y - 7, w: rw, h: 10 });
      }

      // PHASE 8: 달의 돌 — 걸어서 통과하지 못하게 발치만 막는다.
      // (기존 충돌 배열에 사각형 하나를 더할 뿐, 새 물리 구조는 없다.
      //  main.js 순서상 Map.init() 이 Enemy.init() 보다 먼저 돌기 때문에,
      //  같은 자리(700,400)의 모슬링 스폰 지점은 enemy.js 의 기존
      //  findClearSpot() 이 이 solid 를 보고 알아서 옆으로 밀어낸다.)
      var m = this.moonstone;
      s.push({
        x: m.x - MOONSTONE_SOLID_W / 2,
        y: m.y - MOONSTONE_SOLID_H,
        w: MOONSTONE_SOLID_W,
        h: MOONSTONE_SOLID_H
      });

      this.solids = s;
    },

    /* PHASE 10 STEP 2: 강의 충돌을 다시 깐다.

       collision.js 는 손대지 않는다. 대신 강 solid "하나"를 건널목 위/아래
       두 조각으로 쪼갠다 — 그 사이에 생긴 틈이 곧 걸어서 건널 수 있는 구간이다.
       강의 나머지는 그대로 solid 로 남으므로 다른 곳에서는 여전히 못 건넌다.
       (player.js / enemy.js 는 매번 MG.Map.solids 를 새로 읽으므로, 이 배열을
        제자리에서 고치면 다음 프레임부터 바로 반영된다.)

       텔레포트도, 보이지 않는 트리거도 쓰지 않는다 — 진짜 충돌 변경이다. */
    setBridgeOpen: function (open) {
      var s = this.solids;
      for (var i = s.length - 1; i >= 0; i--) {
        if (s[i].water) s.splice(i, 1);
      }
      if (!open) {
        s.push({ x: RIVER.x, y: RIVER.y, w: RIVER.w, h: RIVER.h, water: true });
        return;
      }
      var top = BRIDGE_Y - BRIDGE_HALF;
      var bot = BRIDGE_Y + BRIDGE_HALF;
      s.push({ x: RIVER.x, y: RIVER.y, w: RIVER.w, h: top - RIVER.y, water: true });
      s.push({ x: RIVER.x, y: bot, w: RIVER.w, h: (RIVER.y + RIVER.h) - bot, water: true });
    },

    /* 세션 재시작용 — 다리를 없던 일로 되돌린다 (강이 다시 완전히 막힌다). */
    resetBridge: function () {
      this.bridge.built = false;
      this.bridge.t = 0;
      this.setBridgeOpen(false);
    },

    /* 다리를 물 위·엔티티 아래에 그린다.
       game.js 의 renderWater() 직후에 호출된다. Y 정렬 큐에 넣지 않는 이유는
       분명하다 — 이건 "올라서는 바닥"이라 루카나 모스키를 절대 가리면 안 된다.
       (나무/바위처럼 옆을 지나가는 물체가 아니다.) 새 캔버스도 만들지 않고
       기존 월드 렌더 파이프라인 안에서 그린다. */
    renderBridge: function (ctx, cam, t) {
      var b = this.bridge;
      if (!b.built && b.t <= 0) return;
      if (cam.x > RIVER.x + RIVER.w + 40 || cam.x + cam.w < RIVER.x - 40) return;

      var p = b.built ? 1 : b.t;
      // 0.20~0.55 덩굴 가닥이 뻗고, 0.55~0.85 바닥이 생기고, 0.85~1.00 마무리 빛
      var strand = Math.max(0, Math.min(1, (p - 0.20) / 0.35));
      var deck   = Math.max(0, Math.min(1, (p - 0.55) / 0.30));
      var pulse  = Math.max(0, Math.min(1, (p - 0.85) / 0.15));

      var x0 = RIVER.x - 8;                 // 양쪽 둑에 조금 걸치게 해 이어져 보이게
      var x1 = RIVER.x + RIVER.w + 8;
      var full = x1 - x0;
      var y = BRIDGE_Y;
      var half = BRIDGE_HALF;

      ctx.save();

      // 1) 덩굴 가닥 — 서쪽 앵커에서 동쪽으로 자라나간다
      var sx = x0 + full * strand;
      ctx.strokeStyle = '#4a2b7d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x0, y - half + 2); ctx.lineTo(sx, y - half + 2);
      ctx.moveTo(x0, y + half - 2); ctx.lineTo(sx, y + half - 2);
      ctx.stroke();
      ctx.strokeStyle = '#7b4fc0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, y - half + 2); ctx.lineTo(sx, y - half + 2);
      ctx.moveTo(x0, y + half - 2); ctx.lineTo(sx, y + half - 2);
      ctx.stroke();

      // 2) 바닥 — 덩굴을 엮은 판자. 가닥이 다 뻗은 뒤 채워진다.
      var dx = x0 + full * deck;
      if (deck > 0) {
        ctx.fillStyle = '#3f6b46';
        ctx.fillRect(x0, y - half + 3, dx - x0, half * 2 - 6);
        ctx.fillStyle = '#57894f';
        ctx.fillRect(x0, y - half + 3, dx - x0, 3);
        // 엮인 결
        ctx.fillStyle = '#2e5236';
        for (var wx = x0 + 4; wx < dx; wx += 7) {
          ctx.fillRect(Math.round(wx), y - half + 4, 1, half * 2 - 8);
        }
        // 가장자리를 또렷하게 (물 위에서 경계가 읽혀야 한다)
        ctx.fillStyle = '#8ae8c6';
        ctx.fillRect(x0, y - half + 2, dx - x0, 1);
        ctx.fillRect(x0, y + half - 3, dx - x0, 1);
      }

      // 3) 자라나는 끝의 빛 + 완성 순간의 맥동
      if (!b.built && strand > 0 && strand < 1) {
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = '#c9a6ff';
        ctx.fillRect(Math.round(sx) - 1, y - half + 1, 2, half * 2 - 2);
      }
      if (pulse > 0 && pulse < 1) {
        ctx.globalAlpha = 0.5 * (1 - pulse);
        ctx.fillStyle = '#eaffb0';
        ctx.fillRect(x0, y - half, full, half * 2);
      }

      // 완성된 뒤에는 아주 느리게 숨쉬는 룬 빛만 남는다
      if (b.built) {
        var g = 0.25 + 0.20 * Math.sin(t * 1.3);
        ctx.globalAlpha = g;
        ctx.fillStyle = '#c9a6ff';
        for (var rx = x0 + 10; rx < x1; rx += 26) {
          ctx.fillRect(Math.round(rx), y - half + 1, 1, 1);
          ctx.fillRect(Math.round(rx) + 3, y + half - 2, 1, 1);
        }
      }

      ctx.restore();
    },

    /* PHASE 8: 검 판정용 상호작용 상자 (월드 좌표).
       enemy.js 의 getHurtbox() 와 같은 규약이라 game.js 가 기존
       MG.Collision.overlaps() 로 그대로 비교할 수 있다. */
    getMoonstoneHitbox: function () {
      var m = this.moonstone;
      return {
        x: m.x - MOONSTONE_HIT_W / 2,
        y: m.y - MOONSTONE_HIT_H,
        w: MOONSTONE_HIT_W,
        h: MOONSTONE_HIT_H
      };
    },

    /* --------------------------------------------------- 지면 굽기 (1회) */
    bakeGround: function () {
      var c = document.createElement('canvas');
      c.width = MAP_W;
      c.height = MAP_H;
      var g = c.getContext('2d');
      var rng = makeRng(31337);

      // 기본 풀밭
      g.fillStyle = PALETTE.grassMid;
      g.fillRect(0, 0, MAP_W, MAP_H);

      // 넓은 색 얼룩으로 단조로움을 깬다.
      // 진하면 "커다란 원"으로 보이므로 아주 옅게 여러 번 겹친다.
      for (var i = 0; i < 420; i++) {
        var bx = rng() * MAP_W, by = rng() * MAP_H;
        var br = 30 + rng() * 70;
        g.fillStyle = rng() > 0.5
          ? 'rgba(20, 46, 27, 0.10)'
          : 'rgba(42, 92, 51, 0.09)';
        g.beginPath();
        g.arc(bx, by, br, 0, Math.PI * 2);
        g.fill();
      }

      this.bakePath(g, PATH_MAIN, 34);
      this.bakePath(g, PATH_BRANCH, 26);
      this.bakeRiver(g, rng);

      // 풀 포기 — 물 위에는 그리지 않는다
      for (var t = 0; t < 2600; t++) {
        var gx = rng() * MAP_W, gy = rng() * MAP_H;
        if (gx > RIVER.x - 8 && gx < RIVER.x + RIVER.w + 8) continue;
        g.fillStyle = rng() > 0.5 ? PALETTE.grassLight : PALETTE.grassDark;
        var gh = 2 + Math.round(rng() * 2);
        g.fillRect(Math.round(gx), Math.round(gy), 1, gh);
        if (rng() > 0.6) g.fillRect(Math.round(gx) + 2, Math.round(gy) + 1, 1, gh - 1);
      }

      // 꽃 — 공터 주변에 모여 피게 한다
      for (var f = 0; f < 190; f++) {
        var fx, fy;
        if (rng() > 0.45) {
          var gl = GLADES[Math.floor(rng() * GLADES.length)];
          var ang = rng() * Math.PI * 2;
          var rad = rng() * gl[2] * 0.9;
          fx = gl[0] + Math.cos(ang) * rad;
          fy = gl[1] + Math.sin(ang) * rad;
        } else {
          fx = rng() * MAP_W;
          fy = rng() * MAP_H;
        }
        if (fx > RIVER.x - 12 && fx < RIVER.x + RIVER.w + 12) continue;
        if (fx < 4 || fx > MAP_W - 4 || fy < 4 || fy > MAP_H - 4) continue;

        g.fillStyle = PALETTE.flower[Math.floor(rng() * PALETTE.flower.length)];
        g.fillRect(Math.round(fx), Math.round(fy), 2, 2);
        g.fillStyle = 'rgba(24, 60, 38, 0.7)';
        g.fillRect(Math.round(fx), Math.round(fy) + 2, 1, 2);
      }

      this.ground = c;
    },

    bakePath: function (g, pts, width) {
      g.save();
      g.lineCap = 'round';
      g.lineJoin = 'round';

      // 가장자리를 부드럽게 만들기 위해 겹쳐 그린다
      var layers = [
        { w: width + 8, color: 'rgba(74, 60, 40, 0.35)' },
        { w: width,     color: PALETTE.dirt },
        { w: width - 12, color: PALETTE.dirtLight }
      ];
      for (var l = 0; l < layers.length; l++) {
        if (layers[l].w <= 0) continue;
        g.strokeStyle = layers[l].color;
        g.lineWidth = layers[l].w;
        g.beginPath();
        g.moveTo(pts[0][0], pts[0][1]);
        for (var i = 1; i < pts.length; i++) {
          var prev = pts[i - 1], cur = pts[i];
          var mx = (prev[0] + cur[0]) / 2, my = (prev[1] + cur[1]) / 2;
          g.quadraticCurveTo(prev[0], prev[1], mx, my);
        }
        g.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
        g.stroke();
      }
      g.restore();
    },

    bakeRiver: function (g, rng) {
      // 물 본체
      var grad = g.createLinearGradient(RIVER.x, 0, RIVER.x + RIVER.w, 0);
      grad.addColorStop(0, PALETTE.waterEdge);
      grad.addColorStop(0.22, PALETTE.waterMid);
      grad.addColorStop(0.5, PALETTE.waterDeep);
      grad.addColorStop(0.78, PALETTE.waterMid);
      grad.addColorStop(1, PALETTE.waterEdge);
      g.fillStyle = grad;
      g.fillRect(RIVER.x, RIVER.y, RIVER.w, RIVER.h);

      // 물가 — 젖은 흙과 자갈로 경계를 분명히 한다
      for (var y = 0; y < MAP_H; y += 3) {
        var wob = Math.sin(y * 0.045) * 4 + Math.sin(y * 0.13) * 2;
        g.fillStyle = 'rgba(66, 54, 38, 0.75)';
        g.fillRect(RIVER.x - 7 + wob, y, 8, 3);
        g.fillRect(RIVER.x + RIVER.w - 1 - wob, y, 8, 3);

        if (rng() > 0.82) {
          g.fillStyle = 'rgba(120, 131, 143, 0.65)';
          g.fillRect(RIVER.x - 5 + wob, y, 2, 2);
          g.fillRect(RIVER.x + RIVER.w + 2 - wob, y + 1, 2, 2);
        }
      }
    },

    /* ------------------------------------------------------------ 렌더링 */

    /* 지면 — 카메라 변환이 적용된 상태에서 통째로 blit 한다 (브라우저가 클립) */
    renderGround: function (ctx) {
      if (this.ground) ctx.drawImage(this.ground, 0, 0);
    },

    /* 물 위 반짝임 — 애니메이션이므로 매 프레임 그린다 (보이는 부분만) */
    renderWater: function (ctx, cam, time) {
      var top = Math.max(0, cam.y - 20);
      var bottom = Math.min(MAP_H, cam.y + cam.h + 20);
      if (cam.x > RIVER.x + RIVER.w || cam.x + cam.w < RIVER.x) return;

      ctx.save();
      for (var y = Math.floor(top / 8) * 8; y < bottom; y += 8) {
        var t = time * 0.7 + y * 0.06;
        var sway = Math.sin(t) * 10;
        var alpha = 0.10 + 0.10 * Math.sin(t * 1.7);
        ctx.fillStyle = 'rgba(190, 232, 245, ' + alpha.toFixed(3) + ')';
        ctx.fillRect(RIVER.x + 18 + sway, y, 22, 1);
        ctx.fillRect(RIVER.x + 74 - sway, y + 4, 16, 1);
      }
      ctx.restore();
    },

    /* 반딧불 — 화면 안에 있는 것만 */
    renderFireflies: function (ctx, cam, time) {
      for (var i = 0; i < this.fireflies.length; i++) {
        var f = this.fireflies[i];
        var fx = f.x + Math.sin(time * f.speed + f.phase) * 10;
        var fy = f.y + Math.cos(time * f.speed * 0.8 + f.phase) * 7;
        if (fx < cam.x - 8 || fx > cam.x + cam.w + 8) continue;
        if (fy < cam.y - 8 || fy > cam.y + cam.h + 8) continue;

        var glow = 0.30 + 0.34 * Math.sin(time * 2.2 + f.phase);
        if (glow <= 0.02) continue;
        ctx.fillStyle = 'rgba(206, 244, 168, ' + glow.toFixed(3) + ')';
        ctx.fillRect(Math.round(fx), Math.round(fy), 2, 2);
      }
    },

    /* y 정렬이 필요한 오브젝트를 game.js 에 넘긴다 (화면 밖은 제외) */
    collectProps: function (out, cam) {
      var i, o;
      for (i = 0; i < this.trees.length; i++) {
        o = this.trees[i];
        if (o.x < cam.x - 40 || o.x > cam.x + cam.w + 40) continue;
        if (o.y < cam.y - 80 || o.y > cam.y + cam.h + 40) continue;
        out.push({ y: o.y, obj: o, kind: 'tree' });
      }
      for (i = 0; i < this.rocks.length; i++) {
        o = this.rocks[i];
        if (o.x < cam.x - 40 || o.x > cam.x + cam.w + 40) continue;
        if (o.y < cam.y - 40 || o.y > cam.y + cam.h + 40) continue;
        out.push({ y: o.y, obj: o, kind: 'rock' });
      }

      // PHASE 8: 달의 돌도 나무/바위와 같은 y 정렬 대상에 넣는다 —
      // 그래야 플레이어가 돌 앞/뒤로 지나갈 때 앞뒤 관계가 자연스럽다.
      o = this.moonstone;
      if (o.x >= cam.x - 40 && o.x <= cam.x + cam.w + 40 &&
          o.y >= cam.y - 60 && o.y <= cam.y + cam.h + 40) {
        out.push({ y: o.y, obj: o, kind: 'moonstone' });
      }

      // PHASE 10 STEP 1: 상자와 앵커도 달의 돌과 똑같이 y 정렬 대상에 넣는다.
      // 새 렌더 경로를 만들지 않는다 — 나무/바위와 앞뒤가 자연스럽게 정해진다.
      o = this.treasure;
      if (o.x >= cam.x - 40 && o.x <= cam.x + cam.w + 40 &&
          o.y >= cam.y - 60 && o.y <= cam.y + cam.h + 40) {
        out.push({ y: o.y, obj: o, kind: 'treasure' });
      }
      o = this.vineAnchor;
      if (o.x >= cam.x - 40 && o.x <= cam.x + cam.w + 40 &&
          o.y >= cam.y - 60 && o.y <= cam.y + cam.h + 40) {
        out.push({ y: o.y, obj: o, kind: 'vineAnchor' });
      }
      return out;
    },

    renderProp: function (ctx, entry) {
      if (entry.kind === 'tree') this.drawTree(ctx, entry.obj);
      else if (entry.kind === 'rock') this.drawRock(ctx, entry.obj);
      else if (entry.kind === 'moonstone') this.drawMoonstone(ctx, entry.obj);
      else if (entry.kind === 'treasure') this.drawTreasure(ctx, entry.obj);
      else if (entry.kind === 'vineAnchor') this.drawVineAnchor(ctx, entry.obj);
    },

    /* PHASE 10 STEP 1: 보물 상자 — 강 건너에서 "저기 뭔가 있다"만 전달하면
       된다. 바위(각진 회색)/달의 돌(창백한 푸른빛)과 헷갈리지 않도록 따뜻한
       나무색 + 황금 테로 그린다.
       PHASE 10 STEP 3: 뚜껑이 실제로 열린다. 뚜껑은 "뒤쪽 경첩"을 축으로
       회전하므로, 캔버스를 경첩으로 옮겨 돌린 뒤 같은 사각형을 그린다 —
       스프라이트를 추가하지 않고 열리는 모습을 만드는 가장 값싼 방법이다. */
    drawTreasure: function (ctx, o) {
      var t = (MG.Game && MG.Game.time) || 0;
      var x = Math.round(o.x), y = Math.round(o.y);

      // 열림 진행도 0~1 (CLOSED 0, OPENING 진행중, OPEN 1)
      var openP = 0;
      if (o.state === 'OPEN') openP = 1;
      else if (o.state === 'OPENING') {
        openP = Math.max(0, Math.min(1, o.openT / 0.55));
        openP = 1 - (1 - openP) * (1 - openP);      // ease-out — 툭 열렸다 천천히 멎는다
      }

      // 그림자
      ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
      ctx.beginPath();
      ctx.ellipse(x, y + 1, 9, 3, 0, 0, Math.PI * 2);
      ctx.fill();

      // 열린 뒤 새어나오는 달빛 — 상자가 비었다는 걸 알리는 신호
      if (openP > 0) {
        var glowPulse = 0.5 + 0.5 * Math.sin(t * 2.2);
        ctx.save();
        ctx.globalAlpha = (0.16 + 0.10 * glowPulse) * openP;
        ctx.fillStyle = '#cfe4ff';
        ctx.beginPath();
        ctx.arc(x, y - 8, 11 + glowPulse * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 몸통 (아래 궤짝)
      ctx.fillStyle = '#5a3a1e';
      ctx.fillRect(x - 8, y - 9, 16, 9);
      ctx.fillStyle = '#7a5028';
      ctx.fillRect(x - 8, y - 9, 16, 4);
      ctx.fillStyle = '#3d2613';
      ctx.fillRect(x - 8, y - 1, 16, 1);

      // 열렸다면 궤짝 안쪽이 보인다 (달빛 조각이 있던 자리)
      if (openP > 0.15) {
        ctx.fillStyle = '#2a1a0e';
        ctx.fillRect(x - 7, y - 10, 14, 3);
        ctx.save();
        ctx.globalAlpha = 0.55 * openP;
        ctx.fillStyle = '#cfe4ff';
        ctx.fillRect(x - 5, y - 10, 10, 2);
        ctx.restore();
      }

      // 황금 테 (궤짝 쪽)
      ctx.fillStyle = '#d9b45a';
      ctx.fillRect(x - 8, y - 6, 16, 1);

      // 뚜껑 — 뒤쪽 경첩(x, y-10)을 축으로 최대 105도까지 젖혀진다
      ctx.save();
      ctx.translate(x, y - 10);
      ctx.rotate(-openP * 1.83);
      ctx.fillStyle = '#8a5c2e';
      ctx.fillRect(-9, -4, 18, 5);
      ctx.fillStyle = '#a06f38';
      ctx.fillRect(-9, -4, 18, 2);
      ctx.fillStyle = '#d9b45a';
      ctx.fillRect(-9, 0, 18, 1);
      if (openP < 0.5) {                       // 자물쇠는 닫혀 있을 때만 보인다
        ctx.globalAlpha = 1 - openP * 2;
        ctx.fillRect(-2, -4, 4, 6);
        ctx.fillStyle = '#f2d98a';
        ctx.fillRect(-1, 0, 2, 2);
      }
      ctx.restore();

      // 아주 느린 반짝임 — 멀리서도 눈에 걸리게 하는 유일한 움직임
      if (openP < 1) {
        var glint = 0.35 + 0.35 * Math.sin(t * 1.5);
        ctx.fillStyle = 'rgba(255, 240, 190, ' + (glint * (1 - openP)).toFixed(2) + ')';
        ctx.fillRect(x + 4, y - 13, 1, 1);
        ctx.fillRect(x - 6, y - 12, 1, 1);
      }
    },

    /* PHASE 10 STEP 1: 덩굴 앵커 — 물가에 남은 오래된 그루터기.
       마른 덩굴이 감겨 있고 희미한 보라 룬이 잠들어 있다. 지금은 아무 기능도
       없다(상호작용/충돌/능력 없음). 모스키의 덩굴과 같은 보라색을 쓴 것은
       나중에 플레이어가 스스로 연결하게 하려는 의도적 복선이다. */
    drawVineAnchor: function (ctx, o) {
      var t = (MG.Game && MG.Game.time) || 0;
      var x = Math.round(o.x), y = Math.round(o.y);

      ctx.fillStyle = 'rgba(0, 0, 0, 0.30)';
      ctx.beginPath();
      ctx.ellipse(x, y + 1, 7, 2.6, 0, 0, Math.PI * 2);
      ctx.fill();

      // 그루터기
      ctx.fillStyle = '#4a3524';
      ctx.fillRect(x - 6, y - 9, 12, 9);
      ctx.fillStyle = '#5d4430';
      ctx.fillRect(x - 6, y - 9, 12, 3);
      ctx.fillStyle = '#6d5340';
      ctx.beginPath();
      ctx.ellipse(x, y - 9, 6, 2.4, 0, 0, Math.PI * 2);   // 잘린 단면
      ctx.fill();
      ctx.fillStyle = '#3a2a1c';
      ctx.beginPath();
      ctx.ellipse(x, y - 9, 2.6, 1.1, 0, 0, Math.PI * 2);  // 나이테 중심
      ctx.fill();

      // 마른 덩굴이 그루터기를 감고 있다 (아직 잠들어 있어 색이 죽어 있다)
      ctx.strokeStyle = '#5a4a63';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(x, y - 5, 6.5, 2.2, 0.18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(x, y - 2, 6.2, 2.0, -0.14, 0, Math.PI * 2);
      ctx.stroke();

      // 잠든 룬 — 아주 느리고 희미하게 숨쉰다. 모스키의 덩굴과 같은 보라색.
      var pulse = 0.5 + 0.5 * Math.sin(t * 1.1);
      ctx.save();
      ctx.globalAlpha = 0.22 + 0.20 * pulse;
      ctx.fillStyle = '#c9a6ff';
      ctx.fillRect(x - 1, y - 12, 2, 2);
      ctx.fillRect(x - 5, y - 6, 1, 1);
      ctx.fillRect(x + 4, y - 4, 1, 1);
      ctx.restore();
    },

    /* PHASE 8: 달의 돌 — 나무(둥근 초록 캐노피)/바위(각진 회색)와 확실히
       구분되도록 창백한 달빛색 결정으로 그린다. 절차적 픽셀 아트만 쓰고
       외부 스프라이트는 없다 (프로젝트 전체 규약 그대로).
         IDLE   — 은은하게 맥동하는 푸른 빛. "아직 건드리지 않은 것".
         ACTIVE — 맥동이 잦아들고 밝고 안정된 빛 + 완성을 알리는 고리.
                  화면을 덮는 UI 로 바꾸지 않고 월드에 계속 남는다. */
    drawMoonstone: function (ctx, m) {
      var t = (MG.Game && MG.Game.time) || 0;
      var active = m.state === 'ACTIVE';

      /* PHASE 8.1: IDLE 맥동을 더 눈에 띄게 다듬었다 — 화면 중앙에 오기
         전에도 "저기 뭔가 빛난다"가 읽혀야 하기 때문이다. 다만 번쩍이지
         않도록 주기는 오히려 느리게(2.4 → 1.7) 하고, 대신 진폭(빛무리 크기와
         밝기)을 키워 "천천히 숨쉬는" 느낌으로 만든다.
         ACTIVE 는 그대로 거의 일정하게 — 이미 끝난 것은 재촉하지 않는다. */
      var pulse = active
        ? 0.86 + 0.14 * Math.sin(t * 1.6)
        : 0.50 + 0.50 * Math.sin(t * 1.7);

      var cx = m.x;
      var baseY = m.y;
      var topY = baseY - 17;          // 결정 꼭대기
      var midY = baseY - 10;          // 결정 허리 (가장 넓은 지점)

      // 바닥 그림자
      ctx.fillStyle = 'rgba(0, 0, 0, 0.30)';
      ctx.beginPath();
      ctx.ellipse(Math.round(cx), Math.round(baseY + 1), 8, 3, 0, 0, Math.PI * 2);
      ctx.fill();

      // 바닥에 번지는 빛무리 (지면을 물들이는 느낌).
      // PHASE 8.1: IDLE 일 때 반경 자체가 16~32 로 숨쉬어, 멀리서도 눈에 띈다.
      var glowR = active ? 26 : (16 + 16 * pulse);
      var glowA = active ? (0.34 * pulse) : (0.14 + 0.22 * pulse);
      var groundGlow = ctx.createRadialGradient(cx, baseY - 4, 0, cx, baseY - 4, glowR);
      groundGlow.addColorStop(0, 'rgba(180, 224, 255, ' + glowA.toFixed(3) + ')');
      groundGlow.addColorStop(1, 'rgba(180, 224, 255, 0)');
      ctx.fillStyle = groundGlow;
      ctx.beginPath();
      ctx.ellipse(cx, baseY - 4, glowR, glowR * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();

      // 결정을 받치는 작은 돌받침 (풀밭에 떠 있어 보이지 않게)
      ctx.fillStyle = '#4c5666';
      ctx.beginPath();
      ctx.moveTo(cx - 7, baseY);
      ctx.lineTo(cx - 5, baseY - 4);
      ctx.lineTo(cx + 5, baseY - 4);
      ctx.lineTo(cx + 7, baseY);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#626e80';
      ctx.fillRect(Math.round(cx - 5), Math.round(baseY - 4), 10, 1);

      // 결정 본체 — 위아래로 뾰족한 육각 실루엣
      var bodyDark  = active ? '#6f9fd8' : '#4d6f9c';
      var bodyMid   = active ? '#a9d4ff' : '#7ea6d4';
      var bodyLight = active ? '#ecf7ff' : '#c2dcf7';

      ctx.fillStyle = bodyDark;
      ctx.beginPath();
      ctx.moveTo(cx,     topY);
      ctx.lineTo(cx + 6, midY);
      ctx.lineTo(cx + 4, baseY - 4);
      ctx.lineTo(cx - 4, baseY - 4);
      ctx.lineTo(cx - 6, midY);
      ctx.closePath();
      ctx.fill();

      // 왼쪽 면(밝은 쪽) — 달빛을 받는 각
      ctx.fillStyle = bodyMid;
      ctx.beginPath();
      ctx.moveTo(cx,     topY);
      ctx.lineTo(cx,     baseY - 4);
      ctx.lineTo(cx - 4, baseY - 4);
      ctx.lineTo(cx - 6, midY);
      ctx.closePath();
      ctx.fill();

      // 하이라이트 결
      ctx.fillStyle = bodyLight;
      ctx.beginPath();
      ctx.moveTo(cx - 1, topY + 2);
      ctx.lineTo(cx - 1, midY + 3);
      ctx.lineTo(cx - 4, midY);
      ctx.closePath();
      ctx.fill();

      // 결정 내부의 빛 — 맥동하는 심지
      ctx.save();
      ctx.globalAlpha = active ? (0.55 + 0.35 * pulse) : (0.30 + 0.45 * pulse);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(cx - 1), Math.round(midY - 2), 2, 6);
      ctx.restore();

      if (active) {
        // 완성을 알리는 고리 — 천천히 숨쉬는 안정된 빛
        ctx.save();
        ctx.globalAlpha = 0.30 + 0.20 * Math.sin(t * 1.3);
        ctx.strokeStyle = '#dff0ff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(cx, baseY - 9, 12, 7, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // 주변을 도는 작은 빛알갱이 세 개 (활성 상태를 멀리서도 읽히게)
        for (var i = 0; i < 3; i++) {
          var a = t * 1.1 + (i / 3) * Math.PI * 2;
          var ox = cx + Math.cos(a) * 12;
          var oy = (baseY - 9) + Math.sin(a) * 6;
          ctx.fillStyle = 'rgba(226, 243, 255, ' + (0.5 + 0.4 * Math.sin(t * 3 + i)).toFixed(2) + ')';
          ctx.fillRect(Math.round(ox), Math.round(oy), 1, 1);
        }
      } else {
        // IDLE — 숨쉬는 바깥 후광. 빛무리(바닥)와 다른 높이에 한 겹 더 있어
        // 결정이 화면 가장자리에 걸쳐 있을 때도 존재가 읽힌다.
        ctx.save();
        ctx.globalAlpha = 0.10 + 0.22 * pulse;
        ctx.strokeStyle = '#cfe4ff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(cx, baseY - 10, 9 + 5 * pulse, 6 + 3 * pulse, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // 꼭대기에서 반짝 튀는 작은 섬광 (주기적으로만)
        var sparkle = Math.sin(t * 2.4);
        if (sparkle > 0.86) {
          ctx.fillStyle = 'rgba(255, 255, 255, ' + ((sparkle - 0.86) / 0.14).toFixed(2) + ')';
          ctx.fillRect(Math.round(cx), Math.round(topY - 2), 1, 1);
        }
      }
    },

    drawTree: function (ctx, t) {
      var x = t.x, y = t.y, s = t.scale;
      var i;

      // 그림자
      ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
      ctx.beginPath();
      ctx.ellipse(x, y + 2, 11 * s, 4 * s, 0, 0, Math.PI * 2);
      ctx.fill();

      // 밑동 — 캐노피와 확실히 이어지도록 굵고 길게
      var tw = Math.max(4, Math.round(7 * s));
      var trunkTop = y - 17 * s;
      ctx.fillStyle = PALETTE.trunk;
      ctx.fillRect(Math.round(x - tw / 2), Math.round(trunkTop), tw, Math.round(18 * s));
      ctx.fillStyle = PALETTE.trunkDark;
      ctx.fillRect(Math.round(x - tw / 2), Math.round(trunkTop), Math.max(1, Math.round(tw / 3)), Math.round(18 * s));

      // 캐노피 — 원 세 개를 겹쳐 뭉툭한 실루엣을 만든다.
      // 밑동 위에 걸치도록 낮게 앉혀 "떠 있는 공"처럼 보이지 않게 한다.
      var cy = y - 24 * s;
      var lobes = [
        [x - 9 * s, cy + 6 * s, 11.5 * s],
        [x + 9 * s, cy + 5 * s, 10.5 * s],
        [x,         cy - 3 * s, 13.5 * s]
      ];

      // 어두운 테두리 — 풀밭과 대비를 만들어 실루엣을 읽히게 한다
      ctx.fillStyle = '#0d2416';
      for (i = 0; i < lobes.length; i++) {
        ctx.beginPath();
        ctx.arc(lobes[i][0], lobes[i][1], lobes[i][2] + 1.6, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = t.tint > 0.5 ? PALETTE.leafDark : '#20573a';
      for (i = 0; i < lobes.length; i++) {
        ctx.beginPath();
        ctx.arc(lobes[i][0], lobes[i][1], lobes[i][2], 0, Math.PI * 2);
        ctx.fill();
      }

      // 달빛을 받는 윗면
      ctx.fillStyle = PALETTE.leafMid;
      ctx.beginPath();
      ctx.arc(x - 3 * s, cy - 6 * s, 9 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.leafLight;
      ctx.beginPath();
      ctx.arc(x - 5 * s, cy - 9 * s, 5 * s, 0, Math.PI * 2);
      ctx.fill();

      // 잎 결 — 가장자리를 살짝 흩어 딱딱한 원을 깬다
      ctx.fillStyle = 'rgba(13, 36, 22, 0.55)';
      for (i = 0; i < 5; i++) {
        var a = (i / 5) * Math.PI * 2 + t.tint * 3;
        ctx.fillRect(
          Math.round(x + Math.cos(a) * 12 * s),
          Math.round(cy + Math.sin(a) * 9 * s),
          Math.max(1, Math.round(2 * s)),
          Math.max(1, Math.round(2 * s))
        );
      }
    },

    drawRock: function (ctx, r) {
      var x = r.x, y = r.y, s = r.scale;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.beginPath();
      ctx.ellipse(x, y + 2, 12 * s, 4 * s, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = PALETTE.rock;
      ctx.beginPath();
      ctx.moveTo(x - 11 * s, y + 2);
      ctx.lineTo(x - 8 * s, y - 9 * s);
      ctx.lineTo(x - 1 * s, y - 13 * s);
      ctx.lineTo(x + 8 * s, y - 8 * s);
      ctx.lineTo(x + 11 * s, y + 2);
      ctx.closePath();
      ctx.fill();

      // 위쪽 밝은 면
      ctx.fillStyle = PALETTE.rockLight;
      ctx.beginPath();
      ctx.moveTo(x - 8 * s, y - 9 * s);
      ctx.lineTo(x - 1 * s, y - 13 * s);
      ctx.lineTo(x + 3 * s, y - 9 * s);
      ctx.lineTo(x - 4 * s, y - 6 * s);
      ctx.closePath();
      ctx.fill();

      // 이끼
      ctx.fillStyle = PALETTE.rockMoss;
      ctx.fillRect(Math.round(x - 6 * s), Math.round(y - 10 * s), Math.round(4 * s), Math.round(2 * s));
      ctx.fillRect(Math.round(x + 2 * s), Math.round(y - 7 * s), Math.round(3 * s), Math.round(2 * s));
    }
  };

  MG.Map = Map;
})(window);
