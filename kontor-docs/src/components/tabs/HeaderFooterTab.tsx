import { ArrowDownToLine, ArrowUpToLine, CalendarClock, ChevronDown, ChevronUp, FileText, Hash, Image, PanelBottom, PanelTop, X } from 'lucide-react'
import { CheckItem, MenuButton, RibbonButton, RibbonGroup, Spinner } from '../ui'
import { headerFooterMenu, pageNumberMenu } from './InsertTab'
import { formatLength, parseLength } from '../../units'
import type { TabProps } from './types'
import { t } from '../../i18n'

/** Contextual tab while a header or footer is being edited. */
export function HeaderFooterTab({ editor, app }: TabProps) {
  const chain = () => editor.chain().focus()
  const edit = app.hfEdit
  const kind = edit?.slot.toLowerCase().includes('header') ? 'header' : 'footer'
  const unit = app.settings.unit
  const pageNumbers = pageNumberMenu(app).map((item) =>
    typeof item === 'object' && 'label' in item && item.label === 'Current Position' ? { ...item, disabled: false, onClick: () => chain().insertField('page').run() } : item,
  )
  return (
    <>
      <RibbonGroup label={t('Header & Footer')} priority={3}>
        <MenuButton large icon={PanelTop} label={t('Header')} items={headerFooterMenu(app, 'header')} />
        <MenuButton large icon={PanelBottom} label={t('Footer')} items={headerFooterMenu(app, 'footer')} />
        <MenuButton large icon={Hash} label={t('Page Number')} items={pageNumbers} />
      </RibbonGroup>
      <RibbonGroup label={t('Insert')} priority={3}>
        <MenuButton
          large
          icon={CalendarClock}
          label={t('Date & Time')}
          items={[
            { label: t('Date (updates automatically)'), onClick: () => chain().insertField('date').run() },
            { label: t('Time (updates automatically)'), onClick: () => chain().insertField('time').run() },
            { label: t('Date and Time…'), detail: t('Insert as fixed text'), onClick: () => app.openDialog('dateTime') },
          ]}
        />
        <MenuButton
          large
          icon={FileText}
          label={t('Document Info')}
          items={[
            { label: t('Document Title'), onClick: () => chain().insertField('title').run() },
            { label: t('Page'), onClick: () => chain().insertField('page').run() },
            { label: t('Number of Pages'), onClick: () => chain().insertField('numPages').run() },
          ]}
        />
        <RibbonButton large icon={Image} label={t('Pictures')} onClick={app.insertImage} />
      </RibbonGroup>
      <RibbonGroup label={t('Navigation')} priority={2}>
        <RibbonButton large icon={PanelTop} label={t('Go to Header')} disabled={kind === 'header'} onClick={() => app.editHeaderFooter('header', edit?.page)} />
        <RibbonButton large icon={PanelBottom} label={t('Go to Footer')} disabled={kind === 'footer'} onClick={() => app.editHeaderFooter('footer', edit?.page)} />
        <div className="col">
          <RibbonButton icon={ChevronUp} label={t('Previous')} showLabel disabled={!edit || edit.page === 0} onClick={() => edit && app.editHeaderFooter(kind, edit.page - 1)} />
          <RibbonButton icon={ChevronDown} label={t('Next')} showLabel disabled={!edit || edit.page >= app.pages - 1} onClick={() => edit && app.editHeaderFooter(kind, edit.page + 1)} />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Options')} priority={2}>
        <div className="col checks">
          <CheckItem
            label={t('Different First Page')}
            checked={app.setup.differentFirstPage}
            onChange={(on) => {
              const next = { ...app.setup, differentFirstPage: on }
              app.setSetup(next)
              if (edit) app.editHeaderFooter(kind, edit.page, next)
            }}
          />
          <CheckItem
            label={t('Different Odd & Even Pages')}
            checked={app.setup.differentOddEven}
            onChange={(on) => {
              const next = { ...app.setup, differentOddEven: on }
              app.setSetup(next)
              if (edit) app.editHeaderFooter(kind, edit.page, next)
            }}
          />
          <CheckItem label={t('Show Document Text')} checked={!app.hideBodyWhileHf} onChange={(on) => app.setHideBodyWhileHf(!on)} />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Position')} priority={1}>
        <div className="col spinners">
          <Spinner
            icon={ArrowUpToLine}
            label={t('Header from Top')}
            value={app.setup.headerDistance}
            step={0.1}
            max={5}
            width={70}
            format={(v) => formatLength(v, unit)}
            parse={(s) => parseLength(s, unit)}
            onChange={(v) => app.setSetup({ ...app.setup, headerDistance: v })}
          />
          <Spinner
            icon={ArrowDownToLine}
            label={t('Footer from Bottom')}
            value={app.setup.footerDistance}
            step={0.1}
            max={5}
            width={70}
            format={(v) => formatLength(v, unit)}
            parse={(s) => parseLength(s, unit)}
            onChange={(v) => app.setSetup({ ...app.setup, footerDistance: v })}
          />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Close')} priority={5}>
        <RibbonButton large icon={X} label={t('Close Header and Footer')} title={t('Close Header and Footer (Esc)')} onClick={app.closeHeaderFooter} />
      </RibbonGroup>
    </>
  )
}
