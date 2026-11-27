"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { CustomerDetailPanel } from "@/components/crm/customer-detail";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  return (
    <div className="mx-auto h-full max-w-[1200px]">
      <CustomerDetailPanel contactId={id} onBack={() => router.push("/customers")} />
    </div>
  );
}
