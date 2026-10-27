# Verification results: pending-work plan, section 1

Run in the preview, mostly as the owner, with Arjun Mehta for second-approver steps. PASS, PARTIAL, FAIL or NOT BUILT is recorded only for checks actually run.

| # | Check | Result | Notes |
|---|---|---|---|
| 1.1 | Multi-line bill matched to a PO and goods received | FAIL (test data) | PO-2026-0102 belongs to "Multi Vendor Co", which is not in the vendor master, so no bill can be recorded against it. |
| 1.2 | RMA: damaged return does not restock | PASS | RMA-2026-0102 was inspected as damaged. The stock log has no restock movement for it. |
| 1.3 | Pick, pack and ship: shipping before packing is refused | PASS (UI) | The dispatch row offers only the next stage, so shipping early is not possible from the UI. The store guard ("Mark the goods packed before shipped") was checked by reading the code, not by triggering it. |
| 1.4 | Milestone acceptance creates an invoice; dispute stops billing | PASS (rebuilt) | Acceptance passes: Arjun Mehta accepted "First festive dispatch", which created INV-2026-0107 for ₹31,860 (₹27,000 plus 18% GST). The completer cannot accept, as intended. Dispute built since: a disputed milestone cannot be accepted or billed until resolved, and resolving it clears the block. |
| 1.5 | Change request approved as a new plan version | PASS (rebuilt) | Approval applies: Arjun requested "spare pallet rack" (+₹1,000, +1 day) and the Owner approved it. The project's budget and end date change and the change is recorded. Each approval now adds a plan version, and the earlier plan is kept as v1. |
| 1.6 | Monitor check opens a critical incident; recovery closes it | PASS (rebuilt) | Marking a monitor down opens a critical incident (INC-1006). Marking it up now closes the incident automatically (INC-1007: "Back up at check; closed automatically"). Earlier, INC-1006 had to be resolved by hand. |
| 1.7 | Access request resolved grants access | PASS (existing record) | IT-1003 (Meera Singh, edit access to Biometric attendance) is resolved, and the Access view shows the grant "Granted by Pankaj Neema". I did not re-run the request. |
| 1.8 | Escalated ticket appears in the Work inbox as urgent | PASS | "#1031 is escalated" is listed under the Urgent group (2 items). |

## Gaps closed after this run

- **Milestone dispute:** built. A disputed milestone cannot be accepted or billed until resolved. Checked: the dispute blocked acceptance, and resolving it cleared the block.
- **Change versions:** built. Each approved change adds a version, and the first approval keeps the plan as it stood before it as v1. Checked: Jaipur dock layout went from v1 ₹95,000 to v2 ₹95,500. Limitation: for projects approved before this build, v1 is the plan before the first new approval, not the original plan.
- **Monitor recovery:** built. A monitor back up closes its open incident. Checked: INC-1007 closed with "Back up at check; closed automatically".

## Test data left in the preview

- Dispatch DN-2026-0104 (Ship check Co, one Pedestal fan, picked).
- RMA-2026-0102 (inspected as damaged).
- REQ-2026-0102 and REQ-2026-0103 (pending requisitions).
- Change request for Jaipur dock layout (approved, +₹1,000, +1 day).
- Milestone "First festive dispatch" accepted; invoice INV-2026-0107.
- INC-1006 and INC-1007 (both resolved).
- Change request for Jaipur dock layout (approved, +₹500, +2 days), creating plan versions v1 and v2.
