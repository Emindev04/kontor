import { EyeOff, Eraser, Highlighter, MousePointer2, Pen, PenTool } from 'lucide-react'
import { RibbonButton, RibbonGroup } from '../ui'
import type { TabProps } from './types'
import { t, tx } from '../../i18n'
import type { InkTool } from '../InkOverlay'

const PENS: { id: string; label: string; tool: InkTool }[] = [
  { id: 'black', label: tx('Pen: Black'), tool: { kind: 'pen', color: '#000000', width: 2 } },
  { id: 'red', label: tx('Pen: Red'), tool: { kind: 'pen', color: '#E02020', width: 2 } },
  { id: 'blue', label: tx('Pen: Blue'), tool: { kind: 'pen', color: '#1F5AA6', width: 2 } },
  { id: 'green', label: tx('Pen: Green'), tool: { kind: 'pen', color: '#2E8B3C', width: 2 } },
  { id: 'highlighter', label: tx('Highlighter: Yellow'), tool: { kind: 'highlighter', color: 'rgba(255, 230, 0, 0.5)', width: 12 } },
]

export function DrawTab({ app }: TabProps) {
  const active = app.inkTool
  const same = (a: InkTool | null, b: InkTool) => !!a && a.kind === b.kind && a.color === b.color
  return (
    <>
      <RibbonGroup label={t('Drawing Tools')}>
        <RibbonButton large icon={MousePointer2} label={t('Select')} active={!active} title={t('Select text and objects (Esc)')} onClick={() => app.setInkTool(null)} />
        {PENS.map((p) => (
          <RibbonButton
            key={p.id}
            large
            icon={p.tool.kind === 'highlighter' ? Highlighter : Pen}
            label={t(p.label)}
            active={same(active, p.tool)}
            title={t('Draw on the page (Esc to stop)')}
            onClick={() => app.setInkTool(same(active, p.tool) ? null : { ...p.tool, width: active && active.kind === p.tool.kind ? active.width : p.tool.width })}
          />
        ))}
        <RibbonButton large icon={Eraser} label={t('Eraser')} active={active?.kind === 'eraser'} title={t('Click or drag over ink strokes to erase them')} onClick={() => app.setInkTool(active?.kind === 'eraser' ? null : { kind: 'eraser', color: '#000', width: 10 })} />
        <label className="draw-width ink-width">
          {t('Thickness')}
          <input type="range" min={1} max={30} step={0.5} disabled={!active || active.kind === 'eraser'} value={active?.width ?? 2} onChange={(e) => active && app.setInkTool({ ...active, width: Number(e.target.value) })} />
        </label>
      </RibbonGroup>
      <RibbonGroup label={t('Insert')}>
        <RibbonButton large icon={PenTool} label={t('Drawing Canvas')} title={t('Draw with pens and a highlighter, then insert the drawing as a picture')} onClick={() => app.openDialog('drawing')} />
      </RibbonGroup>
      <RibbonGroup label={t('Ink')}>
        <RibbonButton large icon={EyeOff} label={t('Hide Ink')} active={app.hideInk} title={t('Hide or show all ink in the document')} onClick={() => app.setHideInk(!app.hideInk)} />
      </RibbonGroup>
    </>
  )
}
