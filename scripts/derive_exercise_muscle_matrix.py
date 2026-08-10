"""Derive the exercise-by-muscle functional matrix from the two source matrices."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from decimal import Decimal
from pathlib import Path


PATTERN_ALIASES = {
    "Sagittal Plane Humeroulnar Flexion — Radioulnar Supinated (Dynamic)":
        "Sagittal Plane Humeroulnar Flexion (Radioulnar Supinated) (Dynamic)",
    "Sagittal Plane Humeroulnar Flexion — Radioulnar Neutral (Dynamic)":
        "Sagittal Plane Humeroulnar Flexion (Radioulnar Neutral) (Dynamic)",
    "Sagittal Plane Humeroulnar Flexion — Radioulnar Pronated (Dynamic)":
        "Sagittal Plane Humeroulnar Flexion (Radioulnar Pronated) (Dynamic)",
    "Sagittal Plane Humeroulnar Extension — Glenohumeral Neutral (Dynamic)":
        "Sagittal Plane Humeroulnar Extension (Glenohumeral Neutral) (Dynamic)",
    "Sagittal Plane Humeroulnar Extension — Glenohumeral Flexed (Dynamic)":
        "Sagittal Plane Humeroulnar Extension (Glenohumeral Flexed) (Dynamic)",
    "Sagittal Plane Humeroulnar Extension — Glenohumeral Extended (Dynamic)":
        "Sagittal Plane Humeroulnar Extension (Glenohumeral Extended) (Dynamic)",
}


def canonical_json(value: object) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def normalized_decimal(value: Decimal) -> str:
    if value == 0:
        return "0"
    return format(value.normalize(), "f")


def read_csv(path: Path) -> list[list[str]]:
    with path.open(encoding="utf-8-sig", newline="") as source:
        return list(csv.reader(source))


def derive(exercise_pattern_path: Path, pattern_muscle_path: Path) -> tuple[dict[str, object], dict[str, object]]:
    exercise_pattern = read_csv(exercise_pattern_path)
    pattern_muscle = read_csv(pattern_muscle_path)

    if len(exercise_pattern) != 139 or any(len(row) != 41 for row in exercise_pattern):
        raise ValueError("exercise-by-pattern matrix must contain 138 exercises and 40 patterns")
    if len(pattern_muscle) != 41 or any(len(row) != 41 for row in pattern_muscle):
        raise ValueError("pattern-by-muscle matrix must contain 40 patterns and 40 muscles")

    exercise_patterns = exercise_pattern[0][1:]
    muscle_patterns = [PATTERN_ALIASES.get(row[0], row[0]) for row in pattern_muscle[1:]]
    if exercise_patterns != muscle_patterns:
        raise ValueError("movement-pattern axes do not match after resolving the six documented aliases")

    exercises = [row[0] for row in exercise_pattern[1:]]
    muscles = pattern_muscle[0][1:]
    exercise_pattern_values = [[Decimal(value) for value in row[1:]] for row in exercise_pattern[1:]]
    pattern_muscle_values = [[Decimal(value) for value in row[1:]] for row in pattern_muscle[1:]]

    scores: list[list[Decimal]] = []
    path_counts: list[list[int]] = []
    for exercise_row in exercise_pattern_values:
        score_row: list[Decimal] = []
        path_count_row: list[int] = []
        for muscle_index in range(len(muscles)):
            products = [
                exercise_row[pattern_index] * pattern_muscle_values[pattern_index][muscle_index]
                for pattern_index in range(len(exercise_patterns))
            ]
            score_row.append(sum(products, Decimal(0)))
            path_count_row.append(sum(product > 0 for product in products))
        scores.append(score_row)
        path_counts.append(path_count_row)

    payload = {
        "algorithm": "raw_sum_product_v1",
        "exercises": exercises,
        "muscles": muscles,
        "rows": [
            {
                "exercise": exercise,
                "scores": [normalized_decimal(value) for value in score_row],
                "path_counts": path_count_row,
            }
            for exercise, score_row, path_count_row in zip(exercises, scores, path_counts, strict=True)
        ],
    }
    values = [value for row in scores for value in row]
    summary = {
        "algorithm": "raw_sum_product_v1",
        "exercise_pattern_source_sha256": hashlib.sha256(exercise_pattern_path.read_bytes()).hexdigest(),
        "pattern_muscle_source_sha256": hashlib.sha256(pattern_muscle_path.read_bytes()).hexdigest(),
        "payload_sha256": hashlib.sha256(canonical_json(payload)).hexdigest(),
        "exercise_count": len(exercises),
        "muscle_count": len(muscles),
        "cell_count": len(values),
        "nonzero_cell_count": sum(value > 0 for value in values),
        "over_one_cell_count": sum(value > 1 for value in values),
        "maximum_score": normalized_decimal(max(values)),
    }
    return summary, payload


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--exercise-pattern",
        type=Path,
        default=Path("Movement Pattern Mapping Matrix - Mapping_Matrix.csv"),
    )
    parser.add_argument(
        "--pattern-muscle",
        type=Path,
        default=Path("Movement_Pattern_to_Muscle_Function_Matrix.csv"),
    )
    parser.add_argument("--payload-output", type=Path)
    args = parser.parse_args()

    summary, payload = derive(args.exercise_pattern, args.pattern_muscle)
    if args.payload_output:
        args.payload_output.parent.mkdir(parents=True, exist_ok=True)
        args.payload_output.write_bytes(canonical_json(payload))
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
