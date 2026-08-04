import { useCallback, useEffect, useRef } from 'react'
import {
  clampLeftEditorSidebarWidth,
  clampRightEditorSidebarWidth,
  getEditorLayout,
} from '@/config/editor-layout'
import { useSettingsStore } from '@/features/editor/deps/settings'
import { useEditorStore } from '@/shared/state/editor'
import { cn } from '@/shared/ui/cn'

interface SidebarResizeHandleProps {
  /** 'left' resizes the sidebar to the left of the handle (media); 'right' the one to the right (properties). */
  side: 'left' | 'right'
  className?: string
}

/**
 * Vertical (col-resize) gap handle for the media / properties sidebars.
 * Rendered in the gutter between panels so the grab target sits in the middle
 * of the gap, mirroring the horizontal timeline handle's pill-in-gap style.
 */
export function SidebarResizeHandle({ side, className }: SidebarResizeHandleProps) {
  const open = useEditorStore((s) => (side === 'left' ? s.leftSidebarOpen : s.rightSidebarOpen))
  const width = useEditorStore((s) => (side === 'left' ? s.sidebarWidth : s.rightSidebarWidth))
  const setWidth = useEditorStore((s) =>
    side === 'left' ? s.setSidebarWidth : s.setRightSidebarWidth,
  )
  const setResizeActive = useEditorStore((s) => s.setSidebarResizeActive)
  const editorDensity = useSettingsStore((s) => s.editorDensity)
  const editorLayout = getEditorLayout(editorDensity)

  const isResizingRef = useRef(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      isResizingRef.current = true
      startXRef.current = e.clientX
      startWidthRef.current = width
      setResizeActive(true)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [width, setResizeActive],
  )

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return
      // Left sidebar grows when dragging right; right sidebar grows when dragging left.
      const delta = side === 'left' ? e.clientX - startXRef.current : startXRef.current - e.clientX
      const clamp = side === 'left' ? clampLeftEditorSidebarWidth : clampRightEditorSidebarWidth
      setWidth(clamp(startWidthRef.current + delta, editorLayout))
    }

    const handleMouseUp = () => {
      if (!isResizingRef.current) return
      isResizingRef.current = false
      setResizeActive(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      isResizingRef.current = false
      setResizeActive(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [editorLayout, setWidth, setResizeActive, side])

  if (!open) {
    return <div className="w-2 shrink-0 self-stretch" aria-hidden="true" />
  }

  return (
    <div
      data-resize-handle
      onMouseDown={handleResizeStart}
      className={cn(
        'group relative flex w-2 shrink-0 cursor-col-resize items-center justify-center self-stretch bg-transparent',
        'after:absolute after:left-1/2 after:top-1/2 after:h-10 after:w-1 after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:bg-border after:transition-colors',
        'hover:after:bg-primary/80 active:after:bg-primary',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        className,
      )}
    />
  )
}
