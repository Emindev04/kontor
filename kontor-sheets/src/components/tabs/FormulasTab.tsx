import { Eye, Calculator, BookOpen, Clock, DollarSign, FileSearch, Sigma, SquareFunction, TextCursorInput, ToggleLeft, Type, Search, Tag, Tags, ListTree, ArrowRightFromLine, ArrowLeftToLine, Eraser, RefreshCw, Settings2, FlaskConical } from 'lucide-react'
import { CATEGORY_ORDER, functionsIn, type FnCategory } from '../../engine/functions/meta'
import { MenuButton, RibbonButton, RibbonGroup, type MenuItem } from '../ui'
import { useApp, useDocVersion } from '../appContext'
import { Engine } from '../../engine/engine'
import { recentFunctions } from './recent'

function fnItems(cat: FnCategory, insert: (n: string) => void): MenuItem[] {
  return functionsIn(cat).map((m) => ({ label: m.name, onClick: () => insert(m.name) }))
}

export function FormulasTab() {
  const app = useApp()
  const doc = app.doc
  useDocVersion(doc)
  const ins = app.insertFunction
  const more: MenuItem[] = (['Statistical', 'Engineering', 'Information', 'Database', 'Compatibility', 'Web'] as FnCategory[]).flatMap((c): MenuItem[] => [{ heading: c }, ...fnItems(c, ins)])
  const names = [...doc.wb.names.values()]
  const sheet = doc.sheet

  const trace = (kind: 'precedents' | 'dependents') => {
    const a = doc.sel.active
    if (kind === 'precedents') {
      const deps = doc.engine.precedents(sheet, a.r, a.c)
      if (!deps.length) return app.alert('The active cell does not contain a formula that refers to other cells.')
      doc.traces.push(...deps.filter((d) => d.s === sheet.id).map((d) => ({ sheetId: sheet.id, from: { r1: d.r1, c1: d.c1, r2: d.r2, c2: d.c2 }, to: { r: a.r, c: a.c } })))
    } else {
      const fids = doc.engine.directDependents(sheet, a.r, a.c)
      if (!fids.length) return app.alert('No formulas refer to the active cell.')
      for (const f of fids) {
        const c = Engine.cellOfFid(f)
        if (c.sheetId === sheet.id) doc.traces.push({ sheetId: sheet.id, from: { r1: a.r, c1: a.c, r2: a.r, c2: a.c }, to: { r: c.r, c: c.c } })
      }
    }
    doc.emit()
  }

  return (
    <>
      <RibbonGroup label="Function Library" icon={SquareFunction} priority={3}>
        <RibbonButton icon={SquareFunction} label="Insert Function" large title="Insert Function (Shift+F3)" onClick={() => app.dialog({ kind: 'insertFunction' })} />
        <MenuButton
          icon={Sigma}
          label="AutoSum"
          large
          items={[
            { label: 'Sum', onClick: () => app.autoSum('SUM') },
            { label: 'Average', onClick: () => app.autoSum('AVERAGE') },
            { label: 'Count Numbers', onClick: () => app.autoSum('COUNT') },
            { label: 'Max', onClick: () => app.autoSum('MAX') },
            { label: 'Min', onClick: () => app.autoSum('MIN') },
            'separator',
            { label: 'More Functions…', onClick: () => app.dialog({ kind: 'insertFunction' }) },
          ]}
        />
        <MenuButton icon={Clock} label="Recently Used" large items={recentFunctions().map((n) => ({ label: n, onClick: () => ins(n) }))} />
        <MenuButton icon={DollarSign} label="Financial" large items={fnItems('Financial', ins)} />
        <MenuButton icon={ToggleLeft} label="Logical" large items={fnItems('Logical', ins)} />
        <MenuButton icon={Type} label="Text" large items={fnItems('Text', ins)} />
        <MenuButton icon={Clock} label="Date & Time" large items={fnItems('Date & Time', ins)} />
        <MenuButton icon={Search} label="Lookup & Reference" large items={fnItems('Lookup & Reference', ins)} />
        <MenuButton icon={Calculator} label="Math & Trig" large items={fnItems('Math & Trig', ins)} />
        <MenuButton icon={BookOpen} label="More Functions" large items={more} />
      </RibbonGroup>
      <RibbonGroup label="Defined Names" icon={Tags}>
        <RibbonButton icon={Tags} label="Name Manager" large title="Name Manager (Ctrl+F3)" onClick={() => app.dialog({ kind: 'nameManager' })} />
        <div className="col">
          <RibbonButton icon={Tag} label="Define Name" showLabel onClick={() => app.dialog({ kind: 'defineName' })} />
          <MenuButton
            icon={TextCursorInput}
            label="Use in Formula"
            showLabel
            items={names.length ? names.map((n) => ({ label: n.name, onClick: () => useName(n.name) })) : [{ label: '(no names)', disabled: true, onClick: () => {} }]}
          />
          <RibbonButton icon={ListTree} label="Create from Selection" showLabel title="Create from Selection (Ctrl+Shift+F3)" onClick={() => app.dialog({ kind: 'createNames' })} />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Formula Auditing" icon={FileSearch}>
        <div className="col">
          <RibbonButton icon={ArrowRightFromLine} label="Trace Precedents" showLabel onClick={() => trace('precedents')} />
          <RibbonButton icon={ArrowLeftToLine} label="Trace Dependents" showLabel onClick={() => trace('dependents')} />
          <RibbonButton icon={Eraser} label="Remove Arrows" showLabel disabled={!doc.traces.length} onClick={() => { doc.traces = []; doc.emit() }} />
        </div>
        <div className="col">
          <RibbonButton icon={FileSearch} label="Show Formulas" showLabel title="Show Formulas (Ctrl+`)" active={sheet.showFormulas} onClick={() => { sheet.showFormulas = !sheet.showFormulas; doc.emit() }} />
          <RibbonButton icon={FlaskConical} label="Error Checking" showLabel onClick={() => app.dialog({ kind: 'errorChecking' })} />
          <RibbonButton icon={Calculator} label="Evaluate Formula" showLabel onClick={() => app.dialog({ kind: 'evaluateFormula' })} />
        </div>
        <RibbonButton icon={Eye} label="Watch Window" large active={app.pane === 'watch'} onClick={() => app.setPane(app.pane === 'watch' ? null : 'watch')} />
      </RibbonGroup>
      <RibbonGroup label="Calculation" icon={Calculator}>
        <MenuButton
          icon={Settings2}
          label="Calculation Options"
          large
          items={[
            { label: 'Automatic', checked: doc.wb.calcMode === 'auto', onClick: () => { doc.wb.calcMode = 'auto'; doc.engine.recalcAll(); doc.emit() } },
            { label: 'Manual', checked: doc.wb.calcMode === 'manual', onClick: () => { doc.wb.calcMode = 'manual'; doc.emit() } },
          ]}
        />
        <div className="col">
          <RibbonButton icon={RefreshCw} label="Calculate Now" showLabel title="Calculate Now (F9)" onClick={() => { doc.engine.recalcAll(); doc.emit() }} />
          <RibbonButton icon={Calculator} label="Calculate Sheet" showLabel title="Calculate Sheet (Shift+F9)" onClick={() => { doc.engine.recalcAll(); doc.emit() }} />
        </div>
      </RibbonGroup>
    </>
  )

  function useName(name: string) {
    if (doc.edit) {
      const e = doc.edit
      const text = e.text.slice(0, e.caret) + name + e.text.slice(e.caret)
      doc.updateEdit({ text, caret: e.caret + name.length })
    } else doc.beginEdit('enter', `=${name}`)
  }
}

void CATEGORY_ORDER
