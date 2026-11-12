// Draw > Ink Replay: redraws the ink strokes on the current slide one after another.

/** Animates every ink stroke of the slide in the editor, in the order they were drawn. */
export function replayInk(secondsPerStroke = 0.8) {
  const paths = Array.from(document.querySelectorAll<SVGPathElement>('.canvas-scroll .el-ink path:not(.hit)'))
  paths.forEach((path, i) => {
    const length = path.getTotalLength?.() ?? 1000
    path.getAnimations?.().forEach((a) => a.cancel())
    path.animate?.([{ strokeDasharray: `${length}`, strokeDashoffset: `${length}` }, { strokeDasharray: `${length}`, strokeDashoffset: '0' }], { duration: secondsPerStroke * 1000, delay: i * secondsPerStroke * 1000, fill: 'backwards', easing: 'linear' })
  })
  return paths.length
}
