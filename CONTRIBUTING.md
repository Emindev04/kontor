# Contributing to Kontor

Thank you for helping! Bug reports, file samples that open wrongly, translations and code are all
welcome.

## Reporting a problem

- **A file looks wrong?** Attach a small sample file (remove anything private) and a screenshot of
  how it should look. File fidelity is the most valuable thing you can help with.
- Say which program, which version (File › Info or the release name) and which system.

## Working on the code

Each program is its own project with no shared packages:

```bash
cd kontor-docs        # or kontor-sheets, kontor-slides
npm install
npm run dev           # browser version on the dev port from the README
npm test              # unit tests
npx tsc --noEmit      # type check
npm run desktop       # desktop app
```

Before you open a pull request, `npm test`, `npx tsc --noEmit` and `npx vite build` must pass in
the folder you changed.

### Ground rules

- **Keep the folders independent.** If two programs need the same code, copy it. The files
  `src/io/fileAccess.ts`, `src/i18n/index.ts` and `electron/*.cjs` are identical copies in every
  folder: change all three together.
- **Interface text is English and goes through `t()`.** Every new text needs an entry in
  `src/i18n/locales/de.ts`, `fr.ts` and `es.ts`; the i18n test fails otherwise. Placeholders use
  braces: `t('Page {n} of {total}', { n, total })`.
- **No other companies' product names, logos, icons or fonts in the interface.** Describe formats
  by their extension ("DOCX document").
- **Permissive licenses only** for new dependencies: MIT, Apache-2.0, BSD or ISC. No GPL.
- **Update `FEATURES.md`** when you add or finish a feature.

## Translations

Want to add a language? Copy `src/i18n/locales/de.ts` in each program, translate the values, and
add the language to `LANGUAGES` in `src/i18n/index.ts` (in all three folders). Kontor Sheets also
has a table of localized function names.

## License

By contributing you agree that your work is published under the [MIT license](LICENSE).
