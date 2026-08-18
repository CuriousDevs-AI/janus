import type { ComponentType } from "react";
import { FileText, File, HelpCircle, Globe, ScrollText } from "lucide-react";
import type { KnowledgeDocument } from "@/lib/types";
import type { badgeVariants } from "@/components/ui/badge";
import type { VariantProps } from "class-variance-authority";

type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

// Mirrors the tone conventions in lib/status-meta.tsx: published -> success,
// draft -> warning, processing -> info, archived -> neutral.
export const knowledgeStatusMeta: Record<KnowledgeDocument["status"], { label: string; tone: BadgeTone }> = {
  published: { label: "Published", tone: "success" },
  draft: { label: "Draft", tone: "warning" },
  processing: { label: "Processing", tone: "info" },
  archived: { label: "Archived", tone: "neutral" },
};

export const knowledgeCategoryMeta: Record<KnowledgeDocument["category"], string> = {
  product: "Product",
  pricing: "Pricing",
  policy: "Policy",
  faq: "FAQ",
  support: "Support",
};

export const knowledgeTypeMeta: Record<
  KnowledgeDocument["type"],
  { label: string; icon: ComponentType<{ className?: string }> }
> = {
  pdf: { label: "PDF", icon: FileText },
  docx: { label: "Doc", icon: File },
  faq: { label: "FAQ", icon: HelpCircle },
  url: { label: "URL", icon: Globe },
  policy: { label: "Policy", icon: ScrollText },
};
