import { useEffect } from 'react'
import { MenuList, Popup, type MenuItem } from './ui'

export function ContextMenu({ x, y, items, onClose, children, top }: { x: number; y: number; items?: MenuItem[]; onClose: () => void; children?: React.ReactNode; top?: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onClose)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])
  return (
    <>
      <div className="ctx-backdrop" onMouseDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />
      <Popup point={{ x, y }} role="menu" className="ctx-menu">
        {top}
        {top && <div className="menu-sep" />}
        {items && <MenuList items={items} close={onClose} />}
        {children}
      </Popup>
    </>
  )
}
