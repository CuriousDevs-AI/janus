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
import { Checkbox } from "@/components/ui/checkbox";

const schema = z.object({
  email: z.string().email("Enter a valid work email"),
  password: z.string().min(1, "Password is required"),
  remember: z.boolean().optional(),
});
type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "pankaj200321@gmail.com", password: "" },
  });

  function onSubmit() {
    toast.success("Welcome back, Pankaj.");
    router.push("/dashboard");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-foreground">
          Your customer operations,
          <br />
          with intelligence built in.
        </h1>
        <p className="text-[13px] text-muted-foreground">Sign in to your Janus workspace.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" placeholder="you@company.com" {...register("email")} />
          {errors.email && <p className="text-[11px] text-danger">{errors.email.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="/forgot-password" className="text-[11px] text-accent hover:underline">
              Forgot password?
            </Link>
          </div>
          <Input id="password" type="password" placeholder="••••••••" {...register("password")} />
          {errors.password && <p className="text-[11px] text-danger">{errors.password.message}</p>}
        </div>
        <label className="flex items-center gap-2">
          <Checkbox defaultChecked onCheckedChange={(v) => setValue("remember", v === true)} />
          <span className="text-[12px] text-muted-foreground">Remember me on this device</span>
        </label>

        <Button type="submit" className="mt-1 w-full" disabled={isSubmitting}>
          Sign in
          <ArrowRight className="size-3.5" />
        </Button>
      </form>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">or</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <Button
        variant="secondary"
        className="w-full"
        onClick={() => {
          toast.success("Welcome back, Pankaj.");
          router.push("/dashboard");
        }}
      >
        <svg viewBox="0 0 24 24" className="size-3.5">
          <path
            fill="currentColor"
            d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81Z"
          />
        </svg>
        Continue with Google
      </Button>

      <p className="text-center text-[12px] text-muted-foreground">
        Don&apos;t have a workspace?{" "}
        <Link href="/signup" className="text-accent hover:underline">
          Create account
        </Link>
      </p>
    </div>
  );
}
