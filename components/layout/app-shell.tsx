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
import { WorkspaceProvider, useWorkspace } from "@/components/layout/workspace-context";
import { homeForPermissions, mayOpenWorkspace } from "@/lib/access";
import { VoiceCallProvider, useVoiceCall } from "@/components/team/voice-call";
import { AnnouncementWatcher } from "@/components/team/team-posts";
import { useAutoAway, useCallStatus, useStatusExpiry } from "@/lib/hooks/use-auto-status";
import { useProfileStore } from "@/lib/stores/profile-store";

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
  const pathname = usePathname();
  const router = useRouter();
  const allowed = true;
  const { workspaceId } = useWorkspace();
  // A workspace the role cannot open (Business Management is for owners and admins) sends the
  // person to the workspace they work in, rather than showing its menu with nothing behind it.
  const blocked = workspaceId !== "portfolio" && !mayOpenWorkspace(workspaceId, session.permissions);
  React.useEffect(() => {
    if (blocked) router.replace(homeForPermissions(session.permissions));
  }, [blocked, router, session.permissions]);
  // An Owner whose account has not chosen a plan chooses one first, then goes on where they were.
  const [needsPlan, setNeedsPlan] = React.useState(false);
  React.useEffect(() => {
    if (session.role !== "owner") return;
    let live = true;
    api<{ owner: boolean; chosen: boolean }>("/billing")
      .then((billing) => { if (live && billing.owner && !billing.chosen) setNeedsPlan(true); })
      .catch(() => { /* the plan page itself says what went wrong */ });
    return () => { live = false; };
  }, [session.role]);
  React.useEffect(() => {
    if (needsPlan && pathname !== "/choose-plan") router.replace(`/choose-plan?next=${encodeURIComponent(pathname)}`);
  }, [needsPlan, pathname, router]);
  // Choosing a plan fills the screen, before any workspace.
  if (pathname === "/choose-plan") return <main className="h-dvh overflow-y-auto">{children}</main>;
  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      <Sidebar />
      <MobileSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        {/* relative: hidden controls inside (a file picker's sr-only input) stay in the scrolling
            area instead of stretching the whole page below the screen. */}
        <main className="app-main relative flex-1 overflow-y-scroll">
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
      <AnnouncementWatcher />
      <StatusAutoManager />
    </div>
  );
}

function StatusAutoManager() {
  useAutoAway();
  const call = useVoiceCall();
  useCallStatus(Boolean(call.spaceId), call.spaceName);
  const clearAt = useProfileStore((s) => s.statusClearAt);
  const clearCustomStatus = useProfileStore((s) => s.clearCustomStatus);
  useStatusExpiry(clearAt, clearCustomStatus);
  return null;
}
