import { FileText, ImagePlus, LayoutTemplate, Paintbrush, Pencil, Pin, Ratio, RectangleHorizontal, RectangleVertical, Type, X, Palette, Columns3 } from 'lucide-react'
import type { HandoutSettings, LayoutId, NotesMasterSettings, PlaceholderStyle, Presentation } from '../model/types'
import { LAYOUTS, layoutName } from '../model/layouts'
import { MASTER_ROOT, insertLayoutPlaceholder, isMasterId, masterIdFor, masterSlide, masterTarget, setLayoutOption } from '../model/master'
import { THEMES } from '../model/themes'
import { SlideView, presProps } from '../render/SlideView'
import { commit, currentSlide, store, useStore } from '../store/store'
import * as A from '../store/actions'
import { MenuButton, RibbonButton, RibbonGroup, cls } from './ui'
import type { TabProps } from './tabs/types'
import { t } from '../i18n'

export function openMasterView(kind: 'master' | 'handoutMaster' | 'notesMaster') {
  A.exitEditing()
  const s = store.get()
  const ret = isMasterId(s.slideId) ? s.masterReturn : s.slideId
  if (kind === 'master') store.set({ view: 'master', masterReturn: ret, slideId: masterIdFor(currentSlide(s).layout), selection: [], tab: 'slideMaster' })
  else store.set({ view: kind, masterReturn: ret, tab: kind, selection: [] })
}

export function closeMasterView() {
  A.exitEditing()
  const s = store.get()
  const back = s.pres.slides.find((x) => x.id === s.masterReturn) ?? s.pres.slides[0]
  store.set({ view: 'normal', slideId: back?.id ?? '', selectedSlides: back ? [back.id] : [], selection: [], tab: 'home', masterReturn: null })
}

// ---------- Slide Master ----------

export function MasterPane() {
  const pres = useStore((s) => s.pres)
  const slideId = useStore((s) => s.slideId)
  const items: ('root' | LayoutId)[] = ['root', ...LAYOUTS.map((l) => l.id)]
  return (
    <aside className="thumbs master-thumbs" aria-label={t('Slide master and layouts')} style={{ width: 222 }}>
      {items.map((lt) => {
        const id = masterIdFor(lt)
        const slide = masterSlide(pres, id)
        const w = lt === 'root' ? 168 : 140
        const scale = w / pres.size.w
        return (
          <div key={id} className={cls('thumb', lt !== 'root' && 'is-layout', slideId === id && 'is-current')} title={lt === 'root' ? t('Slide Master: used by all layouts') : t('{name} Layout: used by {n} slide(s)', { name: t(layoutName(lt)), n: pres.slides.filter((s) => s.layout === lt).length })} onMouseDown={() => store.set({ slideId: id, selection: [], editingId: null })}>
            <span className="thumb-num">{lt === 'root' ? '1' : ''}</span>
            <div className="thumb-col">
              <div className="thumb-slide" style={{ width: pres.size.w * scale, height: pres.size.h * scale }}>
                <SlideView slide={slide} index={0} {...presProps(pres)} mode="thumb" style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }} />
              </div>
            </div>
          </div>
        )
      })}
    </aside>
  )
}

function insertPlaceholder(style: PlaceholderStyle) {
  const s = store.get()
  const target = masterTarget(s.slideId)
  if (target === 'root') return
  const box = { x: s.pres.size.w * 0.3, y: s.pres.size.h * 0.35, w: s.pres.size.w * 0.4, h: s.pres.size.h * 0.3 }
  commit((p) => insertLayoutPlaceholder(p, target, style, box))
}

