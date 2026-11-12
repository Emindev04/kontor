import { Baseline, Combine, Crop, ImagePlus, PaintBucket, PenLine, RotateCcw, Shapes, SquarePen, Sparkles, Type, SunMedium, Palette, Droplet, FileImage, ScanText, Minimize2, Spline, Brush, Eraser, LayoutGrid } from 'lucide-react'
import type { ImageElement, ShapeElement } from '../../model/types'
import { resolveColor } from '../../model/color'
import { presetTitle, SHAPE_PRESETS } from '../../model/shapes'
import { selectedElements, store, useStore } from '../../store/store'
import * as A from '../../store/actions'
import { readImageFile } from '../../io/images'
import * as T from '../../editor/textCommands'
import { ColorPalette } from '../palettes'
import { ColorSplitButton, MenuButton, NumberField, PopoverButton, RibbonButton, RibbonGroup, keepFocus, pickFile } from '../ui'
import { ArrangeButtons, ArrangeExtraButtons, EffectsMenuContent, FillMenuContent, OutlineMenuContent, QuickStylesGallery, ShapeGallery, ShapesButton, startShapeTool, useThemeColors } from './common'
import { WordArtGallery, applyWordArt } from './InsertTab'
import type { TabProps } from './types'
import { canMerge, mergeShapes } from '../../editor/mergeShapes'
import { PICTURE_LAYOUTS } from '../../model/pictureLayout'
import { t, tx } from '../../i18n'

const IN = 96

export function SizeGroup({ ui }: TabProps) {
  const sel = useStore(() => selectedElements())
  const el = sel[0]
  const keep = el?.type === 'image'
  return (
    <RibbonGroup label={t('Size')} onLauncher={() => ui.openPane('formatShape')} launcherTitle={t('Size and Position')}>
      <div className="col">
        <label className="field-row">
          <span>{t('Height:')}</span>
          <NumberField label={t('Shape Height')} value={el ? el.h / IN : null} step={0.1} min={0.01} max={56} suffix='"' disabled={!el} onChange={(v) => A.setSelectionSize(null, v * IN, keep)} />
        </label>
        <label className="field-row">
          <span>{t('Width:')}</span>
          <NumberField label={t('Shape Width')} value={el ? el.w / IN : null} step={0.1} min={0.01} max={56} suffix='"' disabled={!el} onChange={(v) => A.setSelectionSize(v * IN, null, keep)} />
        </label>
      </div>
    </RibbonGroup>
  )
}

function changeShape(prst: string) {
  A.updateSelected((e) => (e.type === 'shape' && !e.placeholder ? { ...e, prst } : e.type === 'shape' ? { ...e, prst } : e))
}

