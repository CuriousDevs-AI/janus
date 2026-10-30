"use client";

import * as React from "react";
import { toast } from "sonner";
import { api, message } from "@/lib/api/client";
import type { Lead } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const empty = { name: "", phone: "", email: "", company: "", requirement: "" };

/** Adds an enquiry by hand, for a call or a walk-in that did not come through a lead source. The new lead belongs to the person adding it. */
export function AddLeadDialog({ open, onOpenChange, onAdded }: { open: boolean; onOpenChange: (open: boolean) => void; onAdded: () => void }) {
  const [form, setForm] = React.useState(empty);
  const [saving, setSaving] = React.useState(false);
  // A problem with one field shows under that field; anything else the server says shows above the buttons.
  const [fieldErrors, setFieldErrors] = React.useState<Partial<Record<keyof typeof empty | "contact", string>>>({});
  const [error, setError] = React.useState("");
  // Editing a field clears its message, so an answered problem never lingers until the next submit.
  const set = (key: keyof typeof empty) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined, ...(key === "phone" || key === "email" ? { contact: undefined } : {}) }));
    setError("");
  };

  function close(next: boolean) {
    if (!next) { setForm(empty); setError(""); setFieldErrors({}); }
    onOpenChange(next);
  }
  async function save() {
    const problems: typeof fieldErrors = {};
    if (form.name.trim().length < 2) problems.name = "Enter the customer's name.";
    if (!form.phone.trim() && !form.email.trim()) problems.contact = "Add a mobile number or an email so the lead can be reached.";
    setFieldErrors(problems);
    if (Object.keys(problems).length) return;
    setSaving(true);
    setError("");
    try {
      await api<Lead>("/leads", { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ ...form, source: "manual" }) });
      toast.success("Lead added");
      close(false);
      onAdded();
    } catch (caught) {
      setError(message(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add a lead</DialogTitle><DialogDescription>For an enquiry that did not arrive through a lead source. It is assigned to you.</DialogDescription></DialogHeader>
        <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5"><Label htmlFor="lead-add-name">Name</Label><Input id="lead-add-name" value={form.name} onChange={set("name")} autoFocus aria-invalid={Boolean(fieldErrors.name)} aria-describedby={fieldErrors.name ? "lead-add-name-error" : undefined} />{fieldErrors.name && <p id="lead-add-name-error" className="text-xs text-danger">{fieldErrors.name}</p>}</div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="lead-add-company">Company</Label><Input id="lead-add-company" value={form.company} onChange={set("company")} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5"><Label htmlFor="lead-add-phone">Mobile</Label><Input id="lead-add-phone" inputMode="tel" value={form.phone} onChange={set("phone")} aria-invalid={Boolean(fieldErrors.contact)} aria-describedby={fieldErrors.contact ? "lead-add-contact-error" : undefined} /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="lead-add-email">Email</Label><Input id="lead-add-email" type="email" value={form.email} onChange={set("email")} aria-invalid={Boolean(fieldErrors.contact)} aria-describedby={fieldErrors.contact ? "lead-add-contact-error" : undefined} /></div>
          </div>
          {fieldErrors.contact && <p id="lead-add-contact-error" className="-mt-1.5 text-xs text-danger">{fieldErrors.contact}</p>}
          <div className="flex flex-col gap-1.5"><Label htmlFor="lead-add-requirement">Requirement</Label><Textarea id="lead-add-requirement" value={form.requirement} onChange={set("requirement")} /></div>
          {error && <p role="alert" className="text-xs text-danger">{error}</p>}
          <DialogFooter><Button type="button" variant="secondary" onClick={() => close(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Adding…" : "Add lead"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
