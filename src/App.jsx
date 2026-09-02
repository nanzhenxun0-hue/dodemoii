import React, { useState, useEffect, useRef, useCallback } from "react";
import { db } from "./firebase";
import {
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
  doc,
  setDoc,
  getDoc,
} from "firebase/firestore";

// ============ 定数 ============
const GAMES = {
  timing: {
    id: "timing",
    no: "第001号",
    name: "10秒ぴったり",
    kanji: "十秒審査",
    desc: "STARTを押した瞬間から時間が進む。ちょうど10秒だと思ったところでSTOPを押せ。",
    specialTitle: "10秒の亡者",
    lowerIsBetter: true,
  },
  tap: {
    id: "tap",
    no: "第002号",
    name: "画面中心を正確にタップ",
    kanji: "中心審査",
    desc: "画面のド真ん中を、目視だけで正確にタップせよ。誤差は容赦なく計測される。",
    specialTitle: "中心思想の持ち主",
    lowerIsBetter: true,
  },
  coin: {
    id: "coin",
    no: "第003号",
    name: "1円玉を何回連続で表にするか",
    kanji: "表裏審査",
    desc: "タップするたびに1円玉が舞う。表が続く限り連続記録が伸びる。裏が出たら即終了。",
    specialTitle: "表しか出さない者",
    lowerIsBetter: false,
  },
  power: {
    id: "power",
    no: "第004号",
    name: "ちょうどいい強さで押す",
    kanji: "力加減審査",
    desc: "ボタンを押し続けるとゲージが往復する。狙いの帯でちょうど離せ。",
    specialTitle: "力加減の求道者",
    lowerIsBetter: true,
  },
  janken: {
    id: "janken",
    no: "第005号",
    name: "じゃんけんで連勝する",
    kanji: "対戦審査",
    desc: "相手はランダムに手を出す。負けるまで何連勝できるか。",
    specialTitle: "じゃんけんの覇者",
    lowerIsBetter: false,
  },
  onechar: {
    id: "onechar",
    no: "第006号",
    name: "文字を1文字だけ入力する",
    kanji: "一文字審査",
    desc: "打ち始めた瞬間から入力内容は見えなくなり、3秒後に自動確定。ちょうど1文字を狙え。ただし審査官が勝手に手を加えることがある。",
    specialTitle: "一文字の求道者",
    lowerIsBetter: true,
  },
  timing_hidden: {
    id: "timing_hidden",
    no: "裏第001号",
    name: "裏・秒数ぴったり",
    kanji: "裏十秒審査",
    desc: "目標秒数は毎回ランダムに変わる。表示された秒数にどれだけ近づけるか。",
    specialTitle: "刻の異端者",
    lowerIsBetter: true,
    hidden: true,
  },
  tap_hidden: {
    id: "tap_hidden",
    no: "裏第002号",
    name: "裏・気まぐれタップ",
    kanji: "裏中心審査",
    desc: "狙うべき点は毎回勝手に動く。画面のどこであろうと正確に当てよ。",
    specialTitle: "気まぐれの支配者",
    lowerIsBetter: true,
    hidden: true,
  },
  stillness: {
    id: "stillness",
    no: "第007号",
    name: "微動だにしない審査",
    kanji: "静止審査",
    desc: "STARTを押したら、スマホに一切触れず完全に静止させよ。少しでも動くと即終了。",
    specialTitle: "静寂の求道者",
    lowerIsBetter: false,
  },
  opinion: {
    id: "opinion",
    no: "第008号",
    name: "二者択一の民意調査",
    kanji: "世論審査",
    desc: "どうでもいい質問に「はい」か「いいえ」で答えよ。少数派であるほど高く評価される。",
    specialTitle: "孤高の異端者",
    lowerIsBetter: true,
  },
  doubletap: {
    id: "doubletap",
    no: "第009号",
    name: "ダブルタップの間隔ぴったり",
    kanji: "連打審査",
    desc: "画面を2回タップし、その間隔をちょうど0.3秒に合わせよ。",
    specialTitle: "刹那の支配者",
    lowerIsBetter: true,
  },
  colormatch: {
    id: "colormatch",
    no: "第010号",
    name: "色の見分け",
    kanji: "色彩審査",
    desc: "一瞬だけ表示される色を記憶し、同じ色を4択から選べ。",
    specialTitle: "色彩の求道者",
    lowerIsBetter: true,
  },
  swipe: {
    id: "swipe",
    no: "第011号",
    name: "スワイプ距離ぴったり",
    kanji: "距離審査",
    desc: "指でなぞり、ちょうど100pxの距離で離せ。",
    specialTitle: "間合いの支配者",
    lowerIsBetter: true,
  },
  dualtap: {
    id: "dualtap",
    no: "第012号",
    name: "二本指同時押し",
    kanji: "同時審査",
    desc: "画面上の2点を、両手の指で寸分違わず同時にタップせよ。(スマホ専用)",
    specialTitle: "刹那の同期者",
    lowerIsBetter: true,
  },
};
const GAME_ORDER = [
  "timing",
  "tap",
  "coin",
  "power",
  "janken",
  "onechar",
  "stillness",
  "opinion",
  "doubletap",
  "colormatch",
  "swipe",
  "dualtap",
];

const TOTAL_POPULATION = 42193807;

// ============ 効果音・バイブ ============
let _audioCtx = null;
function getAudioCtx() {
  if (!_audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) _audioCtx = new Ctx();
  }
  if (_audioCtx && _audioCtx.state === "suspended") {
    _audioCtx.resume().catch(() => {});
  }
  return _audioCtx;
}
function beep(freq = 440, dur = 0.08, type = "sine", vol = 0.14) {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  } catch (e) {
    // 音が出せない環境は無視
  }
}
function vibrate(pattern) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch (e) {
    // 非対応は無視
  }
}
function playTap() {
  beep(620, 0.045, "square", 0.07);
}
function playStars(stars) {
  const base = 420;
  for (let i = 0; i < stars; i++) {
    setTimeout(() => beep(base + i * 95, 0.1, "sine", 0.13), i * 75);
  }
  vibrate(stars >= 4 ? [20, 40, 20, 40, 60] : [30]);
}
function playFail() {
  beep(170, 0.2, "sawtooth", 0.12);
  vibrate([15, 30, 15]);
}
function playStamp() {
  beep(85, 0.14, "square", 0.22);
  vibrate([40]);
}

function loadStars(rec) {
  return rec ? rec.bestStars || 0 : 0;
}

function computeTitles(records, totalPlays, streak = 0) {
  const titles = [];
  if (totalPlays >= 1) titles.push("見習い暇人");
  if (totalPlays >= 5) titles.push("暇人");
  if (totalPlays >= 15) titles.push("超暇人");
  if (totalPlays >= 40) titles.push("世界一暇な人");

  const anyThree = Object.values(records).some((r) => loadStars(r) >= 3);
  if (anyThree) titles.push("どうでもいい才能");

  let perfectCount = 0;
  Object.values(GAMES).forEach((g) => {
    const r = records[g.id];
    if (r && loadStars(r) >= 5) {
      titles.push(g.specialTitle);
      if (!g.hidden) perfectCount++;
    }
  });

  const allThree = Object.values(GAMES)
    .filter((g) => !g.hidden)
    .every((g) => records[g.id] && loadStars(records[g.id]) >= 3);
  if (allThree) titles.push("何をしているんだ君は");

  if (perfectCount >= 3 && totalPlays >= 20) {
    titles.push("👑 世界一どうでもいい人間");
  }

  if (streak >= 3) titles.push("3日坊主卒業");
  if (streak >= 7) titles.push("週刊どうでもいい人");
  if (streak >= 30) titles.push("月刊どうでもいい人");
  if (streak >= 100) titles.push("👑 どうでもいいを生きる者");

  return Array.from(new Set(titles));
}

// ============ 日付ユーティリティ ============
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}
function dateKeyFromTimestamp(ts) {
  const d = ts && ts.toDate ? ts.toDate() : new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function starsToRank(stars, jitterSeed) {
  // stars: 1-5 -> better stars = smaller (better) rank
  const ratio = (6 - stars) / 5; // 1(best) .. 1(worst)=1
  const base = Math.max(1, Math.floor(TOTAL_POPULATION * ratio * ratio));
  const jitter = Math.floor((jitterSeed % 1000) - 500);
  return Math.max(1, base + jitter);
}

function comment(stars) {
  if (stars >= 5) return "……才能の無駄遣いだ。";
  if (stars === 4) return "惜しい。人生をもう少し賭けよう。";
  if (stars === 3) return "凡人の極み。";
  if (stars === 2) return "まだ極まっていない。";
  return "それはただの偶然だ。";
}

// ============ 挑戦状(URL共有)機能 ============
function encodeChallenge(obj) {
  try {
    const json = JSON.stringify(obj);
    const b64 = btoa(unescape(encodeURIComponent(json)));
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  } catch (e) {
    return null;
  }
}
function decodeChallenge(str) {
  try {
    let b64 = str.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const json = decodeURIComponent(escape(atob(b64)));
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}
function judgeChallenge(game, myRaw, oppRaw) {
  if (myRaw === oppRaw) return "draw";
  const iWin = game.lowerIsBetter ? myRaw < oppRaw : myRaw > oppRaw;
  return iWin ? "win" : "lose";
}
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch (e2) {
      return false;
    }
  }
}

// ============ オンライン世界ランキング(Firestore) ============
async function submitToLeaderboard(gameId, result, nickname) {
  try {
    const payload = {
      statValue: result.statValue,
      stars: result.stars,
      rawValue: result.rawValue,
      createdAt: serverTimestamp(),
    };
    if (nickname) payload.nickname = nickname.slice(0, 20);
    await addDoc(collection(db, "leaderboard_" + gameId), payload);
  } catch (e) {
    // オフライン・未設定時は静かに諦める(ローカル記録は残る)
  }
}

// ============ プレイヤープロフィール(ニックネーム・引き継ぎ) ============
function genUserId() {
  return String(Math.floor(10000000 + Math.random() * 89999999));
}
async function syncProfileToCloud(userId, data) {
  try {
    await setDoc(
      doc(db, "players", userId),
      { ...data, updatedAt: serverTimestamp() },
      { merge: true }
    );
  } catch (e) {
    // オフライン等は静かに諦める(ローカルには残っている)
  }
}
async function fetchProfileFromCloud(userId) {
  const snap = await getDoc(doc(db, "players", userId));
  return snap.exists() ? snap.data() : null;
}

async function fetchLeaderboard(gameId, lowerIsBetter, mode = "all") {
  if (mode === "today") {
    const q = query(
      collection(db, "leaderboard_" + gameId),
      orderBy("createdAt", "desc"),
      limit(150)
    );
    const snap = await getDocs(q);
    const today = todayKey();
    const rows = snap.docs
      .map((d) => d.data())
      .filter((r) => r.createdAt && dateKeyFromTimestamp(r.createdAt) === today);
    rows.sort((a, b) => (lowerIsBetter ? a.rawValue - b.rawValue : b.rawValue - a.rawValue));
    return rows.slice(0, 20);
  }
  const q = query(
    collection(db, "leaderboard_" + gameId),
    orderBy("rawValue", lowerIsBetter ? "asc" : "desc"),
    limit(20)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data());
}

function serialNumber() {
  const d = new Date();
  return `第${d.getFullYear()}-${String(
    Math.floor(Math.random() * 999999)
  ).padStart(6, "0")}号`;
}

