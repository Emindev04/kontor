import { memo, useMemo, type CSSProperties } from 'react'
import type { HeaderFooter, Presentation, Slide, SlideElement, SlideSize } from '../model/types'
import { decoKind, footerBox } from '../model/layouts'
import { resolveColor } from '../model/color'
import { fontStack } from '../model/themes'
import { ElementView, type ElementProps, type RenderMode } from './ElementView'
import { fillToCss, makeRenderCtx, slideBackground, type RenderCtx } from './context'

export type SlideViewProps = {
  slide: Slide
  index: number
  themeId: string
  variant: number
  fonts?: Presentation['fonts']
  colors?: Presentation['colors']
  master?: Presentation['master']
  size: SlideSize
  headerFooter: HeaderFooter
  mode: RenderMode
  editingId?: string | null
  renderEditor?: ElementProps['renderEditor']
  onAutofit?: ElementProps['onAutofit']
  onPicturePlaceholder?: ElementProps['onPicturePlaceholder']
  renderCellEditor?: ElementProps['renderCellEditor']
  cellSel?: ElementProps['cellSel']
  onTableMeasure?: ElementProps['onTableMeasure']
  anim?: ElementProps['anim']
  style?: CSSProperties
  className?: string
}

/** Convenience: SlideView props taken from a presentation. */
export function presProps(p: Presentation) {
  return { themeId: p.themeId, variant: p.variant, fonts: p.fonts, colors: p.colors, size: p.size, headerFooter: p.headerFooter, master: p.master }
}

function Footers({ rc, slide }: { rc: RenderCtx; slide: Slide }) {
  const hf = rc.headerFooter
  if (hf.notOnTitle && slide.layout === 'title') return null
  if (rc.master?.layouts?.[slide.layout]?.noFooters) return null
  const items: { kind: 'date' | 'footer' | 'sldNum'; text: string }[] = []
  if (hf.date) items.push({ kind: 'date', text: rc.dateText })
  if (hf.footer && hf.footerText) items.push({ kind: 'footer', text: hf.footerText })
  if (hf.slideNumber) items.push({ kind: 'sldNum', text: String(rc.slideNumber) })
  const color = resolveColor('theme:tx1:l25', rc.colors)
  return (
    <>
      {items.map((it) => {
        const b = footerBox(it.kind, rc.size.w, rc.size.h)
        return (
          <div key={it.kind} className="footer-ph" style={{ left: b.x, top: b.y, width: b.w, height: b.h, lineHeight: `${b.h}px`, textAlign: b.align, color, fontFamily: fontStack(rc.fonts.minor) }}>
            {it.text}
          </div>
        )
      })}
    </>
  )
}

/** Objects from the slide master and the slide's layout drawn behind the slide's own objects. */
export function masterDeco(slide: Slide, master: Presentation['master']): SlideElement[] {
  if (!master || slide.hideBackgroundGraphics && slide.masterEdit !== 'layout') return []
  if (slide.masterEdit === 'root') return []
  const layout = master.layouts?.[slide.layout]
  const fromMaster = layout?.hideMaster ? [] : (master.elements ?? [])
  if (slide.masterEdit === 'layout') return fromMaster
  return [...fromMaster, ...(layout?.elements ?? [])]
}

export const SlideView = memo(function SlideView(props: SlideViewProps) {
  const { slide, index, themeId, variant, fonts, colors, size, headerFooter, mode, master } = props
  const rc = useMemo(() => makeRenderCtx({ themeId, variant, fonts, colors, size, headerFooter, master }, index + 1, slide.layout), [themeId, variant, fonts, colors, size, headerFooter, index, slide.layout, master])
  const bg = slideBackground(slide.background, rc)
  const deco = useMemo(() => (slide.hideBackgroundGraphics ? [] : rc.theme.deco(decoKind(slide.layout), size.w, size.h)), [rc.theme, slide.layout, slide.hideBackgroundGraphics, size])
  return (
    <div className={`slide slide-${mode}${props.className ? ` ${props.className}` : ''}`} style={{ width: size.w, height: size.h, ...props.style }}>
      <div className="slide-bg" style={{ background: fillToCss(bg, rc.colors) }} />
      {deco.map((d, i) => (
        <ElementView key={`deco${i}`} el={{ ...d, id: `deco${i}` }} rc={rc} mode="deco" />
      ))}
      {masterDeco(slide, master).map((d) => (
        <ElementView key={`md-${d.id}`} el={d} rc={rc} mode="deco" />
      ))}
      {slide.elements.map((el) => (
        <ElementView
          key={el.id}
          el={el}
          rc={rc}
          mode={mode}
          editingId={props.editingId}
          renderEditor={props.renderEditor}
          onAutofit={props.onAutofit}
          onPicturePlaceholder={props.onPicturePlaceholder}
          renderCellEditor={props.renderCellEditor}
          cellSel={props.cellSel}
          onTableMeasure={props.onTableMeasure}
          anim={props.anim}
        />
      ))}
      <Footers rc={rc} slide={slide} />
    </div>
  )
})
