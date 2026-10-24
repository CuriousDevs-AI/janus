import type { AppNotification, NotificationCategory } from "@/lib/types";
import { isFirstCompany } from "@/lib/companies";
import { at } from "@/lib/demo-universe";

type Row = [NotificationCategory, string, string, number, string, boolean, string?, boolean?];
const rows: Row[] = [
  ["support", "Customer escalation", "Kumar & Sons: ticket #1031 escalated. 6 cartons short on today's delivery.", 0, "09:30", false, "/tickets/tck-1031", true],
  ["ai", "Approval waiting", "Support Agent asked for a ₹4,200 credit note for Kumar & Sons.", 0, "09:40", false, "/approvals/appr-3", true],
  ["sales", "Customer replied", "Northstar Retail asked to confirm weekly drops from 3 November.", 0, "15:38", false, "/customers/cus-1", true],
  ["sales", "Approval waiting", "Arjun needs your call on 45-day credit for Metro Value Mart (₹3.1L).", 1, "16:25", false, "/approvals/appr-1", true],
  ["sales", "Proposal awaiting a decision", "Annapurna Foods has had the Rajasthan feeder proposal for 2 days.", 2, "11:40", false, "/deals/deal-3"],
  ["support", "SLA risk", "Ticket #1031 has 55 minutes left on its response SLA.", 0, "09:35", false, "/tickets/tck-1031", true],
  ["automation", "Automation waiting", "Proposal follow-up is waiting on a reply from Sunrise Pharmacy Chain.", 1, "10:00", false, "/automations"],
  ["support", "Dispatch slot missed", "FreshKart's 6am truck left late twice this week. Ticket #1015 is open.", 4, "09:00", false, "/tickets/tck-1015", true],
  ["sales", "New lead", "Delhi Valley Schools Trust asked about hygienic packaged snacks for 3 campuses.", 2, "11:20", true, "/leads"],
  ["ai", "Memory suggestion", "Janus noticed Shiv Shakti Bakery is comparing a Kota wholesaler. Review the memory.", 0, "11:20", true, "/memory"],
  ["sales", "Deal won", "Rajputana Wholesale Co-op signed monthly dry-goods supply: ₹5.2L.", 6, "10:20", true, "/deals/deal-9"],
  ["automation", "Run completed", "New-order onboarding ran for Rajputana Wholesale Co-op and created 3 tasks.", 6, "10:30", true, "/automations"],
  ["system", "Slack needs reconnecting", "The Slack token expired. Alerts for the sales channel are paused.", 3, "08:00", true, "/integrations", true],
  ["system", "WhatsApp templates approved", "Meta approved the two follow-up templates you submitted on Monday.", 5, "13:00", true, "/lead-sources"],
  ["ai", "Credit note approved", "You approved the replacement batch for Shiv Shakti Bakery.", 12, "10:45", true, "/approvals/appr-9"],
  ["system", "Weekly report ready", "The weekly sales and collections report was sent to the owners.", 2, "08:30", true, "/analytics"],
];

const acme_notifications: AppNotification[] = rows.map(([category, title, description, daysAgo, time, read, href, high], index) => ({ id: `notif-${index + 1}`, category, title, description, createdAt: at(daysAgo, time), read, href, priority: high ? "high" : "normal" }));

export const notifications: AppNotification[] = isFirstCompany ? acme_notifications : [];

export function unreadCount(list: AppNotification[] = notifications): number {
  return list.filter((n) => !n.read).length;
}
