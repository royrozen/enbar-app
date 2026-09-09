# Release Workflow

Reusable git/tag/release/DB-branching process. Copy this file into any new
project's repo root alongside `CLAUDE.md` / `PLAN.md` / `TODO.md` / `CHANGELOG.md`.
Fill in the `<placeholders>` once per project, then follow it as-is.

**Standing rule for Claude:** whenever a task in this project involves a schema
change of any kind (new table, column, constraint, index, RLS/permission policy,
or a migration file), flag §3 below as a required step before touching the live
database — regardless of which DB provider the project uses. Don't wait to be
asked.

---

## 0. One-time setup (new project)

- [ ] Repo created, private by default, `.gitignore` + `README.md` in first commit
- [ ] Branch protection on `main`: require PR before merge, require build/preview to pass, no direct pushes
- [ ] `CHANGELOG.md` started with an `[Unreleased]` section at the top
- [ ] Identify the DB provider and its branching/staging mechanism (see §3) — write it into `<db-branching-method>` below once, so it doesn't need re-deciding per feature
- [ ] Deployment platform's "production branch" setting points at `main`

**`<db-branching-method>` for this project:** _______________
(e.g. "Supabase branching via `create_branch`/`merge_branch`", "Neon branch per PR",
"PlanetScale branch + deploy request", "local Postgres via Docker Compose seeded
from a prod-schema dump, no live staging DB available", "RDS: manual snapshot +
restore to a temp instance before migrating prod")

## 1. Establishing a baseline (V1, or any "this works, don't break it" point)

```bash
git checkout main
git pull
git tag -a v1.0.0 -m "<one-line description of what's live>"
git push origin v1.0.0
```

Then in GitHub: **Releases → Draft a new release → choose the existing tag →**
write notes → **Publish**. Keep "Set as latest release" checked (only shows
correctly if this is genuinely the highest version tag present).

`CHANGELOG.md`:
```markdown
## [1.0.0] - <date>
Initial production baseline: <one line per major capability>.
```

## 2. Starting any new feature or fix

1. Branch off current `main`:
   ```bash
   git checkout main && git pull
   git checkout -b feat/<name>      # or fix/<name>
   ```
2. If the feature needs a PRD (new module, non-trivial scope): write it, get it
   reviewed/approved, generate the implementation prompt, **before** implementation
   starts. No PRD needed for small fixes.
3. **Does this feature touch the schema?** If yes → stop and do §3 before writing
   any migration against the live/prod database.
4. Do **not** edit `CHANGELOG.md` yet — only on merge (§5). Half-finished changelog
   entries for unmerged work create noise.
5. Commit in atomic units as work progresses (one concern per commit, conventional
   commit prefixes: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`).

## 3. Schema changes — always branch the DB first

This applies no matter which database the project uses. The DB branch/copy is the
schema equivalent of the git feature branch: changes get tested and verified in
isolation before they touch what's live.

1. Create an isolated copy of the schema using whatever `<db-branching-method>`
   was set in §0:
   - **Supabase** — `Supabase:create_branch`
   - **Neon / PlanetScale** — provider's native branch-per-feature
   - **Managed Postgres without native branching (RDS, Cloud SQL, etc.)** — snapshot
     prod, restore to a temp instance, or spin up a local Postgres seeded from a
     schema dump
   - **No branching available at all** — at minimum, write and test the migration
     against a local/dev copy of the schema first, never directly against prod
2. Write and run the migration against that isolated copy.
3. Verify: existing queries/RLS/policies still work, no unexpected data loss, app
   code on the feature branch actually runs against the new schema.
4. Leave the isolated copy/branch in place until the corresponding code branch is
   ready to merge — don't touch prod schema before then.
5. On merge (§5), apply the migration to prod as part of the same deploy step that
   ships the code depending on it — not before, not long after.

## 4. Mid-flight safety

- Before any other major/risky change (removing an integration, large refactor,
  something with no schema component but still high-blast-radius): tag a
  checkpoint on the feature branch or on `main` if it's about to be touched
  directly, so there's an instant rollback point.
- Never push directly to `main` for non-trivial changes, PR only.

## 5. Merging and releasing

1. Open PR, merge into `main` once checks pass.
2. If this feature touched the schema: apply the verified migration to the prod
   DB now, as part of this same deploy (see §3.5).
3. Tag the new commit on `main` using semver:
   - **Patch** (`v1.0.x`) — bug fix, no new capability, no schema change
   - **Minor** (`v1.x.0`) — new feature/module, backward compatible
   - **Major** (`vx.0.0`) — breaking change (schema incompatible with old client,
     removed a public route, etc.)
   ```bash
   git tag -a v1.1.0 -m "<one-line summary>"
   git push origin v1.1.0
   ```
4. GitHub Release from that tag, notes describing what shipped.
5. `CHANGELOG.md`: move the `[Unreleased]` items into a new dated version section,
   start a fresh empty `[Unreleased]` above it.

## 6. Cleaning up stray tags

Only ever delete a tag/release if you're certain nothing depends on it.

```bash
# check what's really there before touching anything
git tag -l -n1

# remove one
git tag -d <tag>
git push origin :refs/tags/<tag>
```

If a GitHub Release exists for that tag, delete the Release from the GitHub UI
first (Releases → "..." → Delete) — deleting the git tag alone leaves an orphaned
Release page behind.

## 7. Rollback

If something in `main` breaks production: redeploy the last known-good tag rather
than trying to hot-fix forward under pressure. That's the entire reason the tags
exist.

```bash
git checkout v1.0.0   # or whatever the last good tag was
```

Then redeploy from that commit via the platform's UI, or revert `main` to it and
push a new patch tag once stable. If the break came from a schema migration and a
DB branch/snapshot was taken per §3, restoring from that is the fastest path back
versus trying to write a reverse migration under pressure.
