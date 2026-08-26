/* ==========================================================================
   collision.js — 충돌 판정
   PHASE 4 범위:
     - AABB(축 정렬 사각형) 겹침 판정
     - 축 분리 이동 해석: X 로 밀고 정리한 뒤 Y 로 밀고 정리한다.
       이렇게 하면 벽에 비스듬히 부딪혀도 멈추지 않고 자연스럽게 미끄러진다.
     - 브로드페이즈: 이동 범위 근처의 solid 만 검사한다.
   엔티티의 충돌 상자는 "발치 기준"이다 (x, y = 발 중심, w/h = 상자 크기).
   캐릭터 전체가 아니라 발만 막아야 탑다운 시점이 자연스럽다.
   ========================================================================== */
(function (global) {
  'use strict';

  var MG = global.MG = global.MG || {};

  var Collision = {
    /* 두 사각형(좌상단 기준)이 겹치는가 */
    overlaps: function (ax, ay, aw, ah, bx, by, bw, bh) {
      return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
    },

    /* 발치 상자를 좌상단 기준 사각형으로 변환 */
    footRect: function (cx, cy, w, h) {
      return { x: cx - w / 2, y: cy - h, w: w, h: h };
    },

    /* 이동 범위 주변의 solid 만 추린다 (매 프레임 전수 검사를 피한다) */
    nearby: function (solids, cx, cy, radius) {
      var out = [];
      for (var i = 0; i < solids.length; i++) {
        var s = solids[i];
        if (s.x > cx + radius || s.x + s.w < cx - radius) continue;
        if (s.y > cy + radius || s.y + s.h < cy - radius) continue;
        out.push(s);
      }
      return out;
    },

    /* 해당 지점(발치 상자)이 막혀 있는가 */
    isBlocked: function (cx, cy, w, h, solids) {
      var r = this.footRect(cx, cy, w, h);
      var near = this.nearby(solids, cx, cy, 64);
      for (var i = 0; i < near.length; i++) {
        var s = near[i];
        if (this.overlaps(r.x, r.y, r.w, r.h, s.x, s.y, s.w, s.h)) return true;
      }
      return false;
    },

    /* (cx, cy) 에 있는 발치 상자를 (dx, dy) 만큼 움직이고 충돌을 해석한다.
       반환: { x, y, hitX, hitY } — 해석된 최종 발 중심 좌표 */
    moveAndCollide: function (cx, cy, w, h, dx, dy, solids) {
      var hitX = false, hitY = false;

      // 이동 전후를 모두 감싸는 범위의 solid 만 검사 대상으로 둔다
      var near = this.nearby(
        solids,
        cx + dx / 2,
        cy + dy / 2,
        Math.max(Math.abs(dx), Math.abs(dy)) + Math.max(w, h) + 40
      );

      var i, s, r;

      // ---- X 축 ----
      if (dx !== 0) {
        cx += dx;
        r = this.footRect(cx, cy, w, h);
        for (i = 0; i < near.length; i++) {
          s = near[i];
          if (!this.overlaps(r.x, r.y, r.w, r.h, s.x, s.y, s.w, s.h)) continue;
          // 파고든 방향의 반대쪽 면으로 밀어낸다
          if (dx > 0) cx = s.x - w / 2;
          else cx = s.x + s.w + w / 2;
          r = this.footRect(cx, cy, w, h);
          hitX = true;
        }
      }

      // ---- Y 축 ----
      if (dy !== 0) {
        cy += dy;
        r = this.footRect(cx, cy, w, h);
        for (i = 0; i < near.length; i++) {
          s = near[i];
          if (!this.overlaps(r.x, r.y, r.w, r.h, s.x, s.y, s.w, s.h)) continue;
          if (dy > 0) cy = s.y;              // 아래로 이동 중 → 상단 면에 붙는다
          else cy = s.y + s.h + h;           // 위로 이동 중 → 하단 면에 붙는다
          r = this.footRect(cx, cy, w, h);
          hitY = true;
        }
      }

      return { x: cx, y: cy, hitX: hitX, hitY: hitY };
    }
  };

  MG.Collision = Collision;
})(window);
