/**
 * A lightweight client-side trigram similarity algorithm.
 * 
 * This mimics the behavior of PostgreSQL's `pg_trgm` extension used on the 
 * server, allowing the frontend to provide the same typo-tolerant matching 
 * for autocomplete suggestions without a network round-trip.
 */

function getTrigrams(str: string): Set<string> {
  // Pad with spaces to match pg_trgm behavior (word boundaries matter)
  const s = "  " + str.toLowerCase() + " ";
  const trigrams = new Set<string>();
  for (let i = 0; i < s.length - 2; i++) {
    trigrams.add(s.slice(i, i + 3));
  }
  return trigrams;
}

export function trigramSimilarity(query: string, target: string): number {
  const qSet = getTrigrams(query);
  const tSet = getTrigrams(target);
  
  if (qSet.size === 0 || tSet.size === 0) return 0;
  
  let intersectionSize = 0;
  for (const trgm of qSet) {
    if (tSet.has(trgm)) {
      intersectionSize++;
    }
  }
  
  // Jaccard similarity: intersection / union
  return intersectionSize / (qSet.size + tSet.size - intersectionSize);
}

/**
 * Returns a score between 0 and 1. 
 * An exact substring match returns 1.0, otherwise falls back to trigram similarity.
 */
export function fuzzyMatchScore(query: string, target: string): number {
  const q = query.trim().toLowerCase();
  const t = target.toLowerCase();
  
  if (!q) return 0;
  
  // Exact substring matches are always perfect hits for suggestions
  if (t.includes(q)) {
    return 1.0;
  }
  
  return trigramSimilarity(q, t);
}
