"use client";

import { useState } from "react";
import {
  Phone, Mail, MessageCircle, Handshake, Building2,
  CalendarClock, User, Plus, Video,
  ClipboardList, StickyNote,
} from "lucide-react";
import { toast } from "sonner";
import { api, message } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import type { Activity, CrmTag, Deal, Lead, LeadNote, LeadScore } from "@/lib/api/types";
import { leadStageMeta } from "@/lib/status-meta";
import { SourceBadge } from "@/components/shared/source-badge";
import type { LeadStage } from "@/lib/types";
import { formatCurrencyINR, formatRelativeTime, formatDateTime } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ActivityForm } from "./activity-form";
import { TagsManager } from "./tags-manager";
import { DealItemsEditor } from "./deal-items";
import { RecordDocuments } from "@/components/shared/record-documents";
import { todayIso } from "@/lib/today";

const STAGES = ["new", "contacted", "qualified", "converted", "lost"] as const;

const ACTIVITY_ICON: Record<string, typeof Phone> = {
  call: Phone,
  meeting: Video,
  email: Mail,
  task: ClipboardList,
  note: StickyNote,
};

export function LeadDetailDrawer({
  lead,
  open,
  onOpenChange,
  onUpdated,
}: {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated?: () => void;
}) {
  if (!lead) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl p-0 flex flex-col">
        <LeadDetailContent lead={lead} onUpdated={onUpdated} />
      </SheetContent>
    </Sheet>
  );
}

