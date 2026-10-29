"use client";

import * as React from "react";
import { toast } from "sonner";
import { useSession } from "@/components/auth/session-provider";
import { api, message as errorText } from "@/lib/api/client";
import { demoMode } from "@/lib/demo-mode";

/**
 * Voice calls for Team Chat: one browser-to-browser connection per person in the call (a mesh),
 * with the server relaying the WebRTC messages and saying who is in the call. Meant for small
 * team calls; a large call would need a media server.
 *
 * The call lives here, above every page, so it stays connected while the person moves around the
 * app. Connections follow the "perfect negotiation" pattern, so two people adding a track at the
 * same moment do not break the call.
 */

export interface CallPerson {
  id: number;
  name: string;
  muted: boolean;
  deafened: boolean;
  sharing: boolean;
}

interface CallOut {
  spaceId: string;
  participants: CallPerson[];
}

interface SignalOut {
  id: string;
  fromUserId: number;
  kind: "offer" | "answer" | "ice" | "bye";
  payload: Record<string, unknown>;
}

interface VoiceCall {
  spaceId: string | null;
  spaceName: string | null;
  participants: CallPerson[];
  me: number;
  muted: boolean;
  deafened: boolean;
  sharing: boolean;
  joining: boolean;
  micBlocked: boolean;
  speaking: Set<number>;
  screens: Map<number, MediaStream>;
  localScreen: MediaStream | null;
  join: (spaceId: string, name: string) => Promise<void>;
  leave: () => Promise<void>;
  toggleMute: () => void;
  toggleDeafen: () => void;
  toggleShare: () => Promise<void>;
}

const VoiceContext = React.createContext<VoiceCall | null>(null);

export function useVoiceCall(): VoiceCall {
  const value = React.useContext(VoiceContext);
  if (!value) throw new Error("useVoiceCall needs VoiceCallProvider");
  return value;
}

/** STUN and TURN servers come from configuration; without them, calls connect on the same network. */
function iceServers(): RTCIceServer[] {
  try {
    const raw = process.env.NEXT_PUBLIC_JANUS_ICE_SERVERS;
    return raw ? (JSON.parse(raw) as RTCIceServer[]) : [];
  } catch {
    return [];
  }
}

const SPEAKING_LEVEL = 0.03;

