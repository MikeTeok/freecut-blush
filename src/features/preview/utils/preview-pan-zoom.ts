import { getPreviewPlayerSize } from './preview-pixel-snap'

export const PREVIEW_ZOOM_MIN = 0.1
export const PREVIEW_ZOOM_MAX = 8

interface PanZoomRect {
  left: number
  top: number
  width: number
  height: number
}

export interface PreviewZoomToCursorParams {
  /** Cursor position in viewport coordinates. */
  cursorX: number
  cursorY: number
  /** Wheel deltaY — negative zooms in, positive zooms out. */
  wheelDeltaY: number
  zoom: number
  /**
   * Current player container rect in viewport coordinates. Already includes
   * the current centering, scroll, and pan offsets.
   */
  playerRect: PanZoomRect
  /** Stage (scroll container) rect in viewport coordinates. */
  containerRect: PanZoomRect
  /** Scroll container client width in CSS px. */
  containerClientWidth: number
  /** Scroll container client height in CSS px. */
  containerClientHeight: number
  scrollLeft: number
  scrollTop: number
  projectSize: { width: number; height: number }
  /** Half of the stage padding used by the centering grid. */
  paddingHalf: number
}

export interface PreviewZoomToCursorResult {
  zoom: number
  panX: number
  panY: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Clamp a pan offset so the player can never be dragged entirely out of
 * reach: the player's center stays within one player size of the container
 * center, with a small margin left on screen.
 */
export function clampPreviewPan(pan: number, playerSize: number, containerSize: number): number {
  const limit = Math.max(0, (playerSize + containerSize) / 2 - 32)
  return clamp(pan, -limit, limit)
}

/**
 * Compute the zoom and pan that keep the canvas point under the cursor fixed
 * on screen while zooming (zoom-to-cursor). The player is centered inside a
 * min-w-full grid that grows once the player exceeds the container, so the
 * new layout position of the player is derived from the container metrics and
 * scroll offsets.
 */
export function computePreviewZoomToCursor(
  params: PreviewZoomToCursorParams,
): PreviewZoomToCursorResult {
  const { cursorX, cursorY, wheelDeltaY, zoom, playerRect, projectSize } = params

  const scaleBefore = zoom === -1 ? playerRect.width / projectSize.width : zoom
  const canvasX = (cursorX - playerRect.left) / scaleBefore
  const canvasY = (cursorY - playerRect.top) / scaleBefore

  const factor = clamp(Math.exp(-wheelDeltaY * 0.002), 0.5, 2)
  const baseZoom = zoom === -1 ? 1 : zoom
  const nextZoom = clamp(baseZoom * factor, PREVIEW_ZOOM_MIN, PREVIEW_ZOOM_MAX)

  const nextPlayerSize = getPreviewPlayerSize({
    sourceSize: projectSize,
    containerSize: {
      width: params.containerClientWidth,
      height: params.containerClientHeight,
    },
    zoom: nextZoom,
  })

  // Border-box sizing: the grid is at least as wide as the container and
  // grows once the player + padding exceed it. The padding cancels out of the
  // centered player box, leaving `(cell - player) / 2`.
  const cellWidth = Math.max(
    params.containerClientWidth,
    nextPlayerSize.width + params.paddingHalf * 2,
  )
  const cellHeight = Math.max(
    params.containerClientHeight,
    nextPlayerSize.height + params.paddingHalf * 2,
  )
  const anchorLeft =
    params.containerRect.left - params.scrollLeft + (cellWidth - nextPlayerSize.width) / 2
  const anchorTop =
    params.containerRect.top - params.scrollTop + (cellHeight - nextPlayerSize.height) / 2

  const panX = clampPreviewPan(
    cursorX - anchorLeft - canvasX * nextZoom,
    nextPlayerSize.width,
    params.containerClientWidth,
  )
  const panY = clampPreviewPan(
    cursorY - anchorTop - canvasY * nextZoom,
    nextPlayerSize.height,
    params.containerClientHeight,
  )

  return { zoom: nextZoom, panX, panY }
}
