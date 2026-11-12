# Kontor Slides – feature checklist

Coverage: 323 done, 37 partial, 19 open of 379 (85% done, 90.1% weighted with partial = ½)

Legend: `[x]` done, `[~]` partial (what is missing is noted), `[ ]` not done yet.
The list follows the ribbon and views of a typical desktop presentation program.

## File (backstage)

- [x] Home page with greeting and new-presentation gallery
- [x] New: blank presentation and one per theme (11 themes)
- [x] Open a .pptx file from this device
- [x] Recent files list (Home and Open; copies kept in this browser, remove from list)
- [x] Info: title, author, slide count, hidden slides, word count, slide size
- [~] Info: Inspect Presentation (find and remove comments, notes, hidden slides, off-slide content, author); no password protection or version history
- [x] Save As .pptx (download)
- [~] Save as PNG/JPEG pictures (this slide, or all slides as a .zip); no .ppsx / .potx / .odp
- [x] Print: all slides, current slide, selected slides
- [x] Print layouts: full page slides, notes pages, outline, handouts (3 and 6 per page)
- [x] Print option: frame slides
- [~] Print copies, collate, color/grayscale – handled by the browser print dialog
- [x] Export: PDF (via the print dialog)
- [x] Export: Download PDF directly (one page per slide, hidden slides left out; slides as pictures with an invisible text layer, so text can be selected and searched)
- [x] Export: .pptx presentation
- [x] Export: outline as plain text (.txt)
- [~] Export: Create a Video (MP4/WebM with transitions and recorded timings, 3 qualities; animations show their end state) and animated GIF; no package for CD or handouts for a word processor
- [x] Close presentation
- [x] Options dialog (General, Proofing with AutoCorrect, Advanced, Quick Access Toolbar)
- [x] Account page (user name and initials for comments, app theme, product information)
- [x] AutoSave in the browser (localStorage with IndexedDB fallback for large pictures)
- [x] Restore the last presentation on reload

## Title bar and quick access

- [x] App icon, AutoSave switch
- [x] Save, Undo, Redo buttons
- [x] Start From Beginning button
- [x] Editable presentation name and save status
- [x] Search box (opens Find)
- [x] Customize the quick access toolbar (11 commands, order, show below the ribbon)

## Home tab

### Clipboard
- [x] Paste (internal clipboard, images and text from the system clipboard)
- [~] Paste options: Use Destination Theme, Keep Text Only (no Keep Source Formatting, Picture)
- [x] Cut
- [x] Copy
- [x] Duplicate (Ctrl+D)
- [x] Format Painter (click: once, double-click: stays on)

