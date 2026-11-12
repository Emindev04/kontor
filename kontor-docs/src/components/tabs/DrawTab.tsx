import { PenTool } from 'lucide-react'
import { RibbonButton, RibbonGroup } from '../ui'
import type { TabProps } from './types'

export function DrawTab({ app }: TabProps) {
  return (
    <RibbonGroup label="Insert">
      <RibbonButton large icon={PenTool} label="Drawing Canvas" title="Draw with pens and a highlighter, then insert the drawing as a picture" onClick={() => app.openDialog('drawing')} />
    </RibbonGroup>
  )
}
