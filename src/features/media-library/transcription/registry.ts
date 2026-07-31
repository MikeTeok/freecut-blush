import { ProviderRegistry } from '@/shared/utils/provider-registry'
import type { MediaTranscriptModel } from '@/types/storage'
import { browserWhisperTranscriptionAdapter } from './browser-whisper-adapter'
import { vibeTranscriptionAdapter, VIBE_TRANSCRIPTION_MODEL } from './vibe-adapter'
import type { MediaTranscriptionAdapter, MediaTranscriptionModelOption } from './adapter-types'

const DEFAULT_MEDIA_TRANSCRIPTION_ADAPTER_ID = browserWhisperTranscriptionAdapter.id

const mediaTranscriptionAdapterRegistry = new ProviderRegistry<MediaTranscriptionAdapter>(
  [browserWhisperTranscriptionAdapter, vibeTranscriptionAdapter],
  DEFAULT_MEDIA_TRANSCRIPTION_ADAPTER_ID,
)

export function getDefaultMediaTranscriptionAdapter(): MediaTranscriptionAdapter {
  return mediaTranscriptionAdapterRegistry.getDefault()
}

export function getMediaTranscriptionAdapter(id: string): MediaTranscriptionAdapter {
  return mediaTranscriptionAdapterRegistry.get(id)
}

/**
 * Pick the adapter that produced (or should produce) a transcript. Vibe transcripts are
 * marked with the `vibe` model id; everything else runs through the browser ASR engines.
 */
export function getMediaTranscriptionAdapterForModel(
  model: MediaTranscriptModel,
): MediaTranscriptionAdapter {
  return model === VIBE_TRANSCRIPTION_MODEL
    ? getMediaTranscriptionAdapter(vibeTranscriptionAdapter.id)
    : getDefaultMediaTranscriptionAdapter()
}

export function getMediaTranscriptionModelOptions(): readonly MediaTranscriptionModelOption[] {
  return getDefaultMediaTranscriptionAdapter().modelOptions
}

export function getDefaultMediaTranscriptionModel(): MediaTranscriptModel {
  return getDefaultMediaTranscriptionAdapter().defaultModel
}

export function getMediaTranscriptionModelLabel(model: MediaTranscriptModel): string {
  return getMediaTranscriptionAdapterForModel(model).getModelLabel(model)
}
