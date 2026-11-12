import type { Editor } from '@tiptap/core'

// Layout › Hyphenation › Manual: optional (soft) hyphens in long words, at syllable boundaries found
// with simple English rules, so that the words can break at the end of a line.

const VOWEL = /[aeiouy]/i

/** Positions inside `word` where a hyphen may go (never within the first or last two letters). */
export function hyphenPoints(word: string): number[] {
  if (word.length < 7 || !/^[A-Za-z]+$/.test(word)) return []
  const points: number[] = []
  for (let i = 2; i < word.length - 2; i++) {
    const [a, b, c] = [word[i - 1], word[i], word[i + 1]]
    // Between two consonants that follow a vowel (VC-CV), or before a consonant between vowels (V-CV).
    const vccv = VOWEL.test(word[i - 2] ?? '') && !VOWEL.test(a) && !VOWEL.test(b) && VOWEL.test(c) && !/^(ch|sh|th|ph|wh|ck|ng)$/i.test(a + b)
    const vcv = VOWEL.test(a) && !VOWEL.test(b) && VOWEL.test(c) && i > 2
    if ((vccv || vcv) && (!points.length || i - points[points.length - 1] >= 2)) points.push(i)
  }
  return points
}

/** Adds soft hyphens to the long words of the selection (or the whole document). Returns how many words changed. */
export function hyphenateManually(editor: Editor) {
  const { state } = editor
  const { from, to, empty } = state.selection
  const [start, end] = empty ? [0, state.doc.content.size] : [from, to]
  const tr = state.tr
  let words = 0
  state.doc.nodesBetween(start, end, (node, pos) => {
    if (!node.isText || !node.text) return
    for (const m of node.text.matchAll(/[A-Za-z]{7,}/g)) {
      const at = pos + (m.index ?? 0)
      if (at < start || at + m[0].length > end || m[0].includes('­')) continue
      const points = hyphenPoints(m[0])
      if (!points.length) continue
      words++
      for (const p of [...points].reverse()) tr.insertText('­', tr.mapping.map(at + p))
    }
  })
  if (words) editor.view.dispatch(tr)
  return words
}
