# Kontor Docs – feature checklist

Coverage: 375 done, 32 partial, 7 open of 414 (94% weighted, partial = ½). The open items need online services (out of scope) or are not planned.

Checklist of what a user finds in the original desktop word processor, grouped by area.
`[x]` done · `[~]` partial (what is missing is noted) · `[ ]` open.

## File (backstage)

- [x] Home page with greeting, templates and recent document
- [x] New blank document
- [x] New from templates (business letter, report, resume, meeting notes)
- [x] Recent documents – every document opened or created here is kept in the browser (File › Home and Open), remove from list
- [x] Pinned documents – pin documents to the top of File › Home / Open (kept on this device)
- [ ] Shared documents, cloud locations – out of scope: needs an online service
- [x] Open .docx
- [x] Open .html / .htm and .txt
- [x] Open .odt, Markdown (.md) and Rich Text Format (.rtf: fonts, sizes, colors, highlight, lists, tables, merged cells, pictures, links)
- [x] Open legacy binary .doc as formatted text (own reader: text, character formatting, alignment, indents, spacing, headings, lists, tables, links; no pictures, headers or notes)
- [ ] Open .pdf – not planned: PDF is a page-description format, not an editable document
- [x] Info: properties (pages, words, characters, paragraphs, paper)
- [x] Info: inspect document (accessibility check)
- [x] Info: Restrict Editing (Review tab) and Version History (a version on every save and every ten minutes of work, newest 20 kept on this device, restore)
- [x] Save As .docx
- [x] Save As web page (.html)
- [x] Save As plain text (.txt)
- [x] Save As .odt, .rtf and Markdown (.md)
- [x] Save (Ctrl+S) downloads .docx
- [x] AutoSave to browser storage with status in the title bar
- [x] Print with exactly the on-screen pagination
- [x] Print settings: copies, all/current/custom page range, odd/even pages, collated or not (the printer itself is chosen in the system print dialog)
- [x] Export to PDF (via the print dialog)
- [ ] Share, co-authoring, online comments – out of scope: needs a server
- [x] Options: measurement units (inches, cm, mm, points, picas)
- [x] Options: check spelling as you type
- [x] Options: widow/orphan control
- [x] Options: user name and initials, AutoCorrect list, smart quotes
- [x] Options: Customize the Ribbon (show/hide tabs, own tabs and groups with any ribbon command – picked by clicking it – or macros) and Quick Access Toolbar commands
- [~] Several documents: switch between documents kept in the browser (one open at a time)

## Title bar and Quick Access Toolbar

- [x] AutoSave switch
- [x] Save, Undo, Redo buttons
- [x] Undo/Redo history drop-downs (named actions; undo or redo several at once)
- [x] Editable document name with save status
- [x] Search box (Alt+Q)
- [x] Customize Quick Access Toolbar (New, Open, Save, Undo, Redo, Quick Print, Print Preview, Spelling, Read Aloud, Insert Table, New Comment)
- [x] Account, Share and Comments buttons (Share uses the system share sheet with a .docx copy, or downloads it; the account opens Options)

## Ribbon

- [x] Tabs: File, Home, Insert, Draw, Design, Layout, References, Mailings, Review, View, Help
- [x] Contextual tabs: Table Design, Table Layout, Picture Format, Shape Format, Chart Design, Equation, Header & Footer, Outlining
- [x] Collapse / pin the ribbon (Ctrl+F1, double-click a tab)
- [x] Dialog box launchers (Font, Paragraph, Page Setup)
- [x] Drop-down galleries that are not clipped by the ribbon
- [x] Adapting to narrow windows – groups shrink step by step by priority (labels go, large buttons become small, then the group collapses into a drop-down with its own icon); the status bar hides low-priority items instead of wrapping
- [x] KeyTips: Alt shows letters for the tabs, then every visible command of the tab gets its own keys

## Home tab

### Clipboard
- [x] Paste (keep source formatting)
- [x] Paste – keep text only
- [x] Paste Options: Keep Source Formatting, Merge Formatting, Keep Text Only (ribbon, right-click and the (Ctrl) button after every paste; Ctrl then K/M/T)
- [x] Paste Special dialog (HTML format, formatted text, unformatted text, picture) and Set Default Paste (Options)
- [x] Paste and drag-and-drop pictures; formatting set on whole paragraphs of web pages is kept
- [x] Live paste preview while hovering the paste options
- [x] Cut, Copy
- [x] Format Painter (single use)
- [x] Format Painter locked on by double-click, Esc to stop
- [x] Copy / paste formatting (Ctrl+Shift+C / Ctrl+Shift+V)
- [x] Clipboard pane (Clipboard group launcher): the last 24 cuts and copies, paste one or all, delete, clear

