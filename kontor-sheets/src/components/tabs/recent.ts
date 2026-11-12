const KEY = 'kontor-sheets:recent-functions'
const DEFAULT = ['SUM', 'AVERAGE', 'IF', 'HYPERLINK', 'COUNT', 'MAX', 'SIN', 'SUMIF', 'PMT', 'STDEV']

export function recentFunctions(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    return Array.isArray(v) && v.length ? v : DEFAULT
  } catch {
    return DEFAULT
  }
}

export function noteFunction(name: string) {
  const list = [name, ...recentFunctions().filter((n) => n !== name)].slice(0, 10)
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // storage unavailable
  }
}
