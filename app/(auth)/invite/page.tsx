"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomerAvatar } from "@/components/shared/customer-avatar";
import { currentUser, tenant } from "@/lib/mock-data";

export default function InvitePage() {
  const router = useRouter();
  const [name, setName] = useState("");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <CustomerAvatar name={currentUser.name} color={currentUser.avatarColor} size="lg" />
        <div className="flex flex-col gap-1">
          <h1 className="text-[20px] font-semibold tracking-tight text-foreground">You&apos;ve been invited</h1>
          <p className="text-[13px] text-muted-foreground">
            <span className="text-foreground">{currentUser.name}</span> invited you to join{" "}
            <span className="text-foreground">{tenant.name}</span> on Janus as a Support Agent.
          </p>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          router.push("/dashboard");
        }}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Your name</Label>
          <Input id="name" required placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Set a password</Label>
          <Input id="password" type="password" required placeholder="At least 8 characters" />
        </div>
        <Button type="submit" className="w-full">
          Accept invite & join
          <ArrowRight className="size-3.5" />
        </Button>
      </form>

      <div className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-[11px] text-muted-foreground">
        <ShieldCheck className="size-3.5 shrink-0 text-accent" />
        Your access is scoped by role and tenant. An admin can change your permissions at any time.
      </div>
    </div>
  );
}
