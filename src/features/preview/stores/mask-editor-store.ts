/**
 * Mask Editor Store
 *
 * Manages state for the interactive bezier path editor overlay used by
 * shape masks. Tracks which path/vertex is being edited and provides
 * live preview during drag operations.
 */

import { create } from 'zustand'
import type { MaskVertex, PromptPoint } from '@/types/masks'

/** A single MobileSAM prompt point, in canvas (project) pixel coords. */
export type AiMaskPromptPoint = PromptPoint

function normalizeVertexSelection(vertexIndices: number[]): number[] {
  return [...new Set(vertexIndices.filter((index) => Number.isInteger(index) && index >= 0))].sort(
    (a, b) => a - b,
  )
}

interface MaskEditorState {
  /** Whether mask editing mode is active */
  isEditing: boolean
  /** The path shape item currently being edited */
  editingItemId: string | null
  /** All selected vertices for batch toolbar actions */
  selectedVertexIndices: number[]
  /** Which vertex is selected for toolbar actions */
  selectedVertexIndex: number | null
  /** Which vertex index is being dragged (null if none) */
  draggingVertexIndex: number | null
  /** Which handle is being dragged: 'in' or 'out' (null if dragging vertex position) */
  draggingHandle: 'in' | 'out' | null
  /** Live preview of mask vertices during drag */
  previewVertices: MaskVertex[] | null
  /** Vertex index that is hovered (for visual feedback) */
  hoveredVertexIndex: number | null
  /** Hovered handle type */
  hoveredHandle: 'in' | 'out' | null

  // --- Pen tool state ---
  /** Whether the pen tool is active (drawing a new path) */
  penMode: boolean
  /** Vertices placed so far by the pen tool (open path) */
  penVertices: MaskVertex[]
  /** Whether currently dragging to create handles on the latest pen vertex */
  penDraggingHandle: boolean
  /** Current mouse position in normalized coords (for rubber-band line) */
  penCursorPos: [number, number] | null

  // --- Shape pen tool state ---
  /** Whether drawing a new shape mask path */
  shapePenMode: boolean
  /** Monotonic counter to request finishing the current pen path */
  finishPenRequestVersion: number
  /** Monotonic counter to request canceling the current pen path */
  cancelPenRequestVersion: number
  /** Monotonic counter to request converting the selected knot(s) */
  convertSelectedVertexRequestVersion: number
  /** Requested knot conversion mode for the current selection */
  convertSelectedVertexRequestMode: 'corner' | 'bezier' | null

  // --- AI mask mode ---
  /** Whether AI (MobileSAM) mask mode is active for the current editing item */
  aiMaskMode: boolean
  /** Prompt points the user has placed in the current AI session */
  aiPromptPoints: AiMaskPromptPoint[]
  /** Latest MobileSAM result, in project-resolution canvas space */
  aiMaskBitmap: OffscreenCanvas | null
  /** Whether the AI model is downloading/compiling or a segment is running */
  aiBusy: boolean
  /** Human-readable AI error, or null when idle */
  aiError: string | null
  /** Download progress of the MobileSAM weights (0..1), or null */
  aiDownloadProgress: number | null
  /** Monotonic counter to request committing the AI mask into a shape */
  commitAiMaskRequestVersion: number
}

interface MaskEditorActions {
  /** Enter path editing mode for a specific item */
  startEditing: (itemId: string) => void
  /** Exit mask editing mode */
  stopEditing: () => void
  /** Select multiple vertices for toolbar actions */
  selectVertices: (vertexIndices: number[], primaryIndex?: number | null) => void
  /** Select a vertex for toolbar actions */
  selectVertex: (vertexIndex: number | null) => void
  /** Start dragging a vertex position */
  startVertexDrag: (vertexIndex: number) => void
  /** Start dragging a bezier handle */
  startHandleDrag: (vertexIndex: number, handle: 'in' | 'out') => void
  /** Update preview during drag */
  updatePreview: (vertices: MaskVertex[]) => void
  /** End drag and clear preview */
  endDrag: () => void
  /** Set hover state */
  setHover: (vertexIndex: number | null, handle?: 'in' | 'out' | null) => void

