import type { HrDocument, HrEmployee } from "@/lib/types";

export const COMPANY_NAME = "Acme Traders Pvt Ltd";

export type Block =
  | { type: "title" | "h2" | "p" | "note"; text: string }
  | { type: "ul" | "ol"; items: string[] }
  | { type: "hr" };

/** Reads a light markup: # title, ## heading, - bullets, 1. numbers, > note, --- rule. Anything else is a paragraph. */
export function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;
  const flushParagraph = () => { if (paragraph.length) blocks.push({ type: "p", text: paragraph.join("\n") }); paragraph = []; };
  const flushList = () => { if (list) blocks.push(list); list = null; };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushParagraph(); flushList(); continue; }
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const number = /^\d+[.)]\s+(.*)$/.exec(line);
    if (/^#\s+/.test(line)) { flushParagraph(); flushList(); blocks.push({ type: "title", text: line.replace(/^#\s+/, "") }); }
    else if (/^##\s+/.test(line)) { flushParagraph(); flushList(); blocks.push({ type: "h2", text: line.replace(/^##\s+/, "") }); }
    else if (/^>\s?/.test(line)) { flushParagraph(); flushList(); blocks.push({ type: "note", text: line.replace(/^>\s?/, "") }); }
    else if (/^-{3,}$/.test(line.trim())) { flushParagraph(); flushList(); blocks.push({ type: "hr" }); }
    else if (bullet || number) { flushParagraph(); const type = bullet ? "ul" : "ol"; if (!list || list.type !== type) { flushList(); list = { type, items: [] }; } list.items.push((bullet ?? number)![1]); }
    else { flushList(); paragraph.push(line); }
  }
  flushParagraph(); flushList();
  return blocks;
}

/** Older documents were stored as plain text. Give them a title and note so they read like the rest. */
export function blocksFromText(text: string, fallbackTitle: string): Block[] {
  const blocks = parseBlocks(text);
  if (blocks.some((block) => block.type === "title" || block.type === "h2")) return blocks;
  return [{ type: "title", text: fallbackTitle }, ...blocks.map((block): Block => block.type === "p" && /^SAMPLE |^DEMO /i.test(block.text) ? { type: "note", text: block.text } : block)];
}

