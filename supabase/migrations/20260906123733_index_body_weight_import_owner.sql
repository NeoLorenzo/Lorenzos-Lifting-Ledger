begin;

create index if not exists body_weight_measurements_import_owner_idx
  on public.body_weight_measurements (import_id, owner_id);

commit;
