"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { getNavSectionsForWorkspace } from "@/lib/nav-config";
import { useWorkspace } from "@/components/layout/workspace-context";

/** The label of the active navigation item, shown in the top bar. */
export function usePageTitle() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { workspaceId } = useWorkspace();
  const items = getNavSectionsForWorkspace(workspaceId).flatMap((s) => s.items);
  // A page that carries extra parameters (a selected chat, a report) still belongs to its menu item.
  const byPath = items.find((item) => item.href.split("?")[0] === pathname);
  return (
    items
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
      })?.label || byPath?.label || "Janus"
  );
}
