import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vite-plus/test'
import type { TimelineTrack, VideoItem } from '@/types/timeline'
import {
  useItemsStore,
  useKeyframesStore,
  useTimelineCommandStore,
  useTimelineSettingsStore,
} from '@/features/editor/deps/timeline-store'
import { useSelectionStore } from '@/shared/state/selection'
import { AnimationPresetLibrary } from './animation-preset-library'

const VIDEO: VideoItem = {
  id: 'video-1',
  type: 'video',
  trackId: 'track-1',
  from: 0,
  durationInFrames: 120,
  label: 'clip.mp4',
  src: 'blob:video',
  mediaId: 'media-1',
}

const TRACK: TimelineTrack = {
  id: 'track-1',
  name: 'V1',
  kind: 'video',
  order: 0,
  height: 80,
  locked: false,
  visible: true,
  muted: false,
  solo: false,
  items: [],
}

const CANVAS = { width: 1920, height: 1080, fps: 30, backgroundColor: '#000000' }

describe('AnimationPresetLibrary — loop animations (edit variant)', () => {
  beforeEach(() => {
    useTimelineCommandStore.getState().clearHistory()
    useTimelineSettingsStore.setState({ fps: 30, isDirty: false })
    useItemsStore.getState().setItems([VIDEO])
    useItemsStore.getState().setTracks([TRACK])
    useKeyframesStore.getState().setKeyframes([])
    useSelectionStore.getState().clearSelection()
    useSelectionStore.setState({ selectedItemIds: ['video-1'], selectionType: 'item' })
  })

  it('offers the default loop animations for a non-text clip', () => {
    render(<AnimationPresetLibrary canvas={CANVAS} variant="edit" />)

    expect(screen.getByText('Loop animations')).toBeInTheDocument()
    for (const name of ['Float drift', 'Breath pulse', 'Micro shake', 'Sway', 'Spin']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
  })

  it('applies a loop animation on click and removes it from the live chip', () => {
    render(<AnimationPresetLibrary canvas={CANVAS} variant="edit" />)

    fireEvent.click(screen.getByRole('button', { name: 'Float drift' }))

    const modifier = useItemsStore.getState().itemById['video-1']?.motionModifiers?.[0]
    expect(modifier).toMatchObject({ type: 'float-drift', enabled: true })

    // The chip becomes the live tile; it opens the tuning flyout.
    fireEvent.click(screen.getByRole('button', { name: /Live.*Float drift/ }))
    expect(screen.getByText('Intensity')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(useItemsStore.getState().itemById['video-1']?.motionModifiers).toEqual([])
  })
})