// ============ 認定証の画像化・シェア ============
async function generateCertificateImage({ game, stars, statLabel, statValue, rank, serial }) {
  const canvas = document.createElement("canvas");
  canvas.width = 750;
  canvas.height = 1000;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#f3ecd9";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#c7b98d";
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, canvas.width - 48, canvas.height - 48);

  try {
    await Promise.all([
      document.fonts.load("700 40px 'Shippori Mincho'"),
      document.fonts.load("400 24px 'Zen Kaku Gothic New'"),
      document.fonts.load("700 50px 'JetBrains Mono'"),
    ]);
  } catch (e) {
    // フォント読み込み失敗時はフォールバックで描画
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "#8a7a4d";
  ctx.font = "22px 'Zen Kaku Gothic New', sans-serif";
  ctx.fillText("世界どうでもいい記録機構", canvas.width / 2, 110);

  ctx.fillStyle = "#241f16";
  ctx.font = "700 54px 'Shippori Mincho', serif";
  ctx.fillText("認 定 証", canvas.width / 2, 195);

  ctx.font = "26px 'Zen Kaku Gothic New', sans-serif";
  ctx.fillStyle = "#4a4230";
  ctx.fillText(`${game.kanji}「${game.name}」`, canvas.width / 2, 255);

  ctx.font = "700 58px 'JetBrains Mono', monospace";
  ctx.fillStyle = "#1a1712";
  ctx.fillText(statValue, canvas.width / 2, 365);

  ctx.font = "22px 'Zen Kaku Gothic New', sans-serif";
  ctx.fillStyle = "#8a7a4d";
  ctx.fillText(statLabel, canvas.width / 2, 400);

  ctx.font = "48px serif";
  ctx.fillStyle = "#c9a227";
  ctx.fillText("★".repeat(stars) + "☆".repeat(5 - stars), canvas.width / 2, 475);

  ctx.font = "22px 'Zen Kaku Gothic New', sans-serif";
  ctx.fillStyle = "#6b6046";
  ctx.fillText(`極め度 ${stars} / 5`, canvas.width / 2, 512);

  ctx.font = "26px 'JetBrains Mono', monospace";
  ctx.fillStyle = "#5a5138";
  ctx.fillText(`世界ランキング ${rank.toLocaleString()} 位`, canvas.width / 2, 572);
  ctx.font = "18px 'JetBrains Mono', monospace";
  ctx.fillStyle = "#a89a68";
  ctx.fillText(`/ ${TOTAL_POPULATION.toLocaleString()}人中`, canvas.width / 2, 602);

  ctx.font = "italic 24px 'Zen Kaku Gothic New', sans-serif";
  ctx.fillStyle = "#4a4230";
  ctx.fillText(comment(stars), canvas.width / 2, 665);

  ctx.font = "16px 'JetBrains Mono', monospace";
  ctx.fillStyle = "#a89a68";
  ctx.fillText(`登録番号 ${serial}`, canvas.width / 2, 910);

  ctx.save();
  ctx.translate(canvas.width - 160, canvas.height - 220);
  ctx.rotate((-14 * Math.PI) / 180);
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.arc(0, 0, 80, 0, Math.PI * 2);
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#a83232";
  ctx.stroke();
  ctx.fillStyle = "#a83232";
  ctx.font = "700 30px 'Shippori Mincho', serif";
  ctx.fillText("審査", 0, -6);
  ctx.fillText("済", 0, 32);
  ctx.restore();

  ctx.textAlign = "left";
  ctx.font = "12px 'Zen Kaku Gothic New', sans-serif";
  ctx.fillStyle = "#a89a68";
  ctx.fillText("世界一どうでもいいことを極める。", 40, canvas.height - 40);

  return canvas;
}

async function shareCertificateImage(canvas) {
  return new Promise((resolve) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        resolve(false);
        return;
      }
      try {
        const file = new File([blob], "dodemoii-certificate.png", { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: "認定証",
            text: "世界一どうでもいいことを極める。",
          });
          resolve(true);
          return;
        }
      } catch (e) {
        // 共有キャンセル等は無視してダウンロードにフォールバックしない
        resolve(false);
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "dodemoii-certificate.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      resolve(true);
    }, "image/png");
  });
}

// ============ 認定証(結果)オーバーレイ ============
// ============ 紙吹雪演出(★4以上) ============
const CONFETTI_COLORS = ["#c9a227", "#b8342a", "#8a7a4d", "#2e7d4f", "#e8e6df"];
function Confetti({ count = 26 }) {
  const pieces = useState(() =>
    Array.from({ length: count }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.4,
      duration: 1.6 + Math.random() * 1.2,
      size: 5 + Math.random() * 5,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      rotate: Math.random() * 360,
    }))
  )[0];
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 60, overflow: "hidden" }}>
      {pieces.map((p) => (
        <div
          key={p.id}
          style={{
            position: "absolute",
            left: `${p.left}%`,
            top: 0,
            width: p.size,
            height: p.size * 1.6,
            background: p.color,
            transform: `rotate(${p.rotate}deg)`,
            animation: `confettiFall ${p.duration}s ease-in ${p.delay}s forwards`,
            borderRadius: 1,
          }}
        />
      ))}
    </div>
  );
}

function Certificate({ game, stars, statLabel, statValue, rawValue, rank, onClose, isNewBest, opponent, outcome }) {
  const [serial] = useState(serialNumber());
  const [stamped, setStamped] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [challengeCopied, setChallengeCopied] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setStamped(true);
      playStamp();
    }, 350);
    return () => clearTimeout(t);
  }, []);

  const handleShare = async () => {
    if (sharing) return;
    playTap();
    setSharing(true);
    try {
      const canvas = await generateCertificateImage({
        game,
        stars,
        statLabel,
        statValue,
        rank,
        serial,
      });
      await shareCertificateImage(canvas);
    } catch (e) {
      // 生成・共有失敗は静かに諦める
    }
    setSharing(false);
  };

  const handleMakeChallenge = async () => {
    playTap();
    const code = encodeChallenge({ g: game.id, s: stars, v: statValue, r: rawValue });
    const url = `${window.location.origin}${window.location.pathname}?c=${code}`;
    const text = `「${game.name}」で ${statValue}(★${stars})を叩き出した。挑戦できるか？\n${url}`;
    const ok = await copyText(text);
    if (ok) {
      setChallengeCopied(true);
      vibrate([20]);
      setTimeout(() => setChallengeCopied(false), 2200);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,12,16,0.86)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: 18,
        backdropFilter: "blur(2px)",
      }}
    >
      {stars >= 4 && <Confetti count={stars === 5 ? 34 : 22} />}
      <div
        style={{
          width: "100%",
          maxWidth: 380,
          background: "#f3ecd9",
          color: "#241f16",
          borderRadius: 4,
          padding: "26px 22px 20px",
          position: "relative",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
          border: "1px solid #d8cba8",
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(0,0,0,0.015) 0px, transparent 1px, transparent 2px)",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            right: 8,
            bottom: 8,
            border: "1px solid #c7b98d",
            pointerEvents: "none",
          }}
        />
        <div style={{ textAlign: "center", fontFamily: "'Zen Kaku Gothic New', sans-serif" }}>
          <div style={{ fontSize: 11, letterSpacing: 3, color: "#8a7a4d" }}>
            世界どうでもいい記録機構
          </div>
          <div
            style={{
              fontFamily: "'Shippori Mincho', serif",
              fontSize: 24,
              fontWeight: 700,
              marginTop: 10,
              letterSpacing: 2,
            }}
          >
            認 定 証
          </div>
          <div style={{ fontSize: 12, marginTop: 14, color: "#4a4230" }}>
            {game.kanji}「{game.name}」
          </div>

          <div
            style={{
              marginTop: 16,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 28,
              fontWeight: 700,
              color: "#1a1712",
            }}
            className={stars >= 5 ? "glow-pulse" : undefined}
          >
            {statValue}
          </div>
          <div style={{ fontSize: 11, color: "#8a7a4d", marginTop: 2 }}>{statLabel}</div>

          <div style={{ marginTop: 14, fontSize: 22, letterSpacing: 3 }}>
            {"★".repeat(stars)}
            <span style={{ color: "#d8cba8" }}>{"★".repeat(5 - stars)}</span>
          </div>
          <div style={{ fontSize: 11, color: "#6b6046", marginTop: 4 }}>
            極め度 {stars} / 5
          </div>

          <div
            style={{
              marginTop: 14,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 13,
              color: "#5a5138",
            }}
          >
            世界ランキング {rank.toLocaleString()} 位
            <span style={{ color: "#a89a68" }}> / {TOTAL_POPULATION.toLocaleString()}人中</span>
          </div>
          {isNewBest && (
            <div style={{ fontSize: 11, color: "#a83232", marginTop: 4, fontWeight: 700 }}>
              自己記録更新
            </div>
          )}

          {opponent && (
            <div
              style={{
                marginTop: 14,
                padding: "10px 14px",
                border: "1px dashed #a89a68",
                borderRadius: 3,
              }}
            >
              <div style={{ fontSize: 10, color: "#8a7a4d", letterSpacing: 2 }}>VS 挑戦者の記録</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 15, marginTop: 3 }}>
                {opponent.v}
                <span style={{ color: "#c9a227", marginLeft: 6 }}>{"★".repeat(opponent.s)}</span>
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontFamily: "'Shippori Mincho', serif",
                  fontSize: 18,
                  fontWeight: 700,
                  color:
                    outcome === "win" ? "#2e7d4f" : outcome === "lose" ? "#a83232" : "#8a7a4d",
                }}
              >
                {outcome === "win" ? "勝 利" : outcome === "lose" ? "敗 北" : "引き分け"}
              </div>
            </div>
          )}

          <div style={{ fontSize: 12, marginTop: 14, color: "#4a4230", fontStyle: "italic" }}>
            {comment(stars)}
          </div>

          <div style={{ fontSize: 9, color: "#a89a68", marginTop: 18 }}>
            登録番号 {serial}
          </div>
        </div>

        {/* 判子 */}
        <div
          style={{
            position: "absolute",
            right: 14,
            bottom: 44,
            width: 74,
            height: 74,
            borderRadius: "50%",
            border: "3px solid #a83232",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#a83232",
            fontFamily: "'Shippori Mincho', serif",
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: 1,
            transform: stamped
              ? "rotate(-14deg) scale(1)"
              : "rotate(-14deg) scale(2.6)",
            opacity: stamped ? 0.85 : 0,
            transition: "all 0.35s cubic-bezier(.2,1.4,.4,1)",
            textAlign: "center",
            lineHeight: 1.3,
            mixBlendMode: "multiply",
          }}
        >
          審査
          <br />
          済
        </div>

        <button
          onClick={handleMakeChallenge}
          style={{
            marginTop: 20,
            width: "100%",
            padding: "12px 0",
            background: challengeCopied ? "#2e7d4f" : "#b8342a",
            color: "#f3ecd9",
            border: "none",
            borderRadius: 2,
            fontSize: 13,
            letterSpacing: 2,
            fontFamily: "'Zen Kaku Gothic New', sans-serif",
            cursor: "pointer",
            transition: "background 0.2s",
          }}
        >
          {challengeCopied ? "コピーしました！送ろう" : "この記録で挑戦状を作る"}
        </button>

        <button
          onClick={handleShare}
          disabled={sharing}
          style={{
            marginTop: 10,
            width: "100%",
            padding: "12px 0",
            background: "transparent",
            color: "#241f16",
            border: "1px solid #241f16",
            borderRadius: 2,
            fontSize: 13,
            letterSpacing: 2,
            fontFamily: "'Zen Kaku Gothic New', sans-serif",
            cursor: "pointer",
          }}
        >
          {sharing ? "画像を生成中……" : "画像として保存・共有"}
        </button>

        <button
          onClick={onClose}
          style={{
            marginTop: 10,
            width: "100%",
            padding: "12px 0",
            background: "#241f16",
            color: "#f3ecd9",
            border: "none",
            borderRadius: 2,
            fontSize: 13,
            letterSpacing: 2,
            fontFamily: "'Zen Kaku Gothic New', sans-serif",
            cursor: "pointer",
          }}
        >
          審査台帳へ戻る
        </button>
      </div>
    </div>
  );
}

