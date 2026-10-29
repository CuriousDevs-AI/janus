"use client";

import * as React from "react";
import { Mic, MicOff, Phone, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface GuestCall {
  company: string;
  agentName: string;
  status: string;
  ice: {
    iceServers: Array<{ urls: string[]; username?: string | null; credential?: string | null }>;
    iceTransportPolicy: RTCIceTransportPolicy;
  };
}

interface Signal {
  id: string;
  kind: "offer" | "answer" | "ice" | "bye";
  payload: { sdp?: string; candidates?: RTCIceCandidateInit[] };
}

type Stage = "loading" | "invalid" | "ready" | "joining" | "live" | "ended";

async function post(path: string, body?: unknown) {
  const response = await fetch(`/api/backend/public/calls/${path}`, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(String(response.status));
}

function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * The customer's side of a browser call. They opened a link from the company; there is no account
 * and nothing to install. The page asks for the microphone only when they choose to join.
 */
export default function CallPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = React.use(params);
  const [stage, setStage] = React.useState<Stage>("loading");
  const [call, setCall] = React.useState<GuestCall | null>(null);
  const [connected, setConnected] = React.useState(false);
  const [muted, setMuted] = React.useState(false);
  const [problem, setProblem] = React.useState("");
  const [since, setSince] = React.useState<number | null>(null);
  const [now, setNow] = React.useState(() => Date.now());
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const pcRef = React.useRef<RTCPeerConnection | null>(null);
  const micRef = React.useRef<MediaStream | null>(null);
  const sourceRef = React.useRef<EventSource | null>(null);
  const pendingRef = React.useRef<RTCIceCandidateInit[]>([]);

  React.useEffect(() => {
    fetch(`/api/backend/public/calls/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("invalid");
        const data = (await response.json()) as GuestCall;
        setCall(data);
        setStage(data.status === "ringing" || data.status === "live" ? "ready" : "invalid");
      })
      .catch(() => setStage("invalid"));
  }, [token]);

  React.useEffect(() => {
    if (since === null || stage !== "live") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [since, stage]);

  const stop = React.useCallback(() => {
    sourceRef.current?.close();
    sourceRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    micRef.current?.getTracks().forEach((track) => track.stop());
    micRef.current = null;
    setConnected(false);
  }, []);
  React.useEffect(() => stop, [stop]);

  async function onSignal(item: Signal) {
    const key = encodeURIComponent(token);
    if (item.kind === "offer" && item.payload.sdp && call) {
      // Each offer starts a fresh connection: the agent offers again if this page reloads.
      pcRef.current?.close();
      pendingRef.current = [];
      const pc = new RTCPeerConnection({
        iceServers: call.ice.iceServers.map((server) => ({
          urls: server.urls,
          username: server.username ?? undefined,
          credential: server.credential ?? undefined,
        })),
        iceTransportPolicy: call.ice.iceTransportPolicy,
      });
      pcRef.current = pc;
      micRef.current?.getTracks().forEach((track) => pc.addTrack(track, micRef.current!));
      pc.ontrack = (event) => {
        if (audioRef.current) audioRef.current.srcObject = event.streams[0] ?? new MediaStream([event.track]);
      };
      let batch: RTCIceCandidateInit[] = [];
      let timer: ReturnType<typeof setTimeout> | null = null;
      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        batch.push(event.candidate.toJSON());
        timer ??= setTimeout(() => {
          void post(`${key}/signal`, { kind: "ice", payload: { candidates: batch } }).catch(() => undefined);
          batch = [];
          timer = null;
        }, 150);
      };
      pc.onconnectionstatechange = () => setConnected(pc.connectionState === "connected");
      await pc.setRemoteDescription({ type: "offer", sdp: item.payload.sdp });
      for (const candidate of pendingRef.current.splice(0)) await pc.addIceCandidate(candidate).catch(() => undefined);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await post(`${key}/signal`, { kind: "answer", payload: { sdp: answer.sdp } });
    } else if (item.kind === "ice") {
      const pc = pcRef.current;
      for (const candidate of item.payload.candidates ?? []) {
        if (pc?.remoteDescription) await pc.addIceCandidate(candidate).catch(() => undefined);
        else pendingRef.current.push(candidate);
      }
    }
  }

  async function join() {
    setStage("joining");
    setProblem("");
    try {
      micRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setProblem("Your microphone is blocked, so they will not hear you. Allow it in the browser to talk.");
    }
    try {
      await post(`${encodeURIComponent(token)}/join`);
    } catch {
      stop();
      setStage("invalid");
      return;
    }
    setStage("live");
    setSince(Date.now());
    const source = new EventSource(`/api/backend/public/calls/${encodeURIComponent(token)}/stream`);
    sourceRef.current = source;
    source.addEventListener("signal", (event) => {
      void onSignal(JSON.parse((event as MessageEvent).data) as Signal).catch(() => undefined);
    });
    source.addEventListener("state", (event) => {
      const state = JSON.parse((event as MessageEvent).data) as { status: string };
      if (state.status === "ended" || state.status === "expired") {
        stop();
        setStage("ended");
      }
    });
  }

  async function hangUp() {
    stop();
    setStage("ended");
    await post(`${encodeURIComponent(token)}/leave`).catch(() => undefined);
  }

  function toggleMute() {
    setMuted((value) => {
      micRef.current?.getAudioTracks().forEach((track) => { track.enabled = value; });
      return !value;
    });
  }

  const elapsed = since === null ? 0 : Math.max(0, Math.floor((now - since) / 1000));

  return (
    <main className="flex min-h-dvh flex-1 flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 text-center shadow-sm">
        {stage === "loading" ? (
          <p className="text-sm text-muted-foreground" role="status">Opening the call…</p>
        ) : stage === "invalid" ? (
          <>
            <h1 className="text-lg font-semibold">This call link has ended</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Links work once and for a short time. Ask the company to send a new one.
            </p>
          </>
        ) : stage === "ended" ? (
          <>
            <h1 className="text-lg font-semibold">Call ended</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Thank you for talking with {call?.agentName ?? "us"}{call?.company ? ` from ${call.company}` : ""}. You can close this page.
            </p>
          </>
        ) : (
          <>
            <span
              className={cn(
                "mx-auto flex size-20 items-center justify-center rounded-full bg-success-muted text-success",
                stage === "ready" && "animate-pulse",
                connected && "ring-4 ring-success/30",
              )}
            >
              <Phone className="size-8" />
            </span>
            <h1 className="mt-4 text-lg font-semibold">{call?.agentName}</h1>
            <p className="text-sm text-muted-foreground">{call?.company}</p>
            {stage === "ready" ? (
              <>
                <p className="mt-4 text-sm">wants to talk to you. The call runs in this browser; nothing to install.</p>
                <Button className="mt-5 w-full" size="lg" onClick={() => void join()}>
                  <Phone className="size-4" /> Join the call
                </Button>
                <p className="mt-3 text-[11px] text-muted-foreground">Your browser will ask to use the microphone.</p>
              </>
            ) : (
              <>
                <p className="mt-4 text-sm text-muted-foreground" role="status">
                  {stage === "joining" ? "Joining…" : connected ? "Connected" : "Connecting…"}
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums" aria-label="Call length">{clock(elapsed)}</p>
                <div className="mt-5 flex justify-center gap-3">
                  <Button variant={muted ? "destructive" : "secondary"} size="lg" onClick={toggleMute} aria-pressed={muted} aria-label={muted ? "Unmute" : "Mute"}>
                    {muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                  </Button>
                  <Button variant="destructive" size="lg" onClick={() => void hangUp()} aria-label="Hang up">
                    <PhoneOff className="size-4" /> Hang up
                  </Button>
                </div>
              </>
            )}
            {problem ? <p className="mt-4 text-xs text-warning">{problem}</p> : null}
          </>
        )}
      </div>
      <p className="mt-6 text-[11px] text-muted-foreground">Calls are encrypted between your browser and theirs.</p>
      <audio ref={audioRef} autoPlay className="hidden" />
    </main>
  );
}
