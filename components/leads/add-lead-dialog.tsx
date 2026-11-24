"use client";

import * as React from "react";
import { toast } from "sonner";
import { APIError, api, message } from "@/lib/api/client";
import type { Lead } from "@/lib/api/types";
import { useCrmContext } from "@/lib/hooks/use-crm-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const empty = { name: "", phone: "", email: "", company: "", requirement: "", countryCode: "+91" };

const COUNTRY_CODES = [
  { code: "+91", label: "IN +91" },
  { code: "+1", label: "US +1" },
  { code: "+44", label: "UK +44" },
  { code: "+971", label: "AE +971" },
  { code: "+65", label: "SG +65" },
  { code: "+61", label: "AU +61" },
  { code: "+49", label: "DE +49" },
  { code: "+81", label: "JP +81" },
  { code: "+86", label: "CN +86" },
  { code: "+33", label: "FR +33" },
];

/** Adds an enquiry by hand, for a call or a walk-in that did not come through a lead source. The new lead belongs to the person adding it. */
export function AddLeadDialog({ open, onOpenChange, onAdded }: { open: boolean; onOpenChange: (open: boolean) => void; onAdded: () => void }) {
  const { crmParam } = useCrmContext();
  const [form, setForm] = React.useState(empty);
  const [saving, setSaving] = React.useState(false);
  // A problem with one field shows under that field; anything else the server says shows above the buttons.
  const [fieldErrors, setFieldErrors] = React.useState<Partial<Record<keyof typeof empty | "contact", string>>>({});
  const [error, setError] = React.useState("");
  // When the server reports existing active leads for this contact, show a warning and let the user confirm.
  const [duplicateWarning, setDuplicateWarning] = React.useState("");
  // Editing a field clears its message, so an answered problem never lingers until the next submit.
  const set = (key: keyof typeof empty) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined, ...(key === "phone" || key === "email" ? { contact: undefined } : {}) }));
    setError("");
    setDuplicateWarning("");
  };

  function close(next: boolean) {
    if (!next) { setForm(empty); setError(""); setFieldErrors({}); setDuplicateWarning(""); }
    onOpenChange(next);
  }
  async function save(skipDuplicateCheck = false) {
    const problems: typeof fieldErrors = {};
    if (form.name.trim().length < 2) problems.name = "Enter the customer's name.";
    if (!form.phone.trim() && !form.email.trim()) problems.contact = "Add a mobile number or an email so the lead can be reached.";
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) problems.email = "Enter a valid email address, such as name@company.com.";
    setFieldErrors(problems);
    if (Object.keys(problems).length) return;
    setSaving(true);
    setError("");
    const phone = form.phone.trim() ? (form.phone.trim().startsWith("+") ? form.phone.trim() : `${form.countryCode}${form.phone.trim()}`) : "";
    try {
      const qp = crmParam ? `?${crmParam.slice(1)}` : "";
      await api<Lead>(`/leads${qp}`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ name: form.name, phone, email: form.email, company: form.company, requirement: form.requirement, source: "manual", skipDuplicateCheck }) });
      toast.success("Lead added");
      close(false);
      onAdded();
    } catch (caught) {
      const msg = message(caught);
      if (!skipDuplicateCheck && caught instanceof APIError && caught.code === "duplicate_contact_leads") {
        setDuplicateWarning(msg);
      } else {
        setError(msg);
      }
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
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lead-add-phone">Mobile</Label>
              <div className="flex gap-1.5">
                <select value={form.countryCode} onChange={(e) => { setForm((c) => ({ ...c, countryCode: e.target.value })); setFieldErrors((c) => ({ ...c, contact: undefined })); setError(""); }} className="h-9 rounded-md border border-input bg-surface px-2 text-xs" aria-label="Country code">
                  {COUNTRY_CODES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                </select>
                <Input id="lead-add-phone" inputMode="tel" value={form.phone} onChange={set("phone")} placeholder="98111 22334" className="flex-1" aria-invalid={Boolean(fieldErrors.contact)} aria-describedby={fieldErrors.contact ? "lead-add-contact-error" : undefined} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="lead-add-email">Email</Label><Input id="lead-add-email" type="email" value={form.email} onChange={set("email")} aria-invalid={Boolean(fieldErrors.contact || fieldErrors.email)} aria-describedby={fieldErrors.email ? "lead-add-email-error" : fieldErrors.contact ? "lead-add-contact-error" : undefined} />{fieldErrors.email && <p id="lead-add-email-error" className="text-xs text-danger">{fieldErrors.email}</p>}</div>
          </div>
          {fieldErrors.contact && <p id="lead-add-contact-error" className="-mt-1.5 text-xs text-danger">{fieldErrors.contact}</p>}
          <div className="flex flex-col gap-1.5"><Label htmlFor="lead-add-requirement">Requirement</Label><Textarea id="lead-add-requirement" value={form.requirement} onChange={set("requirement")} /></div>
          {duplicateWarning && (
            <div role="alert" className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm">
              <p>{duplicateWarning}</p>
              <Button type="button" size="sm" variant="secondary" className="mt-2" disabled={saving} onClick={() => void save(true)}>
                {saving ? "Adding…" : "Add anyway"}
              </Button>
            </div>
          )}
          {error && <p role="alert" className="text-xs text-danger">{error}</p>}
          <DialogFooter><Button type="button" variant="secondary" onClick={() => close(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Adding…" : "Add lead"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
