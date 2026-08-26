/* ==========================================================================
   map.js — 달빛 숲 — 초입 : 레이아웃 데이터와 렌더링
   PHASE 4 범위:
     - 화면(v0.1.1 기준 360x640)보다 큰 맵(1440x810) + 지형 데이터
     - 나무 / 바위 / 물 / 풀 / 꽃 / 흙길
     - 충돌 사각형 목록 제공 (collision.js 가 소비)
     - 지면은 오프스크린 캔버스에 한 번만 굽고(bake) 매 프레임 blit 한다
     - 나무/바위는 플레이어와 y 정렬해야 하므로 매 프레임 그린다 (game.js 가 정렬)
   보물 상자(PHASE 8) / 덩굴 앵커(PHASE 10) 는 아직 배치하지 않는다.
   ========================================================================== */
(function (global) {
  'use strict';

  var MG = global.MG = global.MG || {};

  var MAP_W = 1440;
  var MAP_H = 810;

  /* 남북으로 흐르는 물길 — 오른쪽 보물 지역을 완전히 갈라놓는다.
     PHASE 10 의 덩굴 다리가 생기기 전에는 건널 수 없다. */
  var RIVER = { x: 1000, y: 0, w: 130, h: MAP_H };

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
    /* 강 건너 보물 지역 (PHASE 8).
       강둑(x≈994)에 섰을 때 카메라가 보여주는 범위는 x≈754~1234 이다.
       "모스키를 얻기 전에 보물이 보여야 한다"는 핵심 설계를 지키려면
       보물 자리가 반드시 이 범위 안에 있어야 하므로 강에 바짝 붙여 둔다. */
    [1200, 636, 116]
  ];

  /* 바위 — 손으로 배치해 통로를 막지 않게 한다 */
  var ROCK_SPOTS = [
    [286, 616], [520, 762], [742, 512], [560, 236],
    [868, 738], [402, 452], [1216, 742], [1332, 520], [126, 330]
  ];

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

    trees: [],
    rocks: [],
    fireflies: [],
    solids: [],          // 충돌 사각형 {x, y, w, h} (좌상단 기준)
    ground: null,        // 미리 구워둔 지면 캔버스

    /* 플레이어 시작 위치 (player.js 가 참조) */
    spawn: { x: 200, y: 706 },

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

      this.solids = s;
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
      return out;
    },

    renderProp: function (ctx, entry) {
      if (entry.kind === 'tree') this.drawTree(ctx, entry.obj);
      else if (entry.kind === 'rock') this.drawRock(ctx, entry.obj);
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
