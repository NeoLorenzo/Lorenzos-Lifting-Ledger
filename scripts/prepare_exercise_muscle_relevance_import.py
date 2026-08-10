"""Validate the authored exercise-to-muscle relevance matrix and build its migration."""

from __future__ import annotations

import argparse
import base64
import csv
import hashlib
import json
from collections import Counter
from decimal import Decimal, InvalidOperation
from pathlib import Path


ALLOWED_COEFFICIENTS = {
    Decimal("0"),
    Decimal("0.25"),
    Decimal("0.50"),
    Decimal("0.75"),
    Decimal("1.00"),
}


def canonical_json(value: object) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def read_matrix(path: Path) -> list[list[str]]:
    with path.open(encoding="utf-8-sig", newline="") as source:
        return list(csv.reader(source))


def audit(
    csv_path: Path,
    exercise_matrix_path: Path,
    pattern_muscle_path: Path,
) -> tuple[dict[str, object], dict[str, object]]:
    source_bytes = csv_path.read_bytes()
    rows = read_matrix(csv_path)
    exercise_rows = read_matrix(exercise_matrix_path)
    pattern_muscle_rows = read_matrix(pattern_muscle_path)

    if len(rows) != 139 or any(len(row) != 41 for row in rows):
        raise ValueError("matrix must contain one header plus 138 rows, each with 41 columns")
    if rows[0][0] != "Exercise":
        raise ValueError("first header must be 'Exercise'")

    muscles = rows[0][1:]
    if muscles != pattern_muscle_rows[0][1:]:
        raise ValueError("muscle columns do not exactly match the canonical muscle order")

    exercises = [row[0] for row in rows[1:]]
    expected_exercises = [row[0] for row in exercise_rows[1:]]
    if sorted(exercises) != sorted(expected_exercises):
        raise ValueError("exercise rows do not exactly match the current catalogue")
    if len(set(exercises)) != len(exercises):
        raise ValueError("exercise names must be unique")

    coefficient_rows: list[list[str]] = []
    distribution: Counter[str] = Counter()
    for row_number, row in enumerate(rows[1:], 2):
        coefficients: list[str] = []
        for column_number, raw_value in enumerate(row[1:], 2):
            try:
                value = Decimal(raw_value)
            except InvalidOperation as error:
                raise ValueError(
                    f"invalid coefficient at row {row_number}, column {column_number}"
                ) from error
            if value not in ALLOWED_COEFFICIENTS:
                raise ValueError(
                    f"unsupported coefficient {raw_value!r} at row {row_number}, "
                    f"column {column_number}"
                )
            normalized = format(value.normalize(), "f")
            coefficients.append(normalized)
            distribution[normalized] += 1
        coefficient_rows.append(coefficients)

    payload = {
        "muscles": muscles,
        "exercises": [
            {"name": name, "coefficients": coefficients}
            for name, coefficients in zip(exercises, coefficient_rows, strict=True)
        ],
    }
    payload_bytes = canonical_json(payload)
    summary = {
        "file": csv_path.name,
        "source_sha256": hashlib.sha256(source_bytes).hexdigest(),
        "payload_sha256": hashlib.sha256(payload_bytes).hexdigest(),
        "exercise_count": len(exercises),
        "muscle_count": len(muscles),
        "cell_count": len(exercises) * len(muscles),
        "nonzero_cell_count": sum(
            count for value, count in distribution.items() if Decimal(value) != 0
        ),
        "coefficient_distribution": dict(sorted(distribution.items(), key=lambda item: Decimal(item[0]))),
        "payload_base64": base64.b64encode(payload_bytes).decode("ascii"),
    }
    return summary, payload


