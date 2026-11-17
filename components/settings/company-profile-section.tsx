"use client";

import * as React from "react";
import { MapPin, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SectionCard, FieldRow } from "@/components/settings/section-ui";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";
import { useLocationsStore, type CompanyLocation } from "@/lib/stores/company-locations-store";
import { LiveCompanyProfile } from "@/components/business/company-settings";

type Location = CompanyLocation;

export function CompanyProfileSection() {
  return <LiveCompanyProfile locations={<LocationsCard />} />;
}

function LocationsCard() {
  const storedLocations = useLocationsStore((state) => state.locations);
  const saveLocationToStore = useLocationsStore((state) => state.saveLocation);
  const employees = useHrPeopleStore((state) => state.employees);
  const locations = React.useMemo(() => storedLocations.map((place) => ({ ...place, people: employees.filter((person) => person.status !== "archived" && person.branch && place.address.includes(person.branch)).length })), [storedLocations, employees]);
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
      <div className="divide-y divide-border">{locations.length === 0 ? <div className="rounded-md border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">No locations connected yet. Add your first office, branch or warehouse.</div> : locations.map((location) => <div key={location.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"><span className="flex size-8 items-center justify-center rounded-md bg-accent-muted text-accent"><MapPin className="size-4" /></span><div className="min-w-[180px] flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{location.name}</p><Badge variant="neutral">{location.kind}{location.gst ? ` · ${location.gst}` : ""}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{location.address}</p></div><span className="text-xs text-muted-foreground">{location.people} people</span><Button size="sm" variant="link" onClick={() => openLocation(location)}>Edit</Button></div>)}</div>
    </SectionCard>
    <LocationDialog open={locationOpen} location={editingLocation} onClose={() => setLocationOpen(false)} onSave={saveLocation} />
  </>;
}

function LocationDialog({ open, location, onClose, onSave }: { open: boolean; location: Location | null; onClose: () => void; onSave: (location: Location) => void }) {
  const [name, setName] = React.useState(""); const [kind, setKind] = React.useState("Office"); const [address, setAddress] = React.useState(""); const [gst, setGst] = React.useState("");
  const existing = useLocationsStore((state) => state.locations);
  const nameTaken = name.trim() !== "" && existing.some((item) => item.name.trim().toLowerCase() === name.trim().toLowerCase() && item.id !== (location?.id ?? -1));
  // eslint-disable-next-line react-hooks/set-state-in-effect
  React.useEffect(() => { setName(location?.name ?? ""); setKind(location?.kind ?? "Office"); setAddress(location?.address ?? ""); setGst(location?.gst ?? ""); }, [location, open]);
  return <Dialog open={open} onOpenChange={(value) => !value && onClose()}><DialogContent><DialogHeader><DialogTitle>{location ? "Edit location" : "Add location"}</DialogTitle><DialogDescription>People count here when their branch is part of the address. Operations keeps stock at each location.</DialogDescription></DialogHeader><div className="grid gap-4"><FieldRow label="Location name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Delhi office" />{nameTaken && <p className="mt-1 text-xs text-danger">A location with this name already exists.</p>}</FieldRow><FieldRow label="Type"><select value={kind} onChange={(e) => setKind(e.target.value)} className="h-9 w-full rounded-md border border-input bg-surface px-3 text-sm"><option>Office</option><option>Warehouse</option><option>Branch</option></select></FieldRow><FieldRow label="Address"><Input value={address} onChange={(e) => setAddress(e.target.value)} /></FieldRow><FieldRow label="GSTIN note"><Input value={gst} onChange={(e) => setGst(e.target.value)} placeholder="Optional" /></FieldRow></div><DialogFooter><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!name.trim() || !address.trim() || nameTaken} onClick={() => onSave({ id: location?.id ?? Date.now(), name: name.trim(), kind, address: address.trim(), people: location?.people ?? 0, gst })}>Save location</Button></DialogFooter></DialogContent></Dialog>;
}
