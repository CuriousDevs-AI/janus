import type { Row, EditForm } from "./types";

export function phoneParts(phone: string | null) {
  if (!phone) return { countryCode: "—", mobile: "—" };
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return { countryCode: "+91", mobile: `${digits.slice(0, 5)} ${digits.slice(5)}` };
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    const mobile = digits.slice(2);
    return { countryCode: "+91", mobile: `${mobile.slice(0, 5)} ${mobile.slice(5)}` };
  }
  if (phone.trim().startsWith("+") && digits.length > 10) {
    const mobile = digits.slice(-10);
    return {
      countryCode: `+${digits.slice(0, -10)}`,
      mobile: `${mobile.slice(0, 5)} ${mobile.slice(5)}`,
    };
  }
  return { countryCode: "—", mobile: phone.trim() };
}

export function blankEditForm(row: Row): EditForm {
  return {
    name: row.lead.contactName,
    phone: row.lead.phone || "",
    email: row.lead.email || "",
    company: row.lead.company,
    requirement: row.lead.requirement,
    stage: row.lead.stage,
    ownerId: row.lead.ownerId ?? "",
    lostCategory: row.lead.lostCategory ?? (row.lead.stage === "lost" ? "other" : ""),
    lostReason: row.lead.lostReason ?? "",
  };
}

export function leadBody(form: EditForm) {
  const { ownerId: _owner, lostCategory, lostReason, ...rest } = form;
  void _owner;
  return {
    ...rest,
    phone: form.phone.trim() || null,
    email: form.email.trim() || null,
    lostCategory: form.stage === "lost" ? lostCategory || null : null,
    lostReason: form.stage === "lost" ? lostReason : "",
  };
}
