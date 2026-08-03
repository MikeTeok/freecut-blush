import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Scan } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useMaskTrackingStore, startMaskTracking } from '@/features/editor/deps/preview'

interface MaskTrackingControlProps {
  itemId: string
}

/**
 * Track Mask control shown for single path shapes. Runs an AI tracking pass
 * across the item's duration and reflects progress/cancellation/errors from
 * `useMaskTrackingStore`.
 */
export function MaskTrackingControl({ itemId }: MaskTrackingControlProps) {
  const { t } = useTranslation()
  const status = useMaskTrackingStore((s) => s.status)
  const progress = useMaskTrackingStore((s) => s.progress)
  const error = useMaskTrackingStore((s) => s.error)
  const requestCancel = useMaskTrackingStore((s) => s.requestCancel)

  const running = status === 'running'

  const handleStart = useCallback(() => {
    void startMaskTracking(itemId)
  }, [itemId])

  return (
    <>
      <div className="border-t border-border my-3" />
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-7 flex-1 text-xs gap-1.5"
          disabled={running}
          onClick={handleStart}
        >
          <Scan className="w-3.5 h-3.5" />
          {t('editor.shapeSection.trackMask')}
        </Button>
      </div>
      <p className="px-1 pt-1 text-[10px] leading-4 text-muted-foreground">
        {t('editor.shapeSection.trackMaskHint')}
      </p>
      {running && progress && (
        <div className="px-1 pt-2">
          <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>
              {t('editor.shapeSection.trackingProgress', {
                done: progress.done,
                total: progress.total,
              })}
            </span>
            <span>{t('editor.shapeSection.trackingFrame', { frame: progress.currentFrame })}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }}
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 h-6 px-2 text-[10px]"
            onClick={requestCancel}
          >
            {t('editor.shapeSection.trackingCancel')}
          </Button>
        </div>
      )}
      {error && (
        <p className="px-1 pt-1 text-[10px] leading-4 text-destructive">
          {t('editor.shapeSection.trackingError', { error })}
        </p>
      )}
    </>
  )
}
