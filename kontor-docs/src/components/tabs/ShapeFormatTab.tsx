import { AlignVerticalJustifyCenter, PaintBucket, PenLine, Shapes as ShapesIcon, Sparkles, SquarePen, TextCursorInput, Type } from 'lucide-react'
import { MenuButton, PopoverButton, RibbonButton, RibbonGroup, cls, keepFocus } from '../ui'
import { FontColorPalette } from '../palettes'
import { SHAPE_GROUPS, shapesIn, type ShapeGroup } from '../../editor/shapePaths'
import { shapeSvg } from '../../editor/Shape'
import { WORDART_STYLES } from '../../editor/TextBox'
import { ArrangeGroup, SizeGroup, selectedDrawing, updateDrawing } from './DrawingGroups'
import type { TabProps } from './types'
import { t, tx } from '../../i18n'

const SHAPE_GROUP_LABELS: Record<ShapeGroup, string> = {
  Lines: tx('Lines'), Rectangles: tx('Rectangles'), 'Basic Shapes': tx('Basic Shapes'), 'Block Arrows': tx('Block Arrows'),
  'Equation Shapes': tx('Equation Shapes'), Flowchart: tx('Flowchart'), 'Stars and Banners': tx('Stars and Banners'), Callouts: tx('Callouts'),
}