export function ShapeFormatTab({ ui }: TabProps) {
  const colors = useThemeColors()
  const shapes = useStore(() => selectedElements().filter((e): e is ShapeElement => e.type === 'shape'))
  const first = shapes[0]
  return (
    <>
      <RibbonGroup label={t('Insert Shapes')}>
        <ShapesButton />
        <div className="col">
          <PopoverButton icon={SquarePen} label={t('Edit Shape')} showLabel disabled={!first} panelClass="shape-panel">
            {(close) => (
              <>
                <button type="button" className="menu-item" disabled={shapes.length !== 1 || !A.canEditPoints(first)} onMouseDown={keepFocus} onClick={() => (close(), A.startEditPoints(first.id))}>
                  <Spline size={16} /> <span className="menu-item-text">{t('Edit Points')}</span>
                </button>
                <div className="palette-heading">{t('Change Shape')}</div>
                <ShapeGallery shapesOnly onPick={(p) => (close(), changeShape(p.prst))} />
              </>
            )}
          </PopoverButton>
          <RibbonButton icon={Type} label={t('Text Box')} showLabel onClick={() => store.set({ tool: { kind: 'textbox' } })} />
          <MenuButton icon={Shapes} label={t('Recent Shapes')} showLabel items={SHAPE_PRESETS.slice(8, 16).map((p) => ({ label: presetTitle(p), onClick: () => startShapeTool(p) }))} />
          <MenuButton
            icon={Combine}
            label={t('Merge Shapes')}
            showLabel
            disabled={!canMerge(shapes) || shapes.length !== selectedElements().length}
            items={[
              { label: t('Union'), onClick: () => mergeShapes('union') },
              { label: t('Combine'), onClick: () => mergeShapes('combine') },
              { label: t('Fragment'), onClick: () => mergeShapes('fragment') },
              { label: t('Intersect'), onClick: () => mergeShapes('intersect') },
              { label: t('Subtract'), onClick: () => mergeShapes('subtract') },
            ]}
          />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Shape Styles')} onLauncher={() => ui.openPane('formatShape')} launcherTitle={t('Format Shape')}>
        <PopoverButton icon={Palette} label={t('Quick Styles')} large disabled={!first} panelClass="menu-wide">
          {(close) => <QuickStylesGallery close={close} />}
        </PopoverButton>
        <div className="col">
          <PopoverButton icon={PaintBucket} label={t('Shape Fill')} showLabel disabled={!first} panelClass="palette-menu">
            {(close) => <FillMenuContent close={close} onPicture={() => ui.openPane('formatShape')} />}
          </PopoverButton>
          <PopoverButton icon={PenLine} label={t('Shape Outline')} showLabel disabled={!first} panelClass="palette-menu">
            {(close) => <OutlineMenuContent close={close} />}
          </PopoverButton>
          <PopoverButton icon={Sparkles} label={t('Shape Effects')} showLabel disabled={!first} panelClass="palette-menu">
            {(close) => <EffectsMenuContent close={close} />}
          </PopoverButton>
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('WordArt Styles')}>
        <PopoverButton iconNode={<span className="icon-wordart">A</span>} label={t('Quick Styles')} large disabled={!first?.text} panelClass="palette-menu">
          {(close) => <WordArtGallery onPick={(w) => (close(), applyWordArt(w))} />}
        </PopoverButton>
        <div className="col">
          <ColorSplitButton icon={Baseline} label={t('Text Fill')} color={resolveColor(T.textStyleValue('color') ?? 'theme:tx1', colors)} disabled={!first?.text} onApply={() => undefined}>
            {(close) => <ColorPalette colors={colors} auto={{ label: t('Automatic'), onClick: () => (close(), T.setTextStyle({ color: null })) }} onPick={(c) => (close(), T.setTextStyle({ color: c }))} />}
          </ColorSplitButton>
          <PopoverButton icon={PenLine} label={t('Text Outline')} showLabel disabled={!first?.text} panelClass="palette-menu">
            {(close) => (
              <ColorPalette
                colors={colors}
                none={{ label: t('No Outline'), onClick: () => (close(), A.updateSelected((e) => (e.type === 'shape' && e.text ? { ...e, text: { ...e.text, textOutline: null } } : e))) }}
                onPick={(c) => (close(), A.updateSelected((e) => (e.type === 'shape' && e.text ? { ...e, text: { ...e.text, textOutline: { color: c, width: e.text.textOutline?.width ?? 0.75 } } } : e)))}
              />
            )}
          </PopoverButton>
          <MenuButton
            icon={Sparkles}
            label={t('Text Effects')}
            showLabel
            disabled={!first?.text}
            items={() => [
              { heading: t('Shadow') },
              { label: t('Shadow'), active: !!T.textStyleValue('shadow'), onClick: () => T.setTextStyle({ shadow: T.textStyleValue('shadow') ? null : true }) },
              { label: t('No Shadow'), onClick: () => T.setTextStyle({ shadow: null }) },
              { heading: t('Glow') },
              ...TEXT_GLOWS.map((g) => ({ label: t(g.label), active: T.textStyleValue('glow') === g.color && (T.textStyleValue('glowSize') ?? 5) === g.size, onClick: () => T.setTextStyle({ glow: g.color, glowSize: g.size }) })),
              { label: t('No Glow'), onClick: () => T.setTextStyle({ glow: null, glowSize: null }) },
              { heading: t('Reflection') },
              {
                label: t('Reflection'),
                active: !!(first?.type === 'shape' && first.text?.textReflection),
                onClick: () => A.updateSelected((e) => (e.type === 'shape' && e.text ? { ...e, text: { ...e.text, textReflection: !e.text.textReflection || undefined } } : e)),
              },
              { label: t('No Reflection'), onClick: () => A.updateSelected((e) => (e.type === 'shape' && e.text ? { ...e, text: { ...e.text, textReflection: undefined } } : e)) },
              { heading: t('Transform') },
              ...TEXT_WARPS.map((w) => ({
                label: t(w.label),
                active: (first?.type === 'shape' ? (first.text?.warp ?? null) : null) === w.id,
                onClick: () => A.updateSelected((e) => (e.type === 'shape' && e.text ? { ...e, text: { ...e.text, warp: w.id ?? undefined } } : e)),
              })),
            ]}
          />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Accessibility')}>
        <RibbonButton icon={ScanText} label={t('Alt Text')} large disabled={!first} onClick={() => ui.openDialog('altText')} />
      </RibbonGroup>
      <RibbonGroup label={t('Arrange')}>
        <ArrangeButtons ui={ui} />
        <ArrangeExtraButtons />
      </RibbonGroup>
      <SizeGroup ui={ui} />
    </>
  )
}

