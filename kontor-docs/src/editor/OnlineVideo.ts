import { Node, mergeAttributes } from '@tiptap/core'
import { DrawingView, drawingAttributes, wrapStyle, type DrawingRenderer } from './Drawing'
import { t } from '../i18n'

// Insert › Online Video: a YouTube or Vimeo video embedded in the page. It plays in Read Mode and
// opens in a new tab on double-click; .docx files get a link to it.

/** The embeddable address for a video page, or null when the site is not supported. */
export function embedUrl(url: string): string | null {
  try {
    const u = new URL(url.trim())
    const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '')
    if (host === 'youtu.be') return `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}`
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      const id = u.searchParams.get('v') ?? u.pathname.match(/\/(?:embed|shorts|live)\/([\w-]+)/)?.[1]
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null
    }
    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      const id = u.pathname.match(/(\d+)/)?.[1]
      return id ? `https://player.vimeo.com/video/${id}` : null
    }
  } catch {
    // Not a web address.
  }
  return null
}

const renderVideo: DrawingRenderer = (node, box, { width, height }) => {
  box.className = 'drawing-box video-box'
  let frame = box.querySelector('iframe')
  if (!frame) {
    frame = document.createElement('iframe')
    frame.allow = 'encrypted-media; picture-in-picture; fullscreen'
    frame.setAttribute('allowfullscreen', '')
    frame.title = t('Online video')
    box.appendChild(frame)
    const badge = document.createElement('span')
    badge.className = 'video-badge'
    badge.textContent = '▶ ' + t('Online video — double-click to open')
    box.appendChild(badge)
  }
  if (frame.src !== node.attrs.src) frame.src = node.attrs.src
  frame.width = String(width)
  frame.height = String(height)
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    onlineVideo: {
      insertOnlineVideo: (url: string) => ReturnType
    }
  }
}

export const OnlineVideo = Node.create({
  name: 'onlineVideo',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      ...drawingAttributes({ width: 480, height: 270, wrap: 'inline' }),
      src: { default: '', parseHTML: (el) => el.getAttribute('data-src') ?? '', renderHTML: (a) => ({ 'data-src': a.src }) },
      url: { default: '', parseHTML: (el) => el.getAttribute('data-url') ?? '', renderHTML: (a) => ({ 'data-url': a.url }) },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-type="online-video"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { 'data-type': 'online-video', class: 'drawing video-static', style: `${wrapStyle(node.attrs)}; display: inline-block; width: ${node.attrs.width}px; height: ${node.attrs.height}px` }),
      ['a', { href: node.attrs.url, target: '_blank', rel: 'noopener' }, `▶ ${node.attrs.url}`],
    ]
  },

  addNodeView() {
    return ({ node, view, getPos }) =>
      new DrawingView(node, view, getPos as () => number | undefined, renderVideo, {
        className: 'online-video',
        onDoubleClick: (n) => void window.open(n.attrs.url, '_blank', 'noopener'),
      })
  },

  addCommands() {
    return {
      insertOnlineVideo:
        (url) =>
        ({ commands }) => {
          const src = embedUrl(url)
          return src ? commands.insertContent({ type: this.name, attrs: { src, url: url.trim() } }) : false
        },
    }
  },
})
