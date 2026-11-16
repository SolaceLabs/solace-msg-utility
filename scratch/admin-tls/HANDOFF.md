# Hand-off: admin console, live TLS and restart wave (paused 2026-11-15)

State when paused
- The build workflow was stopped before any agent wrote a file. Nothing of this wave is in the tree.
- The tree holds one earlier, separate change that is NOT gated or committed yet: unknown paths answer 404
  (go-web-proxy/proxy.go, proxy_test.go, main_test.go, scripts/e2e.mjs, docs/architecture.md, deployment.md,
  contributing.md, test-report.md). Gates: ./scripts/dev.sh all cov scan, then ./scripts/dev.sh e2e. Headline once
  green: "Gateway: an unknown path is a 404, never a redirect (a browser kept the permanent redirect and went on
  sending /solAdmin to /)". Commit it before launching the build, or let it ride in the same gate run and commit.
- HEAD is 3525a38 (login.twoFactor has no off mode; Go licence notices).

To resume
1. Read tmp/admin-tls/decisions.md: the owner's decisions and the pinned design every agent builds to.
2. Run the build: Workflow with scriptPath /opt/claude-workspace/projects/smu-dirty/tmp/admin-tls/build-workflow.js
   (nine Sonnet agents; their notes go to tmp/admin-tls/notes/). A run id from the old session cannot be resumed
   in a new one; this script starts from the beginning, which loses nothing.
3. Then the usual loop: review the agents' notes and results, fix loose ends, the owner runs
   ./scripts/dev.sh full and ./scripts/dev.sh e2e, fix from scripts/logs/*.log, record results in
   docs/test-report.md and docs/improvement-plan.md, give one commit headline (the owner commits).

Standing rules of this project's sessions
- Never run gates or git mutations; read logs only. Plain ASCII. Workflow agents on Sonnet.
- graphify query before raw grep (a hook enforces it).

Still open after this wave
- The multi-instance mesh (parked to the end of the plan).
- tmp/module-picker-samples.html is the owner's review sample (tiles chosen for Gateway Settings, pills for the
  user form); delete tmp/ when done. tmp/ is untracked and not ignored.