const TEXT_WARPS: { label: string; id: string | null }[] = [
  { label: tx('No Transform'), id: null },
  { label: tx('Arch'), id: 'textArchUp' },
  { label: tx('Arch: Down'), id: 'textArchDown' },
  { label: tx('Circle'), id: 'textCircle' },
  { label: tx('Wave'), id: 'textWave1' },
  { label: tx('Triangle'), id: 'textTriangle' },
  { label: tx('Slant Up'), id: 'textSlantUp' },
  { label: tx('Slant Down'), id: 'textSlantDown' },
]

const TEXT_GLOWS: { label: string; color: string; size: number }[] = [
  { label: tx('Glow: 5 pt, Accent 1'), color: 'theme:accent1', size: 5 },
  { label: tx('Glow: 5 pt, Accent 2'), color: 'theme:accent2', size: 5 },
  { label: tx('Glow: 5 pt, Accent 4'), color: 'theme:accent4', size: 5 },
  { label: tx('Glow: 8 pt, Accent 1'), color: 'theme:accent1', size: 8 },
  { label: tx('Glow: 8 pt, Accent 6'), color: 'theme:accent6', size: 8 },
  { label: tx('Glow: 11 pt, Gold'), color: '#FFC000', size: 11 },
]

function updateImages(fn: (e: ImageElement) => ImageElement) {
  A.updateSelected((e) => (e.type === 'image' ? fn(e) : e))
}

export const PICTURE_STYLES: { label: string; apply: (e: ImageElement) => ImageElement }[] = [
  { label: tx('Simple Frame, White'), apply: (e) => ({ ...e, mask: undefined, line: { color: '#FFFFFF', width: 7, dash: 'solid' }, effects: { shadow: { color: '#000000', alpha: 0.35, blur: 5, dist: 2, angle: 45 } } }) },
  { label: tx('Simple Frame, Black'), apply: (e) => ({ ...e, mask: undefined, line: { color: '#000000', width: 7, dash: 'solid' }, effects: {} }) },
  { label: tx('Thick Matte, Black'), apply: (e) => ({ ...e, mask: undefined, line: { color: '#262626', width: 14, dash: 'solid' }, effects: {} }) },
  { label: tx('Drop Shadow Rectangle'), apply: (e) => ({ ...e, mask: undefined, line: null, effects: { shadow: { color: '#000000', alpha: 0.45, blur: 10, dist: 6, angle: 45 } } }) },
  { label: tx('Rounded Diagonal Corner, White'), apply: (e) => ({ ...e, mask: 'round2DiagRect', line: { color: '#FFFFFF', width: 5, dash: 'solid' }, effects: {} }) },
  { label: tx('Soft Edge Rectangle'), apply: (e) => ({ ...e, mask: undefined, line: null, effects: { softEdge: 5 } }) },
  { label: tx('Oval'), apply: (e) => ({ ...e, mask: 'ellipse', line: null, effects: { shadow: { color: '#000000', alpha: 0.3, blur: 6, dist: 3, angle: 45 } } }) },
  { label: tx('Reflected Rounded Rectangle'), apply: (e) => ({ ...e, mask: 'roundRect', line: null, effects: { reflection: true } }) },
  { label: tx('Metal Frame'), apply: (e) => ({ ...e, mask: undefined, line: { color: '#A6A6A6', width: 6, dash: 'solid' }, effects: { shadow: { color: '#000000', alpha: 0.4, blur: 4, dist: 3, angle: 90 } } }) },
]

