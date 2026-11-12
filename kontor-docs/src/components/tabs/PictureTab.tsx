import { Crop, Droplet, Eraser, FileDown, ImageUp, MessageSquareText, Palette, Sparkles, SquareDashed, SunMedium, Undo2, Wand2 } from 'lucide-react'
import { MenuButton, PopoverButton, RibbonButton, RibbonGroup, cls, keepFocus } from '../ui'
import { FontColorPalette } from '../palettes'
import { PICTURE_STYLES } from '../../editor/ImageFormat'
import { pictureFilter } from '../../editor/Picture'
import { readFileAsDataUrl, pickFile } from '../../editor/commands'
import { ArrangeGroup, SizeGroup, selectedDrawing, updateDrawing } from './DrawingGroups'
import type { TabProps } from './types'
import { t } from '../../i18n'
import { removeBackground } from '../../editor/pictureTools'

const LEVELS = [-0.4, -0.2, 0, 0.2, 0.4]
const pct = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`

function Thumb({ src, attrs, onClick, title, active }: { src: string; attrs: Record<string, unknown>; onClick: () => void; title: string; active?: boolean }) {
  return (
    <button type="button" className={cls('pic-thumb', active && 'is-active')} title={title} aria-label={title} onMouseDown={keepFocus} onClick={onClick}>
      <img src={src} alt="" style={{ filter: pictureFilter(attrs), opacity: attrs.transparency ? 1 - Number(attrs.transparency) : undefined }} />
    </button>
  )
}

export function PictureTab({ editor, app }: TabProps) {
  const d = selectedDrawing(editor)
  const a = (d?.node.attrs ?? {}) as Record<string, unknown>
  const src = (a.src as string) ?? ''
  const update = (patch: Record<string, unknown>) => updateDrawing(editor, patch)
  /** Crops the picture symmetrically to an aspect ratio, keeping its width. */
  const cropToRatio = (ratio: number) => {
    const img = d ? (editor.view.nodeDOM(d.pos) as HTMLElement | null)?.querySelector('img') : null
    if (!img?.naturalWidth) return
    const natural = img.naturalWidth / img.naturalHeight
    const width = (Number(a.width) || img.naturalWidth) * (1 - (Number(a.cropLeft) || 0) - (Number(a.cropRight) || 0))
    const side = natural > ratio ? (1 - ratio / natural) / 2 : 0
    const tb = natural < ratio ? (1 - natural / ratio) / 2 : 0
    update({ cropLeft: side, cropRight: side, cropTop: tb, cropBottom: tb, width: Math.round(width), height: Math.round(width / ratio) })
  }

  return (
    <>
      <RibbonGroup label={t('Adjust')} priority={2}>
        <RibbonButton
          large
          icon={Eraser}
          label={t('Remove Background')}
          title={t('Remove the background color around the picture (Ctrl+Z restores it)')}
          onClick={async () => {
            try {
              const next = await removeBackground(src, 25)
              if (next) update({ src: next })
              else alert(t('No background was found along the edges of this picture.'))
            } catch {
              alert(t('This picture could not be read.'))
            }
          }}
        />
        <PopoverButton large icon={SunMedium} label={t('Corrections')} className="pic-gallery-menu">
          {(close) => (
            <>
              <div className="menu-heading">{t('Brightness/Contrast')}</div>
              <div className="pic-grid">
                {LEVELS.map((c) =>
                  LEVELS.map((b) => (
                    <Thumb
                      key={`${b}${c}`}
                      src={src}
                      attrs={{ ...a, brightness: b, contrast: c }}
                      active={(Number(a.brightness) || 0) === b && (Number(a.contrast) || 0) === c}
                      title={t('Brightness: {brightness} Contrast: {contrast}', { brightness: pct(b), contrast: pct(c) })}
                      onClick={() => {
                        close()
                        update({ brightness: b, contrast: c })
                      }}
                    />
                  )),
                )}
              </div>
            </>
          )}
        </PopoverButton>
        <PopoverButton large icon={Palette} label={t('Color')} className="pic-gallery-menu">
          {(close) => (
            <>
              <div className="menu-heading">{t('Color Saturation')}</div>
              <div className="pic-row">
                {[0, 0.33, 0.66, 1, 2, 3].map((s) => (
                  <Thumb key={s} src={src} attrs={{ ...a, saturation: s, recolor: 'none' }} active={(a.saturation ?? 1) === s} title={t('Saturation: {n}%', { n: Math.round(s * 100) })} onClick={() => (close(), update({ saturation: s }))} />
                ))}
              </div>
              <div className="menu-heading">{t('Recolor')}</div>
              <div className="pic-row">
                {(['none', 'grayscale', 'sepia', 'washout', 'blackWhite', 'invert'] as const).map((r) => (
                  <Thumb key={r} src={src} attrs={{ ...a, recolor: r }} active={(a.recolor ?? 'none') === r} title={{ none: t('No Recolor'), grayscale: t('Grayscale'), sepia: t('Sepia'), washout: t('Washout'), blackWhite: t('Black and White'), invert: t('Invert') }[r]} onClick={() => (close(), update({ recolor: r }))} />
                ))}
              </div>
            </>
          )}
        </PopoverButton>
        <div className="col">
          <MenuButton
            icon={Wand2}
            label={t('Artistic Effects')}
            showLabel
            items={[
              { label: t('None'), active: a.effect !== 'blur', onClick: () => update({ effect: 'none' }) },
              { label: t('Blur'), active: a.effect === 'blur', onClick: () => update({ effect: 'blur' }) },
            ]}
          />
          <MenuButton
            icon={Droplet}
            label={t('Transparency')}
            showLabel
            items={[0, 0.15, 0.3, 0.5, 0.65, 0.8, 0.95].map((v) => ({ label: t('Transparency: {n}%', { n: Math.round(v * 100) }), active: (Number(a.transparency) || 0) === v, onClick: () => update({ transparency: v }) }))}
          />
          <RibbonButton
            icon={ImageUp}
            label={t('Change Picture')}
            showLabel
            onClick={async () => {
              const file = await pickFile('image/*')
              if (file) update({ src: await readFileAsDataUrl(file), width: null, height: null, cropTop: 0, cropRight: 0, cropBottom: 0, cropLeft: 0 })
            }}
          />
        </div>
        <RibbonButton icon={FileDown} label={t('Compress Pictures')} title={t('Compress Pictures: reduce the size of pictures in the document')} onClick={() => app.openDialog('compressPictures')} />
        <RibbonButton
          large
          icon={Undo2}
          label={t('Reset Picture')}
          title={t('Discard all the formatting changes you made to this picture')}
          onClick={() => update({ frame: null, rotation: 0, flip: null, brightness: 0, contrast: 0, saturation: 1, recolor: 'none', transparency: 0, effect: 'none', borderWidth: 0, cropTop: 0, cropRight: 0, cropBottom: 0, cropLeft: 0, cropShape: null })}
        />
      </RibbonGroup>
      <RibbonGroup label={t('Picture Styles')} priority={3}>
        <div className="picture-style-gallery">
          {PICTURE_STYLES.map((s) => (
            <button key={s.id} type="button" title={t(s.label)} className={cls('picture-style-tile', (a.frame ?? 'none') === s.id && 'is-active')} onMouseDown={keepFocus} onClick={() => update({ frame: s.id === 'none' ? null : s.id })}>
              <span className={`img-frame-${s.id}`} />
            </button>
          ))}
        </div>
        <div className="col">
          <PopoverButton icon={SquareDashed} label={t('Picture Border')} showLabel className="palette-menu">
            {(close) => (
              <>
                <FontColorPalette
                  autoLabel={t('No Outline')}
                  onAuto={() => (close(), update({ borderWidth: 0 }))}
                  onPick={(c) => (close(), update({ borderColor: c, borderWidth: Number(a.borderWidth) || 1 }))}
                />
                <div className="menu-heading">{t('Weight')}</div>
                {[0.25, 0.5, 0.75, 1, 1.5, 2.25, 3, 4.5, 6].map((w) => (
                  <button key={w} type="button" className={cls('menu-item', a.borderWidth === w && 'is-active')} onMouseDown={keepFocus} onClick={() => (close(), update({ borderWidth: w, borderColor: a.borderColor ?? '#000000' }))}>
                    <span className="weight-sample" style={{ borderTopWidth: `${w}pt` }} /> {w} {t('pt')}</button>
                ))}
                <div className="menu-heading">{t('Dashes')}</div>
                {(['solid', 'dashed', 'dotted', 'double'] as const).map((s) => (
                  <button key={s} type="button" className={cls('menu-item', (a.borderDash ?? 'solid') === s && 'is-active')} onMouseDown={keepFocus} onClick={() => (close(), update({ borderDash: s, borderWidth: Number(a.borderWidth) || 1 }))}>
                    <span className="weight-sample" style={{ borderTopStyle: s, borderTopWidth: s === 'double' ? 3 : 2 }} /> {s[0].toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </>
            )}
          </PopoverButton>
          <MenuButton
            icon={Sparkles}
            label={t('Picture Effects')}
            showLabel
            items={[
              { label: t('No Effect'), active: (a.effect ?? 'none') === 'none', onClick: () => update({ effect: 'none' }) },
              { label: t('Shadow'), active: a.effect === 'shadow', onClick: () => update({ effect: 'shadow' }) },
              { label: t('Reflection'), active: a.effect === 'reflection', onClick: () => update({ effect: 'reflection' }) },
              { label: t('Glow'), active: a.effect === 'glow', onClick: () => update({ effect: 'glow' }) },
              { label: t('Soft Edges'), active: a.effect === 'softEdges', onClick: () => update({ effect: 'softEdges' }) },
            ]}
          />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Accessibility')} priority={0}>
        <RibbonButton large icon={MessageSquareText} label={t('Alt Text')} onClick={() => app.openDialog('altText')} />
      </RibbonGroup>
      <ArrangeGroup editor={editor} app={app} />
      <SizeGroup
        editor={editor}
        unit={app.settings.unit}
        keepRatio
        extra={
          <MenuButton
            large
            icon={Crop}
            label={t('Crop')}
            items={[
              { label: t('Crop…'), onClick: () => app.openDialog('crop') },
              { heading: t('Crop to Shape') },
              { label: t('Rectangle'), active: !a.cropShape, onClick: () => update({ cropShape: null }) },
              { label: t('Rounded Rectangle'), active: a.cropShape === 'roundRect', onClick: () => update({ cropShape: 'roundRect' }) },
              { label: t('Oval'), active: a.cropShape === 'ellipse', onClick: () => update({ cropShape: 'ellipse' }) },
              { heading: t('Aspect Ratio') },
              ...([[1, 1], [3, 2], [4, 3], [16, 9], [2, 3], [3, 4]] as const).map(([w, h]) => ({ label: `${w}:${h}`, onClick: () => cropToRatio(w / h) })),
              { label: t('Remove Crop'), onClick: () => update({ cropTop: 0, cropRight: 0, cropBottom: 0, cropLeft: 0, cropShape: null }) },
            ]}
          />
        }
      />
    </>
  )
}
