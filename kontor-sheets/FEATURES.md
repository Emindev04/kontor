# Kontor Sheets – feature checklist

Coverage: 844 done, 27 partial, 27 open of 898 (functions counted one by one; 95.5 % weighted)

Features without the function library: 344 done, 23 partial, 15 open of 382 (93.1 % weighted).

Open items marked "out of scope" need a server, an online service or an AI model and are left out on purpose.

`[x]` done · `[~]` partial (what is missing is noted) · `[ ]` open

## File (backstage)

- [x] Home page with greeting and template tiles
- [x] New blank workbook
- [x] Templates: monthly budget, loan calculator, to-do list, simple invoice
- [ ] Online template search — out of scope: needs an online template service
- [x] Open .xlsx / .xlsm
- [x] Open .csv / .txt / .tsv (delimiter detection)
- [x] Open .ods (values, formulas, merged cells, sizes, basic formatting)
- [~] Open .xls (97–2003) and .xlsb through the SheetJS reader: values, formulas, number formats, merged cells, column widths, row heights, hidden sheets, defined names and fill colors — fonts and borders of these files are not read
- [x] Recent files list (reopens a copy kept in this browser)
- [x] Save As .xlsx (download)
- [x] Save As CSV
- [x] Save As .ods / .html / .txt (tab-delimited)
- [~] Save As .xls / .xlsb — values, formula results, number formats, merged cells and sizes (the SheetJS community writer stores no formulas or cell formatting)
- [x] AutoSave to browser storage (restored on reload)
- [~] Info: title, author, sheet/cell/formula/name counts, Protect Workbook / Protect Current Sheet, Inspect Workbook (comments and notes, personal information, hidden sheets, hidden rows and columns, ink, custom views — with Remove All), Check Accessibility — no version history
- [x] Print: active sheet, entire workbook, selection
- [x] Export to PDF — the desktop app writes the PDF file directly (paper size, orientation, margins); in a browser through the print dialog ("Save as PDF")
- [x] Export as .xlsx and CSV
- [~] Options: interface language, calculation mode, iterative calculation, R1C1 reference style, user name, Enter direction, AutoComplete, AutoCorrect (editable list), formula bar, zeros, gridlines, headings, Customize the Ribbon (show or hide main tabs) — no custom ribbon groups; add-ins and a trust center do not apply (no add-ins or macros run from files)
- [ ] Share / co-authoring / comments sync — out of scope: needs a server
- [ ] Account page — out of scope: there are no online accounts

## Title bar

- [x] App icon, AutoSave switch
- [x] Save, Undo, Redo (tooltips name the action)
- [x] Undo/Redo history drop-downs (undo or redo several actions at once)
- [x] Editable workbook name, save status
- [x] Search box (opens Find with the query)
- [x] Customize Quick Access Toolbar (AutoSave, New, Open, Save, Undo, Redo, Quick Print, Print Preview, Sort Ascending/Descending)

## Ribbon

- [x] Tabs: File, Home, Insert, Draw, Page Layout, Formulas, Data, Review, View, Help
- [x] Collapse/expand ribbon (button, double-click a tab, Ctrl+F1)
- [x] Group dialog launchers
- [x] KeyTips (Alt or F10: letters on tabs, then on the commands of the opened tab; Esc steps back)
- [x] Adaptive ribbon scaling: groups shrink step by step (labels go, large buttons get small, then the group collapses into a drop-down) by priority, so Font, Alignment and Number stay usable longest
- [x] Contextual tabs: Table Design, Chart Design, Format, Shape Format (pictures and shapes), PivotTable Analyze, Design

## Home – Clipboard

- [x] Paste (Ctrl+V), with relative formula adjustment
- [x] Paste menu: Formulas, Formulas & Number Formatting, No Borders, Keep Source Column Widths, Transpose, Values, Values & Number Formatting, Formatting, Paste Link
- [x] Paste Special dialog: All, Formulas, Values, Formats, All except borders, Column widths, Formulas and number formats, Values and number formats; operations Add/Subtract/Multiply/Divide; Skip blanks; Transpose; Paste Link
- [x] Paste Special: comments and notes, validation, all merging conditional formats (All also pastes validation, conditional formats and notes)
- [x] Cut (Ctrl+X) with move semantics (references follow)
- [x] Copy (Ctrl+C) to the system clipboard as text and HTML
- [x] Copy as Picture (to the clipboard and for Paste > Picture)
- [x] Paste from other programs (TSV and HTML tables with bold/italic/colors/alignment)
- [x] Format Painter (click once, double-click to keep it on, Esc to stop)
- [x] Clipboard task pane (last 24 copies, paste one or all, clear)

## Home – Font

- [x] Font name box with preview list
- [x] Font size box (1–409)
- [x] Increase / Decrease Font Size
- [x] Bold (Ctrl+B / Ctrl+2), Italic (Ctrl+I / Ctrl+3), Underline (Ctrl+U), Double Underline
- [x] Strikethrough (Ctrl+5)
- [x] Borders menu: bottom, top, left, right, none, all, outside, thick outside, bottom double, thick bottom, top and bottom, top and thick bottom, top and double bottom
- [x] Border line color and line style
- [x] Draw Border / Draw Border Grid / Erase Border pens (drag over cells; Esc ends)
- [x] Fill Color with theme/standard palette, No Fill, more colors
- [x] Font Color with Automatic and palette
- [x] Superscript / subscript
- [x] Accounting underline styles (across the whole cell)

## Home – Alignment

