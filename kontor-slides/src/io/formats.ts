// File types the program opens and saves, and the readers/writers behind them.
import type { Presentation } from '../model/types'
import type { FileType } from './fileAccess'
import { tx } from '../i18n'

export type SaveKind = 'pptx' | 'ppsx' | 'potx' | 'odp'

export const FILE_TYPES: Record<SaveKind, FileType> = {
  pptx: { description: tx('PPTX presentation'), extensions: ['pptx'], mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  ppsx: { description: tx('PPSX slide show'), extensions: ['ppsx'], mime: 'application/vnd.openxmlformats-officedocument.presentationml.slideshow' },
  potx: { description: tx('POTX template'), extensions: ['potx'], mime: 'application/vnd.openxmlformats-officedocument.presentationml.template' },
  odp: { description: tx('ODP presentation (OpenDocument)'), extensions: ['odp'], mime: 'application/vnd.oasis.opendocument.presentation' },
}

/** Every type Open accepts (one entry, so the file picker shows them together). */
export const OPEN_TYPE: FileType = {
  description: tx('Presentations'),
  extensions: ['pptx', 'ppsx', 'potx', 'pptm', 'ppsm', 'potm', 'odp', 'otp'],
  mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

export const OPEN_ACCEPT = '.pptx,.ppsx,.potx,.pptm,.ppsm,.potm,.odp,.otp'

export const SAVE_KINDS: { kind: SaveKind; label: string; hint: string }[] = [
  { kind: 'pptx', label: tx('Presentation (.pptx)'), hint: tx('Opens in most presentation programs') },
  { kind: 'ppsx', label: tx('Slide Show (.ppsx)'), hint: tx('Opens straight into the slide show') },
  { kind: 'potx', label: tx('Template (.potx)'), hint: tx('A starting point for new presentations') },
  { kind: 'odp', label: tx('OpenDocument Presentation (.odp)'), hint: tx('The open standard format; charts and diagrams are saved as pictures') },
]

export const extOf = (name: string) => (/\.([^.]+)$/.exec(name)?.[1] ?? '').toLowerCase()

/** Reads any supported presentation file. */
export async function readPresentationFile(file: File): Promise<{ pres: Presentation; title: string }> {
  const ext = extOf(file.name)
  if (ext === 'odp' || ext === 'otp') {
    const { importOdp } = await import('./odp')
    return importOdp(file)
  }
  const { importPptx } = await import('./pptxImport')
  return importPptx(file)
}

/** Writes the presentation in one of the save formats. */
export async function writePresentation(pres: Presentation, title: string, kind: SaveKind): Promise<Blob> {
  if (kind === 'odp') {
    const [{ exportOdp }, { elementImage }] = await Promise.all([import('./odp'), import('./slideImages')])
    return exportOdp(pres, title, { rasterize: (el, p) => elementImage(p, el) })
  }
  const { exportPptx } = await import('./pptxExport')
  return exportPptx(pres, title, kind)
}
