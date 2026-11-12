import {
  Accessibility,
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
      <RibbonGroup label="Start Slide Show">
        <RibbonButton icon={Play} label="From Beginning" title="From Beginning (F5)" large onClick={() => startShow(false)} />
        <RibbonButton icon={MonitorPlay} label="From Current Slide" title="From Current Slide (Shift+F5)" large onClick={() => startShow(true)} />
        <MenuButton
          icon={ListVideo}
          label="Custom Slide Show"
          large
          items={() => [
            ...(store.get().pres.customShows ?? []).map((c) => ({ label: c.name, onClick: () => startShow(false, false, { custom: c.id }) })),
            ...(store.get().pres.customShows?.length ? ['separator' as const] : []),
            { label: 'Custom Shows…', onClick: () => ui.openDialog('customShows') },
          ]}
        />
      </RibbonGroup>
      <RibbonGroup label="Set Up">
        <RibbonButton icon={Wrench} label="Set Up Slide Show" large onClick={() => ui.openDialog('setupShow')} />
        <RibbonButton icon={EyeOff} label="Hide Slide" large active={!!hidden} onClick={() => A.toggleHideSlides()} />
        <RibbonButton icon={Timer} label="Rehearse Timings" large onClick={() => startShow(false, true)} />
        <div className="col checks">
          <label>
            <input type="checkbox" checked={pres.useTimings !== false} onChange={(e) => commit((p) => ({ ...p, useTimings: e.target.checked }))} /> Use Timings
          </label>
          <label>
            <input type="checkbox" checked={!!pres.loop} onChange={(e) => commit((p) => ({ ...p, loop: e.target.checked }))} /> Loop Until Esc
          </label>
          <label>
            <input type="checkbox" checked={!!pres.showMediaControls} onChange={(e) => commit((p) => ({ ...p, showMediaControls: e.target.checked }))} /> Show Media Controls
          </label>
        </div>
      </RibbonGroup>
      <RibbonGroup label="Monitors">
        <RibbonButton icon={MonitorSpeaker} label="Presenter View" title="Start the show with the presenter view in a second window (Alt+F5)" large onClick={() => startShow(true, false, { presenter: true })} />
        <div className="col checks">
          <label>
            <input type="checkbox" checked={!!pres.presenterView} onChange={(e) => commit((p) => ({ ...p, presenterView: e.target.checked }))} /> Use Presenter View
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
      <RibbonGroup label="Record">
        <RibbonButton icon={Play} label="From Beginning" large onClick={() => startShow(false, true)} title="Rehearse from the beginning and record slide timings" />
        <RibbonButton icon={MonitorPlay} label="From Current Slide" large onClick={() => startShow(true, true)} title="Rehearse from the current slide and record slide timings" />
      </RibbonGroup>
      <RibbonGroup label="Timings">
        <RibbonButton icon={Timer} label="Rehearse Timings" large onClick={() => startShow(false, true)} />
        <MenuButton
          icon={TimerReset}
          label="Clear"
          large
          items={[
            { label: 'Clear Timing on Current Slide', onClick: () => clearTimings(false) },
            { label: 'Clear Timings on All Slides', onClick: () => clearTimings(true) },
          ]}
        />
        <div className="col checks">
          <label>
            <input type="checkbox" checked={pres.useTimings !== false} onChange={(e) => commit((p) => ({ ...p, useTimings: e.target.checked }))} /> Use Timings
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
      <RibbonGroup label="Proofing">
        <RibbonButton icon={SpellCheck} label="Spelling" title="Check spelling as you type" large active={spell} onClick={() => store.set({ spellcheck: !spell })} />
        <RibbonButton icon={BookA} label="Thesaurus" title="Thesaurus (Shift+F7)" large onClick={() => ui.openDialog('thesaurus')} />
      </RibbonGroup>
      <RibbonGroup label="Accessibility">
        <RibbonButton icon={Accessibility} label="Check Accessibility" large onClick={() => ui.openDialog('accessibility')} />
      </RibbonGroup>
      <RibbonGroup label="Language">
        <MenuButton
          icon={Languages}
          label="Language"
          large
          title="Set the proofing language used to check spelling"
          items={() => [{ heading: 'Set Proofing Language' }, ...LANGUAGES.map((l) => ({ label: l.label, active: (store.get().pres.lang || 'en-US') === l.code, onClick: () => commit((p) => ({ ...p, lang: l.code })) }))]}
        />
      </RibbonGroup>
      <RibbonGroup label="Comments">
        <RibbonButton icon={MessageSquarePlus} label="New Comment" large onClick={() => window.dispatchEvent(new CustomEvent('kontor:new-comment'))} />
        <MenuButton
          icon={MessageSquareX}
          label="Delete"
          large
          items={[
            { label: 'Delete All Comments on This Slide', onClick: () => window.dispatchEvent(new CustomEvent('kontor:delete-comments', { detail: 'slide' })) },
            { label: 'Delete All Comments in This Presentation', onClick: () => window.dispatchEvent(new CustomEvent('kontor:delete-comments', { detail: 'all' })) },
          ]}
        />
        <div className="col">
          <RibbonButton icon={ChevronLeft} label="Previous" showLabel onClick={() => window.dispatchEvent(new CustomEvent('kontor:comment-nav', { detail: -1 }))} />
          <RibbonButton icon={ChevronRight} label="Next" showLabel onClick={() => window.dispatchEvent(new CustomEvent('kontor:comment-nav', { detail: 1 }))} />
        </div>
        <RibbonButton icon={MessageSquare} label="Show Comments" large active={pane === 'comments'} onClick={() => ui.openPane(pane === 'comments' ? null : 'comments')} />
      </RibbonGroup>
      <RibbonGroup label="Ink">
        <RibbonButton icon={hideInk ? Eye : EyeOff} label={hideInk ? 'Show Ink' : 'Hide Ink'} large active={hideInk} onClick={() => store.set({ hideInk: !hideInk })} />
      </RibbonGroup>
    </>
  )
}

