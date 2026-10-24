import type { HrPolicySettings } from "@/lib/stores/hr-operations-store";
import { parseBlocks, stripInline } from "@/lib/hr-document-content";

export interface PolicyParagraph { id: string; text: string; heading?: string }
export interface PolicySource { id: string; title: string; version: number | null; issuedAt: string | null; kind: "policy" | "settings"; paragraphs: PolicyParagraph[] }
export interface Citation { n: number; sourceId: string; title: string; version: number | null; paragraphIndex: number; paragraphId: string; confidence: "high" | "medium" }
export interface AnswerLine { text: string; cite: number }
export type Answer =
  | { kind: "answer"; lines: AnswerLine[]; citations: Citation[] }
  | { kind: "none"; reason: string }
  | { kind: "refused"; reason: string };


const stop = new Set("a an the is are was were be been am i me my we our you your it its of to in on at for from by with and or but if then so as do does did can could should would will shall may might must how what when where which who whom why that this these those there here about into than not no any some get got have has had need want please tell us".split(" "));
const groups = [["leave", "vacation", "pto", "absence", "timeoff", "holiday"], ["sick", "ill", "illness", "unwell", "fever"], ["reimbursement", "reimburse", "expense", "claim", "refund"], ["receipt", "bill", "invoice"], ["password", "credential", "login"], ["device", "laptop", "phone", "equipment", "asset"], ["harassment", "safety", "security", "concern", "complaint", "report"], ["manager", "supervisor", "boss"], ["attendance", "punch", "checkin", "clock"], ["late", "grace", "delay"], ["salary", "pay", "payment", "paid"], ["resign", "resignation", "quit", "exit", "notice"], ["lose", "lost", "stolen", "missing", "theft", "misplaced"], ["approve", "approval", "approver", "sanction"], ["day", "days"], ["work", "working", "shift", "hours"]];

const stem = (word: string) => {
  if (word.length <= 3) return word;
  if (/ies$/.test(word)) return word.replace(/ies$/, "y");
  if (/(ss|us|is)$/.test(word)) return word;
  if (/(sh|ch|x|z|ss)es$/.test(word)) return word.replace(/es$/, "");
  if (word.length > 5 && /(ing|ed)$/.test(word)) return word.replace(/(ing|ed)$/, "");
  return word.replace(/s$/, "");
};
const words = (text: string) => text.toLowerCase().replace(/check-in/g, "checkin").replace(/[^a-z0-9]+/g, " ").split(" ").filter((word) => word && !stop.has(word));
const stems = (text: string) => words(text).map(stem);
const synonymStems = (word: string) => { const group = groups.find((items) => items.some((item) => stem(item) === stem(word))); return group ? group.map(stem).filter((item) => item !== stem(word)) : []; };

/** Builds the leave and attendance rules from HR Settings so answers never drift from what the app enforces. */
export function settingsSource(settings: HrPolicySettings): PolicySource {
  const [month, day] = settings.yearStart.split("-").map(Number);
  const start = new Date(2000, month - 1, day).toLocaleDateString("en-IN", { day: "numeric", month: "long" });
  const week = settings.workWeek.length ? settings.workWeek.join(", ") : "no working days set";
  const chain = settings.approvalChain === "manager_hr" ? "the reporting manager first, then HR" : "the reporting manager";
  return { id: "settings", title: "Time & leave policy (HR Settings)", version: null, issuedAt: null, kind: "settings", paragraphs: [
    { id: "s-earned", text: `Earned leave: ${settings.earnedDays} days per leave year. The leave year starts on ${start}.` },
    { id: "s-casual", text: `Casual leave: ${settings.casualDays} days per leave year.` },
    { id: "s-sick", text: `Sick leave: ${settings.sickDays} days per leave year.` },
    { id: "s-unpaid", text: "Unpaid leave can be requested when paid leave runs out. It has no yearly limit." },
    { id: "s-approval", text: `Leave approval: requests go to ${chain}. A manager can delegate approvals to a colleague while they are away.` },
    { id: "s-backdate", text: "Leave can be requested for dates up to 30 days in the past. Weekly offs are not counted as leave days." },
    { id: "s-week", text: `Working week: ${week}. The shift runs ${settings.shiftStart} to ${settings.shiftEnd}. You are marked late if you check in more than ${settings.graceMinutes} minutes after the shift starts.` },
    { id: "s-correction", text: "Attendance corrections can be requested for up to 30 days back. Give the actual times and a reason. Your reporting manager approves the correction." },
    { id: "s-payroll", text: `Payroll is processed monthly. The payroll day is the ${settings.payrollDay}th.` },
  ] };
}

