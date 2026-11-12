import {
  AppWindow, ArrowDownUp, BookOpen, Columns2, Eye, FileText, Globe, ListTree, Maximize2, Moon, MoveHorizontal, NotebookPen, Search, ZoomIn, ZoomOut,
} from 'lucide-react'
import { CheckItem, MenuButton, RibbonButton, RibbonGroup } from '../ui'
import type { TabProps } from './types'

const ZOOMS = [500, 200, 150, 125, 100, 90, 75, 50, 25]

export function ViewTab({ app }: TabProps) {
  return (
    <>
      <RibbonGroup label="Views" priority={4}>
        <RibbonButton large icon={BookOpen} label="Read Mode" active={app.viewMode === 'read'} onClick={() => app.setViewMode('read')} />
        <RibbonButton large icon={FileText} label="Print Layout" active={app.viewMode === 'print'} onClick={() => app.setViewMode('print')} />
        <RibbonButton large icon={Globe} label="Web Layout" active={app.viewMode === 'web'} onClick={() => app.setViewMode('web')} />
        <div className="col">
          <RibbonButton icon={ListTree} label="Outline" showLabel active={app.viewMode === 'outline'} onClick={() => app.setViewMode('outline')} />
          <RibbonButton icon={NotebookPen} label="Draft" showLabel active={app.viewMode === 'draft'} onClick={() => app.setViewMode('draft')} />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Immersive" priority={1}>
        <RibbonButton large icon={Eye} label="Focus" title="Hide the ribbon and status bar to focus on your writing" onClick={() => app.setFocusMode(true)} />
        <RibbonButton large icon={BookOpen} label="Immersive Reader" title="Read with adjustable column width, page color, text spacing and line focus" onClick={() => app.setViewMode('read')} />
      </RibbonGroup>
      <RibbonGroup label="Page Movement" priority={0}>
        <RibbonButton large icon={ArrowDownUp} label="Vertical" active={!app.overview} title="Scroll pages up and down" onClick={() => app.setOverview(null)} />
        <RibbonButton large icon={Columns2} label="Side to Side" active={app.overview === 'sideBySide'} title="See pages side by side; click one to edit it" onClick={() => app.setOverview('sideBySide')} />
      </RibbonGroup>
      <RibbonGroup label="Show" priority={3}>
        <div className="col checks">
          <CheckItem label="Ruler" checked={app.showRuler} onChange={app.setShowRuler} />
          <CheckItem label="Gridlines" checked={app.showGridlines} onChange={app.setShowGridlines} />
          <CheckItem label="Navigation Pane" checked={app.showNavigation} onChange={app.setShowNavigation} />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Zoom" priority={2}>
        <MenuButton
          large
          icon={Search}
          label="Zoom"
          items={[
            ...ZOOMS.map((z) => ({ label: `${z}%`, active: app.zoom === z, onClick: () => app.setZoom(z) })),
            'separator' as const,
            { label: 'Page width', onClick: app.fitWidth },
            { label: 'Whole page', onClick: app.fitPage },
          ]}
        />
        <RibbonButton large icon={Search} label="100%" title="Zoom to 100%" onClick={() => app.setZoom(100)} />
        <div className="col">
          <RibbonButton icon={Maximize2} label="One Page" showLabel onClick={app.fitPage} />
          <RibbonButton icon={Columns2} label="Multiple Pages" showLabel active={app.overview === 'multiple'} onClick={() => app.setOverview('multiple')} />
          <RibbonButton icon={MoveHorizontal} label="Page Width" showLabel onClick={app.fitWidth} />
        </div>
        <div className="col">
          <RibbonButton icon={ZoomIn} label="Zoom In" onClick={() => app.setZoom(app.zoom + 10)} />
          <RibbonButton icon={ZoomOut} label="Zoom Out" onClick={() => app.setZoom(app.zoom - 10)} />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Window" priority={1}>
        <RibbonButton large icon={AppWindow} label="New Window" title="Open a second window that shows this document (read-only copy)" onClick={() => window.open(`${location.pathname}?view=read`, '_blank', 'noopener')} />
        <RibbonButton large icon={Moon} label="Switch Modes" active={app.darkPage} title="Switch between a light and a dark page" onClick={() => app.setDarkPage(!app.darkPage)} />
      </RibbonGroup>
    </>
  )
}