### Slides
- [x] New Slide with layout gallery
- [x] Duplicate Selected Slides
- [~] Reuse Slides from another .pptx (pick slides, Insert All; inserted slides take this presentation's design); no Slides from Outline
- [x] Layout gallery (9 layouts)
- [x] Reset slide
- [x] Section: Add, Rename, Remove
- [x] Section: collapse/expand (click the section name), Collapse/Expand All, Move Section Up/Down, Remove Section & Slides

### Font
- [x] Font face with theme fonts (Headings/Body) and font list
- [x] Font size box with list
- [x] Increase / Decrease Font Size
- [x] Clear All Formatting
- [x] Bold, Italic, Underline
- [x] Text Shadow
- [x] Strikethrough
- [x] Character Spacing (Very Tight … Very Loose, More Spacing)
- [x] Change Case (Sentence, lower, UPPER, Capitalize Each Word, tOGGLE)
- [x] Text Highlight Color
- [x] Font Color with theme palette, standard colors, recent colors, custom color
- [x] Font dialog (font, style, size, underline, strikethrough, superscript, subscript, small caps, all caps, character spacing)
- [ ] Font dialog: double strikethrough, underline styles and color, equalize character height, baseline offset

### Paragraph
- [x] Bullets with gallery (8 bullet styles, None)
- [x] Numbering with gallery (7 schemes, None)
- [~] Bullets and Numbering dialog: bullet characters and a custom character, size % of text, color, numbering schemes, start at (no picture bullets)
- [x] Decrease / Increase List Level (and Tab / Shift+Tab)
- [x] Line Spacing (1.0–3.0, Line Spacing Options)
- [x] Align Left, Center, Align Right, Justify
- [x] Distributed alignment
- [x] Add or Remove Columns (1–3)
- [x] Columns dialog with custom spacing
- [x] Text Direction (horizontal, rotate 90°, rotate 270°)
- [x] Text Direction: stacked
- [x] Align Text (top, middle, bottom)
- [x] Convert to Diagram (bullet text becomes a diagram)
- [x] Paragraph dialog (alignment, list level, spacing before/after, line spacing)
- [~] Paragraph dialog: no exact line spacing in points, no custom indents or tab stops

### Drawing
- [x] Shapes gallery: 119 shapes in Lines, Rectangles, Basic Shapes, Block Arrows, Equation Shapes, Flowchart, Stars and Banners, Callouts
- [x] Freeform: Shape (click for corners, drag for freehand, click the start point to close, double-click/Enter to end) and Freeform: Scribble
- [x] Action buttons (7 kinds)
- [x] Arrange menu (order, group, align, distribute, rotate, flip, Selection Pane)
- [x] Quick Styles (35 theme styles)
- [x] Shape Fill: theme/standard/recent/custom colors, No Fill, gradient presets, picture
- [~] Shape Fill: 52 pattern fills with foreground/background colors (no built-in textures)
- [x] Shape Outline: color, No Outline, weight, dashes, arrows
- [ ] Shape Outline: sketched lines, compound lines
- [x] Shape Effects: shadow presets, glow, soft edges, reflection
- [ ] Shape Effects: bevel, 3-D rotation, preset effects, inner shadow

### Editing
- [x] Find (match case, whole words; selects the match in the text)
- [x] Replace / Replace All
- [x] Replace Fonts
- [x] Select All, Select Objects, Selection Pane

## Insert tab

- [x] New Slide
- [x] Table: grid picker, Insert Table dialog, Draw Table and table eraser
- [x] Pictures from this device (multiple)
- [~] Photo Album: pictures per slide (fit, 1, 2, 4, with or without title), frame shapes, captions, black and white; added after the current slide instead of a new file. No stock images, online pictures or screenshots
- [x] Shapes
- [x] Icons (about 120 built-in icons, searchable)
- [ ] 3D models
- [x] Diagrams (like SmartArt): 12 layouts in 7 categories (list, process, cycle, hierarchy, relationship, matrix, pyramid) with a text pane
- [x] Chart: column, bar, line, pie, doughnut, area, scatter and combo, with clustered/stacked/100% variants and a data sheet
- [~] Zoom: summary, section and slide zoom with live thumbnails that jump in the show (written to .pptx as linked frames)
- [x] Link to a web page or e-mail address (text or whole object)
- [x] Link to another slide: picker for slides and first/last/next/previous slide; written to .pptx as slide jumps
- [~] Action buttons with navigation links (no Action Settings dialog for programs, sounds or mouse-over)
- [x] Comment
- [x] Text Box (horizontal and vertical)
- [x] Header & Footer (date and time, slide number, footer, not on title slide)
- [x] WordArt (9 styles)
- [ ] WordArt transform (warp) effects
- [x] Date & Time (formats, update automatically)
- [x] Slide Number field
- [ ] Object (embedded files)
- [ ] Equation
- [x] Symbol (common symbols)
- [~] Video and audio: insert, play while editing and in the show, trim, poster frame, start automatically or on click, loop, rewind, full screen, hide while not playing, volume (no screen recording, no fades or bookmarks)

## Draw tab

- [x] Select tool
- [x] Pens (black, red, blue) and pencil
- [x] Highlighters (yellow, green)
- [x] Stroke eraser
- [x] Pen thickness
- [x] Pen color
- [ ] Ink to Shape / Ink to Math
- [ ] Ruler, lasso select, ink replay

## Design tab

- [x] Themes gallery (11 original themes with fonts, colors, backgrounds and decorations)
- [x] Variants (4 per theme)
- [x] Colors menu (variant color schemes)
- [x] Custom color schemes (Customize Colors: 12 theme colors, name, saved in the file's theme)
- [x] Fonts menu (12 font pairs, theme default)
- [x] Custom font schemes (Customize Fonts: heading and body font)
- [x] Background Styles (12 presets, reset)
- [ ] Effects and style variants
- [x] Slide Size: Standard (4:3), Widescreen (16:9)
- [x] Custom Slide Size dialog with presets, orientation, Maximize / Ensure Fit
- [x] Format Background pane: solid, gradient, picture (tile), transparency
- [x] Hide background graphics, Apply to All, Reset Background
- [x] Pattern background fill
- [ ] Designer (layout suggestions)

## Transitions tab

- [x] Preview
- [x] 13 transitions plus None: Cut, Fade, Push, Wipe, Split, Reveal, Cover, Random Bars, Shape, Zoom, Dissolve, Blinds, Checkerboard
- [~] 27 transitions incl. Morph (objects with the same name move and resize), Flip, Cube, Gallery, Fall Over, Curtains, Vortex, Clock, Wedge, Strips, Newsflash, Flash, Uncover (no Dynamic Content set; 3-D ones are written to .pptx as their closest basic transition)
- [x] Effect Options (directions and variants per transition)
- [~] Transition sound (7 synthesized sounds, played in the slide show; not written to .pptx)
- [x] Duration
- [x] Apply To All
- [x] Advance Slide: On Mouse Click
- [x] Advance Slide: After (seconds)

## Animations tab

- [x] Preview (plays on the canvas)
- [x] Entrance effects: Appear, Fade, Fly In, Float In, Split, Wipe, Zoom, Grow & Turn, Bounce
- [x] Emphasis effects: Pulse, Spin, Grow/Shrink, Teeter, Blink
- [x] Exit effects: Disappear, Fade, Fly Out, Float Out, Zoom, Wipe
- [x] Motion paths: lines, arcs, turns, shapes, loops and custom drawn paths, effect options, reverse direction, draggable end point
- [x] Effect Options (direction)
- [x] Add Animation (several animations on one object)
- [x] Animation Pane: click numbers, start icons, timeline bars, drag to reorder, context menu, Play From/Play All
- [x] Triggers (on click of another object) and Animation Painter
- [x] Start: On Click, With Previous, After Previous
- [x] Duration and Delay
- [x] Reorder: Move Earlier / Move Later
- [x] Animation order numbers on the slide while the tab is open
- [~] Animate text By Paragraph (each paragraph on its own click, or one after another), By word and By letter; written to .pptx as paragraph builds. No animation sounds

## Slide Show tab

- [x] From Beginning (F5)
- [x] From Current Slide (Shift+F5)
- [~] Custom Slide Show (define, edit, copy, show) — no Present Online
- [x] Set Up Slide Show: loop until Esc, advance manually or using timings
- [x] Set Up Show: presented by a speaker, browsed by an individual (window), kiosk; all/range/custom show; loop; without animation; pen and laser colors
- [x] Hide Slide
- [x] Rehearse Timings (timer bar, keep timings prompt)
- [x] Use Timings
- [~] Show Media Controls (no recorded narrations or subtitles)
- [~] Presenter View in a second window (current/next slide, notes with zoom, timer, clock, slide navigator, pen, laser, black screen); falls back to this window when pop-ups are blocked; no monitor selection

### During the slide show
- [x] Full screen, slide scaled to fit
- [x] Next: click, Space, Enter, N, →, ↓, Page Down
- [x] Previous: Backspace, P, ←, ↑, Page Up
- [x] Number + Enter jumps to a slide; Home / End
- [x] B / W for black / white screen
- [x] Esc ends the show; end-of-show screen
- [x] Hidden slides skipped (unless started on one)
- [x] Transitions and animations play
- [x] Automatic advance with timings, loop
- [x] Right-click menu (next, previous, last viewed, go to slide, screens, laser pointer, end show)
- [x] Bottom-left toolbar
- [x] Laser pointer (Ctrl+L)
- [x] Mouse pointer hides when idle
- [x] Hyperlinks in text and on objects open
- [~] Pen, highlighter and eraser during the show, Erase All Ink, keep ink annotations as ink objects (no zoom into the slide)

### Reading View
- [x] Reading View in the window with navigation bar and menu

## Record tab

- [~] Record From Beginning / From Current Slide (records slide timings; no narration, camera or ink)
- [x] Rehearse Timings
- [x] Clear timings (current slide / all slides)
- [x] Use Timings
- [~] Export to Video (no screenshot or screen recording)

## Review tab

- [~] Spelling: browser spell check as you type (no spelling pane)
- [~] Thesaurus (Shift+F7, built-in English word list); no Smart Lookup or Translate
- [x] Check Accessibility: errors (missing slide titles, missing alternative text), warnings (duplicate titles, hard-to-read contrast, missing table header, merged cells, unclear link text) and tips (reading order); fixes: add a description, mark as decorative, use first row as header, sort by position
- [x] Language: set the proofing language (26 languages) used by the spell checker, shown in the status bar and written to files
- [x] New Comment, Delete (slide / presentation), Previous, Next, Show Comments
- [x] Comment threads: reply, resolve, delete
- [ ] Compare presentations
- [x] Hide Ink

## View tab

- [x] Normal
- [x] Outline View: edit titles and bullets, Enter/Tab/Shift+Tab promote and demote (bullets ↔ slides), collapse/expand
- [x] Slide Sorter
- [x] Notes Page
- [x] Reading View
- [~] Slide Master view drives the slides: master text styles, background and objects; per layout move/remove/insert placeholders, Title/Footers, rename, preserve, hide background graphics. Handout Master and Notes Master: slides per page, orientation, header, footer, date, page number, slide image, body (no extra layouts or several masters)
- [x] Ruler
- [x] Gridlines (snapping to the grid while visible)
- [x] Grid and Guides dialog (snap to grid, spacing, display grid, drawing guides, smart guides)
- [x] Guides: drag to move, drag off the slide to remove, add vertical/horizontal guides from the right-click menu; objects snap to them
- [x] Notes
- [x] Zoom dialog
- [x] Fit to Window
- [x] Color / Grayscale / Black and White
- [ ] New Window, Arrange All, Cascade, Switch Windows
- [ ] Macros

## Help tab

- [x] Help (keyboard shortcut reference)
- [x] Keyboard Shortcuts
- [x] About
- [ ] Feedback, training

## Shape Format tab (contextual)

- [x] Insert Shapes gallery
- [x] Edit Shape › Change Shape
- [x] Merge Shapes: union, combine, fragment, intersect, subtract
- [x] Edit Points: drag points and Bézier handles, add (double-click or Ctrl+click the outline; curves are split exactly), delete, Smooth/Straight/Corner Point, Straight/Curved Segment, open/close path; preset shapes keep their curves; Curve tool and smooth Scribble
- [x] Text Box
- [x] Shape Styles gallery (Quick Styles)
- [x] Shape Fill, Shape Outline, Shape Effects
- [x] WordArt Quick Styles
- [x] Text Fill
- [x] Text Outline
- [~] Text Effects (shadow only; no glow, reflection, 3-D, transform)
- [x] Alt Text
- [x] Arrange: Bring Forward / to Front, Send Backward / to Back, Selection Pane, Align, Group, Rotate/Flip
- [x] Size: height and width
- [x] Size & Position in the Format Shape pane (size, rotation, position)
- [x] Lock aspect ratio (Format pane checkbox, written to .pptx; pictures keep it on corner handles; Shift keeps it for shapes)

## Picture Format tab (contextual)

- [ ] Remove Background
- [x] Corrections (brightness/contrast presets)
- [~] Sharpen/Soften (5 presets; soften is written to .pptx as a blur, sharpening is shown here only)
- [x] Color: saturation presets, grayscale
- [~] Color tone (temperature presets, shown here only), recolor (grayscale, sepia, washout, black and white; written to .pptx) and Set Transparent Color (click a color; the picture is saved with transparency)
- [~] Artistic Effects (blur, pencil grayscale, photocopy, glow edges, paint strokes; not written to .pptx)
- [x] Transparency presets
- [x] Compress Pictures (330/220/150/96 ppi, delete cropped areas, this picture or all); large pictures are scaled to 220 ppi when inserted
- [x] Change Picture
- [x] Reset Picture
- [x] Picture Styles (9 presets)
- [x] Picture Border
- [x] Picture Effects
- [ ] Picture Layout
- [x] Alt Text
- [x] Arrange group
- [x] Crop (interactive handles)
- [x] Crop to Shape
- [x] Crop to aspect ratio (12 ratios), Fill, Fit
- [x] Size: height and width

## Format panes

- [x] Format Shape pane: fill (none, solid, gradient with stops, picture), line (color, transparency, width, dash, arrows), shadow (color, transparency, blur, distance, angle)
- [x] Format Shape pane: size & position, text box (vertical alignment, direction, autofit, margins, wrap, columns), alt text
- [x] Format Picture pane: border, shadow, brightness/contrast/saturation, transparency
- [x] Format Background pane
- [x] Selection Pane: list, select, rename, show/hide, show all/hide all, reorder
- [x] Comments pane

## Slide canvas and object editing

- [x] Click to select, Shift/Ctrl+click to add or remove
- [x] Marquee selection
- [x] Drag to move; Shift constrains direction; Ctrl+drag copies; Alt disables snapping
- [x] Smart guides (slide edges/center and other objects)
- [x] Resize with 8 handles; Shift keeps proportions; Ctrl resizes from the center
- [x] Resizing several selected objects at once
- [x] Rotation handle (Shift snaps to 15°)
- [x] Line end-point handles
- [x] Arrow keys nudge (Ctrl for fine steps, Shift for big steps)
- [x] Tab / Shift+Tab cycle through objects
- [~] Yellow adjustment handles for rounded rectangle, triangle, parallelogram and trapezoid
- [ ] Connectors that stay glued to shapes
- [x] Draw shapes by dragging (Shift for squares/circles/45° lines) or click for a default size
- [x] Drag and drop pictures onto the slide
- [x] Paste pictures and text (text becomes a text box)
- [x] Right-click menus for objects and the slide
- [x] Double-click or click into text to edit; typing on a selected shape replaces its text; F2
- [x] Enter on a selected shape edits all of its text
- [x] Zoom 10–400 %, fit slide to window
- [x] Rulers
- [x] Placeholders with "Click to add …" prompts and dashed outlines
- [x] Picture placeholder button
- [x] Autofit: shrink text on overflow
- [x] Autofit: resize shape to fit text (text boxes grow while typing)
- [x] Empty text boxes are removed when you click away
- [x] Objects partly off the slide stay visible and editable
- [x] Group / Ungroup (Ctrl+G / Ctrl+Shift+G), groups move, resize and rotate as one
- [x] Select single objects inside a group (second click), move, resize and edit their text
- [x] Undo / Redo for all changes (text editing has its own undo while typing)

## Text editing

- [x] Rich text in text boxes, placeholders and shapes
- [x] Formatting applies to the word at the cursor or to the selection, or to all text of selected shapes
- [x] Line break (Shift+Enter), tabs
- [x] Bullets and numbering with nine levels
- [x] Hyperlinks
- [x] Slide number and date fields
- [x] Superscript / subscript
- [x] Spell check as you type (browser)
- [x] AutoCorrect ((c) © (tm) ™ -- — -> → …), smart quotes and automatic bulleted/numbered lists while typing (switchable in Options)
- [x] Floating mini toolbar on selection

## Slide management

- [x] Thumbnail pane with live previews
- [x] Multi-select (Shift/Ctrl), drag to reorder
- [x] Context menu: cut, copy, paste, new, duplicate, delete, add section, layout, reset, format background, hide
- [x] Keyboard: Enter (new slide), Delete, Ctrl+D, arrows, Ctrl+Shift+arrows (move slides)
- [x] Copy and paste slides
- [x] Hidden slide marker, transition marker
- [x] Section labels
- [x] A presentation can have no slides ("Click to add first slide")

## Notes

- [x] Notes pane under the slide with resizable divider
- [~] Notes are plain text (no formatting)
- [x] Notes Page view
- [x] Print notes pages

## Status bar

- [x] Slide X of Y
- [x] Language
- [x] Notes and Comments toggles
- [x] Normal, Slide Sorter, Reading View, Slide Show buttons
- [x] Zoom slider, −/+ buttons, zoom percentage (opens Zoom dialog), fit to window
- [~] Accessibility status in the status bar (opens the checker); no display settings

## Keyboard shortcuts

- [x] Ctrl+N, Ctrl+O, Ctrl+S, Ctrl+P
- [x] Ctrl+M (new slide), Ctrl+D (duplicate)
- [x] Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z
- [x] Ctrl+X, Ctrl+C, Ctrl+V, Ctrl+A
- [x] Ctrl+G, Ctrl+Shift+G
- [x] Ctrl+B, Ctrl+I, Ctrl+U
- [x] Ctrl+E, Ctrl+L, Ctrl+R, Ctrl+J
- [x] Ctrl+Shift+> / <, Ctrl+] / [
- [x] Ctrl+T / Ctrl+Shift+F (Font dialog)
- [x] Ctrl+K (hyperlink), Ctrl+F (find), Ctrl+H (replace)
- [x] F5, Shift+F5, F2, Esc, Delete, arrows, Tab
- [x] Ctrl+Enter: next placeholder (a new slide after the last one)
- [x] F6 / Shift+F6: move between thumbnails, slide and notes
- [x] Alt key tips for the ribbon (Alt or F10, then letters; Esc steps back)

## File formats

- [x] .pptx export: slide size, theme fonts, backgrounds (solid, gradient, picture), notes, hidden slides
- [x] .pptx export: text (fonts, sizes, colors, bold/italic/underline/strike, super/subscript, highlight, spacing, caps, links, fields), paragraphs (alignment, levels, bullets, numbering, spacing), text box settings (insets, anchor, autofit, wrap, columns, direction)
- [x] .pptx export: preset shapes with adjustments, solid and gradient fills, lines with dashes and arrows, shadow/glow/soft edges/reflection, rotation and flips, ink as freeform shapes
- [x] .pptx export: pictures with crop, crop-to-shape, brightness/contrast, grayscale, transparency, border
- [x] .pptx export: transitions and timings
- [x] .pptx export: own package writer with a slide master, nine layouts with real placeholders (title, body, footers), theme, notes master and notes pages; slide placeholders linked to their layouts; date/footer/slide number placeholders
- [x] .pptx export: nested groups and diagrams as p:grpSp; tables as real tables; charts as real charts with embedded data (secondary axes, trendlines, label options); video/audio; animations as timing trees with paragraph builds; picture fills in shapes and backgrounds
- [x] .pptx package checked by unit tests (content types, relationships, unique shape ids, placeholder links, schema order of child elements)
- [~] .pptx export: 3-D transitions as their closest basic ones; zooms as linked frames; not yet opened in the original program
- [x] Exact round trip of files saved by Kontor Slides (model embedded in the file, ignored if the slides were changed elsewhere)
- [x] .pptx import: slide size, theme colors and fonts, placeholders with layout/master inheritance (position, text styles, body settings)
- [x] .pptx import: text runs and paragraphs with formatting, bullets and numbering
- [x] .pptx import: shapes (geometry, adjustments, fills, lines, style references, effects), pictures (crop, mask, adjustments), groups, connectors
- [x] .pptx import: backgrounds with inheritance, master and layout decoration shapes, notes, hidden slides, transitions and timings, headers/footers
- [~] .pptx import: tables (with styles, merges, borders) and charts become real objects; custom geometry becomes editable free-form shapes; SmartArt shows a placeholder box
- [~] .pptx import: animations (common presets, triggers, motion paths) and video/audio are read; EMF/WMF pictures are not
- [ ] .ppt, .odp import/export
- [x] PDF via the print dialog

## Phase 2 additions

### Layout and ribbon
- [x] Resizable slide thumbnail pane (about 15 % of the window by default, remembered)
- [x] Ribbon groups collapse into drop-down buttons from the right when the window is narrow
- [x] Status bar hides low-priority items instead of wrapping
- [x] Contextual tabs scroll into view

### Tables
- [x] Table Design: header/total/banded rows, first/last/banded columns, 37 own table styles in four families, Clear Table
- [x] Shading, Borders menu (all, outside, inside, each side, inside horizontal/vertical, none) with pen style, weight and color
- [x] Table effects (shadow, reflection), text fill and bold for cells
- [x] Layout: select cell/row/column/table, View Gridlines, insert above/below/left/right, delete rows/columns/table
- [x] Merge Cells, Split Cells dialog (undo merges or divide cells)
- [x] Cell size, Distribute Rows/Columns, cell alignment (horizontal and vertical), text direction, cell margins (presets and custom)
- [x] Table size with Lock Aspect Ratio, Arrange
- [x] Click into cells to type, drag or Shift+click to select cells, Tab/Shift+Tab between cells (Tab in the last cell adds a row), Delete clears cells
- [x] Home tab formatting applies to the selected cells
- [x] Rows grow with their text; resizing the frame scales columns and rows
- [x] Content placeholder insert icons (table, chart, diagram, picture, icon, video)

### Charts
- [x] Insert Chart dialog with type list and variants; Change Chart Type
- [x] Data sheet (edit, paste from a spreadsheet, add/delete rows and series), live update
- [x] Add Chart Element: axes, axis titles, chart title, data labels, gridlines, legend position, smooth lines, markers
- [x] Quick Layout (6), Change Colors (10 palettes), Chart Styles (8)
- [x] Switch Row/Column
- [x] Format: series fill, chart area fill/outline, axis minimum/maximum, chart title text, size, arrange
- [x] Secondary axis per series (Format › Secondary Axis), secondary axis title
- [x] Trendlines: linear, exponential, logarithmic, polynomial, power, moving average, forecast, equation and R² on the chart
- [x] Data label positions (center, inside end/base, outside end, best fit, above/below/left/right) and contents (value, category, series, percentage)
- [~] Error bars (fixed, percentage, standard deviation, standard error) and 3-D column, bar and pie charts are available; stock, surface, radar and treemap charts are not

### Diagrams
- [x] Choose a Diagram dialog with categories, previews and descriptions
- [x] Text pane: Enter adds, Tab/Shift+Tab demote/promote, Backspace removes, arrow keys move
- [x] Add Shape after/before/above/below, Promote, Demote, Move Up/Down
- [x] Layout gallery, Change Colors (17 schemes), Diagram Styles (6), Reset Graphic
- [x] Convert to Shapes / Convert to Text
- [~] Single shapes inside a diagram cannot be formatted separately

### Animations
- [x] 14 entrance, 11 emphasis, 12 exit effects plus motion paths; several effects per object
- [x] Effect Options dialog: direction, start, delay, duration, repeat, trigger
- [x] Click numbers and motion paths shown on the slide while the Animations tab is open

### Slide show
- [x] Alt+F5 starts with Presenter View; Use Presenter View option
- [x] Ctrl+P / Ctrl+I / Ctrl+E / Ctrl+A switch pen, highlighter, eraser and arrow; E erases the slide's ink

## Phase 3 (QA pass)

Not counted in the coverage line: these are fixes and speed-ups, not features of the original.

### Fixed
- Undo after typing: a command used while text was being edited (insert, new slide …) no longer merges everything since then into one undo step
- Ctrl+Enter moves to the next placeholder instead of inserting a line break
- Pasted placeholders become text boxes with the same look when the slide already has (or its layout lacks) that placeholder
- "Shrink text on overflow" first reduces line spacing (10–20 %) and then scales the font in 2.5 % steps, like the original
- Empty bullet paragraphs show their bullet only while editing
- The thumbnail pane follows the window width until it is resized by hand
- Very large pictures no longer bloat files and AutoSave

### Performance
- The text editor, dialogs, backstage, slide show, printing, outline view and ribbon tabs other than Home load on demand (prefetched when idle): startup JavaScript went from about 1 MB to about 580 kB
- Thumbnails update at low priority, so dragging among 100 objects stays within a frame