export function SlideMasterTab({ ui }: TabProps) {
  const slideId = useStore((s) => s.slideId)
  const pres = useStore((s) => s.pres)
  const target = isMasterId(slideId) ? masterTarget(slideId) : 'root'
  const layout = target === 'root' ? null : target
  const ov = layout ? pres.master?.layouts?.[layout] : undefined
  const set = (patch: Parameters<typeof setLayoutOption>[2]) => layout && commit((p) => setLayoutOption(p, layout, patch))
  return (
    <>
      <RibbonGroup label={t('Edit Master')}>
        <RibbonButton
          icon={Pencil}
          label={t('Rename')}
          large
          disabled={!layout}
          onClick={() => {
            if (!layout) return
            const name = window.prompt(t('Layout name:'), t(layoutName(layout)))
            if (name?.trim()) set({ name: name.trim() })
          }}
        />
        <RibbonButton icon={Pin} label={t('Preserve')} large active={!!ov?.preserve} disabled={!layout} onClick={() => set({ preserve: !ov?.preserve })} />
      </RibbonGroup>
      <RibbonGroup label={t('Master Layout')}>
        <MenuButton
          icon={LayoutTemplate}
          label={t('Insert Placeholder')}
          large
          disabled={!layout}
          items={[
            { label: t('Content'), icon: FileText, onClick: () => insertPlaceholder('body') },
            { label: t('Text'), icon: Type, onClick: () => insertPlaceholder('sectionText') },
            { label: t('Picture'), icon: ImagePlus, onClick: () => insertPlaceholder('pic') },
          ]}
        />
        <div className="col checks">
          <label>
            <input type="checkbox" checked={!ov?.noTitle} disabled={!layout} onChange={(e) => set({ noTitle: !e.target.checked })} /> {t('Title')}
          </label>
          <label>
            <input type="checkbox" checked={!ov?.noFooters} disabled={!layout} onChange={(e) => set({ noFooters: !e.target.checked })} /> {t('Footers')}
          </label>
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Edit Theme')}>
        <MenuButton icon={Palette} label={t('Themes')} large items={THEMES.map((t) => ({ label: t.name, active: pres.themeId === t.id, onClick: () => A.setTheme(t.id) }))} />
      </RibbonGroup>
      <RibbonGroup label={t('Background')}>
        <RibbonButton icon={Paintbrush} label={t('Background Styles')} large onClick={() => ui.openPane('formatBackground')} />
        <div className="col checks">
          <label>
            <input type="checkbox" checked={!!ov?.hideMaster} disabled={!layout} onChange={(e) => set({ hideMaster: e.target.checked })} /> {t('Hide Background Graphics')}
          </label>
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Size')}>
        <RibbonButton icon={Ratio} label={t('Slide Size')} large onClick={() => ui.openDialog('slideSize')} />
      </RibbonGroup>
      <RibbonGroup label={t('Close')}>
        <RibbonButton icon={X} label={t('Close Master View')} large onClick={closeMasterView} />
      </RibbonGroup>
    </>
  )
}

// ---------- Handout and notes masters ----------

export const DEFAULT_HANDOUT: HandoutSettings = { perPage: 6, orientation: 'portrait', header: true, headerText: '', footer: true, footerText: '', date: true, pageNumber: true }
export const DEFAULT_NOTES_MASTER: NotesMasterSettings = { header: true, headerText: '', footer: true, footerText: '', date: true, pageNumber: true, slideImage: true, body: true }

function setHandout(patch: Partial<HandoutSettings>) {
  commit((p) => ({ ...p, handout: { ...DEFAULT_HANDOUT, ...p.handout, ...patch } }))
}

function setNotesMaster(patch: Partial<NotesMasterSettings>) {
  commit((p) => ({ ...p, notesMaster: { ...DEFAULT_NOTES_MASTER, ...p.notesMaster, ...patch } }))
}

function PageMarks({ s, page }: { s: { header: boolean; headerText: string; footer: boolean; footerText: string; date: boolean; pageNumber: boolean }; page: number }) {
  return (
    <>
      {s.header && <span className="pm pm-tl">{s.headerText || t('Header')}</span>}
      {s.date && <span className="pm pm-tr">{new Date().toLocaleDateString('en-US')}</span>}
      {s.footer && <span className="pm pm-bl">{s.footerText || t('Footer')}</span>}
      {s.pageNumber && <span className="pm pm-br">{page}</span>}
    </>
  )
}

export function handoutGrid(n: HandoutSettings['perPage'], landscape: boolean) {
  const cols = n === 1 ? 1 : n === 2 || n === 3 ? 1 : n === 4 ? 2 : n === 6 ? (landscape ? 3 : 2) : 3
  return { cols, rows: Math.ceil(n / cols) }
}

