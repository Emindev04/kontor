import { CircleHelp, GraduationCap, Info, Keyboard, MessageSquareHeart, Sparkles } from 'lucide-react'
import { RibbonButton, RibbonGroup } from '../ui'
import type { TabProps } from './types'

export function HelpTab({ app }: TabProps) {
  return (
    <RibbonGroup label="Help">
      <RibbonButton large icon={CircleHelp} label="Help" onClick={() => app.openDialog('help')} />
      <RibbonButton large icon={Keyboard} label="Keyboard Shortcuts" onClick={() => app.openDialog('help')} />
      <RibbonButton large icon={GraduationCap} label="Show Training" onClick={() => app.openDialog('training')} />
      <RibbonButton large icon={Sparkles} label="What's New" onClick={() => app.openDialog('whatsNew')} />
      <RibbonButton large icon={MessageSquareHeart} label="Feedback" onClick={() => app.openDialog('feedback')} />
      <RibbonButton large icon={Info} label="About" onClick={() => app.openDialog('about')} />
    </RibbonGroup>
  )
}
