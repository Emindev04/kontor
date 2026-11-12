import { describe, expect, it } from 'vitest'
import { chartToGrid, gridToChart, niceScale, switchRowColumn, createChart } from './chart'
import { addNode, changeNodeLevel, createDiagram, diagramShapes, moveNode, topLevel } from './diagram'

describe('charts', () => {
  it('round-trips data through the worksheet grid', () => {
    const c = createChart('column', 'clustered', { x: 0, y: 0, w: 600, h: 400 }, 'c', 'Chart')
    const g = chartToGrid(c)
    expect(g[0]).toEqual(['', 'Series 1', 'Series 2', 'Series 3'])
    const back = gridToChart(g, c.series)
    expect(back.categories).toEqual(c.categories)
    expect(back.series[0].values).toEqual(c.series[0].values)
  })
  it('switches rows and columns', () => {
    const c = createChart('column', 'clustered', { x: 0, y: 0, w: 600, h: 400 }, 'c', 'Chart')
    const s = switchRowColumn(c)
    expect(s.categories).toEqual(['Series 1', 'Series 2', 'Series 3'])
    expect(s.series).toHaveLength(4)
  })
  it('builds nice axis scales with headroom', () => {
    expect(niceScale(0, 5).ticks).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(niceScale(-3, 8).min).toBeLessThan(-3)
  })
})

describe('diagrams', () => {
  it('lays out one shape per top-level node plus connectors', () => {
    const d = createDiagram('process', { x: 0, y: 0, w: 800, h: 300 }, 'd', 'Diagram')
    expect(topLevel(d.nodes)).toHaveLength(3)
    const shapes = diagramShapes(d)
    expect(shapes.filter((s) => s.prst === 'roundRect')).toHaveLength(3)
    expect(shapes.filter((s) => s.prst === 'rightArrow')).toHaveLength(2)
  })
  it('edits the outline: add, demote, move', () => {
    const d = createDiagram('basicList', { x: 0, y: 0, w: 800, h: 300 }, 'd', 'Diagram')
    const { nodes, id } = addNode(d.nodes, d.nodes[0].id, 'after')
    expect(nodes[1].id).toBe(id)
    const demoted = changeNodeLevel(nodes, id, 1)
    expect(demoted[1].level).toBe(1)
    const moved = moveNode(d.nodes, d.nodes[1].id, -1)
    expect(moved[0].id).toBe(d.nodes[1].id)
  })
})
