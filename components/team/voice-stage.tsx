"use client";

import * as React from "react";
import Link from "next/link";
import {
  HeadphoneOff,
  Headphones,
  Mic,
  MicOff,
  MonitorOff,
  MonitorUp,
  PhoneOff,
  Signal,
} from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useVoiceCall, type CallPerson } from "@/components/team/voice-call";
import type { TeamSpace } from "@/components/team/types";

const COLORS = ["#2563eb", "#059669", "#d97706", "#7c3aed", "#db2777", "#0891b2"];

function colorFor(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
}

/** A call in any conversation, shown above its chat: screens being shared, the people, the controls. */
export function CallPanel() {
  const call = useVoiceCall();
  const people = call.participants;
  const sharers = [
    ...(call.localScreen ? [{ id: call.me, stream: call.localScreen, name: "You" }] : []),
    ...[...call.screens].map(([id, stream]) => ({
      id,
      stream,
      name: people.find((person) => person.id === id)?.name ?? "Someone",
    })),
  ];
  return (
    <section aria-label="Call" className="flex max-h-[55vh] shrink-0 flex-col border-b border-border bg-surface-2/50">
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {sharers.length > 0 ? (
          <div className="mb-3 grid gap-3">
            {sharers.map((item) => (
              <ScreenTile key={item.id} stream={item.stream} label={item.id === call.me ? "You are sharing your screen" : `${item.name} is sharing`} self={item.id === call.me} />
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {people.map((person) => (
            <PersonTile key={person.id} person={person} me={person.id === call.me} speaking={call.speaking.has(person.id)} />
          ))}
        </div>
      </div>
      <CallControls />
      {call.micBlocked ? <p className="bg-surface px-3 pb-2 text-center text-[11px] text-muted-foreground">Microphone blocked: you can listen, not speak.</p> : null}
    </section>
  );
}

/** When other people are in this conversation's call: a way to join them. */
export function CallBanner({ space }: { space: TeamSpace }) {
  const call = useVoiceCall();
  if (call.spaceId === space.id || space.inCall.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border bg-success-muted/60 px-4 py-2" role="status">
      <div className="flex -space-x-2">
        {space.inCall.slice(0, 4).map((person) => (
          <Bubble key={person.id} person={person} size="sm" />
        ))}
      </div>
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-medium">{space.inCall.length === 1 ? space.inCall[0].name : `${space.inCall.length} people`}</span>{" "}
        {space.inCall.length === 1 ? "is" : "are"} in a call here
      </p>
      <Button size="sm" onClick={() => void call.join(space.id, space.title)} disabled={call.joining}>
        <Headphones className="size-3.5" /> {call.joining ? "Joining…" : "Join call"}
      </Button>
    </div>
  );
}

function ScreenTile({ stream, label, self }: { stream: MediaStream; label: string; self: boolean }) {
  const ref = React.useRef<HTMLVideoElement>(null);
  React.useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <figure className="overflow-hidden rounded-xl border border-border bg-black">
      <video ref={ref} autoPlay playsInline muted aria-label={label} className="aspect-video max-h-[60vh] w-full object-contain" />
      <figcaption className="flex items-center gap-2 bg-surface px-3 py-2 text-xs text-muted-foreground">
        <MonitorUp className="size-3.5 text-success" />
        {label}
        {self ? <span className="ml-auto">Others see this</span> : null}
      </figcaption>
    </figure>
  );
}

function PersonTile({ person, me, speaking }: { person: CallPerson; me: boolean; speaking: boolean }) {
  return (
    <div
      className={cn(
        "flex w-40 flex-col items-center gap-2 rounded-xl border bg-surface p-3 text-center transition-shadow",
        speaking ? "border-success shadow-[0_0_0_2px_var(--success)]" : "border-border",
      )}
      data-speaking={speaking ? "true" : undefined}
    >
      <Bubble person={person} size="md" speaking={speaking} />
      <div className="flex min-w-0 max-w-full items-center gap-1.5">
        <span className="truncate text-xs font-medium">{me ? `${person.name} (you)` : person.name}</span>
        {person.deafened ? (
          <HeadphoneOff className="size-3.5 shrink-0 text-destructive" aria-label="Deafened" />
        ) : person.muted ? (
          <MicOff className="size-3.5 shrink-0 text-destructive" aria-label="Muted" />
        ) : null}
        {person.sharing ? <MonitorUp className="size-3.5 shrink-0 text-success" aria-label="Sharing screen" /> : null}
      </div>
    </div>
  );
}

function Bubble({ person, size, speaking }: { person: CallPerson; size: "sm" | "md" | "lg"; speaking?: boolean }) {
  const dims = size === "lg" ? "size-16 text-lg" : size === "md" ? "size-10 text-sm" : "size-8 text-xs";
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-surface transition-shadow",
        dims,
        speaking && "ring-success",
      )}
      style={{ backgroundColor: colorFor(person.name) }}
      title={person.name}
    >
      {initials(person.name)}
    </span>
  );
}

/** Mute, deafen, share and leave, as one row. */
export function CallControls({ dense }: { dense?: boolean }) {
  const call = useVoiceCall();
  const size = dense ? "icon" : "default";
  return (
    <div className={cn("flex items-center justify-center gap-2", dense ? "" : "border-t border-border bg-surface p-3")}>
      <Button
        variant={call.muted ? "destructive" : "secondary"}
        size={size}
        aria-pressed={call.muted}
        aria-label={call.muted ? "Unmute" : "Mute"}
        onClick={call.toggleMute}
      >
        {call.muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
        {dense ? null : <span className="hidden sm:inline">{call.muted ? "Unmute" : "Mute"}</span>}
      </Button>
      <Button
        variant={call.deafened ? "destructive" : "secondary"}
        size={size}
        aria-pressed={call.deafened}
        aria-label={call.deafened ? "Undeafen" : "Deafen"}
        onClick={call.toggleDeafen}
      >
        {call.deafened ? <HeadphoneOff className="size-4" /> : <Headphones className="size-4" />}
        {dense ? null : <span className="hidden sm:inline">{call.deafened ? "Undeafen" : "Deafen"}</span>}
      </Button>
      <Button
        variant={call.sharing ? "default" : "secondary"}
        size={size}
        aria-pressed={call.sharing}
        aria-label={call.sharing ? "Stop sharing" : "Share screen"}
        onClick={() => void call.toggleShare()}
      >
        {call.sharing ? <MonitorOff className="size-4" /> : <MonitorUp className="size-4" />}
        {dense ? null : <span className="hidden sm:inline">{call.sharing ? "Stop sharing" : "Share screen"}</span>}
      </Button>
      <Button variant="destructive" size={size} aria-label="Leave call" onClick={() => void call.leave()}>
        <PhoneOff className="size-4" />
        {dense ? null : <span className="hidden sm:inline">Leave</span>}
      </Button>
    </div>
  );
}

/** The "voice connected" panel, shown while in a call: where you are, and the controls. */
export function CallBar({ link }: { link?: boolean }) {
  const call = useVoiceCall();
  if (!call.spaceId) return null;
  return (
    <div className="border-t border-border bg-surface px-3 py-2.5" role="region" aria-label="Voice connected">
      <div className="mb-2 flex items-center gap-2">
        <Signal className="size-4 text-success" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-success">Voice connected</p>
          {link ? (
            <Link href={`/team?space=${call.spaceId}&workspace=team-chat`} className="block truncate text-xs text-muted-foreground hover:text-foreground">
              {call.spaceName} · {call.participants.length} in call
            </Link>
          ) : (
            <p className="truncate text-xs text-muted-foreground">
              {call.spaceName} · {call.participants.length} in call
            </p>
          )}
        </div>
      </div>
      <CallControls dense />
      {call.micBlocked ? <p className="mt-2 text-[11px] text-muted-foreground">Microphone blocked: you can listen, not speak.</p> : null}
    </div>
  );
}

/** A small "in call" marker for the top bar on other pages, with a way back and a way out. */
export function CallPill() {
  const call = useVoiceCall();
  if (!call.spaceId) return null;
  return (
    <div className="flex items-center gap-1 rounded-md border border-success/40 bg-success-muted px-1.5 py-1 text-xs text-success" role="status">
      <Link href={`/team?space=${call.spaceId}&workspace=team-chat`} className="flex items-center gap-1.5 px-1 font-medium" aria-label={`Back to the call in ${call.spaceName}`}>
        <Signal className="size-3.5" />
        <span className="hidden max-w-[120px] truncate sm:inline">{call.spaceName}</span>
      </Link>
      <Button variant="ghost" size="icon" className="size-6 text-success" aria-label={call.muted ? "Unmute" : "Mute"} onClick={call.toggleMute}>
        {call.muted ? <MicOff className="size-3.5" /> : <Mic className="size-3.5" />}
      </Button>
      <Button variant="ghost" size="icon" className="size-6 text-destructive" aria-label="Leave call" onClick={() => void call.leave()}>
        <PhoneOff className="size-3.5" />
      </Button>
    </div>
  );
}
