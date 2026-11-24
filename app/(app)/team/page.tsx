import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { TeamChat } from "@/components/team/team-chat";

export default function TeamPage() {
  return (
    <Suspense fallback={<div className="flex h-64 items-center justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>}>
      <TeamChat />
    </Suspense>
  );
}
