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
  // 本格録音（Tonmeister）は重いので、枠を開いたときに初めて読み込む
  const studioFrame = document.getElementById("studioFrame");
  function loadStudio() {
    if (studioFrame && !studioFrame.src) {
      // ?fake=1 で開いたときは中の録音機にも渡す（マイクの代わりに合成音。動作確認用）
      const fake = new URLSearchParams(location.search).has("fake") ? "&fake=1" : "";
      studioFrame.src = studioFrame.dataset.src + fake;
    }
  }
  document.querySelectorAll(".tab").forEach(t => {
    const name = t.dataset.tab;
    if (Array.isArray(savedTabs)) {
      const on = savedTabs.includes(name);
      t.classList.toggle("active", on);
      document.querySelector(`.tabpane[data-pane="${name}"]`).classList.toggle("active", on);
      if (on && name === "studio") loadStudio();
    }
    t.addEventListener("click", () => {
      const on = t.classList.toggle("active");
      document.querySelector(`.tabpane[data-pane="${name}"]`).classList.toggle("active", on);
      if (on && name === "studio") loadStudio();
      lsSet(TABS_KEY, [...document.querySelectorAll(".tab.active")].map(x => x.dataset.tab));
    });
  });
  const toStudio = document.getElementById("toStudio");
  if (toStudio) toStudio.addEventListener("click", () => {
    const t = document.querySelector('.tab[data-tab="studio"]');
    if (t && !t.classList.contains("active")) t.click();
    document.querySelector('.tabpane[data-pane="studio"]').scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // ---- 初回案内（一度閉じたら表示しない） ----
  if (!lsGet("keyboard_onboarded", false)) {
    document.getElementById("welcome").hidden = false;
    document.getElementById("welcomeClose").addEventListener("click", () => {
      document.getElementById("welcome").hidden = true; lsSet("keyboard_onboarded", true);
    });
  }

  // ---- 初期化（順序：メトロノーム → ルーパー → 記録 → 録音） ----
  KB.metro.init();
  KB.looper.init();
  KB.log.init();
  KB.recorder.init();
})();
