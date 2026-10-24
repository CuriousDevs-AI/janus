import { activeCompanyId } from "@/lib/company";
import type { CompanySpec } from "@/lib/companies/spec";
import { acmeSpec } from "@/lib/companies/acme";
import { nimbusSpec } from "@/lib/companies/nimbus";
import { greenleafSpec } from "@/lib/companies/greenleaf";

export const specs: Record<string, CompanySpec> = { acme: acmeSpec, nimbus: nimbusSpec, greenleaf: greenleafSpec };
/** The company on show, read once when the page loads. Switching company reloads the page. */
export const activeSpec: CompanySpec = specs[activeCompanyId()] ?? acmeSpec;
export const isFirstCompany = activeSpec.id === "acme";
