// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { Doc } from '../commands/doc'

describe('.xlsx export', () => {
  it('names Kontor Sheets as the creating application', async () => {
    const { exportXlsx } = await import('../io/xlsx')
    const doc = new Doc()
    doc.setInput(0, 0, 'x')
    const zip = await JSZip.loadAsync(await (await exportXlsx(doc.wb, doc.engine)).arrayBuffer())
    expect(await zip.file('docProps/app.xml')!.async('string')).toContain('<Application>Kontor Sheets</Application>')
  })
})
