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

# SAC for software offered as a service, on Janus's own tax invoices (to be confirmed with the CA).
SAC = "997331"

# GST state codes, for the place of supply.
STATES = {
    "01": "Jammu and Kashmir",
    "02": "Himachal Pradesh",
    "03": "Punjab",
    "04": "Chandigarh",
    "05": "Uttarakhand",
    "06": "Haryana",
    "07": "Delhi",
    "08": "Rajasthan",
    "09": "Uttar Pradesh",
    "10": "Bihar",
    "11": "Sikkim",
    "12": "Arunachal Pradesh",
    "13": "Nagaland",
    "14": "Manipur",
    "15": "Mizoram",
    "16": "Tripura",
    "17": "Meghalaya",
    "18": "Assam",
    "19": "West Bengal",
    "20": "Jharkhand",
    "21": "Odisha",
    "22": "Chhattisgarh",
    "23": "Madhya Pradesh",
    "24": "Gujarat",
    "26": "Dadra and Nagar Haveli and Daman and Diu",
    "27": "Maharashtra",
    "29": "Karnataka",
    "30": "Goa",
    "31": "Lakshadweep",
    "32": "Kerala",
    "33": "Tamil Nadu",
    "34": "Puducherry",
    "35": "Andaman and Nicobar Islands",
    "36": "Telangana",
    "37": "Andhra Pradesh",
    "38": "Ladakh",
}
