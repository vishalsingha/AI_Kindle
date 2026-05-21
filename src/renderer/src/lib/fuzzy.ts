// Tiny fuzzy matcher — returns a score (higher = better) or -1 if no match.
// Matches subsequence chars, rewards consecutive matches, word starts, and
// exact substring hits. Designed for <10k items; no pre-indexing needed.

export function fuzzyScore(text: string, query: string): number {
  if (!query) return 0
  const t = text.toLowerCase()
  const q = query.toLowerCase()

  // Exact substring is the best-case match.
  const directIdx = t.indexOf(q)
  if (directIdx !== -1) {
    // Earlier matches beat later ones; word-start matches beat mid-word.
    const wordStartBonus = directIdx === 0 || /\s/.test(t[directIdx - 1] ?? '') ? 50 : 0
    return 1000 - directIdx + wordStartBonus
  }

  // Subsequence match.
  let ti = 0
  let qi = 0
  let score = 0
  let consecutive = 0
  let prevMatched = false
  while (ti < t.length && qi < q.length) {
    if (t[ti] === q[qi]) {
      score += 10
      if (prevMatched) consecutive++
      score += consecutive * 5
      // Bonus when matching the first char of a word.
      if (ti === 0 || /[\s\-_.]/.test(t[ti - 1])) score += 8
      qi++
      prevMatched = true
    } else {
      prevMatched = false
      consecutive = 0
    }
    ti++
  }
  if (qi < q.length) return -1
  // Penalize long strings slightly — prefer concise matches.
  return score - Math.floor(t.length / 50)
}

export interface Scored<T> {
  item: T
  score: number
}

export function fuzzyFilter<T>(items: T[], query: string, getText: (t: T) => string): Scored<T>[] {
  if (!query.trim()) return items.map((item) => ({ item, score: 0 }))
  const results: Scored<T>[] = []
  for (const item of items) {
    const s = fuzzyScore(getText(item), query)
    if (s >= 0) results.push({ item, score: s })
  }
  results.sort((a, b) => b.score - a.score)
  return results
}
