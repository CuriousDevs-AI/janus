"""The plans Janus offers. Prices are monthly, in paise, before GST; None is priced by agreement.

Limits are what a plan includes. They are shown against what the account uses; Janus does not yet
stop anyone at a limit.
"""

from dataclasses import dataclass

GST_RATE = 18


@dataclass(frozen=True)
class Plan:
    id: str
    name: str
    tagline: str
    price_paise: int | None
    companies: int | None
    logins: int | None
    features: tuple[str, ...]


PLANS: tuple[Plan, ...] = (
    Plan(
        "free",
        "Free",
        "One company, to try Janus.",
        0,
        1,
        3,
        (
            "1 company",
            "Up to 3 people",
            "CRM & Sales, HR & People and Team Chat",
            "Janus rules: answers from your own figures",
            "Help by email",
        ),
    ),
    Plan(
        "startup",
        "Startup",
        "A founder with a few companies.",
        1_99_900,
        3,
        15,
        (
            "Up to 3 companies on one Portfolio",
            "Up to 15 people across them",
            "Every workspace: Finance, Operations, Projects, Support and IT",
            "Portfolio overview, analytics and group finance",
            "Janus Intelligence with your own AI key",
            "Weekly Portfolio email",
        ),
    ),
    Plan(
        "growth",
        "Growth",
        "A group that runs several businesses.",
        5_99_900,
        10,
        75,
        (
            "Up to 10 companies",
            "Up to 75 people across them",
            "Everything in Startup",
            "Compliance calendar, filing register and document renewals",
            "Red alerts by email and browser",
            "Board pack and six Portfolio roles",
            "Priority help",
        ),
    ),
    Plan(
        "enterprise",
        "Enterprise",
        "Large groups, with their own terms.",
        None,
        None,
        None,
        (
            "Companies and people as agreed",
            "Everything in Growth",
            "Help moving your records from Tally or Zoho Books",
            "A named success manager",
            "Invoices by bank transfer, on agreed terms",
        ),
    ),
)
BY_ID = {plan.id: plan for plan in PLANS}
ORDER = [plan.id for plan in PLANS]
