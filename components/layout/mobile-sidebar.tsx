"use client";

import Link from "next/link";
import { useAppStore } from "@/lib/stores/app-store";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { SidebarNav } from "@/components/layout/sidebar";

export function MobileSidebar() {
  const open = useAppStore((s) => s.mobileNavOpen);
  const setOpen = useAppStore((s) => s.setMobileNavOpen);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="left" className="max-w-[270px] p-0 md:hidden">
        <div className="flex h-14 items-center border-b border-border px-4">
          <Link href="/dashboard" className="flex items-center gap-2" onClick={() => setOpen(false)}>
            <span className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-foreground text-[12px] font-bold text-background">
              C
            </span>
            <span className="flex flex-col leading-none">
              <span className="text-[13px] font-semibold text-foreground">
                Curious<span className="text-accent">Devs</span>
              </span>
              <span className="text-[10px] text-muted-foreground">Janus</span>
            </span>
          </Link>
        </div>
        <div className="flex h-[calc(100%-56px)] flex-col">
          <SidebarNav onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