export function ViewTab({ ui }: TabProps) {
  const s = useStore((x) => x)
  return (
    <>
      <RibbonGroup label="Presentation Views">
        <RibbonButton icon={Presentation} label="Normal" large active={s.view === 'normal'} onClick={() => (['master', 'handoutMaster', 'notesMaster'].includes(s.view) ? closeMasterView() : store.set({ view: 'normal' }))} />
        <RibbonButton icon={ListTree} label="Outline View" large active={s.view === 'outline'} onClick={() => (A.exitEditing(), store.set({ view: 'outline' }))} />
        <RibbonButton icon={LayoutGrid} label="Slide Sorter" large active={s.view === 'sorter'} onClick={() => (A.exitEditing(), store.set({ view: 'sorter' }))} />
        <RibbonButton icon={StickyNote} label="Notes Page" large active={s.view === 'notesPage'} onClick={() => (A.exitEditing(), store.set({ view: 'notesPage' }))} />
        <RibbonButton icon={BookOpen} label="Reading View" large onClick={() => store.set({ show: { start: currentIndex(), reading: true } })} />
      </RibbonGroup>
      <RibbonGroup label="Master Views">
        <RibbonButton icon={LayoutTemplate} label="Slide Master" large active={s.view === 'master'} onClick={() => openMasterView('master')} />
        <RibbonButton icon={Files} label="Handout Master" large active={s.view === 'handoutMaster'} onClick={() => openMasterView('handoutMaster')} />
        <RibbonButton icon={NotebookPen} label="Notes Master" large active={s.view === 'notesMaster'} onClick={() => openMasterView('notesMaster')} />
      </RibbonGroup>
      <RibbonGroup label="Show" onLauncher={() => ui.openDialog('gridGuides')} launcherTitle="Grid Settings">
        <div className="col checks">
          <label>
            <input type="checkbox" checked={s.showRuler} onChange={(e) => store.set({ showRuler: e.target.checked })} /> Ruler
          </label>
          <label>
            <input type="checkbox" checked={s.showGrid} onChange={(e) => store.set({ showGrid: e.target.checked })} /> Gridlines
          </label>
          <label>
            <input type="checkbox" checked={s.showGuides} onChange={(e) => store.set({ showGuides: e.target.checked })} /> Guides
          </label>
        </div>
        <RibbonButton icon={NotebookText} label="Notes" large active={s.showNotes} onClick={() => store.set({ showNotes: !s.showNotes })} />
      </RibbonGroup>
      <RibbonGroup label="Zoom">
        <RibbonButton icon={ZoomIn} label="Zoom" large onClick={() => ui.openDialog('zoom')} />
        <RibbonButton icon={Maximize} label="Fit to Window" large active={s.fit} onClick={() => store.set({ fit: true })} />
      </RibbonGroup>
      <RibbonGroup label="Color/Grayscale">
        <div className="col">
          {(
            [
              ['color', 'Color'],
              ['grayscale', 'Grayscale'],
              ['bw', 'Black and White'],
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
    <RibbonGroup label="Help">
      <RibbonButton icon={HelpCircle} label="Help" large onClick={() => ui.openDialog('shortcuts')} />
      <RibbonButton icon={Keyboard} label="Keyboard Shortcuts" large onClick={() => ui.openDialog('shortcuts')} />
      <RibbonButton icon={Info} label="About" large onClick={() => ui.openDialog('about')} />
    </RibbonGroup>
  )
}
