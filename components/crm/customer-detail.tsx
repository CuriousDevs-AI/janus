"use client";

import { useState } from "react";
import {
  ArrowLeft, Building2, Mail, Phone, MessageCircle, User, Plus,
  Video, ClipboardList, StickyNote,
  ShieldOff,
} from "lucide-react";
import { toast } from "sonner";
import { api, message } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import type { ContactDetail, CustomerAccount } from "@/lib/api/types";
import { leadStageMeta } from "@/lib/status-meta";
import type { LeadStage } from "@/lib/types";
import { formatCurrencyINR, formatRelativeTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MetricCard } from "@/components/shared/metric-card";
import { ActivityForm } from "./activity-form";
import { TagsManager } from "./tags-manager";

const ACTIVITY_ICON: Record<string, typeof Phone> = {
  call: Phone, meeting: Video, email: Mail, task: ClipboardList, note: StickyNote,
};

export function CustomerDetailPanel({
  contactId,
  onBack,
}: {
  contactId: string;
  onBack: () => void;
}) {
  const detail = useApi<ContactDetail>(`/contacts/${contactId}/detail`);
  const account = useApi<CustomerAccount>(`/contacts/${contactId}/account`);
  const [activityOpen, setActivityOpen] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [tab, setTab] = useState("leads");

  const c = detail.data?.contact;
  if (!c) return <div className="p-6 text-sm text-muted-foreground">Loading...</div>;

  const leadsList = detail.data?.leads ?? [];
  const activeLeads = leadsList.filter((l) => !["won", "lost"].includes(l.stage));
  const totalDealValue = Number(detail.data?.totalDealValue ?? 0);

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

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-3 mb-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1 -ml-2">
            <ArrowLeft className="size-4" /> Back
          </Button>
        </div>
        <div className="flex items-start gap-4">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <User className="size-6" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold">{c.name || c.phone || c.email || "Customer"}</h2>
            {c.company && <p className="text-sm text-muted-foreground flex items-center gap-1"><Building2 className="size-3.5" /> {c.company}</p>}
            <div className="flex items-center gap-3 mt-1.5 text-sm text-muted-foreground">
              {c.phone && <span className="flex items-center gap-1"><Phone className="size-3" /> {c.phone}</span>}
              {c.email && <span className="flex items-center gap-1"><Mail className="size-3" /> {c.email}</span>}
              {c.doNotContact && <Badge variant="danger" className="text-[10px]"><ShieldOff className="size-3" /> DNC</Badge>}
              {c.whatsappOptIn && <Badge variant="success" className="text-[10px]"><MessageCircle className="size-3" /> WA Opted In</Badge>}
            </div>
          </div>
          <div className="flex gap-1.5">
            {c.phone && (
              <Button variant="outline" size="sm" className="gap-1" asChild>
                <a href={`tel:${c.phone}`}><Phone className="size-3.5" /></a>
              </Button>
            )}
            {c.email && (
              <Button variant="outline" size="sm" className="gap-1" asChild>
                <a href={`mailto:${c.email}`}><Mail className="size-3.5" /></a>
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-1" onClick={() => setActivityOpen(true)}>
              <Plus className="size-3.5" /> Activity
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <TagsManager entityType="contacts" entityId={contactId} tags={detail.data?.tags ?? []} onChanged={() => detail.reload()} />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 px-6 py-4 border-b border-border">
        <MetricCard label="Total Leads" value={String(leadsList.length)} />
        <MetricCard label="Active Leads" value={String(activeLeads.length)} />
        <MetricCard label="Deal Value" value={formatCurrencyINR(totalDealValue)} />
        <MetricCard
          label="Open Value"
          value={formatCurrencyINR(Number(detail.data?.openDealValue ?? 0))}
        />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className="mx-6 mt-3 justify-start">
          <TabsTrigger value="leads">Leads ({leadsList.length})</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="activities">Activities</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-auto">
          <TabsContent value="leads" className="px-6 pb-6 mt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Requirement</TableHead>
                  <TableHead>Deal</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leadsList.map((lead) => {
                  const sm = leadStageMeta[lead.stage as LeadStage];
                  return (
                    <TableRow key={lead.id}>
                      <TableCell className="text-xs capitalize">{lead.source.replace("_", " ")}</TableCell>
                      <TableCell><Badge variant={sm?.tone ?? "neutral"} className="text-[10px]">{sm?.label ?? lead.stage}</Badge></TableCell>
                      <TableCell className="max-w-[200px] truncate text-xs">{lead.requirement || "—"}</TableCell>
                      <TableCell className="text-xs">{lead.dealName ?? "—"}</TableCell>
                      <TableCell className="text-xs">{lead.dealAmount ? formatCurrencyINR(Number(lead.dealAmount)) : "—"}</TableCell>
                      <TableCell className="text-xs">{formatRelativeTime(lead.createdAt)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {leadsList.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No leads</p>}
          </TabsContent>

          <TabsContent value="notes" className="px-6 pb-6 mt-0">
            <div className="space-y-3 mt-3">
              <div className="flex gap-2">
                <Textarea
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  placeholder="Add a note..."
                  rows={2}
                  className="text-sm flex-1"
                />
                <Button size="sm" onClick={addNote} disabled={savingNote || !noteBody.trim()} className="self-end">
                  Add
                </Button>
              </div>
              {(detail.data?.notes ?? []).map((note) => (
                <div key={note.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <span className="font-medium text-foreground">{note.author ?? "System"}</span>
                    <span>{formatRelativeTime(note.createdAt)}</span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{note.body}</p>
                </div>
              ))}
              {detail.data?.notes?.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No notes</p>}
            </div>
          </TabsContent>

          <TabsContent value="activities" className="px-6 pb-6 mt-0">
            <div className="mt-3 space-y-1">
              <Button variant="outline" size="sm" className="gap-1 mb-3" onClick={() => setActivityOpen(true)}>
                <Plus className="size-3.5" /> Log Activity
              </Button>
              {(detail.data?.activities ?? []).map((act) => {
                const Icon = ACTIVITY_ICON[act.kind] ?? ClipboardList;
                return (
                  <div key={act.id} className="flex gap-3 py-2.5 border-b border-border last:border-0">
                    <div className="flex size-8 items-center justify-center rounded-full bg-surface-2 shrink-0">
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
                      </div>
                    </div>
                  </div>
                );
              })}
              {detail.data?.activities?.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No activities</p>}
            </div>
          </TabsContent>

          <TabsContent value="account" className="px-6 pb-6 mt-0">
            {account.data ? (
              <div className="space-y-4 mt-3">
                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Invoices</CardTitle></CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{account.data.invoices}</div>
                      {account.data.overdueInvoices > 0 && (
                        <p className="text-xs text-danger mt-1">{account.data.overdueInvoices} overdue ({account.data.oldestOverdueDays}d)</p>
                      )}
                    </CardContent>
                  </Card>
                  {account.data.full && (
                    <>
                      <Card>
                        <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Invoiced</CardTitle></CardHeader>
                        <CardContent><div className="text-2xl font-bold">{account.data.invoiced ? formatCurrencyINR(Number(account.data.invoiced)) : "—"}</div></CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Paid</CardTitle></CardHeader>
                        <CardContent><div className="text-2xl font-bold text-success">{account.data.paid ? formatCurrencyINR(Number(account.data.paid)) : "—"}</div></CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Due</CardTitle></CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">{account.data.due ? formatCurrencyINR(Number(account.data.due)) : "—"}</div>
                          {account.data.overdue && Number(account.data.overdue) > 0 && (
                            <p className="text-xs text-danger mt-1">{formatCurrencyINR(Number(account.data.overdue))} overdue</p>
                          )}
                        </CardContent>
                      </Card>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Loading account...</p>
            )}
          </TabsContent>
        </div>
      </Tabs>

      <ActivityForm
        open={activityOpen}
        onOpenChange={setActivityOpen}
        contactId={contactId}
        onSaved={() => detail.reload()}
      />
    </div>
  );
}
