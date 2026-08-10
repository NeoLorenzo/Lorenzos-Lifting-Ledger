"""Audit and canonicalize the movement-pattern-to-muscle CSV for database import."""

from __future__ import annotations

import argparse
import base64
import csv
import hashlib
import json
import re
from decimal import Decimal, InvalidOperation
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


def expected_movement_patterns(path: Path) -> list[str]:
    with path.open(encoding="utf-8-sig", newline="") as source:
        return next(csv.reader(source))[1:]


def expected_muscles(path: Path) -> list[str]:
    markdown = path.read_text(encoding="utf-8")
    canonical_section = markdown.split("# 3. Canonical muscle taxonomy", 1)[1].split("---", 1)[0]
    return re.findall(r"^\d+\.\s+(.+)$", canonical_section, flags=re.MULTILINE)


def audit(csv_path: Path, exercise_matrix_path: Path, taxonomy_path: Path) -> tuple[dict[str, object], dict[str, object]]:
    source_bytes = csv_path.read_bytes()
    with csv_path.open(encoding="utf-8-sig", newline="") as source:
        rows = list(csv.reader(source))

    if len(rows) != 41 or any(len(row) != 41 for row in rows):
        raise ValueError("matrix must contain one header plus 40 rows, each with 41 columns")
    if rows[0][0] != "Movement Pattern":
        raise ValueError("first header must be 'Movement Pattern'")

    muscles = rows[0][1:]
    if muscles != expected_muscles(taxonomy_path):
        raise ValueError("muscle columns do not exactly match the canonical taxonomy")

    source_pattern_names = [row[0] for row in rows[1:]]
    patterns = [PATTERN_ALIASES.get(name, name) for name in source_pattern_names]
    if patterns != expected_movement_patterns(exercise_matrix_path):
        raise ValueError("movement-pattern rows do not resolve exactly to the backend catalogue order")

    coefficient_rows: list[list[str]] = []
    nonzero_count = 0
    for row_number, row in enumerate(rows[1:], 2):
        coefficients: list[str] = []
        for column_number, raw_value in enumerate(row[1:], 2):
            try:
                value = Decimal(raw_value)
            except InvalidOperation as error:
                raise ValueError(f"invalid coefficient at row {row_number}, column {column_number}") from error
            if value < 0 or value > 1:
                raise ValueError(f"coefficient outside 0–1 at row {row_number}, column {column_number}")
            normalized = format(value.normalize(), "f")
            coefficients.append(normalized)
            nonzero_count += value != 0
        coefficient_rows.append(coefficients)

    payload = {
        "muscles": muscles,
        "patterns": [
            {
                "name": name,
                "source_name": source_name,
                "coefficients": coefficients,
            }
            for name, source_name, coefficients in zip(
                patterns,
                source_pattern_names,
                coefficient_rows,
                strict=True,
            )
        ],
    }
    payload_bytes = canonical_json(payload)
    summary = {
        "file": csv_path.name,
        "source_sha256": hashlib.sha256(source_bytes).hexdigest(),
        "payload_sha256": hashlib.sha256(payload_bytes).hexdigest(),
        "movement_pattern_count": len(patterns),
        "muscle_count": len(muscles),
        "cell_count": len(patterns) * len(muscles),
        "nonzero_cell_count": nonzero_count,
        "resolved_pattern_aliases": [
            {"source": source, "canonical": canonical}
            for source, canonical in PATTERN_ALIASES.items()
        ],
        "payload_base64": base64.b64encode(payload_bytes).decode("ascii"),
    }
    return summary, payload


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("csv_path", type=Path)
    parser.add_argument("--exercise-matrix", type=Path, default=Path("Movement Pattern Mapping Matrix - Mapping_Matrix.csv"))
    parser.add_argument("--taxonomy", type=Path, default=Path("docs/MUSCLE_GROUP_TAXONOMY.md"))
    parser.add_argument("--payload-output", type=Path)
    args = parser.parse_args()

    summary, payload = audit(args.csv_path, args.exercise_matrix, args.taxonomy)
    if args.payload_output:
        args.payload_output.parent.mkdir(parents=True, exist_ok=True)
        args.payload_output.write_bytes(canonical_json(payload))
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
