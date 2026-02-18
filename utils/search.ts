import { normalize } from "./string";

// "closest relevant suggestion" scoring
export function scoreMatch(queryRaw: string, candidateRaw: string) {
  const q = normalize(queryRaw);
  const c = normalize(candidateRaw);

  if (!q || !c) return null;

  // exact
  if (c === q) return 0;

  // starts-with
  if (c.startsWith(q)) return 10 + (c.length - q.length);

  // any word starts with q
  const words = c.split(/[\s\-_/]+/g);
  if (words.some((w) => w.startsWith(q))) return 25 + (c.length - q.length);

  // includes (earlier index is better)
  const idx = c.indexOf(q);
  if (idx >= 0) return 60 + idx + (c.length - q.length) * 0.25;

  return null;
}
