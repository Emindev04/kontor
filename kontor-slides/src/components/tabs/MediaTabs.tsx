import { Clapperboard, Film, ImagePlus, Play, Repeat, RotateCcw, Scissors, Volume1, Volume2, VolumeX, Image as ImageIcon } from 'lucide-react'
import { useStore } from '../../store/store'
import * as A from '../../store/actions'
import { MenuButton, NumberField, RibbonButton, RibbonGroup, pickFile } from '../ui'
import { ArrangeButtons, ArrangeExtraButtons } from './common'
import type { TabProps } from './types'

function useMedia() {
  return useStore((s) => {
    void s.pres
    return A.currentMedia()
  })
}

function playSelected() {
  const m = A.currentMedia()
  const node = m && (document.querySelector(`[data-el="${m.id}"] video, [data-el="${m.id}"] audio`) as HTMLMediaElement | null)
  if (!node) return
  if (node.paused) node.play().catch(() => undefined)
  else node.pause()
}

export function PlaybackTab({ ui }: TabProps) {
  const m = useMedia()
  const video = m?.kind === 'video'
  const vol = m?.volume ?? 1
  return (
    <>
      <RibbonGroup label="Preview">
        <RibbonButton icon={Play} label="Play" large disabled={!m} onClick={playSelected} />
      </RibbonGroup>
      <RibbonGroup label="Editing">
        <RibbonButton icon={Scissors} label={video ? 'Trim Video' : 'Trim Audio'} large disabled={!m} onClick={() => ui.openDialog('trimMedia')} />
      </RibbonGroup>
      <RibbonGroup label={video ? 'Video Options' : 'Audio Options'}>
        <MenuButton
          icon={vol === 0 ? VolumeX : vol < 0.5 ? Volume1 : Volume2}
          label="Volume"
          large
          disabled={!m}
          items={[
            { label: 'Low', active: vol > 0 && vol <= 0.34, onClick: () => A.updateMedia({ volume: 0.33 }) },
            { label: 'Medium', active: vol > 0.34 && vol <= 0.67, onClick: () => A.updateMedia({ volume: 0.66 }) },
            { label: 'High', active: vol > 0.67, onClick: () => A.updateMedia({ volume: 1 }) },
            { label: 'Mute', active: vol === 0, onClick: () => A.updateMedia({ volume: 0 }) },
          ]}
        />
        <div className="col timing">
          <label className="field-row">
            <span>Start:</span>
            <select value={m?.autoPlay ? 'auto' : 'click'} disabled={!m} onChange={(e) => A.updateMedia({ autoPlay: e.target.value === 'auto' })}>
              <option value="click">When Clicked On</option>
              <option value="auto">Automatically</option>
            </select>
          </label>
          {video && (
            <label className="check">
              <input type="checkbox" checked={!!m?.fullScreen} onChange={(e) => A.updateMedia({ fullScreen: e.target.checked })} /> Play Full Screen
            </label>
          )}
          <label className="check">
            <input type="checkbox" checked={!!m?.hideWhenNotPlaying} disabled={!m} onChange={(e) => A.updateMedia({ hideWhenNotPlaying: e.target.checked })} /> Hide While Not Playing
          </label>
        </div>
        <div className="col checks">
          <label>
            <input type="checkbox" checked={!!m?.loop} disabled={!m} onChange={(e) => A.updateMedia({ loop: e.target.checked })} /> <Repeat size={12} /> Loop until Stopped
          </label>
          <label>
            <input type="checkbox" checked={!!m?.rewind} disabled={!m} onChange={(e) => A.updateMedia({ rewind: e.target.checked })} /> <RotateCcw size={12} /> Rewind after Playing
          </label>
        </div>
      </RibbonGroup>
      {video && (
        <RibbonGroup label="Adjust">
          <MenuButton
            icon={ImageIcon}
            label="Poster Frame"
            large
            disabled={!m}
            items={[
              {
                label: 'Current Frame',
                icon: Film,
                onClick: async () => {
                  const cur = A.currentMedia()
                  const node = cur && (document.querySelector(`[data-el="${cur.id}"] video`) as HTMLVideoElement | null)
                  const t = node?.currentTime ?? 0.5
                  if (!cur) return
                  const { poster } = await A.captureFrame(cur.src, t)
                  if (poster) A.updateMedia({ poster })
                },
              },
              {
                label: 'Image from File…',
                icon: ImagePlus,
                onClick: async () => {
                  const [file] = await pickFile('image/*')
                  if (!file) return
                  const r = new FileReader()
                  r.onload = () => A.updateMedia({ poster: String(r.result) })
                  r.readAsDataURL(file)
                },
              },
              { label: 'Reset', icon: Clapperboard, onClick: async () => { const cur = A.currentMedia(); if (cur) A.updateMedia({ poster: (await A.captureFrame(cur.src)).poster }) } },
            ]}
          />
        </RibbonGroup>
      )}
      <RibbonGroup label="Arrange">
        <ArrangeButtons ui={ui} />
        <ArrangeExtraButtons />
      </RibbonGroup>
    </>
  )
}

export function TrimBody({ start, end, duration, onChange }: { start: number; end: number; duration: number; onChange: (s: number, e: number) => void }) {
  return (
    <div className="form">
      <p className="hint">Duration: {duration.toFixed(2)} s</p>
      <label className="field-row form-row">
        <span>Start Time:</span>
        <NumberField label="Start time" value={start} min={0} max={Math.max(0, end - 0.1)} step={0.1} suffix=" s" onChange={(v) => onChange(v, end)} />
      </label>
      <label className="field-row form-row">
        <span>End Time:</span>
        <NumberField label="End time" value={end} min={start + 0.1} max={duration || 36000} step={0.1} suffix=" s" onChange={(v) => onChange(start, v)} />
      </label>
      <input type="range" min={0} max={duration || 1} step={0.05} value={start} aria-label="Start" onChange={(e) => onChange(Math.min(Number(e.target.value), end - 0.1), end)} />
      <input type="range" min={0} max={duration || 1} step={0.05} value={end} aria-label="End" onChange={(e) => onChange(start, Math.max(Number(e.target.value), start + 0.1))} />
    </div>
  )
}
