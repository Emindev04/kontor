import {
  AppWindow, ArrowDownUp, BookOpen, Clapperboard, Columns2, Eye, FileText, Globe, ListTree, Maximize2, Moon, MoveHorizontal, NotebookPen, Search, ZoomIn, ZoomOut,
} from 'lucide-react'
import { CheckItem, MenuButton, RibbonButton, RibbonGroup, SplitButton } from '../ui'
import type { TabProps } from './types'
import { t } from '../../i18n'

const ZOOMS = [500, 200, 150, 125, 100, 90, 75, 50, 25]

export function ViewTab({ app }: TabProps) {
  return (
    <>
      <RibbonGroup label={t('Views')} priority={4}>
        <RibbonButton large icon={BookOpen} label={t('Read Mode')} active={app.viewMode === 'read'} onClick={() => app.setViewMode('read')} />
        <RibbonButton large icon={FileText} label={t('Print Layout')} active={app.viewMode === 'print'} onClick={() => app.setViewMode('print')} />
        <RibbonButton large icon={Globe} label={t('Web Layout')} active={app.viewMode === 'web'} onClick={() => app.setViewMode('web')} />
        <div className="col">
          <RibbonButton icon={ListTree} label={t('Outline')} showLabel active={app.viewMode === 'outline'} onClick={() => app.setViewMode('outline')} />
          <RibbonButton icon={NotebookPen} label={t('Draft')} showLabel active={app.viewMode === 'draft'} onClick={() => app.setViewMode('draft')} />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Immersive')} priority={1}>
        <RibbonButton large icon={Eye} label={t('Focus')} title={t('Hide the ribbon and status bar to focus on your writing')} onClick={() => app.setFocusMode(true)} />
        <RibbonButton large icon={BookOpen} label={t('Immersive Reader')} title={t('Read with adjustable column width, page color, text spacing and line focus')} onClick={() => app.setViewMode('read')} />
      </RibbonGroup>
      <RibbonGroup label={t('Page Movement')} priority={0}>
        <RibbonButton large icon={ArrowDownUp} label={t('Vertical')} active={!app.overview} title={t('Scroll pages up and down')} onClick={() => app.setOverview(null)} />
        <RibbonButton large icon={Columns2} label={t('Side to Side')} active={app.overview === 'sideBySide'} title={t('See pages side by side; click one to edit it')} onClick={() => app.setOverview('sideBySide')} />
      </RibbonGroup>
      <RibbonGroup label={t('Show')} priority={3}>
        <div className="col checks">
          <CheckItem label={t('Ruler')} checked={app.showRuler} onChange={app.setShowRuler} />
          <CheckItem label={t('Gridlines')} checked={app.showGridlines} onChange={app.setShowGridlines} />
          <CheckItem label={t('Navigation Pane')} checked={app.showNavigation} onChange={app.setShowNavigation} />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Zoom')} priority={2}>
        <MenuButton
          large
          icon={Search}
          label={t('Zoom')}
          items={[
            ...ZOOMS.map((z) => ({ label: `${z}%`, active: app.zoom === z, onClick: () => app.setZoom(z) })),
            'separator' as const,
            { label: t('Page width'), onClick: app.fitWidth },
            { label: t('Whole page'), onClick: app.fitPage },
          ]}
        />
        <RibbonButton large icon={Search} label="100%" title={t('Zoom to 100%')} onClick={() => app.setZoom(100)} />
        <div className="col">
          <RibbonButton icon={Maximize2} label={t('One Page')} showLabel onClick={app.fitPage} />
          <RibbonButton icon={Columns2} label={t('Multiple Pages')} showLabel active={app.overview === 'multiple'} onClick={() => app.setOverview('multiple')} />
          <RibbonButton icon={MoveHorizontal} label={t('Page Width')} showLabel onClick={app.fitWidth} />
        </div>
        <div className="col">
          <RibbonButton icon={ZoomIn} label={t('Zoom In')} onClick={() => app.setZoom(app.zoom + 10)} />
          <RibbonButton icon={ZoomOut} label={t('Zoom Out')} onClick={() => app.setZoom(app.zoom - 10)} />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Window')} priority={1}>
        <RibbonButton large icon={AppWindow} label={t('New Window')} title={t('Open a second window that shows this document (read-only copy)')} onClick={() => window.open(`${location.pathname}?view=read`, '_blank', 'noopener')} />
        <RibbonButton large icon={Moon} label={t('Switch Modes')} active={app.darkPage} title={t('Switch between a light and a dark page')} onClick={() => app.setDarkPage(!app.darkPage)} />
      </RibbonGroup>
      <RibbonGroup label={t('Macros')} priority={0}>
        <SplitButton
          large
          icon={Clapperboard}
          label={t('Macros')}
          active={!!app.macroRecording}
          onClick={() => app.openDialog('macros')}
          items={[
            { label: t('View Macros'), onClick: () => app.openDialog('macros') },
            app.macroRecording
              ? { label: t('Stop Recording'), onClick: () => app.stopMacro() }
              : { label: t('Record Macro…'), onClick: () => app.openDialog('recordMacro') },
            { label: app.macroRecording === 'paused' ? t('Resume Recorder') : t('Pause Recording'), disabled: !app.macroRecording, onClick: () => app.pauseMacro() },
          ]}
        />
      </RibbonGroup>
    </>
  )
}
