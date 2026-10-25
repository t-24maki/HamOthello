export const CHARACTERS = [
  { id: "tak", name: "たくハム" },
  { id: "meg", name: "めぐハム" },
  { id: "ham", name: "ノーマルハム" },
  { id: "tapi", name: "たぴ" },
];

export const isCharacter = (id) => CHARACTERS.some((character) => character.id === id);

export function tableCharacters(own, guest = null) {
  if (!isCharacter(own) || (guest !== null && !isCharacter(guest)))
    throw new Error("Invalid character selection.");
  const humans = guest === null ? [own] : [own, guest];
  return [...humans, ...CHARACTERS.map((c) => c.id).filter((id) => !humans.includes(id))].slice(
    0,
    4,
  );
}

function hasConflictingDraws(role) {
  if (role.rank >= 2) return false;
  return role.sorted.some((odd, i) => {
    const [a, b] = role.sorted.filter((_, j) => j !== i);
    if (a.metal !== b.metal || odd.metal === a.metal) return false;
    // Discarding the odd color must break the existing consecutive pair.
    return (
      Math.abs(a.value - b.value) !== 1 &&
      [a, b].some((card) => Math.abs(card.value - odd.value) === 1)
    );
  });
}

// Read the evaluated ORIGINAL hand only; never inspect the deck or other seats.
export function initialExpression(character, role) {
  const number = role.sorted[0].value;
  if (character === "tak" && role.rank === 0 && number <= 7) return "sad";
  if (character === "meg" && role.sorted.filter((card) => card.metal === "gold").length >= 2)
    return "happy";
  if (character === "ham" && hasConflictingDraws(role)) return "worried";
  if (character === "tapi" && role.rank >= 2) return "friends";
  return "neutral";
}
export function validExpression(character, expression) {
  return (
    expression === "neutral" ||
    { tak: "sad", meg: "happy", ham: "worried", tapi: "friends" }[character] === expression
  );
}
export function expressionDescription(character, expression) {
  return (
    {
      sad: "マズイ…と焦っている顔",
      happy: "嬉しそうな顔",
      worried: "悩ましい顔",
      friends: "青色と黄色の仲間といっしょ",
    }[expression] ?? "いつもどおり"
  );
}
