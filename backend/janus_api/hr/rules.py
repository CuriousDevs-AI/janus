"""What someone who is not HR may do with a personal HR record.

Each rule names who may create the record and with which values, which fields the person it is
about (the asker) may change and while it is in which state, and what their manager (the decider:
the person they report to, or a named approver) may change. Anything not named is kept as the
server has it, so a request cannot change a field nobody allowed. HR (hr:manage) is not bound by
these rules. Leave and attendance have their own checks in the service.
"""

from dataclasses import dataclass, field

ALL = ("*",)


@dataclass(frozen=True)
class Rule:
    # The asker may create it with these values, or not at all when None.
    asker_creates: dict[str, tuple[str, ...]] | None = None
    # Fields the asker may change later ("*" for all), while `status` is one of asker_while.
    asker_fields: tuple[str, ...] = ()
    asker_while: tuple[str, ...] | None = None
    # The asker may withdraw (delete) it while its status is one of these.
    asker_withdraws: tuple[str, ...] = ()
    # Fields the decider may change, and the statuses they may set.
    decider_fields: tuple[str, ...] = ()
    decider_statuses: tuple[str, ...] = ()
    # The decider may create it for someone who reports to them, with these values.
    decider_creates: dict[str, tuple[str, ...]] | None = None
    # A map entry's fields sit under "value"; the rule's fields refer to those.
    in_value: bool = False
    # Fields a manager reading a report's record must not see (current pay), as dotted paths.
    hidden_from_managers: tuple[str, ...] = field(default=())


RULES: dict[str, Rule] = {
    # A claim goes to the manager first, or straight to HR when the person has no manager.
    "expense": Rule(
        asker_creates={"status": ("manager_review", "hr_review", "submitted")},
        asker_fields=ALL,
        asker_while=("submitted", "manager_review", "hr_review"),
        decider_fields=("status", "approverName", "approvedById"),
        decider_statuses=("manager_review", "hr_review", "approved", "rejected"),
    ),
    "expense_evidence": Rule(asker_creates={}, asker_fields=ALL, in_value=True),
    "regularisation": Rule(
        asker_creates={"status": ("pending",)},
        asker_fields=ALL,
        asker_while=("pending",),
        asker_withdraws=("pending",),
        decider_fields=("status", "decidedBy", "decidedAt", "decisionReason"),
        decider_statuses=("approved", "rejected"),
    ),
    "letter": Rule(asker_creates={"status": ("pending",)}),
    "policy_question": Rule(asker_creates={"status": ("open",)}),
    "review": Rule(
        asker_fields=("progress", "goal"),
        decider_fields=("rating", "feedback", "status", "progress", "goal", "dueAt", "cycle"),
        decider_statuses=("draft", "in_review", "completed"),
        decider_creates={"status": ("draft", "in_review")},
    ),
    "document": Rule(asker_fields=("signatureStatus", "acknowledgedAt")),
    "document_extra": Rule(asker_fields=("signers", "events"), in_value=True),
    # Onboarding tasks: who may tick a task depends on whose task it is; see the service.
    "onboarding": Rule(asker_fields=("status",), decider_fields=("status",)),
    "acknowledgement": Rule(asker_creates={}, in_value=True),
    "leave_adjustment": Rule(),
    "exit": Rule(),
    "career": Rule(
        decider_creates={"status": ("pending_hr", "pending_owner")},
        decider_fields=("status",),
        decider_statuses=("withdrawn",),
        hidden_from_managers=("before.salaryMonthly",),
    ),
}