- [x] Top / Middle / Bottom align
- [x] Orientation: angle counterclockwise/clockwise, vertical text, rotate up/down
- [x] Wrap Text (row height adjusts automatically)
- [x] Align Left / Center / Right
- [x] Decrease / Increase Indent
- [x] Merge & Center, Merge Across, Merge Cells, Unmerge (with data-loss warning)
- [x] Justify / Distributed
- [x] Center Across Selection
- [x] Shrink to fit
- [x] Fill alignment (repeat text)

## Home – Number

- [x] Number format list with live previews (General, Number, Currency, Accounting, Short Date, Long Date, Time, Percentage, Fraction, Scientific, Text)
- [x] Accounting Number Format with currency choices
- [x] Percent Style (Ctrl+Shift+%), Comma Style
- [x] Increase / Decrease Decimal
- [x] More Number Formats → Format Cells

## Home – Styles

- [x] Conditional Formatting menu: Highlight Cells Rules, Top/Bottom Rules, Data Bars (gradient/solid), Color Scales, Icon Sets, New Rule, Clear Rules, Manage Rules
- [x] Format as Table: 60 own table styles (Light/Medium/Dark), applies the style to an existing table
- [x] Cell Styles gallery (Good/Bad/Neutral, Data and Model, Titles and Headings, themed accents, number formats)
- [~] New Cell Style (from the active cell's formatting, kept with the workbook) — no Merge Styles

## Home – Cells

- [x] Insert Cells dialog (shift right, shift down, entire row, entire column)
- [x] Insert Sheet Rows / Columns / Sheet
- [x] Delete Cells dialog, Delete Sheet Rows / Columns / Sheet
- [x] New rows/columns take the formatting of the row/column before
- [x] Format → Row Height, AutoFit Row Height, Column Width, AutoFit Column Width, Default Width
- [x] Format → Hide/Unhide Rows, Columns, Sheet
- [x] Format → Rename Sheet, Move or Copy Sheet
- [x] Format → Tab Color
- [x] Format → Protect Sheet, Lock Cell
- [x] Format → Format Cells

## Home – Editing

- [x] AutoSum (Alt+=): Sum, Average, Count Numbers, Max, Min, More Functions; guesses the range; totals for selected blocks
- [x] Fill Down (Ctrl+D), Right (Ctrl+R), Up, Left
- [x] Fill Series dialog (rows/columns, linear, growth, date by day/weekday/month/year, AutoFill, step, stop)
- [x] Flash Fill (Ctrl+E): learns words, initials, case changes and joins from examples
- [x] Fill Justify
- [x] Clear All, Formats, Contents, Hyperlinks
- [x] Clear Comments and Notes
- [x] Sort A to Z, Sort Z to A, Custom Sort
- [x] Filter (AutoFilter, Ctrl+Shift+L), Clear, Reapply
- [x] Find (Ctrl+F), Replace (Ctrl+H), Go To (Ctrl+G / F5), Go To Special
- [x] Select Formulas, Constants
- [x] Select Notes, Conditional Formatting, Data Validation, Objects, Selection Pane
- [ ] Analyze Data — out of scope: needs an AI service

## Format Cells dialog (Ctrl+1)

- [x] Number tab: all categories incl. Special and Custom, decimals, 1000 separator, negative number styles, currency symbols, live sample
- [x] Alignment tab: horizontal, vertical, indent, wrap, shrink, merge, orientation degrees, vertical text
- [x] Font tab: font, style, size, underline types, color, strikethrough, superscript, subscript, preview
- [x] Border tab: line styles, color, presets None/Outline/Inside, individual edges, inside lines, diagonals, preview
- [x] Fill tab: background color, Pattern Color and Pattern Style (17 patterns), Fill Effects with two-color gradients (horizontal, vertical, diagonal, from center); drawn on screen, printed and saved in .xlsx
- [x] Protection tab: Locked / Hidden, honoured when the sheet is protected

## Insert tab

- [x] PivotTable (new or existing worksheet)
- [x] Recommended PivotTables (suggestions with preview, Blank PivotTable)
- [x] Table (Ctrl+T / Ctrl+L) with "My table has headers"
- [x] Pictures (from file, keeps aspect ratio on corner drags)
- [x] Shapes: 49 presets (lines, arrows, rectangles, basic shapes, block arrows, flowchart, stars, callouts), drawn with the mouse
- [x] Icons (80 bundled line icons, any color, inserted as pictures)
- [ ] SmartArt, Screenshot, 3D Models
- [x] Charts: column/bar (clustered, stacked, 100%), line (incl. stacked), area, pie, doughnut, scatter, radar, histogram, waterfall, combo
- [x] Recommended Charts dialog with live preview, All Charts tab
- [~] PivotChart — a chart of the PivotTable's output range (not linked to the PivotTable's fields)
- [~] Funnel, Treemap, Box & Whisker charts (saved to .xlsx as the closest classic chart) — no Sunburst; Maps are out of scope (need an online map service)
- [x] Sparklines: Line, Column, Win/Loss (data range → location range)
- [x] Slicer for tables and PivotTables (multi-select, clear filter, columns, styles, calendar order for months), saved to and read from .xlsx
- [~] Timeline for PivotTables (years, quarters, months, days; click, Shift+click or drag to select) — kept by AutoSave, not saved in .xlsx
- [x] Link (Ctrl+K): insert, edit, remove; Ctrl+click opens
- [x] Comment (opens the Comments pane)
- [x] Text Box, WordArt (4 own styles)
- [ ] Signature Line, Object
- [x] Header & Footer dialog: left/center/right sections, page number, pages, date, time, file and sheet name codes, presets
- [ ] Equation
- [x] Symbol

## Draw tab

- [x] Select tool
- [x] Pens (black, red, blue) and pen color picker
- [x] Highlighter
- [x] Eraser (stroke eraser)
- [x] Clear ink (undoable)
- [ ] Lasso select, ruler, ink to shape, ink to math, replay
- [~] Ink is stored with the autosaved workbook, not in .xlsx files