// ============ ミニゲーム: 10秒ぴったり(裏審査では目標可変) ============
function TimingGame({ onFinish, target = 10, showTarget = false }) {
  const [phase, setPhase] = useState("idle"); // idle, running, done
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(0);
  const rafRef = useRef(null);

  const tick = useCallback(() => {
    setElapsed((performance.now() - startRef.current) / 1000);
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const start = () => {
    playTap();
    startRef.current = performance.now();
    setPhase("running");
    rafRef.current = requestAnimationFrame(tick);
  };

  const stop = () => {
    playTap();
    cancelAnimationFrame(rafRef.current);
    const final = (performance.now() - startRef.current) / 1000;
    setElapsed(final);
    setPhase("done");
    const error = Math.abs(final - target);
    let stars = 1;
    if (error < 0.01) stars = 5;
    else if (error < 0.05) stars = 4;
    else if (error < 0.2) stars = 3;
    else if (error < 0.5) stars = 2;
    onFinish({
      stars,
      statLabel: "計測誤差",
      statValue: `${final.toFixed(3)}秒 (誤差 ${error.toFixed(3)}秒)`,
      rawValue: error,
    });
  };

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const near = phase === "running" && Math.abs(elapsed - target) < 0.5;

  return (
    <div style={{ textAlign: "center" }}>
      {showTarget && (
        <div style={{ fontSize: 13, color: "#c9a227", marginTop: 16 }}>
          目標: {target.toFixed(3)}秒
        </div>
      )}
      <div
        className={near ? "glow-pulse" : undefined}
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 56,
          margin: "20px 0 30px",
          color: phase === "running" ? (near ? "#c9a227" : "#e8e6df") : "#6b6a63",
          transition: "color 0.2s ease",
        }}
      >
        {phase === "idle" ? "--.---" : elapsed.toFixed(3)}
      </div>
      {phase !== "done" ? (
        <button
          onClick={phase === "idle" ? start : stop}
          style={btnStyle(phase === "idle" ? "#b8342a" : "#c9a227")}
        >
          {phase === "idle" ? "START" : "STOP"}
        </button>
      ) : null}
    </div>
  );
}

// ============ ミニゲーム: 画面中心タップ(裏審査では狙う点が可変) ============
function TapCenterGame({ onFinish, targetRatio = { x: 0.5, y: 0.5 } }) {
  const areaRef = useRef(null);
  const [mark, setMark] = useState(null);

  const handleTap = (e) => {
    if (mark) return;
    playTap();
    const rect = areaRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = rect.width * targetRatio.x;
    const cy = rect.height * targetRatio.y;
    const dist = Math.hypot(x - cx, y - cy);
    const maxDist = Math.hypot(rect.width, rect.height);
    const ratio = dist / maxDist;
    let stars = 1;
    if (ratio < 0.01) stars = 5;
    else if (ratio < 0.03) stars = 4;
    else if (ratio < 0.08) stars = 3;
    else if (ratio < 0.18) stars = 2;
    setMark({ x, y });
    setTimeout(() => {
      onFinish({
        stars,
        statLabel: "目標点からの誤差",
        statValue: `${dist.toFixed(1)}px`,
        rawValue: dist,
      });
    }, 500);
  };

  return (
    <div
      ref={areaRef}
      onClick={handleTap}
      style={{
        position: "relative",
        width: "100%",
        height: 320,
        background:
          "radial-gradient(circle, rgba(184,52,42,0.08) 0%, transparent 60%)",
        border: "1px dashed #3a3d45",
        marginTop: 16,
        cursor: "crosshair",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: `${targetRatio.x * 100}%`,
          top: `${targetRatio.y * 100}%`,
          width: 8,
          height: 8,
          background: "#b8342a",
          borderRadius: "50%",
          transform: "translate(-50%,-50%)",
        }}
      />
      {mark && (
        <>
          <div
            className="ripple-effect"
            style={{
              position: "absolute",
              left: mark.x,
              top: mark.y,
              width: 40,
              height: 40,
              border: "2px solid #c9a227",
              borderRadius: "50%",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: mark.x,
              top: mark.y,
              width: 14,
              height: 14,
              border: "2px solid #c9a227",
              borderRadius: "50%",
              transform: "translate(-50%,-50%)",
            }}
          />
        </>
      )}
      {!mark && (
        <div
          style={{
            position: "absolute",
            bottom: 14,
            width: "100%",
            textAlign: "center",
            fontSize: 12,
            color: "#6b6a63",
          }}
        >
          この枠内のどこでもいいのでタップせよ
        </div>
      )}
    </div>
  );
}

// ============ ミニゲーム: 1円玉連続表 ============
function CoinGame({ onFinish }) {
  const [streak, setStreak] = useState(0);
  const [face, setFace] = useState(null); // "表" | "裏" | null
  const [flipping, setFlipping] = useState(false);
  const [ended, setEnded] = useState(false);

  const flip = () => {
    if (flipping || ended) return;
    playTap();
    setFlipping(true);
    setTimeout(() => {
      const result = Math.random() < 0.5 ? "表" : "裏";
      setFace(result);
      setFlipping(false);
      if (result === "表") {
        setStreak((s) => s + 1);
      } else {
        setEnded(true);
        const finalStreak = streak;
        let stars = 1;
        if (finalStreak >= 6) stars = 5;
        else if (finalStreak === 5) stars = 4;
        else if (finalStreak >= 3) stars = 3;
        else if (finalStreak >= 1) stars = 2;
        setTimeout(() => {
          onFinish({
            stars,
            statLabel: "連続表回数",
            statValue: `${finalStreak}回`,
            rawValue: finalStreak,
          });
        }, 700);
      }
    }, 500);
  };

  return (
    <div style={{ textAlign: "center", marginTop: 20 }}>
      <div
        style={{
          width: 90,
          height: 90,
          margin: "0 auto",
          borderRadius: "50%",
          background: "linear-gradient(145deg,#c9a227,#8a6f1a)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 26,
          fontFamily: "'Shippori Mincho', serif",
          color: "#241f16",
          transform: flipping ? "rotateY(360deg) scale(1.1)" : "rotateY(0)",
          transition: "transform 0.5s",
          boxShadow: "0 6px 16px rgba(0,0,0,0.4)",
        }}
      >
        {flipping ? "" : face || "1円"}
      </div>
      <div
        style={{
          marginTop: 18,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 28,
          color: "#e8e6df",
        }}
      >
        {streak}
        <span style={{ fontSize: 13, color: "#6b6a63" }}> 連続表</span>
      </div>
      {!ended && (
        <button onClick={flip} disabled={flipping} style={btnStyle("#b8342a")}>
          {flipping ? "……" : "投げる"}
        </button>
      )}
      {ended && (
        <div style={{ marginTop: 14, fontSize: 13, color: "#a83232" }}>
          裏が出た。審査終了。
        </div>
      )}
    </div>
  );
}

// ============ ミニゲーム: ちょうどいい強さで押す ============
function triangleWave(t, period) {
  const x = (t % period) / period;
  return x < 0.5 ? x * 200 : (1 - x) * 200;
}

function PowerPressGame({ onFinish }) {
  const [target] = useState(() => {
    const center = 15 + Math.random() * 70;
    return { center, half: 7 };
  });
  const [pressing, setPressing] = useState(false);
  const [value, setValue] = useState(0);
  const [done, setDone] = useState(false);
  const [resultVal, setResultVal] = useState(null);
  const startRef = useRef(0);
  const rafRef = useRef(null);

  const tick = useCallback(() => {
    const v = triangleWave(performance.now() - startRef.current, 1400);
    setValue(v);
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const press = () => {
    if (done) return;
    playTap();
    startRef.current = performance.now();
    setPressing(true);
    rafRef.current = requestAnimationFrame(tick);
  };

  const release = () => {
    if (done || !pressing) return;
    cancelAnimationFrame(rafRef.current);
    setPressing(false);
    setDone(true);
    setResultVal(value);
    const dist = Math.abs(value - target.center);
    let stars = 1;
    if (dist < 1) stars = 5;
    else if (dist < 2.5) stars = 4;
    else if (dist < 5) stars = 3;
    else if (dist < 9) stars = 2;
    onFinish({
      stars,
      statLabel: "目標帯からのズレ",
      statValue: `${dist.toFixed(1)}pt`,
      rawValue: dist,
    });
  };

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  return (
    <div style={{ textAlign: "center", marginTop: 24 }}>
      <div
        style={{
          position: "relative",
          height: 26,
          borderRadius: 4,
          background: "#20232a",
          overflow: "hidden",
          border: "1px solid #2a2d34",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: `${target.center - target.half}%`,
            width: `${target.half * 2}%`,
            top: 0,
            bottom: 0,
            background: "rgba(201,162,39,0.35)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: `${done ? resultVal : value}%`,
            top: 0,
            bottom: 0,
            width: 3,
            background: done ? "#b8342a" : "#e8e6df",
            transform: "translateX(-50%)",
          }}
        />
      </div>
      <div style={{ fontSize: 11, color: "#6b6a63", marginTop: 8 }}>
        黄色い帯を狙って離す
      </div>
      <button
        onMouseDown={press}
        onTouchStart={press}
        onMouseUp={release}
        onTouchEnd={release}
        disabled={done}
        style={btnStyle(pressing ? "#c9a227" : "#b8342a")}
      >
        {done ? "審査終了" : "押し続ける"}
      </button>
    </div>
  );
}

// ============ ミニゲーム: じゃんけん連勝 ============
const HANDS = ["グー", "チョキ", "パー"];
function judge(player, cpu) {
  if (player === cpu) return "draw";
  if (
    (player === "グー" && cpu === "チョキ") ||
    (player === "チョキ" && cpu === "パー") ||
    (player === "パー" && cpu === "グー")
  )
    return "win";
  return "lose";
}

function JankenGame({ onFinish }) {
  const [streak, setStreak] = useState(0);
  const [lastRound, setLastRound] = useState(null);
  const [ended, setEnded] = useState(false);

  const play = (hand) => {
    if (ended) return;
    playTap();
    const cpu = HANDS[Math.floor(Math.random() * 3)];
    const result = judge(hand, cpu);
    setLastRound({ hand, cpu, result });
    if (result === "win") {
      setStreak((s) => s + 1);
    } else if (result === "lose") {
      setEnded(true);
      const finalStreak = streak;
      let stars = 1;
      if (finalStreak >= 4) stars = 5;
      else if (finalStreak === 3) stars = 4;
      else if (finalStreak === 2) stars = 3;
      else if (finalStreak === 1) stars = 2;
      setTimeout(() => {
        onFinish({
          stars,
          statLabel: "連勝数",
          statValue: `${finalStreak}連勝`,
          rawValue: finalStreak,
        });
      }, 700);
    }
    // draw の場合は続行(streakそのまま)
  };

  return (
    <div style={{ textAlign: "center", marginTop: 20 }}>
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 26,
          color: "#e8e6df",
        }}
      >
        {streak}
        <span style={{ fontSize: 12, color: "#6b6a63" }}> 連勝中</span>
      </div>
      {lastRound && (
        <div style={{ fontSize: 12, color: "#8a8f9a", marginTop: 8 }}>
          あなた:{lastRound.hand} ／ 相手:{lastRound.cpu} ／{" "}
          {lastRound.result === "win"
            ? "勝ち"
            : lastRound.result === "lose"
            ? "負け"
            : "あいこ"}
        </div>
      )}
      {!ended ? (
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 20 }}>
          {HANDS.map((h) => (
            <button key={h} onClick={() => play(h)} style={{ ...btnStyle("#20232a"), marginTop: 0, padding: "14px 18px", fontSize: 13 }}>
              {h}
            </button>
          ))}
        </div>
      ) : (
        <div style={{ marginTop: 14, fontSize: 13, color: "#a83232" }}>敗北。審査終了。</div>
      )}
    </div>
  );
}

