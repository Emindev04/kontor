import {
  Accessibility,
  AppWindow,
  ArrowLeftRight,
  Columns2,
  Layers,
  GitCompare,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Contrast,
  Eye,
  EyeOff,
  HelpCircle,
  Info,
  Keyboard,
  Languages,
  LayoutGrid,
  Maximize,
  MessageSquare,
  MessageSquarePlus,
  MessageSquareX,
  MonitorPlay,
  NotebookText,
  Play,
  Presentation,
  SpellCheck,
  Timer,
  TimerReset,
  Wrench,
  ZoomIn,
  StickyNote,
  ListVideo,
  ListTree,
  LayoutTemplate,
  Files,
  NotebookPen,
  MonitorSpeaker,
  BookA,
} from 'lucide-react'
import { commit, currentIndex, store, useStore } from '../../store/store'
import * as A from '../../store/actions'
import { MenuButton, RibbonButton, RibbonGroup, cls } from '../ui'
import { t } from '../../i18n'
import { arrangeWindows, focusWindow, openNewWindow, otherWindows } from '../../io/windowSync'
import type { TabProps } from './types'
import { LANGUAGES } from '../../model/languages'
import { closeMasterView, openMasterView } from '../MasterViews'

export function startShow(fromCurrent: boolean, rehearse = false, opts: { presenter?: boolean; custom?: string | null } = {}) {
  if (store.get().editingId) A.exitEditing()
  const p = store.get().pres
  store.set({ show: { start: fromCurrent ? currentIndex() : 0, rehearse, presenter: opts.presenter ?? (!!p.presenterView && !rehearse), custom: opts.custom ?? null } })
}

export function clearTimings(all: boolean) {
  const sid = store.get().slideId
  commit((p) => ({ ...p, slides: p.slides.map((s) => (all || s.id === sid ? { ...s, transition: s.transition ? { ...s.transition, advanceAfter: null } : s.transition } : s)) }))
}

export function SlideShowTab({ ui }: TabProps) {
  const pres = useStore((s) => s.pres)
  const hidden = useStore((s) => s.pres.slides.find((x) => x.id === s.slideId)?.hidden)
  return (
    <>
      <RibbonGroup label={t('Start Slide Show')}>
        <RibbonButton icon={Play} label={t('From Beginning')} title={t('From Beginning (F5)')} large onClick={() => startShow(false)} />
        <RibbonButton icon={MonitorPlay} label={t('From Current Slide')} title={t('From Current Slide (Shift+F5)')} large onClick={() => startShow(true)} />
        <MenuButton
          icon={ListVideo}
          label={t('Custom Slide Show')}
          large
          items={() => [
            ...(store.get().pres.customShows ?? []).map((c) => ({ label: c.name, onClick: () => startShow(false, false, { custom: c.id }) })),
            ...(store.get().pres.customShows?.length ? ['separator' as const] : []),
            { label: t('Custom Shows…'), onClick: () => ui.openDialog('customShows') },
          ]}
        />
      </RibbonGroup>
      <RibbonGroup label={t('Set Up')}>
        <RibbonButton icon={Wrench} label={t('Set Up Slide Show')} large onClick={() => ui.openDialog('setupShow')} />
        <RibbonButton icon={EyeOff} label={t('Hide Slide')} large active={!!hidden} onClick={() => A.toggleHideSlides()} />
        <RibbonButton icon={Timer} label={t('Rehearse Timings')} large onClick={() => startShow(false, true)} />
        <div className="col checks">
          <label>
            <input type="checkbox" checked={pres.useTimings !== false} onChange={(e) => commit((p) => ({ ...p, useTimings: e.target.checked }))} /> {t('Use Timings')}
          </label>
          <label>
            <input type="checkbox" checked={!!pres.loop} onChange={(e) => commit((p) => ({ ...p, loop: e.target.checked }))} /> {t('Loop Until Esc')}
          </label>
          <label>
            <input type="checkbox" checked={!!pres.showMediaControls} onChange={(e) => commit((p) => ({ ...p, showMediaControls: e.target.checked }))} /> {t('Show Media Controls')}
          </label>
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Monitors')}>
        <RibbonButton icon={MonitorSpeaker} label={t('Presenter View')} title={t('Start the show with the presenter view in a second window (Alt+F5)')} large onClick={() => startShow(true, false, { presenter: true })} />
        <div className="col checks">
          <label>
            <input type="checkbox" checked={!!pres.presenterView} onChange={(e) => commit((p) => ({ ...p, presenterView: e.target.checked }))} /> {t('Use Presenter View')}
          </label>
        </div>
      </RibbonGroup>
    </>
  )
}

