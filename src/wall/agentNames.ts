/** Short, easy-to-pronounce agent names (spoken to/by the voice agent). */
export const AGENT_NAMES = [
  "Max", "Leo", "Mia", "Zoe", "Ben", "Sam", "Ruby", "Toby",
  "Milo", "Nina", "Coco", "Daisy", "Finn", "Lily", "Oscar", "Penny",
  "Rosie", "Sunny", "Teddy", "Bella", "Charlie", "Ellie", "Jack", "Lucy",
  "Ollie", "Poppy", "Archie", "Holly", "Louie", "Maggie", "Frankie", "Winnie",
];

/** Picks a random name not in `taken`; suffixes a counter once all are in use. */
export function pickAgentName(taken: string[], rand: () => number = Math.random): string {
  const free = AGENT_NAMES.filter((n) => !taken.includes(n));
  if (free.length > 0) return free[Math.floor(rand() * free.length)];
  const base = AGENT_NAMES[Math.floor(rand() * AGENT_NAMES.length)];
  let i = 2;
  while (taken.includes(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}