// ============ ミニゲーム: 一文字だけ入力 ============
const INTERFERENCE_CHARS = "あかさたなはまやらんアイウエオ・×";

// ============ ミニゲーム: 微動だにしない審査 ============
function StillnessGame({ onFinish }) {
  const [phase, setPhase] = useState("idle"); // idle, running, done, unsupported
  const [elapsed, setElapsed] = useState(0);
  const [errorMsg, setErrorMsg] = useState(null);
  const startRef = useRef(0);
  const baselineRef = useRef(null);
  const rafRef = useRef(null);
  const doneRef = useRef(false);
  const capTimerRef = useRef(null);
  const CAP = 15; // 15秒で満点キャップ
  const THRESHOLD = 0.7;

  const cleanup = () => {
    window.removeEventListener("devicemotion", handleMotion);
    cancelAnimationFrame(rafRef.current);
    clearTimeout(capTimerRef.current);
  };

  const finalize = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    cleanup();
    playTap();
    const duration = Math.min(CAP, (performance.now() - startRef.current) / 1000);
    setElapsed(duration);
    setPhase("done");
    let stars = 1;
    if (duration >= CAP) stars = 5;
    else if (duration >= 10) stars = 4;
    else if (duration >= 6) stars = 3;
    else if (duration >= 3) stars = 2;
    onFinish({
      stars,
      statLabel: "静止できた時間",
      statValue: `${duration.toFixed(2)}秒`,
      rawValue: duration,
    });
  };

  const handleMotion = useCallback((e) => {
    const acc = e.acceleration && e.acceleration.x !== null ? e.acceleration : e.accelerationIncludingGravity;
    if (!acc) return;
    const mag = Math.sqrt((acc.x || 0) ** 2 + (acc.y || 0) ** 2 + (acc.z || 0) ** 2);
    if (baselineRef.current === null) {
      baselineRef.current = mag;
      return;
    }
    if (Math.abs(mag - baselineRef.current) > THRESHOLD) {
      finalize();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async () => {
    playTap();
    setErrorMsg(null);
    if (
      typeof DeviceMotionEvent !== "undefined" &&
      typeof DeviceMotionEvent.requestPermission === "function"
    ) {
      try {
        const res = await DeviceMotionEvent.requestPermission();
        if (res !== "granted") {
          setErrorMsg("センサーの使用が許可されませんでした。");
          return;
        }
      } catch (e) {
        setErrorMsg("このブラウザではセンサーが使えないようです。");
        return;
      }
    }
    doneRef.current = false;
    baselineRef.current = null;
    startRef.current = performance.now();
    setPhase("running");
    window.addEventListener("devicemotion", handleMotion);
    const tick = () => {
      if (doneRef.current) return;
      setElapsed(Math.min(CAP, (performance.now() - startRef.current) / 1000));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    capTimerRef.current = setTimeout(finalize, CAP * 1000);
  };

  useEffect(() => cleanup, []);

  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 56,
          margin: "30px 0 20px",
          color: phase === "running" ? "#e8e6df" : "#6b6a63",
        }}
      >
        {phase === "idle" ? "--.--" : elapsed.toFixed(2)}
      </div>
      {phase === "running" && (
        <div style={{ fontSize: 12, color: "#c9a227" }}>触れずに、動かさずに……</div>
      )}
      {errorMsg && (
        <div style={{ fontSize: 12, color: "#a83232", marginTop: 10 }}>{errorMsg}</div>
      )}
      {phase !== "done" && (
        <button onClick={start} disabled={phase === "running"} style={btnStyle("#b8342a")}>
          {phase === "running" ? "計測中……" : "START"}
        </button>
      )}
    </div>
  );
}

// ============ ミニゲーム: 二者択一の民意調査 ============
const OPINION_QUESTIONS = [
  "カレーにフルーツを入れるのはアリ",
  "エスカレーターでは歩かず立ち止まるべき",
  "パイナップルはピザに合う",
  "猫舌は克服すべき",
  "靴下は左右で違う柄でも気にしない",
  "電話よりテキストメッセージ派",
  "朝風呂より夜風呂",
  "餃子は主食になり得る",
  "エレベーターの閉ボタンは連打する",
  "目玉焼きには醤油よりソース",
];
function OpinionGame({ onFinish }) {
  const [question] = useState(
    () => OPINION_QUESTIONS[Math.floor(Math.random() * OPINION_QUESTIONS.length)]
  );
  const [answered, setAnswered] = useState(false);
  const [result, setResult] = useState(null);

  const answer = (yes) => {
    if (answered) return;
    playTap();
    const yesPct = 10 + Math.floor(Math.random() * 81); // 10〜90
    const chosenPct = yes ? yesPct : 100 - yesPct;
    setAnswered(true);
    setResult({ yes, chosenPct });
    let stars = 1;
    if (chosenPct < 15) stars = 5;
    else if (chosenPct < 30) stars = 4;
    else if (chosenPct < 50) stars = 3;
    else if (chosenPct < 70) stars = 2;
    setTimeout(() => {
      onFinish({
        stars,
        statLabel: "同じ回答をした人の割合",
        statValue: `${chosenPct}%`,
        rawValue: chosenPct,
      });
    }, 900);
  };

  return (
    <div style={{ textAlign: "center", marginTop: 20 }}>
      <div
        style={{
          fontFamily: "'Zen Kaku Gothic New', sans-serif",
          fontSize: 16,
          lineHeight: 1.7,
          padding: "0 8px",
        }}
      >
        「{question}」
      </div>
      {!answered ? (
        <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 24 }}>
          <button onClick={() => answer(true)} style={{ ...btnStyle("#20232a"), padding: "14px 30px" }}>
            はい
          </button>
          <button onClick={() => answer(false)} style={{ ...btnStyle("#20232a"), padding: "14px 30px" }}>
            いいえ
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 13, color: "#8a8f9a" }}>
            あなたの回答:{result.yes ? "はい" : "いいえ"}
          </div>
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 28,
              color: "#c9a227",
              marginTop: 8,
            }}
          >
            {result.chosenPct}%
          </div>
          <div style={{ fontSize: 11, color: "#6b6a63", marginTop: 4 }}>が同じ回答</div>
        </div>
      )}
    </div>
  );
}

// ============ ミニゲーム: ダブルタップの間隔ぴったり ============
function DoubleTapGame({ onFinish }) {
  const TARGET = 0.3;
  const [tapCount, setTapCount] = useState(0);
  const [done, setDone] = useState(false);
  const firstTapRef = useRef(0);

  const handleTap = () => {
    if (done) return;
    playTap();
    if (tapCount === 0) {
      firstTapRef.current = performance.now();
      setTapCount(1);
      return;
    }
    const diff = (performance.now() - firstTapRef.current) / 1000;
    const err = Math.abs(diff - TARGET);
    let stars = 1;
    if (err < 0.02) stars = 5;
    else if (err < 0.05) stars = 4;
    else if (err < 0.1) stars = 3;
    else if (err < 0.2) stars = 2;
    setDone(true);
    setTapCount(2);
    onFinish({
      stars,
      statLabel: "タップ間隔誤差",
      statValue: `${diff.toFixed(3)}秒 (誤差 ${err.toFixed(3)}秒)`,
      rawValue: err,
    });
  };

  return (
    <div style={{ textAlign: "center", marginTop: 30 }}>
      <div style={{ fontSize: 13, color: "#8a8f9a", marginBottom: 20 }}>
        {tapCount === 0 && "1回目をタップ"}
        {tapCount === 1 && "0.3秒後に2回目をタップ……"}
        {tapCount === 2 && "審査終了"}
      </div>
      <button onClick={handleTap} disabled={done} style={{ ...btnStyle("#b8342a"), width: "60%" }}>
        {tapCount === 0 ? "1回目" : tapCount === 1 ? "2回目" : "終了"}
      </button>
    </div>
  );
}

// ============ ミニゲーム: 色の見分け ============
function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x) =>
    Math.round(255 * x)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}
function colorDistance(hex1, hex2) {
  const p = (h) => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
  const [r1, g1, b1] = p(hex1);
  const [r2, g2, b2] = p(hex2);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}
function ColorMatchGame({ onFinish }) {
  const [phase, setPhase] = useState("show"); // show, choose, done
  const [swatches, setSwatches] = useState(null);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [targetHex, setTargetHex] = useState("#888888");
  const [picked, setPicked] = useState(null);

  useEffect(() => {
    const h = Math.random() * 360;
    const s = 50 + Math.random() * 25;
    const l = 42 + Math.random() * 14;
    const target = hslToHex(h, s, l);
    const perturb = (dh, dl) => hslToHex((h + dh + 360) % 360, s, Math.min(85, Math.max(15, l + dl)));
    const decoys = [
      perturb((Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 5), (Math.random() < 0.5 ? -1 : 1) * 3),
      perturb((Math.random() < 0.5 ? -1 : 1) * (15 + Math.random() * 12), (Math.random() < 0.5 ? -1 : 1) * 6),
      perturb((Math.random() < 0.5 ? -1 : 1) * (55 + Math.random() * 50), (Math.random() < 0.5 ? -1 : 1) * 10),
    ];
    const idx = Math.floor(Math.random() * 4);
    const arr = [...decoys];
    arr.splice(idx, 0, target);
    setSwatches(arr);
    setCorrectIndex(idx);
    setTargetHex(target);
    const t = setTimeout(() => setPhase("choose"), 1300);
    return () => clearTimeout(t);
  }, []);

  const pick = (i) => {
    if (phase !== "choose") return;
    playTap();
    setPicked(i);
    setPhase("done");
    let stars, dist;
    if (i === correctIndex) {
      stars = 5;
      dist = 0;
    } else {
      dist = colorDistance(swatches[i], targetHex);
      if (dist < 20) stars = 3;
      else if (dist < 60) stars = 2;
      else stars = 1;
    }
    setTimeout(() => {
      onFinish({
        stars,
        statLabel: i === correctIndex ? "判定" : "色差",
        statValue: i === correctIndex ? "完全一致" : `色差 ${dist.toFixed(0)}`,
        rawValue: dist,
      });
    }, 700);
  };

  return (
    <div style={{ textAlign: "center", marginTop: 20 }}>
      {phase === "show" && (
        <>
          <div style={{ fontSize: 12, color: "#8a8f9a", marginBottom: 12 }}>この色を覚えろ</div>
          <div
            style={{
              width: 140,
              height: 140,
              background: targetHex,
              margin: "0 auto",
              borderRadius: 6,
            }}
          />
        </>
      )}
      {(phase === "choose" || phase === "done") && (
        <>
          <div style={{ fontSize: 12, color: "#8a8f9a", marginBottom: 12 }}>
            {phase === "choose" ? "さっきと同じ色はどれ？" : "審査終了"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {swatches &&
              swatches.map((c, i) => (
                <div
                  key={i}
                  onClick={() => pick(i)}
                  style={{
                    height: 90,
                    background: c,
                    borderRadius: 4,
                    cursor: "pointer",
                    border:
                      phase === "done" && i === correctIndex
                        ? "3px solid #c9a227"
                        : phase === "done" && i === picked
                        ? "3px solid #a83232"
                        : "3px solid transparent",
                  }}
                />
              ))}
          </div>
        </>
      )}
    </div>
  );
}

// ============ ミニゲーム: スワイプ距離ぴったり ============
function SwipeGame({ onFinish }) {
  const TARGET = 100;
  const [dragging, setDragging] = useState(false);
  const [liveDist, setLiveDist] = useState(0);
  const [done, setDone] = useState(false);
  const startPos = useRef(null);

  const onDown = (e) => {
    if (done) return;
    playTap();
    const p = e.touches ? e.touches[0] : e;
    startPos.current = { x: p.clientX, y: p.clientY };
    setDragging(true);
    setLiveDist(0);
  };
  const onMove = (e) => {
    if (!dragging || !startPos.current) return;
    const p = e.touches ? e.touches[0] : e;
    const dx = p.clientX - startPos.current.x;
    const dy = p.clientY - startPos.current.y;
    setLiveDist(Math.hypot(dx, dy));
  };
  const onUp = () => {
    if (!dragging || done) return;
    setDragging(false);
    setDone(true);
    const err = Math.abs(liveDist - TARGET);
    let stars = 1;
    if (err < 3) stars = 5;
    else if (err < 8) stars = 4;
    else if (err < 20) stars = 3;
    else if (err < 40) stars = 2;
    onFinish({
      stars,
      statLabel: "距離誤差",
      statValue: `${liveDist.toFixed(1)}px (誤差 ${err.toFixed(1)}px)`,
      rawValue: err,
    });
  };

  return (
    <div style={{ textAlign: "center", marginTop: 20 }}>
      <div style={{ fontSize: 12, color: "#8a8f9a", marginBottom: 10 }}>
        枠内で指を動かし、ちょうど100pxで離す
      </div>
      <div
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={() => dragging && onUp()}
        onTouchStart={onDown}
        onTouchMove={onMove}
        onTouchEnd={onUp}
        style={{
          height: 220,
          border: "1px dashed #3a3d45",
          borderRadius: 4,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          touchAction: "none",
          background: "rgba(184,52,42,0.05)",
        }}
      >
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 32,
            color: done ? "#c9a227" : "#e8e6df",
          }}
        >
          {liveDist.toFixed(0)}px
        </div>
      </div>
    </div>
  );
}

