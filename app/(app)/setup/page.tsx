"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function SetupPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/portfolio?view=companies"); }, [router]);
  return <div className="mx-auto max-w-3xl p-8 text-sm text-muted-foreground">Redirecting to Portfolio…</div>;
}
