"use client";

import * as React from "react";
import { Building2, Copy, Crosshair, MapPin, Navigation, Plus, Share2, Warehouse } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SectionCard, FieldRow } from "@/components/settings/section-ui";
import { useLocationsStore, type CompanyLocation } from "@/lib/stores/company-locations-store";
import { LiveCompanyProfile } from "@/components/business/company-settings";

type Location = CompanyLocation;

export function CompanyProfileSection() {
  return <LiveCompanyProfile locations={<LocationsCard />} />;
}

function LocationsCard() {
  const locations = useLocationsStore((state) => state.locations);
  const saveLocationToStore = useLocationsStore((state) => state.saveLocation);
  const [locationOpen, setLocationOpen] = React.useState(false);
  const [editingLocation, setEditingLocation] = React.useState<Location | null>(null);
  function openLocation(location?: Location) { setEditingLocation(location ?? null); setLocationOpen(true); }
  function saveLocation(value: Location) {
    const error = saveLocationToStore(value);
    if (error) { toast.error(error); return; }
    setLocationOpen(false);
    toast.success(editingLocation ? "Location updated" : "Location added");
  }
  return <>
    <SectionCard title="Locations" description="Offices, warehouses and branches. Operations keeps stock at each one." action={<Button size="sm" variant="secondary" onClick={() => openLocation()}><Plus className="size-3.5" />Add location</Button>}>
      <div className="divide-y divide-border">{locations.length === 0 ? <div className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground"><MapPin className="mx-auto mb-2 size-5 text-muted-foreground/50" />No locations yet. Add your first office, branch or warehouse.</div> : locations.map((location) => <div key={location.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"><span className="flex size-9 items-center justify-center rounded-lg bg-accent-muted text-accent">{typeIcons[location.kind] ?? <MapPin className="size-4" />}</span><div className="min-w-[180px] flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{location.name}</p><Badge variant="neutral">{location.kind}{location.gst ? ` · ${location.gst}` : ""}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{location.address}</p></div><div className="flex items-center gap-1"><Button size="sm" variant="ghost" title="Copy address" onClick={() => { void navigator.clipboard.writeText(location.address); toast.success("Address copied"); }}><Copy className="size-3.5" /></Button><Button size="sm" variant="ghost" title="Share location" onClick={() => { const url = `https://maps.google.com/?q=${encodeURIComponent(location.address)}`; if (navigator.share) { void navigator.share({ title: location.name, text: location.address, url }); } else { void navigator.clipboard.writeText(url); toast.success("Map link copied"); } }}><Share2 className="size-3.5" /></Button><Button size="sm" variant="link" onClick={() => openLocation(location)}>Edit</Button></div></div>)}</div>
    </SectionCard>
    <LocationDialog open={locationOpen} location={editingLocation} onClose={() => setLocationOpen(false)} onSave={saveLocation} />
  </>;
}

const typeIcons: Record<string, React.ReactNode> = {
  Office: <Building2 className="size-4" />,
  Warehouse: <Warehouse className="size-4" />,
  Branch: <Navigation className="size-4" />,
};

function LocationDialog({ open, location, onClose, onSave }: { open: boolean; location: Location | null; onClose: () => void; onSave: (location: Location) => void }) {
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState("Office");
  const [address, setAddress] = React.useState("");
  const [gst, setGst] = React.useState("");
  const [locating, setLocating] = React.useState(false);
  const existing = useLocationsStore((state) => state.locations);
  const nameTaken = name.trim() !== "" && existing.some((item) => item.name.trim().toLowerCase() === name.trim().toLowerCase() && item.id !== (location?.id ?? -1));
  // eslint-disable-next-line react-hooks/set-state-in-effect
  React.useEffect(() => { setName(location?.name ?? ""); setKind(location?.kind ?? "Office"); setAddress(location?.address ?? ""); setGst(location?.gst ?? ""); }, [location, open]);

  function useCurrentLocation() {
    if (!navigator.geolocation) { toast.error("Your browser does not support location access."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&addressdetails=1`, { headers: { "Accept-Language": "en" } });
          if (res.ok) {
            const data = await res.json();
            if (data.display_name) setAddress(data.display_name);
          }
        } catch { /* fall back to coordinates */ setAddress(`${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`); }
        setLocating(false);
      },
      () => { toast.error("Could not get your location. Check browser permissions."); setLocating(false); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{location ? "Edit location" : "Add location"}</DialogTitle>
        <DialogDescription>People count here when their branch matches this address. Operations keeps stock at each location.</DialogDescription>
      </DialogHeader>

      {/* Map preview area */}
      <div className="relative overflow-hidden rounded-lg border border-border bg-surface-2">
        <div className="relative flex h-[140px] items-center justify-center bg-grid">
          <div className="absolute inset-0 bg-gradient-to-b from-accent/5 to-transparent" />
          {address.trim() ? (
            <div className="relative z-10 flex flex-col items-center gap-2 px-4 text-center">
              <span className="flex size-10 items-center justify-center rounded-full bg-accent text-white shadow-md">
                <MapPin className="size-5" />
              </span>
              <p className="max-w-[280px] text-xs leading-relaxed text-muted-foreground">{address}</p>
            </div>
          ) : (
            <div className="relative z-10 flex flex-col items-center gap-2">
              <span className="flex size-10 items-center justify-center rounded-full border-2 border-dashed border-border text-muted-foreground">
                <MapPin className="size-5" />
              </span>
              <p className="text-xs text-muted-foreground">Enter an address or use your current location</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4">
        {/* Type selector as visual chips */}
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Type</p>
          <div className="flex gap-2">
            {["Office", "Warehouse", "Branch"].map((type) => (
              <button key={type} type="button" onClick={() => setKind(type)} className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-all ${kind === type ? "border-accent bg-accent-muted font-medium text-accent" : "border-border bg-surface text-muted-foreground hover:border-border-strong hover:bg-surface-2"}`}>
                {typeIcons[type]}
                {type}
              </button>
            ))}
          </div>
        </div>

        <FieldRow label="Location name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Delhi office" />
          {nameTaken && <p className="mt-1 text-xs text-danger">A location with this name already exists.</p>}
        </FieldRow>

        <FieldRow label="Address">
          <div className="flex gap-2">
            <Input className="flex-1" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123, MG Road, Bengaluru" />
            <Button type="button" size="sm" variant="outline" disabled={locating} onClick={useCurrentLocation} title="Use current location" className="shrink-0">
              <Crosshair className={`size-4 ${locating ? "animate-spin" : ""}`} />
              {locating ? "Locating…" : "Current"}
            </Button>
          </div>
        </FieldRow>

        <FieldRow label="GSTIN note">
          <Input value={gst} onChange={(e) => setGst(e.target.value)} placeholder="Optional — e.g. GSTIN for this branch" />
        </FieldRow>
      </div>

      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button disabled={!name.trim() || !address.trim() || nameTaken} onClick={() => onSave({ id: location?.id ?? Date.now(), name: name.trim(), kind, address: address.trim(), people: location?.people ?? 0, gst })}>
          {location ? "Save changes" : "Add location"}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
