# H-docs note: documentation of the single writer change

Nothing was compiled or run. All added lines are plain ASCII. I checked by script (read-only) that every doc's Contents list equals its ## and ### headings.

## Files edited (all mine)
- docs/architecture.md: new `### The single writer` (listed in Contents, after The audit trail); audit-trail bullets (onFailure, AUDIT RECORD LOST, wrote, live key); the Admin modules paragraph (writer, versions, admin-conflict.ts); settings page (rev); backup route table (rev on schedule PUT/DELETE, basis on preview); import and schedule bullets rewritten (the old text named validateUsers, replaceUsers, upsertUser and "no transaction spans the three files").
- docs/developer-guide.md: new `### Writing to the store` under Code Conventions (rules, shape of a write, two kinds of write, rev rule, code table, browser side, tests).
- docs/provisioned-mode.md: `### Two administrators at once` (under Administer), `## Stored files and recovery` (before Audit trail), audit.onFailure row and recommendation, `wrote` audit field, new refusal codes, import wording, two troubleshooting bullets.
- docs/user-guide.md: stale dialog and Reload/Cancel, deleted-by-someone-else, messages about files, audit.onFailure select (label and option texts copied from index.html), preview again after a stale import. No new headings.
- docs/deployment.md: `audit.onFailure` row in the config.yaml reference; sentence on hand edits and the writer's working files.
- docs/db.md: new `## Outcome so far` (Contents updated); "Reads and writes" paragraph updated; writer.go added to Code to read.
- docs/demo.md: versions and stale saves simulated; not simulated: write failure, store changed on disk, audit failure, journal; audit.onFailure saved.
- docs/test-report.md: ledger entry "Single writer with per-record versions", one bullet per part; Results bullet says the gates have not been run.
Not touched: docs/contributing.md, README.md, improvement-plan.md, review/.

## Deviations
- db.md: the Constraints line "The Go coverage floor is 93.7%." now says the floor is the last recorded total in scripts/logs/cov.log (the 93.7 figure was stale; small unrequested drift fix).
- Added a short mention in db.md that the planning session has not happened ("Outcome so far" records what the write path settled, not a decision).
- demo.md says a backup exported by the real gateway "may not open in the demo": from C-fake and F notes (the fake's strict reader refuses a `rev` key; real exports carry `rev`). I-crosscheck left that undecided. If someone fixes it (fake ignores rev, or the real export strips it), delete that sentence in demo.md (How it differs from a real gateway).
- No item numbers from the design record are used. TOTP is not mentioned.

## Facts documented that others should keep true
- Reserved names in the data dir: `txn`, `<name>.bak` for the four store files, `.tmp-*`. Operators must not keep their own `config.yaml.bak` etc. in /data.
- Recovery logs a Warn "an interrupted store write was found; rolling it back"; a damaged txn stops the start.
- audit.onFailure refuse: the refused attempt's own audit line clears the failing state, so the attempt after it goes through (per F/E notes: gate does not write its own line).
- Hand edit of config.yaml or a replaced store file: refused on every later write until restart; reads still served from memory.

## NEEDED FROM OTHERS
- None. If the contract agent changes any code name or status in section 11, docs/developer-guide.md ("Error codes" table) and docs/architecture.md (Errors, in one place) need the same change.

## Unfinished
- Test counts and coverage in test-report.md are not recorded (gates not run). The owner should fill the Results bullet after `./scripts/dev.sh all cov scan`.
- The test names in the ledger were copied from the test files as they stand; if an agent renames a test, update the ledger.
