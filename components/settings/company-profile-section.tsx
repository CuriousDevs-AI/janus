"use client";

import * as React from "react";
import { MapPin, Plus, ShieldCheck, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SectionCard, FieldRow } from "@/components/settings/section-ui";
import { api, message } from "@/lib/api/client";
import { demoMode } from "@/lib/demo-mode";
import { useSession } from "@/components/auth/session-provider";

type Location = { id: number; name: string; kind: string; address: string; people: number; gst: string };
type CompanyProfile = {
  displayName: string; legalName: string; industry: string; size: string; founded: string; website: string;
  description: string; email: string; phone: string; whatsapp: string; address1: string; address2: string;
  city: string; state: string; pin: string; billingSame: boolean;
};

const initialProfile: CompanyProfile = {
  displayName: "Acme Traders", legalName: "Acme Traders Private Limited", industry: "Wholesale & distribution",
  size: "41–50 people", founded: "2016", website: "https://acmetraders.in",
  description: "Wholesale supplier of packaging material and industrial fans to manufacturers across North India since 2016.",
  email: "hello@acmetraders.in", phone: "+91 98100 00000", whatsapp: "+91 98100 00001",
  address1: "Plot 14, Udyog Vihar Phase 4", address2: "Near Sector 18 Metro", city: "Gurugram", state: "Haryana", pin: "122015", billingSame: true,
};

const initialLocations: Location[] = [
  { id: 1, name: "Head office", kind: "Office", address: "Udyog Vihar Phase 4, Gurugram, Haryana", people: 18, gst: "" },
  { id: 2, name: "Manesar warehouse", kind: "Warehouse", address: "IMT Manesar, Sector 8, Haryana", people: 17, gst: "" },
  { id: 3, name: "Jaipur branch", kind: "Branch", address: "Sitapura Industrial Area, Jaipur, Rajasthan", people: 7, gst: "Own GSTIN" },
];

