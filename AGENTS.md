# Repository rules

- Read the relevant existing code, tests, migrations, and documentation before editing.
- Keep changes tightly scoped. Do not perform unrelated refactors, cleanup, or dependency additions.
- Preserve existing behavior unless the task explicitly changes it.
- Use new Supabase migrations for database changes. Do not rewrite applied historical migrations.
- Preserve Row Level Security, owner isolation, foreign-key integrity, and existing permission boundaries for all user-owned data.
- Never commit privileged credentials. The Supabase project URL and publishable browser key may be public; secret/service-role keys may not.
- Preserve the distinction between user-owned workout data and global reference/scientific data.
- For changes involving analytics, scientific claims, mappings, calculated values, load semantics, or charts, read `docs/DESIGN_RULES.md` and the relevant `docs/` files first.
- Do not introduce unexplained or misleading scientific metrics. Preserve the distinction between entered data, calculated estimates, authored models, derived models, evidence, and product decisions.
- Never use `weight × reps` / tonnage / volume load as a training, hypertrophy, progression, or statistics metric.
- Dumbbell exercises always store and display the weight of one dumbbell, including weight-derived estimates.
- Preserve historical workout data and scientific-model provenance. Do not silently reinterpret or destroy either.
- Add or update focused tests for changed behavior and regressions.
- Update documentation made stale by the implementation.
- Run `npm test` as the final repository validation unless the task specifies additional checks.
- Do not weaken or remove legitimate tests merely to make validation pass.
- Do not commit or push unless explicitly instructed.

If the task specification conflicts with the actual repository, make the smallest safe adaptation that preserves the intended behavior and report it explicitly.