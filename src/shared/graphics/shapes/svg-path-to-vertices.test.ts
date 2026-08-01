// @vitest-environment node

import { describe, expect, it } from 'vite-plus/test'
import {
  normalizeMaskVertices,
  parseSvgPathToMaskVertices,
  svgPathToMaskVertices,
} from './svg-path-to-vertices'

describe('parseSvgPathToMaskVertices', () => {
  it('parses a sharp rectangle into four anchors and marks it closed', () => {
    const { vertices, closed } = parseSvgPathToMaskVertices('M 0 0 L 10 0 L 10 10 L 0 10 Z')
    expect(closed).toBe(true)
    expect(vertices).toHaveLength(4)
    expect(vertices.map((vertex) => vertex.position)).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ])
    expect(vertices.every((vertex) => vertex.inHandle[0] === 0 && vertex.inHandle[1] === 0)).toBe(
      true,
    )
    expect(vertices.every((vertex) => vertex.outHandle[0] === 0 && vertex.outHandle[1] === 0)).toBe(
      true,
    )
  })

  it('parses cubic segments into anchored handles', () => {
    const { vertices } = parseSvgPathToMaskVertices('M 0 0 C 10 0 10 10 20 10 Z')
    expect(vertices).toHaveLength(2)
    // cp1 = position + outHandle, so outHandle = c1 - start
    expect(vertices[0]!.outHandle).toEqual([10, 0])
    // inHandle = c2 - end
    expect(vertices[1]!.inHandle).toEqual([-10, 0])
  })

  it('lifts quadratic segments to equivalent cubics', () => {
    const { vertices } = parseSvgPathToMaskVertices('M 0 0 Q 10 0 20 0 Z')
    expect(vertices).toHaveLength(2)
    // c1 = start + (2/3)(q - start)
    expect(vertices[0]!.outHandle[0]).toBeCloseTo(20 / 3, 6)
    expect(vertices[0]!.outHandle[1]).toBeCloseTo(0, 6)
    // c2 = end + (2/3)(q - end)
    expect(vertices[1]!.inHandle[0]).toBeCloseTo(-20 / 3, 6)
    expect(vertices[1]!.inHandle[1]).toBeCloseTo(0, 6)
  })

  it('approximates arcs with cubic segments and merges the exact return to start', () => {
    const { vertices, closed } = parseSvgPathToMaskVertices(
      'M 50 0 A 50 50 0 1 1 50 100 A 50 50 0 1 1 50 0 Z',
    )
    expect(closed).toBe(true)
    // First vertex starts at (50, 0); the second arc returns exactly to it and
    // merges, so the loop has anchors only from the two 180-degree arc splits.
    expect(vertices[0]!.position).toEqual([50, 0])
    expect(vertices[0]!.outHandle[0]).not.toBe(0)
    expect(vertices[vertices.length - 1]!.inHandle[0]).not.toBe(0)
  })

  it('handles relative commands', () => {
    const { vertices } = parseSvgPathToMaskVertices('m 0 0 l 10 0 l 0 10 l -10 0 z')
    expect(vertices.map((vertex) => vertex.position)).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ])
  })

  it('treats implicit lineto pairs after moveto as lineto vertices', () => {
    const { vertices } = parseSvgPathToMaskVertices('M 0 0 10 0 10 10 Z')
    expect(vertices.map((vertex) => vertex.position)).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
    ])
  })

  it('keeps an unclosed path open', () => {
    const { closed } = parseSvgPathToMaskVertices('M 0 0 L 10 0 L 10 10')
    expect(closed).toBe(false)
  })

  it('normalizes vertices relative to item dimensions', () => {
    const { vertices } = parseSvgPathToMaskVertices('M 0 0 L 10 0 L 10 10 L 0 10 Z')
    const normalized = normalizeMaskVertices(vertices, 20, 10)
    expect(normalized.map((vertex) => vertex.position)).toEqual([
      [0, 0],
      [0.5, 0],
      [0.5, 1],
      [0, 1],
    ])
  })

  it('svgPathToMaskVertices parses and normalizes in one step', () => {
    const result = svgPathToMaskVertices('M 0 0 L 10 0 L 10 10 L 0 10 Z', 20, 10)
    expect(result.closed).toBe(true)
    expect(result.vertices).toHaveLength(4)
    expect(result.vertices[1]!.position).toEqual([0.5, 0])
  })
})
