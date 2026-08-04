import { memo, useCallback, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Palette, Pencil, Sparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEditorStore } from '@/shared/state/editor'
import type { EditorWorkspaceId } from '@/config/editor-workspaces'

const WORKSPACE_ITEMS: readonly {
  id: EditorWorkspaceId
  icon: LucideIcon
  labelKey: string
  accent: string
}[] = [
  { id: 'edit', icon: Pencil, labelKey: 'toolbar.workspaces.edit', accent: '#9ccfd8' },
  { id: 'color', icon: Palette, labelKey: 'toolbar.workspaces.color', accent: '#c4a7e7' },
  { id: 'motion', icon: Sparkles, labelKey: 'toolbar.workspaces.motion', accent: '#f6c177' },
]

const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)'

interface Ripple {
  id: number
  x: number
  y: number
  accent: string
}

/**
 * Pill-style workspace switcher with a sliding glow indicator,
 * click ripples, and icon pop animation on select.
 */
export const WorkspaceSwitcher = memo(function WorkspaceSwitcher() {
  const { t } = useTranslation()
  const workspace = useEditorStore((s) => s.workspace)
  const setWorkspace = useEditorStore((s) => s.setWorkspace)
  const [ripples, setRipples] = useState<Ripple[]>([])
  const [bump, setBump] = useState<EditorWorkspaceId | null>(null)
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const railRef = useRef<HTMLDivElement | null>(null)
  const [indicator, setIndicator] = useState({ left: 0, width: 0 })

  const activeAccent =
    WORKSPACE_ITEMS.find((w) => w.id === workspace)?.accent ?? WORKSPACE_ITEMS[0]!.accent

  useLayoutEffect(() => {
    const el = btnRefs.current[workspace]
    const rail = railRef.current
    if (el && rail) {
      const elRect = el.getBoundingClientRect()
      const railRect = rail.getBoundingClientRect()
      setIndicator({ left: elRect.left - railRect.left, width: elRect.width })
    }
  }, [workspace])

  const handleSelect = useCallback(
    (item: (typeof WORKSPACE_ITEMS)[number], e: React.MouseEvent<HTMLButtonElement>) => {
      if (item.id === workspace) return
      setWorkspace(item.id)
      setBump(item.id)
      setTimeout(() => setBump(null), 420)

      const rect = e.currentTarget.getBoundingClientRect()
      const id = Date.now() + Math.random()
      setRipples((r) => [
        ...r,
        { id, x: e.clientX - rect.left, y: e.clientY - rect.top, accent: item.accent },
      ])
      setTimeout(() => setRipples((r) => r.filter((rp) => rp.id !== id)), 650)
    },
    [workspace, setWorkspace],
  )

  return (
    <div
      ref={railRef}
      role="tablist"
      aria-label={t('toolbar.workspaces.label')}
      style={{
        position: 'relative',
        display: 'flex',
        gap: 2,
        padding: 3,
        background: '#2a273f',
        border: '1px solid #393552',
        borderRadius: 12,
        boxShadow: '0 20px 50px -20px rgba(0,0,0,0.65), inset 0 1px 0 rgba(86,82,110,0.13)',
      }}
    >
      {/* Sliding glow indicator */}
      <div
        style={{
          position: 'absolute',
          top: 3,
          bottom: 3,
          left: indicator.left,
          width: indicator.width,
          borderRadius: 10,
          background: `linear-gradient(135deg, ${activeAccent}33, ${activeAccent}14)`,
          border: `1px solid ${activeAccent}55`,
          boxShadow: `0 0 24px -4px ${activeAccent}88, inset 0 0 12px ${activeAccent}22`,
          transition: `left 0.5s ${SPRING}, width 0.5s ${SPRING}, background 0.35s ease, border-color 0.35s ease, box-shadow 0.35s ease`,
          pointerEvents: 'none',
        }}
      />

      {WORKSPACE_ITEMS.map((item) => {
        const Icon = item.icon
        const isActive = workspace === item.id
        const isBumping = bump === item.id
        return (
          <button
            key={item.id}
            ref={(el) => {
              btnRefs.current[item.id] = el
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={(e) => handleSelect(item, e)}
            style={{
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 12px',
              background: 'transparent',
              border: 'none',
              borderRadius: 10,
              cursor: 'pointer',
              color: isActive ? '#e0def4' : '#908caa',
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.01em',
              zIndex: 1,
              transition: 'color 0.3s ease, transform 0.15s ease',
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.transform = 'scale(0.96)'
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = 'scale(1)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)'
            }}
          >
            {/* Click ripples */}
            {ripples
              .filter((r) => r.accent === item.accent)
              .map((r) => (
                <span
                  key={r.id}
                  style={{
                    position: 'absolute',
                    left: r.x,
                    top: r.y,
                    width: 8,
                    height: 8,
                    marginLeft: -4,
                    marginTop: -4,
                    borderRadius: '50%',
                    background: r.accent,
                    opacity: 0.5,
                    animation: 'toolbar-ripple 0.6s ease-out forwards',
                    pointerEvents: 'none',
                  }}
                />
              ))}

            <Icon
              className="h-3.5 w-3.5"
              style={{
                color: isActive ? item.accent : 'currentColor',
                transform: isBumping
                  ? 'scale(1.35) rotate(-8deg)'
                  : isActive
                    ? 'scale(1.05)'
                    : 'scale(1)',
                transition: `transform 0.42s ${SPRING}, color 0.3s ease`,
                filter: isActive ? `drop-shadow(0 0 6px ${item.accent}aa)` : 'none',
              }}
            />
            <span
              style={{
                transform: isBumping ? 'translateY(-1px)' : 'translateY(0)',
                transition: `transform 0.42s ${SPRING}`,
              }}
            >
              {t(item.labelKey)}
            </span>
          </button>
        )
      })}
    </div>
  )
})
