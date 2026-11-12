import { t, tx } from '../i18n'
// Proofing languages offered in Review > Language.
export const LANGUAGES: { code: string; label: string }[] = [
  { code: 'en-US', label: tx('English (United States)') },
  { code: 'en-GB', label: tx('English (United Kingdom)') },
  { code: 'de-DE', label: tx('German (Germany)') },
  { code: 'de-AT', label: tx('German (Austria)') },
  { code: 'de-CH', label: tx('German (Switzerland)') },
  { code: 'fr-FR', label: tx('French (France)') },
  { code: 'es-ES', label: tx('Spanish (Spain)') },
  { code: 'es-MX', label: tx('Spanish (Mexico)') },
  { code: 'it-IT', label: tx('Italian (Italy)') },
  { code: 'pt-BR', label: tx('Portuguese (Brazil)') },
  { code: 'pt-PT', label: tx('Portuguese (Portugal)') },
  { code: 'nl-NL', label: tx('Dutch (Netherlands)') },
  { code: 'tr-TR', label: tx('Turkish (Turkey)') },
  { code: 'pl-PL', label: tx('Polish (Poland)') },
  { code: 'sv-SE', label: tx('Swedish (Sweden)') },
  { code: 'da-DK', label: tx('Danish (Denmark)') },
  { code: 'nb-NO', label: tx('Norwegian Bokmål (Norway)') },
  { code: 'fi-FI', label: tx('Finnish (Finland)') },
  { code: 'cs-CZ', label: tx('Czech (Czechia)') },
  { code: 'ru-RU', label: tx('Russian (Russia)') },
  { code: 'uk-UA', label: tx('Ukrainian (Ukraine)') },
  { code: 'el-GR', label: tx('Greek (Greece)') },
  { code: 'ja-JP', label: tx('Japanese (Japan)') },
  { code: 'zh-CN', label: tx('Chinese (Simplified, China)') },
  { code: 'ko-KR', label: tx('Korean (Korea)') },
  { code: 'ar-SA', label: tx('Arabic (Saudi Arabia)') },
]

export function languageLabel(code: string | undefined) {
  const label = LANGUAGES.find((l) => l.code === (code || 'en-US'))?.label
  return label ? t(label) : (code ?? t('English (United States)'))
}
