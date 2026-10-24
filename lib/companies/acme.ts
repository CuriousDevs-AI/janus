import type { Buyer, CompanySpec, Row } from "@/lib/companies/spec";

const company = { name: "Acme Traders Pvt Ltd", short: "Acme Traders", domain: "acmetraders.in", industry: "FMCG & household goods distribution", city: "Gurugram, Haryana", gstin: "06AABCA1234F1Z5" };

/** Sales people. Ids are the CRM user ids, the same ones the signed-in session carries. */
const owners = {
  owner: { id: "u-1", name: "Pankaj Neema" },
  arjun: { id: "u-4", name: "Arjun Mehta" },
  riya: { id: "u-3", name: "Riya Kapoor" },
  meera: { id: "u-2", name: "Meera Singh" },
} as const;

/** Trade customers. None share a name with an Acme employee. */
const buyers: Buyer[] = [
  { id: "cus-1", company: "Northstar Retail", contact: "Kavita Rao", phone: "+91 98765 43210", email: "kavita@northstarretail.in", city: "Delhi", kind: "Retail chain, 6 stores" },
  { id: "cus-2", company: "Orbit Canteen Services", contact: "Amit Shah", phone: "+91 98100 11223", email: "amit@orbitcanteen.in", city: "Gurugram", kind: "Institutional canteens" },
  { id: "cus-3", company: "Annapurna Foods", contact: "Neelam Bansal", phone: "+91 99200 77881", email: "neelam@annapurnafoods.in", city: "Jaipur", kind: "Regional distributor" },
  { id: "cus-4", company: "Shree Balaji Kirana Stores", contact: "Mahesh Agarwal", phone: "+91 98290 44120", email: "mahesh@shreebalaji.in", city: "Alwar", kind: "Kirana" },
  { id: "cus-5", company: "Green Basket Supermarket", contact: "Farah Siddiqui", phone: "+91 98110 55231", email: "farah@greenbasket.in", city: "Noida", kind: "Supermarket" },
  { id: "cus-6", company: "Hotel Aravali Grand", contact: "Pradeep Chauhan", phone: "+91 94140 22871", email: "purchase@aravaligrand.in", city: "Udaipur", kind: "Hotel" },
  { id: "cus-7", company: "Metro Value Mart", contact: "Suresh Nair", phone: "+91 98999 30412", email: "suresh@metrovaluemart.in", city: "Faridabad", kind: "Retail, 4 outlets" },
  { id: "cus-8", company: "Sunrise Pharmacy Chain", contact: "Anjali Mehra", phone: "+91 98104 66782", email: "anjali@sunrisepharmacy.in", city: "Delhi", kind: "Pharmacy chain" },
  { id: "cus-9", company: "Rajputana Wholesale Co-op", contact: "Bhanwar Singh", phone: "+91 94133 90125", email: "bhanwar@rajputanacoop.in", city: "Jodhpur", kind: "Co-operative, 40 shops" },
  { id: "cus-10", company: "FreshKart Quick Commerce", contact: "Siddharth Jain", phone: "+91 98731 88204", email: "sid@freshkart.in", city: "Gurugram", kind: "Dark stores" },
  { id: "cus-11", company: "Delhi Valley Schools Trust", contact: "Ritu Malhotra", phone: "+91 98111 20938", email: "ritu@dvschools.in", city: "Delhi", kind: "School canteens" },
  { id: "cus-12", company: "Kumar & Sons General Merchants", contact: "Rakesh Kumar", phone: "+91 98963 17745", email: "rakesh@kumarandsons.in", city: "Rewari", kind: "General merchant" },
  { id: "cus-13", company: "Lotus Cash & Carry", contact: "Vandana Pillai", phone: "+91 98100 73345", email: "vandana@lotuscarry.in", city: "Gurugram", kind: "Cash & carry" },
  { id: "cus-14", company: "Shiv Shakti Bakery", contact: "Dinesh Prajapat", phone: "+91 94140 56012", email: "dinesh@shivshaktibakery.in", city: "Kota", kind: "Bakery" },
];

