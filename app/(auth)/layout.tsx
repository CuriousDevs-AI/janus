import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-1 flex-col items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_30%,black,transparent)]" />
      <div
        className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[720px] -translate-x-1/2 rounded-full opacity-[0.16] blur-[110px]"
        style={{ background: "radial-gradient(circle, #2563EB 0%, transparent 70%)" }}
      />
      <Link href="/login" className="relative z-10 mb-8 flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-sm bg-foreground text-[13px] font-bold text-background">
          C
        </span>
        <span className="flex flex-col leading-none">
          <span className="text-[14px] font-semibold text-foreground">
            Curious<span className="text-accent">Devs</span>
          </span>
          <span className="text-[10px] text-muted-foreground">Janus</span>
        </span>
      </Link>
      <div className="relative z-10 w-full max-w-[380px]">{children}</div>
    </div>
  );
}
