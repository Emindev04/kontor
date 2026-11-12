import { Baseline, Combine, Crop, ImagePlus, PaintBucket, PenLine, RotateCcw, Shapes, SquarePen, Sparkles, Type, SunMedium, Palette, Droplet, FileImage, ScanText, Minimize2, Spline, Brush } from 'lucide-react'
import type { ImageElement, ShapeElement } from '../../model/types'
import { resolveColor } from '../../model/color'
import { SHAPE_PRESETS } from '../../model/shapes'
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

const IN = 96

export function SizeGroup({ ui }: TabProps) {
  const sel = useStore(() => selectedElements())
  const el = sel[0]
  const keep = el?.type === 'image'
  return (
    <RibbonGroup label="Size" onLauncher={() => ui.openPane('formatShape')} launcherTitle="Size and Position">
      <div className="col">
        <label className="field-row">
          <span>Height:</span>
          <NumberField label="Shape Height" value={el ? el.h / IN : null} step={0.1} min={0.01} max={56} suffix='"' disabled={!el} onChange={(v) => A.setSelectionSize(null, v * IN, keep)} />
        </label>
        <label className="field-row">
          <span>Width:</span>
          <NumberField label="Shape Width" value={el ? el.w / IN : null} step={0.1} min={0.01} max={56} suffix='"' disabled={!el} onChange={(v) => A.setSelectionSize(v * IN, null, keep)} />
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
      <RibbonGroup label="Insert Shapes">
        <ShapesButton />
        <div className="col">
          <PopoverButton icon={SquarePen} label="Edit Shape" showLabel disabled={!first} panelClass="shape-panel">
            {(close) => (
              <>
                <button type="button" className="menu-item" disabled={shapes.length !== 1 || !A.canEditPoints(first)} onMouseDown={keepFocus} onClick={() => (close(), A.startEditPoints(first.id))}>
                  <Spline size={16} /> <span className="menu-item-text">Edit Points</span>
                </button>
                <div className="palette-heading">Change Shape</div>
                <ShapeGallery shapesOnly onPick={(p) => (close(), changeShape(p.prst))} />
              </>
            )}
          </PopoverButton>
          <RibbonButton icon={Type} label="Text Box" showLabel onClick={() => store.set({ tool: { kind: 'textbox' } })} />
          <MenuButton icon={Shapes} label="Recent Shapes" showLabel items={SHAPE_PRESETS.slice(8, 16).map((p) => ({ label: p.label, onClick: () => startShapeTool(p) }))} />
          <MenuButton
            icon={Combine}
            label="Merge Shapes"
            showLabel
            disabled={!canMerge(shapes) || shapes.length !== selectedElements().length}
            items={[
              { label: 'Union', onClick: () => mergeShapes('union') },
              { label: 'Combine', onClick: () => mergeShapes('combine') },
              { label: 'Fragment', onClick: () => mergeShapes('fragment') },
              { label: 'Intersect', onClick: () => mergeShapes('intersect') },
              { label: 'Subtract', onClick: () => mergeShapes('subtract') },
            ]}
          />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Shape Styles" onLauncher={() => ui.openPane('formatShape')} launcherTitle="Format Shape">
        <PopoverButton icon={Palette} label="Quick Styles" large disabled={!first} panelClass="menu-wide">
          {(close) => <QuickStylesGallery close={close} />}
        </PopoverButton>
        <div className="col">
          <PopoverButton icon={PaintBucket} label="Shape Fill" showLabel disabled={!first} panelClass="palette-menu">
            {(close) => <FillMenuContent close={close} onPicture={() => ui.openPane('formatShape')} />}
          </PopoverButton>
          <PopoverButton icon={PenLine} label="Shape Outline" showLabel disabled={!first} panelClass="palette-menu">
            {(close) => <OutlineMenuContent close={close} />}
          </PopoverButton>
          <PopoverButton icon={Sparkles} label="Shape Effects" showLabel disabled={!first} panelClass="palette-menu">
            {(close) => <EffectsMenuContent close={close} />}
          </PopoverButton>
        </div>
      </RibbonGroup>
      <RibbonGroup label="WordArt Styles">
        <PopoverButton iconNode={<span className="icon-wordart">A</span>} label="Quick Styles" large disabled={!first?.text} panelClass="palette-menu">
          {(close) => <WordArtGallery onPick={(w) => (close(), applyWordArt(w))} />}
        </PopoverButton>
        <div className="col">
          <ColorSplitButton icon={Baseline} label="Text Fill" color={resolveColor(T.textStyleValue('color') ?? 'theme:tx1', colors)} disabled={!first?.text} onApply={() => undefined}>
            {(close) => <ColorPalette colors={colors} auto={{ label: 'Automatic', onClick: () => (close(), T.setTextStyle({ color: null })) }} onPick={(c) => (close(), T.setTextStyle({ color: c }))} />}
          </ColorSplitButton>
          <PopoverButton icon={PenLine} label="Text Outline" showLabel disabled={!first?.text} panelClass="palette-menu">
            {(close) => (
              <ColorPalette
                colors={colors}
                none={{ label: 'No Outline', onClick: () => (close(), A.updateSelected((e) => (e.type === 'shape' && e.text ? { ...e, text: { ...e.text, textOutline: null } } : e))) }}
                onPick={(c) => (close(), A.updateSelected((e) => (e.type === 'shape' && e.text ? { ...e, text: { ...e.text, textOutline: { color: c, width: e.text.textOutline?.width ?? 0.75 } } } : e)))}
              />
            )}
          </PopoverButton>
          <MenuButton
            icon={Sparkles}
            label="Text Effects"
            showLabel
            disabled={!first?.text}
            items={[
              { label: 'Shadow', active: !!T.textStyleValue('shadow'), onClick: () => T.setTextStyle({ shadow: T.textStyleValue('shadow') ? null : true }) },
              { label: 'No Shadow', onClick: () => T.setTextStyle({ shadow: null }) },
            ]}
          />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Accessibility">
        <RibbonButton icon={ScanText} label="Alt Text" large disabled={!first} onClick={() => ui.openDialog('altText')} />
      </RibbonGroup>
      <RibbonGroup label="Arrange">
        <ArrangeButtons ui={ui} />
        <ArrangeExtraButtons />
      </RibbonGroup>
      <SizeGroup ui={ui} />
    </>
  )
}

