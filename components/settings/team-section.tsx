"use client";

import * as React from "react";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { users } from "@/lib/mock-data";
import { SectionCard } from "@/components/settings/section-ui";
import { roleMeta, roleOrder } from "@/components/settings/role-meta";
import { CustomerAvatar } from "@/components/shared/customer-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { Role } from "@/lib/types";

interface PendingInvite {
  id: string;
  email: string;
  role: Role;
}

export function TeamSection() {
  const [invites, setInvites] = React.useState<PendingInvite[]>([]);
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<Role>("sales_agent");

  function handleInvite() {
    if (!email.trim()) {
      toast.error("Enter an email address");
      return;
    }
    setInvites((prev) => [...prev, { id: `invite-${prev.length}-${Date.now()}`, email: email.trim(), role }]);
    toast.success("Invite sent", { description: `${email.trim()} was invited as ${roleMeta[role].label}.` });
    setEmail("");
    setRole("sales_agent");
    setOpen(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionCard
        title="Team members"
        description={`${users.length + invites.length} member${users.length + invites.length === 1 ? "" : "s"} in this workspace.`}
      >
        <div className="mb-3 flex justify-end">
          <Button size="sm" onClick={() => setOpen(true)}>
            <UserPlus className="size-3.5" />
            Invite member
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <CustomerAvatar name={u.name} color={u.avatarColor} size="sm" />
                    <span className="font-medium text-foreground">{u.name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{u.email}</TableCell>
                <TableCell>
                  <Badge variant={roleMeta[u.role].tone}>{roleMeta[u.role].label}</Badge>
                </TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
                    <span className={`size-1.5 rounded-full ${u.online ? "bg-success" : "bg-muted-foreground"}`} />
                    {u.online ? "Online" : "Offline"}
                  </span>
                </TableCell>
              </TableRow>
            ))}
            {invites.map((i) => (
              <TableRow key={i.id}>
                <TableCell>
                  <span className="text-muted-foreground">—</span>
                </TableCell>
                <TableCell className="text-muted-foreground">{i.email}</TableCell>
                <TableCell>
                  <Badge variant={roleMeta[i.role].tone}>{roleMeta[i.role].label}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="warning">Pending invite</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite member</DialogTitle>
            <DialogDescription>Send a workspace invite by email.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roleOrder.map((r) => (
                    <SelectItem key={r} value={r}>
                      {roleMeta[r].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleInvite}>Send invite</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
