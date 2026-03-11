"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

type DialogMotionContextValue = {
  triggerRect: DOMRect | null;
  setTriggerRect: (rect: DOMRect | null) => void;
};

const DialogMotionContext = React.createContext<DialogMotionContextValue | null>(null);

const DEFAULT_MOTION_STYLE: React.CSSProperties = {
  ["--dialog-shift-x" as string]: "0px",
  ["--dialog-shift-y" as string]: "18px",
  ["--dialog-origin-x" as string]: "50%",
  ["--dialog-origin-y" as string]: "50%"
};

const composeEventHandler = <EventType,>(
  theirHandler: ((event: EventType) => void) | undefined,
  ourHandler: (event: EventType) => void
) => {
  return (event: EventType) => {
    theirHandler?.(event);
    ourHandler(event);
  };
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function Dialog({ children, ...props }: DialogPrimitive.DialogProps) {
  const [triggerRect, setTriggerRect] = React.useState<DOMRect | null>(null);

  return (
    <DialogMotionContext.Provider value={{ triggerRect, setTriggerRect }}>
      <DialogPrimitive.Root {...props}>{children}</DialogPrimitive.Root>
    </DialogMotionContext.Provider>
  );
}

export const DialogClose = DialogPrimitive.Close;

export const DialogTrigger = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Trigger>
>(function DialogTrigger({ onClick, onPointerDownCapture, ...props }, ref) {
  const motion = React.useContext(DialogMotionContext);

  const captureTrigger = React.useCallback(
    (event: { currentTarget: EventTarget | null }) => {
      const target = event.currentTarget;
      if (target instanceof HTMLElement) {
        motion?.setTriggerRect(target.getBoundingClientRect());
      }
    },
    [motion]
  );

  return (
    <DialogPrimitive.Trigger
      ref={ref}
      onClick={composeEventHandler(onClick, captureTrigger)}
      onPointerDownCapture={composeEventHandler(onPointerDownCapture, captureTrigger)}
      {...props}
    />
  );
});

export const DialogPortal = DialogPrimitive.Portal;

export const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(function DialogOverlay({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn("dialog-overlay fixed inset-0 z-40 bg-slate-950/24", className)}
      {...props}
    />
  );
});

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogPrimitive.DialogContentProps
>(function DialogContent({ className, children, style, ...props }, forwardedRef) {
  const motion = React.useContext(DialogMotionContext);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const [motionStyle, setMotionStyle] = React.useState<React.CSSProperties>(DEFAULT_MOTION_STYLE);

  const updateMotion = React.useCallback(() => {
    const content = contentRef.current;
    if (!content || typeof window === "undefined") {
      return;
    }

    const dialogRect = content.getBoundingClientRect();
    const viewportCenterX = window.innerWidth / 2;
    const viewportCenterY = window.innerHeight / 2;
    const triggerRect = motion?.triggerRect;

    if (!triggerRect) {
      setMotionStyle(DEFAULT_MOTION_STYLE);
      return;
    }

    const triggerCenterX = triggerRect.left + triggerRect.width / 2;
    const triggerCenterY = triggerRect.top + triggerRect.height / 2;
    const shiftX = triggerCenterX - viewportCenterX;
    const shiftY = triggerCenterY - viewportCenterY;

    const originX = clamp(triggerCenterX - dialogRect.left, 36, Math.max(dialogRect.width - 36, 36));
    const originY = clamp(triggerCenterY - dialogRect.top, 36, Math.max(dialogRect.height - 36, 36));

    setMotionStyle({
      ["--dialog-shift-x" as string]: `${Math.round(shiftX)}px`,
      ["--dialog-shift-y" as string]: `${Math.round(shiftY)}px`,
      ["--dialog-origin-x" as string]: `${Math.round(originX)}px`,
      ["--dialog-origin-y" as string]: `${Math.round(originY)}px`
    });
  }, [motion?.triggerRect]);

  React.useLayoutEffect(() => {
    updateMotion();
  }, [updateMotion]);

  React.useEffect(() => {
    window.addEventListener("resize", updateMotion);
    return () => window.removeEventListener("resize", updateMotion);
  }, [updateMotion]);

  const setRefs = React.useCallback(
    (node: HTMLDivElement | null) => {
      contentRef.current = node;
      if (typeof forwardedRef === "function") {
        forwardedRef(node);
      } else if (forwardedRef) {
        forwardedRef.current = node;
      }
    },
    [forwardedRef]
  );

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={setRefs}
        className={cn(
          "dialog-content fixed left-1/2 top-1/2 z-50 w-[95vw] max-w-3xl rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-[0_32px_90px_rgba(7,56,77,0.18)]",
          className
        )}
        style={{ ...motionStyle, ...style }}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-4 flex items-start justify-between", className)} {...props} />;
}

export function DialogTitle({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("text-lg font-bold text-brand-primary", className)} {...props} />;
}
