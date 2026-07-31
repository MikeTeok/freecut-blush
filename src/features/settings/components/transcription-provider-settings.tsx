import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/shared/ui/cn'
import { useSettingsStore, type TranscriptionProvider } from '../stores/settings-store'

type BridgeCheckState = 'idle' | 'checking' | 'ok' | 'error'

const TRANSCRIPTION_PROVIDERS: readonly TranscriptionProvider[] = ['builtin', 'vibe']

export function TranscriptionProviderSettings() {
  const { t } = useTranslation()
  const setSetting = useSettingsStore((s) => s.setSetting)
  const transcriptionProvider = useSettingsStore((s) => s.transcriptionProvider)
  const vibeBinaryPath = useSettingsStore((s) => s.vibeBinaryPath)
  const vibeModelPath = useSettingsStore((s) => s.vibeModelPath)
  const vibeBridgeUrl = useSettingsStore((s) => s.vibeBridgeUrl)
  const [bridgeCheck, setBridgeCheck] = useState<BridgeCheckState>('idle')

  const handleCheckBridge = async () => {
    setBridgeCheck('checking')
    const baseUrl = vibeBridgeUrl.replace(/\/+$/, '')
    try {
      const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(4000) })
      setBridgeCheck(response.ok ? 'ok' : 'error')
    } catch {
      setBridgeCheck('error')
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-sm">{t('settings.ai.transcriptionEngine')}</Label>
        <p className="text-xs text-muted-foreground">
          {t('settings.ai.transcriptionEngineDescription')}
        </p>
      </div>

      <div className="flex items-center rounded-md border border-border bg-secondary p-0.5">
        {TRANSCRIPTION_PROVIDERS.map((provider) => (
          <button
            key={provider}
            type="button"
            onClick={() => setSetting('transcriptionProvider', provider)}
            className={cn(
              'flex-1 rounded px-2.5 py-1 text-xs transition-colors',
              transcriptionProvider === provider
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {provider === 'builtin' ? t('settings.ai.engineBuiltin') : t('settings.ai.engineVibe')}
          </button>
        ))}
      </div>

      {transcriptionProvider === 'vibe' && (
        <>
          <div className="space-y-1">
            <Label htmlFor="vibe-binary-path" className="text-sm">
              {t('settings.ai.vibeBinaryPath')}
            </Label>
            <Input
              id="vibe-binary-path"
              value={vibeBinaryPath}
              onChange={(event) => setSetting('vibeBinaryPath', event.target.value)}
              placeholder={t('settings.ai.vibeBinaryPathPlaceholder')}
            />
            <p className="text-xs text-muted-foreground">
              {t('settings.ai.vibeBinaryPathDescription')}
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="vibe-model-path" className="text-sm">
              {t('settings.ai.vibeModelPath')}
            </Label>
            <Input
              id="vibe-model-path"
              value={vibeModelPath}
              onChange={(event) => setSetting('vibeModelPath', event.target.value)}
              placeholder={t('settings.ai.vibeModelPathPlaceholder')}
            />
            <p className="text-xs text-muted-foreground">
              {t('settings.ai.vibeModelPathDescription')}
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="vibe-bridge-url" className="text-sm">
              {t('settings.ai.vibeBridgeUrl')}
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="vibe-bridge-url"
                value={vibeBridgeUrl}
                onChange={(event) => setSetting('vibeBridgeUrl', event.target.value)}
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8 shrink-0 gap-1.5"
                onClick={handleCheckBridge}
                disabled={bridgeCheck === 'checking'}
              >
                {bridgeCheck === 'checking' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {bridgeCheck === 'ok' && <Check className="h-3.5 w-3.5 text-emerald-400" />}
                {bridgeCheck === 'error' && <X className="h-3.5 w-3.5 text-destructive" />}
                {t('settings.ai.checkBridge')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('settings.ai.vibeBridgeUrlDescription')}
            </p>
          </div>
        </>
      )}
    </div>
  )
}