function updateImages(fn: (e: ImageElement) => ImageElement) {
  A.updateSelected((e) => (e.type === 'image' ? fn(e) : e))
}

export const PICTURE_STYLES: { label: string; apply: (e: ImageElement) => ImageElement }[] = [
  { label: 'Simple Frame, White', apply: (e) => ({ ...e, mask: undefined, line: { color: '#FFFFFF', width: 7, dash: 'solid' }, effects: { shadow: { color: '#000000', alpha: 0.35, blur: 5, dist: 2, angle: 45 } } }) },
  { label: 'Simple Frame, Black', apply: (e) => ({ ...e, mask: undefined, line: { color: '#000000', width: 7, dash: 'solid' }, effects: {} }) },
  { label: 'Thick Matte, Black', apply: (e) => ({ ...e, mask: undefined, line: { color: '#262626', width: 14, dash: 'solid' }, effects: {} }) },
  { label: 'Drop Shadow Rectangle', apply: (e) => ({ ...e, mask: undefined, line: null, effects: { shadow: { color: '#000000', alpha: 0.45, blur: 10, dist: 6, angle: 45 } } }) },
  { label: 'Rounded Diagonal Corner, White', apply: (e) => ({ ...e, mask: 'round2DiagRect', line: { color: '#FFFFFF', width: 5, dash: 'solid' }, effects: {} }) },
  { label: 'Soft Edge Rectangle', apply: (e) => ({ ...e, mask: undefined, line: null, effects: { softEdge: 5 } }) },
  { label: 'Oval', apply: (e) => ({ ...e, mask: 'ellipse', line: null, effects: { shadow: { color: '#000000', alpha: 0.3, blur: 6, dist: 3, angle: 45 } } }) },
  { label: 'Reflected Rounded Rectangle', apply: (e) => ({ ...e, mask: 'roundRect', line: null, effects: { reflection: true } }) },
  { label: 'Metal Frame', apply: (e) => ({ ...e, mask: undefined, line: { color: '#A6A6A6', width: 6, dash: 'solid' }, effects: { shadow: { color: '#000000', alpha: 0.4, blur: 4, dist: 3, angle: 90 } } }) },
]