export function PictureFormatTab({ ui }: TabProps) {
  const img = useStore(() => selectedElements().find((e): e is ImageElement => e.type === 'image'))
  const has = !!img
  const setAdjust = (patch: NonNullable<ImageElement['adjust']>) => updateImages((e) => ({ ...e, adjust: { ...e.adjust, ...patch } }))
  return (
    <>
      <RibbonGroup label={t('Background')}>
        <RibbonButton icon={Eraser} label={t('Remove Background')} large disabled={!has} onClick={() => ui.openDialog('removeBackground')} />
      </RibbonGroup>
      <RibbonGroup label={t('Adjust')}>
        <MenuButton
          icon={SunMedium}
          label={t('Corrections')}
          large
          disabled={!has}
          items={[
            { heading: t('Sharpen/Soften') },
            ...[-1, -0.5, 0, 0.5, 1].map((v) => ({ label: v === 0 ? t('No sharpening') : v < 0 ? t('Soften: {n}%', { n: Math.round(-v * 100) }) : t('Sharpen: {n}%', { n: Math.round(v * 100) }), active: (img?.adjust?.sharpness ?? 0) === v, onClick: () => setAdjust({ sharpness: v || undefined }) })),
            { heading: t('Brightness / Contrast') },
            ...[-0.4, -0.2, 0, 0.2, 0.4].flatMap((b) => [-0.4, 0, 0.4].map((c) => ({ label: t('Brightness: {b}%  Contrast: {c}%', { b: `${b > 0 ? '+' : ''}${Math.round(b * 100)}`, c: `${c > 0 ? '+' : ''}${Math.round(c * 100)}` }), active: (img?.adjust?.brightness ?? 0) === b && (img?.adjust?.contrast ?? 0) === c, onClick: () => setAdjust({ brightness: b, contrast: c }) }))),
          ]}
        />
        <MenuButton
          icon={Palette}
          label={t('Color')}
          large
          disabled={!has}
          items={[
            { heading: t('Color Saturation') },
            ...[-1, -0.67, -0.33, 0, 0.33, 1].map((v) => ({ label: t('Saturation: {n}%', { n: Math.round((1 + v) * 100) }), active: (img?.adjust?.saturation ?? 0) === v, onClick: () => setAdjust({ saturation: v, grayscale: false }) })),
            { heading: t('Color Tone') },
            ...[-1, -0.5, 0, 0.5, 1].map((v) => ({ label: v === 0 ? t('Temperature: neutral') : v < 0 ? t('Temperature: cooler {n}%', { n: Math.round(Math.abs(v) * 100) }) : t('Temperature: warmer {n}%', { n: Math.round(Math.abs(v) * 100) }), active: (img?.adjust?.temperature ?? 0) === v, onClick: () => setAdjust({ temperature: v || undefined }) })),
            { heading: t('Recolor') },
            { label: t('No Recolor'), active: !img?.adjust?.grayscale && !img?.adjust?.recolor, onClick: () => setAdjust({ grayscale: false, recolor: null }) },
            { label: t('Grayscale'), active: !!img?.adjust?.grayscale, onClick: () => setAdjust({ grayscale: true, recolor: null }) },
            { label: t('Sepia'), active: img?.adjust?.recolor === 'sepia', onClick: () => setAdjust({ grayscale: false, recolor: 'sepia' }) },
            { label: t('Washout'), active: img?.adjust?.recolor === 'washout', onClick: () => setAdjust({ grayscale: false, recolor: 'washout' }) },
            { label: t('Black and White: 50%'), active: img?.adjust?.recolor === 'bw', onClick: () => setAdjust({ grayscale: false, recolor: 'bw' }) },
            'separator',
            { label: t('Set Transparent Color'), onClick: () => store.set({ tool: { kind: 'transparentColor' } }) },
          ]}
        />
        <MenuButton
          icon={Brush}
          label={t('Artistic Effects')}
          large
          disabled={!has}
          items={[
            { label: t('None'), active: !img?.adjust?.artistic, onClick: () => setAdjust({ artistic: null }) },
            ...(
              [
                ['blur', t('Blur')],
                ['pencil', t('Pencil Grayscale')],
                ['photocopy', t('Photocopy')],
                ['glowEdges', t('Glow Edges')],
                ['paint', t('Paint Strokes')],
              ] as const
            ).map(([id, label]) => ({ label, active: img?.adjust?.artistic === id, onClick: () => setAdjust({ artistic: id }) })),
          ]}
        />
        <MenuButton
          icon={Droplet}
          label={t('Transparency')}
          large
          disabled={!has}
          items={[0, 0.15, 0.3, 0.5, 0.65, 0.8, 0.95].map((v) => ({ label: t('Transparency: {n}%', { n: Math.round(v * 100) }), active: (img?.adjust?.transparency ?? 0) === v, onClick: () => setAdjust({ transparency: v }) }))}
        />
        <div className="col">
          <RibbonButton
            icon={FileImage}
            label={t('Change Picture')}
            showLabel
            disabled={!has}
            onClick={async () => {
              const [file] = await pickFile('image/*')
              if (!file || !img) return
              const { src, natW, natH } = await readImageFile(file, store.get().pres.size)
              updateImages((e) => ({ ...e, src, natW, natH, crop: undefined, h: (e.w * natH) / natW }))
            }}
          />
          <RibbonButton icon={Minimize2} label={t('Compress Pictures')} showLabel disabled={!has} onClick={() => ui.openDialog('compressPictures')} />
          <RibbonButton icon={RotateCcw} label={t('Reset Picture')} showLabel disabled={!has} onClick={() => updateImages((e) => ({ ...e, adjust: undefined, effects: undefined, line: null, mask: undefined }))} />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Picture Styles')} onLauncher={() => ui.openPane('formatShape')} launcherTitle={t('Format Picture')}>
        <div className="pic-styles">
          {PICTURE_STYLES.map((p) => (
            <button key={p.label} type="button" className={`pic-style ps-${PICTURE_STYLES.indexOf(p)}`} title={t(p.label)} aria-label={t(p.label)} disabled={!has} onMouseDown={keepFocus} onClick={() => updateImages(p.apply)}>
              <span />
            </button>
          ))}
        </div>
        <div className="col">
          <PopoverButton icon={PenLine} label={t('Picture Border')} showLabel disabled={!has} panelClass="palette-menu">
            {(close) => <OutlineMenuContent close={close} />}
          </PopoverButton>
          <PopoverButton icon={Sparkles} label={t('Picture Effects')} showLabel disabled={!has} panelClass="palette-menu">
            {(close) => <EffectsMenuContent close={close} />}
          </PopoverButton>
          <MenuButton icon={LayoutGrid} label={t('Picture Layout')} showLabel disabled={!has} items={() => PICTURE_LAYOUTS.map((l) => ({ label: t(l.label), onClick: () => A.applyPictureLayout(l.id, t('Text')) }))} />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Accessibility')}>
        <RibbonButton icon={ScanText} label={t('Alt Text')} large disabled={!has} onClick={() => ui.openDialog('altText')} />
      </RibbonGroup>
      <RibbonGroup label={t('Arrange')}>
        <ArrangeButtons ui={ui} />
        <ArrangeExtraButtons />
      </RibbonGroup>
      <RibbonGroup label={t('Size')} onLauncher={() => ui.openPane('formatShape')} launcherTitle={t('Size and Position')}>
        <PopoverButton icon={Crop} label={t('Crop')} large disabled={!has} panelClass="shape-panel">
          {(close) => (
            <>
              <button type="button" className="menu-item" disabled={!!img?.rot} onMouseDown={keepFocus} onClick={() => (close(), window.dispatchEvent(new CustomEvent('kontor:crop', { detail: img?.id ?? null })))}>
                <Crop size={16} /> {t('Crop')}
              </button>
              <button type="button" className="menu-item" onMouseDown={keepFocus} onClick={() => (close(), updateImages((e) => ({ ...e, crop: undefined, h: (e.w * e.natH) / e.natW })))}>
                <ImagePlus size={16} /> {t('Reset Crop')}
              </button>
              <div className="palette-heading">{t('Aspect Ratio')}</div>
              <div className="aspect-grid">
                {(
                  [
                    ['1:1', 1],
                    ['2:3', 2 / 3],
                    ['3:2', 3 / 2],
                    ['3:4', 3 / 4],
                    ['4:3', 4 / 3],
                    ['3:5', 3 / 5],
                    ['5:3', 5 / 3],
                    ['4:5', 4 / 5],
                    ['5:4', 5 / 4],
                    ['9:16', 9 / 16],
                    ['16:9', 16 / 9],
                    ['16:10', 16 / 10],
                  ] as const
                ).map(([label, r]) => (
                  <button key={label} type="button" className="menu-item" onMouseDown={keepFocus} onClick={() => (close(), updateImages((e) => cropToRatio(e, r, true)))}>
                    {label}
                  </button>
                ))}
              </div>
              <button type="button" className="menu-item" onMouseDown={keepFocus} onClick={() => (close(), updateImages((e) => cropToRatio(e, e.w / e.h, false)))}>
                {t('Fill')}
              </button>
              <button type="button" className="menu-item" onMouseDown={keepFocus} onClick={() => (close(), updateImages(fitImage))}>
                {t('Fit')}
              </button>
              <div className="palette-heading">{t('Crop to Shape')}</div>
              <ShapeGallery onPick={(p) => (close(), updateImages((e) => ({ ...e, mask: p.prst === 'rect' ? undefined : p.prst })))} />
            </>
          )}
        </PopoverButton>
        <SizeFields />
      </RibbonGroup>
    </>
  )
}

