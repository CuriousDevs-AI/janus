"use client";

import * as React from "react";
import { useSession } from "@/components/auth/session-provider";
import { api, message } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { CommandPalette } from "@/components/layout/command-palette";
import { MobileSidebar } from "@/components/layout/mobile-sidebar";
import { usePathname, useRouter } from "next/navigation";
import { demoMode } from "@/lib/demo-mode";
import { homeFor, personaMayOpen, useDemoAccount } from "@/lib/demo-persona";
import { businessHome, readCompanies } from "@/lib/company";
import { WorkspaceProvider, useWorkspace } from "@/components/layout/workspace-context";
import { homeForPermissions, mayOpenWorkspace } from "@/lib/access";
import { VoiceCallProvider } from "@/components/team/voice-call";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <React.Suspense fallback={<div className="min-h-dvh bg-background" />}>
      <WorkspaceProvider>
        <VoiceCallProvider>
          <AppShellContent>{children}</AppShellContent>
        </VoiceCallProvider>
      </WorkspaceProvider>
    </React.Suspense>
  );
}

function AppShellContent({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const [sending, setSending] = React.useState(false);
  const account = useDemoAccount();
  const pathname = usePathname();
  const router = useRouter();
  const allowed = !demoMode || !account || personaMayOpen(account, pathname);
  const { workspaceId } = useWorkspace();
  // A workspace the role cannot open (Business Management is for owners and admins) sends the
  // person to the workspace they work in, rather than showing its menu with nothing behind it.
  const blocked = !demoMode && workspaceId !== "portfolio" && !mayOpenWorkspace(workspaceId, session.permissions);
  React.useEffect(() => {
    if (blocked) router.replace(homeForPermissions(session.permissions));
  }, [blocked, router, session.permissions]);
  // HR, Finance and Employee previews have no business in CRM or Business Management. Send them home.
  React.useEffect(() => {
    if (allowed || !account) return;
    // The Owner who has companies goes back to the company they are in; with none, to the Portfolio.
    router.replace(account.hrRole === "owner" && readCompanies().length > 0 && !pathname.startsWith("/portfolio") ? businessHome : homeFor(account));
  }, [allowed, account, router, pathname]);
  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      <Sidebar />
      <MobileSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="app-main flex-1 overflow-y-scroll">
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
          {allowed && !blocked ? children : <div className="p-8 text-sm text-muted-foreground" role="status">You do not have access to this page. Taking you to your home…</div>}
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
