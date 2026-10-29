"use client";

import * as React from "react";
import { Copy, Globe, Mic, MicOff, NotebookPen, Phone, PhoneOff, Send } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/components/auth/session-provider";
import { api, message as errorText } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import type { Contact, WhatsAppConversation } from "@/lib/api/types";
import { demoMode } from "@/lib/demo-mode";
import { hasPermission } from "@/lib/demo-persona";
import { cn, formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fetchIceConfig } from "@/components/team/voice-call";

export interface CustomerCall {
  id: string;
  contactId: string;
  agentId: string;
  agentName: string;
  method: "phone" | "browser";
  direction: "outbound" | "inbound";
  status: "logged" | "ringing" | "live" | "ended" | "expired";
  outcome: CallOutcome | null;
  durationSeconds: number | null;
  notes: string;
  expiresAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
}

export type CallOutcome = "connected" | "no_answer" | "busy" | "voicemail" | "wrong_number";

export const OUTCOMES: Array<{ id: CallOutcome; label: string }> = [
  { id: "connected", label: "Connected" },
  { id: "no_answer", label: "No answer" },
  { id: "busy", label: "Busy" },
  { id: "voicemail", label: "Left voicemail" },
  { id: "wrong_number", label: "Wrong number" },
];

export function durationText(seconds: number | null) {
  if (seconds === null) return "";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes ? `${minutes}m ${String(rest).padStart(2, "0")}s` : `${rest}s`;
}

/** "Phone call out · Connected · 3m 05s", the one line a call log shows. */
export function callSummary(call: CustomerCall) {
  const kind = call.method === "browser" ? "Browser call" : call.direction === "inbound" ? "Phone call in" : "Phone call out";
  const state =
    call.status === "ringing" ? "Waiting for the customer" :
    call.status === "live" ? "In progress" :
    call.status === "expired" ? "Link expired" :
    OUTCOMES.find((item) => item.id === call.outcome)?.label ?? "";
  return [kind, state, durationText(call.durationSeconds)].filter(Boolean).join(" · ");
}

/**
 * Call a customer: on the phone (then log how it went), or in the browser through a one-time link
 * the customer opens without an account. A contact who asked not to be contacted is not called.
 */
export function CustomerCallButton({
  contactId,
  name,
  phone,
  doNotContact,
  conversation,
  onChanged,
  size = "sm",
}: {
  contactId: string;
  name: string;
  phone: string | null;
  doNotContact: boolean;
  conversation?: WhatsAppConversation | null;
  onChanged?: () => void;
  size?: "sm" | "icon";
}) {
  const session = useSession();
  const [logging, setLogging] = React.useState<"outbound" | "inbound" | null>(null);
  const [browser, setBrowser] = React.useState(false);
  if (demoMode || !hasPermission(session.permissions, "leads:write")) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size={size} variant="secondary" aria-label={`Call ${name}`}>
            <Phone className="size-3.5" />
            {size === "icon" ? null : <span>Call</span>}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {doNotContact ? (
            <DropdownMenuLabel className="text-xs font-normal text-warning">
              This contact asked not to be contacted.
            </DropdownMenuLabel>
          ) : null}
          <DropdownMenuItem
            disabled={!phone || doNotContact}
            onSelect={() => {
              window.location.href = `tel:${phone}`;
              setLogging("outbound");
            }}
          >
            <Phone className="size-3.5" />
            <span className="flex flex-col">
              <span>Call on phone</span>
              <span className="text-[11px] text-muted-foreground">{phone ?? "No phone number"}</span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem disabled={doNotContact} onSelect={() => setBrowser(true)}>
            <Globe className="size-3.5" />
            <span className="flex flex-col">
              <span>Call in the browser</span>
              <span className="text-[11px] text-muted-foreground">Send a link; no app needed</span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setLogging("outbound")}>
            <NotebookPen className="size-3.5" /> Log a call
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setLogging("inbound")}>
            <NotebookPen className="size-3.5" /> Log a call they made
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <LogCallDialog
        contactId={contactId}
        name={name}
        direction={logging}
        onClose={() => setLogging(null)}
        onLogged={() => {
          setLogging(null);
          onChanged?.();
        }}
      />
      {browser ? (
        <BrowserCallDialog
          contactId={contactId}
          name={name}
          conversation={conversation ?? null}
          onClose={() => {
            setBrowser(false);
            onChanged?.();
          }}
        />
      ) : null}
    </>
  );
}