export function RecordTab() {
  const pres = useStore((s) => s.pres)
  return (
    <>
      <RibbonGroup label={t('Record')}>
        <RibbonButton icon={Play} label={t('From Beginning')} large onClick={() => startShow(false, true)} title={t('Rehearse from the beginning and record slide timings')} />
        <RibbonButton icon={MonitorPlay} label={t('From Current Slide')} large onClick={() => startShow(true, true)} title={t('Rehearse from the current slide and record slide timings')} />
      </RibbonGroup>
      <RibbonGroup label={t('Timings')}>
        <RibbonButton icon={Timer} label={t('Rehearse Timings')} large onClick={() => startShow(false, true)} />
        <MenuButton
          icon={TimerReset}
          label={t('Clear')}
          large
          items={[
            { label: t('Clear Timing on Current Slide'), onClick: () => clearTimings(false) },
            { label: t('Clear Timings on All Slides'), onClick: () => clearTimings(true) },
          ]}
        />
        <div className="col checks">
          <label>
            <input type="checkbox" checked={pres.useTimings !== false} onChange={(e) => commit((p) => ({ ...p, useTimings: e.target.checked }))} /> {t('Use Timings')}
          </label>
        </div>
      </RibbonGroup>
    </>
  )
}

export function ReviewTab({ ui }: TabProps) {
  const spell = useStore((s) => s.spellcheck)
  const pane = useStore((s) => s.pane)
  const hideInk = useStore((s) => s.hideInk)
  return (
    <>
      <RibbonGroup label={t('Proofing')}>
        <RibbonButton icon={SpellCheck} label={t('Spelling')} title={t('Check spelling as you type')} large active={spell} onClick={() => store.set({ spellcheck: !spell })} />
        <RibbonButton icon={BookA} label={t('Thesaurus')} title={t('Thesaurus (Shift+F7)')} large onClick={() => ui.openDialog('thesaurus')} />
      </RibbonGroup>
      <RibbonGroup label={t('Accessibility')}>
        <RibbonButton icon={Accessibility} label={t('Check Accessibility')} large onClick={() => ui.openDialog('accessibility')} />
      </RibbonGroup>
      <RibbonGroup label={t('Language')}>
        <MenuButton
          icon={Languages}
          label={t('Language')}
          large
          title={t('Set the proofing language used to check spelling')}
          items={() => [{ heading: t('Set Proofing Language') }, ...LANGUAGES.map((l) => ({ label: t(l.label), active: (store.get().pres.lang || 'en-US') === l.code, onClick: () => commit((p) => ({ ...p, lang: l.code })) }))]}
        />
      </RibbonGroup>
      <RibbonGroup label={t('Comments')}>
        <RibbonButton icon={MessageSquarePlus} label={t('New Comment')} large onClick={() => window.dispatchEvent(new CustomEvent('kontor:new-comment'))} />
        <MenuButton
          icon={MessageSquareX}
          label={t('Delete')}
          large
          items={[
            { label: t('Delete All Comments on This Slide'), onClick: () => window.dispatchEvent(new CustomEvent('kontor:delete-comments', { detail: 'slide' })) },
            { label: t('Delete All Comments in This Presentation'), onClick: () => window.dispatchEvent(new CustomEvent('kontor:delete-comments', { detail: 'all' })) },
          ]}
        />
        <div className="col">
          <RibbonButton icon={ChevronLeft} label={t('Previous')} showLabel onClick={() => window.dispatchEvent(new CustomEvent('kontor:comment-nav', { detail: -1 }))} />
          <RibbonButton icon={ChevronRight} label={t('Next')} showLabel onClick={() => window.dispatchEvent(new CustomEvent('kontor:comment-nav', { detail: 1 }))} />
        </div>
        <RibbonButton icon={MessageSquare} label={t('Show Comments')} large active={pane === 'comments'} onClick={() => ui.openPane(pane === 'comments' ? null : 'comments')} />
      </RibbonGroup>
      <RibbonGroup label={t('Compare')}>
        <RibbonButton icon={GitCompare} label={t('Compare')} title={t('Compare with another version and accept its changes')} large onClick={() => ui.openDialog('compare')} />
      </RibbonGroup>
      <RibbonGroup label={t('Ink')}>
        <RibbonButton icon={hideInk ? Eye : EyeOff} label={hideInk ? t('Show Ink') : t('Hide Ink')} large active={hideInk} onClick={() => store.set({ hideInk: !hideInk })} />
      </RibbonGroup>
    </>
  )
}

