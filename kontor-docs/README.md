# Kontor Docs

A free word processor that runs in the browser, part of the **Kontor** office suite. Its layout,
behavior and keyboard shortcuts follow the classic desktop word processor, so it feels familiar
from the first minute. Documents open and save as `.docx`.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 (the suite's launch config uses port 5174)
npm run build      # type-check and production build into dist/
npm test           # unit tests (vitest)
```

Requirements: Node.js 20 or newer.

## Highlights

- **Real pages.** Every page is its own sheet; text flows to the next page line by line, with
  widow/orphan control, keep-with-next headings, manual page breaks and table rows that break
  across pages. Printing and "Save as PDF" produce exactly the pages you see. Long documents stay
  responsive while typing.
- **Ribbon** with File, Home, Insert, Draw, Design, Layout, References, Mailings, Review, View and
  Help tabs, contextual tabs for tables, pictures, shapes, charts, equations, headers/footers and
  outlines, KeyTips (Alt, then keys for every command) and groups that shrink step by step on
  narrow windows (labels first, then large buttons, then the whole group, least-used groups first).
- **Title bar:** customizable Quick Access Toolbar, Undo and Redo history lists, F4 / Ctrl+Y to
  repeat, Comments and Share buttons, account (Options). The status bar can be customized with a
  right-click and never wraps.
- **Formatting:** fonts, sizes, colors, highlight, underline styles, effects, styles gallery and
  Styles pane (create, modify, update styles), bullets and numbering, indents, spacing, custom tab
  stops with leaders, shading, borders, drop caps, Font, Paragraph and Tabs dialogs, Format
  Painter, mini toolbar, right-click menu, AutoCorrect and smart quotes, left-to-right and
  right-to-left paragraphs.
- **Pasting** like the original: Keep Source Formatting, Merge Formatting or Keep Text Only from the
  ribbon, the right-click menu or the (Ctrl) button after each paste (with a live preview while you
  point at an option), Paste Special, a default paste option, the Clipboard pane with the last 24
  cuts and copies, and pasting or dropping pictures.
- **Headers and footers** with page numbers ("Page X of Y", roman numerals, start value),
  different first page, different odd and even pages, double-click the margin to edit.
- **References:** footnotes and endnotes laid out on their pages, table of contents, citations
  and bibliography (APA, MLA, Chicago, Source Manager), index (Mark Entry, Insert Index), captions,
  bookmarks and cross-references.
- **Sections and columns:** next page, continuous, even and odd section breaks, column breaks,
  one to six columns per section, line numbers.
- **Insert:** tables (styles, per-cell borders, Border Painter, repeated header rows, formulas,
  text direction), pictures (wrap text, drag to position, free rotation, crop, corrections,
  color, transparency, effects), about 90 shapes with formatted text, text boxes, WordArt, icons,
  charts with a data sheet, diagrams (lists, processes, cycles, organization charts, Venn, matrix,
  pyramid) with a text pane, online videos (YouTube, Vimeo), screenshots, text from another file,
  AutoText, equations, signature lines, links, cover pages, symbols, date and time; Selection Pane
  and grouping of floating objects (saved as drawing groups).
- **Design:** themes, style sets, theme colors and fonts, paragraph spacing presets, text and
  picture watermarks, page color and gradient fills, page borders, effects, Set as Default.
- **Layout:** margins, orientation, size, columns, breaks, line numbers, hyphenation (automatic,
  manual, options), vertical page alignment (top, center, bottom).
- **Mailings:** envelopes, labels and mail merge: letters, e-mail messages (as .eml files),
  directories; type a new list or use a CSV file, edit/filter/sort recipients, Match Fields, Skip
  Record If, Find Recipient, Check for Errors, preview, merge to a document, a file or the printer.
- **Review:** comments with replies and resolve, Track Changes (insertions, deletions and
  formatting changes) with markup views and the Reviewing Pane, accept/reject, compare and combine
  documents, restrict editing, thesaurus, spell checking in
  11 languages, word count, read aloud, accessibility check.
- **View:** Read Mode, print layout, web layout, outline, draft, focus mode, side to side and
  multiple pages, dark page, navigation pane with headings, pages and search results, ruler,
  gridlines, zoom 10–500 %.
- **Files:** opens `.docx`, `.odt`, `.md`, `.html` and `.txt`; saves `.docx`, `.odt`, `.rtf`, `.md`,
  `.html` and `.txt`; PDF via print. The `.docx` reader and writer keep formatting, styles, lists,
  tables, floating pictures, shapes, text boxes, charts, equations, comments, tracked changes,
  footnotes, sections, columns, headers/footers and watermarks. Exported packages are checked by
  unit tests against the rules the original program applies when it opens a file (content types,
  relationships, unique drawing ids, separator notes, ECMA-376 element order).
- **Find and Replace** with match case, whole words, wildcards and special characters.
- **AutoSave** to the browser's local storage, with a list of recent documents.

See [FEATURES.md](FEATURES.md) for the full checklist, including what is still missing.

## Limitations

- No macros, translation or grammar checker; paragraph-formatting changes and moves are not tracked.
- Columns break between paragraphs (not inside one) when they continue on the next page; a single
  table taller than a page's columns overflows.
- Page setup (orientation, margins) applies to the whole document, not per section; no gutter.
- Combine keeps the tracked changes of the reviewer's copy, not those already in your document.
- Online videos are saved to `.docx` as links; Design › Effects and OpenType features show on
  screen and in print only.
- Multiple Pages and Side to Side show page copies; click one to edit it.
- Spell checking uses the browser's checker; there is no grammar checker.
- Documents live in this browser until you save or download them.

## Project layout

```
src/
  App.tsx              application state, keyboard shortcuts, file actions
  brand.ts             product names (change the name here and in index.html)
  pageSetup.ts         paper sizes, margins, design settings, headers/footers model
  editor/              TipTap/ProseMirror extensions (pagination, styles, fields, lists, tables …)
  components/          title bar, ribbon tabs, page view, ruler, dialogs, panes
  io/                  .docx import/export, HTML export, printing
  hf/                  header, footer and cover page designs
```

## License and credits

Built with React, TipTap/ProseMirror, docx (including its chart and shape writers) and JSZip (MIT),
Lucide icons (ISC) and the Carlito and
Caladea fonts (SIL Open Font License), which stand in for Calibri and Cambria when those fonts are
not installed. Kontor is an independent project and is not affiliated with any other office
software vendor.
