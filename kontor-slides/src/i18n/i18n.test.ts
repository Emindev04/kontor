// Every interface text passed to t() or tx() must have a translation in every language file.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import de from './locales/de'
import es from './locales/es'
import fr from './locales/fr'
import { setTranslationsForTest, t } from './index'

const SRC = join(__dirname, '..')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'i18n' || name === '__tests__' || name === 'test' ? [] : sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

/** The English texts used in the code: t('…'), t("…"), tx('…'), tx("…"). */
function usedKeys(): { keys: Set<string>; templates: string[] } {
  const keys = new Set<string>()
  const templates: string[] = []
  for (const file of sourceFiles(SRC)) {
    const code = readFileSync(file, 'utf8')
    for (const m of code.matchAll(/\btx?\(\s*(['"])((?:\\.|(?!\1).)*)\1/g)) keys.add(m[2].replace(/\\(['"\\])/g, '$1').replace(/\\n/g, '\n'))
    for (const m of code.matchAll(/\btx?\(\s*`/g)) templates.push(`${file.slice(SRC.length + 1)} @ ${m.index}`)
  }
  return { keys, templates }
}

describe('interface translations', () => {
  const { keys, templates } = usedKeys()

  it('passes plain strings (no template literals) to t()', () => {
    expect(templates).toEqual([])
  })

  for (const [name, table] of Object.entries({ de, fr, es })) {
    it(`has every text in ${name}`, () => {
      const missing = [...keys].filter((k) => !(k in table))
      expect(missing.slice(0, 50), `${missing.length} missing in ${name}`).toEqual([])
    })
    it(`keeps the {placeholders} in ${name}`, () => {
      const broken = Object.entries(table).filter(([k, v]) => (k.match(/\{\w+\}/g) ?? []).sort().join() !== (v.match(/\{\w+\}/g) ?? []).sort().join())
      expect(broken.map(([k]) => k)).toEqual([])
    })
  }

  it('fills in placeholders and falls back to English', () => {
    setTranslationsForTest('de', { 'Page {n} of {total}': 'Seite {n} von {total}' })
    expect(t('Page {n} of {total}', { n: 2, total: 5 })).toBe('Seite 2 von 5')
    expect(t('Not translated')).toBe('Not translated')
    setTranslationsForTest('en', {})
  })
})
