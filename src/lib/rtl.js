// Hebrew RTL helpers for pdfmake.
//
// Empirically verified behavior of pdfmake's engine (pdfkit + fontkit):
// 1. fontkit lays out each word fragment with direction 'rtl' and reverses the
//    glyphs of the whole fragment — so characters inside a Hebrew word come out
//    in the correct visual order on their own.
// 2. BUT pdfmake positions word fragments left-to-right in logical order, so
//    the word order of a Hebrew sentence appears reversed → we reverse the
//    word order per visual line.
// 3. fontkit's whole-fragment reversal also reverses embedded digit/latin runs
//    ("12" is drawn "21") → we pre-reverse those runs so the double reversal
//    restores them.
// 4. fontkit does not apply bidi bracket mirroring → we swap bracket pairs.
// 5. If two Hebrew words are joined by a plain space in ONE string, fontkit
//    treats the whole thing as a single bidi fragment and its glyph-reversal
//    swallows the space between them (confirmed visually: "שם החותם" renders
//    as "שםהחותם" with no gap, in every alignment/width/column combo tested).
//    Splitting each word into its own pdfmake text run (text: [{...}, {...}])
//    stops fontkit from merging them, and the gap survives everywhere.

const HEB = /[֐-׿]/
const MIRROR = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<' }
// digit/latin runs, including dates (12/07/2026), times, phones, decimals
const LTR_RUN = /[0-9A-Za-z]+(?:[/:.,\-][0-9A-Za-z]+)*/g

function fixToken(tok) {
  // Pure LTR/neutral tokens are laid out ltr by fontkit — leave untouched.
  if (!HEB.test(tok)) return tok
  let t = [...tok].map((c) => MIRROR[c] || c).join('')
  t = t.replace(LTR_RUN, (m) => [...m].reverse().join(''))
  return t
}

// Reverse word order for one visual line and emit each word as its own
// pdfmake text run (see note 5) so the space between words never collapses.
function fixLineRuns(line) {
  const parts = line.split(/(\s+)/).reverse()
  const runs = []
  let pendingSpace = ''
  for (const part of parts) {
    if (/^\s+$/.test(part)) {
      pendingSpace += part
      continue
    }
    runs.push({ text: pendingSpace + fixToken(part) })
    pendingSpace = ''
  }
  if (pendingSpace) runs.push({ text: pendingSpace })
  return runs
}

function buildRuns(lines) {
  const runs = []
  lines.forEach((line, i) => {
    if (i > 0) runs.push({ text: '\n' })
    runs.push(...fixLineRuns(line))
  })
  return runs
}

// Convert a short (single visual line) Hebrew string for pdfmake. Returns an
// array of text runs (valid as a pdfmake `text:` value) rather than a plain
// string — required to keep inter-word spacing intact, see note 5.
export function rtl(text) {
  if (text == null) return ''
  const s = String(text)
  if (!HEB.test(s)) return s
  return buildRuns(s.split('\n'))
}

// For paragraphs: pre-wrap into lines of ~maxChars so pdfmake never wraps a
// reversed line itself (which would scramble reading order across lines),
// then fix each visual line the same way as rtl().
export function rtlBlock(text, maxChars = 80) {
  if (text == null) return ''
  const s = String(text)
  if (!HEB.test(s)) return s
  const lines = []
  for (const para of s.split('\n')) {
    if (!para.trim()) {
      lines.push('')
      continue
    }
    const words = para.trim().split(/\s+/)
    let cur = ''
    for (const w of words) {
      if (cur && cur.length + 1 + w.length > maxChars) {
        lines.push(cur)
        cur = w
      } else {
        cur = cur ? cur + ' ' + w : w
      }
    }
    if (cur) lines.push(cur)
  }
  return buildRuns(lines)
}