/** Shape gallery grouped like the original's Shapes menu. */
export function ShapeGallery({ onPick }: { onPick: (kind: string) => void }) {
  return (
    <div className="shape-gallery">
      {SHAPE_GROUPS.map((g) => (
        <div key={g}>
          <div className="menu-heading">{t(SHAPE_GROUP_LABELS[g])}</div>
          <div className="shape-grid">
            {shapesIn(g).map((s) => (
              <button
                key={s.id}
                type="button"
                className="shape-tile"
                title={t(s.label)}
                aria-label={t(s.label)}
                onMouseDown={keepFocus}
                onClick={() => onPick(s.id)}
                dangerouslySetInnerHTML={{ __html: shapeSvg({ kind: s.id, fill: s.line ? null : '#ffffff', stroke: '#404040', strokeWidth: 0.75 }, 20, 16) }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

const ACCENTS = ['#2F6FC4', '#E3742F', '#7F7F7F', '#F2B705', '#4FA3D9', '#5FA84B', '#404040']
const darker = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v * 0.7))
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}
const lighter = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * 0.8))
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/** Quick styles: colored fill, colored outline, subtle and intense variants per accent color. */
export const QUICK_STYLES = ACCENTS.flatMap((c) => [
  { label: t('Colored Fill'), fill: c, stroke: darker(c), textColor: '#FFFFFF', gradient: false, shadow: false },
  { label: t('Colored Outline'), fill: '#FFFFFF', stroke: c, textColor: '#000000', gradient: false, shadow: false },
  { label: t('Subtle Effect'), fill: lighter(c), stroke: c, textColor: '#000000', gradient: false, shadow: false },
  { label: t('Intense Effect'), fill: c, stroke: darker(c), textColor: '#FFFFFF', gradient: true, shadow: true },
])

function ColorMenu({ label, icon, onPick, noneLabel, onNone }: { label: string; icon: typeof PaintBucket; onPick: (c: string) => void; noneLabel: string; onNone: () => void }) {
  return (
    <PopoverButton icon={icon} label={label} showLabel className="palette-menu">
      {(close) => (
        <FontColorPalette
          autoLabel={noneLabel}
          onAuto={() => {
            close()
            onNone()
          }}
          onPick={(c) => {
            close()
            onPick(c)
          }}
        />
      )}
    </PopoverButton>
  )
}

export function ShapeFormatTab({ editor, app }: TabProps) {
  const d = selectedDrawing(editor)
  const a = (d?.node.attrs ?? {}) as Record<string, unknown>
  const type = d?.node.type.name
  const update = (patch: Record<string, unknown>) => updateDrawing(editor, patch)
  const isBox = type === 'textBox'
  // A shape with text: a text box with a shape outline, formatted like a shape.
  const isShapeBox = isBox && !!a.kind
  const shapeLike = !isBox || isShapeBox

  if (type === 'signatureLine')
    return (
      <>
        <RibbonGroup label={t('Signature')} priority={3}>
          <RibbonButton large icon={PenLine} label={t('Signature Setup')} onClick={() => d && (app.setObjectPos(d.pos), app.openDialog('signature'))} />
        </RibbonGroup>
        <ArrangeGroup editor={editor} app={app} />
        <SizeGroup editor={editor} unit={app.settings.unit} keepRatio={false} />
      </>
    )

  return (
    <>
      <RibbonGroup label={t('Insert Shapes')} priority={2}>
        <PopoverButton large icon={ShapesIcon} label={t('Shapes')} className="shape-menu">
          {(close) => (
            <ShapeGallery
              onPick={(kind) => {
                close()
                app.startDraw(kind)
              }}
            />
          )}
        </PopoverButton>
        <div className="col">
          {shapeLike && (
            <PopoverButton icon={SquarePen} label={t('Change Shape')} showLabel className="shape-menu">
              {(close) => (
                <ShapeGallery
                  onPick={(kind) => {
                    close()
                    update({ kind })
                  }}
                />
              )}
            </PopoverButton>
          )}
          <RibbonButton icon={TextCursorInput} label={t('Draw Text Box')} showLabel onClick={() => app.startDraw('textBox')} />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Shape Styles')} priority={4}>
        <div className="quick-style-gallery">
          {QUICK_STYLES.slice(0, 28).map((s, i) => (
            <button
              key={i}
              type="button"
              className="quick-style"
              title={t(s.label)}
              style={{ background: s.gradient ? `linear-gradient(${lighter(s.fill)}, ${s.fill})` : s.fill, borderColor: s.stroke, color: s.textColor, boxShadow: s.shadow ? '2px 2px 3px rgba(0,0,0,.35)' : undefined }}
              onMouseDown={keepFocus}
              onClick={() => update(isBox && !isShapeBox ? { fill: s.fill, stroke: s.stroke, strokeWidth: Number(a.strokeWidth) || 0.75 } : { fill: s.fill, stroke: s.stroke, textColor: s.textColor, gradient: s.gradient, shadow: s.shadow })}
            >
              Abc</button>
          ))}
        </div>
        <div className="col">
          <ColorMenu label={t('Shape Fill')} icon={PaintBucket} noneLabel={t('No Fill')} onNone={() => update({ fill: null })} onPick={(c) => update({ fill: c })} />
          <PopoverButton icon={PenLine} label={t('Shape Outline')} showLabel className="palette-menu">
            {(close) => (
              <>
                <FontColorPalette autoLabel={t('No Outline')} onAuto={() => (close(), update({ stroke: null }))} onPick={(c) => (close(), update({ stroke: c }))} />
                <div className="menu-heading">{t('Weight')}</div>
                {[0.25, 0.5, 0.75, 1, 1.5, 2.25, 3, 4.5, 6].map((w) => (
                  <button key={w} type="button" className={cls('menu-item', a.strokeWidth === w && 'is-active')} onMouseDown={keepFocus} onClick={() => (close(), update({ strokeWidth: w, stroke: a.stroke ?? '#000000' }))}>
                    <span className="weight-sample" style={{ borderTopWidth: `${w}pt` }} /> {w} {t('pt')}</button>
                ))}
                {shapeLike && (
                  <>
                    <div className="menu-heading">{t('Dashes')}</div>
                    {(['solid', 'dash', 'dot', 'dashDot'] as const).map((s) => (
                      <button key={s} type="button" className={cls('menu-item', (a.dash ?? 'solid') === s && 'is-active')} onMouseDown={keepFocus} onClick={() => (close(), update({ dash: s }))}>
                        {{ solid: t('Solid'), dash: t('Dash'), dot: t('Round Dot'), dashDot: t('Dash Dot') }[s]}
                      </button>
                    ))}
                    <div className="menu-heading">{t('Arrows')}</div>
                    {(['line', 'arrowLine', 'doubleArrowLine'] as const).map((k) => (
                      <button key={k} type="button" className={cls('menu-item', a.kind === k && 'is-active')} disabled={!String(a.kind).endsWith('ine')} onMouseDown={keepFocus} onClick={() => (close(), update({ kind: k }))}>
                        {{ line: t('No Arrow'), arrowLine: t('Arrow at End'), doubleArrowLine: t('Arrows at Both Ends') }[k]}
                      </button>
                    ))}
                  </>
                )}
              </>
            )}
          </PopoverButton>
          {shapeLike && (
            <MenuButton
              icon={Sparkles}
              label={t('Shape Effects')}
              showLabel
              items={[
                { label: t('No Effect'), active: !a.shadow && !a.glow, onClick: () => update({ shadow: false, glow: null }) },
                { label: t('Shadow'), active: !!a.shadow, onClick: () => update({ shadow: !a.shadow }) },
                { label: t('Glow'), active: !!a.glow, onClick: () => update({ glow: a.glow ? null : '#8FB3E6' }) },
                { label: t('Gradient Fill'), active: !!a.gradient, onClick: () => update({ gradient: !a.gradient }) },
              ]}
            />
          )}
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('WordArt Styles')} priority={1}>
        {isBox ? (
          <MenuButton
            large
            icon={Type}
            label={t('Quick Styles')}
            wide
            items={[
              { label: t('No WordArt'), active: !a.wordArt, onClick: () => update({ wordArt: null }) },
              ...WORDART_STYLES.map((w) => ({ label: t(w.label), active: a.wordArt === w.id, preview: <span className={`wordart wordart-${w.id} wordart-preview`}>A</span>, onClick: () => update({ wordArt: w.id }) })),
            ]}
          />
        ) : (
          <ColorMenu label={t('Text Fill')} icon={Type} noneLabel={t('Automatic')} onNone={() => update({ textColor: '#000000' })} onPick={(c) => update({ textColor: c })} />
        )}
      </RibbonGroup>
      <RibbonGroup label={t('Text')} priority={1}>
        <MenuButton
          large
          icon={AlignVerticalJustifyCenter}
          label={t('Align Text')}
          items={(['top', 'middle', 'bottom'] as const).map((v) => ({ label: v[0].toUpperCase() + v.slice(1), active: (a.vAlign ?? (isBox ? 'top' : 'middle')) === v, onClick: () => update({ vAlign: v }) }))}
        />
        {!isBox && (
          <div className="col">
            <MenuButton icon={Type} label={t('Font Size')} showLabel items={[8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48].map((s) => ({ label: `${s} pt`, active: a.fontSize === s, onClick: () => update({ fontSize: s }) }))} />
            <RibbonButton icon={Type} label={t('Bold')} showLabel active={!!a.bold} onClick={() => update({ bold: !a.bold })} />
          </div>
        )}
      </RibbonGroup>
      <ArrangeGroup editor={editor} app={app} rotatable={!isBox} />
      <SizeGroup editor={editor} unit={app.settings.unit} keepRatio={false} />
    </>
  )
}
