/* ==========================================================================
   main.js — 애플리케이션 진입점
   각 시스템을 정해진 순서로 초기화한다.
   ========================================================================== */
(function (global) {
  'use strict';

  var MG = global.MG = global.MG || {};

  function boot() {
    try {
      if (MG.Audio && MG.Audio.init) MG.Audio.init();
      if (MG.Input && MG.Input.init) MG.Input.init();

      if (!MG.Game.init()) return;      // 캔버스 / 루프 / 스케일
      if (MG.Map && MG.Map.init) MG.Map.init();       // 지형 / 충돌 (Player 보다 먼저)
      if (MG.Player && MG.Player.init) MG.Player.init();
      if (MG.Enemy && MG.Enemy.init) MG.Enemy.init();  // 모슬링 배치 (맵 충돌 데이터 필요 — Map 이후)
      MG.UI.init();                     // 오버레이 / 방향 경고 (Game 이후에 초기화)

      console.log('[달빛 숲의 수호자] Prototype v' + MG.Game.VERSION + ' — PHASE 6.2');
    } catch (err) {
      console.error('[MG] 초기화 실패:', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