def build_migration(summary: dict[str, object], documentation_path: Path) -> str:
    documentation_sha256 = hashlib.sha256(documentation_path.read_bytes()).hexdigest()
    payload_base64 = summary["payload_base64"]
    return f"""begin;

do $$
begin
  if (select count(*) from public.exercises) <> 138
    or (select count(*) from public.muscles) <> 40
    or (select count(*) from public.movement_mapping_versions where is_current) <> 1
    or (select count(*) from public.movement_muscle_mapping_versions where is_current) <> 1
  then
    raise exception 'Unexpected catalogue or source mapping-version state';
  end if;
end
$$;

create temporary table exercise_muscle_relevance_import (
  payload jsonb not null
) on commit drop;

insert into exercise_muscle_relevance_import (payload)
values (convert_from(decode('{payload_base64}', 'base64'), 'utf8')::jsonb);

do $$
declare
  source_payload jsonb := (select payload from exercise_muscle_relevance_import);
begin
  if jsonb_array_length(source_payload -> 'exercises') <> 138
    or jsonb_array_length(source_payload -> 'muscles') <> 40
    or exists (
      select 1
      from jsonb_array_elements(source_payload -> 'exercises') as item
      where jsonb_array_length(item -> 'coefficients') <> 40
    )
    or exists (
      select exercise.name
      from public.exercises as exercise
      except
      select item ->> 'name'
      from jsonb_array_elements(source_payload -> 'exercises') as item
    )
    or exists (
      select item ->> 'name'
      from jsonb_array_elements(source_payload -> 'exercises') as item
      except
      select exercise.name
      from public.exercises as exercise
    )
    or (select jsonb_agg(to_jsonb(muscle.name) order by muscle.source_order) from public.muscles as muscle)
       <> source_payload -> 'muscles'
  then
    raise exception 'Hypertrophic-relevance payload does not match the current catalogues';
  end if;
end
$$;

create table public.exercise_muscle_relevance_versions (
  id bigint generated always as identity primary key,
  code text not null unique check (code ~ '^[a-z0-9_]+$'),
  name text not null check (btrim(name) <> ''),
  status text not null check (status in ('draft', 'published', 'retired')),
  is_current boolean not null default false,
  exercise_pattern_version_id bigint not null
    references public.movement_mapping_versions(id) on delete restrict,
  pattern_muscle_version_id bigint not null
    references public.movement_muscle_mapping_versions(id) on delete restrict,
  source_file_name text not null check (btrim(source_file_name) <> ''),
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{{64}}$'),
  documentation_file_name text not null check (btrim(documentation_file_name) <> ''),
  documentation_sha256 text not null check (documentation_sha256 ~ '^[0-9a-f]{{64}}$'),
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{{64}}$'),
  exercise_count integer not null check (exercise_count > 0),
  muscle_count integer not null check (muscle_count > 0),
  cell_count integer not null check (cell_count = exercise_count * muscle_count),
  nonzero_cell_count integer not null check (nonzero_cell_count between 0 and cell_count),
  coefficient_contract text not null check (btrim(coefficient_contract) <> ''),
  change_notes text not null check (btrim(change_notes) <> ''),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  check (not is_current or status = 'published'),
  check (
    (status = 'draft' and published_at is null)
    or (status in ('published', 'retired') and published_at is not null)
  )
);

create unique index exercise_muscle_relevance_versions_one_current_idx
  on public.exercise_muscle_relevance_versions (is_current)
  where is_current;

create index exercise_muscle_relevance_versions_exercise_pattern_idx
  on public.exercise_muscle_relevance_versions (exercise_pattern_version_id);

create index exercise_muscle_relevance_versions_pattern_muscle_idx
  on public.exercise_muscle_relevance_versions (pattern_muscle_version_id);

insert into public.exercise_muscle_relevance_versions (
  code,
  name,
  status,
  is_current,
  exercise_pattern_version_id,
  pattern_muscle_version_id,
  source_file_name,
  source_sha256,
  documentation_file_name,
  documentation_sha256,
  payload_sha256,
  exercise_count,
  muscle_count,
  cell_count,
  nonzero_cell_count,
  coefficient_contract,
  change_notes,
  published_at
)
select
  'initial_2026_08_10',
  'Initial 138 by 40 exercise-to-muscle hypertrophic relevance matrix',
  'published',
  true,
  exercise_pattern.id,
  pattern_muscle.id,
  'EXERCISE_TO_MUSCLE_HYPERTROPHIC_RELEVANCE.csv',
  '{summary["source_sha256"]}',
  'docs/EXERCISE_TO_MUSCLE_HYPERTROPHIC_RELEVANCE.md',
  '{documentation_sha256}',
  '{summary["payload_sha256"]}',
  138,
  40,
  5520,
  {summary["nonzero_cell_count"]},
  'Independent values: 0, 0.25, 0.50, 0.75, or 1.00; not percentages and not normalized.',
  'Exercise-specific audit layered on the movement model. Assumes one sufficiently hard set, intended technique, and a normal/full useful range of motion.',
  now()
from public.movement_mapping_versions as exercise_pattern
cross join public.movement_muscle_mapping_versions as pattern_muscle
where exercise_pattern.is_current
  and pattern_muscle.is_current;

create table public.exercise_muscle_relevance_coefficients (
  mapping_version_id bigint not null
    references public.exercise_muscle_relevance_versions(id) on delete restrict,
  exercise_id bigint not null
    references public.exercises(id) on delete restrict,
  muscle_id bigint not null
    references public.muscles(id) on delete restrict,
  relevance numeric(3, 2) not null
    check (relevance in (0, 0.25, 0.50, 0.75, 1.00)),
  created_at timestamptz not null default now(),
  primary key (mapping_version_id, exercise_id, muscle_id)
);

create index exercise_muscle_relevance_coefficients_exercise_idx
  on public.exercise_muscle_relevance_coefficients (exercise_id, mapping_version_id, muscle_id);

create index exercise_muscle_relevance_coefficients_muscle_idx
  on public.exercise_muscle_relevance_coefficients (muscle_id, mapping_version_id, exercise_id);

create index exercise_muscle_relevance_coefficients_nonzero_idx
  on public.exercise_muscle_relevance_coefficients (mapping_version_id, exercise_id, muscle_id)
  where relevance > 0;

insert into public.exercise_muscle_relevance_coefficients (
  mapping_version_id,
  exercise_id,
  muscle_id,
  relevance
)
select
  version.id,
  exercise.id,
  muscle.id,
  coefficient.value::numeric(3, 2)
from exercise_muscle_relevance_import as source
cross join lateral jsonb_array_elements(source.payload -> 'exercises') as exercise_item
cross join lateral jsonb_array_elements_text(exercise_item -> 'coefficients')
  with ordinality as coefficient(value, muscle_order)
join public.exercises as exercise
  on exercise.name = exercise_item ->> 'name'
join public.muscles as muscle
  on muscle.source_order = coefficient.muscle_order
join public.exercise_muscle_relevance_versions as version
  on version.code = 'initial_2026_08_10';

alter table public.exercise_muscle_relevance_versions enable row level security;
alter table public.exercise_muscle_relevance_coefficients enable row level security;

create policy "Authenticated users can read exercise muscle relevance versions"
  on public.exercise_muscle_relevance_versions
  for select to authenticated
  using (true);

create policy "Authenticated users can read exercise muscle relevance coefficients"
  on public.exercise_muscle_relevance_coefficients
  for select to authenticated
  using (true);

revoke all on table public.exercise_muscle_relevance_versions from anon, authenticated;
revoke all on table public.exercise_muscle_relevance_coefficients from anon, authenticated;
grant select on table public.exercise_muscle_relevance_versions to authenticated;
grant select on table public.exercise_muscle_relevance_coefficients to authenticated;

comment on table public.exercise_muscle_relevance_versions is
  'Immutable provenance for authored exercise-to-muscle hypertrophic-relevance matrices.';
comment on table public.exercise_muscle_relevance_coefficients is
  'Exercise-specific worthwhile hypertrophic-relevance coefficients. Values are independent, unnormalized model estimates.';
comment on column public.exercise_muscle_relevance_coefficients.relevance is
  '0 excludes meaningful hypertrophic credit; 0.25, 0.50, 0.75, and 1.00 indicate increasing exercise-specific relevance under the documented assumptions.';

do $$
declare
  version_id bigint := (
    select id
    from public.exercise_muscle_relevance_versions
    where code = 'initial_2026_08_10'
  );
begin
  if (select count(*) from public.exercise_muscle_relevance_coefficients where mapping_version_id = version_id) <> 5520
    or (select count(*) from public.exercise_muscle_relevance_coefficients where mapping_version_id = version_id and relevance > 0) <> {summary["nonzero_cell_count"]}
    or (select count(*) from public.exercise_muscle_relevance_coefficients where mapping_version_id = version_id and relevance = 0.25) <> 141
    or (select count(*) from public.exercise_muscle_relevance_coefficients where mapping_version_id = version_id and relevance = 0.50) <> 178
    or (select count(*) from public.exercise_muscle_relevance_coefficients where mapping_version_id = version_id and relevance = 0.75) <> 218
    or (select count(*) from public.exercise_muscle_relevance_coefficients where mapping_version_id = version_id and relevance = 1.00) <> 186
    or (select count(distinct exercise_id) from public.exercise_muscle_relevance_coefficients where mapping_version_id = version_id) <> 138
    or (select count(distinct muscle_id) from public.exercise_muscle_relevance_coefficients where mapping_version_id = version_id) <> 40
  then
    raise exception 'Exercise-to-muscle hypertrophic-relevance matrix validation failed';
  end if;
end
$$;

commit;
"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "csv_path",
        type=Path,
        nargs="?",
        default=Path("EXERCISE_TO_MUSCLE_HYPERTROPHIC_RELEVANCE.csv"),
    )
    parser.add_argument(
        "--exercise-matrix",
        type=Path,
        default=Path("Movement Pattern Mapping Matrix - Mapping_Matrix.csv"),
    )
    parser.add_argument(
        "--pattern-muscle",
        type=Path,
        default=Path("Movement_Pattern_to_Muscle_Function_Matrix.csv"),
    )
    parser.add_argument(
        "--documentation",
        type=Path,
        default=Path("docs/EXERCISE_TO_MUSCLE_HYPERTROPHIC_RELEVANCE.md"),
    )
    parser.add_argument("--payload-output", type=Path)
    parser.add_argument("--migration-output", type=Path)
    args = parser.parse_args()

    summary, payload = audit(args.csv_path, args.exercise_matrix, args.pattern_muscle)
    if args.payload_output:
        args.payload_output.parent.mkdir(parents=True, exist_ok=True)
        args.payload_output.write_bytes(canonical_json(payload))
    if args.migration_output:
        args.migration_output.write_text(
            build_migration(summary, args.documentation),
            encoding="utf-8",
            newline="\n",
        )
    printable_summary = {
        key: value for key, value in summary.items() if key != "payload_base64"
    }
    print(json.dumps(printable_summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
