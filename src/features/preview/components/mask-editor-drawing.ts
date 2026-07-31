import type { MaskVertex } from '@/types/masks'
import { drawSelectedVertexRing } from './mask-editor-overlay-utils'

type VertexToScreen = (vertex: MaskVertex) => [number, number]
type HandleToScreen = (vertex: MaskVertex, handleType: 'in' | 'out') => [number, number]

export interface MaskSelectionMarquee {
  left: number
  top: number
  width: number
  height: number
}

export function drawMaskSegment(
  ctx: CanvasRenderingContext2D,
  curr: MaskVertex,
  next: MaskVertex,
  vertexToScreen: VertexToScreen,
  handleToScreen: HandleToScreen,
): void {
  const outHandle = curr.outHandle
  const inHandle = next.inHandle
  const isStraight =
    outHandle[0] === 0 && outHandle[1] === 0 && inHandle[0] === 0 && inHandle[1] === 0

  if (isStraight) {
    const [nextX, nextY] = vertexToScreen(next)
    ctx.lineTo(nextX, nextY)
    return
  }

  const [cp1x, cp1y] = handleToScreen(curr, 'out')
  const [cp2x, cp2y] = handleToScreen(next, 'in')
  const [nextX, nextY] = vertexToScreen(next)
  ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, nextX, nextY)
}

export function drawMaskSelectionMarquee(
  ctx: CanvasRenderingContext2D,
  marquee: MaskSelectionMarquee | null,
): void {
  if (!marquee || (marquee.width < 1 && marquee.height < 1)) {
    return
  }

  ctx.save()
  ctx.beginPath()
  ctx.rect(marquee.left, marquee.top, marquee.width, marquee.height)
  ctx.fillStyle = 'rgba(34, 211, 238, 0.12)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(103, 232, 249, 0.95)'
  ctx.lineWidth = 1
  ctx.setLineDash([6, 4])
  ctx.stroke()
  ctx.restore()
}

interface DrawMaskVertexWithHandlesOptions {
  ctx: CanvasRenderingContext2D
  vertex: MaskVertex
  index: number
  vertexRadius: number
  handleRadius: number
  vertexToScreen: VertexToScreen
  handleToScreen: HandleToScreen
  draggingVertexIndex: number | null
  draggingHandle: 'in' | 'out' | null
  selectedVertexIndices: readonly number[]
  hoveredVertexIndex: number | null
  hoveredHandle: 'in' | 'out' | null
  /** Draw a numbered badge next to the vertex matching the keyframe panel's "Vertex N" rows */
  showIndexLabel?: boolean
  /** Vertex has a path-vertex keyframe at the current playhead */
  isKeyedAtCurrentFrame?: boolean
}

function drawVertexIndexBadge(
  ctx: CanvasRenderingContext2D,
  vertexX: number,
  vertexY: number,
  index: number,
  isKeyedAtCurrentFrame: boolean,
): void {
  const labelX = vertexX + 10
  const labelY = vertexY - 10
  ctx.beginPath()
  ctx.arc(labelX, labelY, 7, 0, Math.PI * 2)
  ctx.fillStyle = isKeyedAtCurrentFrame ? '#f59e0b' : 'rgba(2, 6, 23, 0.85)'
  ctx.fill()
  ctx.strokeStyle = isKeyedAtCurrentFrame ? '#fbbf24' : '#22d3ee'
  ctx.lineWidth = 1
  ctx.stroke()
  if (typeof ctx.fillText === 'function') {
    ctx.font = '600 8px Inter, ui-sans-serif, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#ffffff'
    ctx.fillText(String(index + 1), labelX, labelY + 0.5)
  }
}

export function drawMaskVertexWithHandles({
  ctx,
  vertex,
  index,
  vertexRadius,
  handleRadius,
  vertexToScreen,
  handleToScreen,
  draggingVertexIndex,
  draggingHandle,
  selectedVertexIndices,
  hoveredVertexIndex,
  hoveredHandle,
  showIndexLabel = false,
  isKeyedAtCurrentFrame = false,
}: DrawMaskVertexWithHandlesOptions): void {
  const [vertexX, vertexY] = vertexToScreen(vertex)
  const hasInHandle = vertex.inHandle[0] !== 0 || vertex.inHandle[1] !== 0
  const hasOutHandle = vertex.outHandle[0] !== 0 || vertex.outHandle[1] !== 0

  if (hasInHandle) {
    const [handleX, handleY] = handleToScreen(vertex, 'in')
    ctx.beginPath()
    ctx.moveTo(vertexX, vertexY)
    ctx.lineTo(handleX, handleY)
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.5)'
    ctx.lineWidth = 1
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(handleX, handleY, handleRadius, 0, Math.PI * 2)
    const isHoveredIn = hoveredVertexIndex === index && hoveredHandle === 'in'
    ctx.fillStyle = isHoveredIn ? '#22d3ee' : 'rgba(34, 211, 238, 0.6)'
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1
    ctx.stroke()
  }

  if (hasOutHandle) {
    const [handleX, handleY] = handleToScreen(vertex, 'out')
    ctx.beginPath()
    ctx.moveTo(vertexX, vertexY)
    ctx.lineTo(handleX, handleY)
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.5)'
    ctx.lineWidth = 1
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(handleX, handleY, handleRadius, 0, Math.PI * 2)
    const isHoveredOut = hoveredVertexIndex === index && hoveredHandle === 'out'
    ctx.fillStyle = isHoveredOut ? '#22d3ee' : 'rgba(34, 211, 238, 0.6)'
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1
    ctx.stroke()
  }

  const isActive = draggingVertexIndex === index && draggingHandle === null
  const isSelected = selectedVertexIndices.includes(index)
  const isHovered = hoveredVertexIndex === index && hoveredHandle === null
  if (isSelected) {
    drawSelectedVertexRing(ctx, vertexX, vertexY)
  }

  ctx.beginPath()
  ctx.arc(vertexX, vertexY, vertexRadius, 0, Math.PI * 2)
  ctx.fillStyle = isSelected
    ? isActive
      ? '#fde68a'
      : '#fef3c7'
    : isActive
      ? '#fff'
      : isHovered
        ? '#22d3ee'
        : '#0e7490'
  ctx.fill()
  ctx.strokeStyle = isSelected ? '#f59e0b' : '#22d3ee'
  ctx.lineWidth = isSelected ? 2.5 : 1.5
  ctx.stroke()

  // Numbered badge matching the keyframe panel's "Vertex N" rows. Amber when
  // the vertex has a path-vertex keyframe at the current playhead.
  if (showIndexLabel) {
    drawVertexIndexBadge(ctx, vertexX, vertexY, index, isKeyedAtCurrentFrame)
  }
}
