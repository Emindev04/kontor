// Remove Background: finds the picture's background by growing regions from the edges (and from
// points the user marked for removal) over pixels close to the edge colors, stopping at points the
// user marked to keep. Works on raw RGBA pixels, so it runs anywhere (also in the unit tests).

export type Marks = { keep: [number, number][]; remove: [number, number][] }

/** Up to `k` representative colors of the picture's border (simple k-means). */
export function borderColors(data: Uint8ClampedArray, w: number, h: number, k = 4): [number, number, number][] {
  const samples: [number, number, number][] = []
  const step = Math.max(1, Math.floor((2 * (w + h)) / 400))
  const push = (x: number, y: number) => {
    const i = (y * w + x) * 4
    if (data[i + 3] > 16) samples.push([data[i], data[i + 1], data[i + 2]])
  }
  for (let x = 0; x < w; x += step) {
    push(x, 0)
    push(x, h - 1)
  }
  for (let y = 0; y < h; y += step) {
    push(0, y)
    push(w - 1, y)
  }
  if (!samples.length) return []
  let centers = samples.filter((_, i) => i % Math.max(1, Math.floor(samples.length / k)) === 0).slice(0, k)
  for (let iter = 0; iter < 8; iter++) {
    const sums = centers.map(() => [0, 0, 0, 0])
    for (const s of samples) {
      let best = 0
      let bd = Infinity
      centers.forEach((c, j) => {
        const d = dist2(s, c)
        if (d < bd) {
          bd = d
          best = j
        }
      })
      const t = sums[best]
      t[0] += s[0]
      t[1] += s[1]
      t[2] += s[2]
      t[3]++
    }
    centers = sums.filter((t) => t[3] > 0).map((t) => [t[0] / t[3], t[1] / t[3], t[2] / t[3]] as [number, number, number])
  }
  return centers
}

function dist2(a: ArrayLike<number>, b: ArrayLike<number>) {
  const dr = a[0] - b[0]
  const dg = a[1] - b[1]
  const db = a[2] - b[2]
  return dr * dr + dg * dg + db * db
}

/**
 * Background mask: 1 for background pixels, 0 for the picture's subject. `tolerance` (0–100) is how
 * far a color may be from the background colors.
 */
export function backgroundMask(data: Uint8ClampedArray, w: number, h: number, tolerance = 30, marks: Marks = { keep: [], remove: [] }): Uint8Array {
  const mask = new Uint8Array(w * h)
  const refs = borderColors(data, w, h)
  // Points marked for removal add their own colors as background colors.
  for (const [x, y] of marks.remove) {
    const i = (Math.min(h - 1, Math.max(0, Math.round(y))) * w + Math.min(w - 1, Math.max(0, Math.round(x)))) * 4
    refs.push([data[i], data[i + 1], data[i + 2]])
  }
  const limit = (tolerance / 100) * 441.7
  const lim2 = limit * limit
  const keepR = Math.max(4, Math.round(Math.min(w, h) * 0.04))
  const blocked = new Uint8Array(w * h)
  for (const [kx, ky] of marks.keep) {
    for (let y = Math.max(0, Math.round(ky) - keepR); y <= Math.min(h - 1, Math.round(ky) + keepR); y++)
      for (let x = Math.max(0, Math.round(kx) - keepR); x <= Math.min(w - 1, Math.round(kx) + keepR); x++) if ((x - kx) ** 2 + (y - ky) ** 2 <= keepR * keepR) blocked[y * w + x] = 1
  }
  const isBg = (p: number) => {
    if (blocked[p]) return false
    const i = p * 4
    if (data[i + 3] <= 16) return true
    for (const r of refs) if (dist2([data[i], data[i + 1], data[i + 2]], r) <= lim2) return true
    return false
  }
  const queue = new Int32Array(w * h)
  let head = 0
  let tail = 0
  const seed = (p: number) => {
    if (mask[p] || !isBg(p)) return
    mask[p] = 1
    queue[tail++] = p
  }
  for (let x = 0; x < w; x++) {
    seed(x)
    seed((h - 1) * w + x)
  }
  for (let y = 0; y < h; y++) {
    seed(y * w)
    seed(y * w + w - 1)
  }
  for (const [x, y] of marks.remove) {
    const p = Math.min(h - 1, Math.max(0, Math.round(y))) * w + Math.min(w - 1, Math.max(0, Math.round(x)))
    if (!blocked[p] && !mask[p]) {
      mask[p] = 1
      queue[tail++] = p
    }
  }
  while (head < tail) {
    const p = queue[head++]
    const x = p % w
    if (x > 0) seed(p - 1)
    if (x < w - 1) seed(p + 1)
    if (p >= w) seed(p - w)
    if (p < w * (h - 1)) seed(p + w)
  }
  return mask
}

/** Applies a background mask: background becomes transparent, edge pixels half transparent. */
export function applyMask(data: Uint8ClampedArray, w: number, h: number, mask: Uint8Array) {
  for (let p = 0; p < w * h; p++) {
    if (mask[p]) {
      data[p * 4 + 3] = 0
      continue
    }
    const x = p % w
    const edge = (x > 0 && mask[p - 1]) || (x < w - 1 && mask[p + 1]) || (p >= w && mask[p - w]) || (p < w * (h - 1) && mask[p + w])
    if (edge) data[p * 4 + 3] = Math.round(data[p * 4 + 3] * 0.6)
  }
}
