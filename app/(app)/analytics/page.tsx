"use client";

import { PageHeader } from "@/components/shared/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AcquisitionSection } from "@/components/analytics/acquisition-section";
import { SalesSection } from "@/components/analytics/sales-section";
import { AiSection } from "@/components/analytics/ai-section";
import { SupportSection } from "@/components/analytics/support-section";
import { CustomerSection } from "@/components/analytics/customer-section";
import { AutomationSection } from "@/components/analytics/automation-section";

export default function AnalyticsPage() {
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col">
      <PageHeader
        title="Analytics"
        description="Acquisition, sales, AI operations, support, customer health and automation — last 30 days."
      />

      <Tabs defaultValue="acquisition" className="px-6 pb-8">
        <TabsList>
          <TabsTrigger value="acquisition">Acquisition</TabsTrigger>
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="ai">AI</TabsTrigger>
          <TabsTrigger value="support">Support</TabsTrigger>
          <TabsTrigger value="customer">Customer</TabsTrigger>
          <TabsTrigger value="automation">Automation</TabsTrigger>
        </TabsList>

        <TabsContent value="acquisition" className="pt-5">
          <AcquisitionSection />
        </TabsContent>
        <TabsContent value="sales" className="pt-5">
          <SalesSection />
        </TabsContent>
        <TabsContent value="ai" className="pt-5">
          <AiSection />
        </TabsContent>
        <TabsContent value="support" className="pt-5">
          <SupportSection />
        </TabsContent>
        <TabsContent value="customer" className="pt-5">
          <CustomerSection />
        </TabsContent>
        <TabsContent value="automation" className="pt-5">
          <AutomationSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