// ============ ミニゲーム: 二本指同時押し ============
function DualTapGame({ onFinish }) {
  const areaRef = useRef(null);
  const [leftDone, setLeftDone] = useState(false);
  const [rightDone, setRightDone] = useState(false);
  const timesRef = useRef({ left: null, right: null });
  const doneRef = useRef(false);

  const finalize = () => {
    if (doneRef.current) return;
    if (timesRef.current.left === null || timesRef.current.right === null) return;
    doneRef.current = true;
    playTap();
    const diffMs = Math.abs(timesRef.current.left - timesRef.current.right);
    let stars = 1;
    if (diffMs < 15) stars = 5;
    else if (diffMs < 40) stars = 4;
    else if (diffMs < 80) stars = 3;
    else if (diffMs < 150) stars = 2;
    onFinish({
      stars,
      statLabel: "2点タップの時間差",
      statValue: `${diffMs.toFixed(0)}ms`,
      rawValue: diffMs,
    });
  };

  const handleTouchStart = (e) => {
    const rect = areaRef.current.getBoundingClientRect();
    for (const t of e.changedTouches) {
      const x = t.clientX - rect.left;
      const y = t.clientY - rect.top;
      const leftCx = rect.width * 0.25;
      const rightCx = rect.width * 0.75;
      const cy = rect.height * 0.5;
      const r = Math.min(rect.width, rect.height) * 0.22;
      if (timesRef.current.left === null && Math.hypot(x - leftCx, y - cy) < r) {
        timesRef.current.left = performance.now();
        setLeftDone(true);
      } else if (timesRef.current.right === null && Math.hypot(x - rightCx, y - cy) < r) {
        timesRef.current.right = performance.now();
        setRightDone(true);
      }
    }
    finalize();
  };

  return (
    <div style={{ textAlign: "center", marginTop: 16 }}>
      <div style={{ fontSize: 12, color: "#8a8f9a", marginBottom: 10 }}>
        両手の指で、2つの点を同時にタップ(スマホでのみ判定可能)
      </div>
      <div
        ref={areaRef}
        onTouchStart={handleTouchStart}
        style={{
          position: "relative",
          height: 200,
          border: "1px dashed #3a3d45",
          borderRadius: 4,
          touchAction: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "25%",
            top: "50%",
            width: 50,
            height: 50,
            borderRadius: "50%",
            background: leftDone ? "#c9a227" : "rgba(184,52,42,0.3)",
            border: "2px solid #b8342a",
            transform: "translate(-50%,-50%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "75%",
            top: "50%",
            width: 50,
            height: 50,
            borderRadius: "50%",
            background: rightDone ? "#c9a227" : "rgba(184,52,42,0.3)",
            border: "2px solid #b8342a",
            transform: "translate(-50%,-50%)",
          }}
        />
      </div>
    </div>
  );
}