export function ViewTab({ ui }: TabProps) {
  const s = useStore((x) => x)
  return (
    <>
      <RibbonGroup label={t('Presentation Views')}>
        <RibbonButton icon={Presentation} label={t('Normal')} large active={s.view === 'normal'} onClick={() => (['master', 'handoutMaster', 'notesMaster'].includes(s.view) ? closeMasterView() : store.set({ view: 'normal' }))} />
        <RibbonButton icon={ListTree} label={t('Outline View')} large active={s.view === 'outline'} onClick={() => (A.exitEditing(), store.set({ view: 'outline' }))} />
        <RibbonButton icon={LayoutGrid} label={t('Slide Sorter')} large active={s.view === 'sorter'} onClick={() => (A.exitEditing(), store.set({ view: 'sorter' }))} />
        <RibbonButton icon={StickyNote} label={t('Notes Page')} large active={s.view === 'notesPage'} onClick={() => (A.exitEditing(), store.set({ view: 'notesPage' }))} />
        <RibbonButton icon={BookOpen} label={t('Reading View')} large onClick={() => store.set({ show: { start: currentIndex(), reading: true } })} />
      </RibbonGroup>
      <RibbonGroup label={t('Master Views')}>
        <RibbonButton icon={LayoutTemplate} label={t('Slide Master')} large active={s.view === 'master'} onClick={() => openMasterView('master')} />
        <RibbonButton icon={Files} label={t('Handout Master')} large active={s.view === 'handoutMaster'} onClick={() => openMasterView('handoutMaster')} />
        <RibbonButton icon={NotebookPen} label={t('Notes Master')} large active={s.view === 'notesMaster'} onClick={() => openMasterView('notesMaster')} />
      </RibbonGroup>
      <RibbonGroup label={t('Show')} onLauncher={() => ui.openDialog('gridGuides')} launcherTitle={t('Grid Settings')}>
        <div className="col checks">
          <label>
            <input type="checkbox" checked={s.showRuler} onChange={(e) => store.set({ showRuler: e.target.checked })} /> {t('Ruler')}
          </label>
          <label>
            <input type="checkbox" checked={s.showGrid} onChange={(e) => store.set({ showGrid: e.target.checked })} /> {t('Gridlines')}
          </label>
          <label>
            <input type="checkbox" checked={s.showGuides} onChange={(e) => store.set({ showGuides: e.target.checked })} /> {t('Guides')}
          </label>
        </div>
        <RibbonButton icon={NotebookText} label={t('Notes')} large active={s.showNotes} onClick={() => store.set({ showNotes: !s.showNotes })} />
      </RibbonGroup>
      <RibbonGroup label={t('Zoom')}>
        <RibbonButton icon={ZoomIn} label={t('Zoom')} large onClick={() => ui.openDialog('zoom')} />
        <RibbonButton icon={Maximize} label={t('Fit to Window')} large active={s.fit} onClick={() => store.set({ fit: true })} />
      </RibbonGroup>
      <RibbonGroup label={t('Window')}>
        <RibbonButton icon={AppWindow} label={t('New Window')} title={t('Open another window on this presentation')} large onClick={() => openNewWindow() || window.alert(t('The new window was blocked. Allow pop-ups for this program and try again.'))} />
        <div className="col">
          <RibbonButton icon={Columns2} label={t('Arrange All')} showLabel onClick={() => arrangeWindows('tile')} />
          <RibbonButton icon={Layers} label={t('Cascade')} showLabel onClick={() => arrangeWindows('cascade')} />
          <MenuButton
            icon={ArrowLeftRight}
            label={t('Switch Windows')}
            showLabel
            items={() => {
              const list = otherWindows()
              return list.length ? list.map((w) => ({ label: `${w.title}:${w.n}`, onClick: () => focusWindow(w.id) })) : [{ label: t('No other windows'), disabled: true, onClick: () => undefined }]
            }}
          />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Color/Grayscale')}>
        <div className="col">
          {(
            [
              ['color', t('Color')],
              ['grayscale', t('Grayscale')],
              ['bw', t('Black and White')],
            ] as const
          ).map(([mode, label]) => (
            <button key={mode} type="button" className={cls('rb', s.colorMode === mode && 'is-active')} onClick={() => store.set({ colorMode: mode })}>
              <Contrast size={14} /> {label}
            </button>
          ))}
        </div>
      </RibbonGroup>
    </>
  )
}

export function HelpTab({ ui }: TabProps) {
  return (
    <RibbonGroup label={t('Help')}>
      <RibbonButton icon={HelpCircle} label={t('Help')} large onClick={() => ui.openDialog('shortcuts')} />
      <RibbonButton icon={Keyboard} label={t('Keyboard Shortcuts')} large onClick={() => ui.openDialog('shortcuts')} />
      <RibbonButton icon={Info} label={t('About')} large onClick={() => ui.openDialog('about')} />
    </RibbonGroup>
  )
}