export const stripInline = (text: string) => text.replace(/\*\*(.+?)\*\*/g, "$1");
export function plainText(blocks: Block[]) {
  return blocks.map((block) => {
    if ("items" in block) return block.items.map((item, index) => `${block.type === "ol" ? `${index + 1}.` : "•"} ${stripInline(item)}`).join("\n");
    if (block.type === "hr") return "—".repeat(20);
    return block.type === "title" ? stripInline(block.text).toUpperCase() : stripInline(block.text);
  }).join("\n\n");
}
export function firstSentence(markup: string, max = 170) {
  const block = parseBlocks(markup).find((item) => item.type === "p");
  const text = block && block.type === "p" ? stripInline(block.text).replace(/\s+/g, " ") : "";
  const sentences = text.split(/(?<=[.!?])\s/);
  // A very short opening sentence ("Welcome to Acme.") says little, so add the next one.
  const summary = sentences[0] && sentences[0].length < 60 && sentences[1] ? `${sentences[0]} ${sentences[1]}` : sentences[0] ?? text;
  return summary.length > max ? `${summary.slice(0, max - 1).trimEnd()}…` : summary;
}
export function readingMinutes(markup: string) {
  const words = plainText(parseBlocks(markup)).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

const longDate = (value?: string | null) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "the date of issue";
const typeLabel = { full_time: "Full time", part_time: "Part time", contract: "Contract" } as const;

/** A readable sample for documents that have no uploaded file. Never includes pay figures. */
export function sampleMarkup(document: HrDocument, employee?: HrEmployee, options: { draft?: boolean; addressedTo?: string; purpose?: string } = {}) {
  const name = employee?.name ?? document.employeeName;
  const first = name.split(" ")[0];
  const title = employee?.title ?? "your role";
  const department = employee?.department ?? "your";
  const manager = employee?.managerName ?? "your reporting manager";
  const issued = longDate(document.issuedAt);
  const joining = longDate(employee?.joiningDate);
  const head = (heading: string) => `# ${heading}\n> Sample document for demonstration. It is not a legal instrument.\n\n**Date:** ${issued}\n**Employee:** ${name} (${document.employeeId.toUpperCase()})\n${options.addressedTo ? `**To:** ${options.addressedTo}\n` : ""}${options.purpose ? `**Purpose:** ${options.purpose}\n` : ""}\n`;
  const key = `${document.category} ${document.name}`.toLowerCase();
  if (/verification/.test(key)) return `${head("Employment verification letter")}To whom it may concern,\n\nThis is to confirm that **${name}** is employed with ${COMPANY_NAME} as **${title}** in the ${department} team, since ${joining}.\n\n## Details we can confirm\n- Employee ID: ${document.employeeId.toUpperCase()}\n- Designation: ${title}\n- Department: ${department}\n- Employment type: ${employee ? typeLabel[employee.employmentType] : "Full time"}\n\nThis letter is issued at the employee's request for the purpose stated above. We do not share pay details unless the employee asks for a salary certificate.\n\n**HR Team**, ${COMPANY_NAME}`;
  if (/salary certificate/.test(key)) return `${head("Salary certificate")}To whom it may concern,\n\nThis certifies that **${name}**, ${title} in the ${department} team, is employed with ${COMPANY_NAME} since ${joining}.\n\n## Salary details\nThe gross monthly salary is added here by Payroll after they verify it against the latest approved payroll. Sample content does not show pay figures.\n\nThis certificate is issued at the employee's request for the purpose stated above.\n\n**HR Team**, ${COMPANY_NAME}`;
  if (/address proof/.test(key)) return `${head("Address proof letter")}To whom it may concern,\n\nThis letter confirms that **${name}** is an employee of ${COMPANY_NAME}, working as **${title}** at our ${employee?.branch ?? "head"} office.\n\n## Address on record\nThe employee's residential address is taken from their verified HR record and is added here before the letter is issued.\n\nThis letter is issued at the employee's request for the purpose stated above.\n\n**HR Team**, ${COMPANY_NAME}`;
  if (/bonafide|no.objection|noc/.test(key)) return `${head("Bonafide and no-objection letter")}To whom it may concern,\n\nThis is to certify that **${name}** is a bonafide employee of ${COMPANY_NAME}, working as **${title}** in the ${department} team.\n\nThe Company has **no objection** to the employee's request for the purpose stated above. This letter does not create any obligation for the Company.\n\n**HR Team**, ${COMPANY_NAME}`;
  if (/offer/.test(key)) return `${head("Offer of employment")}Dear ${first},\n\nWe are pleased to offer you the position of **${title}** in the **${department}** team at ${COMPANY_NAME}. This letter sets out the main terms of your offer.\n\n## Your role\n- Position: ${title}\n- Reporting to: ${manager}\n- Employment type: ${employee ? typeLabel[employee.employmentType] : "Full time"}\n- Proposed joining date: ${joining}\n\n## Compensation and benefits\nYour fixed pay, allowances and any variable component are set out in the compensation annexure shared with you separately. Statutory deductions apply as required by law.\n\n## Probation and notice\n1. You will be on probation for the first six months of employment.\n2. After confirmation, either side may end employment with 30 days' written notice.\n\n## Confidentiality\nYou agree to keep company and customer information confidential, during and after your employment.\n\n## Accepting this offer\nPlease sign this letter to accept the offer. If you have questions, speak to HR before signing.\n\nWarm regards,\n**HR Team**, ${COMPANY_NAME}`;
  if (/agreement|contract/.test(key)) return `${head("Employment agreement")}This agreement is between **${COMPANY_NAME}** ("the Company") and **${name}** ("the Employee").\n\n## 1. Position and duties\nThe Employee is employed as **${title}** in the ${department} team and will carry out the duties reasonably assigned by ${manager}.\n\n## 2. Working time\nWorking days, shift timings and leave follow the Company's current leave and attendance policy.\n\n## 3. Confidentiality and company property\n- Keep customer, pricing and employee information confidential.\n- Return all company devices, documents and access on leaving.\n\n## 4. Ending employment\nEither party may end this agreement by giving written notice as set out in the offer letter.\n\n## 5. General\nThis agreement, with the offer letter and company policies, is the full understanding between the parties.\n\nBy signing, both parties confirm they have read and agree to these terms.`;
  if (/nda|confidential/.test(key)) return `${head("Non-disclosure and confidentiality")}This agreement protects information that ${name} receives while working with ${COMPANY_NAME}.\n\n## What counts as confidential\n- Customer lists, quotes, contracts and pricing.\n- Business plans, financial information and internal reports.\n- Employee personal and payroll information.\n- Any information marked or reasonably understood to be confidential.\n\n## Your responsibilities\n1. Use confidential information only for company work.\n2. Do not copy, share or store it on personal accounts or devices.\n3. Tell your manager or HR immediately if you think information has been exposed.\n\n## What is not covered\nInformation that is already public, or that you are legally required to disclose.\n\n## How long this lasts\nYour duty of confidentiality continues after you leave the Company.`;
  if (/acknowledg|policy/.test(key)) return `${head(document.name)}I confirm that I have received and read the company policy named above, and that I understand what it asks of me.\n\n## What you are confirming\n- You have read the policy in full.\n- You will follow it in your day-to-day work.\n- You know to ask HR when something is unclear.\n\n## Questions\nIf any part is unclear, use **Ask about policy** or speak to HR before signing.`;
  if (/exit|clearance/.test(key)) return `${head("Exit clearance")}This record confirms the items to be cleared before ${name}'s last working day.\n\n## Clearance checklist\n1. Handover of work and client relationships to ${manager}.\n2. Return of laptop, phone and other company assets.\n3. Removal of system access on the last working day.\n4. Settlement of any pending expense claims.\n\n## Acknowledgement\nBy signing, the employee confirms the clearance items above have been completed.`;
  if (/experience/.test(key)) return `${head("Experience letter")}To whom it may concern,\n\nThis is to certify that **${name}** worked with ${COMPANY_NAME} as **${title}** in the ${department} team, from ${joining}.\n\nDuring this time ${first} carried out their responsibilities diligently. We wish them well in their future work.\n\nSincerely,\n**HR Team**, ${COMPANY_NAME}`;
  if (/relieving/.test(key)) return `${head("Relieving letter")}Dear ${first},\n\nThis letter confirms that you have been relieved from your duties as **${title}** at ${COMPANY_NAME}, after completing the exit process.\n\nAll company property has been returned and your dues will be settled as per the full and final settlement.\n\nWe thank you for your contribution.\n\n**HR Team**, ${COMPANY_NAME}`;
  if (/salary revision|revision/.test(key)) return `${head("Salary revision letter")}Dear ${first},\n\nFollowing your performance review, we are pleased to revise your compensation as **${title}** in the ${department} team, effective from the next payroll cycle.\n\n## What changes\n- Your revised fixed pay and allowances are set out in the compensation annexure shared with you separately.\n- All other terms of your employment stay the same.\n\n## Please note\nThis letter is confidential. Statutory deductions apply as required by law.\n\nSign below to confirm you have received this letter.\n\n**HR Team**, ${COMPANY_NAME}`;
  if (/warning|disciplinary|notice/.test(key)) return `${head("Notice of concern")}Dear ${first},\n\nThis notice records a concern raised about your work and the steps we expect next.\n\n## What happened\nDescribe the specific events, dates and any earlier conversations here.\n\n## What we expect\n1. Describe the improvement or change expected.\n2. Agree a date to review progress with ${manager}.\n\n## Your response\nYou may add your response in writing within 7 days. Signing confirms that you received this notice. It does not mean you agree with it.\n\n**HR Team**, ${COMPANY_NAME}`;
  if (/full & final|full and final|f&f/.test(key)) return `${head("Full and final settlement acknowledgement")}Dear ${first},\n\nThis acknowledgement confirms that your full and final settlement with ${COMPANY_NAME} has been prepared.\n\n## What is covered\n- Salary and leave encashment up to the last working day.\n- Approved expense claims that were pending.\n- Statutory deductions as required by law.\n\n## Your acknowledgement\nBy signing you confirm that you have received the settlement statement and have no further dues from the Company, except as listed in it.\n\n**HR Team**, ${COMPANY_NAME}`;
  if (!options.draft && /salary|compensation|settlement|payroll|tax/.test(key)) return `${head(document.name)}This is a restricted document. Pay figures are not shown in sample content.\n\n## About this document\n- Category: ${document.category}\n- Version: ${document.version}\n\nUpload the real document to review it here.`;
  return `${head(document.name)}This document has no uploaded file yet, so a sample is shown.\n\n## About this document\n- Category: ${document.category}\n- Version: ${document.version}\n- Prepared by: ${document.ownerName}\n\nUpload your own file to review the real document.`;
}

export async function sha256Hex(data: string | Blob) {
  try {
    const bytes = typeof data === "string" ? new TextEncoder().encode(data) : await data.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return "unavailable";
  }
}

export interface SignatureRecord { method: "typed" | "drawn" | "acknowledged"; typedName?: string; image?: string; hash: string; signedAt: string; device: string; reference: string }

export function deviceLabel() {
  if (typeof navigator === "undefined") return "Web";
  const agent = navigator.userAgent;
  const browser = /Edg\//.test(agent) ? "Edge" : /Chrome\//.test(agent) ? "Chrome" : /Firefox\//.test(agent) ? "Firefox" : /Safari\//.test(agent) ? "Safari" : "Browser";
  return `${browser} on ${/Mobile|Android|iPhone/.test(agent) ? "mobile" : "desktop"}`;
}
export const makeReference = (hash: string, at: Date) => `SIG-${at.toISOString().slice(0, 10).replaceAll("-", "")}-${hash.slice(0, 6).toUpperCase()}`;

export function certificateText(document: HrDocument, signerName: string, record: SignatureRecord) {
  const when = new Date(record.signedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "long", timeStyle: "medium" });
  return ["SIGNATURE CERTIFICATE (DEMO)", "This is a demonstration record. It is not a legally valid electronic signature.", "", `Document: ${document.name}`, `Version: ${document.version}`, `Signed by: ${signerName}`, `Method: ${record.method === "typed" ? `Typed name (${record.typedName})` : record.method === "drawn" ? "Drawn signature" : "Read and acknowledged"}`, `Signed at: ${when} IST`, `Device: ${record.device}`, `Reference: ${record.reference}`, `Document fingerprint (SHA-256): ${record.hash}`, "", "The fingerprint changes if even one character of the document changes."].join("\n");
}
