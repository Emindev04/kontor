# Kontor Slides

A free presentation program that runs in the browser. It looks and works like the desktop presentation programs people already know: a ribbon with Home, Insert, Draw, Design, Transitions, Animations, Slide Show, Record, Review, View and Help, a slide thumbnail pane, a notes pane, a full-screen slide show and .pptx files.

Kontor Slides is part of the Kontor suite (with Kontor Docs and Kontor Sheets). Each app lives in its own folder and can be used on its own.

## Features

- Slides with 9 layouts and placeholders, 11 original themes with 4 color variants each, 16:9, 4:3 and custom slide sizes
- Text boxes, 119 shapes, Curve, Freeform and Scribble drawing, Edit Points with Bézier handles and smooth/straight/corner points, pictures (compressed to 220 ppi on insert), Photo Album, icons, WordArt and freehand ink
- Rich text: fonts, sizes, colors, highlight, bullets and numbering with levels (Bullets and Numbering dialog with size, color and start number), distributed alignment, stacked text, line spacing, columns with spacing, autofit; AutoCorrect, smart quotes and automatic lists while typing; floating mini toolbar; thesaurus
- Fill (solid, gradient, picture, 52 patterns), outline, shadow, glow, soft edges, reflection, quick styles; picture corrections, sharpen/soften, color tone, recolor, Set Transparent Color, artistic effects, crop to shape and aspect ratio, Fill and Fit
- Smart guides, draggable drawing guides, Grid and Guides settings with snap to grid, alignment, distribution, grouping, z-order, rotation, lock aspect ratio, multi-select, undo/redo
- Tables with styles, borders, shading, merge/split and cell editing; charts (column, bar, line, pie, doughnut, area, scatter, combo, 3-D column/bar/pie) with a data sheet, secondary axes, trendlines, error bars and data label options; diagrams (lists, processes, cycles, hierarchies, Venn, matrix, pyramid) with a text pane
- Video and audio with trimming, poster frames and playback options; slide, section and summary zooms; action buttons and links to slides
- 27 transitions including Morph, with transition sounds; entrance, emphasis, exit and motion-path animations with several effects per object, text by paragraph, word or letter, Animation Pane, triggers and Animation Painter
- Slide show with presenter view (second window), pen/highlighter ink, laser pointer, custom shows, kiosk mode, Reading View and rehearsed timings
- Normal, Outline, Slide Sorter, Notes Page, Slide Master, Handout Master and Notes Master views
- Comments, Selection Pane, Find/Replace, Replace Fonts, Reuse Slides, Merge Shapes, adjustment handles, proofing language, accessibility checker with fixes and a status-bar indicator, Inspect Presentation
- Theme colors and fonts can be customized; sections collapse, expand and move; a presentation can have no slides
- Ribbon that scales down group by group in narrow windows, KeyTips (Alt or F10), customizable Quick Access Toolbar, Options and Account pages, Recent presentations
- Open and save .pptx files with a real slide master, layouts and placeholders (tables, charts, groups, media and animations are written as real objects); print (full slides, notes pages, handouts, outline), download a PDF (with selectable text), export slides as PNG/JPEG pictures, create a video (MP4/WebM) or an animated GIF
- Automatic saving in the browser

See [FEATURES.md](FEATURES.md) for the full checklist, including what is not done yet.

## Known limitations

- Exported .pptx files are checked against the Open XML rules by tests but have not been opened in the original desktop program yet.
- No stock, surface, radar or treemap charts; diagrams are written to .pptx as grouped shapes (not SmartArt).
- The PDF download contains the slides as pictures with an invisible text layer (text can be selected and searched; characters outside the Latin set become "?").
- Videos are recorded in real time and show animations in their end state. Transition sounds, color tone, sharpening and artistic effects are not written to .pptx.
- Inserted slides from Reuse Slides take this presentation's design (no "Keep source formatting").
- Spell check uses the browser's dictionaries.

## Getting started

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Then open the address Vite prints (for example http://localhost:5173). In the Kontor suite repository the app runs on port 5176 (`npm run dev -- --port 5176`).

Other scripts:

```bash
npm run build    # type-check and build into dist/
npm run preview  # serve the production build
npm test         # unit tests (Vitest)
```

## Project structure

```
src/
  brand.ts          app name (rename the product here)
  model/            presentation data model, themes, layouts, shape geometry, rich text, effects
  store/            app state, undo history and actions
  render/           one renderer for the canvas, thumbnails, slide show and printing
  editor/           slide canvas (selection, move, resize, rotate, drawing) and the text editor
  components/       title bar, ribbon tabs, panes, dialogs, backstage, slide show, views
  io/               .pptx writer and reader (package, DrawingML, charts, timing), pictures/PDF export, browser storage
```

- Coordinates are CSS pixels at 96 dpi on the slide (a 16:9 slide is 1280 × 720), font sizes are points.
- Colors can reference theme slots (`theme:accent1:l40`), so changing the theme recolors the presentation.
- Text is stored as ProseMirror JSON and edited with TipTap; the same styling code renders static text.
- .pptx files are written by our own Open XML package writer (`src/io/pptxExport.ts`): theme, slide master, nine layouts with placeholders, slides, notes and media. `src/io/pptxExport.test.ts` checks content types, relationships, shape ids, placeholder links and the schema order of child elements. Files saved by Kontor Slides also carry the model itself (pictures are stored once), so they reopen exactly.
- The text editor, dialogs, slide show and most ribbon tabs load on demand, so the editor starts quickly.

## Licenses of dependencies

React, TipTap, JSZip, html-to-image, polygon-clipping, gifenc, lucide-react, Vite and (for tests) Vitest and @xmldom/xmldom are MIT/ISC licensed (polygon-clipping depends on robust-predicates, which is public domain under the Unlicense). The bundled fonts (Carlito, Caladea, Lato, Montserrat, Merriweather, Open Sans, Playfair Display) use the SIL Open Font License.

Kontor Slides is an independent project. It is not affiliated with or endorsed by any maker of other presentation software; product and file format names are used only to describe compatibility.
