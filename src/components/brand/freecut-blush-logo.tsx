import { cn } from '@/shared/ui/cn'

interface FreecutBlushLogoProps {
  variant?: 'full' | 'icon'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeConfig = {
  sm: 'w-6 h-6',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
}

export function FreecutBlushLogo({
  variant = 'full',
  size = 'md',
  className,
}: FreecutBlushLogoProps) {
  const src = variant === 'icon' ? '/icons/freecut-icon.svg' : '/icons/freecut-blush-icon.svg'

  return (
    <img
      src={src}
      alt="Freecut Blush"
      className={cn('object-contain', sizeConfig[size], className)}
    />
  )
}