const rows: Row[] = [
  [1, "website", "qualified", 2, 0, "owner", "Diwali retail readiness", "Festive stock for 6 Delhi stores: staples, snacks and gift packs, weekly drops from the Gurugram warehouse.", ["Northstar festive range, 6 stores", 480000, 15]],
  [2, "phone_call", "new", 3, 3, "owner", null, "Missed call from the canteen purchase desk asking for monthly rates on edible oil and pulses."],
  [3, "whatsapp", "proposal", 5, 2, "arjun", "Distributor outreach", "Wants Acme as the Rajasthan feeder for biscuits and namkeen, payment on 30-day credit.", ["Annapurna Rajasthan feeder supply", 650000, 22]],
  [4, "whatsapp", "qualified", 6, 1, "meera", null, "Kirana owner wants a fortnightly top-up of atta, rice and cooking oil with doorstep delivery.", ["Balaji fortnightly staples", 85000, 12]],
  [5, "website", "new", 1, 1, "riya", "Diwali retail readiness", "Supermarket manager asking for the festive price list and minimum order quantity."],
  [6, "phone_call", "qualified", 9, 4, "arjun", null, "Hotel needs bulk kitchen and housekeeping consumables on a monthly rate contract.", ["Aravali monthly consumables contract", 220000, 18]],
  [7, "whatsapp", "negotiation", 12, 1, "arjun", "Distributor outreach", "Negotiating margin on the personal-care range for 4 Faridabad outlets, wants 45-day credit.", ["Metro personal-care range, 4 outlets", 310000, 8]],
  [8, "website", "proposal", 10, 3, "riya", null, "Pharmacy chain looking for a regular supplier of sanitisers, soaps and baby-care.", ["Sunrise pharmacy essentials", 140000, 14]],
  [9, "whatsapp", "won", 20, 6, "arjun", "Distributor outreach", "Co-op signed for monthly dry-goods supply across 40 member shops.", ["Rajputana monthly dry goods", 520000, -6]],
  [10, "website", "qualified", 4, 1, "meera", "Quick commerce supply", "Dark store needs daily replenishment of packaged snacks with a 6am dispatch.", ["FreshKart daily snacks replenishment", 360000, 20]],
  [11, "phone_call", "new", 2, 2, "owner", null, "School canteen trust enquiring about hygienic packaged snacks for 3 campuses."],
  [12, "whatsapp", "won", 28, 9, "meera", null, "Reorder of 120 cartons of detergent, repeat customer.", ["Kumar detergent reorder", 98000, -9]],
  [13, "website", "proposal", 7, 2, "riya", "Diwali retail readiness", "Cash and carry wants a bundled festive offer on dry fruits and gift hampers.", ["Lotus festive hamper bundle", 270000, 11]],
  [14, "whatsapp", "negotiation", 8, 0, "meera", null, "Bakery wants flour, sugar and edible oil on a weekly schedule, negotiating on rate.", ["Shiv Shakti weekly bakery inputs", 175000, 9]],
  [1, "whatsapp", "won", 35, 22, "owner", null, "First order for 6 stores: staples and beverages, delivered in September.", ["Northstar first order", 310000, -22]],
  [5, "phone_call", "lost", 22, 14, "riya", null, "Chose a nearer distributor on price.", ["Green Basket staples", 120000, -14]],
  [7, "website", "won", 40, 25, "arjun", null, "Trial order for household cleaners, converted after delivery.", ["Metro cleaners trial order", 64000, -25]],
  [3, "website", "qualified", 14, 8, "arjun", "Distributor outreach", "Asked for the Rajasthan price list and delivery schedule."],
  [2, "whatsapp", "new", 3, 3, "owner", null, "Asking whether Acme can deliver to the Manesar plant canteen."],
  [10, "phone_call", "new", 5, 5, "meera", null, "Dark store team called for a rate on bulk packaging material."],
  [9, "phone_call", "qualified", 16, 10, "arjun", null, "Co-op asking to add stationery to the monthly supply."],
  [12, "website", "new", 6, 6, "meera", null, "Enquiring about a credit limit increase."],
  [4, "whatsapp", "lost", 30, 24, "meera", null, "Went with a local wholesaler.", ["Balaji bulk order", 40000, -24]],
  [6, "whatsapp", "new", 1, 1, "arjun", null, "Wedding-season banquet orders for rice and pulses, asking for a quote."],
];


export const acmeSpec: CompanySpec = { id: "acme", company, owners, buyers, rows };