export function PictureFormatTab({ ui }: TabProps) {
  const img = useStore(() => selectedElements().find((e): e is ImageElement => e.type === 'image'))
  const has = !!img
  const setAdjust = (patch: NonNullable<ImageElement['adjust']>) => updateImages((e) => ({ ...e, adjust: { ...e.adjust, ...patch } }))
  return (
    <>
      <RibbonGroup label="Adjust">
        <MenuButton
          icon={SunMedium}
          label="Corrections"
          large
          disabled={!has}
          items={[
            { heading: 'Sharpen/Soften' },
            ...[-1, -0.5, 0, 0.5, 1].map((v) => ({ label: v === 0 ? 'No sharpening' : v < 0 ? `Soften: ${Math.round(-v * 100)}%` : `Sharpen: ${Math.round(v * 100)}%`, active: (img?.adjust?.sharpness ?? 0) === v, onClick: () => setAdjust({ sharpness: v || undefined }) })),
            { heading: 'Brightness / Contrast' },
            ...[-0.4, -0.2, 0, 0.2, 0.4].flatMap((b) => [-0.4, 0, 0.4].map((c) => ({ label: `Brightness: ${b > 0 ? '+' : ''}${Math.round(b * 100)}%  Contrast: ${c > 0 ? '+' : ''}${Math.round(c * 100)}%`, active: (img?.adjust?.brightness ?? 0) === b && (img?.adjust?.contrast ?? 0) === c, onClick: () => setAdjust({ brightness: b, contrast: c }) }))),
          ]}
        />
        <MenuButton
          icon={Palette}
          label="Color"
          large
          disabled={!has}
          items={[
            { heading: 'Color Saturation' },
            ...[-1, -0.67, -0.33, 0, 0.33, 1].map((v) => ({ label: `Saturation: ${Math.round((1 + v) * 100)}%`, active: (img?.adjust?.saturation ?? 0) === v, onClick: () => setAdjust({ saturation: v, grayscale: false }) })),
            { heading: 'Color Tone' },
            ...[-1, -0.5, 0, 0.5, 1].map((v) => ({ label: v === 0 ? 'Temperature: neutral' : `Temperature: ${v < 0 ? 'cooler' : 'warmer'} ${Math.round(Math.abs(v) * 100)}%`, active: (img?.adjust?.temperature ?? 0) === v, onClick: () => setAdjust({ temperature: v || undefined }) })),
            { heading: 'Recolor' },
            { label: 'No Recolor', active: !img?.adjust?.grayscale && !img?.adjust?.recolor, onClick: () => setAdjust({ grayscale: false, recolor: null }) },
            { label: 'Grayscale', active: !!img?.adjust?.grayscale, onClick: () => setAdjust({ grayscale: true, recolor: null }) },
            { label: 'Sepia', active: img?.adjust?.recolor === 'sepia', onClick: () => setAdjust({ grayscale: false, recolor: 'sepia' }) },
            { label: 'Washout', active: img?.adjust?.recolor === 'washout', onClick: () => setAdjust({ grayscale: false, recolor: 'washout' }) },
            { label: 'Black and White: 50%', active: img?.adjust?.recolor === 'bw', onClick: () => setAdjust({ grayscale: false, recolor: 'bw' }) },
            'separator',
            { label: 'Set Transparent Color', onClick: () => store.set({ tool: { kind: 'transparentColor' } }) },
          ]}
        />
        <MenuButton
          icon={Brush}
          label="Artistic Effects"
          large
          disabled={!has}
          items={[
            { label: 'None', active: !img?.adjust?.artistic, onClick: () => setAdjust({ artistic: null }) },
            ...(
              [
                ['blur', 'Blur'],
                ['pencil', 'Pencil Grayscale'],
                ['photocopy', 'Photocopy'],
                ['glowEdges', 'Glow Edges'],
                ['paint', 'Paint Strokes'],
              ] as const
            ).map(([id, label]) => ({ label, active: img?.adjust?.artistic === id, onClick: () => setAdjust({ artistic: id }) })),
          ]}
        />
        <MenuButton
          icon={Droplet}
          label="Transparency"
          large
          disabled={!has}
          items={[0, 0.15, 0.3, 0.5, 0.65, 0.8, 0.95].map((t) => ({ label: `Transparency: ${Math.round(t * 100)}%`, active: (img?.adjust?.transparency ?? 0) === t, onClick: () => setAdjust({ transparency: t }) }))}
        />
        <div className="col">
          <RibbonButton
            icon={FileImage}
            label="Change Picture"
            showLabel
            disabled={!has}
            onClick={async () => {
              const [file] = await pickFile('image/*')
              if (!file || !img) return
              const { src, natW, natH } = await readImageFile(file, store.get().pres.size)
              updateImages((e) => ({ ...e, src, natW, natH, crop: undefined, h: (e.w * natH) / natW }))
            }}
          />
          <RibbonButton icon={Minimize2} label="Compress Pictures" showLabel disabled={!has} onClick={() => ui.openDialog('compressPictures')} />
          <RibbonButton icon={RotateCcw} label="Reset Picture" showLabel disabled={!has} onClick={() => updateImages((e) => ({ ...e, adjust: undefined, effects: undefined, line: null, mask: undefined }))} />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Picture Styles" onLauncher={() => ui.openPane('formatShape')} launcherTitle="Format Picture">
        <div className="pic-styles">
          {PICTURE_STYLES.map((p) => (
            <button key={p.label} type="button" className={`pic-style ps-${PICTURE_STYLES.indexOf(p)}`} title={p.label} aria-label={p.label} disabled={!has} onMouseDown={keepFocus} onClick={() => updateImages(p.apply)}>
              <span />
            </button>
          ))}
        </div>
        <div className="col">
          <PopoverButton icon={PenLine} label="Picture Border" showLabel disabled={!has} panelClass="palette-menu">
            {(close) => <OutlineMenuContent close={close} />}
          </PopoverButton>
          <PopoverButton icon={Sparkles} label="Picture Effects" showLabel disabled={!has} panelClass="palette-menu">
            {(close) => <EffectsMenuContent close={close} />}
          </PopoverButton>
        </div>
      </RibbonGroup>
      <RibbonGroup label="Accessibility">
        <RibbonButton icon={ScanText} label="Alt Text" large disabled={!has} onClick={() => ui.openDialog('altText')} />
      </RibbonGroup>
      <RibbonGroup label="Arrange">
        <ArrangeButtons ui={ui} />
        <ArrangeExtraButtons />
      </RibbonGroup>
      <RibbonGroup label="Size" onLauncher={() => ui.openPane('formatShape')} launcherTitle="Size and Position">
        <PopoverButton icon={Crop} label="Crop" large disabled={!has} panelClass="shape-panel">
          {(close) => (
            <>
              <button type="button" className="menu-item" disabled={!!img?.rot} onMouseDown={keepFocus} onClick={() => (close(), window.dispatchEvent(new CustomEvent('kontor:crop', { detail: img?.id ?? null })))}>
                <Crop size={16} /> Crop
              </button>
              <button type="button" className="menu-item" onMouseDown={keepFocus} onClick={() => (close(), updateImages((e) => ({ ...e, crop: undefined, h: (e.w * e.natH) / e.natW })))}>
                <ImagePlus size={16} /> Reset Crop
              </button>
              <div className="palette-heading">Aspect Ratio</div>
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
                Fill
              </button>
              <button type="button" className="menu-item" onMouseDown={keepFocus} onClick={() => (close(), updateImages(fitImage))}>
                Fit
              </button>
              <div className="palette-heading">Crop to Shape</div>
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
        <span>Height:</span>
        <NumberField label="Picture Height" value={el ? el.h / IN : null} step={0.1} min={0.01} max={56} suffix='"' disabled={!el} onChange={(v) => A.setSelectionSize(null, v * IN, true)} />
      </label>
      <label className="field-row">
        <span>Width:</span>
        <NumberField label="Picture Width" value={el ? el.w / IN : null} step={0.1} min={0.01} max={56} suffix='"' disabled={!el} onChange={(v) => A.setSelectionSize(v * IN, null, true)} />
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
