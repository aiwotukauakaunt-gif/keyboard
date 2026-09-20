/* ============================================================
   Keyboard — log：練習記録（2段階目標・週目標・休息日・今日のメニュー・レベル・ヒートマップ・振り返り）
   ============================================================ */
(() => {
  "use strict";
  const KB = window.KB;
  const { $, T, lsGet, lsSet, pad2, fmtClock, todayStr, escapeHtml, goalToast } = KB;

  // ==========================================================
  //  練習記録（動機づけ設計）
  //  ・2段階目標（最低ライン／目標）・週◯日目標・休息日・「2日続けて休まない」
  //  ・今日のメニュー（実行意図）・前回の課題フック・レベル・ヒートマップ・振り返り
  // ==========================================================
  const LOG_KEY = "keyboard_practiceLog_v1";     // { "YYYY-MM-DD": minutes }（従来互換）
  const GOAL_KEY = "keyboard_practiceGoal_v1";   // 1日の目標（従来互換）
  const BADGE_KEY = "keyboard_practiceBadges_v1";
  const PR_KEY = "keyboard_practice_v2";          // 新：最低ライン・週目標・メニュー・休息日・セッション
  const RING_LEN = 2 * Math.PI * 52;

  let logRunning = false, logStartT = 0, logTimer = null, autoStarted = false;
  let dailyGoal = lsGet(GOAL_KEY, 30);
  const pr = Object.assign({ minGoal: 5, weekTarget: 5, menuTemplate: [], days: {}, sessions: [] }, lsGet(PR_KEY, {}));
  function prSave() { lsSet(PR_KEY, pr); }
  function loadLog() { return lsGet(LOG_KEY, {}); }
  function dayRec(d) { return pr.days[d] || (pr.days[d] = { menu: {}, rest: false }); }

  // ---- 日付ヘルパー（月曜始まり） ----
  const dateKey = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const addDays = (key, n) => { const d = new Date(key + "T00:00:00"); d.setDate(d.getDate() + n); return dateKey(d); };
  const weekStart = key => { const d = new Date(key + "T00:00:00"); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return dateKey(d); };
  const wdName = key => ["日","月","火","水","木","金","土"][new Date(key + "T00:00:00").getDay()];
  const isRest = key => !!(pr.days[key] && pr.days[key].rest);
  const practiced = (log, key) => (log[key] || 0) >= 1;

  // ---- 集計 ----
  function totalMinutes(log) { return Object.values(log).reduce((a, b) => a + b, 0); }
  function activeDays(log) { return Object.values(log).filter(v => v > 0).length; }
  // 日連続：今日未練習なら昨日から数える（今日はまだこれから）。休息日は飛ばす
  function computeStreak(log) {
    let n = 0, d = todayStr();
    if (!practiced(log, d)) d = addDays(d, -1);
    for (let guard = 0; guard < 4000; guard++) {
      if (practiced(log, d)) { n++; d = addDays(d, -1); }
      else if (isRest(d)) d = addDays(d, -1);
      else break;
    }
    return n;
  }
  function longestStreak(log) {
    const keys = Object.keys(log).filter(k => log[k] >= 1).sort();
    let best = 0, cur = 0, prev = null;
    for (const k of keys) { cur = (prev && addDays(prev, 1) === k) ? cur + 1 : 1; best = Math.max(best, cur); prev = k; }
    return best;
  }
  function weekDays(log, ws) { let n = 0; for (let i = 0; i < 7; i++) if (practiced(log, addDays(ws, i))) n++; return n; }
  function weekMinutes(log, ws) { let n = 0; for (let i = 0; i < 7; i++) n += log[addDays(ws, i)] || 0; return n; }
  function computeWeekStreak(log) {
    let ws = weekStart(todayStr()), n = 0;
    if (weekDays(log, ws) >= pr.weekTarget) n++;
    ws = addDays(ws, -7);
    for (let guard = 0; guard < 600 && weekDays(log, ws) >= pr.weekTarget; guard++) { n++; ws = addDays(ws, -7); }
    return n;
  }
  // レベル：通算 h 時間で、L(L+1)/2 ≤ h を満たす最大の L → Lv.(L+1)。Lv2=1h, Lv3=3h, Lv4=6h, Lv5=10h …
  function levelInfo(log) {
    const h = totalMinutes(log) / 60;
    const L = Math.floor((-1 + Math.sqrt(1 + 8 * h)) / 2);
    const cur = L * (L + 1) / 2, next = (L + 1) * (L + 2) / 2;
    return { lv: L + 1, hours: h, next, prog: (h - cur) / (next - cur) };
  }

  // ---- 記録の追加 ----
  function addMinutes(mins, itemId) {
    mins = Math.round(mins);
    if (mins <= 0) return;
    const log = loadLog(); const d = todayStr();
    const before = log[d] || 0;
    log[d] = before + mins;
    lsSet(LOG_KEY, log);
    const rec = dayRec(d);
    rec.rest = false;
    if (itemId && rec.menu[itemId]) {
      const it = rec.menu[itemId];
      it.done += mins;
      if (!it.checked && it.done >= it.min) { it.checked = true; goalToast(`✅ 「${it.name}」完了！`); }
    }
    pr.sessions.push({ d, m: mins, i: itemId || null, t: Date.now() });
    if (pr.sessions.length > 1000) pr.sessions = pr.sessions.slice(-1000);
    if (!rec.minHit && log[d] >= pr.minGoal) { rec.minHit = true; if (log[d] < dailyGoal) goalToast(`🌱 最低ライン ${pr.minGoal}分 達成！ここから先はボーナス`); }
    if (!rec.goalHit && log[d] >= dailyGoal) {
      rec.goalHit = true;
      const ws = weekStart(d);
      goalToast(weekDays(log, ws) >= pr.weekTarget ? `🎉 目標達成！今週の${pr.weekTarget}日もクリア` : `🎉 今日の目標 ${dailyGoal}分 達成！`);
    }
    prSave();
    renderLog(); renderDiary(); checkBadges();
  }

  // ---- 本格録音（Tonmeister）との行き来 ----
  // 録音機は record/ の iframe から window.parent.KB を呼ぶ。テイクは日ごとに控えて「今日」に出す
  function renderTakes(d) {
    const rec = pr.days[d];
    const takes = rec && rec.takes || [];
    const box = $("lgTakes"); if (!box) return;
    box.hidden = takes.length === 0;
    if (!takes.length) return;
    const sec = takes.reduce((a, t) => a + (t.sec || 0), 0);
    $("lgTakesN").textContent = takes.length;
    $("lgTakesSec").textContent = fmtClock(sec);
    const last = takes[takes.length - 1];
    $("lgTakesLast").textContent = last.name ? `・ 最新「${last.name}」` : "";
  }
  /** 録音機が1本録り終えたとき。{ seconds, name, item } */
  function studioTake(info) {
    const d = todayStr(); const rec = dayRec(d);
    if (!rec.takes) rec.takes = [];
    rec.takes.push({ t: Date.now(), sec: Math.round(info.seconds || 0), name: (info.name || "").slice(0, 40), item: info.item || null });
    if (rec.takes.length > 200) rec.takes = rec.takes.slice(-200);
    rec.rest = false;
    prSave(); renderTakes(d);
    goalToast(`🎚️ ${T("録音を今日の記録に残しました")}（${fmtClock(info.seconds || 0)}）`);
  }
  /** いま計測中のメニュー項目（録音機がテイク名に添える）。無ければ ""。 */
  function practiceItem() {
    if (!logRunning) return "";
    const id = $("lgCurItem").value; const it = id && todayMenu()[id];
    return it ? it.name : "";
  }

  // ---- 今日のメニュー ----
  function todayMenu() {
    const rec = dayRec(todayStr());
    if (!rec.menuInit) {
      rec.menuInit = true;
      for (const t of pr.menuTemplate) if (!rec.menu[t.id]) rec.menu[t.id] = { name: t.name, min: t.min, done: 0, checked: false };
      prSave();
    }
    return rec.menu;
  }
  function menuAdd(name, min, toTemplate) {
    name = (name || "").trim().slice(0, 24); min = Math.max(1, Math.min(300, Math.round(min) || 10));
    if (!name) return;
    const id = "m" + Date.now().toString(36);
    todayMenu()[id] = { name, min, done: 0, checked: false };
    if (toTemplate) pr.menuTemplate.push({ id, name, min });
    prSave(); renderMenu();
  }
  function renderMenu() {
    const menu = todayMenu();
    const ids = Object.keys(menu);
    const wrap = $("lgMenu"); wrap.innerHTML = "";
    if (!ids.length) wrap.innerHTML = `<p class="note" style="margin:0">やることを決めておくと始めやすくなります（例：ロングトーン 5分 → 課題の曲 15分）。</p>`;
    ids.forEach(id => {
      const it = menu[id];
      const row = document.createElement("div");
      row.className = "lg-item" + (it.checked ? " done" : "") + (logRunning && $("lgCurItem").value === id ? " cur" : "");
      row.innerHTML =
        `<button class="lg-chk" title="完了にする">${it.checked ? "✓" : ""}</button>
         <span class="lg-item-name">${escapeHtml(it.name)}</span>
         <span class="lg-item-min">${it.done ? `<b>${it.done}</b> / ` : ""}${it.min}分</span>
         <button class="lg-play" title="この項目として計測開始">▶</button>
         <button class="row-del" title="削除">✕</button>`;
      row.querySelector(".lg-chk").addEventListener("click", () => { it.checked = !it.checked; prSave(); renderMenu(); checkBadges(); });
      row.querySelector(".lg-play").addEventListener("click", () => {
        $("lgCurItem").value = id;
        if (!logRunning) startLog(); else renderMenu();
      });
      row.querySelector(".row-del").addEventListener("click", () => {
        const inTpl = pr.menuTemplate.some(t => t.id === id);
        if (inTpl && confirm(T(`「${it.name}」を毎日のメニューからも削除しますか？\n（キャンセル＝今日だけ外す）`))) pr.menuTemplate = pr.menuTemplate.filter(t => t.id !== id);
        delete menu[id]; prSave(); renderMenu();
      });
      wrap.appendChild(row);
    });
    $("lgMenuProg").textContent = ids.length ? `${ids.filter(i => menu[i].checked).length} / ${ids.length}` : "";
    // 「いま」セレクト
    const sel = $("lgCurItem"); const keep = sel.value;
    sel.innerHTML = `<option value="">（項目なし）</option>`;
    ids.forEach(id => { const o = document.createElement("option"); o.value = id; o.textContent = menu[id].name; sel.appendChild(o); });
    sel.value = ids.includes(keep) ? keep : "";
    const cur = sel.value && menu[sel.value];
    $("lgCurName").textContent = logRunning ? (cur ? `「${cur.name}」を計測中` : "計測中") : "";
  }
  $("lgMenuAddBtn").addEventListener("click", () => {
    const f = $("lgMenuAddForm"); f.hidden = !f.hidden;
    if (!f.hidden) $("lgMenuName").focus();
  });
  $("lgMenuAdd").addEventListener("click", () => {
    menuAdd($("lgMenuName").value, +$("lgMenuMin").value, $("lgMenuTpl").checked);
    $("lgMenuName").value = ""; $("lgMenuName").focus();
  });
  $("lgMenuName").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $("lgMenuAdd").click(); } });
  $("lgCurItem").addEventListener("change", renderMenu);

  // ---- 休息日（週1回まで・連続記録を守る） ----
  $("lgRestBtn").addEventListener("click", () => {
    const d = todayStr(), rec = dayRec(d), log = loadLog();
    if (rec.rest) { rec.rest = false; prSave(); renderLog(); return; }
    if (practiced(log, d)) { goalToast("今日はもう練習しています 💪"); return; }
    for (let i = 1; i <= 6; i++) if (isRest(addDays(d, -i))) { goalToast("休息日は週に1回までです"); return; }
    rec.rest = true; prSave(); renderLog();
    goalToast("😴 今日は休息日。連続記録は途切れません");
  });

  // ---- メッセージ（状態に応じて） ----
  function cheerMsg(log) {
    const d = todayStr(), today = log[d] || 0, y = addDays(d, -1);
    const streak = computeStreak(log);
    if (logRunning) return "計測中。止めたら自動で記録します";
    if (isRest(d) && today === 0) return "今日は休息日。しっかり休むのも練習のうち";
    if (today === 0) {
      const missedY = !practiced(log, y) && !isRest(y) && Object.keys(log).some(k => k < y && log[k] >= 1);
      if (missedY) return "昨日はお休み。今日やれば流れは切れません（2日続けて休まないのがコツ）";
      if (streak > 0) return `${streak}日連続中。まずは最低ライン ${pr.minGoal}分 だけ`;
      return `最初の一歩は小さく。まず ${pr.minGoal}分 だけやってみよう`;
    }
    if (today < pr.minGoal) return `あと ${pr.minGoal - today}分 で最低ライン。ここまでは必ず`;
    if (today < dailyGoal) return `最低ライン達成 ✓ ここから先はボーナス。目標まであと ${dailyGoal - today}分`;
    return weekDays(log, weekStart(d)) >= pr.weekTarget ? `目標達成！今週の ${pr.weekTarget}日 もクリア 🎉` : "目標達成！おつかれさま 🎉";
  }

  // ---- 描画 ----
  function renderLog() {
    const log = loadLog();
    const d = todayStr(), today = log[d] || 0;
    const streak = computeStreak(log), ws = weekStart(d);
    $("logToday").textContent = today;
    $("logTotal").textContent = totalMinutes(log);
    $("logStreak").textContent = streak;
    $("goalShow").textContent = dailyGoal;
    $("minGoalShow").textContent = pr.minGoal;
    $("lgWeekOf").textContent = `${weekDays(log, ws)}/${pr.weekTarget}日`;
    $("lgWeekStreak").textContent = computeWeekStreak(log);
    renderTakes(d);

    // リング：最低ラインの薄い弧＋目盛り、達成分の弧
    const pct = Math.min(1, today / dailyGoal), minPct = Math.min(1, pr.minGoal / dailyGoal);
    $("goalArc").style.strokeDashoffset = RING_LEN * (1 - pct);
    $("goalMinArc").style.strokeDashoffset = RING_LEN * (1 - minPct);
    $("goalMinMark").setAttribute("transform", `rotate(${minPct * 360} 60 60)`);
    const ring = document.querySelector(".goal-ring");
    ring.classList.toggle("done", pct >= 1);
    ring.classList.toggle("min", today >= pr.minGoal && pct < 1);
    $("lgRestBtn").classList.toggle("on", isRest(d));
    $("lgRestBtn").textContent = isRest(d) ? "😴 休息日（解除する）" : "今日は休息日にする";

    const cheer = $("cheer"); const msg = cheerMsg(log);
    if (cheer.dataset.msg !== msg) { cheer.dataset.msg = msg; cheer.textContent = msg; cheer.classList.remove("pop"); void cheer.offsetWidth; cheer.classList.add("pop"); }

    document.querySelectorAll(".gchip").forEach(c => c.classList.toggle("sel", +c.dataset.goal === dailyGoal));
    document.querySelectorAll(".mchip").forEach(c => c.classList.toggle("sel", +c.dataset.min === pr.minGoal));
    document.querySelectorAll(".wchip").forEach(c => c.classList.toggle("sel", +c.dataset.w === pr.weekTarget));
    $("lgGoalSum").textContent = `最低${pr.minGoal}分 ・ 目標${dailyGoal}分 ・ 週${pr.weekTarget}日`;

    renderMenu(); renderWeek(log); renderLevel(log); renderHeat(log); renderSummary(log); renderNextHook();
    renderCGoals();
  }
  function renderWeek(log) {
    const d = todayStr(), ws = weekStart(d);
    const wrap = $("lgWeek"); wrap.innerHTML = "";
    for (let i = 0; i < 7; i++) {
      const k = addDays(ws, i), m = log[k] || 0;
      const el = document.createElement("div");
      let cls = "lg-day";
      if (m >= dailyGoal) cls += " goal"; else if (m >= pr.minGoal) cls += " min"; else if (m >= 1) cls += " some";
      else if (isRest(k)) cls += " rest"; else if (k < d) cls += " miss"; else if (k > d) cls += " future";
      if (k === d) cls += " today";
      el.className = cls;
      el.innerHTML = `<span class="lg-day-wd">${wdName(k)}</span><span class="lg-day-dot">${isRest(k) && m === 0 ? "😴" : m >= pr.minGoal ? "✓" : m >= 1 ? "•" : ""}</span><span class="lg-day-min">${m ? m + "分" : "–"}</span>`;
      el.title = `${k}：${m}分`;
      wrap.appendChild(el);
    }
  }
  function renderLevel(log) {
    const L = levelInfo(log);
    $("lgLevel").textContent = `Lv.${L.lv}`;
    $("lgLevelHours").textContent = `通算 ${L.hours.toFixed(1)} 時間`;
    $("lgLevelNext").textContent = `次のレベルまで ${(L.next - L.hours).toFixed(1)} 時間`;
    $("lgLevelBar").style.width = (L.prog * 100).toFixed(1) + "%";
  }
  function renderHeat(log) {
    const wrap = $("lgHeat"); wrap.innerHTML = "";
    const d = todayStr(); const start = addDays(weekStart(d), -7 * 11);
    for (let w = 0; w < 12; w++) {
      const col = document.createElement("div"); col.className = "lg-heat-col";
      for (let i = 0; i < 7; i++) {
        const k = addDays(start, w * 7 + i), m = log[k] || 0;
        const c = document.createElement("i");
        let lv = 0;
        if (k > d) lv = -1; else if (m >= dailyGoal) lv = 4; else if (m >= dailyGoal / 2) lv = 3; else if (m >= pr.minGoal) lv = 2; else if (m >= 1) lv = 1;
        c.className = lv < 0 ? "hf" : "h" + lv;
        if (k === d) c.classList.add("today");
        c.title = `${k}（${wdName(k)}）${m}分`;
        col.appendChild(c);
      }
      wrap.appendChild(col);
    }
  }
  function renderSummary(log) {
    const d = todayStr(), ws = weekStart(d), lws = addDays(ws, -7);
    const tw = weekMinutes(log, ws), lw = weekMinutes(log, lws);
    const twd = weekDays(log, ws), lwd = weekDays(log, lws);
    const sess = pr.sessions.filter(s => s.m > 0);
    const avg = sess.length ? Math.round(sess.reduce((a, s) => a + s.m, 0) / sess.length) : 0;
    const byWd = [0,0,0,0,0,0,0]; for (const k in log) byWd[new Date(k + "T00:00:00").getDay()] += log[k];
    const bestWd = byWd.some(v => v > 0) ? ["日","月","火","水","木","金","土"][byWd.indexOf(Math.max(...byWd))] + "曜" : "–";
    const diff = tw - lw;
    $("lgSummary").innerHTML = `
      <div class="lg-stat"><b>${tw}<small>分</small></b><span>今週（${twd}日）</span></div>
      <div class="lg-stat"><b>${lw}<small>分</small></b><span>先週（${lwd}日）</span></div>
      <div class="lg-stat"><b class="${diff >= 0 ? "up" : "down"}">${diff >= 0 ? "+" : ""}${diff}<small>分</small></b><span>先週比</span></div>
      <div class="lg-stat"><b>${longestStreak(log)}<small>日</small></b><span>最長連続</span></div>
      <div class="lg-stat"><b>${avg}<small>分</small></b><span>1回の平均</span></div>
      <div class="lg-stat"><b>${bestWd}</b><span>いちばん練習する曜日</span></div>`;
  }

  // ---- 目標設定 ----
  function setGoal(v) {
    dailyGoal = Math.max(1, Math.min(600, Math.round(v)));
    lsSet(GOAL_KEY, dailyGoal);
    if (pr.minGoal > dailyGoal) pr.minGoal = dailyGoal;
    prSave(); renderLog();
  }
  document.querySelectorAll(".gchip").forEach(c => c.addEventListener("click", () => { setGoal(+c.dataset.goal); $("goalCustom").value = ""; }));
  function applyCustomGoal() { const v = +$("goalCustom").value; if (v > 0) setGoal(v); }
  $("goalSetBtn").addEventListener("click", applyCustomGoal);
  $("goalCustom").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); applyCustomGoal(); } });
  document.querySelectorAll(".mchip").forEach(c => c.addEventListener("click", () => { pr.minGoal = Math.min(+c.dataset.min, dailyGoal); prSave(); renderLog(); }));
  document.querySelectorAll(".wchip").forEach(c => c.addEventListener("click", () => { pr.weekTarget = +c.dataset.w; prSave(); renderLog(); }));

  // ---- 実績バッジ ----
  const BADGES = [
    { id: "first",    ico: "🌱", name: "はじめの一歩", test: l => totalMinutes(l) >= 1 },
    { id: "goal1",    ico: "🎯", name: "目標達成",     test: l => (l[todayStr()] || 0) >= dailyGoal },
    { id: "streak3",  ico: "🔥", name: "3日連続",      test: l => computeStreak(l) >= 3 },
    { id: "streak7",  ico: "⚡", name: "1週間連続",    test: l => computeStreak(l) >= 7 },
    { id: "streak30", ico: "👑", name: "30日連続",     test: l => computeStreak(l) >= 30 },
    { id: "week1",    ico: "🗓️", name: "週目標クリア", test: l => computeWeekStreak(l) >= 1 },
    { id: "week4",    ico: "🏅", name: "4週連続",      test: l => computeWeekStreak(l) >= 4 },
    { id: "menu1",    ico: "✅", name: "メニュー完遂", test: () => Object.values(pr.days).some(r => { const v = Object.values(r.menu || {}); return v.length && v.every(i => i.checked); }) },
    { id: "total60",  ico: "⏱️", name: "通算1時間",    test: l => totalMinutes(l) >= 60 },
    { id: "total600", ico: "💪", name: "通算10時間",   test: l => totalMinutes(l) >= 600 },
    { id: "total3000",ico: "🏆", name: "通算50時間",   test: l => totalMinutes(l) >= 3000 },
    { id: "lv5",      ico: "⭐", name: "Lv.5 到達",    test: l => levelInfo(l).lv >= 5 },
    { id: "days10",   ico: "📅", name: "10日練習",     test: l => activeDays(l) >= 10 },
    { id: "big",      ico: "🚀", name: "1日60分超",    test: l => Math.max(0, ...Object.values(l)) >= 60 },
    { id: "reflect5", ico: "📓", name: "振り返り5回",  test: () => Object.keys(loadDiary()).length >= 5 }
  ];
  function earnedBadges() { return lsGet(BADGE_KEY, []); }
  function renderBadges() {
    const earned = earnedBadges();
    const shelf = $("badgeShelf"); shelf.innerHTML = "";
    BADGES.forEach(b => {
      const el = document.createElement("div");
      el.className = "badge" + (earned.includes(b.id) ? " earned" : "");
      el.dataset.id = b.id;
      el.innerHTML = `<span class="b-ico">${b.ico}</span><span class="b-name">${earned.includes(b.id) ? b.name : "？？？"}</span>`;
      el.title = b.name;
      shelf.appendChild(el);
    });
    $("badgeSum").textContent = `${earned.filter(id => BADGES.some(b => b.id === id)).length} / ${BADGES.length}`;
  }
  function checkBadges() {
    const log = loadLog();
    const earned = earnedBadges();
    let changed = false;
    for (const b of BADGES) {
      if (!earned.includes(b.id) && b.test(log)) {
        earned.push(b.id); changed = true;
        goalToast(`${b.ico} バッジ獲得：${b.name}`);
        setTimeout(() => {
          const el = $("badgeShelf").querySelector(`[data-id="${b.id}"]`);
          if (el) { el.classList.add("earned", "just"); el.querySelector(".b-name").textContent = b.name; }
        }, 50);
      }
    }
    if (changed) { lsSet(BADGE_KEY, earned); renderBadges(); }
  }

  // ---- 自分で作る目標 ----
  const CGOAL_KEY = "keyboard_customGoals_v1";
  const CG_TYPES = {
    total:  { unit: "分", label: "通算",     measure: l => totalMinutes(l) },
    streak: { unit: "日", label: "連続",     measure: l => computeStreak(l) },
    day:    { unit: "分", label: "1日で",    measure: l => Math.max(0, ...Object.values(l), 0) },
    days:   { unit: "日", label: "練習日数", measure: l => activeDays(l) },
    manual: { unit: "",   label: "手動",     measure: () => 0 }
  };
  function loadCGoals() { return lsGet(CGOAL_KEY, []); }
  function saveCGoals(a) { lsSet(CGOAL_KEY, a); }
  function cgoalDesc(g) {
    const t = CG_TYPES[g.type];
    if (g.type === "manual") return "達成したら自分でチェック";
    if (g.type === "day") return `1日の練習が ${g.target}${t.unit} に到達`;
    if (g.type === "days") return `練習した日が通算 ${g.target} 日`;
    if (g.type === "streak") return `${g.target} 日連続で練習`;
    return `${t.label} ${g.target}${t.unit} に到達`;
  }
  function cgoalDone(g, log) { return g.type === "manual" ? !!g.done : CG_TYPES[g.type].measure(log) >= g.target; }
  function renderCGoals() {
    const arr = loadCGoals(), log = loadLog();
    const wrap = $("cgoalList"); wrap.innerHTML = "";
    if (!arr.length) wrap.innerHTML = `<p class="note" style="text-align:center;margin:0">まだ目標がありません。下から作成できます。</p>`;
    arr.forEach((g, i) => {
      const done = cgoalDone(g, log);
      const prog = g.type === "manual" ? (g.done ? 1 : 0) : Math.min(1, CG_TYPES[g.type].measure(log) / g.target);
      const el = document.createElement("div");
      el.className = "cgoal" + (done ? " done" : "");
      const t = CG_TYPES[g.type];
      const cur = g.type === "manual" ? "" : `${t.measure(log)} / ${g.target}${t.unit}`;
      el.innerHTML =
        `<span class="cg-ico">${escapeHtml(done ? (g.ico || "✅") : (g.ico || "⬜"))}</span>
         <div class="cg-body">
           <div class="cg-nm">${escapeHtml(g.name)}</div>
           <div class="cg-desc">${cgoalDesc(g)} ${cur ? "・" + cur : ""}</div>
           ${g.type === "manual" ? "" : `<div class="cg-prog"><i style="width:${(prog * 100).toFixed(0)}%"></i></div>`}
         </div>`;
      if (g.type === "manual") {
        const chk = document.createElement("button");
        chk.className = "cg-check"; chk.textContent = g.done ? "達成済 ✓" : "達成にする";
        chk.addEventListener("click", () => {
          const a = loadCGoals(); a[i].done = !a[i].done;
          if (a[i].done) { a[i].doneAt = todayStr(); goalToast(`${a[i].ico || "🎯"} 達成：${a[i].name}`); }
          saveCGoals(a); renderCGoals();
        });
        el.appendChild(chk);
      }
      const del = document.createElement("button");
      del.className = "cg-del"; del.textContent = "✕";
      del.addEventListener("click", () => { const a = loadCGoals(); a.splice(i, 1); saveCGoals(a); renderCGoals(); });
      el.appendChild(del);
      wrap.appendChild(el);
    });
    $("cgoalSum").textContent = arr.length ? `${arr.filter(g => cgoalDone(g, log)).length} / ${arr.length} 達成` : "";
  }
  $("cgType").addEventListener("change", () => {
    const manual = $("cgType").value === "manual";
    $("cgUnit").textContent = CG_TYPES[$("cgType").value].unit;
    $("cgTarget").style.display = manual ? "none" : "";
    $("cgUnit").style.display = manual ? "none" : "";
  });
  $("cgAdd").addEventListener("click", () => {
    const name = $("cgName").value.trim(), type = $("cgType").value;
    const target = type === "manual" ? 0 : Math.max(1, Math.round(+$("cgTarget").value || 0));
    if (!name) { $("cgName").focus(); return; }
    if (type !== "manual" && !target) { $("cgTarget").focus(); return; }
    const arr = loadCGoals();
    arr.push({ id: "cg" + Date.now(), ico: $("cgIcon").value.trim(), name, type, target, done: false });
    saveCGoals(arr);
    $("cgName").value = ""; $("cgIcon").value = ""; $("cgTarget").value = "";
    renderCGoals();
  });



  // ---- タイマー ----
  function startLog() {
    logRunning = true; logStartT = performance.now();
    $("logBtn").textContent = "■ 練習終了（記録する）"; $("logBtn").classList.add("on");
    logTimer = setInterval(() => { $("logElapsed").textContent = fmtClock((performance.now() - logStartT) / 1000); }, 500);
    renderLog();
  }
  function stopLog() {
    logRunning = false; clearInterval(logTimer);
    const mins = Math.round((performance.now() - logStartT) / 1000 / 60);
    autoStarted = false;
    $("logBtn").textContent = "▶ 練習開始"; $("logBtn").classList.remove("on");
    $("logElapsed").textContent = "00:00";
    if (mins > 0) addMinutes(mins, $("lgCurItem").value); else renderLog();
  }
  $("logBtn").addEventListener("click", () => { logRunning ? stopLog() : startLog(); });
  $("logManual").addEventListener("click", () => {
    const n = parseInt(prompt(T("追加する練習時間（分）を入力"), "10"), 10);
    if (n > 0) addMinutes(n, $("lgCurItem").value);
  });
  function autoStartLog() {
    if (!$("logAuto").checked || logRunning || autoStarted) return;
    autoStarted = true; startLog();
  }

  // ---- 振り返り（収穫・次の課題・調子・メモ） ----
  const DIARY_KEY = "keyboard_practiceDiary_v1"; // { "YYYY-MM-DD": {text, mood, win, next} }
  function loadDiary() { return lsGet(DIARY_KEY, {}); }
  function setMood(m) {
    $("diaryMood").value = m;
    document.querySelectorAll("#diaryMoodPick .mood").forEach(b => b.classList.toggle("sel", b.dataset.m === m));
  }
  document.querySelectorAll("#diaryMoodPick .mood").forEach(b => b.addEventListener("click", () => setMood($("diaryMood").value === b.dataset.m ? "" : b.dataset.m)));
  function renderNextHook() {
    const d = loadDiary();
    const keys = Object.keys(d).filter(k => (d[k].next || "").trim()).sort().reverse();
    const box = $("lgNextBox");
    if (!keys.length) { box.hidden = true; return; }
    const k = keys[0];
    box.hidden = false;
    box.querySelector(".lg-next-lab").textContent = (k === todayStr() ? "今日" : k.slice(5).replace("-", "/")) + " の「次の課題」";
    $("lgNextText").textContent = d[k].next;
  }
  $("lgNextToMenu").addEventListener("click", () => { menuAdd($("lgNextText").textContent, 10, false); goalToast("メニューに追加しました"); });
  function renderDiary() {
    const d = loadDiary(); const log = loadLog();
    const wrap = $("diaryList"); wrap.innerHTML = "";
    Object.keys(d).sort().reverse().forEach(key => {
      const e = d[key];
      const row = document.createElement("div"); row.className = "diary-row";
      const min = log[key] || 0;
      const h = document.createElement("div"); h.className = "diary-row-h";
      h.innerHTML = `<span class="dr-mood">${escapeHtml(e.mood || "")}</span><span>${key}（${wdName(key)}）</span>` +
        (min ? `<span class="diary-row-min">練習 ${min}分</span>` : "");
      const del = document.createElement("button"); del.className = "row-del"; del.textContent = "✕";
      del.addEventListener("click", ev => { ev.stopPropagation(); const o = loadDiary(); delete o[key]; lsSet(DIARY_KEY, o); renderDiary(); renderNextHook(); });
      h.appendChild(del);
      const body = document.createElement("div"); body.className = "diary-row-body";
      body.innerHTML =
        (e.win ? `<div class="rf-line"><span class="rf-tag win">できた</span>${escapeHtml(e.win)}</div>` : "") +
        (e.next ? `<div class="rf-line"><span class="rf-tag next">次</span>${escapeHtml(e.next)}</div>` : "") +
        (e.text ? `<div class="rf-memo">${escapeHtml(e.text)}</div>` : "");
      row.appendChild(h); row.appendChild(body);
      row.addEventListener("click", () => {
        $("diaryDate").value = key; $("diaryText").value = e.text || ""; $("diaryWin").value = e.win || ""; $("diaryNext").value = e.next || "";
        setMood(e.mood || ""); $("diaryWin").focus();
      });
      wrap.appendChild(row);
    });
  }
  $("diarySave").addEventListener("click", () => {
    const key = $("diaryDate").value || todayStr();
    const text = $("diaryText").value.trim(), win = $("diaryWin").value.trim(), next = $("diaryNext").value.trim(), mood = $("diaryMood").value;
    if (!text && !mood && !win && !next) { $("diaryStatus").textContent = "どれか1つ書いてください"; return; }
    const d = loadDiary(); d[key] = { text, mood, win, next }; lsSet(DIARY_KEY, d);
    $("diaryStatus").textContent = "保存しました ✓";
    setTimeout(() => $("diaryStatus").textContent = "", 1800);
    renderDiary(); renderNextHook(); checkBadges();
  });

  // ---- 初期化 ----
  function prInit() {
    $("diaryDate").value = todayStr();
    todayMenu();
    renderBadges();
    renderLog();
    renderDiary();
    checkBadges();
  }

  KB.autoStartLog = autoStartLog;
  KB.studioTake = studioTake;
  KB.practiceItem = practiceItem;
  KB.log = { init: prInit };
})();