  // --- Pen tool actions ---
  /** Enter pen drawing mode for an item */
  startPenMode: (itemId: string) => void
  /** Cancel pen mode without committing */
  cancelPenMode: () => void
  /** Add a vertex at normalized position (click without drag) */
  addPenVertex: (vertex: MaskVertex) => void
  /** Replace the current open pen path vertices */
  setPenVertices: (vertices: MaskVertex[]) => void
  /** Update the last pen vertex's out handle (during click+drag) */
  updatePenLastHandle: (outHandle: [number, number]) => void
  /** Set pen dragging state */
  setPenDragging: (dragging: boolean) => void
  /** Update cursor position for rubber-band line */
  setPenCursorPos: (pos: [number, number] | null) => void
  /** Get the pen vertices (for closing/committing the path) */
  getPenVertices: () => MaskVertex[]

  // --- Shape pen tool ---
  /** Enter shape pen mode (draws a new ShapeItem with shapeType='path') */
  startShapePenMode: () => void
  /** Request finishing the active pen path from external UI */
  requestFinishPenMode: () => void
  /** Request canceling the active pen path from external UI */
  requestCancelPenMode: () => void
  /** Request converting the selected knot selection from external UI */
  requestConvertSelectedVertex: (mode: 'corner' | 'bezier') => void

  // --- AI mask mode ---
  /** Enter AI mask mode for the current editing item */
  startAiMaskMode: () => void
  /** Exit AI mask mode and clear its transient state */
  stopAiMaskMode: () => void
  /** Set the AI session busy/idle flag */
  setAiBusy: (busy: boolean) => void
  /** Set the AI session error string (null clears) */
  setAiError: (error: string | null) => void
  /** Set the MobileSAM download progress (0..1, null clears) */
  setAiDownloadProgress: (progress: number | null) => void
  /** Set the latest AI mask bitmap */
  setAiMaskBitmap: (bitmap: OffscreenCanvas | null) => void
  /** Append a prompt point to the current AI session */
  addAiPromptPoint: (point: AiMaskPromptPoint) => void
  /** Remove the most recently placed prompt point */
  removeLastAiPromptPoint: () => void
  /** Reset AI prompt points + result without leaving AI mode */
  resetAiSession: () => void
  /** Request committing the current AI mask into a new shape */
  requestCommitAiMask: () => void
}

