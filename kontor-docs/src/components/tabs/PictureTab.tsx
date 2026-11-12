import { Crop, Droplet, ImageUp, MessageSquareText, Palette, Sparkles, SquareDashed, SunMedium, Undo2, Wand2 } from 'lucide-react'
import { MenuButton, PopoverButton, RibbonButton, RibbonGroup, cls, keepFocus } from '../ui'
import { FontColorPalette } from '../palettes'
import { PICTURE_STYLES } from '../../editor/ImageFormat'
import { pictureFilter } from '../../editor/Picture'
import { readFileAsDataUrl, pickFile } from '../../editor/commands'
import { ArrangeGroup, SizeGroup, selectedDrawing, updateDrawing } from './DrawingGroups'
import type { TabProps } from './types'

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
      <RibbonGroup label="Adjust" priority={2}>
        <PopoverButton large icon={SunMedium} label="Corrections" className="pic-gallery-menu">
          {(close) => (
            <>
              <div className="menu-heading">Brightness/Contrast</div>
              <div className="pic-grid">
                {LEVELS.map((c) =>
                  LEVELS.map((b) => (
                    <Thumb
                      key={`${b}${c}`}
                      src={src}
                      attrs={{ ...a, brightness: b, contrast: c }}
                      active={(Number(a.brightness) || 0) === b && (Number(a.contrast) || 0) === c}
                      title={`Brightness: ${pct(b)} Contrast: ${pct(c)}`}
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
        <PopoverButton large icon={Palette} label="Color" className="pic-gallery-menu">
          {(close) => (
            <>
              <div className="menu-heading">Color Saturation</div>
              <div className="pic-row">
                {[0, 0.33, 0.66, 1, 2, 3].map((s) => (
                  <Thumb key={s} src={src} attrs={{ ...a, saturation: s, recolor: 'none' }} active={(a.saturation ?? 1) === s} title={`Saturation: ${Math.round(s * 100)}%`} onClick={() => (close(), update({ saturation: s }))} />
                ))}
              </div>
              <div className="menu-heading">Recolor</div>
              <div className="pic-row">
                {(['none', 'grayscale', 'sepia', 'washout', 'blackWhite', 'invert'] as const).map((r) => (
                  <Thumb key={r} src={src} attrs={{ ...a, recolor: r }} active={(a.recolor ?? 'none') === r} title={{ none: 'No Recolor', grayscale: 'Grayscale', sepia: 'Sepia', washout: 'Washout', blackWhite: 'Black and White', invert: 'Invert' }[r]} onClick={() => (close(), update({ recolor: r }))} />
                ))}
              </div>
            </>
          )}
        </PopoverButton>
        <div className="col">
          <MenuButton
            icon={Wand2}
            label="Artistic Effects"
            showLabel
            items={[
              { label: 'None', active: a.effect !== 'blur', onClick: () => update({ effect: 'none' }) },
              { label: 'Blur', active: a.effect === 'blur', onClick: () => update({ effect: 'blur' }) },
            ]}
          />
          <MenuButton
            icon={Droplet}
            label="Transparency"
            showLabel
            items={[0, 0.15, 0.3, 0.5, 0.65, 0.8, 0.95].map((t) => ({ label: `Transparency: ${Math.round(t * 100)}%`, active: (Number(a.transparency) || 0) === t, onClick: () => update({ transparency: t }) }))}
          />
          <RibbonButton
            icon={ImageUp}
            label="Change Picture"
            showLabel
            onClick={async () => {
              const file = await pickFile('image/*')
              if (file) update({ src: await readFileAsDataUrl(file), width: null, height: null, cropTop: 0, cropRight: 0, cropBottom: 0, cropLeft: 0 })
            }}
          />
        </div>
        <RibbonButton
          large
          icon={Undo2}
          label="Reset Picture"
          title="Discard all the formatting changes you made to this picture"
          onClick={() => update({ frame: null, rotation: 0, flip: null, brightness: 0, contrast: 0, saturation: 1, recolor: 'none', transparency: 0, effect: 'none', borderWidth: 0, cropTop: 0, cropRight: 0, cropBottom: 0, cropLeft: 0, cropShape: null })}
        />
      </RibbonGroup>
      <RibbonGroup label="Picture Styles" priority={3}>
        <div className="picture-style-gallery">
          {PICTURE_STYLES.map((s) => (
            <button key={s.id} type="button" title={s.label} className={cls('picture-style-tile', (a.frame ?? 'none') === s.id && 'is-active')} onMouseDown={keepFocus} onClick={() => update({ frame: s.id === 'none' ? null : s.id })}>
              <span className={`img-frame-${s.id}`} />
            </button>
          ))}
        </div>
        <div className="col">
          <PopoverButton icon={SquareDashed} label="Picture Border" showLabel className="palette-menu">
            {(close) => (
              <>
                <FontColorPalette
                  autoLabel="No Outline"
                  onAuto={() => (close(), update({ borderWidth: 0 }))}
                  onPick={(c) => (close(), update({ borderColor: c, borderWidth: Number(a.borderWidth) || 1 }))}
                />
                <div className="menu-heading">Weight</div>
                {[0.25, 0.5, 0.75, 1, 1.5, 2.25, 3, 4.5, 6].map((w) => (
                  <button key={w} type="button" className={cls('menu-item', a.borderWidth === w && 'is-active')} onMouseDown={keepFocus} onClick={() => (close(), update({ borderWidth: w, borderColor: a.borderColor ?? '#000000' }))}>
                    <span className="weight-sample" style={{ borderTopWidth: `${w}pt` }} /> {w} pt
                  </button>
                ))}
                <div className="menu-heading">Dashes</div>
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
            label="Picture Effects"
            showLabel
            items={[
              { label: 'No Effect', active: (a.effect ?? 'none') === 'none', onClick: () => update({ effect: 'none' }) },
              { label: 'Shadow', active: a.effect === 'shadow', onClick: () => update({ effect: 'shadow' }) },
              { label: 'Reflection', active: a.effect === 'reflection', onClick: () => update({ effect: 'reflection' }) },
              { label: 'Glow', active: a.effect === 'glow', onClick: () => update({ effect: 'glow' }) },
              { label: 'Soft Edges', active: a.effect === 'softEdges', onClick: () => update({ effect: 'softEdges' }) },
            ]}
          />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Accessibility" priority={0}>
        <RibbonButton large icon={MessageSquareText} label="Alt Text" onClick={() => app.openDialog('altText')} />
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
            label="Crop"
            items={[
              { label: 'Crop…', onClick: () => app.openDialog('crop') },
              { heading: 'Crop to Shape' },
              { label: 'Rectangle', active: !a.cropShape, onClick: () => update({ cropShape: null }) },
              { label: 'Rounded Rectangle', active: a.cropShape === 'roundRect', onClick: () => update({ cropShape: 'roundRect' }) },
              { label: 'Oval', active: a.cropShape === 'ellipse', onClick: () => update({ cropShape: 'ellipse' }) },
              { heading: 'Aspect Ratio' },
              ...([[1, 1], [3, 2], [4, 3], [16, 9], [2, 3], [3, 4]] as const).map(([w, h]) => ({ label: `${w}:${h}`, onClick: () => cropToRatio(w / h) })),
              { label: 'Remove Crop', onClick: () => update({ cropTop: 0, cropRight: 0, cropBottom: 0, cropLeft: 0, cropShape: null }) },
            ]}
          />
        }
      />
    </>
  )
}