export function HandoutMasterView() {
  const pres = useStore((s) => s.pres)
  const h = { ...DEFAULT_HANDOUT, ...pres.handout }
  const landscape = h.orientation === 'landscape'
  const { cols, rows } = handoutGrid(h.perPage, landscape)
  return (
    <div className="master-page-view">
      <div className={cls('master-page', landscape && 'is-landscape')}>
        <PageMarks s={h} page={1} />
        <div className="mp-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
          {Array.from({ length: h.perPage }, (_, i) => (
            <div key={i} className={cls('mp-slot', h.perPage === 3 && 'with-lines')}>
              <span className="mp-slide" style={{ aspectRatio: `${pres.size.w} / ${pres.size.h}` }} />
              {h.perPage === 3 && <span className="mp-lines" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function NotesMasterView() {
  const pres = useStore((s) => s.pres)
  const n = { ...DEFAULT_NOTES_MASTER, ...pres.notesMaster }
  return (
    <div className="master-page-view">
      <div className="master-page">
        <PageMarks s={n} page={1} />
        {n.slideImage && <div className="mp-notes-slide" style={{ aspectRatio: `${pres.size.w} / ${pres.size.h}` }} />}
        {n.body && (
          <div className="mp-notes-body">
            <p>{t('Click to edit Master text styles')}</p>
            <p className="l2">{t('Second level')}</p>
            <p className="l3">{t('Third level')}</p>
          </div>
        )}
      </div>
    </div>
  )
}

function Checks({ value, set, items }: { value: Record<string, unknown>; set: (patch: Record<string, boolean>) => void; items: [string, string][] }) {
  return (
    <div className="col checks">
      {items.map(([key, label]) => (
        <label key={key}>
          <input type="checkbox" checked={!!value[key]} onChange={(e) => set({ [key]: e.target.checked })} /> {label}
        </label>
      ))}
    </div>
  )
}

export function HandoutMasterTab() {
  const pres = useStore((s) => s.pres)
  const h = { ...DEFAULT_HANDOUT, ...pres.handout }
  return (
    <>
      <RibbonGroup label={t('Page Setup')}>
        <MenuButton icon={RectangleVertical} label={t('Handout Orientation')} large items={(['portrait', 'landscape'] as const).map((o) => ({ label: o === 'portrait' ? t('Portrait') : t('Landscape'), icon: o === 'portrait' ? RectangleVertical : RectangleHorizontal, active: h.orientation === o, onClick: () => setHandout({ orientation: o }) }))} />
        <MenuButton icon={Columns3} label={t('Slides Per Page')} large items={([1, 2, 3, 4, 6, 9] as const).map((n) => ({ label: n > 1 ? t('{n} Slides', { n }) : t('1 Slide'), active: h.perPage === n, onClick: () => setHandout({ perPage: n }) }))} />
      </RibbonGroup>
      <RibbonGroup label={t('Placeholders')}>
        <Checks value={h} set={setHandout} items={[['header', t('Header')], ['footer', t('Footer')]]} />
        <Checks value={h} set={setHandout} items={[['date', t('Date')], ['pageNumber', t('Page Number')]]} />
        <div className="col">
          <input aria-label={t('Header text')} placeholder={t('Header text')} value={h.headerText} onChange={(e) => setHandout({ headerText: e.target.value })} style={{ width: 140 }} />
          <input aria-label={t('Footer text')} placeholder={t('Footer text')} value={h.footerText} onChange={(e) => setHandout({ footerText: e.target.value })} style={{ width: 140 }} />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Close')}>
        <RibbonButton icon={X} label={t('Close Master View')} large onClick={closeMasterView} />
      </RibbonGroup>
    </>
  )
}

export function NotesMasterTab() {
  const pres = useStore((s) => s.pres)
  const n = { ...DEFAULT_NOTES_MASTER, ...pres.notesMaster }
  return (
    <>
      <RibbonGroup label={t('Placeholders')}>
        <Checks value={n} set={setNotesMaster} items={[['header', t('Header')], ['slideImage', t('Slide Image')], ['footer', t('Footer')]]} />
        <Checks value={n} set={setNotesMaster} items={[['date', t('Date')], ['body', t('Body')], ['pageNumber', t('Page Number')]]} />
        <div className="col">
          <input aria-label={t('Header text')} placeholder={t('Header text')} value={n.headerText} onChange={(e) => setNotesMaster({ headerText: e.target.value })} style={{ width: 140 }} />
          <input aria-label={t('Footer text')} placeholder={t('Footer text')} value={n.footerText} onChange={(e) => setNotesMaster({ footerText: e.target.value })} style={{ width: 140 }} />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Close')}>
        <RibbonButton icon={X} label={t('Close Master View')} large onClick={closeMasterView} />
      </RibbonGroup>
    </>
  )
}

export function masterViewLabel(pres: Presentation, slideId: string) {
  return slideId === MASTER_ROOT ? t('Slide Master') : t('{name} Layout', { name: t(layoutName(masterTarget(slideId) as LayoutId)) })
}