function OneCharGame({ onFinish }) {
  const TIME_LIMIT = 3;
  const [text, setText] = useState("");
  const [phase, setPhase] = useState("idle"); // idle, typing, done
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT);
  const textRef = useRef("");
  const timerRef = useRef(null);
  const submittedRef = useRef(false);

  const finalize = () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    clearInterval(timerRef.current);
    playTap();
    const len = [...textRef.current].length; // 絵文字等も1文字として数える
    const dist = Math.abs(len - 1);
    let stars = 1;
    if (dist === 0) stars = 5;
    else if (dist === 1) stars = 3;
    else if (dist === 2) stars = 2;
    setPhase("done");
    onFinish({
      stars,
      statLabel: "最終文字数(審査官の介入込み)",
      statValue: `${len}文字`,
      rawValue: dist,
    });
  };

  const handleChange = (e) => {
    const val = e.target.value;
    setText(val);
    textRef.current = val;
    if (phase === "idle") {
      setPhase("typing");
      const start = performance.now();
      timerRef.current = setInterval(() => {
        const remain = Math.max(0, TIME_LIMIT - (performance.now() - start) / 1000);
        setTimeLeft(remain);

        // 審査官が勝手に文字を足したり消したりする(見えないまま)
        if (Math.random() < 0.045) {
          const chars = [...textRef.current];
          if (chars.length > 0 && Math.random() < 0.5) {
            chars.pop();
          } else {
            const c = INTERFERENCE_CHARS[Math.floor(Math.random() * INTERFERENCE_CHARS.length)];
            chars.push(c);
          }
          const next = chars.join("");
          textRef.current = next;
          setText(next);
        }

        if (remain <= 0) finalize();
      }, 80);
    }
  };

  useEffect(() => () => clearInterval(timerRef.current), []);

  return (
    <div style={{ textAlign: "center", marginTop: 24 }}>
      <div style={{ fontSize: 11, color: "#6b6a63", marginBottom: 10 }}>
        {phase === "idle"
          ? `打ち始めた瞬間から${TIME_LIMIT}秒。入力内容は見えなくなる。`
          : phase === "typing"
          ? `残り ${timeLeft.toFixed(1)}秒……見えない`
          : "審査終了"}
      </div>
      <input
        type="text"
        value={text}
        onChange={handleChange}
        onPaste={(e) => e.preventDefault()}
        disabled={phase === "done"}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        placeholder={phase === "idle" ? "ここに入力……" : ""}
        style={{
          width: "100%",
          padding: "14px 12px",
          fontSize: 18,
          background: "#181a20",
          border: "1px solid #2a2d34",
          borderRadius: 3,
          color: phase === "typing" ? "transparent" : "#e8e6df",
          caretColor: "#c9a227",
          fontFamily: "'Zen Kaku Gothic New', sans-serif",
          textAlign: "center",
        }}
      />
      {phase === "typing" && (
        <div
          style={{
            height: 4,
            background: "#2a2d34",
            marginTop: 10,
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${(timeLeft / TIME_LIMIT) * 100}%`,
              background: "#b8342a",
              transition: "width 0.08s linear",
            }}
          />
        </div>
      )}
      <div style={{ fontSize: 11, color: "#6b6a63", marginTop: 8 }}>
        ちょうど1文字で確定できれば最高評価。……ただし審査官は信用ならない。
      </div>
      <button onClick={finalize} disabled={phase !== "typing"} style={btnStyle("#b8342a")}>
        {phase === "done" ? "審査終了" : phase === "typing" ? "今すぐ確定する" : "入力待ち"}
      </button>
    </div>
  );
}

// ============ オンラインランキング画面 ============
function LeaderboardScreen({ game, onBack, initialMode = "all" }) {
  const [mode, setMode] = useState(initialMode); // "all" | "today"
  const [state, setState] = useState("loading"); // loading, ok, error
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    (async () => {
      try {
        const data = await fetchLeaderboard(game.id, game.lowerIsBetter, mode);
        if (!cancelled) {
          setRows(data);
          setState("ok");
        }
      } catch (e) {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [game.id, mode]);

  return (
    <div style={{ marginTop: 16 }}>
      <button
        onClick={onBack}
        style={{
          background: "none",
          border: "none",
          color: "#8a8f9a",
          fontSize: 12,
          marginBottom: 10,
          cursor: "pointer",
          padding: 0,
        }}
      >
        ← 審査に戻る
      </button>
      <div style={{ fontFamily: "'Shippori Mincho', serif", fontSize: 16, marginBottom: 10 }}>
        🏆 {game.name} オンラインランキング
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button
          onClick={() => {
            playTap();
            setMode("all");
          }}
          style={{
            flex: 1,
            padding: "8px 0",
            fontSize: 12,
            borderRadius: 20,
            border: mode === "all" ? "1px solid #c9a227" : "1px solid #2a2d34",
            background: mode === "all" ? "rgba(201,162,39,0.12)" : "transparent",
            color: mode === "all" ? "#c9a227" : "#8a8f9a",
            cursor: "pointer",
          }}
        >
          全期間
        </button>
        <button
          onClick={() => {
            playTap();
            setMode("today");
          }}
          style={{
            flex: 1,
            padding: "8px 0",
            fontSize: 12,
            borderRadius: 20,
            border: mode === "today" ? "1px solid #c9a227" : "1px solid #2a2d34",
            background: mode === "today" ? "rgba(201,162,39,0.12)" : "transparent",
            color: mode === "today" ? "#c9a227" : "#8a8f9a",
            cursor: "pointer",
          }}
        >
          本日
        </button>
      </div>

      {state === "loading" && (
        <div style={{ fontSize: 12, color: "#6b6a63", textAlign: "center", padding: "24px 0" }}>
          読み込み中……
        </div>
      )}
      {state === "error" && (
        <div style={{ fontSize: 12, color: "#a83232", textAlign: "center", padding: "24px 0" }}>
          ランキングを取得できませんでした。
          <br />
          (オンラインランキングの設定が済んでいない可能性があります)
        </div>
      )}
      {state === "ok" && rows.length === 0 && (
        <div style={{ fontSize: 12, color: "#6b6a63", textAlign: "center", padding: "24px 0" }}>
          {mode === "today"
            ? "今日はまだ誰も記録を残していません。一番乗りのチャンス。"
            : "まだ誰も記録を残していません。一番乗りのチャンス。"}
        </div>
      )}
      {state === "ok" &&
        rows.map((r, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 12px",
              borderBottom: "1px solid #2a2d34",
              fontSize: 13,
            }}
          >
            <span style={{ color: i < 3 ? "#c9a227" : "#8a8f9a", width: 32 }}>
              {i + 1}位
            </span>
            <span style={{ flex: 1, marginLeft: 8, minWidth: 0 }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{r.statValue}</span>
              {r.nickname && (
                <span style={{ display: "block", fontSize: 10, color: "#6b6a63", marginTop: 2 }}>
                  {r.nickname}
                </span>
              )}
            </span>
            <span style={{ color: "#c9a227" }}>{"★".repeat(r.stars)}</span>
          </div>
        ))}
    </div>
  );
}

function btnStyle(bg) {
  return {
    marginTop: 24,
    padding: "14px 44px",
    background: bg,
    color: "#f3ecd9",
    border: "none",
    borderRadius: 2,
    fontSize: 15,
    letterSpacing: 3,
    fontFamily: "'Zen Kaku Gothic New', sans-serif",
    cursor: "pointer",
  };
}

// ============ メイン ============
// ============ 殿堂ページ ============
function HallScreen({ records, totalPlays, titles, onClose }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,12,16,0.92)",
        zIndex: 55,
        overflowY: "auto",
        padding: "24px 18px 40px",
      }}
    >
      <button
        onClick={onClose}
        style={{
          background: "none",
          border: "none",
          color: "#8a8f9a",
          fontSize: 12,
          marginBottom: 16,
          cursor: "pointer",
          padding: 0,
        }}
      >
        ← 台帳に戻る
      </button>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 10, letterSpacing: 3, color: "#8a7a4d" }}>殿堂</div>
        <div style={{ fontFamily: "'Shippori Mincho', serif", fontSize: 20, color: "#e8e6df", marginTop: 6 }}>
          あなたのどうでもいい実績
        </div>
        <div style={{ fontSize: 12, color: "#6b6a63", marginTop: 6 }}>
          通算受審 {totalPlays} 回 ／ 称号 {titles.length} 個
        </div>
      </div>

      {Object.values(GAMES)
        .filter((g) => !g.hidden || records[g.id])
        .map((g) => {
        const rec = records[g.id];
        return (
          <div
            key={g.id}
            style={{
              border: "1px solid #2a2d34",
              borderRadius: 3,
              padding: "12px 16px",
              marginBottom: 10,
              background: "#181a20",
            }}
          >
            <div style={{ fontSize: 10, color: "#8a8f9a" }}>{g.no}</div>
            <div style={{ fontFamily: "'Zen Kaku Gothic New', sans-serif", fontSize: 14, marginTop: 4 }}>
              {g.name}
            </div>
            <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "#c9a227", fontSize: 15 }}>
                {rec ? "★".repeat(rec.bestStars) + "☆".repeat(5 - rec.bestStars) : "☆☆☆☆☆"}
              </span>
              <span style={{ fontSize: 11, color: "#6b6a63" }}>
                {rec ? `${rec.plays}回挑戦` : "未挑戦"}
              </span>
            </div>
          </div>
        );
      })}

      <div style={{ marginTop: 24 }}>
        <div style={{ fontSize: 11, color: "#8a7a4d", letterSpacing: 2, marginBottom: 10 }}>
          獲得称号
        </div>
        {titles.length === 0 && (
          <div style={{ fontSize: 12, color: "#6b6a63" }}>まだ何者でもない。審査を受けよ。</div>
        )}
        {titles.map((t) => (
          <div
            key={t}
            style={{
              fontFamily: "'Shippori Mincho', serif",
              fontSize: 14,
              padding: "8px 12px",
              marginBottom: 6,
              borderLeft: "2px solid #b8342a",
              color: "#e8e6df",
              background: "#181a20",
            }}
          >
            {t}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============ 全審査モード サマリー ============
function PentathlonSummary({ results, onClose }) {
  const totalStars = results.reduce((sum, r) => sum + r.stars, 0);
  const maxStars = results.length * 5;
  const avg = totalStars / results.length;
  let overallTitle = "凡人の極み";
  if (avg >= 4.5) overallTitle = "全審査満点・世界一どうでもいい人間";
  else if (avg >= 3.5) overallTitle = "全審査突破の達人";
  else if (avg >= 2.5) overallTitle = "そこそこどうでもいい人";
  else overallTitle = "まだまだ暇が足りない";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,12,16,0.9)",
        zIndex: 55,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 18,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 380,
          background: "#f3ecd9",
          color: "#241f16",
          borderRadius: 4,
          padding: "24px 20px",
          maxHeight: "86vh",
          overflowY: "auto",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 10, letterSpacing: 3, color: "#8a7a4d" }}>全審査モード 結果</div>
          <div style={{ fontFamily: "'Shippori Mincho', serif", fontSize: 20, marginTop: 8 }}>
            {overallTitle}
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 26, marginTop: 12 }}>
            {totalStars} / {maxStars}
          </div>
          <div style={{ fontSize: 11, color: "#8a7a4d" }}>合計極め度</div>
        </div>

        <div style={{ marginTop: 18 }}>
          {results.map((r, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "8px 0",
                borderBottom: "1px solid #d8cba8",
                fontSize: 12,
              }}
            >
              <span>{GAMES[r.gameId].name}</span>
              <span style={{ color: "#8a6f1a" }}>{"★".repeat(r.stars)}</span>
            </div>
          ))}
        </div>

        <button
          onClick={onClose}
          style={{
            marginTop: 20,
            width: "100%",
            padding: "12px 0",
            background: "#241f16",
            color: "#f3ecd9",
            border: "none",
            borderRadius: 2,
            fontSize: 13,
            letterSpacing: 2,
            cursor: "pointer",
          }}
        >
          審査台帳へ戻る
        </button>
      </div>
    </div>
  );
}

// ============ プレイヤー設定(ニックネーム・引き継ぎ) ============
function ProfileScreen({ userId, nickname, onSaveNickname, onRestore, onClose }) {
  const [nameInput, setNameInput] = useState(nickname);
  const [codeInput, setCodeInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [restoreState, setRestoreState] = useState(null); // { ok, message }
  const [restoring, setRestoring] = useState(false);

  const handleCopy = async () => {
    playTap();
    const ok = await copyText(userId || "");
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRestore = async () => {
    if (restoring) return;
    playTap();
    setRestoring(true);
    const res = await onRestore(codeInput);
    setRestoreState(res);
    setRestoring(false);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,12,16,0.92)",
        zIndex: 55,
        overflowY: "auto",
        padding: "24px 18px 40px",
      }}
    >
      <button
        onClick={onClose}
        style={{
          background: "none",
          border: "none",
          color: "#8a8f9a",
          fontSize: 12,
          marginBottom: 16,
          cursor: "pointer",
          padding: 0,
        }}
      >
        ← 台帳に戻る
      </button>

      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 10, letterSpacing: 3, color: "#8a7a4d" }}>審査対象者情報</div>
        <div style={{ fontFamily: "'Shippori Mincho', serif", fontSize: 18, color: "#e8e6df", marginTop: 6 }}>
          プレイヤー設定
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, color: "#8a8f9a", marginBottom: 8 }}>ニックネーム</div>
        <input
          type="text"
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          placeholder="名無しさん"
          maxLength={20}
          style={{
            width: "100%",
            padding: "12px",
            fontSize: 15,
            background: "#181a20",
            border: "1px solid #2a2d34",
            borderRadius: 3,
            color: "#e8e6df",
            fontFamily: "'Zen Kaku Gothic New', sans-serif",
          }}
        />
        <button
          onClick={() => {
            playTap();
            onSaveNickname(nameInput);
          }}
          style={{ ...btnStyle("#b8342a"), width: "100%", marginTop: 10 }}
        >
          保存する
        </button>
        <div style={{ fontSize: 11, color: "#6b6a63", marginTop: 6 }}>
          ランキングに記録するとき、このニックネームが一緒に表示されます。
        </div>
      </div>

      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, color: "#8a8f9a", marginBottom: 8 }}>あなたのユーザー番号</div>
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 22,
            letterSpacing: 2,
            color: "#c9a227",
            border: "1px dashed #3a3d45",
            borderRadius: 3,
            padding: "12px",
            textAlign: "center",
          }}
        >
          {userId || "……"}
        </div>
        <button
          onClick={handleCopy}
          style={{
            marginTop: 10,
            width: "100%",
            padding: "10px 0",
            background: copied ? "#2e7d4f" : "transparent",
            color: copied ? "#f3ecd9" : "#c9a227",
            border: "1px solid #c9a227",
            borderRadius: 2,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          {copied ? "コピーしました" : "番号をコピー"}
        </button>
        <div style={{ fontSize: 11, color: "#6b6a63", marginTop: 6 }}>
          この番号を控えておくと、別のスマホやブラウザでも記録を呼び出せます。
        </div>
      </div>

      <div>
        <div style={{ fontSize: 11, color: "#8a8f9a", marginBottom: 8 }}>
          別端末の記録を引き継ぐ
        </div>
        <input
          type="text"
          inputMode="numeric"
          value={codeInput}
          onChange={(e) => setCodeInput(e.target.value)}
          placeholder="ユーザー番号を入力"
          style={{
            width: "100%",
            padding: "12px",
            fontSize: 15,
            background: "#181a20",
            border: "1px solid #2a2d34",
            borderRadius: 3,
            color: "#e8e6df",
            fontFamily: "'JetBrains Mono', monospace",
            textAlign: "center",
          }}
        />
        <button
          onClick={handleRestore}
          disabled={restoring}
          style={{ ...btnStyle("#4a2d6e"), width: "100%", marginTop: 10 }}
        >
          {restoring ? "確認中……" : "この番号の記録を呼び出す"}
        </button>
        {restoreState && (
          <div
            style={{
              fontSize: 12,
              marginTop: 8,
              color: restoreState.ok ? "#2e7d4f" : "#a83232",
              textAlign: "center",
            }}
          >
            {restoreState.message}
          </div>
        )}
        <div style={{ fontSize: 11, color: "#6b6a63", marginTop: 8 }}>
          ⚠ 呼び出すと、この端末に今ある記録は上書きされます。
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState({});
  const [totalPlays, setTotalPlays] = useState(0);
  const [screen, setScreen] = useState("hub"); // hub, timing, tap, coin
  const [certData, setCertData] = useState(null);
  const [showTitles, setShowTitles] = useState(false);
  const [incomingChallenge, setIncomingChallenge] = useState(null);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboardMode, setLeaderboardMode] = useState("all");
  const [showHall, setShowHall] = useState(false);
  const [pentathlon, setPentathlon] = useState(null); // { index, results }
  const [pentathlonSummary, setPentathlonSummary] = useState(null);
  const [titleToast, setTitleToast] = useState(null);
  const [hiddenParams, setHiddenParams] = useState(null);
  const [streak, setStreak] = useState(0);
  const [userId, setUserId] = useState(null);
  const [nickname, setNickname] = useState("");
  const [showProfile, setShowProfile] = useState(false);
  const [bgmTrack, setBgmTrack] = useState("off"); // "off" | "nohohon" | "ochitsuku"
  const prevTitlesRef = useRef(null);
  const audioElRef = useRef(null);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const c = params.get("c");
      if (c) {
        const decoded = decodeChallenge(c);
        if (decoded && GAMES[decoded.g]) {
          setIncomingChallenge(decoded);
        }
      }
    } catch (e) {
      // 挑戦状の解析失敗は無視
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("dodemoii-records");
      if (raw) {
        const parsed = JSON.parse(raw);
        setRecords(parsed.records || {});
        setTotalPlays(parsed.totalPlays || 0);
      }
      const rawStreak = localStorage.getItem("dodemoii-streak");
      if (rawStreak) {
        const parsedStreak = JSON.parse(rawStreak);
        setStreak(parsedStreak.streak || 0);
      }
      const rawProfile = localStorage.getItem("dodemoii-profile");
      if (rawProfile) {
        const parsedProfile = JSON.parse(rawProfile);
        setUserId(parsedProfile.userId);
        setNickname(parsedProfile.nickname || "");
      } else {
        const newId = genUserId();
        localStorage.setItem("dodemoii-profile", JSON.stringify({ userId: newId, nickname: "" }));
        setUserId(newId);
      }
      const rawBgm = localStorage.getItem("dodemoii-bgm");
      if (rawBgm) setBgmTrack(rawBgm);
    } catch (e) {
      // no record yet
    }
    setLoading(false);
  }, []);

  const BGM_SOURCES = {
    nohohon: "/bgm-nohohon.mp3",
    ochitsuku: "/bgm-ochitsuku.mp3",
  };

  const changeBgm = (track) => {
    playTap();
    setBgmTrack(track);
    try {
      localStorage.setItem("dodemoii-bgm", track);
    } catch (e) {
      // 保存できなくても続行
    }
  };

  useEffect(() => {
    const el = audioElRef.current;
    if (!el) return;
    if (bgmTrack === "off") {
      el.pause();
      return;
    }
    const src = BGM_SOURCES[bgmTrack];
    if (!src) return;
    if (!el.src.endsWith(src)) {
      el.src = src;
    }
    el.volume = 0.32;
    el.loop = true;
    el.play().catch(() => {
      // 自動再生がブロックされた場合は、次のユーザー操作まで待つ
    });
  }, [bgmTrack]);

  useEffect(() => {
    const tryResume = () => {
      const el = audioElRef.current;
      if (el && el.paused && bgmTrack !== "off") {
        el.play().catch(() => {});
      }
    };
    window.addEventListener("pointerdown", tryResume);
    return () => window.removeEventListener("pointerdown", tryResume);
  }, [bgmTrack]);

  const persist = (nextRecords, nextTotal) => {
    try {
      localStorage.setItem(
        "dodemoii-records",
        JSON.stringify({ records: nextRecords, totalPlays: nextTotal })
      );
    } catch (e) {
      console.error("save failed", e);
    }
  };

  const bumpStreak = () => {
    try {
      const raw = localStorage.getItem("dodemoii-streak");
      const data = raw ? JSON.parse(raw) : { lastDate: null, streak: 0 };
      const today = todayKey();
      if (data.lastDate === today) return data.streak; // 今日はもうカウント済み
      const y = new Date();
      y.setDate(y.getDate() - 1);
      const yesterday = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(
        y.getDate()
      ).padStart(2, "0")}`;
      const newStreak = data.lastDate === yesterday ? data.streak + 1 : 1;
      localStorage.setItem("dodemoii-streak", JSON.stringify({ lastDate: today, streak: newStreak }));
      setStreak(newStreak);
      return newStreak;
    } catch (e) {
      // 保存できなくても致命的ではない
      return streak;
    }
  };

  const saveNickname = (name) => {
    const trimmed = name.slice(0, 20);
    setNickname(trimmed);
    try {
      localStorage.setItem("dodemoii-profile", JSON.stringify({ userId, nickname: trimmed }));
    } catch (e) {
      // 保存できなくても続行
    }
    if (userId) {
      syncProfileToCloud(userId, { nickname: trimmed });
    }
  };

  const backupToCloud = (nextRecords, nextTotal, nextStreak) => {
    if (!userId) return;
    syncProfileToCloud(userId, {
      nickname,
      records: nextRecords,
      totalPlays: nextTotal,
      streak: nextStreak !== undefined ? nextStreak : streak,
    });
  };

  const restoreFromCode = async (code) => {
    const id = code.trim();
    if (!id) return { ok: false, message: "番号を入力してください" };
    try {
      const data = await fetchProfileFromCloud(id);
      if (!data) return { ok: false, message: "その番号のデータは見つかりませんでした" };
      const nextRecords = data.records || {};
      const nextTotal = data.totalPlays || 0;
      const nextStreak = data.streak || 0;
      const nextNickname = data.nickname || "";
      setRecords(nextRecords);
      setTotalPlays(nextTotal);
      setStreak(nextStreak);
      setNickname(nextNickname);
      setUserId(id);
      persist(nextRecords, nextTotal);
      localStorage.setItem("dodemoii-streak", JSON.stringify({ lastDate: todayKey(), streak: nextStreak }));
      localStorage.setItem("dodemoii-profile", JSON.stringify({ userId: id, nickname: nextNickname }));
      prevTitlesRef.current = null;
      return { ok: true, message: "復元しました" };
    } catch (e) {
      return { ok: false, message: "復元に失敗しました。通信状況を確認してください" };
    }
  };

  useEffect(() => {
    const current = computeTitles(records, totalPlays, streak);
    const prev = prevTitlesRef.current;
    if (prev !== null) {
      const newlyUnlocked = current.filter((t) => !prev.includes(t));
      if (newlyUnlocked.length > 0) {
        setTitleToast(newlyUnlocked[0]);
        vibrate([15, 40, 15, 40, 80]);
        setTimeout(() => setTitleToast(null), 3600);
      }
    }
    prevTitlesRef.current = current;
  }, [records, totalPlays, streak]);

  const handleFinish = (gameId, result) => {
    const prev = records[gameId];
    const isNewBest = !prev || result.stars > prev.bestStars;
    const nextRec = {
      ...records,
      [gameId]: {
        bestStars: Math.max(prev ? prev.bestStars : 0, result.stars),
        plays: (prev ? prev.plays : 0) + 1,
      },
    };
    const nextTotal = totalPlays + 1;
    setRecords(nextRec);
    setTotalPlays(nextTotal);
    persist(nextRec, nextTotal);
    submitToLeaderboard(gameId, result, nickname);
    const nextStreak = bumpStreak();
    backupToCloud(nextRec, nextTotal, nextStreak);

    if (result.stars >= 3) playStars(result.stars);
    else playFail();

    if (pentathlon) {
      const newResults = [...pentathlon.results, { gameId, ...result }];
      if (pentathlon.index < GAME_ORDER.length - 1) {
        const nextIndex = pentathlon.index + 1;
        setPentathlon({ index: nextIndex, results: newResults });
        setScreen(GAME_ORDER[nextIndex]);
      } else {
        setPentathlon(null);
        setPentathlonSummary(newResults);
        setScreen("hub");
      }
      return;
    }

    let opponent = null;
    let outcome = null;
    if (incomingChallenge && incomingChallenge.g === gameId) {
      opponent = incomingChallenge;
      outcome = judgeChallenge(GAMES[gameId], result.rawValue, incomingChallenge.r);
      setIncomingChallenge(null);
      try {
        window.history.replaceState({}, "", window.location.pathname);
      } catch (e) {
        // URL整形に失敗しても致命的ではない
      }
    }

    const jitter = Math.floor(Date.now() % 1000);
    const rank = starsToRank(result.stars, jitter);
    setCertData({
      game: GAMES[gameId],
      stars: result.stars,
      statLabel: result.statLabel,
      statValue: result.statValue,
      rawValue: result.rawValue,
      rank,
      isNewBest,
      opponent,
      outcome,
    });
    setScreen("hub");
  };

  const titles = computeTitles(records, totalPlays, streak);
  const featuredGameId = GAME_ORDER[hashStr(todayKey()) % GAME_ORDER.length];
  const hiddenUnlocked = Object.values(records).some((r) => r && r.bestStars >= 5);

  const startPentathlon = () => {
    playTap();
    setPentathlon({ index: 0, results: [] });
    setScreen(GAME_ORDER[0]);
  };

  const enterHiddenGame = (gameId) => {
    playTap();
    if (gameId === "timing_hidden") {
      setHiddenParams({ target: +(3 + Math.random() * 12).toFixed(3) });
    } else if (gameId === "tap_hidden") {
      setHiddenParams({
        ratio: { x: 0.15 + Math.random() * 0.7, y: 0.15 + Math.random() * 0.7 },
      });
    }
    setScreen(gameId);
  };

  if (loading) {
    return (
      <div style={wrapStyle}>
        <div style={{ color: "#6b6a63", fontSize: 13 }}>審査台帳を読み込み中……</div>
      </div>
    );
  }

  return (
    <div style={wrapStyle}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@500;700&family=Zen+Kaku+Gothic+New:wght@400;500;700&family=JetBrains+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; }
        button { transition: transform 0.12s ease, filter 0.12s ease; }
        button:active { transform: scale(0.96); filter: brightness(0.92); }

        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .card-in {
          opacity: 0;
          animation: fadeInUp 0.45s cubic-bezier(.2,.8,.3,1) forwards;
        }
        @keyframes screenIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .screen-in {
          animation: screenIn 0.32s ease-out;
        }
        @keyframes ripple {
          from { transform: translate(-50%,-50%) scale(0.2); opacity: 0.6; }
          to { transform: translate(-50%,-50%) scale(2.4); opacity: 0; }
        }
        .ripple-effect {
          animation: ripple 0.55s ease-out forwards;
        }
        @keyframes confettiFall {
          from { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
          to { transform: translateY(110vh) rotate(540deg); opacity: 0.9; }
        }
        @keyframes pulseGlow {
          0%, 100% { text-shadow: 0 0 0 rgba(201,162,39,0); }
          50% { text-shadow: 0 0 18px rgba(201,162,39,0.85); }
        }
        .glow-pulse {
          animation: pulseGlow 0.6s ease-in-out infinite;
        }
        @keyframes stampPop {
          0% { transform: rotate(-14deg) scale(2.6); opacity: 0; }
          60% { transform: rotate(-14deg) scale(0.9); opacity: 1; }
          100% { transform: rotate(-14deg) scale(1); opacity: 0.85; }
        }
        @keyframes toastDrop {
          0% { transform: translate(-50%, -30px); opacity: 0; }
          15% { transform: translate(-50%, 0); opacity: 1; }
          85% { transform: translate(-50%, 0); opacity: 1; }
          100% { transform: translate(-50%, -30px); opacity: 0; }
        }
      `}</style>

      <audio ref={audioElRef} />

      <button
        onClick={() => {
          const order = ["off", "nohohon", "ochitsuku"];
          const next = order[(order.indexOf(bgmTrack) + 1) % order.length];
          changeBgm(next);
        }}
        style={{
          position: "fixed",
          top: 14,
          right: 14,
          zIndex: 65,
          background: "#181a20",
          border: "1px solid #2a2d34",
          borderRadius: 20,
          padding: "7px 12px",
          fontSize: 11,
          color: bgmTrack === "off" ? "#6b6a63" : "#c9a227",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 5,
        }}
      >
        {bgmTrack === "off" ? "🔇 BGM オフ" : bgmTrack === "nohohon" ? "🎵 のほほん" : "🎵 おちつく"}
      </button>

      <header style={{ textAlign: "center", padding: "28px 18px 18px", borderBottom: "1px solid #2a2d34" }}>
        <div style={{ fontSize: 10, letterSpacing: 4, color: "#8a8f9a" }}>WORLD DODEMOII BUREAU</div>
        <h1
          style={{
            fontFamily: "'Shippori Mincho', serif",
            fontSize: 22,
            margin: "8px 0 4px",
            letterSpacing: 1,
          }}
        >
          世界一どうでもいいことを極める。
        </h1>
        <div style={{ fontSize: 11, color: "#6b6a63" }}>
          {nickname ? `${nickname} ／ ` : ""}第{Object.keys(GAMES).length}種の審査項目 ／ 通算受審 {totalPlays} 回
        </div>
        {streak >= 2 && (
          <div style={{ fontSize: 12, color: "#c9a227", marginTop: 6 }}>
            🔥 {streak}日連続受審中
          </div>
        )}
      </header>

      {titleToast && (
        <div
          style={{
            position: "fixed",
            top: 16,
            left: "50%",
            zIndex: 70,
            animation: "toastDrop 3.6s ease-in-out forwards",
            background: "#f3ecd9",
            color: "#241f16",
            padding: "12px 20px",
            borderRadius: 4,
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            border: "1px solid #c9a227",
            textAlign: "center",
            maxWidth: "88vw",
          }}
        >
          <div style={{ fontSize: 10, color: "#8a7a4d", letterSpacing: 2 }}>称号解放</div>
          <div style={{ fontFamily: "'Shippori Mincho', serif", fontSize: 16, marginTop: 2 }}>
            {titleToast}
          </div>
        </div>
      )}

      {screen === "hub" && (
        <div key="hub" className="screen-in" style={{ padding: "18px 16px 40px" }}>
          {incomingChallenge && GAMES[incomingChallenge.g] && (
            <div
              onClick={() => {
                playTap();
                setScreen(incomingChallenge.g);
              }}
              style={{
                border: "1px solid #b8342a",
                borderRadius: 3,
                padding: "14px 16px",
                marginBottom: 16,
                cursor: "pointer",
                background: "rgba(184,52,42,0.1)",
              }}
            >
              <div style={{ fontSize: 10, color: "#e07a6e", letterSpacing: 2 }}>
                挑戦状が届いています
              </div>
              <div style={{ fontFamily: "'Zen Kaku Gothic New', sans-serif", fontSize: 15, marginTop: 6 }}>
                {GAMES[incomingChallenge.g].name}
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, marginTop: 4 }}>
                相手の記録:{incomingChallenge.v}
                <span style={{ color: "#c9a227", marginLeft: 6 }}>
                  {"★".repeat(incomingChallenge.s)}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "#e07a6e", marginTop: 8, textAlign: "right" }}>
                受けて立つ →
              </div>
            </div>
          )}

          <div
            onClick={() => {
              playTap();
              setScreen(featuredGameId);
              setShowLeaderboard(true);
              setLeaderboardMode("today");
            }}
            style={{
              border: "1px solid #c9a227",
              borderRadius: 3,
              padding: "12px 16px",
              marginBottom: 14,
              cursor: "pointer",
              background: "rgba(201,162,39,0.08)",
            }}
          >
            <div style={{ fontSize: 10, color: "#c9a227", letterSpacing: 2 }}>本日の審査</div>
            <div style={{ fontFamily: "'Zen Kaku Gothic New', sans-serif", fontSize: 15, marginTop: 4 }}>
              {GAMES[featuredGameId].name}
            </div>
            <div style={{ fontSize: 11, color: "#8a8f9a", marginTop: 4, textAlign: "right" }}>
              本日のランキングを見る →
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
            <button
              onClick={startPentathlon}
              style={{
                flex: 1,
                background: "#b8342a",
                color: "#f3ecd9",
                border: "none",
                borderRadius: 3,
                padding: "12px 8px",
                fontSize: 12,
                letterSpacing: 1,
                fontFamily: "'Zen Kaku Gothic New', sans-serif",
                cursor: "pointer",
              }}
            >
              🏅 全審査モード
            </button>
            <button
              onClick={() => {
                playTap();
                setShowHall(true);
              }}
              style={{
                flex: 1,
                background: "transparent",
                color: "#c9a227",
                border: "1px solid #c9a227",
                borderRadius: 3,
                padding: "12px 8px",
                fontSize: 12,
                letterSpacing: 1,
                fontFamily: "'Zen Kaku Gothic New', sans-serif",
                cursor: "pointer",
              }}
            >
              🏛 殿堂を見る
            </button>
            <button
              onClick={() => {
                playTap();
                setShowProfile(true);
              }}
              style={{
                background: "transparent",
                color: "#8a8f9a",
                border: "1px solid #2a2d34",
                borderRadius: 3,
                padding: "12px 10px",
                fontSize: 16,
                cursor: "pointer",
              }}
              aria-label="プレイヤー設定"
            >
              👤
            </button>
          </div>

          {Object.values(GAMES)
            .filter((g) => !g.hidden)
            .map((g, i) => {
            const rec = records[g.id];
            return (
              <div
                key={g.id}
                className="card-in"
                onClick={() => {
                  playTap();
                  setScreen(g.id);
                }}
                style={{
                  border: "1px solid #2a2d34",
                  borderRadius: 3,
                  padding: "14px 16px",
                  marginBottom: 12,
                  cursor: "pointer",
                  background: "#181a20",
                  animationDelay: `${i * 0.07}s`,
                  transition: "transform 0.12s ease, border-color 0.2s ease",
                }}
                onTouchStart={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
                onTouchEnd={(e) => (e.currentTarget.style.transform = "scale(1)")}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontSize: 10, color: "#8a8f9a", letterSpacing: 1 }}>{g.no}</span>
                  <span style={{ fontSize: 12, color: "#c9a227" }}>
                    {rec ? "★".repeat(rec.bestStars) : "未審査"}
                  </span>
                </div>
                <div style={{ fontFamily: "'Zen Kaku Gothic New', sans-serif", fontSize: 16, marginTop: 6 }}>
                  {g.name}
                </div>
                <div style={{ fontSize: 12, color: "#8a8f9a", marginTop: 4, lineHeight: 1.5 }}>
                  {g.desc}
                </div>
              </div>
            );
          })}

          {hiddenUnlocked ? (
            <>
              <div style={{ fontSize: 10, color: "#6b3aa0", letterSpacing: 2, margin: "20px 0 10px" }}>
                🌑 裏審査(解放済み)
              </div>
              {Object.values(GAMES)
                .filter((g) => g.hidden)
                .map((g) => {
                  const rec = records[g.id];
                  return (
                    <div
                      key={g.id}
                      className="card-in"
                      onClick={() => enterHiddenGame(g.id)}
                      style={{
                        border: "1px solid #4a2d6e",
                        borderRadius: 3,
                        padding: "14px 16px",
                        marginBottom: 12,
                        cursor: "pointer",
                        background: "#181420",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                        <span style={{ fontSize: 10, color: "#8a8f9a", letterSpacing: 1 }}>{g.no}</span>
                        <span style={{ fontSize: 12, color: "#c9a227" }}>
                          {rec ? "★".repeat(rec.bestStars) : "未審査"}
                        </span>
                      </div>
                      <div style={{ fontFamily: "'Zen Kaku Gothic New', sans-serif", fontSize: 16, marginTop: 6, color: "#c9a8e8" }}>
                        {g.name}
                      </div>
                      <div style={{ fontSize: 12, color: "#8a8f9a", marginTop: 4, lineHeight: 1.5 }}>
                        {g.desc}
                      </div>
                    </div>
                  );
                })}
            </>
          ) : (
            <div
              style={{
                border: "1px dashed #3a3d45",
                borderRadius: 3,
                padding: "14px 16px",
                marginTop: 20,
                marginBottom: 12,
                color: "#5a5d66",
                fontSize: 12,
                textAlign: "center",
              }}
            >
              🔒 裏審査(未解放) ── いずれかの審査で★5を取ると解放される
            </div>
          )}

          <div
            onClick={() => setShowTitles((s) => !s)}
            style={{
              marginTop: 20,
              textAlign: "center",
              fontSize: 12,
              color: "#8a8f9a",
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            称号台帳を{showTitles ? "閉じる" : "見る"}({titles.length})
          </div>
          {showTitles && (
            <div style={{ marginTop: 12 }}>
              {titles.length === 0 && (
                <div style={{ fontSize: 12, color: "#6b6a63", textAlign: "center" }}>
                  まだ何者でもない。審査を受けよ。
                </div>
              )}
              {titles.map((t) => (
                <div
                  key={t}
                  style={{
                    fontFamily: "'Shippori Mincho', serif",
                    fontSize: 14,
                    padding: "8px 12px",
                    marginBottom: 6,
                    borderLeft: "2px solid #b8342a",
                    color: "#e8e6df",
                    background: "#181a20",
                  }}
                >
                  {t}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {screen !== "hub" && (
        <div key={screen} className="screen-in" style={{ padding: "18px 16px 40px" }}>
          {!pentathlon && (
            <button
              onClick={() => {
                setScreen("hub");
                setShowLeaderboard(false);
              }}
              style={{
                background: "none",
                border: "none",
                color: "#8a8f9a",
                fontSize: 12,
                marginBottom: 10,
                cursor: "pointer",
                padding: 0,
              }}
            >
              ← 台帳に戻る
            </button>
          )}

          {pentathlon && (
            <div
              style={{
                fontSize: 11,
                color: "#c9a227",
                letterSpacing: 1,
                marginBottom: 10,
              }}
            >
              🏅 全審査モード {pentathlon.index + 1} / {GAME_ORDER.length}
            </div>
          )}

          {showLeaderboard ? (
            <LeaderboardScreen
              game={GAMES[screen]}
              initialMode={leaderboardMode}
              onBack={() => setShowLeaderboard(false)}
            />
          ) : (
            <>
              <div style={{ fontSize: 11, color: "#8a8f9a" }}>{GAMES[screen].no}</div>
              <div style={{ fontFamily: "'Shippori Mincho', serif", fontSize: 18, marginTop: 4 }}>
                {GAMES[screen].name}
              </div>
              <div style={{ fontSize: 12, color: "#8a8f9a", marginTop: 6, lineHeight: 1.6 }}>
                {GAMES[screen].desc}
              </div>
              {!pentathlon && (
                <button
                  onClick={() => {
                    playTap();
                    setLeaderboardMode("all");
                    setShowLeaderboard(true);
                  }}
                  style={{
                    marginTop: 8,
                    background: "none",
                    border: "1px solid #c9a227",
                    color: "#c9a227",
                    fontSize: 11,
                    padding: "6px 12px",
                    borderRadius: 20,
                    cursor: "pointer",
                  }}
                >
                  🏆 オンラインランキングを見る
                </button>
              )}

              {screen === "timing" && (
                <TimingGame onFinish={(r) => handleFinish("timing", r)} />
              )}
              {screen === "tap" && <TapCenterGame onFinish={(r) => handleFinish("tap", r)} />}
              {screen === "coin" && <CoinGame onFinish={(r) => handleFinish("coin", r)} />}
              {screen === "power" && <PowerPressGame onFinish={(r) => handleFinish("power", r)} />}
              {screen === "janken" && <JankenGame onFinish={(r) => handleFinish("janken", r)} />}
              {screen === "onechar" && <OneCharGame onFinish={(r) => handleFinish("onechar", r)} />}
              {screen === "timing_hidden" && (
                <TimingGame
                  showTarget
                  target={hiddenParams?.target ?? 10}
                  onFinish={(r) => handleFinish("timing_hidden", r)}
                />
              )}
              {screen === "tap_hidden" && (
                <TapCenterGame
                  targetRatio={hiddenParams?.ratio}
                  onFinish={(r) => handleFinish("tap_hidden", r)}
                />
              )}
              {screen === "stillness" && (
                <StillnessGame onFinish={(r) => handleFinish("stillness", r)} />
              )}
              {screen === "opinion" && <OpinionGame onFinish={(r) => handleFinish("opinion", r)} />}
              {screen === "doubletap" && (
                <DoubleTapGame onFinish={(r) => handleFinish("doubletap", r)} />
              )}
              {screen === "colormatch" && (
                <ColorMatchGame onFinish={(r) => handleFinish("colormatch", r)} />
              )}
              {screen === "swipe" && <SwipeGame onFinish={(r) => handleFinish("swipe", r)} />}
              {screen === "dualtap" && <DualTapGame onFinish={(r) => handleFinish("dualtap", r)} />}
            </>
          )}
        </div>
      )}

      {certData && (
        <Certificate
          {...certData}
          onClose={() => setCertData(null)}
        />
      )}

      {showHall && (
        <HallScreen
          records={records}
          totalPlays={totalPlays}
          titles={titles}
          onClose={() => setShowHall(false)}
        />
      )}

      {showProfile && (
        <ProfileScreen
          userId={userId}
          nickname={nickname}
          onSaveNickname={saveNickname}
          onRestore={restoreFromCode}
          onClose={() => setShowProfile(false)}
        />
      )}

      {pentathlonSummary && (
        <PentathlonSummary
          results={pentathlonSummary}
          onClose={() => setPentathlonSummary(null)}
        />
      )}

      <footer
        style={{
          textAlign: "center",
          padding: "24px 16px 32px",
          borderTop: "1px solid #2a2d34",
          marginTop: 20,
        }}
      >
        <a
          href="/privacy.html"
          style={{ fontSize: 11, color: "#6b6a63", textDecoration: "underline" }}
        >
          プライバシーポリシー
        </a>
      </footer>
    </div>
  );
}

const wrapStyle = {
  minHeight: "100vh",
  background: "#101216",
  color: "#e8e6df",
  fontFamily: "'Zen Kaku Gothic New', sans-serif",
};
