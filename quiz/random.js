export const randomIndex = (length, random = Math.random) => Math.min(length - 1, Math.max(0, Math.floor(random() * length)));
export const sample = (list, random = Math.random) => list[randomIndex(list.length, random)];
export function shuffle(list, random = Math.random) {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1, random);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