## Page Layout tab

- [~] Themes, Colors, Fonts: 8 own themes; theme colors drive palettes, charts and table styles and are saved in .xlsx with the theme fonts — cells keep their own font, no Effects
- [x] Margins: Normal, Wide, Narrow, Custom
- [x] Orientation: Portrait, Landscape
- [x] Size: Letter, Legal, Tabloid, A4, A3
- [x] Print Area: Set / Clear
- [x] Breaks: Insert Page Break, Remove Page Break, Reset All Page Breaks
- [x] Background picture (tiled behind the cells, saved in .xlsx)
- [x] Print Titles (rows to repeat at top)
- [x] Print Titles: columns to repeat at left (wide sheets print page by page)
- [x] Scale to Fit: Width and Height page counts (Automatic, 1–9 pages; any count in Page Setup), scale %; saved in .xlsx
- [x] Sheet Options: gridlines view/print, headings view/print
- [~] Arrange: Bring Forward, Send Backward, Selection Pane, Ctrl/Shift+click to select several objects, Align (left, center, right, top, middle, bottom), Distribute Horizontally/Vertically, Group/Ungroup — groups are kept by AutoSave; in .xlsx the objects are saved separately
- [x] Page Setup dialog: Page, Margins, Header/Footer, Sheet
- [x] Header/Footer codes (&P, &N, &D, &T, &F, &A) expanded in Page Layout view and when printing

## Formulas tab

