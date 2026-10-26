"use client";

import { useUIStore } from "@/lib/stores/ui-store";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { SidebarNav } from "@/components/layout/sidebar";

export function MobileSidebar() {
  const open = useUIStore((s) => s.mobileNavOpen);
  const setOpen = useUIStore((s) => s.setMobileNavOpen);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="left" className="max-w-[270px] p-0 md:hidden">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <div className="flex h-full flex-col">
          <SidebarNav onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
