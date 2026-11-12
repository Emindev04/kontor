import { useState } from 'react'
import { t } from '../../i18n'
import { customLabel, loadMacros, type CustomTab } from '../../editor/macros'
import { newId } from '../../editor/Review'
import { cls } from '../ui'
import type { AppApi } from '../tabs/types'

/** Options › Customize the Ribbon: own tabs with groups of ribbon commands and macros (saved at once). */
export function CustomTabsEditor({ app }: { app: AppApi }) {
  const tabs = app.settings.customTabs ?? []
  const [tabId, setTabId] = useState(tabs[0]?.id ?? '')
  const [groupId, setGroupId] = useState(tabs[0]?.groups[0]?.id ?? '')
  const tab = tabs.find((x) => x.id === tabId)
  const group = tab?.groups.find((g) => g.id === groupId)
  const macros = loadMacros()
  const save = (next: CustomTab[]) => app.setSettings({ ...app.settings, customTabs: next })
  const updateTab = (patch: (x: CustomTab) => CustomTab) => save(tabs.map((x) => (x.id === tabId ? patch(x) : x)))

  const newTab = () => {
    const name = prompt(t('Name of the new tab:'), t('New Tab'))?.trim()
    if (!name) return
    const id = newId()
    const gid = newId()
    save([...tabs, { id, name, groups: [{ id: gid, name: t('New Group'), items: [] }] }])
    setTabId(id)
    setGroupId(gid)
  }
  const newGroup = () => {
    if (!tab) return
    const name = prompt(t('Name of the new group:'), t('New Group'))?.trim()
    if (!name) return
    const gid = newId()
    updateTab((x) => ({ ...x, groups: [...x.groups, { id: gid, name, items: [] }] }))
    setGroupId(gid)
  }
  const rename = () => {
    if (group) {
      const name = prompt(t('Group name:'), group.name)?.trim()
      if (name) updateTab((x) => ({ ...x, groups: x.groups.map((g) => (g.id === group.id ? { ...g, name } : g)) }))
    } else if (tab) {
      const name = prompt(t('Tab name:'), tab.name)?.trim()
      if (name) updateTab((x) => ({ ...x, name }))
    }
  }

  return (
    <div className="custom-tabs">
      <div className="dlg-inline">
        <button type="button" className="btn btn-small" onClick={newTab}>
          {t('New Tab')}
        </button>
        <button type="button" className="btn btn-small" disabled={!tab} onClick={newGroup}>
          {t('New Group')}
        </button>
        <button type="button" className="btn btn-small" disabled={!tab} onClick={rename}>
          {t('Rename…')}
        </button>
        <button
          type="button"
          className="btn btn-small"
          disabled={!tab}
          onClick={() => {
            if (group && tab && tab.groups.length > 1) updateTab((x) => ({ ...x, groups: x.groups.filter((g) => g.id !== group.id) }))
            else if (tab && confirm(t('Remove the tab “{name}”?', { name: tab.name }))) save(tabs.filter((x) => x.id !== tab.id))
          }}
        >
          {t('Remove')}
        </button>
      </div>
      {tabs.length > 0 && (
        <div className="dlg-list custom-tabs-tree" role="tree" aria-label={t('Custom tabs')}>
          {tabs.map((x) => (
            <div key={x.id} role="treeitem" aria-expanded>
              <button type="button" className={cls('dlg-list-item', x.id === tabId && !group && 'is-active')} onClick={() => (setTabId(x.id), setGroupId(''))}>
                {x.name} {t('(Custom)')}
              </button>
              {x.groups.map((g) => (
                <div key={g.id}>
                  <button type="button" className={cls('dlg-list-item', 'ct-group', g.id === groupId && 'is-active')} onClick={() => (setTabId(x.id), setGroupId(g.id))}>
                    {g.name}
                  </button>
                  {g.items.map((c, i) => (
                    <div key={i} className="ct-item">
                      <span>{customLabel(c)}</span>
                      <button
                        type="button"
                        className="sb-btn"
                        aria-label={t('Remove')}
                        onClick={() => save(tabs.map((tt) => (tt.id !== x.id ? tt : { ...tt, groups: tt.groups.map((gg) => (gg.id !== g.id ? gg : { ...gg, items: gg.items.filter((_, k) => k !== i) })) })))}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      {group && tab && (
        <div className="dlg-inline">
          <button type="button" className="btn btn-small" onClick={() => app.pickRibbonCommand(tab.id, group.id)}>
            {t('Add Command…')}
          </button>
          {macros.length > 0 && (
            <select
              aria-label={t('Add Macro')}
              value=""
              onChange={(e) => {
                const name = e.target.value
                if (name) updateTab((x) => ({ ...x, groups: x.groups.map((g) => (g.id === group.id ? { ...g, items: [...g.items, { kind: 'macro', name }] } : g)) }))
              }}
            >
              <option value="">{t('Add Macro')}</option>
              {macros.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  )
}
