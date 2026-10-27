# Project timeline and project channels: verified plan

Status: plan for review. No code is changed by this document.
This plan replaces the earlier brainstorm where the two differ. Each claim was checked against the repository on the date below.

## 0. What the code actually has (checked)

| Idea | Status in the repo | Consequence |
|---|---|---|
| Projects, milestones, tasks, timesheets, allocations, change requests, closing | Built, but in the browser only (`lib/stores/projects-store.ts`) | Nothing is on the server. |
| Project people | Stored as names (`owner`, `assignee`, `person`, `requestedBy` are strings) | No reliable join to HR or to login accounts. Names can repeat or change. |
| Leave | HR leave is keyed by `employeeId` (`HrLeaveRequest` in `lib/types/index.ts`) | Leave-conflict alerts need a person ID first. |
| Approvals queue | Built (`components/approvals/money-approvals-queue.tsx`) | Reusable for approvals inside a thread. Requester is stored as a name. |
| Work inbox and activity feed | Built (`app/(app)/work`, `app/(app)/activity`) | Reusable as the place where timeline items surface. |
| Audit trail | Built per module (`lib/stores/audit-trail.ts`), in the browser | Good as a model, but not a shared server log. |
| Closure | `closeProject` releases unused budget | **No closure summary exists.** It is new work. |
| Client guest access | **Does not exist.** Backend roles are owner, admin, manager, agent (`backend/janus_api/org/service.py`) | A guest role needs backend authorisation work and a legal review. |
| Conversations and messages | Exist for the customer inbox and WhatsApp (`Conversation`, `Message` in `lib/types`, backend `whatsapp`) | Not an internal chat. A new model is needed. |
| Backend APIs | Only auth, org, CRM, business, AI, sources, WhatsApp, vault, and the workspace document store | **No backend for projects, finance, operations, IT, or HR.** |

Corrections to the earlier brainstorm:
1. The closure summary is not built. It is planned work.
2. The client guest role is not built, and needs a backend role.
3. The leave-conflict alert cannot join project people to leave records yet, because project people are names.
4. "Blocked for how long" needs timestamps. Approval records store a date only, so durations would be approximate.
5. Most operational data lives only in the browser. A timeline that is shared across people needs the data on the server first.

## 1. Prerequisites (must come first)

**P1. Stable identity for people.** Every project person, task assignee, allocation, timesheet, change request, and approval requester refers to a user or employee ID, not a name. Existing names are migrated by matching against the directory, with unmatched names kept as flagged records for a person to fix.

**P2. Server persistence for the project domain.** Projects, milestones, tasks, timesheets, allocations, change requests, and their versions move to typed tables with row-level security, following the pattern in `backend/migrations/versions/0010_business_management.py`. The document store (`workspace_state`) is a stopgap: it cannot be queried or joined, so a timeline cannot be built on it.

**P3. One event log.** An append-only `events` table records every module action that matters: milestone completed or accepted, change requested or decided, budget crossed a threshold, money raised, closure. Each event has a subject, an actor (user ID), a timestamp, a kind, and a small payload. The audit log stays as the compliance record. The event log feeds the timeline.

Decision needed: making the backend the system of record for these modules is a large change. It is the only way the timeline, the approvals, and the people links can be shared and trusted. Without it, the feature stays a single-browser demo.

## 2. Data model (sketch)

- `project_members(project_id, user_id, role, source, added_at, removed_at)`. `source` is `owner`, `task`, `allocation`, or `manual`.
- `events(id, tenant_id, project_id, subject_type, subject_id, kind, actor_user_id, payload jsonb, created_at)`. Append-only, partitioned by month.
- `channels(id, tenant_id, project_id, archived_at)`. One per project, plus incident rooms and HR channels.
- `messages(id, channel_id, thread_root_id, author_user_id, body, created_at, edited_at, deleted_at)`.
- `decisions(message_id, decided_by, decided_at)` and `risks(message_id, owner_user_id, status)`. These are marks on messages, not separate free text.
- `closure_summaries(project_id, generated_at, content jsonb)`.