export function CompanyProfileSection() {
  const session = useSession();
  const connectedProfile = React.useMemo(() => ({
    ...initialProfile,
    displayName: session.tenant.name,
    legalName: "",
    industry: "",
    size: "",
    founded: "",
    website: "",
    description: "",
    email: "",
    phone: "",
    whatsapp: "",
    address1: "",
    address2: "",
    city: "",
    state: "",
    pin: "",
  }), [session.tenant.name]);
  const initial = demoMode ? initialProfile : connectedProfile;
  const [draft, setDraft] = React.useState(initial);
  const [saved, setSaved] = React.useState(initial);
  const [locations, setLocations] = React.useState<Location[]>(() => demoMode ? initialLocations : []);
  const [logo, setLogo] = React.useState<string | null>(null);
  const [revealed, setRevealed] = React.useState(false);
  const [locationOpen, setLocationOpen] = React.useState(false);
  const [editingLocation, setEditingLocation] = React.useState<Location | null>(null);
  const [saving, setSaving] = React.useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const set = (key: keyof CompanyProfile, value: string | boolean) => setDraft((current) => ({ ...current, [key]: value }));

  async function save() {
    setSaving(true);
    try {
      await api("/business/setup", {
        method: "PATCH",
        body: JSON.stringify({ businessName: draft.displayName, industry: draft.industry, companySize: draft.size }),
      });
      setSaved(draft);
      toast.success("Core company profile saved");
    } catch (error) {
      toast.error(message(error));
    } finally {
      setSaving(false);
    }
  }
  function discard() {
    setDraft(saved);
    toast.message("Unsaved company changes discarded");
  }
  function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.includes("png") && !file.type.includes("svg")) { toast.error("Upload a PNG or SVG logo"); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error("Logo must be smaller than 2 MB"); return; }
    setLogo(URL.createObjectURL(file));
    toast.success("Logo added to this draft");
  }
  function openLocation(location?: Location) { setEditingLocation(location ?? null); setLocationOpen(true); }
  function saveLocation(value: Location) {
    setLocations((current) => current.some((item) => item.id === value.id) ? current.map((item) => item.id === value.id ? value : item) : [...current, value]);
    setLocationOpen(false);
    toast.success(value.id ? "Location updated" : "Location added");
  }

  const taxRecords = demoMode
    ? [["GSTIN", "06AAB1234567891Z5", "Verified"], ["PAN", "AABCT1234F", "Verified"], ["CIN", "U51909HR2016PTC123456", "Added"], ["Udyam (MSME)", "", "Not added"]]
    : [["GSTIN", "", "Not connected"], ["PAN", "", "Not connected"], ["CIN", "", "Not connected"], ["Udyam (MSME)", "", "Not connected"]];

  return <div className="flex flex-col gap-5">
    <div><p className="text-[11px] font-medium uppercase tracking-wide text-accent">Company</p><div className="mt-1 flex flex-wrap items-center gap-2"><h2 className="text-2xl font-semibold tracking-tight">Company Profile</h2><Badge variant={demoMode ? "neutral" : "warning"}>{demoMode ? "Demo data" : "Needs setup"}</Badge></div><p className="mt-1 text-sm text-muted-foreground">How your company appears on invoices, emails, reports and to Janus. Only Owner and Admins can change this.</p></div>

    <SectionCard title="Company details" description="Basic information about your business.">
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-4 border-b border-border pb-5"><div className="flex size-16 items-center justify-center overflow-hidden rounded-xl bg-foreground text-xl font-semibold text-background">{logo ? <img src={logo} alt="Company logo" className="size-full object-cover" /> : "AT"}</div><div><p className="text-sm font-semibold">Company logo</p><p className="mt-1 text-xs text-muted-foreground">PNG or SVG, at least 256 × 256 px. Used on invoices and reports.</p><div className="mt-2 flex gap-2"><label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium hover:bg-surface-2"><Upload className="size-3.5" />Upload new<input type="file" accept="image/png,image/svg+xml" className="sr-only" onChange={upload} /></label>{logo && <Button size="sm" variant="ghost" onClick={() => setLogo(null)}><X className="size-3.5" />Remove</Button>}</div></div></div>
        <div className="grid gap-4 sm:grid-cols-3"><FieldRow label="Display name"><Input value={draft.displayName} onChange={(e) => set("displayName", e.target.value)} /></FieldRow><FieldRow label="Legal name"><Input value={draft.legalName} onChange={(e) => set("legalName", e.target.value)} /></FieldRow><FieldRow label="Industry"><Input value={draft.industry} onChange={(e) => set("industry", e.target.value)} /></FieldRow><FieldRow label="Company size"><Input value={draft.size} onChange={(e) => set("size", e.target.value)} /></FieldRow><FieldRow label="Founded"><Input value={draft.founded} onChange={(e) => set("founded", e.target.value)} inputMode="numeric" /></FieldRow><FieldRow label="Website"><Input value={draft.website} onChange={(e) => set("website", e.target.value)} type="url" /></FieldRow></div>
        <FieldRow label="Short description"><Textarea value={draft.description} onChange={(e) => set("description", e.target.value)} className="min-h-24" /><span className="text-[11px] text-muted-foreground">Janus uses this to understand your business when answering questions.</span></FieldRow>
      </div>
    </SectionCard>

    <SectionCard title="Contact & address" description="Shown on invoices and customer messages.">
      <div className="grid gap-4"><div className="grid gap-4 sm:grid-cols-3"><FieldRow label="Business email"><Input value={draft.email} onChange={(e) => set("email", e.target.value)} type="email" /></FieldRow><FieldRow label="Phone"><Input value={draft.phone} onChange={(e) => set("phone", e.target.value)} /></FieldRow><FieldRow label="WhatsApp Business number"><Input value={draft.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} /></FieldRow></div><p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Registered address</p><div className="grid gap-4 sm:grid-cols-4"><FieldRow label="Address line 1"><Input value={draft.address1} onChange={(e) => set("address1", e.target.value)} /></FieldRow><FieldRow label="Address line 2"><Input value={draft.address2} onChange={(e) => set("address2", e.target.value)} /></FieldRow><FieldRow label="City"><Input value={draft.city} onChange={(e) => set("city", e.target.value)} /></FieldRow><FieldRow label="State"><Input value={draft.state} onChange={(e) => set("state", e.target.value)} /></FieldRow><FieldRow label="PIN code"><Input value={draft.pin} onChange={(e) => set("pin", e.target.value)} inputMode="numeric" /></FieldRow></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.billingSame} onChange={(e) => set("billingSame", e.target.checked)} className="size-4 accent-[hsl(var(--accent))]" />Billing address is the same as registered address</label></div>
    </SectionCard>

    <SectionCard title="Tax & legal" description="Masked after saving. Only Owner and Admins can reveal them." action={<Button size="sm" variant="secondary" onClick={() => setRevealed((value) => !value)}>{revealed ? "Hide values" : "Reveal all"}</Button>}>
      <div className="divide-y divide-border">{taxRecords.map(([label, value, status]) => <div key={label} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"><div className="min-w-[170px] flex-1"><p className="text-sm font-semibold">{label}</p><p className="mt-0.5 text-xs text-muted-foreground">{label === "GSTIN" && draft.state ? `State: ${draft.state} (06)` : label === "PAN" ? "Company PAN" : label === "CIN" ? "Corporate Identification Number" : "Optional"}</p></div><span className="font-mono text-xs text-muted-foreground">{value ? (revealed ? value : value.slice(0, 3) + "••••••" + value.slice(-2)) : "Not connected"}</span><Badge variant={status === "Verified" ? "success" : status === "Added" ? "neutral" : status === "Not added" ? "accent" : "warning"}>{status}</Badge>{(status === "Not added" || status === "Not connected") && <Button size="sm" variant="link" onClick={() => toast.success("Tax registration setup opened")}>Set up</Button>}</div>)}</div>
    </SectionCard>

    <SectionCard title="Locations" description="Offices, warehouses and branches. Used for stock, attendance and GST." action={<Button size="sm" variant="secondary" onClick={() => openLocation()}><Plus className="size-3.5" />Add location</Button>}>
      <div className="divide-y divide-border">{locations.length === 0 ? <div className="rounded-md border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">No locations connected yet. Add your first office, branch or warehouse.</div> : locations.map((location) => <div key={location.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"><span className="flex size-8 items-center justify-center rounded-md bg-accent-muted text-accent"><MapPin className="size-4" /></span><div className="min-w-[180px] flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{location.name}</p><Badge variant="neutral">{location.kind}{location.gst ? ` · ${location.gst}` : ""}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{location.address}</p></div><span className="text-xs text-muted-foreground">{location.people} people</span><Button size="sm" variant="link" onClick={() => openLocation(location)}>Edit</Button></div>)}</div>
    </SectionCard>

    {dirty && <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-foreground px-4 py-3 text-sm text-background shadow-xl"><span className="flex items-center gap-2"><ShieldCheck className="size-4 text-emerald-300" />Core company details sync to Janus. Contact, tax and location fields remain local until their storage API is connected.</span><span className="flex gap-2"><Button size="sm" variant="ghost" className="text-background hover:bg-white/10 hover:text-background" onClick={discard}>Discard</Button><Button size="sm" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save changes"}</Button></span></div>}
    <LocationDialog open={locationOpen} location={editingLocation} onClose={() => setLocationOpen(false)} onSave={saveLocation} />
  </div>;
}

function LocationDialog({ open, location, onClose, onSave }: { open: boolean; location: Location | null; onClose: () => void; onSave: (location: Location) => void }) {
  const [name, setName] = React.useState(""); const [kind, setKind] = React.useState("Office"); const [address, setAddress] = React.useState(""); const [people, setPeople] = React.useState("0"); const [gst, setGst] = React.useState("");
  // The dialog is intentionally reset when its selected location changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  React.useEffect(() => { setName(location?.name ?? ""); setKind(location?.kind ?? "Office"); setAddress(location?.address ?? ""); setPeople(String(location?.people ?? 0)); setGst(location?.gst ?? ""); }, [location, open]);
  return <Dialog open={open} onOpenChange={(value) => !value && onClose()}><DialogContent><DialogHeader><DialogTitle>{location ? "Edit location" : "Add location"}</DialogTitle><DialogDescription>Use locations for people, inventory and tax reporting.</DialogDescription></DialogHeader><div className="grid gap-4"><FieldRow label="Location name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Delhi office" /></FieldRow><div className="grid gap-4 sm:grid-cols-2"><FieldRow label="Type"><select value={kind} onChange={(e) => setKind(e.target.value)} className="h-9 w-full rounded-md border border-input bg-surface px-3 text-sm"><option>Office</option><option>Warehouse</option><option>Branch</option></select></FieldRow><FieldRow label="People assigned"><Input value={people} onChange={(e) => setPeople(e.target.value)} inputMode="numeric" /></FieldRow></div><FieldRow label="Address"><Input value={address} onChange={(e) => setAddress(e.target.value)} /></FieldRow><FieldRow label="GSTIN note"><Input value={gst} onChange={(e) => setGst(e.target.value)} placeholder="Optional" /></FieldRow></div><DialogFooter><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!name.trim() || !address.trim()} onClick={() => onSave({ id: location?.id ?? Date.now(), name: name.trim(), kind, address: address.trim(), people: Number(people) || 0, gst })}>Save location</Button></DialogFooter></DialogContent></Dialog>;
}
