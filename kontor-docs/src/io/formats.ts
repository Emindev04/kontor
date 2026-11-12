import JSZip from 'jszip'
import type { JSONContent } from '@tiptap/core'

// Other file formats: Markdown (open and save), OpenDocument Text (open and save) and Rich Text
// Format (open and save, see rtf.ts). They keep the structure and basic character formatting.

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const has = (n: JSONContent, type: string) => !!n.marks?.some((m) => m.type === type)

// ---- Markdown ----

function mdInline(nodes: JSONContent[] = []): string {
  return nodes
    .map((n) => {
      if (n.type === 'hardBreak') return '  \n'
      if (n.type === 'image') return `![${n.attrs?.alt ?? ''}](${n.attrs?.src ?? ''})`
      if (n.type !== 'text') return ''
      if (n.marks?.some((m) => m.type === 'deletion')) return ''
      let t = (n.text ?? '').replace(/([*_`[\]\\])/g, '\\$1')
      if (has(n, 'code')) t = `\`${n.text}\``
      if (has(n, 'bold')) t = `**${t}**`
      if (has(n, 'italic')) t = `*${t}*`
      if (has(n, 'strike')) t = `~~${t}~~`
      const link = n.marks?.find((m) => m.type === 'link')
      if (link) t = `[${t}](${link.attrs?.href})`
      return t
    })
    .join('')
}

function mdBlocks(nodes: JSONContent[] = [], indent = ''): string[] {
  const out: string[] = []
  for (const n of nodes) {
    switch (n.type) {
      case 'heading':
        out.push(`${'#'.repeat(n.attrs?.level ?? 1)} ${mdInline(n.content)}`)
        break
      case 'paragraph':
        out.push(indent + mdInline(n.content))
        break
      case 'blockquote':
        out.push(...mdBlocks(n.content).map((l) => `> ${l}`))
        break
      case 'bulletList':
      case 'orderedList':
        ;(n.content ?? []).forEach((item, i) => {
          const marker = n.type === 'orderedList' ? `${(n.attrs?.start ?? 1) + i}.` : '-'
          const [first, ...rest] = mdBlocks(item.content, `${indent}   `)
          out.push(`${indent}${marker} ${(first ?? '').trimStart()}`, ...rest)
        })
        if (!indent) out.push('')
        continue
      case 'horizontalRule':
        out.push('---')
        break
      case 'table': {
        const rows = (n.content ?? []).map((r) => (r.content ?? []).map((c) => mdInline((c.content ?? []).flatMap((p) => p.content ?? [])).replace(/\|/g, '\\|')))
        if (!rows.length) break
        out.push(`| ${rows[0].join(' | ')} |`, `| ${rows[0].map(() => '---').join(' | ')} |`, ...rows.slice(1).map((r) => `| ${r.join(' | ')} |`))
        break
      }
      case 'pageBreak':
      case 'sectionBreak':
        out.push('\n---\n')
        break
      case 'columns':
      case 'textBox':
        out.push(...mdBlocks(n.content, indent))
        continue
    }
    if (!indent) out.push('')
  }
  return out
}

export function exportMarkdown(doc: JSONContent) {
  return mdBlocks(doc.content).join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

function mdInlineToHtml(s: string) {
  return esc(s)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1">')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_m, a, b) => `<strong>${a ?? b}</strong>`)
    .replace(/\*([^*]+)\*|_([^_]+)_/g, (_m, a, b) => `<em>${a ?? b}</em>`)
    .replace(/~~([^~]+)~~/g, '<s>$1</s>')
    .replace(/\\([*_`[\]\\])/g, '$1')
}

/** Markdown to HTML for the editor (headings, lists, quotes, tables, emphasis, links, pictures). */
export function importMarkdown(md: string) {
  const lines = md.replace(/\r\n?/g, '\n').split('\n')
  const html: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      html.push(`<h${h[1].length}>${mdInlineToHtml(h[2])}</h${h[1].length}>`)
      i++
      continue
    }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      html.push('<hr>')
      i++
      continue
    }
    if (/^>\s?/.test(line)) {
      const quote: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^>\s?/, ''))
      html.push(`<blockquote>${importMarkdown(quote.join('\n'))}</blockquote>`)
      continue
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d/.test(line)
      const items: string[] = []
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*+]|\d+[.)])\s+/, ''))
      html.push(`<${ordered ? 'ol' : 'ul'}>${items.map((t) => `<li><p>${mdInlineToHtml(t)}</p></li>`).join('')}</${ordered ? 'ol' : 'ul'}>`)
      continue
    }
    if (/^\|.*\|\s*$/.test(line) && /^\|?\s*:?-{3,}/.test(lines[i + 1] ?? '')) {
      const rows: string[][] = []
      const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim())
      rows.push(cells(line))
      i += 2
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]))
      html.push(`<table>${rows.map((r, ri) => `<tr>${r.map((c) => (ri === 0 ? `<th><p>${mdInlineToHtml(c)}</p></th>` : `<td><p>${mdInlineToHtml(c)}</p></td>`)).join('')}</tr>`).join('')}</table>`)
      continue
    }
    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|>|\s*([-*+]|\d+[.)])\s|\|)/.test(lines[i])) para.push(lines[i++])
    html.push(`<p>${para.map(mdInlineToHtml).join('<br>')}</p>`)
  }
  return html.join('')
}

// ---- OpenDocument Text ----

function odtInline(nodes: JSONContent[] = []): string {
  return nodes
    .map((n) => {
      if (n.type === 'hardBreak') return '<text:line-break/>'
      if (n.type !== 'text' || n.marks?.some((m) => m.type === 'deletion')) return ''
      const style = [has(n, 'bold') && 'B', has(n, 'italic') && 'I', has(n, 'underline') && 'U', has(n, 'strike') && 'S'].filter(Boolean).join('')
      const text = esc(n.text ?? '')
        .replace(/\t/g, '<text:tab/>')
        .replace(/ {2,}/g, (m) => ` <text:s text:c="${m.length - 1}"/>`)
      const link = n.marks?.find((m) => m.type === 'link')
      const span = style ? `<text:span text:style-name="T${style}">${text}</text:span>` : text
      return link ? `<text:a xlink:type="simple" xlink:href="${esc(link.attrs?.href ?? '')}">${span}</text:a>` : span
    })
    .join('')
}

function odtBlocks(nodes: JSONContent[] = []): string {
  return nodes
    .map((n) => {
      const align = n.attrs?.textAlign && n.attrs.textAlign !== 'left' ? `P${n.attrs.textAlign[0].toUpperCase()}` : 'Standard'
      switch (n.type) {
        case 'heading':
          return `<text:h text:style-name="Heading_20_${n.attrs?.level ?? 1}" text:outline-level="${n.attrs?.level ?? 1}">${odtInline(n.content)}</text:h>`
        case 'paragraph':
          return `<text:p text:style-name="${align}">${odtInline(n.content)}</text:p>`
        case 'bulletList':
        case 'orderedList':
          return `<text:list text:style-name="${n.type === 'orderedList' ? 'LNum' : 'LBul'}">${(n.content ?? []).map((item) => `<text:list-item>${odtBlocks(item.content)}</text:list-item>`).join('')}</text:list>`
        case 'blockquote':
        case 'columns':
        case 'textBox':
          return odtBlocks(n.content)
        case 'table': {
          const cols = Math.max(1, ...(n.content ?? []).map((r) => r.content?.length ?? 0))
          return `<table:table><table:table-column table:number-columns-repeated="${cols}"/>${(n.content ?? []).map((r) => `<table:table-row>${(r.content ?? []).map((c) => `<table:table-cell office:value-type="string">${odtBlocks(c.content)}</table:table-cell>`).join('')}</table:table-row>`).join('')}</table:table>`
        }
        case 'pageBreak':
          return '<text:p text:style-name="PBreak"/>'
        default:
          return ''
      }
    })
    .join('')
}

export async function exportOdt(doc: JSONContent, title: string) {
  const zip = new JSZip()
  zip.file('mimetype', 'application/vnd.oasis.opendocument.text', { compression: 'STORE' })
  zip.file(
    'META-INF/manifest.xml',
    `<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/></manifest:manifest>`,
  )
  zip.file('meta.xml', `<?xml version="1.0" encoding="UTF-8"?><office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" office:version="1.2"><office:meta><dc:title>${esc(title)}</dc:title></office:meta></office:document-meta>`)
  const spans = ['B', 'I', 'U', 'S', 'BI', 'BU', 'BS', 'IU', 'IS', 'US', 'BIU', 'BIS', 'BUS', 'IUS', 'BIUS']
    .map((k) => `<style:style style:name="T${k}" style:family="text"><style:text-properties${k.includes('B') ? ' fo:font-weight="bold"' : ''}${k.includes('I') ? ' fo:font-style="italic"' : ''}${k.includes('U') ? ' style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"' : ''}${k.includes('S') ? ' style:text-line-through-style="solid"' : ''}/></style:style>`)
    .join('')
  const paras = ['C', 'R', 'J']
    .map((k) => `<style:style style:name="P${k}" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:text-align="${{ C: 'center', R: 'end', J: 'justify' }[k]}"/></style:style>`)
    .join('')
  const headings = [1, 2, 3, 4, 5, 6].map((l) => `<style:style style:name="Heading_20_${l}" style:display-name="Heading ${l}" style:family="paragraph"><style:text-properties fo:font-size="${[16, 13, 12, 11, 11, 11][l - 1]}pt" fo:color="#2F5496"/></style:style>`).join('')
  zip.file(
    'content.xml',
    `<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" office:version="1.2"><office:automatic-styles>${spans}${paras}${headings}<style:style style:name="PBreak" style:family="paragraph"><style:paragraph-properties fo:break-after="page"/></style:style><text:list-style style:name="LBul"><text:list-level-style-bullet text:level="1" text:bullet-char="•"/></text:list-style><text:list-style style:name="LNum"><text:list-level-style-number text:level="1" style:num-format="1" style:num-suffix="."/></text:list-style></office:automatic-styles><office:body><office:text>${odtBlocks(doc.content)}</office:text></office:body></office:document-content>`,
  )
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.oasis.opendocument.text' })
}

const TEXT_NS = 'urn:oasis:names:tc:opendocument:xmlns:text:1.0'
const STYLE_NS = 'urn:oasis:names:tc:opendocument:xmlns:style:1.0'
const FO_NS = 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0'

/** OpenDocument Text to HTML (headings, paragraphs, lists, tables, bold/italic/underline). */
export async function importOdt(file: Blob) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const xml = new DOMParser().parseFromString((await zip.file('content.xml')?.async('string')) ?? '', 'application/xml')
  const styles = new Map<string, string[]>()
  for (const s of Array.from(xml.getElementsByTagNameNS(STYLE_NS, 'style'))) {
    const t = s.getElementsByTagNameNS(STYLE_NS, 'text-properties')[0]
    const p = s.getElementsByTagNameNS(STYLE_NS, 'paragraph-properties')[0]
    const tags: string[] = []
    if (t?.getAttributeNS(FO_NS, 'font-weight') === 'bold') tags.push('strong')
    if (t?.getAttributeNS(FO_NS, 'font-style') === 'italic') tags.push('em')
    if (t && t.getAttributeNS(STYLE_NS, 'text-underline-style') && t.getAttributeNS(STYLE_NS, 'text-underline-style') !== 'none') tags.push('u')
    const align = p?.getAttributeNS(FO_NS, 'text-align')
    if (align) tags.push(`align:${align === 'end' ? 'right' : align === 'start' ? 'left' : align}`)
    styles.set(s.getAttributeNS(STYLE_NS, 'name') ?? '', tags)
  }
  const inline = (el: Element): string =>
    Array.from(el.childNodes)
      .map((c) => {
        if (c.nodeType === 3) return esc(c.textContent ?? '')
        const e = c as Element
        switch (e.localName) {
          case 's': return ' '.repeat(Number(e.getAttributeNS(TEXT_NS, 'c') ?? 1))
          case 'tab': return '\t'
          case 'line-break': return '<br>'
          case 'a': return `<a href="${esc(e.getAttribute('xlink:href') ?? '')}">${inline(e)}</a>`
          case 'span': {
            const tags = (styles.get(e.getAttributeNS(TEXT_NS, 'style-name') ?? '') ?? []).filter((t) => !t.startsWith('align:'))
            return tags.reduce((acc, t) => `<${t}>${acc}</${t}>`, inline(e))
          }
          default: return inline(e)
        }
      })
      .join('')
  const block = (el: Element): string =>
    Array.from(el.children)
      .map((e) => {
        const align = (styles.get(e.getAttributeNS(TEXT_NS, 'style-name') ?? '') ?? []).find((t) => t.startsWith('align:'))?.slice(6)
        const style = align ? ` style="text-align:${align}"` : ''
        switch (e.localName) {
          case 'h': {
            const level = Math.min(6, Number(e.getAttributeNS(TEXT_NS, 'outline-level') ?? 1))
            return `<h${level}${style}>${inline(e)}</h${level}>`
          }
          case 'p': return `<p${style}>${inline(e)}</p>`
          case 'list': {
            const ordered = /num/i.test(e.getAttributeNS(TEXT_NS, 'style-name') ?? '')
            return `<${ordered ? 'ol' : 'ul'}>${Array.from(e.children).map((li) => `<li>${block(li)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`
          }
          case 'table': return `<table>${Array.from(e.getElementsByTagNameNS('urn:oasis:names:tc:opendocument:xmlns:table:1.0', 'table-row')).map((r) => `<tr>${Array.from(r.children).filter((c) => c.localName === 'table-cell').map((c) => `<td>${block(c) || '<p></p>'}</td>`).join('')}</tr>`).join('')}</table>`
          case 'section': return block(e)
          default: return ''
        }
      })
      .join('')
  const text = xml.getElementsByTagNameNS('urn:oasis:names:tc:opendocument:xmlns:office:1.0', 'text')[0]
  return text ? block(text) : ''
}

// ---- Rich Text Format ----

export { exportRtf, importRtf } from './rtf'