function LeadDetailContent({
  lead,
  onUpdated,
}: {
  lead: Lead;
  onUpdated?: () => void;
}) {
  const notes = useApi<LeadNote[]>(`/leads/${lead.id}/notes`);
  const activities = useApi<Activity[]>(`/activities?lead_id=${lead.id}`);
  const deal = useApi<Deal | null>(lead.dealId ? `/deals/${lead.dealId}` : null);
  const tags = useApi<CrmTag[]>(`/leads/${lead.id}/tags`);
  const scoreData = useApi<LeadScore>(`/leads/${lead.id}/score`);
  const [activityOpen, setActivityOpen] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [noteFollowUp, setNoteFollowUp] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [tab, setTab] = useState("overview");

  const stageMeta = leadStageMeta[lead.stage as LeadStage] ?? { label: lead.stage, tone: "neutral" as const };

  async function addNote() {
    if (!noteBody.trim()) return;
    setSavingNote(true);
    try {
      await api(`/leads/${lead.id}/notes`, {
        method: "POST",
        body: JSON.stringify({
          body: noteBody.trim(),
          nextFollowUpOn: noteFollowUp || null,
        }),
      });
      setNoteBody("");
      setNoteFollowUp("");
      notes.reload();
      onUpdated?.();
      toast.success("Note added");
    } catch (e) {
      toast.error(message(e));
    } finally {
      setSavingNote(false);
    }
  }

  async function changeStage(newStage: string) {
    try {
      await api(`/leads/${lead.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: lead.contactName,
          phone: lead.phone,
          email: lead.email,
          company: lead.company,
          requirement: lead.requirement,
          stage: newStage,
        }),
      });
      toast.success(`Stage changed to ${newStage}`);
      onUpdated?.();
    } catch (e) {
      toast.error(message(e));
    }
  }

  return (
    <>
      <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
        <div className="flex items-start gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <User className="size-5" />
          </div>
          <div className="flex-1 min-w-0">
            <SheetTitle className="text-base truncate">{lead.contactName || lead.phone || lead.email || "Lead"}</SheetTitle>
            {lead.company && <p className="text-sm text-muted-foreground flex items-center gap-1"><Building2 className="size-3" /> {lead.company}</p>}
            <div className="flex items-center gap-2 mt-1.5">
              <Badge variant={stageMeta.tone}>{stageMeta.label}</Badge>
              <SourceBadge source={lead.source} />
              {scoreData.data && <Badge variant={scoreData.data.score >= 80 ? "success" : scoreData.data.score >= 50 ? "warning" : "neutral"} className="text-xs">Score: {scoreData.data.score}</Badge>}
              {lead.ownerName && <span className="text-xs text-muted-foreground">{lead.ownerName}</span>}
            </div>
          </div>
        </div>
        <div className="flex gap-1.5 mt-3">
          {lead.phone && (
            <Button variant="outline" size="sm" className="gap-1 text-xs" asChild>
              <a href={`tel:${lead.phone}`}><Phone className="size-3" /> Call</a>
            </Button>
          )}
          {lead.email && (
            <Button variant="outline" size="sm" className="gap-1 text-xs" asChild>
              <a href={`mailto:${lead.email}`}><Mail className="size-3" /> Email</a>
            </Button>
          )}
          {lead.phone && lead.whatsappOptIn && (
            <Button variant="outline" size="sm" className="gap-1 text-xs" asChild>
              <a href={`https://wa.me/${lead.phone.replace("+", "")}`} target="_blank" rel="noreferrer">
                <MessageCircle className="size-3" /> WhatsApp
              </a>
            </Button>
          )}
          <Select value={lead.stage} onValueChange={changeStage} disabled={lead.stage === "converted"}>
            <SelectTrigger className="h-7 w-32 text-xs ml-auto">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STAGES.filter((s) => s !== "converted").map((s) => (
                <SelectItem key={s} value={s}>{leadStageMeta[s].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </SheetHeader>

      <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className="mx-5 mt-3 justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="notes">Notes{notes.data ? ` (${notes.data.length})` : ""}</TabsTrigger>
          <TabsTrigger value="activities">Activities</TabsTrigger>
          <TabsTrigger value="deal">Deal</TabsTrigger>
          <TabsTrigger value="docs">Docs</TabsTrigger>
          <TabsTrigger value="tags">Tags</TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1">
          <TabsContent value="overview" className="px-5 pb-5 space-y-4 mt-0">
            <div className="grid gap-3 text-sm mt-3">
              <InfoRow label="Phone" value={lead.phone} />
              <InfoRow label="Email" value={lead.email} />
              <InfoRow label="Company" value={lead.company} />
              <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground shrink-0">Source</span><SourceBadge source={lead.source} /></div>
              <InfoRow label="Campaign" value={lead.campaign} />
              <InfoRow label="Created" value={formatDateTime(lead.createdAt)} />
              <InfoRow label="Last activity" value={formatRelativeTime(lead.lastActivityAt)} />
              {lead.nextFollowUpOn && <InfoRow label="Next follow-up" value={lead.nextFollowUpOn} />}
            </div>
            {lead.requirement && (
              <>
                <Separator />
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Requirement</p>
                  <p className="text-sm whitespace-pre-wrap">{lead.requirement}</p>
                </div>
              </>
            )}
            {lead.dealId && deal.data && (
              <>
                <Separator />
                <div className="rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Handshake className="size-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{deal.data.name}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                    <div>
                      <span className="block text-foreground font-medium">{formatCurrencyINR(Number(deal.data.amount))}</span>
                      Amount
                    </div>
                    <div>
                      <span className="block text-foreground font-medium capitalize">{deal.data.stage}</span>
                      Stage
                    </div>
                    <div>
                      <span className="block text-foreground font-medium">{deal.data.expectedCloseAt ?? "Not set"}</span>
                      Expected close
                    </div>
                  </div>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="notes" className="px-5 pb-5 mt-0">
            <div className="space-y-3 mt-3">
              <div className="rounded-lg border border-border p-3 space-y-2">
                <Textarea
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  placeholder="Add a follow-up note..."
                  rows={3}
                  className="text-sm"
                />
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Follow up on</Label>
                  <Input
                    type="date"
                    value={noteFollowUp}
                    onChange={(e) => setNoteFollowUp(e.target.value)}
                    className="h-7 w-36 text-xs"
                  />
                  <Button size="sm" className="ml-auto h-7 text-xs" onClick={addNote} disabled={savingNote || !noteBody.trim()}>
                    {savingNote ? "Saving..." : "Add Note"}
                  </Button>
                </div>
              </div>
              {(notes.data ?? []).map((note) => (
                <div key={note.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
                    <span className="font-medium text-foreground">{note.author ?? "System"}</span>
                    <span>{formatRelativeTime(note.createdAt)}</span>
                    {note.nextFollowUpOn && (
                      <Badge variant="outline" className="text-[10px] ml-auto gap-1">
                        <CalendarClock className="size-3" /> {note.nextFollowUpOn}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{note.body}</p>
                </div>
              ))}
              {notes.data?.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">No notes yet</p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="activities" className="px-5 pb-5 mt-0">
            <div className="mt-3 space-y-1">
              <Button variant="outline" size="sm" className="gap-1 mb-3" onClick={() => setActivityOpen(true)}>
                <Plus className="size-3.5" /> Log Activity
              </Button>
              {(activities.data ?? []).map((act) => {
                const Icon = ACTIVITY_ICON[act.kind] ?? ClipboardList;
                return (
                  <div key={act.id} className="flex gap-3 py-2.5 border-b border-border last:border-0">
                    <div className="flex size-8 items-center justify-center rounded-full bg-surface-2 shrink-0 mt-0.5">
                      <Icon className="size-3.5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{act.subject}</span>
                        <span className="text-xs text-muted-foreground capitalize">{act.kind}</span>
                      </div>
                      {act.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{act.description}</p>}
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        {act.ownerName && <span>{act.ownerName}</span>}
                        <span>{formatRelativeTime(act.createdAt)}</span>
                        {act.outcome && <Badge variant="outline" className="text-[10px]">{act.outcome.replace("_", " ")}</Badge>}
                        {act.durationSeconds && <span>{Math.round(act.durationSeconds / 60)}m</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
              {activities.data?.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">No activities logged</p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="deal" className="px-5 pb-5 mt-0">
            <div className="mt-3">
              {deal.data ? (
                <div className="space-y-4">
                  <div className="rounded-lg border border-border p-4">
                    <h4 className="font-medium mb-3">{deal.data.name}</h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div><span className="text-xs text-muted-foreground">Amount</span><br />{formatCurrencyINR(Number(deal.data.amount))}</div>
                      <div><span className="text-xs text-muted-foreground">Stage</span><br /><span className="capitalize">{deal.data.stage}</span></div>
                      <div><span className="text-xs text-muted-foreground">Expected Close</span><br />{deal.data.expectedCloseAt ?? "Not set"}</div>
                      <div><span className="text-xs text-muted-foreground">Last Updated</span><br />{formatRelativeTime(deal.data.updatedAt)}</div>
                    </div>
                  </div>
                  <DealItemsSection dealId={deal.data.id} />
                </div>
              ) : (
                <div className="text-center py-8">
                  <Handshake className="size-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground mb-3">No deal created yet</p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="docs" className="px-5 pb-5 mt-0">
            <div className="mt-3">
              <RecordDocuments recordKind="lead" recordId={lead.id} addedBy={lead.ownerName || "CRM"} today={todayIso()} />
            </div>
          </TabsContent>

          <TabsContent value="tags" className="px-5 pb-5 mt-0">
            <div className="mt-3">
              <TagsManager
                entityType="leads"
                entityId={lead.id}
                tags={tags.data ?? []}
                onChanged={() => tags.reload()}
              />
            </div>
          </TabsContent>
        </ScrollArea>
      </Tabs>

      <ActivityForm
        open={activityOpen}
        onOpenChange={setActivityOpen}
        leadId={lead.id}
        contactId={lead.customerId}
        onSaved={() => activities.reload()}
      />
    </>
  );
}

function DealItemsSection({ dealId }: { dealId: string }) {
  const items = useApi<import("@/lib/api/types").DealItem[]>(`/deals/${dealId}/items`);
  if (!items.data) return null;
  return (
    <div>
      <h4 className="text-sm font-medium mb-2">Line Items</h4>
      <DealItemsEditor dealId={dealId} items={items.data} onChanged={() => items.reload()} />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right max-w-[60%] truncate">{value}</span>
    </div>
  );
}
