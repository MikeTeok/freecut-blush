import { create } from 'zustand'
import type {
  KeyframeRef,
  KeyframeClipboard,
  AnimatableProperty,
  Keyframe,
  VectorAnimatableProperty,
  VectorKeyframe,
} from '@/types/keyframe'
import { useKeyframesStore } from './keyframes-store'
import { removeKeyframes, removeVectorKeyframe } from './actions/keyframe-actions'

/**
 * Keyframe selection state - tracks selected keyframes and clipboard.
 * Separate from keyframes-store to keep selection ephemeral (not saved/restored).
 */

interface KeyframeSelectionState {
  /** Currently selected keyframes */
  selectedKeyframes: KeyframeRef[]
  /** Clipboard for copy/paste operations */
  clipboard: KeyframeClipboard | null
  /** Whether we're in "cut" mode (delete on paste) */
  isCut: boolean
}

interface KeyframeSelectionActions {
  // Selection operations
  selectKeyframe: (ref: KeyframeRef) => void
  selectKeyframes: (refs: KeyframeRef[]) => void
  addToSelection: (ref: KeyframeRef) => void
  addMultipleToSelection: (refs: KeyframeRef[]) => void
  removeFromSelection: (ref: KeyframeRef) => void
  toggleSelection: (ref: KeyframeRef) => void
  clearSelection: () => void
  selectAllForProperty: (itemId: string, property: AnimatableProperty) => void
  selectAllForItem: (itemId: string) => void

  // Clipboard operations
  copySelectedKeyframes: () => void
  cutSelectedKeyframes: () => void
  clearClipboard: () => void

  // Read-only helpers
  isKeyframeSelected: (ref: KeyframeRef) => boolean
  getSelectedKeyframesForItem: (itemId: string) => KeyframeRef[]
  getSelectedKeyframesForProperty: (itemId: string, property: AnimatableProperty) => KeyframeRef[]
  hasSelection: () => boolean
  hasClipboard: () => boolean
}

/**
 * Compare two keyframe refs for equality
 */
function refsEqual(a: KeyframeRef, b: KeyframeRef): boolean {
  return a.itemId === b.itemId && a.property === b.property && a.keyframeId === b.keyframeId
}

/**
 * Check if a ref is in an array
 */
function refInArray(ref: KeyframeRef, arr: KeyframeRef[]): boolean {
  return arr.some((r) => refsEqual(r, ref))
}

function getVectorSelectionMapping(property: AnimatableProperty): {
  property: VectorAnimatableProperty
  axis: 'x' | 'y'
} | null {
  if (property === 'x') return { property: 'position', axis: 'x' }
  if (property === 'y') return { property: 'position', axis: 'y' }
  if (property === 'width') return { property: 'scale', axis: 'x' }
  if (property === 'height') return { property: 'scale', axis: 'y' }
  if (property === 'anchorX') return { property: 'anchor', axis: 'x' }
  if (property === 'anchorY') return { property: 'anchor', axis: 'y' }
  return null
}

function getStoredVectorId(keyframeId: string, axis: 'x' | 'y'): string {
  return axis === 'y' && keyframeId.endsWith(':y') ? keyframeId.slice(0, -2) : keyframeId
}

/** Scalar proxy property for each axis of a vector transform lane. */
const VECTOR_AXIS_PROXY_PROPERTY: Record<
  VectorAnimatableProperty,
  { x: AnimatableProperty; y: AnimatableProperty }
> = {
  position: { x: 'x', y: 'y' },
  scale: { x: 'width', y: 'height' },
  anchor: { x: 'anchorX', y: 'anchorY' },
}

export const useKeyframeSelectionStore = create<
  KeyframeSelectionState & KeyframeSelectionActions
