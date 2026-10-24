import { cn } from "@/lib/utils";

const colours = ["#2563eb", "#d97706", "#16a34a", "#9333ea", "#dc2626", "#0891b2"];
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "C";
const pick = (id: string) => colours[[...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % colours.length];

/** A company's logo, or its initials on a colour when it has none. */
export function CompanyLogo({ company, size = 28, className }: { company: { id: string; name: string; logo?: string }; size?: number; className?: string }) {
  const style = { width: size, height: size };
  // The name is announced by the text next to the logo, so the image itself is decorative.
  if (company.logo) return <span className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-white", className)} style={style}><img src={company.logo} alt="" className="size-full object-contain" /></span>;
  return <span aria-hidden className={cn("inline-flex shrink-0 items-center justify-center rounded-md font-semibold text-white", className)} style={{ ...style, background: pick(company.id), fontSize: Math.max(10, Math.round(size * 0.38)) }}>{initials(company.name)}</span>;
}
