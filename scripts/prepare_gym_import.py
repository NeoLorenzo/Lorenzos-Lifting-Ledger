"""Audit the gym CSV and emit deterministic JSON batches for Supabase import."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from collections import Counter
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path


EXPECTED_HEADER = [
    "Gym",
    "Date",
    "Equipment ID",
    "Exercise",
    "Weight",
    "Reps",
    "Weight",
    "Reps",
    "Weight",
    "Reps",
    "",
    "",
]


def parse_decimal(value: str, row_number: int, column: str) -> str | None:
    if value == "":
        return None
    try:
        parsed = Decimal(value)
    except InvalidOperation as error:
        raise ValueError(f"row {row_number}: invalid {column} value {value!r}") from error
    return format(parsed.normalize(), "f")


def parse_integer(value: str, row_number: int, column: str) -> int | None:
    if value == "":
        return None
    try:
        return int(value)
    except ValueError as error:
        raise ValueError(f"row {row_number}: invalid {column} value {value!r}") from error


def parse_row(row: list[str], row_number: int) -> dict[str, object]:
    if len(row) != len(EXPECTED_HEADER):
        raise ValueError(f"row {row_number}: expected 12 columns, found {len(row)}")

    try:
        workout_date = datetime.strptime(row[1], "%d/%m/%Y").date().isoformat()
    except ValueError as error:
        raise ValueError(f"row {row_number}: invalid Date value {row[1]!r}") from error

    return {
        "source_row": row_number,
        "gym": row[0],
        "workout_date": workout_date,
        "equipment_id": row[2] or None,
        "exercise": row[3],
        "set_1_weight": parse_decimal(row[4], row_number, "set 1 Weight"),
        "set_1_reps": parse_integer(row[5], row_number, "set 1 Reps"),
        "set_2_weight": parse_decimal(row[6], row_number, "set 2 Weight"),
        "set_2_reps": parse_integer(row[7], row_number, "set 2 Reps"),
        "set_3_weight": parse_decimal(row[8], row_number, "set 3 Weight"),
        "set_3_reps": parse_integer(row[9], row_number, "set 3 Reps"),
        "set_4_weight": parse_decimal(row[10], row_number, "set 4 Weight"),
        "set_4_reps": parse_integer(row[11], row_number, "set 4 Reps"),
    }


def canonical_json(records: list[dict[str, object]]) -> bytes:
    return json.dumps(
        records,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("csv_path", type=Path)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--batch-size", type=int, default=200)
    args = parser.parse_args()

    source_bytes = args.csv_path.read_bytes()
    with args.csv_path.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.reader(source)
        header = next(reader)
        if header != EXPECTED_HEADER:
            raise ValueError(f"unexpected header: {header!r}")
        records = [parse_row(row, row_number) for row_number, row in enumerate(reader, 2)]

    canonical_rows = Counter(json.dumps(row, ensure_ascii=False, sort_keys=True) for row in records)
    dates = [str(row["workout_date"]) for row in records]
    summary = {
        "file": args.csv_path.name,
        "file_size_bytes": len(source_bytes),
        "source_sha256": hashlib.sha256(source_bytes).hexdigest(),
        "canonical_sha256": hashlib.sha256(canonical_json(records)).hexdigest(),
        "header": header,
        "row_count": len(records),
        "duplicate_row_count": sum(count - 1 for count in canonical_rows.values() if count > 1),
        "date_min": min(dates),
        "date_max": max(dates),
        "gym_count": len({row["gym"] for row in records}),
        "exercise_count": len({row["exercise"] for row in records}),
        "equipment_id_nonblank": sum(row["equipment_id"] is not None for row in records),
        "set_counts": [
            sum(row[f"set_{set_number}_weight"] is not None or row[f"set_{set_number}_reps"] is not None for row in records)
            for set_number in range(1, 5)
        ],
        "unpaired_set_values": sum(
            (row[f"set_{set_number}_weight"] is None) != (row[f"set_{set_number}_reps"] is None)
            for row in records
            for set_number in range(1, 5)
        ),
        "unpaired_rows": [
            row["source_row"]
            for row in records
            if any(
                (row[f"set_{set_number}_weight"] is None) != (row[f"set_{set_number}_reps"] is None)
                for set_number in range(1, 5)
            )
        ],
        "set_4_rows": [
            row["source_row"]
            for row in records
            if row["set_4_weight"] is not None or row["set_4_reps"] is not None
        ],
        "gyms": sorted({str(row["gym"]) for row in records}),
    }

    if args.output_dir:
        args.output_dir.mkdir(parents=True, exist_ok=True)
        for old_batch in args.output_dir.glob("batch-*.json"):
            old_batch.unlink()
        for batch_number, offset in enumerate(range(0, len(records), args.batch_size), 1):
            batch_path = args.output_dir / f"batch-{batch_number:03d}.json"
            batch_path.write_bytes(canonical_json(records[offset : offset + args.batch_size]))
        (args.output_dir / "summary.json").write_text(
            json.dumps(summary, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
