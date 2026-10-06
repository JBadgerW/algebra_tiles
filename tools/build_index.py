#!/usr/bin/env python3
"""Rebuild banks/index.json from the question banks in banks/.

The menu reads index.json because a static host (like GitHub Pages) can't
list a folder. Run this after adding, removing, or renaming a bank:

    python3 tools/build_index.py

Menu order: banks with an "order" number come first (lowest first),
then the rest alphabetically by title.

Banks with "hidden": true are left off the menu but still play from a
direct link (#/play/<id>). Remove the line and rerun this to list them.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BANKS = ROOT / "banks"


def entry_for(path, data):
    pairs = data["pairs"]
    if not isinstance(pairs, list) or not pairs:
        raise ValueError('"pairs" must be a non-empty list')
    for i, pair in enumerate(pairs, 1):
        if not isinstance(pair, dict) or "q" not in pair or "a" not in pair:
            raise ValueError(f'pair {i} needs both a "q" and an "a"')
    size = data.get("roundSize", 6)
    if not isinstance(size, int) or size < 2:
        raise ValueError('"roundSize" must be a whole number, 2 or more')

    answers = [" ".join(str(p["a"]).split()) for p in pairs]
    repeats = sorted({a for a in answers if answers.count(a) > 1})
    if repeats:
        print(f"  note: {path.name} repeats answers {repeats}; either copy counts as right")

    entry = {
        "id": path.stem,
        "title": data.get("title", path.stem),
        "count": len(pairs),
    }
    if data.get("description"):
        entry["description"] = data["description"]
    if "order" in data:
        entry["order"] = data["order"]
    return entry


def build():
    entries = []
    hidden = []
    errors = []
    for path in sorted(BANKS.glob("*.json")):
        if path.name == "index.json":
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            entry = entry_for(path, data)  # checks hidden banks too
            if data.get("hidden"):
                hidden.append(path.stem)
            else:
                entries.append(entry)
        except (KeyError, ValueError, TypeError, json.JSONDecodeError) as exc:
            errors.append(f"  {path.name}: {exc}")

    entries.sort(key=lambda e: (e.get("order", float("inf")), e["title"].lower()))
    (BANKS / "index.json").write_text(
        json.dumps(entries, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"Wrote banks/index.json with {len(entries)} bank(s).")
    if hidden:
        print(f"Hidden from the menu: {', '.join(hidden)}")
    if errors:
        print("Skipped files with problems:\n" + "\n".join(errors), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(build())