Every table has `tenant_id` and row-level security, as in the existing migrations.

## 3. MVP scope with acceptance criteria

**M1. Project timeline.** The timeline shows events and messages in time order. Each event shows the value as it was when it happened, not the current value.
- Accept: a milestone accepted in one session appears on the timeline of a second session within 5 seconds, for every member of the project.

**M2. Membership sync.** Owner, task assignees, and allocated people join the project channel. Removal happens when they leave the project, and a daily reconciliation fixes drift.
- Accept: reassigning a task adds the new assignee and removes the previous one only if they have no other task on the project. The reconciliation job logs every change.

**M3. Approvals in the thread.** A change request or fund request can be approved from the thread. It uses the same approval endpoints as the Approvals queue.
- Accept: the requester gets a 403 when approving their own request. The decision appears on the timeline and in the audit log.

**M4. Budget and milestone events.** Crossing 80% and 100% of the project's fund draw, and milestone completion and acceptance, post to the timeline once.
- Accept: a repeated trigger does not post a duplicate.

**M5. Closure summary.** Closing a project archives its channel and generates a summary from the events: milestones, plan versions, money totals, decisions, and open risks. It is new work.
- Accept: the summary is generated once, stored, and readable after the channel is archived.

**Deferred** (not in MVP): client guest access, leave-conflict alerts, burn forecast, commitment tracking, AI summaries, "My day" across projects.

## 4. Build order and rough size

| Phase | Work | Depends on | Size (sessions) |
|---|---|---|---|
| 0 | Decisions above, identity migration design, event schema | none | 1 |
| 1 | P1 identity: people IDs, migration of names with flags | 0 | 2 |
| 2 | P2 persistence for projects, milestones, tasks, timesheets, change requests | 1 | 3 |
| 3 | P3 events table and write paths from the modules | 2 | 2 |
| 4 | Channels, messages, threads, read timeline | 3 | 2 |
| 5 | M2 membership sync and the daily reconciliation | 2, 4 | 1 |
| 6 | M3 approvals in the thread, M4 budget and milestone events | 3, 4 | 2 |
| 7 | M5 closure summary and archive | 3, 4 | 1 |

About 14 sessions. These are estimates, and they assume the backend work is done in the existing FastAPI service.

Before phase 1, run a cheap test: a clickable prototype of the timeline on the current browser data, shown to three to five real users. If they don't use the timeline to answer their own questions, stop before building the backend.

## 5. Risks

- **Migration from names to IDs** can mislabel people. Mitigation: flag unmatched names, and never guess.
- **Backend scope grows.** Moving projects alone is a large change. Mitigation: phase 2 covers only the project domain, and finance and operations stay in the browser until a later plan.
- **Noise.** Every event posting to the timeline buries the important ones. Mitigation: each event kind has an importance level, and only decisions, approvals, and budget thresholds notify by default.
- **Privacy.** Activity counts per person must stay out of manager views. Commitments are tracked as commitments, not as message volume.
- **Stale numbers in messages.** Mitigation: the snapshot rule in section 0 of the brainstorm, applied to every value an event carries.

## 6. Decisions needed from you

1. Approve making the backend the system of record for projects (phase 2), or keep the timeline as a browser-only prototype.
2. Approve the name-to-ID migration, including the review step for unmatched names.
3. Confirm the MVP list (M1 to M5), with guest access and leave alerts deferred.
4. Run the prototype test with real users before the backend build?

## 7. Verification of this plan

Checked in the repository on 2026-10-27: the projects store, the HR leave type, the approvals and work pages, the backend router list, the backend role list, and the absence of a closure summary and guest role. Nothing in this plan was verified in production or with users.

## 8. Implementation status (first slice)

