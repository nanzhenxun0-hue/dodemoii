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
    desc: "打ち始めた瞬間から入力内容は見えなくなり、3秒後に自動確定。見えないまま、ちょうど1文字で打ち切れるか。",
    specialTitle: "一文字の求道者",
    lowerIsBetter: true,
  },
};
const GAME_ORDER = ["timing", "tap", "coin", "power", "janken", "onechar"];

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

function computeTitles(records, totalPlays) {
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
      perfectCount++;
    }
  });

  const allThree = Object.values(GAMES).every(
    (g) => records[g.id] && loadStars(records[g.id]) >= 3
  );
  if (allThree) titles.push("何をしているんだ君は");

  if (perfectCount >= 3 && totalPlays >= 20) {
    titles.push("👑 世界一どうでもいい人間");
  }
  return Array.from(new Set(titles));
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
async function submitToLeaderboard(gameId, result) {
  try {
    await addDoc(collection(db, "leaderboard_" + gameId), {
      statValue: result.statValue,
      stars: result.stars,
      rawValue: result.rawValue,
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    // オフライン・未設定時は静かに諦める(ローカル記録は残る)
  }
}

async function fetchLeaderboard(gameId, lowerIsBetter) {
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

// ============ ミニゲーム: 10秒ぴったり ============
function TimingGame({ onFinish }) {
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
    const error = Math.abs(final - 10);
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

  const near = phase === "running" && Math.abs(elapsed - 10) < 0.5;

  return (
    <div style={{ textAlign: "center" }}>
      <div
        className={near ? "glow-pulse" : undefined}
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 56,
          margin: "40px 0 30px",
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

// ============ ミニゲーム: 画面中心タップ ============
function TapCenterGame({ onFinish }) {
  const areaRef = useRef(null);
  const [mark, setMark] = useState(null);

  const handleTap = (e) => {
    if (mark) return;
    playTap();
    const rect = areaRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const dist = Math.hypot(x - cx, y - cy);
    const maxDist = Math.hypot(cx, cy);
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
        statLabel: "中心からの誤差",
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
          left: "50%",
          top: "50%",
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
      statLabel: "入力文字数",
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
        ちょうど1文字で確定できれば最高評価。多くても少なくても評価は下がる。
      </div>
      <button onClick={finalize} disabled={phase !== "typing"} style={btnStyle("#b8342a")}>
        {phase === "done" ? "審査終了" : phase === "typing" ? "今すぐ確定する" : "入力待ち"}
      </button>
    </div>
  );
}

// ============ オンラインランキング画面 ============
function LeaderboardScreen({ game, onBack }) {
  const [state, setState] = useState("loading"); // loading, ok, error
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchLeaderboard(game.id, game.lowerIsBetter);
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
  }, [game.id]);

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
      <div style={{ fontFamily: "'Shippori Mincho', serif", fontSize: 16, marginBottom: 12 }}>
        🏆 {game.name} オンラインランキング
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
          まだ誰も記録を残していません。一番乗りのチャンス。
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
            <span style={{ fontFamily: "'JetBrains Mono', monospace", flex: 1, marginLeft: 8 }}>
              {r.statValue}
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

      {Object.values(GAMES).map((g) => {
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

export default function App() {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState({});
  const [totalPlays, setTotalPlays] = useState(0);
  const [screen, setScreen] = useState("hub"); // hub, timing, tap, coin
  const [certData, setCertData] = useState(null);
  const [showTitles, setShowTitles] = useState(false);
  const [incomingChallenge, setIncomingChallenge] = useState(null);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showHall, setShowHall] = useState(false);
  const [pentathlon, setPentathlon] = useState(null); // { index, results }
  const [pentathlonSummary, setPentathlonSummary] = useState(null);
  const [titleToast, setTitleToast] = useState(null);
  const prevTitlesRef = useRef(null);

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
    } catch (e) {
      // no record yet
    }
    setLoading(false);
  }, []);

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

  useEffect(() => {
    const current = computeTitles(records, totalPlays);
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
  }, [records, totalPlays]);

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
    submitToLeaderboard(gameId, result);

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

  const titles = computeTitles(records, totalPlays);

  const startPentathlon = () => {
    playTap();
    setPentathlon({ index: 0, results: [] });
    setScreen(GAME_ORDER[0]);
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
          第{Object.keys(GAMES).length}種の審査項目 ／ 通算受審 {totalPlays} 回
        </div>
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
          </div>

          {Object.values(GAMES).map((g, i) => {
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
            <LeaderboardScreen game={GAMES[screen]} onBack={() => setShowLeaderboard(false)} />
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
