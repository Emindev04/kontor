import type { Editor } from '@tiptap/core'
import { PARAGRAPH_SPACING, themeColors, themeFonts, type PageDesign } from '../pageSetup'

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** "Web Page (.html)": the document body with a small stylesheet so it looks like the editor. */
export function exportHtml(editor: Editor, title: string, design: PageDesign) {
  const fonts = themeFonts(design)
  const colors = themeColors(design)
  const spacing = PARAGRAPH_SPACING[design.paragraphSpacing] ?? PARAGRAPH_SPACING.default
  const css = `
    :root { --single-line: 1.22; }
    body { max-width: 6.5in; margin: 1in auto; padding: 0 16px; font: 11pt/${(1.22 * spacing.line).toFixed(3)} '${fonts.body}', Carlito, Arial, sans-serif; color: #000; background: ${design.pageColor ?? '#fff'}; }
    p { margin: 0 0 ${spacing.after}pt; }
    h1, h2, h3, h4, h5, h6 { font-family: '${fonts.heading}', '${fonts.body}', Arial, sans-serif; font-weight: normal; color: ${colors.heading}; margin: 12pt 0 0; }
    h1 { font-size: 16pt; } h2 { font-size: 13pt; margin-top: 2pt; } h3 { font-size: 12pt; color: ${colors.headingDark}; margin-top: 2pt; }
    h4 { font-size: 11pt; font-style: italic; } h5, h6 { font-size: 11pt; }
    p[data-style="title"] { font: 28pt/1.2 '${fonts.heading}', Arial, sans-serif; letter-spacing: -0.5pt; margin: 0; }
    p[data-style="subtitle"] { color: #5a5a5a; letter-spacing: 0.75pt; }
    p[data-style="quote"] { font-style: italic; color: #404040; text-align: center; margin: 10pt 0.6in 8pt; }
    p[data-style="intenseQuote"] { font-style: italic; color: ${colors.accent}; text-align: center; border-block: 1px solid ${colors.accent}; padding: 10pt 0; margin: 18pt 0.6in; }
    p[data-style="noSpacing"] { margin: 0; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 8pt; }
    td, th { border: 1px solid #000; padding: 0 0.08in; vertical-align: top; text-align: left; font-weight: normal; }
    table[data-table-style="plain"] td, table[data-table-style="plain"] th { border-color: transparent; }
    td p, th p { margin: 0; }
    img { max-width: 100%; height: auto; }
    .field, .merge-field { font: inherit; }
    .page-break { break-after: page; }
    .toc-entry { display: flex; gap: 4px; margin: 0 0 4pt; } .toc-text { flex: 0 1 auto; } .toc-page { margin-left: auto; }
  `
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<style>${css}</style>
</head>
<body>
${editor.getHTML()}
</body>
</html>
`
}
