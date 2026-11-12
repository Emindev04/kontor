import { CircleHelp, GraduationCap, Info, Keyboard, MessageSquareHeart, Sparkles } from 'lucide-react'
import { RibbonButton, RibbonGroup } from '../ui'
import type { TabProps } from './types'
import { t } from '../../i18n'

export function HelpTab({ app }: TabProps) {
  return (
    <RibbonGroup label={t('Help')}>
      <RibbonButton large icon={CircleHelp} label={t('Help')} onClick={() => app.openDialog('help')} />
      <RibbonButton large icon={Keyboard} label={t('Keyboard Shortcuts')} onClick={() => app.openDialog('help')} />
      <RibbonButton large icon={GraduationCap} label={t('Show Training')} onClick={() => app.openDialog('training')} />
      <RibbonButton large icon={Sparkles} label={t('What\'s New')} onClick={() => app.openDialog('whatsNew')} />
      <RibbonButton large icon={MessageSquareHeart} label={t('Feedback')} onClick={() => app.openDialog('feedback')} />
      <RibbonButton large icon={Info} label={t('About')} onClick={() => app.openDialog('about')} />
    </RibbonGroup>
  )
}
