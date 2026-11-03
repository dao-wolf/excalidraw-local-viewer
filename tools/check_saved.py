"""Gate for "saving works": find files written since a time and validate each one.

Usage:
  python3 tools/check_saved.py --since 2026-11-03T14:50 --name-contains my-board \
      [--expect-elements N] [--require excalidraw,png,svg] [--wait SECONDS] [folder ...]

A save or an export only counts as working when this script exits 0. It looks for new .excalidraw, .png and
.svg files and checks each:
  .excalidraw  parses as JSON, "type" is "excalidraw", and it has at least N elements (default 1)
  .png         starts with the 8-byte PNG signature and is not empty
  .svg         has an <svg root element
With --require, every listed kind needs a valid file, so a working save cannot hide a failed export.
Naive times are read as local time. With no folder it searches the home folder (skipping Library, hidden
folders, node_modules and .git), and then it insists on --name-contains: a home-wide search on a time alone
once passed on three unrelated PNGs. A browser download can appear several seconds after the click; --wait polls.
Exit 0: every required kind (or, with none given, at least one file) is valid. Exit 1: not. Exit 2: bad use.
"""
import argparse
import json
import os
import re
import sys
import time
from datetime import datetime

PNG_SIG = b"\x89PNG\r\n\x1a\n"
SKIP = {"Library", "node_modules", ".git"}


def walk(folders):
    for top in folders:
        for root, dirs, files in os.walk(top):
            dirs[:] = [d for d in dirs if d not in SKIP and not d.startswith(".")]
            for name in files:
                if name.lower().endswith((".excalidraw", ".png", ".svg")):
                    yield os.path.join(root, name)


def check(path, expect=1):
    """Return (ok, reason) for one file."""
    low = path.lower()
    if os.path.getsize(path) == 0:
        return False, "empty file"
    if low.endswith(".excalidraw"):
        try:
            with open(path, encoding="utf-8") as fh:
                data = json.load(fh)
        except (ValueError, OSError) as exc:
            return False, f"not JSON: {exc}"
        if data.get("type") != "excalidraw":
            return False, f'type is {data.get("type")!r}, not "excalidraw"'
        n = len(data.get("elements", []))
        return n >= expect, f"{n} elements" + ("" if n >= expect else f" (expected at least {expect})")
    if low.endswith(".png"):
        with open(path, "rb") as fh:
            ok = fh.read(8) == PNG_SIG
        return ok, "PNG signature ok" if ok else "no PNG signature"
    with open(path, "rb") as fh:
        head = fh.read(4096).decode("utf-8", "replace")
    ok = re.search(r"<svg[\s>]", head) is not None
    return ok, "<svg root found" if ok else "no <svg root"


def scan(folders, since, name_contains="", expect=1):
    """Return (lines, found, valid, kinds) for files changed at or after `since` (a timestamp)."""
    lines, found, valid, kinds = [], 0, 0, set()
    for path in sorted(walk(folders)):
        if name_contains and name_contains not in os.path.basename(path):
            continue
        if os.path.getmtime(path) < since:
            continue
        found += 1
        ok, why = check(path, expect)
        valid += ok
        if ok:
            kinds.add(os.path.splitext(path)[1].lstrip(".").lower())
        lines.append(("PASS " if ok else "FAIL ") + path + " : " + why)
    return lines, found, valid, kinds


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--since", required=True, help="ISO time, for example 2026-11-03T14:50")
    ap.add_argument("--expect-elements", type=int, default=1)
    ap.add_argument("--name-contains", default="")
    ap.add_argument("--wait", type=int, default=0, help="poll up to this many seconds")
    ap.add_argument("--require", default="", help="comma list of kinds that each need a valid file")
    ap.add_argument("folders", nargs="*")
    a = ap.parse_args(argv)
    since = datetime.fromisoformat(a.since).timestamp()
    if not a.folders and not a.name_contains:
        print("refusing a home-wide search without --name-contains or a folder: it would pass on unrelated files")
        return 2
    folders = [os.path.expanduser(f) for f in a.folders] or [os.path.expanduser("~")]
    required = {k.strip().lower() for k in a.require.split(",") if k.strip()}
    deadline = time.time() + a.wait
    while True:
        lines, found, valid, kinds = scan(folders, since, a.name_contains, a.expect_elements)
        missing = required - kinds
        passed = valid > 0 and not missing
        if passed or time.time() >= deadline:
            break
        time.sleep(1)
    print("\n".join(lines))
    if required:
        print("required kinds: " + ", ".join(sorted(required)) + (f"; MISSING a valid file for: {', '.join(sorted(missing))}" if missing else "; all present"))
    print(f"{found} new file(s), {valid} valid, since {a.since}" + (f" (waited up to {a.wait}s)" if a.wait else ""))
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
