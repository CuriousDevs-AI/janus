import { redirect } from "next/navigation";

export default function Page() {
  redirect("/lead-sources?workspace=crm-sales");
}
