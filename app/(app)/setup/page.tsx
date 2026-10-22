"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { api, message } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/settings/section-ui";

type Setup = { businessName: string; industry: string; companySize: string; setupCompleted: boolean; completedSteps: string[]; nextStep: string | null };
type Workspace = { id: string; type: string; name: string; description: string; status: string };
type Source = { id: string; status?: string; name?: string; source?: string };
const steps = [
  ["business_details", "Business details", "Confirm your company profile."],
  ["workspaces", "Workspaces", "Choose the teams that will operate in Janus."],
  ["members", "People & access", "Invite members and assign roles."],
  ["data_connections", "Connect data", "Connect CRM sources and verify the records Janus can use."],
] as const;

export default function SetupPage() {
  const router = useRouter();
  const [setup, setSetup] = React.useState<Setup | null>(null);
  const [workspaces, setWorkspaces] = React.useState<Workspace[]>([]);
  const [members, setMembers] = React.useState<unknown[]>([]);
  const [sources, setSources] = React.useState<Source[]>([]);
  const [name, setName] = React.useState("");
  const [industry, setIndustry] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    Promise.all([
      api<Setup>("/business/setup"),
      api<Workspace[]>("/workspaces"),
      api<unknown[]>("/members").catch(() => []),
      api<Source[]>("/sources").catch(() => []),
    ])
      .then(([current, items, memberItems, sourceItems]) => { setSetup(current); setName(current.businessName); setIndustry(current.industry); setWorkspaces(items); setMembers(memberItems); setSources(sourceItems); })
      .catch((reason) => setError(message(reason)));
  }, []);

  async function complete(step: string) {
    if (!setup) return;
    setSaving(true);
    try {
      const completedSteps = [...new Set([...setup.completedSteps, step])];
      const updated = await api<Setup>("/business/setup", { method: "PATCH", body: JSON.stringify({ businessName: name, industry, completedSteps }) });
      setSetup(updated);
      toast.success(`${steps.find(([id]) => id === step)?.[1] ?? "Step"} saved`);
    } catch (reason) { toast.error(message(reason)); } finally { setSaving(false); }
  }

  const stepReady: Record<string, boolean> = {
    business_details: Boolean(name.trim() && industry.trim()),
    workspaces: workspaces.some((item) => item.status === "active"),
    members: members.length > 0,
    data_connections: sources.some((item) => item.status === "connected" || item.status === "active"),
  };

  if (error) return <div className="mx-auto max-w-2xl p-8"><SectionCard title="Business setup unavailable" description={error}><Button onClick={() => router.replace("/leads")}>Continue to CRM <ArrowRight className="size-3.5" /></Button></SectionCard></div>;
  if (!setup) return <div className="mx-auto max-w-2xl p-8 text-sm text-muted-foreground">Loading business setup…</div>;

  return <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6 lg:p-10">
    <div><Badge variant="neutral">Owner setup</Badge><h1 className="mt-2 text-2xl font-semibold">Set up your business in Janus</h1><p className="mt-1 text-sm text-muted-foreground">Complete the essentials before the Business menu and workspace controls become your operating home.</p></div>
    <div className="grid gap-3 sm:grid-cols-2">
      {steps.map(([id, title, description], index) => {
        const done = setup.completedSteps.includes(id);
        const ready = stepReady[id];
        return <div key={id} className="flex flex-col rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between"><span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Step {index + 1}</span>{done ? <CheckCircle2 className="size-4 text-success" /> : <Badge variant={ready ? "success" : "neutral"}>{ready ? "Ready" : "Pending"}</Badge>}</div>
          <h2 className="mt-3 text-sm font-semibold">{title}</h2><p className="mt-1 flex-1 text-xs text-muted-foreground">{description}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {id === "workspaces" && <Button size="sm" variant="secondary" onClick={() => router.push("/settings?tab=workspace&view=workspaces&workspace=business")}>Manage</Button>}
            {id === "members" && <Button size="sm" variant="secondary" onClick={() => router.push("/settings?tab=team&workspace=business")}>Manage</Button>}
            {id === "data_connections" && <Button size="sm" variant="secondary" onClick={() => router.push("/lead-sources")}>Connect source</Button>}
            {!done && ready && <Button size="sm" onClick={() => complete(id)}>Mark complete</Button>}
          </div>
        </div>;
      })}
    </div>
    <SectionCard title="Business details" description="These details appear in reports, permissions and workspace settings.">
      <div className="grid gap-4 sm:grid-cols-2"><label className="text-xs text-muted-foreground">Business name<Input className="mt-1" value={name} onChange={(event) => setName(event.target.value)} /></label><label className="text-xs text-muted-foreground">Industry<Input className="mt-1" value={industry} onChange={(event) => setIndustry(event.target.value)} placeholder="e.g. Manufacturing" /></label></div>
      <div className="mt-4 flex justify-end"><Button disabled={saving || !name.trim()} onClick={() => complete("business_details")}>Save details <ArrowRight className="size-3.5" /></Button></div>
    </SectionCard>
    <SectionCard title="Connected workspaces" description="Only workspaces returned by the API are listed here. Activate additional departments from Business → Workspaces.">
      <div className="flex flex-col gap-2">{workspaces.length ? workspaces.map((item) => <div key={item.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2"><span className="text-sm">{item.name}</span><Badge variant={item.status === "active" ? "success" : "neutral"}>{item.status}</Badge></div>) : <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">No workspaces are connected yet.</p>}</div>
      <div className="mt-4 flex justify-end"><Button variant="secondary" onClick={() => router.push("/settings?tab=workspace&view=workspaces&workspace=business")}>Manage workspaces <ArrowRight className="size-3.5" /></Button></div>
    </SectionCard>
    <div className="flex justify-between"><Button variant="ghost" onClick={() => router.replace("/leads")}>Go to CRM</Button><Button onClick={() => router.replace("/settings?tab=workspace&view=overview&workspace=business")}>Open Business <ArrowRight className="size-3.5" /></Button></div>
  </div>;
}
