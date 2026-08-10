"""Remove legacy muscle-group prefixes from exercise names in project CSVs."""

from __future__ import annotations

import argparse
import csv
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


def normalize_exercise_name(name: str) -> str:
    """Return the canonical name while retaining exercise-specific qualifiers."""
    if name.startswith("Shoulders - Press"):
        return "Overhead Press" + name[len("Shoulders - Press") :]

    prefix, separator, exercise = name.partition(" - ")
    if separator and prefix in MUSCLE_GROUP_PREFIXES:
        return exercise
    return name


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
    collisions = sorted(
        name
        for name, count in Counter(map(normalize_exercise_name, set(old_names))).items()
        if count > 1
    )
    if collisions:
        raise ValueError(f"{path}: canonical-name collisions: {collisions!r}")

    for row, new_name in zip(rows[1:], new_names, strict=True):
        row[exercise_index] = new_name

    if write:
        encoding = "utf-8-sig" if has_bom else "utf-8"
        with path.open("w", encoding=encoding, newline="") as destination:
            csv.writer(destination, lineterminator="\n").writerows(rows)

    return {
        "file": path.name,
        "rows": len(old_names),
        "distinct_names": len(set(new_names)),
        "renamed_rows": sum(old != new for old, new in zip(old_names, new_names, strict=True)),
        "overhead_press_names": len({name for name in new_names if name.startswith("Overhead Press")}),
        "written": write,
    }


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
