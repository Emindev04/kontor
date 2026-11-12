// R1C1 reference style conversion.
import { describe, expect, it } from 'vitest'
import { fromR1C1, toR1C1 } from '../engine/r1c1'

describe('R1C1 references', () => {
  it('converts A1 to R1C1 relative to the cell', () => {
    // formula in B3 (r=2, c=1)
    expect(toR1C1('A1+$B$2+SUM(B1:C5)', 2, 1)).toBe('R[-2]C[-1]+R2C2+SUM(R[-2]C:R[2]C[1])')
    expect(toR1C1('A:A+3:3', 2, 1)).toBe('C[-1]:C[-1]+R:R')
    expect(toR1C1("'My Sheet'!B3", 2, 1)).toBe("'My Sheet'!RC")
  })
  it('converts R1C1 back to A1', () => {
    expect(fromR1C1('R[-2]C[-1]+R2C2+SUM(R[-2]C:R[2]C[1])', 2, 1)).toBe('A1+$B$2+SUM(B1:C5)')
    expect(fromR1C1('RC+ROUND(RC[1],2)&"R1C1"', 2, 1)).toBe('B3+ROUND(C3,2)&"R1C1"')
    expect(fromR1C1('SUM(C[-1]:C[-1])+SUM(R:R)', 2, 1)).toBe('SUM(A:A)+SUM(3:3)')
    expect(fromR1C1('A1*2', 2, 1)).toBe('A1*2')
  })
})
