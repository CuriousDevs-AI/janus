"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useSession } from "@/components/auth/session-provider";
import { api, APIError, message } from "@/lib/api/client";
import { demoMode } from "@/lib/demo-mode";
import { hasPermission } from "@/lib/demo-persona";
import { useProjectsStore } from "@/lib/stores/projects-store";
import { syncProjectTimeline, describeUnmatched } from "@/lib/timeline-sync";
import { type DirectoryPerson, projectPeople } from "@/lib/timeline-team";

/**
 * A project's timeline: the shared conversation and the record of what happened, on the server.
 * Events come from the modules; messages and decisions come from people. It refreshes every few
 * seconds, which is simple and good enough until live updates are added.
 */

type Timeline = { project_key: string; name: string; archived: boolean; members: number; you_are_member: boolean };
type Entry = { id: string; kind: "event" | "message" | "decision"; author: string | null; body: string; payload: Record<string, unknown>; created_at: string };

const POLL_MS = 8000;
const kindLabel: Record<Entry["kind"], string> = { event: "Event", message: "Message", decision: "Decision" };

export function TimelineView() {
  const session = useSession();
  const me = session.user.name ?? session.user.email ?? "You";
  const canManage = hasPermission(session.permissions, "projects:manage");
  const projects = useProjectsStore((state) => state.projects);
  const tasks = useProjectsStore((state) => state.tasks);
  const closures = useProjectsStore((state) => state.closures);
  const allocations = useProjectsStore((state) => state.allocations);
  const [members, setMembers] = React.useState<{ user_id: string; name: string }[]>([]);
  const [directory, setDirectory] = React.useState<DirectoryPerson[]>([]);
  const [addId, setAddId] = React.useState("");
  const [projectId, setProjectId] = React.useState("");
  const selected = projects.find((p) => p.id === projectId) ?? projects[0];
  const key = selected?.id ?? "";

  const [timeline, setTimeline] = React.useState<Timeline | null | undefined>(undefined);
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const [draft, setDraft] = React.useState("");
  const [asDecision, setAsDecision] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [reload, setReload] = React.useState(0);
  const lastId = React.useRef(0);

  // Load the timeline for the chosen project. A 404 means the project has no timeline yet, or that this person is not on it.
  React.useEffect(() => {
    if (demoMode || !key) return;
    let cancelled = false;
    (async () => {
      try {
        const found = await api<Timeline>(`/project-timelines/${encodeURIComponent(key)}`);
        if (!cancelled) setTimeline(found);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof APIError && error.status === 404) setTimeline(null);
        else {
          toast.error(message(error));
          setTimeline(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, reload]);

  // Load entries, then keep polling for new ones after the last one seen.
  React.useEffect(() => {
    if (demoMode || !key || !timeline) return;
    let cancelled = false;
    const fetchNew = async () => {
      try {
        const fresh = await api<Entry[]>(`/project-timelines/${encodeURIComponent(key)}/entries?after=${lastId.current}&limit=200`);
        if (cancelled || fresh.length === 0) return;
        lastId.current = Number(fresh[fresh.length - 1].id);
        setEntries((current) => [...current, ...fresh]);
      } catch {
        /* a failed refresh keeps what is on screen; the next poll tries again */
      }
    };
    void fetchNew();
    const timer = window.setInterval(fetchNew, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [key, timeline]);

  // The team on this timeline, and (for managers) the company directory to add people from.
  React.useEffect(() => {
    if (demoMode || !key || !timeline) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await api<{ user_id: string; name: string }[]>(`/project-timelines/${encodeURIComponent(key)}/members`);
        if (!cancelled) setMembers(list);
        if (canManage) {
          const people = await api<DirectoryPerson[]>("/project-timelines/directory");
          if (!cancelled) setDirectory(people);
        }
      } catch {
        /* the team panel shows what it has; the next change reloads it */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, timeline, canManage, reload]);

  async function addPerson() {
    if (!addId || !key) return;
    try {
      await api(`/project-timelines/${encodeURIComponent(key)}/members`, { method: "POST", body: JSON.stringify({ user_id: addId }) });
      toast.success("Added to the project timeline");
      setAddId("");
      setReload((n) => n + 1);
    } catch (error) {
      toast.error(message(error));
    }
  }

  async function removePerson(userId: string) {
    try {
      await api(`/project-timelines/${encodeURIComponent(key)}/members/${userId}`, { method: "DELETE" });
      setReload((n) => n + 1);
    } catch (error) {
      toast.error(message(error));
    }
  }

  async function syncTeam() {
    if (!selected) return;
    try {
      const result = await syncProjectTimeline(selected, projectPeople(selected, tasks, allocations, selected.id));
      if (result) {
        toast.success(result.added > 0 ? `Added ${result.added} from the project team` : "The team is already up to date");
        if (result.unmatched.length > 0) toast.warning(`Could not match: ${describeUnmatched(result.unmatched)}`);
      }
      setReload((n) => n + 1);
    } catch (error) {
      toast.error(message(error));
    }
  }

  async function start() {
    if (!selected) return;
    try {
      await api("/project-timelines", { method: "POST", body: JSON.stringify({ project_key: selected.id, name: selected.name }) });
      toast.success("Timeline started for this project");
      setReload((n) => n + 1);
    } catch (error) {
      toast.error(message(error));
    }
  }

  async function send() {
    const body = draft.trim();
    if (!body || !key) return;
    setSending(true);
    try {
      const entry = await api<Entry>(`/project-timelines/${encodeURIComponent(key)}/entries`, {
        method: "POST",
        body: JSON.stringify({ body, decision: asDecision }),
      });
      lastId.current = Number(entry.id);
      setEntries((current) => [...current, { ...entry, author: me }]);
      setDraft("");
      setAsDecision(false);
    } catch (error) {
      toast.error(message(error));
    } finally {
      setSending(false);
    }
  }

  if (demoMode) {
    return <Card><CardContent className="p-6 text-sm text-muted-foreground">Timelines are shared on the server. The preview runs without a server, so there is no timeline to show here.</CardContent></Card>;
  }
  if (projects.length === 0) {
    return <Card><CardContent className="p-6 text-sm text-muted-foreground">Create a project first. Its timeline starts from there.</CardContent></Card>;
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="timeline-project" className="text-muted-foreground">Project</label>
        <select id="timeline-project" className="h-9 rounded-md border border-input bg-surface px-3 text-sm" value={key} onChange={(e) => { setProjectId(e.target.value); setTimeline(undefined); setEntries([]); lastId.current = 0; }}>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {timeline === undefined ? <p className="text-sm text-muted-foreground">Loading the timeline…</p> : null}

      {timeline === null ? (
        <Card>
          <CardContent className="grid gap-3 p-6 text-sm">
            <p className="text-muted-foreground">
              {canManage
                ? "This project has no timeline yet. Starting one makes you its first member; you can add the rest of the team."
                : "This project has no timeline you are part of. Ask a project manager to add you."}
            </p>
            {canManage ? <Button className="w-fit" onClick={start}>Start the timeline</Button> : null}
          </CardContent>
        </Card>
      ) : null}

      {timeline ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              {timeline.name}
              <Badge variant="neutral">{timeline.members} on this project</Badge>
              {timeline.archived ? <Badge variant="warning">closed, read only</Badge> : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <ol className="grid max-h-[480px] gap-3 overflow-y-auto pr-1">
              {entries.length === 0 ? <li className="text-sm text-muted-foreground">Nothing here yet. Post the first update, or record a decision.</li> : null}
              {entries.map((entry) => (
                <li key={entry.id} className={`rounded-md border p-3 text-sm ${entry.kind === "decision" ? "border-accent" : "border-border"} ${entry.kind === "event" ? "bg-surface-2" : ""}`}>
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant={entry.kind === "decision" ? "info" : entry.kind === "event" ? "neutral" : "neutral"}>{kindLabel[entry.kind]}</Badge>
                    <span>{entry.author ?? "Janus"}</span>
                    <span>·</span>
                    <time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString("en-IN")}</time>
                  </div>
                  <p className="whitespace-pre-wrap">{entry.body}</p>
                </li>
              ))}
            </ol>
            {timeline.archived || !timeline.you_are_member ? null : (
              <div className="grid gap-2 border-t border-border pt-3">
                <textarea
                  aria-label="Write an update"
                  className="min-h-20 rounded-md border border-input bg-surface p-2 text-sm"
                  placeholder="Write an update for the project team"
                  value={draft}
                  maxLength={4000}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={asDecision} onChange={(e) => setAsDecision(e.target.checked)} />
                    Record as a decision
                  </label>
                  <Button disabled={sending || draft.trim().length === 0} onClick={send}>Post</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
      {timeline ? (
        <Card>
          <CardHeader><CardTitle className="text-base">Team on this timeline</CardTitle></CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <ul className="grid gap-1">
              {members.map((m) => (
                <li key={m.user_id} className="flex items-center justify-between gap-2">
                  <span>{m.name}</span>
                  {canManage ? <Button size="sm" variant="ghost" onClick={() => removePerson(m.user_id)}>Remove</Button> : null}
                </li>
              ))}
            </ul>
            {canManage ? (
              <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
                <select aria-label="Person to add" className="h-9 rounded-md border border-input bg-surface px-3 text-sm" value={addId} onChange={(e) => setAddId(e.target.value)}>
                  <option value="">Add a person…</option>
                  {directory.filter((p) => !members.some((m) => m.user_id === p.user_id)).map((p) => <option key={p.user_id} value={p.user_id}>{p.name}</option>)}
                </select>
                <Button size="sm" disabled={!addId} onClick={addPerson}>Add</Button>
                <Button size="sm" variant="secondary" onClick={syncTeam}>Sync team from project</Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
      {selected && closures.find((c) => c.projectId === selected.id) ? (
        <Card>
          <CardHeader><CardTitle className="text-base">Closure summary</CardTitle></CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {(() => {
              const closure = closures.find((c) => c.projectId === selected.id);
              if (!closure) return null;
              return (
                <>
                  <p className="text-xs text-muted-foreground">Closed on {closure.closedOn} by {closure.closedBy}. This is a snapshot taken at closing.</p>
                  <dl className="grid gap-2">
                    {closure.lines.map((line) => (
                      <div key={line.label} className="grid gap-0.5 sm:grid-cols-[180px_1fr]">
                        <dt className="text-muted-foreground">{line.label}</dt>
                        <dd>{line.value}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              );
            })()}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
