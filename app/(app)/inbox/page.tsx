"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Info } from "lucide-react";
import { useAppStore } from "@/lib/stores/app-store";
import { ConversationList } from "@/components/inbox/conversation-list";
import { ConversationPanel } from "@/components/inbox/conversation-panel";
import { CustomerContextPanel } from "@/components/inbox/customer-context-panel";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";

export default function InboxPage() {
  return (
    <React.Suspense fallback={null}>
      <InboxPageInner />
    </React.Suspense>
  );
}

function InboxPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const conversations = useAppStore((s) => s.conversations);
  const [contextOpen, setContextOpen] = React.useState(false);

  const selectedId = searchParams.get("c") ?? undefined;
  const selected = conversations.find((c) => c.id === selectedId);

  function select(id: string) {
    router.replace(`/inbox?c=${id}`, { scroll: false });
  }

  return (
    <div className="flex h-full">
      <div className={`h-full w-full md:w-[320px] md:shrink-0 ${selectedId ? "hidden md:block" : "block"}`}>
        <ConversationList selectedId={selectedId} onSelect={select} />
      </div>

      <div className={`h-full flex-1 flex-col ${selectedId ? "flex" : "hidden md:flex"}`}>
        {selectedId && (
          <div className="flex items-center gap-2 border-b border-border px-2 py-1.5 md:hidden">
            <Button variant="ghost" size="sm" onClick={() => router.replace("/inbox")}>
              <ChevronLeft className="size-3.5" />
              Conversations
            </Button>
            <Button variant="ghost" size="icon" className="ml-auto" onClick={() => setContextOpen(true)}>
              <Info className="size-3.5" />
            </Button>
          </div>
        )}
        <ConversationPanel conversationId={selectedId} />
      </div>

      <CustomerContextPanel customerId={selected?.customerId} className="hidden lg:flex" />

      <Sheet open={contextOpen} onOpenChange={setContextOpen}>
        <SheetContent side="right" className="max-w-[300px] p-0">
          <CustomerContextPanel customerId={selected?.customerId} className="flex w-full border-l-0" />
        </SheetContent>
      </Sheet>
    </div>
  );
}
