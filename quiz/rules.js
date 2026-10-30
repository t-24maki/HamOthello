import { createQuestions, QUESTION_COUNT } from "./questions.js?v=20261030-quiz8";
import { shuffle, sample } from "./random.js?v=20261030-quiz7";
export { QUESTION_COUNT, shuffle };
export const LETTERS = ["A", "B", "C", "D"];
export const REWARDS = [0, 10, 30, 60, 100, 200];
export const AUDIENCE = ["meg", "meg", "meg", "meg", "meg", "ham", "tapi", "tapi", "tapi"];
export const AUDIENCE_ACCURACY = [70, 60, 50, 40, 30];
export const PHONE_ACCURACY = [60, 50, 40, 30, 20];
export const PHONE_UNSURE = [0, 10, 20, 30, 40];
export const AUDIENCE_ACCURACY_AFTER_FIFTY = [75, 70, 65, 60, 55];
export const PHONE_ACCURACY_AFTER_FIFTY = [80, 70, 60, 50, 40];
export const PHONE_UNSURE_AFTER_FIFTY = [0, 0, 5, 15, 25];
export const createGame = (random = Math.random) => ({
  phase: "intro", index: 0, selected: null, answers: [], removed: [], pendingRemoved: null,
  used: { fifty: false, audience: false, phone: false }, votes: null, call: null,
  questions: createQuestions(random), audience: shuffle(AUDIENCE, random), order: shuffle([0, 1, 2, 3], random),
});
// Choices, answers and all help use the same presentation order for this question.
// Render, confirmation and help never shuffle the order a second time.
export function currentQuestion(s) {
  const q = s.questions[s.index];
  return { ...q, choices: s.order.map((i) => q.choices[i]), answer: s.order.indexOf(q.answer),
    correctChoices: q.allCorrect ? [0, 1, 2, 3] : [s.order.indexOf(q.answer)] };
}
export const score = (s) => s.answers.filter((a) => a.correct).length;
export const reward = (s) => REWARDS[score(s)];
const available = (s) => [0, 1, 2, 3].filter((n) => !s.removed.includes(n));
const newAttempt = (random) => ({ ...createGame(random), phase: "question" });
export function transition(s, action, random = Math.random) {
  const q = currentQuestion(s);
  if (action.type === "start" && s.phase === "intro") return { ...s, phase: "question" };
  if (action.type === "count-ready" && s.phase === "count-intro") return { ...s, phase: "question" };
  if (action.type === "choose" && s.phase === "question" && available(s).includes(action.choice)) return { ...s, phase: "confirm", selected: action.choice };
  if (action.type === "back" && s.phase === "confirm") return { ...s, phase: "question", selected: null };
  if (action.type === "lock" && s.phase === "confirm") return { ...s, phase: "suspense" };
  if (action.type === "reveal" && s.phase === "suspense") return { ...s, phase: "result", answers: [...s.answers, { choice: s.selected, correct: q.correctChoices.includes(s.selected) }] };
  if (action.type === "next" && s.phase === "result") {
    // Let the player see the wrong answer and reaction before restarting.
    if (!s.answers.at(-1).correct) return newAttempt(random);
    if (s.index === QUESTION_COUNT - 1) return { ...s, phase: "finished" };
    const next = s.questions[s.index + 1];
    return { ...s, phase: next.kind === "count" ? "count-intro" : "question", index: s.index + 1, selected: null, removed: [], pendingRemoved: null, votes: null, call: null, order: next.fixedOrder ? [0, 1, 2, 3] : shuffle([0, 1, 2, 3], random) };
  }
  if (action.type === "restart" && s.phase === "finished") return newAttempt(random);
  if (action.type === "help-done" && s.phase === "fifty") return { ...s, phase: "question", removed: s.pendingRemoved, pendingRemoved: null };
  if (action.type === "help-done" && ["audience", "phone"].includes(s.phase)) return { ...s, phase: "question" };
  if (action.type !== "help" || s.phase !== "question" || !Object.hasOwn(s.used, action.kind) || s.used[action.kind]) return s;
  const used = { ...s.used, [action.kind]: true };
  if (action.kind === "fifty") {
    // Decide once, but keep all four choices visible until the host finishes speaking.
    if (q.allCorrect) return { ...s, used, phase: "fifty", pendingRemoved: shuffle(available(s), random).slice(0, 2), votes: null, call: null };
    const wrong = [0, 1, 2, 3].filter((n) => n !== q.answer);
    const keep = sample(wrong, random);
    return { ...s, used, phase: "fifty", pendingRemoved: wrong.filter((n) => n !== keep), votes: null, call: null };
  }
  const wrong = available(s).filter((n) => !q.correctChoices.includes(n));
  // Only this question's eliminated choices enable the boost; used.fifty also
  // stays true on later questions, where the original probabilities apply.
  const afterFifty = s.removed.length === 2;
  const opinion = (correct, unsure = 0) => {
    // The opening joke has no wrong option, including for helpers.
    if (!wrong.length) return sample(available(s), random);
    const roll = random() * 100;
    if (roll < correct) return q.answer;
    if (roll < correct + unsure) return null;
    return sample(wrong, random);
  };
  if (action.kind === "audience") {
    const accuracy = afterFifty ? AUDIENCE_ACCURACY_AFTER_FIFTY : AUDIENCE_ACCURACY;
    return { ...s, used, phase: "audience", call: null, votes: s.audience.map(() => opinion(accuracy[s.index])) };
  }
  const accuracy = afterFifty ? PHONE_ACCURACY_AFTER_FIFTY : PHONE_ACCURACY;
  const unsure = afterFifty ? PHONE_UNSURE_AFTER_FIFTY : PHONE_UNSURE;
  return { ...s, used, phase: "phone", votes: null, call: Array.from({ length: 4 }, () => opinion(accuracy[s.index], unsure[s.index])) };
}
