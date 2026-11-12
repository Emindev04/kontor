import { Clapperboard, Film, ImagePlus, Play, Repeat, RotateCcw, Scissors, Volume1, Volume2, VolumeX, Image as ImageIcon } from 'lucide-react'
import { useStore } from '../../store/store'
import * as A from '../../store/actions'
import { MenuButton, NumberField, RibbonButton, RibbonGroup, pickFile } from '../ui'
import { ArrangeButtons, ArrangeExtraButtons } from './common'
import type { TabProps } from './types'
import { t, formatNumber } from '../../i18n'

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
      <RibbonGroup label={t('Preview')}>
        <RibbonButton icon={Play} label={t('Play')} large disabled={!m} onClick={playSelected} />
      </RibbonGroup>
      <RibbonGroup label={t('Editing')}>
        <RibbonButton icon={Scissors} label={video ? t('Trim Video') : t('Trim Audio')} large disabled={!m} onClick={() => ui.openDialog('trimMedia')} />
      </RibbonGroup>
      <RibbonGroup label={video ? t('Video Options') : t('Audio Options')}>
        <MenuButton
          icon={vol === 0 ? VolumeX : vol < 0.5 ? Volume1 : Volume2}
          label={t('Volume')}
          large
          disabled={!m}
          items={[
            { label: t('Low'), active: vol > 0 && vol <= 0.34, onClick: () => A.updateMedia({ volume: 0.33 }) },
            { label: t('Medium'), active: vol > 0.34 && vol <= 0.67, onClick: () => A.updateMedia({ volume: 0.66 }) },
            { label: t('High'), active: vol > 0.67, onClick: () => A.updateMedia({ volume: 1 }) },
            { label: t('Mute'), active: vol === 0, onClick: () => A.updateMedia({ volume: 0 }) },
          ]}
        />
        <div className="col timing">
          <label className="field-row">
            <span>{t('Start:')}</span>
            <select value={m?.autoPlay ? 'auto' : 'click'} disabled={!m} onChange={(e) => A.updateMedia({ autoPlay: e.target.value === 'auto' })}>
              <option value="click">{t('When Clicked On')}</option>
              <option value="auto">{t('Automatically')}</option>
            </select>
          </label>
          {video && (
            <label className="check">
              <input type="checkbox" checked={!!m?.fullScreen} onChange={(e) => A.updateMedia({ fullScreen: e.target.checked })} /> {t('Play Full Screen')}
            </label>
          )}
          <label className="check">
            <input type="checkbox" checked={!!m?.hideWhenNotPlaying} disabled={!m} onChange={(e) => A.updateMedia({ hideWhenNotPlaying: e.target.checked })} /> {t('Hide While Not Playing')}
          </label>
        </div>
        <div className="col checks">
          <label>
            <input type="checkbox" checked={!!m?.loop} disabled={!m} onChange={(e) => A.updateMedia({ loop: e.target.checked })} /> <Repeat size={12} /> {t('Loop until Stopped')}
          </label>
          <label>
            <input type="checkbox" checked={!!m?.rewind} disabled={!m} onChange={(e) => A.updateMedia({ rewind: e.target.checked })} /> <RotateCcw size={12} /> {t('Rewind after Playing')}
          </label>
        </div>
      </RibbonGroup>
      {video && (
        <RibbonGroup label={t('Adjust')}>
          <MenuButton
            icon={ImageIcon}
            label={t('Poster Frame')}
            large
            disabled={!m}
            items={[
              {
                label: t('Current Frame'),
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
                label: t('Image from File…'),
                icon: ImagePlus,
                onClick: async () => {
                  const [file] = await pickFile('image/*')
                  if (!file) return
                  const r = new FileReader()
                  r.onload = () => A.updateMedia({ poster: String(r.result) })
                  r.readAsDataURL(file)
                },
              },
              { label: t('Reset'), icon: Clapperboard, onClick: async () => { const cur = A.currentMedia(); if (cur) A.updateMedia({ poster: (await A.captureFrame(cur.src)).poster }) } },
            ]}
          />
        </RibbonGroup>
      )}
      <RibbonGroup label={t('Arrange')}>
        <ArrangeButtons ui={ui} />
        <ArrangeExtraButtons />
      </RibbonGroup>
    </>
  )
}

export function TrimBody({ start, end, duration, onChange }: { start: number; end: number; duration: number; onChange: (s: number, e: number) => void }) {
  return (
    <div className="form">
      <p className="hint">{t('Duration: {n} s', { n: formatNumber(duration, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) })}</p>
      <label className="field-row form-row">
        <span>{t('Start Time:')}</span>
        <NumberField label={t('Start time')} value={start} min={0} max={Math.max(0, end - 0.1)} step={0.1} suffix={t(' s')} onChange={(v) => onChange(v, end)} />
      </label>
      <label className="field-row form-row">
        <span>{t('End Time:')}</span>
        <NumberField label={t('End time')} value={end} min={start + 0.1} max={duration || 36000} step={0.1} suffix={t(' s')} onChange={(v) => onChange(start, v)} />
      </label>
      <input type="range" min={0} max={duration || 1} step={0.05} value={start} aria-label={t('Start')} onChange={(e) => onChange(Math.min(Number(e.target.value), end - 0.1), end)} />
      <input type="range" min={0} max={duration || 1} step={0.05} value={end} aria-label={t('End')} onChange={(e) => onChange(start, Math.max(Number(e.target.value), start + 0.1))} />
    </div>
  )
}
