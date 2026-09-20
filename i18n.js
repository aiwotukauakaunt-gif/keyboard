/* ============================================================
   Keyboard — 多言語（ja / en）
   仕組み：HTML・JS の日本語文字列はそのままに、表示された文字列を辞書で置換する。
   ・静的テキスト・placeholder・title・aria-label を起動時に翻訳
   ・JS が後から書き換える文字列も MutationObserver で追従
   ・"{n}" は数値、"{s}" は任意文字列のプレースホルダー（英訳側は {1}{2}… で参照）
   ============================================================ */
(() => {
  "use strict";
  const EN = {
    // ---- 共通・ヘッダー ----
    "Keyboard — 鍵盤・チューナー・メトロノーム 練習ツール": "Keyboard — Practice tools: piano, tuner, metronome",
    "ブラウザだけで使える音楽練習ツール。鍵盤・チューナー・多機能メトロノーム・伴奏ループ・録音・練習記録がひとつに。": "Browser-based practice tools for musicians: keyboard, tuner, advanced metronome, backing looper, recorder and practice log in one.",
    "鍵盤 · チューナー · メトロノーム · 伴奏ループ · 録音 · 練習記録": "Keyboard · Tuner · Metronome · Looper · Recorder · Practice log",
    "鍵盤 · チューナー · メトロノーム · 伴奏ループ · 録音 · 本格録音 · 練習記録": "Keyboard · Tuner · Metronome · Looper · Recorder · Studio · Practice log",
    "💾 バックアップ": "💾 Backup", "データの書き出し / 読み込み": "Export / import your data",
    "🌙 テーマ": "🌙 Theme", "ライト / ダーク切替": "Light / dark", "🌙 ダーク": "🌙 Dark", "☀️ ライト": "☀️ Light",
    "表示するツール": "Tools", "複数のツールを同時に表示できます": "You can show several tools at once",
    "鍵盤": "Keyboard", "チューナー": "Tuner", "メトロノーム": "Metronome", "伴奏ループ": "Looper", "録音": "Recorder", "記録": "Log",
    "Keyboard — ブラウザだけで動く練習ツール。データはこのブラウザ内（localStorage）にだけ保存されます。": "Keyboard — practice tools that run entirely in your browser. Your data stays in this browser (localStorage).",
    "ソースコード": "Source code", "不具合・要望はこちら": "Report a bug / request",
    "設定": "Settings", "保存": "Save", "追加": "Add", "適用": "Apply", "閉じる": "Close", "削除": "Delete", "呼び出し": "Load", "クリア": "Clear",
    "なし": "None", "オフ": "Off", "オン": "On", "自動": "Auto", "標準": "Normal", "分": "min", "秒": "s", "日": "d", "・": "·", "中": "M",
    "小": "S", "大": "L", "音": "Note",
    // ---- 初回案内 ----
    "はじめまして 👋": "Welcome 👋",
    "下の鍵盤を押すか、PCのキーを叩くと音が鳴ります。管楽器の人は「移調（管）」を自分の楽器に。iPhone で鳴らないときはマナーモードを解除してください。": "Tap the keys below or type on your PC keyboard to play. Wind players: set “Transposition” to your instrument. On iPhone, turn off silent mode if you hear nothing.",
    "上のボタンでツールを切り替え。複数を同時に表示できます。": "Use the buttons above to switch tools — you can show several at once.",
    "「記録」で毎日の練習を残すと、続けやすくなります。データはこのブラウザの中だけに保存されます。": "Track your daily practice in “Log” to keep the habit going. Everything stays in this browser.",
    // ---- バックアップ ----
    "バックアップ": "Backup",
    "設定・プリセット・伴奏ループ・練習記録・日記をJSONファイルに書き出し／読み込みできます。別のブラウザや端末への引っ越しに。": "Export or import settings, presets, loops, practice log and notes as a JSON file — handy when moving to another browser or device.",
    "（録音した音声ファイルは含まれません）": "(Audio recordings are not included.)",
    "⬇ 書き出し（JSON）": "⬇ Export (JSON)", "⬆ 読み込み": "⬆ Import",
    "{n} 項目を書き出しました。": "Exported {1} items.",
    "JSONとして読み込めませんでした。": "Could not read the file as JSON.",
    "Keyboard のバックアップファイルではありません。": "This is not a Keyboard backup file.",
    "このブラウザの現在のデータを、ファイルの内容で上書きします。よろしいですか？": "This will overwrite the data in this browser with the file. Continue?",
    "読み込みました。ページを再読み込みします…": "Imported. Reloading…",
    // ---- 鍵盤 ----
    "移調（管）": "Transposition", "C 管": "C", "B 管": "B", "Bb 管": "Bb", "A 管": "A", "Ab 管": "Ab", "G 管": "G", "F# 管": "F#", "F 管": "F", "E 管": "E", "Eb 管": "Eb", "D 管": "D", "Db 管": "Db",
    "オクターブ": "Octave", "音律": "Tuning", "平均律": "Equal", "純正律": "Just", "主音": "Root", "音色": "Timbre", "音量": "Volume",
    "保持（和音）": "Hold (chords)", "⏹ 全部止める": "⏹ Stop all", "鍵盤を押す…": "Press a key…",
    "基準ピッチ A": "Reference pitch A", "鍵盤の大きさ": "Key size", "PCキーの高さ（← →）": "PC keys range (← →)", "MIDI キーボード": "MIDI keyboard",
    "🎛 接続": "🎛 Connect", "🎛 切断": "🎛 Disconnect", "接続中: ": "Connected: ",
    "MIDI機器が見つかりません（接続すると自動で認識）": "No MIDI device found (plug one in — it will be detected)",
    "このブラウザは Web MIDI 非対応です（Chrome / Edge 推奨）": "This browser does not support Web MIDI (use Chrome / Edge)",
    "MIDIアクセスが拒否されました": "MIDI access was denied",
    "A={n}Hz ・ PCキー {s}": "A={1} Hz · PC keys {2}",
    "標準（丸い）": "Standard (soft)", "サイン波": "Sine", "オルガン": "Organ", "ブラス風": "Brass",
    "操作方法とショートカット": "Controls & shortcuts",
    "音域 A0〜C8。押した鍵は記譜音、鳴るのは選んだ管の実音。各鍵の上の文字＝PCキー。": "Range A0–C8. Keys are written pitch; the sound is concert pitch for the selected transposition. Letters above keys = PC keys.",
    "1オクターブ移動": "move one octave", "半音移動": "move a semitone", "サステイン　タッチは複数指で同時発音": "sustain · multi-touch plays chords",
    "メトロノーム開始/停止": "start/stop metronome", "タップ": "tap tempo", "テンポ±1": "tempo ±1", "テンポ±10": "tempo ±10",
    "※PCキーボードは同時押しの数に上限があります。クラスターは保持モードかスペースで。": "Note: PC keyboards limit simultaneous keys. Use hold mode or Space for clusters.",
    "練習ハブ": "Hub", "いま弾いた音（実音）": "Last note (concert)", "基準ピッチ": "Reference pitch", "Hz ・ 鍵盤とチューナーで共通": "Hz · shared by keyboard and tuner",
    "純正律 → 平均律との差": "Just vs equal", "音律を純正律にすると、平均律との差をここに表示": "Switch tuning to Just to see the offset from equal temperament",
    "主音 {s}・鍵盤を押すと表示": "Root {1} · press a key",
    "{s} からの{s}（平均律なら {n} Hz）": "{2} from {1} (equal: {3} Hz)",
    "主音（完全1度）": "root (unison)", "短2度": "minor 2nd", "長2度": "major 2nd", "短3度": "minor 3rd", "長3度": "major 3rd", "完全4度": "perfect 4th", "増4度": "tritone", "完全5度": "perfect 5th", "短6度": "minor 6th", "長6度": "major 6th", "短7度": "minor 7th", "長7度": "major 7th",
    // ---- チューナー ----
    "🎤 チューナー開始": "🎤 Start tuner", "🎤 チューナー開始（マイク）": "🎤 Start tuner", "■ チューナー停止": "■ Stop tuner", "マイク入力中": "Listening…",
    "このブラウザはマイク入力に対応していません": "This browser does not support microphone input",
    "マイクは https:// か localhost でのみ使えます（file:// では使えません）": "The microphone only works over https:// or localhost (not file://)",
    "マイクを使用できません": "Microphone unavailable",
    "マイクが拒否されました。ブラウザのアドレスバーのマイク許可、またはOSのマイク権限を確認してください": "Microphone access denied. Check the site permission in the address bar or your OS settings",
    "マイクが見つかりません（接続を確認してください）": "No microphone found (check the connection)",
    "他のアプリがマイクを使用中の可能性があります": "Another app may be using the microphone",
    "マイクエラー: ": "Microphone error: ",
    "ドローン": "Drone", "▶ ドローン": "▶ Drone", "■ ドローン停止": "■ Stop drone", "ドローン音量": "Drone volume",
    "実音（コンサートピッチ・現在の音律）で鳴り続けます。マイクと併用するときはイヤホン推奨": "Sustains a concert-pitch reference tone in the current tuning. Use headphones with the tuner.",
    "ロングトーン練習": "Long tones", "▶ ロングトーン計測": "▶ Measure long tones", "■ 計測停止": "■ Stop measuring", "計測中": "Measuring",
    "合格範囲 ±": "Tolerance ±", "保持": "Held", "範囲内": "In tune", "安定度": "Stability",
    "音を伸ばすと自動で計測、音が切れると1回分として記録（1秒未満は無視）。": "Measuring starts when you hold a note and one attempt is logged when it stops (under 1 s is ignored).",
    "音ごとのまとめ": "By note", "結果がたまると、音ごとの平均安定度と最長記録をここに表示します。": "Average stability and longest hold per note will appear here as results accumulate.",
    "最長 {n}秒 ・ {n}回": "best {1} s · {2}×",
    "最近の結果": "Recent results", "結果を消す": "Clear results", "ロングトーンの結果をすべて消しますか？": "Delete all long-tone results?",
    "まだ結果がありません。チューナーを起動して音を伸ばしてみましょう。": "No results yet. Start the tuner and hold a note.",
    "{n}秒 ・ 平均 {n}¢ ・ 最大 {n}¢ ・ {s}": "{1} s · avg {2}¢ · max {3}¢ · {4}",
    // ---- メトロノーム ----
    "▶ 開始": "▶ Start", "■ 停止": "■ Stop", "🔇 視覚のみ": "🔇 Visual only", "🔈 音を出す": "🔈 Sound on", "音を消してプレイヘッドだけ表示": "Mute and show only the playhead",
    "🔗 共有": "🔗 Share", "テンポ・拍子・リズムをURLにして共有": "Share tempo, meter and rhythm as a URL",
    "🔗 共有URLをコピーしました": "🔗 Share link copied", "🔗 共有されたメトロノーム設定を読み込みました": "🔗 Loaded shared metronome settings",
    "この URL をコピーして共有してください": "Copy this URL to share",
    "{n} BPM ・ {n}/{n} — Keyboard メトロノーム": "{1} BPM · {2}/{3} — Keyboard metronome",
    "{n} BPM ・ {n}/{n} ・ {n}連 — Keyboard メトロノーム": "{1} BPM · {2}/{3} · {4}-tuplet — Keyboard metronome",
    "テンポ": "Tempo", "テンポを上げる": "Tempo up", "テンポを下げる": "Tempo down", "テンポスライダー": "Tempo slider",
    "拍子": "Meter", "拍子（分子）": "Beats per bar", "拍子（分母）": "Beat unit", "1拍の分割": "Subdivision", "分割": "Subdiv.",
    "小節 {n}": "Bar {1}", "小節 {n}（無音）": "Bar {1} (silent)", "小節 1": "Bar 1", "（無音）": "(silent)",
    "カウント…": "Count-in…", "カウント {n}/{n}・{n}": "Count {1}/{2} · {3}", "カウント {n}/{n}": "Count {1}/{2}", "カウントイン… {n}拍": "Count-in… {1} beats",
    "セルをタップ：休み → 鳴る → アクセント → 休み": "Tap a cell: rest → hit → accent → rest",
    "{n}拍目": "Beat {1}", "{n}拍目 ({n}/{n})": "Beat {1} ({2}/{3})",
    "♩ 拍のみ": "♩ Beats", "♫ 8分": "♫ 8ths", "3連": "Triplets", "3連中抜き": "Triplet (no mid)", "16分": "16ths", "裏打ち": "Offbeats", "シンコペ": "Clave",
    "休み": "Rest", "鳴る": "Hit", "拍頭": "Beat", "アクセント": "Accent", "第2声": "2nd voice", "再生位置": "Playhead",
    "アクセント / 変拍子": "Accents / grouping", "グルーピング": "Grouping", "例: 3+2+2": "e.g. 3+2+2",
    "数字を + でつなぐと、その拍数ごとの頭がアクセントになります（合計＝拍子の分子）。": "Join numbers with + to accent the start of each group (sum = beats per bar).",
    "電子ビープ": "Beep", "ビープ": "Beep", "クリック（木製）": "Click (wood)", "カウベル": "Cowbell", "ウッドブロック": "Woodblock", "ソフトTick": "Soft tick",
    "練習モード": "Practice modes", "ギャップ（無音小節）": "Gap (silent bars)", "1小節おきに無音": "Every other bar silent", "3小節鳴らして1小節無音": "3 bars on, 1 silent", "ランダム無音": "Random silence",
    "テンポトレーナー：": "Tempo trainer:", "小節ごとに": "bars, then add", "BPM 上げる": "BPM",
    "全体": "Master", "アクセント・拍・分割のバランス": "Balance of accent / beat / subdivision", "フラット": "Flat", "アクセント強調": "Strong accent", "裏を弱く": "Soft subdivisions",
    "{n}%・{s}": "{1}% · {2}",
    "カウントイン": "Count-in", "開始前に": "Before start,", "小節カウントする": "bar(s) count-in", "{n}小節": "{1} bar(s)",
    "ポリリズム（2声）": "Polyrhythm (2 voices)", "第2声を重ねる": "Add 2nd voice", "1拍を": "Divide beat by", "等分": "", "例：3:2 なら分割を2、第2声を3に。": "e.g. for 3:2 set subdivision 2 and 2nd voice 3.",
    "設定の保存・呼び出し": "Save / load presets", "プリセット名": "Preset name", "{n}件": "{1}",
    "テンポ・拍子・グリッド・音色・音量・各モードをまとめて保存します。": "Saves tempo, meter, grid, sound, volume and all modes together.",
    "保存済みプリセットはありません。": "No saved presets.", "※この環境では保存が使えない場合があります。": "Saving may not be available in this environment.",
    // ---- 伴奏ループ ----
    "● 録音": "● Record", "● 準備…": "● Arming…", "■ 録音中（自動停止）": "■ Recording (auto-stop)", "＋ 重ね録り": "＋ Overdub", "＋ 次のループ頭で開始…": "＋ Starts at next loop…",
    "▶ ループ再生": "▶ Play loop", "再生しながら次のループ頭から1周ぶん録音し、別トラックとして重ねます": "Records one loop starting at the next loop boundary and adds it as a new track",
    "長さ": "Length", "小節": "bars", "リズムも鳴らす": "Play clicks",
    "メトロノームのテンポで鍵盤を弾いて記録し、ループ再生します。テンポは後から変えられます。": "Play the keyboard at the metronome tempo to record a loop. You can change the tempo later.",
    "次のループ頭から重ね録りを開始します…": "Overdub starts at the next loop boundary…",
    "重ね録り中：1周（{n}小節）ぶん弾いてください。": "Overdubbing: play one loop ({1} bars).", "録音中：{n}小節ぶん弾いてください。": "Recording: play {1} bars.",
    "重ね録り {n}/{n}小節": "Overdub {1}/{2} bars", "録音 {n}/{n}小節": "Rec {1}/{2} bars", "再生 {n}/{n}小節": "Play {1}/{2} bars",
    "重ね録り完了：{s}・{n}小節。そのままループ再生中です。": "Overdub done: {1} · {2} bars. Still looping.",
    "録音完了：{s}・{n}小節。「ループ再生」で流れます。": "Recorded: {1} · {2} bars. Press “Play loop”.",
    "鍵盤{n}音（{n}トラック）": "{1} notes ({2} tracks)", "鍵盤{n}音（{n}トラック）＋リズム": "{1} notes ({2} tracks) + clicks", "リズム": "clicks",
    "{n}/{n}日": "{1}/{2} days",
    "何も記録されませんでした。もう一度どうぞ。": "Nothing was recorded. Try again.", "まだ伴奏がありません。": "No loop yet.", "停止しました。": "Stopped.", "消去しました。": "Cleared.",
    "ループ再生中。伴奏に合わせて練習しましょう。テンポを変えると追従します。": "Looping. Practice along — the loop follows tempo changes.",
    "トラック {n} ・ {n}音": "Track {1} · {2} notes", "🔇 ミュート中": "🔇 Muted", "🔊 再生": "🔊 On",
    "保存・呼び出し": "Save / load", "名前を付けて保存（例：Cメジャー 4小節）": "Name this loop (e.g. C major, 4 bars)", "保存済みの伴奏はありません。": "No saved loops.",
    "保存できる伴奏がありません。先に録音してください。": "Nothing to save — record a loop first.",
    "「{s}」を保存しました。下の一覧からいつでも呼び出せます。": "Saved “{1}”. Load it any time from the list below.",
    "「{s}」を呼び出しました（{n}音・{n}トラック・{n}小節・録音時{n}BPM）。「ループ再生」で流れます。": "Loaded “{1}” ({2} notes · {3} tracks · {4} bars · recorded at {5} BPM). Press “Play loop”.",
    "・{n}小節・{n}音・{n}トラック・{n}BPM": "· {1} bars · {2} notes · {3} tracks · {4} BPM",
    // ---- 録音 ----
    "● 録音開始": "● Record", "マイク": "Mic", "アプリ音": "App audio",
    "本格録音": "Studio", "🎚️ 本格録音": "🎚️ Studio",
    "もっと本格的に録るなら → ": "For a serious recording → ",
    "（マイクの音をそのまま 24bit で。鍵盤やメトロノームの音は別トラックに）": "(raw 24-bit mic take; keyboard and metronome go to a separate track)",
    "楽器のための録音機。マイクの音を、ブラウザの加工なしにそのまま残します（True Peak メーター・押す前の音も残す・24bit / FLAC）。鍵盤・メトロノーム・伴奏ループの音は": "A recorder built for instruments. Your mic is captured exactly as it is — no browser processing (true-peak meter, pre-roll, 24-bit / FLAC). Keys, metronome and looper go to a ",
    "別のトラック": "separate track", "に録るので、マイクの録りは素のまま。": ", so the mic take stays pure.",
    "別ウィンドウで開く ↗": "Open in a new window ↗",
    "録音はこのブラウザの中（OPFS）に残り、「録音一覧」から書き出せます。マイクの許可を求められたら許してください。": "Recordings stay in this browser (OPFS) and can be exported from “Recordings”. Allow the microphone when asked.",
    "録音はこのブラウザ内に保存され、リロードしても残ります。": "Recordings are stored in this browser and survive reloads.",
    "マイクかアプリ音のどちらかを選んでください。": "Select the mic, app audio or both.",
    "マイクを取得できませんでした（許可が必要です）。アプリ音のみで録音します。": "Microphone unavailable (permission needed). Recording app audio only.",
    "この環境では録音に対応していません。": "Recording is not supported here.", "元形式で保存": "Save original", "WAVで保存": "Save as WAV", "変換中…": "Converting…", "WAV変換に失敗しました": "WAV conversion failed",
    "この録音を削除しますか？": "Delete this recording?",
    // ---- 記録：今日 ----
    "練習記録": "Practice log", "前回の課題": "Last time's next step", "{s} の「次の課題」": "Next step from {1}", "メニューに入れる": "Add to menu", "メニューに追加しました": "Added to menu",
    "分 / 今日": "min today", "目標": "Goal", "目標 {n}分": "Goal {1} min",
    "日連続 ・ 今週": "-day streak · this week", "週連続 ・ 最低ライン": "-week streak · minimum", "分 ・ 通算": "min · total",
    "▶ 練習開始": "▶ Start practice", "■ 練習終了（記録する）": "■ Finish (log it)", "「{s}」を計測中": "Timing “{1}”", "計測中。止めたら自動で記録します": "Timing… stop to log it",
    "手動で分を追加": "Add minutes manually", "追加する練習時間（分）を入力": "Minutes to add", "今日は休息日にする": "Mark today as rest day", "😴 休息日（解除する）": "😴 Rest day (undo)",
    "週に1回まで。連続記録が途切れません": "Once a week. Keeps your streak alive", "😴 今日は休息日。連続記録は途切れません": "😴 Rest day. Your streak is safe",
    "今日はもう練習しています 💪": "You already practiced today 💪", "休息日は週に1回までです": "Only one rest day per week",
    "今日は休息日。しっかり休むのも練習のうち": "Rest day. Resting well is part of practice",
    "昨日はお休み。今日やれば流れは切れません（2日続けて休まないのがコツ）": "You skipped yesterday. Practice today and the habit holds (never miss twice)",
    "{n}日連続中。まずは最低ライン {n}分 だけ": "{1}-day streak. Start with just the {2}-minute minimum",
    "最初の一歩は小さく。まず {n}分 だけやってみよう": "Start small — just {1} minutes",
    "あと {n}分 で最低ライン。ここまでは必ず": "{1} min to the minimum. Get at least this far",
    "最低ライン達成 ✓ ここから先はボーナス。目標まであと {n}分": "Minimum done ✓ Everything from here is bonus. {1} min to goal",
    "目標達成！今週の {n}日 もクリア 🎉": "Goal reached — and {1} days this week 🎉", "目標達成！おつかれさま 🎉": "Goal reached! Nice work 🎉",
    "🌱 最低ライン {n}分 達成！ここから先はボーナス": "🌱 {1}-minute minimum done! The rest is bonus", "🎉 今日の目標 {n}分 達成！": "🎉 Daily goal of {1} min reached!",
    "🎉 目標達成！今週の{n}日もクリア": "🎉 Goal reached — {1} days this week too", "✅ 「{s}」完了！": "✅ “{1}” done!",
    "今日のメニュー": "Today's menu", "＋ 項目を追加": "＋ Add item", "項目（例：ロングトーン）": "Item (e.g. long tones)", "毎日": "Daily", "完了にする": "Mark done", "この項目として計測開始": "Start timing this item",
    "やることを決めておくと始めやすくなります（例：ロングトーン 5分 → 課題の曲 15分）。": "Deciding what to do makes it easier to start (e.g. long tones 5 min → repertoire 15 min).",
    "「{s}」を毎日のメニューからも削除しますか？\n（キャンセル＝今日だけ外す）": "Also remove “{1}” from the daily menu?\n(Cancel = remove for today only)",
    "{n} / {n}": "{1} / {2}", "{n}分": "{1} min", "{n}日": "{1} d",
    "最低ライン": "Minimum", "「これだけはやる」の量": "The amount you'll always do", "1日の目標": "Daily goal", "調子がいい日に届かせたい量": "What you aim for on a good day",
    "週に何日": "Days per week", "毎日でなくてOK": "Doesn't have to be every day", "自由": "Custom", "3分": "3 min", "5分": "5 min", "10分": "10 min", "15分": "15 min", "30分": "30 min", "45分": "45 min", "60分": "60 min",
    "3日": "3 days", "4日": "4 days", "5日": "5 days", "6日": "6 days", "7日": "7 days",
    "最低{n}分 ・ 目標{n}分 ・ 週{n}日": "Min {1} · goal {2} min · {3} days/week", "音を鳴らしたら自動で計測開始": "Start timing automatically when sound plays",
    // ---- 記録：これまで ----
    "これまで": "Progress", "月": "Mon", "火": "Tue", "水": "Wed", "木": "Thu", "金": "Fri", "土": "Sat",
    "{s}（月）": "{1} (Mon)", "{s}（火）": "{1} (Tue)", "{s}（水）": "{1} (Wed)", "{s}（木）": "{1} (Thu)", "{s}（金）": "{1} (Fri)", "{s}（土）": "{1} (Sat)", "{s}（日）": "{1} (Sun)",
    "{s}：{n}分": "{1}: {2} min", "{s}（{s}）{n}分": "{1} ({2}) {3} min",
    "通算 {n} 時間": "{1} h total", "通算 0.0 時間": "0.0 h total", "次のレベルまで {n} 時間": "{1} h to next level",
    "くわしい統計": "More stats", "今週（{n}日）": "this week ({1} d)", "先週（{n}日）": "last week ({1} d)", "先週比": "vs last week", "最長連続": "longest streak", "1回の平均": "avg session", "いちばん練習する曜日": "best weekday",
    "月曜": "Mon", "火曜": "Tue", "水曜": "Wed", "木曜": "Thu", "金曜": "Fri", "土曜": "Sat", "日曜": "Sun",
    "実績バッジ": "Badges", "{n} / {n} 達成": "{1} / {2} done",
    "はじめの一歩": "First step", "目標達成": "Goal reached", "3日連続": "3-day streak", "1週間連続": "7-day streak", "30日連続": "30-day streak", "週目標クリア": "Weekly goal", "4週連続": "4 weeks in a row",
    "メニュー完遂": "Menu complete", "通算1時間": "1 hour total", "通算10時間": "10 hours total", "通算50時間": "50 hours total", "Lv.5 到達": "Level 5", "10日練習": "10 days", "1日60分超": "60+ min day", "振り返り5回": "5 reflections",
    "{s} バッジ獲得：{s}": "{1} Badge earned: {2}",
    "自分で作る目標": "Custom goals", "まだ目標がありません。下から作成できます。": "No goals yet. Create one below.", "目標の名前（例：発表会の曲を通す）": "Goal name (e.g. play the recital piece through)",
    "通算": "Total", "連続日数": "Streak", "1日の練習": "Single day", "練習した日数": "Days practiced", "自分でチェック（手動達成）": "Manual check", "数値": "Value", "＋作成": "＋ Create",
    "達成したら自分でチェック": "Check it off yourself", "1日の練習が {n}分 に到達": "Practice {1} min in a single day", "練習した日が通算 {n} 日": "Practice on {1} days", "{n} 日連続で練習": "Practice {1} days in a row",
    "通算 {n}分 に到達": "Reach {1} min total", "達成済 ✓": "Done ✓", "達成にする": "Mark done", "{s} 達成：{s}": "{1} Done: {2}", "手動": "Manual", "連続": "Streak", "1日で": "In a day", "練習日数": "Days",
    // ---- 振り返り ----
    "振り返り": "Reflection", "好調": "Great", "まあまあ": "Okay", "ふつう": "So-so", "苦戦": "Tough",
    "✅ できたこと（例：Bbのロングトーンが±5¢に入った）": "✅ What went well (e.g. Bb long tone stayed within ±5¢)",
    "🎯 次の課題（例：Fの高音の音程を安定させる）": "🎯 Next step (e.g. steady the pitch of high F)", "📝 メモ（自由）": "📝 Notes",
    "どれか1つ書いてください": "Write at least one thing", "保存しました ✓": "Saved ✓", "練習 {n}分": "{1} min practiced", "できた": "Win", "次": "Next", "今日": "Today",
    "（項目なし）": "(no item)"
  };

  // ---- エンジン ----
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const exact = new Map(), patterns = [];
  for (const [k, v] of Object.entries(EN)) {
    if (!/\{[ns]\}/.test(k)) { exact.set(k, v); continue; }
    const parts = k.split(/(\{[ns]\})/);
    let re = "^";
    for (const p of parts) {
      if (p === "{n}") re += "([-+−]?[\\d.,:/]+)";
      else if (p === "{s}") re += "(.+?)";
      else re += esc(p);
    }
    patterns.push({ re: new RegExp(re + "$", "s"), tpl: v });
  }
  function translate(text) {
    const m = text.match(/^(\s*)(.*?)(\s*)$/s);
    const key = m[2]; if (!key) return null;
    let out = exact.get(key);
    if (out === undefined) {
      for (const p of patterns) {
        const g = key.match(p.re);
        if (g) { out = p.tpl.replace(/\{(\d+)\}/g, (_, i) => translate(g[+i]) ?? g[+i]); break; }
      }
    }
    return out === undefined ? null : m[1] + out + m[3];
  }

  const ATTRS = ["placeholder", "title", "aria-label"];
  const origText = new WeakMap(), origAttr = new WeakMap();
  let lang = "ja";
  function setText(n) {
    if (!origText.has(n)) origText.set(n, n.data);
    const src = origText.get(n);
    const want = lang === "en" ? (translate(src) ?? src) : src;
    if (n.data !== want) n.data = want;
  }
  function setAttrs(el) {
    let o = origAttr.get(el); if (!o) { o = {}; origAttr.set(el, o); }
    for (const a of ATTRS) {
      if (!el.hasAttribute(a)) continue;
      if (!(a in o)) o[a] = el.getAttribute(a);
      const want = lang === "en" ? (translate(o[a]) ?? o[a]) : o[a];
      if (el.getAttribute(a) !== want) el.setAttribute(a, want);
    }
  }
  function walk(node) {
    if (node.nodeType === 3) { setText(node); return; }
    if (node.nodeType !== 1 || node.tagName === "SCRIPT" || node.tagName === "STYLE") return;
    setAttrs(node);
    for (const c of node.childNodes) walk(c);
  }
  function apply() {
    document.documentElement.lang = lang;
    walk(document.body);
    const t = document.querySelector("title"); if (t) walk(t);
    const d = document.querySelector('meta[name="description"]'); if (d) { const o = d.dataset.ja || (d.dataset.ja = d.content); d.content = lang === "en" ? (translate(o) ?? o) : o; }
    const b = document.getElementById("langBtn"); if (b) b.textContent = lang === "en" ? "日本語" : "EN";
  }
  new MutationObserver(muts => {
    for (const m of muts) {
      if (m.type === "childList") m.addedNodes.forEach(walk);
      else if (m.type === "characterData") setText(m.target);
      else if (m.type === "attributes") setAttrs(m.target);
    }
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });

  // 言語の決定：保存値 → ブラウザ言語
  try { lang = localStorage.getItem("keyboard_lang") || (navigator.language && navigator.language.startsWith("ja") ? "ja" : "en"); } catch (_) {}
  if (lang !== "en") lang = "ja";
  window.KB_I18N = {
    get lang() { return lang; },
    set(l) { lang = l === "en" ? "en" : "ja"; try { localStorage.setItem("keyboard_lang", lang); } catch (_) {} apply(); },
    toggle() { this.set(lang === "en" ? "ja" : "en"); },
    t: text => (lang === "en" ? (translate(text) ?? text) : text)
  };
  if (document.body) apply(); else document.addEventListener("DOMContentLoaded", apply);
})();