export function policySource(policy: { id: string; name: string; version: number; issuedAt: string | null }, body: string): PolicySource {
  // Titles, notes and rules are layout. Only paragraphs and list items are searchable passages.
  const paragraphs: PolicyParagraph[] = [];
  let heading: string | undefined;
  for (const block of parseBlocks(body)) {
    if (block.type === "h2") heading = stripInline(block.text);
    else if ("items" in block) block.items.forEach((item) => paragraphs.push({ id: `${policy.id}-p${paragraphs.length + 1}`, text: stripInline(item), heading }));
    else if (block.type === "p" && !/^SAMPLE COMPANY POLICY/i.test(block.text)) paragraphs.push({ id: `${policy.id}-p${paragraphs.length + 1}`, text: stripInline(block.text).replace(/\s+/g, " "), heading });
  }
  return { id: policy.id, title: policy.name, version: policy.version, issuedAt: policy.issuedAt, kind: "policy", paragraphs };
}

const sensitive = /\b(salary|salaries|pay ?slip|payslip|ctc|bank|pan|aadhaar|rating|appraisal|warning|disciplinary|address|phone number|leave balance|balance)\b/i;

export function answerQuestion(question: string, sources: PolicySource[], people: { name: string }[], actorName: string): Answer {
  const q = question.trim();
  const lower = q.toLowerCase();
  const mentioned = people.filter((person) => person.name !== actorName && person.name.split(" ").some((part) => part.length > 2 && new RegExp(`\\b${part.toLowerCase()}\\b`).test(lower)));
  if (mentioned.length && sensitive.test(q)) return { kind: "refused", reason: `This tool explains company policy. It can't share details about an individual such as ${mentioned[0].name}. Ask HR directly.` };
  const queryWords = [...new Set(words(q).map(stem))];
  if (!queryWords.length) return { kind: "none", reason: "Try asking a fuller question, like “How many sick days do I get?”" };
  const all = sources.flatMap((source) => source.paragraphs.map((paragraph, index) => ({ source, paragraph, index, set: new Set(stems(paragraph.text)), title: new Set(stems(source.title)) })));
  const df = (word: string) => all.filter((item) => item.set.has(word) || synonymStems(word).some((syn) => item.set.has(syn))).length;
  const idf = (word: string) => Math.log(1 + all.length / (1 + df(word)));
  const total = queryWords.reduce((sum, word) => sum + idf(word), 0);
  const scored = all.map((item) => {
    let score = 0; let matched = 0;
    for (const word of queryWords) {
      if (item.set.has(word)) { score += idf(word); matched += 1; }
      else if (synonymStems(word).some((syn) => item.set.has(syn))) { score += idf(word) * 0.6; matched += 1; }
    }
    // The document title only breaks ties. It never counts as a match on its own.
    const titleBonus = matched > 0 && queryWords.some((word) => item.title.has(word)) ? 0.05 : 0;
    return { ...item, coverage: (total ? score / total : 0) + titleBonus, matched };
  }).filter((item) => item.matched >= Math.min(2, queryWords.length) && item.coverage >= 0.34).sort((a, b) => b.coverage - a.coverage);
  if (!scored.length) return { kind: "none", reason: "I couldn't find this in your company's policies." };
  const top = scored[0].coverage;
  const picked = scored.filter((item) => item.coverage >= top * 0.6).slice(0, 3);
  const citations: Citation[] = [];
  const lines: AnswerLine[] = [];
  picked.forEach((item) => {
    const n = citations.length + 1;
    citations.push({ n, sourceId: item.source.id, title: item.source.title, version: item.source.version, paragraphIndex: item.index, paragraphId: item.paragraph.id, confidence: item.coverage >= 0.6 ? "high" : "medium" });
    const sentences = item.paragraph.text.split(/(?<=[.!?])\s+/);
    const rated = sentences.map((text, position) => ({ text, position, hits: stems(text).filter((word) => queryWords.includes(word) || synonymStems(word).some((syn) => queryWords.includes(syn))).length }));
    const best = rated.filter((entry) => entry.hits > 0).sort((a, b) => b.hits - a.hits).slice(0, 2).sort((a, b) => a.position - b.position);
    (best.length ? best : rated.slice(0, 1)).forEach((entry) => lines.push({ text: entry.text, cite: n }));
  });
  return { kind: "answer", lines, citations };
}
