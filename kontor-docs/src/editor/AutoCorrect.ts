import { Extension, InputRule } from '@tiptap/core'

// AutoFormat as you type: smart quotes, dashes and the AutoCorrect replacement list
// ("(c)" → "©", "teh" → "the" …). Both can be switched off in the options.

export const DEFAULT_AUTOCORRECT: [string, string][] = [
  ['(c)', '©'],
  ['(r)', '®'],
  ['(tm)', '™'],
  ['...', '…'],
  ['-->', '→'],
  ['<--', '←'],
  ['<->', '↔'],
  ['==>', '⇒'],
  ['<==', '⇐'],
  [':)', '☺'],
  [':(', '☹'],
  ['+-', '±'],
  ['1/2', '½'],
  ['1/4', '¼'],
  ['3/4', '¾'],
  ['abotu', 'about'],
  ['accomodate', 'accommodate'],
  ['acheive', 'achieve'],
  ['adn', 'and'],
  ['alot', 'a lot'],
  ['becuase', 'because'],
  ['beleive', 'believe'],
  ['cant', "can't"],
  ['definately', 'definitely'],
  ['didnt', "didn't"],
  ['doesnt', "doesn't"],
  ['dont', "don't"],
  ['enviroment', 'environment'],
  ['goverment', 'government'],
  ['i', 'I'],
  ['im', "I'm"],
  ['isnt', "isn't"],
  ['occured', 'occurred'],
  ['recieve', 'receive'],
  ['seperate', 'separate'],
  ['teh', 'the'],
  ['thier', 'their'],
  ['tommorow', 'tomorrow'],
  ['untill', 'until'],
  ['wich', 'which'],
  ['wont', "won't"],
]

export type AutoCorrectOptions = { getSettings: () => { smartQuotes: boolean; autoCorrect: boolean; entries: [string, string][] } }

export const AutoCorrect = Extension.create<AutoCorrectOptions>({
  name: 'autoCorrect',

  addOptions() {
    return { getSettings: () => ({ smartQuotes: true, autoCorrect: true, entries: DEFAULT_AUTOCORRECT }) }
  },

  addInputRules() {
    const settings = () => this.options.getSettings()
    const rules: InputRule[] = [
      // Smart quotes: opening after a space or start, closing otherwise.
      new InputRule({
        find: /(?:^|[\s({[])(")$/,
        handler: ({ state, range }) => {
          if (!settings().smartQuotes) return null
          state.tr.insertText('“', range.to - 1, range.to)
        },
      }),
      new InputRule({
        find: /\S(")$/,
        handler: ({ state, range }) => {
          if (!settings().smartQuotes) return null
          state.tr.insertText('”', range.to - 1, range.to)
        },
      }),
      new InputRule({
        find: /(?:^|[\s({[])(')$/,
        handler: ({ state, range }) => {
          if (!settings().smartQuotes) return null
          state.tr.insertText('‘', range.to - 1, range.to)
        },
      }),
      new InputRule({
        find: /\S(')$/,
        handler: ({ state, range }) => {
          if (!settings().smartQuotes) return null
          state.tr.insertText('’', range.to - 1, range.to)
        },
      }),
      // "word -- word" becomes an en dash, "word--word" an em dash.
      new InputRule({
        find: /\w(--)(\w)$/,
        handler: ({ state, range, match }) => {
          if (!settings().autoCorrect) return null
          const end = range.to
          state.tr.insertText(`—${match[2]}`, end - 3, end)
        },
      }),
      new InputRule({
        find: /\w (-{1,2}) $/,
        handler: ({ state, range, match }) => {
          if (!settings().autoCorrect) return null
          state.tr.insertText('– ', range.to - match[1].length - 1, range.to)
        },
      }),
      // Replacement list, applied when a word is finished (space or punctuation).
      new InputRule({
        find: /(?:^|\s)(\S+)([\s.,;:!?”’"')\]])$/,
        handler: ({ state, range, match }) => {
          const s = settings()
          if (!s.autoCorrect) return null
          const token = match[1]
          const lookup = (w: string) => s.entries.find(([from]) => from === w) ?? s.entries.find(([from]) => from.toLowerCase() === w.toLowerCase() && /^[a-z]/i.test(from) && from !== 'i')
          // The whole token first ("(c)"), then the word without surrounding quotes or brackets ("“teh").
          let entry = lookup(token)
          let lead = ''
          let word = token
          if (!entry) {
            const m = token.match(/^([“‘"'([{]*)(.*?)$/)!
            lead = m[1]
            word = m[2]
            entry = word ? lookup(word) : undefined
          }
          if (!entry) return null
          let to = entry[1]
          // Keep a capital first letter ("Teh" → "The").
          if (word[0] !== word[0].toLowerCase() && entry[0][0] === entry[0][0].toLowerCase()) to = to[0].toUpperCase() + to.slice(1)
          const end = range.to
          const startPos = end - match[2].length - word.length
          state.tr.insertText(to + match[2], startPos, end)
          void lead
        },
      }),
    ]
    return rules
  },
})
