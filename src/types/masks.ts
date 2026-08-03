/** Bezier mask vertex (normalized 0-1 relative to item bounds) */
export interface MaskVertex {
  position: [number, number]
  inHandle: [number, number]
  outHandle: [number, number]
  /** How handle edits affect the opposite tangent. Legacy vertices infer this from their handles. */
  tangentMode?: 'corner' | 'smooth' | 'continuous' | 'broken'
}

/**
 * A single MobileSAM prompt point in canvas (project) pixel coordinates.
 * Persisted on AI-generated mask shapes so a later tracking pass can
 * propagate the same include/exclude prompts frame to frame.
 */
export interface PromptPoint {
  x: number
  y: number
  label: 1 | -1
}
