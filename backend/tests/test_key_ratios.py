"""Customer and sales ratios: churn, repeat buyers, dependence on one customer, win rate."""

from datetime import date
from decimal import Decimal

from janus_api.crm.overview import Closed
from janus_api.portfolio.customers import figures_for
from janus_api.portfolio.summary import sales_ratios

BEFORE = (date(2024, 12, 1), date(2025, 11, 30))
RECENT = (date(2025, 12, 1), date(2026, 11, 30))


def test_customer_figures() -> None:
    months = {
        # Bought before and again lately, in two months: kept, and a repeat buyer.
        "Gupta Traders": {
            date(2025, 3, 1): 100_00,
            date(2026, 1, 1): 600_00,
            date(2026, 5, 1): 200_00,
        },
        # Same customer spelled another way: matched, not counted twice.
        "M/s Gupta Traders Pvt Ltd": {date(2026, 6, 1): 200_00},
        # Bought before only: lost.
        "Rao Stores": {date(2025, 4, 1): 50_00},
        "Iyer & Sons": {date(2025, 5, 1): 50_00},
        # New lately.
        "Khan Foods": {date(2026, 2, 1): 100_00},
        # The person's own company is not a customer.
        "Our Group Co": {date(2026, 2, 1): 9_999_00},
    }
    figures = figures_for(months, BEFORE, RECENT, frozenset({"our group co"}))
    assert figures is not None
    assert (figures.customers, figures.repeatCustomers, figures.repeatRate) == (2, 1, 50)
    assert figures.sales == "1100.00" and figures.revenuePerCustomer == "550.00"
    assert figures.topShare == 91 and figures.top5Share == 100
    assert (figures.before, figures.kept, figures.new) == (3, 1, 1)
    assert (figures.retentionRate, figures.churnRate) == (33, 67)
    assert figures_for({}, BEFORE, RECENT) is None


def test_sales_ratios() -> None:
    ratios = sales_ratios(Closed(won=3, lost=1, won_value=Decimal("90000"), cycle_days=12.4))
    assert (ratios.winRate, ratios.avgDealSize, ratios.cycleDays) == (75, "30000.00", 12)
    empty = sales_ratios(Closed(won=0, lost=0, won_value=Decimal(0), cycle_days=None))
    assert (empty.winRate, empty.avgDealSize, empty.cycleDays) == (None, None, None)
