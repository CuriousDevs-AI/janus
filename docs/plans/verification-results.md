# Verification results: pending-work plan, section 1

Run in the preview, mostly as the owner, with Arjun Mehta for second-approver steps. PASS, PARTIAL, FAIL or NOT BUILT is recorded only for checks actually run.

| # | Check | Result | Notes |
|---|---|---|---|
| 1.1 | Multi-line bill matched to a PO and goods received | FAIL (test data) | PO-2026-0102 belongs to "Multi Vendor Co", which is not in the vendor master, so no bill can be recorded against it. |
| 1.2 | RMA: damaged return does not restock | PASS | RMA-2026-0102 was inspected as damaged. The stock log has no restock movement for it. |
| 1.3 | Pick, pack and ship: shipping before packing is refused | PASS (UI) | The dispatch row offers only the next stage, so shipping early is not possible from the UI. The store guard ("Mark the goods packed before shipped") was checked by reading the code, not by triggering it. |
| 1.4 | Milestone acceptance creates an invoice; dispute stops billing | PARTIAL | Acceptance passes: Arjun Mehta accepted "First festive dispatch", which created INV-2026-0107 for ₹31,860 (₹27,000 plus 18% GST). The completer cannot accept, as intended. Dispute is NOT BUILT: milestones have no dispute state, so billing cannot be stopped. |
| 1.5 | Change request approved as a new plan version | PARTIAL | Approval applies: Arjun requested "spare pallet rack" (+₹1,000, +1 day) and the Owner approved it. The project's budget and end date change and the change is recorded. The old budget and end date are overwritten, so no earlier version is kept. |
| 1.6 | Monitor check opens a critical incident; recovery closes it | PARTIAL | Marking a monitor down opens a critical incident (INC-1006). Marking it up does NOT close the incident, so it must be resolved by hand. INC-1006 was then resolved as a test. |
| 1.7 | Access request resolved grants access | PASS (existing record) | IT-1003 (Meera Singh, edit access to Biometric attendance) is resolved, and the Access view shows the grant "Granted by Pankaj Neema". I did not re-run the request. |
| 1.8 | Escalated ticket appears in the Work inbox as urgent | PASS | "#1031 is escalated" is listed under the Urgent group (2 items). |

## Gaps this run found

- **Milestone dispute:** not built. Plan §8.3Z step 4 needs a dispute state that stops billing for one milestone.
- **Change versions:** change approvals overwrite the project budget and end date. Plan §8.3Y step 4 needs the old version kept.
- **Monitor recovery:** a recovery check does not close the open incident. Plan §8.5 needs an auto-close, or an explicit decision to keep it manual.

## Test data left in the preview

- Dispatch DN-2026-0104 (Ship check Co, one Pedestal fan, picked).
- RMA-2026-0102 (inspected as damaged).
- REQ-2026-0102 and REQ-2026-0103 (pending requisitions).
- Change request for Jaipur dock layout (approved, +₹1,000, +1 day).
- Milestone "First festive dispatch" accepted; invoice INV-2026-0107.
- INC-1006 (resolved).
