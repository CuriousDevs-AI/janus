# Janus — by CuriousDevs

An AI-native customer operations platform that connects lead capture, CRM,
communication, support, automation, knowledge and analytics into one
connected customer lifecycle.

This is a **frontend prototype** — a fully interactive, client-rendered
Next.js application running on realistic mock data and local state. There is
no backend; every action (approving a discount, sending a message, moving a
deal, resolving a ticket) mutates a shared client-side store so the whole app
stays consistent as you navigate it.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You'll land on `/login`
— any email/password combination signs you in (this is a demo).

## What to try

- **Dashboard** (`/dashboard`) — attention center, pipeline, AI ops, live activity feed.
- **Inbox** (`/inbox`) — the unified communication hub. Open Rahul Sharma's WhatsApp thread, send a message, and watch AI draft + reply.
- **Customer profile** (`/customers/cus-1`) — the most important screen: identity, timeline, memory, embedded AI assistant, all in one place.
- **Approvals** (`/approvals`) — approve or reject the pending 20% discount request and watch the deal, activity timeline and audit log update live.
- **Tickets** (`/tickets/tck-1023`) — AI support handling → human handoff → take over conversation.
- **Deals** (`/deals`) — drag a card between pipeline stages.
- **Automations** (`/automations`) — visual workflow builder (React Flow) for each automation.
- **Ask Your Business** (`/ai`) — natural-language questions answered from real (mock) data, never fabricated.

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS v4 · shadcn-style components on Radix UI · Zustand · React Hook Form + Zod · Recharts · @xyflow/react · Lucide icons.

## Structure

```
app/(auth)/        login, signup, forgot-password, invite
app/onboarding/     multi-step onboarding
app/(app)/          the authenticated product — one route per module
components/ui/      themed primitives (button, dialog, table, ...)
components/shared/   cross-module building blocks (status badges, avatars, timeline, ...)
components/*/        feature-specific components
lib/types/           the shared data model
lib/mock-data/       seeded, cross-referenced demo dataset
lib/stores/          the Zustand store all interactions mutate
lib/services/        deterministic "AI" response logic (canned, not a real LLM call)
```

Mock data is intentionally cross-referenced — the same customer identity
(e.g. Rahul Sharma / ABC Technologies) appears consistently across leads,
deals, conversations, tickets, timeline and analytics, per the product's
core principle: one connected customer story, not disconnected screens.
