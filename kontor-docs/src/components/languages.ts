// Proofing languages (Review > Language and the status bar).

export const LANGUAGES: { id: string; label: string }[] = [
  { id: 'en-US', label: 'English (United States)' },
  { id: 'en-GB', label: 'English (United Kingdom)' },
  { id: 'en-CA', label: 'English (Canada)' },
  { id: 'en-AU', label: 'English (Australia)' },
  { id: 'de-DE', label: 'German (Germany)' },
  { id: 'fr-FR', label: 'French (France)' },
  { id: 'es-ES', label: 'Spanish (Spain)' },
  { id: 'it-IT', label: 'Italian (Italy)' },
  { id: 'pt-BR', label: 'Portuguese (Brazil)' },
  { id: 'nl-NL', label: 'Dutch (Netherlands)' },
  { id: 'tr-TR', label: 'Turkish (Türkiye)' },
]

export const languageLabel = (id: string) => LANGUAGES.find((l) => l.id === id)?.label ?? id
