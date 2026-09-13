// @vitest-environment node

import { beforeEach, describe, expect, it } from 'vite-plus/test'
import type { AudioItem, TimelineTrack, VideoItem } from '@/types/timeline'
import { useItemsStore } from '../../items-store'
import { useTransitionsStore } from '../../transitions-store'
import { useTimelineCommandStore } from '../../timeline-command-store'
import { useTimelineSettingsStore } from '../../timeline-settings-store'
import { useEditorStore } from '@/shared/state/editor'
import { useSelectionStore } from '@/shared/state/selection'
import { splitAllItemsAtFrame } from './split-actions'

function makeVideoItem(id: string, overrides: Partial<VideoItem> = {}): VideoItem {
  return {
    id,
    type: 'video',
    trackId: 'video-track',
    from: 0,
    durationInFrames: 60,
    label: 'clip.mp4',
    src: 'blob:video',
    mediaId: 'media-1',
    ...overrides,
  }
}

function makeAudioItem(id: string, overrides: Partial<AudioItem> = {}): AudioItem {
  return {
    id,
    type: 'audio',
    trackId: 'audio-track',
    from: 0,
    durationInFrames: 60,
    label: 'clip.mp4',
    src: 'blob:audio',
    mediaId: 'media-1',
    ...overrides,
  }
}

function makeTrack(
  id: string,
  name: string,
  kind: 'video' | 'audio',
  order: number,
): TimelineTrack {
  return {
    id,
    name,
    kind,
    order,
    height: 80,
    locked: false,
    syncLock: true,
    visible: true,
    muted: false,
    solo: false,
    volume: 0,
    items: [],
  }
}

describe('splitAllItemsAtFrame', () => {
  beforeEach(() => {
    useTimelineCommandStore.getState().clearHistory()
    useTimelineSettingsStore.setState({ fps: 30, isDirty: false })
    useEditorStore.setState({ linkedSelectionEnabled: true })
    useItemsStore.getState().setItems([])
    useItemsStore
      .getState()
      .setTracks([
        makeTrack('video-track', 'V1', 'video', 0),
        makeTrack('audio-track', 'A1', 'audio', 1),
      ])
    useTransitionsStore.getState().setTransitions([])
    useSelectionStore.getState().clearSelection()
  })

  it('splits every crossing item when no restriction is given', () => {
    useItemsStore
      .getState()
      .setItems([
        makeVideoItem('video-1', { from: 0, durationInFrames: 60 }),
        makeVideoItem('video-2', { from: 30, durationInFrames: 40 }),
        makeVideoItem('video-3', { from: 100, durationInFrames: 20 }),
      ])

    expect(splitAllItemsAtFrame(50)).toBe(2)

    const items = useItemsStore.getState().items
    expect(items).toHaveLength(5)
    expect(items.find((item) => item.id === 'video-1')).toMatchObject({
      from: 0,
      durationInFrames: 50,
    })
    expect(items.find((item) => item.id === 'video-2')).toMatchObject({
      from: 30,
      durationInFrames: 20,
    })
    expect(items.some((item) => item.from === 50 && item.durationInFrames === 20)).toBe(true)
    expect(items.find((item) => item.id === 'video-3')).toMatchObject({
      from: 100,
      durationInFrames: 20,
    })
  })

  it('splits only the restricted item even when other items cross the frame', () => {
    useItemsStore
      .getState()
      .setItems([
        makeVideoItem('video-1', { from: 0, durationInFrames: 60 }),
        makeVideoItem('video-2', { from: 30, durationInFrames: 40 }),
      ])

    expect(splitAllItemsAtFrame(50, new Set(['video-1']))).toBe(1)

    const items = useItemsStore.getState().items
    expect(items).toHaveLength(3)
    expect(items.find((item) => item.id === 'video-2')).toMatchObject({
      from: 30,
      durationInFrames: 40,
    })
    expect(useSelectionStore.getState().selectedItemIds).toEqual(['video-1'])
  })

  it('splits the linked audio/video pair together when only the anchor is restricted', () => {
    useItemsStore
      .getState()
      .setItems([
        makeVideoItem('video-1', { linkedGroupId: 'group-1', originId: 'origin-1' }),
        makeAudioItem('audio-1', { linkedGroupId: 'group-1', originId: 'origin-1' }),
      ])

    expect(splitAllItemsAtFrame(30, new Set(['video-1']))).toBe(1)

    const items = useItemsStore.getState().items
    expect(items).toHaveLength(4)
    expect(items.find((item) => item.id === 'video-1')).toMatchObject({
      from: 0,
      durationInFrames: 30,
    })
    expect(items.find((item) => item.id === 'audio-1')).toMatchObject({
      from: 0,
      durationInFrames: 30,
    })
    const rightVideo = items.find((item) => item.type === 'video' && item.id !== 'video-1')
    const rightAudio = items.find((item) => item.type === 'audio' && item.id !== 'audio-1')
    expect(rightVideo).toMatchObject({ from: 30, durationInFrames: 30 })
    expect(rightAudio).toMatchObject({ from: 30, durationInFrames: 30 })
    expect(rightVideo?.linkedGroupId).toBe(rightAudio?.linkedGroupId)
  })

  it('splits only the anchor clip when linked selection is disabled', () => {
    useEditorStore.setState({ linkedSelectionEnabled: false })
    useItemsStore
      .getState()
      .setItems([
        makeVideoItem('video-1', { linkedGroupId: 'group-1', originId: 'origin-1' }),
        makeAudioItem('audio-1', { linkedGroupId: 'group-1', originId: 'origin-1' }),
      ])

    expect(splitAllItemsAtFrame(30, new Set(['video-1']))).toBe(1)

    const items = useItemsStore.getState().items
    expect(items).toHaveLength(3)
    expect(items.find((item) => item.id === 'audio-1')).toMatchObject({
      from: 0,
      durationInFrames: 60,
    })
  })

  it('returns 0 and records no undo step when no restricted item crosses the frame', () => {
    useItemsStore
      .getState()
      .setItems([
        makeVideoItem('video-1', { from: 0, durationInFrames: 60 }),
        makeVideoItem('video-2', { from: 300, durationInFrames: 40 }),
      ])

    expect(splitAllItemsAtFrame(70, new Set(['video-1', 'video-2']))).toBe(0)
    expect(useItemsStore.getState().items).toHaveLength(2)
    expect(useTimelineCommandStore.getState().undoStack).toHaveLength(0)
  })
})
