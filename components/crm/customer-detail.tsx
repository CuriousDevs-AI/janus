"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ArrowDownUp, Archive, Building2, CalendarClock, CheckCircle2,
  Clock, CreditCard, ExternalLink, FileText, Inbox, IndianRupee, Mail, MessageCircle,
  AlertCircle, MoreVertical, Package, Phone, Plus, RefreshCw, RotateCcw, Send, Settings, ShieldCheck, ShieldOff, StickyNote,
  ThumbsUp, TrendingUp, UserCheck, Video, ClipboardList, Trash2, Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { api, message } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import type { Activity, ContactDetail, CustomerAccount, JourneyEvent, RequirementStatus, ContactEntry } from "@/lib/api/types";
import { leadStageMeta } from "@/lib/status-meta";
import type { LeadStage } from "@/lib/types";
import { formatCurrencyINR, formatRelativeTime, cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ActivityForm } from "./activity-form";
import { TagsManager } from "./tags-manager";
import { RecordDocuments } from "@/components/shared/record-documents";
import { todayIso } from "@/lib/today";

const ACTIVITY_ICON: Record<string, typeof Phone> = {
  call: Phone, meeting: Video, email: Mail, task: ClipboardList, note: StickyNote,
};
const ACTIVITY_STYLE: Record<string, { bg: string; border: string; text: string; label: string }> = {
  call: { bg: "bg-emerald-50 dark:bg-emerald-950", border: "border-emerald-200 dark:border-emerald-800", text: "text-emerald-600 dark:text-emerald-400", label: "Call" },
  meeting: { bg: "bg-blue-50 dark:bg-blue-950", border: "border-blue-200 dark:border-blue-800", text: "text-blue-600 dark:text-blue-400", label: "Meeting" },
  email: { bg: "bg-amber-50 dark:bg-amber-950", border: "border-amber-200 dark:border-amber-800", text: "text-amber-600 dark:text-amber-400", label: "Email" },
  task: { bg: "bg-rose-50 dark:bg-rose-950", border: "border-rose-200 dark:border-rose-800", text: "text-rose-600 dark:text-rose-400", label: "Task" },
  note: { bg: "bg-purple-50 dark:bg-purple-950", border: "border-purple-200 dark:border-purple-800", text: "text-purple-600 dark:text-purple-400", label: "Note" },
};

const JOURNEY_ICONS: Record<string, typeof Phone> = {
  "lead.captured": Inbox,
  "lead.updated": RefreshCw,
  "lead.assigned": UserCheck,
  "lead.followed_up": CalendarClock,
  "lead.deleted": Trash2,
  "deal.created": TrendingUp,
  "deal.updated": RefreshCw,
  "activity.created": ClipboardList,
  "activity.completed": CheckCircle2,
  "contact.updated": Pencil,
  "contact.consent_updated": ShieldCheck,
  "contact.note_added": StickyNote,
};

const JOURNEY_COLORS: Record<string, string> = {
  "lead.captured": "border-accent bg-accent/10 text-accent",
  "lead.updated": "border-blue-400 bg-blue-400/10 text-blue-500",
  "lead.assigned": "border-slate-400 bg-slate-400/10 text-slate-500",
  "lead.followed_up": "border-amber-400 bg-amber-400/10 text-amber-500",
  "lead.deleted": "border-red-400 bg-red-400/10 text-red-500",
  "deal.created": "border-emerald-500 bg-emerald-500/10 text-emerald-600",
  "deal.updated": "border-emerald-400 bg-emerald-400/10 text-emerald-500",
  "activity.created": "border-accent bg-accent/10 text-accent",
  "activity.completed": "border-emerald-500 bg-emerald-500/10 text-emerald-600",
  "contact.updated": "border-slate-400 bg-slate-400/10 text-slate-500",
  "contact.consent_updated": "border-blue-400 bg-blue-400/10 text-blue-500",
  "contact.note_added": "border-slate-400 bg-slate-400/10 text-slate-500",
};

const STAGE_COLORS: Record<string, string> = {
  new: "bg-slate-400", contacted: "bg-blue-400", qualified: "bg-cyan-400",
  converted: "bg-violet-400", won: "bg-emerald-500", lost: "bg-red-400",
};

type LifecycleStatus = "new" | "prospect" | "negotiating" | "active_customer" | "at_risk" | "churned" | "lost";

