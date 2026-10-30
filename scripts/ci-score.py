#!/usr/bin/env python3
"""Score a cart through the EvalCart score API (CI helper).

Usage:
    python3 ci-score.py <cart.json> <task_id>

cart.json holds a cart-format-v1 cart: lines plus an agent card with
model, tools, store_snapshot, seed, time_seconds, and
token_cost_estimate. A file shaped {"cart": {...}} is also accepted;
the inner cart is used.

The script POSTs to https://www.evalcart.com/api/bakeoff/score and
prints completeness (covered/expected), cart total against budget, and
hard fails, then exits:

    0  clean score: valid profile, no hard fails
    1  hard fail: the profile carries one or more hard fails
    2  invalid submission, HTTP error, or transport error (including
       the 429 rate limit; the score API shares a 60/hour per-IP limit)

The score endpoint stores nothing and ranks nothing. It exists for
iteration. For a ranked run, use the submit endpoint instead, with a
transcript.
"""

import json
import sys
import urllib.error
import urllib.request

API_URL = "https://www.evalcart.com/api/bakeoff/score"


def main(argv):
    if len(argv) != 3:
        print("usage: ci-score.py <cart.json> <task_id>", file=sys.stderr)
        return 2
    cart_path, task_id = argv[1], argv[2]
    try:
        with open(cart_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        print(f"error: cannot read cart file: {e}", file=sys.stderr)
        return 2
    if isinstance(data, dict) and "lines" not in data and isinstance(data.get("cart"), dict):
        data = data["cart"]
    if not isinstance(data, dict) or not isinstance(data.get("lines"), list):
        print("error: cart file must hold a cart object with a lines list", file=sys.stderr)
        return 2
    body = json.dumps({"task_id": task_id, "cart": data}).encode("utf-8")
    req = urllib.request.Request(API_URL, data=body, method="POST",
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            payload = json.load(resp)
    except urllib.error.HTTPError as e:
        try:
            payload = json.load(e)
        except Exception:
            payload = {}
        profile = payload.get("profile", {})
        errors = profile.get("errors")
        if e.code == 429:
            print("error: rate limited (score API shares a 60/hour per-IP limit); try again later", file=sys.stderr)
        elif errors:
            print(f"invalid submission (HTTP {e.code}):", file=sys.stderr)
            for err in errors:
                print(f"  - {err}", file=sys.stderr)
        else:
            print(f"error: score API returned HTTP {e.code}", file=sys.stderr)
        return 2
    except (urllib.error.URLError, TimeoutError, ValueError) as e:
        print(f"error: score API request failed: {e}", file=sys.stderr)
        return 2
    profile = payload.get("profile", {})
    comp = profile.get("completeness_accuracy", {})
    scc = profile.get("stated_constraint_compliance", {})
    fails = profile.get("hard_fails", [])
    print(f"scorer: {payload.get('scorer_version', 'unknown')}  task: {payload.get('task_id', task_id)}")
    print(f"completeness: {comp.get('covered')}/{comp.get('expected')} (score {comp.get('score')})")
    print(f"total: ${scc.get('cart_total')} / budget ${scc.get('budget')}")
    print(f"hard fails: {', '.join(fails) if fails else 'none'}")
    if not profile.get("valid", False):
        print("invalid profile", file=sys.stderr)
        return 2
    if fails:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
