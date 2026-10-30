import { createGame, transition, QUESTION_COUNT, currentQuestion, LETTERS, REWARDS, score, reward } from "./rules.js?v=20261030-quiz10";
import { performer, phoneMeg, seedIcon, dumpling } from "./art.js?v=20261030-quiz7";
import { portrait } from "../baccarat/art.js?v=20261024-baccarat4";
import { CueClock } from "./timeline.js?v=20261030-quiz2";

const $ = (id) => document.getElementById(id);
const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
let state = createGame(), clock = null, menuOpen = false, audio = null, sound = false, last = performance.now();
const paused = () => menuOpen || $("rules").open || $("count-dialog").open || $("explanation-dialog").open || document.hidden;
const sounds = { select: [440, 554], tick: [185], right: [523, 659, 784, 1047], wrong: [330, 294, 262], phone: [659, 784, 659], help: [523, 698] };
function tone(name) {
  if (!sound || paused()) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume().catch(() => {});
    (sounds[name] || sounds.select).forEach((frequency, i) => {
      const oscillator = audio.createOscillator(), gain = audio.createGain(), start = audio.currentTime + i * .13;
      oscillator.type = "sine"; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(.06, start + .015); gain.gain.exponentialRampToValueAtTime(.0001, start + .24);
      oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(start); oscillator.stop(start + .26);
    });
  } catch { sound = false; updateSound(); }
}
function updateSound() { $("sound").textContent = `音 ${sound ? "ON" : "OFF"}`; $("sound").setAttribute("aria-pressed", String(sound)); }
function say(text) { $("speech").textContent = text; }
function act(action) {
  if (paused()) return false;
  const next = transition(state, action);
  if (next === state) return false;
  state = next; render();
  if (state.phase === "count-intro") introduceCountBox();
  return true;
}
function animate(cues, { dialogue = false } = {}) {
  // Reduced motion need not shorten the time available to read a new line.
  const factor = reduced.matches && !dialogue ? .28 : 1;
  clock = new CueClock(cues.map(([at, run]) => ({ at: at * factor, run })));
  $("skip").hidden = false;
}
function endAnimation() { clock = null; $("skip").hidden = true; }
function cast(tak, meg) { $("tak").innerHTML = performer("tak", tak); $("meg").innerHTML = performer("meg", meg); }
function renderAudience(pose = "neutral", cheer = false) {
  $("audience").innerHTML = state.audience.map((c, i) => `<div class="spectator${cheer ? " cheer" : ""}" data-character="${c}" data-facing="${c === "ham" && i > 4 ? "left" : "right"}" style="--delay:${i * -.11}s" aria-label="${{ meg: "めぐハム", ham: "ノーマルハム", tapi: "たぴ" }[c]}"><div class="spectator-figure">${portrait(c, pose)}<span class="paddle" aria-hidden="true"></span></div></div>`).join("");
}
function showVotes(count) {
  [...$("audience").children].forEach((el, i) => {
    const raised = i < count;
    el.classList.toggle("raised", raised);
    el.querySelector(".paddle").textContent = raised ? LETTERS[state.votes[i]] : "";
    if (raised) el.setAttribute("aria-label", `${el.dataset.character === "meg" ? "めぐハム" : el.dataset.character === "ham" ? "ノーマルハム" : "たぴ"}の意見：${LETTERS[state.votes[i]]}`);
  });
}
function burst() {
  $("confetti").innerHTML = Array.from({ length: 25 }, (_, i) => `<i style="--x:${(i * 37) % 100}%;--c:${["#f0c366", "#e9b0bc", "#b9c99d", "#c4b1e1"][i % 4]};--d:${(i % 7) * .07}s"></i>`).join("");
}
function render() {
  const phase = state.phase, q = currentQuestion(state), result = phase === "result", final = phase === "finished";
  const correct = state.answers.at(-1)?.correct;
  const joke = result && q.allCorrect;
  $("show").dataset.joke = String(Boolean(joke));
  $("count-open").hidden = q.kind !== "count" || phase !== "question";
  $("explanation-open").hidden = !result || q.kind === "food";
  $("explanation-open").textContent = `${correct ? "正解！" : "ざんねん！"} 解説 ›`;
  $("guide").hidden = result && q.kind !== "food";
  $("show").dataset.phase = phase;
  $("show").dataset.votes = String(Boolean(state.votes) && ["question", "audience"].includes(phase));
  $("show").dataset.outcome = result ? correct ? "correct" : "wrong" : "";
  $("intro").hidden = phase !== "intro"; $("play").hidden = phase === "intro" || final; $("finish").hidden = !final;
  $("call-scene").hidden = phase !== "phone";
  $("confetti").innerHTML = "";
  $("seed-count").textContent = reward(state);
  $("progress").innerHTML = Array.from({ length: QUESTION_COUNT }, (_, i) => {
    const a = state.answers[i], current = i === state.index && phase !== "intro" && !final;
    return `<span class="${a ? a.correct ? "correct" : "wrong" : current ? "current" : ""}" aria-label="第${i + 1}問${a ? a.correct ? ' 正解' : ' 不正解' : current ? ' 挑戦中' : ''}">${a ? a.correct ? "○" : "×" : i + 1}</span>`;
  }).join("");
  cast(joke ? "deadpan" : result ? correct ? 2 : 3 : ["confirm", "suspense"].includes(phase) ? 1 : final ? score(state) >= 3 ? 2 : 0 : 0, result ? correct ? 2 : 3 : phase === "suspense" ? 1 : final ? 2 : 0);
  renderAudience(result ? correct ? "win" : "lose" : final ? "win" : "neutral", (result && correct) || final);
  if (state.votes && phase === "question") showVotes(state.audience.length);
  if (phase === "intro") { say("ようこそ。司会の、めぐハムです。"); return; }
  if (final) {
    $("final-score").textContent = `${score(state)} / 5`;
    $("final-seeds").textContent = reward(state);
    $("final-message").textContent = ["参加賞は、めぐハムたちの大きな拍手！", "ひと粒ずつ、大事に食べよう。", "おやつの時間が楽しみだね。", "たくハム、なかなかやりますね。", "あと一問！ でも、お皿はいっぱい。", "全問正解！ 今日はひまわりの種まつり！"][score(state)];
    $("seed-bowl").innerHTML = Array.from({ length: score(state) * 5 }, (_, i) => `<span style="--x:${20 + (i * 17) % 105}px;--y:${(i % 4) * 4 - 4}px;--r:${(i * 41) % 100 - 50}deg">${seedIcon()}</span>`).join("");
    say("また来てくださいね。めぐハム一同より。"); burst(); tone("right"); return;
  }
  $("question-number").textContent = `第${state.index + 1}問`;
  $("question").textContent = q.text;
  $("question-note").textContent = q.note || ""; $("question-note").hidden = !q.note;
  $("choices").innerHTML = q.choices.map((choice, i) => {
    const removed = state.removed.includes(i), chosen = state.selected === i;
    const cls = ["choice", removed ? "eliminated" : "", chosen ? "selected" : "", result && q.correctChoices.includes(i) ? "right" : "", result && chosen && !correct ? "wrong" : ""].filter(Boolean).join(" ");
    return `<button class="${cls}" data-choice="${i}" ${phase !== "question" || removed ? "disabled" : ""} aria-pressed="${chosen}" aria-label="${LETTERS[i]}：${removed ? '50:50で消えた答え' : escape(choice)}${result && q.correctChoices.includes(i) ? ' 正解' : ''}"><span class="letter">${LETTERS[i]}</span><span class="answer">${escape(choice)}</span><span class="mark">${result && q.correctChoices.includes(i) ? "○" : result && chosen ? "×" : ""}</span></button>`;
  }).join("");
  $("back").hidden = phase !== "confirm";
  $("advance").hidden = !["confirm", "result"].includes(phase);
  $("advance").textContent = phase === "confirm" ? "ファイナルハムスター！" : !correct ? "1問目からやりなおす" : state.index === 4 ? "もらえる種を見る →" : "次の問題へ →";
  $("guide").textContent = phase === "count-intro" ? "箱の中を、よく見てね。" : phase === "fifty" ? "50:50で、2択に絞ります。" : phase === "confirm" ? "この答えで、いい？" : phase === "suspense" ? "めぐハム、ためています……" : result ? q.allCorrect ? "どれを選んでも、正解！" : `${correct ? '正解！' : 'ざんねん！'} 答えは ${LETTERS[q.answer]}` : phase === "audience" ? "観客のみんな、札をどうぞ！" : phase === "phone" ? "めぐハム4匹に、電話で相談中。" : state.call ? `電話の意見：${state.call.map((v) => v === null ? "分からない" : LETTERS[v]).join('・')}` : state.votes ? `観客の意見：${LETTERS.map((v,i) => `${v} ${state.votes.filter((n) => n === i).length}匹`).join(' / ')}` : "答えを1つ選ぼう。困ったらライフライン。";
  document.querySelectorAll("[data-help]").forEach((button) => {
    const used = state.used[button.dataset.help];
    button.disabled = phase !== "question" || used; button.dataset.used = String(used);
    button.querySelector("span").textContent = used ? "使用済み" : { fifty: "2択にする", audience: "オーディエンス", phone: "テレフォン" }[button.dataset.help];
    button.setAttribute("aria-label", `${{ fifty: "50:50", audience: "オーディエンス", phone: "テレフォン" }[button.dataset.help]}${used ? ' 使用済み' : ' 残り1回'}`);
  });
  if (phase === "question") say(state.votes ? "みんなの意見。信じるかは、たくハム次第です。" : state.call ? "めぐハムが多くて、すみません。" : state.index === 0 ? "まずは、肩ならしの問題です。" : ["", "落ち着いて、どうぞ。", "まだまだ、種は増やせますよ。", "客席も、そわそわしてきました。", "いよいよ最後。ファイナルな一問です。"][state.index]);
  if (phase === "confirm") say(`「${q.choices[state.selected]}」で、ファイナルハムスター？`);
  if (phase === "result") {
    say(q.allCorrect ? "めぐハムはなんでも好き！" : correct ? ["正解です！ 拍手〜！", "お見事！ 種が増えました。", "正解！ めぐハムも、うれしいです。"][state.index % 3] : "ざんねん……1問目から、もう一度！" );
    if (correct) burst();
  }
}
function introduceCountBox() {
  say("まずはこちらをご覧ください。");
  animate([[1800, () => {
    endAnimation();
    if (act({ type: "count-ready" })) openCountBox();
  }]], { dialogue: true });
}
function openCountBox() {
  const q = currentQuestion(state);
  if (q.kind !== "count" || state.phase !== "question" || paused()) return;
  $("count-box").innerHTML = q.scene.map((item, i) => {
    const art = item.kind === "meg" ? performer("meg", item.pose, `count-${i}`) : dumpling(item.pose, i);
    const route = item.route.map((p, n) => `--x${n}:${p.x}%;--y${n}:${p.y}%`).join(";");
    return `<div class="count-figure" data-kind="${item.kind}" style="${route};--still-x:${7 + (item.slot % 4) * 23}%;--still-y:${6 + Math.floor(item.slot / 4) * 18}%;--duration:${item.duration}s;--delay:${item.delay}s;--flip:${item.mirror ? -1 : 1}" aria-label="${item.kind === "meg" ? "めぐハム" : "餃子"}"><div class="count-motion"><div class="count-facing">${art}</div></div></div>`;
  }).join("");
  $("count-dialog").showModal(); syncPause();
}
function suspense() {
  say("ファイナルハムスター！"); tone("tick");
  animate([
    [1400, () => { say("本当に……それで……？"); tone("tick"); }],
    [3100, () => { say("正解は…………。"); tone("tick"); }],
    [4800 + state.index * 180, () => { endAnimation(); act({ type: "reveal" }); tone(state.answers.at(-1).correct ? "right" : "wrong"); }],
  ]);
}
function fiftyHelp() {
  say("それでは間違いを2つ消します！"); tone("help");
  animate([[1600, () => {
    endAnimation();
    if (act({ type: "help-done" })) {
      say("残った2つ。どちらを選びますか？"); tone("select");
    }
  }]], { dialogue: true });
}
function audienceHelp() {
  say("オーディエンスのみなさん、お願いします！"); tone("help");
  animate([
    ...state.audience.map((_, i) => [1100 + i * 180, () => showVotes(i + 1)]),
    [3600, () => { endAnimation(); act({ type: "help-done" }); }],
  ], { dialogue: true });
}
function telephone() {
  say(""); $("call-status").textContent = "呼び出し中…"; $("call-line").textContent = "それでは、めぐハムたちに電話してみましょう。";
  $("phone-friends").innerHTML = state.call.map((_, i) => `<div class="phone-friend">${phoneMeg(i)}<span class="phone-label"></span></div>`).join("");
  tone("phone");
  const unsureLines = ["ごめんね、分からないな。", "うーん……分からない！", "わたしも、分からないよ〜。", "もぐもぐ……ごめん、分からない。謎だね。"];
  const lines = ["もしもし！ わたしは{letter}！", "ええと……{letter}だと思うな。", "わたしも答える！ {letter}！", "もぐもぐ……たぶん、{letter}だよ。"];
  animate([
    [1500, () => { $("call-status").textContent = "つながりました"; $("call-line").textContent = "めぐハムです！ めぐハムです！ めぐ……"; tone("phone"); }],
    ...state.call.map((answer, i) => [2300 + i * 1650, () => {
      [...$("phone-friends").children].forEach((el, n) => { el.classList.toggle("active", n === i); el.classList.toggle("spoken", n <= i); });
      const label = $("phone-friends").children[i].querySelector(".phone-label");
      label.textContent = answer === null ? "?" : LETTERS[answer];
      label.classList.toggle("unsure", answer === null);
      $("call-line").textContent = answer === null ? unsureLines[i] : lines[i].replace("{letter}", LETTERS[answer]); tone("select");
    }]),
    [9500, () => { endAnimation(); act({ type: "help-done" }); }],
  ], { dialogue: true });
}
$("start").addEventListener("click", () => { act({ type: "start" }); tone("help"); });
$("restart").addEventListener("click", () => { endAnimation(); act({ type: "restart" }); tone("help"); });
$("choices").addEventListener("click", (e) => { const button = e.target.closest("[data-choice]"); if (button && act({ type: "choose", choice: Number(button.dataset.choice) })) tone("select"); });
$("back").addEventListener("click", () => act({ type: "back" }));
$("advance").addEventListener("click", () => {
  if (state.phase === "confirm" && act({ type: "lock" })) suspense();
  else if (state.phase === "result") act({ type: "next" });
});
$("lifelines").addEventListener("click", (e) => {
  const button = e.target.closest("[data-help]");
  if (!button || !act({ type: "help", kind: button.dataset.help })) return;
  if (button.dataset.help === "audience") audienceHelp();
  else if (button.dataset.help === "phone") telephone();
  else fiftyHelp();
});
$("skip").addEventListener("click", () => { if (clock && !paused()) { const old = clock; for (const cue of old.advance(100000)) cue.run(); } });
$("sound").addEventListener("click", () => { sound = !sound; if (sound) tone("select"); else audio?.suspend().catch(() => {}); updateSound(); });
$("rules-open").addEventListener("click", () => { $("rules").showModal(); syncPause(); });
$("rules-close").addEventListener("click", () => $("rules").close());
$("rules").addEventListener("close", () => { syncPause(); $("rules-open").focus({ preventScroll: true }); });
$("count-open").addEventListener("click", openCountBox);
for (const id of ["count-close", "count-answer"]) $(id).addEventListener("click", () => $("count-dialog").close());
$("count-dialog").addEventListener("close", () => {
  syncPause(); $("count-open").focus({ preventScroll: true });
  say("数えられましたか？ 餃子は数に入れませんよ。");
});
$("explanation-open").addEventListener("click", () => {
  const q = currentQuestion(state);
  $("explanation-text").textContent = q.explanation;
  $("explanation-source").hidden = !q.source;
  if (q.source) $("explanation-source").href = q.source;
  $("explanation-dialog").showModal(); syncPause();
});
$("explanation-close").addEventListener("click", () => $("explanation-dialog").close());
$("explanation-dialog").addEventListener("close", () => { syncPause(); $("explanation-open").focus({ preventScroll: true }); });
$("prizes").innerHTML = REWARDS.map((n,i) => `<span>${i}問正解<b>${n} 粒</b></span>`).join("");
function syncPause() { $("count-dialog").classList.toggle("paused", document.hidden); $("show").classList.toggle("paused", paused()); if (paused()) audio?.suspend().catch(() => {}); else if (sound) audio?.resume().catch(() => {}); }
window.addEventListener("takumegu-menu", (e) => { menuOpen = e.detail.open; syncPause(); });
document.addEventListener("visibilitychange", syncPause);
function frame(now) {
  const ms = Math.min(100, now - last); last = now;
  if (clock) { const old = clock; for (const cue of old.advance(ms, paused())) cue.run(); }
  requestAnimationFrame(frame);
}
render(); requestAnimationFrame(frame);
