"use client";

import * as React from "react";
import { toast } from "sonner";
import { useSession } from "@/components/auth/session-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { usePeriodLockStore } from "@/lib/stores/period-lock-store";

/** Close the books up to a date. Entries on or before it are refused until the owner reopens them. */
export function PeriodLockView() {
  const session = useSession();
  const isOwner = session.permissions.includes("*");
  const lockedThrough = usePeriodLockStore((state) => state.lockedThrough);
  const setLockedThrough = usePeriodLockStore((state) => state.setLockedThrough);
  const [date, setDate] = React.useState(lockedThrough ?? "");

  function apply(next: string | null) {
    const problem = setLockedThrough(next, isOwner);
    if (problem) return toast.error(problem);
    toast.success(next ? `Period locked through ${next}` : "Period reopened");
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Period lock</CardTitle></CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <p className="text-xs text-muted-foreground">
          Once a period is closed, invoices, payments, credit notes, budget spend and stock entries dated on or before the locked date are refused. Only the owner can change the lock.
        </p>
        <p>{lockedThrough ? `Locked through ${lockedThrough}.` : "No period is locked."}</p>
        {isOwner ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input aria-label="Lock through date" type="date" className="w-44" value={date} onChange={(e) => setDate(e.target.value)} />
            <Button size="sm" disabled={!date} onClick={() => apply(date)}>Lock through this date</Button>
            <Button size="sm" variant="outline" disabled={!lockedThrough} onClick={() => apply(null)}>Reopen all periods</Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Ask the owner to change the period lock.</p>
        )}
      </CardContent>
    </Card>
  );
}
