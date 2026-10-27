"use client";
import { useState } from "react";
import { can } from "@/lib/permissions";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api, message } from "@/lib/api/client";
import type { WhatsAppConversation } from "@/lib/api/types";
import { useSession } from "@/components/auth/session-provider";
import { Button } from "@/components/ui/button";
export function WhatsAppButton({
  contactId,
  label = "WhatsApp follow-up",
  className,
}: {
  contactId: string;
  label?: string;
  className?: string;
}) {
  const session = useSession();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (!can(session, "leads:write")) return null;
  return (
    <Button
      size="sm"
      className={className}
      disabled={busy || !session.user.email_verified_at}
      onClick={async () => {
        setBusy(true);
        try {
          const conversation = await api<WhatsAppConversation>(
            "/whatsapp/conversations",
            { method: "POST", body: JSON.stringify({ contactId }) },
          );
          router.push(`/inbox?c=${conversation.id}`);
        } catch (e) {
          toast.error(message(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Opening…" : label}
    </Button>
  );
}