>()((set, get) => ({
  // State
  selectedKeyframes: [],
  clipboard: null,
  isCut: false,

  // Select single keyframe (replaces selection)
  selectKeyframe: (ref) =>
    set({
      selectedKeyframes: [ref],
    }),

  // Select multiple keyframes (replaces selection)
  selectKeyframes: (refs) =>
    set({
      selectedKeyframes: refs,
    }),

  // Add single keyframe to selection
  addToSelection: (ref) =>
    set((state) => {
      if (refInArray(ref, state.selectedKeyframes)) {
        return state // Already selected
      }
      return {
        selectedKeyframes: [...state.selectedKeyframes, ref],
      }
    }),

  // Add multiple keyframes to selection
  addMultipleToSelection: (refs) =>
    set((state) => {
      const newRefs = refs.filter((r) => !refInArray(r, state.selectedKeyframes))
      if (newRefs.length === 0) return state
      return {
        selectedKeyframes: [...state.selectedKeyframes, ...newRefs],
      }
    }),

  // Remove single keyframe from selection
  removeFromSelection: (ref) =>
    set((state) => ({
      selectedKeyframes: state.selectedKeyframes.filter((r) => !refsEqual(r, ref)),
    })),

  // Toggle single keyframe selection
  toggleSelection: (ref) =>
    set((state) => {
      const isSelected = refInArray(ref, state.selectedKeyframes)
      if (isSelected) {
        return {
          selectedKeyframes: state.selectedKeyframes.filter((r) => !refsEqual(r, ref)),
        }
      }
      return {
        selectedKeyframes: [...state.selectedKeyframes, ref],
      }
    }),

  // Clear all selection
  clearSelection: () =>
    set({
      selectedKeyframes: [],
    }),

  // Select all keyframes for a property
  selectAllForProperty: (itemId, property) => {
    const keyframesState = useKeyframesStore.getState()
    const itemKeyframes = keyframesState.getKeyframesForItem(itemId)
    if (!itemKeyframes) return

    const propKeyframes = itemKeyframes.properties.find((p) => p.property === property)
    if (!propKeyframes) {
      const vector = getVectorSelectionMapping(property)
      const vectorProperty = vector
        ? itemKeyframes.vectorProperties?.find(
            (candidate) => candidate.property === vector.property,
          )
        : undefined
      if (!vector || !vectorProperty) return
      set({
        selectedKeyframes: vectorProperty.keyframes.map((keyframe) => ({
          itemId,
          property,
          keyframeId: vector.axis === 'y' ? `${keyframe.id}:y` : keyframe.id,
        })),
      })
      return
    }

    const refs: KeyframeRef[] = propKeyframes.keyframes.map((kf) => ({
      itemId,
      property,
      keyframeId: kf.id,
    }))

    set({ selectedKeyframes: refs })
  },

  // Select all keyframes for an item
  selectAllForItem: (itemId) => {
    const keyframesState = useKeyframesStore.getState()
    const itemKeyframes = keyframesState.getKeyframesForItem(itemId)
    if (!itemKeyframes) return

    const refs: KeyframeRef[] = []
    for (const propKf of itemKeyframes.properties) {
      for (const kf of propKf.keyframes) {
        refs.push({
          itemId,
          property: propKf.property,
          keyframeId: kf.id,
        })
      }
    }
    for (const vectorProperty of itemKeyframes.vectorProperties ?? []) {
      const property =
        vectorProperty.property === 'position'
          ? 'x'
          : vectorProperty.property === 'scale'
            ? 'width'
            : 'anchorX'
      for (const keyframe of vectorProperty.keyframes) {
        refs.push({ itemId, property, keyframeId: keyframe.id })
      }
    }

    set({ selectedKeyframes: refs })
  },

  // Copy selected keyframes to clipboard
  copySelectedKeyframes: () => {
    const { selectedKeyframes } = get()
    if (selectedKeyframes.length === 0) return

    const keyframesState = useKeyframesStore.getState()

    const scalarEntries: Array<{ ref: KeyframeRef; keyframe: Keyframe }> = []
    // Vector keyframes are coupled (both axes share one stored keyframe). Copy
    // the full {x, y} pair regardless of which axis diamond was selected so
    // pasting restores both axes instead of only the picked one.
    const vectorEntries = new Map<
      string,
      {
        itemId: string
        proxyX: AnimatableProperty
        proxyY: AnimatableProperty
        keyframe: VectorKeyframe
      }
    >()
    let minFrame = Infinity

    for (const ref of selectedKeyframes) {
      const itemKeyframes = keyframesState.getKeyframesForItem(ref.itemId)
      if (!itemKeyframes) continue

      const scalarKeyframe = itemKeyframes.properties
        .find((property) => property.property === ref.property)
        ?.keyframes.find((keyframe) => keyframe.id === ref.keyframeId)
      if (scalarKeyframe) {
        scalarEntries.push({ ref, keyframe: scalarKeyframe })
        minFrame = Math.min(minFrame, scalarKeyframe.frame)
        continue
      }

      const vector = getVectorSelectionMapping(ref.property)
      if (!vector) continue
      const vectorKeyframe = itemKeyframes.vectorProperties
        ?.find((candidate) => candidate.property === vector.property)
        ?.keyframes.find(
          (candidate) => candidate.id === getStoredVectorId(ref.keyframeId, vector.axis),
        )
      if (!vectorKeyframe) continue

      const key = `${ref.itemId}:${vector.property}:${vectorKeyframe.id}`
      if (!vectorEntries.has(key)) {
        vectorEntries.set(key, {
          itemId: ref.itemId,
          proxyX: VECTOR_AXIS_PROXY_PROPERTY[vector.property].x,
          proxyY: VECTOR_AXIS_PROXY_PROPERTY[vector.property].y,
          keyframe: vectorKeyframe,
        })
      }
      minFrame = Math.min(minFrame, vectorKeyframe.frame)
    }

    if (scalarEntries.length === 0 && vectorEntries.size === 0) return

    const clipboardKeyframes: KeyframeClipboard['keyframes'] = scalarEntries.map(
      ({ ref, keyframe }) => ({
        property: ref.property,
        frame: keyframe.frame - minFrame, // Normalize to 0-based
        value: keyframe.value,
        easing: keyframe.easing,
        easingConfig: keyframe.easingConfig,
      }),
    )
    const sourceRefs: KeyframeRef[] = scalarEntries.map(({ ref }) => ({ ...ref }))
    for (const { itemId, proxyX, proxyY, keyframe } of vectorEntries.values()) {
      clipboardKeyframes.push(
        {
          property: proxyX,
          frame: keyframe.frame - minFrame,
          value: keyframe.value.x,
          easing: keyframe.easing,
          easingConfig: keyframe.easingConfig,
        },
        {
          property: proxyY,
          frame: keyframe.frame - minFrame,
          value: keyframe.value.y,
          easing: keyframe.easing,
          easingConfig: keyframe.easingConfig,
        },
      )
      sourceRefs.push(
        { itemId, property: proxyX, keyframeId: keyframe.id },
        { itemId, property: proxyY, keyframeId: `${keyframe.id}:y` },
      )
    }

    set({
      clipboard: {
        keyframes: clipboardKeyframes,
        sourceItemId: selectedKeyframes[0]?.itemId,
        originFrame: minFrame,
        sourceRefs,
      },
      isCut: false,
    })
  },

  // Cut selected keyframes (copy + mark for deletion)
  cutSelectedKeyframes: () => {
    const state = get()
    if (state.selectedKeyframes.length === 0) return

    state.copySelectedKeyframes()
    const scalarRefs: KeyframeRef[] = []
    const removedVectorKeys = new Set<string>()
    const keyframesState = useKeyframesStore.getState()
    for (const ref of state.selectedKeyframes) {
      const vector = getVectorSelectionMapping(ref.property)
      const storedId = vector ? getStoredVectorId(ref.keyframeId, vector.axis) : ''
      const hasVectorKeyframe = vector
        ? keyframesState
            .getKeyframesForItem(ref.itemId)
            ?.vectorProperties?.find((candidate) => candidate.property === vector.property)
            ?.keyframes.some((candidate) => candidate.id === storedId)
        : false
      if (vector && hasVectorKeyframe) {
        const key = `${ref.itemId}:${vector.property}:${storedId}`
        if (!removedVectorKeys.has(key)) {
          removeVectorKeyframe(ref.itemId, vector.property, storedId)
          removedVectorKeys.add(key)
        }
      } else {
        scalarRefs.push(ref)
      }
    }
    if (scalarRefs.length > 0) removeKeyframes(scalarRefs)
    set({ selectedKeyframes: [], isCut: true })
  },

  // Clear clipboard
  clearClipboard: () =>
    set({
      clipboard: null,
      isCut: false,
    }),

  // Check if a keyframe is selected
  isKeyframeSelected: (ref) => {
    return refInArray(ref, get().selectedKeyframes)
  },

  // Get selected keyframes for a specific item
  getSelectedKeyframesForItem: (itemId) => {
    return get().selectedKeyframes.filter((r) => r.itemId === itemId)
  },

  // Get selected keyframes for a specific property
  getSelectedKeyframesForProperty: (itemId, property) => {
    return get().selectedKeyframes.filter((r) => r.itemId === itemId && r.property === property)
  },

  // Check if any keyframes are selected
  hasSelection: () => {
    return get().selectedKeyframes.length > 0
  },

  // Check if clipboard has content
  hasClipboard: () => {
    return get().clipboard !== null && get().clipboard!.keyframes.length > 0
  },
}))
