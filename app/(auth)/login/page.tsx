"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, message } from "@/lib/api/client";
import { demoMode } from "@/lib/demo-mode";
import { demoAccounts, checkLogin } from "@/lib/demo-accounts";
import { homeFor, signIn } from "@/lib/demo-persona";
import type { Me } from "@/lib/api/types";

const schema = z.object({
  email: z.string().email("Enter a valid work email"),
  password: z.string().min(1, "Password is required"),
});
type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const {
    register,
    setValue,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: FormValues) {
    if (demoMode) {
      const account = checkLogin(values.email, values.password);
      if (!account) { toast.error("That email and password don't match. Pick one of the accounts below."); return; }
      signIn(account.id);
      router.replace(homeFor(account));
      return;
    }
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
      try {
        const setup = await api<{ setupCompleted: boolean }>("/business/setup");
        router.replace(setup.setupCompleted ? "/settings?tab=workspace&view=overview&workspace=business" : "/setup");
      } catch {
        // Older deployments without the business migration continue to CRM.
        router.replace("/leads");
      }
    } catch (error) {
      toast.error(message(error));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
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
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@company.com"
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
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            {...register("password")}
          />
          {errors.password && (
            <p className="text-[11px] text-danger">{errors.password.message}</p>
          )}
        </div>

        <Button type="submit" className="mt-1 w-full" disabled={isSubmitting}>
          Sign in
          <ArrowRight className="size-3.5" />
        </Button>
      </form>

      <p className="text-center text-[12px] text-muted-foreground">
        Don&apos;t have a workspace?{" "}
        <Link href="/signup" className="text-accent hover:underline">
          Create account
        </Link>
      </p>
      {demoMode && (
        <section aria-label="Test accounts" className="flex flex-col gap-2 border-t border-border pt-5">
          <h2 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Test accounts</h2>
          <p className="text-[12px] text-muted-foreground">Each role sees a different slice of the same company. Pick one to fill the form.</p>
          <ul className="flex flex-col divide-y divide-border border border-border">
            {demoAccounts.map((account) => (
              <li key={account.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium">{account.name} <span className="font-normal text-muted-foreground">· {account.title}</span></p>
                  <p className="truncate text-[11px] text-muted-foreground">{account.email} · {account.password}</p>
                  <p className="text-[11px] text-muted-foreground">{account.blurb}</p>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={() => { setValue("email", account.email, { shouldValidate: true }); setValue("password", account.password, { shouldValidate: true }); }}>Use</Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
