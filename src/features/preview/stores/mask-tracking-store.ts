/**
 * Mask tracking progress store.
 *
 * Tracks the running state of a mask-tracking pass so UI can show progress and
 * offer cancellation. The tracking service drives this store; the UI reads it.
 */

import { create } from 'zustand'

type MaskTrackingStatus = 'idle' | 'running'

interface MaskTrackingProgress {
  /** Frames fully processed (including failures held on previous results). */
  done: number
  /** Total frames in the trace range. */
  total: number
  /** Absolute timeline frame currently being segmented. */
  currentFrame: number
}

interface MaskTrackingState {
  status: MaskTrackingStatus
  progress: MaskTrackingProgress | null
  error: string | null
  /** Monotonic counter; any increase requests the running pass to stop. */
  cancelRequestVersion: number
}

interface MaskTrackingActions {
  setRunning: (running: boolean) => void
  setProgress: (progress: MaskTrackingProgress | null) => void
  setError: (error: string | null) => void
  requestCancel: () => void
}

export const useMaskTrackingStore = create<MaskTrackingState & MaskTrackingActions>()((set) => ({
  status: 'idle',
  progress: null,
  error: null,
  cancelRequestVersion: 0,

  setRunning: (running) =>
    set({
      status: running ? 'running' : 'idle',
      error: running ? null : undefined,
      progress: running ? undefined : null,
    }),

  setProgress: (progress) => set({ progress }),

  setError: (error) => set({ error }),

  requestCancel: () => set((state) => ({ cancelRequestVersion: state.cancelRequestVersion + 1 })),
}))