function SizeFields() {
  const el = useStore(() => selectedElements()[0])
  return (
    <div className="col">
      <label className="field-row">
        <span>{t('Height:')}</span>
        <NumberField label={t('Picture Height')} value={el ? el.h / IN : null} step={0.1} min={0.01} max={56} suffix='"' disabled={!el} onChange={(v) => A.setSelectionSize(null, v * IN, true)} />
      </label>
      <label className="field-row">
        <span>{t('Width:')}</span>
        <NumberField label={t('Picture Width')} value={el ? el.w / IN : null} step={0.1} min={0.01} max={56} suffix='"' disabled={!el} onChange={(v) => A.setSelectionSize(v * IN, null, true)} />
      </label>
    </div>
  )
}

/** Crops a picture (centered) to an aspect ratio; with `resize` the height follows, else the box stays (Fill). */
function cropToRatio<T extends { w: number; h: number; natW: number; natH: number; crop?: { l: number; t: number; r: number; b: number } }>(e: T, ratio: number, resize: boolean): T {
  const nat = e.natW / e.natH
  const [cw, ch] = nat > ratio ? [ratio / nat, 1] : [1, nat / ratio]
  const crop = { l: (1 - cw) / 2, r: (1 - cw) / 2, t: (1 - ch) / 2, b: (1 - ch) / 2 }
  return { ...e, crop: cw === 1 && ch === 1 ? undefined : crop, h: resize ? e.w / ratio : e.h }
}

/** Fit: the whole picture inside the current box, keeping its proportions. */
function fitImage<T extends { x: number; y: number; w: number; h: number; natW: number; natH: number }>(e: T): T {
  const nat = e.natW / e.natH
  const [w, h] = e.w / e.h > nat ? [e.h * nat, e.h] : [e.w, e.w / nat]
  return { ...e, crop: undefined, x: e.x + (e.w - w) / 2, y: e.y + (e.h - h) / 2, w, h }
}
