import { CheckSquare, Droplet, Palette, PilcrowRight, Square, Stamp, SwatchBook, Type , Sparkle } from 'lucide-react'
import { MenuButton, PopoverButton, RibbonButton, RibbonGroup, cls, keepFocus } from '../ui'
import { STYLE_SETS } from '../../editor/styleDefs'
import { FontColorPalette } from '../palettes'
import { PARAGRAPH_SPACING, THEME_COLORS, THEME_FONTS, type PageBorder, type ParagraphSpacingId, type Watermark } from '../../pageSetup'
import type { TabProps } from './types'

const WATERMARKS: { label: string; text: string; layout: Watermark['layout'] }[] = [
  { label: 'CONFIDENTIAL (diagonal)', text: 'CONFIDENTIAL', layout: 'diagonal' },
  { label: 'CONFIDENTIAL (horizontal)', text: 'CONFIDENTIAL', layout: 'horizontal' },
  { label: 'DO NOT COPY', text: 'DO NOT COPY', layout: 'diagonal' },
  { label: 'DRAFT', text: 'DRAFT', layout: 'diagonal' },
  { label: 'SAMPLE', text: 'SAMPLE', layout: 'diagonal' },
  { label: 'URGENT', text: 'URGENT', layout: 'diagonal' },
  { label: 'ASAP', text: 'ASAP', layout: 'horizontal' },
]

const BORDERS: { label: string; border: PageBorder | null }[] = [
  { label: 'None', border: null },
  { label: 'Box – Single', border: { style: 'single', color: '#000000', widthPt: 0.5, offsetPt: 24 } },
  { label: 'Box – Double', border: { style: 'double', color: '#000000', widthPt: 1.5, offsetPt: 24 } },
  { label: 'Box – Thick', border: { style: 'thick', color: '#000000', widthPt: 1.5, offsetPt: 24 } },
  { label: 'Box – Dotted', border: { style: 'dotted', color: '#000000', widthPt: 1, offsetPt: 24 } },
  { label: 'Box – Dashed', border: { style: 'dashed', color: '#000000', widthPt: 1, offsetPt: 24 } },
  { label: 'Box – Accent', border: { style: 'single', color: '#4472C4', widthPt: 2.25, offsetPt: 24 } },
]

/** Themes: a color set and a font pair under one name. */
export const THEMES: { id: string; label: string; colors: string; fonts: string }[] = [
  { id: 'kontor', label: 'Kontor', colors: 'blue', fonts: 'default' },
  { id: 'harbor', label: 'Harbor', colors: 'blueGreen', fonts: 'arial' },
  { id: 'meadow', label: 'Meadow', colors: 'green', fonts: 'georgia' },
  { id: 'ember', label: 'Ember', colors: 'orange', fonts: 'trebuchet' },
  { id: 'brick', label: 'Brick', colors: 'red', fonts: 'garamond' },
  { id: 'orchid', label: 'Orchid', colors: 'violet', fonts: 'cambria' },
  { id: 'slate', label: 'Slate', colors: 'gray', fonts: 'verdana' },
  { id: 'ledger', label: 'Ledger', colors: 'blue', fonts: 'times' },
]

