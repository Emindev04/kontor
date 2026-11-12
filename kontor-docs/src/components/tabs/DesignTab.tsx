import { CheckSquare, Droplet, Palette, PilcrowRight, Square, Stamp, SwatchBook, Type , Sparkle } from 'lucide-react'
import { MenuButton, PopoverButton, RibbonButton, RibbonGroup, cls, keepFocus } from '../ui'
import { STYLE_SETS } from '../../editor/styleDefs'
import { FontColorPalette } from '../palettes'
import { PARAGRAPH_SPACING, THEME_COLORS, THEME_FONTS, type PageBorder, type ParagraphSpacingId, type Watermark } from '../../pageSetup'
import type { TabProps } from './types'
import { t, tx } from '../../i18n'

const WATERMARKS: { label: string; text: string; layout: Watermark['layout'] }[] = [
  { label: tx('CONFIDENTIAL (diagonal)'), text: tx('CONFIDENTIAL'), layout: 'diagonal' },
  { label: tx('CONFIDENTIAL (horizontal)'), text: tx('CONFIDENTIAL'), layout: 'horizontal' },
  { label: tx('DO NOT COPY'), text: tx('DO NOT COPY'), layout: 'diagonal' },
  { label: tx('DRAFT'), text: tx('DRAFT'), layout: 'diagonal' },
  { label: tx('SAMPLE'), text: tx('SAMPLE'), layout: 'diagonal' },
  { label: tx('URGENT'), text: tx('URGENT'), layout: 'diagonal' },
  { label: tx('ASAP'), text: tx('ASAP'), layout: 'horizontal' },
]

const BORDERS: { label: string; border: PageBorder | null }[] = [
  { label: tx('None'), border: null },
  { label: tx('Box – Single'), border: { style: 'single', color: '#000000', widthPt: 0.5, offsetPt: 24 } },
  { label: tx('Box – Double'), border: { style: 'double', color: '#000000', widthPt: 1.5, offsetPt: 24 } },
  { label: tx('Box – Thick'), border: { style: 'thick', color: '#000000', widthPt: 1.5, offsetPt: 24 } },
  { label: tx('Box – Dotted'), border: { style: 'dotted', color: '#000000', widthPt: 1, offsetPt: 24 } },
  { label: tx('Box – Dashed'), border: { style: 'dashed', color: '#000000', widthPt: 1, offsetPt: 24 } },
  { label: tx('Box – Accent'), border: { style: 'single', color: '#4472C4', widthPt: 2.25, offsetPt: 24 } },
]

/** Themes: a color set and a font pair under one name. */
export const THEMES: { id: string; label: string; colors: string; fonts: string }[] = [
  { id: 'kontor', label: tx('Kontor'), colors: 'blue', fonts: 'default' },
  { id: 'harbor', label: tx('Harbor'), colors: 'blueGreen', fonts: 'arial' },
  { id: 'meadow', label: tx('Meadow'), colors: 'green', fonts: 'georgia' },
  { id: 'ember', label: tx('Ember'), colors: 'orange', fonts: 'trebuchet' },
  { id: 'brick', label: tx('Brick'), colors: 'red', fonts: 'garamond' },
  { id: 'orchid', label: tx('Orchid'), colors: 'violet', fonts: 'cambria' },
  { id: 'slate', label: tx('Slate'), colors: 'gray', fonts: 'verdana' },
  { id: 'ledger', label: tx('Ledger'), colors: 'blue', fonts: 'times' },
]

