import { t } from '../i18n'
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const safeFilename = (title: string) => (title.trim() || t('Document')).replace(/[\\/:*?"<>|]+/g, '_')
