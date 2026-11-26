"use client";
import { Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const SingleTick = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 16 16" fill="none" className={cn("size-3.5", className)}>
    <path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const DoubleTick = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 20 16" fill="none" className={cn("size-4", className)}>
    <path d="M1 8.5L4.5 12L11 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M6 8.5L9.5 12L16 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function MessageStatus({ status }: { status: string }) {
  switch (status) {
    case "queued":
    case "sending":
      return <Clock className="size-3 text-muted-foreground" />;
    case "accepted":
    case "sent":
      return <SingleTick className="text-muted-foreground" />;
    case "delivered":
      return <DoubleTick className="text-muted-foreground" />;
    case "read":
      return <DoubleTick className="text-accent" />;
    case "failed":
    case "unknown":
      return <AlertCircle className="size-3 text-danger" />;
    case "received":
      return null;
    default:
      return null;
  }
}
