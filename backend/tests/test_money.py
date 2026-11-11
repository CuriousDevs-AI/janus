from janus_api.core.money import inr_exact


def test_exact_amounts_use_indian_grouping() -> None:
    assert inr_exact(18500000) == "₹1,85,000"
    assert inr_exact(123456789012) == "₹1,23,45,67,890.12"
    assert inr_exact(100000) == "₹1,000"
    assert inr_exact(50) == "₹0.50"
    assert inr_exact(0) == "₹0"
    assert inr_exact(-250075) == "−₹2,500.75"
