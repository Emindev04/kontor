// Proofing languages offered in Review > Language.
export const LANGUAGES: { code: string; label: string }[] = [
  { code: 'en-US', label: 'English (United States)' },
  { code: 'en-GB', label: 'English (United Kingdom)' },
  { code: 'de-DE', label: 'German (Germany)' },
  { code: 'de-AT', label: 'German (Austria)' },
  { code: 'de-CH', label: 'German (Switzerland)' },
  { code: 'fr-FR', label: 'French (France)' },
  { code: 'es-ES', label: 'Spanish (Spain)' },
  { code: 'es-MX', label: 'Spanish (Mexico)' },
  { code: 'it-IT', label: 'Italian (Italy)' },
  { code: 'pt-BR', label: 'Portuguese (Brazil)' },
  { code: 'pt-PT', label: 'Portuguese (Portugal)' },
  { code: 'nl-NL', label: 'Dutch (Netherlands)' },
  { code: 'tr-TR', label: 'Turkish (Turkey)' },
  { code: 'pl-PL', label: 'Polish (Poland)' },
  { code: 'sv-SE', label: 'Swedish (Sweden)' },
  { code: 'da-DK', label: 'Danish (Denmark)' },
  { code: 'nb-NO', label: 'Norwegian Bokmål (Norway)' },
  { code: 'fi-FI', label: 'Finnish (Finland)' },
  { code: 'cs-CZ', label: 'Czech (Czechia)' },
  { code: 'ru-RU', label: 'Russian (Russia)' },
  { code: 'uk-UA', label: 'Ukrainian (Ukraine)' },
  { code: 'el-GR', label: 'Greek (Greece)' },
  { code: 'ja-JP', label: 'Japanese (Japan)' },
  { code: 'zh-CN', label: 'Chinese (Simplified, China)' },
  { code: 'ko-KR', label: 'Korean (Korea)' },
  { code: 'ar-SA', label: 'Arabic (Saudi Arabia)' },
]

export function languageLabel(code: string | undefined) {
  return LANGUAGES.find((l) => l.code === (code || 'en-US'))?.label ?? code ?? 'English (United States)'
}
