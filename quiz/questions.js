import { FOODS } from "../shiritori/dictionary.js?v=20261026-1300words";
import { PUMPKINS, PUMPKIN_FAKES, PRODUCE, HAMSTER_QUESTIONS, PREFECTURES } from "./question-bank.js?v=20261030-quiz7";
import { sample, shuffle, randomIndex } from "./random.js?v=20261030-quiz7";

export const QUESTION_COUNT = 5;
export const FOOD_NAMES = [...new Set(FOODS.map((food) => food.name))];

// Each figure crosses the box along its own route. There is deliberately no
// collision avoidance: figures pass in front of and behind one another.
function countRoute(random) {
  const route = [];
  for (let i = 0; i < 8; i++) {
    let point;
    for (let attempt = 0; attempt < 8; attempt++) {
      point = { x: 4 + random() * 75, y: 4 + random() * 75 };
      const previous = route.at(-1);
      if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) >= 30) break;
      // A bounded fallback also handles deterministic random sources in tests.
      if (attempt === 7) point = { x: previous.x < 41.5 ? 79 : 4, y: previous.y < 41.5 ? 79 : 4 };
    }
    route.push(point);
  }
  return route;
}

// Reopening this question's scene never changes the count or the figures.
export function createCountScene(count, random = Math.random) {
  return shuffle(Array.from({ length: 20 }, (_, i) => i < count ? "meg" : "gyoza"), random)
    .map((kind, slot) => ({
      kind, slot, pose: randomIndex(4, random), mirror: random() < .5,
      duration: 24 + random() * 12, delay: -random() * 36,
      route: countRoute(random),
    }));
}

export function createQuestions(random = Math.random) {
  const count = 12 + randomIndex(4, random);
  const pumpkin = sample(PUMPKINS, random);
  const produce = sample(PRODUCE, random);
  const hamster = sample(HAMSTER_QUESTIONS, random);
  return [
    { id: "food", kind: "food", text: "この中で、めぐハムの好きな食べ物はどれ？",
      choices: shuffle(FOOD_NAMES, random).slice(0, 4), answer: 0, allCorrect: true,
      explanation: "めぐハムはなんでも好き！" },
    { id: "count", kind: "count", text: "この箱の中に、めぐハムは何匹？",
      choices: ["12匹", "13匹", "14匹", "15匹"], answer: count - 12, fixedOrder: true,
      count, scene: createCountScene(count, random), explanation: `正解は${count}匹！ 餃子は数に入りません。` },
    { id: "pumpkin", kind: "pumpkin", text: "めぐハムが好きなかぼちゃ。この中で、実在するかぼちゃの品種はどれ？",
      choices: [pumpkin.name, ...shuffle(PUMPKIN_FAKES, random).slice(0, 3)], answer: 0,
      source: pumpkin.source, explanation: `「${pumpkin.name}」は実在するかぼちゃの品種です。ほかの3つは、このクイズ用の架空の名前。` },
    { id: `produce-${produce.food}`, kind: "produce", text: `めぐハムの好きな${produce.food}の生産量1位の都道府県は？`,
      choices: [produce.prefecture, ...shuffle(PREFECTURES.filter((p) => p !== produce.prefecture), random).slice(0, 3)], answer: 0,
      source: produce.source, note: `${produce.year}年産・収穫量`,
      explanation: `${produce.year}年産の${produce.food}は、収穫量で${produce.prefecture}が全国1位です。` },
    { ...hamster, kind: "hamster", choices: [...hamster.choices] },
  ];
}
