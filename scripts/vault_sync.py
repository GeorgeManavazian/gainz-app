#!/usr/bin/env python3
"""Drain unsynced meals/lifts from Supabase into the Gainz vault's Daily notes."""
import json
import re
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

CONFIG = json.load(open(Path.home() / ".config" / "gainz" / "supabase_sync.json"))
VAULT = Path.home() / "Documents" / "Gainz"
DAILY = VAULT / "Daily"
TEMPLATE = VAULT / "Templates" / "Daily Template.md"

HEADERS = {
    "apikey": CONFIG["service_role_key"],
    "Authorization": f"Bearer {CONFIG['service_role_key']}",
    "Content-Type": "application/json",
}


def rest(method, path, body=None):
    url = CONFIG["url"] + "/rest/v1/" + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=HEADERS)
    with urllib.request.urlopen(req) as resp:
        raw = resp.read()
        return json.loads(raw) if raw else None


def local_day(iso_ts):
    return datetime.fromisoformat(iso_ts.replace("Z", "+00:00")).astimezone().strftime("%Y-%m-%d")


def ensure_note(day):
    DAILY.mkdir(parents=True, exist_ok=True)
    p = DAILY / f"{day}.md"
    if not p.exists():
        p.write_text(TEMPLATE.read_text().replace("{{date:YYYY-MM-DD}}", day))
    return p


def append_table_row(text, section, row):
    """Insert row at the end of the markdown table under `## <section>`."""
    lines = text.split("\n")
    out, in_section, in_table, inserted = [], False, False, False
    for line in lines:
        if line.startswith("## "):
            if in_section and in_table and not inserted:
                out.append(row); inserted = True
            in_section = line.strip() == f"## {section}"
            in_table = False
        elif in_section and line.startswith("|"):
            in_table = True
        elif in_section and in_table and not line.startswith("|") and not inserted:
            out.append(row); inserted = True
            in_table = False
        out.append(line)
    if in_section and in_table and not inserted:
        out.append(row)
    text = "\n".join(out)
    # drop the template's empty placeholder row if a real row now exists
    return re.sub(r"^\|( +\|)+\n", "", text, flags=re.MULTILINE)


def set_frontmatter(text, key, value):
    if re.search(rf"^{key}:", text, flags=re.MULTILINE):
        return re.sub(rf"^{key}:.*$", f"{key}: {value}", text, count=1, flags=re.MULTILINE)
    return re.sub(r"^---\n", f"---\n{key}: {value}\n", text, count=1, flags=re.MULTILINE)


def recompute_totals(text):
    total = {"cal": 0.0, "p": 0.0, "c": 0.0, "f": 0.0}
    in_meals = in_table = False
    for line in text.split("\n"):
        if line.startswith("## "):
            in_meals = line.strip() == "## Meals"; in_table = False
        elif in_meals and line.startswith("|"):
            cells = [c.strip() for c in line.strip("|").split("|")]
            if len(cells) == 6 and cells[2] not in ("Calories", "----------", ""):
                try:
                    total["cal"] += float(cells[2]); total["p"] += float(cells[3])
                    total["c"] += float(cells[4]); total["f"] += float(cells[5])
                except ValueError:
                    continue
    totals_line = (f"**Totals:** {round(total['cal'])} cal · {round(total['p'])}g protein · "
                   f"{round(total['c'])}g carbs · {round(total['f'])}g fat")
    text = re.sub(r"^\*\*Totals:\*\*.*$", totals_line, text, count=1, flags=re.MULTILINE)
    for key, val in (("calories", round(total["cal"])), ("protein", round(total["p"])),
                     ("carbs", round(total["c"])), ("fat", round(total["f"]))):
        text = set_frontmatter(text, key, val)
    return text


def main():
    meals = rest("GET", "meals?synced_to_vault=eq.false&order=logged_at") or []
    lifts = rest("GET", "lifts?synced_to_vault=eq.false&order=logged_at") or []
    touched = set()

    for m in meals:
        day = local_day(m["logged_at"]); note = ensure_note(day)
        row = (f"| {m['food_name']} | {m['grams']} | {m['calories']} | "
               f"{m['protein_g']} | {m['carbs_g']} | {m['fat_g']} |")
        note.write_text(append_table_row(note.read_text(), "Meals", row))
        touched.add(day)
        rest("PATCH", f"meals?id=eq.{m['id']}", {"synced_to_vault": True})

    for l in lifts:
        day = local_day(l["logged_at"]); note = ensure_note(day)
        notes_cell = (l.get("notes") or "").replace("|", "/")
        row = f"| {l['exercise']} | {l['sets']}x{l['reps']} | {l['weight']} lbs | {notes_cell} |"
        note.write_text(append_table_row(note.read_text(), "Lifts", row))
        touched.add(day)
        rest("PATCH", f"lifts?id=eq.{l['id']}", {"synced_to_vault": True})

    for day in touched:
        p = DAILY / f"{day}.md"
        p.write_text(recompute_totals(p.read_text()))

    print(f"synced {len(meals)} meals, {len(lifts)} lifts across {len(touched)} day(s)")


if __name__ == "__main__":
    main()
