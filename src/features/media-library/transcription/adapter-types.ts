import type { MediaTranscriptModel } from '@/types/storage'
import type { TranscribeOptions, TranscriptSegment } from './types'

export interface MediaTranscriptionModelOption {
  value: MediaTranscriptModel
  label: string
}

/**
 * The consumption surface a transcription run exposes. `TranscribeStream` (the browser
 * whisper/parakeet implementation) satisfies this structurally; bridge-backed providers
 * return their own implementation.
 */
export interface MediaTranscriptionStream {
  collect(): Promise<TranscriptSegment[]>
  cancel(message?: string): void
}

export interface MediaTranscriber {
  transcribe(file: File, runtimeOptions?: TranscribeOptions): MediaTranscriptionStream
}

export interface MediaTranscriptionAdapter {
  id: string
  label: string
  defaultModel: MediaTranscriptModel
  modelOptions: readonly MediaTranscriptionModelOption[]
  getModelLabel(model: MediaTranscriptModel): string
  createTranscriber(options?: TranscribeOptions): MediaTranscriber
}
