/** Short friendly agent names shown in terminal card headers (cnvs-style). */
export const AGENT_NAMES = [
  "Atlas", "Juno", "Miles", "Hazel", "Wren", "Otis", "Nova", "Reed",
  "Ivy", "Felix", "Luna", "Moss", "Sage", "Remy", "Cleo", "Dash",
  "Ember", "Finch", "Goldie", "Hank", "Indie", "Jett", "Koda", "Lark",
  "Maple", "Nico", "Olive", "Pico", "Quill", "Rosco", "Scout", "Tilly",
  "Umber", "Vesper", "Willa", "Ziggy",
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
