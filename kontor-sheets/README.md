# Kontor Sheets

A free, open-source spreadsheet that runs in the browser. It looks and works like the desktop spreadsheet programs people know: ribbon (with Alt/F10 KeyTips), formula bar, Name Box, sheet tabs, status bar, keyboard shortcuts and nearly 500 worksheet functions. Workbooks open and save as `.xlsx`, so files move freely between Kontor Sheets and other spreadsheet programs.

Part of the **Kontor** suite (Kontor Docs, Kontor Sheets, Kontor Slides). The name is a placeholder: change `SUITE_NAME` / `APP_NAME` in `src/brand.ts` and the `<title>` in `index.html`.

## Run it

```bash
npm install
npm run dev
```

Then open the printed local URL. Other scripts:

| Script | What it does |
| --- | --- |
| `npm run build` | Type-check and build the production bundle into `dist/` |
| `npm run preview` | Serve the production build |
| `npm test` | Run the unit tests (formula engine and function results, number formats, input parsing, AutoFill, structure changes and undo, tables, PivotTables, rich text, .xlsx package rules and round trips) |

## What it can do

- A grid with 1,048,576 rows and 16,384 columns, drawn on a canvas so large sheets scroll smoothly
- Typing with automatic recognition of numbers, currency, percentages, dates and times
- Formulas with colored references, pointing with mouse or arrow keys, function autocomplete, argument tooltips, F4 for absolute references
- Dynamic arrays (FILTER, SORT, UNIQUE, SEQUENCE …), LET and LAMBDA, cross-sheet and 3-D references (`Sheet1:Sheet3!A1`), defined names, circular-reference detection
- Rich text inside a cell: select characters while editing and make them bold, italic, colored, bigger …
- Function library including financial bond functions (PRICE, YIELD, DURATION, COUP…), complex numbers (COMPLEX, IM…) and Bessel functions
- Formatting: fonts, colors, borders, alignment, wrap, rotation, merged cells, number formats including custom codes, cell styles, Format Cells dialog
- Rows, columns, cells and sheets: insert, delete, hide, resize, AutoFit, freeze panes, tab colors
- Copy, cut and paste (also with other programs), Paste Special, fill handle with series, Fill Series, Format Painter
- Charts (column, bar, line, area, pie, doughnut, scatter, radar, histogram, waterfall, funnel, treemap, box & whisker, combo) with Chart Design/Format tabs, axis options (bounds, units, logarithmic scale, reverse order), error bars, trendlines, secondary axis, sparklines
- Charts, pictures, shapes and slicers move and size with their cells
- Tables with styles, total rows, filter buttons and structured references (`Table1[Sales]`, `[@Qty]`)
- PivotTables with a field pane, subtotals, grand totals, layouts, date/number grouping, calculated fields, multi-select report filters, Show Details (double-click) and Recommended PivotTables
- Slicers for tables and PivotTables, Timelines for PivotTable dates
- AutoFilter and Advanced Filter, Sort (with custom lists), Remove Duplicates, Text to Columns, Flash Fill, Data Validation with drop-down lists, Consolidate
- Get Data from CSV/text, JSON, XML and saved web pages with a Navigator preview; Forecast Sheet with FORECAST.ETS
- Conditional formatting: highlight rules, top/bottom, formulas, data bars, color scales, icon sets, rules manager
- Group/Ungroup outlines and Subtotal; Goal Seek, Data Table, Scenario Manager
- Pictures, shapes, text boxes, WordArt and icons that float over the grid
- Notes, threaded comments, sheet and workbook protection, allow-edit ranges
- Page Layout view with rulers, Page Break Preview with draggable breaks, headers/footers with page numbers, print preview, PDF via the browser
- Split window, Watch Window, Evaluate Formula, formula auditing arrows, ink drawing, workbook statistics
- A ribbon that scales groups step by step on narrow windows, KeyTips, a customizable Quick Access Toolbar with Undo/Redo history
- Quick Analysis (Ctrl+Q), mini toolbar on right-click, AutoComplete and AutoCorrect while typing, hyperlinks to places in the workbook
- Custom Views, Check Accessibility, Spelling (browser dictionary), Error Checking, iterative calculation and other File > Options
- Function Arguments dialog, Clipboard pane, Copy as Picture, sheet background pictures, print titles (rows and columns), own table styles, 8 workbook themes, grouped sheets for editing
- Undo/redo for everything, AutoSave in the browser, Recent list that reopens workbooks kept in this browser
- `.xlsx` (with PivotTable caches and slicers), `.ods`, CSV, tab-delimited text and web page export

See [FEATURES.md](FEATURES.md) for the complete checklist of what is done, partial and still open.

## Project layout

```
src/
  model/      workbook, sheets, styles, number formats, dates, input parsing
  engine/     tokenizer, parser, evaluator, dependency tracking, function library
  commands/   document controller with undo/redo, clipboard, fill, sort, find, structure changes,
              tables, filters, conditional formatting, validation, PivotTables, outlines, review
  charts/     chart data, SVG chart renderer, preset shapes
  grid/       canvas renderer, geometry, page layout, decorations, object layer, cell editor
  components/ title bar, ribbon tabs, formula bar, sheet tabs, status bar, backstage, dialogs, task panes
  io/         .xlsx (ExcelJS + JSZip for charts, drawings, tables, PivotTables, slicers …), .ods, CSV, HTML,
              JSON autosave, recent files, printing
```

## Dependencies

React, Vite, TypeScript (jsdom for tests that read XML), [ExcelJS](https://github.com/exceljs/exceljs) (MIT) and [JSZip](https://stuk.github.io/jszip/) (MIT) for `.xlsx` files, lucide-react icons (ISC) and the Carlito font (SIL OFL, metric-compatible with Calibri). The formula engine, chart renderer and PivotTable engine are written from scratch; no GPL code is used.

## .xlsx files

Saved workbooks follow the package rules other spreadsheet programs check (content types, relationships, element order, unique ids). Dynamic-array formulas are saved with the cell metadata newer programs expect, newer functions carry their `_xlfn.` prefixes, LET/LAMBDA parameters their `_xlpm.` prefixes, and threaded comments are written as threaded comments plus legacy notes. `src/test/xlsxPackage.test.ts` checks these rules on a sample workbook with every kind of content.

## Known limitations

- Histogram, waterfall, funnel, treemap and box & whisker charts are saved as classic charts in `.xlsx`; timelines are kept by AutoSave only.
- Data Table results are values, not a live `TABLE()` formula.
- Headers and footers are edited in a dialog, not on the page.
- FORECAST.ETS uses its own exponential smoothing; results are close to, but not identical with, the original's.
- Own table styles are saved to `.xlsx` as a built-in style; theme fonts are saved but cells keep their own font.
- No `.xls` or `.xlsb` files, no Power Query editor, macros or co-authoring.
- Files have not yet been opened in the original desktop program for testing; the package checks (including PivotTable and slicer parts) are automated.

## License

The suite is meant to be published under the MIT license; add the license file at the repository root.