export const useMaskEditorStore = create<MaskEditorState & MaskEditorActions>()((set, get) => ({
  isEditing: false,
  editingItemId: null,
  selectedVertexIndices: [],
  selectedVertexIndex: null,
  draggingVertexIndex: null,
  draggingHandle: null,
  previewVertices: null,
  hoveredVertexIndex: null,
  hoveredHandle: null,
  penMode: false,
  penVertices: [],
  penDraggingHandle: false,
  penCursorPos: null,
  shapePenMode: false,
  finishPenRequestVersion: 0,
  cancelPenRequestVersion: 0,
  convertSelectedVertexRequestVersion: 0,
  convertSelectedVertexRequestMode: null,
  aiMaskMode: false,
  aiPromptPoints: [],
  aiMaskBitmap: null,
  aiBusy: false,
  aiError: null,
  aiDownloadProgress: null,
  commitAiMaskRequestVersion: 0,

  startEditing: (itemId) =>
    set({
      isEditing: true,
      editingItemId: itemId,
      selectedVertexIndices: [],
      selectedVertexIndex: null,
      draggingVertexIndex: null,
      draggingHandle: null,
      previewVertices: null,
      hoveredVertexIndex: null,
      hoveredHandle: null,
      penMode: false,
      shapePenMode: false,
      penVertices: [],
      penDraggingHandle: false,
      penCursorPos: null,
      finishPenRequestVersion: 0,
      cancelPenRequestVersion: 0,
      convertSelectedVertexRequestVersion: 0,
      convertSelectedVertexRequestMode: null,
      aiMaskMode: false,
      aiPromptPoints: [],
      aiMaskBitmap: null,
      aiBusy: false,
      aiError: null,
      aiDownloadProgress: null,
      commitAiMaskRequestVersion: 0,
    }),

  stopEditing: () =>
    set({
      isEditing: false,
      editingItemId: null,
      selectedVertexIndices: [],
      selectedVertexIndex: null,
      draggingVertexIndex: null,
      draggingHandle: null,
      previewVertices: null,
      hoveredVertexIndex: null,
      hoveredHandle: null,
      penMode: false,
      shapePenMode: false,
      penVertices: [],
      penDraggingHandle: false,
      penCursorPos: null,
      finishPenRequestVersion: 0,
      cancelPenRequestVersion: 0,
      convertSelectedVertexRequestVersion: 0,
      convertSelectedVertexRequestMode: null,
      aiMaskMode: false,
      aiPromptPoints: [],
      aiMaskBitmap: null,
      aiBusy: false,
      aiError: null,
      aiDownloadProgress: null,
      commitAiMaskRequestVersion: 0,
    }),

  selectVertices: (vertexIndices, primaryIndex = null) =>
    set(() => {
      const selectedVertexIndices = normalizeVertexSelection(vertexIndices)
      const resolvedPrimaryIndex =
        selectedVertexIndices.length === 0
          ? null
          : primaryIndex !== null && selectedVertexIndices.includes(primaryIndex)
            ? primaryIndex
            : (selectedVertexIndices[selectedVertexIndices.length - 1] ?? null)
      return {
        selectedVertexIndices,
        selectedVertexIndex: resolvedPrimaryIndex,
      }
    }),

  selectVertex: (vertexIndex) =>
    set({
      selectedVertexIndices: vertexIndex === null ? [] : [vertexIndex],
      selectedVertexIndex: vertexIndex,
    }),

  startVertexDrag: (vertexIndex) =>
    set((state) => ({
      selectedVertexIndices: state.selectedVertexIndices.includes(vertexIndex)
        ? state.selectedVertexIndices
        : [vertexIndex],
      selectedVertexIndex: vertexIndex,
      draggingVertexIndex: vertexIndex,
      draggingHandle: null,
    })),

  startHandleDrag: (vertexIndex, handle) =>
    set((state) => ({
      selectedVertexIndices: state.selectedVertexIndices.includes(vertexIndex)
        ? state.selectedVertexIndices
        : [vertexIndex],
      selectedVertexIndex: vertexIndex,
      draggingVertexIndex: vertexIndex,
      draggingHandle: handle,
    })),

  updatePreview: (vertices) => set({ previewVertices: vertices }),

  endDrag: () =>
    set({
      draggingVertexIndex: null,
      draggingHandle: null,
      previewVertices: null,
    }),

  setHover: (vertexIndex, handle = null) =>
    set({ hoveredVertexIndex: vertexIndex, hoveredHandle: handle }),

  // --- Pen tool ---
  startPenMode: (itemId) =>
    set({
      isEditing: true,
      editingItemId: itemId,
      penMode: true,
      penVertices: [],
      penDraggingHandle: false,
      penCursorPos: null,
      selectedVertexIndices: [],
      selectedVertexIndex: null,
      draggingVertexIndex: null,
      draggingHandle: null,
      previewVertices: null,
      hoveredVertexIndex: null,
      hoveredHandle: null,
      finishPenRequestVersion: 0,
      cancelPenRequestVersion: 0,
      convertSelectedVertexRequestVersion: 0,
      convertSelectedVertexRequestMode: null,
      aiMaskMode: false,
      aiPromptPoints: [],
      aiMaskBitmap: null,
      aiBusy: false,
      aiError: null,
      aiDownloadProgress: null,
      commitAiMaskRequestVersion: 0,
    }),

  cancelPenMode: () =>
    set({
      penMode: false,
      shapePenMode: false,
      penVertices: [],
      penDraggingHandle: false,
      penCursorPos: null,
      isEditing: false,
      editingItemId: null,
      selectedVertexIndices: [],
      selectedVertexIndex: null,
      draggingVertexIndex: null,
      draggingHandle: null,
      previewVertices: null,
      hoveredVertexIndex: null,
      hoveredHandle: null,
      finishPenRequestVersion: 0,
      cancelPenRequestVersion: 0,
      convertSelectedVertexRequestVersion: 0,
      convertSelectedVertexRequestMode: null,
    }),

  addPenVertex: (vertex) =>
    set((state) => ({
      penVertices: [...state.penVertices, vertex],
    })),

  setPenVertices: (vertices) => set({ penVertices: vertices }),

  updatePenLastHandle: (outHandle) =>
    set((state) => {
      const verts = [...state.penVertices]
      const last = verts[verts.length - 1]
      if (!last) return state
      verts[verts.length - 1] = {
        ...last,
        outHandle,
        inHandle: [-outHandle[0], -outHandle[1]],
        tangentMode: 'smooth',
      }
      return { penVertices: verts }
    }),

  setPenDragging: (dragging) => set({ penDraggingHandle: dragging }),

  setPenCursorPos: (pos) => set({ penCursorPos: pos }),

  getPenVertices: () => get().penVertices,

  startShapePenMode: () =>
    set({
      isEditing: true,
      editingItemId: null,
      penMode: true,
      shapePenMode: true,
      penVertices: [],
      penDraggingHandle: false,
      penCursorPos: null,
      selectedVertexIndices: [],
      selectedVertexIndex: null,
      draggingVertexIndex: null,
      draggingHandle: null,
      previewVertices: null,
      hoveredVertexIndex: null,
      hoveredHandle: null,
      finishPenRequestVersion: 0,
      cancelPenRequestVersion: 0,
      convertSelectedVertexRequestVersion: 0,
      convertSelectedVertexRequestMode: null,
    }),

  requestFinishPenMode: () =>
    set((state) => ({
      finishPenRequestVersion: state.finishPenRequestVersion + 1,
    })),

  requestCancelPenMode: () =>
    set((state) => ({
      cancelPenRequestVersion: state.cancelPenRequestVersion + 1,
    })),

  requestConvertSelectedVertex: (mode) =>
    set((state) => ({
      convertSelectedVertexRequestVersion: state.convertSelectedVertexRequestVersion + 1,
      convertSelectedVertexRequestMode: mode,
    })),

  // --- AI mask mode ---
  /**
   * Enter standalone AI mask mode. Unlike the old flow (launched from path
   * editing), AI mask creates a brand-new shape from a segmentation, so it
   * does not need (or keep) an editing item — the overlay runs over the full
   * canvas, mirroring shape pen mode.
   */
  startAiMaskMode: () =>
    set((state) => {
      if (state.aiMaskMode) return state
      return {
        isEditing: true,
        editingItemId: null,
        selectedVertexIndices: [],
        selectedVertexIndex: null,
        draggingVertexIndex: null,
        draggingHandle: null,
        previewVertices: null,
        hoveredVertexIndex: null,
        hoveredHandle: null,
        penMode: false,
        shapePenMode: false,
        penVertices: [],
        penDraggingHandle: false,
        penCursorPos: null,
        finishPenRequestVersion: 0,
        cancelPenRequestVersion: 0,
        convertSelectedVertexRequestVersion: 0,
        convertSelectedVertexRequestMode: null,
        aiMaskMode: true,
        aiPromptPoints: [],
        aiMaskBitmap: null,
        aiError: null,
        aiDownloadProgress: null,
        aiBusy: false,
      }
    }),

  stopAiMaskMode: () =>
    set({
      aiMaskMode: false,
      aiPromptPoints: [],
      aiMaskBitmap: null,
      aiBusy: false,
      aiError: null,
      aiDownloadProgress: null,
      commitAiMaskRequestVersion: 0,
      isEditing: false,
      editingItemId: null,
      selectedVertexIndices: [],
      selectedVertexIndex: null,
      draggingVertexIndex: null,
      draggingHandle: null,
      previewVertices: null,
      hoveredVertexIndex: null,
      hoveredHandle: null,
      penMode: false,
      shapePenMode: false,
      penVertices: [],
      penDraggingHandle: false,
      penCursorPos: null,
      finishPenRequestVersion: 0,
      cancelPenRequestVersion: 0,
      convertSelectedVertexRequestVersion: 0,
      convertSelectedVertexRequestMode: null,
    }),

  setAiBusy: (busy) => set({ aiBusy: busy }),

  setAiError: (error) => set({ aiError: error }),

  setAiDownloadProgress: (progress) => set({ aiDownloadProgress: progress }),

  setAiMaskBitmap: (bitmap) => set({ aiMaskBitmap: bitmap }),

  addAiPromptPoint: (point) =>
    set((state) => ({ aiPromptPoints: [...state.aiPromptPoints, point] })),

  removeLastAiPromptPoint: () =>
    set((state) => ({ aiPromptPoints: state.aiPromptPoints.slice(0, -1) })),

  resetAiSession: () =>
    set({
      aiPromptPoints: [],
      aiMaskBitmap: null,
      aiError: null,
    }),

  requestCommitAiMask: () =>
    set((state) => ({
      commitAiMaskRequestVersion: state.commitAiMaskRequestVersion + 1,
    })),
}))
