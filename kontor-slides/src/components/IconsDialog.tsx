import { useState } from 'react'
import * as Icons from 'lucide-react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as A from '../store/actions'
import { Modal } from './ui'
import { t } from '../i18n'

// Loaded on demand: the full icon set is large.
const ICON_NAMES = [
  'Heart', 'Star', 'House', 'User', 'Users', 'Mail', 'Phone', 'Calendar', 'Clock', 'MapPin', 'Globe', 'Camera', 'Image', 'Music', 'Video', 'Mic', 'Bell', 'Bookmark', 'Book', 'BookOpen',
  'Briefcase', 'Building2', 'Car', 'Plane', 'Train', 'Bike', 'Ship', 'Truck', 'Cloud', 'Sun', 'Moon', 'Umbrella', 'Snowflake', 'Flame', 'Leaf', 'TreePine', 'Flower2', 'Coffee', 'Pizza', 'Apple',
  'ShoppingCart', 'CreditCard', 'DollarSign', 'Euro', 'PiggyBank', 'ChartBar', 'ChartPie', 'ChartLine', 'TrendingUp', 'TrendingDown', 'Target', 'Trophy', 'Award', 'Medal', 'Flag', 'Rocket', 'Lightbulb',
  'Puzzle', 'Gift', 'Key', 'Lock', 'LockOpen', 'Shield', 'ShieldCheck', 'Check', 'CircleCheck', 'X', 'CircleX', 'TriangleAlert', 'Info', 'CircleHelp', 'Search', 'Settings', 'Wrench', 'Hammer',
  'Laptop', 'Monitor', 'Smartphone', 'Tablet', 'Printer', 'Server', 'Database', 'Wifi', 'Cpu', 'Code', 'Terminal', 'MessageCircle', 'MessageSquare', 'Send', 'Share2', 'Link', 'Paperclip', 'FileText',
  'Folder', 'Clipboard', 'Pencil', 'PenTool', 'Palette', 'Brush', 'Scissors', 'Smile', 'Frown', 'ThumbsUp', 'ThumbsDown', 'Handshake', 'GraduationCap', 'School', 'Stethoscope', 'Pill', 'Activity',
  'ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'RefreshCw', 'Repeat', 'Zap', 'Battery', 'Plug', 'Recycle', 'Infinity',
]

export default function IconsDialog({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('')
  const lib = Icons as unknown as Record<string, Icons.LucideIcon | undefined>
  const names = ICON_NAMES.filter((n) => lib[n] && n.toLowerCase().includes(q.toLowerCase()))
  const insert = async (name: string) => {
    const Icon = lib[name]
    if (!Icon) return
    const svg = renderToStaticMarkup(<Icon size={96} color="#000000" strokeWidth={1.75} xmlns="http://www.w3.org/2000/svg" />)
    const file = new File([svg], `${name}.svg`, { type: 'image/svg+xml' })
    await A.insertImageFile(file)
    A.updateSelected((e) => (e.type === 'image' ? { ...e, name: `Graphic ${name}`, alt: name.replace(/([a-z])([A-Z0-9])/g, '$1 $2').toLowerCase() } : e))
    onClose()
  }
  return (
    <Modal
      title={t('Insert Icons')}
      width={620}
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            {t('Cancel')}
          </button>
        </>
      }
    >
      <input className="icon-search" autoFocus placeholder={t('Search icons')} aria-label={t('Search icons')} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="icon-grid">
        {names.map((n) => {
          const Icon = lib[n]!
          return (
            <button key={n} type="button" title={n} aria-label={n} onClick={() => insert(n)}>
              <Icon size={28} strokeWidth={1.6} />
            </button>
          )
        })}
      </div>
    </Modal>
  )
}