Built in this pass, with tests and a browser check in real mode:
- **Server timeline:** one shared timeline per project, with members, messages, decisions, and system entries. Migration `0016_project_timelines` adds three tables, each under row-level security.
- **Membership rules:** only members read or post. Non-members get the same 404 as a missing timeline. Adding or removing people needs `projects:manage`, and the person added must be an active member of the company.
- **Decisions** are audited (`project_timeline.decision`). Creating a timeline, and adding or removing a member, are audited too.
- **System entries** are written by `record_event` in `janus_api/timeline/service.py`. People cannot create them through the API. No module calls it yet.
- **Screen:** Projects > Project Timeline. Start a timeline, post updates, mark decisions. It refreshes every 8 seconds.
- **Tests:** five timeline tests (membership, permissions, company isolation, audit and system entries, blank messages). The full backend suite passes.

Added in the second pass:
- **Directory for managers:** `GET /v1/project-timelines/directory` lists active company people (names and IDs only) for users with `projects:manage`.
- **Team matching (P1, partial):** project people (owner, task assignees, allocations) are matched to company accounts by name, ignoring case and extra spaces. A name with no account, or more than one, is flagged, never guessed.
- **Auto-create (M2, partial):** creating a project creates its timeline and adds the matched owner. Unmatched names are reported.
- **Sync and manual team control:** "Sync team from project" adds matched people. Add and remove are manual. Sync never removes anyone, so a renamed person cannot be taken off a project silently.
- **Verified:** a browser run on a company with no matching accounts flagged both names and kept the owner. Six timeline tests pass.

Not built yet, in plan order:
- **P1 identity:** project people are still names in the Projects screens. Matching by name is a stopgap; the stable fix is storing the user ID on each project person.
- **P2 full persistence:** projects, milestones, tasks and change requests are still browser-only.
- **M2 membership sync:** nothing adds the owner or assignees automatically, and the screen has no add-member control yet.
- **M3 approvals in the thread** and **M4 budget and milestone events:** `record_event` exists, but no module calls it yet.
- **M5 closure summary:** not built.
- **Live updates:** the screen polls every 8 seconds, not WebSocket.
- **Deferred:** client guest access, leave alerts, burn forecast, AI summaries.

**Third pass: closing (M5, partial):**
- Closing a project captures a **closure summary** from the records: milestones accepted and billed, budget, cost of logged hours, unused budget released, hours, plan versions and approved changes, and margin. The summary is a snapshot taken when the project closes, so it does not change afterwards.
- Closing also **archives the project's timeline** on the server. Nobody can post on it afterwards. The closing is written as a system entry (kind `closed`) with the member and entry counts, and it is audited.
- Verified: backend tests cover archive, the closing entry, refused posts after archive, and the audit entry (113 backend tests pass). In the browser, closing a project showed "closed, read only" on its timeline, the closing entry, and the summary.
- Limitation: the summary lives in the browser store, not on the server, until projects move to the server (P2). Only the timeline archive is server-side.

**Fourth pass: identity (P1, partial):**
- Project owners, task assignees and allocated people now record the company account ID when it is known (`ownerUserId`, `assigneeUserId`, `userId`).
- Sync uses a recorded account first, and matches by name only for people without one. Matched names are written back to the records.
- Verified in the browser: an invited company member (Neha Verma) was matched, linked on the owner and task records, and added to the timeline. An unmatched name (Arjun Mehta, no account) was flagged.
- Still open: names remain the display value. New people chosen from the directory should store the ID from the start.

**Fifth pass: project records on the server (P2, first part):**
- A **correction to the earlier status:** in real mode, the projects store already syncs to the server as a versioned document (the workspace store added earlier). What was missing was a typed, queryable project record.
- Migration `0017_projects` and `/v1/project-records` add a typed projects table under row-level security. Create, list and change status need `projects:manage`. Duplicate keys, reversed dates, an owner outside the company, and reopening a done project are refused.
- Verified: three tests cover these rules, company isolation and the permission check. The full backend suite passes (116 tests).
- Still open: milestones, tasks, timesheets, allocations and change requests are not yet typed on the server. The screens do not yet read from `/v1/project-records`.

**Sixth pass: milestones and tasks on the server (P2, second part):**
- Migration `0018_milestones_and_tasks`: typed milestones and tasks, linked to the project record, under row-level security.
- Milestones move planned, then done, then accepted. The person who completes a milestone cannot accept it, and accepted is final. Accepting before completion is refused.
- Tasks link to a milestone and to an active company member. Status changes are audited.
- Verified with four tests, and the full backend suite passes (120 tests).
- Still open: timesheets, allocations and change requests are not yet typed on the server. The Projects screens do not read these endpoints yet.

