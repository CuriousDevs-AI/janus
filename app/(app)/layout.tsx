import { AppShell } from "@/components/layout/app-shell";
import { SessionProvider } from "@/components/auth/session-provider";
import { CrmProviderBridge } from "@/components/layout/crm-provider-bridge";
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <CrmProviderBridge>
        <AppShell>{children}</AppShell>
      </CrmProviderBridge>
    </SessionProvider>
  );
}
