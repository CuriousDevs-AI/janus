"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { useSession } from "@/components/auth/session-provider";
import { api, message } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { CommandPalette } from "@/components/layout/command-palette";
import { MobileSidebar } from "@/components/layout/mobile-sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const session = useSession();
  const [sending, setSending] = React.useState(false);
  const live =
    pathname === "/inbox" ||
    /^\/(leads|lead-sources|deals)(\/[^/]+)?$/.test(pathname) ||
    /^\/customers\/\d+$/.test(pathname);
  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      <Sidebar />
      <MobileSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-y-auto">
          {!session.user.email_verified_at && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-warning/30 bg-warning-muted px-6 py-3 text-sm">
              <p>Verify your email to connect lead sources.</p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={sending}
                  onClick={async () => {
                    setSending(true);
                    try {
                      const result = await api<{ message: string }>(
                        "/auth/resend-verification",
                        {
                          method: "POST",
                          body: JSON.stringify({ email: session.user.email }),
                        },
                      );
                      toast.success(result.message);
                    } catch (error) {
                      toast.error(message(error));
                    } finally {
                      setSending(false);
                    }
                  }}
                >
                  Resend email
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => window.location.reload()}
                >
                  I&apos;ve verified
                </Button>
              </div>
            </div>
          )}
          {live ? (
            children
          ) : (
            <div className="max-w-2xl p-6">
              <h1 className="text-xl font-semibold">
                This screen is not connected yet
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Your workspace is live. Start with Lead Sources and Leads; this
                module will be available when its workflow is ready.
              </p>
            </div>
          )}
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
