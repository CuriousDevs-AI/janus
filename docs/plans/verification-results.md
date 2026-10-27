# Verification results: pending-work plan, section 1

Run in the preview by the owner account unless noted. PASS or FAIL is recorded only for checks actually run. Not run means not checked in this pass.

| # | Check | Result | Notes |
|---|---|---|---|
| 1.1 | Multi-line bill matched to a PO and goods received | FAIL (test data) | PO-2026-0102 belongs to "Multi Vendor Co", which is not in the vendor master, so no bill can be recorded against it. The vendor master needs that vendor, or the PO needs a master vendor. |
| 1.2 | RMA: damaged return does not restock | Not run | |
| 1.3 | Pick, pack and ship: shipping before packing is refused | Not run | |
| 1.4 | Milestone acceptance creates an invoice; dispute stops billing | Not run | |
| 1.5 | Change request approved as a new plan version | Not run | |
| 1.6 | Monitor check opens a critical incident; recovery closes it | Not run | |
| 1.7 | Access request resolved grants access | Not run | |
| 1.8 | Escalated ticket appears in the Work inbox as urgent | Not run | |

Also verified in this pass (see the plan's section 2 work):
- Requisitions as a second approver, self-approval refusal, budget refusal, and negative-stock refusal (Operations, as Arjun Mehta and the owner).
- P&L period filter: a window with no records shows zeros, and the figures change with the dates.
