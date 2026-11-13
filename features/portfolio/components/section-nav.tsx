"use client";

import * as React from "react";

export type NavSection = { id: string; label: string };

/** A row of links that stays at the top of a long Portfolio page: each jumps to its part of the
 * page, and the part on screen is marked. Parts that are not on the page are left out. */
export function SectionNav({ sections, label = "On this page" }: { sections: NavSection[]; label?: string }) {
  const [present, setPresent] = React.useState<NavSection[]>([]);
  const [current, setCurrent] = React.useState<string | null>(null);
  const key = sections.map((section) => section.id).join(",");

  React.useEffect(() => {
    // Some parts only show when there is something in them, so ask the page which are there.
    const found = sections.filter((section) => (document.getElementById(section.id)?.childElementCount ?? 0) > 0);
    // The part on screen is the last one whose top has passed just below the bar; at the very end
    // of the page, the last part. Scrolling happens in the app's main pane, so listen for any scroll.
    const mark = () => {
      const tops = found.map((section) => ({ id: section.id, top: document.getElementById(section.id)?.getBoundingClientRect().top ?? Infinity }));
      const scroller = document.querySelector("main");
      const atEnd = scroller ? scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4 : false;
      const passed = tops.filter((entry) => entry.top <= 160);
      setCurrent(atEnd && passed.length ? tops[tops.length - 1].id : passed.length ? passed[passed.length - 1].id : tops[0]?.id ?? null);
    };
    // After the page has painted: what is on it, and where the reader is.
    const frame = window.setTimeout(() => { setPresent(found); mark(); }, 0);
    document.addEventListener("scroll", mark, { capture: true, passive: true });
    return () => { window.clearTimeout(frame); document.removeEventListener("scroll", mark, { capture: true }); };
    // The list of ids is the dependency; a new array with the same ids changes nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (present.length < 2) return null;
  const jump = (id: string) => { setCurrent(id); document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  return <nav aria-label={label} className="sticky top-0 z-20 -mx-6 border-b border-border bg-background/90 px-6 py-2 backdrop-blur print:hidden">
    <ul className="flex gap-1 overflow-x-auto [scrollbar-width:none]">{present.map((section) => <li key={section.id} className="shrink-0">
      <button type="button" aria-current={current === section.id ? "location" : undefined} onClick={() => jump(section.id)} className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${current === section.id ? "bg-foreground text-background" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"}`}>{section.label}</button>
    </li>)}</ul>
  </nav>;
}

/** A part of a long page that the section links can jump to, clear of the bar above it. */
export function Section({ id, children }: { id: string; children: React.ReactNode }) {
  return <div id={id} className="flex scroll-mt-16 flex-col gap-6 empty:hidden">{children}</div>;
}