const LIFECYCLE: Record<LifecycleStatus, { label: string; description: string; color: string; bg: string; border: string }> = {
  new:              { label: "New Lead",          description: "Just came in, needs first contact",                 color: "text-blue-600 dark:text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-500/30" },
  prospect:         { label: "Prospect",          description: "In conversation, no deal yet",                     color: "text-cyan-600 dark:text-cyan-400",     bg: "bg-cyan-500/10",    border: "border-cyan-500/30" },
  negotiating:      { label: "Negotiating",       description: "Active deal in pipeline",                          color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-500/10",  border: "border-violet-500/30" },
  active_customer:  { label: "Active Customer",   description: "Using the service, deal won or invoiced",          color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
  at_risk:          { label: "At Risk",           description: "Overdue payments or no activity in 14+ days",      color: "text-amber-600 dark:text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/30" },
  churned:          { label: "Churned",           description: "Inactive for 60+ days, no open deals",             color: "text-red-500",                          bg: "bg-red-500/10",     border: "border-red-500/30" },
  lost:             { label: "Lost",              description: "All leads or deals marked lost",                    color: "text-red-600 dark:text-red-400",       bg: "bg-red-500/10",     border: "border-red-500/30" },
};

function deriveLifecycle(
  leads: { stage: string; dealStage: string | null }[],
  totalDealValue: number,
  hasInvoices: boolean,
  hasOverdue: boolean,
  lastActivityDays: number,
): LifecycleStatus {
  if (leads.length === 0) return "new";
  const allLost = leads.every((l) => l.stage === "lost");
  if (allLost) return "lost";
  const hasWonDeal = leads.some((l) => l.dealStage === "won");
  if (hasWonDeal || hasInvoices) {
    if (hasOverdue || lastActivityDays > 30) return "at_risk";
    if (lastActivityDays > 60) return "churned";
    return "active_customer";
  }
  const hasOpenDeal = leads.some((l) => l.dealStage && !["won", "lost"].includes(l.dealStage));
  if (hasOpenDeal) return "negotiating";
  const hasActiveLeads = leads.some((l) => !["converted", "lost"].includes(l.stage));
  if (hasActiveLeads && leads.some((l) => l.stage !== "new")) return "prospect";
  return "new";
}

function TimeAgo({ at }: { at: string | null }) {
  if (!at) return <span className="text-xs text-muted-foreground">Never</span>;
  return <span className="text-xs text-muted-foreground">{formatRelativeTime(at)}</span>;
}

function formatFullDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function daysBetween(a: string, b: string) {
  return Math.floor((Date.parse(b) - Date.parse(a)) / 86400000);
}

const REQ_STATUS: Record<RequirementStatus, {
  label: string; icon: typeof Phone; progress: number;
  bg: string; border: string; text: string; bar: string;
}> = {
  received: {
    label: "Received", icon: Inbox, progress: 10,
    bg: "bg-slate-50 dark:bg-slate-950", border: "border-slate-200 dark:border-slate-700",
    text: "text-slate-600 dark:text-slate-400", bar: "bg-slate-400",
  },
  evaluating: {
    label: "Evaluating", icon: Clock, progress: 30,
    bg: "bg-amber-50 dark:bg-amber-950", border: "border-amber-200 dark:border-amber-700",
    text: "text-amber-600 dark:text-amber-400", bar: "bg-amber-500",
  },
  available: {
    label: "Available", icon: Package, progress: 60,
    bg: "bg-blue-50 dark:bg-blue-950", border: "border-blue-200 dark:border-blue-700",
    text: "text-blue-600 dark:text-blue-400", bar: "bg-blue-500",
  },
  customizing: {
    label: "Customizing", icon: Settings, progress: 70,
    bg: "bg-violet-50 dark:bg-violet-950", border: "border-violet-200 dark:border-violet-700",
    text: "text-violet-600 dark:text-violet-400", bar: "bg-violet-500",
  },
  fulfilled: {
    label: "Fulfilled", icon: CheckCircle2, progress: 100,
    bg: "bg-emerald-50 dark:bg-emerald-950", border: "border-emerald-200 dark:border-emerald-700",
    text: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500",
  },
};

const FEEDBACK_STATUS: Record<string, { label: string; icon: typeof Phone; bg: string; border: string; text: string }> = {
  received: { label: "Received", icon: Inbox, bg: "bg-slate-50 dark:bg-slate-950", border: "border-slate-200 dark:border-slate-700", text: "text-slate-600 dark:text-slate-400" },
  reviewing: { label: "Reviewing", icon: Clock, bg: "bg-blue-50 dark:bg-blue-950", border: "border-blue-200 dark:border-blue-700", text: "text-blue-600 dark:text-blue-400" },
  responded: { label: "Responded", icon: Send, bg: "bg-emerald-50 dark:bg-emerald-950", border: "border-emerald-200 dark:border-emerald-700", text: "text-emerald-600 dark:text-emerald-400" },
  closed: { label: "Closed", icon: CheckCircle2, bg: "bg-purple-50 dark:bg-purple-950", border: "border-purple-200 dark:border-purple-700", text: "text-purple-600 dark:text-purple-400" },
};

const ISSUE_STATUS: Record<string, { label: string; icon: typeof Phone; bg: string; border: string; text: string }> = {
  reported: { label: "Reported", icon: AlertCircle, bg: "bg-red-50 dark:bg-red-950", border: "border-red-200 dark:border-red-700", text: "text-red-600 dark:text-red-400" },
  assigned: { label: "Assigned", icon: UserCheck, bg: "bg-amber-50 dark:bg-amber-950", border: "border-amber-200 dark:border-amber-700", text: "text-amber-600 dark:text-amber-400" },
  working: { label: "Working", icon: Settings, bg: "bg-blue-50 dark:bg-blue-950", border: "border-blue-200 dark:border-blue-700", text: "text-blue-600 dark:text-blue-400" },
  fixed: { label: "Fixed", icon: CheckCircle2, bg: "bg-emerald-50 dark:bg-emerald-950", border: "border-emerald-200 dark:border-emerald-700", text: "text-emerald-600 dark:text-emerald-400" },
  closed: { label: "Closed", icon: Package, bg: "bg-purple-50 dark:bg-purple-950", border: "border-purple-200 dark:border-purple-700", text: "text-purple-600 dark:text-purple-400" },
};

const PRIORITY_STYLE: Record<string, string> = {
  low: "text-muted-foreground",
  normal: "text-foreground",
  high: "text-amber-600 dark:text-amber-400",
  urgent: "text-red-600 dark:text-red-400",
};

function EntryTab({
  contactId, entryType, entries, loading, onReload, statusMap, statuses,
  icon: Icon, iconColor, title, emptyText, emptyHint, addLabel, placeholder,
}: {
  contactId: string;
  entryType: "feedback" | "issue";
  entries: ContactEntry[];
  loading: boolean;
  onReload: () => void;
  statusMap: Record<string, { label: string; icon: typeof Phone; bg: string; border: string; text: string }>;
  statuses: string[];
  icon: typeof Phone;
  iconColor: string;
  title: string;
  emptyText: string;
  emptyHint: string;
  addLabel: string;
  placeholder: string;
}) {
  const [adding, setAdding] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function create() {
    if (!subject.trim()) return;
    setSaving(true);
    try {
      await api<ContactEntry>(`/contacts/${contactId}/entries`, {
        method: "POST",
        body: JSON.stringify({ entryType, subject: subject.trim(), body: body.trim() }),
      });
      setSubject("");
      setBody("");
      setAdding(false);
      onReload();
      toast.success(`${entryType === "feedback" ? "Feedback" : "Issue"} added`);
    } catch (e) {
      toast.error(message(e));
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(entryId: string, newStatus: string) {
    setUpdatingId(entryId);
    try {
      await api(`/contacts/${contactId}/entries/${entryId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      onReload();
    } catch (e) {
      toast.error(message(e));
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={cn("size-4", iconColor)} />
          <h3 className="text-sm font-semibold">{title}</h3>
          {entries.length > 0 && (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {entries.filter((e) => !["closed", "fixed", "responded"].includes(e.status)).length} open
            </span>
          )}
        </div>
        <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => setAdding(!adding)}>
          <Plus className="size-3" /> {addLabel}
        </Button>
      </div>

      {adding && (
        <div className="rounded-lg border border-accent/30 bg-surface p-4 space-y-3">
          <Input
            placeholder={placeholder}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="text-sm"
            autoFocus
          />
          <Textarea
            placeholder="Details (optional)..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="min-h-[60px] text-xs"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setAdding(false); setSubject(""); setBody(""); }}>Cancel</Button>
            <Button size="sm" onClick={create} disabled={saving || !subject.trim()}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="size-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      ) : entries.length === 0 && !adding ? (
        <div className="rounded-lg border border-border bg-surface py-10 text-center">
          <Icon className="mx-auto size-8 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium text-muted-foreground">{emptyText}</p>
          <p className="mt-1 text-xs text-muted-foreground">{emptyHint}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => {
            const st = statusMap[entry.status] ?? statusMap[statuses[0]];
            const StatusIcon = st.icon;
            return (
              <div key={entry.id} className="group rounded-lg border border-border bg-surface transition-colors hover:bg-surface-2/50">
                <div className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-snug">{entry.subject}</p>
                      {entry.body && (
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground line-clamp-2">{entry.body}</p>
                      )}
                    </div>
                    <span className={cn("shrink-0 text-[10px] font-semibold uppercase", PRIORITY_STYLE[entry.priority] ?? "")}>
                      {entry.priority !== "normal" ? entry.priority : ""}
                    </span>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    {statuses.map((s) => {
                      const ss = statusMap[s];
                      if (!ss) return null;
                      const SIcon = ss.icon;
                      const active = entry.status === s;
                      return (
                        <button
                          key={s}
                          type="button"
                          disabled={updatingId === entry.id}
                          onClick={() => { if (!active) changeStatus(entry.id, s); }}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-all",
                            active ? cn(ss.bg, ss.border, ss.text) : "border-transparent bg-transparent text-muted-foreground/50 hover:border-border hover:text-muted-foreground",
                          )}
                        >
                          <SIcon className="size-2.5" />
                          {ss.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
                    {entry.createdBy && <span>by {entry.createdBy}</span>}
                    {entry.assignedTo && <span>→ {entry.assignedTo}</span>}
                    <span>{formatRelativeTime(entry.createdAt)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function CustomerDetailPanel({
  contactId,
  onBack,
}: {
  contactId: string;
  onBack: () => void;
}) {
  const router = useRouter();
  const detail = useApi<ContactDetail>(`/contacts/${contactId}/detail`);
  const account = useApi<CustomerAccount>(`/contacts/${contactId}/account`);
  const journey = useApi<JourneyEvent[]>(`/contacts/${contactId}/journey`);
  const feedbackEntries = useApi<ContactEntry[]>(`/contacts/${contactId}/entries?entry_type=feedback`);
  const issueEntries = useApi<ContactEntry[]>(`/contacts/${contactId}/entries?entry_type=issue`);
  const [activityOpen, setActivityOpen] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [tab, setTab] = useState("overview");
  const [journeyAsc, setJourneyAsc] = useState(true);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [impact, setImpact] = useState<{ leads: number; deals: number; notes: number } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", phone: "", email: "", company: "", paymentTerms: "", creditLimit: "", gstin: "", placeOfSupply: "" });
  const [editSaving, setEditSaving] = useState(false);

  const fetchImpact = useCallback(async () => {
    try {
      const data = await api(`/contacts/${contactId}/impact`);
      setImpact(data as { leads: number; deals: number; notes: number });
    } catch { setImpact({ leads: 0, deals: 0, notes: 0 }); }
  }, [contactId]);

  const c = detail.data?.contact;
  if (!c) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <span className="text-sm text-muted-foreground">Loading contact...</span>
        </div>
      </div>
    );
  }

  const leads = detail.data?.leads ?? [];
  const activeLeads = leads.filter((l) => !["converted", "lost"].includes(l.stage));
  const totalDealValue = Number(detail.data?.totalDealValue ?? 0);
  const openDealValue = Number(detail.data?.openDealValue ?? 0);
  const activities = detail.data?.activities ?? [];
  const leadNotes = detail.data?.leadNotes ?? [];
  const notes = detail.data?.notes ?? [];
  const name = c.name || c.phone || c.email || "Contact";
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const latestLead = leads[0];
  const lastActivityAt = activities[0]?.createdAt ?? latestLead?.createdAt ?? null;
  const lastActivityDays = lastActivityAt ? daysBetween(lastActivityAt, new Date().toISOString()) : 999;

  const journeyRaw = journey.data ?? [];
  const journeyEvents = journeyAsc ? journeyRaw : [...journeyRaw].reverse();
  const firstEvent = journeyRaw[0];
  const relationshipDays = firstEvent ? daysBetween(firstEvent.createdAt, new Date().toISOString()) : 0;

  const hasInvoices = (account.data?.invoices ?? 0) > 0;
  const hasOverdue = Number(account.data?.overdue ?? 0) > 0;
  const lifecycle = deriveLifecycle(leads, totalDealValue, hasInvoices, hasOverdue, lastActivityDays);
  const lc = LIFECYCLE[lifecycle];

  const nextFollowUp = leadNotes.find((ln) => ln.nextFollowUpOn);
  const fuDate = nextFollowUp?.nextFollowUpOn;
  let fuStatus: "overdue" | "today" | "upcoming" | null = null;
  let fuDiff = 0;
  if (fuDate) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const d = new Date(fuDate + "T00:00:00");
    fuDiff = Math.floor((d.getTime() - today.getTime()) / 86400000);
    fuStatus = fuDiff < 0 ? "overdue" : fuDiff === 0 ? "today" : "upcoming";
  }

  async function openChat() {
    try {
      const conv = await api(`/whatsapp/contacts/${contactId}/conversation`);
      if (conv && typeof conv === "object" && "id" in conv) {
        router.push(`/inbox?c=${(conv as { id: string }).id}`);
        return;
      }
    } catch {}
    router.push(`/inbox?workspace=crm-sales`);
  }

  async function addNote() {
    if (!noteBody.trim()) return;
    setSavingNote(true);
    try {
      await api(`/contacts/${contactId}/notes`, {
        method: "POST",
        body: JSON.stringify({ body: noteBody.trim() }),
      });
      setNoteBody("");
      detail.reload();
      toast.success("Note added");
    } catch (e) {
      toast.error(message(e));
    } finally {
      setSavingNote(false);
    }
  }

  async function handleArchive() {
    setActionLoading(true);
    try {
      await api(`/contacts/${contactId}/archive`, { method: "POST" });
      toast.success("Customer archived");
      setArchiveOpen(false);
      onBack();
    } catch (e) {
      toast.error(message(e));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRestore() {
    setActionLoading(true);
    try {
      await api(`/contacts/${contactId}/restore`, { method: "POST" });
      toast.success("Customer restored");
      detail.reload();
    } catch (e) {
      toast.error(message(e));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDelete() {
    setActionLoading(true);
    try {
      await api(`/contacts/${contactId}`, { method: "DELETE" });
      toast.success("Customer permanently deleted");
      setDeleteOpen(false);
      onBack();
    } catch (e) {
      toast.error(message(e));
    } finally {
      setActionLoading(false);
    }
  }

  const isArchived = !!c.archivedAt;

  function openEdit() {
    if (!c) return;
    setEditForm({
      name: c.name,
      phone: c.phone ?? "",
      email: c.email ?? "",
      company: c.company,
      paymentTerms: c.paymentTerms ?? "",
      creditLimit: c.creditLimit ? String(c.creditLimit) : "",
      gstin: c.gstin ?? "",
      placeOfSupply: c.placeOfSupply ?? "",
    });
    setEditOpen(true);
  }

  async function saveContact() {
    setEditSaving(true);
    try {
      await api(`/contacts/${contactId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editForm.name.trim(),
          phone: editForm.phone.trim() || null,
          email: editForm.email.trim() || null,
          company: editForm.company.trim(),
          paymentTerms: editForm.paymentTerms.trim() || null,
          creditLimit: editForm.creditLimit ? Number(editForm.creditLimit) : null,
          gstin: editForm.gstin.trim() || null,
          placeOfSupply: editForm.placeOfSupply.trim() || null,
        }),
      });
      setEditOpen(false);
      detail.reload();
      account.reload();
      toast.success("Contact updated");
    } catch (e) {
      toast.error(message(e));
    } finally {
      setEditSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* ── Header ── */}
      <div className="border-b border-border bg-surface">
        <div className="px-6 pt-4 pb-5">
          <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 mb-3 gap-1 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" /> All contacts
          </Button>
          <div className="flex items-start gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent/80 to-accent text-lg font-bold text-white shadow-sm">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-xl font-bold tracking-tight">{name}</h2>
                <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", lc.color, lc.bg, lc.border)}>
                  {latestLead
                    ? (leadStageMeta[latestLead.stage as LeadStage]?.label ?? latestLead.stage)
                    : lc.label}
                </span>
              </div>
              {c.company && (
                <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                  <Building2 className="size-3.5" /> {c.company}
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                {c.phone && (
                  <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground">
                    <Phone className="size-3.5" /> {c.phone}
                  </a>
                )}
                {c.email && (
                  <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground">
                    <Mail className="size-3.5" /> {c.email}
                  </a>
                )}
                {c.doNotContact && <Badge variant="danger" className="text-[10px]"><ShieldOff className="size-3" /> DNC</Badge>}
                {c.whatsappOptIn && <Badge variant="success" className="text-[10px]"><MessageCircle className="size-3" /> WhatsApp</Badge>}
              </div>
              <div className="mt-2.5">
                <TagsManager entityType="contacts" entityId={contactId} tags={detail.data?.tags ?? []} onChanged={() => detail.reload()} />
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-1.5">
              {isArchived ? (
                <Button variant="secondary" size="sm" className="gap-1.5" onClick={handleRestore} disabled={actionLoading}>
                  <RotateCcw className="size-3.5" /> Restore
                </Button>
              ) : (
                <>
                  <Button variant="secondary" size="sm" className="gap-1.5" onClick={openChat}>
                    <Send className="size-3.5" /> Send message
                  </Button>
                  <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => setActivityOpen(true)}>
                    <Plus className="size-3.5" /> Log activity
                  </Button>
                </>
              )}
              <Button variant="ghost" size="sm" className="size-8 p-0" onClick={openEdit} title="Edit contact">
                <Pencil className="size-3.5" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="size-8 p-0">
                    <MoreVertical className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {!isArchived && (
                    <DropdownMenuItem onClick={() => setArchiveOpen(true)}>
                      <Archive className="mr-2 size-3.5" /> Archive customer
                    </DropdownMenuItem>
                  )}
                  {isArchived && (
                    <DropdownMenuItem onClick={handleRestore} disabled={actionLoading}>
                      <RotateCcw className="mr-2 size-3.5" /> Restore customer
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-danger focus:text-danger"
                    onClick={() => { fetchImpact(); setDeleteOpen(true); setDeleteConfirm(""); }}
                  >
                    <Trash2 className="mr-2 size-3.5" /> Delete customer
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>

      {isArchived && (
        <div className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-6 py-2">
          <Archive className="size-3.5 text-amber-600 dark:text-amber-400" />
          <span className="text-xs font-medium text-amber-700 dark:text-amber-300">This customer is archived</span>
          <Button variant="ghost" size="sm" className="ml-auto h-6 gap-1 text-xs text-amber-700 hover:text-amber-900 dark:text-amber-300" onClick={handleRestore} disabled={actionLoading}>
            <RotateCcw className="size-3" /> Restore
          </Button>
        </div>
      )}

      {/* ── Tabs (Leads tab removed — use the Leads page for that) ── */}
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-border bg-surface px-6">
          <TabsList className="h-auto gap-0 rounded-none border-0 bg-transparent p-0">
            {[
              { value: "overview", label: "Overview" },
              { value: "activity", label: `Activity (${activities.length + leadNotes.length + notes.length})` },
              { value: "feedback", label: `Feedback${(feedbackEntries.data?.length ?? 0) > 0 ? ` (${feedbackEntries.data!.length})` : ""}` },
              { value: "issues", label: `Issues${(issueEntries.data?.length ?? 0) > 0 ? ` (${issueEntries.data!.length})` : ""}` },
              { value: "docs", label: "Documents" },
              { value: "account", label: "Account" },
            ].map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="relative rounded-none border-b-2 border-transparent px-4 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="flex-1 overflow-auto bg-surface-2/30">
          {/* ── Overview: Lifecycle + Snapshot + Journey ── */}
          <TabsContent value="overview" className="mt-0 p-5">
            <div className="space-y-4">

              {/* ── Lifecycle + Context Card ── */}
              {(() => {
                const dealLead = leads.find((l) => l.dealId);
                const activeLead = activeLeads[0] ?? latestLead;
                const showDeal = dealLead && ["negotiating", "active_customer", "at_risk"].includes(lifecycle);
                const showLead = !showDeal && activeLead;

                return (
                  <div className={cn("rounded-lg border", lc.border, lc.bg)}>
                    {/* Stage label */}
                    <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3">
                      <span className={cn("text-base font-bold", lc.color)}>
                        {latestLead
                          ? (leadStageMeta[latestLead.stage as LeadStage]?.label ?? latestLead.stage)
                          : lc.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{lc.description}</span>
                    </div>

                    {/* Context: Deal card OR Lead card */}
                    {showDeal && dealLead && (
                      <div className="mx-4 mb-3 rounded-lg border border-border bg-surface">
                        <Link href={`/deals?dealId=${dealLead.dealId}`} className="group flex items-center gap-3 p-3.5 transition-colors hover:bg-surface-2/50">
                          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
                            <TrendingUp className="size-4 text-emerald-600 dark:text-emerald-400" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold">{dealLead.dealName}</span>
                              {dealLead.dealStage && (
                                <Badge variant={dealLead.dealStage === "won" ? "success" : "neutral"} className="text-[10px] capitalize">
                                  {dealLead.dealStage.replace("_", " ")}
                                </Badge>
                              )}
                            </div>
                            {dealLead.dealAmount && (
                              <p className="mt-0.5 text-sm font-bold tabular-nums">{formatCurrencyINR(Number(dealLead.dealAmount))}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                            Open deal <ExternalLink className="size-3" />
                          </div>
                        </Link>

                        {/* Won deal: show Log Activity prominently */}
                        {dealLead.dealStage === "won" && (
                          <div className="border-t border-border px-3.5 py-2.5">
                            <Button variant="secondary" size="sm" className="w-full gap-1.5" onClick={() => setActivityOpen(true)}>
                              <Plus className="size-3.5" /> Log activity
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    {showLead && activeLead && (
                      <div className="mx-4 mb-3 rounded-lg border border-border bg-surface">
                        <Link href={`/leads/${activeLead.id}`} className="group flex items-center gap-3 p-3.5 transition-colors hover:bg-surface-2/50">
                          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                            <Inbox className="size-4 text-accent" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold">Lead #{activeLead.id}</span>
                              <span className="text-xs text-muted-foreground capitalize">{activeLead.source.replace("_", " ")}</span>
                            </div>
                            {activeLead.requirement && (
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">{activeLead.requirement}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                            Open lead <ExternalLink className="size-3" />
                          </div>
                        </Link>
                      </div>
                    )}

                    {/* Follow-up alert */}
                    {fuStatus && nextFollowUp && (
                      <div className={cn(
                        "mx-4 mb-3 flex items-center gap-2 rounded-lg border px-3 py-2",
                        fuStatus === "overdue" ? "border-danger/40 bg-danger/10" : fuStatus === "today" ? "border-warning/40 bg-warning/10" : "border-border bg-surface",
                      )}>
                        <CalendarClock className={cn("size-3.5 shrink-0", fuStatus === "overdue" ? "text-danger" : fuStatus === "today" ? "text-warning" : "text-muted-foreground")} />
                        <span className={cn("text-xs font-semibold", fuStatus === "overdue" ? "text-danger" : fuStatus === "today" ? "text-warning" : "")}>
                          {fuStatus === "today" ? "Follow-up today" : fuStatus === "overdue" ? `Follow-up overdue by ${-fuDiff}d` : `Follow-up ${new Date(fuDate! + "T12:00:00+05:30").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`}
                        </span>
                        {nextFollowUp.body && (
                          <span className="min-w-0 truncate text-xs text-muted-foreground">— {nextFollowUp.body}</span>
                        )}
                      </div>
                    )}

                    {/* Quick stats row inside banner */}
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border/40 px-4 py-2.5">
                      {firstEvent && (
                        <span className="text-[10px] text-muted-foreground">
                          Since <strong className="font-semibold text-foreground">{formatFullDate(firstEvent.createdAt)}</strong>
                          {relationshipDays > 0 && ` (${relationshipDays}d)`}
                        </span>
                      )}
                      {latestLead?.source && (
                        <span className="text-[10px] text-muted-foreground">
                          Source <strong className="font-semibold text-foreground capitalize">{latestLead.source.replace("_", " ")}</strong>
                        </span>
                      )}
                      {leads.length > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          <strong className="font-semibold text-foreground">{leads.length}</strong> lead{leads.length > 1 ? "s" : ""}
                          {activeLeads.length > 0 && <>, <strong className="font-semibold text-accent">{activeLeads.length}</strong> active</>}
                        </span>
                      )}
                      {totalDealValue > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          Value <strong className="font-semibold text-foreground tabular-nums">{formatCurrencyINR(totalDealValue)}</strong>
                          {openDealValue > 0 && openDealValue !== totalDealValue && (
                            <> (<strong className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrencyINR(openDealValue)}</strong> open)</>
                          )}
                        </span>
                      )}
                      {account.data?.full && (Number(account.data.due ?? 0) > 0 || Number(account.data.overdue ?? 0) > 0) && (
                        <span className="text-[10px] text-muted-foreground">
                          Due <strong className={cn("font-semibold tabular-nums", hasOverdue ? "text-danger" : "text-foreground")}>{formatCurrencyINR(Number(account.data.due ?? 0))}</strong>
                          {hasOverdue && <> (<strong className="font-semibold text-danger tabular-nums">{formatCurrencyINR(Number(account.data.overdue))}</strong> overdue)</>}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        Last active <strong className="font-semibold text-foreground">{lastActivityDays < 999 ? `${lastActivityDays}d ago` : "never"}</strong>
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* ── Requirements ── */}
              {leads.length > 0 && (
                <div className="rounded-lg border border-border bg-surface">
                  <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                    <FileText className="size-3.5 text-accent" />
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Requirements
                    </h3>
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {leads.filter((l) => l.requirement).length} of {leads.length}
                    </span>
                  </div>
                  <div className="divide-y divide-border">
                    {leads.map((l) => {
                      const rs = REQ_STATUS[l.requirementStatus as RequirementStatus] ?? REQ_STATUS.received;
                      const StatusIcon = rs.icon;
                      return (
                        <div key={l.id} className="px-4 py-3.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-foreground leading-snug">
                                {l.requirement || "No requirement specified"}
                              </p>
                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                <span className={cn(
                                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                                  rs.bg, rs.border, rs.text,
                                )}>
                                  <StatusIcon className="size-2.5" />
                                  {rs.label}
                                </span>
                                {l.dealName && (
                                  <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-foreground">
                                    {l.dealName}
                                  </span>
                                )}
                                {l.dealAmount && Number(l.dealAmount) > 0 && (
                                  <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[10px] font-medium tabular-nums text-foreground">
                                    {formatCurrencyINR(Number(l.dealAmount))}
                                  </span>
                                )}
                              </div>
                            </div>
                            <span className="shrink-0 text-[10px] text-muted-foreground">
                              {new Date(l.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                            </span>
                          </div>
                          {/* Progress bar */}
                          <div className="mt-2.5 flex items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
                              <div className={cn("h-full rounded-full transition-all", rs.bar)} style={{ width: `${rs.progress}%` }} />
                            </div>
                            <span className="text-[10px] text-muted-foreground capitalize">{l.source.replace("_", " ")}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Relationship Journey Timeline ── */}
              <div className="rounded-lg border border-border bg-surface">
                <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                  <Clock className="size-3.5 text-accent" />
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Relationship journey
                  </h3>
                  {journeyEvents.length > 1 && (
                    <button
                      onClick={() => setJourneyAsc((p) => !p)}
                      className="ml-auto inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground"
                    >
                      <ArrowDownUp className="size-2.5" />
                      {journeyAsc ? "Old → New" : "New → Old"}
                    </button>
                  )}
                </div>

                {journey.loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="size-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                  </div>
                ) : journeyEvents.length === 0 ? (
                  <div className="py-8 text-center">
                    <Clock className="mx-auto size-6 text-muted-foreground" />
                    <p className="mt-2 text-sm text-muted-foreground">No journey events yet</p>
                    <p className="mt-1 text-xs text-muted-foreground">Events appear as leads, deals and activities are created.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-0 px-4 py-4">
                    {journeyEvents.map((ev, i) => {
                      const Icon = JOURNEY_ICONS[ev.action] ?? ClipboardList;
                      const colorCls = JOURNEY_COLORS[ev.action] ?? "border-slate-300 bg-slate-100/50 text-slate-500";
                      const isFirst = i === 0;
                      const isLast = i === journeyEvents.length - 1 && !firstEvent;
                      const isMilestone = ["lead.captured", "deal.created", "activity.completed"].includes(ev.action);

                      const prevEv = i > 0 ? journeyEvents[i - 1] : null;
                      const rawGap = prevEv ? daysBetween(prevEv.createdAt, ev.createdAt) : 0;
                      const dayGap = Math.abs(rawGap);

                      return (
                        <div key={ev.id}>
                          {dayGap > 7 && (
                            <div className="grid gap-2.5" style={{ gridTemplateColumns: "36px 1fr" }}>
                              <div className="flex justify-center">
                                <div className="h-px w-3 bg-border/60 self-center" />
                              </div>
                              <div className="mb-1.5">
                                <span className="rounded bg-surface-2/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">{dayGap}d gap</span>
                              </div>
                            </div>
                          )}

                          <div className="grid gap-2.5" style={{ gridTemplateColumns: "36px 1fr" }}>
                            {/* Marker column: fixed 36px, icon centered, line behind */}
                            <div className="relative flex justify-center">
                              {/* Connecting line segment: top half */}
                              {!isFirst && <div className="absolute top-0 left-1/2 w-0.5 -translate-x-1/2 bg-border/60" style={{ height: "calc(50% - 2px)" }} />}
                              {/* Connecting line segment: bottom half */}
                              {!isLast && <div className="absolute bottom-0 left-1/2 w-0.5 -translate-x-1/2 bg-border/60" style={{ height: "calc(50% - 2px)" }} />}
                              {/* Icon */}
                              <div className={cn(
                                "relative z-10 mt-0.5 flex shrink-0 items-center justify-center rounded-full border-2",
                                isMilestone ? "size-7" : "size-5",
                                colorCls,
                              )}>
                                <Icon className={cn(isMilestone ? "size-3.5" : "size-2.5")} />
                              </div>
                            </div>

                            {/* Content column */}
                            <div className={cn(isLast ? "pb-0" : isMilestone ? "pb-4" : "pb-3")}>
                              {isMilestone ? (
                                <div className="rounded-lg border border-border bg-surface-2/30 px-3.5 py-2.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-semibold">{ev.title}</span>
                                    <span className="shrink-0 text-[10px] text-muted-foreground">{formatFullDate(ev.createdAt)}</span>
                                  </div>
                                  {ev.detail && <p className="mt-0.5 text-xs text-muted-foreground">{ev.detail}</p>}
                                  {ev.userName && <span className="mt-0.5 inline-block text-[10px] text-muted-foreground">by {ev.userName}</span>}
                                </div>
                              ) : (
                                <div className="flex items-baseline justify-between gap-2 py-0.5">
                                  <div className="min-w-0">
                                    <span className="text-xs font-medium">{ev.title}</span>
                                    {ev.detail && <span className="ml-1.5 text-[10px] text-muted-foreground">{ev.detail}</span>}
                                    {ev.userName && <span className="ml-1.5 text-[10px] text-muted-foreground">· {ev.userName}</span>}
                                  </div>
                                  <span className="shrink-0 text-[10px] text-muted-foreground">{formatRelativeTime(ev.createdAt)}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {firstEvent && (
                      <div className="grid gap-2.5" style={{ gridTemplateColumns: "36px 1fr" }}>
                        <div className="relative flex justify-center">
                          <div className="absolute top-0 left-1/2 w-0.5 -translate-x-1/2 bg-border/60" style={{ height: "calc(50% - 2px)" }} />
                          <div className="mt-0.5 size-1.5 rounded-full bg-border" />
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground">First contact · {formatFullDate(firstEvent.createdAt)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ── Activity (merged: activities + follow-ups + notes) ── */}
          <TabsContent value="activity" className="mt-0 p-6">
            {(() => {
              const timeline = [
                ...activities.map((a) => ({ type: "activity" as const, item: a, at: a.createdAt })),
                ...leadNotes.map((ln) => ({ type: "lead_note" as const, item: ln, at: ln.createdAt })),
                ...notes.map((n) => ({ type: "note" as const, item: n, at: n.createdAt })),
              ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

              return (
                <div className="space-y-5">
                  {/* Add note input */}
                  <div className="relative">
                    <Textarea
                      value={noteBody}
                      onChange={(e) => setNoteBody(e.target.value)}
                      placeholder="Write a quick note..."
                      rows={2}
                      className="pr-20 text-sm"
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      className="absolute bottom-2 right-2 h-7 gap-1 text-xs"
                      onClick={addNote}
                      disabled={savingNote || !noteBody.trim()}
                    >
                      <Plus className="size-3" />
                      {savingNote ? "Saving..." : "Add note"}
                    </Button>
                  </div>

                  {timeline.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border py-10 text-center">
                      <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-surface-2">
                        <ClipboardList className="size-6 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium text-foreground">No activity yet</p>
                      <p className="mt-1 text-xs text-muted-foreground">Log a call, meeting, email or add a note to start tracking.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {timeline.map((entry) => {
                        if (entry.type === "activity") {
                          const a = entry.item as Activity;
                          const Icon = ACTIVITY_ICON[a.kind] ?? ClipboardList;
                          const s = ACTIVITY_STYLE[a.kind] ?? ACTIVITY_STYLE.note;
                          return (
                            <div key={`a-${a.id}`} className="group relative rounded-lg border border-border bg-surface transition-all hover:border-border-strong hover:shadow-sm">
                              <div className="flex items-start gap-3 p-3.5">
                                <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg border", s.bg, s.border)}>
                                  <Icon className={cn("size-4", s.text)} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <span className="text-sm font-semibold text-foreground">{a.subject}</span>
                                      <span className={cn("ml-2 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide", s.bg, s.text)}>
                                        {s.label}
                                      </span>
                                    </div>
                                    <TimeAgo at={a.createdAt} />
                                  </div>
                                  {a.description && (
                                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{a.description}</p>
                                  )}
                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                    {a.ownerName && (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-foreground">
                                        <UserCheck className="size-2.5" />
                                        {a.ownerName}
                                      </span>
                                    )}
                                    {a.outcome && (
                                      <span className="inline-flex items-center rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium capitalize text-foreground">
                                        {a.outcome.replace("_", " ")}
                                      </span>
                                    )}
                                    {a.dueAt && (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                                        <Clock className="size-2.5" /> Due {formatRelativeTime(a.dueAt)}
                                      </span>
                                    )}
                                    {a.completedAt && (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                                        <CheckCircle2 className="size-2.5" /> Done
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        }

                        if (entry.type === "lead_note") {
                          const ln = entry.item as { id: string; leadId: string; body: string; author: string | null; nextFollowUpOn: string | null; createdAt: string };
                          return (
                            <div key={`ln-${ln.id}`} className="group relative rounded-lg border border-violet-200 bg-violet-50/30 transition-all hover:border-violet-300 hover:shadow-sm dark:border-violet-800 dark:bg-violet-950/30 dark:hover:border-violet-700">
                              <div className="flex items-start gap-3 p-3.5">
                                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-violet-200 bg-violet-50 dark:border-violet-800 dark:bg-violet-950">
                                  <CalendarClock className="size-4 text-violet-500" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <span className="text-sm font-semibold text-foreground">Follow-up</span>
                                      <span className="ml-2 inline-flex items-center rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-900 dark:text-violet-300">
                                        Follow-up
                                      </span>
                                    </div>
                                    <TimeAgo at={ln.createdAt} />
                                  </div>
                                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{ln.body}</p>
                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                    {ln.author && (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-900 dark:text-violet-300">
                                        <UserCheck className="size-2.5" />
                                        {ln.author}
                                      </span>
                                    )}
                                    {ln.nextFollowUpOn && (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-900 dark:text-violet-300">
                                        <CalendarClock className="size-2.5" /> Next: {new Date(`${ln.nextFollowUpOn}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        }

                        const n = entry.item as { id: string; body: string; author: string | null; createdAt: string };
                        return (
                          <div key={`n-${n.id}`} className="group relative rounded-lg border border-border bg-surface transition-all hover:border-border-strong hover:shadow-sm">
                            <div className="flex items-start gap-3 p-3.5">
                              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
                                <StickyNote className="size-4 text-blue-500" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <span className="text-sm font-semibold text-foreground">Note</span>
                                    <span className="ml-2 inline-flex items-center rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:bg-blue-950 dark:text-blue-400">
                                      Note
                                    </span>
                                  </div>
                                  <TimeAgo at={n.createdAt} />
                                </div>
                                <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap text-foreground">{n.body}</p>
                                {n.author && (
                                  <div className="mt-2">
                                    <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-foreground">
                                      <UserCheck className="size-2.5" />
                                      {n.author}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
          </TabsContent>

          {/* ── Documents ── */}
          {/* ── Feedback ── */}
          <TabsContent value="feedback" className="mt-0 p-6">
            <EntryTab
              contactId={contactId}
              entryType="feedback"
              entries={feedbackEntries.data ?? []}
              loading={feedbackEntries.loading}
              onReload={feedbackEntries.reload}
              statusMap={FEEDBACK_STATUS}
              statuses={["received", "reviewing", "responded", "closed"]}
              icon={ThumbsUp}
              iconColor="text-blue-500"
              title="Customer Feedback"
              emptyText="No feedback recorded yet"
              emptyHint="Track customer satisfaction, feature requests, and product feedback."
              addLabel="Add feedback"
              placeholder="What feedback did the customer share?"
            />
          </TabsContent>

          {/* ── Issues ── */}
          <TabsContent value="issues" className="mt-0 p-6">
            <EntryTab
              contactId={contactId}
              entryType="issue"
              entries={issueEntries.data ?? []}
              loading={issueEntries.loading}
              onReload={issueEntries.reload}
              statusMap={ISSUE_STATUS}
              statuses={["reported", "assigned", "working", "fixed", "closed"]}
              icon={AlertCircle}
              iconColor="text-amber-500"
              title="Support Issues"
              emptyText="No issues reported"
              emptyHint="Track bugs, complaints, and support issues raised by this customer."
              addLabel="Report issue"
              placeholder="Describe the issue..."
            />
          </TabsContent>

          <TabsContent value="docs" className="mt-0 p-6">
            <RecordDocuments recordKind="customer" recordId={contactId} addedBy={c.name || "CRM"} today={todayIso()} />
          </TabsContent>

          {/* ── Account ── */}
          <TabsContent value="account" className="mt-0 p-6">
            {account.data ? (
              <div className="space-y-5">
                {/* Financial summary cards */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {([
                    ["Invoices", String(account.data.invoices), "Total sent", "bg-accent"],
                    ["Invoiced", account.data.invoiced ? formatCurrencyINR(Number(account.data.invoiced)) : "—", "Lifetime value", "bg-blue-500"],
                    ["Paid", account.data.paid ? formatCurrencyINR(Number(account.data.paid)) : "—", "Received", "bg-emerald-500"],
                    ["Credited", account.data.credited ? formatCurrencyINR(Number(account.data.credited)) : "—", "Credit notes", "bg-violet-500"],
                    ["Due", account.data.due ? formatCurrencyINR(Number(account.data.due)) : "—", "Outstanding", "bg-amber-500"],
                  ] as const).map(([label, value, desc, dot]) => (
                    <div key={label} className="rounded-lg border border-border bg-surface px-4 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <span className={cn("size-1.5 rounded-full", dot)} />
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</span>
                      </div>
                      <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
                      <span className="text-[10px] text-muted-foreground">{desc}</span>
                    </div>
                  ))}
                </div>

                {/* Overdue alert */}
                {account.data.overdueInvoices > 0 && (
                  <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-danger" />
                      <span className="text-sm font-medium text-danger">
                        {account.data.overdueInvoices} overdue invoice{account.data.overdueInvoices > 1 ? "s" : ""}
                      </span>
                      <span className="text-xs text-muted-foreground">· oldest {account.data.oldestOverdueDays} days ago</span>
                    </div>
                    {account.data.overdue && Number(account.data.overdue) > 0 && (
                      <div className="mt-1 text-lg font-bold tabular-nums text-danger">{formatCurrencyINR(Number(account.data.overdue))} overdue</div>
                    )}
                  </div>
                )}

                {/* Billing details */}
                <div className="rounded-lg border border-border bg-surface">
                  <div className="border-b border-border px-4 py-2.5">
                    <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Billing details</h4>
                  </div>
                  <div className="grid gap-px sm:grid-cols-2">
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-border sm:border-r">
                      <CreditCard className="size-4 text-muted-foreground" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">Payment terms</p>
                        <p className="text-sm font-medium">{c.paymentTerms || "Not set"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                      <IndianRupee className="size-4 text-muted-foreground" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">Credit limit</p>
                        <p className="text-sm font-medium">
                          {c.creditLimit ? formatCurrencyINR(c.creditLimit) : "Not set"}
                          {c.creditLimit && account.data.due && Number(account.data.due) > 0 && (
                            <span className={cn("ml-1.5 text-[10px]", Number(account.data.due) > c.creditLimit ? "text-danger" : "text-emerald-500")}>
                              ({Math.round((Number(account.data.due) / c.creditLimit) * 100)}% used)
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-border sm:border-b-0 sm:border-r">
                      <Building2 className="size-4 text-muted-foreground" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">GSTIN</p>
                        <p className="text-sm font-medium font-mono">{c.gstin || "Not provided"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 px-4 py-3">
                      <Settings className="size-4 text-muted-foreground" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">Place of supply</p>
                        <p className="text-sm font-medium">{c.placeOfSupply || "Not set"}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {account.data.lastInvoiceOn && (
                  <p className="text-xs text-muted-foreground">Last invoice: {formatRelativeTime(account.data.lastInvoiceOn)}</p>
                )}
              </div>
            ) : account.error ? (
              <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-6 text-center">
                <p className="text-sm text-danger">Account data could not be loaded.</p>
                <Button variant="ghost" size="sm" className="mt-2 gap-1.5 text-xs" onClick={() => account.reload()}>
                  <RefreshCw className="size-3" /> Retry
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-center py-12">
                <div className="flex flex-col items-center gap-2">
                  <div className="size-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                  <span className="text-xs text-muted-foreground">Loading account data...</span>
                </div>
              </div>
            )}
          </TabsContent>
        </div>
      </Tabs>

      <ActivityForm
        open={activityOpen}
        onOpenChange={setActivityOpen}
        contactId={contactId}
        onSaved={() => { detail.reload(); journey.reload(); }}
      />

      {/* Archive confirmation */}
      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive this customer?</DialogTitle>
            <DialogDescription>
              This customer will be moved to Archived Customers and removed from your active customer list.
              Their associated leads, deals, activities, notes, documents, and relationship history will be
              retained but may no longer appear in active views.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setArchiveOpen(false)} disabled={actionLoading}>Cancel</Button>
            <Button variant="secondary" onClick={handleArchive} disabled={actionLoading}>
              {actionLoading ? "Archiving…" : "Archive customer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit contact */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit contact</DialogTitle>
            <DialogDescription>Update contact details and billing information.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void saveContact(); }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-name">Name</Label>
                <Input id="edit-name" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-company">Company</Label>
                <Input id="edit-company" value={editForm.company} onChange={(e) => setEditForm({ ...editForm, company: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-phone">Phone</Label>
                <Input id="edit-phone" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-email">Email</Label>
                <Input id="edit-email" type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
              </div>
            </div>
            <div className="border-t border-border pt-3">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Billing</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-terms">Payment terms</Label>
                  <Input id="edit-terms" placeholder="e.g. Net 30" value={editForm.paymentTerms} onChange={(e) => setEditForm({ ...editForm, paymentTerms: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-limit">Credit limit</Label>
                  <Input id="edit-limit" type="number" placeholder="0" value={editForm.creditLimit} onChange={(e) => setEditForm({ ...editForm, creditLimit: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-gstin">GSTIN</Label>
                  <Input id="edit-gstin" placeholder="22AAAAA0000A1Z5" maxLength={15} className="font-mono" value={editForm.gstin} onChange={(e) => setEditForm({ ...editForm, gstin: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-pos">Place of supply</Label>
                  <Input id="edit-pos" placeholder="e.g. Maharashtra" value={editForm.placeOfSupply} onChange={(e) => setEditForm({ ...editForm, placeOfSupply: e.target.value })} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={editSaving}>{editSaving ? "Saving…" : "Save changes"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={deleteOpen} onOpenChange={(open) => { setDeleteOpen(open); if (!open) setDeleteConfirm(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-danger">Permanently delete this customer?</DialogTitle>
            <DialogDescription>
              Deleting this customer may permanently remove important business information associated with this relationship.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm">
            {impact && impact.leads > 0 && (
              <p className="font-medium text-danger">{impact.leads} lead{impact.leads > 1 ? "s" : ""} and {impact.deals} deal{impact.deals > 1 ? "s" : ""} will need to be deleted first.</p>
            )}
            <ul className="list-disc pl-4 space-y-1 text-muted-foreground text-xs">
              <li>Associated leads may be deleted or become inaccessible</li>
              <li>Linked deals and pipeline history may be affected</li>
              <li>Activities and follow-up records may be lost</li>
              <li>Notes, documents, and relationship history may be permanently removed</li>
              <li>Reports, analytics, and historical references may be affected</li>
            </ul>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Type <strong className="text-foreground">DELETE</strong> to confirm
            </label>
            <Input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="DELETE"
              className="font-mono"
            />
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={actionLoading}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={actionLoading || deleteConfirm !== "DELETE"}
            >
              {actionLoading ? "Deleting…" : "Permanently delete customer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