export function DesignTab({ app }: TabProps) {
  const { design, setDesign } = app
  return (
    <>
      <RibbonGroup label="Themes" priority={2}>
        <MenuButton
          large
          wide
          icon={SwatchBook}
          label="Themes"
          items={THEMES.map((t) => {
            const c = THEME_COLORS.find((x) => x.id === t.colors)!
            const f = THEME_FONTS.find((x) => x.id === t.fonts)!
            return {
              label: t.label,
              detail: `${c.label} colors · ${f.heading} / ${f.body}`,
              active: design.colors === t.colors && design.fonts === t.fonts,
              preview: (
                <span className="theme-swatches">
                  {[c.heading, c.headingDark, c.accent].map((col) => (
                    <span key={col} style={{ background: col }} />
                  ))}
                </span>
              ),
              onClick: () => setDesign({ ...design, colors: t.colors, fonts: t.fonts }),
            }
          })}
        />
      </RibbonGroup>
      <RibbonGroup label="Document Formatting" priority={3}>
        <div className="style-set-gallery">
          {STYLE_SETS.map((set) => (
            <button key={set.id} type="button" className={cls('style-set', (design.styleSet ?? 'default') === set.id && 'is-active')} title={set.label} onMouseDown={keepFocus} onClick={() => setDesign({ ...design, styleSet: set.id })}>
              <span className="style-set-title" style={{ textAlign: set.styles.title?.align === 'center' ? 'center' : undefined, textTransform: set.styles.title?.allCaps ? 'uppercase' : undefined, fontWeight: set.styles.title?.bold ? 'bold' : undefined, borderBottom: set.styles.title?.borderBottom ? `1px solid ${set.styles.title.borderBottom}` : undefined, background: set.styles.title?.shading }}>
                Title
              </span>
              <span className="style-set-heading" style={{ textAlign: set.styles.h1?.align === 'center' ? 'center' : undefined, fontWeight: set.styles.h1?.bold ? 'bold' : undefined, color: set.styles.h1?.color, background: set.styles.h1?.shading }}>
                Heading 1
              </span>
              <span className="style-set-lines" />
              <span className="style-set-name">{set.label}</span>
            </button>
          ))}
        </div>
        <MenuButton
          large
          wide
          icon={Palette}
          label="Colors"
          items={THEME_COLORS.map((c) => ({
            label: c.label,
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
          label="Fonts"
          items={THEME_FONTS.map((f) => ({
            label: f.label,
            detail: `Headings: ${f.heading} · Body: ${f.body}`,
            active: design.fonts === f.id,
            onClick: () => setDesign({ ...design, fonts: f.id }),
          }))}
        />
        <MenuButton
          large
          wide
          icon={PilcrowRight}
          label="Paragraph Spacing"
          items={(Object.keys(PARAGRAPH_SPACING) as ParagraphSpacingId[]).map((id) => ({
            label: PARAGRAPH_SPACING[id].label,
            detail: `Before: ${PARAGRAPH_SPACING[id].before} pt · After: ${PARAGRAPH_SPACING[id].after} pt · Line spacing: ${PARAGRAPH_SPACING[id].line}`,
            active: design.paragraphSpacing === id,
            onClick: () => setDesign({ ...design, paragraphSpacing: id }),
          }))}
        />
        <MenuButton
          large
          icon={Sparkle}
          label="Effects"
          items={([
            ['none', 'No Effects', 'Flat shapes'],
            ['subtle', 'Subtle Shadow', 'A soft shadow under shapes and diagrams'],
            ['moderate', 'Moderate', 'A stronger shadow with a slight lift'],
            ['intense', 'Intense', 'Deep shadow and a raised look'],
            ['glow', 'Glow', 'A soft glow around shapes'],
          ] as const).map(([id, label, detail]) => ({ label, detail, active: (design.effects ?? 'none') === id, onClick: () => setDesign({ ...design, effects: id }) }))}
        />
        <RibbonButton
          large
          icon={CheckSquare}
          label="Set as Default"
          title="Use the current look (theme, style set, paragraph spacing and styles) for all new documents"
          onClick={() => {
            app.setAsDefault()
            alert('The current look will be used for new documents.')
          }}
        />
      </RibbonGroup>
      <RibbonGroup label="Page Background" priority={4}>
        <MenuButton
          large
          icon={Stamp}
          label="Watermark"
          items={[
            { heading: 'Disclaimers' },
            ...WATERMARKS.map((w) => ({
              label: w.label,
              active: design.watermark?.text === w.text && design.watermark.layout === w.layout,
              onClick: () => setDesign({ ...design, watermark: { text: w.text, layout: w.layout, color: '#BFBFBF', semitransparent: true } }),
            })),
            'separator',
            { label: 'Custom Watermark…', onClick: () => app.openDialog('watermark') },
            { label: 'Remove Watermark', disabled: !design.watermark, onClick: () => setDesign({ ...design, watermark: null }) },
          ]}
        />
        <PopoverButton large icon={Droplet} label="Page Color" className="palette-menu">
          {(close) => (
            <>
              <FontColorPalette
                autoLabel="No Color"
                onPick={(c) => {
                  setDesign({ ...design, pageColor: c, pageFill: null })
                  close()
                }}
                onAuto={() => {
                  setDesign({ ...design, pageColor: null, pageFill: null })
                  close()
                }}
              />
              <div className="menu-heading">Fill Effects (Gradient)</div>
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
                    title="Two colors, vertical"
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
          label="Page Borders"
          items={BORDERS.map((b) => ({
            label: b.label,
            active: b.border ? design.pageBorder?.style === b.border.style && design.pageBorder.color === b.border.color : !design.pageBorder,
            onClick: () => setDesign({ ...design, pageBorder: b.border }),
          }))}
        />
      </RibbonGroup>
    </>
  )
}
