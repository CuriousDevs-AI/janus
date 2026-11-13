"""Prints each test's result from the last run, with the first lines of each failure."""
import json
import re
from pathlib import Path

results = json.loads((Path(__file__).parent / ".state" / "results.json").read_text())
clean = lambda text: re.sub(r"\x1b\[[0-9;]*m", "", text)
counts = {"passed": 0, "failed": 0}


def walk(suite, file=""):
    file = suite.get("file", file)
    for spec in suite.get("specs", []):
        for test in spec["tests"]:
            result = test["results"][-1]
            ok = result["status"] == "passed"
            counts["passed" if ok else "failed"] += 1
            print(("ok  " if ok else "FAIL"), file[:2], spec["title"][:95], f"({result['duration'] // 1000}s)")
            if not ok:
                message = clean((result.get("error") or {}).get("message", ""))
                print("      " + " | ".join(line.strip() for line in message.split("\n") if line.strip())[:520])
    for child in suite.get("suites", []):
        walk(child, file)


for top in results["suites"]:
    walk(top)
print(counts)
