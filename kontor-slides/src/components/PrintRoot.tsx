import { createPortal } from 'react-dom'
import type { Presentation, Slide } from '../model/types'
import { SlideView, presProps } from '../render/SlideView'
import { slideTitleText as slideTitle } from '../model/accessibility'
import type { PrintSettings } from './Backstage'
import { DEFAULT_HANDOUT, DEFAULT_NOTES_MASTER } from './MasterViews'
import { t } from '../i18n'

function Marks({ s, page }: { s: { header: boolean; headerText: string; footer: boolean; footerText: string; date: boolean; pageNumber: boolean }; page: number }) {
  return (
    <>
      {s.header && s.headerText && <span className="print-mark pm-tl">{s.headerText}</span>}
      {s.date && <span className="print-mark pm-tr">{new Date().toLocaleDateString('en-US')}</span>}
      {s.footer && s.footerText && <span className="print-mark pm-bl">{s.footerText}</span>}
      {s.pageNumber && <span className="print-mark pm-br">{page}</span>}
    </>
  )
}

function SlideImg({ pres, slide, width, frame }: { pres: Presentation; slide: Slide; width: number; frame: boolean }) {
  const scale = width / pres.size.w
  return (
    <div className={`print-slide${frame ? ' is-framed' : ''}`} style={{ width, height: pres.size.h * scale }}>
      <SlideView slide={slide} index={pres.slides.indexOf(slide)} {...presProps(pres)} mode="show" style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }} />
    </div>
  )
}

function bodyText(slide: Slide) {
  return slide.elements
    .flatMap((e) => (e.type === 'shape' && e.text && !(e.placeholder && ['title', 'ctrTitle', 'sectionTitle', 'captionTitle'].includes(e.placeholder.style)) ? e.text.doc.content : []))
    .map((p) => ({ level: p.attrs?.level ?? 0, text: (p.content ?? []).map((n) => (n.type === 'text' ? n.text : ' ')).join('') }))
    .filter((p) => p.text.trim())
}

/** Pages shown only when printing (and saving as PDF from the print dialog). */
export function PrintRoot({ pres, settings, currentId, selectedIds }: { pres: Presentation; settings: PrintSettings; currentId: string; selectedIds: string[] }) {
  const slides = settings.range === 'current' ? pres.slides.filter((s) => s.id === currentId) : settings.range === 'selection' ? pres.slides.filter((s) => selectedIds.includes(s.id)) : pres.slides.filter((s) => !s.hidden)
  const W = pres.size.w / 96
  const H = pres.size.h / 96
  const portrait = settings.layout !== 'full'
  const pageCss = portrait ? '@page { size: 8.5in 11in; margin: 0.5in; }' : `@page { size: ${W}in ${H}in; margin: 0; }`
  let pages: React.ReactNode[] = []
  const nm = { ...DEFAULT_NOTES_MASTER, ...pres.notesMaster }
  const ho = { ...DEFAULT_HANDOUT, ...pres.handout }
  if (settings.layout === 'full') pages = slides.map((s) => <div key={s.id} className="print-page full">{<SlideImg pres={pres} slide={s} width={pres.size.w} frame={settings.frame} />}</div>)
  else if (settings.layout === 'notes')
    pages = slides.map((s) => (
      <div key={s.id} className="print-page portrait">
        {nm.slideImage && <SlideImg pres={pres} slide={s} width={7.5 * 96 - 48} frame />}
        {nm.body && <div className="print-notes">{s.notes}</div>}
        <Marks s={{ ...nm, pageNumber: false }} page={pres.slides.indexOf(s) + 1} />
        {nm.pageNumber && <div className="print-num">{pres.slides.indexOf(s) + 1}</div>}
      </div>
    ))
  else if (settings.layout === 'outline')
    pages = [
      <div key="outline" className="print-page portrait outline">
        {slides.map((s) => (
          <div key={s.id} className="print-outline-slide">
            <strong>
              {pres.slides.indexOf(s) + 1}. {slideTitle(s) || t('Untitled')}
            </strong>
            {bodyText(s).map((p, i) => (
              <div key={i} style={{ marginLeft: 24 + p.level * 24 }}>
                {p.text}
              </div>
            ))}
          </div>
        ))}
      </div>,
    ]
  else {
    const per = settings.layout === 'handout3' ? 3 : 6
    for (let i = 0; i < slides.length; i += per) {
      const group = slides.slice(i, i + per)
      pages.push(
        <div key={i} className={`print-page portrait handout handout-${per}`}>
          <Marks s={ho} page={i / per + 1} />
          {group.map((s) => (
            <div key={s.id} className="handout-cell">
              <SlideImg pres={pres} slide={s} width={per === 3 ? 3.4 * 96 : 3.6 * 96} frame />
              {per === 3 && (
                <div className="handout-lines">
                  {Array.from({ length: 7 }, (_, k) => (
                    <span key={k} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>,
      )
    }
  }
  return createPortal(
    <div className="print-root">
      <style>{pageCss}</style>
      {pages}
    </div>,
    document.body,
  )
}