- [x] Insert Function dialog (Shift+F3): search, categories, description, signature
- [x] Function Arguments dialog (fx button, Insert Function, live argument values, help text, result)
- [x] AutoSum menu, Recently Used
- [x] Financial, Logical, Text, Date & Time, Lookup & Reference, Math & Trig, More Functions menus
- [x] Name Manager (Ctrl+F3): list with values, new, edit, delete
- [x] Define Name (scope, comment, refers to)
- [x] Use in Formula
- [x] Create from Selection (Ctrl+Shift+F3)
- [x] Trace Precedents, Trace Dependents, Remove Arrows (same sheet)
- [x] Show Formulas (Ctrl+`)
- [x] Error Checking dialog (previous/next, explanation, calculation steps, edit, ignore)
- [x] Evaluate Formula (step by step: references, then innermost functions)
- [x] Watch Window (add/delete watches, live values and formulas)
- [x] Calculation Options: Automatic, Manual
- [x] Calculate Now (F9), Calculate Sheet
- [~] Iterative calculation (maximum iterations, maximum change) — no "automatic except for data tables"

## Data tab

- [x] From Text/CSV, From Workbook
- [~] Refresh All — recalculates and refreshes PivotTables
- [~] Get Data from Text/CSV, JSON, XML and saved web pages (.html) with a Navigator preview, From Table/Range — no live web queries, Power Query editor or Queries & Connections pane
- [ ] Stocks / Geography data types — out of scope: need an online data service
- [x] Sort A to Z, Sort Z to A
- [x] Sort dialog: levels (add, delete, copy), sort on values / cell color / font color, order, headers, case sensitive, left to right
- [x] Custom lists in Sort (weekdays and months, both directions)
- [x] Filter: value checklist with search, (Blanks), sort A–Z/Z–A, sort/filter by color, text/number/date filters, custom AutoFilter (and/or, wildcards), Top 10, above/below average, clear
- [x] Advanced Filter: criteria range (AND per row, OR between rows, operators, wildcards), filter in place or copy to, unique records only
- [x] Text to Columns — delimited and fixed width, column data formats (General, Text, Date in six orders, skip column) and destination
- [x] Flash Fill
- [x] Remove Duplicates
- [x] Data Validation: any, whole number, decimal, list (in-cell drop-down, Alt+Down), date, time, text length, custom formula; ignore blank; input message; Stop/Warning/Information alerts; Circle Invalid Data; Clear Validation Circles
- [~] Consolidate (11 functions, several references, labels in top row / left column, Create links to source data as formulas) — no Relationships or Data Model
- [x] What-If Analysis → Goal Seek
- [x] Scenario Manager: add, edit, delete, show, summary sheet
- [~] Data Table: one- and two-variable tables, filled in as values (not a live TABLE formula)
- [x] Forecast Sheet (FORECAST.ETS with confidence bounds and a line chart on a new sheet)
- [x] Group / Ungroup rows and columns (Shift+Alt+Right/Left), outline symbols with level buttons and +/- buttons, Show/Hide Detail, Clear Outline
- [x] Subtotal: at each change in, function, columns, replace, summary below, Remove All

## Review tab

- [~] Spelling (F7) with the browser's dictionary and suggestions — no Thesaurus
- [x] Workbook Statistics
- [x] Check Accessibility (alternative text, table headers, merged cells, contrast, sheet names); Smart Lookup and Translate are out of scope (online services)
- [x] Comments (threaded): new, reply, resolve/reopen, delete, previous/next, Comments pane, author name, purple indicator, hover card
- [x] Notes: new/edit (Shift+F2), delete, previous/next, show/hide, show all, convert to comments, red indicator, hover popup
- [x] Protect Sheet (password, 15 allowed actions), Unprotect Sheet; locked cells, formatting, inserting/deleting rows/columns, sorting and objects are blocked
- [x] Protect Workbook structure (no adding, deleting, renaming, moving, hiding sheets)
- [x] Allow Edit Ranges (with optional range passwords)
- [x] Hide Ink

## View tab

- [x] Normal view
- [x] Page Break Preview: printed range outlined, gray outside, page labels, automatic (dashed) and manual (solid) breaks, drag breaks to move them
- [~] Page Layout view: every page drawn as a sheet with margins, gaps, rulers and header/footer text; editable — header/footer edited through the dialog
- [x] Custom Views (zoom, selection, frozen panes, gridlines, headings, hidden rows/columns); Sheet Views are out of scope (a co-authoring feature)
- [x] Show: Formula Bar, Gridlines, Headings (plus Zero Values and Formulas)
- [x] Ruler (inches, margins shaded, in Page Layout view)
- [x] Zoom dialog, 100%, Zoom to Selection
- [~] New Window — opens the autosaved workbook in a new browser window (not kept in sync)
- [ ] Arrange All, View Side by Side, Switch Windows
- [x] Freeze Panes, Freeze Top Row, Freeze First Column, Unfreeze Panes
- [x] Split (two panes with their own scroll position)
- [x] Watch Window
- [x] Hide / Unhide window
- [~] Macros: Record Macro (with Use Relative References), Stop Recording, View Macros (run, delete) — records and replays the cell changes of the program's own commands, kept with the workbook by AutoSave (not in .xlsx); VBA code is out of scope
- [x] Full Screen

## Help tab

- [x] Function reference (Insert Function)
- [x] Keyboard shortcuts overview
- [x] About
- [ ] Online help, training, feedback — out of scope: online services

## Charts

- [x] Floating, live-linked to their cells (values, categories, series names)
- [x] Automatic series detection (headers, categories, series in rows or columns)
- [x] Chart Design: Add Chart Element (axes, axis titles, chart title above/overlay, data labels value/percent/category, gridlines major/minor/vertical, legend positions, trendlines), Quick Layout (6), Change Colors (8 own palettes), Chart Styles (8 own styles), Switch Row/Column, Select Data (edit, add, remove, reorder series), Change Chart Type, Move Chart (new sheet or object in another sheet)
- [x] Format tab and Format pane: fill, border, text color, titles, legend, data labels, gap width, doughnut hole size, markers, smoothed lines, per-series color, combo series type and secondary axis, trendlines
- [x] Size boxes, Bring Forward/Send Backward, Selection pane
- [x] Axis options: minimum, maximum, major unit, logarithmic scale, values in reverse order, number format (saved to and read from .xlsx)
- [x] Error bars: standard error, percentage, standard deviation, fixed value (saved to and read from .xlsx)
- [x] Secondary axis for line/area series and in combo charts
- [x] Chart data table (Add Chart Element > Data Table, saved in .xlsx)
- [x] Chart templates (Save as Template, apply and delete; kept in this browser / on this computer)
- [x] Format Data Point: fill color of single bars, slices and markers (saved in .xlsx)
- [ ] 3-D charts

- [x] Charts, pictures, shapes and slicers move and size with their cells when columns/rows are resized, hidden or AutoFit

## Tables

- [x] Create from selection or current region, header detection, unique column names, style gallery
- [x] Header Row, Total Row (aggregate per column incl. custom formula), Banded Rows/Columns, First/Last Column, Filter Button
- [x] Grows when typing directly below or right of the table; header edits rename columns and update formulas
- [x] Calculated columns (a formula typed into an empty column fills the column)
- [x] Rename, Resize Table, Convert to Range (keeps the look, rewrites references), Remove Duplicates, Summarize with PivotTable
- [x] Insert/delete table rows from the context menu
- [x] Slicers for tables (Insert > Slicer, Table Design > Insert Slicer)
- [x] Table styles of your own (New Table Style), saved in .xlsx as real table styles and read back

## PivotTables

- [x] Insert from a range/table, new or existing worksheet
- [x] PivotTable Fields pane: field list with search, checkboxes, drag between Filters/Columns/Rows/Values, reorder, remove
- [x] Values: Sum, Count, Average, Max, Min, Product, Count Numbers, StdDev, Var; Show Values As % of grand/column/row total
- [x] Report filters (single item), nested row fields with subtotals, column fields, grand totals
- [x] Analyze tab: name, Expand/Collapse Field, Refresh, Change Data Source, Clear All, Move, Delete, PivotChart, Field List
- [x] Design tab: Subtotals, Grand Totals, Report Layout (compact, outline, tabular), Banded Rows, styles
- [x] Grouping: dates by days, months, quarters and years (adds Years/Quarters fields), numbers by ranges (start, end, by); Ungroup
- [x] Calculated fields (Insert Calculated Field dialog; formulas run on the sums of each group)
- [x] Slicers for PivotTables
- [x] Multi-select report filters, Show Details (double-click a value), pivot cache in .xlsx files (refreshes on open)

## Conditional formatting

- [x] Cell value rules (between, equal, greater/less …), text contains/begins/ends, dates occurring, blanks/errors, duplicate/unique values
- [x] Top/bottom N and N%, above/below average
- [x] Formula rules (relative references shift per cell)
- [x] Data bars (gradient/solid, negative values, show bar only), 2- and 3-color scales, 18 icon sets (own drawings, reverse, show icon only)
- [x] Format picker: fill, font color, bold, italic, underline, strikethrough, border, number format
- [x] Rules Manager: current selection / whole sheet, edit, delete, priority order, Applies To, Stop If True
- [x] Custom icon thresholds per icon (number, percent, percentile, formula), data bar minimum/maximum types, axis position (automatic, cell midpoint, none), negative bar color and axis color (saved in .xlsx)

## Grid and selection

- [x] 1,048,576 rows × 16,384 columns (A…XFD) with virtualized canvas rendering
- [x] Smooth scrolling with 100,000 filled cells (about 2–3 ms per frame)
- [x] Row/column headers with selection highlighting, select-all corner
- [x] Click, Shift+click, drag, Ctrl+click for multiple ranges
- [x] Whole row/column selection by header click/drag, Shift and Ctrl variants
- [x] Arrows, Ctrl+Arrows (data edge), Shift to extend, Ctrl+Shift+Arrows
- [x] Enter / Shift+Enter / Tab / Shift+Tab, cycling inside a selection
- [x] Home, Ctrl+Home, Ctrl+End, PgUp/PgDn, Alt+PgUp/PgDn
- [x] Ctrl+Space (column), Shift+Space (row), Ctrl+A (current region, then all), Ctrl+Shift+*
- [x] Merged cells in navigation and selection
- [x] Text overflows into empty neighbours (left, right, centered)
- [x] "####" for numbers that do not fit; General numbers shrink their decimals
- [x] Wrapped text with automatic row height; larger fonts grow the row
- [x] Rotated and vertical text
- [x] Frozen panes
- [x] Zoom 10–400 % (slider, dialog, Ctrl+wheel), high-DPI rendering
- [x] Blue border around spilled arrays
- [x] Marching ants around copied cells (Esc clears)
- [x] Fill handle (series, copy with Ctrl, shrink to clear), double-click fill handle fills down
- [x] Drag the selection border to move cells (Ctrl to copy)
- [x] Resize columns/rows by dragging, double-click to AutoFit, several selected columns at once
- [x] Hidden rows/columns
- [x] Hyperlink cells (blue, underlined)
- [x] Hyperlinks to places in the workbook (sheet and cell, defined names) and e-mail addresses; Ctrl+click follows them
- [x] Quick Analysis button and Ctrl+Q: formatting, charts, totals, tables and sparklines for the selection
- [x] Rich text with mixed formatting inside one cell (drawn on the grid, kept in AutoSave and .xlsx)
- [x] Note/comment indicators, filter buttons, data bars, icon sets, color scales, sparklines, list drop-down buttons
- [x] Floating charts, pictures, shapes and text boxes: select, move, resize (8 handles, Shift keeps ratio), rotate, nudge with arrows, Delete, Ctrl+D duplicate, Tab cycles
- [x] Superscript/subscript, Justify / Distributed and Center Across Selection rendering
- [ ] Right-to-left sheets
- [x] Touch gestures (trackpad pinch zoom)

## Cell editing

- [x] Type to replace, F2 / double-click to edit, Esc to cancel
- [x] Alt+Enter new line, Ctrl+Enter fills the selection
- [x] Tab-Tab-Enter returns to the starting column
- [x] Formula bar editing, expand/collapse (Ctrl+Shift+U), Cancel / Enter / fx buttons
- [x] Name Box: shows the cell or name, go to references and names, define a name by typing, names drop-down
- [x] Colored references in the cell editor, formula bar and grid
- [x] Point mode: click/drag cells or ranges, Shift+click, arrow keys, other sheets
- [x] Function autocomplete with descriptions (Tab accepts, arrows choose, Esc closes)
- [x] Argument tooltip with the current argument in bold
- [x] F4 cycles $A$1 → A$1 → $A1 → A1
- [x] Function names and references upper-cased, missing ")" added
- [x] Message for invalid formulas (the edit stays open)
- [x] Input recognition: numbers, thousands separators, currency, percent, parentheses negatives, fractions, scientific, dates (many US forms), times, date+time, TRUE/FALSE, error values, leading apostrophe for text
- [x] Automatic number format from the input (e.g. $1,200 → currency)
- [x] Automatic percent entry in percentage cells
- [x] AutoComplete of text from the same column
- [x] Pick From Drop-down List (Alt+Down) for list validation
- [x] AutoCorrect: common misspellings and symbols as you type; entries can be added, changed and deleted in Options
- [x] In-cell rich text formatting: select characters while editing and use Ctrl+B/I/U/5 or the ribbon font, size, color, bold, italic, underline, strikethrough buttons

## Calculation engine

- [x] Operators: + - * / ^ & % = <> < > <= >=, unary minus, range (:), union (,), intersection (space)
- [x] Excel precedence (e.g. -2^2 = 4, left-associative ^)
- [x] Relative, absolute and mixed references, whole columns and rows
- [x] Cross-sheet references, quoted sheet names
- [x] Defined names (workbook and sheet scope), named formulas and named LAMBDAs
- [x] Array constants {1,2;3,4}
- [x] Error values #DIV/0!, #N/A, #NAME?, #REF!, #VALUE!, #NUM!, #NULL!, #SPILL!, #CALC!
- [x] Dependency graph with incremental recalculation
- [x] Circular reference detection with status bar warning (cells that close a loop show 0 like the original; the warning stays until the loop is fixed)
- [x] Dynamic arrays: spilling, #SPILL! when blocked, A1# spill references
- [x] LET, LAMBDA, MAP, REDUCE, SCAN, BYROW, BYCOL, MAKEARRAY, ISOMITTED
- [x] Implicit intersection operator (@)
- [x] Volatile functions (RAND, NOW, TODAY, OFFSET, INDIRECT, …)
- [x] Manual calculation mode
- [x] 15-digit precision, 1900 date system (including the 1900 leap-year quirk)
- [x] References adjust on insert/delete of rows, columns and cells, on cut/paste, drag-move, copy, sheet rename and delete
- [x] Functions that are not implemented keep the cached result from imported files
- [x] 3-D references (Sheet1:Sheet3!A1) in SUM, AVERAGE, COUNT, MAX, MIN and other aggregates; follow sheet renames; #REF! when an end sheet is deleted
- [x] Structured table references: Table1[Col], Table1[[#Headers],[A]:[B]], [@Col], #All/#Data/#Headers/#Totals, table names as references
- [x] R1C1 notation: R1C1 reference style option (formula bar, typing formulas, column numbers in the headings, Name Box) and inside INDIRECT
- [x] Iterative calculation
- [ ] Links to other workbooks
- [ ] Multi-threaded calculation (calculation runs on one thread; only dependent cells are recalculated)

## Function library (494 functions including compatibility aliases)

### Math & Trig
- [x] ABS, ACOS, ACOSH, ACOT, ACOTH, AGGREGATE, ARABIC, ASIN, ASINH, ATAN, ATAN2, ATANH, BASE, CEILING, CEILING.MATH, CEILING.PRECISE, COMBIN, COMBINA, COS, COSH, COT, COTH, CSC, CSCH, DECIMAL, DEGREES, EVEN, EXP, FACT, FACTDOUBLE, FLOOR, FLOOR.MATH, FLOOR.PRECISE, GCD, INT, ISO.CEILING, LCM, LN, LOG, LOG10, MDETERM, MINVERSE, MMULT, MOD, MROUND, MULTINOMIAL, MUNIT, ODD, PI, POWER, PRODUCT, QUOTIENT, RADIANS, RAND, RANDARRAY, RANDBETWEEN, ROMAN, ROUND, ROUNDDOWN, ROUNDUP, SEC, SECH, SEQUENCE, SERIESSUM, SIGN, SIN, SINH, SQRT, SQRTPI, SUBTOTAL, SUM, SUMIF, SUMIFS, SUMPRODUCT, SUMSQ, SUMX2MY2, SUMX2PY2, SUMXMY2, TAN, TANH, TRUNC

### Statistical
- [x] AVEDEV, AVERAGE, AVERAGEA, AVERAGEIF, AVERAGEIFS, BETA.DIST, BETA.INV, BINOM.DIST, BINOM.DIST.RANGE, BINOM.INV, CHISQ.DIST, CHISQ.DIST.RT, CHISQ.INV, CHISQ.INV.RT, CHISQ.TEST, CONFIDENCE.NORM, CONFIDENCE.T, CORREL, COUNT, COUNTA, COUNTBLANK, COUNTIF, COUNTIFS, COVARIANCE.P, COVARIANCE.S, DEVSQ, EXPON.DIST, F.DIST, F.DIST.RT, F.INV, F.INV.RT, F.TEST, FISHER, FISHERINV, FORECAST.LINEAR, FREQUENCY, GAMMA, GAMMA.DIST, GAMMA.INV, GAMMALN, GAMMALN.PRECISE, GAUSS, GEOMEAN, GROWTH, HARMEAN, HYPGEOM.DIST, INTERCEPT, KURT, LARGE, LOGNORM.DIST, LOGNORM.INV, MAX, MAXA, MAXIFS, MEDIAN, MIN, MINA, MINIFS, MODE.MULT, MODE.SNGL, NEGBINOM.DIST, NORM.DIST, NORM.INV, NORM.S.DIST, NORM.S.INV, PEARSON, PERCENTILE.EXC, PERCENTILE.INC, PERCENTRANK.EXC, PERCENTRANK.INC, PERMUT, PERMUTATIONA, PHI, POISSON.DIST, PROB, QUARTILE.EXC, QUARTILE.INC, RANK.AVG, RANK.EQ, RSQ, SKEW, SKEW.P, SLOPE, SMALL, STANDARDIZE, STDEV.P, STDEV.S, STDEVA, STDEVPA, STEYX, T.DIST, T.DIST.2T, T.DIST.RT, T.INV, T.INV.2T, T.TEST, TREND, TRIMMEAN, VAR.P, VAR.S, VARA, VARPA, WEIBULL.DIST, Z.TEST
- [x] LINEST, LOGEST — several x variables, const argument and the statistics block
- [~] FORECAST.ETS, FORECAST.ETS.CONFINT, FORECAST.ETS.SEASONALITY, FORECAST.ETS.STAT — exponential triple smoothing with season detection; results differ slightly from the original's

### Text
- [x] ARRAYTOTEXT, ASC, CHAR, CLEAN, CODE, CONCAT, CONCATENATE, DBCS, DOLLAR, EXACT, FIND, FINDB, FIXED, LEFT, LEFTB, LEN, LENB, LOWER, MID, MIDB, NUMBERVALUE, PROPER, REGEXEXTRACT, REGEXREPLACE, REGEXTEST, REPLACE, REPLACEB, REPT, RIGHT, RIGHTB, SEARCH, SEARCHB, SUBSTITUTE, T, TEXT, TEXTAFTER, TEXTBEFORE, TEXTJOIN, TEXTSPLIT, TRIM, UNICHAR, UNICODE, UPPER, VALUE, VALUETOTEXT
- [x] BAHTTEXT, PHONETIC (returns the text; phonetic guides are not stored)
- [ ] TRANSLATE, DETECTLANGUAGE — out of scope: need an online translation service

### Logical
- [x] AND, BYCOL, BYROW, FALSE, IF, IFERROR, IFNA, IFS, LAMBDA, LET, MAKEARRAY, MAP, NOT, OR, REDUCE, SCAN, SWITCH, TRUE, XOR

### Lookup & Reference
- [x] ADDRESS, AREAS, CHOOSE, CHOOSECOLS, CHOOSEROWS, COLUMN, COLUMNS, DROP, EXPAND, FILTER, FORMULATEXT, HLOOKUP, HSTACK, HYPERLINK, INDEX, INDIRECT, LOOKUP, MATCH, OFFSET, ROW, ROWS, SORT, SORTBY, TAKE, TOCOL, TOROW, TRANSPOSE, UNIQUE, VLOOKUP, VSTACK, WRAPCOLS, WRAPROWS, XLOOKUP, XMATCH
- [x] GETPIVOTDATA, GROUPBY, PIVOTBY, TRIMRANGE (function names such as SUM can be passed as eta-reduced LAMBDAs, saved as _xlfn._xleta.)
- [ ] RTD, IMAGE — out of scope: need a real-time data server or pictures from the web

### Date & Time
- [x] DATE, DATEDIF, DATEVALUE, DAY, DAYS, DAYS360, EDATE, EOMONTH, HOUR, ISOWEEKNUM, MINUTE, MONTH, NETWORKDAYS, NETWORKDAYS.INTL, NOW, SECOND, TIME, TIMEVALUE, TODAY, WEEKDAY, WEEKNUM, WORKDAY, WORKDAY.INTL, YEAR, YEARFRAC

### Financial
- [x] CUMIPMT, CUMPRINC, DB, DDB, DOLLARDE, DOLLARFR, EFFECT, FV, FVSCHEDULE, IPMT, IRR, ISPMT, MIRR, NOMINAL, NPER, NPV, PDURATION, PMT, PPMT, PV, RATE, RRI, SLN, SYD, VDB, XIRR, XNPV
- [x] ACCRINT, ACCRINTM, COUPDAYBS, COUPDAYS, COUPDAYSNC, COUPNCD, COUPNUM, COUPPCD, DISC, DURATION, INTRATE, MDURATION, PRICE, PRICEDISC, PRICEMAT, RECEIVED, TBILLEQ, TBILLPRICE, TBILLYIELD, YIELD, YIELDDISC, YIELDMAT
- [x] AMORDEGRC, AMORLINC, ODDFPRICE, ODDFYIELD, ODDLPRICE, ODDLYIELD

### Information
- [x] ERROR.TYPE, INFO, ISBLANK, ISERR, ISERROR, ISEVEN, ISFORMULA, ISLOGICAL, ISNA, ISNONTEXT, ISNUMBER, ISODD, ISOMITTED, ISREF, ISTEXT, N, NA, SHEET, SHEETS, TYPE
- [x] CELL — address, col, row, contents, type, filename, width, prefix, protect, format (G, F0, ,2, C2-, P0, S2, D1–D9 …), color, parentheses

### Engineering
- [x] BIN2DEC, BIN2HEX, BIN2OCT, BITAND, BITLSHIFT, BITOR, BITRSHIFT, BITXOR, DEC2BIN, DEC2HEX, DEC2OCT, DELTA, ERF, ERF.PRECISE, ERFC, ERFC.PRECISE, GESTEP, HEX2BIN, HEX2DEC, HEX2OCT, OCT2BIN, OCT2DEC, OCT2HEX
- [x] CONVERT — units of length, mass, time, pressure, force, energy, power, magnetism, temperature, volume, area, speed and information, with decimal and binary prefixes
- [x] BESSELI, BESSELJ, BESSELK, BESSELY (series and Hankel expansions, accurate to about 14 digits; the original's own results differ from the exact values in the 7th digit)
- [x] COMPLEX, IMABS, IMAGINARY, IMARGUMENT, IMCONJUGATE, IMCOS, IMCOSH, IMCOT, IMCSC, IMCSCH, IMDIV, IMEXP, IMLN, IMLOG10, IMLOG2, IMPOWER, IMPRODUCT, IMREAL, IMSEC, IMSECH, IMSIN, IMSINH, IMSQRT, IMSUB, IMSUM, IMTAN

### Database
- [x] DAVERAGE, DCOUNT, DCOUNTA, DGET, DMAX, DMIN, DPRODUCT, DSTDEV, DSTDEVP, DSUM, DVAR, DVARP

### Compatibility
- [x] BETADIST, BETAINV, BINOMDIST, CHIDIST, CHIINV, CHITEST, CONFIDENCE, COVAR, CRITBINOM, EXPONDIST, FDIST, FINV, FORECAST, FTEST, GAMMADIST, GAMMAINV, HYPGEOMDIST, LOGINV, LOGNORMDIST, MODE, NEGBINOMDIST, NORMDIST, NORMINV, NORMSDIST, NORMSINV, PERCENTILE, PERCENTRANK, POISSON, QUARTILE, RANK, STDEV, STDEVP, TDIST, TINV, TTEST, USDOLLAR, VAR, VARP, WEIBULL, ZTEST

### Web and Cube
- [x] ENCODEURL
- [x] FILTERXML
- [ ] WEBSERVICE — out of scope: needs web access
- [ ] CUBEKPIMEMBER, CUBEMEMBER, CUBEMEMBERPROPERTY, CUBERANKEDMEMBER, CUBESET, CUBESETCOUNT, CUBEVALUE — out of scope: need an OLAP / data model server

## Context menus

- [x] Cell: Cut, Copy, Paste, Paste Special, Insert, Delete, Clear Contents, Sort, Format Cells, Define Name, Link
- [x] Column header: Insert, Delete, Clear Contents, Format Cells, Column Width, AutoFit, Hide, Unhide
- [x] Row header: Insert, Delete, Clear Contents, Format Cells, Row Height, AutoFit, Hide, Unhide
- [x] Sheet tab: Insert, Delete, Rename, Move or Copy, Tab Color, Hide, Unhide
- [x] Status bar: choose Average / Count / Numerical Count / Minimum / Maximum / Sum
- [x] Cell menu: Filter by value/color, Clear Filter, table rows insert/delete, Totals Row, Convert to Range, New/Edit/Delete Note, New Comment, Pick From Drop-down List
- [x] Object menu: Change Chart Type, Select Data, Move Chart, Bring to Front, Send to Back, Duplicate, Delete, Format…, Alt Text
- [x] Show Changes: author, date and time, action, and old and new content of each changed cell; filter to the selection; kept with the workbook (the last 500 edits)
- [x] Mini toolbar on right-click

## Keyboard shortcuts

- [x] Ctrl+N, Ctrl+O, Ctrl+S, F12, Ctrl+P
- [x] Ctrl+Z, Ctrl+Y, F4 (repeat last formatting command)
- [x] Ctrl+C, Ctrl+X, Ctrl+V, Ctrl+Alt+V
- [x] Ctrl+F, Ctrl+H, Ctrl+G, F5
- [x] Ctrl+1, Ctrl+Shift+F / Ctrl+Shift+P
- [x] Ctrl+B/I/U/5, Ctrl+2/3
- [x] Ctrl+Shift+$ % # @ ! ~ ^ number formats
- [x] Ctrl+Shift+& outline border, Ctrl+Shift+_ remove borders
- [x] Ctrl+; date, Ctrl+Shift+; time
- [x] Ctrl+' copy formula from above, Ctrl+` show formulas
- [x] Alt+= AutoSum, Shift+F3 Insert Function, Ctrl+F3 / Ctrl+Shift+F3 names
- [x] Ctrl+Shift++ insert, Ctrl+- delete
- [x] Ctrl+9 / Ctrl+0 hide, Ctrl+Shift+( / ) unhide
- [x] Ctrl+D, Ctrl+R, Ctrl+Enter, Alt+Enter, F2, Esc, Delete, Backspace
- [x] Ctrl+K link, Shift+F11 new sheet, Ctrl+PgUp/PgDn switch sheets
- [x] F9 calculate, Ctrl+Shift+U formula bar, Ctrl+F1 ribbon
- [x] Ctrl+T / Ctrl+L table, Ctrl+Shift+L filter, Ctrl+E flash fill, Shift+F2 note, Ctrl+Alt+M comment, Alt+F1 chart, F11 chart on new sheet, Shift+Alt+Right/Left group, Alt+F5 / Ctrl+Alt+F5 refresh, Alt+Down list
- [x] Alt / F10 KeyTips for the ribbon

## Status bar

- [x] Mode indicator: Ready, Enter, Edit, Point
- [x] Circular reference warning
- [x] "Calculate" in manual mode
- [x] Average, Count, Numerical Count, Minimum, Maximum, Sum of the selection
- [x] View buttons Normal / Page Layout / Page Break Preview
- [x] Zoom slider, ± buttons, zoom percentage opens the Zoom dialog
- [x] Caps Lock and Scroll Lock indicators, Page Layout mode with "Page n of m", accessibility status, macro recording indicator

## Sheet tabs

- [x] New sheet button and Shift+F11
- [x] Rename by double-click (name validation)
- [x] Delete with confirmation
- [x] Drag to reorder, Ctrl-drag to copy
- [x] Move or Copy dialog
- [x] Tab colors
- [x] Hide / Unhide sheets
- [x] Scroll arrows
- [x] Switching sheets while typing a formula inserts references to that sheet
- [x] Select several sheets (Ctrl/Shift+click tabs): typing, formatting and clearing apply to all grouped sheets, [Group] in the title
- [x] Protect Sheet / Protect Workbook

## File formats

- [x] .xlsx import: values, formulas (incl. shared formulas), cached results, fonts, fills, borders, alignment, number formats, protection flags, merged cells, column widths, row heights, hidden rows/columns/sheets, tab colors, frozen panes, gridlines, zoom, defined names, page setup, header/footer text, hyperlinks
- [x] .xlsx export of the same, with spilled formulas written as array formulas and _xlfn prefixes for newer functions
- [x] .xlsx: charts (own chart XML with cached values; read back incl. series, colors, titles, legend, labels, axes, gridlines, trendlines, combo/secondary axis), pictures, shapes and text boxes
- [x] .xlsx: tables (styles, options, totals, calculated columns, filters), sheet AutoFilter with criteria, conditional formatting, data validation, notes, outlines, manual page breaks, sparklines, sheet/workbook protection, allow-edit ranges
- [x] .xlsx: threaded comments are saved as real threaded comment parts with persons, plus legacy notes for older programs, and read back
- [x] .xlsx: dynamic-array formulas are saved with cell metadata (no {} braces when opened elsewhere); newer functions get _xlfn./_xlws. prefixes, LET/LAMBDA parameters _xlpm., A1# becomes ANCHORARRAY, @ becomes SINGLE
- [x] .xlsx import: theme colors read from the file's theme with tints applied on luminance, locale short-date formats, cached values of array formulas, rich text runs
- [x] .xlsx: PivotTables with pivot caches (the original program refreshes them on open), slicers for tables and PivotTables
- [~] .xlsx: histogram, waterfall, box & whisker, funnel and treemap charts are saved as classic charts; timelines are not saved
- [x] .xlsx: themes (colors, fonts and name written to the theme part and read back)
- [x] CSV import (comma, semicolon, tab, pipe detection) and export (displayed values, UTF-8 with BOM)
- [x] .ods import and export, .html and tab-delimited .txt export
- [~] .xls and .xlsb import (SheetJS: values, formulas, number formats, merges, sizes, names, fill colors) and export (values and number formats only)
- [x] .xlsx: pattern and gradient fills, custom table styles, data bar axis settings, chart data points and data tables

## Undo / Redo

- [x] Undo and redo for edits, formatting, structure changes, sheets, names, sorting, page setup, ink, objects, charts, tables, filters, rules, validation, notes, comments, protection, outlines, PivotTables
- [x] Selection and active sheet restored on undo/redo
- [~] View settings (zoom, gridlines, freeze panes) are not part of undo — like the original
