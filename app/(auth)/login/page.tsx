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

const schema = z.object({
  email: z.string().email("Enter a valid work email"),
  password: z.string().min(1, "Password is required"),
});
type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
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
      router.replace("/leads");
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
    </div>
  );
}
