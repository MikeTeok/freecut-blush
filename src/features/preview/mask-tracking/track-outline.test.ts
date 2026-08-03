import { describe, expect, it } from 'vite-plus/test'
import { sampleClosedOutlineByArcLength } from './track-outline'

function distance(a: [number, number], b: [number, number]): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1])
}

describe('sampleClosedOutlineByArcLength', () => {
  it('returns an empty list when count is zero', () => {
    expect(
      sampleClosedOutlineByArcLength(
        [
          [0, 0],
          [1, 0],
        ],
        0,
      ),
    ).toEqual([])
  })

  it('returns an empty list for an empty outline', () => {
    expect(sampleClosedOutlineByArcLength([], 8)).toEqual([])
  })

  it('resamples a square outline to exactly the requested count', () => {
    const square: Array<[number, number]> = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]
    const sampled = sampleClosedOutlineByArcLength(square, 12)
    expect(sampled).toHaveLength(12)
    expect(sampled[0]).toEqual([0, 0])
  })

  it('keeps the first input point as vertex 0 for stability across calls', () => {
    const square: Array<[number, number]> = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]
    const a = sampleClosedOutlineByArcLength(square, 24)
    const b = sampleClosedOutlineByArcLength(square, 24)
    expect(a[0]).toEqual(b[0])
    expect(a[0]).toEqual([0, 0])
  })

  it('distributes points uniformly by arc length', () => {
    const square: Array<[number, number]> = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]
    const sampled = sampleClosedOutlineByArcLength(square, 16)
    const spacing: number[] = []
    for (let i = 0; i < sampled.length; i++) {
      spacing.push(distance(sampled[i]!, sampled[(i + 1) % sampled.length]!))
    }
    const min = Math.min(...spacing)
    const max = Math.max(...spacing)
    // perimeter = 40, so each span should be 2.5; tolerance covers rounding
    expect(max - min).toBeLessThan(0.000001)
    expect(spacing[0]).toBeCloseTo(2.5, 5)
  })

  it('handles a degenerate single point', () => {
    const sampled = sampleClosedOutlineByArcLength([[5, 5]], 6)
    expect(sampled).toEqual([
      [5, 5],
      [5, 5],
      [5, 5],
      [5, 5],
      [5, 5],
      [5, 5],
    ])
  })

  it('handles a zero-length outline', () => {
    const sampled = sampleClosedOutlineByArcLength(
      [
        [3, 3],
        [3, 3],
        [3, 3],
      ],
      4,
    )
    expect(sampled).toHaveLength(4)
    expect(sampled.every(([x, y]) => x === 3 && y === 3)).toBe(true)
  })
})