### Font
- [x] Font name box with Theme Fonts and All Fonts
- [x] Font list – the fonts installed on this computer (probed, or the complete list where the browser allows Local Font Access) plus the usual document fonts
- [x] Font size box (list and typed sizes, e.g. 10.5)
- [x] Increase / Decrease Font Size
- [x] Change Case (sentence, lower, upper, capitalize each word, toggle)
- [x] Clear All Formatting
- [x] Bold, Italic
- [x] Underline with styles (single, double, thick, dotted, dashed, wave) and color
- [x] Strikethrough
- [x] Subscript, Superscript
- [x] Text Effects – shadow, outline, emboss, engrave, glow, reflection, gradient fill, small caps, all caps; Format Text Effects dialog; glow/reflection/gradient written to and read from .docx (w14)
- [x] Text Highlight Color (15 colors, no color)
- [x] Font Color (theme colors with tints, standard colors, more colors, automatic)
- [x] Font dialog launcher

### Paragraph
- [x] Bullets with bullet library (8 bullets)
- [x] Define new bullet (any character or a picture; recently defined bullets in the library; character bullets round-trip through .docx, picture bullets are written as •)
- [x] Numbering with numbering library (7 formats)
- [x] Set numbering value
- [x] Multilevel list – 3 presets (1.a.i., 1.1.1, I.A.1.) and Define New Multilevel List (number style and format with %1…%9 for nine levels; written to and read from .docx)
- [x] Decrease / Increase Indent (lists and paragraphs, 0.5" steps)
- [x] Sort Text dialog – paragraphs, fields (tabs, commas, other) or table columns, up to three keys, text/number/date, ascending/descending, header row, case sensitive
- [x] Show/Hide ¶
- [x] Align Left, Center, Align Right, Justify
- [x] Left-to-Right / Right-to-Left text direction (stored as paragraph direction in .docx)
- [x] Line and paragraph spacing menu (1.0–3.0, options, add/remove space before/after)
- [x] Shading (paragraph background)
- [~] Borders – bottom, top, left, right, none, all, outside, horizontal line, Borders and Shading dialog; no diagonal or art borders
- [x] Paragraph dialog launcher

### Styles
- [x] Styles gallery: Normal, No Spacing, Heading 1–6, Title, Subtitle, Subtle Emphasis, Emphasis, Intense Emphasis, Strong, Quote, Intense Quote, Subtle Reference, Intense Reference, Book Title, List Paragraph, Caption
- [x] Expanded gallery with Clear Formatting
- [x] Create a Style, Modify Style dialog, Update Style to Match Selection, delete/reset styles
- [x] Styles pane (Alt+Ctrl+Shift+S) with preview, new style, per-style menu, Style Inspector (style plus direct formatting, clear buttons) and Manage Styles (modify, delete/reset, new, import/export styles)

### Editing
- [x] Find with result count and highlighting
- [x] Advanced Find options: match case, whole words only
- [x] Wildcards (? * [ ] [! ] < > {n,m} @, groups with \1 in the replacement), special characters (^t ^? ^# ^$ ^w ^s ^^, ^& in the replacement) and Format: find and replace bold, italic, underline, strikethrough, highlight, font, size, color and style
- [x] Replace and Replace All
- [x] Go To (page number, relative +/−, heading)
- [x] Select All, Select Paragraph
- [x] Selection Pane (Home › Select, Layout/Shape/Picture › Arrange): rename, show/hide, reorder, multiple selection
- [x] Select text with similar formatting (several ranges; character and paragraph formatting and Delete act on all of them; typing replaces the first range and removes the others)
- [ ] Dictate, Editor (grammar and style suggestions), Add-ins – out of scope: need speech/AI services or an online add-in store

## Insert tab

- [x] Cover Page – two designs, a new one replaces the current one, Remove Current Cover Page
- [x] Blank Page
- [x] Page Break
- [x] Table grid picker (10 × 8)
- [x] Insert Table dialog
- [~] Convert Text to Table, Quick Tables (tabular list, calendar), Draw Table; no embedded spreadsheet
- [x] Pictures from this device
- [x] Pictures from a web address
- [ ] Online picture search, stock images – out of scope: online service
- [x] Shapes: about 90 presets in 8 groups (lines, rectangles, basic shapes, block arrows, equation shapes, flowchart, stars, callouts), drawn by dragging, text inside
- [~] Icons (searchable icon set, inserted as pictures); no 3D models
- [x] Diagrams (SmartArt-like): Block List, Vertical Bullet List, Basic Process, Chevron Process, Basic Cycle, Basic Radial, Organization Chart, Basic Venn, Basic Matrix, Basic Pyramid; text pane (Tab/Shift+Tab levels), Add Shape after/before/above/below, Promote/Demote, Move Up/Down, Change Layout, Change Colors, Styles, Reset, Convert to Shapes; saved to .docx as a shape group plus their outline
- [x] Chart: column, bar, line, area, pie, doughnut, scatter (clustered, stacked, 100%), data sheet, titles, legend, data labels, colors
- [~] Screenshot: Screen Clipping of a screen, window or tab through the browser's picker; no gallery of open windows
- [~] Online Video (YouTube and Vimeo embedded; double-click opens it); written to .docx as a link
- [x] Link (insert, edit, remove, open)
- [x] Bookmark dialog (add, delete, go to, sort, hidden bookmarks)
- [x] Cross-reference to headings, bookmarks, footnotes, endnotes, figures and tables (text, number, page, above/below)
- [x] Comment (Insert › Comment, Ctrl+Alt+M)
- [x] Header gallery (blank, three columns, title, title and date, title with rule), edit, remove
- [x] Footer gallery (blank, three columns, page number, page X of Y, title and page), edit, remove
- [x] Page Number: top of page, bottom of page (5 designs each), current position
- [x] Format Page Numbers (1, a, A, i, I; start at)
- [x] Remove Page Numbers
- [x] Text Box: built-in designs (simple, sidebar, pull quote) and Draw Text Box
- [x] Quick Parts – document title, page/number of pages/date fields, AutoText gallery (Save Selection to Quick Part Gallery, insert, delete)
- [x] WordArt (8 styles)
- [x] Drop Cap (dropped, in margin)
- [x] Signature Line (signer, title, e-mail, instructions, date)
- [x] Date & Time dialog (11 formats, update automatically in headers/footers)
- [~] Object › Text from File (.docx, .doc, .odt, .rtf, .md, .html, .txt); no embedded objects
- [x] Equation: built-in equations, Insert New Equation (Alt+=), linear format with live preview, structures and symbols
- [x] Symbol gallery
- [x] More Symbols dialog (subsets, character code)
- [x] Horizontal line

## Draw tab

- [~] Drawing canvas: four pens, highlighter, eraser, thickness, undo, clear, insert as picture
- [~] Inking directly on the page (Draw tab: four pens, highlighter, thickness, stroke eraser; strokes become pictures in front of the text); no lasso select, ink to shape, ink to math, replay or drawing ruler

## Design tab

- [x] Themes (8 own themes combining colors and fonts)
- [x] Style Sets (8: Default, Classic, Modern, Centered, Lined, Shaded, Bold, Minimal)
- [x] Theme Colors (7 color sets for headings and accents)
- [x] Theme Fonts (9 heading/body pairs)
- [x] Paragraph Spacing presets (default, none, compact, tight, open, relaxed, double)
- [~] Effects (Design tab: subtle, moderate, intense shadow or glow on shapes, diagrams and charts); on screen and in print only
- [x] Set as Default (theme, style set, spacing and styles for new documents)
- [x] Watermark presets (confidential, do not copy, draft, sample, urgent, ASAP)
- [x] Custom watermark (text, color, semitransparent, diagonal/horizontal)
- [x] Picture watermark (scale, washout)
- [x] Page Color (palette, more colors, no color)
- [~] Fill effects: two-color gradients; no texture, pattern or picture fills
- [x] Page Borders presets (single, double, thick, dotted, dashed, accent)
- [~] Borders and Shading dialog (borders, page border, shading); no art borders

## Layout tab

- [x] Margins presets (Normal, Narrow, Moderate, Wide, Mirrored)
- [~] Mirrored margins – stored, exported and imported; the screen shows the inside margin on every page
- [x] Custom Margins (Page Setup dialog)
- [x] Orientation (portrait, landscape)
- [x] Size presets (Letter, Legal, Executive, Tabloid, Statement, A3, A4, A5, B5)
- [x] Custom paper size
- [x] Columns: one, two, three, More Columns (count, spacing, line between, this section / selected text / whole document)
- [x] Breaks: page, text wrapping (line break)
- [x] Breaks: column, section (next page, continuous, even page, odd page)
- [x] Line Numbers: continuous, restart each page, suppress for current paragraph
- [x] Hyphenation: automatic / none
- [x] Hyphenation options (automatic, words in CAPS, zone, consecutive-hyphen limit; saved to .docx) and Manual (optional hyphens in long words)
- [x] Indent Left / Right spinners
- [x] Spacing Before / After spinners
- [x] Align – paragraphs and drawing objects (left, center, right)
- [x] Position, Wrap Text, Bring Forward, Send Backward, Selection Pane, Align, Group/Ungroup (Shift+click several objects), Rotate
- [x] Page Setup dialog: margins, orientation, paper size, mirror margins, header/footer distance, different first page
- [~] Page Setup: line numbers, different odd/even, vertical alignment top/center/bottom on screen, in print and .docx (justify shows as top), gutter (left/inside or top; screen, print, .docx); no per-section page setup

## References tab

- [x] Table of Contents: automatic (3 levels), automatic (2 levels), detailed (6 levels)
- [x] Update Table, Remove Table of Contents
- [x] Add Text (set TOC level)
- [x] Ctrl+click a TOC entry to jump to the heading
- [x] Custom Table of Contents dialog (show/right-align page numbers, tab leader, levels 1–9, outline levels)
- [x] Footnotes and endnotes (Ctrl+Alt+F / Ctrl+Alt+D): notes at the bottom of their page, endnotes after the text, Next/Previous, Show Notes, number formats and start
- [x] Citations and bibliography: Insert Citation, Add New Source, Source Manager (new, edit, delete, cite, preview), styles APA / MLA / Chicago, Bibliography / References / Works Cited (updates automatically)
- [x] Insert Caption (Figure, Table, Equation; numbering; above/below)
- [x] Insert Table of Figures – captions by label, with or without label and number, page numbers, tab leader, Update Table
- [x] Cross-reference (also on the Insert tab)
- [~] Index: Mark Entry / Mark All with subentries (Alt+Shift+X), Index dialog (indented or run-in, 1–4 columns, letter headings, right-aligned page numbers with tab leader), Update Index; XE fields read from .docx; no cross-reference entries
- [x] Table of Authorities – Mark Citation / Mark All (Alt+Shift+I) with long and short citation and category, Insert Table of Authorities (category, passim, tab leader), refreshes itself; TA fields written to and read from .docx
- [ ] Researcher, Smart Lookup – out of scope: online services

## Mailings tab

- [x] Envelopes (delivery and return address, 5 sizes, new document or print)
- [x] Labels (5 label products, full page or single label, new document or print)
- [x] Start Mail Merge types (letters, e-mail messages, envelopes, labels, directory, normal document)
- [x] Select Recipients from a CSV file (comma, semicolon or tab separated)
- [~] Type a New List (editable table, save as CSV); no contacts from an address book
- [x] Edit Recipient List – table with checkboxes, sorting, filter, editing, new and deleted entries, save as CSV
- [x] Highlight Merge Fields
- [x] Address Block
- [x] Greeting Line
- [x] Insert Merge Field
- [x] Match Fields (used by Address Block and Greeting Line); Rules: Skip Record If, If…Then…Else, Fill-in, Merge Record #, Merge Sequence #, Next Record, Next Record If (Ask/Set Bookmark not included)
- [x] Preview Results with first/previous/next/last record
- [x] Find Recipient, Check for Errors (merge fields without a column)
- [x] Finish & Merge: Edit Individual Documents
- [x] Finish & Merge: merge to a .docx file
- [~] Finish & Merge: Print Documents; Send E-mail Messages creates one .eml message per recipient (in a .zip) for your mail program to send

## Review tab

- [~] Spelling & Grammar – the browser's spell checker underlines mistakes (toggle, F7); no grammar check or Spelling pane
- [~] Thesaurus with a small built-in word list
- [x] Word Count dialog (pages, words, characters with/without spaces, paragraphs, lines)
- [x] Read Aloud (from the cursor or the selection, stop)
- [x] Check Accessibility (missing alt text, skipped heading levels, empty headings, tables without header row, low contrast)
- [ ] Translate – out of scope: needs a translation service
- [x] Language (proofing language for spell check, 11 languages)
- [x] Comments: new (Ctrl+Alt+M), reply, edit, resolve/reopen, delete (one, resolved, shown, all), previous/next, show comments / compact icons
- [x] Track Changes (Ctrl+Shift+E), Simple/All/No Markup/Original, show insertions and deletions/comments, change bars, author colors, Reviewing Pane
- [x] Accept / Reject: this change, and move to next, all, all and stop tracking; from the context menu
- [x] Compare (original file against the current document, word-level differences as tracked changes) and Combine (a reviewer's copy merged in as tracked changes in their name, keeping the copy's own tracked changes; the current document's own tracked changes are not carried over)
- [x] Restrict Editing: read only, comments only, tracked changes, optional password
- [x] Hide Ink (Draw and Review tabs)

## View tab

- [x] Read Mode: screen-wide columns, page turning, column width, page color (sepia, inverse)
- [x] Print Layout
- [x] Web Layout
- [x] Outline view: promote/demote, heading 1 / body text, move up/down, show level, first line only, text formatting
- [x] Draft view
- [x] Focus mode
- [~] Immersive Reader: text spacing, line focus and syllables in Read Mode; no picture dictionary (online service)
- [x] Vertical page movement
- [~] Side to Side: pages side by side to browse (click a page to edit it)
- [x] Ruler
- [x] Gridlines
- [x] Navigation Pane: headings with page numbers, search box, current heading highlighted
- [x] Navigation Pane: Pages and Results tabs, drag headings to move their sections
- [x] Zoom menu, 100%, One Page, Page Width, Zoom In/Out
- [~] Multiple Pages: overview of the pages two at a time (click a page to edit it)
- [~] New Window (read-only Read Mode copy); no Arrange All, Split or View Side by Side
- [x] Macros – record (typing, keys, ribbon commands and menu choices), pause, stop, run, rename, delete; kept on this device; can be put on custom ribbon tabs (no VBA – out of scope)
- [x] Switch Modes (dark page)

## Shape Format, Chart Design and Equation (contextual)

- [x] Shape Format: insert shapes, change shape, draw text box
- [x] Shape Styles gallery (colored fill, outline, subtle, intense per color), Shape Fill, Shape Outline (color, weight, dashes, arrows), Shape Effects (shadow, glow, gradient)
- [x] Text in shapes: double-click to type, text fill, font size, bold, align text top/middle/bottom
- [x] WordArt styles for text boxes
- [x] Arrange and Size groups for shapes, text boxes, charts and signature lines
- [x] Chart Design: add chart elements (title, legend position, data labels, gridlines), change colors, edit data, switch row/column, change chart type
- [x] Equation tab: built-in equations, edit, display/inline, convert to text, symbols, structures (fraction, script, radical, integral, large operator, bracket, function, accent, matrix)
- [x] Selection Pane and grouping of floating objects (a group moves together)
- [x] Rich text in shapes: Add Text (double-click or right-click) turns the shape into a text box with the shape's outline
- [~] Shape groups are written to .docx as drawing groups and read back as groups; no edit points, merge shapes or 3-D rotation

## Help tab

- [x] Help (keyboard shortcuts and tips)
- [x] About
- [x] Training (getting started), What's New, Feedback (copy or save your feedback)

## Table Design (contextual)

- [x] Table Style Options: Header Row, Total Row, Banded Rows, First Column, Last Column, Banded Columns
- [x] Table Styles gallery (9 styles)
- [x] Shading (cell color)
- [x] Borders: per-cell borders (all, outside, inside, inside horizontal/vertical, top, bottom, left, right, none), line style, weight, pen color, Border Painter, Borders and Shading
- [x] Table alignment (left, center, right)

## Table Layout (contextual)

- [x] Select cell, column, row, table
- [x] View Gridlines
- [x] Table Properties dialog (alignment, row height, allow row to break, repeat header, cell vertical alignment, alt text title)
- [x] Draw Table (drag a table, draw lines to split cells), Eraser (click a line to merge cells)
- [x] Delete columns, rows, table
- [x] Delete cells, shifting cells left or up
- [x] Insert Above, Below, Left, Right
- [x] Merge Cells
- [x] Split Cells
- [x] Split Table
- [~] AutoFit – contents/window reset column widths, fixed keeps equal widths
- [x] Distribute Columns
- [x] Distribute Rows, row height and column width boxes
- [x] Cell alignment (9 positions)
- [x] Text Direction (horizontal, 90°, 270°), Cell Margins
- [x] Sort rows by the cursor's column (header row stays)
- [x] Repeat Header Rows on every page
- [x] Convert to Text
- [x] Formula: SUM, AVERAGE, COUNT, MAX, MIN, PRODUCT of ABOVE/BELOW/LEFT/RIGHT with number formats (inserted as a value)
- [x] Resize columns by dragging borders

## Picture Format (contextual)

- [x] Change Picture
- [x] Reset Picture
- [x] Picture Styles (8)
- [x] Corrections (brightness/contrast), Color (saturation, recolor), Artistic Effects (blur), Transparency, Picture Border, Picture Effects (shadow, reflection, glow, soft edges), Remove Background (edge color, flood fill) and Compress Pictures (330/220/150/96 ppi, delete cropped areas)
- [x] Alt Text (including "mark as decorative")
- [x] Align (via paragraph alignment)
- [x] Rotate 90° left/right, flip vertical/horizontal
- [x] Free rotation handle (Shift snaps to 15°)
- [x] Position and Wrap Text: in line, square, tight, through, top and bottom, behind text, in front of text; drag to move; Layout dialog
- [x] Height / Width with locked aspect ratio
- [x] Resize with handles
- [x] Crop (dialog, aspect ratios, crop to shape)

## Header & Footer (contextual)

- [x] Header, Footer and Page Number galleries
- [x] Date & Time (updating field or fixed text)
- [x] Document Info (title, page, number of pages)
- [x] Pictures in headers and footers
- [x] Go to Header / Go to Footer, Previous / Next page
- [x] Different First Page
- [x] Different Odd & Even Pages
- [x] Show Document Text toggle
- [x] Header from Top / Footer from Bottom
- [x] Close Header and Footer (button, Esc, double-click the body)
- [x] Double-click the top/bottom margin to edit
- [x] Formatting of header/footer text with the Home tab
- [~] Link to Previous – all sections share the headers and footers (always linked)

## Page layout (print layout engine)

- [x] Every page is its own sheet with a gap between pages
- [x] Long documents stay responsive: page layout runs after a short typing pause and the page sheets do not redraw while typing
- [x] Large pictures are scaled down to fit the text width and the page height
- [~] Tables in columns flow from column to column; a single table or paragraph taller than a page's columns cannot continue on the next page
- [x] Text flows to the next page line by line (justified lines stay justified)
- [x] Widow/orphan control
- [x] Keep with next (headings stay with the following paragraph)
- [x] Keep lines together
- [x] Page break before
- [x] Manual page breaks (shown as "Page Break" with formatting marks on)
- [x] Tables split between rows across pages
- [x] Repeat header rows on each page
- [x] Rows break across pages line by line ("Allow row to break across pages"; rows that may not break move as a whole)
- [x] Header/footer taller than the margin pushes the body text
- [x] Accurate page count and current page
- [x] Zoom 10–500% (non-linear slider like the original)
- [x] Printing/PDF matches the screen page by page
- [x] Click in a margin or gap places the cursor on the nearest line
- [x] Left margin selection bar (click = line, double-click = paragraph, triple-click = all)

## Paragraph dialog

- [x] Alignment
- [x] Outline level – in the Paragraph dialog, read from and written to .docx, used by the table of contents
- [x] Indentation: left, right, special (first line / hanging) by
- [~] Mirror indents – Paragraph dialog (Inside/Outside), .docx; shown like mirrored margins (inside = left on every page)
- [x] Spacing before / after
- [x] Line spacing: single, 1.5, double, at least, exactly, multiple
- [x] Don't add space between paragraphs of the same style – Paragraph dialog, screen, .docx
- [x] Preview
- [x] Line and Page Breaks: widow/orphan control, keep with next, keep lines together, page break before
- [x] Suppress line numbers and Don't hyphenate (Paragraph dialog, .docx)
- [x] Tabs dialog (custom tab stops, alignment, leaders)

## Font dialog

- [x] Font, font style, size lists
- [x] Font color (incl. automatic)
- [x] Underline style and underline color
- [x] Strikethrough, double strikethrough, superscript, subscript
- [x] Small caps, all caps, hidden
- [x] Advanced: scale, spacing (expanded/condensed), position (raised/lowered)
- [x] Kerning (points and above, saved to .docx) and OpenType features (ligatures, number spacing, number forms; on screen)
- [x] Preview
- [x] Font dialog › Set As Default (font and size of the Normal style for new documents) and Text Effects dialog

## Other dialogs

- [x] Page Setup
- [x] Insert Table
- [x] Symbol
- [x] Date and Time
- [x] Word Count
- [x] Go To
- [x] Printed Watermark
- [x] Page Number Format
- [x] Caption
- [x] Alt Text
- [x] Insert picture from address
- [x] Accessibility results
- [x] Options
- [x] Help / keyboard shortcuts, About

## Context menu and mini toolbar

- [x] Right-click menu: Cut, Copy, Paste, Paste text only
- [x] Right-click menu: Font…, Paragraph…
- [x] Right-click menu: Link, Edit Link, Open Link, Remove Link
- [x] Right-click menu in tables: insert/delete rows and columns, delete table, merge/split cells
- [x] Right-click menu on pictures: alt text, reset size
- [x] Right-click menu: search for the selection
- [~] Spelling suggestions – via the browser's own menu (Shift+right-click)
- [x] Mini toolbar above a mouse selection (font, size, grow/shrink, bold, italic, underline, highlight, color, bullets, numbering)

## Comments and tracked changes

- [x] Comment cards beside the page, aligned with their text and pushed apart when they would overlap, with a connector to the active comment
- [x] Author name, initials and avatar color; relative times
- [x] Reply, edit, resolve/reopen, delete reply, delete thread
- [x] Insertions underlined and deletions struck through in the author's color; deleting your own insertion removes it
- [x] Backspace/Delete over tracked text move past it like the original
- [x] Markup views: Simple Markup (red change bar), All Markup, No Markup, Original
- [x] Reviewing Pane with summary and list; click to go to a change or comment
- [~] Formatting changes of text are tracked ("Formatted: Bold …", accept/reject, .docx w:rPrChange), Lock Tracking with optional password; no moves, paragraph-formatting changes or paragraph marks

## Keyboard shortcuts (⌘ on a Mac)

- [x] Ctrl+S, Ctrl+O, Ctrl+P, F12, Ctrl+Alt+N
- [~] Ctrl+N – reserved by the browser; Ctrl+Alt+N creates a new document
- [x] Ctrl+Z / Ctrl+Y, Ctrl+X / C / V, Ctrl+A
- [x] Ctrl+F, Ctrl+H, Ctrl+G, Ctrl+K, Ctrl+D
- [x] Ctrl+B / I / U, Ctrl+Shift+D (double underline)
- [x] Ctrl+= / Ctrl+Shift++ (subscript / superscript)
- [x] Ctrl+Shift+A (all caps), Ctrl+Shift+K (small caps)
- [x] Ctrl+Shift+> / < and Ctrl+] / [ (font size)
- [x] Ctrl+Space (remove character formatting), Ctrl+Q (remove paragraph formatting)
- [x] Ctrl+E / L / R / J (alignment)
- [x] Ctrl+1 / 2 / 5 (line spacing), Ctrl+0 (space before)
- [x] Ctrl+M / Ctrl+Shift+M (indent), Ctrl+T / Ctrl+Shift+T (hanging indent)
- [x] Ctrl+Alt+1–6 (headings), Ctrl+Shift+N (Normal), Ctrl+Shift+L (bullets)
- [x] Ctrl+Enter (page break), Shift+Enter (line break), Tab (tab character, list level, next cell)
- [x] Ctrl+* (show/hide ¶), Shift+F3 (change case), Alt+Shift+D / T (date / time), Alt+Q (search)
- [x] F7 (spelling), Ctrl+F1 (ribbon), Esc (close header/footer, stop Format Painter)
- [x] F4 / Ctrl+Y (with nothing to redo) repeats the last formatting, typing or insertion
- [x] Ctrl+Shift+E (track changes), Ctrl+Alt+M (comment), Ctrl+Shift+W (word underline), Ctrl+Shift+H (hidden), Ctrl+Alt+F / D (footnote / endnote), Alt+= (equation), Alt+Ctrl+Shift+S (styles pane), Ctrl+Shift+Enter (column break)
- [x] KeyTips (Alt, then a letter for the tab, then keys for its commands)

## Status bar

- [x] Page X of Y (click opens Go To)
- [x] Word count, "N of M words" for a selection (click opens Word Count)
- [x] Spelling indicator (click toggles)
- [x] Language (click to change)
- [x] Focus button
- [x] View buttons – read mode, print layout, web layout
- [x] Zoom slider, zoom out/in, zoom percentage (click resets to 100%)
- [x] Customize the status bar (right-click: page number, word count, spelling, language, focus, view shortcuts, zoom slider, zoom)

## Editing basics

- [x] Undo / redo history
- [x] Default tab stops every 0.5"
- [x] Custom tab stops: left, center, right, decimal, bar with leaders; set by clicking the ruler (tab selector), drag to move, drag off to remove
- [x] Ruler: indent markers (first line, hanging, left, right) drag with snapping
- [x] Ruler: drag margins
- [x] Vertical ruler beside the page with the cursor (drag the top and bottom margins)
- [x] Paste formatted text from other programs
- [x] AutoFormat as you type – automatic bullets/numbering, horizontal line, smart quotes, dashes
- [x] AutoCorrect with an editable replacement list
- [x] Spell-check underlining in the chosen proofing language
- [x] Formatting marks (¶, page breaks, hidden text)
- [x] Hidden text
- [x] Open metric-compatible fonts for Calibri and Cambria (layout matches documents made with them)

## File format fidelity (.docx)

- [x] Import: character formatting (font, size, color, highlight, shading, bold, italic, underline style/color, strike, double strike, caps, small caps, sub/superscript, spacing, position, scale, hidden, emboss/engrave)
- [x] Import: paragraph formatting (alignment, spacing before/after, line spacing rules, indents, keep options, page break before, widow control, shading, borders, drop caps)
- [x] Import: styles (Heading 1–6, Title, Subtitle, Quote, Intense Quote, No Spacing, List Paragraph, Caption, character styles; other styles become direct formatting; theme fonts)
- [x] Import: bullet and numbered lists with levels, formats and start values
- [x] Import: tables with horizontal and vertical merges, column widths, shading, vertical alignment, header rows
- [x] Import: inline pictures (size, alt text), hyperlinks, page breaks, tabs, symbols, line breaks
- [x] Import: page size, orientation, margins, header/footer distance, different first page, page number format/start, page color, page borders
- [x] Import: headers and footers (default and first page) with PAGE / NUMPAGES fields
- [x] Import: floating pictures (wrap, position, crop, transparency), text boxes, shapes, charts, equations, footnotes, endnotes, comments with replies and resolved state, tracked changes, bookmarks, REF/PAGEREF fields, sections, columns, odd/even headers, custom paragraph styles, tab stops, cell borders, row heights
- [x] Import: watermarks (WordArt text and pictures), headers/footers defined in any section, shapes with text as rich text boxes, paragraph direction
- [~] Import: diagrams of the original's gallery become our diagrams (outline and layout kind); no ink
- [x] Export: text and paragraph formatting, styles, lists, tables (styles, shading, merges, widths), pictures (size, rotation, flip, alt text), links, tabs, page breaks, drop caps, table of contents
- [x] Export: page setup, headers/footers with page number fields, different first page, page number format, page color, page borders, theme fonts and colors, paragraph spacing preset
- [x] Export: mirrored margins, hyphenation setting, text watermarks (WordArt in the headers) and picture watermarks
- [x] Export: comments (threads, resolved), tracked changes and the Track Changes setting, footnotes and endnotes, sections and columns, odd/even headers, shapes, text boxes, charts with their data, equations, bookmarks, cross-reference fields, signature lines, floating pictures with wrap and position, picture crop/corrections (baked into the picture), custom and modified styles, tab stops, cell borders, row heights, repeated header rows, cell margins, text direction
- [x] Export: web page (.html) and plain text (.txt)
- [x] PDF through the browser's print dialog
