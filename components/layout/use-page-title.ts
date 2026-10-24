"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { getNavSectionsForWorkspace } from "@/lib/nav-config";
import { useWorkspace } from "@/components/layout/workspace-context";

/** The label of the active navigation item, shown in the top bar. */
export function usePageTitle() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { workspaceId } = useWorkspace();
  return (
    getNavSectionsForWorkspace(workspaceId)
      .flatMap((s) => s.items)
      .find((item) => {
        const [itemPath, itemQuery] = item.href.split("?");
        if (pathname !== itemPath && !pathname.startsWith(`${itemPath}/`)) return false;
        const itemParams = new URLSearchParams(itemQuery ?? "");
        for (const [key, value] of itemParams.entries()) {
          if (searchParams.get(key) !== value) return false;
        }
        for (const [key] of searchParams.entries()) {
          if (key !== "workspace" && !itemParams.has(key)) return false;
        }
        return true;
      })?.label || "Janus"
  );
}
