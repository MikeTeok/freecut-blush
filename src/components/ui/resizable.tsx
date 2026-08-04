import * as ResizablePrimitive from 'react-resizable-panels'

import { cn } from '@/shared/ui/cn'

const ResizablePanelGroup = ({
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelGroup>) => (
  <ResizablePrimitive.PanelGroup
    className={cn('flex h-full w-full data-[panel-group-direction=vertical]:flex-col', className)}
    {...props}
  />
)

const ResizablePanel = ResizablePrimitive.Panel

const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelResizeHandle> & {
  withHandle?: boolean
}) => (
  <ResizablePrimitive.PanelResizeHandle
    className={cn(
      'relative flex w-2 items-center justify-center bg-transparent data-[panel-group-direction=vertical]:h-2 data-[panel-group-direction=vertical]:w-full',
      'after:absolute after:left-1/2 after:top-1/2 after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:transition-colors',
      withHandle
        ? 'after:h-10 after:w-1 data-[panel-group-direction=vertical]:after:h-1 data-[panel-group-direction=vertical]:after:w-10 after:bg-border'
        : 'after:h-px after:w-px after:bg-border/70',
      'hover:after:bg-primary/80 data-[resize-handle-state=drag]:after:bg-primary',
      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
      className,
    )}
    {...props}
  />
)

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
