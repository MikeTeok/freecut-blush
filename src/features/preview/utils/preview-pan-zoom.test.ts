import { describe, expect, it } from 'vitest'
import {
  clampPreviewPan,
  computePreviewZoomToCursor,
  PREVIEW_ZOOM_MAX,
  PREVIEW_ZOOM_MIN,
  type PreviewZoomToCursorParams,
} from './preview-pan-zoom'

const PROJECT_SIZE = { width: 1280, height: 720 }

function makeParams(overrides: Partial<PreviewZoomToCursorParams> = {}): PreviewZoomToCursorParams {
  return {
    cursorX: 740,
    cursorY: 410,
    wheelDeltaY: -100,
    zoom: 1,
    playerRect: { left: 100, top: 50, width: 1280, height: 720 },
    containerRect: { left: 0, top: 0, width: 1500, height: 900 },
    containerClientWidth: 1500,
    containerClientHeight: 900,
    scrollLeft: 0,
    scrollTop: 0,
    projectSize: PROJECT_SIZE,
    paddingHalf: 16,
    ...overrides,
  }
}

describe('clampPreviewPan', () => {
  it('keeps the player within reach of the container center', () => {
    expect(clampPreviewPan(10000, 1280, 1500)).toBe((1280 + 1500) / 2 - 32)
    expect(clampPreviewPan(-10000, 1280, 1500)).toBe(-((1280 + 1500) / 2 - 32))
    expect(clampPreviewPan(50, 1280, 1500)).toBe(50)
    expect(clampPreviewPan(-50, 1280, 1500)).toBe(-50)
  })
})

describe('computePreviewZoomToCursor', () => {
  it('keeps the canvas point under the cursor fixed while zooming in', () => {
    const params = makeParams()
    const result = computePreviewZoomToCursor(params)

    expect(result.zoom).toBeGreaterThan(1)
    expect(result.zoom).toBeLessThanOrEqual(PREVIEW_ZOOM_MAX)

    // Player left edge = centered layout position + pan. The canvas point
    // under the cursor must still map to canvas x = 640 after the zoom.
    const nextWidth = Math.round(PROJECT_SIZE.width * result.zoom)
    const cellWidth = Math.max(params.containerClientWidth, nextWidth + 32)
    const anchorLeft = (cellWidth - nextWidth) / 2
    const playerLeft = anchorLeft + result.panX
    expect((params.cursorX - playerLeft) / result.zoom).toBeCloseTo(640, 5)
  })

  it('keeps the cursor-anchored point fixed when zooming out', () => {
    const params = makeParams({ zoom: 2, wheelDeltaY: 100, cursorX: 300, cursorY: 200 })
    const result = computePreviewZoomToCursor(params)

    expect(result.zoom).toBeLessThan(2)

    const nextWidth = Math.round(PROJECT_SIZE.width * result.zoom)
    const cellWidth = Math.max(params.containerClientWidth, nextWidth + 32)
    const anchorLeft = (cellWidth - nextWidth) / 2
    const playerLeft = anchorLeft + result.panX
    const expectedCanvasX = (params.cursorX - params.playerRect.left) / 2
    expect((params.cursorX - playerLeft) / result.zoom).toBeCloseTo(expectedCanvasX, 5)
  })

  it('zooms in from auto-fit using 100% as the starting point', () => {
    const params = makeParams({
      zoom: -1,
      playerRect: { left: 200, top: 100, width: 960, height: 540 },
    })
    const result = computePreviewZoomToCursor(params)

    expect(result.zoom).toBeGreaterThan(1)
    // Fit scale = 960/1280 = 0.75, so canvas x under the cursor is 720.
    const nextWidth = Math.round(PROJECT_SIZE.width * result.zoom)
    const cellWidth = Math.max(params.containerClientWidth, nextWidth + 32)
    const anchorLeft = (cellWidth - nextWidth) / 2
    const playerLeft = anchorLeft + result.panX
    expect((params.cursorX - playerLeft) / result.zoom).toBeCloseTo(720, 5)
  })

  it('clamps the zoom to the configured limits', () => {
    expect(
      computePreviewZoomToCursor(makeParams({ zoom: PREVIEW_ZOOM_MAX, wheelDeltaY: -1000 })).zoom,
    ).toBe(PREVIEW_ZOOM_MAX)
    expect(
      computePreviewZoomToCursor(makeParams({ zoom: PREVIEW_ZOOM_MIN, wheelDeltaY: 1000 })).zoom,
    ).toBe(PREVIEW_ZOOM_MIN)
  })

  it('accounts for the scrolled container position when re-centering', () => {
    const params = makeParams({
      scrollLeft: 250,
      scrollTop: 100,
      zoom: 2,
      wheelDeltaY: -100,
      playerRect: { left: -90, top: -30, width: 2560, height: 1440 },
    })
    const result = computePreviewZoomToCursor(params)

    const nextWidth = Math.round(PROJECT_SIZE.width * result.zoom)
    const cellWidth = Math.max(params.containerClientWidth, nextWidth + 32)
    // Scrolled: the grid origin sits at containerRect.left - scrollLeft.
    const anchorLeft = params.containerRect.left - params.scrollLeft + (cellWidth - nextWidth) / 2
    const playerLeft = anchorLeft + result.panX
    const expectedCanvasX = (params.cursorX - params.playerRect.left) / 2
    expect((params.cursorX - playerLeft) / result.zoom).toBeCloseTo(expectedCanvasX, 5)
  })
})
