// Table styles made with New Table Style: kept with the workbook and looked up by name.
export type CustomTableStyle = { name: string; header: string; headerText: string; band: string; border: string; bold: boolean }

const registry = new Map<string, CustomTableStyle>()

/** Makes a workbook's own table styles known to the renderer (called when a workbook is loaded or changed). */
export function registerTableStyles(list: CustomTableStyle[]) {
  registry.clear()
  for (const s of list) registry.set(s.name, s)
}

export const customTableStyle = (name: string) => registry.get(name)