export function DesignTab({ app }: TabProps) {
  const { design, setDesign } = app
  return (
    <>
      <RibbonGroup label={t('Themes')} priority={2}>
        <MenuButton
          large
          wide
          icon={SwatchBook}
          label={t('Themes')}
          items={THEMES.map((item) => {
            const c = THEME_COLORS.find((x) => x.id === item.colors)!
            const f = THEME_FONTS.find((x) => x.id === item.fonts)!
            return {
              label: t(item.label),
              detail: t('{colors} colors · {heading} / {body}', { colors: t(c.label), heading: f.heading, body: f.body }),
              active: design.colors === item.colors && design.fonts === item.fonts,
              preview: (
                <span className="theme-swatches">
                  {[c.heading, c.headingDark, c.accent].map((col) => (
                    <span key={col} style={{ background: col }} />
                  ))}
                </span>
              ),
              onClick: () => setDesign({ ...design, colors: item.colors, fonts: item.fonts }),
            }
          })}
        />
      </RibbonGroup>
      <RibbonGroup label={t('Document Formatting')} priority={3}>
        <div className="style-set-gallery">
          {STYLE_SETS.map((set) => (
            <button key={set.id} type="button" className={cls('style-set', (design.styleSet ?? 'default') === set.id && 'is-active')} title={t(set.label)} onMouseDown={keepFocus} onClick={() => setDesign({ ...design, styleSet: set.id })}>
              <span className="style-set-title" style={{ textAlign: set.styles.title?.align === 'center' ? 'center' : undefined, textTransform: set.styles.title?.allCaps ? 'uppercase' : undefined, fontWeight: set.styles.title?.bold ? 'bold' : undefined, borderBottom: set.styles.title?.borderBottom ? `1px solid ${set.styles.title.borderBottom}` : undefined, background: set.styles.title?.shading }}>
                {t('Title')}</span>
              <span className="style-set-heading" style={{ textAlign: set.styles.h1?.align === 'center' ? 'center' : undefined, fontWeight: set.styles.h1?.bold ? 'bold' : undefined, color: set.styles.h1?.color, background: set.styles.h1?.shading }}>
                {t('Heading 1')}</span>
              <span className="style-set-lines" />
              <span className="style-set-name">{t(set.label)}</span>
            </button>
          ))}
        </div>
        <MenuButton
          large
          wide
          icon={Palette}
          label={t('Colors')}
          items={THEME_COLORS.map((c) => ({
            label: t(c.label),
            active: design.colors === c.id,
            preview: (
              <span className="theme-swatches">
                {[c.heading, c.headingDark, c.accent].map((col) => (
                  <span key={col} style={{ background: col }} />
                ))}
              </span>
            ),
            onClick: () => setDesign({ ...design, colors: c.id }),
          }))}
        />
        <MenuButton
          large
          wide
          icon={Type}
          label={t('Fonts')}
          items={THEME_FONTS.map((f) => ({
            label: t(f.label),
            detail: t('Headings: {heading} · Body: {body}', { heading: f.heading, body: f.body }),
            active: design.fonts === f.id,
            onClick: () => setDesign({ ...design, fonts: f.id }),
          }))}
        />
        <MenuButton
          large
          wide
          icon={PilcrowRight}
          label={t('Paragraph Spacing')}
          items={(Object.keys(PARAGRAPH_SPACING) as ParagraphSpacingId[]).map((id) => ({
            label: t(PARAGRAPH_SPACING[id].label),
            detail: t('Before: {before} pt · After: {after} pt · Line spacing: {line}', { before: PARAGRAPH_SPACING[id].before, after: PARAGRAPH_SPACING[id].after, line: PARAGRAPH_SPACING[id].line }),
            active: design.paragraphSpacing === id,
            onClick: () => setDesign({ ...design, paragraphSpacing: id }),
          }))}
        />
        <MenuButton
          large
          icon={Sparkle}
          label={t('Effects')}
          items={([
            ['none', t('No Effects'), t('Flat shapes')],
            ['subtle', t('Subtle Shadow'), t('A soft shadow under shapes and diagrams')],
            ['moderate', t('Moderate'), t('A stronger shadow with a slight lift')],
            ['intense', t('Intense'), t('Deep shadow and a raised look')],
            ['glow', t('Glow'), t('A soft glow around shapes')],
          ] as const).map(([id, label, detail]) => ({ label, detail, active: (design.effects ?? 'none') === id, onClick: () => setDesign({ ...design, effects: id }) }))}
        />
        <RibbonButton
          large
          icon={CheckSquare}
          label={t('Set as Default')}
          title={t('Use the current look (theme, style set, paragraph spacing and styles) for all new documents')}
          onClick={() => {
            app.setAsDefault()
            alert(t('The current look will be used for new documents.'))
          }}
        />
      </RibbonGroup>
      <RibbonGroup label={t('Page Background')} priority={4}>
        <MenuButton
          large
          icon={Stamp}
          label={t('Watermark')}
          items={[
            { heading: t('Disclaimers') },
            ...WATERMARKS.map((w) => ({
              label: t(w.label),
              active: design.watermark?.text === t(w.text) && design.watermark.layout === w.layout,
              onClick: () => setDesign({ ...design, watermark: { text: t(w.text), layout: w.layout, color: '#BFBFBF', semitransparent: true } }),
            })),
            'separator',
            { label: t('Custom Watermark…'), onClick: () => app.openDialog('watermark') },
            { label: t('Remove Watermark'), disabled: !design.watermark, onClick: () => setDesign({ ...design, watermark: null }) },
          ]}
        />
        <PopoverButton large icon={Droplet} label={t('Page Color')} className="palette-menu">
          {(close) => (
            <>
              <FontColorPalette
                autoLabel={t('No Color')}
                onPick={(c) => {
                  setDesign({ ...design, pageColor: c, pageFill: null })
                  close()
                }}
                onAuto={() => {
                  setDesign({ ...design, pageColor: null, pageFill: null })
                  close()
                }}
              />
              <div className="menu-heading">{t('Fill Effects (Gradient)')}</div>
              <div className="gradient-row">
                {[
                  ['#FFFFFF', '#DCE6F2'],
                  ['#FFFFFF', '#FBE5D6'],
                  ['#FFFFFF', '#E2F0D9'],
                  ['#FFF8E1', '#FFE08A'],
                  ['#F2F2F2', '#BFBFBF'],
                  ['#DCE6F2', '#8FB3E6'],
                ].map(([from, to]) => (
                  <button
                    key={from + to}
                    type="button"
                    className="gradient-tile"
                    style={{ background: `linear-gradient(180deg, ${from}, ${to})` }}
                    title={t('Two colors, vertical')}
                    onMouseDown={keepFocus}
                    onClick={() => {
                      setDesign({ ...design, pageColor: to, pageFill: { from, to, angle: 180 } })
                      close()
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </PopoverButton>
        <MenuButton
          large
          icon={Square}
          label={t('Page Borders')}
          items={BORDERS.map((b) => ({
            label: t(b.label),
            active: b.border ? design.pageBorder?.style === b.border.style && design.pageBorder.color === b.border.color : !design.pageBorder,
            onClick: () => setDesign({ ...design, pageBorder: b.border }),
          }))}
        />
      </RibbonGroup>
    </>
  )
}
