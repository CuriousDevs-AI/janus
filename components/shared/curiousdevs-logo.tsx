import { cn } from "@/lib/utils";

export function CuriousdevsLogo({ className, animate, loading }: { className?: string; animate?: boolean; loading?: boolean }) {
  if (loading) {
    return (
      <svg viewBox="0 0 100 100" width="24" height="24" fill="currentColor" aria-hidden="true" className={className}>
        <g transform="translate(50 50) rotate(45)" className="logo-build-pulse">
          <path d="M-44.5-20.5V20.5H10.1V13.4H-37.4V-13.4H-24.15V-20.5Z" className="logo-arm logo-arm-1" />
          <path d="M-44.5-20.5V20.5H10.1V13.4H-37.4V-13.4H-24.15V-20.5Z" transform="rotate(90)" className="logo-arm logo-arm-2" />
          <path d="M-44.5-20.5V20.5H10.1V13.4H-37.4V-13.4H-24.15V-20.5Z" transform="rotate(180)" className="logo-arm logo-arm-3" />
          <path d="M-44.5-20.5V20.5H10.1V13.4H-37.4V-13.4H-24.15V-20.5Z" transform="rotate(270)" className="logo-arm logo-arm-4" />
        </g>
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 100 100" width="24" height="24" fill="currentColor" aria-hidden="true" className={cn(animate && "hover:animate-logo-spin", className)}>
      <g transform="translate(50 50) rotate(45)">
        <path d="M-44.5-20.5V20.5H10.1V13.4H-37.4V-13.4H-24.15V-20.5Z" />
        <path d="M-44.5-20.5V20.5H10.1V13.4H-37.4V-13.4H-24.15V-20.5Z" transform="rotate(90)" />
        <path d="M-44.5-20.5V20.5H10.1V13.4H-37.4V-13.4H-24.15V-20.5Z" transform="rotate(180)" />
        <path d="M-44.5-20.5V20.5H10.1V13.4H-37.4V-13.4H-24.15V-20.5Z" transform="rotate(270)" />
      </g>
    </svg>
  );
}
