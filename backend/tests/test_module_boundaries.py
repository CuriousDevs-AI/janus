"""Modules talk to each other through their public functions, never each other's tables.

A module listed in BOUNDED may import another module only through that module's `overview` or
`service` (`core`, `audit` and `auth` are shared by every module). Importing another module's
`models`, or anything else inside it, is a failure. Add a module here once it has been moved to that
shape, so it stays there.

Not listed yet: business, calls, crm, sources and whatsapp, which still read each other's CRM and
source tables. `worker` and `main.py` are not modules: they wire every module's jobs and routers
together, so they import them directly.
"""

import ast
from pathlib import Path

PACKAGE = Path(__file__).resolve().parents[1] / "janus_api"
BOUNDED = (
    "ai",
    "billing",
    "finance",
    "hr",
    "it",
    "operations",
    "org",
    "portfolio",
    "projects",
    "push",
    "rules",
    "state",
    "support",
    "team",
    "timeline",
    "vault",
)
SHARED = {"core", "audit", "auth"}
ALLOWED = {"overview", "service"}


def _imports(path: Path) -> list[str]:
    tree = ast.parse(path.read_text(), str(path))
    found = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            found.append(node.module)
            found.extend(f"{node.module}.{alias.name}" for alias in node.names)
        elif isinstance(node, ast.Import):
            found.extend(alias.name for alias in node.names)
    return found


def test_bounded_modules_use_only_public_functions_of_others() -> None:
    wrong = []
    for module in BOUNDED:
        for path in (PACKAGE / module).rglob("*.py"):
            for name in _imports(path):
                parts = name.split(".")
                if parts[0] != "janus_api" or len(parts) < 3:
                    continue
                other, part = parts[1], parts[2]
                if other in (module, *SHARED):
                    continue
                if part not in ALLOWED:
                    wrong.append(f"{path.relative_to(PACKAGE)} imports {name}")
    assert not wrong, "\n".join(sorted(set(wrong)))
