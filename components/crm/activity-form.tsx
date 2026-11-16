"use client";

import { useState } from "react";
import { Phone, Video, Mail, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { api, message } from "@/lib/api/client";
import type { Activity, ActivityKind } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const KINDS: { key: ActivityKind; label: string; icon: typeof Phone }[] = [
  { key: "call", label: "Call", icon: Phone },
  { key: "meeting", label: "Meeting", icon: Video },
  { key: "email", label: "Email", icon: Mail },
  { key: "task", label: "Task", icon: ClipboardList },
];

const OUTCOMES = [
  { value: "connected", label: "Connected" },
  { value: "no_answer", label: "No Answer" },
  { value: "left_voicemail", label: "Left Voicemail" },
  { value: "interested", label: "Interested" },
  { value: "not_interested", label: "Not Interested" },
  { value: "follow_up", label: "Scheduled Follow-up" },
];

export function ActivityForm({
  open,
  onOpenChange,
  leadId,
  contactId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId?: string | null;
  contactId: string;
  onSaved?: () => void;
}) {
  const [kind, setKind] = useState<ActivityKind>("call");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [outcome, setOutcome] = useState("");
  const [duration, setDuration] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!subject.trim()) {
      toast.error("Enter a subject");
      return;
    }
    setBusy(true);
    try {
      await api<Activity>("/activities", {
        method: "POST",
        body: JSON.stringify({
          kind,
          subject: subject.trim(),
          description: description.trim(),
          leadId: leadId || null,
          contactId,
          outcome: outcome || null,
          durationSeconds: duration ? parseInt(duration, 10) * 60 : null,
          dueAt: dueAt || null,
        }),
      });
      toast.success("Activity logged");
      setSubject("");
      setDescription("");
      setOutcome("");
      setDuration("");
      setDueAt("");
      onOpenChange(false);
      onSaved?.();
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Log Activity</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-1">
            {KINDS.map((k) => (
              <button
                key={k.key}
                onClick={() => setKind(k.key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  kind === k.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface-2 text-muted-foreground hover:bg-surface-3",
                )}
              >
                <k.icon className="size-3.5" />
                {k.label}
              </button>
            ))}
          </div>
          <div>
            <Label>Subject</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={kind === "call" ? "Call with lead" : kind === "meeting" ? "Meeting about proposal" : "Subject"}
            />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What happened..."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Outcome</Label>
              <Select value={outcome} onValueChange={setOutcome}>
                <SelectTrigger><SelectValue placeholder="Select outcome" /></SelectTrigger>
                <SelectContent>
                  {OUTCOMES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(kind === "call" || kind === "meeting") && (
              <div>
                <Label>Duration (minutes)</Label>
                <Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="15" />
              </div>
            )}
            {kind === "task" && (
              <div>
                <Label>Due date</Label>
                <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
