import { useState } from 'react'
import { DialogTabs, Modal, OkCancel } from '../ui'
import { PAPER, paperDims, paperSize, type Orientation, type PageSetup, type PaperSize } from '../../pageSetup'
import { formatLength, parseLength, type Unit } from '../../units'

type Tab = 'margins' | 'paper' | 'layout'

/** Page Setup dialog (Margins, Paper, Layout). */
export function PageSetupDialog({ setup, setSetup, unit, onClose }: { setup: PageSetup; setSetup: (s: PageSetup) => void; unit: Unit; onClose: () => void }) {
  const fmt = (n: number) => formatLength(n, unit)
  const [tab, setTab] = useState<Tab>('margins')
  const [m, setM] = useState({ top: fmt(setup.margins.top), bottom: fmt(setup.margins.bottom), left: fmt(setup.margins.left), right: fmt(setup.margins.right) })
  const [orientation, setOrientation] = useState<Orientation>(setup.orientation)
  const [mirrored, setMirrored] = useState(setup.mirrored)
  const [size, setSize] = useState<PaperSize | 'custom'>(setup.size)
  const [customW, setCustomW] = useState(fmt(paperSize(setup).w))
  const [customH, setCustomH] = useState(fmt(paperSize(setup).h))
  const [differentFirst, setDifferentFirst] = useState(setup.differentFirstPage)
  const [oddEven, setOddEven] = useState(setup.differentOddEven)
  const [vAlign, setVAlign] = useState(setup.verticalAlign)
  const [lineNumbers, setLineNumbers] = useState(setup.lineNumbers)
  const [header, setHeader] = useState(fmt(setup.headerDistance))
  const [footer, setFooter] = useState(fmt(setup.footerDistance))
  const [error, setError] = useState('')

  const apply = () => {
    const read = (s: string) => parseLength(s, unit)
    const margins = { top: read(m.top), bottom: read(m.bottom), left: read(m.left), right: read(m.right) }
    const hd = read(header)
    const fd = read(footer)
    if (Object.values(margins).some((v) => v == null || v < 0) || hd == null || fd == null) return setError('Enter a valid measurement, for example 1" or 2.5 cm.')
    const cw = read(customW)
    const ch = read(customH)
    if (size === 'custom' && (cw == null || ch == null || cw < 1 || ch < 1 || cw > 22 || ch > 22)) return setError('Enter a paper width and height between 1" and 22".')
    const next: PageSetup = {
      ...setup,
      margins: margins as PageSetup['margins'],
      orientation,
      mirrored,
      size,
      customSize: size === 'custom' ? { w: cw!, h: ch! } : setup.customSize,
      differentFirstPage: differentFirst,
      differentOddEven: oddEven,
      verticalAlign: vAlign,
      lineNumbers,
      headerDistance: hd,
      footerDistance: fd,
    }
    const { w, h } = paperDims(next)
    if (next.margins.left + next.margins.right > w - 0.5 || next.margins.top + next.margins.bottom > h - 0.5) return setError('The margins are larger than the page.')
    setSetup(next)
    onClose()
  }

  const field = (key: keyof typeof m, label: string) => (
    <label className="dlg-inline">
      {label}: <input value={m[key]} onChange={(e) => setM({ ...m, [key]: e.target.value })} />
    </label>
  )

  return (
    <Modal title="Page Setup" onClose={onClose} width={480} footer={<OkCancel onOk={apply} onCancel={onClose} extra={error && <span className="dlg-error">{error}</span>} />}>
      <DialogTabs
        tabs={[
          { id: 'margins', label: 'Margins' },
          { id: 'paper', label: 'Paper' },
          { id: 'layout', label: 'Layout' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'margins' && (
        <div className="dlg-stack">
          <fieldset className="dlg-fieldset dlg-two">
            <legend>Margins</legend>
            {field('top', 'Top')}
            {field('bottom', 'Bottom')}
            {field('left', mirrored ? 'Inside' : 'Left')}
            {field('right', mirrored ? 'Outside' : 'Right')}
          </fieldset>
          <fieldset className="dlg-fieldset">
            <legend>Orientation</legend>
            <div className="orientation-pick">
              {(['portrait', 'landscape'] as const).map((o) => (
                <label key={o} className={`orientation-tile ${orientation === o ? 'is-active' : ''}`}>
                  <input type="radio" name="orientation" checked={orientation === o} onChange={() => setOrientation(o)} />
                  <span className={`orientation-icon is-${o}`} />
                  {o === 'portrait' ? 'Portrait' : 'Landscape'}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="dlg-fieldset">
            <legend>Pages</legend>
            <label className="dlg-inline">
              Multiple pages:
              <select value={mirrored ? 'mirror' : 'normal'} onChange={(e) => setMirrored(e.target.value === 'mirror')}>
                <option value="normal">Normal</option>
                <option value="mirror">Mirror margins</option>
              </select>
            </label>
          </fieldset>
        </div>
      )}
      {tab === 'paper' && (
        <div className="dlg-stack">
          <fieldset className="dlg-fieldset">
            <legend>Paper size</legend>
            <select value={size} onChange={(e) => setSize(e.target.value as PaperSize | 'custom')}>
              {(Object.keys(PAPER) as PaperSize[]).map((k) => (
                <option key={k} value={k}>
                  {PAPER[k].label} ({fmt(PAPER[k].w)} × {fmt(PAPER[k].h)})
                </option>
              ))}
              <option value="custom">Custom size</option>
            </select>
            <label className="dlg-inline">
              Width: <input value={customW} disabled={size !== 'custom'} onChange={(e) => setCustomW(e.target.value)} />
            </label>
            <label className="dlg-inline">
              Height: <input value={customH} disabled={size !== 'custom'} onChange={(e) => setCustomH(e.target.value)} />
            </label>
          </fieldset>
        </div>
      )}
      {tab === 'layout' && (
        <div className="dlg-stack">
          <fieldset className="dlg-fieldset">
            <legend>Headers and footers</legend>
            <label>
              <input type="checkbox" checked={oddEven} onChange={(e) => setOddEven(e.target.checked)} /> Different odd and even
            </label>
            <label>
              <input type="checkbox" checked={differentFirst} onChange={(e) => setDifferentFirst(e.target.checked)} /> Different first page
            </label>
            <label className="dlg-inline">
              From edge: Header: <input value={header} onChange={(e) => setHeader(e.target.value)} />
            </label>
            <label className="dlg-inline">
              From edge: Footer: <input value={footer} onChange={(e) => setFooter(e.target.value)} />
            </label>
          </fieldset>
          <fieldset className="dlg-fieldset">
            <legend>Page</legend>
            <label className="dlg-inline">
              Vertical alignment:
              <select value={vAlign} onChange={(e) => setVAlign(e.target.value as PageSetup['verticalAlign'])}>
                <option value="top">Top</option>
                <option value="center">Center</option>
                <option value="justify">Justified</option>
                <option value="bottom">Bottom</option>
              </select>
            </label>
            <label className="dlg-inline">
              Line numbers:
              <select value={lineNumbers} onChange={(e) => setLineNumbers(e.target.value as PageSetup['lineNumbers'])}>
                <option value="none">None</option>
                <option value="continuous">Continuous</option>
                <option value="restartPage">Restart each page</option>
              </select>
            </label>
          </fieldset>
        </div>
      )}
    </Modal>
  )
}
