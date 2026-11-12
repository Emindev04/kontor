// Proofing languages (Review > Language and the status bar).
import { t, tx } from '../i18n'

export const LANGUAGES: { id: string; label: string }[] = [
  { id: 'en-US', label: tx('English (United States)') },
  { id: 'en-GB', label: tx('English (United Kingdom)') },
  { id: 'en-CA', label: tx('English (Canada)') },
  { id: 'en-AU', label: tx('English (Australia)') },
  { id: 'de-DE', label: tx('German (Germany)') },
  { id: 'fr-FR', label: tx('French (France)') },
  { id: 'es-ES', label: tx('Spanish (Spain)') },
  { id: 'it-IT', label: tx('Italian (Italy)') },
  { id: 'pt-BR', label: tx('Portuguese (Brazil)') },
  { id: 'nl-NL', label: tx('Dutch (Netherlands)') },
  { id: 'tr-TR', label: tx('Turkish (Türkiye)') },
]

export const languageLabel = (id: string) => {
  const label = LANGUAGES.find((l) => l.id === id)?.label
  return label ? t(label) : id
}
