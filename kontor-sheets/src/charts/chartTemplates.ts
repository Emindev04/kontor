// Chart templates (Chart Design > Save as Template): the type and formatting of a chart, kept in this
// browser / on this computer, applied to other charts without changing their data.
import type { ChartDef } from '../model/extras'

const KEY = 'kontor-sheets:chart-templates'

/** The parts of a chart that a template carries (no data, position or name). */
export type ChartTemplate = { name: string } & Partial<
  Pick<ChartDef, 'type' | 'grouping' | 'markers' | 'smooth' | 'title' | 'legend' | 'dataLabels' | 'axes' | 'gridlines' | 'style' | 'palette' | 'holeSize' | 'gapWidth' | 'fill' | 'border' | 'fontColor' | 'valueAxis' | 'dataTable'>
>

const FIELDS = ['type', 'grouping', 'markers', 'smooth', 'legend', 'dataLabels', 'axes', 'gridlines', 'style', 'palette', 'holeSize', 'gapWidth', 'fill', 'border', 'fontColor', 'valueAxis', 'dataTable'] as const

export function chartTemplates(): ChartTemplate[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function store(list: ChartTemplate[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // storage unavailable: the template is not kept
  }
}

export function templateFromChart(chart: ChartDef, name: string): ChartTemplate {
  const t: ChartTemplate = { name }
  for (const f of FIELDS) if (chart[f] !== undefined) (t as Record<string, unknown>)[f] = structuredClone(chart[f])
  // the title's show/overlay settings, not its text
  t.title = { show: chart.title.show, overlay: chart.title.overlay }
  return t
}

export function saveChartTemplate(chart: ChartDef, name: string) {
  const t = templateFromChart(chart, name.trim() || 'Chart Template')
  store([...chartTemplates().filter((x) => x.name !== t.name), t])
}

export function deleteChartTemplate(name: string) {
  store(chartTemplates().filter((x) => x.name !== name))
}

/** The changes that apply a template to a chart (its title text and data stay). */
export function templatePatch(chart: ChartDef, t: ChartTemplate): Partial<ChartDef> {
  const patch: Partial<ChartDef> = {}
  for (const f of FIELDS) if (t[f] !== undefined) (patch as Record<string, unknown>)[f] = structuredClone(t[f])
  if (t.title) patch.title = { ...chart.title, show: t.title.show, overlay: t.title.overlay }
  return patch
}
