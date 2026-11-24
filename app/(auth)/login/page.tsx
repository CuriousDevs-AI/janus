"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { CuriousdevsLogo } from "@/components/shared/curiousdevs-logo";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { api, message } from "@/lib/api/client";
import { useSessionStore } from "@/lib/stores/session-store";
import { useAuditLog } from "@/lib/stores/audit-log-store";
import type { Me } from "@/lib/api/types";
import { PORTFOLIO_ROLES, homeForPermissions, managesBusiness } from "@/lib/access";

const schema = z.object({
  // An email, or the username chosen at signup. The preview's accounts sign in by email only.
  email: z.string().trim().min(3, "Enter your email or name"),
  password: z.string().min(1, "Password is required"),
});
type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const ensureSession = useSessionStore((s) => s.ensureSession);
  const appendLog = useAuditLog((s) => s.append);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: FormValues) {
    try {
      await api("/auth/login", {
        method: "POST",
        body: JSON.stringify(values),
      });
      const me = await api<Me>("/me");
      if (!me.user.email_verified_at) {
        router.replace(`/verify-email?email=${encodeURIComponent(me.user.email)}`);
        return;
      }
      // Someone who owns or oversees two or more companies starts on the Portfolio, across them;
      // a single new company still starts on its own setup.
      const overseen = me.tenants.filter((item) => item.status === "active" && PORTFOLIO_ROLES.includes(item.role));
      if (overseen.length >= 2) {
        router.replace("/portfolio?view=overview");
        return;
      }
      if (!managesBusiness(me.permissions)) {
        router.replace(homeForPermissions(me.permissions));
        return;
      }
      try {
        const setup = await api<{ setupCompleted: boolean; completedSteps?: string[] }>("/business/setup");
        const allStepIds = ["business_details", "workspaces", "members", "team_chat", "data_connections"];
        const done = setup.setupCompleted || allStepIds.every((s) => (setup.completedSteps ?? []).includes(s));
        router.replace(done ? "/settings?tab=workspace&view=overview&workspace=business" : "/portfolio?view=companies");
      } catch {
        router.replace("/leads");
      }
    } catch (error) {
      toast.error(message(error));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <CuriousdevsLogo className="size-14 text-accent" loading />
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-foreground">
          Your customer operations,
          <br />
          with intelligence built in.
        </h1>
        <p className="text-[13px] text-muted-foreground">
          Sign in to your Janus workspace.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email or username</Label>
          <Input
            id="email"
            autoComplete="username"
            placeholder="you@company.com or your username"
            {...register("email")}
          />
          {errors.email && (
            <p className="text-[11px] text-danger">{errors.email.message}</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              href="/forgot-password"
              className="text-[11px] text-accent hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            placeholder="••••••••"
            {...register("password")}
          />
          {errors.password && (
            <p className="text-[11px] text-danger">{errors.password.message}</p>
          )}
        </div>

        <Button type="submit" className="mt-1 w-full" disabled={isSubmitting}>
          {isSubmitting ? "Signing in…" : "Sign in"}
          {!isSubmitting && <ArrowRight className="size-3.5" />}
        </Button>
      </form>

      <p className="text-center text-[12px] text-muted-foreground">
        Don&apos;t have a workspace?{" "}
        <Link href="/signup" className="text-accent hover:underline">
          Create account
        </Link>
      </p>
    </div>
  );
}
