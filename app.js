/* ============================================================
   Keyboard — app：ツール表示トグルと初期化
   ============================================================ */
(() => {
  "use strict";
  const KB = window.KB;
  const { lsGet, lsSet } = KB;

  // ==========================================================
  //  ツール表示トグル（複数同時表示可・状態を記憶）
  // ==========================================================
  const TABS_KEY = "keyboard_tabs_v1";
  const savedTabs = lsGet(TABS_KEY, null);
  document.querySelectorAll(".tab").forEach(t => {
    const name = t.dataset.tab;
    if (Array.isArray(savedTabs)) {
      const on = savedTabs.includes(name);
      t.classList.toggle("active", on);
      document.querySelector(`.tabpane[data-pane="${name}"]`).classList.toggle("active", on);
    }
    t.addEventListener("click", () => {
      const on = t.classList.toggle("active");
      document.querySelector(`.tabpane[data-pane="${name}"]`).classList.toggle("active", on);
      lsSet(TABS_KEY, [...document.querySelectorAll(".tab.active")].map(x => x.dataset.tab));
    });
  });

  // ---- 初期化（順序：メトロノーム → ルーパー → 記録 → 録音） ----
  KB.metro.init();
  KB.looper.init();
  KB.log.init();
  KB.recorder.init();
})();