function OutcomePicker({ value, onChange }: { value: CallOutcome; onChange: (value: CallOutcome) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="How did it go">
      {OUTCOMES.map((item) => (
        <button
          key={item.id}
          type="button"
          role="radio"
          aria-checked={value === item.id}
          onClick={() => onChange(item.id)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            value === item.id ? "border-accent bg-accent-muted text-accent" : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function LogCallDialog({
  contactId,
  name,
  direction,
  onClose,
  onLogged,
}: {
  contactId: string;
  name: string;
  direction: "outbound" | "inbound" | null;
  onClose: () => void;
  onLogged: () => void;
}) {
  const [outcome, setOutcome] = React.useState<CallOutcome>("connected");
  const [minutes, setMinutes] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !direction) return;
    const length = Number(minutes);
    if (minutes && (!Number.isFinite(length) || length < 0 || length > 1440)) {
      setError("Enter the length in minutes, up to 1440.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(`/contacts/${encodeURIComponent(contactId)}/calls`, {
        method: "POST",
        body: JSON.stringify({
          direction,
          outcome,
          duration_seconds: minutes ? Math.round(length * 60) : null,
          notes: notes.trim(),
        }),
      });
      toast.success("Call logged");
      setMinutes("");
      setNotes("");
      setOutcome("connected");
      onLogged();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={direction !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent>
        <form onSubmit={save} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{direction === "inbound" ? `Log a call from ${name}` : `Log a call with ${name}`}</DialogTitle>
            <DialogDescription>It goes on the contact&apos;s record, where the team can see it.</DialogDescription>
          </DialogHeader>
          <OutcomePicker value={outcome} onChange={setOutcome} />
          {outcome === "connected" ? (
            <div className="space-y-1.5">
              <Label htmlFor="call-minutes">Length in minutes</Label>
              <Input id="call-minutes" inputMode="decimal" placeholder="For example 4" value={minutes} onChange={(event) => setMinutes(event.target.value)} className="max-w-40" />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="call-notes">Notes</Label>
            <Textarea id="call-notes" rows={3} maxLength={2000} placeholder="What was agreed, and what happens next" value={notes} onChange={(event) => setNotes(event.target.value)} />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Log call"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type Stage = "starting" | "ringing" | "live" | "ended";

/** One browser call with a customer, from making the link to noting how it went. */
function BrowserCallDialog({
  contactId,
  name,
  conversation,
  onClose,
}: {
  contactId: string;
  name: string;
  conversation: WhatsAppConversation | null;
  onClose: () => void;
}) {
  const session = useSession();
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const call = useAgentCall(contactId, audioRef);
  // Until the agent picks, the outcome is what the call itself showed: connected or not.
  const [picked, setOutcome] = React.useState<CallOutcome | null>(null);
  const [notes, setNotes] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const replyOpen = Boolean(conversation?.replyWindowEndsAt) && new Date(conversation!.replyWindowEndsAt as string) > new Date();
  const ended = call.stage === "ended";
  const outcome: CallOutcome = picked ?? call.result?.outcome ?? "connected";

  async function sendLink() {
    if (!conversation || !call.link) return;
    setSending(true);
    try {
      await api(`/whatsapp/conversations/${encodeURIComponent(conversation.id)}/messages`, {
        method: "POST",
        body: JSON.stringify({
          kind: "text",
          body: `${session.user.name} from ${session.tenant.name} would like to talk to you. Tap to join the call in your browser: ${call.link}`,
        }),
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      setSent(true);
      toast.success("Link sent on WhatsApp");
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setSending(false);
    }
  }

  async function finish() {
    if (call.result) {
      try {
        await api(`/calls/${call.result.id}`, { method: "PATCH", body: JSON.stringify({ outcome, notes: notes.trim() }) });
        toast.success("Call saved");
      } catch (err) {
        toast.error(errorText(err));
        return;
      }
    }
    onClose();
  }

  async function close() {
    if (call.stage === "ringing" || call.stage === "live") {
      await call.hangUp();
      return;
    }
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : void close())}>
      <DialogContent onInteractOutside={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{ended ? `Call with ${name} ended` : `Browser call with ${name}`}</DialogTitle>
          <DialogDescription>
            {call.stage === "starting" ? "Making a call link…" :
              call.stage === "ringing" ? "Send the link. The call starts when they open it, for the next 30 minutes." :
              call.stage === "live" ? (call.connected ? "Connected" : "They opened the link. Connecting…") :
              "Note how it went; it goes on the contact's record."}
          </DialogDescription>
        </DialogHeader>

        {call.error ? <p className="text-sm text-destructive">{call.error}</p> : null}

        {call.stage === "ringing" && call.link ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-md border border-border bg-surface-2 p-2">
              <code className="min-w-0 flex-1 truncate text-xs" aria-label="Call link">{call.link}</code>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  void navigator.clipboard.writeText(call.link!).then(() => toast.success("Link copied"));
                }}
              >
                <Copy className="size-3.5" /> Copy
              </Button>
            </div>
            {conversation && replyOpen ? (
              <Button className="w-full" onClick={() => void sendLink()} disabled={sending || sent}>
                <Send className="size-3.5" /> {sent ? "Sent on WhatsApp" : sending ? "Sending…" : "Send on WhatsApp"}
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                {conversation
                  ? "WhatsApp free text is closed for this chat (24 hours after their last message). Copy the link and send it another way."
                  : "This contact has no WhatsApp chat yet. Copy the link and send it another way."}
              </p>
            )}
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <span className="size-2 animate-pulse rounded-full bg-warning" /> Waiting for {name} to open the link
            </p>
          </div>
        ) : null}

        {call.stage === "live" ? (
          <div className="flex flex-col items-center gap-4 py-2">
            <span className={cn("flex size-16 items-center justify-center rounded-full bg-success-muted text-success", call.connected && "ring-4 ring-success/30")}>
              <Phone className="size-6" />
            </span>
            <p className="text-2xl font-semibold tabular-nums" aria-label="Call length">{durationText(call.elapsed)}</p>
            <div className="flex gap-2">
              <Button variant={call.muted ? "destructive" : "secondary"} onClick={call.toggleMute} aria-pressed={call.muted} aria-label={call.muted ? "Unmute" : "Mute"}>
                {call.muted ? <MicOff className="size-4" /> : <Mic className="size-4" />} {call.muted ? "Unmute" : "Mute"}
              </Button>
              <Button variant="destructive" onClick={() => void call.hangUp()} aria-label="Hang up">
                <PhoneOff className="size-4" /> Hang up
              </Button>
            </div>
            {call.micBlocked ? <p className="text-xs text-muted-foreground">Microphone blocked: they cannot hear you.</p> : null}
          </div>
        ) : null}

        {ended ? (
          <div className="space-y-3">
            {call.result ? <p className="text-sm text-muted-foreground">{callSummary(call.result)}</p> : null}
            <OutcomePicker value={outcome} onChange={setOutcome} />
            <Textarea aria-label="Call notes" rows={3} maxLength={2000} placeholder="What was agreed, and what happens next" value={notes} onChange={(event) => setNotes(event.target.value)} />
          </div>
        ) : null}

        <DialogFooter>
          {ended ? (
            <Button onClick={() => void finish()}>Save</Button>
          ) : call.stage === "ringing" ? (
            <Button variant="ghost" onClick={() => void call.hangUp()}>Cancel the call</Button>
          ) : null}
        </DialogFooter>
        <audio ref={audioRef} autoPlay className="hidden" />
      </DialogContent>
    </Dialog>
  );
}

interface SignalMessage {
  id: string;
  kind: "offer" | "answer" | "ice" | "bye";
  payload: { sdp?: string; candidates?: RTCIceCandidateInit[] };
}

/** The agent's side of a browser call: make the link, then offer audio each time the customer opens it. */
function useAgentCall(contactId: string, audioRef: React.RefObject<HTMLAudioElement | null>) {
  const [stage, setStage] = React.useState<Stage>("starting");
  const [link, setLink] = React.useState<string | null>(null);
  const [callId, setCallId] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<CustomerCall | null>(null);
  const [connected, setConnected] = React.useState(false);
  const [muted, setMuted] = React.useState(false);
  const [micBlocked, setMicBlocked] = React.useState(false);
  const [error, setError] = React.useState("");
  const [liveSince, setLiveSince] = React.useState<number | null>(null);
  const [now, setNow] = React.useState(() => Date.now());
  const pcRef = React.useRef<RTCPeerConnection | null>(null);
  const micRef = React.useRef<MediaStream | null>(null);
  const sourceRef = React.useRef<EventSource | null>(null);
  const joinedRef = React.useRef<string | null>(null);
  const pendingRef = React.useRef<RTCIceCandidateInit[]>([]);
  const started = React.useRef(false);

  const stop = React.useCallback(() => {
    sourceRef.current?.close();
    sourceRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    micRef.current?.getTracks().forEach((track) => track.stop());
    micRef.current = null;
    setConnected(false);
  }, []);

  React.useEffect(() => {
    if (liveSince === null || stage !== "live") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [liveSince, stage]);

  React.useEffect(() => {
    // The dialog opens once per call; a second effect run in development must not make a second link.
    if (started.current) return;
    started.current = true;
    let id = "";
    const send = (kind: SignalMessage["kind"], payload: SignalMessage["payload"]) =>
      api(`/calls/${id}/signal`, { method: "POST", body: JSON.stringify({ kind, payload }) }).catch(() => undefined);

    async function connect() {
      pcRef.current?.close();
      pendingRef.current = [];
      setConnected(false);
      const ice = await fetchIceConfig();
      const pc = new RTCPeerConnection(ice.config);
      pcRef.current = pc;
      micRef.current?.getTracks().forEach((track) => pc.addTrack(track, micRef.current!));
      if (!micRef.current) pc.addTransceiver("audio", { direction: "recvonly" });
      pc.ontrack = (event) => {
        if (audioRef.current) audioRef.current.srcObject = event.streams[0] ?? new MediaStream([event.track]);
      };
      let batch: RTCIceCandidateInit[] = [];
      let timer: ReturnType<typeof setTimeout> | null = null;
      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        batch.push(event.candidate.toJSON());
        timer ??= setTimeout(() => {
          void send("ice", { candidates: batch });
          batch = [];
          timer = null;
        }, 150);
      };
      pc.onconnectionstatechange = () => setConnected(pc.connectionState === "connected");
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await send("offer", { sdp: offer.sdp });
    }

    async function onSignal(item: SignalMessage) {
      const pc = pcRef.current;
      if (!pc) return;
      if (item.kind === "answer" && item.payload.sdp) {
        await pc.setRemoteDescription({ type: "answer", sdp: item.payload.sdp });
        for (const candidate of pendingRef.current.splice(0)) await pc.addIceCandidate(candidate).catch(() => undefined);
      } else if (item.kind === "ice") {
        for (const candidate of item.payload.candidates ?? []) {
          if (pc.remoteDescription) await pc.addIceCandidate(candidate).catch(() => undefined);
          else pendingRef.current.push(candidate);
        }
      }
    }

    void (async () => {
      try {
        const made = await api<{ call: CustomerCall; link: string }>(
          `/contacts/${encodeURIComponent(contactId)}/calls/browser`,
          { method: "POST" },
        );
        id = made.call.id;
        setCallId(id);
        setLink(made.link);
        setStage("ringing");
        try {
          micRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch {
          setMicBlocked(true);
        }
        const source = new EventSource(`/api/backend/calls/${id}/stream`);
        sourceRef.current = source;
        source.addEventListener("state", (event) => {
          const state = JSON.parse((event as MessageEvent).data) as { status: string; guestJoinedAt?: string | null };
          if (state.status === "live") {
            setStage("live");
            setLiveSince((since) => since ?? Date.now());
            if (state.guestJoinedAt && state.guestJoinedAt !== joinedRef.current) {
              joinedRef.current = state.guestJoinedAt;
              void connect().catch((err) => setError(errorText(err)));
            }
          } else if (state.status === "ended" || state.status === "expired") {
            stop();
            void api<CustomerCall[]>(`/contacts/${encodeURIComponent(contactId)}/calls`)
              .then((rows) => setResult(rows.find((row) => row.id === id) ?? null))
              .catch(() => undefined);
            setStage("ended");
          }
        });
        source.addEventListener("signal", (event) => {
          void onSignal(JSON.parse((event as MessageEvent).data) as SignalMessage);
        });
      } catch (err) {
        setError(errorText(err));
        setStage("ended");
      }
    })();
  }, [contactId, stop, audioRef]);

  React.useEffect(() => stop, [stop]);

  const hangUp = React.useCallback(async () => {
    if (!callId) return;
    stop();
    try {
      setResult(await api<CustomerCall>(`/calls/${callId}/end`, { method: "POST" }));
    } catch (err) {
      setError(errorText(err));
    }
    setStage("ended");
  }, [callId, stop]);

  const toggleMute = React.useCallback(() => {
    setMuted((value) => {
      micRef.current?.getAudioTracks().forEach((track) => { track.enabled = value; });
      return !value;
    });
  }, []);

  return {
    stage,
    link,
    result,
    connected,
    muted,
    micBlocked,
    error,
    elapsed: liveSince === null ? 0 : Math.max(0, Math.floor((now - liveSince) / 1000)),
    hangUp,
    toggleMute,
  };
}

/** The calls with a contact, newest first, with a way to call them. Used on lead and deal pages. */
export function CustomerCalls({ contactId }: { contactId: string }) {
  const session = useSession();
  const allowed = !demoMode && hasPermission(session.permissions, "leads:read_own");
  const contact = useApi<Contact>(allowed ? `/contacts/${encodeURIComponent(contactId)}` : null);
  const conversation = useApi<WhatsAppConversation | null>(
    allowed ? `/whatsapp/contacts/${encodeURIComponent(contactId)}/conversation` : null,
  );
  const calls = useApi<CustomerCall[]>(allowed ? `/contacts/${encodeURIComponent(contactId)}/calls` : null);
  if (!allowed) return null;
  const rows = calls.data ?? [];
  const person = contact.data;

  return (
    <section aria-label="Calls" className="mb-5 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <Phone className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div>
            <h2 className="text-sm font-semibold">Calls</h2>
            <p className="text-xs text-muted-foreground">
              {calls.loading && !calls.data ? "Loading…" : rows.length ? `${rows.length} logged` : "No calls yet."}
            </p>
          </div>
        </div>
        {person ? (
          <CustomerCallButton
            contactId={contactId}
            name={person.name || person.phone || "this contact"}
            phone={person.phone}
            doNotContact={person.doNotContact}
            conversation={conversation.data}
            onChanged={calls.reload}
          />
        ) : null}
      </div>
      {calls.error ? <p className="mt-3 text-xs text-destructive">{calls.error}</p> : null}
      {rows.length ? (
        <ul className="mt-3 divide-y divide-border">
          {rows.slice(0, 5).map((row) => (
            <li key={row.id} className="py-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm">{callSummary(row)}</span>
                <span className="text-[11px] text-muted-foreground">{row.agentName} · {formatDateTime(row.createdAt)}</span>
              </div>
              {row.notes ? <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">{row.notes}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
