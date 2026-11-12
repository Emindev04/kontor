import { useMemo } from 'react'
import { Paintbrush, RectangleHorizontal, Type, Palette } from 'lucide-react'
import type { Fill, Slide, SlideSize } from '../../model/types'
import { createSlide, SIZE_16_9, SIZE_4_3 } from '../../model/factory'
import { docFromText } from '../../model/richtext'
import { THEMES, getTheme } from '../../model/themes'
import { fillToCss } from '../../render/context'
import { SlideView } from '../../render/SlideView'
import { store, useStore } from '../../store/store'
import * as A from '../../store/actions'
import { MenuButton, PopoverButton, RibbonButton, RibbonGroup, keepFocus, cls } from '../ui'
import { useThemeColors } from './common'
import type { TabProps } from './types'

function sampleSlide(size: SlideSize): Slide {
  const s = createSlide('title', size)
  s.elements = s.elements.map((e) => (e.type === 'shape' && e.placeholder?.style === 'ctrTitle' ? { ...e, text: { ...e.text!, doc: docFromText('Aa') } } : e)).filter((e) => e.type !== 'shape' || e.placeholder?.style !== 'subTitle')
  return s
}

function ThemePreview({ themeId, variant, size, slide }: { themeId: string; variant: number; size: SlideSize; slide: Slide }) {
  const scale = 112 / size.w
  const hf = useStore((s) => s.pres.headerFooter)
  return (
    <span className="theme-thumb" style={{ width: size.w * scale, height: size.h * scale }}>
      <SlideView slide={slide} index={0} themeId={themeId} variant={variant} size={size} headerFooter={hf} mode="thumb" style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }} />
    </span>
  )
}

export const FONT_PAIRS: { major: string; minor: string }[] = [
  { major: 'Calibri Light', minor: 'Calibri' },
  { major: 'Calibri', minor: 'Calibri' },
  { major: 'Arial', minor: 'Arial' },
  { major: 'Georgia', minor: 'Georgia' },
  { major: 'Trebuchet MS', minor: 'Trebuchet MS' },
  { major: 'Verdana', minor: 'Verdana' },
  { major: 'Montserrat', minor: 'Open Sans' },
  { major: 'Playfair Display', minor: 'Lato' },
  { major: 'Merriweather', minor: 'Lato' },
  { major: 'Cambria', minor: 'Calibri' },
  { major: 'Times New Roman', minor: 'Arial' },
  { major: 'Century Gothic', minor: 'Century Gothic' },
]

export function backgroundStyles(): { label: string; fill: Fill }[] {
  const out: { label: string; fill: Fill }[] = []
  for (const slot of ['bg1', 'bg2', 'tx2', 'tx1']) out.push({ label: `Solid ${slot}`, fill: { type: 'solid', color: `theme:${slot}` } })
  for (const slot of ['bg1', 'bg2', 'tx2', 'tx1'])
    out.push({ label: `Gradient ${slot}`, fill: { type: 'gradient', kind: 'linear', angle: 90, stops: [{ pos: 0, color: `theme:${slot}` }, { pos: 1, color: `theme:${slot}:${slot.startsWith('bg') ? 'd15' : 'l25'}` }] } })
  for (const slot of ['bg1', 'bg2', 'tx2', 'tx1'])
    out.push({ label: `Radial ${slot}`, fill: { type: 'gradient', kind: 'radial', angle: 0, stops: [{ pos: 0, color: `theme:${slot}:${slot.startsWith('bg') ? 'd05' : 'l40'}` }, { pos: 1, color: `theme:${slot}` }] } })
  return out
}

export function DesignTab({ ui }: TabProps) {
  const pres = useStore((s) => s.pres)
  const size = pres.size
  const slide = useMemo(() => sampleSlide(size), [size])
  const theme = getTheme(pres.themeId)
  const colors = useThemeColors()
  return (
    <>
      <RibbonGroup label="Themes">
        <div className="theme-gallery" role="listbox" aria-label="Themes">
          {THEMES.map((t) => (
            <button key={t.id} type="button" role="option" aria-selected={t.id === pres.themeId} className={cls('theme-item', t.id === pres.themeId && 'is-active')} title={t.name} onMouseDown={keepFocus} onClick={() => A.setTheme(t.id)}>
              <ThemePreview themeId={t.id} variant={0} size={size} slide={slide} />
            </button>
          ))}
        </div>
      </RibbonGroup>
      <RibbonGroup label="Variants">
        <div className="theme-gallery variants">
          {theme.variants.map((v, i) => (
            <button key={v.name} type="button" className={cls('theme-item', i === pres.variant && 'is-active')} title={v.name} onMouseDown={keepFocus} onClick={() => A.setVariant(i)}>
              <ThemePreview themeId={theme.id} variant={i} size={size} slide={slide} />
            </button>
          ))}
        </div>
        <div className="col">
          <MenuButton
            icon={Palette}
            label="Colors"
            showLabel
            items={[
              ...theme.variants.map((v, i) => ({ label: v.name, active: i === pres.variant && !pres.colors, onClick: () => A.setVariant(i) })),
              ...(pres.colors ? [{ label: pres.colorsName || 'Custom', active: true, onClick: () => undefined }] : []),
              'separator' as const,
              { label: 'Customize Colors…', onClick: () => ui.openDialog('themeColors') },
            ]}
          />
          <MenuButton
            icon={Type}
            label="Fonts"
            showLabel
            wide
            items={[
              { label: `Theme default (${theme.fonts.major} / ${theme.fonts.minor})`, active: !pres.fonts, onClick: () => A.setThemeFonts(null) },
              'separator',
              ...FONT_PAIRS.map((f) => ({ label: `${f.major} / ${f.minor}`, active: pres.fonts?.major === f.major && pres.fonts?.minor === f.minor, onClick: () => A.setThemeFonts(f) })),
              'separator',
              { label: 'Customize Fonts…', onClick: () => ui.openDialog('themeFonts') },
            ]}
          />
          <PopoverButton icon={Paintbrush} label="Background Styles" showLabel panelClass="palette-menu">
            {(close) => (
              <div className="palette">
                <div className="bg-styles">
                  {backgroundStyles().map((b) => (
                    <button key={b.label} type="button" className="bg-style" title={b.label} aria-label={b.label} style={{ background: fillToCss(b.fill, colors) }} onMouseDown={keepFocus} onClick={() => (close(), A.setBackground(b.fill, true))} />
                  ))}
                </div>
                <button type="button" className="menu-item" onMouseDown={keepFocus} onClick={() => (close(), A.setBackground(null, true))}>
                  Reset Slide Background
                </button>
                <button type="button" className="menu-item" onMouseDown={keepFocus} onClick={() => (close(), ui.openPane('formatBackground'))}>
                  Format Background…
                </button>
              </div>
            )}
          </PopoverButton>
        </div>
      </RibbonGroup>
      <RibbonGroup label="Customize">
        <MenuButton
          icon={RectangleHorizontal}
          label="Slide Size"
          large
          items={[
            { label: 'Standard (4:3)', active: size.name === '4:3', onClick: () => A.setSlideSize(SIZE_4_3, 'fit') },
            { label: 'Widescreen (16:9)', active: size.name === '16:9', onClick: () => A.setSlideSize(SIZE_16_9, 'fit') },
            'separator',
            { label: 'Custom Slide Size…', onClick: () => ui.openDialog('slideSize') },
          ]}
        />
        <RibbonButton icon={Paintbrush} label="Format Background" large onClick={() => ui.openPane(store.get().pane === 'formatBackground' ? null : 'formatBackground')} />
      </RibbonGroup>
    </>
  )
}