export function VoiceCallProvider({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const me = Number(session.user.id);
  const [spaceId, setSpaceId] = React.useState<string | null>(null);
  const [spaceName, setSpaceName] = React.useState<string | null>(null);
  const [participants, setParticipants] = React.useState<CallPerson[]>([]);
  const [muted, setMuted] = React.useState(false);
  const [deafened, setDeafened] = React.useState(false);
  const [sharing, setSharing] = React.useState(false);
  const [joining, setJoining] = React.useState(false);
  const [micBlocked, setMicBlocked] = React.useState(false);
  const [speaking, setSpeaking] = React.useState<Set<number>>(new Set());
  const [audio, setAudio] = React.useState<Map<number, MediaStream>>(new Map());
  const [screens, setScreens] = React.useState<Map<number, MediaStream>>(new Map());
  const [localScreen, setLocalScreen] = React.useState<MediaStream | null>(null);

  const peers = React.useRef(new Map<number, RTCPeerConnection>());
  const makingOffer = React.useRef(new Map<number, boolean>());
  const ignoreOffer = React.useRef(new Map<number, boolean>());
  const screenSenders = React.useRef(new Map<number, RTCRtpSender[]>());
  const mic = React.useRef<MediaStream | null>(null);
  const screen = React.useRef<MediaStream | null>(null);
  const stream = React.useRef<EventSource | null>(null);
  const current = React.useRef<string | null>(null);
  const state = React.useRef({ muted: false, deafened: false, sharing: false });

  const send = React.useCallback(async (to: number, kind: SignalOut["kind"], payload: Record<string, unknown>) => {
    const id = current.current;
    if (!id) return;
    try {
      await api(`/team/voice/${id}/signal`, {
        method: "POST",
        body: JSON.stringify({ to_user_id: to, kind, payload }),
      });
    } catch {
      // The other person may have just left; the next presence update closes their connection.
    }
  }, []);

  // Network candidates arrive in bursts; each person's are sent together, a few per second.
  const iceQueue = React.useRef(new Map<number, RTCIceCandidateInit[]>());
  const iceTimers = React.useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const queueIce = React.useCallback(
    (peerId: number, candidate: RTCIceCandidateInit) => {
      iceQueue.current.set(peerId, [...(iceQueue.current.get(peerId) ?? []), candidate]);
      if (iceTimers.current.has(peerId)) return;
      iceTimers.current.set(
        peerId,
        setTimeout(() => {
          const batch = iceQueue.current.get(peerId) ?? [];
          iceQueue.current.delete(peerId);
          iceTimers.current.delete(peerId);
          if (batch.length) void send(peerId, "ice", { candidates: batch });
        }, 150),
      );
    },
    [send],
  );

  const pushState = React.useCallback(async () => {
    const id = current.current;
    if (!id) return;
    try {
      const out = await api<CallOut>(`/team/voice/${id}/state`, { method: "POST", body: JSON.stringify(state.current) });
      setParticipants(out.participants);
    } catch {
      // A later presence update carries the state.
    }
  }, []);

  const closePeer = React.useCallback((peerId: number) => {
    clearTimeout(iceTimers.current.get(peerId));
    iceTimers.current.delete(peerId);
    iceQueue.current.delete(peerId);
    peers.current.get(peerId)?.close();
    peers.current.delete(peerId);
    makingOffer.current.delete(peerId);
    ignoreOffer.current.delete(peerId);
    screenSenders.current.delete(peerId);
    setAudio((map) => {
      const next = new Map(map);
      next.delete(peerId);
      return next;
    });
    setScreens((map) => {
      const next = new Map(map);
      next.delete(peerId);
      return next;
    });
  }, []);

  const peerFor = React.useCallback(
    (peerId: number) => {
      const existing = peers.current.get(peerId);
      if (existing) return existing;
      const pc = new RTCPeerConnection({ iceServers: iceServers() });
      peers.current.set(peerId, pc);
      for (const track of mic.current?.getTracks() ?? []) pc.addTrack(track, mic.current!);
      if (screen.current) {
        screenSenders.current.set(
          peerId,
          screen.current.getTracks().map((track) => pc.addTrack(track, screen.current!)),
        );
      }
      pc.onicecandidate = (event) => {
        if (event.candidate) queueIce(peerId, event.candidate.toJSON());
      };
      pc.onnegotiationneeded = async () => {
        try {
          makingOffer.current.set(peerId, true);
          await pc.setLocalDescription();
          if (pc.localDescription) void send(peerId, "offer", { description: pc.localDescription.toJSON() });
        } catch {
          // A failed renegotiation is retried by the next change.
        } finally {
          makingOffer.current.set(peerId, false);
        }
      };
      pc.ontrack = (event) => {
        const track = event.track;
        if (track.kind === "audio") {
          setAudio((map) => new Map(map).set(peerId, event.streams[0] ?? new MediaStream([track])));
          return;
        }
        const show = () => setScreens((map) => new Map(map).set(peerId, new MediaStream([track])));
        const hide = () =>
          setScreens((map) => {
            const next = new Map(map);
            next.delete(peerId);
            return next;
          });
        show();
        track.onunmute = show;
        track.onmute = hide;
        track.onended = hide;
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") pc.restartIce();
      };
      return pc;
    },
    [queueIce, send],
  );

  const onSignal = React.useCallback(
    async (signal: SignalOut) => {
      const from = signal.fromUserId;
      if (signal.kind === "bye") return closePeer(from);
      const pc = peerFor(from);
      const polite = me > from;
      try {
        if (signal.kind === "offer" || signal.kind === "answer") {
          const description = signal.payload.description as RTCSessionDescriptionInit;
          const collision =
            description.type === "offer" && (makingOffer.current.get(from) || pc.signalingState !== "stable");
          const ignore = !polite && collision;
          ignoreOffer.current.set(from, ignore);
          if (ignore) return;
          await pc.setRemoteDescription(description);
          if (description.type === "offer") {
            await pc.setLocalDescription();
            if (pc.localDescription) void send(from, "answer", { description: pc.localDescription.toJSON() });
          }
        } else if (signal.kind === "ice") {
          const batch =
            (signal.payload.candidates as RTCIceCandidateInit[] | undefined) ??
            [signal.payload.candidate as RTCIceCandidateInit];
          for (const candidate of batch) {
            try {
              await pc.addIceCandidate(candidate);
            } catch (error) {
              if (!ignoreOffer.current.get(from)) throw error;
            }
          }
        }
      } catch {
        // A broken exchange is repaired by the next offer.
      }
    },
    [closePeer, me, peerFor, send],
  );

  const syncPeople = React.useCallback(
    (people: CallPerson[]) => {
      setParticipants(people);
      const ids = new Set(people.map((person) => person.id));
      for (const person of people) if (person.id !== me) peerFor(person.id);
      for (const peerId of [...peers.current.keys()]) if (!ids.has(peerId)) closePeer(peerId);
    },
    [closePeer, me, peerFor],
  );

  const stopScreen = React.useCallback(() => {
    for (const [peerId, senders] of screenSenders.current) {
      const pc = peers.current.get(peerId);
      for (const sender of senders) {
        try {
          pc?.removeTrack(sender);
        } catch {
          // The connection is already closed.
        }
      }
    }
    screenSenders.current.clear();
    for (const track of screen.current?.getTracks() ?? []) track.stop();
    screen.current = null;
    setLocalScreen(null);
    setSharing(false);
    state.current = { ...state.current, sharing: false };
  }, []);

  const teardown = React.useCallback(() => {
    stream.current?.close();
    stream.current = null;
    for (const peerId of [...peers.current.keys()]) closePeer(peerId);
    for (const track of mic.current?.getTracks() ?? []) track.stop();
    mic.current = null;
    if (screen.current) stopScreen();
    current.current = null;
    state.current = { muted: false, deafened: false, sharing: false };
    setSpaceId(null);
    setSpaceName(null);
    setParticipants([]);
    setMuted(false);
    setDeafened(false);
    setSharing(false);
    setSpeaking(new Set());
  }, [closePeer, stopScreen]);

  const leave = React.useCallback(async () => {
    const id = current.current;
    teardown();
    if (id) {
      try {
        await api(`/team/voice/${id}/leave`, { method: "POST", keepalive: true });
      } catch {
        // The server drops a person whose stream has stopped.
      }
    }
  }, [teardown]);

  const join = React.useCallback(
    async (id: string, name: string) => {
      if (demoMode) {
        toast.message("Voice calls run on real accounts.");
        return;
      }
      if (current.current === id) return;
      if (current.current) await leave();
      setJoining(true);
      try {
        try {
          mic.current = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          });
          setMicBlocked(false);
        } catch {
          // Join to listen; the person can allow the mic and rejoin.
          mic.current = null;
          setMicBlocked(true);
          state.current = { ...state.current, muted: true };
          setMuted(true);
        }
        const out = await api<CallOut>(`/team/voice/${id}/join`, { method: "POST" });
        current.current = id;
        setSpaceId(id);
        setSpaceName(name);
        if (state.current.muted) void pushState();
        syncPeople(out.participants);
        const source = new EventSource(`/api/backend/team/voice/${id}/stream`);
        stream.current = source;
        source.addEventListener("presence", (event) => {
          syncPeople((JSON.parse((event as MessageEvent).data) as CallOut).participants);
        });
        source.addEventListener("signal", (event) => {
          void onSignal(JSON.parse((event as MessageEvent).data) as SignalOut);
        });
        source.addEventListener("closed", () => {
          teardown();
          toast.message("You left the call.");
        });
      } catch (error) {
        for (const track of mic.current?.getTracks() ?? []) track.stop();
        mic.current = null;
        toast.error(errorText(error));
      } finally {
        setJoining(false);
      }
    },
    [leave, onSignal, pushState, syncPeople, teardown],
  );

  const toggleMute = React.useCallback(() => {
    if (micBlocked) {
      toast.error("Allow the microphone in your browser, then join the call again.");
      return;
    }
    const next = !state.current.muted;
    for (const track of mic.current?.getAudioTracks() ?? []) track.enabled = !next;
    state.current = { ...state.current, muted: next, deafened: next ? state.current.deafened : false };
    setMuted(next);
    if (!next) setDeafened(false);
    void pushState();
  }, [micBlocked, pushState]);

  const toggleDeafen = React.useCallback(() => {
    const next = !state.current.deafened;
    // Deafening also mutes, as in Discord; undeafening gives the mic back.
    const mutedNow = next ? true : micBlocked;
    for (const track of mic.current?.getAudioTracks() ?? []) track.enabled = !mutedNow;
    state.current = { ...state.current, deafened: next, muted: mutedNow };
    setDeafened(next);
    setMuted(mutedNow);
    void pushState();
  }, [micBlocked, pushState]);

  const toggleShare = React.useCallback(async () => {
    if (!current.current) return;
    if (screen.current) {
      stopScreen();
      void pushState();
      return;
    }
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      screen.current = display;
      setLocalScreen(display);
      for (const [peerId, pc] of peers.current) {
        screenSenders.current.set(
          peerId,
          display.getTracks().map((track) => pc.addTrack(track, display)),
        );
      }
      for (const track of display.getVideoTracks()) {
        track.onended = () => {
          stopScreen();
          void pushState();
        };
      }
      state.current = { ...state.current, sharing: true };
      setSharing(true);
      void pushState();
    } catch {
      toast.error("Screen sharing was cancelled or blocked.");
    }
  }, [pushState, stopScreen]);

  // Who is speaking: a short read of each voice's loudness.
  React.useEffect(() => {
    if (!spaceId) return;
    const context = new AudioContext();
    void context.resume();
    const meters: Array<{ id: number; analyser: AnalyserNode; data: Uint8Array<ArrayBuffer> }> = [];
    const watch = (id: number, media: MediaStream | null) => {
      if (!media || media.getAudioTracks().length === 0) return;
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context.createMediaStreamSource(media).connect(analyser);
      meters.push({ id, analyser, data: new Uint8Array(new ArrayBuffer(analyser.fftSize)) });
    };
    watch(me, mic.current);
    for (const [id, media] of audio) watch(id, media);
    const timer = setInterval(() => {
      const loud = new Set<number>();
      for (const meter of meters) {
        if (meter.id === me && state.current.muted) continue;
        meter.analyser.getByteTimeDomainData(meter.data);
        let sum = 0;
        for (const value of meter.data) sum += ((value - 128) / 128) ** 2;
        if (Math.sqrt(sum / meter.data.length) > SPEAKING_LEVEL) loud.add(meter.id);
      }
      setSpeaking((before) =>
        before.size === loud.size && [...loud].every((id) => before.has(id)) ? before : loud,
      );
    }, 200);
    return () => {
      clearInterval(timer);
      void context.close();
    };
  }, [audio, me, spaceId]);

  // Leaving the page leaves the call.
  React.useEffect(() => {
    const onHide = () => {
      const id = current.current;
      if (id) void fetch(`/api/backend/team/voice/${id}/leave`, { method: "POST", keepalive: true, credentials: "same-origin" });
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, []);

  const value = React.useMemo<VoiceCall>(
    () => ({
      spaceId,
      spaceName,
      participants,
      me,
      muted,
      deafened,
      sharing,
      joining,
      micBlocked,
      speaking,
      screens,
      localScreen,
      join,
      leave,
      toggleMute,
      toggleDeafen,
      toggleShare,
    }),
    [spaceId, spaceName, participants, me, muted, deafened, sharing, joining, micBlocked, speaking, screens, localScreen, join, leave, toggleMute, toggleDeafen, toggleShare],
  );

  return (
    <VoiceContext.Provider value={value}>
      {children}
      {[...audio].map(([id, media]) => (
        <RemoteAudio key={id} stream={media} muted={deafened} />
      ))}
    </VoiceContext.Provider>
  );
}

function RemoteAudio({ stream, muted }: { stream: MediaStream; muted: boolean }) {
  const ref = React.useRef<HTMLAudioElement>(null);
  React.useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <audio ref={ref} autoPlay playsInline muted={muted} className="hidden" />;
}
