"use client";

import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { boardPack } from "@/features/portfolio/lib/board-pack";
import type { PortfolioCompany, PortfolioPeriod } from "@/features/portfolio/types";

export function ExportButtons({ list, period }: { list: PortfolioCompany[]; period: PortfolioPeriod }) {
  const download = () => {
    const blob = new Blob([boardPack(list, period)], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `portfolio-${period.key}-${period.end}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  return <div className="flex gap-2 print:hidden"><Button size="sm" variant="outline" onClick={download}><Download className="mr-1 size-4" />Board pack (CSV)</Button><Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="mr-1 size-4" />Print</Button></div>;
}