**Seventh pass: hours, allocations and change requests on the server (P2, third part):**
- Migration `0019_timesheets_allocations_changes`: typed hours, allocations and change requests linked to the project record, under row-level security.
- Hours are capped at 12 a day per person across all projects. Allocations are 0 to 100 percent and update in place. A change is decided by someone other than the requester, once.
- Verified with four tests. The full backend suite passes (124 tests).
- Still open: the Projects screens do not read these endpoints yet, so the typed records are not used by the UI. Recording people by account ID from the start, module events on the timeline, the closure summary on the server, the other workspaces, and live updates remain.

**Eighth pass: events and the closing summary, written by the server (points 3 and 4):**
- Milestone completion and acceptance, change decisions, and project status changes each write an entry to the project's timeline, from the server, in the same request. People cannot write these entries themselves.
- Closing a timeline computes a summary from the typed records (budget, milestones accepted and total, billed amount, hours, approved changes) and stores it with the closing entry. A project that exists only on the screens gets no server summary, and this is recorded as such.
- Verified: two tests cover the event sequence and the summary, and the full backend suite passes (126 tests).
- Not yet done: the Projects screens do not read the typed endpoints (point 1), people are still recorded by name (point 2), finance, operations, IT, HR and support do not write timeline events (point 5), and the timeline still polls (point 6). The closing summary is stored on the server, but no screen displays it yet.

**Ninth pass: the Projects screen mirrors to the server (point 1, partial):**
- In real mode, creating a project also creates its typed project record on the server, and closing it marks the record done. The record is created with the project key, name, client, status, budget and dates.
- Verified in the browser: a project created on the screen appeared on the server with status planned and budget 20000.00; closing it changed the server record to done.
- Not done: the screen still saves locally and draws its budget from the finance store in the browser. Reading the projects list from the server, and moving the budget draw to the server, need finance on the server first (point 5). A failed mirror shows a warning; it does not undo the local change.

**Tenth pass: owner recorded by account (point 2, partial):**
- A new project's owner is matched to a single company account by name. The account ID is stored on the server record and on the screen data, the same way the timeline sync stores it.
- A name with no single account, or with two, is left unlinked and is not guessed.
- Verified in the browser: a project created for the signed-in owner was stored with that account's ID.
- Not done: the owner field is still typed as free text. Choosing the owner from the company directory, and recording task assignees and allocations by ID at the time they are set, remain open.

**Eleventh pass: owner chosen by account (point 2, mostly done):**
- The new-project form offers the company directory as the owner list in real mode, so the owner is chosen by account, not typed. The chosen account ID is stored on the server record and on the screen data.
- Verified in the browser: a project created with "Picked Person" as owner was stored with that person's account ID.
- Not done: task assignees and allocations still take names when they are set, and the typed fallback remains for demo mode.

**Twelfth pass: the Projects screen reads core fields from the server (point 1, done for core fields):**
- On opening the Projects screen in real mode, each project that exists on the server has its name, client, status, budget and dates updated from the server.
- Verified in the browser: a project was marked done on the server, outside the screen; after a reload, the screen showed it as done and closed.
- Limits: projects that exist only on the screens still come from the browser copy, and milestones, tasks and the budget line still live in the browser until they move to the server.

**Thirteenth pass: milestones mirrored to the server (point 1, milestones):**
- Adding a milestone, marking it complete and accepting it are mirrored to the server, and the Milestones screen refreshes each milestone's status from the server when it opens.
- Verified in the browser: a milestone added on the screen was stored on the server as planned; marking it complete changed the server status to done.
- Found and fixed: the bridge did not allow the milestone paths, so the mirror was silently skipped on 404. The bridge now allows them. The milestone list also now returns who completed and accepted each milestone.
- Not verified in the browser: acceptance by a second person (covered by the backend tests) and the refresh-on-open merge.
