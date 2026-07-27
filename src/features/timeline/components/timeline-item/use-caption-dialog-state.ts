import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AudioItem, TimelineItem as TimelineItemType, VideoItem } from '@/types/timeline'
import { useTimelineStore } from '../../stores/timeline-store'
import { useMediaLibraryStore } from '@/features/timeline/deps/media-library-store'
import {
  importMediaLibraryService,
  useEmbeddedSubtitlePickerStore,
} from '@/features/timeline/deps/media-library-service'
import { useProjectStore } from '@/features/timeline/deps/projects'
import { DEFAULT_PROJECT_HEIGHT, DEFAULT_PROJECT_WIDTH } from '@/shared/projects/defaults'
import { useSelectionStore } from '@/shared/state/selection/store'
import { inferSubtitleFormat, parseSrt, parseVtt } from '@/shared/utils/subtitles'
import {
  buildCaptionTrackAbove,
  buildSubtitleTextItemsForClip,
  findCompatibleCaptionTrackForRanges,
} from '@/features/timeline/deps/caption-items'

function isEmbeddedSubtitleContainer(fileName: string, mimeType: string): boolean {
  const name = fileName.toLowerCase()
  return (
    mimeType === 'video/x-matroska' ||
    mimeType === 'video/matroska' ||
    mimeType === 'video/webm' ||
    name.endsWith('.mkv') ||
    name.endsWith('.webm')
  )
}

interface UseCaptionDialogStateParams {
  item: TimelineItemType
  isBroken: boolean
  linkedItemsForCaptionOwnership: TimelineItemType[]
}

type TranscriptProgress = NonNullable<
  ReturnType<typeof useMediaLibraryStore.getState>['transcriptProgress'] extends Map<
    string,
    infer V
  >
    ? V
    : never
>

export interface CaptionDialogState {
  canManageCaptions: boolean
  canExtractEmbeddedSubtitles: boolean
  hasConsolidatablePerCueCaptions: boolean
  mediaHasTranscript: boolean
  transcriptStatus: string
  transcriptProgress: TranscriptProgress | null
  mediaFileName: string
  dialogOpen: boolean
  openDialog: () => void
  setDialogOpen: (next: boolean) => void
  setDialogError: (message: string | null) => void
  dialogError: string | null
  markCaptionStarted: () => void
  markCaptionEnded: () => void
  markCaptionStopRequested: () => void
  handleExtractEmbeddedSubtitles: (() => Promise<void>) | undefined
  handleConsolidateCaptionsToSegment: (() => Promise<void>) | undefined
  canImportSubtitleFile: boolean
  handleImportSubtitleFile: (() => Promise<void>) | undefined
}

