"use client";

import * as Popover from "@radix-ui/react-popover";

export const PreviewPopover = Popover.Root;
export const PreviewTrigger = Popover.Trigger;

export function PreviewContent({ children }: { children: React.ReactNode }) {
  return (
    <Popover.Portal>
      <Popover.Content className="z-50 w-80 rounded-xl border border-slate-200 bg-white p-3 shadow-xl animate-popIn" sideOffset={8}>
        {children}
      </Popover.Content>
    </Popover.Portal>
  );
}
