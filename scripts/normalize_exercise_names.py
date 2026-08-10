"""Remove legacy muscle-group prefixes from exercise names in project CSVs."""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
from collections import Counter
from pathlib import Path


MUSCLE_GROUP_PREFIXES = {
    "Abs",
    "Adductors",
    "Back",
    "Biceps",
    "Calves",
    "Chest",
    "Forearms",
    "Glutes",
    "Hamstrings",
    "Legs",
    "Quads",
    "Shoulders",
    "Triceps",
}

EXERCISE_NAME_REPLACEMENTS = {
    "Back Extentions (Dumbbell)": "Back Extensions (Dumbbell)",
    "Back Extentions (Dumbbell) (45)": "Back Extensions (Dumbbell)",
    "Back Extentions (Dumbbell) (55)": "Back Extensions (Dumbbell)",
    "Fly (Cable) (Bent Over Standing)": "Chest Fly (Cable) (Bent Over Standing) (Horizontal)",
    "Fly (Cable) (Kneeling)": "Chest Fly (Cable) (Kneeling) (Horizontal)",
    "Fly (Cable) (Seated)": "Chest Fly (Cable) (Seated) (Horizontal)",
    "Press (Machine) (Incline) (Plate Loaded) (Close Grip)":
        "Press (Machine) (Incline) (Plate Loaded) (Close Neutral Grip)",
    "Thinker Curls (Cable) (Unilateral)": "Wrist Curls (Cable) (Unilateral)",
    "Curl (Cable) (EZ Bar)": "Curl (Cable) (EZ Bar Attachment)",
    "French Press (Cable) (EZ Bar)": "French Press (Cable) (EZ Bar Attachment)",
    "Overhead Press (Landmine) (Kneeling)": "Overhead Press (Landmine) (Barbell) (Kneeling)",
    "Pullover (Cable) (EZ Bar)": "Pullover (Cable) (EZ Bar Attachment)",
}

COLLAPSE_SURVIVORS = {
    "Back Extensions (Dumbbell)": "Back Extentions (Dumbbell)",
    "Wrist Curls (Cable) (Unilateral)": "Wrist Curls (Cable) (Unilateral)",
}


def normalize_exercise_name(name: str) -> str:
    """Return the canonical name while retaining exercise-specific qualifiers."""
    if name.startswith("Shoulders - Press"):
        canonical_name = "Overhead Press" + name[len("Shoulders - Press") :]
        return EXERCISE_NAME_REPLACEMENTS.get(canonical_name, canonical_name)

    prefix, separator, exercise = name.partition(" - ")
    if separator and prefix in MUSCLE_GROUP_PREFIXES:
        name = exercise
    return EXERCISE_NAME_REPLACEMENTS.get(name, name)


def canonical_json(value: object) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def movement_payload(rows: list[list[str]]) -> dict[str, object]:
    return {
        "exercises": [row[0] for row in rows[1:]],
        "movement_patterns": rows[0][1:],
        "rows": [
            {"exercise": row[0], "coefficients": row[1:]}
            for row in rows[1:]
        ],
    }


def rewrite_csv(path: Path, exercise_column: str, write: bool) -> dict[str, object]:
    source_bytes = path.read_bytes()
    has_bom = source_bytes.startswith(b"\xef\xbb\xbf")
    with path.open("r", encoding="utf-8-sig", newline="") as source:
        rows = list(csv.reader(source))

    if not rows or exercise_column not in rows[0]:
        raise ValueError(f"{path}: missing {exercise_column!r} column")

    exercise_index = rows[0].index(exercise_column)
    old_names = [row[exercise_index] for row in rows[1:]]
    new_names = [normalize_exercise_name(name) for name in old_names]
    for row, new_name in zip(rows[1:], new_names, strict=True):
        row[exercise_index] = new_name

    collapsed_rows = 0
    if path.name == "Movement Pattern Mapping Matrix - Mapping_Matrix.csv":
        selected_rows: dict[str, tuple[str, list[str]]] = {}
        for old_name, row in zip(old_names, rows[1:], strict=True):
            new_name = row[exercise_index]
            selected = selected_rows.get(new_name)
            preferred_source = COLLAPSE_SURVIVORS.get(new_name)
            if selected is None or old_name == preferred_source:
                selected_rows[new_name] = (old_name, row)
        collapsed_rows = len(rows) - 1 - len(selected_rows)
        rows = [rows[0], *(row for _, row in selected_rows.values())]

        duplicates = [
            name for name, count in Counter(row[exercise_index] for row in rows[1:]).items()
            if count > 1
        ]
        if duplicates:
            raise ValueError(f"{path}: unresolved canonical-name collisions: {duplicates!r}")

    buffer = io.StringIO(newline="")
    csv.writer(buffer, lineterminator="\n").writerows(rows)
    output_bytes = buffer.getvalue().encode("utf-8")
    if has_bom:
        output_bytes = b"\xef\xbb\xbf" + output_bytes
    if write:
        path.write_bytes(output_bytes)

    result = {
        "file": path.name,
        "rows": len(rows) - 1,
        "distinct_names": len({row[exercise_index] for row in rows[1:]}),
        "renamed_rows": sum(old != new for old, new in zip(old_names, new_names, strict=True)),
        "collapsed_rows": collapsed_rows,
        "overhead_press_names": len({name for name in new_names if name.startswith("Overhead Press")}),
        "written": write,
    }
    result["source_sha256"] = hashlib.sha256(output_bytes).hexdigest()
    if path.name == "Movement Pattern Mapping Matrix - Mapping_Matrix.csv":
        result["payload_sha256"] = hashlib.sha256(canonical_json(movement_payload(rows))).hexdigest()
        result["nonzero_cell_count"] = sum(
            value != "0" for row in rows[1:] for value in row[1:]
        )
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true", help="rewrite files after validation")
    parser.add_argument(
        "paths",
        nargs="*",
        type=Path,
        default=[
            Path("Movement Pattern Mapping Matrix - Mapping_Matrix.csv"),
            Path("Lorenzo Gym Data - All Gym Data.csv"),
        ],
    )
    args = parser.parse_args()

    for path in args.paths:
        print(rewrite_csv(path, "Exercise", args.write))


if __name__ == "__main__":
    main()