export function useCaptionDialogState({
  item,
  isBroken,
  linkedItemsForCaptionOwnership,
}: UseCaptionDialogStateParams): CaptionDialogState {
  const transcriptStatus = useMediaLibraryStore(
    useCallback(
      (s) => (item.mediaId ? (s.transcriptStatus.get(item.mediaId) ?? 'idle') : 'idle'),
      [item.mediaId],
    ),
  )
  const transcriptProgress = useMediaLibraryStore(
    useCallback(
      (s) => (item.mediaId ? (s.transcriptProgress.get(item.mediaId) ?? null) : null),
      [item.mediaId],
    ),
  )
  const mediaForItem = useMediaLibraryStore(
    useCallback((s) => (item.mediaId ? (s.mediaById[item.mediaId] ?? null) : null), [item.mediaId]),
  )
  const mediaFileName = mediaForItem?.fileName ?? ''
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const mediaHasTranscript = transcriptStatus === 'ready'
  const captionStartedRef = useRef(false)
  const captionStopRequestedRef = useRef(false)

  const captionIsActive = transcriptStatus === 'queued' || transcriptStatus === 'transcribing'
  useEffect(() => {
    if (captionStartedRef.current && !captionIsActive) {
      captionStartedRef.current = false
      const keepOpen = captionStopRequestedRef.current || dialogError !== null
      captionStopRequestedRef.current = false
      setDialogOpen((wasOpen) => wasOpen && keepOpen)
    }
  }, [captionIsActive, dialogError])

  const linkedVideoCaptionOwner = useMemo(() => {
    if (item.type !== 'audio' || !item.mediaId) {
      return null
    }
    return (
      linkedItemsForCaptionOwnership.find(
        (linkedItem) =>
          linkedItem.id !== item.id &&
          linkedItem.type === 'video' &&
          linkedItem.mediaId === item.mediaId,
      ) ?? null
    )
  }, [item.id, item.mediaId, item.type, linkedItemsForCaptionOwnership])

  const canManageCaptions =
    !!item.mediaId &&
    !isBroken &&
    item.isReversed !== true &&
    (item.type === 'video' || (item.type === 'audio' && linkedVideoCaptionOwner === null))

  const canExtractEmbeddedSubtitles = !!(
    mediaForItem &&
    !isBroken &&
    item.isReversed !== true &&
    isEmbeddedSubtitleContainer(mediaForItem.fileName, mediaForItem.mimeType)
  )

  const handleExtractEmbeddedSubtitles = useCallback(async () => {
    if (!mediaForItem) return
    const mediaStore = useMediaLibraryStore.getState()
    try {
      const handle = mediaForItem.fileHandle
      if (mediaForItem.storageType === 'handle' && handle) {
        const granted =
          (await handle.requestPermission({ mode: 'read' }).catch(() => 'denied' as const)) ===
          'granted'
        if (!granted) {
          mediaStore.showNotification?.({
            type: 'error',
            message: `Freecut Blush needs permission to read "${mediaForItem.fileName}" before extracting subtitles.`,
          })
          return
        }
        const blob = await handle.getFile()
        useEmbeddedSubtitlePickerStore.getState().open(mediaForItem, blob)
        return
      }
      const { mediaLibraryService } = await importMediaLibraryService()
      const blob = await mediaLibraryService.getMediaFile(mediaForItem.id)
      if (!blob) {
        mediaStore.showNotification?.({
          type: 'error',
          message: `Freecut Blush could not load "${mediaForItem.fileName}".`,
        })
        return
      }
      useEmbeddedSubtitlePickerStore.getState().open(mediaForItem, blob)
    } catch (error) {
      mediaStore.showNotification?.({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : `Failed to open "${mediaForItem.fileName}" for subtitle extraction.`,
      })
    }
  }, [mediaForItem])

  const hasConsolidatablePerCueCaptions = useTimelineStore(
    useCallback(
      (s) =>
        item.isReversed !== true &&
        s.items.some(
          (other) =>
            other.type === 'text' &&
            (other.captionSource?.type === 'embedded-subtitles' ||
              other.captionSource?.type === 'subtitle-import') &&
            other.captionSource.clipId === item.id,
        ),
      [item.id, item.isReversed],
    ),
  )

  const handleConsolidateCaptionsToSegment = useCallback(async () => {
    const mediaStore = useMediaLibraryStore.getState()
    try {
      const { subtitleSidecarService } =
        await import('@/features/timeline/deps/subtitle-sidecar-service')
      const result = subtitleSidecarService.consolidatePerCueCaptionsToSegments({
        clipId: item.id,
      })
      mediaStore.showNotification?.({
        type: 'success',
        message:
          result.segmentsCreated > 0
            ? `Consolidated ${result.cuesConsolidated} caption${result.cuesConsolidated === 1 ? '' : 's'} into ${result.segmentsCreated} segment${result.segmentsCreated === 1 ? '' : 's'}.`
            : 'No per-cue captions found for this clip.',
      })
    } catch (error) {
      mediaStore.showNotification?.({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Failed to consolidate captions to segment.',
      })
    }
  }, [item.id])

  const handleImportSubtitleFile = useCallback(async () => {
    if (item.type !== 'video' && item.type !== 'audio') return
    const mediaStore = useMediaLibraryStore.getState()

    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.srt,.vtt'

    const file = await new Promise<File | null>((resolve) => {
      input.onchange = () => resolve(input.files?.[0] ?? null)
      input.click()
    })
    if (!file) return

    try {
      const text = await file.text()
      const format = inferSubtitleFormat(file.name)
      if (!format) {
        mediaStore.showNotification?.({
          type: 'error',
          message: `Unsupported subtitle format: "${file.name}". Please use .srt or .vtt files.`,
        })
        return
      }

      const result = format === 'srt' ? parseSrt(text) : parseVtt(text)
      if (result.cues.length === 0) {
        mediaStore.showNotification?.({
          type: 'error',
          message: `No subtitles found in "${file.name}".`,
        })
        return
      }

      const timeline = useTimelineStore.getState()
      const project = useProjectStore.getState().currentProject
      const canvasWidth = project?.metadata.width ?? DEFAULT_PROJECT_WIDTH
      const canvasHeight = project?.metadata.height ?? DEFAULT_PROJECT_HEIGHT
      const newTracks = [...timeline.tracks]
      const clip = item as AudioItem | VideoItem

      const range = {
        startFrame: clip.from,
        endFrame: clip.from + clip.durationInFrames,
      }
      let targetTrack = findCompatibleCaptionTrackForRanges(newTracks, timeline.items, [range])
      if (!targetTrack) {
        const clipTrack = newTracks.find((t) => t.id === clip.trackId)
        targetTrack = clipTrack
          ? buildCaptionTrackAbove(newTracks, clipTrack.order)
          : buildCaptionTrackAbove(newTracks, 0)
        newTracks.push(targetTrack)
        newTracks.sort((a, b) => a.order - b.order)
      }

      const textItems = buildSubtitleTextItemsForClip({
        trackId: targetTrack.id,
        cues: result.cues,
        clip,
        timelineFps: timeline.fps,
        canvasWidth,
        canvasHeight,
        fileName: file.name,
        format,
        sourceType: 'subtitle-import',
      })

      if (textItems.length === 0) {
        mediaStore.showNotification?.({
          type: 'error',
          message: `No subtitles from "${file.name}" overlap the clip's source range.`,
        })
        return
      }

      const tracksChanged =
        newTracks.length !== timeline.tracks.length ||
        newTracks.some((t, i) => t.id !== timeline.tracks[i]?.id)
      if (tracksChanged) {
        timeline.setTracks(newTracks)
      }

      timeline.addItems(textItems)
      useSelectionStore.getState().selectItems(textItems.map((i) => i.id))

      mediaStore.showNotification?.({
        type: 'success',
        message: `Imported ${textItems.length} subtitle${textItems.length === 1 ? '' : 's'} from "${file.name}".`,
      })
    } catch (error) {
      mediaStore.showNotification?.({
        type: 'error',
        message:
          error instanceof Error ? error.message : `Failed to import "${file.name}".`,
      })
    }
  }, [item])

  const openDialog = useCallback(() => {
    captionStopRequestedRef.current = false
    setDialogError(null)
    setDialogOpen(true)
  }, [])

  const markCaptionStarted = useCallback(() => {
    captionStartedRef.current = true
    captionStopRequestedRef.current = false
  }, [])

  const markCaptionEnded = useCallback(() => {
    captionStartedRef.current = false
  }, [])

  const markCaptionStopRequested = useCallback(() => {
    captionStopRequestedRef.current = true
  }, [])

  const canImportSubtitleFile = item.type === 'video' || item.type === 'audio'

  return {
    canManageCaptions,
    canExtractEmbeddedSubtitles,
    hasConsolidatablePerCueCaptions,
    mediaHasTranscript,
    transcriptStatus,
    transcriptProgress,
    mediaFileName,
    dialogOpen,
    openDialog,
    setDialogOpen,
    setDialogError,
    dialogError,
    markCaptionStarted,
    markCaptionEnded,
    markCaptionStopRequested,
    handleExtractEmbeddedSubtitles: canExtractEmbeddedSubtitles
      ? handleExtractEmbeddedSubtitles
      : undefined,
    handleConsolidateCaptionsToSegment: hasConsolidatablePerCueCaptions
      ? handleConsolidateCaptionsToSegment
      : undefined,
    canImportSubtitleFile,
    handleImportSubtitleFile: canImportSubtitleFile ? handleImportSubtitleFile : undefined,
  }
}
